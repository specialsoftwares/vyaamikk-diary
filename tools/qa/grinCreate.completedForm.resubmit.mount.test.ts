/**
 * QA reproduction (Agent 5): GRIN create "completed form" resubmission.
 *
 * Claim under test: after a successful create, GrinCreateAdmittedBody marks the
 * intent completed, mints a fresh intent in a microtask, and calls router.replace.
 * If the screen is still mounted when the user taps Save again (navigation
 * transition pending, replace deferred/failed, or any rerender), the still-filled
 * form submits a second registerGoodsReceipt with identical content.
 *
 * Evidence: MOUNTED_INERT (inert surfaces, no RN) + SQLITE_HOST. Durable rows in
 * grin_outbox_commands are counted, not JS call counters. Router.replace is a
 * recorder that does not unmount the screen (models a delayed navigation).
 *
 * Also records the legitimate positive claim: a FRESH mount can create a second
 * receipt (this is the behaviour the fix must preserve).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createMountContainer } from "@/billing/quotaUpsell/quotaUpsellHost.fakeDom";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";
import {
  resetGrinApplicationRepositoryForTests,
  resetGrinMutationFlightForTests,
  retireGrinOwnerSession,
  setGrinApplicationDbFactoryForTests,
  setGrinEvidencePortFactoryForTests,
  setGrinServerPortFactoryForTests,
  startGrinOwnerSession,
} from "@/services/grin/repository";
import {
  createUninjectedGrinEvidencePort,
  createUninjectedGrinServerPort,
} from "@/services/grin/repository/uninjectedServer";
import { lightColors } from "@/theme/palettes";

import { GrinCreateAdmittedBody } from "@/screens/grin/GrinCreateAdmittedBody";
import { installGrinScreenRuntime } from "@/screens/grin/grinScreenHooks";
import { installGrinSurfaces, type GrinSurfaces } from "@/screens/grin/grinSurfaces";

const OWNER = "owner_qa_a5_create";

type Harness = {
  fields: Map<string, (value: string) => void>;
  presses: Map<string, () => void>;
  values: Map<string, string>;
  buttonDisabled: Map<string, boolean>;
  banners: string[];
  replaceCalls: { pathname: string; receiptId: string | undefined }[];
};

function passthrough(tag: string) {
  return function Surface(props: Record<string, unknown> & { children?: React.ReactNode }) {
    return React.createElement(tag, { "data-surface": tag }, props.children);
  };
}

function installInertSurfaces(h: Harness): void {
  const TextField = (props: Record<string, unknown>) => {
    const key = String(props.accessibilityLabel ?? props.label ?? "");
    if (typeof props.onChangeText === "function") {
      h.fields.set(key, props.onChangeText as (value: string) => void);
    }
    h.values.set(key, String(props.value ?? ""));
    return React.createElement("input", { "data-field": key });
  };
  const Button = (props: Record<string, unknown>) => {
    const key = String(props.label ?? "");
    if (typeof props.onPress === "function") {
      h.presses.set(key, props.onPress as () => void);
    }
    h.buttonDisabled.set(key, Boolean(props.disabled));
    return React.createElement("button", { "data-press": key }, key);
  };
  const Banner = (props: Record<string, unknown>) => {
    h.banners.push(String(props.message ?? ""));
    return React.createElement("div", { "data-banner": String(props.message ?? "") });
  };
  const surfaces: GrinSurfaces = {
    Screen: passthrough("section"),
    Header: passthrough("header"),
    Banner,
    Button,
    FormSection: passthrough("fieldset"),
    TextField,
    SelectField: passthrough("select"),
    Card: passthrough("article"),
    EmptyState: passthrough("div"),
    View: passthrough("div"),
    Text: passthrough("span"),
    FlatList: passthrough("ul"),
    IndigoChoiceChip: passthrough("button"),
    IndigoChoiceChipRow: passthrough("div"),
    StyleSheet: { create: (styles) => styles },
    Platform: { OS: "web" },
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
  installGrinSurfaces(surfaces);
  installGrinScreenRuntime({
    useT: () => (key) => key,
    useThemedStyles: (factory) => factory(lightColors),
    useRouter: () => ({
      back: () => undefined,
      push: () => undefined,
      // Delayed navigation model: record the replace, keep the screen mounted.
      replace: (target) => {
        if (typeof target === "string") {
          h.replaceCalls.push({ pathname: target, receiptId: undefined });
        } else {
          h.replaceCalls.push({ pathname: target.pathname, receiptId: target.params?.receiptId });
        }
      },
    }),
    useLocalSearchParams: <T extends Record<string, string | undefined>>() => ({}) as unknown as T,
    useFocusEffect: (effect) => {
      React.useEffect(() => {
        const cleanup = effect();
        return typeof cleanup === "function" ? cleanup : undefined;
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
    },
    getPickerHostAppState: () => "active",
  });
}

type RegisterRow = { command_id: string; receipt_id: string; local_state: string; frozen_payload_json: string };

function registerRows(db: HostSqlite): RegisterRow[] {
  return db.getAllSync<RegisterRow>(
    `SELECT command_id, receipt_id, local_state, frozen_payload_json
       FROM grin_outbox_commands
      WHERE owner_uid = ? AND command_type = 'registerGoodsReceipt'
      ORDER BY created_at ASC, command_id ASC`,
    [OWNER]
  );
}

function contentFingerprint(row: RegisterRow): string {
  const body = JSON.parse(row.frozen_payload_json) as {
    supplier: { name: unknown };
    lines: { description: string; physicallyReceived: unknown; unit: string }[];
    remarks: unknown;
  };
  return JSON.stringify({
    supplier: body.supplier.name,
    lines: body.lines.map((l) => ({ d: l.description, q: l.physicallyReceived, u: l.unit })),
    remarks: body.remarks,
  });
}

async function main(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-qa-a5-create-"));
  const dbPath = path.join(tmp, "grin.sqlite");
  let db: HostSqlite | null = null;
  let root: Root | null = null;
  resetGrinMutationFlightForTests();

  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log("EVIDENCE=MOUNTED_INERT+SQLITE_HOST");
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

    setGrinApplicationDbFactoryForTests(() => db as HostSqlite);
    setGrinServerPortFactoryForTests(() => createUninjectedGrinServerPort());
    setGrinEvidencePortFactoryForTests(() => createUninjectedGrinEvidencePort());

    const session = startGrinOwnerSession(OWNER);

    const h: Harness = {
      fields: new Map(),
      presses: new Map(),
      values: new Map(),
      buttonDisabled: new Map(),
      banners: [],
      replaceCalls: [],
    };
    installInertSurfaces(h);
    const container = createMountContainer();
    root = createRoot(container);

    await act(async () => {
      root!.render(React.createElement(GrinCreateAdmittedBody, { session }));
    });
    await act(async () => {
      h.fields.get("grin.field.supplierName")!("QA Supplier A5");
      h.fields.get("grin.field.material")!("Cotton bales");
      h.fields.get("grin.field.receivedQty")!("40");
      h.fields.get("grin.field.remarks")!("qa completed-form resubmit");
    });
    assert.equal(registerRows(db).length, 0, "precondition: no register commands yet");

    // --- Tap 1: user saves the filled form.
    const save1 = h.presses.get("grin.saveAction");
    assert.ok(save1);
    await act(async () => {
      save1();
      await Promise.resolve(); // flush the queueMicrotask intent regeneration inside act
    });
    const afterFirst = registerRows(db);
    assert.equal(afterFirst.length, 1, "first Save must queue exactly one register command");
    assert.equal(h.replaceCalls.length, 1, "first Save must request navigation to the receipt");
    assert.equal(h.replaceCalls[0]!.receiptId, afterFirst[0]!.receipt_id);
    console.log(`AFTER_TAP1 register_rows=${afterFirst.length} replace_calls=${h.replaceCalls.length}`);

    // --- Screen still mounted (navigation pending). Microtask minted a new intent
    //     and React rerendered. Observe the form is still fully populated and Save is enabled.
    await act(async () => {
      await Promise.resolve();
    });
    assert.equal(h.values.get("grin.field.supplierName"), "QA Supplier A5", "form not cleared after create");
    assert.equal(h.values.get("grin.field.material"), "Cotton bales", "form not cleared after create");
    assert.equal(h.values.get("grin.field.receivedQty"), "40", "completed form keeps the submitted content visible");
    assert.equal(h.buttonDisabled.get("grin.saveAction"), true, "Save is disabled on the completed form");
    assert.equal(h.banners.includes("grin.createCompleted"), true, "completed banner is shown");
    const save2 = h.presses.get("grin.saveAction");
    assert.ok(save2);

    // The original closure and the rerendered Save must both refuse.
    await act(async () => {
      save1();
      await Promise.resolve();
    });
    assert.equal(registerRows(db).length, 1, "stale completed callback must not resubmit");

    h.banners.length = 0;
    await act(async () => {
      save2();
      await Promise.resolve();
    });
    const afterSecond = registerRows(db);
    console.log(`AFTER_TAP2 register_rows=${afterSecond.length} replace_calls=${h.replaceCalls.length}`);
    assert.equal(afterSecond.length, 1, "second Save on the still-mounted completed form must not queue another receipt");
    assert.equal(h.replaceCalls.length, 1, "the second Save must not navigate again");
    assert.equal(h.banners.includes("grin.errSave"), false, "a queued receipt must not be reported as a save failure");

    // --- Positive claim that any fix must preserve: a FRESH mount creates a new receipt.
    await act(async () => {
      root!.unmount();
    });
    h.fields.clear();
    h.presses.clear();
    h.values.clear();
    h.buttonDisabled.clear();
    h.banners.length = 0;
    root = createRoot(container);
    await act(async () => {
      root!.render(React.createElement(GrinCreateAdmittedBody, { session }));
    });
    assert.equal(h.values.get("grin.field.supplierName"), "", "fresh mount starts empty");
    await act(async () => {
      h.fields.get("grin.field.supplierName")!("QA Supplier B");
      h.fields.get("grin.field.material")!("Yarn cones");
    });
    // Claim (c1) with durable rows: an immediate double-tap before rerender queues ONE command.
    const freshSave = h.presses.get("grin.saveAction")!;
    await act(async () => {
      freshSave();
      freshSave();
      await Promise.resolve();
    });
    const afterFresh = registerRows(db);
    assert.equal(afterFresh.length, 2, "fresh mount + immediate double-tap creates exactly one more receipt");
    assert.notEqual(contentFingerprint(afterFresh[1]!), contentFingerprint(afterFresh[0]!));
    console.log(`AFTER_FRESH_MOUNT_DOUBLE_TAP register_rows=${afterFresh.length}`);

    // Claim (c7) with durable rows: after an account change the old mounted callback cannot submit.
    await act(async () => {
      await Promise.resolve();
    });
    const staleSave = h.presses.get("grin.saveAction")!; // new intent, old origin session
    const totalBefore = db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM grin_outbox_commands`)!.n;
    h.banners.length = 0;
    await act(async () => {
      retireGrinOwnerSession();
      startGrinOwnerSession("owner_qa_a5_other");
      staleSave();
      await Promise.resolve();
    });
    const totalAfter = db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM grin_outbox_commands`)!.n;
    assert.equal(totalAfter, totalBefore, "owner switch: a completed callback wrote nothing for any owner");
    console.log(`OWNER_SWITCH total_rows_before=${totalBefore} after=${totalAfter}`);

    console.log("grinCreate.completedForm.resubmit.mount.test.ts: completed form stays closed (MOUNTED_INERT+SQLITE_HOST)");
  } finally {
    if (root) {
      const r = root;
      await act(async () => {
        r.unmount();
      });
    }
    db?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    resetGrinApplicationRepositoryForTests();
    resetGrinMutationFlightForTests();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
