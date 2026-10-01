/**
 * SQLITE_HOST adapter: real SQLite (Python stdlib sqlite3) with the expo-sqlite
 * sync surface. Host process restart is not NATIVE_DEVICE process-death proof.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SQLITE_HOST = "SQLITE_HOST" as const;
export const NATIVE_DEVICE = "NATIVE_DEVICE" as const;
export const MAP_STANDIN = "MAP_STANDIN" as const;

export type SqliteExecutionLabel = typeof SQLITE_HOST | typeof NATIVE_DEVICE | typeof MAP_STANDIN;

export type GrinSqlDb = {
  runSync: (sql: string, params?: unknown[]) => { changes: number };
  getFirstSync: <T>(sql: string, params?: unknown[]) => T | null;
  getAllSync: <T>(sql: string, params?: unknown[]) => T[];
  execSync: (sql: string) => void;
  withTransactionSync: (fn: () => void) => void;
  close?: () => void;
  executionLabel?: SqliteExecutionLabel;
};

type BridgeOk = {
  ok: boolean;
  error?: string;
  changes?: number;
  row?: Record<string, unknown> | null;
  rows?: Record<string, unknown>[];
  ready?: boolean;
  engine?: string;
};

const waitBuf = new Int32Array(new SharedArrayBuffer(4));

function sleepMs(ms: number): void {
  Atomics.wait(waitBuf, 0, 0, ms);
}

function waitForFile(filePath: string, timeoutMs: number): void {
  const start = Date.now();
  while (!fs.existsSync(filePath)) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`SQLITE_HOST timeout waiting for ${path.basename(filePath)}`);
    }
    sleepMs(1);
  }
}

function readJson(filePath: string): BridgeOk {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as BridgeOk;
}

export class HostSqlite implements GrinSqlDb {
  readonly executionLabel = SQLITE_HOST;
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly ipcDir: string;
  private seq = 0;
  private txDepth = 0;
  private closed = false;

  constructor(private readonly dbPath: string) {
    this.ipcDir = `${dbPath}.ipc`;
    fs.rmSync(this.ipcDir, { recursive: true, force: true });
    fs.mkdirSync(this.ipcDir, { recursive: true });
    const bridge = path.join(path.dirname(fileURLToPath(import.meta.url)), "sqliteHostBridge.py");
    this.child = spawn("python3", ["-u", bridge, dbPath, this.ipcDir], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    this.child.stderr.setEncoding("utf8");
    let stderr = "";
    this.child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    try {
      waitForFile(path.join(this.ipcDir, "ready.json"), 8_000);
    } catch (e) {
      this.child.kill();
      throw new Error(`${(e as Error).message}${stderr ? `: ${stderr}` : ""}`);
    }
    const hello = readJson(path.join(this.ipcDir, "ready.json"));
    if (!hello.ok || hello.engine !== SQLITE_HOST) {
      this.child.kill();
      throw new Error(`SQLITE_HOST handshake failed: ${hello.error ?? "no ready"}`);
    }
  }

  get path(): string {
    return this.dbPath;
  }

  execSync(sql: string): void {
    const res = this.rpc({ op: "exec", sql });
    if (!res.ok) throw new Error(res.error ?? "exec failed");
  }

  runSync(sql: string, params?: unknown[]): { changes: number } {
    const res = this.rpc({ op: "run", sql, params: params ?? [] });
    if (!res.ok) throw new Error(res.error ?? "run failed");
    return { changes: Number(res.changes ?? 0) };
  }

  getFirstSync<T>(sql: string, params?: unknown[]): T | null {
    const res = this.rpc({ op: "get", sql, params: params ?? [] });
    if (!res.ok) throw new Error(res.error ?? "get failed");
    return (res.row as T | null) ?? null;
  }

  getAllSync<T>(sql: string, params?: unknown[]): T[] {
    const res = this.rpc({ op: "all", sql, params: params ?? [] });
    if (!res.ok) throw new Error(res.error ?? "all failed");
    return (res.rows as T[]) ?? [];
  }

  withTransactionSync(fn: () => void): void {
    const outer = this.txDepth === 0;
    if (outer) {
      const res = this.rpc({ op: "begin" });
      if (!res.ok) throw new Error(res.error ?? "begin failed");
    }
    this.txDepth += 1;
    try {
      fn();
      this.txDepth -= 1;
      if (outer) {
        const res = this.rpc({ op: "commit" });
        if (!res.ok) throw new Error(res.error ?? "commit failed");
      }
    } catch (e) {
      this.txDepth -= 1;
      if (outer) {
        try {
          this.rpc({ op: "rollback" });
        } catch {
          // Keep the original error; rollback is best-effort.
        }
      }
      throw e;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.rpc({ op: "close" });
    } catch {
      // process may already be gone
    }
    try {
      this.child.kill();
    } catch {
      // ignore
    }
  }

  private rpc(msg: Record<string, unknown>): BridgeOk {
    if (this.closed) throw new Error("SQLITE_HOST closed");
    const reqPath = path.join(this.ipcDir, `${this.seq}.req`);
    const resPath = path.join(this.ipcDir, `${this.seq}.res`);
    const tmp = `${reqPath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(msg), "utf8");
    fs.renameSync(tmp, reqPath);
    waitForFile(resPath, 15_000);
    const parsed = readJson(resPath);
    try {
      fs.unlinkSync(resPath);
    } catch {
      // ignore
    }
    this.seq += 1;
    return parsed;
  }
}

export function openHostSqlite(dbPath: string): HostSqlite {
  return new HostSqlite(dbPath);
}
