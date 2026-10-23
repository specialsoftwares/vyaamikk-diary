import assert from "node:assert/strict";

import { purgeUserSubcollectionsFully } from "./firestorePurge";

type Node = { id: string; parent: Node[]; cols: Map<string, Node[]> };

function column(nodes: Node[]) {
  return {
    limit(n: number) {
      return {
        async get() {
          const page = nodes.slice(0, n);
          return {
            empty: page.length === 0,
            size: page.length,
            docs: page.map((node) => ({
              ref: Object.assign(node, {
                listCollections: async () => [...node.cols.values()].map((children) => column(children)),
              }),
            })),
          };
        },
      };
    },
  };
}

function database(entries: Node[]) {
  return {
    collection() {
      return {
        doc() {
          return { collection: () => column(entries) };
        },
      };
    },
    batch() {
      const doomed: Node[] = [];
      return {
        delete(ref: unknown) {
          doomed.push(ref as Node);
        },
        async commit() {
          for (const node of doomed) {
            const index = node.parent.indexOf(node);
            if (index >= 0) node.parent.splice(index, 1);
          }
        },
      };
    },
  };
}

function node(id: string, parent: Node[], child?: Node[]): Node {
  const cols = new Map<string, Node[]>();
  if (child) cols.set("nested", child);
  const created: Node = { id, parent, cols };
  parent.push(created);
  return created;
}

async function main() {
  const entries: Node[] = [];
  const notes: Node[] = [];
  node("note", notes);
  node("entry", entries, notes);
  const renewals: number[] = [];
  const purged = await purgeUserSubcollectionsFully(database(entries) as never, "owner", {
    onBatch: async () => {
      renewals.push(renewals.length + 1);
    },
  });
  assert.equal(entries.length, 0);
  assert.equal(notes.length, 0);
  assert.equal(purged.exhausted, true);
  assert.ok(purged.deleted >= 2);
  assert.ok(renewals.length >= 2);

  const deep: Node[] = [];
  let parent = deep;
  for (let level = 0; level < 6; level += 1) {
    const next: Node[] = [];
    node(`level-${level}`, parent, level === 5 ? undefined : next);
    parent = next;
  }
  const blocked = await purgeUserSubcollectionsFully(database(deep) as never, "owner");
  assert.equal(blocked.exhausted, false);
  assert.ok(deep.length > 0);
  console.log("firestorePurge: nested delete, lease renewal and depth hold passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
