#!/usr/bin/env node
/**
 * Local Firebase JS phone OTP sign-in surface for GRIN LIVE_BACKEND F.
 *
 * Auth boundary:
 * - Uses public Firebase web client config from the repo .env (never prints values).
 * - Owner enters phone + OTP in the browser. OTP is never logged or requested in chat.
 * - Session is posted only to this localhost process; ID token stays in memory.
 * - Does not call iamcredentials.signJwt, mint arbitrary users, or expand IAM.
 * - Does not add authorized domains/providers.
 *
 * Usage: node grin-live-f-signin.mjs
 * Then open the printed localhost URL and complete phone OTP.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.GRIN_LIVE_F_SIGNIN_PORT || 8787);
const HOST = "127.0.0.1";
const UID_FILE =
  process.env.GRIN_OWNER_UID_FILE ||
  "/Users/shivamsaurav/vyd-private/grin-owner-admission.txt";

function fail(msg) {
  process.stderr.write(`SIGNIN ABORT: ${msg}\n`);
  process.exit(2);
}

function loadDotEnv(repoRoot) {
  const path = resolve(repoRoot, ".env");
  if (!existsSync(path)) fail(".env missing for public Firebase client config");
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function loadAdmittedUid() {
  const raw = readFileSync(UID_FILE, "utf8");
  const uids = raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
  if (uids.length !== 1) fail("owner UID file count unexpected");
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uids[0])) fail("owner UID grammar rejected");
  return uids[0];
}

function publicFirebaseConfig(env) {
  const cfg = {
    apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };
  for (const [k, v] of Object.entries(cfg)) {
    if (typeof v !== "string" || !v) fail(`missing public Firebase config field`);
  }
  return cfg;
}

function pageHtml(cfgJson) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>GRIN pilot local sign-in</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 2rem auto; padding: 0 1rem; }
    label { display: block; margin-top: 1rem; }
    input { width: 100%; padding: 0.5rem; box-sizing: border-box; }
    button { margin-top: 1rem; padding: 0.5rem 1rem; }
    #status { margin-top: 1rem; white-space: pre-wrap; }
    #recaptcha-container { margin-top: 1rem; }
  </style>
</head>
<body>
  <h1>GRIN pilot local sign-in</h1>
  <p>Sign in as the already-admitted owner with Firebase phone OTP. Enter the OTP here. Do not paste tokens into chat.</p>
  <label>Phone (E.164)<input id="phone" type="tel" autocomplete="tel" placeholder="+91…" /></label>
  <div id="recaptcha-container"></div>
  <button id="send" type="button">Send OTP</button>
  <label>OTP<input id="otp" type="text" inputmode="numeric" autocomplete="one-time-code" /></label>
  <button id="confirm" type="button" disabled>Confirm OTP</button>
  <p id="status">Ready.</p>
  <script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
    import {
      getAuth,
      RecaptchaVerifier,
      signInWithPhoneNumber,
    } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

    const cfg = ${cfgJson};
    const app = initializeApp(cfg);
    const auth = getAuth(app);
    let confirmation = null;
    const status = document.getElementById("status");
    function setStatus(t) { status.textContent = t; }

    window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: "normal",
      callback: () => setStatus("reCAPTCHA complete. Send OTP."),
    });

    document.getElementById("send").onclick = async () => {
      try {
        const phone = document.getElementById("phone").value.trim();
        if (!phone.startsWith("+")) {
          setStatus("Use E.164 phone (leading +).");
          return;
        }
        setStatus("Sending OTP…");
        confirmation = await signInWithPhoneNumber(auth, phone, window.recaptchaVerifier);
        document.getElementById("confirm").disabled = false;
        setStatus("OTP sent. Enter the code below.");
      } catch (e) {
        const code = e && e.code ? String(e.code) : "error";
        setStatus("Send failed: " + code + ". If domain/provider config is required, stop and report that exact change; do not expand IAM.");
      }
    };

    document.getElementById("confirm").onclick = async () => {
      try {
        const code = document.getElementById("otp").value.trim();
        if (!confirmation) {
          setStatus("Send OTP first.");
          return;
        }
        setStatus("Confirming…");
        const cred = await confirmation.confirm(code);
        const user = cred.user;
        const idToken = await user.getIdToken(true);
        const res = await fetch("/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: user.uid, idToken }),
        });
        const body = await res.json();
        if (!res.ok || !body.ok) {
          setStatus("Session rejected by local harness (admission mismatch or error). Tokens were not printed.");
          return;
        }
        setStatus("Signed in. UID matched admission. You can close this tab; the harness continues.");
      } catch (e) {
        const code = e && e.code ? String(e.code) : "error";
        setStatus("Confirm failed: " + code);
      }
    };
  </script>
</body>
</html>`;
}

/**
 * @returns {Promise<{ uid: string, idToken: string }>}
 */
export function waitForOwnerClientSession({
  repoRoot = process.cwd(),
  timeoutMs = Number(process.env.GRIN_LIVE_F_SIGNIN_TIMEOUT_MS || 15 * 60 * 1000),
} = {}) {
  const admitted = loadAdmittedUid();
  const env = loadDotEnv(repoRoot);
  const cfg = publicFirebaseConfig(env);
  const cfgJson = JSON.stringify(cfg);

  return new Promise((resolveSession, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      server.close();
      reject(new Error("sign-in timeout; owner OTP not completed"));
    }, timeoutMs);

    const server = createServer(async (req, res) => {
      try {
        if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
          const html = pageHtml(cfgJson);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
          return;
        }
        if (req.method === "POST" && req.url === "/session") {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          const raw = Buffer.concat(chunks).toString("utf8");
          let body;
          try {
            body = JSON.parse(raw);
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false }));
            return;
          }
          const uid = typeof body.uid === "string" ? body.uid : "";
          const idToken = typeof body.idToken === "string" ? body.idToken : "";
          if (!uid || !idToken || uid !== admitted) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, reason: "admission_mismatch" }));
            process.stderr.write("SIGNIN: session rejected (admission mismatch); values not printed\n");
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            server.close(() => resolveSession({ uid, idToken }));
          }
          return;
        }
        res.writeHead(404);
        res.end();
      } catch {
        res.writeHead(500);
        res.end();
      }
    });

    server.listen(PORT, HOST, () => {
      process.stdout.write(
        `SIGNIN: open http://${HOST}:${PORT}/ and complete Firebase phone OTP as the admitted owner (OTP stays in the browser; tokens/UIDs never printed)\n`,
      );
    });
  });
}

const isMain =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  waitForOwnerClientSession()
    .then(() => {
      process.stdout.write("SIGNIN: session accepted (admission match); exiting\n");
      process.exit(0);
    })
    .catch((err) => {
      process.stderr.write(`SIGNIN ABORT: ${err instanceof Error ? err.message : "unknown"}\n`);
      process.exit(2);
    });
}
