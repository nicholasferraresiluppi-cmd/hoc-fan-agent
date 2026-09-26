import https from "node:https";

// Test di connettività di un proxy (SOCKS5/HTTP): apre una richiesta reale
// attraverso il proxy verso un servizio di IP-echo pubblico, misura la
// latenza e verifica che la connessione risponda. Import dinamico dei client
// SOCKS/HTTP proxy nel chiamante (route API) per non appesantire il bundle
// client — questo modulo gira solo lato server (Node runtime).

const IP_CHECK_URL = "https://api.ipify.org?format=json";
const TIMEOUT_MS = 8000;

function buildProxyUrl(proxy) {
  const auth =
    proxy.username && proxy.password
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
      : "";
  const scheme = proxy.type === "socks5" ? "socks5" : "http";
  return `${scheme}://${auth}${proxy.host}:${proxy.port}`;
}

async function buildAgent(proxy) {
  const url = buildProxyUrl(proxy);
  if (proxy.type === "socks5") {
    const { SocksProxyAgent } = await import("socks-proxy-agent");
    return new SocksProxyAgent(url, { timeout: TIMEOUT_MS });
  }
  const { HttpsProxyAgent } = await import("https-proxy-agent");
  return new HttpsProxyAgent(url, { timeout: TIMEOUT_MS });
}

/**
 * Testa un proxy dialando IP_CHECK_URL attraverso di esso.
 * `proxy` deve avere host/port/type e, se presenti, username/password IN CHIARO
 * (la decrypt va fatta dal chiamante prima di invocare questa funzione — il
 * modulo non tocca KV/crypto).
 *
 * @returns {Promise<{success:boolean, publicIp?:string, latencyMs:number, error?:string}>}
 */
export async function testProxyConnection(proxy) {
  const start = Date.now();
  let agent;
  try {
    agent = await buildAgent(proxy);
  } catch (e) {
    return { success: false, latencyMs: Date.now() - start, error: `Configurazione proxy non valida: ${e.message}` };
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve({ ...result, latencyMs: Date.now() - start });
    };

    const req = https.get(
      IP_CHECK_URL,
      { agent, timeout: TIMEOUT_MS },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          finish({ success: false, error: `HTTP ${res.statusCode} dal servizio di verifica IP` });
          return;
        }
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            finish({ success: true, publicIp: parsed.ip || null });
          } catch {
            finish({ success: false, error: "risposta non valida dal servizio di verifica IP" });
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      finish({ success: false, error: `timeout dopo ${TIMEOUT_MS}ms` });
    });

    req.on("error", (e) => {
      finish({ success: false, error: e.message || "errore di connessione" });
    });
  });
}
