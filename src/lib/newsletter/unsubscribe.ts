export type UnsubscribeStore = {
  find(token: string): Promise<{ unsubscribedAt: Date | null } | null>;
  mark(token: string, at: Date): Promise<void>;
};

export type UnsubscribeResult = "unsubscribed" | "already" | "invalid";

export function isUnsubscribeToken(token: unknown): token is string {
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
}

export async function applyUnsubscribe(
  store: UnsubscribeStore,
  token: string,
  now = new Date(),
): Promise<UnsubscribeResult> {
  const row = await store.find(token);
  if (!row) {
    return "invalid";
  }
  if (row.unsubscribedAt) {
    return "already";
  }
  await store.mark(token, now);
  return "unsubscribed";
}
