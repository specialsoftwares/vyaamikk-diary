import assert from "node:assert/strict";

import { MATERIAL_MOVEMENT_GRIN_OPTION } from "./composerOptions";
import {
  legacyBasicReceivedComposerDestination,
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
  // Disabled: composer destinations including basic received; no GRIN routes.
  const off = materialMovementDestinations({ goodsEvidenceEnabled: false });
  assert.equal(off.some((d) => d.kind === "grin_create"), false);
  assert.equal(off.some((d) => d.kind === "grin_return_select"), false);
  const received = off.find((d) => d.kind === "composer" && d.movementKind === "received");
  assert.ok(received && received.kind === "composer");
  assert.equal(received.entryType, "material_received");
  assert.equal(received.pathname, "/(app)/composer/[type]");
  assert.equal(materialMovementGrinDestination(false), null);

  // Enabled: unified receiving is GRIN create — basic received omitted from new-entry list.
  const on = materialMovementDestinations({ goodsEvidenceEnabled: true });
  const grin = on.find((d) => d.kind === "grin_create");
  assert.ok(grin && grin.kind === "grin_create");
  assert.equal(grin.id, MATERIAL_MOVEMENT_GRIN_OPTION.id);
  assert.equal(grin.pathname, "/(app)/grin/create");
  assert.equal(
    on.some((d) => d.kind === "composer" && d.entryType === "material_received"),
    false,
    "basic goods-received must not compete as a new-entry choice when the client GRIN flag is on"
  );
  assert.ok(on.some((d) => d.kind === "grin_return_select"));
  assert.equal(on.filter((d) => d.kind === "composer").length, 1); // sent_transport only
  assert.equal(on.length, 3);

  // Legacy deep-link / draft path still maps to basic composer type.
  const legacy = legacyBasicReceivedComposerDestination();
  assert.equal(legacy.entryType, "material_received");

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

  // Flags on + store admit: menu visible. This is NOT backend admission proof.
  process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = "1";
  process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT = "1";
  assert.equal(isGoodsEvidenceEnabled(), true);
  assert.equal(
    materialMovementDestinations({ goodsEvidenceEnabled: isGoodsEvidenceEnabled() }).some(
      (d) => d.kind === "grin_create"
    ),
    true,
    "client flag on shows GRIN menu — not a claim that Functions admitted the owner"
  );

  // Flags on but destinations helper still honors the boolean it is given —
  // callers can pass false when backend entitlement is known denied.
  assert.equal(
    materialMovementDestinations({ goodsEvidenceEnabled: false }).some((d) => d.kind === "grin_create"),
    false,
    "menu visibility follows the boolean; backend denial must clear or withhold it separately"
  );

  // Legacy basic received preserved for deep links when flag off.
  assert.equal(legacyBasicReceivedComposerDestination().entryType, "material_received");

  console.log("materialMovementDestinations.test.ts: ok");
} finally {
  restore();
}
