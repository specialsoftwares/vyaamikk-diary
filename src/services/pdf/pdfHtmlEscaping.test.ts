/**
 * HTML-injection regression for production PDF composers (INJECTED, host).
 *
 * Record text is owner-entered or owner-synced data; a stored `<img onerror>`
 * or a quote-bearing data-URI MIME must never reach the expo-print WebView as
 * markup. Native react-native / expo modules are stubbed because these
 * composers transitively import them; the HTML builders themselves are pure.
 *
 * Boundary: host string assertions on composer output. Not a device Print run.
 */

import assert from "node:assert/strict";
import Module from "node:module";

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const NATIVE_STUB_RE = /^(react-native|expo|@react-native|@expo)(\/|$|-)/;
const nativeStub = new Proxy(
  {},
  {
    get: (_target, key) => {
      if (key === "__esModule") return true;
      if (key === "Platform") return { OS: "android" };
      if (key === "cacheDirectory" || key === "documentDirectory") return "/tmp/";
      return () => undefined;
    },
  }
);
type Loader = (request: string, ...rest: unknown[]) => unknown;
const moduleLoader = Module as unknown as { _load: Loader };
const originalLoad = moduleLoader._load;
moduleLoader._load = function patchedLoad(this: unknown, request: string, ...rest: unknown[]) {
  if (NATIVE_STUB_RE.test(request)) return nativeStub;
  return originalLoad.call(this, request, ...rest);
};

const SENTINEL_TEXT = '<img src=x onerror="alert(1)">Surat';
const SENTINEL_ATTR_MIME = 'image/png" onerror="alert(2)" x="';
const ATTR_BREAKOUT = / onerror="alert\(2\)"/;

async function main(): Promise<void> {
  const { buildBusinessEntryBody } = await import("./businessEntryPdfBodies");
  const { pdfIssuerBlock } = await import("./pdfComponents");
  const { buildPurchaseOrderHtml } = await import("./purchaseOrderPdfService");
  const { buildCustomerCreditHtml } = await import("./customerCreditPdfService");

  // 1. Movement route line (material_dispatched / outward_freight_details).
  for (const entryType of ["material_dispatched", "outward_freight_details"] as const) {
    const html = buildBusinessEntryBody(
      {
        id: "e1",
        userId: "u1",
        entryType,
        entryDate: Date.UTC(2026, 9, 12),
        createdAt: 1,
        updatedAt: 1,
        title: "t",
        payload: {
          partyName: "Party",
          dispatchLocation: SENTINEL_TEXT,
          destination: "Mumbai",
          quantity: 1,
          unit: "kg",
        },
        attachments: [],
      } as unknown as Parameters<typeof buildBusinessEntryBody>[0],
      { notes: "Notes", reminder: "Reminder", detailsSection: "Details", entryDate: "Date" },
      "en-IN"
    );
    assert.equal(
      html.includes(SENTINEL_TEXT),
      false,
      `${entryType}: raw route markup must not reach the PDF HTML`
    );
    assert.match(html, /pdf-route-line">&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;Surat/);
    assert.doesNotMatch(html, /<img src=x/);
  }

  // 2. Issuer logo data URI is attribute-escaped (MIME comes from a stored profile record).
  const issuer = pdfIssuerBlock({
    branding: {
      displayName: "Owner",
      businessName: null,
      ueid: "VYD-TEST",
      mobile: null,
      email: null,
      includeLogo: true,
      logoDataUri: `data:${SENTINEL_ATTR_MIME};base64,AAAA`,
      legal: { page: "Page" },
    },
  });
  assert.doesNotMatch(issuer, ATTR_BREAKOUT, "issuer logo src must not break out of the attribute");
  assert.match(issuer, /src="data:image\/png&quot; onerror=&quot;alert\(2\)&quot;/);

  // 3. Purchase order logo.
  const poHtml = buildPurchaseOrderHtml({
    po: {
      id: "po1",
      poNumber: "PO-1",
      status: "draft",
      supplierName: "S",
      items: [],
      taxApplicable: "not_applicable",
      createdAt: 1,
      updatedAt: 1,
    } as unknown as Parameters<typeof buildPurchaseOrderHtml>[0]["po"],
    locale: "en-IN",
    labels: new Proxy({}, { get: (_t, k) => String(k) }) as Parameters<typeof buildPurchaseOrderHtml>[0]["labels"],
    logoDataUri: `data:${SENTINEL_ATTR_MIME};base64,AAAA`,
  });
  assert.doesNotMatch(poHtml, ATTR_BREAKOUT, "PO logo src must not break out of the attribute");

  // 4. Customer credit logo + customer photo.
  const ccHtml = buildCustomerCreditHtml({
    record: {
      id: "cc1",
      userId: "u1",
      ueid: "VYD-TEST",
      serial: 1,
      recordNumber: "CC-1",
      status: "active",
      mode: "emi",
      saleDate: 1,
      customerName: "C",
      products: [],
      saleAmount: 100,
      schedule: [],
      payments: [],
      version: 1,
      createdAt: 1,
      updatedAt: 1,
    } as unknown as Parameters<typeof buildCustomerCreditHtml>[0]["record"],
    variant: "sale_record",
    locale: "en-IN",
    labels: new Proxy({}, { get: (_t, k) => String(k) }) as Parameters<typeof buildCustomerCreditHtml>[0]["labels"],
    shop: { name: "Shop", address: null, gstin: null, contact: null },
    logoDataUri: `data:${SENTINEL_ATTR_MIME};base64,AAAA`,
    customerPhotoDataUri: `data:${SENTINEL_ATTR_MIME};base64,BBBB`,
    displayStatus: "active",
  } as unknown as Parameters<typeof buildCustomerCreditHtml>[0]);
  assert.doesNotMatch(ccHtml, ATTR_BREAKOUT, "customer credit img src must not break out of the attribute");
  assert.equal((ccHtml.match(/src="data:image\/png&quot;/g) ?? []).length, 2, "logo + customer photo both escaped");

  console.log("pdfHtmlEscaping.test.ts: ok (INJECTED, host; native modules stubbed)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
