import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";

let cachedFontFaceCss: string | null = null;
let loadPromise: Promise<string> | null = null;

/**
 * Embed Noto Sans Gujarati in PDF HTML via base64 @font-face.
 * Gracefully returns empty string if the package asset cannot be resolved.
 */
export async function gujaratiPdfFontFaceCss(): Promise<string> {
  if (cachedFontFaceCss != null) return cachedFontFaceCss;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fontModule = require("@expo-google-fonts/noto-sans-gujarati/400Regular/NotoSansGujarati_400Regular.ttf");
      const asset = Asset.fromModule(fontModule);
      await asset.downloadAsync();
      const uri = asset.localUri ?? asset.uri;
      if (!uri) return "";
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      cachedFontFaceCss = `@font-face{font-family:'NotoSansGujaratiPdf';src:url(data:font/ttf;base64,${base64}) format('truetype');font-weight:400;font-style:normal;}`;
      return cachedFontFaceCss;
    } catch {
      return "";
    }
  })();

  return loadPromise;
}

export function gujaratiPdfBodyFontCss(): string {
  return `.pdf-doc,.pdf-print-body,.content{font-family:'NotoSansGujaratiPdf',system-ui,sans-serif;}`;
}
