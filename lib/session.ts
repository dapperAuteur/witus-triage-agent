import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

/**
 * Operator-session guard for the protected `/api/triage/*` routes.
 *
 * Returns the signed-in operator's email, or `null` if there is no valid
 * session. Routes treat `null` as 401 — fail-closed, "no public access"
 * (PRD §9).
 */
export async function getOperatorEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.email ?? null;
}
