import type { UserDeleteRequest, UserDeleteResult } from "./userContentDeleteTypes";
import { deleteRecordPermanently } from "./permanentDeletion";

/**
 * Deletes user-created content permanently from app-controlled storage.
 * Delegates to the central permanent-deletion service.
 */
export async function deleteUserContent(
  userId: string,
  request: UserDeleteRequest,
  ueid = ""
): Promise<UserDeleteResult> {
  return deleteRecordPermanently({
    entityType: request.entityType,
    recordId: request.recordId,
    userId,
    ueid,
  });
}
