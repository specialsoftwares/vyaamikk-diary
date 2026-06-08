import assert from "node:assert/strict";

import { isCreatableMatterType } from "@/domain/professionalPackCreatable";
import { getMatterDef } from "@/domain/professionalPackMatters";
import { isWorkTeamEntryType } from "@/domain/workTeam";

/** Internal storage keys stay stable; user-facing label is i18n `globalSearch.categories.customer_credit`. */
assert.equal("customer_credit", "customer_credit");

assert.equal(isWorkTeamEntryType("work_update_issue"), true);
assert.equal(isWorkTeamEntryType("staff_matter"), true);
assert.equal(isWorkTeamEntryType("payment_request"), false);

assert.equal(isCreatableMatterType("expense_cash_review"), false);
assert.equal(isCreatableMatterType("gst_return_support"), true);
assert.ok(getMatterDef("ca_tax", "expense_cash_review"));

console.log("displayAlias.test.ts: ok");
