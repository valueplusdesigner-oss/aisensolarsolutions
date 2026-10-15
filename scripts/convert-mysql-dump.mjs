import fs from 'node:fs';
import path from 'node:path';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error('Usage: node convert-mysql-dump.mjs input.sql output.sql');
  process.exit(1);
}

const source = fs.readFileSync(inputPath, 'utf8');
const allowedTables = new Set([
  'cms_blog_posts',
  'cms_brands',
  'cms_difference_stats',
  'cms_offices',
  'cms_projects',
  'cms_project_images',
  'cms_settings',
  'cms_testimonials',
  'enquiries',
]);

function splitStatements(sql) {
  const statements = [];
  let start = 0;
  let quote = false;
  let escaped = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === "'") quote = false;
    } else if (ch === "'") quote = true;
    else if (ch === ';') {
      statements.push(sql.slice(start, i + 1));
      start = i + 1;
    }
  }
  return statements;
}

function decodeMysqlString(token) {
  const inner = token.slice(1, -1);
  let out = '';
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] !== '\\') {
      out += inner[i];
      continue;
    }
    i += 1;
    const ch = inner[i] ?? '';
    const map = { '0': '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a' };
    out += map[ch] ?? ch;
  }
  return out;
}

function sqliteLiteral(token) {
  const value = token.trim();
  if (/^NULL$/i.test(value)) return 'NULL';
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return value;
  if (value.startsWith("'") && value.endsWith("'")) {
    return `'${decodeMysqlString(value).replaceAll("'", "''")}'`;
  }
  throw new Error(`Unsupported SQL value: ${value.slice(0, 80)}`);
}

function parseRows(valuesText) {
  const rows = [];
  let row = null;
  let token = '';
  let quote = false;
  let escaped = false;
  let depth = 0;
  for (let i = 0; i < valuesText.length; i += 1) {
    const ch = valuesText[i];
    if (quote) {
      token += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === "'") quote = false;
      continue;
    }
    if (ch === "'") {
      quote = true;
      token += ch;
    } else if (ch === '(') {
      depth += 1;
      if (depth === 1) row = [];
      else token += ch;
    } else if (ch === ',' && depth === 1) {
      row.push(sqliteLiteral(token));
      token = '';
    } else if (ch === ')') {
      if (depth === 1) {
        row.push(sqliteLiteral(token));
        rows.push(row);
        row = null;
        token = '';
      } else token += ch;
      depth -= 1;
    } else if (depth >= 1) token += ch;
  }
  if (quote || depth !== 0) throw new Error('Unbalanced INSERT statement');
  return rows;
}

const output = [
  '-- Generated from the GoDaddy MySQL backup. Do not edit by hand.',
  'PRAGMA foreign_keys = OFF;',
  'BEGIN TRANSACTION;',
];
const counts = {};

for (const statement of splitStatements(source)) {
  const match = statement.match(/INSERT\s+INTO\s+`([^`]+)`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*);/i);
  if (!match) continue;
  const [, table, rawColumns, rawValues] = match;
  if (!allowedTables.has(table)) continue;
  const columns = [...rawColumns.matchAll(/`([^`]+)`/g)].map((item) => item[1]);
  const rows = parseRows(rawValues);
  counts[table] = (counts[table] ?? 0) + rows.length;
  for (const row of rows) {
    if (row.length !== columns.length) {
      throw new Error(`${table}: expected ${columns.length} values, found ${row.length}`);
    }
    output.push(
      `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${row.join(', ')});`,
    );
  }
}

output.push(
  `INSERT INTO cms_project_images (project_id, image_path, sort_order)
   SELECT id, image_url, 1 FROM cms_projects
   WHERE image_url IS NOT NULL AND image_url<>''
     AND NOT EXISTS (
       SELECT 1 FROM cms_project_images
       WHERE cms_project_images.project_id=cms_projects.id
         AND cms_project_images.image_path=cms_projects.image_url
     );`,
  'COMMIT;',
  'PRAGMA foreign_keys = ON;',
  '',
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, output.join('\n'), 'utf8');
console.log(JSON.stringify({ output: outputPath, rows: counts }, null, 2));
