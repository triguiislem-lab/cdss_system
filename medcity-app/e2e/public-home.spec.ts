import { expect, test } from "@playwright/test";
import { mockMedcityApi } from "./fixtures/api";

test("loads CMS-managed public home sections from the backend contract", async ({ page }) => {
  await mockMedcityApi(page);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: /MedCity/i }).first()).toBeVisible();
  await expect(page.getByText("Securite de prescription")).toBeVisible();
  await expect(page.getByText("Suivi cardiovasculaire et prevention.")).toBeVisible();
  await expect(page.getByText("Dr. Samar Ben Ali")).toBeVisible();
  await expect(page.getByText("Pharmacie Centrale de Tunisie")).toBeVisible();
});

test("opens a CMS article detail from the public NestJS endpoint", async ({ page }) => {
  await mockMedcityApi(page);

  await page.goto("/blog");
  await page.getByRole("link", { name: /MedCity CDSS connecte au backend/i }).click();

  await expect(page).toHaveURL(/\/article\/medcity-cdss-connecte-backend$/);
  await expect(page.getByRole("heading", { name: "MedCity CDSS connecte au backend" })).toBeVisible();
  await expect(page.getByText("Le contenu public provient de l'API CMS")).toBeVisible();
});

test("loads public doctors directory from the NestJS public endpoint", async ({ page }) => {
  await mockMedcityApi(page);

  await page.goto("/doctors");

  await expect(page.getByText("Dr. Ahmed Ben Ali")).toBeVisible();
  await expect(page.getByText("Medecine generale")).toBeVisible();
  await expect(page.getByText("Cabinet MedCity")).toBeVisible();
});
