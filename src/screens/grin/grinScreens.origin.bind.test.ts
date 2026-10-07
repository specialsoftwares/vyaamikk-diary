/**
 * Actual-screen F1 origin bind.
 *
 * Mounts production admitted bodies (Amend / QC / Return / Create) with inert
 * native surfaces. Captured onSave stays bound to the originating session.
 * Switching the live token to B (or logout→A) must retire A's callback and
 * must not dispatch B.amend / B.recordQc / B.dispatchReturn / B.createQueued.
 *
 * Boundaries:
 * - mocked: native Screen/FlatList/TalkBack, Expo Router, AuthProvider, camera
 * - mounted: production admitted bodies (not an inert child that binds live)
 * - SQLITE_HOST: session start/retire against host sqlite
 * - emulator-tested: no
 * - device-tested: no
 * - NATIVE_DEVICE: not claimed
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createMountContainer } from "@/billing/quotaUpsell/quotaUpsellHost.fakeDom";
import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import {
  GRIN_BINDING_RETIRED,
  GRIN_APPLICATION_LEDGER_ID,
  advanceGrinLiveToken,
  getGrinApplicationRepository,
  requireOriginGrinApplicationRepository,
  resetGrinApplicationRepositoryForTests,
  retireGrinOwnerSession,
  setGrinApplicationDbFactoryForTests,
  setGrinEvidencePortFactoryForTests,
  setGrinServerPortFactoryForTests,
  startGrinOwnerSession,
} from "@/services/grin/repository";
import { createUninjectedGrinEvidencePort, createUninjectedGrinServerPort } from "@/services/grin/repository/uninjectedServer";
import { setPdfGenerateHookForTests } from "@/services/pdf/pdfGenerateHook";
import { lightColors } from "@/theme/palettes";

import { GrinAmendAdmittedBody } from "./GrinAmendAdmittedBody";
import { GrinAttachmentsAdmittedBody } from "./GrinAttachmentsAdmittedBody";
import { GrinCreateAdmittedBody } from "./GrinCreateAdmittedBody";
import { GrinEwbAdmittedBody } from "./GrinEwbAdmittedBody";
import { GrinPackAdmittedBody, setGrinPackShareForTests } from "./GrinPackAdmittedBody";
import { GrinQcAdmittedBody } from "./GrinQcAdmittedBody";
import { GrinReturnAdmittedBody } from "./GrinReturnAdmittedBody";
import { resetGrinOriginalPickerForTests, setGrinOriginalPickerForTests } from "./grinOriginalPicker";
import { installGrinScreenRuntime } from "./grinScreenHooks";
import { installGrinSurfaces, type GrinSurfaces } from "./grinSurfaces";

type FieldMap = Map<string, (value: string) => void>;
type PressMap = Map<string, () => void>;

function passthrough(tag: string) {
  return function Surface(props: Record<string, unknown> & { children?: React.ReactNode }) {
    return React.createElement(tag, { "data-surface": tag }, props.children);
  };
}

function installInertSurfaces(fields: FieldMap, presses: PressMap, banners: string[]): void {
  const TextField = (props: Record<string, unknown>) => {
    const key = String(props.accessibilityLabel ?? props.label ?? "");
    if (typeof props.onChangeText === "function") {
      fields.set(key, props.onChangeText as (value: string) => void);
    }
    return React.createElement("input", {
      "data-field": key,
      defaultValue: props.value == null ? "" : String(props.value),
      readOnly: true,
    });
  };
  const Button = (props: Record<string, unknown>) => {
    const key = String(props.label ?? "");
    if (typeof props.onPress === "function") {
      presses.set(key, props.onPress as () => void);
    }
    return React.createElement("button", { "data-press": key }, key);
  };
  const Banner = (props: Record<string, unknown>) => {
    if (props.tone === "danger" && props.message) banners.push(String(props.message));
    return React.createElement("div", { "data-banner": String(props.tone ?? "") }, String(props.message ?? ""));
  };
  const Chip = (props: Record<string, unknown>) => {
    const key = String(props.label ?? "");
    if (typeof props.onPress === "function") {
      presses.set(`chip:${key}`, props.onPress as () => void);
    }
    return React.createElement("button", { "data-chip": key }, key);
  };
  const SelectField = (props: Record<string, unknown>) => {
    const key = String(props.accessibilityLabel ?? props.label ?? "");
    if (typeof props.onChange === "function") {
      fields.set(`select:${key}`, props.onChange as (value: string) => void);
    }
    return React.createElement("select", { "data-select": key });
  };
  const surfaces: GrinSurfaces = {
    Screen: passthrough("section"),
    Header: passthrough("header"),
    Banner,
    Button,
    FormSection: passthrough("fieldset"),
    TextField,
    SelectField,
    Card: passthrough("article"),
    EmptyState: passthrough("div"),
    View: passthrough("div"),
    Text: passthrough("span"),
    FlatList: passthrough("ul"),
    IndigoChoiceChip: Chip,
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
      ({ receiptId: "grcp_origin_a" }) as unknown as T,
    useFocusEffect: (effect) => {
      React.useEffect(() => {
        const cleanup = effect();
        return typeof cleanup === "function" ? cleanup : undefined;
        // Mount-once harness. Production uses route focus, not every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
    },
    getPickerHostAppState: () => "active",
  });
}

function body(receiptId: string, supplier: string) {
  return sampleRegisterBody({
    receiptId,
    supplier: {
      name: { kind: "present", value: supplier },
      registration: { kind: "registered", gstin: "29BBBBB0000B1Z5" },
      address: { kind: "not_supplied" },
      contact: { kind: "not_supplied" },
    },
  });
}

async function main(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t4-origin-"));
  const dbPath = path.join(tmp, "grin-origin.sqlite");
  let db: HostSqlite | null = null;
  let root: Root | null = null;

  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

    setGrinApplicationDbFactoryForTests(() => db as HostSqlite);
    setGrinServerPortFactoryForTests(() => createUninjectedGrinServerPort());
    setGrinEvidencePortFactoryForTests(() => createUninjectedGrinEvidencePort());
    setGrinPackShareForTests(async () => undefined);

    const sessionA = startGrinOwnerSession("owner_a");
    const repoA = getGrinApplicationRepository("owner_a", sessionA.dispatchGeneration);
    repoA.createQueued(body("grcp_origin_a", "Origin A supplier"));

    const fields: FieldMap = new Map();
    const presses: PressMap = new Map();
    const banners: string[] = [];
    installInertSurfaces(fields, presses, banners);

    const container = createMountContainer();
    root = createRoot(container);

    async function mount(element: React.ReactElement): Promise<void> {
      fields.clear();
      presses.clear();
      banners.length = 0;
      await act(async () => {
        root!.render(element);
      });
    }

    await mount(React.createElement(GrinAmendAdmittedBody, { session: sessionA }));
    assert.ok(fields.has("grin.field.remarks"), "amend body must bind the remarks field");
    assert.ok(presses.has("common.save"), "amend body must bind production onSave");
    await act(async () => {
      fields.get("grin.field.remarks")!("A remarks must not follow B");
      fields.get("grin.field.reason")!("origin bind");
    });
    const amendSave = presses.get("common.save");
    assert.ok(amendSave);

    let bAmend = 0;
    advanceGrinLiveToken("owner_b");
    assert.throws(
      () => requireOriginGrinApplicationRepository(sessionA),
      (err: unknown) => err instanceof Error && err.message === GRIN_BINDING_RETIRED
    );
    await act(async () => {
      amendSave();
    });
    assert.ok(
      banners.includes("grin.errSessionRetired"),
      "A's amend onSave must surface session retired after the live token flips"
    );
    assert.equal(bAmend, 0, "B.amend must not run before B's sqlite session exists");

    const sessionB = startGrinOwnerSession("owner_b");
    const repoB = getGrinApplicationRepository("owner_b", sessionB.dispatchGeneration);
    const originalAmend = repoB.amend.bind(repoB);
    repoB.amend = ((input) => {
      bAmend += 1;
      return originalAmend(input);
    }) as typeof repoB.amend;
    repoB.createQueued(body("grcp_origin_b", "Origin B supplier"));
    await act(async () => {
      amendSave();
    });
    assert.equal(bAmend, 0, "captured A amend must not call B.amend");
    assert.equal(repoB.get("grcp_origin_a"), null);
    assert.throws(
      () => requireOriginGrinApplicationRepository(sessionA),
      (err: unknown) => err instanceof Error && err.message === GRIN_BINDING_RETIRED
    );

    const sessionA2 = startGrinOwnerSession("owner_a");
    assert.notEqual(sessionA2.dispatchGeneration, sessionA.dispatchGeneration);
    const repoA2 = getGrinApplicationRepository("owner_a", sessionA2.dispatchGeneration);
    let a2Amend = 0;
    const originalA2Amend = repoA2.amend.bind(repoA2);
    repoA2.amend = ((input) => {
      a2Amend += 1;
      return originalA2Amend(input);
    }) as typeof repoA2.amend;
    await act(async () => {
      amendSave();
    });
    assert.equal(a2Amend, 0, "A→logout→A must not dispatch the new generation from A's old callback");
    assert.throws(
      () => requireOriginGrinApplicationRepository(sessionA),
      (err: unknown) => err instanceof Error && err.message === GRIN_BINDING_RETIRED
    );

    const sessionAQc = startGrinOwnerSession("owner_a");
    getGrinApplicationRepository("owner_a", sessionAQc.dispatchGeneration).createQueued(
      body("grcp_origin_a", "Origin A supplier")
    );
    await mount(React.createElement(GrinQcAdmittedBody, { session: sessionAQc }));
    await act(async () => {
      fields.get("grin.field.reason")!("qc origin");
    });
    const qcSave = presses.get("common.save");
    assert.ok(qcSave);
    const sessionBQc = startGrinOwnerSession("owner_b");
    const repoBQc = getGrinApplicationRepository("owner_b", sessionBQc.dispatchGeneration);
    let bQc = 0;
    const originalQc = repoBQc.recordQc.bind(repoBQc);
    repoBQc.recordQc = ((input) => {
      bQc += 1;
      return originalQc(input);
    }) as typeof repoBQc.recordQc;
    banners.length = 0;
    await act(async () => {
      qcSave();
    });
    assert.equal(bQc, 0, "captured A QC onSave must not call B.recordQc");
    assert.ok(banners.includes("grin.errSessionRetired"));

    const sessionAReturn = startGrinOwnerSession("owner_a");
    await mount(React.createElement(GrinReturnAdmittedBody, { session: sessionAReturn }));
    await act(async () => {
      fields.get("grin.field.reason")!("return origin");
      fields.get("grin.returnQty")!("1");
    });
    const returnSave = presses.get("common.save");
    assert.ok(returnSave);
    const sessionBReturn = startGrinOwnerSession("owner_b");
    const repoBReturn = getGrinApplicationRepository("owner_b", sessionBReturn.dispatchGeneration);
    let bReturn = 0;
    const originalReturn = repoBReturn.dispatchReturn.bind(repoBReturn);
    repoBReturn.dispatchReturn = ((input) => {
      bReturn += 1;
      return originalReturn(input);
    }) as typeof repoBReturn.dispatchReturn;
    banners.length = 0;
    await act(async () => {
      returnSave();
    });
    assert.equal(bReturn, 0, "captured A return onSave must not call B.dispatchReturn");
    assert.ok(banners.includes("grin.errSessionRetired"));

    const sessionACreate = startGrinOwnerSession("owner_a");
    await mount(React.createElement(GrinCreateAdmittedBody, { session: sessionACreate }));
    await act(async () => {
      fields.get("grin.field.supplierName")!("Origin A supplier");
      fields.get("grin.field.material")!("Cotton bales");
      fields.get("grin.field.remarks")!("create remarks stay with A");
    });
    const createSave = presses.get("grin.saveAction");
    assert.ok(createSave, "create body must bind production onSave");
    const sessionBCreate = startGrinOwnerSession("owner_b");
    const repoBCreate = getGrinApplicationRepository("owner_b", sessionBCreate.dispatchGeneration);
    let bCreate = 0;
    const originalCreate = repoBCreate.createQueued.bind(repoBCreate);
    repoBCreate.createQueued = ((input) => {
      bCreate += 1;
      return originalCreate(input);
    }) as typeof repoBCreate.createQueued;
    const listedBefore = repoBCreate.list().length;
    banners.length = 0;
    await act(async () => {
      createSave();
    });
    assert.equal(bCreate, 0, "captured A create onSave must not call B.createQueued");
    assert.equal(repoBCreate.list().length, listedBefore);
    assert.ok(banners.includes("grin.errSessionRetired"));
    assert.equal(GRIN_APPLICATION_LEDGER_ID.length > 0, true);

    const sessionAEwb = startGrinOwnerSession("owner_a");
    getGrinApplicationRepository("owner_a", sessionAEwb.dispatchGeneration).createQueued(
      body("grcp_origin_a", "Origin A supplier")
    );
    await mount(React.createElement(GrinEwbAdmittedBody, { session: sessionAEwb }));
    const ewbSave = presses.get("grin.ewbRecordPortal");
    assert.ok(ewbSave, "EWB admitted body must bind record portal");
    const sessionBEwb = startGrinOwnerSession("owner_b");
    const repoBEwb = getGrinApplicationRepository("owner_b", sessionBEwb.dispatchGeneration);
    let bEwb = 0;
    const originalEwb = repoBEwb.recordEwbObservation.bind(repoBEwb);
    repoBEwb.recordEwbObservation = ((input) => {
      bEwb += 1;
      return originalEwb(input);
    }) as typeof repoBEwb.recordEwbObservation;
    banners.length = 0;
    await act(async () => {
      ewbSave();
    });
    assert.equal(bEwb, 0, "captured A EWB onRecord must not call B.recordEwbObservation");
    assert.ok(banners.includes("grin.errSessionRetired"));

    const sessionAAttach = startGrinOwnerSession("owner_a");
    getGrinApplicationRepository("owner_a", sessionAAttach.dispatchGeneration).createQueued(
      body("grcp_origin_a", "Origin A supplier")
    );
    let releasePick: (() => void) | null = null;
    const heldPick = new Promise<void>((resolve) => {
      releasePick = resolve;
    });
    let pickerCompleted = 0;
    setGrinOriginalPickerForTests(async () => {
      await heldPick;
      pickerCompleted += 1;
      return {
        localPath: "/tmp/retired-must-not-attach.pdf",
        mime: "application/pdf",
        byteSize: 12,
        claimedSha256: "aa".repeat(32),
        fileName: "original",
        captureProvenance: "imported_original",
        osConversionOccurred: "unknown",
      };
    });
    await mount(React.createElement(GrinAttachmentsAdmittedBody, { session: sessionAAttach }));
    const attachLibrary = presses.get("grin.attachLibrary");
    assert.ok(attachLibrary, "attachments admitted body must bind library pick");
    const attachInFlight = act(async () => {
      attachLibrary();
    });
    const sessionBAttach = startGrinOwnerSession("owner_b");
    const repoBAttach = getGrinApplicationRepository("owner_b", sessionBAttach.dispatchGeneration);
    let bAttach = 0;
    const originalAttach = repoBAttach.attachOriginal.bind(repoBAttach);
    repoBAttach.attachOriginal = ((input) => {
      bAttach += 1;
      return originalAttach(input);
    }) as typeof repoBAttach.attachOriginal;
    banners.length = 0;
    releasePick!();
    await attachInFlight;
    assert.equal(pickerCompleted, 1);
    assert.equal(bAttach, 0, "retired picker must not attach to a new account");
    assert.ok(banners.includes("grin.errSessionRetired"));
    resetGrinOriginalPickerForTests();

    const sessionAPack = startGrinOwnerSession("owner_a");
    getGrinApplicationRepository("owner_a", sessionAPack.dispatchGeneration).createQueued(
      body("grcp_origin_a", "Origin A supplier")
    );
    let shareCalls = 0;
    setGrinPackShareForTests(async () => {
      shareCalls += 1;
    });
    let releasePdf: (() => void) | null = null;
    const heldPdf = new Promise<void>((resolve) => {
      releasePdf = resolve;
    });
    setPdfGenerateHookForTests(async () => {
      await heldPdf;
      return { uri: "/tmp/grin-pack.pdf", fileName: "pack.pdf" };
    });
    await mount(React.createElement(GrinPackAdmittedBody, { session: sessionAPack }));
    const exportPress = presses.get("grin.pack.export");
    assert.ok(exportPress, "pack admitted body must bind export");
    const exportInFlight = act(async () => {
      exportPress();
    });
    startGrinOwnerSession("owner_b");
    banners.length = 0;
    releasePdf!();
    await exportInFlight;
    assert.equal(shareCalls, 0, "retired pack export must not publish a share");
    assert.ok(banners.includes("grin.errSessionRetired"));
    setPdfGenerateHookForTests(null);
    setGrinPackShareForTests(null);
  } finally {
    await act(async () => {
      root?.unmount();
    });
    retireGrinOwnerSession();
    resetGrinApplicationRepositoryForTests();
    resetGrinOriginalPickerForTests();
    setGrinPackShareForTests(null);
    setPdfGenerateHookForTests(null);
    try {
      db?.close();
    } catch {
      // ignore
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log("grinScreens.origin.bind.test.ts: ok");
}

void main();
