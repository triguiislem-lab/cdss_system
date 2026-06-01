# cdss_system

Monorepo for the MedCity clinical decision support and automatic prescription assistance system.

## Services

- `medcity-app`: React frontend.
- `backend_template`: NestJS application backend.
- `cdss_professional/cdss_professional_v4181_patch22_multikg_evidence_validation_exact_fix`: FastAPI CDSS/IA backend.

## Documentation

- [Backend architecture and contracts](docs/BACKEND_ARCHITECTURE.md)
- [DevOps and Docker](DEVOPS.md)
- CI/CD: GitHub Actions runs CI automatically. Docker publishing and EC2 deployment are manual confirmation workflows after CI is green.

## Local Docker

```bash
docker compose up --build
```

For Supabase-backed development, create a local `.env` from `.env.example`, fill the Supabase Postgres values, then seed the NestJS database:

```bash
npm --prefix backend_template run seed
```

Default ports:

- Frontend: `http://localhost:5173`
- NestJS API: `http://localhost:3000/api`
- FastAPI CDSS: `http://localhost:8000`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`

On EC2, set `COMPOSE_PROFILES=host-monitoring` in `.env` to add EC2 host and Docker container metrics through `node-exporter` and `cadvisor`.
