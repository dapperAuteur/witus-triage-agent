import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getStoredSettings,
  providerOverride,
  updateSettings,
} from "@/lib/settings";
import { getOperatorEmail } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const nodeModelsSchema = z.object({
  classify: z.string().trim().min(1),
  propose: z.string().trim().min(1),
  draft_reply: z.string().trim().min(1),
});

const settingsSchema = z.object({
  provider: z.enum(["anthropic", "google"]),
  models: z.object({
    anthropic: nodeModelsSchema,
    google: nodeModelsSchema,
  }),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(64).max(8192),
  tracingEnabled: z.boolean(),
});

/** Env context the dashboard needs to render correctly. */
function envContext() {
  return {
    envProviderOverride: providerOverride(),
    hasLangsmithKey: Boolean(process.env.LANGSMITH_API_KEY),
  };
}

/** GET /api/admin/settings — current configuration + env context. */
export async function GET(): Promise<NextResponse> {
  if (!(await getOperatorEmail())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const settings = await getStoredSettings();
    return NextResponse.json({ settings, ...envContext() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PUT /api/admin/settings — replace the configuration (full object). */
export async function PUT(request: Request): Promise<NextResponse> {
  if (!(await getOperatorEmail())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid settings", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const settings = await updateSettings(parsed.data);
    return NextResponse.json({ settings, ...envContext() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
