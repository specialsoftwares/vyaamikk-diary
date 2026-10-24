"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CANONICAL_EXCLUSIONS = void 0;
exports.canonicalize = canonicalize;
exports.canonicalJson = canonicalJson;
const constants_1 = require("./constants");
/**
 * Versioned canonical JSON: sorted keys, UTF-8 JSON, explicit nulls,
 * omitted undefined on objects, decimal strings left as strings.
 * firestoreCommitTime is never part of an event hash.
 *
 * Collision controls: reject Date/Map/non-plain objects (they would become {}),
 * reject undefined array holes (they would collapse), reject sparse arrays.
 */
exports.CANONICAL_EXCLUSIONS = new Set(["firestoreCommitTime"]);
function isPlainObject(value) {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
function canonicalize(value) {
    if (value === undefined)
        return undefined;
    if (value === null)
        return null;
    if (typeof value === "string" || typeof value === "boolean")
        return value;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new Error("goodsEvidence: non-finite numbers are not canonical");
        }
        if (Object.is(value, -0))
            return 0;
        return value;
    }
    if (typeof value === "bigint") {
        throw new Error("goodsEvidence: bigint is not canonical; use a decimal string");
    }
    if (Array.isArray(value)) {
        if (value.length !== Object.keys(value).length) {
            throw new Error("goodsEvidence: sparse arrays are not canonical");
        }
        return value.map((item, index) => {
            if (item === undefined) {
                throw new Error(`goodsEvidence: undefined array element at ${index} is not canonical`);
            }
            return canonicalize(item);
        });
    }
    if (typeof value === "object") {
        if (!isPlainObject(value)) {
            throw new Error("goodsEvidence: only plain objects are canonical");
        }
        const out = {};
        for (const key of Object.keys(value).sort()) {
            if (key === "__proto__" || key === "constructor" || key === "prototype") {
                throw new Error("goodsEvidence: prototype keys are not canonical");
            }
            if (exports.CANONICAL_EXCLUSIONS.has(key))
                continue;
            const next = canonicalize(value[key]);
            if (next !== undefined)
                out[key] = next;
        }
        return out;
    }
    throw new Error("goodsEvidence: value is not canonicalizable");
}
function canonicalJson(value) {
    const body = canonicalize(value);
    return JSON.stringify({ canonicalVersion: constants_1.CANONICAL_JSON_VERSION, body });
}
//# sourceMappingURL=canonical.js.map