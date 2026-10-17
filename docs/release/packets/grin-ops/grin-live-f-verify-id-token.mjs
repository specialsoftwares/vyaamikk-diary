/**
 * Verify Firebase Auth ID tokens for project vyaamikk-diary using Google's
 * published securetoken x509 certs. No service-account keys, no signJwt,
 * no IAM expansion. Never prints tokens or UIDs.
 */
import { createPublicKey, createVerify, randomBytes } from "node:crypto";

export const VERIFY_PROJECT_ID = "vyaamikk-diary";
export const SECURETOKEN_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

export class IdTokenVerifyError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "IdTokenVerifyError";
    this.code = code;
  }
}

function b64urlJson(part) {
  const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
  const json = Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  return JSON.parse(json);
}

function b64urlToBuffer(part) {
  const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export async function fetchSecuretokenCerts(fetchImpl = fetch) {
  const res = await fetchImpl(SECURETOKEN_CERTS_URL);
  if (!res.ok) throw new IdTokenVerifyError("certs_unavailable");
  const json = await res.json();
  if (!json || typeof json !== "object") throw new IdTokenVerifyError("certs_malformed");
  return json;
}

/**
 * @param {string} idToken
 * @param {{
 *   projectId?: string,
 *   nowMs?: number,
 *   certs?: Record<string, string>,
 *   fetchImpl?: typeof fetch,
 * }} [opts]
 * @returns {Promise<{ uid: string, projectId: string, authTime: number|null, exp: number }>}
 */
export async function verifyFirebaseIdToken(idToken, opts = {}) {
  const projectId = opts.projectId || VERIFY_PROJECT_ID;
  if (typeof idToken !== "string" || idToken.split(".").length !== 3) {
    throw new IdTokenVerifyError("invalid_token");
  }
  const [h, p, s] = idToken.split(".");
  let header;
  let payload;
  try {
    header = b64urlJson(h);
    payload = b64urlJson(p);
  } catch {
    throw new IdTokenVerifyError("invalid_token");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new IdTokenVerifyError("invalid_token");
  }
  const certs = opts.certs || (await fetchSecuretokenCerts(opts.fetchImpl));
  const pem = certs[header.kid];
  if (
    typeof pem !== "string" ||
    (!pem.includes("BEGIN CERTIFICATE") && !pem.includes("BEGIN PUBLIC KEY"))
  ) {
    throw new IdTokenVerifyError("invalid_token");
  }
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${h}.${p}`);
  verifier.end();
  const ok = verifier.verify(createPublicKey(pem), b64urlToBuffer(s));
  if (!ok) throw new IdTokenVerifyError("invalid_token");

  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
    throw new IdTokenVerifyError("expired_token");
  }
  if (typeof payload.iat !== "number" || payload.iat > nowSec + 300) {
    throw new IdTokenVerifyError("invalid_token");
  }
  if (payload.aud !== projectId) {
    throw new IdTokenVerifyError("wrong_project");
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new IdTokenVerifyError("wrong_project");
  }
  if (typeof payload.sub !== "string" || !/^[A-Za-z0-9_-]{6,128}$/.test(payload.sub)) {
    throw new IdTokenVerifyError("invalid_token");
  }
  if (payload.user_id != null && payload.user_id !== payload.sub) {
    throw new IdTokenVerifyError("invalid_token");
  }
  return {
    uid: payload.sub,
    projectId,
    authTime: typeof payload.auth_time === "number" ? payload.auth_time : null,
    exp: payload.exp,
  };
}

export function assertUidMatchesAdmission(verifiedUid, admittedUid) {
  if (typeof verifiedUid !== "string" || typeof admittedUid !== "string") {
    throw new IdTokenVerifyError("wrong_owner");
  }
  if (verifiedUid !== admittedUid) throw new IdTokenVerifyError("wrong_owner");
  return true;
}

export function newSessionNonce() {
  return randomBytes(24).toString("base64url");
}

export const MAX_SESSION_BODY_BYTES = 16 * 1024;

/**
 * Same-origin / handoff checks for localhost sign-in surface.
 * Accepts Origin or Referer matching the listening origin; rejects foreign origins.
 */
export function assertSameOriginHandoff(req, origin) {
  const expected = origin.replace(/\/$/, "");
  const o = req.headers?.origin;
  const r = req.headers?.referer;
  if (typeof o === "string" && o.length) {
    if (o.replace(/\/$/, "") !== expected) {
      const err = new Error("cross_origin");
      err.code = "cross_origin";
      throw err;
    }
    return;
  }
  if (typeof r === "string" && r.length) {
    if (!r.startsWith(`${expected}/`) && r.replace(/\/$/, "") !== expected) {
      const err = new Error("cross_origin");
      err.code = "cross_origin";
      throw err;
    }
    return;
  }
  // Browser same-origin fetch may omit Origin on some GETs; POST from our page
  // should send Origin. Require at least one signal for /session.
  const err = new Error("missing_origin");
  err.code = "missing_origin";
  throw err;
}
