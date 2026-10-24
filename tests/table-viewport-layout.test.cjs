const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Exercise the actual viewport hook with measured DOM fixtures, without a browser.
function setup() {
  class Element {
    constructor(top = 0) {
      const classes = new Set();
      const styles = new Map();
      this.classList = {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name),
        toggle: (name, enabled) => (enabled ? classes.add(name) : classes.delete(name))
      };
      this.style = {
        setProperty: (key, value) => styles.set(key, value),
        removeProperty: key => styles.delete(key),
        getPropertyValue: key => styles.get(key) || ''
      };
      this.offsetParent = {};
      this.clientWidth = 1000;
      this.getBoundingClientRect = () => ({ top, bottom: 900, height: 50 });
      this.addEventListener = this.removeEventListener = () => {};
    }
  }
  const root = new Element();
  const frame = new Element(200);
  const container = new Element(300);
  const pagination = new Element();
  pagination.className = 'erp-data-table-pagination';
  container.parentElement = frame;
  container.nextElementSibling = pagination;
  let content = false;
  container.querySelector = () => ({});
  container.closest = selector => (selector.includes('data-erp-table-layout') && content ? {} : null);
  container.matches = selector => selector.includes('.erp-primary-data-table');
  root.querySelectorAll = selector => {
    if (selector === 'table') return []; // Column sizing is covered separately.
    if (selector === '.erp-data-table-frame') return frame.classList.contains('erp-data-table-frame') ? [frame] : [];
    return [container];
  };
  const listeners = new Map();
  const scheduled = new Map();
  let nextFrame = 0;
  const window = {
    getComputedStyle: () => ({ paddingBottom: '16px', borderBottomWidth: '1px', rowGap: '12px' }),
    requestAnimationFrame: callback => {
      scheduled.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: id => scheduled.delete(id),
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name)
  };
  class Observer {
    observe() {}
    disconnect() {}
  }
  let cleanup;
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/hooks/useGlobalTableColumnResize.ts'), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const requireStub = name => {
    if (name === 'react')
      return {
        useEffect: callback => {
          cleanup = callback();
        }
      };
    if (name.includes('tableColumnLayout')) return {};
    if (name.includes('tableColumnSizing')) return {};
    throw new Error(`Unexpected import: ${name}`);
  };
  new Function(
    'require',
    'module',
    'exports',
    'document',
    'window',
    'HTMLElement',
    'Element',
    'MutationObserver',
    'ResizeObserver',
    code
  )(requireStub, module, module.exports, { querySelector: () => root }, window, Element, Element, Observer, Observer);
  module.exports.useGlobalTableColumnResize('sales', 'sale1', { layouts: {}, canEditColumns: false });
  const update = nextContent => {
    content = nextContent;
    listeners.get('resize')();
    const callbacks = [...scheduled.values()];
    scheduled.clear();
    callbacks.forEach(callback => callback());
  };
  return { root, frame, container, update, cleanup: () => cleanup() };
}

test('primary lists retain a bounded scroll frame and pagination', () => {
  const ui = setup();
  assert.ok(ui.root.classList.contains('erp-data-table-page'));
  assert.ok(ui.frame.classList.contains('erp-data-table-frame'));
  assert.ok(ui.container.classList.contains('erp-viewport-table-scroll--fill'));
  assert.ok(ui.frame.style.getPropertyValue('--erp-table-frame-height'));
  ui.cleanup();
});

test('switching to a form removes viewport stretching and releases page scrolling; returning restores the list', () => {
  const ui = setup();
  ui.update(true);
  assert.equal(ui.container.classList.contains('erp-viewport-table-scroll'), false);
  assert.equal(ui.container.classList.contains('erp-viewport-table-scroll--fill'), false);
  assert.equal(ui.container.style.getPropertyValue('--erp-table-viewport-height'), '');
  assert.equal(ui.frame.classList.contains('erp-data-table-frame'), false);
  assert.equal(ui.frame.style.getPropertyValue('--erp-table-frame-height'), '');
  assert.equal(ui.root.classList.contains('erp-data-table-page'), false);
  ui.update(false);
  assert.ok(ui.frame.classList.contains('erp-data-table-frame'));
  assert.ok(ui.root.classList.contains('erp-data-table-page'));
  ui.cleanup();
});
