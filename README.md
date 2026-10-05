# Aisen Solar Solutions — Cloudflare migration

This project migrates only website hosting. The domain remains registered at
GoDaddy, and existing email records must remain unchanged.

## Components

- Cloudflare Workers + Static Assets: existing website frontend
- Cloudflare D1: CMS and enquiry data
- Cloudflare R2: future CMS image uploads
- GoDaddy email: unchanged

## Safety rules

1. Do not change nameservers or production DNS before staging acceptance.
2. Preserve every MX, SPF, DKIM and DMARC record exactly.
3. Never deploy `config.php`, PHP files, server logs or old database credentials.
4. Take a final incremental database export immediately before production cutover.
5. Keep the GoDaddy hosting active until the live site, forms, admin and blog are verified.

## Local preparation

```sh
npm install
npm run db:convert
npm run build:pages
```

## GitHub + Cloudflare Pages deployment

The repository intentionally excludes the converted production data migration.
It contains application code, static assets and the empty D1 schema only.

Cloudflare Pages build settings:

- Build command: `npm run build:pages`
- Build output directory: `dist`
- Root directory: `/`

After the first build, add dashboard bindings named `DB` (D1) and `MEDIA` (R2),
then import the private D1 data file outside GitHub.

After Cloudflare authentication, create D1 and R2 resources, replace the D1
placeholder in `wrangler.jsonc`, apply both migrations, and deploy to the
workers.dev staging URL.
