import { handleAdmin } from './admin.js';
import { sitemapResponse } from './seo.js';
import { mediaResponse } from './media.js';
import { ensureContentRecovery } from './recovery.js';
import { renderArticleHtml } from './article.js';
import { adminRootLocation, addStagingResponseHeaders, isWorkerStaticAsset } from './routing.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function clean(value, maxLength) {
  return typeof value === 'string'
    ? value.replace(/\s+/gu, ' ').trim().slice(0, maxLength)
    : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function stripTags(value) {
  return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function publicBlogRow(row, withContent = false) {
  const excerpt = row.excerpt || stripTags(row.content).slice(0, 190);
  const result = {
    id: Number(row.id),
    title: row.title,
    slug: row.slug,
    excerpt,
    category: row.category,
    author: row.author_name,
    image: row.featured_image || null,
    publishedAt: row.published_at || row.created_at,
    url: `/blog/${encodeURIComponent(row.slug)}/`,
  };
  if (withContent) {
    result.content = row.content;
    result.seoTitle = row.seo_title || row.title;
    result.seoDescription = row.seo_description || excerpt;
  }
  return result;
}

async function contentApi(env) {
  const [settingsResult, brandsResult, statsResult, projectsResult, imagesResult, testimonialsResult, officesResult] =
    await env.DB.batch([
      env.DB.prepare('SELECT setting_key, setting_value FROM cms_settings'),
      env.DB.prepare('SELECT brand_name FROM cms_brands WHERE is_active=1 ORDER BY sort_order,id'),
      env.DB.prepare('SELECT id,stat_value,stat_suffix,stat_label FROM cms_difference_stats WHERE is_active=1 ORDER BY sort_order,id'),
      env.DB.prepare('SELECT id,project_type,title,meta,css_class FROM cms_projects WHERE is_active=1 ORDER BY sort_order,id'),
      env.DB.prepare('SELECT project_id,image_path FROM cms_project_images ORDER BY sort_order,id'),
      env.DB.prepare('SELECT id,company,quote_text,person_name,person_role,initials FROM cms_testimonials WHERE is_active=1 ORDER BY sort_order,id'),
      env.DB.prepare('SELECT id,office_type,office_name,address_text,phone_display,phone_href,email FROM cms_offices WHERE is_active=1 ORDER BY sort_order,id'),
    ]);

  const settings = Object.fromEntries(settingsResult.results.map((row) => [row.setting_key, String(row.setting_value ?? '')]));
  const imageMap = new Map();
  for (const image of imagesResult.results) {
    const list = imageMap.get(image.project_id) ?? [];
    if (list.length < 4) list.push(image.image_path);
    imageMap.set(image.project_id, list);
  }

  return json({
    contact: {
      phoneDisplay: settings.contact_phone_display ?? '',
      phoneHref: settings.contact_phone_href ?? '',
      whatsapp: settings.contact_whatsapp ?? '',
      email: settings.contact_email ?? '',
      address: settings.contact_address ?? '',
      hours: settings.contact_hours ?? '',
      generalEnquiry: {
        email: settings.general_enquiry_email ?? '',
        phoneDisplay: settings.general_enquiry_phone_display ?? '',
        phoneHref: settings.general_enquiry_phone_href ?? '',
      },
      corporateEnquiry: {
        email: settings.corporate_enquiry_email ?? '',
        phoneDisplay: settings.corporate_enquiry_phone_display ?? '',
        phoneHref: settings.corporate_enquiry_phone_href ?? '',
      },
      offices: officesResult.results.map((row) => ({
        id: Number(row.id), type: row.office_type, name: row.office_name,
        address: row.address_text, phoneDisplay: row.phone_display,
        phoneHref: row.phone_href, email: row.email,
      })),
    },
    difference: {
      kicker: settings.difference_kicker ?? '',
      headline: settings.difference_headline ?? '',
      accent: settings.difference_accent ?? '',
      description: settings.difference_description ?? '',
      linkText: settings.difference_link_text ?? '',
      stats: statsResult.results.map((row) => ({
        id: Number(row.id), value: String(row.stat_value),
        suffix: String(row.stat_suffix), label: String(row.stat_label),
      })),
    },
    projects: projectsResult.results.map((row) => ({
      id: Number(row.id), type: row.project_type, title: row.title,
      meta: row.meta, cls: row.css_class, images: imageMap.get(row.id) ?? [],
    })),
    testimonials: testimonialsResult.results.map((row) => ({
      id: Number(row.id), company: row.company, quote: row.quote_text,
      name: row.person_name, role: row.person_role, initials: row.initials,
    })),
    brands: brandsResult.results.map((row) => row.brand_name),
  });
}

async function blogsApi(request, env) {
  const url = new URL(request.url);
  const slug = clean(url.searchParams.get('slug'), 220);
  if (slug) {
    const row = await env.DB.prepare(
      "SELECT * FROM cms_blog_posts WHERE slug=? AND is_published=1 AND published_at IS NOT NULL AND published_at<=datetime('now') LIMIT 1",
    ).bind(slug).first();
    return row ? json({ post: publicBlogRow(row, true) }) : json({ error: 'Blog post not found.' }, 404);
  }

  const limit = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get('limit') || '12', 10) || 12));
  const category = clean(url.searchParams.get('category'), 100);
  const base = "SELECT * FROM cms_blog_posts WHERE is_published=1 AND published_at IS NOT NULL AND published_at<=datetime('now')";
  const statement = category
    ? env.DB.prepare(`${base} AND category=? ORDER BY published_at DESC,id DESC LIMIT ?`).bind(category, limit)
    : env.DB.prepare(`${base} ORDER BY published_at DESC,id DESC LIMIT ?`).bind(limit);
  const [posts, categories] = await env.DB.batch([
    statement,
    env.DB.prepare("SELECT DISTINCT category FROM cms_blog_posts WHERE is_published=1 AND published_at IS NOT NULL AND published_at<=datetime('now') AND category<>'' ORDER BY category"),
  ]);
  return json({
    posts: posts.results.map((row) => publicBlogRow(row)),
    categories: categories.results.map((row) => row.category),
  });
}

