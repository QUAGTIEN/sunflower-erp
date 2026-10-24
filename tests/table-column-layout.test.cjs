const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');

const { createLoader: loader } = require('./helpers/loadTs.cjs');

const model = loader()('src/domain/tableColumnLayout.ts');
const admin = { uid: 'admin-1', role: 'admin', active: true };
function service({ remote = true, failure } = {}) {
  const writes = [];
  const local = new Map();
  const load = loader({
    'firebase/firestore': {
      doc: (_db, collection, id) => ({ collection, id }),
      setDoc: async (...args) => {
        if (failure) throw failure;
        writes.push(args);
      }
    },
    '@/infrastructure/firebase/client': { getFirebaseDatabase: async () => (remote ? {} : null) },
    '@/infrastructure/firebase/erpDataGateway': {
      isDocumentAlreadyExistsError: error => error.code === 'document-already-exists',
      dbService: {
        getDocument: async (_collection, id) => local.get(id) || null,
        addDocument: async (_collection, data) => {
          local.set(data.id, data);
          writes.push(data);
        },
        addDocumentIfAbsent: async (_collection, id, data) => {
          if (local.has(id))
            throw Object.assign(new Error('exists'), {
              code: 'document-already-exists',
              existingDocument: local.get(id)
            });
          local.set(id, data);
          writes.push(data);
          return data;
        }
      }
    }
  });
  return { ...load('src/services/tableColumnLayoutService.ts'), writes, local };
}

test('all employee roles and inactive admins are rejected before any write', async () => {
  const api = service();
  for (const role of ['sale', 'designer', 'purchaser', 'producer', 'accountant']) {
    await assert.rejects(
      api.saveTableColumnLayout({ ...admin, role }, 'leads', { selectedIds: ['company'] }),
      /Chỉ Admin/
    );
  }
  await assert.rejects(
    api.saveTableColumnLayout({ ...admin, active: false }, 'leads', { widths: { phone: 200 } }),
    /Chỉ Admin/
  );
  assert.equal(api.writes.length, 0);
});

test('admin saves to a table id shared across accounts and merges separate edits', async () => {
  const api = service();
  await api.saveTableColumnLayout(admin, 'leads', { selectedIds: ['company', 'phone'], widths: { phone: 200 } });
  await api.saveTableColumnLayout(admin, 'leads', { widths: { phone: 240 } });
  assert.deepEqual(api.writes[0][0], { collection: 'table_column_layouts', id: 'leads' });
  assert.deepEqual(api.writes[0][2], { merge: true });
  assert.equal(api.writes[0][1].updatedById, admin.uid);
  assert.equal(api.writes[1][1].selectedIds, undefined);
  assert.deepEqual(api.writes[1][1].widths, { phone: 240 });
});

test('failed production saves propagate errors without writing a local substitute', async () => {
  const api = service({ failure: new Error('permission-denied') });
  await assert.rejects(api.saveTableColumnLayout(admin, 'leads', { selectedIds: ['company'] }), /permission-denied/);
  assert.equal(api.local.size, 0);
});

test('local demo preserves visibility, order and other widths across separate edits', async () => {
  const api = service({ remote: false });
  await api.saveTableColumnLayout(admin, 'leads', {
    selectedIds: ['company', 'email', 'phone'],
    widths: { phone: 180, email: 220 }
  });
  await api.saveTableColumnLayout(admin, 'leads', { widths: { phone: 240 } });
  assert.deepEqual(api.local.get('leads').selectedIds, ['company', 'email', 'phone']);
  assert.deepEqual(api.local.get('leads').widths, { phone: 240, email: 220 });
  assert.equal(api.local.has('customers'), false);
});

test('invalid cached widths cannot overflow or break the shared table', () => {
  const normalized = model.normalizeTableColumnLayout({
    id: 'leads',
    selectedIds: ['phone', 'phone', 123],
    widths: { phone: 200, bad: NaN, tooSmall: 1, tooLarge: 99999, __tableWidth: 5000 }
  });
  assert.deepEqual(normalized.selectedIds, ['phone']);
  assert.deepEqual(normalized.widths, { phone: 200, __tableWidth: 5000 });
  assert.equal(model.normalizeTableColumnLayout({ id: '../leads' }), null);
  assert.notEqual(
    model.getGenericTableLayoutId('sales', 'orders'),
    model.getGenericTableLayoutId('sales', 'customers')
  );
});

