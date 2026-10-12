/**
 * QA reproduction (Agent 5): GRIN return "resumed plan ends confirmed → Save
 * creates a second return with the same quantities".
 *
 * Scenario (user-faithful):
 *  1. Receipt with two lines is registered and confirmed (INJECTED G1 server).
 *  2. User opens the return screen, picks line_1=5 and line_2=3, taps Save.
 *     The first dispatchReturn mutate never answers (network hang). The app is
 *     killed while awaiting confirmation: plan persisted with line_1 queued,
 *     line_2 pending_submit. (Modelled as: abandon the pending promise, retire
 *     the owner session, start a new session generation, clear in-memory
 *     flights, remount the screen.)
 *  3. On remount the screen restores reason/quantities, adopts plan.intentId and
 *     calls repo.continueReturnPlan, which confirms both lines, clears the plan,
 *     and the screen mints a fresh intent while the form stays populated.
 *  4. User taps Save on the populated form → second return with identical
 *     quantities is queued and confirmed. Nothing warns.
 *
 * Evidence: MOUNTED_INERT + SQLITE_HOST + INJECTED (real in-memory G1 adapter
 * through the production app binding / outbox). Durable rows in
 * grin_outbox_commands and server-side return_dispatched events are counted.
 *
 * Setup drain: the registerGoodsReceipt command is confirmed via the live
 * outbox's dispatchDue (production has no register worker on this base; the
 * return path's own driveReturnConfirmation is the only production caller).
 * Returns themselves are NOT test-drained — they go through the screen → repo.
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
import { loadReturnPlan } from "@/services/grin/repository/grinReturnPlan";
import {
  getGrinApplicationRepository,
  resetGrinApplicationRepositoryForTests,
  resetGrinMutationFlightForTests,
  retireGrinOwnerSession,
  setGrinApplicationDbFactoryForTests,
  setGrinEvidencePortFactoryForTests,
  setGrinServerPortFactoryForTests,
  startGrinOwnerSession,
} from "@/services/grin/repository";
import { createUninjectedGrinEvidencePort } from "@/services/grin/repository/uninjectedServer";
import { lightColors } from "@/theme/palettes";

import { GrinReturnAdmittedBody } from "@/screens/grin/GrinReturnAdmittedBody";
import { installGrinScreenRuntime } from "@/screens/grin/grinScreenHooks";
import { installGrinSurfaces, type GrinSurfaces } from "@/screens/grin/grinSurfaces";

import { createInjectedStore, seedInjectedOwner } from "../goods-evidence-emulator/injectedStore";
import type { G1Clock } from "../goods-evidence-emulator/types";
import { INJECTED_PORT, createInjectedGrinServerPort } from "../grin-interop/injectedG1ServerPort";

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0, 0);
const OWNER = "owner_qa_a5_return";
const LEDGER = GRIN_APPLICATION_LEDGER_ID;
const RECEIPT = "grcp_qa_a5_return_1";

type Harness = {
  fields: Map<string, (value: string) => void>;
  presses: Map<string, () => void>;
  values: Map<string, string>;
  buttonDisabled: Map<string, boolean>;
  banners: string[];
  texts: string[];
  backCalls: number;
};

function clock(nowMs: number): G1Clock {
  let seq = 0;
  return { nowMs: () => nowMs, uuid: () => `evtqa${String(++seq).padStart(8, "0")}` };
}

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
  const Text = (props: Record<string, unknown> & { children?: React.ReactNode }) => {
    if (typeof props.children === "string") h.texts.push(props.children);
    return React.createElement("span", null, props.children);
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
      back: () => {
        h.backCalls += 1;
      },
      push: () => undefined,
      replace: () => undefined,
    }),
    useLocalSearchParams: <T extends Record<string, string | undefined>>() =>
      ({ receiptId: RECEIPT }) as unknown as T,
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

type ReturnRow = { command_id: string; local_state: string; frozen_payload_json: string };

function returnRows(db: HostSqlite): ReturnRow[] {
  return db.getAllSync<ReturnRow>(
    `SELECT command_id, local_state, frozen_payload_json
       FROM grin_outbox_commands
      WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ? AND command_type = 'dispatchReturn'
      ORDER BY created_at ASC, command_id ASC`,
    [OWNER, LEDGER, RECEIPT]
  );
}

function rowQty(row: ReturnRow): string {
  const body = JSON.parse(row.frozen_payload_json) as { lineId: string; returnQty: { value: string; unit: string } };
  return `${body.lineId}=${body.returnQty.value} ${body.returnQty.unit}`;
}

function resetHarness(h: Harness): void {
  h.fields.clear();
  h.presses.clear();
  h.values.clear();
  h.buttonDisabled.clear();
  h.banners.length = 0;
  h.texts.length = 0;
}

async function settle(): Promise<void> {
  // Let the async continueReturnPlan / dispatchReturnSequence chains run to completion.
  for (let i = 0; i < 50; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

async function main(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-qa-a5-return-"));
  const dbPath = path.join(tmp, "grin.sqlite");
  let db: HostSqlite | null = null;
  let root: Root | null = null;
  resetGrinMutationFlightForTests();

  const store = createInjectedStore();
  seedInjectedOwner(store, OWNER, LEDGER);
  const server = await createInjectedGrinServerPort({ store, clock: clock(NOW) });
  assert.equal(server.portKind, "INJECTED");

  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log("EVIDENCE=MOUNTED_INERT+SQLITE_HOST+INJECTED");
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log(`PORT_KIND=${INJECTED_PORT} (${server.portSource})`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

    setGrinApplicationDbFactoryForTests(() => db as HostSqlite);
    setGrinServerPortFactoryForTests(() => server);
    setGrinEvidencePortFactoryForTests(() => createUninjectedGrinEvidencePort());

    // --- Session 1: register and confirm a two-line receipt.
    let session = startGrinOwnerSession(OWNER);
    let repo = getGrinApplicationRepository(OWNER, session.dispatchGeneration);
    repo.createQueued(
      sampleRegisterBody({
        receiptId: RECEIPT,
        lines: [
          sampleLine({ lineId: "line_1", physicallyReceived: quantity("40", "bags") }),
          sampleLine({ lineId: "line_2", description: "Yarn cones", physicallyReceived: quantity("20", "bags") }),
        ],
      })
    );
    // Setup drain (registration only). See header note.
    const liveOutbox = (repo as unknown as { outbox: GrinOutbox }).outbox;
    const reg = await liveOutbox.dispatchDue(session, "qa_setup_register");
    assert.equal(reg.results.some((r) => r.localState === "issued" && !r.skipped), true);
    const eligibility = repo.returnEligibility(RECEIPT);
    assert.equal(eligibility.ok, true, `receipt must be return-eligible: ${eligibility.reason}`);
    assert.equal(repo.confirmedProjection(RECEIPT)?.eventVersion, 1);

    const h: Harness = {
      fields: new Map(),
      presses: new Map(),
      values: new Map(),
      buttonDisabled: new Map(),
      banners: [],
      texts: [],
      backCalls: 0,
    };
    installInertSurfaces(h);
    const container = createMountContainer();

    // --- Step 2: user fills the return and taps Save; the network hangs on the first mutate.
    let hangs = 0;
    const originalMutate = server.mutate!.bind(server);
    server.mutate = (async (input) => {
      if (hangs === 0 && input.envelope.type === "dispatchReturn") {
        hangs += 1;
        return new Promise(() => undefined); // never answers
      }
      return originalMutate(input);
    }) as typeof server.mutate;

    root = createRoot(container);
    await act(async () => {
      root!.render(React.createElement(GrinReturnAdmittedBody, { session }));
    });
    assert.equal(h.buttonDisabled.get("common.save"), false, "Save enabled on an eligible receipt");
    await act(async () => {
      h.fields.get("grin.field.reason")!("damaged on arrival");
      h.fields.get("grin.returnQty")!("5");
    });
    await act(async () => {
      h.presses.get("common.add")!(); // the last rendered "add" belongs to line_2
    });
    await act(async () => {
      h.fields.get("grin.returnPickLineQty")!("3");
    });
    assert.equal(h.values.get("grin.returnQty"), "5");
    assert.equal(h.values.get("grin.returnPickLineQty"), "3");

    await act(async () => {
      h.presses.get("common.save")!();
      await settle();
    });
    assert.equal(hangs, 1, "first dispatchReturn mutate is hanging");
    const planAfterKill = loadReturnPlan(db, OWNER, LEDGER, RECEIPT);
    assert.ok(planAfterKill, "plan persisted before confirmation");
    const firstIntent = planAfterKill.intentId;
    assert.deepEqual(
      planAfterKill.lines.map((l) => [l.lineId, l.status]),
      [
        ["line_1", "queued"],
        ["line_2", "pending_submit"],
      ],
      "persisted state at the moment of interruption"
    );
    const cmdL1 = planAfterKill.lines[0]!.commandId;
    const cmdL2 = planAfterKill.lines[1]!.commandId;
    const rowsAtKill = returnRows(db);
    assert.equal(rowsAtKill.length, 1, "one durable dispatchReturn command (line_1) at interruption");
    console.log(`AT_INTERRUPTION return_rows=${rowsAtKill.length} intent=${firstIntent}`);

    // --- "App killed": abandon the pending promise, drop the screen, new process state.
    await act(async () => {
      root!.unmount();
    });
    root = null;
    server.mutate = originalMutate; // network is back on relaunch
    const generation1 = session.dispatchGeneration;
    retireGrinOwnerSession();
    resetGrinMutationFlightForTests(); // in-memory flight map does not survive a process restart
    session = startGrinOwnerSession(OWNER);
    repo = getGrinApplicationRepository(OWNER, session.dispatchGeneration);
    assert.ok(session.dispatchGeneration > generation1, "relaunch runs under a new dispatch generation");

    // --- Step 3: user reopens the return screen for this receipt.
    resetHarness(h);
    root = createRoot(container);
    await act(async () => {
      root!.render(React.createElement(GrinReturnAdmittedBody, { session }));
    });
    // Synchronous restore observed before continueReturnPlan resolves:
    assert.equal(h.values.get("grin.field.reason"), "damaged on arrival", "reason restored from plan");
    assert.equal(h.values.get("grin.returnQty"), "5", "line_1 qty restored from plan");
    assert.equal(h.values.get("grin.returnPickLineQty"), "3", "line_2 qty restored from plan");
    assert.equal(h.banners.includes("grin.returnResuming"), true, "resuming banner shown");

    await act(async () => {
      await settle();
    });
    // Snapshot the current UI after the resumed plan settled (fresh render pass).
    resetHarness(h);
    await act(async () => {
      root!.render(React.createElement(GrinReturnAdmittedBody, { session }));
    });
    const rowsAfterResume = returnRows(db);
    console.log(
      `AFTER_RESUME return_rows=${rowsAfterResume.length} states=${rowsAfterResume.map((r) => r.local_state).join(",")}`
    );
    assert.equal(rowsAfterResume.length, 2, "continueReturnPlan queued line_2 and kept line_1");
    assert.deepEqual(
      rowsAfterResume.map((r) => r.command_id),
      [cmdL1, cmdL2],
      "command identities preserved across the restart"
    );
    assert.equal(rowsAfterResume.every((r) => r.local_state === "issued"), true, "both lines confirmed by the server");
    assert.equal(loadReturnPlan(db, OWNER, LEDGER, RECEIPT), null, "plan cleared after full confirmation");
    assert.equal(repo.confirmedProjection(RECEIPT)?.eventVersion, 3);

    // Screen state after the resumed plan completed:
    assert.equal(h.banners.includes("grin.returnResuming"), false, "resuming banner gone");
    assert.equal(h.texts.filter((s) => s === "grin.returnStatus.confirmed").length, 2, "both lines show confirmed");
    assert.equal(h.values.get("grin.field.reason"), "damaged on arrival", "form STILL populated");
    assert.equal(h.values.get("grin.returnQty"), "5", "form STILL populated");
    assert.equal(h.values.get("grin.returnPickLineQty"), "3", "form STILL populated");
    assert.equal(h.buttonDisabled.get("common.save"), false, "Save is enabled on the completed form");
    assert.equal(h.backCalls, 0, "screen did not navigate away after the resumed plan completed");

    // --- Step 4: user taps Save on the populated, already-confirmed form.
    h.banners.length = 0;
    await act(async () => {
      h.presses.get("common.save")!();
      await settle();
    });
    const rowsAfterSave = returnRows(db);
    console.log(`AFTER_SAVE return_rows=${rowsAfterSave.length}`);
    for (const row of rowsAfterSave) {
      console.log(`  row command_id=${row.command_id} state=${row.local_state} ${rowQty(row)}`);
    }
    const confirmed = repo.confirmedProjection(RECEIPT);
    const returnEvents = (confirmed?.events ?? []).filter((e) => e.type === "return_dispatched");
    console.log(`SERVER eventVersion=${confirmed?.eventVersion} return_dispatched_events=${returnEvents.length}`);

    assert.equal(
      rowsAfterSave.length,
      4,
      "REPRODUCED: Save after a resumed-and-confirmed plan queued a second return for every line"
    );
    assert.equal(rowsAfterSave.every((r) => r.local_state === "issued"), true, "the duplicate return was confirmed too");
    assert.deepEqual(
      rowsAfterSave.map(rowQty),
      ["line_1=5 bags", "line_2=3 bags", "line_1=5 bags", "line_2=3 bags"],
      "duplicate return carries identical quantities"
    );
    assert.equal(returnEvents.length, 4, "server now holds four return_dispatched events for one user intent");
    assert.equal(confirmed?.eventVersion, 5);
    assert.equal(h.banners.some((b) => b.startsWith("grin.err") || b === "grin.returnIntentOpen"), false, "no error shown");
    assert.equal(h.backCalls, 1, "screen silently navigated back as if a new return had been intended");

    console.log(
      "grinReturn.resumedPlan.resubmit.mount.test.ts: DEFECT (b) REPRODUCED (MOUNTED_INERT+SQLITE_HOST+INJECTED)"
    );
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
