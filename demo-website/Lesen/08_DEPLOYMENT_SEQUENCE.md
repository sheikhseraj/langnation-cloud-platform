# Deployment Sequence and Rollback Notes

Because this feature spans two applications, avoid a release where `langnation.com` expects an API that `langnation.de` does not yet provide.

## Recommended release sequence

### 1. Dictionary application first

If a new Dictionary API endpoint is required:
- add it as a backward-compatible read-only endpoint;
- keep all existing Dictionary web behavior unchanged;
- deploy it first;
- verify production response, timeout behavior and rate limiting;
- verify no secrets or internal DB fields are exposed.

If an existing Dictionary endpoint can be reused safely, no Dictionary deployment may be necessary.

### 2. Student Portal database migration

Apply only the new/extended reading, exercise, progress and vocabulary migrations actually required by the inspected codebase.

Migrations should be backward compatible wherever practical:
- new nullable columns before code starts writing them;
- new tables without destructive changes;
- indexes/constraints tested against existing data.

### 3. Main Student Portal

Deploy the `langnation.com` changes after the Dictionary contract is available.

Use existing environment/config conventions for:
- Dictionary base URL;
- optional service credential if the project intentionally uses one;
- request timeout;
- cache settings;
- feature flag if the project supports feature flags.

### 4. Staging validation

Run the complete acceptance checklist with:
- one entitled student;
- one non-entitled student;
- desktop browser;
- mobile viewport/device;
- simulated Dictionary timeout/failure;
- repeated word lookup;
- all pilot exercises.

### 5. Production enablement

If feature flags exist, deploy disabled first, smoke-test, then enable for the pilot course/level before broader rollout.

## Rollback

If the Student Portal feature has a problem:
- disable the Lesen feature flag if available, or roll back the main-site release;
- leave the new backward-compatible Dictionary endpoint in place unless it itself is defective;
- do not drop new data tables during an emergency app rollback unless the migration is proven safe and data preservation is not required.

If the Dictionary endpoint has a problem:
- Student Portal must degrade to its "Dictionary temporarily unavailable" state;
- students must still be able to read and complete exercises;
- fix/rollback the Dictionary service independently.
