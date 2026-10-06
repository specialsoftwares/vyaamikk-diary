#!/usr/bin/env node
/**
 * Local Firebase JS phone OTP sign-in surface for GRIN LIVE_BACKEND F.
 *
 * Auth boundary:
 * - Public Firebase web client config from repo .env (values never printed).
 * - Browser uses in-memory Auth persistence only; signs out after handoff.
 * - /session verifies Firebase ID token via Google securetoken certs for
 *   vyaamikk-diary; identity is claims.sub only (body.uid is ignored).
 * - One-use session nonce + same-origin checks + bounded body size.
 * - No signJwt, IAM expansion, or service-account keys.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  MAX_SESSION_BODY_BYTES,
  assertSameOriginHandoff,
  assertUidMatchesAdmission,
  newSessionNonce,
  verifyFirebaseIdToken,
  VERIFY_PROJECT_ID,
  IdTokenVerifyError,
} from "./grin-live-f-verify-id-token.mjs";

export const DEFAULT_PORT = Number(process.env.GRIN_LIVE_F_SIGNIN_PORT || 8787);
export const DEFAULT_HOST = "127.0.0.1";
const UID_FILE =
  process.env.GRIN_OWNER_UID_FILE ||
  "/Users/shivamsaurav/vyd-private/grin-owner-admission.txt";

function fail(msg) {
  process.stderr.write(`SIGNIN ABORT: ${msg}\n`);
  process.exit(2);
}

export function loadDotEnv(repoRoot) {
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

export function loadAdmittedUid(uidFile = UID_FILE) {
  const raw = readFileSync(uidFile, "utf8");
  const uids = raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#"));
  if (uids.length !== 1) fail("owner UID file count unexpected");
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(uids[0])) fail("owner UID grammar rejected");
  return uids[0];
}

export function publicFirebaseConfig(env) {
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
  if (cfg.projectId !== VERIFY_PROJECT_ID) fail("Firebase projectId is not vyaamikk-diary");
  return cfg;
}

export function pageHtml(cfgJson, sessionNonce) {
  const nonceJson = JSON.stringify(sessionNonce);
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
  <button id="cancel" type="button">Cancel / clear</button>
  <p id="status">Ready.</p>
  <script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
    import {
      initializeAuth,
      inMemoryPersistence,
      RecaptchaVerifier,
      signInWithPhoneNumber,
      signOut,
    } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

    const cfg = ${cfgJson};
    const sessionNonce = ${nonceJson};
    const app = initializeApp(cfg);
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    let confirmation = null;
    const status = document.getElementById("status");
    const phoneEl = document.getElementById("phone");
    const otpEl = document.getElementById("otp");
    function setStatus(t) { status.textContent = t; }
    async function clearLocalAuth(reason) {
      confirmation = null;
      phoneEl.value = "";
      otpEl.value = "";
      document.getElementById("confirm").disabled = true;
      try { await signOut(auth); } catch (_) {}
      if (reason) setStatus(reason);
    }

    window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: "normal",
      callback: () => setStatus("reCAPTCHA complete. Send OTP."),
    });

    document.getElementById("cancel").onclick = () => {
      clearLocalAuth("Cleared. Tokens were not stored. You may close this tab.");
    };

    document.getElementById("send").onclick = async () => {
      try {
        const phone = phoneEl.value.trim();
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
        const code = otpEl.value.trim();
        if (!confirmation) {
          setStatus("Send OTP first.");
          return;
        }
        setStatus("Confirming…");
        const cred = await confirmation.confirm(code);
        const idToken = await cred.user.getIdToken(true);
        const res = await fetch("/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, sessionNonce }),
          credentials: "same-origin",
        });
        const body = await res.json().catch(() => ({ ok: false }));
        await clearLocalAuth(null);
        if (!res.ok || !body.ok) {
          setStatus("Session rejected by local harness. Tokens were not printed or stored.");
          return;
        }
        setStatus("Signed in and handed off. Local Auth cleared. You can close this tab; the harness continues.");
      } catch (e) {
        const code = e && e.code ? String(e.code) : "error";
        await clearLocalAuth("Confirm failed: " + code);
      }
    };
  </script>
</body>
</html>`;
}

/**
 * Pure /session handler for tests and the live server.
 * Ignores body.uid entirely. Identity comes only from verified token claims.
 */
