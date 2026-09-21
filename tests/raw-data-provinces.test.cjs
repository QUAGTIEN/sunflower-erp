const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = readFileSync(join(__dirname, '..', 'src', 'features', 'crm', 'model', 'rawDataProvinces.ts'), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const model = {};
new Function('exports', outputText)(model);

test('province chart counts every visible record, including unknown and grouped provinces', () => {
  const candidates = [
    ...Array.from({ length: 3 }, () => ({ province: 'Hà Nội' })),
    ...['Hải Phòng', 'Hải Dương', 'Bắc Ninh', 'Hưng Yên', 'Thanh Hóa', 'Đà Nẵng', 'Nghệ An'].map(province => ({ province })),
    { province: '  ' }
  ];
  const rows = model.countRawDataByProvince(candidates);
  assert.equal(rows[0].label, 'Hà Nội');
  assert.equal(rows[0].count, 3);
  assert.deepEqual(rows.slice(-2), [{ label: 'Tỉnh khác', count: 2 }, { label: 'Chưa xác định', count: 1 }]);
  assert.equal(rows.reduce((sum, row) => sum + row.count, 0), candidates.length);
});

test('empty and unknown-only data remain legible', () => {
  assert.deepEqual(model.countRawDataByProvince([]), []);
  assert.deepEqual(model.countRawDataByProvince([{ province: '' }]), [{ label: 'Chưa xác định', count: 1 }]);
});
