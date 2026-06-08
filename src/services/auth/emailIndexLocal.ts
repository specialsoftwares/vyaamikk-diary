import type { EmailIndexEntry } from "@/domain/types";
import { emailIndexEntryForUser } from "@/services/auth/emailLink";
import { hashEmail, normalizeEmail } from "@/utils/emailHash";
import { loadMockRegistry, saveMockRegistry, type RegistryShape } from "./mockRegistry";

/** Mutate email index on an in-memory registry (single save with user profile). */
export function commitLocalEmailIndexOpsInRegistry(
  registry: RegistryShape,
  ops: { upsert?: EmailIndexEntry; removeHash?: string | null }
): void {
  if (ops.removeHash) {
    delete registry.emailIndex[ops.removeHash];
  }
  if (ops.upsert) {
    registry.emailIndex[ops.upsert.emailHash] = ops.upsert;
  }
}

export async function lookupLocalEmailIndex(
  emailHash: string
): Promise<EmailIndexEntry | null> {
  const registry = await loadMockRegistry();
  const indexed = registry.emailIndex[emailHash];
  if (indexed) return indexed;

  // Fallback when index was lost (stale registry save) — scan linked profiles.
  for (const user of Object.values(registry.users)) {
    if (!user.businessEmail?.trim()) continue;
    const hash =
      user.emailHash ?? hashEmail(normalizeEmail(user.businessEmail));
    if (hash !== emailHash) continue;
    return (
      emailIndexEntryForUser(user) ?? {
        emailHash: hash,
        userId: user.uid,
        ueid: user.ueid,
        status: user.status ?? "active",
        emailStatus: user.emailStatus ?? "unverified",
        linkedAt: user.emailLinkedAt ?? user.updatedAt,
        verifiedAt: user.emailVerifiedAt ?? null,
      }
    );
  }
  return null;
}

export async function commitLocalEmailIndexOps(ops: {
  upsert?: EmailIndexEntry;
  removeHash?: string | null;
}): Promise<void> {
  const registry = await loadMockRegistry();
  commitLocalEmailIndexOpsInRegistry(registry, ops);
  await saveMockRegistry(registry);
}

export async function removeLocalEmailIndexForUser(user: {
  emailHash?: string | null;
}): Promise<void> {
  if (!user.emailHash) return;
  await commitLocalEmailIndexOps({ removeHash: user.emailHash });
}

export async function retireLocalEmailIndex(emailHash: string): Promise<void> {
  const registry = await loadMockRegistry();
  const entry = registry.emailIndex[emailHash];
  if (!entry) return;
  registry.emailIndex[emailHash] = {
    ...entry,
    status: "deleted",
    emailStatus: "unverified",
    verifiedAt: null,
  };
  await saveMockRegistry(registry);
}
