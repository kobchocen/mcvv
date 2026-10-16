import { prisma } from "@/lib/db/client";

export const FREE_ENTRY_EMAILS_KEY = "free_entry_emails";

export function parseEmailList(raw: string): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const email = line.trim().toLowerCase();
    if (!email || seen.has(email)) {
      continue;
    }
    seen.add(email);
    emails.push(email);
  }
  return emails;
}

export async function getFreeEntryEmails(): Promise<Set<string>> {
  const row = await prisma.setting.findUnique({ where: { key: FREE_ENTRY_EMAILS_KEY } });
  return new Set(parseEmailList(row?.text ?? ""));
}

export async function getFreeEntryEmailsText(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: FREE_ENTRY_EMAILS_KEY } });
  return row?.text ?? "";
}

export async function saveFreeEntryEmails(raw: string): Promise<void> {
  const text = parseEmailList(raw).join("\n");
  await prisma.setting.upsert({
    where: { key: FREE_ENTRY_EMAILS_KEY },
    update: { text },
    create: { key: FREE_ENTRY_EMAILS_KEY, text },
  });
}
