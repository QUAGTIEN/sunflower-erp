const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const { createLoader: loader } = require('./helpers/loadTs.cjs');
const roster = loader()('src/features/attendance/model/attendanceRoster.ts');

const admin = { uid: 'boss', displayName: 'Giám đốc', role: 'admin', active: true };
const sale = { uid: 'sale', displayName: 'Sale', role: 'sale', active: true };
const worker = { uid: 'worker', displayName: 'Nhân viên A', role: 'producer', active: true };
const parttime = { uid: 'parttime', displayName: 'Part-time C', role: 'sale', active: true };
const gone = { uid: 'gone', displayName: 'Đã nghỉ', role: '', active: false };
const entry = patch => ({
  status: 'present',
  employmentType: 'full_time',
  hours: 0,
  lateMinutes: 0,
  overtimeHours: 0,
  note: '',
  recordedBy: 'boss',
  recordedByName: 'Giám đốc',
  recordedAt: '',
  ...patch
});
const workspace = () => ({
  canRecord: true,
  employees: [worker, admin, parttime, gone],
  profiles: [{ userId: 'parttime', employmentType: 'part_time', revision: 1 }],
  sheets: [
    {
      id: 'worker_2026-10',
      userId: 'worker',
      employeeName: worker.displayName,
      month: '2026-10',
      revision: 2,
      days: {
        '2026-10-20': entry({ lateMinutes: 15 }),
        '2026-10-21': entry({ status: 'half', halfLeave: 'paid', note: 'Khám bệnh' }),
        '2026-10-25': entry({ overtimeHours: 2 })
      }
    },
    {
      id: 'boss_2026-10',
      userId: 'boss',
      employeeName: admin.displayName,
      month: '2026-10',
      revision: 1,
      days: { '2026-10-20': entry({}), '2026-10-21': entry({ status: 'unpaid_leave' }) }
    }
  ],
  calendar: { year: 2026, overrides: {}, revision: 0 }
});

const nodes = tree =>
  !tree || typeof tree !== 'object'
    ? []
    : [
        tree,
        ...(Array.isArray(tree.props?.children) ? tree.props.children.flat(Infinity) : [tree.props?.children]).flatMap(
          nodes
        )
      ];
const text = node =>
  typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Array.isArray(node)
      ? node.map(text).join('')
      : node?.props
        ? text(node.props.children)
        : '';

/** Shallow-render a component with named useState slots, so a test can set state by variable name. */
function screen(file, name, props, initial = {}, stubs = {}) {
  const ast = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
  const names = [];
  const visit = node => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isArrayBindingPattern(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(ast) === 'useState'
    )
      names.push(node.name.elements[0].getText(ast));
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const state = new Map(Object.entries(initial));
  let cursor = 0,
    refCursor = 0;
  const refs = [];
  const react = {
    ...React,
    useEffect() {},
    useRef(value) {
      const index = refCursor++;
      return (refs[index] ||= { current: value });
    },
    useState(value) {
      const key = names[cursor++];
      if (!state.has(key)) state.set(key, typeof value === 'function' ? value() : value);
      return [state.get(key), next => state.set(key, typeof next === 'function' ? next(state.get(key)) : next)];
    }
  };
  const Component = loader({ react, '@/infrastructure/firebase/erpDataGateway': {}, ...stubs })(file)[name];
  return {
    state,
    render: () => {
      cursor = 0;
      refCursor = 0;
      return Component(props);
    }
  };
}

test('roster counts the day, hides inactive staff without records and maps MISA symbols', () => {
  const data = workspace();
  assert.deepEqual(
    roster.attendanceEmployees(data).map(person => person.uid),
    ['boss', 'worker', 'parttime']
  );
  const day = roster.dayRoster(data, '2026-10-21');
  assert.deepEqual(roster.dayCounts(day), {
    total: 3,
    present: 0,
    half: 1,
    paidLeave: 0,
    unpaidLeave: 1,
    late: 0,
    unrecorded: 1
  });
  assert.equal(roster.entrySymbol(entry({})), 'X');
  assert.equal(roster.entrySymbol(entry({ lateMinutes: 5 })), 'T');
  assert.equal(roster.entrySymbol(entry({ status: 'half', halfLeave: 'unpaid' })), '½');
  assert.equal(roster.entrySymbol(entry({ status: 'paid_leave' })), 'P');
  assert.equal(roster.entrySymbol(entry({ status: 'unpaid_leave' })), 'V');
  assert.equal(roster.entrySymbol(entry({ employmentType: 'part_time', hours: 4.5 })), '4,5');
  assert.equal(roster.chipLabel(entry({ lateMinutes: 15 })), 'Trễ 15p');
  assert.equal(
    roster.entryDescription(entry({ status: 'half', halfLeave: 'paid', note: 'Khám' })),
    'Nửa buổi · nghỉ có phép · Khám'
  );
});

