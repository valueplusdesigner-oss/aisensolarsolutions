import { renderArticleHtml } from './article.js';
import { compare } from 'bcryptjs';
import { quoteCsvCell } from './csv.js';
import { importEnquiries } from './enquiry-import.js';
import { storeImage, deleteStoredImage } from './media.js';

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
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)} · Aisen Solar CMS</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/aisen-preview/admin/admin-dashboard.css?v=2"><link rel="stylesheet" href="/aisen-preview/admin/blog-rich-editor.css"></head><body>${body}<script defer src="/aisen-preview/admin/admin-dashboard.js?v=2"></script></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY' } });
}

function loginPage(error = '') {
  return page('Sign in', `<main class="login"><section class="login-card"><img src="/aisen-solar-logo.png" alt="Aisen Solar Solutions"><p class="eyebrow">WEBSITE MANAGEMENT</p><h1>Welcome back</h1><p class="muted">Sign in to manage your website content and enquiries.</p>${error ? `<p class="flash error" role="alert">${e(error)}</p>` : ''}<form method="post" action="/aisen-preview/admin/login"><label>Email address<input type="email" name="email" required autocomplete="username"></label><label>Password<input type="password" name="password" required autocomplete="current-password"></label><button type="submit">Sign in →</button></form><p class="login-footer">Aisen Solar Solutions · Admin</p></section></main>`);
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
  return `<label class="check"><input type="checkbox" name="is_active" value="1" ${Number(value) ? 'checked' : ''}> Visible on website</label>`;
}

function settingsPanel(tab, settings, csrf) {
  const fields = settingsFields[tab];
  const render = (items) => items.map(([key,label]) => `<label class="${key.includes('description') || key.includes('address') ? 'wide' : ''}">${e(label)}${key.includes('description') || key.includes('address') ? `<textarea name="${e(key)}">${e(settings[key] || '')}</textarea>` : input(key, settings[key] || '')}</label>`).join('');
  const groups = tab === 'contact'
    ? [['Main contact details',fields.slice(0,6)],['General enquiry',fields.slice(6,9)],['Corporate enquiry',fields.slice(9)]]
    : [['Section heading & introduction',fields]];
  return `<section class="panel"><div class="panel-heading"><h2>${tab === 'contact' ? 'Contact details' : 'The Aisen Difference'}</h2><p class="muted">Changes appear on the website after saving.</p></div><form method="post" action="/aisen-preview/admin/action">${groups.map(([label,items])=>`<fieldset><legend>${e(label)}</legend><div class="grid">${render(items)}</div></fieldset>`).join('')}${hidden(csrf, 'save_settings')}<div class="actions"><button type="submit">Save changes</button></div></form></section>`;
}

