import type { AttachmentRef, BusinessCashGivenPayload } from "@/domain/businessEntry";
import type { CreateBusinessEntryInput } from "@/services/diary/types";

import { captureCashPhotoOwner, type SessionUidReader } from "./cashPhotoOwner";
import {
  CASH_PAID_ATTACHMENT_ID,
  type PickedCashPaidPhoto,
  cashPaidPhotoAttachment,
} from "./cashPaidPhotoRef";

export interface PersistCashPhoto {
  (
    uid: string,
    entryId: string,
    picked: PickedCashPaidPhoto,
    options?: { readSessionUid?: SessionUidReader }
  ): Promise<AttachmentRef>;
}

function withoutCashPhoto(attachments: AttachmentRef[] | undefined): AttachmentRef[] {
  return (attachments ?? []).filter((a) => a.id !== CASH_PAID_ATTACHMENT_ID);
}

function clearedPhotoPayload(payload: BusinessCashGivenPayload): BusinessCashGivenPayload {
  return {
    ...payload,
    photoAttachmentStoragePath: null,
    photoAttachmentDownloadUrl: null,
    photoAttachmentCapturedAt: null,
  };
}

async function defaultPersist(): Promise<PersistCashPhoto> {
  const mod = await import("./cashPaidPhotoService");
  return mod.persistCashPaidPhoto;
}

/**
 * Persist the validated local photo and return create input that already
 * carries the AttachmentRef. Save must use this input — not a later patch.
 */
export async function placeCashPhotoOnCreateInput(args: {
  uid: string;
  entryId: string;
  picked: PickedCashPaidPhoto;
  input: CreateBusinessEntryInput;
  readSessionUid?: SessionUidReader;
  persist?: PersistCashPhoto;
}): Promise<CreateBusinessEntryInput> {
  const owner = captureCashPhotoOwner(args.uid, args.readSessionUid);
  const persist = args.persist ?? (await defaultPersist());
  owner.assertStillOwner();
  const ref = await persist(args.uid, args.entryId, args.picked, {
    readSessionUid: args.readSessionUid,
  });
  owner.assertStillOwner();
  return {
    ...args.input,
    clientRecordId: args.input.clientRecordId ?? args.entryId,
    attachments: [...withoutCashPhoto(args.input.attachments), ref],
  };
}

export async function runCashPaidCreate<T>(args: {
  uid: string;
  entryId: string;
  picked: PickedCashPaidPhoto | null;
  input: CreateBusinessEntryInput;
  readSessionUid?: SessionUidReader;
  persist?: PersistCashPhoto;
  save: (input: CreateBusinessEntryInput) => Promise<T>;
}): Promise<T> {
  const owner = captureCashPhotoOwner(args.uid, args.readSessionUid);
  const next = args.picked
    ? await placeCashPhotoOnCreateInput({
        uid: args.uid,
        entryId: args.entryId,
        picked: args.picked,
        input: args.input,
        readSessionUid: args.readSessionUid,
        persist: args.persist,
      })
    : args.input;
  owner.assertStillOwner();
  return args.save(next);
}

export interface PlacedCashPhoto {
  attachments: AttachmentRef[];
  payload: BusinessCashGivenPayload;
  previousUri: string | null;
  nextUri: string | null;
}

/** Local file + attachment list for an edit. Does not upload and does not delete the old file. */
export async function placeCashPhotoForRecord(args: {
  uid: string;
  entryId: string;
  picked: PickedCashPaidPhoto | null;
  removeExisting: boolean;
  baseAttachments: AttachmentRef[];
  payload: BusinessCashGivenPayload;
  readSessionUid?: SessionUidReader;
  persist?: PersistCashPhoto;
}): Promise<PlacedCashPhoto> {
  const owner = captureCashPhotoOwner(args.uid, args.readSessionUid);
  const previous = cashPaidPhotoAttachment(args.baseAttachments);
  let attachments = withoutCashPhoto(args.baseAttachments);
  let payload = args.payload;
  let nextUri: string | null = null;

  if (args.removeExisting || args.picked) {
    payload = clearedPhotoPayload(payload);
  }

  if (args.picked) {
    owner.assertStillOwner();
    const persist = args.persist ?? (await defaultPersist());
    const ref = await persist(args.uid, args.entryId, args.picked, {
      readSessionUid: args.readSessionUid,
    });
    owner.assertStillOwner();
    attachments = [...attachments, ref];
    nextUri = ref.uri;
  }

  return {
    attachments,
    payload,
    previousUri: previous?.uri ?? null,
    nextUri,
  };
}
