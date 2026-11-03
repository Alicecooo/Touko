import type { LoginPlace, LoginSource } from "../../shared/logins.ts";
import type { TotpKey } from "./totp.ts";

/** A credential record whose secrets are read only by an authorized consumer. */
export interface LoginCandidate extends LoginPlace {
  id: string;
  username: string;
  source: LoginSource;
  secrets(): Promise<{ password: string; totp: TotpKey | null }>;
}
