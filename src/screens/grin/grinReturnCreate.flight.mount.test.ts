/**
 * Mounted production create/return handlers: synchronous flight guards and the
 * completed-form rule.
 *
 * - Immediate repeated invocation before React rerender must not double-queue.
 * - A form whose submission completed must not submit again from that mount
 *   (rerender, delayed navigation, stale callback). A new intent only comes
 *   from a fresh mount or the explicit "start new" action that clears the form.
 * - An automatically resumed return that completes stays completed; Save is a
 *   no-op until the explicit new-return action.
 *
 * Boundaries: MOUNTED_INERT (mocked native surfaces; mounted admitted bodies),
 * SQLITE_HOST, FAKE uninjected server port (never confirms; return eligibility
 * for the resumed receipt is granted by persisting a confirmed projection
 * locally). Not NATIVE_DEVICE.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createMountContainer } from "@/billing/quotaUpsell/quotaUpsellHost.fakeDom";
import { sampleLine, sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import { quantity } from "@/goodsEvidence/quantities";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import type { GrinOutbox } from "@/services/grin/outbox/outbox";
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";
import { GRIN_APPLICATION_LEDGER_ID } from "@/services/grin/repository/labels";
import { saveReturnPlan, type GrinReturnPlan } from "@/services/grin/repository/grinReturnPlan";
import {
  getGrinApplicationRepository,
  resetGrinApplicationRepositoryForTests,
  resetGrinMutationFlightForTests,
  setGrinApplicationDbFactoryForTests,
  setGrinEvidencePortFactoryForTests,
  setGrinServerPortFactoryForTests,
  retireGrinOwnerSession,
  startGrinOwnerSession,
} from "@/services/grin/repository";
import { createUninjectedGrinEvidencePort, createUninjectedGrinServerPort } from "@/services/grin/repository/uninjectedServer";
import { lightColors } from "@/theme/palettes";

import { GrinCreateAdmittedBody } from "./GrinCreateAdmittedBody";
import { GrinReturnAdmittedBody } from "./GrinReturnAdmittedBody";
import { installGrinScreenRuntime } from "./grinScreenHooks";
import { installGrinSurfaces, type GrinSurfaces } from "./grinSurfaces";

type FieldMap = Map<string, (value: string) => void>;
type PressMap = Map<string, () => void>;
type ValueMap = Map<string, string>;
type DisabledMap = Map<string, boolean>;

const RETURN_RECEIPT = "grcp_flight_ret";
const OWNER = "owner_flight";

/** Swappable router.replace so one scenario can model a navigation failure. */
let routerReplaceImpl: () => void = () => undefined;

function passthrough(tag: string) {
  return function Surface(props: Record<string, unknown> & { children?: React.ReactNode }) {
    return React.createElement(tag, { "data-surface": tag }, props.children);
  };
}

function installInertSurfaces(
  fields: FieldMap,
  presses: PressMap,
  values: ValueMap,
  banners: string[],
  disabled: DisabledMap,
  texts: string[]
): void {
  const TextField = (props: Record<string, unknown>) => {
    const key = String(props.accessibilityLabel ?? props.label ?? "");
    if (typeof props.onChangeText === "function") {
      fields.set(key, props.onChangeText as (value: string) => void);
    }
    values.set(key, String(props.value ?? ""));
    return React.createElement("input", { "data-field": key });
  };
  const Button = (props: Record<string, unknown>) => {
    const key = String(props.label ?? "");
    if (typeof props.onPress === "function") {
      presses.set(key, props.onPress as () => void);
    }
    disabled.set(key, Boolean(props.disabled));
    return React.createElement("button", { "data-press": key }, key);
  };
  const Banner = (props: Record<string, unknown>) => {
    banners.push(String(props.message ?? ""));
    return React.createElement("div", { "data-banner": String(props.message ?? "") });
  };
  const Text = (props: Record<string, unknown> & { children?: React.ReactNode }) => {
    if (typeof props.children === "string") texts.push(props.children);
    return React.createElement("span", { "data-surface": "Text" }, props.children);
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
    Text,
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
      // Navigation is inert: models router.replace / router.back being delayed
      // or failing, so the completed form stays mounted.
      back: () => undefined,
      push: () => undefined,
      replace: () => routerReplaceImpl(),
    }),
    useLocalSearchParams: <T extends Record<string, string | undefined>>() =>
      ({ receiptId: RETURN_RECEIPT }) as unknown as T,
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

