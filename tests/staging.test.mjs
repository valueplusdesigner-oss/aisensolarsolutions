import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { quoteCsvCell } from '../src/csv.js';
import { stagingConfigErrors } from '../scripts/verify-staging-config.mjs';

const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));

test('staging Worker handles CMS, blog root, admin root and R2 media before static assets', () => {
  const routes = new Set(config.assets.run_worker_first);
  for (const route of [
    '/aisen-preview/api/*', '/aisen-preview/admin', '/aisen-preview/admin/*',
    '/blog', '/blog/*', '/media/*',
  ]) assert.ok(routes.has(route), `missing Worker-first route: ${route}`);
});

test('deployment guard refuses placeholder ID and accepts configured staging', () => {
  assert.ok(stagingConfigErrors(config).some((error) => error.includes('placeholder')));
  const ready = structuredClone(config);
  ready.d1_databases[0].database_id = '11111111-2222-3333-4444-555555555555';
  assert.deepEqual(stagingConfigErrors(ready), []);
  ready.routes = [{ pattern: 'www.aisensolarsolutions.com/*' }];
  assert.ok(stagingConfigErrors(ready).some((error) => error.includes('production route')));
});

test('CSV escaping protects against malicious spreadsheet formulas and preserves quotes', () => {
  assert.equal(quoteCsvCell('=HYPERLINK("https://bad.test")'), '"\'=HYPERLINK(""https://bad.test"")"');
  assert.equal(quoteCsvCell('  @SUM(A1)'), '"\'  @SUM(A1)"');
  assert.equal(quoteCsvCell('+919999888877'), '"\'+919999888877"');
  assert.equal(quoteCsvCell('Normal " customer'), '"Normal "" customer"');
  assert.equal(quoteCsvCell(null), '""');
});
