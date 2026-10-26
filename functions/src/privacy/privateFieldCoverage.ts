/**
 * Copies that are not the content seal. Routing metadata and a file the user
 * asked to download stay readable for their own purpose. Private bodies that
 * are not sealed stay outside key migration.
 */

import { CONTENT_MIGRATION_UNCOVERED } from "./contentEncryption";

export type ProtectionBoundary = "content_seal" | "owner_rules" | "device_local" | "routing_metadata" | "user_requested_export";

export type FieldBoundary = {
  copy: (typeof CONTENT_MIGRATION_UNCOVERED)[number];
  privateFields: readonly string[];
  readableFields: readonly string[];
  boundary: ProtectionBoundary;
  handling: string;
};

export const PRIVATE_FIELD_BOUNDARIES: readonly FieldBoundary[] = [
  {
    copy: "grin_evidence",
    privateFields: ["receipt body", "goods description", "image bytes"],
    readableFields: ["ledger id", "receipt id", "storage object key"],
    boundary: "content_seal",
    handling: "Receipt, command, and event documents are sealed with the server content key. A missing or malformed key rejects the mutation. Legacy plaintext documents still open. New image and PDF originals are sealed with AES-256-GCM in bounded chunks. The original-content hash is not the stored-ciphertext hash. An existing unsealed object stays readable and is not rewritten. GRIN purge stays off.",
  },
  {
    copy: "party_ledger_projections",
    privateFields: ["totals"],
    readableFields: ["projection id", "bucket id"],
    boundary: "owner_rules",
    handling: "Release totals are recomputed on the device from the source records. Client reads and writes of partyLedgerProjections, partyLedgerBuckets, partyLedgerCommands, and partyLedgerCheckpoints are denied. The server projector stays unregistered. A stored plaintext projection is not a release read path.",
  },
  {
    copy: "local_caches_and_outboxes",
    privateFields: ["queued plaintext payload"],
    readableFields: ["queue key"],
    boundary: "device_local",
    handling: "Pending rows stay on the device under the account that queued them. Diary payloads, draft bodies, queue bodies, insight labels, and GRIN receipt and command JSON are sealed with that account's key. Legacy GRIN plaintext still opens. Insight join keys and link ids are account-bound tokens. Ordinary logout retains the rows and the key. Account deletion removes that account's rows and key, including that account's local GRIN rows. A later account's queue query does not return the previous account's rows.",
  },
  {
    copy: "storage_object_names",
    privateFields: [],
    readableFields: ["users/{uid}/{category}/{object}"],
    boundary: "routing_metadata",
    handling: "A new object name is an application-generated opaque id. The display filename stays with the record, not in the object name. An existing object keeps the name it was stored under.",
  },
  {
    copy: "exports",
    privateFields: ["exported file body"],
    readableFields: ["export request id"],
    boundary: "user_requested_export",
    handling: "A file the user asked to download is plaintext for that user. It is not stored as another content-sealed collection and it is not evidence that every cloud copy is sealed.",
  },
];

export function boundaryFor(copy: FieldBoundary["copy"]): FieldBoundary {
  const found = PRIVATE_FIELD_BOUNDARIES.find((row) => row.copy === copy);
  if (!found) throw new Error("coverage_missing");
  return found;
}
