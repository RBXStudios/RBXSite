// ============================================================
// RBX EXPLOIT — Checkpoint Token System (Netlify Function)
//
// O loot-link/lootdest usados aqui não suportam token dinâmico por clique
// (a URL de destino configurada no painel deles é sempre fixa). Por isso,
// o "permToken" abaixo É o mecanismo real de produção — cada checkpoint
// precisa estar configurado, no painel do encurtador, pra devolver pra
// ELE MESMO com ?perm=<CHECKPOINT_PERM_TOKEN> (ex.: checkpoint2 -> volta
// pra checkpoint2.html, nunca pra checkpoint3.html).
//
// IMPORTANTE: defina CHECKPOINT_PERM_TOKEN nas env vars do Netlify com um
// valor próprio e privado (NÃO "Encurtador" — esse valor já apareceu em
// vários lugares e não deve mais ser usado em produção). Sem essa env var
// configurada, o bypass fica inerte e nenhum checkpoint avança.
// ============================================================

const SECRET = process.env.CHECKPOINT_SECRET || "rbx-exploit-secret-2025";
// Ligado por padrão (é o mecanismo real de produção aqui). Só fica inerte
// se PERM_TOKEN não estiver definido, ou se você setar explicitamente
// CHECKPOINT_ALLOW_PERM_BYPASS=false.
const ALLOW_PERM_BYPASS = process.env.CHECKPOINT_ALLOW_PERM_BYPASS !== "false";
const PERM_TOKEN = process.env.CHECKPOINT_PERM_TOKEN || null;

// ── Integração com o keys.js (site do painel) ──────────────────────────
// As credenciais devem ser EXATAMENTE as mesmas configuradas como
// PANEL_ADMIN_EMAIL / PANEL_ADMIN_PASSWORD nas env vars do site
// rbxpainelkeylol.netlify.app — senão o "create" vai voltar 401.
const KEYS_API_URL = process.env.KEYS_API_URL
  || "https://rbxpainelkeylol.netlify.app/.netlify/functions/keys";
const KEYS_ADMIN_EMAIL    = process.env.PANEL_ADMIN_EMAIL || "rbxstudios@gmail.com";
const KEYS_ADMIN_PASSWORD = process.env.PANEL_ADMIN_PASSWORD || "RBXStudios200@@";

// Cria uma key FREE de 1 dia de verdade no banco do keys.js e devolve o
// código real (ex.: "RBXF-AB12C-3D4EF-5G6H7"). Lança erro se falhar —
// quem chamar deve tratar o catch e responder algo amigável pro usuário.
async function createRealFreeKey() {
  const auth = Buffer.from(`${KEYS_ADMIN_EMAIL}:${KEYS_ADMIN_PASSWORD}`).toString("base64");
  const res = await fetch(`${KEYS_API_URL}?action=create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${auth}`,
    },
    body: JSON.stringify({ type: "free", duration: "1d" }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.success || !data.key || !data.key.code) {
    throw new Error(
      (data && (data.error || data.reason)) ||
      `Falha ao criar key real (status ${res.status})`
    );
  }
  return data.key.code;
}

function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // unsigned 32-bit
  }
  return hash.toString(16).padStart(8, "0");
}

function makeToken(step, ip) {
  const ts = Math.floor(Date.now() / 1000); // seconds
  const sig = simpleHash(`${step}:${ip}:${ts}:${SECRET}`);
  // token = base64url(step:ts:sig)
  return Buffer.from(`${step}:${ts}:${sig}`).toString("base64url");
}

function verifyToken(token, expectedStep, ip, maxAgeSeconds = 20 * 60) {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const [stepStr, tsStr, sig] = decoded.split(":");
    if (!stepStr || !tsStr || !sig) return { ok: false, reason: "Formato inválido" };
    const step = parseInt(stepStr, 10);
    const ts = parseInt(tsStr, 10);
    if (isNaN(step) || isNaN(ts)) return { ok: false, reason: "Token inválido" };
    if (step !== expectedStep) return { ok: false, reason: "Step mismatch" };
    const now = Math.floor(Date.now() / 1000);
    if (now - ts > maxAgeSeconds) return { ok: false, reason: "Token expirado" };
    const expectedSig = simpleHash(`${step}:${ip}:${ts}:${SECRET}`);
    if (sig !== expectedSig) return { ok: false, reason: "Assinatura inválida" };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "Decodificação falhou" };
  }
}

function cors(r) {
  r.headers = r.headers || {};
  r.headers["Access-Control-Allow-Origin"]  = "*";
  r.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
  r.headers["Access-Control-Allow-Headers"] = "Content-Type";
  return r;
}

function json(statusCode, body) {
  return cors({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") return cors({ statusCode: 204, body: "" });

  const params = event.queryStringParameters || {};
  const action = params.action || "";
  const ip = event.headers?.["x-forwarded-for"]?.split(",")[0] || "unknown";

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  // START: gera token do checkpoint 1
  if (action === "start") {
    const token = makeToken(1, ip);
    return json(200, { token, next: 1 });
  }

  // ADVANCE: valida token (temporário) ou permToken (encurtador)
  if (action === "advance") {
    const { token, currentStep, permToken } = body;
    const step = parseInt(currentStep, 10);

    if (isNaN(step) || step < 1 || step > 3) return json(400, { valid: false, reason: "Parâmetros inválidos" });

    // 1) Bypass de teste — só roda se explicitamente habilitado via env vars.
    if (ALLOW_PERM_BYPASS && PERM_TOKEN && permToken && permToken === PERM_TOKEN) {
      // Se é o último checkpoint (3) -> cria a key FREE de verdade no keys.js e retorna done
      if (step === 3) {
        try {
          const keyCode = await createRealFreeKey();
          return json(200, {
            valid: true,
            done: true,
            key: keyCode,
            type: "free",
            expires: "1 dia",
          });
        } catch (e) {
          console.error("Erro criando key real (permToken):", e);
          return json(502, { valid: false, reason: "Não foi possível gerar a key agora. Tente novamente." });
        }
      }

      // Senão, retorna token para o próximo passo
      const nextToken = makeToken(step + 1, ip);
      return json(200, { valid: true, done: false, token: nextToken, next: step + 1 });
    }

    // 2) Senão, valida token temporário tradicional
    if (!token) return json(200, { valid: false, reason: "Token não informado" });

    const v = verifyToken(token, step, ip);
    if (!v.ok) return json(200, { valid: false, reason: v.reason });

    if (step === 3) {
      try {
        const keyCode = await createRealFreeKey();
        return json(200, {
          valid: true,
          done: true,
          key: keyCode,
          type: "free",
          expires: "1 dia",
        });
      } catch (e) {
        console.error("Erro criando key real (token):", e);
        return json(502, { valid: false, reason: "Não foi possível gerar a key agora. Tente novamente." });
      }
    }

    // gera token do próximo passo
    const nextToken = makeToken(step + 1, ip);
    return json(200, { valid: true, done: false, token: nextToken, next: step + 1 });
  }

  return json(404, { error: "Ação não encontrada" });
};