test('migrating an admin browser never overwrites an existing company configuration', async () => {
  const api = service();
  const companyLayout = { id: 'leads', schemaVersion: 1, selectedIds: ['company', 'email'], widths: { email: 220 } };
  api.local.set('leads', companyLayout);
  const saved = await api.saveTableColumnLayout(
    admin,
    'leads',
    { selectedIds: ['company', 'phone'], widths: { phone: 180 } },
    true
  );
  assert.deepEqual(saved, companyLayout);
  assert.deepEqual(api.local.get('leads'), companyLayout);
  assert.equal(api.writes.length, 0);
});

test('employee tables use company selections instead of their old private preference', () => {
  let result;
  const companyIds = ['company', 'email', 'actions'];
  const hook = loader({
    '@/context/TableColumnLayoutContext': {
      useTableColumnLayouts: () => ({
        layouts: { leads: { selectedIds: companyIds } },
        canEditColumns: false,
        saveLayout: () => {
          throw new Error('employee write');
        },
        migrateLayout: () => {
          throw new Error('employee migration');
        }
      })
    }
  })('src/hooks/useSharedTableColumns.ts');
  function Harness() {
    result = hook.useSharedTableColumns({ layoutId: 'leads', legacySelectionKey: 'private-sale-pref' });
    return null;
  }
  renderToStaticMarkup(React.createElement(Harness));
  assert.deepEqual(result.selectedIds, companyIds);
  assert.equal(result.canEditColumns, false);
});

function headerProps(canEditColumns, saveLayout = () => true) {
  let result;
  const moved = [];
  const layouts = { leads: { id: 'leads', schemaVersion: 1, widths: { email: 220 } } };
  const hook = loader({
    '@/context/TableColumnLayoutContext': {
      useTableColumnLayouts: () => ({ layouts, canEditColumns, saveLayout })
    }
  })('src/hooks/useReorderableTableColumns.ts');
  function Harness() {
    result = hook.useReorderableTableColumns({
      columns: ['company', 'phone', 'email', 'actions'].map(id => ({ id, label: id })),
      selectedIds: ['company', 'phone', 'email', 'actions'],
      layoutId: 'leads',
      lockedStartIds: ['company'],
      lockedEndIds: ['actions'],
      onOrderChange: ids => moved.push(ids)
    });
    return null;
  }
  renderToStaticMarkup(React.createElement(Harness));
  return { result, moved };
}

test('employees consume admin widths with no mouse, drag or keyboard edit handlers', () => {
  const { result, moved } = headerProps(false);
  const props = result.getHeaderProps('email', 'Email');
  assert.equal(props.style['--erp-column-resized-width'], '220px');
  assert.equal(props.draggable, false);
  for (const name of ['onPointerDown', 'onDragStart', 'onDrop', 'onKeyDown', 'tabIndex'])
    assert.equal(props[name], undefined);
  assert.match(props.className, /is-readonly/);
  assert.equal(moved.length, 0);
});

test('admin can reorder with the keyboard while mandatory edge columns stay fixed', () => {
  const { result, moved } = headerProps(true);
  const props = result.getHeaderProps('phone', 'Phone');
  assert.equal(props.draggable, true);
  assert.equal(typeof props.onPointerDown, 'function');
  props.onKeyDown({ altKey: true, key: 'ArrowRight', preventDefault() {} });
  assert.deepEqual(moved[0], ['company', 'email', 'phone', 'actions']);
  assert.equal(result.getHeaderProps('company', 'Company').draggable, false);
});

test('Firestore layout rules restrict writes to admins and never allow employee deletion', () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  const block = rules.match(/match \/table_column_layouts\/\{documentId\} \{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(block);
  assert.match(block, /allow read: if isActive\(\)/);
  assert.match(block, /allow create, update: if isAdmin\(\)/);
  assert.match(block, /updatedById == request\.auth\.uid/);
  assert.match(block, /allow delete: if false/);
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false/);
});

const sizing = loader()('src/shared/utils/tableColumnSizing.ts');
function inlineStyle(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getPropertyValue: key => values.get(key) || '',
    setProperty: (key, value) => values.set(key, value),
    removeProperty: key => values.delete(key)
  };
}
function column(baseWidth, displayedWidth = baseWidth) {
  return {
    colSpan: 1,
    rowSpan: 1,
    style: inlineStyle({ '--erp-column-base-width': `${baseWidth}px` }),
    getBoundingClientRect: () => ({ width: displayedWidth, right: 1600 })
  };
}
function grid(headers, storedTotal = 2500) {
  const classes = new Set();
  return {
    tHead: { rows: [{ cells: headers }] },
    classList: {
      contains: name => classes.has(name),
      toggle: (name, enabled) => (enabled ? classes.add(name) : classes.delete(name))
    },
    style: inlineStyle({ '--erp-table-resized-width': `${storedTotal}px` }),
    querySelector: () => null
  };
}
function withSizingWindow(run) {
  const previous = global.window;
  const listeners = new Map();
  global.window = {
    getComputedStyle: header => ({
      getPropertyValue: key =>
        key === '--erp-column-base-width'
          ? header.style.getPropertyValue('--erp-column-resized-width') || header.style.getPropertyValue(key)
          : header.style.getPropertyValue(key)
    }),
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name)
  };
  try {
    run(listeners);
  } finally {
    global.window = previous;
  }
}

