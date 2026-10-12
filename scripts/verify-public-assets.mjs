import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const required = [
  'index.html', 'aisen-preview/index.html',
  'aisen-preview/admin/admin-cms.css', 'aisen-preview/admin/blog-editor.js',
  'blog/blog.css', 'aisen-solar-logo.png', '_headers',
];
const errors = [];
const walk = (folder) => readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
  const full = resolve(folder, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
for (const rel of required) {
  if (!existsSync(resolve(root, rel))) errors.push(`Missing required staging asset: ${rel}`);
}
let references = 0;
for (const file of walk(root)) {
  const rel = relative(root, file);
  if (/(^|\/)(?:\.env(?:\..*)?|\.htpasswd|config\.php)$/i.test(rel)
    || /\.(?:sql|log|bak|zip)$/i.test(rel)) errors.push(`Unsafe static asset: ${rel}`);
  if (extname(file).toLowerCase() !== '.html') continue;
  const html = readFileSync(file, 'utf8');
  for (const [, , href] of html.matchAll(/\b(?:src|href)=(['"])(.*?)\1/gi)) {
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    let pathname;
    try { pathname = decodeURIComponent(href.split(/[?#]/, 1)[0]); }
    catch { errors.push(`Malformed URL in ${rel}: ${href}`); continue; }
    if (!extname(pathname) || pathname.startsWith('/media/') || pathname.includes('/api/')) continue;
    const target = resolve(root, '.' + pathname);
    if (!target.startsWith(root + sep)) { errors.push(`Out-of-tree reference in ${rel}: ${href}`); continue; }
    references++;
    if (!existsSync(target)) errors.push(`Broken asset in ${rel}: ${href}`);
  }
}
if (errors.length) {
  console.error(`Public asset verification failed (${errors.length}):\n${errors.join('\n')}`);
  process.exitCode = 1;
} else console.log(`Public assets verified: ${references} references, required CMS assets present, no unsafe files.`);
