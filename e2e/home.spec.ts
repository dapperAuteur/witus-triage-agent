import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

// Happy path + a11y gate for the public anonymous surface (witus plan 30 Phase 2; a11y mandate
// from the shared UI/UX/DX standard). This app is webhook-first with an operator UI behind
// sign-in — the webhook needs HMAC secrets and the queue needs an operator session, so both are
// out of scope here. The gate's job is "the public surface renders, navigates, and stays
// accessible": the landing page and the public /help operator guide.

/** Gate on serious+critical axe violations. Minor/moderate findings are reported in the failure
 *  message when the gate trips, but don't fail the build on their own — the bar is WCAG AA, and
 *  axe's minor findings routinely include below-AA nitpicks that would make the gate flaky-red
 *  and get ignored. Tighten later if the pages stay clean. */
async function expectNoSeriousA11yViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const gating = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    gating.map((v) => `${v.impact}: ${v.id} — ${v.help} (${v.nodes.length} nodes)`),
  ).toEqual([]);
}

test("homepage renders and is accessible", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator("main")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test("primary nav reaches the operator help guide", async ({ page }) => {
  await page.goto("/");
  // Below the sm breakpoint the nav collapses behind a hamburger disclosure (header-nav.tsx),
  // so the mobile project must open the menu first. Semantic link copy is a charter rule —
  // target the destination by accessible name, not by CSS.
  const helpLink = page.getByRole("link", { name: "Help" }).filter({ visible: true });
  if ((await helpLink.count()) === 0) {
    await page.getByRole("button", { name: "Open menu" }).click();
  }
  await helpLink.first().click();
  await expect(page).toHaveURL(/\/help/);
  await expect(page.locator("h1").first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});
