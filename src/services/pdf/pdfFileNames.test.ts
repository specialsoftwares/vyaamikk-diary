import assert from "node:assert/strict";

import {
  buildPdfFileName,
  buildPdfFileNameFromHint,
  sanitizeSegment,
} from "./pdfFileNames";

const FIXED_DATE = "2025-06-14";

// CPV filename
{
  const name = buildPdfFileName({
    documentType: "cashPaid",
    receiverName: "Rajesh Patel",
    cpvSerial: "2025-26/042",
    date: FIXED_DATE,
  });
  assert.equal(
    name,
    "Vyaamikk-Cash-Payment-Voucher-Rajesh-Patel-2025-26-042-2025-06-14.pdf"
  );
}

// Invalid chars sanitized
{
  assert.equal(sanitizeSegment('bad/name\\with:chars*"<>|'), "bad-name-withchars");
  assert.equal(sanitizeSegment("Hello 😀 World"), "Hello-World");

  const name = buildPdfFileName({
    documentType: "paymentRequest",
    partyName: 'Acme / "Ltd" 😀',
    amountOrInvoice: "INV:123*?",
    date: FIXED_DATE,
  });
  assert.equal(name.includes("/"), false);
  assert.equal(name.includes('"'), false);
  assert.equal(name.includes("😀"), false);
  assert.match(name, /\.pdf$/);
}

// Long names truncated
{
  const longName = "A".repeat(200);
  const name = buildPdfFileName({
    documentType: "cashPaid",
    receiverName: longName,
    cpvSerial: "2025-26/001",
    date: FIXED_DATE,
  });
  assert.ok(name.length <= 120, `expected <= 120 chars, got ${name.length}`);
  assert.match(name, /\.pdf$/);
  assert.ok(name.startsWith("Vyaamikk-Cash-Payment-Voucher-"));
}

// Missing party fallback
{
  const name = buildPdfFileName({
    documentType: "cashPaid",
    cpvSerial: "2025-26/007",
    date: FIXED_DATE,
  });
  assert.ok(name.includes("-Party-"), name);
  assert.match(name, /\.pdf$/);
}

// No random-only output
{
  const name = buildPdfFileName({
    documentType: "generic",
    title: "x7K9m2Pq",
    date: FIXED_DATE,
  });
  assert.ok(name.startsWith("Vyaamikk-Generic-"));
  assert.match(name, /\.pdf$/);
  assert.notEqual(name, "x7K9m2Pq.pdf");
}

// .pdf always present
{
  assert.match(
    buildPdfFileName({ documentType: "letterhead", date: FIXED_DATE }),
    /\.pdf$/
  );
  assert.match(buildPdfFileNameFromHint(""), /\.pdf$/);
  assert.match(buildPdfFileNameFromHint("   "), /\.pdf$/);
  assert.match(buildPdfFileNameFromHint("VYD-CR-0001"), /\.pdf$/);
}

console.log("pdfFileNames.test.ts: all cases passed");
