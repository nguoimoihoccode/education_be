# JWT Key Directory

Do not commit real key files to source control.

Provide keys using one of these options:

1. Environment variables:
- `JWT_PRIVATE_KEY`
- `JWT_PUBLIC_KEY`

2. File paths (mount secrets at runtime):
- `JWT_PRIVATE_KEY_PATH`
- `JWT_PUBLIC_KEY_PATH`

Generate local keys with:

`npm run generate:jwt-keys`

For local development, if keys are missing, the backend generates an ephemeral key pair automatically.
