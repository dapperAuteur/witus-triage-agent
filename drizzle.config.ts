import type { Config } from "drizzle-kit";
import { config as loadEnv } from "dotenv";

// drizzle-kit runs outside the Next.js runtime, so it only sees what `dotenv`
// loads for it. Load `.env.local` first (Next's machine-local convention),
// then `.env` as a fallback.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

// Migrations run over the direct (unpooled) connection — DDL through a
// transaction pooler is unreliable. Fall back to the pooled URL if that is
// all that is configured.
const migrationUrl =
  process.env.STORAGE_DATABASE_URL_UNPOOLED ?? process.env.STORAGE_DATABASE_URL;

if (!migrationUrl) {
  throw new Error(
    "STORAGE_DATABASE_URL_UNPOOLED (preferred) or STORAGE_DATABASE_URL is " +
      "required to run drizzle-kit. See plans/user-tasks/01-provision-env-and-secrets.md.",
  );
}

export default {
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: migrationUrl },
} satisfies Config;
