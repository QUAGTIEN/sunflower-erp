// Loads project TypeScript sources in node:test without a build step.
// Each loader has its own module cache, so tests can inject different stubs.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..', '..');

const compilerOptions = {
  module: ts.ModuleKind.CommonJS,
  jsx: ts.JsxEmit.ReactJSX,
  target: ts.ScriptTarget.ES2022,
  esModuleInterop: true
};

function resolveCandidate(base) {
  // `server/` imports use `.js` suffixes that point at `.ts` sources.
  const candidates = [base.replace(/\.js$/, '.ts'), `${base}.ts`, `${base}.tsx`, base];
  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

/**
 * @param {Record<string, unknown>} stubs module specifiers mapped to replacement exports
 * @returns {(file: string) => any} loads a file relative to the repository root
 */
function createLoader(stubs = {}) {
  const cache = new Map();

  function load(file) {
    const filePath = path.resolve(root, file);
    if (cache.has(filePath)) return cache.get(filePath).exports;

    const mod = { exports: {} };
    cache.set(filePath, mod);
    const source = fs.readFileSync(filePath, 'utf8');
    const { outputText } = ts.transpileModule(source, { fileName: filePath, compilerOptions });

    const resolve = name => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name.endsWith('.css')) return {};
      if (name.endsWith('.woff2?url')) return '/test-font.woff2';
      if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);

      const base = name.startsWith('@/')
        ? path.join(root, 'src', name.slice(2))
        : path.resolve(path.dirname(filePath), name);
      const candidate = resolveCandidate(base);
      if (!candidate) throw new Error(`Missing test module ${name} (from ${filePath})`);
      return load(candidate);
    };

    try {
      new Function('require', 'module', 'exports', outputText)(resolve, mod, mod.exports);
    } catch (error) {
      error.message = `${filePath}: ${error.message}`;
      throw error;
    }
    return mod.exports;
  }

  return load;
}

/** Reads a repository file as text, for static contract checks. */
function readSource(file) {
  return fs.readFileSync(path.resolve(root, file), 'utf8');
}

/**
 * Reads a page or component together with the files split out of it into a sibling folder
 * and the feature hooks it imports, so static checks keep covering the whole module after refactors.
 */
function readModuleSource(file, folder) {
  const parts = fs
    .readdirSync(path.resolve(root, folder))
    .filter(name => /\.tsx?$/.test(name))
    .sort()
    .map(name => path.join(folder, name));
  const hooks = [...readSource(file).matchAll(/from '@\/(features\/[\w-]+\/hooks\/\w+)'/g)]
    .map(match => `src/${match[1]}.ts`)
    .filter(hook => fs.existsSync(path.resolve(root, hook)));
  return [file, ...parts, ...hooks].map(readSource).join('\n');
}

module.exports = { root, createLoader, readSource, readModuleSource };
