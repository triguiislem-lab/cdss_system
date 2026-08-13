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

test("shows a professional fallback for unavailable public medicine details", async ({ page }) => {
  await mockMedcityApi(page);

  await page.goto("/");
  await page.getByRole("button", { name: /Medicines|Medicaments|Médicaments/i }).click();
  await page.getByPlaceholder(/Medicine name|Nom du médicament|Nom du mÃ©dicament/i).fill("Paracetamol");
  await page.getByRole("button", { name: /Paracetamol/i }).click();

  await expect(page.getByText(/Non renseigné|Not provided/).first()).toBeVisible();
  await expect(page.getByText("Indication non exposée par le connecteur Firebase.")).not.toBeVisible();
  await expect(page.getByText("liste_amm_xls")).not.toBeVisible();
  await expect(page.getByText("medicaments_with_detail_and_rcp")).not.toBeVisible();
  await expect(page.getByText("tunisia_master")).not.toBeVisible();
  await expect(page.getByText("uploaded file: liste_amm (1).xls")).not.toBeVisible();
  await expect(page.getByText("Précaution")).not.toBeVisible();
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
  await expect(page.getByText("Medecine generale").last()).toBeVisible();
  await expect(page.getByText("Clinique Test")).toBeVisible();
  await expect(page.getByText("4.5")).toBeVisible();
  await expect(page.getByText("Tunis", { exact: true }).last()).toBeVisible();
});

test("submits the public newsletter form to the NestJS endpoint", async ({ page }) => {
  await mockMedcityApi(page);

  await page.goto("/");
  await page.locator("footer input[type='email']").fill("doctor@example.com");
  await page.getByRole("button", { name: /Subscribe for free|S'abonner gratuitement/i }).click();

  await expect(page.getByText(/Your newsletter subscription has been saved|Votre inscription à la newsletter est enregistrée/i)).toBeVisible();
});

test("submits the public contact form to the NestJS endpoint", async ({ page }) => {
  await mockMedcityApi(page);

  await page.goto("/contact");
  await page.getByPlaceholder(/Dr\. Your Name|Dr\. Votre Nom/i).fill("Dr. Test");
  await page.getByRole("main").locator("form input[type='email']").fill("doctor@example.com");
  await page.getByPlaceholder(/Message subject|Objet de votre message/i).fill("Question");
  await page.getByPlaceholder(/Your message|Votre message/i).fill("Bonjour, je veux plus d'informations sur MedCity.");
  await page.getByRole("button", { name: /Send message|Envoyer le message/i }).click();

  await expect(page.getByRole("heading", { name: /Message sent!|Message envoyé !/i })).toBeVisible();
});