test('Admin/Kế toán see Chấm công and Bảng công; other roles only see their Bảng công', () => {
  const tabs = (currentUser, data) => {
    const ui = screen(
      'src/features/attendance/pages/AttendancePage.tsx',
      'AttendancePage',
      { currentUser },
      { loading: false, month: '2026-10', loadedMonth: '2026-10', workspace: data }
    );
    const tree = ui.render();
    return {
      tabs: nodes(tree)
        .find(node => node.props?.['aria-label'] === 'Phân hệ Chấm công')
        .props.children.map(tab => tab.props.children),
      tree
    };
  };
  const recorder = tabs(admin, workspace());
  assert.deepEqual(recorder.tabs, ['Chấm công', 'Bảng công']);
  assert.ok(nodes(recorder.tree).some(node => node.type?.name === 'AttendanceRecorderBoard'));
  assert.ok(nodes(recorder.tree).some(node => node.type === 'button' && node.props.children === 'Thiết lập NV'));
  const staff = tabs(sale, { ...workspace(), canRecord: false });
  assert.deepEqual(staff.tabs, ['Bảng công']);
  assert.ok(nodes(staff.tree).some(node => node.type?.name === 'AttendanceTimesheetTable'));
  assert.ok(!nodes(staff.tree).some(node => node.type?.name === 'AttendanceRecorderBoard'));
  assert.ok(!nodes(staff.tree).some(node => node.type === 'button' && node.props.children === 'Thiết lập NV'));
  const forged = tabs(sale, workspace());
  assert.deepEqual(forged.tabs, ['Bảng công'], 'the UI also checks the role, not only the server flag');
});

test('the board names notable staff in day cells, opens an entry from the day list and guards days off', () => {
  const opened = [];
  const marked = [];
  const props = {
    workspace: workspace(),
    month: '2026-10',
    today: '2026-10-27',
    selectedDate: '2026-10-21',
    search: '',
    busy: false,
    onSelectDate() {},
    onOpenEntry: (userId, date) => opened.push([userId, date]),
    onMarkPresent: date => marked.push(date),
    onEditDayOff() {}
  };
  const Board = loader()('src/features/attendance/components/AttendanceRecorderBoard.tsx').AttendanceRecorderBoard;
  let tree = Board(props);
  const chips = nodes(tree)
    .filter(node => node.type === 'button' && String(node.props.className).includes('attendance-chip'))
    .map(node => text(node));
  assert.ok(chips.includes('Nhân viên A · Trễ 15p'));
  assert.ok(chips.includes('Giám đốc · Nghỉ không phép'));
  const markButton = () =>
    nodes(tree).find(node => node.type === 'button' && node.props.children === 'Chấm cả ngày đi làm');
  assert.equal(markButton().props.disabled, true, 'nobody Full-time is left unrecorded except none on 21/10');
  tree = Board({ ...props, selectedDate: '2026-10-22' });
  assert.equal(markButton().props.disabled, false);
  markButton().props.onClick();
  assert.deepEqual(marked, ['2026-10-22']);
  nodes(tree)
    .find(node => node.type === 'button' && node.props.title === 'Chưa chấm')
    .props.onClick();
  assert.deepEqual(opened, [['boss', '2026-10-22']]);
  tree = Board({ ...props, selectedDate: '2026-10-25' });
  assert.equal(markButton().props.disabled, true, 'Sunday is a day off');
  tree = Board({ ...props, selectedDate: '2026-10-30' });
  assert.equal(markButton().props.disabled, true, 'future days cannot be recorded');
  assert.ok(
    nodes(tree).every(node => !(node.type === 'button' && node.props.title === 'Chưa chấm' && !node.props.disabled))
  );
});

