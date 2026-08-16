import { test, expect } from "@playwright/test";

// Post-deploy smoke (@smoke): the production workflow job runs ONLY tests tagged @smoke, so keep
// this file to checks that are safe and meaningful against live production. /api/health touches
// the real Postgres pool (`select 1`) and returns 503 fast when it's unreachable (see
// app/api/health/route.ts), so a green here means "deployed AND the one hard dependency is
// reachable", which is the whole point of the gate.
test("@smoke health endpoint answers ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  // Assert the route's real, fixed shape (app/api/health/route.ts) — not a guessed one.
  expect(body.ok).toBe(true);
  expect(body.service).toBe("witus-triage-agent");
  expect(body.checks).toEqual({ database: "ok" });
});

test("@smoke homepage serves", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1").first()).toBeVisible();
});
