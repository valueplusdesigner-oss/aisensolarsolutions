# Aisen Solar Solutions — Cloudflare staging package

This recovered package is a **pre-production review build**. It is not deployed and is not ready for DNS cutover.

## Safety boundaries

- GoDaddy remains the domain registrar and active website host until separately approved cutover.
- Do not change nameservers or production A/AAAA/CNAME records, MX, SPF, DKIM, DMARC, or email services.
- The original database export contains personal enquiries. This ZIP deliberately excludes `migrations/0002_data.sql` and all live credentials.
- Never push a real SQL enquiry export to a public GitHub repository.

## Components

- Cloudflare Worker + static assets (`public/`)
- Cloudflare D1 for the website CMS, projects, blog and enquiry records
- Cloudflare R2 for CMS uploads
- Admin CMS at `/aisen-preview/admin/`
- Contact API `/aisen-preview/api/content.php`
- Enquiry API `/aisen-preview/api/enquiries.php`
- Blog API `/aisen-preview/api/blogs.php`
- Public blog at `/blog/`

## Local checks

`node --check src/index.js && node --check src/admin.js && node --check src/article.js`

`npm test` (11 automated checks, including media routing, staging-only deployment guard and CSV safety)

Schema import for an empty staging DB: `migrations/0001_schema.sql`.

## Cloudflare staging — manual setup required

1. In Cloudflare, create a D1 database named `aisen-solar-staging` and R2 bucket named `aisen-solar-staging-media`.
2. Replace `REPLACE_AFTER_D1_CREATION` in `wrangler.jsonc` with the **staging** D1 database ID.
3. `npm install`
4. `npx wrangler d1 migrations apply aisen-solar-staging --remote`
5. Create secrets using `npx wrangler secret put ADMIN_EMAIL`, `npx wrangler secret put ADMIN_PASSWORD_HASH`, and `npx wrangler secret put SESSION_SECRET`. Use a **bcrypt password hash**, never plaintext.
6. `npm run deploy:staging`; a safety check refuses deployment until the staging D1 ID is configured and blocks production-domain routes. Verify a **workers.dev** preview domain before any production domain connection.
7. Test each item in `STAGING_CHECKLIST.md` before considering cutover.

### Restoring private CMS data

Keep the MySQL source dump and converted D1 data export in a private location. For a secure import after staging is available:

`npm run db:convert -- /absolute/private/aisen_enquiries.sql /absolute/private/aisen_data.sql`

Review the export for customer information; only then import via Cloudflare D1. Do not commit either SQL file to GitHub.

## Changes in this recovery package

- Recovered Cloudflare Worker/website/admin code from the prior migration ZIP.
- Added conservative Markdown and HTML blog rendering for previously broken hyperlinks.
- Kept rich content safe when preloaded into the Admin Blog Editor.
- Fixed Worker-first routing for `/media/*`, `/blog`, and the Admin root, so uploaded R2 images are reachable.
- Aligned the public blog list with the published-date checks already used by individual articles.
- Hardened enquiry CSV export against spreadsheet formula injection.
- Added tests and a deployment guard, plus explicit staging-only migration instructions.
- Excluded the private data migration and non-web FTP metadata from the distributable.

## Known limitations

- The saved database snapshot has project records, but no project image paths in those records; photos require restored media or manual re-upload.
- The enquiry API stores enquiries but does not send an email notification (`emailSent: false`).
- Cloudflare authentication, D1/R2 resource creation, runtime tests and deployment have not been completed in this local-only review.
- The static website frontend comes from an exported build, not its original editable Next.js source project.

## Staging privacy and canonical Admin path

- Added explicit `/aisen-preview/admin` to `/aisen-preview/admin/` redirect in the Worker.
- Staging Worker responses and static assets both receive `X-Robots-Tag: noindex, nofollow` on workers.dev; this does not change production DNS or content headers.

## R2 deferred (2026-10-13)

R2 is optional and is not configured for this staging deployment. Existing bundled images remain available; new Admin image uploads are disabled until the MEDIA binding is configured. Text editing remains available after database and Admin setup. The staging D1 database is created and its ID is configured. Apply the empty schema and configure Admin secrets before runtime validation. No subscription has been activated.
