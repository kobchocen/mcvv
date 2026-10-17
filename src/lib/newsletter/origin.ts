import { appOrigin } from "@/lib/auth/tokens";
import { env } from "@/lib/env";

export async function newsletterOrigin(): Promise<string> {
  return (env.AUTH_ORIGIN ?? (await appOrigin())).replace(/\/$/, "");
}
