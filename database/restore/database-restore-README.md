# LangNation Database Restore

This directory contains the reproducible database restore container for the AWS Capstone environment.

## Build context

Build from the repository's `database` directory:

```powershell
docker build -f restore/Dockerfile -t langnation-db-restore:local .
```

## Runtime configuration

The container does not contain AWS resource IDs.

It expects these environment variables at runtime:

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USERNAME`
- `DB_PASSWORD`

Optional:

- `EXPECTED_TABLE_COUNT` (default: `58`)
- `MAX_ATTEMPTS` (default: `30`)
- `SLEEP_SECONDS` (default: `10`)
- `SEED_FILE` (default: `/restore/langnation-capstone-sanitized.sql`)

Terraform/ECS will later inject the current values after every sandbox rebuild.
