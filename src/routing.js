/** Preserve the canonical Admin URL; requests without the trailing slash must reach the Worker. */
export function adminRootLocation(pathname) {
  return pathname === '/aisen-preview/admin' ? '/aisen-preview/admin/' : null;
}

/** Keep the publicly reachable staging deployment out of search results. */
export function addStagingResponseHeaders(response, requestUrl) {
  const url = requestUrl instanceof URL ? requestUrl : new URL(requestUrl);
  if (!url.hostname.endsWith('.workers.dev')) return response;
  const headers = new Headers(response.headers);
  headers.set('x-robots-tag', 'noindex, nofollow');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
