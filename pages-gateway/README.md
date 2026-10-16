# Public website with external DNS

This Pages entry point forwards every request over an internal Cloudflare service
binding to the existing Aisen Solar Worker. It retains the same admin login,
database, blogs, enquiries and media; it creates no second CMS or data store.

## GitHub-connected Pages setup

- Project: `aisen-solar-public`
- Repository: `valueplusdesigner-oss/aisensolarsolutions`
- Branch: `production/cloudflare-www`
- Root directory: `pages-gateway`
- Framework: None
- Build command: leave empty
- Output directory: `public`
- Service binding: `APP` → `aisen-solar-staging` (defined in wrangler.jsonc)

After validating the deployment and the existing admin, associate
`www.aisensolarsolutions.com` with the Pages project. Then change only the existing
`www` CNAME at GoDaddy to the exact Pages hostname assigned to this project.
Do not guess that hostname before project creation.

Keep GoDaddy nameservers and all email records unchanged. Do not activate the
pending full Cloudflare DNS zone. Do not modify MX, SPF, DKIM, DMARC, email,
autodiscover, SRV, or any other email configuration.

The bare domain (`aisensolarsolutions.com`) still needs a website-only redirect
to `https://www.aisensolarsolutions.com` with the path and query preserved.
This is a remaining cutover dependency, not implemented by this project.
Do not cancel GoDaddy services as part of this deployment.

The gateway must be tested with blog pages, protected admin login, cookies,
form submissions, exports, and media before the www CNAME is changed.
