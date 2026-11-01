/** Real callable continuation + AES-GCM, with injected admission/read/restore I/O.
 * Not a signed-device or deployed-Firebase test. No private data or live keys.
 */
import assert from "node:assert/strict";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { assertBusinessAccountActive } from "../identity/businessAdmission";
import {
  performSealOwnerContent,
  performOpenOwnerContent,
  type OwnerContentGuards,
} from "./ownerContent";

function request(data: Record<string, unknown>, uid: string | null = "new-owner") {
  return { data, auth: uid ? { uid, token: {} } : undefined } as CallableRequest;
}
const denied = (code: string) => (error: unknown) => error instanceof HttpsError && error.code === code;

async function main() {
  const previousKey = process.env.CONTENT_DATA_KEY;
  const previousId = process.env.CONTENT_DATA_KEY_ID;
  process.env.CONTENT_DATA_KEY = Buffer.alloc(32, 7).toString("base64");
  delete process.env.CONTENT_DATA_KEY_ID;
  try {
    for (const ageEligibility of [undefined, "unassessed", "ineligible", "eligible"]) {
      const order: string[] = [];
      const guards: OwnerContentGuards = {
        admit: async () => { order.push("admit"); },
        activeAccount: async (uid) => {
          order.push("active");
          await assertBusinessAccountActive(uid, async () => ({ status: "active", ageEligibility }));
        },
        restore: async () => { order.push("restore"); },
      };
      // Profile completion followed by the first business save uses the same production seal/open handlers.
      for (const [collection, purpose, recordId] of [["users", "profile", "new-owner"], ["entries", "diary", "first-entry"]]) {
        const binding = { uid: "new-owner", collection, purpose, recordId, revision: 1 };
        const plaintextBase64 = Buffer.from(JSON.stringify({ title: "Synthetic regression" })).toString("base64");
        order.length = 0;
        const { seal } = await performSealOwnerContent(request({ ...binding, plaintextBase64 }), guards);
        assert.deepEqual(order, ["admit", "active", "restore"]);
        assert.equal((await performOpenOwnerContent(request({ ...binding, seal }), guards)).plaintextBase64, plaintextBase64);
        await assert.rejects(performOpenOwnerContent(request({ ...binding, seal: { ...seal, tag: Buffer.alloc(16).toString("base64") } }), guards), denied("permission-denied"));
        await assert.rejects(performSealOwnerContent(request({ ...binding, uid: "other-owner", plaintextBase64 }), guards), denied("permission-denied"));
        await assert.rejects(performOpenOwnerContent(request({ ...binding, seal }, "other-owner"), guards), denied("permission-denied"));
        await assert.rejects(performOpenOwnerContent(request({ ...binding, recordId: "another-record", seal }), guards), denied("permission-denied"));
      }
    }

    const data = { uid: "new-owner", collection: "entries", purpose: "diary", recordId: "first-entry", revision: 1, plaintextBase64: Buffer.from("fixture").toString("base64") };
    const allow: OwnerContentGuards = { admit: async () => undefined, activeAccount: async () => undefined, restore: async () => undefined };
    await assert.rejects(performSealOwnerContent(request(data, null), allow), denied("unauthenticated"));
    for (const profile of [null, { status: "pending_deletion" }, { status: "deleted" }, { status: "disabled" }]) {
      const guards = { ...allow, activeAccount: (uid: string) => assertBusinessAccountActive(uid, async () => profile) };
      await assert.rejects(performSealOwnerContent(request(data), guards), denied("failed-precondition"));
      await assert.rejects(performOpenOwnerContent(request(data), guards), denied("failed-precondition"));
    }
    for (const gate of ["admit", "restore"] as const) {
      const failure = new HttpsError("permission-denied", gate === "admit" ? "session_revoked" : "restore_closed");
      const guards = { ...allow, [gate]: async () => { throw failure; } };
      await assert.rejects(performSealOwnerContent(request(data), guards), (error) => error === failure);
      await assert.rejects(performOpenOwnerContent(request(data), guards), (error) => error === failure);
    }
    delete process.env.CONTENT_DATA_KEY;
    await assert.rejects(performSealOwnerContent(request(data), allow), denied("failed-precondition"));
    console.log("ownerContent.admission.test.ts: ok");
  } finally {
    if (previousKey === undefined) delete process.env.CONTENT_DATA_KEY; else process.env.CONTENT_DATA_KEY = previousKey;
    if (previousId === undefined) delete process.env.CONTENT_DATA_KEY_ID; else process.env.CONTENT_DATA_KEY_ID = previousId;
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
