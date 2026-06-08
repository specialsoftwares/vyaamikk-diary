import { i18n } from "./i18n";

type TFn = (key: string, vars?: Record<string, string | number>) => string;

/** Fixed English `t` for PO / Letterhead PDF chrome — never follows active UI language. */
export function englishPdfT(): TFn {
  return i18n.getFixedT("en") as TFn;
}
