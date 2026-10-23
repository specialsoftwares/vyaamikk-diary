import assert from "node:assert/strict";

import { purgeUserSubcollectionsFully, type PurgePorts } from "./firestorePurge";

type Mem = {
  docs: Map<string, Set<string>>;
  children: Map<string, string[]>;
};

function ports(mem: Mem): PurgePorts {
  return {
    async listPage(parentPath, collectionId) {
      const ids = [...(mem.docs.get(`${parentPath}/${collectionId}`) ?? new Set<string>())];
      return { ids };
    },
    async childCollections(path) {
      return mem.children.get(path) ?? [];
    },
    async rootCollections() {
      return ["entries", "subscription"];
    },
    async deleteDocs(paths) {
      for (const path of paths) {
        const slash = path.lastIndexOf("/");
        const col = path.slice(0, slash);
        const id = path.slice(slash + 1);
        mem.docs.get(col)?.delete(id);
      }
    },
  };
}

async function main() {
  const mem: Mem = { docs: new Map(), children: new Map() };
  mem.docs.set("users/owner/entries", new Set(["missing-parent"]));
  mem.children.set("users/owner/entries/missing-parent", ["notes"]);
  mem.docs.set("users/owner/entries/missing-parent/notes", new Set(["private-note"]));
  const renewals: number[] = [];
  const purged = await purgeUserSubcollectionsFully({} as never, "owner", {
    ports: ports(mem),
    onBatch: async () => {
      renewals.push(1);
    },
  });
  assert.equal(purged.exhausted, true);
  assert.equal(purged.hold, undefined);
  assert.equal(mem.docs.get("users/owner/entries/missing-parent/notes")?.size ?? 0, 0);
  assert.equal(mem.docs.get("users/owner/entries")?.size ?? 0, 0);
  assert.ok(renewals.length >= 2);

  const deep: Mem = { docs: new Map(), children: new Map() };
  let parent = "users/owner";
  let collection = "entries";
  deep.docs.set(`${parent}/${collection}`, new Set(["n0"]));
  for (let level = 0; level < 5; level += 1) {
    const docPath = `${parent}/${collection}/n${level}`;
    const next = `c${level}`;
    deep.children.set(docPath, [next]);
    deep.docs.set(`${docPath}/${next}`, new Set([`n${level + 1}`]));
    parent = docPath;
    collection = next;
  }
  const blocked = await purgeUserSubcollectionsFully({} as never, "owner", { ports: ports(deep) });
  assert.equal(blocked.exhausted, false);
  assert.equal(blocked.hold, "depth_exceeded");
  assert.ok([...deep.docs.values()].some((ids) => ids.size > 0));

  await assert.rejects(
    () => purgeUserSubcollectionsFully({} as never, "owner", {
      ports: ports(mem),
      beforePage: async () => {
        throw new Error("lease_lost");
      },
    }),
    /lease_lost/
  );
  console.log("firestorePurge: missing parent, depth hold and lease stop passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
