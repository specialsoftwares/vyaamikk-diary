/**
 * In-memory SQL stand-in for Node/CI repository tests.
 * Not a full SQLite engine and not used on device.
 */

export type SqlParams = unknown[] | undefined;

interface Table {
  columns: string[];
  pk: string | null;
  rows: Record<string, unknown>[];
}

function cloneRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => ({ ...r }));
}

function cloneTables(tables: Map<string, Table>): Map<string, Table> {
  const next = new Map<string, Table>();
  for (const [name, table] of tables) {
    next.set(name, {
      columns: [...table.columns],
      pk: table.pk,
      rows: cloneRows(table.rows),
    });
  }
  return next;
}

function unquote(ident: string): string {
  return ident.replace(/["'`]/g, "").trim();
}

function parseCreateTable(sql: string): { name: string; columns: string[]; pk: string | null } | null {
  const m = sql.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]+)\)/i);
  if (!m) return null;
  const name = m[1]!;
  const body = m[2]!;
  const columns: string[] = [];
  let pk: string | null = null;
  for (const part of body.split(",")) {
    const trimmed = part.trim();
    if (!trimmed || /^PRIMARY KEY/i.test(trimmed) || /^UNIQUE/i.test(trimmed) || /^FOREIGN/i.test(trimmed)) {
      continue;
    }
    const col = trimmed.split(/\s+/)[0];
    if (!col) continue;
    columns.push(col);
    if (/\bPRIMARY KEY\b/i.test(trimmed) && !pk) pk = col;
  }
  return { name, columns, pk: pk ?? columns[0] ?? null };
}

function likeMatch(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

function coerce(value: unknown): unknown {
  return value === undefined ? null : value;
}

function evalExpr(
  row: Record<string, unknown>,
  expr: string,
  params: unknown[],
  cursor: { i: number }
): unknown {
  const trimmed = expr.trim();
  if (trimmed === "?") {
    const v = params[cursor.i++];
    return coerce(v);
  }
  if (/^null$/i.test(trimmed)) return null;
  const num = Number(trimmed);
  if (/^-?\d+(\.\d+)?$/.test(trimmed) && Number.isFinite(num)) return num;
  const str = trimmed.match(/^'(.*)'$/s);
  if (str) return str[1]!.replace(/''/g, "'");
  const coalesce = trimmed.match(/^COALESCE\((\w+)\s*,\s*(.+)\)$/i);
  if (coalesce) {
    const left = row[coalesce[1]!];
    if (left !== null && left !== undefined) return left;
    return evalExpr(row, coalesce[2]!, params, cursor);
  }
  return row[trimmed];
}

function evalCondition(
  row: Record<string, unknown>,
  cond: string,
  params: unknown[],
  cursor: { i: number }
): boolean {
  const isNull = cond.match(/^(\w+)\s+IS\s+NULL$/i);
  if (isNull) return row[isNull[1]!] == null;
  const isNotNull = cond.match(/^(\w+)\s+IS\s+NOT\s+NULL$/i);
  if (isNotNull) return row[isNotNull[1]!] != null;
  const like = cond.match(/^(.+?)\s+LIKE\s+(.+)$/i);
  if (like) {
    const left = String(evalExpr(row, like[1]!, params, cursor) ?? "");
    const right = String(evalExpr(row, like[2]!, params, cursor) ?? "");
    return likeMatch(left, right);
  }
  const eq = cond.match(/^(.+?)\s*=\s*(.+)$/);
  if (eq) {
    const left = evalExpr(row, eq[1]!, params, cursor);
    const right = evalExpr(row, eq[2]!, params, cursor);
    return left === right || String(left) === String(right);
  }
  const ne = cond.match(/^(.+?)\s*!=\s*(.+)$/);
  if (ne) {
    const left = evalExpr(row, ne[1]!, params, cursor);
    const right = evalExpr(row, ne[2]!, params, cursor);
    return left !== right && String(left) !== String(right);
  }
  return true;
}

function splitTopLevel(expr: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  if (sep === ",") {
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i]!;
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (depth === 0 && ch === ",") {
        parts.push(buf.trim());
        buf = "";
        continue;
      }
      buf += ch;
    }
    if (buf.trim()) parts.push(buf.trim());
    return parts;
  }
  const upper = sep.toUpperCase();
  for (let i = 0; i < expr.length; ) {
    const ch = expr[i]!;
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (depth === 0 && expr.slice(i).toUpperCase().startsWith(` ${upper} `)) {
      parts.push(buf.trim());
      buf = "";
      i += sep.length + 2;
      continue;
    }
    buf += ch;
    i += 1;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function evalWhere(
  row: Record<string, unknown>,
  where: string,
  params: unknown[],
  cursor: { i: number }
): boolean {
  const trimmed = where.trim();
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return evalWhere(row, trimmed.slice(1, -1), params, cursor);
  }
  const orParts = splitTopLevel(trimmed, "OR");
  if (orParts.length > 1) {
    return orParts.some((part) => evalWhere(row, part, params, cursor));
  }
  const andParts = splitTopLevel(trimmed, "AND");
  return andParts.every((part) => evalCondition(row, part, params, cursor));
}