function countCommands(db: HostSqlite, ownerUid: string, commandType?: string, receiptId?: string): number {
  const clauses = ["owner_uid = ?"];
  const params: string[] = [ownerUid];
  if (commandType) {
    clauses.push("command_type = ?");
    params.push(commandType);
  }
  if (receiptId) {
    clauses.push("receipt_id = ?");
    params.push(receiptId);
  }
  return db.getAllSync<{ command_id: string }>(
    `SELECT command_id FROM grin_outbox_commands WHERE ${clauses.join(" AND ")}`,
    params
  ).length;
}

/** Seed an outbox row in local_state 'issued' so continueReturnPlan reconciles the plan line to confirmed. */
function seedIssuedReturnCommand(db: HostSqlite, commandId: string, lineId: string, qty: string): void {
  const now = Date.now();
  db.runSync(
    `INSERT INTO grin_outbox_commands (
       id, owner_uid, ledger_id, command_id, receipt_id, command_type, digest, frozen_payload_json,
       local_state, attempt_count, max_attempts, dispatch_generation, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'dispatchReturn', ?, ?, 'issued', 1, 5, 1, ?, ?)`,
    [
      `${OWNER}:${GRIN_APPLICATION_LEDGER_ID}:${commandId}`,
      OWNER,
      GRIN_APPLICATION_LEDGER_ID,
      commandId,
      RETURN_RECEIPT,
      "f".repeat(64),
      JSON.stringify({
        type: "dispatchReturn",
        body: { receiptId: RETURN_RECEIPT, lineId, returnQty: { value: qty, unit: "bags" }, reason: "saved damage" },
      }),
      now,
      now,
    ]
  );
}

