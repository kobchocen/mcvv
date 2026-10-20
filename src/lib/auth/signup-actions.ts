"use server";

import bcrypt from "bcryptjs";
import { getLocale } from "next-intl/server";

import { prisma } from "@/lib/db/client";
import { BCRYPT_COST } from "@/lib/auth/password-reset";
import { setSession } from "@/lib/auth/session";
import { completeSignupCore, type SignupProblem } from "@/lib/auth/signup-core";
import { signupSecret } from "@/lib/auth/tokens";
import { redirect } from "@/i18n/routing";

export type SignupState = { error?: SignupProblem };

/** Consumes the one-time link from the "no account yet" e-mail and signs the user in. */
export async function completeSignup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const secret = signupSecret();
  if (!secret) {
    return { error: "invalid" };
  }
  const result = await completeSignupCore(
    {
      token: formData.get("token"),
      name: String(formData.get("name") ?? ""),
      clubName: String(formData.get("clubName") ?? "") || null,
      password: String(formData.get("password") ?? ""),
      confirm: String(formData.get("passwordConfirm") ?? ""),
    },
    {
      secret,
      accountExists: async (email) => (await prisma.user.count({ where: { email } })) > 0,
      createAccount: async ({ email, name, clubName, password }) => {
        const user = await prisma.user.create({
          data: {
            email,
            name,
            clubName,
            passwordHash: await bcrypt.hash(password, BCRYPT_COST),
            role: "registrar",
            // the link was delivered to this mailbox, so the address is verified
            emailVerified: new Date(),
          },
        });
        return { id: user.id, email: user.email, name: user.name, role: "registrar" };
      },
    },
  );
  if ("error" in result) {
    return { error: result.error };
  }
  await setSession(result.account);
  const locale = await getLocale();
  // /prihlasky lists every registration whose e-mail matches the account (mcvv_prihlaska)
  redirect({ href: { pathname: "/prihlasky", query: { overeno: "1" } }, locale });
  return {};
}
