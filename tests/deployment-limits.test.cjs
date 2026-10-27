const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

// Vercel Hobby rejects a deployment with more than 12 serverless functions; each file under api/ is one function.
const VERCEL_HOBBY_FUNCTION_LIMIT = 12;

const listFunctions = directory =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFunctions(fullPath);
    return /\.(ts|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [fullPath] : [];
  });

test('api folder stays within the Vercel Hobby serverless function limit', () => {
  const functions = listFunctions(path.join(root, 'api'));
  assert.ok(
    functions.length <= VERCEL_HOBBY_FUNCTION_LIMIT,
    `api/ has ${functions.length} functions; Vercel Hobby allows ${VERCEL_HOBBY_FUNCTION_LIMIT}`
  );
});

test('account actions share one function and the client calls it with an action field', () => {
  const api = fs.readFileSync(path.join(root, 'api/users/manage.ts'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'src/services/adminUserService.ts'), 'utf8');
  for (const action of ['create', 'update', 'set_active', 'delete']) {
    assert.match(api, new RegExp(`case '${action}'`));
    assert.match(client, new RegExp(`action: '${action}'`));
  }
  assert.match(api, /requireAdmin\(request\)/);
  assert.doesNotMatch(client, /\/api\/users\/(create|update|set-active|delete)/);
});

// Vercel runs api/ as native Node ESM ("type": "module"): a relative import without ".js" type-checks under
// Bundler resolution and works in Vite, but crashes the function on load with a 500 (Chấm công, 27/10/2026).
test('every runtime relative import reachable from api/ and server/ names its .js file', () => {
  const sources = [];
  const collect = directory =>
    fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(file);
      else if (file.endsWith('.ts')) sources.push(file);
    });
  collect(path.join(root, 'api'));
  collect(path.join(root, 'server'));
  const visited = new Set();
  const missingExtension = [];
  const visit = file => {
    if (visited.has(file)) return;
    visited.add(file);
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:import|export)\s[^'"]*?from\s+'(\.[^']+)'/g)) {
      if (/^import\s+type\b/.test(match[0])) continue;
      const specifier = match[1];
      if (!specifier.endsWith('.js')) {
        missingExtension.push(`${path.relative(root, file)} -> ${specifier}`);
        continue;
      }
      visit(path.resolve(path.dirname(file), specifier.replace(/\.js$/, '.ts')));
    }
  };
  sources.forEach(visit);
  assert.ok(visited.size > sources.length, 'shared models under src/ are followed too');
  assert.deepEqual(missingExtension, []);
});
