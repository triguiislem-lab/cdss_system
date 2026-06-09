import { expect, test } from "@playwright/test";
import { mockMedcityApi } from "./fixtures/api";

test("redirects protected doctor pages to login when there is no session", async ({ page }) => {
  await mockMedcityApi(page);

  await page.goto("/doctor");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test("logs in as a doctor and loads backend dashboard data", async ({ page }) => {
  await mockMedcityApi(page);

  await page.goto("/login");
  await page.locator('input[type="email"]').fill("dr.ahmed@medcity.tn");
  await page.locator('input[type="password"]').fill("Medcity123");
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/doctor$/);
  await expect(page.getByRole("heading", { name: "Clinical dashboard" })).toBeVisible();
  await expect(page.getByText("Pending prescriptions")).toBeVisible();
  await expect(page.getByText("Eleanor Whitfield")).toBeVisible();
  await expect(page.getByText("Community-acquired pneumonia")).toBeVisible();
});

test("keeps doctor consultations wired to the backend", async ({ page }) => {
  await mockMedcityApi(page);

  await page.goto("/login");
  await page.locator('input[type="email"]').fill("dr.ahmed@medcity.tn");
  await page.locator('input[type="password"]').fill("Medcity123");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/doctor$/);

  await page.getByRole("link", { name: /consultations/i }).first().click();
  await expect(page).toHaveURL(/\/doctor\/consultations$/);

  await expect(page.getByRole("heading", { name: /consultations/i })).toBeVisible();
  await expect(page.getByText("Eleanor Whitfield - Suivi pneumonie communautaire")).toBeVisible();

  await page.getByText("Eleanor Whitfield - Suivi pneumonie communautaire").click();
  await expect(page).toHaveURL(/\/doctor\/consultations\/consultation-5001$/);
  await expect(page.getByRole("heading", { name: "Eleanor Whitfield" })).toBeVisible();
  await expect(page.getByText("Suivi pneumonie communautaire").first()).toBeVisible();
});

test("redirects to login when a protected API call reports an expired session", async ({ page }) => {
  await mockMedcityApi(page);

  await page.goto("/login");
  await page.locator('input[type="email"]').fill("dr.ahmed@medcity.tn");
  await page.locator('input[type="password"]').fill("Medcity123");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/doctor$/);

  await page.route(/\/api\/patients(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 401,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Unauthorized" }),
    }),
  );
  await page.getByRole("link", { name: /patients/i }).first().click();
  await expect(page).toHaveURL(/\/login$/);
});

test("logs in as an admin and loads administration KPIs", async ({ page }) => {
  await mockMedcityApi(page);

  await page.goto("/login");
  await page.locator('input[type="email"]').fill("admin@medcity.tn");
  await page.locator('input[type="password"]').fill("Admin123");
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("MedCity Admin", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Administration plateforme|Platform administration/i)).toBeVisible();
  await expect(page.getByText("pending_review")).toBeVisible();
  await expect(page.getByText(/Eleanor Whitfield.*Review high-risk interaction/)).toBeVisible();
});
