import assert from "node:assert/strict";

import {
  classifyPublicUrl,
  type PublicLinkKind,
} from "../config/publicLinkValidation";
import {
  EXTERNAL_OPEN_FAILED_MESSAGE,
  normalizeOpenableHttpsUrl,
} from "./externalHttpsUrl";

const ORIGIN = "https://vyaamikk.specialsoftwares.com";

function testResolverReadyUrlsPassOpenerGate() {
  const cases: Array<[PublicLinkKind, string]> = [
    ["websiteHome", `${ORIGIN}/`],
    ["websiteHome", ORIGIN],
    ["privacy", `${ORIGIN}/privacy`],
    ["terms", `${ORIGIN}/terms`],
    ["support", `${ORIGIN}/support`],
    ["contact", `${ORIGIN}/contact`],
    ["accountDeletion", `${ORIGIN}/delete-account`],
    ["download", `${ORIGIN}/download`],
  ];
  for (const [kind, url] of cases) {
    const resolved = classifyPublicUrl(kind, url);
    assert.equal(resolved.status, "ready", kind);
    assert.equal(resolved.canOpen, true, kind);
    // Opener must receive the string URL — never the resolution object.
    assert.equal(normalizeOpenableHttpsUrl(resolved), null, "object rejected");
    assert.equal(normalizeOpenableHttpsUrl(resolved.url), resolved.url);
  }
}

function testMalformedMissingAuthStoreRejectedAtBothLayers() {
  assert.equal(normalizeOpenableHttpsUrl(""), null);
  assert.equal(normalizeOpenableHttpsUrl(undefined), null);
  assert.equal(normalizeOpenableHttpsUrl(null), null);
  assert.equal(normalizeOpenableHttpsUrl({ url: `${ORIGIN}/privacy` }), null);
  assert.equal(normalizeOpenableHttpsUrl(`/${ORIGIN}/privacy`), null);
  assert.equal(normalizeOpenableHttpsUrl("not-a-url"), null);
  assert.equal(normalizeOpenableHttpsUrl("http://insecure.example/privacy"), null);
  assert.equal(normalizeOpenableHttpsUrl(`${ORIGIN}/auth`), null);
  assert.equal(normalizeOpenableHttpsUrl("https://example.com/privacy"), null);
  assert.equal(
    normalizeOpenableHttpsUrl("https://vyaamikk.specialsoftwares.in/privacy"),
    null,
    "retired .in host"
  );

  assert.equal(classifyPublicUrl("appStore", "").status, "prelaunch_empty");
  assert.equal(classifyPublicUrl("playStore", "").canOpen, false);
  assert.equal(classifyPublicUrl("privacy", "").canOpen, false);
  assert.equal(
    classifyPublicUrl("privacy", "https://vyaamikk.specialsoftwares.in/privacy").status,
    "malformed"
  );
  assert.equal(classifyPublicUrl("websiteHome", `${ORIGIN}/auth`).status, "forbidden_auth");
}

function testWhitespaceNormalizedOrRejected() {
  assert.equal(
    normalizeOpenableHttpsUrl(` ${ORIGIN}/privacy `),
    `${ORIGIN}/privacy`
  );
  assert.equal(normalizeOpenableHttpsUrl(`${ORIGIN}/privacy path`), null);
}

function testFailedOpenCopy() {
  assert.match(EXTERNAL_OPEN_FAILED_MESSAGE, /Unable to open this page/i);
}

function main() {
  testResolverReadyUrlsPassOpenerGate();
  testMalformedMissingAuthStoreRejectedAtBothLayers();
  testWhitespaceNormalizedOrRejected();
  testFailedOpenCopy();
  console.log("externalHttpsUrl.test.ts: ok");
}

main();
