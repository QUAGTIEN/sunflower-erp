const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const listFiles = (directory, pattern) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath, pattern);
    return pattern.test(entry.name) ? [fullPath] : [];
  });

// A stylesheet is only bundled when some module imports it; a refactor that drops the
// import silently leaves the screen unstyled (Leads.css, 24/10/2026).
test('every stylesheet under src is imported by a module', () => {
  const sources = listFiles(path.join(root, 'src'), /\.(tsx?|css)$/).map(file => fs.readFileSync(file, 'utf8'));
  const orphans = listFiles(path.join(root, 'src'), /\.css$/)
    .map(file => path.basename(file))
    .filter(name => !sources.some(source => source.includes(`${name}'`)));
  assert.deepEqual(orphans, []);
});

test('lead and raw-data screens load their workspace styles', () => {
  const leadsPage = fs.readFileSync(path.join(root, 'src/features/crm/pages/LeadsPage.tsx'), 'utf8');
  assert.match(leadsPage, /import '\.\/Leads\.css';/);
  assert.match(leadsPage, /import '@\/components\/CustomerHistory\.css';/);
});