test('two-column fill retains the first width and excludes the last displayed filler', () =>
  withSizingWindow(() => {
    const headers = [column(280), column(96, 1320)];
    const table = grid(headers);
    sizing.syncTableColumnFill(table);
    assert.equal(table.classList.contains('erp-table-last-column-fill'), true);
    assert.equal(table.style.getPropertyValue('--erp-table-resized-width'), '376px');
    assert.equal(headers[0].style.getPropertyValue('--erp-column-base-width'), '280px');
    assert.equal(sizing.getTableColumnBaseWidth(headers[1]), 96);
  }));

test('hiding and restoring columns recomputes the total without using an old saved table width', () =>
  withSizingWindow(() => {
    const headers = [column(280), column(200), column(220), column(96, 804)];
    const table = grid(headers);
    sizing.syncTableColumnFill(table);
    assert.equal(table.style.getPropertyValue('--erp-table-resized-width'), '796px');
    table.tHead.rows[0].cells = [headers[0], headers[3]];
    sizing.syncTableColumnFill(table);
    assert.equal(table.style.getPropertyValue('--erp-table-resized-width'), '376px');
    table.tHead.rows[0].cells = headers;
    sizing.syncTableColumnFill(table);
    assert.equal(table.style.getPropertyValue('--erp-table-resized-width'), '796px');
  }));

test('wide tables retain all configured widths for horizontal scrolling', () =>
  withSizingWindow(() => {
    const table = grid([column(1200), column(900), column(96)]);
    sizing.syncTableColumnFill(table);
    assert.equal(table.style.getPropertyValue('--erp-table-resized-width'), '2196px');
  }));

test('one-column and empty-body tables use the same fill without requiring data rows', () =>
  withSizingWindow(() => {
    const table = grid([column(280, 1600)]);
    sizing.syncTableColumnFill(table);
    assert.equal(table.style.getPropertyValue('--erp-table-resized-width'), '280px');
    assert.equal(table.classList.contains('erp-table-last-column-fill'), true);
  }));

test('grouped headers and explicit colgroups keep their existing sizing contract', () =>
  withSizingWindow(() => {
    for (const table of [grid([{ ...column(280), colSpan: 2 }]), grid([column(280)]), grid([])]) {
      if (table.tHead.rows[0].cells[0]?.colSpan === 1) table.querySelector = () => ({});
      sizing.syncTableColumnFill(table);
      assert.equal(table.classList.contains('erp-table-last-column-fill'), false);
      assert.equal(table.style.getPropertyValue('--erp-table-resized-width'), '2500px');
    }
  }));

test('resizing a filled last column saves its base width, never the viewport filler', () =>
  withSizingWindow(listeners => {
    const writes = [];
    const { result } = headerProps(true, (id, patch) => writes.push({ id, patch }));
    const table = grid([column(280), column(96, 1320)], 376);
    table.classList.toggle('erp-table-last-column-fill', true);
    const header = table.tHead.rows[0].cells[1];
    header.closest = () => table;
    result.getHeaderProps('actions', 'Thao tác').onPointerDown({
      currentTarget: header,
      clientX: 1600,
      preventDefault() {},
      stopPropagation() {}
    });
    listeners.get('pointermove')({ clientX: 1620 });
    listeners.get('pointerup')();
    assert.deepEqual(writes[0], { id: 'leads', patch: { widths: { actions: 116, __tableWidth: 396 } } });
  }));

test('shared fill CSS assigns spare space only to the last header', () => {
  const css = fs.readFileSync(path.join(root, 'src/styles/ErpUiStandards.css'), 'utf8');
  assert.match(
    css,
    /table\.erp-table-last-column-fill:has\(th\)\s*\{\s*width: max\(100%, var\(--erp-table-resized-width, 0px\)\) !important/
  );
  assert.match(css, /table\.erp-table-last-column-fill > thead > tr > th:last-child\s*\{\s*width: auto !important/);
});
