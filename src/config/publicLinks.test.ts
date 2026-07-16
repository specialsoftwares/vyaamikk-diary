import assert from "node:assert/strict";

import { classifyPublicUrl, type PublicLinkKind } from "./publicLinkValidation";

function testValidHttpsReady() {
  const kinds: PublicLinkKind[] = [
    "websiteHome",
    "privacy",
    "terms",
    "support",
    "contact",
    "accountDeletion",
    "download",
  ];
  for (const kind of kinds) {
    const r = classifyPublicUrl(kind, `https://vyaamikk.specialsoftwares.com/${kind}`);
    assert.equal(r.status, "ready", kind);
    assert.equal(r.canOpen, true, kind);
  }
}

function testMissingValues() {
  const r = classifyPublicUrl("privacy", "");
  assert.equal(r.status, "missing");
  assert.equal(r.canOpen, false);

  const home = classifyPublicUrl("websiteHome", "   ");
  assert.equal(home.status, "missing");
  assert.equal(home.canOpen, false);
}

function testMalformedValues() {
  assert.equal(classifyPublicUrl("terms", "http://insecure.example/terms").status, "malformed");
  assert.equal(classifyPublicUrl("terms", "javascript:alert(1)").status, "malformed");
  assert.equal(classifyPublicUrl("terms", "not-a-url").status, "malformed");
  assert.equal(
    classifyPublicUrl("privacy", "https://example.com/privacy").status,
    "malformed",
    "example.com placeholders rejected"
  );
}

function testPrelaunchEmptyStoreUrls() {
  const app = classifyPublicUrl("appStore", "");
  assert.equal(app.status, "prelaunch_empty");
  assert.equal(app.canOpen, false);

  const play = classifyPublicUrl("playStore", "  ");
  assert.equal(play.status, "prelaunch_empty");
  assert.equal(play.canOpen, false);

  const live = classifyPublicUrl(
    "appStore",
    "https://apps.apple.com/app/id000000000"
  );
  assert.equal(live.status, "ready");
  assert.equal(live.canOpen, true);
}

function testAuthRouteForbidden() {
  const cases = [
    "https://vyaamikk.specialsoftwares.com/auth",
    "https://vyaamikk.specialsoftwares.com/auth/",
    "https://vyaamikk.specialsoftwares.com/auth?x=1",
    "https://vyaamikk.specialsoftwares.com/auth#fragment",
  ];
  for (const url of cases) {
    const r = classifyPublicUrl("websiteHome", url);
    assert.equal(r.status, "forbidden_auth", url);
    assert.equal(r.canOpen, false, url);
    assert.match(r.reason ?? "", /Developer Integration/i);
  }
}

function testRetiredInHostnameRejected() {
  const r = classifyPublicUrl(
    "privacy",
    "https://vyaamikk.specialsoftwares.in/privacy"
  );
  assert.equal(r.status, "malformed");
  assert.equal(r.canOpen, false);
  assert.match(r.reason ?? "", /\.in/);
}

function main() {
  testValidHttpsReady();
  testMissingValues();
  testMalformedValues();
  testPrelaunchEmptyStoreUrls();
  testAuthRouteForbidden();
  testRetiredInHostnameRejected();
  console.log("publicLinks.test.ts: ok");
}

main();