function rowPanel(title, rows, csrf, type, extras = {}) {
  const definitions = {
    brands: [['brand_name','Brand name'],['sort_order','Display order','number']],
    difference_stats: [['stat_value','Value'],['stat_suffix','Suffix'],['stat_label','Label'],['sort_order','Display order','number']],
    offices: [['office_type','Office type','office'],['office_name','Office name'],['address_text','Address','textarea'],['phone_display','Phone'],['phone_href','Phone link'],['email','Email','email'],['sort_order','Display order','number']],
    testimonials: [['company','Company'],['quote_text','Testimonial','textarea'],['person_name','Person'],['person_role','Designation'],['initials','Initials'],['sort_order','Display order','number']],
    projects: [['project_type','Category','category'],['title','Project name'],['meta','Capacity & location'],['sort_order','Display order','number']],
  };
  const fields = definitions[type];
  const render = (row = {}) => {
    const images = type === 'projects' && row.id ? (extras[row.id] || []) : [];
    const field = ([key,label,kind]) => {
      const val=row[key] ?? '';
      const options=kind==='category' ? ['Residential','Commercial','Industrial','Institutional'] : ['Corporate Office','Head Office','Branch Office'];
      const control=kind==='textarea' ? `<textarea name="${e(key)}">${e(val)}</textarea>` : ['category','office'].includes(kind) ? `<select name="${e(key)}">${[...new Set([...(val ? [val] : []),...options])].map(v=>`<option ${v===val ? 'selected' : ''}>${e(v)}</option>`).join('')}</select>` : input(key,val,kind || 'text');
      return `<label class="${kind==='textarea' ? 'wide' : ''}">${e(label)}${control}</label>`;
    };
    const media = type==='projects' ? `<div class="wide"><h3>Project photos <span class="muted">${images.length}/4</span></h3><p class="muted">Upload up to four original photos. JPG, PNG or WebP; large images are resized automatically.</p>${images.length ? `<div class="photo-grid">${images.map(image=>`<div><img src="${e(image.image_path)}" alt="${e(row.title)} photo"><button class="danger secondary" type="submit" name="delete_image_id" value="${Number(image.id)}" form="delete-image-${Number(image.id)}">Remove photo</button></div>`).join('')}</div>` : '<p class="empty-inline">No photos uploaded for this project.</p>'}<label>Add photos<input type="file" name="project_images" accept="image/jpeg,image/png,image/webp" multiple ${images.length>=4 ? 'disabled' : ''}></label>${input('css_class',row.css_class || '', 'hidden')}</div>` : '';
    const label=row.title || row.brand_name || row.company || row.office_type || row.stat_label || `New ${title.replace(/s$/,'').toLowerCase()}`;
    const preview=type==='projects' ? `${images[0] ? `<img class="record-thumb" src="${e(images[0].image_path)}" alt="">` : '<span class="record-icon">▧</span>'}` : '';
    const save=`<form method="post" ${type==='projects' ? 'enctype="multipart/form-data"' : ''} action="/aisen-preview/admin/action"><div class="grid">${fields.map(field).join('')}${media}</div>${activeCheckbox(row.is_active ?? 1)}${hidden(csrf,`save_${type}`,row.id ?? '')}<div class="actions"><button type="submit">${row.id ? 'Save changes' : 'Add '+e(title.replace(/s$/,''))}</button><span class="muted" data-upload-status></span></div></form>`;
    const deletion=row.id ? `<form class="delete-form" method="post" action="/aisen-preview/admin/action">${hidden(csrf,`delete_${type}`,row.id)}<button class="danger secondary" type="submit" onclick="return confirm('Delete this item?')">Delete item</button></form>` : '';
    const imageForms=images.map(image=>`<form id="delete-image-${Number(image.id)}" method="post" action="/aisen-preview/admin/action" onsubmit="return confirm('Remove this photo?')">${hidden(csrf,'delete_project_image',image.id)}</form>`).join('');
    return `<details class="record ${row.id ? '' : 'new-record'}"><summary>${preview}<span class="record-copy"><strong>${e(row.id ? label : '＋ Add new '+title.replace(/s$/,'').toLowerCase())}</strong>${row.id ? `<small>${e(row.meta || row.person_name || (row.stat_value ? row.stat_value+ (row.stat_suffix || '') : '') || '')}</small>` : ''}</span>${row.id ? `<span class="badge ${Number(row.is_active) ? '' : 'draft'}">${Number(row.is_active) ? 'Visible' : 'Hidden'}</span><span class="edit-label">Edit ↓</span>` : ''}</summary><div class="record-body">${save}${deletion}${imageForms}</div></details>`;
  };
  return `<section class="panel"><div class="panel-heading"><h2>${e(title)} <span class="count">${rows.length}</span></h2><p class="muted">Select an item to edit its details.</p></div><div class="records">${rows.length ? rows.map(row=>render(row)).join('') : '<p class="empty-inline">No items yet. Add your first item below.</p>'}${render()}</div></section>`;
}

function enquiriesPanel(rows, csrf = null) {
  return `<section class="panel"><div class="actions"><h2 style="margin-right:auto">Website enquiries</h2><a class="button secondary" href="?tab=enquiries">Refresh enquiries</a><a href="/aisen-preview/admin/export.csv">Export CSV</a></div><div class="table-wrap"><table><thead><tr><th>Reference / date</th><th>Name</th><th>Contact</th><th>City</th><th>Requirement</th><th>Details</th></tr></thead><tbody>${rows.length ? rows.map((row) => `<tr><td><b>#${Number(row.id)}</b><br>${e(row.created_at)}</td><td>${e(row.name)}</td><td>${e(row.phone)}<br><span class="muted">${e(row.email || '')}</span></td><td>${e(row.city)}</td><td>${e(row.requirement)}</td><td>${e(row.monthly_bill || '')}<br><span class="muted">${e(row.message || '')}</span></td></tr>`).join('') : '<tr><td colspan="6" class="empty-inline">No enquiries yet. New website enquiries will appear here.</td></tr>'}</tbody></table></div></section>${csrf ? `<section class="panel"><details><summary>Recover enquiries from a backup</summary><p class="muted">Import a private JSON backup. Original dates are preserved; identical entries are skipped. Existing enquiries stay available.</p><form method="post" enctype="multipart/form-data" action="/aisen-preview/admin/action"><label>Enquiry backup<input type="file" name="enquiry_backup" accept=".json,application/json" required></label>${hidden(csrf,'import_enquiries')}<button type="submit">Recover enquiries</button></form></details></section>` : ''}`;
}

