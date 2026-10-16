/** Public website entry point. Reuse the existing CMS, database, media and authentication. */
export default {
  async fetch(request, env) {
    if (!env.APP) {
      return new Response('Website connection is not configured yet.', {
        status: 503,
        headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
      });
    }
    const response = await env.APP.fetch(request);
    if (!new URL(request.url).hostname.endsWith('.pages.dev')) return response;
    const headers = new Headers(response.headers);
    headers.set('x-robots-tag', 'noindex, nofollow');
    return new Response(response.body, {
      status: response.status, statusText: response.statusText, headers,
    });
  },
};