function parseSelect(sql: string): {
  columns: string[] | "*";
  table: string;
  where: string | null;
  orderBy: { col: string; dir: "ASC" | "DESC" } | null;
  limit: string | null;
} | null {
  const m = sql.match(
    /^SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER BY\s+(\w+)(?:\s+(ASC|DESC))?)?(?:\s+LIMIT\s+(\?|\d+))?\s*$/i
  );
  if (!m) return null;
  const colsRaw = m[1]!.trim();
  return {
    columns: colsRaw === "*" ? "*" : colsRaw.split(",").map((c) => c.trim()),
    table: m[2]!,
    where: m[3] ? m[3].trim() : null,
    orderBy: m[4] ? { col: m[4], dir: (m[5]?.toUpperCase() as "ASC" | "DESC") || "ASC" } : null,
    limit: m[6] ?? null,
  };
}

export class MemorySqlite {
  private tables = new Map<string, Table>();
  private txDepth = 0;
  private txSnapshot: Map<string, Table> | null = null;

  execSync(sql: string): void {
    for (const part of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)) {
      this.execOne(part);
    }
  }

  runSync(sql: string, params?: SqlParams): void {
    this.execOne(sql.trim().replace(/;$/, ""), params ?? []);
  }

  getFirstSync<T>(sql: string, params?: SqlParams): T | null {
    const rows = this.getAllSync<T>(sql, params);
    return rows[0] ?? null;
  }

  getAllSync<T>(sql: string, params?: SqlParams): T[] {
    return this.select(sql.trim().replace(/;$/, ""), params ?? []) as T[];
  }

  withTransactionSync(fn: () => void): void {
    const outer = this.txDepth === 0;
    if (outer) this.txSnapshot = cloneTables(this.tables);
    this.txDepth += 1;
    try {
      fn();
      this.txDepth -= 1;
      if (outer) this.txSnapshot = null;
    } catch (e) {
      this.txDepth -= 1;
      if (outer && this.txSnapshot) {
        this.tables = this.txSnapshot;
        this.txSnapshot = null;
      }
      throw e;
    }
  }

  private table(name: string): Table {
    const t = this.tables.get(name);
    if (!t) throw new Error(`no such table: ${name}`);
    return t;
  }

  private execOne(sql: string, params: unknown[] = []): void {
    const normalized = sql.replace(/\s+/g, " ").trim();
    if (!normalized || normalized.startsWith("--")) return;
    if (/^PRAGMA /i.test(normalized)) return;
    if (/^CREATE INDEX /i.test(normalized) || /^CREATE UNIQUE INDEX /i.test(normalized)) return;
    if (/^DROP INDEX /i.test(normalized)) return;

    const create = parseCreateTable(normalized);
    if (create) {
      if (!this.tables.has(create.name)) {
        this.tables.set(create.name, {
          columns: create.columns,
          pk: create.pk,
          rows: [],
        });
      }
      return;
    }

    const alter = normalized.match(/^ALTER TABLE (\w+) ADD COLUMN (\w+)\s+(.+)$/i);
    if (alter) {
      const table = this.table(alter[1]!);
      const col = alter[2]!;
      if (!table.columns.includes(col)) table.columns.push(col);
      const def = alter[3]!.match(/DEFAULT\s+(\S+)/i);
      const defaultValue = def
        ? evalExpr({}, def[1]!.replace(/,$/, ""), [], { i: 0 })
        : null;
      for (const row of table.rows) {
        if (!(col in row)) row[col] = defaultValue;
      }
      return;
    }

    if (/^INSERT /i.test(normalized)) {
      this.insert(normalized, params);
      return;
    }
    if (/^UPDATE /i.test(normalized)) {
      this.update(normalized, params);
      return;
    }
    if (/^DELETE /i.test(normalized)) {
      this.delete(normalized, params);
      return;
    }
    if (/^SELECT /i.test(normalized)) {
      this.select(normalized, params);
      return;
    }
    throw new Error(`unsupported SQL: ${normalized.slice(0, 120)}`);
  }

  private insert(sql: string, params: unknown[]): void {
    const replace = /^INSERT OR REPLACE INTO/i.test(sql);
    const m = sql.match(/^INSERT(?: OR REPLACE)? INTO (\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (!m) throw new Error(`unsupported INSERT: ${sql}`);
    const table = this.table(m[1]!);
    const cols = m[2]!.split(",").map((c) => unquote(c));
    const placeholders = m[3]!.split(",").map((c) => c.trim());
    const cursor = { i: 0 };
    const row: Record<string, unknown> = {};
    for (const col of table.columns) row[col] = null;
    for (let i = 0; i < cols.length; i++) {
      row[cols[i]!] = evalExpr({}, placeholders[i] ?? "NULL", params, cursor);
    }
    if (replace && table.pk) {
      const key = row[table.pk];
      const idx = table.rows.findIndex((r) => r[table.pk!] === key);
      if (idx >= 0) {
        table.rows[idx] = row;
        return;
      }
    }
    table.rows.push(row);
  }

  private update(sql: string, params: unknown[]): void {
    const m = sql.match(/^UPDATE (\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i);
    if (!m) throw new Error(`unsupported UPDATE: ${sql}`);
    const table = this.table(m[1]!);
    const assignments = splitTopLevel(m[2]!, ",");
    const where = m[3] ?? null;
    const cursor = { i: 0 };
    const computed: { col: string; expr: string }[] = [];
    for (const a of assignments) {
      const eq = a.match(/^(\w+)\s*=\s*(.+)$/);
      if (!eq) continue;
      computed.push({ col: eq[1]!, expr: eq[2]! });
    }
    const paramValues: unknown[] = [];
    for (const c of computed) {
      if (c.expr.includes("?") && c.expr.trim() !== "attempts + 1") {
        // bind later per row except increments
      }
    }
    for (const row of table.rows) {
      const whereCursor = { i: cursor.i + computed.filter((c) => c.expr.trim() === "?").length };
      // Params are SET values first, then WHERE — SQLite binds left-to-right.
    }
    const setCount = computed.filter((c) => c.expr.includes("?")).length;
    for (const row of table.rows) {
      const whereCursor = { i: setCount };
      if (where && !evalWhere(row, where, params, whereCursor)) continue;
      const setCursor = { i: 0 };
      for (const c of computed) {
        if (c.expr.trim() === "attempts + 1") {
          row[c.col] = Number(row[c.col] ?? 0) + 1;
          continue;
        }
        row[c.col] = coerce(evalExpr(row, c.expr, params, setCursor));
      }
    }
    void paramValues;
  }

  private delete(sql: string, params: unknown[]): void {
    const m = sql.match(/^DELETE FROM (\w+)(?:\s+WHERE\s+(.+))?$/i);
    if (!m) throw new Error(`unsupported DELETE: ${sql}`);
    const table = this.table(m[1]!);
    const where = m[2] ?? null;
    table.rows = table.rows.filter((row) => {
      if (!where) return false;
      return !evalWhere(row, where, params, { i: 0 });
    });
  }

  private select(sql: string, params: unknown[]): Record<string, unknown>[] {
    const sqliteMaster = sql.match(
      /^SELECT name FROM sqlite_master WHERE type = \? AND name = \?$/i
    );
    if (sqliteMaster) {
      const type = params[0];
      const name = params[1];
      if (type === "table" && typeof name === "string" && this.tables.has(name)) {
        return [{ name }];
      }
      return [];
    }
    const pragma = sql.match(/^PRAGMA table_info\((\w+)\)$/i);
    if (pragma) {
      const table = this.tables.get(pragma[1]!);
      if (!table) return [];
      return table.columns.map((name, cid) => ({ cid, name }));
    }
    const parsed = parseSelect(sql.replace(/\s+/g, " "));
    if (!parsed) throw new Error(`unsupported SELECT: ${sql}`);
    const table = this.table(parsed.table);
    let rows = table.rows.filter((row) =>
      parsed.where ? evalWhere(row, parsed.where, params, { i: 0 }) : true
    );
    if (parsed.orderBy) {
      const { col, dir } = parsed.orderBy;
      rows = [...rows].sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return dir === "ASC" ? -1 : 1;
        if (av > bv) return dir === "ASC" ? 1 : -1;
        return 0;
      });
    }
    if (parsed.limit) {
      const n = parsed.limit === "?" ? Number(params[params.length - 1]) : Number(parsed.limit);
      rows = rows.slice(0, n);
    }
    if (parsed.columns === "*") return cloneRows(rows);
    const countAlias = parsed.columns.length === 1
      ? parsed.columns[0]!.match(/^COUNT\(\*\)\s+as\s+(\w+)$/i)
      : null;
    if (countAlias) {
      return [{ [countAlias[1]!]: rows.length }];
    }
    return rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const col of parsed.columns) {
        const alias = col.match(/^(\w+)\s+as\s+(\w+)$/i);
        if (alias) {
          out[alias[2]!] = row[alias[1]!];
          continue;
        }
        const bare = col.split(/\s+as\s+/i);
        out[bare[bare.length - 1]!] = row[bare[0]!];
      }
      return out;
    });
  }

  /** Deep-copy tables so a second instance can load persisted MemorySqlite state. */
  exportTables(): Map<string, Table> {
    return cloneTables(this.tables);
  }

  importTables(tables: Map<string, Table>): void {
    this.tables = cloneTables(tables);
    this.txDepth = 0;
    this.txSnapshot = null;
  }
}

export function openMemorySqlite(): MemorySqlite {
  return new MemorySqlite();
}

/** Fresh MemorySqlite instance loaded from another instance's persisted rows. */
export function cloneMemorySqlite(source: MemorySqlite): MemorySqlite {
  const next = new MemorySqlite();
  next.importTables(source.exportTables());
  return next;
}
