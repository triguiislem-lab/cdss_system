# MedCity CDSS DevOps

This repository is organized as a three-service system:

- `medcity-app`: React frontend served by Nginx.
- `backend_template`: NestJS application API, auth, database, prescription persistence, audit, and the CDSS adapter.
- `cdss_professional/cdss_professional_v4181_patch22_multikg_evidence_validation_exact_fix`: FastAPI CDSS/IA runtime.

## Local Docker Runtime

From the repository root:

```bash
docker compose up --build
```

Default exposed ports:

- Frontend: `http://localhost:5173`
- NestJS API: `http://localhost:3000/api`
- FastAPI CDSS: `http://localhost:8000`
- LibreTranslate: `http://localhost:5000`

The NestJS API calls the CDSS container through:

```env
CDSS_API_BASE_URL=http://cdss:8000/v1
```

The default Docker compose CDSS configuration uses stub/demo backends so the stack can boot without large model and knowledge-base assets. For clinical/runtime validation, mount the real CDSS assets and replace the CDSS environment values.

## CI

Root-level GitHub Actions live in `.github/workflows`:

- `ci.yml`: builds and checks all three codebases.
- `docker.yml`: builds and publishes frontend, NestJS API, and CDSS images to GHCR.
- `deploy-template.yml`: manual deployment handoff template.

## Images

The Docker workflow publishes:

- `ghcr.io/<owner>/<repo>-frontend`
- `ghcr.io/<owner>/<repo>-api`
- `ghcr.io/<owner>/<repo>-cdss`

## Production Notes

- Set strong `JWT_SECRET` and `JWT_REFRESH_SECRET`.
- Use managed PostgreSQL or a persistent PostgreSQL volume.
- Set `DATABASE_SYNC=false` and use migrations for production.
- CDSS clinical deployment must use real vector/KG/formulary/model assets and pass the CDSS governance/readiness checks.
- Keep the frontend behind the NestJS API; do not expose FastAPI CDSS directly to browser clients.
