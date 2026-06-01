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
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`

The NestJS API calls the CDSS container through:

```env
CDSS_API_BASE_URL=http://cdss:8000/v1
```

The default Docker compose CDSS configuration uses stub/demo backends so the stack can boot without large model and knowledge-base assets. For clinical/runtime validation, mount the real CDSS assets and replace the CDSS environment values.

## CI

Root-level GitHub Actions live in `.github/workflows`:

- `ci.yml`: runs on pushes and pull requests, checks the frontend, NestJS backend, FastAPI CDSS, Docker Compose config, and validates Docker image builds on `main`.
- `docker.yml`: manual confirmation workflow that builds and publishes frontend, NestJS API, and CDSS images to GHCR.
- `deploy-ec2.yml`: manual confirmation workflow that updates the EC2 checkout and restarts Docker Compose.
- `deploy-template.yml`: manual deployment handoff/reference template.

For EC2 deployment, configure these repository settings in GitHub:

Secrets:

```text
EC2_HOST=ec2-...compute-1.amazonaws.com
EC2_SSH_KEY=<contents of the private .pem key>
```

Variables:

```text
EC2_USER=ubuntu
EC2_APP_DIR=/opt/cdss_system
VITE_API_BASE_URL=
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

Recommended branch protection for `main`: require the `CI` workflow to pass before merging pull requests. Use the manual `Docker` and `Deploy EC2` workflows when you are ready to publish images or deploy a confirmed revision.

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

## Supabase Frontend Configuration

The React frontend is a Vite app, so Supabase browser variables must use the `VITE_` prefix:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

Local development can place these values in `medcity-app/.env.local`. Docker builds can read them from the repository-root `.env` file through `docker-compose.yml` build args.

Do not put Supabase service-role keys in the frontend. Service-role keys belong only in secure backend/server environments.

## Supabase Postgres for NestJS

The NestJS API can use Supabase Postgres through TypeORM. Keep these values in local `.env` files or deployment secrets, not in committed files:

```env
DATABASE_TYPE=postgres
DATABASE_HOST=db.<project-ref>.supabase.co
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=<your-database-password>
DATABASE_NAME=postgres
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=false
```

Use `DATABASE_SSL=true` for Supabase direct database connections. For GitHub Actions or production deployments, store `DATABASE_PASSWORD`, `JWT_SECRET`, and `JWT_REFRESH_SECRET` as secrets. Non-sensitive host/name flags can be repository or environment variables.

After configuring the variables, seed the first usable dataset and login accounts:

```bash
npm --prefix backend_template run seed
```

The seed creates demo admin/doctor users, several patients with CDSS clinical context, and starter medicines. The frontend then reads patients, prescription queues, audits, and interaction data through the NestJS API instead of static demo arrays.

## Monitoring: Prometheus And Grafana

The Docker stack includes Prometheus and Grafana:

- Prometheus config: `monitoring/prometheus/prometheus.yml`
- Grafana datasource provisioning: `monitoring/grafana/provisioning/datasources/prometheus.yml`
- Grafana dashboard provisioning: `monitoring/grafana/provisioning/dashboards/dashboards.yml`
- Default dashboard: `monitoring/grafana/dashboards/medcity-overview.json`

Scraped endpoints:

```text
api:3000/api/metrics
cdss:8000/metrics
prometheus:9090/metrics
node-exporter:9100/metrics     # EC2/Linux host profile
cadvisor:8080/metrics          # EC2/Linux containers profile
```

Local URLs:

```text
Prometheus: http://localhost:9090
Grafana:    http://localhost:3001
```

Set Grafana credentials in `.env`:

```env
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=<strong-password>
PROMETHEUS_PORT=9090
GRAFANA_PORT=3001
```

The Grafana dashboard is provisioned automatically at startup under the `MedCity` folder. Prometheus and Grafana ports are bound to `127.0.0.1` by default; on EC2, keep them private and access them through SSH tunneling or a protected reverse proxy instead of exposing them directly to the internet.

By default, Prometheus monitors the application services. To monitor the EC2 host itself, enable the Linux host-monitoring profile on the EC2 `.env`:

```env
COMPOSE_PROFILES=host-monitoring
```

This starts:

- `node-exporter`: EC2 CPU, RAM, disk, filesystem, network, load.
- `cadvisor`: Docker container CPU, memory, network, and filesystem usage.

The additional `MedCity EC2 Host` Grafana dashboard is provisioned automatically. Keep this profile disabled on Windows local development because it uses Linux host mounts such as `/`, `/sys`, and `/var/lib/docker`.
