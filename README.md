# cdss_system

Monorepo for the MedCity clinical decision support and automatic prescription assistance system.

## Services

- `medcity-app`: React frontend.
- `backend_template`: NestJS application backend.
- `cdss_professional/cdss_professional_v4181_patch22_multikg_evidence_validation_exact_fix`: FastAPI CDSS/IA backend.

## Documentation

- [Backend architecture and contracts](docs/BACKEND_ARCHITECTURE.md)
- [DevOps and Docker](DEVOPS.md)

## Local Docker

```bash
docker compose up --build
```

Default ports:

- Frontend: `http://localhost:5173`
- NestJS API: `http://localhost:3000/api`
- FastAPI CDSS: `http://localhost:8000`
