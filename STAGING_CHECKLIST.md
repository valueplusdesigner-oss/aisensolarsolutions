# Aisen Solar — Staging QA checklist

Staging runs on workers.dev only. All test entries must be verified before any production cutover.

- [ ] D1 schema migrated; all core CMS tables exist
- [ ] Homepage and `/aisen-preview/` return valid pages and load images/CSS/JS
- [ ] Contact content API returns JSON from D1
- [ ] Admin login and logout work; failed logins do not authenticate
- [ ] Admin CSRF protection rejects forged saves
- [ ] Contact details, Brands, Stats, Offices, Projects, Testimonials save and reload correctly
- [ ] `/media/*` is served by the Worker (not static assets), and project/blog uploads render from R2
- [ ] `/blog` and `/aisen-preview/admin` redirect or load correctly without a trailing slash
- [ ] Project image uploads are stored in R2 and show on website
- [ ] Blog rich editor loads an existing article; HTML and legacy Markdown links are clickable and sanitized
- [ ] Blog publish/unpublish, SEO metadata and URL slugs work
- [ ] Enquiry form saves to D1 and displays successful submission response
- [ ] Enquiry CSV export is authenticated, contains correct data, and does not execute spreadsheet formulas
- [ ] No customer enquiry database is visible through public GitHub or static assets
- [ ] No emails or MX/SPF/DKIM/DMARC settings changed
- [ ] Fresh production data backup taken immediately prior to any future cutover
- [ ] GoDaddy hosting retained as rollback option through post-launch verification

- [ ] Check staging responses include `X-Robots-Tag: noindex, nofollow` on both Worker and static routes; no indexing of workers.dev preview
