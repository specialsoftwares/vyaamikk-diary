import "./matrix.ids.test";
import "./scenarios/cs01-offline-restart-reconnect.test";
import "./scenarios/cs02-upload-link-recovery.test";
import "./scenarios/cs03-account-change.test";
import "./scenarios/cs04-concurrent-serials.test";
import "./scenarios/cs05-amendment-conflict.test";
import "./scenarios/cs06-partial-return.test";
import "./scenarios/cs07-tampered-evidence-pack.test";
import "./scenarios/cs08-ewb-cancellation.test";
import "./scenarios/cs09-missing-2b-supplier.test";
import "./scenarios/cs10-replay-after-commit.test";
import "./scenarios/cs11-existing-product.test";
import "./security/security.rows.test";
import "./slices/g1-g6-and-regression.test";
import "./device/pending.rows.test";

console.log(
  "grin-acceptance runIds: matrix ID presence only; not CS-01…CS-11 workflow evidence (see runWorkflows.ts / WAVE2_ER45.md)"
);
