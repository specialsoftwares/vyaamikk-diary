const DOC_ID = /^[A-Za-z0-9_-]{1,64}$/;
const COMMAND_ID = /^[A-Za-z0-9_-]{8,128}$/;

function hasForbiddenPathToken(value: string): boolean {
  return value.includes("/") || value.includes(".") || value === ".." || value.includes("\\");
}

export function documentIdError(label: string, value: unknown): string | null {
  if (typeof value !== "string") return `${label} is required`;
  if (hasForbiddenPathToken(value)) return `${label} is not a valid document id`;
  if (!DOC_ID.test(value)) return `${label} is not a valid document id`;
  return null;
}

export function commandIdError(value: unknown): string | null {
  if (typeof value !== "string") return "commandId is required";
  if (hasForbiddenPathToken(value)) return "commandId is not a valid document id";
  if (!COMMAND_ID.test(value)) return "commandId is not a valid document id";
  return null;
}
