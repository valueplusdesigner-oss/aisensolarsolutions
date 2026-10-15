// Render legacy Markdown articles and CMS-authored rich HTML without executing
// arbitrary markup or script attributes. The accepted HTML vocabulary is small
// by design. Extend it only after a security review.

const esc = (value) => String(value ?? '').replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function safeUrl(value, image = false) {
  const url = String(value ?? '').trim();
  if (!url || /[\x00-\x1f\x7f]/.test(url)) return null;
  if (/^https?:\/\/[^\s<>"']+$/i.test(url)) return url;
  if (/^\/(?!\/)[^\s<>"']*$/.test(url)) return url;
  if (!image && /^mailto:[^\s<>"']+$/i.test(url)) return url;
  return null;
}

function safeInlineMarkdown(text) {
  // Input is escaped before any replacement introduces trusted HTML.
  let s = esc(text);
  s = s.replace(/`([^`\n]+)`/g, (_, code) => `<code>${code}</code>`);
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (all, label, href) => {
    // Entities created by esc() are safe for HTML attrs, but need conversion
    // only to check their original scheme before re-escaping.
    const decoded = href.replaceAll('&amp;', '&');
    const allowed = safeUrl(decoded);
    return allowed ? `<a href="${esc(allowed)}" rel="nofollow noopener noreferrer">${label}</a>` : all;
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  return s;
}

function markdownToHtml(input) {
  const out = [];
  let list = '';
  let code = false;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = ''; } };
  for (const line of String(input).replace(/\r\n?/g, '\n').split('\n')) {
    const raw = line.trim();
    if (/^```/.test(raw)) {
      closeList();
      out.push(code ? '</code></pre>' : '<pre><code>');
      code = !code;
      continue;
    }
    if (code) { out.push(`${esc(line)}\n`); continue; }
    if (!raw) { closeList(); continue; }
    if (/^(---+|\*\*\*+)$/.test(raw)) { closeList(); out.push('<hr>'); continue; }
    const h = /^(#{1,6})\s+(.+)$/.exec(raw);
    if (h) { closeList(); const tag = `h${h[1].length}`; out.push(`<${tag}>${safeInlineMarkdown(h[2])}</${tag}>`); continue; }
    const quote = /^>\s?(.*)$/.exec(raw);
    if (quote) { closeList(); out.push(`<blockquote>${safeInlineMarkdown(quote[1])}</blockquote>`); continue; }
    const bullet = /^(?:[-*+]\s+|\d+\.\s+)(.+)$/.exec(raw);
    if (bullet) {
      const next = /^\d+\.\s+/.test(raw) ? 'ol' : 'ul';
      if (next !== list) { closeList(); out.push(`<${next}>`); list = next; }
      out.push(`<li>${safeInlineMarkdown(bullet[1])}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${safeInlineMarkdown(raw)}</p>`);
  }
  closeList();
  if (code) out.push('</code></pre>');
  return out.join('\n');
}

const permitted = new Set(['p','br','h1','h2','h3','h4','h5','h6','strong','b','em','i','u','s','ul','ol','li','a','blockquote','pre','code','hr','div','span','table','thead','tbody','tr','td','th','img']);
const voidTags = new Set(['br','hr','img']);

function escapeHtmlText(value) {
  // Keep existing character entities when editing previously saved rich HTML.
  return String(value).replace(/&(?!(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);)/gi, '&amp;')
    .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function sanitizeHtml(input) {
  let result = '';
  let last = 0;
  const source = String(input);
  for (const match of source.matchAll(/<[^>]*>/g)) {
    result += escapeHtmlText(source.slice(last, match.index));
    last = match.index + match[0].length;
    const parsed = /^<\s*(\/?)\s*([a-z][a-z\d]*)\b([^<>]*)>$/i.exec(match[0]);
    if (!parsed) { result += esc(match[0]); continue; }
    const [, closing, name, attrs] = parsed;
    const tag = name.toLowerCase();
    if (!permitted.has(tag)) continue;
    if (closing) { if (!voidTags.has(tag)) result += `</${tag}>`; continue; }
    if (tag === 'a' || tag === 'img') {
      const key = tag === 'a' ? 'href' : 'src';
      const attr = new RegExp(`(?:^|\\s)${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
      const allowed = safeUrl(attr?.[1] ?? attr?.[2] ?? attr?.[3] ?? '', tag === 'img');
      if (tag === 'a') result += allowed ? `<a href="${esc(allowed.replace(/&amp;/gi, '&'))}" rel="nofollow noopener noreferrer">` : '<a>';
      else if (allowed) result += `<img src="${esc(allowed)}" alt="">`;
    } else result += `<${tag}>`;
  }
  result += escapeHtmlText(source.slice(last));
  return result;
}

export function renderArticleHtml(value) {
  const source = String(value ?? '').replaceAll('\uFFFD', '');
  // Rich editor output has block/inline HTML; original blog migration contains
  // Markdown rather than HTML. Handle each format without double-escaping.
  return /<\/?(?:p|h[1-6]|ul|ol|li|div|span|strong|b|em|i|a|blockquote|table|img|br)\b/i.test(source)
    ? sanitizeHtml(source)
    : markdownToHtml(source);
}
