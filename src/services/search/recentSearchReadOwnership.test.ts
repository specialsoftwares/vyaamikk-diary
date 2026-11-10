/** Production focus-read boundary, synthetic storage and session transitions. */
import assert from "node:assert/strict";
import { requestClaimsMatch, type RequestClaim } from "@/components/screenState/resolveScreenState";
import { startRecentSearchRead } from "./recentSearchReadOwnership";
import type { RecentSearchRead } from "./recentSearches";

async function main() {
  for (const sameUid of [false, true]) {
    const a: RequestClaim = { uid: "owner-a", epoch: 1, generation: 1 };
    const b: RequestClaim = { uid: sameUid ? a.uid : "owner-b", epoch: 2, generation: 2 };
    let live = a;
    let visible: string[] = [];
    let failures = 0;
    let release!: (value: RecentSearchRead) => void;
    const ports = {
      owns: (claim: RequestClaim) => requestClaimsMatch(live, claim),
      publish: (value: RecentSearchRead) => { visible = value.state === "ready" ? value.queries : []; },
      fail: () => { failures += 1; },
    };
    const pendingA = startRecentSearchRead({ ...ports, claim: a,
      read: () => new Promise<RecentSearchRead>((resolve) => { release = resolve; }),
    });
    live = b;
    const currentB = startRecentSearchRead({ ...ports, claim: b,
      read: async () => ({ state: "ready", queries: ["current private query"] }),
    });
    await currentB.settled;
    release({ state: "ready", queries: ["retired private query"] });
    await pendingA.settled;
    assert.deepEqual(visible, ["current private query"], "late history cannot replace the current session's history");
    assert.equal(failures, 0);

    let reject!: (error: unknown) => void;
    const staleFailure = startRecentSearchRead({ ...ports, claim: b,
      read: () => new Promise((_, fail) => { reject = fail; }),
    });
    live = { ...b, generation: 3 };
    reject(new Error("private storage detail"));
    await staleFailure.settled;
    assert.equal(failures, 0, "late failure cannot replace a newer request");

    let releaseBlur!: (value: RecentSearchRead) => void;
    const blurred = startRecentSearchRead({ ...ports, claim: live,
      read: () => new Promise((resolve) => { releaseBlur = resolve; }),
    });
    blurred.dispose();
    releaseBlur({ state: "ready", queries: ["after blur"] });
    await blurred.settled;
    assert.deepEqual(visible, ["current private query"], "focus cleanup retires publication");

    let reads = 0;
    const retiredBeforeStart = startRecentSearchRead({ ...ports, claim: a,
      read: async () => { reads++; return { state: "ready", queries: [] }; },
    });
    await retiredBeforeStart.settled;
    assert.equal(reads, 0, "a retired request does not start reading");
  }
  console.log("recentSearchReadOwnership.test.ts: ok");
}
void main().catch((error) => { console.error(error); process.exit(1); });