function blogPanel(posts, editing, csrf, extrasNewArticle=false) {
  const post = editing || {};
  const editor = `<section class="panel"><h2>${post.id ? 'Edit article' : 'New article'}</h2><form method="post" enctype="multipart/form-data" action="/aisen-preview/admin/action"><div class="grid"><label>Title${input('title', post.title || '')}</label><label>Slug${input('slug', post.slug || '')}</label><label>Category${input('category', post.category || 'Solar Insights')}</label><label>Author${input('author_name', post.author_name || 'Aisen Solar Team')}</label><label class="wide">Excerpt<textarea name="excerpt">${e(post.excerpt || '')}</textarea></label><label>SEO title${input('seo_title', post.seo_title || '')}</label><label>SEO description${input('seo_description', post.seo_description || '')}</label>${post.featured_image ? `<div class="wide featured-preview"><img src="${e(post.featured_image)}" alt="Current article image"><span class="muted">Current featured image · retained unless you choose a replacement</span></div>` : ''}<label>Featured image<input type="file" name="featured_image" accept="image/jpeg,image/png,image/webp"></label></div><div data-rich-editor><div class="toolbar"><select data-format><option value="p">Paragraph</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option></select><button type="button" data-command="bold">Bold</button><button type="button" data-command="italic">Italic</button><button type="button" data-command="underline">Underline</button><button type="button" data-command="justifyLeft">Left</button><button type="button" data-command="justifyCenter">Center</button><button type="button" data-command="justifyRight">Right</button><button type="button" data-command="insertUnorderedList">Bullets</button><button type="button" data-link>Link</button><span data-word-count></span></div><div class="rich-canvas" contenteditable="true" role="textbox" aria-label="Article content" aria-multiline="true">${renderArticleHtml(post.content || '')}</div><textarea class="rich-source" name="content"></textarea></div><label class="check"><input type="checkbox" name="is_published" value="1" ${Number(post.is_published) ? 'checked' : ''}> Published</label>${hidden(csrf, 'save_blog', post.id || '')}<div class="actions"><button type="submit">Save article</button></div></form></section>`;
  return `${editing || extrasNewArticle ? editor : ''}<section class="panel"><h2>Articles</h2><div class="table-wrap"><table><thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead><tbody>${posts.map((row) => `<tr><td>${e(row.title)}</td><td>${e(row.category)}</td><td>${Number(row.is_published) ? 'Published' : 'Draft'}</td><td><a href="?tab=blog&edit=${Number(row.id)}">Edit</a> <form class="inline-form" method="post" action="/aisen-preview/admin/action">${hidden(csrf, 'delete_blog', row.id)}<button class="danger" onclick="return confirm('Delete article?')">Delete</button></form></td></tr>`).join('')}</tbody></table></div></section><script src="/aisen-preview/admin/blog-editor.js"></script>`;
}

