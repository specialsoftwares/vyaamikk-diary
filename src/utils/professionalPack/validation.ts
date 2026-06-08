import { z } from "zod";

import type { MatterTypeDef } from "@/domain/professionalPack";
import { parseINRInputOrNaN } from "@/utils/money/inr";
import { getMatterDef } from "@/domain/professionalPackMatters";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalString(kind: "gstin" | "email" | "text" | "multiline") {
  return z
    .string()
    .trim()
    .optional()
    .refine((s) => {
      if (!s) return true;
      if (kind === "gstin") return GSTIN_RE.test(s);
      if (kind === "email") return EMAIL_RE.test(s);
      return s.length > 0;
    }, kind === "gstin" ? "Invalid GSTIN" : kind === "email" ? "Invalid email" : "Invalid");
}

function fieldSchema(def: MatterTypeDef["fields"][number]) {
  if (!def.required) {
    if (def.kind === "gstin" || def.kind === "email") return optionalString(def.kind);
    if (def.kind === "amount") {
      return z.preprocess(
        (v) => (v === "" || v == null ? null : parseINRInputOrNaN(v)),
        z.number().positive().nullable().optional()
      );
    }
    return z.string().trim().optional();
  }
  switch (def.kind) {
    case "multiline":
    case "text":
      return z.string().trim().min(1, "Required");
    case "amount":
      return z.preprocess(
        (v) => (v === "" || v == null ? NaN : parseINRInputOrNaN(v)),
        z.number().positive("Enter a valid amount")
      );
    case "date":
      return z.number().int().positive();
    case "gstin":
      return z
        .string()
        .trim()
        .min(1, "Required")
        .refine((s) => GSTIN_RE.test(s), "Invalid GSTIN format");
    case "email":
      return z
        .string()
        .trim()
        .min(1, "Required")
        .refine((s) => EMAIL_RE.test(s), "Invalid email");
    default:
      return z.string().trim().min(1);
  }
}

export function buildPackFormSchema(def: MatterTypeDef) {
  const shape: Record<string, z.ZodTypeAny> = {
    matterDate: z.number().int().positive(),
    dueDate: z.number().int().positive().nullable().optional(),
    professionalName: z.string().trim().max(120).optional(),
    professionalContact: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(5000).optional(),
    linkedEntryIds: z.array(z.string()).optional(),
    title: z.string().trim().max(160).optional(),
    reminder: z
      .object({
        at: z.number().int().positive(),
        note: z.string(),
        notificationId: z.string().nullable(),
      })
      .nullable()
      .optional(),
  };
  for (const f of def.fields) {
    shape[f.key] = fieldSchema(f);
  }
  return z.object(shape);
}

export function validatePackForm(
  category: string,
  matterType: string,
  values: Record<string, unknown>
): { ok: true; data: Record<string, unknown> } | { ok: false; message: string } {
  const def = getMatterDef(
    category as import("@/domain/professionalPack").ProfessionalCategory,
    matterType
  );
  if (!def) return { ok: false, message: "Unknown matter type." };
  const schema = buildPackFormSchema(def);
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, message: first?.message ?? "Please complete required fields." };
  }
  return { ok: true, data: parsed.data as Record<string, unknown> };
}
