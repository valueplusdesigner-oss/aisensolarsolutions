import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { adminRootLocation, addStagingResponseHeaders } from '../src/routing.js';

test('Admin root without trailing slash redirects into the authenticated admin handler', () => {
  assert.equal(adminRootLocation('/aisen-preview/admin'), '/aisen-preview/admin/');
  assert.equal(adminRootLocation('/aisen-preview/admin/'), null);
});

test('Staging Worker responses cannot be indexed', async () => {
  const result = addStagingResponseHeaders(
    new Response('test', { headers: { 'cache-control': 'no-store' } }),
    'https://aisen-solar-staging.example.workers.dev/blog/',
  );
  assert.equal(result.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(await result.text(), 'test');
  const live = addStagingResponseHeaders(new Response('test'), 'https://www.aisensolarsolutions.com/');
  assert.equal(live.headers.get('x-robots-tag'), null);
});

test('Staging static assets receive an X-Robots-Tag rule', () => {
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.match(headers, /\.workers\.dev\/\*/);
  assert.match(headers, /X-Robots-Tag: noindex, nofollow/);
});

test('admin and blog styles/scripts use static routing while admin pages remain protected', async () => {
  const { isWorkerStaticAsset } = await import('../src/routing.js');
  for (const path of ['/blog/blog.css','/blog/blog-rich-content.css','/aisen-preview/admin/admin-dashboard.css','/aisen-preview/admin/admin-dashboard.js','/aisen-preview/admin/blog-editor.js']) assert.equal(isWorkerStaticAsset(path),true,path);
  for (const path of ['/aisen-preview/admin/','/aisen-preview/admin/action','/aisen-preview/admin/index.html','/aisen-preview/admin/config.php','/blog/example/']) assert.equal(isWorkerStaticAsset(path),false,path);
});
