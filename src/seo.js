const SITE = 'https://www.aisensolarsolutions.com';
const staticPaths = ['/', '/blog/', '/solutions/residential-solar/', '/solutions/commercial-solar/', '/solutions/industrial-solar-epc/', '/solutions/hybrid-solar-storage/'];
const xml = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');

/** Sitemap reflects the CMS on every request, including newly published articles. */
export async function sitemapResponse(env) {
  const posts = (await env.DB.prepare("SELECT slug,updated_at,published_at,created_at FROM cms_blog_posts WHERE is_published=1 AND published_at IS NOT NULL AND published_at<=datetime('now') ORDER BY published_at DESC,id DESC").all()).results;
  const urls = staticPaths.map(path => `<url><loc>${SITE}${path}</loc></url>`);
  for (const post of posts) {
    const date = String(post.updated_at || post.published_at || post.created_at || '').slice(0,10);
    urls.push(`<url><loc>${xml(`${SITE}/blog/${encodeURIComponent(post.slug)}/`)}</loc>${/^\d{4}-\d{2}-\d{2}$/.test(date) ? `<lastmod>${date}</lastmod>` : ''}</url>`);
  }
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`, { headers: {'content-type':'application/xml; charset=utf-8','cache-control':'no-store'} });
}
