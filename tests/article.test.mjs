import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { renderArticleHtml } from '../src/article.js';

test('renders legacy markdown links, headings and bullets as HTML', () => {
  const actual = renderArticleHtml('# Solar\nVisit [MNRE](https://mnre.gov.in/?a=1&b=2).\n- item one\n- item two');
  assert.match(actual, /<h1>Solar<\/h1>/);
  assert.match(actual, /href="https:\/\/mnre\.gov\.in\/\?a=1&amp;b=2"/);
  assert.match(actual, /<li>item one<\/li>/);
});

test('renders safe rich editor HTML without double escaping ampersands', () => {
  const actual = renderArticleHtml('<p>Solar &amp; storage: <a href="https://example.com/?x=1&amp;y=2">learn</a></p>');
  assert.match(actual, /Solar &amp; storage/);
  assert.match(actual, /href="https:\/\/example\.com\/\?x=1&amp;y=2"/);
  assert.ok(!actual.includes('amp;amp;'));
});

test('does not emit executable markup or dangerous link schemes', () => {
  const actual = renderArticleHtml('<p onclick="alert(1)">Hello <a href="javascript:alert(1)">click</a><img src="data:text/html,bad"><svg onload="alert(1)"></svg><script>alert(1)</script></p>');
  assert.ok(!actual.includes('onclick='));
  assert.ok(!actual.includes('javascript:'));
  assert.ok(!actual.includes('<svg'));
  assert.ok(!actual.includes('<script'));
  assert.ok(!actual.includes('<img'));
});

test('does not transform unsafe markdown links into clickable links', () => {
  const actual = renderArticleHtml('[Click](javascript:alert(1))');
  assert.ok(!actual.includes('href='));
});
