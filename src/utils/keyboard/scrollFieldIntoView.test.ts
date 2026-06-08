import assert from "node:assert/strict";

import { shouldScrollFieldOnFocus } from "./scrollFieldFocusPolicy";

function testShouldScrollFieldOnFocus(): void {
  assert.equal(shouldScrollFieldOnFocus(0), false);
  assert.equal(shouldScrollFieldOnFocus(0, true), true);
  assert.equal(shouldScrollFieldOnFocus(320), true);
  assert.equal(shouldScrollFieldOnFocus(320, false), true);
}

testShouldScrollFieldOnFocus();
console.log("scrollFieldFocusPolicy: ok");