test('the timesheet shows one row per employee with symbols, day-off columns and monthly totals', () => {
  const Table = loader({
    '@/components/DataTablePagination': { DataTablePagination: () => null },
    '@/hooks/useDataTablePagination': { useDataTablePagination: items => ({ rows: items, paginationProps: {} }) }
  })('src/features/attendance/components/AttendanceTimesheetTable.tsx').AttendanceTimesheetTable;
  const tree = Table({ workspace: workspace(), month: '2026-10', search: 'nhân viên' });
  const rows = nodes(tree).filter(node => node.type === 'tr' && node.key);
  assert.equal(rows.length, 1);
  const cells = rows[0].props.children
    .flat(Infinity)
    .map(cell => ({ text: text(cell), className: cell.props.className }));
  assert.equal(cells[0].text, 'Nhân viên A');
  assert.equal(cells[20].text, 'T');
  assert.equal(cells[21].text, '½');
  assert.equal(cells[25].text, 'X');
  assert.match(cells[25].className, /is-off/, '25/10/2026 is a Sunday');
  assert.deepEqual(
    cells.slice(-6).map(cell => cell.text),
    ['2,5', '15', '0,5', '0', '2', '1']
  );
});

test('the entry dialog offers only work on a day off, hides OT for part-time and saves validated input', async () => {
  const saved = [];
  const props = {
    date: '2026-10-25',
    dayInfo: { off: true, name: 'Chủ nhật' },
    employeeName: 'Nhân viên A',
    employmentType: 'full_time',
    onClose() {},
    onSave: async input => saved.push(input),
    onClear: async () => {}
  };
  const file = 'src/features/attendance/components/AttendanceEntryDialog.tsx';
  const stubs = { '@/shared/feedback/deleteConfirmation': { confirmDelete: async () => true } };
  let ui = screen(file, 'AttendanceEntryDialog', props, {}, stubs);
  let tree = ui.render();
  const options = () =>
    nodes(tree)
      .filter(node => node.type === 'input' && node.props.type === 'radio')
      .map(node => node.props.value);
  assert.deepEqual(options(), ['present', 'half']);
  ui.state.set('overtime', '1.5');
  tree = ui.render();
  await nodes(tree)
    .find(node => node.type === 'form')
    .props.onSubmit({ preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saved, [{ status: 'present', hours: 0, lateMinutes: 0, overtimeHours: 1.5, note: '' }]);

  ui = screen(
    file,
    'AttendanceEntryDialog',
    { ...props, date: '2026-10-20', dayInfo: { off: false, name: '' }, employmentType: 'part_time' },
    {},
    stubs
  );
  tree = ui.render();
  assert.deepEqual(options(), ['present', 'paid_leave', 'unpaid_leave']);
  const labels = nodes(tree)
    .filter(node => node.type === 'label')
    .map(node => text(node));
  assert.ok(labels.some(label => label.startsWith('Giờ làm')));
  assert.ok(!labels.some(label => label.startsWith('Làm thêm OT')));
});

test('a failed save keeps the dialog open and retries with the same request ID; success follows the server', async () => {
  const calls = [];
  const toasts = [];
  let fail = true;
  const ui = screen(
    'src/features/attendance/pages/AttendancePage.tsx',
    'AttendancePage',
    { currentUser: admin },
    {
      loading: false,
      month: '2026-10',
      loadedMonth: '2026-10',
      workspace: workspace(),
      editing: { userId: 'worker', date: '2026-10-22' }
    },
    {
      '../api/attendanceService': {
        loadAttendance: async () => workspace(),
        mutateAttendance: async body => {
          calls.push(body);
          if (fail) throw new Error('Mất kết nối');
          return { success: true, sheet: { ...workspace().sheets[0], revision: 3 } };
        }
      },
      '@/shared/feedback/mutationFeedback': { showSuccessToast: message => toasts.push(message), showErrorToast() {} }
    }
  );
  const dialog = () => nodes(ui.render()).find(node => node.type?.name === 'AttendanceEntryDialog');
  const input = { status: 'present', hours: 0, lateMinutes: 0, overtimeHours: 0, note: '' };
  await assert.rejects(dialog().props.onSave(input), /Mất kết nối/);
  assert.deepEqual(toasts, []);
  assert.ok(ui.state.get('editing'), 'the dialog stays open after a failure');
  fail = false;
  await dialog().props.onSave(input);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].requestId, calls[1].requestId);
  assert.equal(calls[1].action, 'save_day');
  assert.equal(calls[1].expectedRevision, 2);
  assert.equal(ui.state.get('editing'), null);
  assert.deepEqual(toasts, ['Đã lưu chấm công.']);
  assert.equal(ui.state.get('workspace').sheets.find(sheet => sheet.userId === 'worker').revision, 3);
});
