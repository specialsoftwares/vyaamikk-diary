/**
 * Unit test: production default server-port factory module graph.
 *
 * Asserts startGrinOwnerSession's default factory references
 * createFirebaseJsGrinTransport / httpsCallable and is not the uninjected FAKE
 * always-deny port. Does not start a session. Does not call Firebase.
 *
 * Boundaries:
 * - SQLITE_HOST: no
 * - emulator-tested: no
 * - device-tested: no
 * - NATIVE_DEVICE: not claimed
 * - INJECTED: production default label only (not live deploy)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GRIN_APPLICATION_SERVER_PORT_LABEL } from "./appBinding";

function stripped(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const bindingSrc = stripped(readFileSync(join(here, "appBinding.ts"), "utf8"));
  const transportSrc = stripped(readFileSync(join(here, "../transport/firebaseTransport.ts"), "utf8"));
  const transportIndex = stripped(readFileSync(join(here, "../transport/index.ts"), "utf8"));

  assert.match(bindingSrc, /createFirebaseJsGrinTransport/);
  assert.match(bindingSrc, /from ["']@\/services\/grin\/transport["']/);
  assert.match(bindingSrc, /function defaultGrinServerPortFactory/);
  assert.match(bindingSrc, /server:\s*serverPortFactory\(\)/);
  assert.doesNotMatch(bindingSrc, /createUninjectedGrinServerPort\s*\(/);
  assert.doesNotMatch(bindingSrc, /from ["'][^"']*uninjectedServer["']/);
  assert.doesNotMatch(bindingSrc, /firebase-admin/);
  assert.doesNotMatch(bindingSrc, /tools\/goods-evidence/);
  assert.doesNotMatch(bindingSrc, /HostSqlite/);
  assert.doesNotMatch(bindingSrc, /node:fs/);
  assert.doesNotMatch(bindingSrc, /from ["']fs["']/);

  assert.match(transportIndex, /createFirebaseJsGrinTransport/);
  assert.match(transportSrc, /httpsCallable/);
  assert.match(transportSrc, /from ["']firebase\/functions["']/);
  assert.match(transportSrc, /createFirebaseJsGrinTransport/);
  assert.match(transportSrc, /portKind: "INJECTED"/);
  assert.match(transportSrc, /compositionLabel: "not live deploy"/);
  assert.doesNotMatch(transportSrc, /createUninjectedGrinServerPort/);

  assert.equal(
    GRIN_APPLICATION_SERVER_PORT_LABEL,
    "INJECTED / FIREBASE_JS_HTTPS_CALLABLE. Not live deploy."
  );

  console.log("appBinding.defaultServerPort.unit.test.ts: ok");
}

main();
