import { renderArticleHtml } from './article.js';
import { compare } from 'bcryptjs';
import { quoteCsvCell } from './csv.js';

const COOKIE = 'aisen_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;

function e(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function clean(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function redirect(path, cookie = null) {
  const headers = { location: path, 'cache-control': 'no-store' };
  if (cookie) headers['set-cookie'] = cookie;
  return new Response(null, { status: 303, headers });
}

function parseCookies(request) {
  return Object.fromEntries((request.headers.get('cookie') || '').split(';').map((item) => {
    const index = item.indexOf('=');
    return index < 0 ? ['', ''] : [item.slice(0, index).trim(), item.slice(index + 1).trim()];
  }).filter(([key]) => key));
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function signature(value, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}

async function createSession(env) {
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })));
  return `${payload}.${await signature(payload, env.SESSION_SECRET)}`;
}

async function validSession(request, env) {
  if (!env.SESSION_SECRET) return false;
  const token = parseCookies(request)[COOKIE] || '';
  const [payload, provided] = token.split('.');
  if (!payload || !provided || provided !== await signature(payload, env.SESSION_SECRET)) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
    return Number(data.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function csrfToken(request, env) {
  return signature(`csrf:${parseCookies(request)[COOKIE] || ''}`, env.SESSION_SECRET);
}

async function validCsrf(request, form, env) {
  const expected = await csrfToken(request, env);
  const supplied = clean(form.get('csrf'), 200);
  if (!supplied || supplied.length !== expected.length) return false;
  const a = new TextEncoder().encode(supplied);
  const b = new TextEncoder().encode(expected);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function page(title, body) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)} · Aisen Solar CMS</title><link rel="stylesheet" href="/aisen-preview/admin/admin-cms.css"><link rel="stylesheet" href="/aisen-preview/admin/blog-rich-editor.css"><style>
  .admin-shell{max-width:1220px;margin:0 auto;padding:28px}.admin-nav{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.admin-nav a{padding:10px 14px;border-radius:999px;background:#e9f0f8;color:#17354d;text-decoration:none}.admin-nav a.active{background:#17354d;color:white}.panel{background:white;border:1px solid #dce6ef;border-radius:16px;padding:18px;margin:18px 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.grid label{display:grid;gap:6px}.wide{grid-column:1/-1}input,textarea,select{width:100%;box-sizing:border-box;padding:10px;border:1px solid #bbcbd9;border-radius:8px}textarea{min-height:90px}.actions{display:flex;gap:8px;align-items:center;margin-top:12px}.danger{background:#a52020}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #e5edf4;text-align:left;vertical-align:top}.muted{color:#617184;font-size:13px}.flash{padding:12px;border-radius:10px;background:#e7f7ef;color:#17673d}.error{background:#fff0f0;color:#9b2020}.login{max-width:440px;margin:10vh auto}.inline-form{display:inline}.thumb{width:96px;height:64px;object-fit:cover;border-radius:8px}.rich-canvas{min-height:320px;border:1px solid #bbcbd9;border-radius:8px;padding:14px;background:white}.rich-source{display:none}.toolbar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.toolbar button,.toolbar select{width:auto}.editor-error{outline:2px solid #c33}@media(max-width:760px){.grid{grid-template-columns:1fr}.wide{grid-column:auto}}
  </style></head><body>${body}</body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY' } });
}

function loginPage(error = '') {
  return page('Sign in', `<main class="admin-shell login"><section class="panel"><img src="/aisen-solar-logo.png" alt="Aisen Solar Solutions" style="max-width:210px"><h1>CMS sign in</h1>${error ? `<p class="flash error">${e(error)}</p>` : ''}<form method="post" action="/aisen-preview/admin/login"><label>Email<input type="email" name="email" required autocomplete="username"></label><label>Password<input type="password" name="password" required autocomplete="current-password"></label><button type="submit">Sign in</button></form></section></main>`);
}

const settingsFields = {
  contact: [
    ['contact_phone_display', 'Phone display'], ['contact_phone_href', 'Phone link'],
    ['contact_whatsapp', 'WhatsApp'], ['contact_email', 'Email'], ['contact_address', 'Address'],
    ['contact_hours', 'Working hours'], ['general_enquiry_email', 'General enquiry email'],
    ['general_enquiry_phone_display', 'General enquiry phone'], ['general_enquiry_phone_href', 'General enquiry phone link'],
    ['corporate_enquiry_email', 'Corporate enquiry email'], ['corporate_enquiry_phone_display', 'Corporate enquiry phone'],
    ['corporate_enquiry_phone_href', 'Corporate enquiry phone link'],
  ],
  difference: [
    ['difference_kicker', 'Kicker'], ['difference_headline', 'Headline'], ['difference_accent', 'Accent'],
    ['difference_description', 'Description'], ['difference_link_text', 'Link text'],
  ],
};
const allowedSettingKeys = new Set(Object.values(settingsFields).flat().map(([key]) => key));

function input(name, value, type = 'text') {
  return `<input type="${type}" name="${e(name)}" value="${e(value)}">`;
}

function hidden(csrf, action, id = '') {
  return `<input type="hidden" name="csrf" value="${e(csrf)}"><input type="hidden" name="action" value="${e(action)}">${id !== '' ? `<input type="hidden" name="id" value="${e(id)}">` : ''}`;
}

function activeCheckbox(value) {
  return `<label><input type="checkbox" name="is_active" value="1" ${Number(value) ? 'checked' : ''}> Active</label>`;
}

function settingsPanel(tab, settings, csrf) {
  const fields = settingsFields[tab];
  return `<section class="panel"><h2>${tab === 'contact' ? 'Contact page' : 'The Aisen Difference'}</h2><form method="post" action="/aisen-preview/admin/action"><div class="grid">${fields.map(([key, label]) => `<label class="${key.includes('description') || key.includes('address') ? 'wide' : ''}">${e(label)}${key.includes('description') || key.includes('address') ? `<textarea name="${e(key)}">${e(settings[key] || '')}</textarea>` : input(key, settings[key] || '')}</label>`).join('')}</div>${hidden(csrf, 'save_settings')}<div class="actions"><button type="submit">Save changes</button></div></form></section>`;
}

function rowPanel(title, rows, csrf, type, extras = {}) {
  const definitions = {
    brands: [['brand_name', 'Brand name'], ['sort_order', 'Sort order', 'number']],
    difference_stats: [['stat_value', 'Value'], ['stat_suffix', 'Suffix'], ['stat_label', 'Label'], ['sort_order', 'Sort order', 'number']],
    offices: [['office_type', 'Office type'], ['office_name', 'Office name'], ['address_text', 'Address', 'textarea'], ['phone_display', 'Phone'], ['phone_href', 'Phone link'], ['email', 'Email'], ['sort_order', 'Sort order', 'number']],
    testimonials: [['company', 'Company'], ['quote_text', 'Quote', 'textarea'], ['person_name', 'Person'], ['person_role', 'Role'], ['initials', 'Initials'], ['sort_order', 'Sort order', 'number']],
    projects: [['project_type', 'Project type'], ['title', 'Title'], ['meta', 'Meta'], ['css_class', 'CSS class'], ['sort_order', 'Sort order', 'number']],
  };
  const fields = definitions[type];
  const render = (row = {}) => {
    const images = type === 'projects' && row.id ? (extras[row.id] || []) : [];
    const media = type === 'projects' ? `<label class="wide">Add project photos<input type="file" name="project_images" accept="image/jpeg,image/png,image/webp" multiple></label>${images.length ? `<div class="wide actions">${images.map((image) => `<span><img class="thumb" src="${e(image.image_path)}" alt="Project photo"><button class="danger" type="submit" name="delete_image_id" value="${Number(image.id)}" form="delete-image-${Number(image.id)}">×</button></span>`).join('')}</div>` : ''}` : '';
    const save = `<form class="panel" method="post" ${type === 'projects' ? 'enctype="multipart/form-data"' : ''} action="/aisen-preview/admin/action"><div class="grid">${fields.map(([key, label, kind]) => `<label class="${kind === 'textarea' ? 'wide' : ''}">${e(label)}${kind === 'textarea' ? `<textarea name="${e(key)}">${e(row[key] || '')}</textarea>` : input(key, row[key] ?? '', kind || 'text')}</label>`).join('')}${media}</div>${activeCheckbox(row.is_active ?? 1)}${hidden(csrf, `save_${type}`, row.id ?? '')}<div class="actions"><button type="submit">${row.id ? 'Update' : 'Add'}</button></div></form>`;
    const deleteForm = row.id ? `<form class="inline-form" method="post" action="/aisen-preview/admin/action">${hidden(csrf, `delete_${type}`, row.id)}<button class="danger" type="submit" onclick="return confirm('Delete this item?')">Delete ${e(title.replace(/s$/,''))}</button></form>` : '';
    const imageForms = images.map((image) => `<form id="delete-image-${Number(image.id)}" method="post" action="/aisen-preview/admin/action">${hidden(csrf, 'delete_project_image', image.id)}</form>`).join('');
    return `${save}${deleteForm}${imageForms}`;
  };
  return `<h2>${e(title)}</h2>${rows.map((row) => render(row)).join('')}<h3>Add new</h3>${render()}`;
}

function enquiriesPanel(rows) {
  return `<section class="panel"><div class="actions"><h2 style="margin-right:auto">Website enquiries</h2><a href="/aisen-preview/admin/export.csv">Export CSV</a></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Name</th><th>Contact</th><th>City</th><th>Requirement</th><th>Details</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${e(row.created_at)}</td><td>${e(row.name)}</td><td>${e(row.phone)}<br><span class="muted">${e(row.email || '')}</span></td><td>${e(row.city)}</td><td>${e(row.requirement)}</td><td>${e(row.monthly_bill || '')}<br><span class="muted">${e(row.message || '')}</span></td></tr>`).join('')}</tbody></table></div></section>`;
}

function blogPanel(posts, editing, csrf) {
  const post = editing || {};
  const editor = `<section class="panel"><h2>${post.id ? 'Edit article' : 'New article'}</h2><form method="post" enctype="multipart/form-data" action="/aisen-preview/admin/action"><div class="grid"><label>Title${input('title', post.title || '')}</label><label>Slug${input('slug', post.slug || '')}</label><label>Category${input('category', post.category || 'Solar Insights')}</label><label>Author${input('author_name', post.author_name || 'Aisen Solar Team')}</label><label class="wide">Excerpt<textarea name="excerpt">${e(post.excerpt || '')}</textarea></label><label>SEO title${input('seo_title', post.seo_title || '')}</label><label>SEO description${input('seo_description', post.seo_description || '')}</label><label>Featured image<input type="file" name="featured_image" accept="image/jpeg,image/png,image/webp"></label></div><div data-rich-editor><div class="toolbar"><select data-format><option value="p">Paragraph</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option></select><button type="button" data-command="bold">Bold</button><button type="button" data-command="italic">Italic</button><button type="button" data-command="insertUnorderedList">Bullets</button><button type="button" data-link>Link</button><span data-word-count></span></div><div class="rich-canvas" contenteditable="true">${renderArticleHtml(post.content || '')}</div><textarea class="rich-source" name="content"></textarea></div><label><input type="checkbox" name="is_published" value="1" ${Number(post.is_published) ? 'checked' : ''}> Published</label>${hidden(csrf, 'save_blog', post.id || '')}<div class="actions"><button type="submit">Save article</button></div></form></section>`;
  return `${editor}<section class="panel"><h2>Articles</h2><div class="table-wrap"><table><thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead><tbody>${posts.map((row) => `<tr><td>${e(row.title)}</td><td>${e(row.category)}</td><td>${Number(row.is_published) ? 'Published' : 'Draft'}</td><td><a href="?tab=blog&edit=${Number(row.id)}">Edit</a> <form class="inline-form" method="post" action="/aisen-preview/admin/action">${hidden(csrf, 'delete_blog', row.id)}<button class="danger" onclick="return confirm('Delete article?')">Delete</button></form></td></tr>`).join('')}</tbody></table></div></section><script src="/aisen-preview/admin/blog-editor.js"></script>`;
}

async function dashboard(request, env) {
  const url = new URL(request.url);
  const tab = clean(url.searchParams.get('tab'), 40) || 'enquiries';
  const csrf = await csrfToken(request, env);
  const [settingsQ, brandsQ, statsQ, officesQ, projectsQ, testimonialsQ, enquiriesQ, postsQ, projectImagesQ] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM cms_settings'), env.DB.prepare('SELECT * FROM cms_brands ORDER BY sort_order,id'),
    env.DB.prepare('SELECT * FROM cms_difference_stats ORDER BY sort_order,id'), env.DB.prepare('SELECT * FROM cms_offices ORDER BY sort_order,id'),
    env.DB.prepare('SELECT * FROM cms_projects ORDER BY sort_order,id'), env.DB.prepare('SELECT * FROM cms_testimonials ORDER BY sort_order,id'),
    env.DB.prepare('SELECT * FROM enquiries ORDER BY id DESC LIMIT 500'), env.DB.prepare('SELECT * FROM cms_blog_posts ORDER BY created_at DESC,id DESC'),
    env.DB.prepare('SELECT * FROM cms_project_images ORDER BY sort_order,id'),
  ]);
  const settings = Object.fromEntries(settingsQ.results.map((row) => [row.setting_key, row.setting_value]));
  const nav = [['enquiries','Enquiries'],['contact','Contact'],['projects','Projects'],['testimonials','Testimonials'],['brands','Brands'],['difference','Aisen Difference'],['blog','Blog']]
    .map(([key,label]) => `<a class="${tab === key ? 'active' : ''}" href="?tab=${key}">${label}</a>`).join('');
  let content;
  if (tab === 'enquiries') content = enquiriesPanel(enquiriesQ.results);
  else if (tab === 'contact') content = settingsPanel('contact', settings, csrf) + rowPanel('Offices', officesQ.results, csrf, 'offices');
  else if (tab === 'projects') {
    const projectImages = {};
    for (const image of projectImagesQ.results) (projectImages[image.project_id] ||= []).push(image);
    content = rowPanel('Projects', projectsQ.results, csrf, 'projects', projectImages);
  }
  else if (tab === 'testimonials') content = rowPanel('Testimonials', testimonialsQ.results, csrf, 'testimonials');
  else if (tab === 'brands') content = rowPanel('Brands', brandsQ.results, csrf, 'brands');
  else if (tab === 'difference') content = settingsPanel('difference', settings, csrf) + rowPanel('Counters', statsQ.results, csrf, 'difference_stats');
  else {
    const editId = Number(url.searchParams.get('edit') || 0);
    const editing = editId ? postsQ.results.find((row) => Number(row.id) === editId) : null;
    content = blogPanel(postsQ.results, editing, csrf);
  }
  const flash = clean(url.searchParams.get('saved'), 200);
  const error = clean(url.searchParams.get('error'), 200);
  return page('Dashboard', `<header class="topbar"><img src="/aisen-solar-logo.png" alt="Aisen Solar Solutions"><div><a href="/" target="_blank">View website ↗</a><form class="inline-form" method="post" action="/aisen-preview/admin/logout"><button>Sign out</button></form></div></header><main class="admin-shell"><small>AISEN WEBSITE CMS</small><h1>Cloudflare CMS</h1><nav class="admin-nav">${nav}</nav>${flash ? `<p class="flash">${e(flash)}</p>` : ''}${error ? `<p class="flash error">${e(error)}</p>` : ''}${content}</main>`);
}

function slugify(value) {
  return clean(value, 220).toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `article-${Date.now()}`;
}

async function uniqueSlug(env, requested, ignoreId = 0) {
  const root = slugify(requested);
  let slug = root;
  for (let counter = 2; counter < 100; counter += 1) {
    const found = await env.DB.prepare('SELECT id FROM cms_blog_posts WHERE slug=? AND id<>? LIMIT 1').bind(slug, ignoreId).first();
    if (!found) return slug;
    slug = `${root}-${counter}`;
  }
  throw new Error('Could not create a unique slug.');
}

function sanitizeArticle(value) {
  return String(value || '').replaceAll('\uFFFD', '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/javascript\s*:/gi, '');
}

async function uploadImage(file, env, prefix) {
  if (!(file instanceof File) || file.size === 0) return null;
  const types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const extension = types[file.type];
  if (!extension || file.size > 8 * 1024 * 1024) throw new Error('Image must be JPG, PNG or WebP and 8 MB or smaller.');
  if (!env.MEDIA) throw new Error('Media storage is not configured.');
  const key = `${prefix}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  await env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' } });
  return `/media/${key}`;
}

