import { publishDomainChange } from "@/services/dataChanges/domainChanges";

/** Publish only after the credit write resolves. A thrown session error stays unpublished. */
export async function publishAfterCreditCommit<T>(
  userId: string,
  recordId: string,
  work: () => Promise<T>
): Promise<T> {
  const next = await work();
  publishDomainChange(userId, "customerCredit", { effect: "upsert", recordId });
  return next;
}
