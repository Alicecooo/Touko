import { type LoginPlace } from "../../shared/logins.ts";
import type { LoginCandidate } from "../security/login-candidate.ts";
import type { LoginStore } from "../security/login-store.ts";
import type { OnePasswordLogins } from "../security/onepassword.ts";
import type { LoginRouteDeps } from "../routes/logins.ts";

/** What the bot's browser shows while the person answers a sign-in card. */

/** Null when nothing a login could be filled on is open. */

/** A sign-in page on another site than the card's, which a login saved from the card fills only once the person, shown
 * that host on the card, confirms it: a page the bot chose must not receive a password saved for the site the card names. */

/** Where a login saved from a sign-in card fills: the card's site, the sign-in page open on that site (else the card's
 * own host), and a sign-in page on another site when the person confirmed it. */

/** Saved logins and 1Password items, as each bot may use them. */
export class BotLogins {
  readonly store: LoginStore;
  readonly onePassword: OnePasswordLogins;

  constructor(store: LoginStore, onePassword: OnePasswordLogins) {
    this.store = store;
    this.onePassword = onePassword;
  }

  /** Where each login the bot may use fills, with its username. */
  sitesFor(botId: string): Array<LoginPlace & { username: string }> {
    return [...this.store.sitesFor(botId), ...this.onePassword.sitesFor(botId)];
  }

  /** Secrets are read only when one is filled. */
  async candidates(botId: string, pageHost: string): Promise<LoginCandidate[]> {
    await this.onePassword.fresh();
    return [
      ...this.store.usableFor(pageHost, botId).map((login): LoginCandidate => ({
        id: login.id, site: login.site, hosts: login.hosts, exactHost: login.exactHost, username: login.username, source: login.source,
        secrets: async () => ({ password: login.password, totp: login.totp ?? null }),
      })),
      ...this.onePassword.candidates(pageHost, botId),
    ];
  }

  markUsed(id: string): void {
    this.store.markUsed(id);
    this.onePassword.markUsed(id);
  }

  routes(botExists: (id: string) => boolean): LoginRouteDeps {
    return {
      list: () => this.store.list(),
      create: (input) => this.store.create(input),
      update: (id, patch) => this.store.update(id, patch),
      remove: (id) => this.store.remove(id),
      botExists,
      onePassword: {
        status: () => this.onePassword.status(),
        list: () => { void this.onePassword.fresh(); return this.onePassword.list(); },
        connect: async (token) => {
          const status = await this.onePassword.refresh(token);
          this.store.setOnePasswordToken(token);
          return status;
        },
        refresh: () => this.onePassword.refresh(),
        disconnect: () => {
          this.store.setOnePasswordToken(null);
          this.onePassword.clear();
          return this.onePassword.status();
        },
        grant: (vaultId, bots) => {
          if (!this.onePassword.hasVault(vaultId)) return null;
          this.store.setOnePasswordGrant(vaultId, bots);
          return this.onePassword.status();
        },
      },
    };
  }
}