async function saveSimple(form, env, type) {
  const id = Number(form.get('id') || 0);
  const active = form.get('is_active') ? 1 : 0;
  const map = {
    brands: ['cms_brands', ['brand_name','sort_order']],
    difference_stats: ['cms_difference_stats', ['stat_value','stat_suffix','stat_label','sort_order']],
    offices: ['cms_offices', ['office_type','office_name','address_text','phone_display','phone_href','email','sort_order']],
    testimonials: ['cms_testimonials', ['company','quote_text','person_name','person_role','initials','sort_order']],
    projects: ['cms_projects', ['project_type','title','meta','css_class','sort_order']],
  };
  const [table, fields] = map[type];
  const values = fields.map((field) => field === 'sort_order' ? Number(form.get(field) || 0) : clean(form.get(field), field.includes('text') ? 3000 : 500));
  let savedId = id;
  if (id) {
    await env.DB.prepare(`UPDATE ${table} SET ${fields.map((field) => `${field}=?`).join(',')},is_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...values, active, id).run();
  } else {
    const result = await env.DB.prepare(`INSERT INTO ${table} (${fields.join(',')},is_active) VALUES (${fields.map(() => '?').join(',')},?)`).bind(...values, active).run();
    savedId = Number(result.meta.last_row_id);
  }
  if (type === 'projects') {
    const uploads = form.getAll('project_images').filter((file) => file instanceof File && file.size > 0).slice(0, 4);
    const existing = await env.DB.prepare('SELECT COUNT(*) AS count FROM cms_project_images WHERE project_id=?').bind(savedId).first();
    let slots = Math.max(0, 4 - Number(existing.count || 0));
    for (const file of uploads) {
      if (slots-- <= 0) break;
      const imagePath = await uploadImage(file, env, `projects/${savedId}`);
      await env.DB.prepare('INSERT INTO cms_project_images(project_id,image_path,sort_order) VALUES(?,?,?)').bind(savedId, imagePath, 5 - slots).run();
    }
  }
  return savedId;
}

async function action(request, env) {
  const form = await request.formData();
  if (!await validCsrf(request, form, env)) return new Response('Invalid request token.', { status: 403 });
  const actionName = clean(form.get('action'), 80);
  const tabMap = { brands:'brands', difference_stats:'difference', offices:'contact', testimonials:'testimonials', projects:'projects' };
  try {
    if (actionName === 'save_settings') {
      for (const [key, value] of form.entries()) {
        if (!allowedSettingKeys.has(key)) continue;
        await env.DB.prepare(`INSERT INTO cms_settings(setting_key,setting_value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP`).bind(key, clean(value, 5000)).run();
      }
      return redirect(`/aisen-preview/admin/?tab=${settingsFields.difference.some(([key]) => form.has(key)) ? 'difference' : 'contact'}&saved=Changes+saved`);
    }
    for (const type of Object.keys(tabMap)) {
      if (actionName === `save_${type}`) {
        await saveSimple(form, env, type);
        return redirect(`/aisen-preview/admin/?tab=${tabMap[type]}&saved=Changes+saved`);
      }
      if (actionName === `delete_${type}`) {
        const tables = { brands:'cms_brands', difference_stats:'cms_difference_stats', offices:'cms_offices', testimonials:'cms_testimonials', projects:'cms_projects' };
        await env.DB.prepare(`DELETE FROM ${tables[type]} WHERE id=?`).bind(Number(form.get('id'))).run();
        return redirect(`/aisen-preview/admin/?tab=${tabMap[type]}&saved=Item+deleted`);
      }
    }
    if (actionName === 'delete_project_image') {
      const id = Number(form.get('id') || 0);
      const row = await env.DB.prepare('SELECT image_path FROM cms_project_images WHERE id=?').bind(id).first();
      await env.DB.prepare('DELETE FROM cms_project_images WHERE id=?').bind(id).run();
      if (row?.image_path?.startsWith('/media/')) await env.MEDIA?.delete(row.image_path.slice('/media/'.length));
      return redirect('/aisen-preview/admin/?tab=projects&saved=Project+photo+deleted');
    }
    if (actionName === 'save_blog') {
      const id = Number(form.get('id') || 0);
      const title = clean(form.get('title'), 220);
      const content = sanitizeArticle(form.get('content'));
      if (!title || !content.replace(/<[^>]*>/g, '').trim()) throw new Error('Title and article content are required.');
      const slug = await uniqueSlug(env, clean(form.get('slug'), 220) || title, id);
      const image = await uploadImage(form.get('featured_image'), env, 'blog');
      const published = form.get('is_published') ? 1 : 0;
      const values = [title, slug, clean(form.get('excerpt'), 1000), content, clean(form.get('category'), 100) || 'Solar Insights', clean(form.get('author_name'), 140) || 'Aisen Solar Team', clean(form.get('seo_title'), 220), clean(form.get('seo_description'), 320), published];
      if (id) {
        await env.DB.prepare(`UPDATE cms_blog_posts SET title=?,slug=?,excerpt=?,content=?,category=?,author_name=?,seo_title=?,seo_description=?,is_published=?,featured_image=COALESCE(?,featured_image),published_at=CASE WHEN ?=1 THEN COALESCE(published_at,CURRENT_TIMESTAMP) ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(...values, image, published, id).run();
      } else {
        await env.DB.prepare(`INSERT INTO cms_blog_posts(title,slug,excerpt,content,category,author_name,seo_title,seo_description,is_published,featured_image,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END)`).bind(...values, image, published).run();
      }
      return redirect('/aisen-preview/admin/?tab=blog&saved=Article+saved');
    }
    if (actionName === 'delete_blog') {
      await env.DB.prepare('DELETE FROM cms_blog_posts WHERE id=?').bind(Number(form.get('id'))).run();
      return redirect('/aisen-preview/admin/?tab=blog&saved=Article+deleted');
    }
    throw new Error('Unknown action.');
  } catch (error) {
    return redirect(`/aisen-preview/admin/?error=${encodeURIComponent(error.message || 'Could not save changes')}`);
  }
}

