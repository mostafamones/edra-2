/**
 * Asks the development registry whether an account or recipient is synthetic. Synthetic development
 * contacts must never receive codes, including through WhatsApp development routing. Throws on any
 * lookup failure so callers fail closed.
 */
export async function deliveryBlocked(
  url: string, serviceKey: string, target: { userId?: string | null; phone?: string | null }, fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const response = await fetcher(`${url}/rest/v1/rpc/dev_delivery_blocked`, {
    method: "POST",
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" },
    body: JSON.stringify({ p_user_id: target.userId ?? null, p_phone: target.phone ?? null }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Delivery registry lookup failed (${response.status}).`);
  }
  const value: unknown = await response.json();
  if (typeof value !== "boolean") throw new Error("Delivery registry lookup returned an invalid response.");
  return value;
}
