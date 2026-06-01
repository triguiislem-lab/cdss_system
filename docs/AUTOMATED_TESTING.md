# Tests automatises

## Strategie

Le projet utilise Playwright pour les tests end-to-end du frontend React.

Playwright est le choix principal pour le moment, car il couvre Chromium, Firefox et WebKit avec une seule configuration. Cypress ou Selenium peuvent etre ajoutes plus tard pour des besoins specifiques, mais les maintenir en parallele des le depart ajouterait beaucoup de duplication.

## Ce qui est couvert

- Page publique: verification que les sections CMS sont chargees depuis le contrat API public.
- Details publics: verification qu'un article CMS ouvre `/article/:slug` via `/api/public/posts/:slug`.
- Annuaire public: verification que `/doctors` consomme `/api/public/doctors`.
- Authentification: redirection des routes protegees vers `/login`.
- Espace docteur: login puis verification du dashboard clinique avec patients et prescriptions.
- Espace admin: login puis verification du dashboard admin et des KPI alimentes par l'API.

Les tests mockent les endpoints API dans `medcity-app/e2e/fixtures/api.ts`. Cela rend la CI stable et rapide: elle valide l'integration frontend/API sans exiger Supabase, NestJS ou FastAPI en execution.

Un test contrat complementaire existe cote NestJS: `backend_template/test/frontend-contract.e2e.ts`.
Il demarre NestJS avec SQLite temporaire, seed des donnees minimales, puis appelle les vrais endpoints consommes par React:

- `/api/public/home`
- `/api/public/posts/:slug`
- `/api/public/doctors`
- `/api/auth/login`
- `/api/auth/me`
- `/api/patients`
- `/api/prescriptions`
- `/api/medicines`
- `/api/doctors`
- `/api/cms/posts`
- `/api/audit`

Ce test ne lance pas FastAPI/CDSS. Pour cette partie, le backend NestJS reste seulement aligne sur les endpoints CDSS existants; une pipeline dediee pourra tester FastAPI separement.

## Commandes locales

Depuis `medcity-app`:

```bash
npm run e2e
npm run e2e:headed
npm run e2e:ui
npm run e2e:report
```

Avant le premier lancement local, installer le navigateur Playwright:

```bash
npx playwright install chromium
```

Depuis `backend_template`:

```bash
npm run contract:frontend
```

## CI/CD

Le workflow `.github/workflows/ci.yml` execute maintenant:

1. `npm ci`
2. `npm run typecheck`
3. `npm run build`
4. `npx playwright install --with-deps chromium`
5. `npm run e2e`

Le job backend execute aussi `npm run contract:frontend` apres le build NestJS.

Chaque push ou pull request passe donc par les controles frontend classiques plus les parcours utilisateur critiques.

## Extension conseillee

Les prochains tests utiles seraient:

- creation d'un patient depuis l'espace docteur;
- creation d'une prescription et verification du passage vers le CDSS;
- gestion CMS admin: ajout/modification/suppression d'une section;
- tests API NestJS avec Jest/Supertest;
- tests FastAPI avec Pytest sur les contrats consommes par NestJS.
