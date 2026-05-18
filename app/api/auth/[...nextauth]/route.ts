import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// NextAuth v4 catch-all handler for the operator dashboard sign-in flow.
export const runtime = "nodejs";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
