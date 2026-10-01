import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EVIDENCE_LABELS,
  ID_LINE,
  MATRIX_STATUSES,
  type EvidenceLabel,
  type MatrixStatus,
} from "./matrixIds";

export type ParsedMatrixRow = {
  id: string;
  slice: string;
  requirement: string;
  implementationPath: string;
  evidenceLabels: EvidenceLabel[];
  status: MatrixStatus;
};

const ALLOWED_LABELS = new Set<string>(EVIDENCE_LABELS);
const ALLOWED_STATUS = new Set<string>(MATRIX_STATUSES);

export function matrixPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../docs/release/GRIN_ACCEPTANCE_MATRIX.md");
}

export function parseEvidenceLabels(cell: string): EvidenceLabel[] {
  const parts = cell
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  for (const part of parts) {
    if (!ALLOWED_LABELS.has(part)) {
      throw new Error(`unknown evidence label ${part}`);
    }
  }
  return parts as EvidenceLabel[];
}

export function parseMatrix(markdown = readFileSync(matrixPath(), "utf8")): ParsedMatrixRow[] {
  const rows: ParsedMatrixRow[] = [];
  const seen = new Set<string>();
  for (const line of markdown.split("\n")) {
    if (!ID_LINE.test(line)) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 6) {
      throw new Error(`matrix row must have 6 cells: ${line}`);
    }
    const [id, slice, requirement, implementationPath, evidenceCell, status] = cells;
    if (!id || !slice || !requirement || !implementationPath || !evidenceCell || !status) {
      throw new Error(`matrix row has empty cells: ${line}`);
    }
    if (seen.has(id)) throw new Error(`duplicate matrix id ${id}`);
    seen.add(id);
    if (!ALLOWED_STATUS.has(status)) {
      throw new Error(`${id} has unknown status ${status}`);
    }
    rows.push({
      id,
      slice,
      requirement,
      implementationPath,
      evidenceLabels: parseEvidenceLabels(evidenceCell),
      status: status as MatrixStatus,
    });
  }
  return rows;
}
