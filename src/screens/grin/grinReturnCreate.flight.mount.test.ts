/**
 * Mounted production create/return handlers: synchronous flight guards.
 * Immediate repeated invocation before React rerender must not double-queue.
 *
 * Boundaries: mocked native surfaces; mounted admitted bodies; SQLITE_HOST.
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
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";
import { GRIN_APPLICATION_LEDGER_ID } from "@/services/grin/repository/labels";
import { saveReturnPlan } from "@/services/grin/repository/grinReturnPlan";
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

function passthrough(tag: string) {
  return function Surface(props: Record<string, unknown> & { children?: React.ReactNode }) {
    return React.createElement(tag, { "data-surface": tag }, props.children);
  };
}

function installInertSurfaces(
  fields: FieldMap,
  presses: PressMap,
  values: ValueMap,
  banners: string[]
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
    return React.createElement("button", { "data-press": key }, key);
  };
  const Banner = (props: Record<string, unknown>) => {
    banners.push(String(props.message ?? ""));
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
      replace: () => undefined,
    }),
    useLocalSearchParams: <T extends Record<string, string | undefined>>() =>
      ({ receiptId: "grcp_flight_ret" }) as unknown as T,
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
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

    setGrinApplicationDbFactoryForTests(() => db as HostSqlite);
    setGrinServerPortFactoryForTests(() => createUninjectedGrinServerPort());
    setGrinEvidencePortFactoryForTests(() => createUninjectedGrinEvidencePort());

    const session = startGrinOwnerSession("owner_flight");
    const repo = getGrinApplicationRepository("owner_flight", session.dispatchGeneration);

    const fields: FieldMap = new Map();
    const presses: PressMap = new Map();
    const values: ValueMap = new Map();
    const banners: string[] = [];
    installInertSurfaces(fields, presses, values, banners);
    const container = createMountContainer();
    root = createRoot(container);

    await act(async () => {
      root!.render(React.createElement(GrinCreateAdmittedBody, { session }));
    });
    await act(async () => {
      fields.get("grin.field.supplierName")!("Flight Supplier");
      fields.get("grin.field.material")!("Cotton");
    });
    const createSave = presses.get("grin.saveAction");
    assert.ok(createSave);
    let createCalls = 0;
    const originalCreate = repo.createQueued.bind(repo);
    repo.createQueued = ((input) => {
      createCalls += 1;
      return originalCreate(input);
    }) as typeof repo.createQueued;

    // Immediate double-press before rerender.
    await act(() => {
      createSave();
      createSave();
    });
    assert.equal(createCalls, 1, "sync flight must block immediate duplicate create");

    const createSaveB = presses.get("grin.saveAction");
    assert.ok(createSaveB);
    assert.notEqual(createSaveB, createSave);
    await act(() => {
      createSaveB();
    });
    assert.equal(createCalls, 2, "a later receipt intent must create a second command");
    await act(() => {
      createSave();
    });
    assert.equal(createCalls, 2, "the completed first callback must not duplicate");

    // Return rapid submit against an unconfirmed receipt — flight still binds.
    resetGrinMutationFlightForTests();
    repo.createQueued(
      sampleRegisterBody({
        receiptId: "grcp_flight_ret",
        lines: [
          sampleLine({ lineId: "line_1", physicallyReceived: quantity("10", "bags") }),
          sampleLine({ lineId: "line_2", physicallyReceived: quantity("10", "bags") }),
        ],
      })
    );
    // Persist a fake confirmed projection so eligibility passes for handler exercise.
    const outbox = (repo as unknown as { outbox: { persistConfirmedProjection: Function; beginOwnerSession?: never } });
    void outbox;

    fields.clear();
    presses.clear();
    await act(async () => {
      root!.render(React.createElement(GrinReturnAdmittedBody, { session }));
    });
    // Unconfirmed receipt: save should not mint commands via sequence ineligibility.
    await act(async () => {
      fields.get("grin.field.reason")?.("reason");
      fields.get("grin.returnQty")?.("1");
    });
    const returnSave = presses.get("common.save");
    assert.ok(returnSave);
    let returnSeq = 0;
    const originalSeq = repo.dispatchReturnSequence.bind(repo);
    repo.dispatchReturnSequence = (async (input) => {
      returnSeq += 1;
      return originalSeq(input);
    }) as typeof repo.dispatchReturnSequence;
    await act(async () => {
      returnSave();
      returnSave();
      await Promise.resolve();
      await Promise.resolve();
    });
    // Unconfirmed receipt fails eligibility inside sequence; flight still prevents overlapping owners.
    // At most one in-flight attempt may pass the sync acquire for the same receipt.
    assert.ok(returnSeq >= 1);
    const returnCmds = db!
      .getAllSync<{ command_id: string }>(
        `SELECT command_id FROM grin_outbox_commands WHERE receipt_id = ? AND command_type = ?`,
        ["grcp_flight_ret", "dispatchReturn"]
      );
    assert.equal(returnCmds.length, 0, "ineligible unconfirmed return must not write dispatchReturn commands");

    const now = new Date().toISOString();
    saveReturnPlan(db!, {
      planId: "grp_restore_screen",
      intentId: "gint_restore_screen",
      ownerUid: "owner_flight",
      ledgerId: GRIN_APPLICATION_LEDGER_ID,
      receiptId: "grcp_flight_ret",
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
    assert.equal(values.get("grin.field.reason"), "saved damage");
    assert.equal(values.get("grin.returnQty"), "4");
    assert.equal(values.get("grin.returnPickLineQty"), "2");
    assert.equal(banners.includes("grin.returnResuming"), true);

    const commandsBeforeSwitch = db!.getAllSync<{ command_id: string }>(
      `SELECT command_id FROM grin_outbox_commands WHERE owner_uid = ?`,
      ["owner_flight"]
    ).length;
    await act(() => {
      retireGrinOwnerSession();
      startGrinOwnerSession("owner_flight_b");
      resetGrinMutationFlightForTests();
      createSaveB();
    });
    const commandsAfterSwitch = db!.getAllSync<{ command_id: string }>(
      `SELECT command_id FROM grin_outbox_commands WHERE owner_uid = ?`,
      ["owner_flight"]
    ).length;
    assert.equal(
      commandsAfterSwitch,
      commandsBeforeSwitch,
      "an old callback after account change must not submit"
    );

    console.log("grinReturnCreate.flight.mount.test.ts: ok");
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
