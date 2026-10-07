import assert from "node:assert/strict";

import { MATERIAL_MOVEMENT_GRIN_OPTION } from "./composerOptions";
import {
  materialMovementDestinations,
  materialMovementGrinDestination,
} from "./materialMovementDestinations";
import { isGoodsEvidenceEnabled } from "@/goodsEvidence/featureFlag";
import { __setRuntimeSignalsForTests } from "@/config/env";

const prevEnabled = process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
const prevAdmit = process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
const prevMode = process.env.EXPO_PUBLIC_APP_MODE;

function restore(): void {
  __setRuntimeSignalsForTests(null);
  if (prevEnabled == null) delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
  else process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = prevEnabled;
  if (prevAdmit == null) delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
  else process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT = prevAdmit;
  if (prevMode == null) delete process.env.EXPO_PUBLIC_APP_MODE;
  else process.env.EXPO_PUBLIC_APP_MODE = prevMode;
}

try {
  // Disabled: only composer destinations; basic received preserved; no GRIN route.
  const off = materialMovementDestinations({ goodsEvidenceEnabled: false });
  assert.equal(off.some((d) => d.kind === "grin_create"), false);
  const received = off.find((d) => d.kind === "composer" && d.movementKind === "received");
  assert.ok(received && received.kind === "composer");
  assert.equal(received.entryType, "material_received");
  assert.equal(received.pathname, "/(app)/composer/[type]");
  assert.equal(materialMovementGrinDestination(false), null);

  // Enabled: GRIN destination is admitted create route, not material_received.
  const on = materialMovementDestinations({ goodsEvidenceEnabled: true });
  const grin = on.find((d) => d.kind === "grin_create");
  assert.ok(grin && grin.kind === "grin_create");
  assert.equal(grin.id, MATERIAL_MOVEMENT_GRIN_OPTION.id);
  assert.equal(grin.pathname, "/(app)/grin/create");
  assert.ok(
    on.some((d) => d.kind === "composer" && d.entryType === "material_received"),
    "basic goods-received remains available alongside GRIN"
  );
  assert.equal(on.filter((d) => d.kind === "composer").length, 3);

  // Feature-flag gate: store/standalone without admit stays disabled.
  __setRuntimeSignalsForTests({
    appOwnership: "standalone",
    isDev: false,
    platform: "android",
  });
  process.env.EXPO_PUBLIC_APP_MODE = "production";
  delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
  delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
  assert.equal(isGoodsEvidenceEnabled(), false);
  assert.equal(
    materialMovementDestinations({ goodsEvidenceEnabled: isGoodsEvidenceEnabled() }).some(
      (d) => d.kind === "grin_create"
    ),
    false
  );

  process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = "1";
  process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT = "1";
  assert.equal(isGoodsEvidenceEnabled(), true);
  assert.equal(
    materialMovementDestinations({ goodsEvidenceEnabled: isGoodsEvidenceEnabled() }).some(
      (d) => d.kind === "grin_create"
    ),
    true
  );

  console.log("materialMovementDestinations.test.ts: ok");
} finally {
  restore();
}
