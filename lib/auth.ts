import "server-only";
import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import type { OAuthConfig } from "next-auth/providers/oauth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db/client";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { getEnv } from "@/lib/env";

/**
 * "Sign in with WitUS" — the ecosystem OIDC provider (accounts.witus.online).
 *
 * Added ALONGSIDE the Email magic-link provider, not in place of it. A WitUS
 * sign-in goes through the same `signIn` callback below, so the single-operator
 * admin gate still applies: only `ADMIN_EMAIL` gets in, whichever provider they
 * used. Enabled only when `WITUS_OIDC_CLIENT_ID` is set (see providers array).
 */
interface WitusProfile {
  sub: string;
  email?: string;
  name?: string;
}

function witusProvider(): OAuthConfig<WitusProfile> {
  return {
    id: "witus",
    name: "WitUS",
    type: "oauth",
    wellKnown:
      process.env.WITUS_OIDC_DISCOVERY_URL ??
      "https://accounts.witus.online/api/idp/.well-known/openid-configuration",
    clientId: process.env.WITUS_OIDC_CLIENT_ID,
    clientSecret: process.env.WITUS_OIDC_CLIENT_SECRET,
    authorization: { params: { scope: "openid email profile" } },
    idToken: true,
    checks: ["pkce", "state"],
    profile(profile) {
      return {
        id: profile.sub,
        email: profile.email ?? null,
        name: profile.name ?? null,
        image: null,
      };
    },
  };
}

/**
 * NextAuth v4 configuration for the operator dashboard.
 *
 * Magic-link email sign-in, gated to a single operator: only `ADMIN_EMAIL`
 * may sign in (the `signIn` callback rejects everyone else — fail-closed, so
 * if `ADMIN_EMAIL` is unset, nobody can sign in).
 *
 * Magic links need SMTP (`EMAIL_SERVER` / `EMAIL_FROM`). Until those are set
 * the app still boots — sign-in just fails — so the rest of the build is not
 * blocked on mail configuration.
 */
const env = getEnv();
const adminEmail = env.ADMIN_EMAIL?.toLowerCase() ?? "";

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    EmailProvider({
      server: env.EMAIL_SERVER ?? "",
      from: env.EMAIL_FROM ?? "",
    }),
    ...(process.env.WITUS_OIDC_CLIENT_ID ? [witusProvider()] : []),
  ],
  session: { strategy: "jwt" },
  secret: env.NEXTAUTH_SECRET,
  // Custom sign-in page — it pre-checks the email and turns a non-admin away
  // into the waitlist flow (app/signin). The signIn callback below stays as a
  // server-side backstop.
  pages: { signIn: "/signin" },
  callbacks: {
    signIn({ user }) {
      const email = user?.email?.toLowerCase();
      if (!email || !adminEmail || email !== adminEmail) {
        console.warn("[auth] rejected non-admin sign-in attempt");
        return false;
      }
      return true;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.email = token.email ?? session.user.email;
        if (token.sub) {
          (session.user as { id?: string }).id = token.sub;
        }
      }
      return session;
    },
  },
};
