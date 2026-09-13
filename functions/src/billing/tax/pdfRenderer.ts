/**
 * VYAAMIKK DIARY — INDIA GST TAX-DOCUMENT MODEL
 *
 * This module must not infer GST liability merely from the payment channel.
 *
 * IGST Act section 14 applies to specified OIDAR supplies made from a
 * non-taxable territory to a non-taxable online recipient. It is not a
 * blanket rule making Google Play or Apple the GST supplier for subscriptions
 * sold by an Indian LLP.
 *
 * For India-based Google Play developers, Google's current tax documentation
 * states that the developer remains responsible for determining applicable
 * GST on app / in-app sales; Google separately handles applicable marketplace
 * TDS / GST-TCS obligations.
 *
 * Apple tax treatment must follow the applicable Paid Apps Agreement /
 * Schedule 2, App Store tax settings and India-specific arrangement. Do not
 * assume Apple's tax responsibility until that channel has been formally
 * classified.
 *
 * Therefore tax-document generation is controlled by a verified
 * PlatformTaxPolicy, not merely by whether the buyer supplied a GSTIN.
 *
 * Direct-web/Razorpay sales, when introduced, are developer-direct supplies
 * and have their own explicitly configured GST treatment.
 *
 * Buyer GST registration determines B2B/B2C recipient classification; it
 * does NOT by itself determine whether Special Softwares or a platform is
 * responsible for charging/reporting tax.
 *
 * No tax invoice may be generated from an unconfirmed tax-responsibility
 * policy.
 */

import { BillingError } from "../errors";

import { APPROVED_RENDERING_PROFILE, type RenderingProfile } from "./htmlDocument";

export const MAX_HTML_BYTES = 256 * 1024;
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const RENDER_TIMEOUT_MS = 15_000;

export interface RenderHtmlToPdfInput {
  documentId: string;
  html: string;
  renderingProfile: RenderingProfile;
}

export interface InvoicePdfRenderer {
  renderHtmlToPdf(input: RenderHtmlToPdfInput): Promise<Buffer>;
}

export interface RendererIdTokenProvider {
  getIdToken(audience: string): Promise<string>;
}

export class FakeInvoicePdfRenderer implements InvoicePdfRenderer {
  readonly calls: RenderHtmlToPdfInput[] = [];
  constructor(private readonly pdf = Buffer.from("%PDF-FAKE")) {}
  async renderHtmlToPdf(input: RenderHtmlToPdfInput): Promise<Buffer> {
    assertRenderRequest(input);
    this.calls.push(input);
    return this.pdf;
  }
}

export class MissingRenderer implements InvoicePdfRenderer {
  async renderHtmlToPdf(): Promise<Buffer> {
    throw new BillingError({
      clientCode: "temporary_unavailable",
      causeCode: "invoice_renderer_unconfigured",
      retryable: true,
    });
  }
}

export function assertRenderRequest(input: RenderHtmlToPdfInput): void {
  if (!input.documentId || input.documentId.length > 200) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "renderer_document_id_invalid",
    });
  }
  if (input.renderingProfile !== APPROVED_RENDERING_PROFILE) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "renderer_profile_rejected",
    });
  }
  const bytes = Buffer.byteLength(input.html, "utf8");
  if (bytes === 0 || bytes > MAX_HTML_BYTES) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "renderer_html_size_rejected",
    });
  }
}

/**
 * Functions adapter: Google-signed ID token, audience = exact INVOICE_RENDERER_URL.
 * No API key, no Firebase user token, no static bearer secret.
 */
export class CloudRunInvoicePdfRenderer implements InvoicePdfRenderer {
  constructor(
    private readonly opts: {
      rendererUrl: string;
      idTokens: RendererIdTokenProvider;
      fetchImpl?: typeof fetch;
      timeoutMs?: number;
    }
  ) {}

  async renderHtmlToPdf(input: RenderHtmlToPdfInput): Promise<Buffer> {
    assertRenderRequest(input);
    const url = this.opts.rendererUrl.replace(/\/$/, "");
    if (!url.startsWith("https://") && !url.startsWith("http://localhost")) {
      throw new BillingError({
        clientCode: "temporary_unavailable",
        causeCode: "invoice_renderer_unconfigured",
        retryable: true,
      });
    }
    const token = await this.opts.idTokens.getIdToken(url);
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), this.opts.timeoutMs ?? RENDER_TIMEOUT_MS);
    try {
      const fetchImpl = this.opts.fetchImpl ?? fetch;
      const res = await fetchImpl(`${url}/render`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId: input.documentId,
          html: input.html,
          renderingProfile: input.renderingProfile,
        }),
        signal: ac.signal,
      });
      if (!res.ok) {
        throw new BillingError({
          clientCode: "temporary_unavailable",
          causeCode: "invoice_renderer_http_error",
          retryable: true,
        });
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_PDF_BYTES) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "invoice_renderer_pdf_size_rejected",
        });
      }
      return buf;
    } catch (err) {
      if (err instanceof BillingError) throw err;
      throw new BillingError({
        clientCode: "temporary_unavailable",
        causeCode: "invoice_renderer_unavailable",
        retryable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createInvoicePdfRenderer(opts: {
  rendererUrl: string | null;
  idTokens?: RendererIdTokenProvider;
  fetchImpl?: typeof fetch;
}): InvoicePdfRenderer {
  if (!opts.rendererUrl || !opts.idTokens) return new MissingRenderer();
  return new CloudRunInvoicePdfRenderer({
    rendererUrl: opts.rendererUrl,
    idTokens: opts.idTokens,
    fetchImpl: opts.fetchImpl,
  });
}
