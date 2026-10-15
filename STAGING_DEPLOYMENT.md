# Cloudflare staging deployment readiness

This is a **staging-only** workflow. The existing GoDaddy website, domain registration, nameservers, DNS and email must remain unchanged.

## Current blockers
1. The source code in `aisen-solar-cloudflare-staging-v2.zip` must first be uploaded to this repository **without** enquiry data, database dumps, secrets or server logs.
2. In Cloudflare create D1 `aisen-solar-staging` and R2 `aisen-solar-staging-media`; put the staging D1 ID in `wrangler.jsonc`.
3. Configure GitHub Environment `cloudflare-staging`, with repository/environment secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The token needs only the minimum Workers, D1, and R2 permissions applicable to staging.
4. Apply the empty D1 schema to staging, configure ADMIN_EMAIL, ADMIN_PASSWORD_HASH and SESSION_SECRET as Cloudflare Worker secrets, and ensure uploads and API responses work.
5. Run **Actions > Cloudflare staging deployment > Run workflow**, type `STAGING-ONLY`.

Never connect the production hostname or change DNS from this staging workflow. Never commit production enquiry records to a public repository.

## Review gates
- Authenticate to the `workers.dev` staging URL and verify Admin CMS.
- Check enquiry forms, media uploads, blogs, front-end routes and SEO.
- Confirm email MX, SPF, DKIM and DMARC remain unchanged.
- Production cutover requires a separate explicit approval and a current backup.
