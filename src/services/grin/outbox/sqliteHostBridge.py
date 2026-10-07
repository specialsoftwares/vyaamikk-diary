#!/usr/bin/env python3
"""SQLITE_HOST bridge: real SQLite via Python stdlib. Not NATIVE_DEVICE."""
from __future__ import annotations

import json
import os
import sqlite3
import sys
import time


def convert_params(params: object) -> list[object]:
    if params is None:
        return []
    if not isinstance(params, list):
        raise TypeError("params must be a list")
    out: list[object] = []
    for p in params:
        if p is True:
            out.append(1)
        elif p is False:
            out.append(0)
        else:
            out.append(p)
    return out


def row_to_dict(row: sqlite3.Row | None) -> dict[str, object] | None:
    if row is None:
        return None
    return {k: row[k] for k in row.keys()}


def write_json(path: str, obj: object) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, default=str)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def main() -> None:
    if len(sys.argv) < 3:
        sys.stderr.write("db path and ipc dir required\n")
        sys.exit(2)
    db_path = sys.argv[1]
    ipc_dir = sys.argv[2]
    os.makedirs(ipc_dir, exist_ok=True)
    conn = sqlite3.connect(db_path, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    write_json(os.path.join(ipc_dir, "ready.json"), {"ok": True, "ready": True, "engine": "SQLITE_HOST"})
    seq = 0
    while True:
        req_path = os.path.join(ipc_dir, f"{seq}.req")
        if not os.path.exists(req_path):
            time.sleep(0.001)
            continue
        with open(req_path, encoding="utf-8") as f:
            msg = json.load(f)
        try:
            os.remove(req_path)
        except OSError:
            pass
        op = msg.get("op")
        try:
            if op == "exec":
                conn.execute(msg["sql"])
                result: dict[str, object] = {"ok": True}
            elif op == "run":
                cur = conn.execute(msg["sql"], convert_params(msg.get("params")))
                result = {"ok": True, "changes": cur.rowcount if cur.rowcount is not None else 0}
            elif op == "get":
                cur = conn.execute(msg["sql"], convert_params(msg.get("params")))
                result = {"ok": True, "row": row_to_dict(cur.fetchone())}
            elif op == "all":
                cur = conn.execute(msg["sql"], convert_params(msg.get("params")))
                result = {"ok": True, "rows": [row_to_dict(r) for r in cur.fetchall()]}
            elif op == "begin":
                conn.execute("BEGIN IMMEDIATE")
                result = {"ok": True}
            elif op == "commit":
                conn.execute("COMMIT")
                result = {"ok": True}
            elif op == "rollback":
                conn.execute("ROLLBACK")
                result = {"ok": True}
            elif op == "close":
                conn.close()
                write_json(os.path.join(ipc_dir, f"{seq}.res"), {"ok": True})
                return
            else:
                result = {"ok": False, "error": f"unknown op {op}"}
        except Exception as e:
            result = {"ok": False, "error": str(e)}
        write_json(os.path.join(ipc_dir, f"{seq}.res"), result)
        seq += 1


if __name__ == "__main__":
    main()
