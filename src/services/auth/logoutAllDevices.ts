/**
 * Remote logout-all. Local sign-out does not call this and stays available
 * offline. An unavailable network is not reported as remote success.
 */

export async function requestLogoutAllDevices(input: {
  online: boolean;
  operationId: string;
  call: (operationId: string) => Promise<{ status: "complete" | "pending" }>;
}): Promise<{ remote: "complete" | "pending" | "unavailable" }> {
  if (!input.online) return { remote: "unavailable" };
  try {
    const result = await input.call(input.operationId);
    if (result.status === "complete" || result.status === "pending") {
      return { remote: result.status };
    }
    return { remote: "unavailable" };
  } catch {
    return { remote: "unavailable" };
  }
}