async function enquiryApi(request, env) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid form submission.' }, 400);
  }
  const name = clean(payload.name, 100);
  const phone = clean(payload.phone, 20);
  const email = clean(payload.email, 160);
  const city = clean(payload.city, 120);
  const requirement = clean(payload.requirement, 80);
  const monthlyBill = clean(payload.monthlyBill, 100);
  const message = clean(payload.message, 1500);
  const sourcePage = clean(payload.sourcePage, 140) || 'Website';
  const honeypot = clean(payload.website, 100);
  const allowed = new Set(['Residential Solar', 'Commercial Solar', 'Industrial Solar EPC', 'Hybrid Solar & Storage']);

  if (honeypot) return json({ success: true, message: 'Thank you. Your enquiry has been received.' });
  if (!name || !city || !/^[+()\d\s-]{8,20}$/.test(phone)) {
    return json({ error: 'Please enter a valid name, phone number and city.' }, 400);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Please enter a valid email address.' }, 400);
  }
  if (!allowed.has(requirement)) return json({ error: 'Please select a valid solar requirement.' }, 400);

  const recent = await env.DB.prepare(
    "SELECT id FROM enquiries WHERE phone=? AND created_at>=datetime('now','-10 seconds') LIMIT 1",
  ).bind(phone).first();
  if (recent) return json({ error: 'Please wait a few seconds before submitting again.' }, 429);

  const result = await env.DB.prepare(
    `INSERT INTO enquiries
      (name,phone,email,city,requirement,monthly_bill,message,source_page,email_sent)
     VALUES (?,?,?,?,?,?,?,?,0)`,
  ).bind(name, phone, email || null, city, requirement, monthlyBill || null, message || null, sourcePage).run();

  return json({
    success: true,
    enquiryId: Number(result.meta.last_row_id),
    emailSent: false,
    message: `Thank you. Your enquiry has been received. Reference #${Number(result.meta.last_row_id)}.`,
  }, 201);
}

function blogShell(title, description, body, canonical, post = null) {
  const origin = 'https://www.aisensolarsolutions.com';
  const image = post?.featured_image ? `<meta property="og:image" content="${escapeHtml(new URL(post.featured_image, origin).href)}">` : '';
  const structured = post ? `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title,
    description, datePublished: post.published_at || post.created_at,
    dateModified: post.updated_at || post.created_at,
    author: { '@type': 'Organization', name: post.author_name || 'Aisen Solar Team' },
    publisher: { '@type': 'Organization', name: 'Aisen Solar Solutions' }, mainEntityOfPage: canonical,
  }).replaceAll('<', '\\u003c')}</script>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}">${image}<link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/blog/blog.css?v=3"><link rel="stylesheet" href="/blog/blog-rich-content.css?v=3">${structured}</head><body><div class="topbar">Powering tomorrow with practical solar knowledge <a href="/#contact">Book a free survey →</a></div><header><a class="logo" href="/"><img src="/aisen-solar-logo.png" alt="Aisen Solar Solutions"></a><nav><a href="/#services">Solutions</a><a href="/#projects">Projects</a><a class="active" href="/blog/">Blog</a><a href="/#contact">Contact</a></nav><a class="header-cta" href="/#contact">Free site survey ↗</a></header>${body}<footer><p>© Aisen Solar Solutions</p><a href="/#contact">Contact us</a></footer></body></html>`;
}

function blogDate(value) {
  const date=new Date(String(value || '').replace(' ','T')+'Z');
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(date);
}

