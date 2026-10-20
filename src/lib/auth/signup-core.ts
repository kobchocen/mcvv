import { checkNewPassword, type PasswordProblem } from "@/lib/auth/password-reset";
import { readSignupToken } from "@/lib/auth/signup-token";

export type SignupProblem = "invalid" | "used" | "name" | PasswordProblem;

export type SignupInput = {
  token: unknown;
  name: string;
  clubName: string | null;
  password: string;
  confirm: string;
};

export type SignupAccount = { id: number; email: string; name: string; role: "registrar" };

export type SignupDeps = {
  secret: string;
  now?: number;
  accountExists(email: string): Promise<boolean>;
  /** Creates a verified registrar; must throw when the e-mail is already taken. */
  createAccount(input: {
    email: string;
    name: string;
    clubName: string | null;
    password: string;
  }): Promise<SignupAccount>;
};

export async function completeSignupCore(
  input: SignupInput,
  deps: SignupDeps,
): Promise<{ account: SignupAccount } | { error: SignupProblem }> {
  const claim = readSignupToken(input.token, deps.secret, deps.now);
  if (!claim) {
    return { error: "invalid" };
  }
  const name = input.name.trim().slice(0, 80);
  if (!name) {
    return { error: "name" };
  }
  const problem = checkNewPassword(input.password, input.confirm);
  if (problem) {
    return { error: problem };
  }
  if (await deps.accountExists(claim.email)) {
    return { error: "used" };
  }
  try {
    const account = await deps.createAccount({
      email: claim.email,
      name,
      clubName: input.clubName?.trim().slice(0, 50) || null,
      password: input.password,
    });
    return { account };
  } catch {
    // unique e-mail: a concurrent use of the same link already created the account
    return { error: "used" };
  }
}