async function main(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-flight-"));
  const dbPath = path.join(tmp, "grin-flight.sqlite");
  let db: HostSqlite | null = null;
  let root: Root | null = null;
  resetGrinMutationFlightForTests();

  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log("MOUNTED_INERT=react-dom createRoot over inert surfaces (not a device)");
    console.log("SERVER_PORT=FAKE uninjected (never confirms)");
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

    setGrinApplicationDbFactoryForTests(() => db as HostSqlite);
    setGrinServerPortFactoryForTests(() => createUninjectedGrinServerPort());
    setGrinEvidencePortFactoryForTests(() => createUninjectedGrinEvidencePort());

    const session = startGrinOwnerSession(OWNER);
    const repo = getGrinApplicationRepository(OWNER, session.dispatchGeneration);

    const fields: FieldMap = new Map();
    const presses: PressMap = new Map();
    const values: ValueMap = new Map();
    const banners: string[] = [];
    const disabled: DisabledMap = new Map();
    const texts: string[] = [];
    installInertSurfaces(fields, presses, values, banners, disabled, texts);
    const container = createMountContainer();
    root = createRoot(container);

    const registers = () => countCommands(db!, OWNER, "registerGoodsReceipt");

    // ---------------------------------------------------------------- create
    await act(async () => {
      root!.render(React.createElement(GrinCreateAdmittedBody, { session }));
    });
    await act(async () => {
      fields.get("grin.field.supplierName")!("Flight Supplier");
      fields.get("grin.field.material")!("Cotton");
    });
    const createSave = presses.get("grin.saveAction");
    assert.ok(createSave);
    assert.equal(registers(), 0);
    routerReplaceImpl = () => {
      throw new Error("navigation_failed");
    };

    // Immediate double-press before rerender.
    await act(() => {
      createSave();
      createSave();
    });
    assert.equal(registers(), 1, "sync flight must block immediate duplicate create");
    assert.equal(banners.includes("grin.errSave"), false, "a queued receipt must not be reported as a save failure when navigation throws");
    assert.equal(banners.includes("grin.createCompleted"), true, "navigation failure still leaves the form completed");
    routerReplaceImpl = () => undefined;

    // Rerender + microtask on the SAME mount: the re-created Save callback must not submit.
    await act(async () => {
      await Promise.resolve();
    });
    const createSaveAfterComplete = presses.get("grin.saveAction");
    assert.ok(createSaveAfterComplete);
    await act(() => {
      createSaveAfterComplete();
    });
    assert.equal(registers(), 1, "a completed create form must not submit again from the same mount");
    assert.equal(disabled.get("grin.saveAction"), true, "completed create form must disable Save");
    assert.equal(banners.includes("grin.createCompleted"), true, "completed create must be visible");
    await act(() => {
      createSave();
    });
    assert.equal(registers(), 1, "the completed first callback must not duplicate");

    // Explicit "start new receipt" clears the form and arms a new intent.
    const createStartNew = presses.get("grin.createStartNew");
    assert.ok(createStartNew, "completed create form must offer an explicit new-receipt action");
    await act(() => {
      createStartNew();
    });
    assert.equal(values.get("grin.field.supplierName"), "", "new receipt must clear supplier");
    assert.equal(values.get("grin.field.material"), "", "new receipt must clear material");
    assert.equal(disabled.get("grin.saveAction"), false);
    const createSaveEmpty = presses.get("grin.saveAction");
    assert.ok(createSaveEmpty);
    await act(() => {
      createSaveEmpty();
    });
    assert.equal(registers(), 1, "an empty reset form must not submit");
    await act(async () => {
      fields.get("grin.field.supplierName")!("Second Supplier");
      fields.get("grin.field.material")!("Jute");
    });
    const createSaveSecond = presses.get("grin.saveAction");
    assert.ok(createSaveSecond);
    await act(() => {
      createSaveSecond();
      createSaveSecond();
    });
    assert.equal(registers(), 2, "an explicit new receipt must create exactly one more command");
    await act(() => {
      createSave();
      createSaveAfterComplete();
    });
    assert.equal(registers(), 2, "old completed callbacks must stay inert");

    // Fresh mount: a new intent, a new receipt.
    fields.clear();
    presses.clear();
    values.clear();
    banners.length = 0;
    await act(async () => {
      root!.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root!.render(React.createElement(GrinCreateAdmittedBody, { session }));
    });
    assert.equal(banners.includes("grin.createCompleted"), false, "fresh mount starts clean");
    await act(async () => {
      fields.get("grin.field.supplierName")!("Third Supplier");
      fields.get("grin.field.material")!("Wool");
    });
    const createSaveFresh = presses.get("grin.saveAction");
    assert.ok(createSaveFresh);
    await act(() => {
      createSaveFresh();
    });
    assert.equal(registers(), 3, "a fresh mount must create a new receipt");
    await act(() => {
      createSave();
      createSaveSecond();
    });
    assert.equal(registers(), 3, "old completed callbacks must stay inert after remount");

    // ---------------------------------------------------------------- return
    // Return rapid submit against an unconfirmed receipt — flight still binds.
    resetGrinMutationFlightForTests();
    repo.createQueued(
      sampleRegisterBody({
        receiptId: RETURN_RECEIPT,
        lines: [
          sampleLine({ lineId: "line_1", physicallyReceived: quantity("10", "bags") }),
          sampleLine({ lineId: "line_2", physicallyReceived: quantity("10", "bags") }),
        ],
      })
    );

    fields.clear();
    presses.clear();
    values.clear();
    banners.length = 0;
    await act(async () => {
      root!.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root!.render(React.createElement(GrinReturnAdmittedBody, { session }));
    });
    // Unconfirmed receipt: save should not mint commands via sequence ineligibility.
    await act(async () => {
      fields.get("grin.field.reason")?.("reason");
      fields.get("grin.returnQty")?.("1");
    });
    const returnSaveUnconfirmed = presses.get("common.save");
    assert.ok(returnSaveUnconfirmed);
    const seqIntents: string[] = [];
    let lastSeq: Promise<GrinReturnPlan> | null = null;
    const originalSeq = repo.dispatchReturnSequence.bind(repo);
    repo.dispatchReturnSequence = ((input) => {
      seqIntents.push(input.intentId);
      lastSeq = originalSeq(input);
      return lastSeq;
    }) as typeof repo.dispatchReturnSequence;
    await act(async () => {
      returnSaveUnconfirmed();
      returnSaveUnconfirmed();
      await Promise.resolve();
      await Promise.resolve();
      if (lastSeq) await (lastSeq as Promise<GrinReturnPlan>).catch(() => undefined);
    });
    // Unconfirmed receipt fails eligibility inside sequence; flight still prevents overlapping owners.
    assert.ok(seqIntents.length >= 1);
    assert.equal(
      countCommands(db!, OWNER, "dispatchReturn", RETURN_RECEIPT),
      0,
      "ineligible unconfirmed return must not write dispatchReturn commands"
    );

    // Grant eligibility locally: a confirmed projection (v1) for the receipt.
    // The FAKE port never confirms anything, so this is the only way the screen
    // can reach dispatchReturn in this harness.
    const outbox = (repo as unknown as { outbox: GrinOutbox }).outbox;
    const returnRecord = repo.get(RETURN_RECEIPT);
    assert.ok(returnRecord);
    outbox.persistConfirmedProjection(session, {
      receiptId: RETURN_RECEIPT,
      eventVersion: 1,
      headHash: "a".repeat(64),
      original: returnRecord.effective,
      events: [],
      effective: returnRecord.effective,
    });
    assert.equal(repo.returnEligibility(RETURN_RECEIPT).ok, true);

    // Saved plan whose commands are already issued → continueReturnPlan reconciles to confirmed.
    const now = new Date().toISOString();
    seedIssuedReturnCommand(db!, "gcmd_restore_line_1", "line_1", "4");
    seedIssuedReturnCommand(db!, "gcmd_restore_line_2", "line_2", "2");
    saveReturnPlan(db!, {
      planId: "grp_restore_screen",
      intentId: "gint_restore_screen",
      ownerUid: OWNER,
      ledgerId: GRIN_APPLICATION_LEDGER_ID,
      receiptId: RETURN_RECEIPT,
      reason: "saved damage",
      lines: [
        {
          lineId: "line_1",
          returnQty: quantity("4", "bags"),
          commandId: "gcmd_restore_line_1",
          status: "awaiting_confirmation",
          lastError: null,
        },
        {
          lineId: "line_2",
          returnQty: quantity("2", "bags"),
          commandId: "gcmd_restore_line_2",
          status: "pending_submit",
          lastError: null,
        },
      ],
      createdAtUtc: now,
      updatedAtUtc: now,
    });
    const returnRowsSeeded = countCommands(db!, OWNER, "dispatchReturn", RETURN_RECEIPT);
    assert.equal(returnRowsSeeded, 2);

    let lastContinue: Promise<GrinReturnPlan | null> | null = null;
    const originalContinue = repo.continueReturnPlan.bind(repo);
    repo.continueReturnPlan = ((receiptId) => {
      lastContinue = originalContinue(receiptId);
      return lastContinue;
    }) as typeof repo.continueReturnPlan;

    fields.clear();
    presses.clear();
    values.clear();
    banners.length = 0;
    seqIntents.length = 0;
    resetGrinMutationFlightForTests();
    await act(async () => {
      root!.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root!.render(React.createElement(GrinReturnAdmittedBody, { session }));
    });
    assert.equal(values.get("grin.field.reason"), "saved damage");
    assert.equal(values.get("grin.returnQty"), "4");
    assert.equal(values.get("grin.returnPickLineQty"), "2");
    assert.equal(banners.includes("grin.returnResuming"), true, "resume must be visibly distinct");
    assert.ok(lastContinue, "mount must resume the saved plan");

    // Let the automatic resume complete (both lines reconcile to confirmed).
    await act(async () => {
      const continued = await lastContinue!;
      assert.ok(continued);
      assert.equal(continued.lines.every((line) => line.status === "confirmed"), true);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Save on the completed (resumed) intent must not create a new return —
    // reason and quantities are still populated, so a re-armed intent would
    // silently duplicate the return.
    const returnSaveCompleted = presses.get("common.save");
    assert.ok(returnSaveCompleted);
    await act(async () => {
      returnSaveCompleted();
      await Promise.resolve();
      await Promise.resolve();
      if (lastSeq) await (lastSeq as Promise<GrinReturnPlan>).catch(() => undefined);
    });
    assert.equal(
      countCommands(db!, OWNER, "dispatchReturn", RETURN_RECEIPT),
      returnRowsSeeded,
      "a completed resumed return must not write a second return"
    );
    assert.deepEqual(seqIntents, [], "a completed resumed return must not dispatch again");

    // Fresh props object forces a re-render (same element identity would bail out),
    // so banners/texts reflect the latest render only.
    banners.length = 0;
    texts.length = 0;
    await act(async () => {
      root!.render(React.createElement(GrinReturnAdmittedBody, { session }));
    });
    assert.equal(banners.includes("grin.returnCompleted"), true, "completed resume must be visible");
    assert.equal(banners.includes("grin.returnResuming"), false, "completed is distinct from resuming");
    assert.equal(disabled.get("common.save"), true, "completed return must disable Save");
    assert.equal(
      texts.filter((text) => text === "grin.returnStatus.confirmed").length,
      2,
      "per-line confirmed statuses must stay visible after completion"
    );
    assert.equal(values.get("grin.field.reason"), "saved damage", "completed form keeps its content visible");
    assert.equal(values.get("grin.returnQty"), "4");

    // The seeded projection has no return events. Starting another return must
    // not treat the completed plan as a confirmed balance.
    const returnStartNew = presses.get("grin.returnStartNew");
    assert.ok(returnStartNew, "completed return must offer an explicit new-return action");
    banners.length = 0;
    await act(() => {
      returnStartNew();
    });
    assert.equal(values.get("grin.field.reason"), "saved damage", "a stale projection must not clear the completed form");
    assert.equal(disabled.get("common.save"), true, "Save stays closed when the confirmed balance cannot be reloaded");
    assert.equal(banners.includes("grin.returnAvailabilityUnavailable"), true);
    assert.equal(
      countCommands(db!, OWNER, "dispatchReturn", RETURN_RECEIPT),
      returnRowsSeeded,
      "a refused new-return must not write a command"
    );

    // Once the projection actually contains those return quantities, the explicit
    // action reloads it, clears the form, and mints a new intent.
    outbox.persistConfirmedProjection(session, {
      receiptId: RETURN_RECEIPT,
      eventVersion: 2,
      headHash: "d".repeat(64),
      original: returnRecord.effective,
      events: [
        {
          schemaVersion: 1,
          eventId: "evt_line_1",
          receiptId: RETURN_RECEIPT,
          streamSequence: 2,
          type: "return_dispatched",
          actorUid: OWNER,
          serverAcceptedAtUtc: now,
          clientObservedAtUtc: now,
          reason: "saved damage",
          expectedPreviousVersion: 1,
          typedChanges: { lineId: "line_1", returnQty: { value: "4", unit: "bags" } },
          previousHash: null,
          eventHash: "b".repeat(64),
          firestoreCommitTime: null,
        },
        {
          schemaVersion: 1,
          eventId: "evt_line_2",
          receiptId: RETURN_RECEIPT,
          streamSequence: 3,
          type: "return_dispatched",
          actorUid: OWNER,
          serverAcceptedAtUtc: now,
          clientObservedAtUtc: now,
          reason: "saved damage",
          expectedPreviousVersion: 2,
          typedChanges: { lineId: "line_2", returnQty: { value: "2", unit: "bags" } },
          previousHash: null,
          eventHash: "c".repeat(64),
          firestoreCommitTime: null,
        },
      ] as never,
      effective: returnRecord.effective,
    });
    const returnRetry = presses.get("grin.returnAvailabilityRetry");
    assert.ok(returnRetry, "an unavailable confirmed balance must offer a retry");
    banners.length = 0;
    values.clear();
    await act(() => {
      returnRetry();
    });
    assert.equal(values.get("grin.field.reason"), "", "new return must clear reason");
    assert.equal(values.get("grin.returnQty") ?? "", "", "new return must clear primary quantity");
    assert.equal(values.has("grin.returnPickLineQty"), false, "new return must clear secondary line selection");
    assert.equal(banners.includes("grin.returnCompleted"), false);
    assert.equal(banners.includes("grin.returnResuming"), false);
    assert.equal(disabled.get("common.save"), false, "Save is re-armed only by the explicit new-return action");

    // After the explicit new-return action, Save creates exactly one new command with a new intent.
    await act(async () => {
      fields.get("grin.field.reason")!("fresh return");
      fields.get("grin.returnQty")!("1");
    });
    const returnSaveNew = presses.get("common.save");
    assert.ok(returnSaveNew);
    await act(async () => {
      returnSaveNew();
      returnSaveNew();
      await Promise.resolve();
    });
    assert.ok(lastSeq, "explicit new return must dispatch");
    await act(async () => {
      await (lastSeq as Promise<GrinReturnPlan>).catch(() => undefined);
    });
    assert.equal(seqIntents.length >= 1, true);
    assert.notEqual(seqIntents[0], "gint_restore_screen", "explicit new return must use a new intent");
    assert.equal(
      countCommands(db!, OWNER, "dispatchReturn", RETURN_RECEIPT),
      returnRowsSeeded + 1,
      "explicit new return must create exactly one new dispatchReturn command"
    );
    const newReturnRow = db!.getFirstSync<{ frozen_payload_json: string }>(
      `SELECT frozen_payload_json FROM grin_outbox_commands
        WHERE owner_uid = ? AND receipt_id = ? AND command_type = 'dispatchReturn'
          AND command_id NOT IN ('gcmd_restore_line_1', 'gcmd_restore_line_2')`,
      [OWNER, RETURN_RECEIPT]
    );
    assert.ok(newReturnRow);
    assert.match(newReturnRow.frozen_payload_json, /"expectedVersion":2/, "expectedVersion is the reloaded confirmed version");

    // A stale callback still bound to the completed intent cannot submit it again:
    // the completed flight entry rejects it before any plan or command is touched.
    await act(async () => {
      returnSaveCompleted();
      await Promise.resolve();
      if (lastSeq) await (lastSeq as Promise<GrinReturnPlan>).catch(() => undefined);
    });
    assert.equal(
      countCommands(db!, OWNER, "dispatchReturn", RETURN_RECEIPT),
      returnRowsSeeded + 1,
      "a stale completed-intent callback must not write another return"
    );

    // ------------------------------------------------- owner change fencing
    const ownerRowsBeforeSwitch = countCommands(db!, OWNER);
    await act(async () => {
      retireGrinOwnerSession();
      startGrinOwnerSession("owner_flight_b");
      resetGrinMutationFlightForTests();
      createSave();
      createSaveSecond();
      createSaveFresh();
      returnSaveCompleted();
      returnSaveNew();
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.equal(
      countCommands(db!, OWNER),
      ownerRowsBeforeSwitch,
      "old callbacks after account change must not submit for the old owner"
    );
    assert.equal(countCommands(db!, "owner_flight_b"), 0, "old callbacks must not submit for the new owner");

    await act(async () => {
      root!.unmount();
    });
    root = null;
    console.log("grinReturnCreate.flight.mount.test.ts SQLITE_HOST+MOUNTED_INERT+FAKE: ok");
  } finally {
    root?.unmount();
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
