/**
 * Verifies the major-version override basic-ftp@6.2.2 still exposes the
 * Client surface used by get-uri (proxy-agent → pac-proxy-agent → get-uri).
 * Does not claim network FTP acceptance.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(__filename);
const ftp = require("basic-ftp") as {
  Client: new () => {
    access: (opts: unknown) => Promise<unknown>;
    list: (path?: string) => Promise<unknown[]>;
    downloadTo: (...args: unknown[]) => Promise<unknown>;
    close: () => void;
  };
  parseList: (input: string) => unknown[];
};
const pkg = require("basic-ftp/package.json") as { version: string };

assert.equal(pkg.version, "6.2.2", "override must resolve basic-ftp 6.2.2");
const client = new ftp.Client();
assert.equal(typeof client.access, "function");
assert.equal(typeof client.list, "function");
assert.equal(typeof client.downloadTo, "function");
assert.equal(typeof client.close, "function");
// Smoke the list parser (GHSA-c475-qrg2-pj4r target) with a short valid line.
const parsed = ftp.parseList("-rw-r--r-- 1 user group 123 May  1 12:00 file.txt");
assert.ok(Array.isArray(parsed));
client.close();
console.log("basicFtpOverride.smoke.test.ts: ok (API surface; not network FTP)");
