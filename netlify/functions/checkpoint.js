// ============================================================
// RBX EXPLOIT — Checkpoint Token System
// Cada checkpoint gera um token assinado com timestamp.
// O próximo checkpoint só carrega se apresentar o token correto.
// Sem o token → redireciona pro início.
// ============================================================

const SECRET = process.env.CHECKPOINT_SECRET || "rbx-exploit-secret-2025";

// ── Crypto simples (sem dependências externas) ───────────────
function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // unsigned 32-bit
  }
  return hash.toString(16).padStart(8, "0");
}

function makeToken(step, ip) {
  const ts = Math.floor(Date.now() / 1000); // timestamp em segundos
  const payload = `${step}:${ip}:${ts}:${SECRET}`;
  const sig = simpleHash(payload);
  // Token = base64(step:ts:sig)
  return Buffer.from(`${step}:${ts}:${sig}`).toString("base64url");
}

function verifyToken(token, expectedStep, ip, maxAgeSeconds = 600) {
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const [step, tsStr, sig] = decoded.split(":");
    const ts = parseInt(tsStr, 10);
    if (parseInt(step) !== expectedStep) return false;
    const now = Math.floor(Date.now() / 1000);
    if (now - ts > maxAgeSeconds) return false; // expirado (10 min)
    const expected = simpleHash(`${step}:${ip}:${ts}:${SECRET}`);
    return sig === expected;
  } catch {
    return false;
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

  // ── INICIAR: gera token do checkpoint 1 ─────────────────────
  if (action === "start") {
    const token = makeToken(1, ip);
    return json(200, { token, next: 1 });
  }

  // ── VERIFICAR token e avançar pro próximo checkpoint ─────────
  if (action === "advance") {
    const { token, currentStep } = body;
    const step = parseInt(currentStep, 10);

    if (!token || isNaN(step) || step < 1 || step > 3)
      return json(400, { valid: false, reason: "Parâmetros inválidos" });

    if (!verifyToken(token, step, ip))
      return json(200, { valid: false, reason: "Token inválido ou expirado" });

    // Último checkpoint (3) → gera a key FREE de 1 dia
    if (step === 3) {
      // Chama internamente a função de keys para gerar uma key
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const seg = () => Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      const keyCode = `RBXF-${seg()}-${seg()}-${seg()}`;

      // Em produção: salvar no banco via API interna ou Netlify Blobs
      // Por agora retornamos a key gerada para o front mostrar
      return json(200, {
        valid:   true,
        done:    true,
        key:     keyCode,
        type:    "free",
        expires: "1 dia",
      });
    }

    // Ainda tem checkpoints: gera token do próximo passo
    const nextToken = makeToken(step + 1, ip);
    return json(200, { valid: true, done: false, token: nextToken, next: step + 1 });
  }

  return json(404, { error: "Ação não encontrada" });
};
