# Business Insights coverage

Owner-scoped figures on Business Insights. They are calculated on this device when that screen opens, and again when the screen is revisited or when sync state changes. They are not calculated at startup or while a record is saved. Nothing here is shared across accounts, and nothing is sent to an external model. A change of account or session drops the previous result.

Movement distance stays a separate approximate kilometre figure. It is not money, and it is not proof of delivery.

The settings row stays at `/settings/business-insights`. The stable href and label for coordinators are `BUSINESS_INSIGHTS_HREF` and `BUSINESS_INSIGHTS_LABEL` in `src/content/insights/entry.ts`.

## Rules that apply to every total

- One saved record id is one record. A retry or a duplicate delivery of the same id is not added again.
- Deleted records are excluded. Open drafts are a status count only. Draft contents are not read.
- Amounts in different currencies are not added. Diary amounts are stored as rupees. The diary amount field is defined as INR and entered in ₹. A value that is not a usable rupee amount is left out and is not labelled as another currency. Goods-receipt invoices keep an explicit currency. Only INR is summed. An invoice with no currency code is not treated as INR.
- Quantities are added only when the unit is the same. Package counts and weights are not converted into the material unit.
- A document and a later transaction stay in separate figures. Purchase-order value, supplier invoice value, payment requested, cash paid, and shop money collected are never added together.
- Sale totals, finance-company amounts, and invoice totals are not called money collected. Collected shop money comes from payment rows, a recorded down payment, or a cash sale marked paid at sale.
- Cancelled purchase orders and cancelled shop-credit records are left out. There is no separate refund amount to apply.
- Confirmed goods-receipt returns reduce remaining quantity. They do not reduce the supplier invoice value, because the receipt does not store a credit note.
- No figure infers profit, a tax liability, or that goods were delivered.
- Each row shows its period, the counting rule, and a link to the contributing records. An empty period says what is missing. If the device is offline, if diary rows on this device are not synced yet, or if the server diary list could not be read, the freshness note says the figures can be incomplete. Unsynced diary rows that are already on this device are included. A missing currency is not filled in.

## Coverage matrix

| Record | Repository | Date | Status | Amounts or units | Draft / final / deleted / reversed | Role |
| --- | --- | --- | --- | --- | --- | --- |
| business_cash_given | Diary | payment date, otherwise entry date | entry active, settled, or archived; cash settlement pending, partial, or settled | amount stored as rupees (INR field); a non-number is left out | Saved rows only. Deleted excluded. Settlement is not a second payment. | Calculated: cash paid |
| payment_request | Diary | entry date | active summed; settled and archived counted only | pending amount, INR, user-stated | Deleted excluded. Not money collected. | Calculated: payment requested |
| material_dispatched | Diary | entry date | entry status; freight type to pay, paid, to be billed, or other | quantity and unit; optional paid freight; weight and boxes | Deleted excluded. Linked freight document wins over the dispatch freight amount. Expected delivery is not delivery. | Calculated: material sent, and freight or weight only under the rules above |
| material_received | Diary | entry date | entry status; quality is not money | quantity and unit. Follow-up is not a payment. | Deleted excluded. Not added to goods receipts. | Calculated: diary material received |
| material_return | Diary | entry date | entry status | quantity and unit | Deleted excluded. Not subtracted from dispatches. Not a credit. | Calculated: material returned |
| outward_freight_details | Diary | entry date | freight type | freight amount; weight and boxes | Deleted excluded. Only paid freight is money. | Calculated: freight paid |
| work_update_issue | Diary | entry date | entry status | quantity note is free text | Deleted excluded. | Activity only: no usable financial or unit field |
| staff_matter | Diary | entry date | entry status | none | Deleted excluded. | Activity only: no financial fields |
| letterhead_matter | Diary | entry date | entry status | none | Not added to saved letters. | Activity only: no financial fields |
| reminder_purchase | Diary | entry date | entry status | estimate is free text | Not parsed into money. | Activity only: no currency field |
| reminder_email | Diary | entry date | entry status | none | Deleted excluded. | Activity only: no financial fields |
| reminder_gst_return | Diary | entry date | return type is a label | none | Not a tax liability. | Activity only: no tax amount |
| legacy | Diary | entry date | entry status | quantity is free text | Deleted excluded. | Activity only: no currency or unit field |
| purchase_order | Purchase orders | PO date | active summed; cancelled left out | line total plus GST only when the order says tax applies, INR | Deleted excluded. Not money paid and not goods received. | Calculated: purchase orders placed |
| customer_credit | Customer credit | payment date for payments; sale date for down payment, cash-at-sale, and open balance | active, fully paid, written off, external completed; cancelled and deleted excluded | payment amounts; down payment; sale amount only for a cash sale with no payment rows | Written-off payments stay. Unpaid written-off balance does not. Closure amount is not added again. Finance-company amounts are not shop collections. | Calculated: shop money collected, and shop balance still open |
| letterhead_document | Letterhead documents | letter date | saved or not | none | Saved letters counted once. Share-once and not saved are left out. | Activity only: no financial fields |
| professional_pack | Professional packs | matter date | active, shared, or completed | amount fields on TDS, expense-cash review, and payment-recovery briefs, INR | Other matter types have no amount field and are a status count. Amounts are not added to cash, collections, orders, or invoices. | Calculated: amounts written on briefs |
| form_draft | Form drafts | not a year total; open now | active drafts | payload is not read | Not a final record, so nothing inside is summed. | Status only |
| grin_receipt | Goods receipts, this account's open local session | arrival date or instant. Unknown precision is not used. | confirmed and not voided or refused; drafts, queues, and failures are not quantities | physical quantity minus confirmed returns, by unit; supplier invoice by currency | One receipt id. Pending returns are not subtracted. Invoice value is not collected money and is not added to the purchase order. | Calculated: goods still recorded, and supplier invoice value |

If a list cannot be read, that figure says it was not read. It is not shown as zero.
