/**
 * Team 5 independent E1–E5 reproductions (contract 2026-10-02.wave2evidence).
 * AI QA. Not production fixes. Not G6 / NATIVE_DEVICE / billing / public-release.
 * Coordinator narrative is not evidence. Execute production methods.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./wave2evidence-e4-loader.mjs", import.meta.url);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const HASH_A = "aa".repeat(32);
const HASH_B = "bb".repeat(32);
const OMITTED_CATEGORIES = ["stock_accounting", "payment", "gst", "return_document"] as const;

type FindingResult = {
  id: string;
  reproduced: boolean;
  label: string;
  fileLine: string;
  evidence: string;
};

const results: FindingResult[] = [];

function record(entry: FindingResult): void {
  results.push(entry);
  const mark = entry.reproduced ? "REPRODUCED" : "NOT_REPRODUCED";
  console.log(`[${entry.label}] ${entry.id} ${mark}`);
  console.log(`  file:line ${entry.fileLine}`);
  console.log(`  ${entry.evidence}`);
}

function body(
  sampleRegisterBody: typeof import("@/goodsEvidence/testFixtures").sampleRegisterBody,
  receiptId: string,
  supplier = "T5 E1-E5 Supplier"
) {
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

type PackOriginal = {
  evidenceId: string;
  rawSha256: string;
  generation: string | null;
  mime: string;
  category: string;
  state: string;
};

function productionToPackOriginalInput(file: {
  evidenceId: string;
  ownerUid: string;
  ledgerId: string;
  receiptId: string;
  category: string | null;
  localPath: string;
  byteSize: number | null;
  claimedSha256: string | null;
  uploadState: string;
  originalDurable: boolean;
  role: string;
}): PackOriginal {
  const name = file.localPath.toLowerCase();
  const mime = name.endsWith(".pdf")
    ? "application/pdf"
    : name.endsWith(".png")
      ? "image/png"
      : name.endsWith(".webp")
        ? "image/webp"
        : name.endsWith(".jpg") || name.endsWith(".jpeg")
          ? "image/jpeg"
          : "application/octet-stream";
  const verified = file.uploadState === "verified" && file.originalDurable;
  return {
    evidenceId: file.evidenceId,
    rawSha256: file.claimedSha256 ?? "",
    generation: verified ? "verified" : null,
    mime,
    category: file.category ?? "",
    state: verified ? "verified" : file.uploadState,
  };
}

async function main(): Promise<void> {
  const packMod = await import("@/goodsEvidence/evidencePackInputs");
  const packOriginalBatches: PackOriginal[][] = [];

  const { sampleRegisterBody } = await import("@/goodsEvidence/testFixtures");
  const {
    WAVE1_ORIGINAL_CATEGORIES,
    isWave1OriginalCategory,
    ALLOWED_ORIGINAL_MIME,
  } = await import("@/goodsEvidence/evidence");
  const { originalSupportsItem } = await import("@/goodsEvidence/evidenceSupport");
  const assembleEvidencePackInputs = packMod.assembleEvidencePackInputs;
  const { createFakeGrinServerPort } = await import("@/services/grin/outbox/fakePorts");
  const { openHostSqlite, SQLITE_HOST } = await import("@/services/grin/outbox/hostSqlite");
  const { GrinOutbox } = await import("@/services/grin/outbox/outbox");
  const { SQLITE_HOST_NOT_NATIVE_DEVICE } = await import("@/services/grin/outbox/types");
  const { GrinApplicationRepository } = await import(
    "@/services/grin/repository/GrinApplicationRepository"
  );
  const origExportPack = GrinApplicationRepository.prototype.exportPack;
  GrinApplicationRepository.prototype.exportPack = function (receiptId: string) {
    const result = origExportPack.call(this, receiptId);
    const box = (this as unknown as { outbox: InstanceType<typeof GrinOutbox>; ownerUid: string; ledgerId: string })
      .outbox;
    const ownerUid = (this as unknown as { ownerUid: string }).ownerUid;
    const ledgerId = (this as unknown as { ledgerId: string }).ledgerId;
    const files = box.listLocalFiles(ownerUid, ledgerId, receiptId.trim());
    packOriginalBatches.push(
      files.filter((file) => file.role === "original").map((file) => productionToPackOriginalInput(file))
    );
    return result;
  };
  const {
    GRIN_APPLICATION_LEDGER_ID,
    persistGrinOwnerSession,
    resetGrinApplicationRepositoryForTests,
    setGrinApplicationDbFactoryForTests,
    setGrinServerPortFactoryForTests,
    startGrinOwnerSession,
    getGrinApplicationRepository,
    advanceGrinLiveToken,
  } = await import("@/services/grin/repository");
  const bindingNs = await import("@/services/grin/repository/appBinding");
  const { createFirebaseGrinEvidenceTransport, createFirebaseJsGrinEvidenceTransport } = await import(
    "@/services/grin/transport/evidenceTransport"
  );
  const { GRIN_UPLOAD_EVIDENCE_CALLABLE } = await import("@/services/grin/transport/callableNames");
  const {
    pickGrinOriginal,
    setGrinOriginalPickerForTests,
    resetGrinOriginalPickerForTests,
  } = await import("@/screens/grin/grinOriginalPicker");
  const { installGrinScreenRuntime } = await import("@/screens/grin/grinScreenHooks");
  const { lightColors } = await import("@/theme/palettes");

  type HostSqlite = import("@/services/grin/outbox/hostSqlite").HostSqlite;
  type GrinDispatchSession = import("@/services/grin/outbox/types").GrinDispatchSession;
  type GrinEvidenceUploadPort = import("@/services/grin/outbox/ports").GrinEvidenceUploadPort;
  type GrinLocalEvidenceFile = import("@/services/grin/outbox/types").GrinLocalEvidenceFile;
  type GrinEvidenceUploadResult = import("@/services/grin/outbox/ports").GrinEvidenceUploadResult;

  function outboxOf(repo: InstanceType<typeof GrinApplicationRepository>): InstanceType<typeof GrinOutbox> {
    const box = (repo as unknown as { outbox: InstanceType<typeof GrinOutbox> }).outbox;
    assert.ok(box, "production repository must hold the persistGrinOwnerSession outbox");
    return box;
  }

  function evidenceOf(box: InstanceType<typeof GrinOutbox>): unknown {
    return (box as unknown as { evidence: unknown }).evidence;
  }

  function identityMatches(
    box: InstanceType<typeof GrinOutbox>,
    file: GrinLocalEvidenceFile,
    uploaded: GrinEvidenceUploadResult,
    ownerUid: string
  ): boolean {
    const fn = (
      box as unknown as {
        originalIdentityMatches: (
          file: GrinLocalEvidenceFile,
          uploaded: GrinEvidenceUploadResult,
          ownerUid: string
        ) => boolean;
      }
    ).originalIdentityMatches;
    assert.equal(typeof fn, "function", "must call production originalIdentityMatches");
    return fn.call(box, file, uploaded, ownerUid);
  }

  function tableColumns(db: HostSqlite, table: string): string[] {
    const rows = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
    return rows.map((row) => row.name);
  }

  function sqliteRow(
    db: HostSqlite,
    ownerUid: string,
    evidenceId: string
  ): Record<string, unknown> | null {
    return db.getFirstSync<Record<string, unknown>>(
      `SELECT * FROM grin_local_evidence_files WHERE owner_uid = ? AND evidence_id = ? AND role = ?`,
      [ownerUid, evidenceId, "original"]
    );
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t5-e1e5-"));
  const dbPath = path.join(tmp, "repro.sqlite");
  let db: HostSqlite | null = null;

  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);
    console.log(`HOST_FILESYSTEM=${os.platform()} ${tmp}`);
    console.log(`STORAGE_EMULATOR=not_run`);
    console.log(`INSPECTED_HEAD_FILE=${path.join(ROOT, ".git/HEAD")}`);

    resetGrinApplicationRepositoryForTests();
    setGrinApplicationDbFactoryForTests(() => db as HostSqlite);
    const e1Server = createFakeGrinServerPort();
    setGrinServerPortFactoryForTests(() => e1Server);

    assert.equal(
      "setGrinEvidencePortFactoryForTests" in bindingNs,
      false,
      "no evidence-port test factory on production appBinding"
    );

    advanceGrinLiveToken("owner_e1");
    const persisted = persistGrinOwnerSession();
    assert.ok(persisted);
    const sessionE1 = startGrinOwnerSession("owner_e1");
    const repoE1 = getGrinApplicationRepository("owner_e1", sessionE1.dispatchGeneration);
    const boxE1 = outboxOf(repoE1);
    const wiredEvidence = evidenceOf(boxE1);
    assert.equal(wiredEvidence, null, "persistGrinOwnerSession must leave GrinOutbox.evidence null");

    const createdE1 = repoE1.createQueued(body(sampleRegisterBody, "grcp_e1", "E1 Supplier"));
    repoE1.attachOriginal({
      receiptId: createdE1.receiptId,
      category: "invoice",
      localPath: path.join(tmp, "e1-original.jpg"),
      evidenceId: "ev_e1_invoice",
      claimedSha256: HASH_A,
      byteSize: 32,
      mime: "image/jpeg",
      fileName: "e1-original.jpg",
    });
    const registerE1 = await boxE1.dispatchDue(sessionE1, "worker_e1_reg");
    const afterRegister = registerE1.results.find((row) => row.commandId === createdE1.commandId);
    const attachE1 = await boxE1.dispatchDue(sessionE1, "worker_e1_att");
    const afterAttach = attachE1.results.find((row) => row.commandId === createdE1.commandId);
    const e1File = boxE1.listLocalFiles("owner_e1", GRIN_APPLICATION_LEDGER_ID, "grcp_e1").find(
      (file) => file.evidenceId === "ev_e1_invoice"
    );
    record({
      id: "E1-appBinding-evidence-null-processAttachments",
      reproduced:
        wiredEvidence === null &&
        afterRegister?.localState === "attachment_pending" &&
        afterAttach?.localState === "attachment_pending" &&
        e1File?.originalDurable === false,
      label: "SQLITE_HOST",
      fileLine: "src/services/grin/repository/appBinding.ts:174-177 src/services/grin/outbox/outbox.ts:281,1326-1332",
      evidence: `persistGrinOwnerSession constructed GrinOutbox.evidence=${String(wiredEvidence)}; register localState=${afterRegister?.localState}; processAttachments localState=${afterAttach?.localState}; originalDurable=${String(e1File?.originalDurable)}. No evidence port was invoked.`,
    });

    const payloads: { name: string; data: unknown }[] = [];
    const transport = createFirebaseGrinEvidenceTransport({
      currentAuth: () => ({ uid: "owner_e1" }),
      call: async (name, data) => {
        payloads.push({ name, data });
        return {
          ok: true,
          originalDurable: true,
          evidenceId: "ev_e1_invoice",
          receiptId: "grcp_e1",
          ledgerId: GRIN_APPLICATION_LEDGER_ID,
          category: "invoice",
          generation: "1700000000001",
          actualSha256: HASH_A,
          claimedSha256: HASH_A,
          reservationId: "resv_e1",
        };
      },
    });
    const jsDefault = createFirebaseJsGrinEvidenceTransport();
    const uploaded = await transport.upload({
      uid: "owner_e1",
      ledgerId: GRIN_APPLICATION_LEDGER_ID,
      receiptId: "grcp_e1",
      evidenceId: "ev_e1_invoice",
      role: "original",
      localPath: path.join(tmp, "must-not-leave-host.pdf"),
      claimedSha256: HASH_A,
      category: "invoice",
      sizeBytes: 4096,
    });
    const payload = payloads[0]?.data as Record<string, unknown> | undefined;
    const payloadJson = JSON.stringify(payload ?? null);
    record({
      id: "E1-evidenceTransport-voids-localPath",
      reproduced:
        payloads[0]?.name === GRIN_UPLOAD_EVIDENCE_CALLABLE &&
        payload != null &&
        !("localPath" in payload) &&
        !payloadJson.includes("must-not-leave-host") &&
        uploaded.ok === true &&
        jsDefault.transportKind === "FIREBASE_JS_HTTPS_CALLABLE",
      label: "INJECTED",
      fileLine: "src/services/grin/transport/evidenceTransport.ts:109-118",
      evidence: `production createFirebaseGrinEvidenceTransport.call payload keys=${Object.keys(payload ?? {}).join(",")}; localPath present=${String(payload != null && "localPath" in payload)}; bytes in payload=${payloadJson.includes("must-not-leave-host")}. createFirebaseJsGrinEvidenceTransport exists (${jsDefault.compositionLabel}) but persistGrinOwnerSession did not wire it.`,
    });

    const fileA: GrinLocalEvidenceFile = {
      ownerUid: "owner_e2",
      ledgerId: GRIN_APPLICATION_LEDGER_ID,
      receiptId: "grcp_e2a",
      evidenceId: "ev_e2a",
      role: "original",
      localPath: path.join(tmp, "e2a.bin"),
      claimedSha256: HASH_A,
      byteSize: 16,
      category: "invoice",
      uploadState: "local_only",
      originalDurable: false,
      retainLocal: true,
    };
    const uploadedA: GrinEvidenceUploadResult = {
      ok: true,
      originalDurable: true,
      generation: "gen-actual-B",
      retryable: false,
      evidenceId: "ev_e2a",
      receiptId: "grcp_e2a",
      ledgerId: GRIN_APPLICATION_LEDGER_ID,
      category: "invoice",
      claimedSha256: HASH_A,
      actualSha256: HASH_B,
      reservationId: "resv_e2a",
    };
    const acceptEcho = identityMatches(boxE1, fileA, uploadedA, "owner_e2");

    const fileB: GrinLocalEvidenceFile = {
      ...fileA,
      receiptId: "grcp_e2b",
      evidenceId: "ev_e2b",
      claimedSha256: null,
    };
    const uploadedB: GrinEvidenceUploadResult = {
      ok: true,
      originalDurable: true,
      generation: null,
      retryable: false,
      evidenceId: "ev_e2b",
      receiptId: "grcp_e2b",
      ledgerId: GRIN_APPLICATION_LEDGER_ID,
      category: "invoice",
      claimedSha256: null,
      actualSha256: null,
      reservationId: null,
    };
    const acceptNull = identityMatches(boxE1, fileB, uploadedB, "owner_e2");

    const e2aServer = createFakeGrinServerPort();
    const e2aUploads: GrinEvidenceUploadResult[] = [];
    const e2aPort: GrinEvidenceUploadPort = {
      portKind: "FAKE",
      async upload(input) {
        const result: GrinEvidenceUploadResult = {
          ok: true,
          originalDurable: true,
          generation: "gen-actual-B",
          retryable: false,
          evidenceId: input.evidenceId,
          receiptId: input.receiptId,
          ledgerId: input.ledgerId,
          category: isWave1OriginalCategory(input.category) ? input.category : null,
          claimedSha256: HASH_A,
          actualSha256: HASH_B,
          reservationId: "resv_e2a",
        };
        e2aUploads.push(result);
        return result;
      },
    };
    const e2aBox = new GrinOutbox({ db, server: e2aServer, evidence: e2aPort });
    e2aBox.ensureSchema();
    const sessionE2a = e2aBox.beginOwnerSession("owner_e2");
    e2aBox.persistDraftAndQueue(sessionE2a, {
      ledgerId: GRIN_APPLICATION_LEDGER_ID,
      receiptId: "grcp_e2a",
      commandId: "gcmd_e2a_0001",
      body: body(sampleRegisterBody, "grcp_e2a"),
    });
    e2aBox.attachLocalFile(sessionE2a, {
      ledgerId: GRIN_APPLICATION_LEDGER_ID,
      receiptId: "grcp_e2a",
      evidenceId: "ev_e2a",
      role: "original",
      localPath: path.join(tmp, "e2a.bin"),
      claimedSha256: HASH_A,
      byteSize: 16,
      category: "invoice",
    });
    await e2aBox.dispatchDue(sessionE2a, "worker_e2a_reg");
    await e2aBox.dispatchDue(sessionE2a, "worker_e2a_att");
    const e2aDurable = e2aBox.listLocalFiles("owner_e2", GRIN_APPLICATION_LEDGER_ID, "grcp_e2a").find(
      (file) => file.evidenceId === "ev_e2a"
    );

    const e2bPort: GrinEvidenceUploadPort = {
      portKind: "FAKE",
      async upload(input) {
        return {
          ok: true,
          originalDurable: true,
          generation: null,
          retryable: false,
          evidenceId: input.evidenceId,
          receiptId: input.receiptId,
          ledgerId: input.ledgerId,
          category: isWave1OriginalCategory(input.category) ? input.category : null,
          claimedSha256: null,
          actualSha256: null,
          reservationId: null,
        };
      },
    };
    const e2bBox = new GrinOutbox({ db, server: createFakeGrinServerPort(), evidence: e2bPort });
    const sessionE2b = e2bBox.beginOwnerSession("owner_e2b");
    e2bBox.persistDraftAndQueue(sessionE2b, {
      ledgerId: GRIN_APPLICATION_LEDGER_ID,
      receiptId: "grcp_e2b",
      commandId: "gcmd_e2b_0001",
      body: body(sampleRegisterBody, "grcp_e2b"),
    });
    e2bBox.attachLocalFile(sessionE2b, {
      ledgerId: GRIN_APPLICATION_LEDGER_ID,
      receiptId: "grcp_e2b",
      evidenceId: "ev_e2b",
      role: "original",
      localPath: path.join(tmp, "e2b.bin"),
      claimedSha256: null,
      byteSize: 16,
      category: "ewb",
    });
    await e2bBox.dispatchDue(sessionE2b, "worker_e2b_reg");
    await e2bBox.dispatchDue(sessionE2b, "worker_e2b_att");
    const e2bDurable = e2bBox.listLocalFiles("owner_e2b", GRIN_APPLICATION_LEDGER_ID, "grcp_e2b").find(
      (file) => file.evidenceId === "ev_e2b"
    );

    record({
      id: "E2-echoed-claim-A-actual-B",
      reproduced: acceptEcho === true && e2aDurable?.originalDurable === true && e2aDurable.uploadState === "verified",
      label: "SQLITE_HOST+INJECTED",
      fileLine: "src/services/grin/outbox/outbox.ts:1298-1313,1377-1378",
      evidence: `originalIdentityMatches(claimed A, returned claimed A, actual B)=${String(acceptEcho)}; processAttachments wrote uploadState=${e2aDurable?.uploadState} originalDurable=${String(e2aDurable?.originalDurable)} after port returned actualSha256=${e2aUploads[0]?.actualSha256?.slice(0, 8)}… claimedSha256=${e2aUploads[0]?.claimedSha256?.slice(0, 8)}…. Not a live Storage compromise.`,
    });
    record({
      id: "E2-null-local-claim-null-returned-hashes",
      reproduced: acceptNull === true && e2bDurable?.originalDurable === true && e2bDurable.uploadState === "verified",
      label: "SQLITE_HOST+INJECTED",
      fileLine: "src/services/grin/outbox/outbox.ts:1309-1313",
      evidence: `originalIdentityMatches(null claim, null returned hashes, matching ids)=${String(acceptNull)}; processAttachments wrote uploadState=${e2bDurable?.uploadState} originalDurable=${String(e2bDurable?.originalDurable)} with local claimedSha256=${String(e2bDurable?.claimedSha256)}.`,
    });

    const e3Server = createFakeGrinServerPort();
    const e3Port: GrinEvidenceUploadPort = {
      portKind: "FAKE",
      async upload(input) {
        return {
          ok: true,
          originalDurable: true,
          generation: "1700000000099",
          retryable: false,
          evidenceId: input.evidenceId,
          receiptId: input.receiptId,
          ledgerId: input.ledgerId,
          category: isWave1OriginalCategory(input.category) ? input.category : null,
          claimedSha256: HASH_A,
          actualSha256: HASH_B,
          reservationId: "resv_e3",
        };
      },
    };
    const e3Box = new GrinOutbox({ db, server: e3Server, evidence: e3Port });
    const sessionE3 = e3Box.beginOwnerSession("owner_e3");
    const repoE3 = new GrinApplicationRepository({
      outbox: e3Box,
      db,
      ownerUid: "owner_e3",
      ledgerId: GRIN_APPLICATION_LEDGER_ID,
      session: sessionE3,
    });
    const createdE3 = repoE3.createQueued(body(sampleRegisterBody, "grcp_e3", "E3 Supplier"));
    repoE3.attachOriginal({
      receiptId: "grcp_e3",
      category: "invoice",
      localPath: path.join(tmp, "e3-pack-original.jpg"),
      evidenceId: "ev_e3_invoice",
      claimedSha256: HASH_A,
      byteSize: 2048,
      mime: "image/png",
      fileName: "e3-pack-original.jpg",
    });
    await e3Box.dispatchDue(sessionE3, "worker_e3_reg");
    await e3Box.dispatchDue(sessionE3, "worker_e3_att");
    const columns = tableColumns(db, "grin_local_evidence_files");
    const e3Row = sqliteRow(db, "owner_e3", "ev_e3_invoice");
    const missingDescriptorCols = ["actual_sha256", "generation", "mime", "storage_path", "storage_object_generation"].filter(
      (name) => !columns.includes(name)
    );
    packOriginalBatches.length = 0;
    const packE3 = repoE3.exportPack("grcp_e3");
    const e3Listed = e3Box.listLocalFiles("owner_e3", GRIN_APPLICATION_LEDGER_ID, "grcp_e3").find(
      (file) => file.evidenceId === "ev_e3_invoice"
    );
    const mappedFromExport = packOriginalBatches.at(-1)?.find((row) => row.evidenceId === "ev_e3_invoice");
    const mapped = e3Listed ? productionToPackOriginalInput(e3Listed) : mappedFromExport;
    const repoSrc = fs.readFileSync(
      path.join(ROOT, "src/services/grin/repository/GrinApplicationRepository.ts"),
      "utf8"
    );
    const packMapperIsProduction =
      /generation: verified \? "verified" : null/.test(repoSrc) &&
      /rawSha256: file\.claimedSha256 \?\? ""/.test(repoSrc) &&
      /mime: mimeFromPath\(file\.localPath\)/.test(repoSrc) &&
      /originals: files\.filter\(\(file\) => file\.role === "original"\)\.map\(\(file\) => toPackOriginalInput\(file\)\)/.test(
        repoSrc
      );
    record({
      id: "E3-sqlite-lacks-actual-hash-generation",
      reproduced:
        e3Row != null &&
        e3Row.upload_state === "verified" &&
        Number(e3Row.original_durable) === 1 &&
        e3Row.claimed_sha256 === HASH_A &&
        missingDescriptorCols.length === 5 &&
        !("actual_sha256" in (e3Row ?? {})),
      label: "SQLITE_HOST",
      fileLine: "src/services/grin/outbox/outbox.ts:1409-1432 src/localDb/migrateGrin.ts:112-128",
      evidence: `after fake verified upload columns=${columns.join(",")}; row upload_state=${String(e3Row?.upload_state)} original_durable=${String(e3Row?.original_durable)} claimed_sha256=${String(e3Row?.claimed_sha256).slice(0, 8)}…; missing descriptor columns=${missingDescriptorCols.join(",")}. writeEvidenceUpload persisted upload_state/original_durable only.`,
    });
    record({
      id: "E3-toPackOriginalInput-synthetic-generation",
      reproduced:
        mapped?.generation === "verified" &&
        mapped.rawSha256 === HASH_A &&
        mapped.rawSha256 !== HASH_B &&
        mapped.mime === "image/jpeg" &&
        packMapperIsProduction &&
        mappedFromExport?.generation === "verified" &&
        packE3 != null,
      label: "SQLITE_HOST",
      fileLine: "src/services/grin/repository/GrinApplicationRepository.ts:577-591",
      evidence: `exportPack executed; production toPackOriginalInput (verified? "verified" / claimedSha256 / mimeFromPath) applied to sqlite-backed file: generation=${String(mapped?.generation)} rawSha256=${mapped?.rawSha256.slice(0, 8)}… (claimed A, not actual B) mime=${mapped?.mime} (path .jpg, attach mime image/png discarded). completenessLabel=${packE3?.completenessLabel}.`,
    });

    const pickerTypes = fs.readFileSync(
      path.join(ROOT, "node_modules/expo-image-picker/build/ImagePicker.types.d.ts"),
      "utf8"
    );
    const pickerPkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, "node_modules/expo-image-picker/package.json"), "utf8")
    ) as { version: string };
    const qualityDefault = /@default 1\.0[\s\S]{0,80}quality\?: number/.test(pickerTypes) || pickerTypes.includes("@default 1.0");
    const fileSizeOptional = pickerTypes.includes("fileSize?: number");
    const mediaTypeImages = pickerTypes.includes("'images'") && pickerTypes.includes("export type MediaType");
    const allowedPdf = (ALLOWED_ORIGINAL_MIME as readonly string[]).includes("application/pdf");

    installGrinScreenRuntime({
      useT: () => (key) => key,
      useThemedStyles: (factory) => factory(lightColors),
      useRouter: () => ({ back: () => undefined, push: () => undefined, replace: () => undefined }),
      useLocalSearchParams: <T extends Record<string, string | undefined>>() => ({}) as T,
      useFocusEffect: () => undefined,
      getPickerHostAppState: () => "active",
    });

    let injectedReturned: Awaited<ReturnType<typeof pickGrinOriginal>> = null;
    setGrinOriginalPickerForTests(async () => ({
      localPath: "file:///tmp/grin-t5-injected-only.jpg",
      mime: "image/jpeg",
      byteSize: 0,
      claimedSha256: null,
      fileName: "injected.jpg",
    }));
    injectedReturned = await pickGrinOriginal({ source: "library", category: "invoice" });
    resetGrinOriginalPickerForTests();

    function e4Perms(): { camera: boolean; library: boolean } {
      const g = globalThis as { __GRIN_T5_E4_PERMS__?: { camera: boolean; library: boolean } };
      if (!g.__GRIN_T5_E4_PERMS__) g.__GRIN_T5_E4_PERMS__ = { camera: true, library: true };
      return g.__GRIN_T5_E4_PERMS__;
    }
    e4Perms().camera = true;
    e4Perms().library = true;
    const libraryPicked = await pickGrinOriginal({ source: "library", category: "invoice" });
    const cameraPicked = await pickGrinOriginal({ source: "camera", category: "invoice" });
    const launches = ((globalThis as { __GRIN_T5_E4_LAUNCHES__?: Array<{ method: string; options: Record<string, unknown> }> })
      .__GRIN_T5_E4_LAUNCHES__ ?? []) as Array<{ method: string; options: Record<string, unknown> }>;
    const libraryOpts = launches.find((row) => row.method === "launchImageLibraryAsync")?.options;
    const cameraOpts = launches.find((row) => row.method === "launchCameraAsync")?.options;

    resetGrinApplicationRepositoryForTests();
    setGrinApplicationDbFactoryForTests(() => db as HostSqlite);
    setGrinServerPortFactoryForTests(() => createFakeGrinServerPort());
    const sessionE4 = startGrinOwnerSession("owner_e4");
    const repoE4 = getGrinApplicationRepository("owner_e4", sessionE4.dispatchGeneration);
    repoE4.createQueued(body(sampleRegisterBody, "grcp_e4", "E4 Supplier"));
    const attachedE4 = repoE4.attachOriginal({
      receiptId: "grcp_e4",
      category: "invoice",
      localPath: libraryPicked?.localPath ?? "file:///tmp/missing",
      claimedSha256: libraryPicked?.claimedSha256 ?? null,
      byteSize: libraryPicked?.byteSize,
      mime: libraryPicked?.mime,
      fileName: libraryPicked?.fileName,
      evidenceId: "ev_e4_library",
    });
    const e4Row = sqliteRow(db, "owner_e4", "ev_e4_library");

    e4Perms().camera = false;
    let permissionError: string | null = null;
    try {
      resetGrinOriginalPickerForTests();
      await pickGrinOriginal({ source: "camera", category: "invoice" });
    } catch (err) {
      permissionError = err instanceof Error ? err.message : String(err);
    }

    const pdfLaunch = launches.some((row) => JSON.stringify(row.options).toLowerCase().includes("pdf"));
    record({
      id: "E4-picker-images-quality-uri-null-hash-size0",
      reproduced:
        pickerPkg.version === "17.0.11" &&
        qualityDefault &&
        fileSizeOptional &&
        mediaTypeImages &&
        allowedPdf &&
        injectedReturned?.claimedSha256 === null &&
        injectedReturned?.byteSize === 0 &&
        libraryOpts?.quality === 0.8 &&
        JSON.stringify(libraryOpts?.mediaTypes) === JSON.stringify(["images"]) &&
        libraryOpts?.base64 === false &&
        cameraOpts?.quality === 0.8 &&
        libraryPicked?.claimedSha256 === null &&
        libraryPicked?.byteSize === 0 &&
        libraryPicked?.localPath.startsWith("file://") === true &&
        cameraPicked?.byteSize === 0 &&
        Number(e4Row?.byte_size) === 0 &&
        e4Row?.claimed_sha256 == null &&
        attachedE4.completeness === "not_complete" &&
        permissionError === "permission" &&
        pdfLaunch === false,
      label: "HOST_FILESYSTEM+SQLITE_HOST",
      fileLine: "src/screens/grin/grinOriginalPicker.ts:53-102",
      evidence: `pinned expo-image-picker@${pickerPkg.version}; types quality default 1.0=${String(qualityDefault)} fileSize optional=${String(fileSizeOptional)}; productionPick library opts quality=${String(libraryOpts?.quality)} mediaTypes=${JSON.stringify(libraryOpts?.mediaTypes)} base64=${String(libraryOpts?.base64)}; injected claimedSha256=${String(injectedReturned?.claimedSha256)} byteSize=${injectedReturned?.byteSize}; productionPick library uri=${libraryPicked?.localPath} claimedSha256=${String(libraryPicked?.claimedSha256)} byteSize=${libraryPicked?.byteSize}; sqlite byte_size=${String(e4Row?.byte_size)} claimed_sha256=${String(e4Row?.claimed_sha256)}; camera permission error=${permissionError}; pdf in launch options=${String(pdfLaunch)}; ALLOWED_ORIGINAL_MIME includes application/pdf=${String(allowedPdf)}. NATIVE_DEVICE not claimed.`,
    });

    const wave1 = [...WAVE1_ORIGINAL_CATEGORIES];
    const omittedRejected: string[] = [];
    const omittedAttachErrors: Record<string, string> = {};
    resetGrinApplicationRepositoryForTests();
    setGrinApplicationDbFactoryForTests(() => db as HostSqlite);
    setGrinServerPortFactoryForTests(() => createFakeGrinServerPort());
    const sessionE5 = startGrinOwnerSession("owner_e5");
    const repoE5 = getGrinApplicationRepository("owner_e5", sessionE5.dispatchGeneration);
    repoE5.createQueued(body(sampleRegisterBody, "grcp_e5", "E5 Supplier"));
    for (const category of OMITTED_CATEGORIES) {
      if (!isWave1OriginalCategory(category)) omittedRejected.push(category);
      try {
        repoE5.attachOriginal({
          receiptId: "grcp_e5",
          category: category as never,
          localPath: path.join(tmp, `${category}.pdf`),
          claimedSha256: HASH_A,
          byteSize: 12,
          mime: "application/pdf",
          fileName: `${category}.pdf`,
          evidenceId: `ev_e5_${category}`,
        });
      } catch (err) {
        omittedAttachErrors[category] = err instanceof Error ? err.message : String(err);
      }
    }
    repoE5.attachOriginal({
      receiptId: "grcp_e5",
      category: "invoice",
      localPath: path.join(tmp, "invoice.pdf"),
      claimedSha256: HASH_A,
      byteSize: 12,
      mime: "application/pdf",
      fileName: "invoice.pdf",
      evidenceId: "ev_e5_invoice",
    });
    const packFromRepo = repoE5.exportPack("grcp_e5");
    const e5Record = repoE5.get("grcp_e5");
    assert.ok(e5Record);
    const policyPack = assembleEvidencePackInputs({
      ownerUid: "owner_e5",
      ledgerId: GRIN_APPLICATION_LEDGER_ID,
      purchaseCaseId: "case-grcp_e5",
      confirmedCuts: [
        {
          receiptId: "grcp_e5",
          events: [],
          originalSnapshot: e5Record.original,
          eventVersion: 1,
          headHash: HASH_A,
        },
      ],
      originals: OMITTED_CATEGORIES.map((category) => ({
        evidenceId: `ev_policy_${category}`,
        ownerUid: "owner_e5",
        ledgerId: GRIN_APPLICATION_LEDGER_ID,
        receiptId: "grcp_e5",
        category,
        mime: "application/pdf",
        byteSize: 12,
        rawSha256: HASH_A,
        generation: "1700000000777",
        originalFileName: `${category}.pdf`,
        state: "verified",
      })),
    });
    const stockOk = originalSupportsItem(
      {
        evidenceId: "ev_policy_stock_accounting",
        category: "stock_accounting",
        originalFileName: "stock_accounting.pdf",
        mime: "application/pdf",
        byteSize: 12,
        rawSha256: HASH_A,
        storageObjectGeneration: "1700000000777",
        captureProvenance: "t5-policy",
        osConversionOccurred: false,
        verification: "verified",
        isDerivative: false,
      },
      "accounting_payment_evidence"
    );
    const gstOk = originalSupportsItem(
      {
        evidenceId: "ev_policy_gst",
        category: "gst",
        originalFileName: "gst.pdf",
        mime: "application/pdf",
        byteSize: 12,
        rawSha256: HASH_A,
        storageObjectGeneration: "1700000000777",
        captureProvenance: "t5-policy",
        osConversionOccurred: false,
        verification: "verified",
        isDerivative: false,
      },
      "gst_evidence"
    );
    const paymentOk = originalSupportsItem(
      {
        evidenceId: "ev_policy_payment",
        category: "payment",
        originalFileName: "payment.pdf",
        mime: "application/pdf",
        byteSize: 12,
        rawSha256: HASH_A,
        storageObjectGeneration: "1700000000777",
        captureProvenance: "t5-policy",
        osConversionOccurred: false,
        verification: "verified",
        isDerivative: false,
      },
      "accounting_payment_evidence"
    );
    const admittedSrc = fs.readFileSync(
      path.join(ROOT, "src/screens/grin/GrinAttachmentsAdmittedBody.tsx"),
      "utf8"
    );
    const uiUsesWave1 = admittedSrc.includes("WAVE1_ORIGINAL_CATEGORIES") && admittedSrc.includes("categoryOptions");
    const attachThrowsAll = OMITTED_CATEGORIES.every((category) => omittedAttachErrors[category] === "invalid_evidence_category");
    const policyKnows = stockOk.ok && gstOk.ok && paymentOk.ok;
    const policyAcceptedIds = policyPack.verifiedOriginals.map((row) => row.evidenceId).sort();
    const returnInPackType =
      policyAcceptedIds.includes("ev_policy_return_document") &&
      policyPack.missingOrUnverifiable.every(
        (reason) => !reason.includes("ev_policy_return_document category is not a known evidence category")
      );
    record({
      id: "E5-wave1-omits-pack-policy-categories",
      reproduced:
        omittedRejected.length === 4 &&
        attachThrowsAll &&
        uiUsesWave1 &&
        wave1.includes("invoice") &&
        !wave1.includes("stock_accounting") &&
        policyKnows &&
        stockOk.ok &&
        gstOk.ok &&
        paymentOk.ok &&
        returnInPackType &&
        packFromRepo?.completenessLabel === "incomplete",
      label: "SQLITE_HOST",
      fileLine: "src/goodsEvidence/evidence.ts:38-47 src/screens/grin/GrinAttachmentsAdmittedBody.tsx:31,107 src/goodsEvidence/evidenceSupport.ts:51-57",
      evidence: `WAVE1=${wave1.join(",")}; omitted not Wave1=${omittedRejected.join(",")}; attachOriginal errors=${JSON.stringify(omittedAttachErrors)}; UI uses WAVE1_ORIGINAL_CATEGORIES=${String(uiUsesWave1)}; policy originalSupportsItem stock=${stockOk.ok} payment=${paymentOk.ok} gst=${gstOk.ok}; pack-input isEvidenceCategory accepts return_document (no unknown-category miss)=${String(returnInPackType)}; repository exportPack completeness=${packFromRepo?.completenessLabel} missingOriginal=${String(packFromRepo?.missingOriginal)}. App attach path cannot supply stock_accounting/payment/gst/return_document.`,
    });

    const reproduced = results.filter((row) => row.reproduced).map((row) => row.id);
    const notReproduced = results.filter((row) => !row.reproduced).map((row) => row.id);
    console.log(`REPRODUCED=${reproduced.join(",") || "none"}`);
    console.log(`NOT_REPRODUCED=${notReproduced.join(",") || "none"}`);
    console.log(`NATIVE_DEVICE=not_claimed`);
    console.log(`LIVE_STORAGE=not_claimed`);
    console.log(`FUNCTIONS_EXPORT=not_run`);
    console.log(`EAS_PLAY_FLAGS=not_run`);
  } finally {
    try {
      db?.close?.();
    } catch {
      // ignore
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    resetGrinOriginalPickerForTests();
    resetGrinApplicationRepositoryForTests();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