async function dashboard(request, env) {
  const url = new URL(request.url);
  const requestedTab=clean(url.searchParams.get('tab'),40) || 'overview';
  const tab=['overview','enquiries','contact','projects','testimonials','brands','difference','blog'].includes(requestedTab) ? requestedTab : 'overview';
  const csrf = await csrfToken(request, env);
  const [settingsQ, brandsQ, statsQ, officesQ, projectsQ, testimonialsQ, enquiriesQ, postsQ, projectImagesQ] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM cms_settings'), env.DB.prepare('SELECT * FROM cms_brands ORDER BY sort_order,id'),
    env.DB.prepare('SELECT * FROM cms_difference_stats ORDER BY sort_order,id'), env.DB.prepare('SELECT * FROM cms_offices ORDER BY sort_order,id'),
    env.DB.prepare('SELECT * FROM cms_projects ORDER BY sort_order,id'), env.DB.prepare('SELECT * FROM cms_testimonials ORDER BY sort_order,id'),
    env.DB.prepare('SELECT * FROM enquiries ORDER BY created_at DESC,id DESC LIMIT 500'), env.DB.prepare('SELECT * FROM cms_blog_posts ORDER BY created_at DESC,id DESC'),
    env.DB.prepare('SELECT * FROM cms_project_images ORDER BY sort_order,id'),
  ]);
  const settings = Object.fromEntries(settingsQ.results.map((row) => [row.setting_key, row.setting_value]));
  const nav = [['overview','Overview'],['enquiries','Enquiries'],['contact','Contact'],['projects','Projects'],['testimonials','Testimonials'],['brands','Brands'],['difference','Aisen Difference'],['blog','Blog']]
    .map(([key,label]) => `<a class="${tab === key ? 'active' : ''}" href="?tab=${key}">${label}</a>`).join('');
  let content;
  if (tab === 'overview') content = `<section class="metric-grid">${[['Enquiries',enquiriesQ.results.length,'enquiries'],['Projects',projectsQ.results.length,'projects'],['Articles',postsQ.results.length,'blog'],['Visible brands',brandsQ.results.filter(r=>Number(r.is_active)).length,'brands']].map(([label,value,key])=>`<a class="metric" href="?tab=${key}"><span>${label}</span><strong>${value}</strong><small>Manage ${label.toLowerCase()} →</small></a>`).join('')}</section><section class="panel"><h2>Manage your website</h2><p class="muted">Keep your project photos, contact details and solar insights up to date.</p><div class="quick-links"><a href="?tab=projects">Projects & photos <span>→</span></a><a href="?tab=contact">Contact & offices <span>→</span></a><a href="?tab=blog&new=1">Write an article <span>→</span></a><a href="?tab=difference">Installation counters <span>→</span></a></div></section>${enquiriesPanel(enquiriesQ.results.slice(0,5))}`;
  else if (tab === 'enquiries') content = enquiriesPanel(enquiriesQ.results, csrf);
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
    content = blogPanel(postsQ.results, editing, csrf, url.searchParams.has('new'));
  }
  const flash = clean(url.searchParams.get('saved'), 200);
  const error = clean(url.searchParams.get('error'), 200);
  const titles={overview:['Overview','Your website at a glance.'],enquiries:['Website enquiries','Review and export enquiries from your website.'],contact:['Contact & offices','Manage phone numbers, emails and office addresses.'],projects:['Projects & photos','Manage your installations and original project photographs.'],testimonials:['Testimonials','Manage customer experiences shown on your website.'],brands:['Partner brands','Choose which brands are visible on the website.'],difference:['The Aisen Difference','Edit your introduction and installation counters.'],blog:['Solar insights','Create, edit and publish articles.']};
  return page(titles[tab][0], `<div class="admin-layout"><aside class="sidebar"><a class="brand" href="?tab=overview"><img src="/aisen-solar-logo.png" alt="Aisen Solar Solutions"></a><p class="sidebar-label">WEBSITE MANAGEMENT</p><nav class="admin-nav" aria-label="Admin navigation">${nav}</nav><a class="sidebar-website" href="/" target="_blank" rel="noopener">View website ↗</a><div class="sidebar-footer">Aisen Solar Solutions<br><span>Website admin</span></div></aside><div class="workspace"><header class="admin-topbar"><span class="environment">${url.hostname.endsWith('.workers.dev') ? 'Staging preview' : 'Live website'}</span><div><span class="admin-email">${e(env.ADMIN_EMAIL)}</span><form class="inline-form" method="post" action="/aisen-preview/admin/logout"><button class="secondary">Sign out</button></form></div></header><main class="admin-shell"><div class="page-heading"><div><p class="eyebrow">AISEN SOLAR SOLUTIONS</p><h1>${titles[tab][0]}</h1><p class="muted">${titles[tab][1]}</p></div>${tab==='blog' ? '<a class="button" href="?tab=blog&new=1">＋ New article</a>' : ''}</div>${flash ? `<p class="flash" role="status">✓ ${e(flash)}</p>` : ''}${error ? `<p class="flash error" role="alert">${e(error)}</p>` : ''}${content}</main></div></div>`);

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
  if (!(file instanceof File) || file.size===0) return null;
  return storeImage(file,env,prefix);
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
    if (actionName === 'import_enquiries') {
      const {imported,skipped} = await importEnquiries(form.get('enquiry_backup'),env);
      return redirect('/aisen-preview/admin/?tab=enquiries&saved='+encodeURIComponent(`${imported} enquiries recovered; ${skipped} duplicates skipped.`));
    }
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
      if (row?.image_path?.startsWith('/media/')) await deleteStoredImage(row.image_path,env);
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
  const rows = (await env.DB.prepare('SELECT * FROM enquiries ORDER BY created_at DESC,id DESC').all()).results;
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
