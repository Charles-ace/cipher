import { expect, test } from "@playwright/test";

test.describe("outcome overlay", () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { solana: object }).solana = {
        connect: async () => ({
          publicKey: { toString: () => "So11111111111111111111111111111111111111112" },
        }),
      };
    });
  });

  test("full-screen outcome appears after sealing (win, lose, or draw)", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: /connect solana wallet/i }).click();

    await expect(page.getByRole("button", { name: /wallet connected/i })).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(2500);

    const seal = page.getByRole("button", { name: /seal strategy/i }).first();
    await expect(seal).toBeEnabled({ timeout: 20_000 });

    // Orbit / layout animations can prevent Playwright's "stable" hit-test; force avoids flaky timeouts.
    await seal.click({ force: true });

    const title = page.getByRole("heading", { name: /you won|you lose|^draw$/i });
    await expect(title).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole("button", { name: /^continue$/i })).toBeVisible();
  });
});
