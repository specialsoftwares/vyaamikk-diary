/**
 * Joined UI lifecycle proof through GrinAdmittedSessionHost and the production
 * create/return bodies (the same children GrinAdmissionGate mounts).
 *
 * Account switch: the host unmounts the previous body when the owner, logout,
 * or a new login generation changes the live session. Private fields from the
 * previous account are not displayed. Captured Save / Start new / completion
 * callbacks do not write, rearm, or navigate the replacement screen.
 *
 * New return: after a confirmed return the explicit next return reloads the
 * authorized record, confirmed projection and eligibility. Displayed remaining
 * quantity and version come from that projection.
 *
 * Evidence: SQLITE_HOST + INJECTED G1 adapter + MOUNTED_INERT.
 * Not NATIVE_DEVICE. Not a live Firebase project.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createMountContainer } from "@/billing/quotaUpsell/quotaUpsellHost.fakeDom";
import { __setRuntimeSignalsForTests } from "@/config/env";
import { sampleLine, sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import { quantity } from "@/goodsEvidence/quantities";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import { GrinOutbox } from "@/services/grin/outbox/outbox";
import { SQLITE_HOST_NOT_NATIVE_DEVICE, type GrinDispatchSession } from "@/services/grin/outbox/types";
import { GRIN_APPLICATION_LEDGER_ID } from "@/services/grin/repository/labels";
import {
  getLiveGrinDispatchSession,
  requireLiveGrinApplicationRepository,
  resetGrinApplicationRepositoryForTests,
  resetGrinMutationFlightForTests,
  setGrinApplicationDbFactoryForTests,
  setGrinEvidencePortFactoryForTests,
  setGrinServerPortFactoryForTests,
} from "@/services/grin/repository";
import { createUninjectedGrinEvidencePort } from "@/services/grin/repository/uninjectedServer";
import { lightColors } from "@/theme/palettes";

import { GrinCreateAdmittedBody } from "./GrinCreateAdmittedBody";
import { GrinReturnAdmittedBody } from "./GrinReturnAdmittedBody";
import { GrinAdmittedSessionHost } from "./GrinAdmittedSessionHost";
import { installGrinScreenRuntime } from "./grinScreenHooks";
import { installGrinSurfaces, type GrinSurfaces } from "./grinSurfaces";
import { createInjectedStore, seedInjectedOwner } from "../../../tools/goods-evidence-emulator/injectedStore";
import type { G1Clock } from "../../../tools/goods-evidence-emulator/types";
import { INJECTED_PORT, createInjectedGrinServerPort } from "../../../tools/grin-interop/injectedG1ServerPort";

const OWNER_A = "owner_ui_a";
const OWNER_B = "owner_ui_b";
const SUPPLIER = "Private Supplier A";
const GSTIN = "29BBBBB0000B1Z5";
const INVOICE = "INV-PRIVATE-A";
const MATERIAL = "Secret Cotton";
const REASON = "damage reason alpha";
const SECRETS = [SUPPLIER, GSTIN, INVOICE, MATERIAL, REASON];

const prevFlag = process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
const prevAdmit = process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
const prevMode = process.env.EXPO_PUBLIC_APP_MODE;

function admitDev(): void {
  __setRuntimeSignalsForTests({ appOwnership: "expo", isDev: true, platform: "ios" });
  process.env.EXPO_PUBLIC_APP_MODE = "development";
  process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = "1";
  delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
}

function restoreEnv(): void {
  __setRuntimeSignalsForTests(null);
  if (prevFlag == null) delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
  else process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = prevFlag;
  if (prevAdmit == null) delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
  else process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT = prevAdmit;
  if (prevMode == null) delete process.env.EXPO_PUBLIC_APP_MODE;
  else process.env.EXPO_PUBLIC_APP_MODE = prevMode;
}

type FieldMap = Map<string, (value: string) => void>;
type PressMap = Map<string, () => void>;

function passthrough(tag: string) {
  return function Surface(props: { children?: React.ReactNode }) {
    return React.createElement(tag, null, props.children);
  };
}

function installInert(opts: {
  fields: FieldMap;
  presses: PressMap;
  values: Map<string, string>;
  banners: string[];
  disabled: Map<string, boolean>;
  texts: string[];
  backCalls: { n: number };
  replaceCalls: { n: number };
  receiptId: { current: string };
}): void {
  const TextField = (props: Record<string, unknown>) => {
    const key = String(props.accessibilityLabel ?? props.label ?? "");
    if (typeof props.onChangeText === "function") opts.fields.set(key, props.onChangeText as (value: string) => void);
    opts.values.set(key, String(props.value ?? ""));
    return React.createElement("input", { "data-field": key });
  };
  const Button = (props: Record<string, unknown>) => {
    const key = String(props.label ?? "");
    if (typeof props.onPress === "function") opts.presses.set(key, props.onPress as () => void);
    opts.disabled.set(key, Boolean(props.disabled));
    return React.createElement("button", null, key);
  };
  const Banner = (props: Record<string, unknown>) => {
    opts.banners.push(String(props.message ?? ""));
    return React.createElement("div", null, String(props.message ?? ""));
  };
  const Text = (props: { children?: React.ReactNode }) => {
    if (typeof props.children === "string") opts.texts.push(props.children);
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
        opts.backCalls.n += 1;
      },
      push: () => undefined,
      replace: () => {
        opts.replaceCalls.n += 1;
      },
    }),
    useLocalSearchParams: <T extends Record<string, string | undefined>>() =>
      ({ receiptId: opts.receiptId.current }) as unknown as T,
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

function countCommands(db: HostSqlite, ownerUid: string, commandType?: string): number {
  const clauses = ["owner_uid = ?"];
  const params: string[] = [ownerUid];
  if (commandType) {
    clauses.push("command_type = ?");
    params.push(commandType);
  }
  return db.getAllSync<{ command_id: string }>(
    `SELECT command_id FROM grin_outbox_commands WHERE ${clauses.join(" AND ")}`,
    params
  ).length;
}

function commandIds(db: HostSqlite, ownerUid: string, commandType: string, receiptId: string): string[] {
  return db
    .getAllSync<{ command_id: string }>(
      `SELECT command_id FROM grin_outbox_commands
        WHERE owner_uid = ? AND command_type = ? AND receipt_id = ?
        ORDER BY created_at ASC`,
      [ownerUid, commandType, receiptId]
    )
    .map((row) => row.command_id);
}

function assertSecretsHidden(label: string, values: Map<string, string>, texts: string[], banners: string[]): void {
  const blob = [...values.values(), ...texts, ...banners].join("\n");
  for (const secret of SECRETS) {
    assert.equal(blob.includes(secret), false, `${label} still displays ${secret}`);
  }
}

function interopClock(nowMs: number): G1Clock {
  let seq = 0;
  return { nowMs: () => nowMs, uuid: () => `evui${String(++seq).padStart(8, "0")}` };
}

async function main(): Promise<void> {
  const gateSrc = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "GrinAdmissionGate.tsx"), "utf8");
  const createSrc = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "GrinCreateScreen.tsx"), "utf8");
  const returnSrc = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "GrinReturnScreen.tsx"), "utf8");
  assert.match(gateSrc, /GrinAdmittedSessionHost/);
  assert.match(gateSrc, /ownerUid=\{user\?\.uid \?\? null\}/);
  assert.match(createSrc, /GrinAdmissionGate/);
  assert.match(createSrc, /GrinCreateAdmittedBody/);
  assert.match(returnSrc, /GrinAdmissionGate/);
  assert.match(returnSrc, /GrinReturnAdmittedBody/);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-ui-life-"));
  const db = openHostSqlite(path.join(tmp, "grin-ui-life.sqlite"));
  assert.equal(db.executionLabel, SQLITE_HOST);
  console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
  console.log(`PORT_KIND=${INJECTED_PORT}`);
  console.log("MOUNTED_INERT=react-dom createRoot over inert surfaces (not a device)");
  console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

  const store = createInjectedStore();
  seedInjectedOwner(store, OWNER_A, GRIN_APPLICATION_LEDGER_ID);
  seedInjectedOwner(store, OWNER_B, GRIN_APPLICATION_LEDGER_ID);
  const server = await createInjectedGrinServerPort({
    store,
    clock: interopClock(Date.UTC(2026, 9, 12, 8, 0, 0)),
  });
  assert.equal(server.portKind, "INJECTED");

  let failCode: string | null = null;
  let holdDispatch: Promise<void> | null = null;
  const originalMutate = server.mutate.bind(server);
  server.mutate = (async (input) => {
    if (input.envelope.type === "dispatchReturn") {
      if (failCode) {
        const code = failCode;
        failCode = null;
        return { ok: false, code, detail: "simulated" } as Awaited<ReturnType<typeof originalMutate>>;
      }
      if (holdDispatch) {
        const gate = holdDispatch;
        holdDispatch = null;
        await gate;
      }
    }
    return originalMutate(input);
  }) as typeof server.mutate;

  resetGrinMutationFlightForTests();
  setGrinApplicationDbFactoryForTests(() => db);
  setGrinServerPortFactoryForTests(() => server);
  setGrinEvidencePortFactoryForTests(() => createUninjectedGrinEvidencePort());
  admitDev();

  const fields: FieldMap = new Map();
  const presses: PressMap = new Map();
  const values = new Map<string, string>();
  const banners: string[] = [];
  const disabled = new Map<string, boolean>();
  const texts: string[] = [];
  const backCalls = { n: 0 };
  const replaceCalls = { n: 0 };
  const receiptId = { current: "grcp_ui_ret_resume" };
  installInert({ fields, presses, values, banners, disabled, texts, backCalls, replaceCalls, receiptId });

  const mountLog = { mounts: 0, unmounts: 0, last: null as GrinDispatchSession | null };
  let owner: string | null = OWNER_A;
  let body: "create" | "return" = "create";
  let bodyKey = 0;
  let root: Root | null = null;

  function Tracked(props: { session: GrinDispatchSession }): React.ReactElement {
    React.useEffect(() => {
      mountLog.mounts += 1;
      mountLog.last = props.session;
      return () => {
        mountLog.unmounts += 1;
      };
      // Mount identity only. A reused instance would not record a new session.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return body === "create"
      ? React.createElement(GrinCreateAdmittedBody, { session: props.session })
      : React.createElement(GrinReturnAdmittedBody, { session: props.session });
  }

  function Tree(): React.ReactElement {
    return React.createElement(GrinAdmittedSessionHost, {
      ownerUid: owner,
      renderBlocked: () => React.createElement("div", null, "blocked"),
      renderUnavailable: () => React.createElement("div", null, "unavailable"),
      children: (session: GrinDispatchSession) =>
        React.createElement(Tracked, { key: `${body}:${bodyKey}`, session }),
    });
  }

  async function renderTree(): Promise<void> {
    await act(async () => {
      root!.render(React.createElement(Tree));
    });
  }

  async function confirmReceipt(id: string, received: string): Promise<number> {
    const repo = requireLiveGrinApplicationRepository();
    const base = sampleRegisterBody();
    repo.createQueued(
      sampleRegisterBody({
        receiptId: id,
        supplier: {
          name: { kind: "present", value: SUPPLIER },
          registration: { kind: "registered", gstin: GSTIN },
          address: { kind: "not_supplied" },
          contact: { kind: "not_supplied" },
        },
        commercial: {
          ...base.commercial,
          supplierInvoiceNumber: { kind: "present", value: INVOICE },
        },
        lines: [
          sampleLine({
            lineId: "line_1",
            description: MATERIAL,
            physicallyReceived: quantity(received, "bags"),
            invoiceQuantity: quantity(received, "bags"),
            expectedOnThisDelivery: quantity(received, "bags"),
          }),
        ],
      })
    );
    const session = getLiveGrinDispatchSession();
    assert.ok(session);
    const box = new GrinOutbox({ db, server });
    const flushed = await box.dispatchDue(session, `reg-${id}`);
    assert.equal(
      flushed.results.some((row) => row.localState === "issued" && !row.skipped),
      true,
      `register ${id} must confirm through the injected adapter`
    );
    const projection = repo.confirmedProjection(id);
    assert.ok(projection);
    assert.equal(projection.eventVersion >= 1, true);
    return projection.eventVersion;
  }

  try {
    const container = createMountContainer();
    root = createRoot(container);

    // --- completed create, A switches directly to B ---
    await renderTree();
    assert.equal(mountLog.mounts, 1);
    assert.equal(mountLog.last?.ownerUid, OWNER_A);
    const genA = mountLog.last!.dispatchGeneration;
    assert.ok(genA >= 1);
    await act(async () => {
      fields.get("grin.field.supplierName")!(SUPPLIER);
      fields.get("grin.field.supplierGstin")!(GSTIN);
      fields.get("grin.field.invoiceNumber")!(INVOICE);
      fields.get("grin.field.material")!(MATERIAL);
      fields.get("grin.field.receivedQty")!("9");
    });
    const createSave = presses.get("grin.saveAction");
    assert.ok(createSave);
    await act(() => {
      createSave();
    });
    assert.equal(banners.includes("grin.createCompleted"), true);
    assert.equal(values.get("grin.field.supplierName"), SUPPLIER);
    assert.equal(values.get("grin.field.supplierGstin"), GSTIN);
    assert.equal(values.get("grin.field.invoiceNumber"), INVOICE);
    assert.equal(values.get("grin.field.material"), MATERIAL);
    assert.equal(countCommands(db, OWNER_A, "registerGoodsReceipt"), 1);
    const createStartNew = presses.get("grin.createStartNew");
    assert.ok(createStartNew);
    const replacesAtComplete = replaceCalls.n;

    values.clear();
    texts.length = 0;
    banners.length = 0;
    const mountsBeforeSwitch = mountLog.mounts;
    const unmountsBeforeSwitch = mountLog.unmounts;
    owner = OWNER_B;
    await renderTree();
    assert.ok(mountLog.unmounts > unmountsBeforeSwitch, "account switch must unmount the previous create body");
    assert.ok(mountLog.mounts > mountsBeforeSwitch, "account switch must mount a new create body");
    assert.equal(mountLog.last?.ownerUid, OWNER_B);
    assert.ok(mountLog.last && mountLog.last.dispatchGeneration >= 1);
    assertSecretsHidden("create switch to B", values, texts, banners);
    assert.equal(values.get("grin.field.supplierName"), "");
    assert.equal(values.get("grin.field.supplierGstin"), "");
    assert.equal(values.get("grin.field.invoiceNumber"), "");
    assert.equal(values.get("grin.field.material"), "");
    assert.equal(banners.includes("grin.createCompleted"), false);

    const rowsA = countCommands(db, OWNER_A);
    const rowsB = countCommands(db, OWNER_B);
    await act(() => {
      createSave();
      createStartNew();
    });
    assert.equal(countCommands(db, OWNER_A), rowsA, "old create Save must not write after the switch");
    assert.equal(countCommands(db, OWNER_B), rowsB, "old create Save and Start new must not write for B");
    assert.equal(replaceCalls.n, replacesAtComplete, "old create completion must not navigate after the switch");
    assertSecretsHidden("create callbacks after switch", values, texts, banners);

    // --- A logs out and logs back in under a new generation ---
    owner = OWNER_A;
    bodyKey += 1;
    await renderTree();
    const genBeforeLogout = mountLog.last!.dispatchGeneration;
    await act(async () => {
      fields.get("grin.field.supplierName")!(SUPPLIER);
      fields.get("grin.field.material")!(MATERIAL);
    });
    const saveBeforeLogout = presses.get("grin.saveAction");
    const startBeforeLogout = presses.get("grin.createStartNew");
    assert.ok(saveBeforeLogout);
    await act(() => {
      saveBeforeLogout();
    });
    assert.equal(banners.includes("grin.createCompleted"), true);
    const rowsBeforeLogout = countCommands(db, OWNER_A);
    values.clear();
    texts.length = 0;
    banners.length = 0;
    owner = null;
    await renderTree();
    assertSecretsHidden("logout", values, texts, banners);
    assert.equal(banners.includes("grin.createCompleted"), false);
    owner = OWNER_A;
    await renderTree();
    assert.equal(mountLog.last?.ownerUid, OWNER_A);
    assert.notEqual(mountLog.last?.dispatchGeneration, genBeforeLogout, "login must mint a new dispatch generation");
    assert.equal(values.get("grin.field.supplierName") ?? "", "");
    assert.equal(values.get("grin.field.material") ?? "", "");
    assert.equal(banners.includes("grin.createCompleted"), false);
    assertSecretsHidden("login", values, texts, banners);
    await act(() => {
      saveBeforeLogout();
      startBeforeLogout?.();
    });
    assert.equal(countCommands(db, OWNER_A), rowsBeforeLogout, "logged-out callbacks must not write on the new generation");

    // --- completed resumed return, A switches directly to B ---
    const resumedVersion = await confirmReceipt("grcp_ui_ret_resume", "10");
    assert.equal(resumedVersion, 1);
    receiptId.current = "grcp_ui_ret_resume";
    body = "return";
    bodyKey += 1;
    resetGrinMutationFlightForTests();
    banners.length = 0;
    values.clear();
    texts.length = 0;
    await renderTree();
    assert.equal(texts.includes(SUPPLIER), true, "the resumed receipt must show its supplier before the switch");
    assert.equal(texts.includes(MATERIAL), true);
    await act(async () => {
      fields.get("grin.field.reason")!(REASON);
      fields.get("grin.returnQty")!("4");
    });
    failCode = "unavailable";
    const resumeSave = presses.get("common.save");
    assert.ok(resumeSave);
    await act(async () => {
      resumeSave();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const resumedPlan = requireLiveGrinApplicationRepository().getReturnPlan("grcp_ui_ret_resume");
    assert.ok(resumedPlan, "a retryable failure must leave the return plan to resume");
    assert.equal(resumedPlan.reason, REASON);
    assert.equal(banners.includes("grin.returnCompleted"), false);

    bodyKey += 1;
    banners.length = 0;
    values.clear();
    texts.length = 0;
    await renderTree();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    assert.equal(values.get("grin.field.reason"), REASON, "resume must restore the reason");
    assert.equal(banners.includes("grin.returnCompleted"), true, "a resumed return that confirms must complete");
    assert.equal(texts.includes(SUPPLIER), true);
    assert.equal(texts.includes(GSTIN), true);
    assert.equal(texts.includes(MATERIAL), true);
    const returnStartNew = presses.get("grin.returnStartNew");
    assert.ok(returnStartNew);
    const returnSaveCompleted = presses.get("common.save");
    assert.ok(returnSaveCompleted);
    const rowsBeforeReturnSwitch = countCommands(db, OWNER_A, "dispatchReturn");
    const backAtResume = backCalls.n;

    values.clear();
    texts.length = 0;
    banners.length = 0;
    const returnMounts = mountLog.mounts;
    const returnUnmounts = mountLog.unmounts;
    owner = OWNER_B;
    await renderTree();
    assert.ok(mountLog.unmounts > returnUnmounts, "account switch must unmount the completed return body");
    assert.ok(mountLog.mounts > returnMounts);
    assert.equal(mountLog.last?.ownerUid, OWNER_B);
    assertSecretsHidden("return switch to B", values, texts, banners);
    assert.equal(banners.includes("grin.returnCompleted"), false);
    assert.equal(values.get("grin.field.reason") ?? "", "");
    await act(() => {
      returnSaveCompleted();
      returnStartNew();
    });
    assert.equal(countCommands(db, OWNER_A, "dispatchReturn"), rowsBeforeReturnSwitch);
    assert.equal(countCommands(db, OWNER_B, "dispatchReturn"), 0);
    assert.equal(backCalls.n, backAtResume, "old return completion must not navigate after the switch");
    assertSecretsHidden("return callbacks after switch", values, texts, banners);

    // --- account changes while return completion is awaiting a response ---
    owner = OWNER_A;
    bodyKey += 1;
    receiptId.current = "grcp_ui_ret_inflight";
    resetGrinMutationFlightForTests();
    await renderTree();
    await confirmReceipt("grcp_ui_ret_inflight", "10");
    bodyKey += 1;
    banners.length = 0;
    values.clear();
    texts.length = 0;
    await renderTree();
    await act(async () => {
      fields.get("grin.field.reason")!(REASON);
      fields.get("grin.returnQty")!("2");
    });
    let releaseHold: (() => void) | null = null;
    holdDispatch = new Promise<void>((resolve) => {
      releaseHold = resolve;
    });
    const inflightSave = presses.get("common.save");
    assert.ok(inflightSave);
    const backBeforeHold = backCalls.n;
    await act(async () => {
      inflightSave();
      await Promise.resolve();
    });
    const rowsWhileHeld = countCommands(db, OWNER_A, "dispatchReturn");
    values.clear();
    texts.length = 0;
    banners.length = 0;
    owner = OWNER_B;
    await renderTree();
    assert.equal(mountLog.last?.ownerUid, OWNER_B);
    assertSecretsHidden("switch during return completion", values, texts, banners);
    await act(async () => {
      releaseHold?.();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    assert.equal(backCalls.n, backBeforeHold, "a late completion must not navigate the new account");
    assert.equal(countCommands(db, OWNER_A, "dispatchReturn"), rowsWhileHeld, "a late completion must not add a command");
    assert.equal(countCommands(db, OWNER_B), 0);
    assertSecretsHidden("after late completion", values, texts, banners);
    const inflightStart = presses.get("grin.returnStartNew");
    await act(() => {
      inflightSave();
      inflightStart?.();
    });
    assert.equal(countCommands(db, OWNER_B), 0, "old Start new must not rearm a return for B");

    // --- explicit new return reloads confirmed availability and stays mounted ---
    owner = OWNER_A;
    receiptId.current = "grcp_ui_ret_next";
    bodyKey += 1;
    resetGrinMutationFlightForTests();
    await renderTree();
    const registeredVersion = await confirmReceipt("grcp_ui_ret_next", "10");
    assert.equal(registeredVersion, 1);
    bodyKey += 1;
    banners.length = 0;
    values.clear();
    texts.length = 0;
    await renderTree();
    assert.equal(texts.includes("10 bags"), true);
    await act(async () => {
      fields.get("grin.field.reason")!(REASON);
      fields.get("grin.returnQty")!("4");
    });
    const firstReturnSave = presses.get("common.save");
    assert.ok(firstReturnSave);
    const backBeforeFirst = backCalls.n;
    await act(async () => {
      firstReturnSave();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    assert.equal(banners.includes("grin.returnCompleted"), true);
    assert.ok(backCalls.n > backBeforeFirst, "a mounted completion may navigate; the body stays because back is inert");
    assert.equal(values.get("grin.field.reason"), REASON, "completion keeps the form mounted");
    const firstIds = commandIds(db, OWNER_A, "dispatchReturn", "grcp_ui_ret_next");
    assert.equal(firstIds.length, 1);

    const mountsAtNext = mountLog.mounts;
    banners.length = 0;
    values.clear();
    texts.length = 0;
    const startNext = presses.get("grin.returnStartNew");
    assert.ok(startNext);
    await act(() => {
      startNext();
    });
    assert.equal(mountLog.mounts, mountsAtNext, "starting another return stays on the mounted body");
    const reloaded = requireLiveGrinApplicationRepository().confirmedProjection("grcp_ui_ret_next");
    assert.ok(reloaded);
    assert.equal(reloaded.eventVersion, registeredVersion + 1);
    assert.equal(texts.includes(String(reloaded.eventVersion)), true, "the reloaded confirmed version must be displayed");
    assert.equal(texts.includes("6 bags"), true, "available quantity must be the confirmed remainder");
    assert.equal(texts.includes("4 bags"), true, "confirmed returned quantity must come from the projection");
    assert.equal(values.get("grin.field.reason"), "");
    assert.equal(values.get("grin.returnQty") ?? "", "");
    assert.equal(banners.includes("grin.returnCompleted"), false);
    assert.equal(disabled.get("common.save"), false);

    await act(async () => {
      fields.get("grin.field.reason")!("second return reason");
      fields.get("grin.returnQty")!("1");
    });
    const secondSave = presses.get("common.save");
    assert.ok(secondSave);
    assert.notEqual(secondSave, firstReturnSave);
    await act(async () => {
      secondSave();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const secondIds = commandIds(db, OWNER_A, "dispatchReturn", "grcp_ui_ret_next");
    assert.equal(secondIds.length, 2);
    assert.notEqual(secondIds[1], firstIds[0]);
    const afterSecond = requireLiveGrinApplicationRepository().confirmedProjection("grcp_ui_ret_next");
    assert.equal(afterSecond?.eventVersion, registeredVersion + 2);

    const rowsAfterSecond = countCommands(db, OWNER_A, "dispatchReturn");
    await act(async () => {
      firstReturnSave();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assert.equal(countCommands(db, OWNER_A, "dispatchReturn"), rowsAfterSecond, "the completed callback must not add a command");

    values.clear();
    texts.length = 0;
    banners.length = 0;
    owner = OWNER_B;
    await renderTree();
    await act(() => {
      firstReturnSave();
      secondSave();
      startNext();
    });
    assert.equal(countCommands(db, OWNER_A, "dispatchReturn"), rowsAfterSecond);
    assert.equal(countCommands(db, OWNER_B), 0);
    assertSecretsHidden("retired return callbacks", values, texts, banners);

    console.log("grinUiLifecycle.mount.test.ts SQLITE_HOST+INJECTED+MOUNTED_INERT: ok");
    await act(async () => {
      root?.unmount();
    });
    root = null;
  } finally {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    resetGrinApplicationRepositoryForTests();
    resetGrinMutationFlightForTests();
    restoreEnv();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
