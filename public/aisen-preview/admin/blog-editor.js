(() => {
  'use strict';

  const root = document.querySelector('[data-rich-editor]');
  if (!root) return;

  const canvas = root.querySelector('.rich-canvas');
  const source = root.querySelector('.rich-source');
  const counter = root.querySelector('[data-word-count]');
  const form = root.closest('form');
  const allowedTags = new Set(['P','DIV','H2','H3','H4','STRONG','B','EM','I','U','S','BLOCKQUOTE','UL','OL','LI','A','BR','HR','SPAN','TABLE','THEAD','TBODY','TFOOT','TR','TH','TD','CAPTION','PRE','CODE','SUP','SUB']);
  const dropTags = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','FORM','INPUT','BUTTON','TEXTAREA','SELECT','OPTION','SVG','MATH','LINK','META']);

  const safeUrl = (value) => {
    const url = String(value || '').trim();
    if (!url || url.startsWith('/') || url.startsWith('#')) return url;
    try {
      const parsed = new URL(url, window.location.origin);
      return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol) ? url : '';
    } catch (_) { return ''; }
  };

  const cleanStyle = (value) => {
    const safe = [];
    String(value || '').split(';').forEach((declaration) => {
      const colon = declaration.indexOf(':');
      if (colon < 1) return;
      const property = declaration.slice(0, colon).trim().toLowerCase();
      const val = declaration.slice(colon + 1).trim().toLowerCase();
      if (!val || /url\s*\(|expression\s*\(|javascript:|@import/i.test(val)) return;
      if (property === 'text-align' && /^(left|center|right|justify)$/.test(val)) safe.push(`${property}:${val}`);
      if (property === 'font-weight' && /^(normal|bold|[1-9]00)$/.test(val)) safe.push(`${property}:${val}`);
      if (property === 'font-style' && /^(normal|italic|oblique)$/.test(val)) safe.push(`${property}:${val}`);
      if (property === 'text-decoration' && /^(none|underline|line-through)(\s+(underline|line-through))*$/.test(val)) safe.push(`${property}:${val}`);
      if (['color', 'background-color'].includes(property) && /^(#[0-9a-f]{3,8}|rgba?\([0-9.,%\s]+\)|hsla?\([0-9.,%\s]+\)|(black|white|gray|grey|red|green|blue|navy|teal|orange|yellow|purple|maroon))$/i.test(val)) safe.push(`${property}:${val}`);
    });
    return safe.join(';');
  };

  const sanitizeFragment = (html) => {
    const documentCopy = new DOMParser().parseFromString(`<div id="paste-root">${html}</div>`, 'text/html');
    const pasteRoot = documentCopy.getElementById('paste-root');
    const clean = (parent) => {
      [...parent.childNodes].forEach((node) => {
        if (node.nodeType === Node.COMMENT_NODE) { node.remove(); return; }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        if (dropTags.has(node.tagName)) { node.remove(); return; }

        if (node.tagName === 'H1') {
          const replacement = documentCopy.createElement('h2');
          while (node.firstChild) replacement.appendChild(node.firstChild);
          node.replaceWith(replacement);
          node = replacement;
        } else if (node.tagName === 'H5' || node.tagName === 'H6') {
          const replacement = documentCopy.createElement('h4');
          while (node.firstChild) replacement.appendChild(node.firstChild);
          node.replaceWith(replacement);
          node = replacement;
        }

        if (!allowedTags.has(node.tagName)) {
          clean(node);
          node.replaceWith(...node.childNodes);
          return;
        }

        [...node.attributes].forEach((attribute) => {
          const name = attribute.name.toLowerCase();
          let value = attribute.value;
          let keep = false;
          if (name === 'style') { value = cleanStyle(value); keep = Boolean(value); }
          if (node.tagName === 'A' && name === 'href') { value = safeUrl(value); keep = Boolean(value); }
          if (node.tagName === 'A' && name === 'target') { value = value === '_blank' ? '_blank' : ''; keep = Boolean(value); }
          if (node.tagName === 'A' && name === 'rel') { value = 'noopener noreferrer'; keep = true; }
          if (['TD','TH'].includes(node.tagName) && ['colspan','rowspan'].includes(name)) { value = String(Math.max(1, Math.min(20, parseInt(value, 10) || 1))); keep = true; }
          if (keep) node.setAttribute(name, value); else node.removeAttribute(attribute.name);
        });
        if (node.tagName === 'A' && node.getAttribute('target') === '_blank') node.setAttribute('rel', 'noopener noreferrer');
        clean(node);
      });
    };
    clean(pasteRoot);
    return pasteRoot.innerHTML;
  };

  const plainTextToHtml = (text) => String(text || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .split(/\n\s*\n/).map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`).join('');

  // Some Word documents contain HTML tags as visible text (for example
  // "<h2>Heading</h2>") instead of real rich-text markup. Detect that case
  // and safely turn the tags back into formatting during paste.
  const literalHtmlFromText = (text) => {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const decoder = document.createElement('textarea');
    let decoded = raw;
    // Word/Docs content can arrive encoded more than once, for example
    // &amp;lt;h2&amp;gt;. Decode in bounded passes until it stabilises.
    for (let pass = 0; pass < 5; pass += 1) {
      decoder.innerHTML = decoded;
      const next = decoder.value;
      if (next === decoded) break;
      decoded = next;
    }
    decoded = decoded.replace(/\uFFFD/g, '').trim();
    const candidate = /<\/?(?:p|div|h[1-6]|strong|b|em|i|u|s|blockquote|ul|ol|li|a|br|hr|span|table|thead|tbody|tfoot|tr|th|td|caption|pre|code|sup|sub)(?:\s[^<>]*?)?\s*\/?>/i.test(decoded)
      ? decoded
      : raw;
    const tags = candidate.match(/<\/?(?:p|div|h[1-6]|strong|b|em|i|u|s|blockquote|ul|ol|li|a|br|hr|span|table|thead|tbody|tfoot|tr|th|td|caption|pre|code|sup|sub)(?:\s[^<>]*?)?\s*\/?>/gi) || [];
    return tags.length >= 2 ? candidate : '';
  };

  const update = () => {
    source.value = sanitizeFragment(canvas.innerHTML);
    const words = (canvas.innerText.trim().match(/\S+/g) || []).length;
    counter.textContent = `${words} word${words === 1 ? '' : 's'}`;
  };

  root.querySelectorAll('button[data-command]').forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      canvas.focus();
      document.execCommand(button.dataset.command, false, null);
      update();
    });
  });

  const format = root.querySelector('[data-format]');
  format.addEventListener('change', () => {
    canvas.focus();
    document.execCommand('formatBlock', false, format.value);
    update();
  });

  root.querySelector('[data-link]').addEventListener('mousedown', (event) => event.preventDefault());
  root.querySelector('[data-link]').addEventListener('click', () => {
    const url = window.prompt('Enter the link URL (https://…):', 'https://');
    const clean = safeUrl(url);
    if (!clean) return;
    canvas.focus();
    document.execCommand('createLink', false, clean);
    update();
  });

  canvas.addEventListener('paste', (event) => {
    event.preventDefault();
    const clipboard = event.clipboardData;
    const html = clipboard.getData('text/html');
    const text = clipboard.getData('text/plain');
    const literalHtml = literalHtmlFromText(text);
    const content = literalHtml
      ? sanitizeFragment(literalHtml)
      : (html ? sanitizeFragment(html) : plainTextToHtml(text));
    document.execCommand('insertHTML', false, content);
    update();
  });

  canvas.addEventListener('input', update);
  canvas.addEventListener('blur', update);
  form.addEventListener('submit', (event) => {
    update();
    if (!canvas.innerText.trim()) {
      event.preventDefault();
      canvas.focus();
      canvas.classList.add('editor-error');
    }
  });
  canvas.addEventListener('input', () => canvas.classList.remove('editor-error'));

  update();
})();
