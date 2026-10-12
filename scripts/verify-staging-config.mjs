import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Refuse any deployment that could accidentally target the production domain. */
export function stagingConfigErrors(config) {
  const errors = [];
  if (config?.name !== 'aisen-solar-staging') errors.push('Worker name must be aisen-solar-staging.');
  if (config?.route || config?.routes) errors.push('Staging must not configure a production route/custom domain.');
  if (config?.workers_dev === false) errors.push('Staging needs its workers.dev preview URL enabled.');
  const databases = config?.d1_databases || [];
  if (databases.length !== 1 || databases[0].binding !== 'DB' || databases[0].database_name !== 'aisen-solar-staging') {
    errors.push('Binding DB must point to the staging D1 database.');
  }
  if (!databases[0]?.database_id || databases[0].database_id === 'REPLACE_AFTER_D1_CREATION') {
    errors.push('Replace the placeholder with the actual staging D1 database ID.');
  }
  if (!(config?.r2_buckets || []).some(({ binding, bucket_name }) => binding === 'MEDIA' && bucket_name === 'aisen-solar-staging-media')) {
    errors.push('Binding MEDIA must use the staging R2 bucket.');
  }
  for (const route of ['/aisen-preview/api/*', '/aisen-preview/admin/*', '/blog/*', '/media/*']) {
    if (!(config?.assets?.run_worker_first || []).includes(route)) errors.push(`Missing Worker-first route ${route}`);
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const errors = stagingConfigErrors(config);
  if (errors.length) {
    console.error('Staging deployment blocked:\n' + errors.map((error) => `- ${error}`).join('\n'));
    process.exitCode = 1;
  } else console.log('Staging deployment configuration verified. Production DNS was not changed.');
}
