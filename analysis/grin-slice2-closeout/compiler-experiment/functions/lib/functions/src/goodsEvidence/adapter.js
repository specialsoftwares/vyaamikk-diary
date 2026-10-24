"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pingCanonical = pingCanonical;
/**
 * Disposable experiment only. Mirrors a Functions adapter importing
 * repository-level src/goodsEvidence via relative path.
 */
const canonical_1 = require("../../../src/goodsEvidence/canonical");
function pingCanonical() {
    return (0, canonical_1.canonicalJson)({ a: 1 });
}
//# sourceMappingURL=adapter.js.map