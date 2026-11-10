import type { RequestClaim } from "@/components/screenState/resolveScreenState";
import type { RecentSearchRead } from "./recentSearches";

/** Production focus-read boundary; storage remains owner-scoped in recentSearches. */
export function startRecentSearchRead(input: {
  claim: RequestClaim;
  owns: (claim: RequestClaim) => boolean;
  read: (uid: string) => Promise<RecentSearchRead>;
  publish: (result: RecentSearchRead, claim: RequestClaim) => void;
  fail: (claim: RequestClaim) => void;
}): { settled: Promise<void>; dispose: () => void } {
  let active = true;
  const owns = () => active && input.owns(input.claim);
  const settled = (async () => {
    if (!owns()) return;
    try {
      const result = await input.read(input.claim.uid);
      if (owns()) input.publish(result, input.claim);
    } catch {
      if (owns()) input.fail(input.claim);
    }
  })();
  return { settled, dispose: () => { active = false; } };
}
