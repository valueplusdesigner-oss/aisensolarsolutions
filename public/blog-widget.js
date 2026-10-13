(function () {
  'use strict';
  const API = '/aisen-preview/api/blogs.php?limit=3';

  function text(node, value) { node.textContent = value == null ? '' : String(value); return node; }
  function el(tag, className) { const node = document.createElement(tag); if (className) node.className = className; return node; }
  function dateLabel(value) {
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function updateLinks() {
    document.querySelectorAll('a').forEach(function (link) {
      if (link.textContent.trim().toLowerCase() === 'blog') link.href = '/blog/';
    });
    const nav = document.querySelector('.nav-links');
    if (nav && !nav.querySelector('a[href="/blog/"]')) {
      const link = el('a'); link.href = '/blog/'; link.textContent = 'Blog';
      const contact = Array.from(nav.querySelectorAll('a')).find(function (a) { return a.textContent.trim() === 'Contact'; });
      nav.insertBefore(link, contact || null);
    }
  }
  function card(post) {
    const article = el('article', 'aisen-blog-card');
    const media = el('a', 'aisen-blog-media'); media.href = post.url;
    if (post.image) { const img = el('img'); img.src = post.image; img.alt = post.title || ''; img.loading = 'lazy'; media.appendChild(img); }
    else { media.classList.add('no-image'); const label = text(el('span'), 'Solar intelligence'); media.appendChild(label); }
    const copy = el('div', 'aisen-blog-copy');
    const meta = el('div', 'aisen-blog-meta'); meta.append(text(el('span'), post.category)); meta.append(text(el('time'), dateLabel(post.publishedAt)));
    const heading = el('h3'); const title = el('a'); title.href = post.url; text(title, post.title); heading.appendChild(title);
    const excerpt = text(el('p'), post.excerpt);
    const more = el('a', 'aisen-blog-more'); more.href = post.url; more.append(document.createTextNode('Read article ')); more.append(text(el('b'), '↗'));
    copy.append(meta, heading, excerpt, more); article.append(media, copy); return article;
  }
  function render(posts) {
    if (!Array.isArray(posts) || posts.length === 0 || document.querySelector('#blog')) return;
    const anchor = document.querySelector('.faq-section') || document.querySelector('#contact'); if (!anchor) return;
    const section = el('section', 'aisen-blog-section'); section.id = 'blog';
    const head = el('div', 'aisen-blog-head');
    const left = el('div'); const kicker = el('div', 'section-kicker'); kicker.textContent = '07 · SOLAR INSIGHTS';
    const h2 = el('h2'); h2.innerHTML = 'Smarter energy starts<br><em>with better knowledge.</em>'; left.append(kicker, h2);
    const side = el('div', 'aisen-blog-intro'); side.append(text(el('p'), 'Practical guides and expert perspectives for homes, businesses and industries planning their solar journey.'));
    const all = el('a'); all.href = '/blog/'; all.innerHTML = 'Explore all insights <span>→</span>'; side.appendChild(all); head.append(left, side);
    const grid = el('div', 'aisen-blog-grid'); posts.forEach(function (post) { grid.appendChild(card(post)); }); section.append(head, grid); anchor.parentNode.insertBefore(section, anchor);
  }
  function start() {
    updateLinks();
    if (!document.querySelector('link[href="/blog-widget.css"]')) { const css = el('link'); css.rel = 'stylesheet'; css.href = '/blog-widget.css'; document.head.appendChild(css); }
    fetch(API, { credentials: 'same-origin', cache: 'no-store' }).then(function (response) { if (!response.ok) throw new Error('Blog request failed'); return response.json(); }).then(function (data) { render(data.posts || []); }).catch(function () { /* The homepage remains unchanged if the blog API is unavailable. */ });
    setTimeout(updateLinks, 1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 120); }); else setTimeout(start, 120);
})();
