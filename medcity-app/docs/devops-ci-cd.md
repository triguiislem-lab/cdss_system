# DevOps, CI/CD and Docker

This project is prepared with a simple DevOps workflow:

- Frontend: React/Vite served by Nginx.
- Backend: NestJS API running on Node.js.
- Database: PostgreSQL.
- Translation engine: LibreTranslate container.
- CI: GitHub Actions validates frontend and backend builds.
- CD: GitHub Actions builds and publishes Docker images to GitHub Container Registry.

Node.js 22 LTS is used in Docker and CI because Vite 7 requires Node `20.19+` or `22.12+`.

## Local Docker Environment

From `medcity-app`:

```powershell
npm run docker:up
```

Services:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000/api`
- Health check: `http://localhost:3000/api/health`
- LibreTranslate: `http://localhost:5000`
- PostgreSQL: internal Docker network only

Stop services:

```powershell
npm run docker:down
```

Show logs:

```powershell
npm run docker:logs
```

## Environment Variables

Root `.env` is used by `docker-compose.yml`:

```env
JWT_SECRET=replace-with-strong-secret
JWT_REFRESH_SECRET=replace-with-another-strong-secret
```

Backend variables are defined in `backend_template/.env.example`.

Important production values:

- `DATABASE_TYPE=postgres`
- `DATABASE_HOST=postgres`
- `DATABASE_SYNC=false` once migrations are introduced
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `LIBRETRANSLATE_URL`

## CI Workflow

File: `.github/workflows/ci.yml`

Runs on push and pull requests to `main` and `develop`.

It checks:

- Frontend dependencies install with `npm ci`
- Frontend TypeScript with `npm run typecheck`
- Frontend production build with `npm run build`
- Backend dependencies install with `npm ci`
- Backend production build with `npm run build`

## Docker Publishing Workflow

File: `.github/workflows/docker.yml`

Runs on:

- Push to `main`
- Version tags such as `v1.0.0`
- Manual `workflow_dispatch`

It publishes:

- `ghcr.io/<owner>/<repo>-frontend`
- `ghcr.io/<owner>/<repo>-api`

GitHub automatically provides `GITHUB_TOKEN`, so no extra registry secret is required for GHCR in the same repository.

## Deployment Model

For a small VPS, install Docker and run:

```powershell
docker compose pull
docker compose up -d
```

For a production server, use stronger secrets and set:

```env
DATABASE_SYNC=false
JWT_SECRET=<strong-secret>
JWT_REFRESH_SECRET=<strong-secret>
```

Then use TypeORM migrations instead of automatic schema sync.

## Recommended Next Step

The current setup is ready for build/deploy automation. The next professional step is to add:

- TypeORM migrations.
- Backend unit tests.
- Frontend component/workflow tests.
- Staging and production compose files.
- A deployment workflow that SSHs into the server and runs `docker compose pull && docker compose up -d`.
