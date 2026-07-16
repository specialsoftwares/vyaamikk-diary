import assert from "node:assert/strict";

import { normalizeMailtoUrl } from "./safeMailtoPolicy";

function testAcceptsEmailAndMailto() {
  assert.equal(normalizeMailtoUrl("support.vyd@specialsoftwares.com"), "mailto:support.vyd@specialsoftwares.com");
  assert.equal(
    normalizeMailtoUrl("mailto:support.vyd@specialsoftwares.com"),
    "mailto:support.vyd@specialsoftwares.com"
  );
  assert.equal(
    normalizeMailtoUrl("mailto:support.vyd@specialsoftwares.com?subject=Hi"),
    "mailto:support.vyd@specialsoftwares.com?subject=Hi"
  );
}

function testRejectsJunk() {
  assert.equal(normalizeMailtoUrl(""), null);
  assert.equal(normalizeMailtoUrl(null), null);
  assert.equal(normalizeMailtoUrl({}), null);
  assert.equal(normalizeMailtoUrl("javascript:alert(1)"), null);
  assert.equal(normalizeMailtoUrl("not-an-email"), null);
  assert.equal(normalizeMailtoUrl("a b@c.com"), null);
  assert.equal(normalizeMailtoUrl("mailto:not-an-email"), null);
}

function main() {
  testAcceptsEmailAndMailto();
  testRejectsJunk();
  console.log("safeMailto.test.ts: ok");
}

main();
