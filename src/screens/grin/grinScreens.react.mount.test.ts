/**
 * Mounted React GRIN admission + session wiring.
 *
 * Renders GrinAdmittedSessionHost with react-dom createRoot and inert child
 * surfaces. SQLITE_HOST backs the session lifecycle. Not native screens.
 *
 * Boundaries:
 * - mocked: native Screen/FlatList/TalkBack, Expo Router, AuthProvider
 * - mounted: GrinAdmittedSessionHost (production admission-before-children)
 * - rendered: inert child probe, not native GRIN screens
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
import { __setRuntimeSignalsForTests } from "@/config/env";
import { sampleRegisterBody } from "@/goodsEvidence/testFixtures";
import { openHostSqlite, SQLITE_HOST, type HostSqlite } from "@/services/grin/outbox/hostSqlite";
import { SQLITE_HOST_NOT_NATIVE_DEVICE } from "@/services/grin/outbox/types";
import type { GrinDispatchSession } from "@/services/grin/outbox/types";
import {
  requireLiveGrinApplicationRepository,
  resetGrinApplicationRepositoryForTests,
  retireGrinOwnerSession,
  setGrinApplicationDbFactoryForTests,
  setGrinEvidencePortFactoryForTests,
  setGrinServerPortFactoryForTests,
} from "@/services/grin/repository";
import { createUninjectedGrinEvidencePort, createUninjectedGrinServerPort } from "@/services/grin/repository/uninjectedServer";

import { GrinAdmittedSessionHost } from "./GrinAdmittedSessionHost";

const prevFlag = process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
const prevAdmit = process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
const prevMode = process.env.EXPO_PUBLIC_APP_MODE;

function restoreEnv(): void {
  __setRuntimeSignalsForTests(null);
  if (prevFlag == null) delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
  else process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = prevFlag;
  if (prevAdmit == null) delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
  else process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT = prevAdmit;
  if (prevMode == null) delete process.env.EXPO_PUBLIC_APP_MODE;
  else process.env.EXPO_PUBLIC_APP_MODE = prevMode;
}

function setExpoGoDev(): void {
  __setRuntimeSignalsForTests({
    appOwnership: "expo",
    isDev: true,
    platform: "ios",
  });
  process.env.EXPO_PUBLIC_APP_MODE = "development";
}

function setStoreRuntime(): void {
  __setRuntimeSignalsForTests({
    appOwnership: "standalone",
    isDev: false,
    platform: "android",
  });
  process.env.EXPO_PUBLIC_APP_MODE = "production";
}

async function main(): Promise<void> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grin-t4-mount-"));
  const dbPath = path.join(tmp, "grin-mount.sqlite");
  let db: HostSqlite | null = null;
  let root: Root | null = null;
  const factoryCalls: string[] = [];
  const childMounts: GrinDispatchSession[] = [];
  let capturedCreate: (() => void) | null = null;
  const gateStates: string[] = [];

  try {
    db = openHostSqlite(dbPath);
    assert.equal(db.executionLabel, SQLITE_HOST);
    console.log(`SQLITE_EXECUTION=${SQLITE_HOST}`);
    console.log(`NATIVE_DEVICE=not_claimed (${SQLITE_HOST_NOT_NATIVE_DEVICE})`);

    setGrinApplicationDbFactoryForTests(() => {
      factoryCalls.push("db");
      return db as HostSqlite;
    });
    const serverFactoryCalls: string[] = [];
    const evidenceFactoryCalls: string[] = [];
    setGrinServerPortFactoryForTests(() => {
      serverFactoryCalls.push("server");
      return createUninjectedGrinServerPort();
    });
    setGrinEvidencePortFactoryForTests(() => {
      evidenceFactoryCalls.push("evidence");
      return createUninjectedGrinEvidencePort();
    });

    const container = createMountContainer();
    root = createRoot(container);

    function HostTree(props: { ownerUid: string | null }): React.ReactElement {
      return React.createElement(GrinAdmittedSessionHost, {
        ownerUid: props.ownerUid,
        renderBlocked: () => {
          gateStates.push("blocked");
          return React.createElement("div", { "data-state": "blocked" }, "blocked");
        },
        renderUnavailable: () => {
          gateStates.push("unavailable");
          return React.createElement("div", { "data-state": "unavailable" }, "unavailable");
        },
        children: (session: GrinDispatchSession) => {
          childMounts.push(session);
          if (!capturedCreate) {
            const repo = requireLiveGrinApplicationRepository();
            capturedCreate = () =>
              repo.createQueued(
                sampleRegisterBody({
                  receiptId: "grcp_stale_mount",
                  supplier: {
                    name: { kind: "present", value: "Stale mount" },
                    registration: { kind: "unregistered" },
                    address: { kind: "not_supplied" },
                    contact: { kind: "not_supplied" },
                  },
                })
              );
          }
          return React.createElement("div", { "data-state": "admitted", "data-uid": session.ownerUid }, session.ownerUid);
        },
      });
    }

    process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = "1";
    setStoreRuntime();
    delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
    await act(async () => {
      root!.render(React.createElement(HostTree, { ownerUid: "owner_a" }));
    });
    assert.equal(childMounts.length, 0, "store block must not mount admitted children");
    assert.equal(factoryCalls.length, 0, "store block must not open the repository database");
    assert.equal(serverFactoryCalls.length, 0, "store block must not construct a server port");
    assert.equal(evidenceFactoryCalls.length, 0, "store block must not construct an evidence port");
    assert.equal(gateStates[gateStates.length - 1], "blocked");

    setExpoGoDev();
    delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
    await act(async () => {
      root!.render(React.createElement(HostTree, { ownerUid: "owner_a" }));
    });
    assert.equal(childMounts.length, 0, "flag off must not mount admitted children");
    assert.equal(factoryCalls.length, 0, "flag off must not start a session");
    assert.equal(serverFactoryCalls.length, 0, "flag off must not construct a server port");
    assert.equal(evidenceFactoryCalls.length, 0, "flag off must not construct an evidence port");
    assert.equal(gateStates[gateStates.length - 1], "unavailable");

    process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = "1";
    await act(async () => {
      root!.render(React.createElement(HostTree, { ownerUid: "owner_a" }));
    });
    assert.equal(childMounts.length, 1);
    assert.equal(childMounts[0]?.ownerUid, "owner_a");
    assert.equal(factoryCalls.length >= 1, true);
    assert.equal(serverFactoryCalls.length >= 1, true, "admitted session must use the injected FAKE port");
    assert.equal(evidenceFactoryCalls.length >= 1, true, "admitted session must use the injected evidence port");
    const genA = childMounts[0]!.dispatchGeneration;
    assert.ok(capturedCreate);

    await act(async () => {
      root!.render(React.createElement(HostTree, { ownerUid: "owner_b" }));
    });
    const latest = childMounts[childMounts.length - 1];
    assert.equal(latest?.ownerUid, "owner_b");
    assert.throws(() => capturedCreate!());
    const listedB = requireLiveGrinApplicationRepository().list();
    assert.equal(
      listedB.some((item) => item.receiptId === "grcp_stale_mount"),
      false,
      "stale A callback must not queue after B is current"
    );
    const createdB = requireLiveGrinApplicationRepository().createQueued(
      sampleRegisterBody({
        receiptId: "grcp_mount_b",
        supplier: {
          name: { kind: "present", value: "Live B" },
          registration: { kind: "unregistered" },
          address: { kind: "not_supplied" },
          contact: { kind: "not_supplied" },
        },
      })
    );
    assert.equal(createdB.ownerUid, "owner_b");
    assert.equal(createdB.issuedNumber, null);

    capturedCreate = null;
    await act(async () => {
      root!.render(React.createElement(HostTree, { ownerUid: null }));
    });
    assert.throws(() => requireLiveGrinApplicationRepository());

    await act(async () => {
      root!.render(React.createElement(HostTree, { ownerUid: "owner_a" }));
    });
    const relogin = childMounts[childMounts.length - 1];
    assert.equal(relogin?.ownerUid, "owner_a");
    assert.notEqual(relogin?.dispatchGeneration, genA);

    process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = "1";
    process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT = "1";
    setStoreRuntime();
    await act(async () => {
      root!.render(React.createElement(HostTree, { ownerUid: "owner_internal" }));
    });
    const internal = childMounts[childMounts.length - 1];
    assert.equal(internal?.ownerUid, "owner_internal", "Internal-GRIN flags must open the module");

    delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
    await act(async () => {
      root!.render(React.createElement(HostTree, { ownerUid: "owner_internal" }));
    });
    assert.equal(gateStates[gateStates.length - 1], "blocked");
    assert.throws(() => requireLiveGrinApplicationRepository());
  } finally {
    await act(async () => {
      root?.unmount();
    });
    retireGrinOwnerSession();
    resetGrinApplicationRepositoryForTests();
    try {
      db?.close();
    } catch {
      // ignore
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    restoreEnv();
  }

  console.log("grinScreens.react.mount.test.ts: ok");
}

void main();
