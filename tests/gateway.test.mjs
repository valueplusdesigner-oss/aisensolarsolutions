import { test } from 'node:test';
import assert from 'node:assert/strict';
import gateway from '../pages-gateway/public/_worker.js';

test('public gateway preserves POST fields, URL, cookies and backend redirect without caching', async () => {
  const request = new Request('https://www.aisensolarsolutions.com/aisen-preview/admin/action?tab=blog', {
    method:'POST', headers:{cookie:'test_session=local-only'}, body:new URLSearchParams({title:'हिंदी ब्लॉग',action:'save_blog'}),
  });
  const response = await gateway.fetch(request, {APP:{fetch:async incoming => {
    assert.equal(incoming.url, request.url);
    assert.equal(incoming.headers.get('cookie'),'test_session=local-only');
    assert.equal((await incoming.formData()).get('title'),'हिंदी ब्लॉग');
    return new Response(null,{status:303,headers:{location:'/aisen-preview/admin/?tab=blog','set-cookie':'test_session=local-only; HttpOnly; Secure','cache-control':'no-store'}});
  }}});
  assert.equal(response.status,303);
  assert.equal(response.headers.get('location'),'/aisen-preview/admin/?tab=blog');
  assert.equal(response.headers.get('set-cookie'),'test_session=local-only; HttpOnly; Secure');
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('x-robots-tag'),null);
});

test('Pages preview stays out of search and preserves media bytes and headers', async () => {
  const bytes = new Uint8Array([0,1,2,255]);
  const response = await gateway.fetch(new Request('https://preview.aisen-solar-public.pages.dev/media/photo.webp'), {APP:{fetch:async()=>new Response(bytes,{headers:{'content-type':'image/webp',etag:'test-image'}})}});
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
  assert.equal(response.headers.get('content-type'),'image/webp');
  assert.equal(response.headers.get('etag'),'test-image');
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow');
});

test('missing CMS binding returns an uncacheable unavailable response', async () => {
  const response = await gateway.fetch(new Request('https://www.aisensolarsolutions.com/'),{});
  assert.equal(response.status,503);
  assert.equal(response.headers.get('cache-control'),'no-store');
});
