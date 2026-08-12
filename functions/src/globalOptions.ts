/**
 * Global Cloud Functions v2 resource options.
 *
 * MUST be imported before any function definition module (see index.ts).
 *
 * cpu "gcf_gen1" + concurrency 1 = gen1-equivalent fractional CPU per
 * instance (0.1667 vCPU at 256MiB). All current functions are light
 * callables (Firestore transactions, token mint, email OTP send) — a full
 * gen2 vCPU per service overruns the regional Cloud Run
 * total-CPU quota in asia-south1 (~25 services) and blocks deploys.
 */
import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({
  cpu: "gcf_gen1",
  concurrency: 1,
  // Quota "total allowable CPU per region" = Σ cpu × maxInstances.
  // Unset maxInstances defaults to 100 per service and blocks rollout.
  // 3 instances/function is ample for Internal Testing scale; raise
  // per-function later if a public rollout needs more headroom.
  maxInstances: 3,
});