async function blogPage(request, env) {
  const url = new URL(request.url);
  const pieces = url.pathname.split('/').filter(Boolean);
  const slug = pieces.length > 1 ? decodeURIComponent(pieces[1]) : '';
  if (slug) {
    const post = await env.DB.prepare(
      "SELECT * FROM cms_blog_posts WHERE slug=? AND is_published=1 AND published_at IS NOT NULL AND published_at<=datetime('now') LIMIT 1",
    ).bind(slug).first();
    if (!post) return new Response('Article not found', { status: 404 });
    const title = post.seo_title || post.title;
    const description = post.seo_description || post.excerpt || stripTags(post.content).slice(0, 190);
    const canonical = `${url.origin}/blog/${encodeURIComponent(post.slug)}/`;
    const body = `<main class="article"><a class="back" href="/blog/">← All solar insights</a><article><div class="article-head"><p class="eyebrow">${escapeHtml(post.category)}</p><h1>${escapeHtml(post.title)}</h1>${post.excerpt ? `<p class="article-lead">${escapeHtml(post.excerpt)}</p>` : ''}<p class="byline">${escapeHtml(post.author_name)} <span>·</span> ${escapeHtml(blogDate(post.published_at || post.created_at))}</p></div>${post.featured_image ? `<figure><img src="${escapeHtml(post.featured_image)}" alt="${escapeHtml(post.title)}"></figure>` : ''}<div class="article-body rich-article">${renderArticleHtml(post.content)}</div></article><aside><p class="eyebrow">START YOUR SOLAR JOURNEY</p><h2>Find the right solar solution for your property.</h2><a href="/#contact">Book a free site survey ↗</a></aside></main>`;
    return new Response(blogShell(title, description, body, canonical, post), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control':'no-store' } });
  }

  const category = clean(url.searchParams.get('category'), 100);
  const query = category
    ? env.DB.prepare("SELECT * FROM cms_blog_posts WHERE is_published=1 AND published_at IS NOT NULL AND published_at<=datetime('now') AND category=? ORDER BY published_at DESC,id DESC").bind(category)
    : env.DB.prepare("SELECT * FROM cms_blog_posts WHERE is_published=1 AND published_at IS NOT NULL AND published_at<=datetime('now') ORDER BY published_at DESC,id DESC");
  const rows = (await query.all()).results;
  const cards = rows.map((post) => {
    const href=`/blog/${encodeURIComponent(post.slug)}/`;
    return `<article class="blog-card"><a class="blog-media ${post.featured_image ? 'has-image' : 'no-image'}" href="${href}" aria-label="${escapeHtml(post.title)}">${post.featured_image ? `<img src="${escapeHtml(post.featured_image)}" alt="${escapeHtml(post.title)}" loading="lazy">` : '<span>Solar insights</span>'}</a><div class="blog-copy"><div class="meta"><span>${escapeHtml(post.category)}</span><time>${escapeHtml(blogDate(post.published_at || post.created_at))}</time></div><h2><a href="${href}">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.excerpt || stripTags(post.content).slice(0,190))}</p><a class="read-more" href="${href}">Read article <b>→</b></a></div></article>`;
  }).join('');
  const body = `<main class="blog-wrap"><section class="blog-hero"><div><p class="eyebrow">AISEN SOLAR KNOWLEDGE HUB</p><h1>Solar Insights & Guides</h1><p class="hero-intro">Practical advice for rooftop solar, EPC, savings and maintenance.</p></div></section><section class="blog-grid" aria-label="Solar articles">${cards || '<div class="empty-blog"><h2>No articles published yet.</h2><p>New solar insights will appear here.</p></div>'}</section></main>`;
  const title = 'Solar Insights & Guides | Aisen Solar Solutions';
  const description = 'Expert articles about rooftop solar, solar EPC, savings, subsidy, net metering and solar maintenance from Aisen Solar Solutions.';
  return new Response(blogShell(title, description, body, `${url.origin}/blog/`), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control':'no-store' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const handle = async () => {
    try {
      if (isWorkerStaticAsset(url.pathname)) return env.ASSETS.fetch(request);
      if (url.pathname === '/sitemap.xml' || url.pathname.startsWith('/aisen-preview/api/') || url.pathname.startsWith('/aisen-preview/admin') || url.pathname.startsWith('/blog') || url.pathname.startsWith('/media/')) await ensureContentRecovery(env);
      if (url.pathname === '/sitemap.xml') return sitemapResponse(env);
      const adminRedirect = adminRootLocation(url.pathname);
      if (adminRedirect) {
        return new Response(null, { status: 308, headers: { location: adminRedirect, 'cache-control': 'no-store' } });
      }
      if (url.pathname.startsWith('/media/')) {
        return mediaResponse(request,env,decodeURIComponent(url.pathname.slice('/media/'.length)));
      }
      if (url.pathname === '/aisen-preview/api/content.php') {
        return request.method === 'GET' ? contentApi(env) : json({ error: 'Method not allowed.' }, 405);
      }
      if (url.pathname === '/aisen-preview/api/blogs.php') {
        return request.method === 'GET' ? blogsApi(request, env) : json({ error: 'Method not allowed.' }, 405);
      }
      if (url.pathname === '/aisen-preview/api/enquiries.php') return enquiryApi(request, env);
      if (url.pathname === '/blog' || url.pathname.startsWith('/blog/')) return blogPage(request, env);
      if (url.pathname.startsWith('/aisen-preview/admin/')) return handleAdmin(request, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error('Aisen Worker error', error);
      return url.pathname.includes('/api/')
        ? json({ error: 'Service is temporarily unavailable.' }, 500)
        : new Response('Service is temporarily unavailable.', { status: 500 });
    }
    };
    return addStagingResponseHeaders(await handle(), url);
  },
};
