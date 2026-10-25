/**
 * Admission against the watermark the server published.
 * A positive claim is fresh only when it equals that watermark.
 */

export type PublishedWatermark =
  | { state: "unconfigured" }
  | { state: "current"; watermark: number }
  | { state: "unavailable"; reason: string }
  | { state: "closed" };

export function decidePublishedAdmission(input: {
  sessionUid: string;
  claimUid: string;
  claim: unknown;
  published: PublishedWatermark;
  attempts: number;
}): "fresh" | "unconfigured" | "mint_once" | "stop" {
  if (input.published.state === "closed" || input.published.state === "unavailable") return "stop";
  if (input.sessionUid !== input.claimUid) return input.attempts > 0 ? "stop" : "mint_once";
  if (input.published.state === "unconfigured") return "unconfigured";
  if (input.claim === input.published.watermark) return "fresh";
  return input.attempts > 0 ? "stop" : "mint_once";
}
