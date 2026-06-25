// ============================================================
// RBX EXPLOIT — Checkpoint Token System (Netlify Function)
// Perm token support: "Encurtador" (ou definir CHECKPOINT_PERM_TOKEN env)
// ============================================================

const SECRET = process.env.CHECKPOINT_SECRET || "rbx-exploit-secret-2025";
const PERM_TOKEN = process.env.CHECKPOINT_PERM_TOKEN || "Encurtador";

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

    // 1) Se veio permToken e bate com o PERM_TOKEN configurado, aceita sem validar token temporário.
    if (permToken && PERM_TOKEN && permToken === PERM_TOKEN) {
      // Se é o último checkpoint (3) -> gera key FREE e retorna done
      if (step === 3) {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const seg = () => Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        const keyCode = `RBXF-${seg()}-${seg()}-${seg()}`;
        return json(200, {
          valid: true,
          done: true,
          key: keyCode,
          type: "free",
          expires: "1 dia",
        });
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
      // gera key FREE de 1 dia
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const seg = () => Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      const keyCode = `RBXF-${seg()}-${seg()}-${seg()}`;

      // retorno ao cliente; em produção você pode persistir no seu DB
      return json(200, {
        valid: true,
        done: true,
        key: keyCode,
        type: "free",
        expires: "1 dia",
      });
    }

    // gera token do próximo passo
    const nextToken = makeToken(step + 1, ip);
    return json(200, { valid: true, done: false, token: nextToken, next: step + 1 });
  }

  return json(404, { error: "Ação não encontrada" });
};