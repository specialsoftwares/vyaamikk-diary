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
    boundary: "owner_rules",
    handling: "Owner rules control who can read the image and receipt. That is access control, not application-level encryption. The object key is a storage path. GRIN purge stays off.",
  },
  {
    copy: "party_ledger_projections",
    privateFields: ["totals"],
    readableFields: ["projection id", "bucket id"],
    boundary: "owner_rules",
    handling: "Owner rules stop another user reading money totals. Those rules are not application-level encryption, so key migration does not cover the totals.",
  },
  {
    copy: "local_caches_and_outboxes",
    privateFields: ["queued plaintext payload"],
    readableFields: ["queue key"],
    boundary: "device_local",
    handling: "The queue is on the device. That location is not evidence the payload is encrypted, and it is not evidence logout deletes the queue.",
  },
  {
    copy: "storage_object_names",
    privateFields: [],
    readableFields: ["users/{uid}/{category}/{object}"],
    boundary: "routing_metadata",
    handling: "The object name identifies the owner and the object so Storage rules can allow that path. The sealed or private bytes are the object body, not the name.",
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
