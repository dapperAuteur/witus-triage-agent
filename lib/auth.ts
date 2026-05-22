import "server-only";
import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db/client";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { getEnv } from "@/lib/env";

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
