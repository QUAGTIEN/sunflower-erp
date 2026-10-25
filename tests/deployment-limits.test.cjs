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
