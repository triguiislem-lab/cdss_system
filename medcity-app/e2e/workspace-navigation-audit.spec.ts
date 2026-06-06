import { expect, test, type Page } from "@playwright/test";
import { mockMedcityApi } from "./fixtures/api";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
}

async function expectHealthyPage(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator("body")).not.toContainText(/not found|unhandled test api route|api request failed/i);
  await expect(page.locator("main")).toBeVisible();
}

test("doctor workspace routes and direct links are wired", async ({ page }) => {
  const apiErrors: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 400) {
      apiErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  await mockMedcityApi(page);

  await login(page, "dr.ahmed@medcity.tn", "Medcity123");
  await expect(page).toHaveURL(/\/doctor$/);

  const doctorRoutes = [
    "/doctor",
    "/doctor/patients",
    "/doctor/patients/patient-1042",
    "/doctor/consultations",
    "/doctor/consultations/consultation-5001",
    "/doctor/prescription/new?patientId=patient-1042",
    "/doctor/prescriptions",
    "/doctor/prescription/rx-2087/review",
    "/doctor/prescription/rx-2087/ordonnance?patientId=patient-1042",
    "/doctor/medicines",
    "/doctor/medicine-contributions",
    "/doctor/contact-admin",
  ];

  for (const route of doctorRoutes) {
    await expectHealthyPage(page, route);
  }

  await expect(page.locator("body")).toContainText(/MedCity|Doctor|Clinical|Prescription|Ordonnance/i);
  expect(apiErrors).toEqual([]);
});

test("doctor session survives direct protected-route reload", async ({ page }) => {
  await mockMedcityApi(page);

  await login(page, "dr.ahmed@medcity.tn", "Medcity123");
  await expect(page).toHaveURL(/\/doctor$/);

  await page.goto("/doctor/prescription/rx-2087/ordonnance?patientId=patient-1042");
  await expect(page).toHaveURL(/\/doctor\/prescription\/rx-2087\/ordonnance/);
  await expect(page.getByText("Back to patient")).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/doctor\/prescription\/rx-2087\/ordonnance/);
  await expect(page.getByText("Back to patient")).toBeVisible();
  await page.getByText("Back to patient").click();
  await expect(page).toHaveURL(/\/doctor\/patients\/patient-1042$/);
  await expect(page.locator("body")).not.toContainText(/Patient not found/i);
});

test("admin workspace routes are wired", async ({ page }) => {
  const apiErrors: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 400) {
      apiErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  await mockMedcityApi(page);

  await login(page, "admin@medcity.tn", "Admin123");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("link", { name: /Monitoring Grafana/i })).toHaveAttribute(
    "href",
    /\/d\/medcity-overview\/medcity-overview/,
  );

  const adminRoutes = [
    "/admin",
    "/admin/doctors",
    "/admin/cms",
    "/admin/cdss/medicines",
    "/admin/cdss/medicine-contributions",
    "/admin/cdss/audit",
  ];

  for (const route of adminRoutes) {
    await expectHealthyPage(page, route);
  }

  await expect(page.locator("body")).toContainText(/MedCity|Admin|Audit|Medic/i);
  expect(apiErrors).toEqual([]);
});