export async function handleSessionPost({
  rawBody,
  admittedUid,
  expectedNonce,
  origin,
  reqHeaders,
  verifyIdToken = verifyFirebaseIdToken,
  projectId = VERIFY_PROJECT_ID,
  nonceConsumed,
}) {
  if (Buffer.byteLength(rawBody, "utf8") > MAX_SESSION_BODY_BYTES) {
    return { status: 413, json: { ok: false, reason: "body_too_large" } };
  }
  try {
    assertSameOriginHandoff({ headers: reqHeaders || {} }, origin);
  } catch (err) {
    return { status: 403, json: { ok: false, reason: err.code || "cross_origin" } };
  }
  if (nonceConsumed && nonceConsumed()) {
    return { status: 409, json: { ok: false, reason: "nonce_reused" } };
  }
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { status: 400, json: { ok: false, reason: "malformed_json" } };
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, json: { ok: false, reason: "malformed_json" } };
  }
  const idToken = typeof body.idToken === "string" ? body.idToken : "";
  const sessionNonce = typeof body.sessionNonce === "string" ? body.sessionNonce : "";
  if (!idToken || !sessionNonce || sessionNonce !== expectedNonce) {
    return { status: 403, json: { ok: false, reason: "nonce_mismatch" } };
  }
  // body.uid is intentionally ignored even if present.
  try {
    const claims = await verifyIdToken(idToken, { projectId });
    assertUidMatchesAdmission(claims.uid, admittedUid);
    return {
      status: 200,
      json: { ok: true },
      session: { uid: claims.uid, idToken },
    };
  } catch (err) {
    const code = err instanceof IdTokenVerifyError ? err.code : err?.code || "invalid_token";
    const status =
      code === "wrong_owner" || code === "wrong_project"
        ? 403
        : code === "expired_token"
          ? 401
          : 401;
    return { status, json: { ok: false, reason: code } };
  }
}

/**
 * @returns {Promise<{ uid: string, idToken: string }>}
 */
export function waitForOwnerClientSession({
  repoRoot = process.cwd(),
  timeoutMs = Number(process.env.GRIN_LIVE_F_SIGNIN_TIMEOUT_MS || 15 * 60 * 1000),
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  admittedUid,
  verifyIdToken = verifyFirebaseIdToken,
  envMap,
} = {}) {
  const admitted = admittedUid || loadAdmittedUid();
  const env = envMap || loadDotEnv(repoRoot);
  const cfg = publicFirebaseConfig(env);
  const cfgJson = JSON.stringify(cfg);
  const origin = `http://${host}:${port}`;
  let expectedNonce = newSessionNonce();
  let nonceUsed = false;

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
        const url = new URL(req.url || "/", origin);
        if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
          if (!nonceUsed) expectedNonce = newSessionNonce();
          const html = pageHtml(cfgJson, expectedNonce);
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(html);
          return;
        }
        if (req.method === "POST" && url.pathname === "/session") {
          const chunks = [];
          let size = 0;
          let tooLarge = false;
          for await (const c of req) {
            size += c.length;
            if (size > MAX_SESSION_BODY_BYTES) {
              tooLarge = true;
              break;
            }
            chunks.push(c);
          }
          if (tooLarge) {
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, reason: "body_too_large" }));
            return;
          }
          const raw = Buffer.concat(chunks).toString("utf8");
          const result = await handleSessionPost({
            rawBody: raw,
            admittedUid: admitted,
            expectedNonce,
            origin,
            reqHeaders: req.headers,
            verifyIdToken,
            nonceConsumed: () => nonceUsed,
          });
          res.writeHead(result.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          res.end(JSON.stringify(result.json));
          if (result.status === 200 && result.session && !settled) {
            nonceUsed = true;
            settled = true;
            clearTimeout(timer);
            process.stderr.write("SIGNIN: verified session accepted (claims.uid matched admission); values not printed\n");
            server.close(() => resolveSession(result.session));
          } else if (result.status !== 200) {
            process.stderr.write(`SIGNIN: session rejected reason=${result.json.reason || "unknown"}; values not printed\n`);
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

    server.listen(port, host, () => {
      process.stdout.write(
        `SIGNIN: open ${origin}/ and complete Firebase phone OTP as the admitted owner (OTP stays in the browser; tokens/UIDs never printed)\n`,
      );
    });
  });
}

const isMain =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  waitForOwnerClientSession()
    .then(() => {
      process.stdout.write("SIGNIN: session accepted (verified claims); exiting\n");
      process.exit(0);
    })
    .catch((err) => {
      process.stderr.write(`SIGNIN ABORT: ${err instanceof Error ? err.message : "unknown"}\n`);
      process.exit(2);
    });
}
