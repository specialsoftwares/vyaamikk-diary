import { Share } from "react-native";

import type { BusinessEntry } from "@/domain/businessEntry";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import type { ProfessionalServicePack } from "@/domain/professionalPack";

export type { ShareTextLocale, ShareTextOptions } from "./shareTextBuilders";
export {
  buildBusinessEntryShareText,
  buildCashPaidShareText,
  buildDukaanShareText,
  buildGenericEntryShareText,
  buildMaterialDispatchedShareText,
  buildMaterialReceivedShareText,
  buildMaterialReturnShareText,
  buildPaymentRequestShareText,
  buildProfessionalBriefShareText,
  buildStaffMatterShareText,
  buildWorkUpdateShareText,
  canShareEntryAsText,
} from "./shareTextBuilders";

import {
  buildBusinessEntryShareText,
  buildDukaanShareText,
  buildProfessionalBriefShareText,
  type ShareTextOptions,
} from "./shareTextBuilders";

export async function shareBusinessEntryText(
  entry: BusinessEntry,
  opts: ShareTextOptions
): Promise<void> {
  const { assertLiveMutationAllowed } = await import("@/auth/offlineCapabilityGuard");
  assertLiveMutationAllowed("share");
  const message = buildBusinessEntryShareText(entry, opts);
  await Share.share({ message, title: entry.title });
}

export async function shareDukaanText(
  record: CustomerCreditRecord,
  opts: Pick<ShareTextOptions, "t">
): Promise<void> {
  const message = buildDukaanShareText(record, opts);
  await Share.share({ message, title: record.customerName });
}

export async function shareProfessionalBriefText(
  pack: ProfessionalServicePack,
  opts: Pick<ShareTextOptions, "t">
): Promise<void> {
  const message = buildProfessionalBriefShareText(pack, opts);
  await Share.share({ message, title: pack.title });
}