async function csvExport(env) {
  const rows = (await env.DB.prepare('SELECT * FROM enquiries ORDER BY id DESC').all()).results;
  const columns = ['id','created_at','name','phone','email','city','requirement','monthly_bill','message','source_page','email_sent'];
  const csv = [columns.join(','), ...rows.map((row) => columns.map((column) => quoteCsvCell(row[column])).join(','))].join('\r\n');
  return new Response(`\uFEFF${csv}`, { headers: { 'content-type':'text/csv; charset=utf-8', 'content-disposition':`attachment; filename="aisen-enquiries-${new Date().toISOString().slice(0,10)}.csv"` } });
}

export async function handleAdmin(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/aisen-preview/admin/login' && request.method === 'POST') {
    const form = await request.formData();
    const email = clean(form.get('email'), 180).toLowerCase();
    const password = String(form.get('password') || '');
    if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD_HASH || !env.SESSION_SECRET) return loginPage('Admin security is not configured yet.');
    if (email !== env.ADMIN_EMAIL.toLowerCase() || !await compare(password, env.ADMIN_PASSWORD_HASH)) return loginPage('Invalid email or password.');
    const token = await createSession(env);
    return redirect('/aisen-preview/admin/', `${COOKIE}=${token}; Path=/aisen-preview/admin/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`);
  }
  const authenticated = await validSession(request, env);
  if (!authenticated) return loginPage();
  if (url.pathname === '/aisen-preview/admin/logout' && request.method === 'POST') {
    return redirect('/aisen-preview/admin/', `${COOKIE}=; Path=/aisen-preview/admin/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
  }
  if (url.pathname === '/aisen-preview/admin/action' && request.method === 'POST') return action(request, env);
  if (url.pathname === '/aisen-preview/admin/export.csv' && request.method === 'GET') return csvExport(env);
  if (request.method !== 'GET') return new Response('Method not allowed.', { status: 405 });
  return dashboard(request, env);
}
