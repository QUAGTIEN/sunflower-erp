import { createHash } from 'node:crypto';
import { AdminApiError } from './adminUsers.js';
import { getFirebaseAdminServices } from './firebaseAdmin.js';
import { warehouseDate, warehouseQuantity, roundStock, type WarehouseActor } from '../src/features/inventory/model/warehouse.js';
import { itemIdentity } from '../src/features/production/model/productionOrder.js';
import { canUseLedger, FINANCE_KINDS, lineAmounts, lineDue, money, fundAvailable, type DebtSide, type DebtDocument, type DebtLine, type MoneyFund, type LedgerEntry, type FinanceSource, type FinanceSourceState } from '../src/features/accounting/model/accountingLedger.js';

type Data = Record<string, unknown>;
const fail = (status: number, message: string): never => { throw new AdminApiError(status, message, 'accounting/error'); };
const id = (value: unknown): string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,180}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value) ? value : fail(400, 'Định danh chứng từ không hợp lệ.');
const text = (value: unknown, max = 1000): string => typeof value === 'string' && value.trim().length <= max ? value.trim() : fail(400, `Nội dung không hợp lệ, tối đa ${max} ký tự.`);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rows = (value: unknown): Data[] => Array.isArray(value) ? value as Data[] : [];
const date = (value: unknown) => { const s = text(value, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(`${s}T00:00:00Z`)) || new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) fail(400, 'Ngày không hợp lệ.'); return s; };

function sourceKind(v: Data, side: DebtSide) {
  if (v.reversedBy || v.kind === 'reversal') return false;
  if (side === 'ar') return v.warehouseId === 'finished_main' && v.kind === 'delivery';
  return v.kind === 'purchase_receipt' || v.warehouseId === 'finished_main' && !!v.purchaseId && (v.kind === 'delivery' || v.kind === 'failed_return' && v.returnToSupplier !== true);
}
function sourceView(v: Data, side: DebtSide, po: Data, purchase: Data, partner: Data): FinanceSource {
  return { id: String(v.id), code: String(v.code), side, partnerId: String(side === 'ar' ? po.customerId || '' : purchase.supplierId || ''), partnerName: String(side === 'ar' ? partner.companyName || po.customerName || '' : partner.supplierName || purchase.supplierName || ''),
    poId: String(side === 'ar' ? v.poId || '' : purchase.linkedPoId || ''), purchaseId: side === 'ap' ? String(purchase.id || '') : '',
    lines: rows(v.lines).map(line => {
      const original = side === 'ar' ? rows(po.items).find((row, index) => itemIdentity(row, index) === line.poItemId) : rows(purchase.items)[Number(String(line.sourceLine).replace('line-', ''))];
      return { id: String(line.sourceLine), catalogItemId: String(line.catalogItemId), code: String(line.code), name: String(line.name), unit: String(line.unit), quantity: Number(line.quantity), poItemId: String(line.poItemId || original?.poItemId || ''), suggestedPrice: Number(original?.unitPrice || 0) };
    }) };
}

/** One financial writer. Physical goods events remain quantity-only. */
export async function manageAccountingLedger(actor: WarehouseActor, body: Data) {
  if (!canUseLedger(actor)) fail(403, 'Chỉ Admin và Kế toán có quyền Kế toán được sử dụng sổ tiền.');
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 150000) fail(400, 'Yêu cầu quá lớn, tối đa 50 dòng.');
  const { firestore } = getFirebaseAdminServices();
  return firestore.runTransaction(async tx => {
    const read = async (name: string, key: string): Promise<Data | undefined> => { const doc = await tx.get(firestore.collection(name).doc(key)); return doc.exists ? { ...doc.data(), id: doc.id } : undefined; };
    const list = async (name: string) => (await tx.get(firestore.collection(name))).docs.map(doc => ({ ...doc.data(), id: doc.id }) as Data);
    const control = await read('finance_control', 'main'), revision = Number(control?.revision || 0);
    if (body.action === 'load') {
      const names = ['finance_documents', 'finance_funds', 'finance_entries', 'finance_source_state', 'finance_periods', 'invoices', 'warehouse_vouchers', 'pos', 'purchase_orders', 'customers', 'suppliers', 'item_catalog'];
      const data = await Promise.all(names.map(list));
      const [documents, funds, entries, sourceStates, periods, invoices, vouchers, pos, purchases, customers, suppliers, items] = data;
      const sources: FinanceSource[] = [];
      for (const v of vouchers) for (const side of ['ar', 'ap'] as const) {
        if (!sourceKind(v, side)) continue;
        const purchase = purchases.find(p => p.id === (v.purchaseId || (v.sourceType === 'purchase' ? v.sourceId : ''))) || {};
        const po = pos.find(p => p.id === v.poId) || {};
        const partner = (side === 'ar' ? customers : suppliers).find(p => p.id === (side === 'ar' ? po.customerId : purchase.supplierId));
        if (!partner || partner.deleted || po.deleted || purchase.deleted) continue;
        const legacy = invoices.some(inv => inv.ledgerVersion !== 1 && !inv.deleted && inv.type === (side === 'ar' ? 'receivable' : 'payable') && (side === 'ar' ? inv.poId === po.id : inv.poId === purchase.id || inv.purchaseOrderId === purchase.id));
        if (!legacy) sources.push(sourceView(v, side, po, purchase, partner));
      }
      return { success: true, revision, documents, funds, entries, sourceStates, periods, sources,
        partners: [...customers.filter(p => !p.deleted || documents.some(d => d.side === 'ar' && d.partnerId === p.id && !d.voided) || funds.some(d => d.side === 'ar' && d.partnerId === p.id && !d.voided)).map(p => ({ id: p.id, name: `${p.companyName || p.id}${p.deleted ? ' (ngừng sử dụng)' : ''}`, side: 'ar' })), ...suppliers.filter(p => !p.deleted || documents.some(d => d.side === 'ap' && d.partnerId === p.id && !d.voided) || funds.some(d => d.side === 'ap' && d.partnerId === p.id && !d.voided)).map(p => ({ id: p.id, name: `${p.supplierName || p.id}${p.deleted ? ' (ngừng sử dụng)' : ''}`, side: 'ap' }))],
        legacy: invoices.filter(inv => inv.ledgerVersion !== 1), items: items.filter(i => i.active).map(i => ({ id: i.id, code: i.code, name: i.name, baseUnit: i.baseUnit })),
        openingOrders: [...pos.filter(p => !p.deleted).map(p => ({ id: p.id, code: p.poCode, side: 'ar', partnerId: p.customerId, poId: p.id, purchaseId: '', lines: rows(p.items).map((r, i) => ({ id: itemIdentity(r, i), name: r.productName || '' })) })), ...purchases.filter(p => !p.deleted).map(p => ({ id: p.id, code: p.purCode, side: 'ap', partnerId: p.supplierId, poId: p.linkedPoId || '', purchaseId: p.id, lines: rows(p.items).map((r, i) => ({ id: `line-${i}`, name: r.productName || r.materialName || '' })) }))],
        returns: vouchers.filter(v => !v.reversedBy && v.kind === 'customer_return').flatMap(v => [
          { id: v.id, code: v.code, side: 'ar', dispatchId: v.dispatchId, lines: rows(v.lines).map(l => ({ sourceLine: l.sourceLine, quantity: l.quantity, catalogItemId: l.catalogItemId })) },
          ...(v.returnToSupplier === true ? [{ id: v.id, code: v.code, side: 'ap', dispatchId: v.dispatchId, lines: rows(v.lines).map(l => ({ sourceLine: l.sourceLine, quantity: l.quantity, catalogItemId: l.catalogItemId })) }] : [])]) };
    }
    const action = String(body.action);
    if (!['post', 'reverse', 'period'].includes(action)) fail(400, 'Thao tác kế toán không hợp lệ.');
    if (action !== 'post' && actor.role !== 'admin') fail(403, 'Chỉ Admin được đảo phiếu và khóa/mở kỳ.');
    const requestId = id(body.requestId), digest = hash(body), previousRequest = await read('finance_requests', requestId);
    if (previousRequest) { if (previousRequest.actorId !== actor.uid || previousRequest.digest !== digest) fail(409, 'Mã yêu cầu đã dùng cho nội dung/người khác.'); return previousRequest.result; }
    if (body.expectedRevision !== revision) fail(409, 'Sổ kế toán vừa thay đổi. Tải lại số liệu trước khi ghi.');
    const today = warehouseDate(), now = new Date().toISOString();
    if (body.postingDate !== today) fail(400, 'Ngày ghi sổ phải là ngày hiện tại tại Việt Nam.');
    const note = text(body.note); if (!note) fail(400, 'Nhập nội dung/lý do.');
    const writes: (() => void)[] = [];
    const set = (name: string, key: string, value: object) => writes.push(() => tx.set(firestore.collection(name).doc(key), value));
    const update = (name: string, key: string, value: object) => writes.push(() => tx.update(firestore.collection(name).doc(key), value));
    const finish = (result: Data, detail: Data) => {
      set('finance_control', 'main', { revision: revision + 1 });
      set('finance_requests', requestId, { digest, actorId: actor.uid, result, createdAt: now });
      set('audit_events', `finance_${requestId}`, { actorId: actor.uid, actorName: actor.displayName, actorRole: actor.role, category: 'business', module: 'accounting', action: `finance_${action}`, summary: note, detail, occurredAt: now, createdAt: now, sessionId: 'accounting-api' });
      writes.forEach(write => write()); return result;
    };
    const periods = await list('finance_periods');
    if (action === 'period') {
      const month = text(body.month, 7);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > today.slice(0, 7) || typeof body.locked !== 'boolean') fail(400, 'Chọn kỳ tháng hiện tại hoặc trước đó và trạng thái khóa hợp lệ.');
      set('finance_periods', month, { locked: body.locked, updatedAt: now, actorId: actor.uid, note });
      return finish({ success: true }, { month, locked: body.locked });
    }
    if (periods.some(p => p.id === today.slice(0, 7) && p.locked)) fail(409, 'Kỳ hiện tại đã khóa. Admin cần mở kỳ trước khi ghi.');
    const original = action === 'reverse' ? await read('finance_entries', id(body.entryId)) as unknown as LedgerEntry | undefined : undefined;
    if (action === 'reverse' && (!original || original.kind === 'reversal' || original.reversedBy)) fail(409, 'Phiếu không tồn tại hoặc đã đảo.');
    if (original && periods.some(p => p.id === original.postingDate.slice(0, 7) && p.locked)) fail(409, 'Kỳ của phiếu gốc đã khóa. Admin cần mở kỳ trước khi đảo.');
    const kind = original?.kind || String(body.kind);
    if (!Object.hasOwn(FINANCE_KINDS, kind) || kind === 'reversal') fail(400, 'Loại chứng từ không hợp lệ.');
    const side = original?.side || body.side; if (!['ar', 'ap'].includes(String(side))) fail(400, 'Chọn công nợ khách hàng hoặc nhà cung cấp.');
    const debtSide = side as DebtSide, partnerId = original?.partnerId || id(body.partnerId);
    const partner = await read(debtSide === 'ar' ? 'customers' : 'suppliers', partnerId);
    if (!partner && !original || partner?.deleted && !original && ['charge', 'opening', 'opening_advance'].includes(kind)) fail(400, 'Đối tác không tồn tại/đã ngừng dùng.');
    const partnerName = original?.partnerName || String(partner![debtSide === 'ar' ? 'companyName' : 'supplierName'] || partnerId);
    if (partner && partner.financeLinked !== true) update(debtSide === 'ar' ? 'customers' : 'suppliers', partnerId, { financeLinked: true });
    const reference = original?.reference || text(body.reference, 200); if (!reference) fail(400, 'Nhập số chứng từ/tham chiếu thực tế.');
    const docs = new Map((await list('finance_documents')).map(d => [String(d.id), d as unknown as DebtDocument]));
    const funds = new Map((await list('finance_funds')).map(d => [String(d.id), d as unknown as MoneyFund]));
    const changedDocs = new Set<string>(), changedFunds = new Set<string>(), sourceStates = new Map<string, FinanceSourceState>();
    const reserve = async (voucherId: string, lineKey: string, amount: number, cap: number) => {
      const stateId = `${debtSide}_${voucherId}`;
      if (!sourceStates.has(stateId)) sourceStates.set(stateId, await read('finance_source_state', stateId) as unknown as FinanceSourceState || { id: stateId, lines: {} });
      const state = sourceStates.get(stateId)!; state.lines[lineKey] ||= { used: 0 };
      state.lines[lineKey].used = roundStock(state.lines[lineKey].used + amount);
      if (state.lines[lineKey].used < 0 || state.lines[lineKey].used > cap) fail(409, 'Số lượng đã lập công nợ/điều chỉnh vượt phiếu hàng hoặc cần đảo chứng từ phụ thuộc trước.');
    };
    const docLine = (documentId: string, lineId: string) => {
      const doc = docs.get(documentId), line = doc?.lines.find(row => row.id === lineId);
      if (!doc || doc.voided || !line || doc.side !== debtSide || doc.partnerId !== partnerId) fail(400, 'Chọn dòng chứng từ đang hiệu lực của đúng đối tác/loại công nợ.');
      changedDocs.add(documentId); return line!;
    };
    const checkLines = (value: unknown) => {
      if (!Array.isArray(value) || !value.length || value.length > 50 || value.some(r => !r || typeof r !== 'object' || Array.isArray(r))) fail(400, 'Chứng từ cần 1–50 dòng hợp lệ.');
      return value as Data[];
    };
    const counter = await read('finance_counters', today), sequence = Number(counter?.sequence || 0) + 1;
    const entry: LedgerEntry = { id: requestId, code: `KT-${today.replaceAll('-', '')}-${String(sequence).padStart(4, '0')}`, kind: original ? 'reversal' : kind as LedgerEntry['kind'], ...(original ? { originalKind: original.kind, reversalOf: original.id } : {}), side: debtSide, partnerId, partnerName, postingDate: today, createdAt: now, actorName: actor.displayName, note, reference, amount: 0, cashDelta: 0, fundId: '', allocations: [], adjustments: [], documentId: '' };
    const sign = original ? -1 : 1;
    if (!original && kind !== 'allocation') {
      const key = hash([kind, debtSide, partnerId, reference.normalize('NFKC').toLocaleUpperCase('vi').trim()]);
      if (await read('finance_reference_keys', key)) fail(409, 'Tham chiếu đã được ghi cho đối tác này. Mở chứng từ cũ để kiểm tra.');
      set('finance_reference_keys', key, { entryId: requestId });
    }
    if (kind === 'charge' || kind === 'opening') {
      entry.documentId = original?.documentId || requestId;
      if (original) {
        const doc = docs.get(entry.documentId); if (!doc || doc.voided || doc.lines.some(l => l.settled || l.adjustment || l.adjustmentCount || l.returnedQuantity)) fail(409, 'Cần đảo phân bổ/điều chỉnh trước khi đảo công nợ.');
        doc!.voided = true; changedDocs.add(doc!.id); entry.amount = -original.amount;
        if (kind === 'charge') for (const line of doc!.lines) await reserve(line.sourceVoucherId, line.sourceLine, -line.quantity, Infinity);
      } else {
        const lines: DebtLine[] = [], inputs = checkLines(body.lines), legacy = kind === 'charge' ? await list('invoices') : [];
        if (new Set(inputs.map(r => kind === 'charge' ? `${r.sourceVoucherId}:${r.sourceLine}` : String(r.lineId))).size !== inputs.length) fail(400, 'Chứng từ bị trùng dòng.');
        const dueDate = date(body.dueDate), openingAsOf = kind === 'opening' ? date(body.openingAsOf) : '';
        if (openingAsOf > today) fail(400, 'Ngày đối chiếu đầu kỳ không được ở tương lai.');
        for (const [index, row] of inputs.entries()) {
          if (kind === 'charge') {
            const v = await read('warehouse_vouchers', id(row.sourceVoucherId)); if (!v || !sourceKind(v, debtSide)) fail(400, 'Chọn phiếu giao/nhận thực tế đang hiệu lực.');
            const purchaseId = String(v!.purchaseId || (v!.sourceType === 'purchase' ? v!.sourceId : '') || '');
            const purchase = purchaseId ? await read('purchase_orders', id(purchaseId)) : undefined;
            const poId = String(v!.poId || purchase?.linkedPoId || ''), po = poId ? await read('pos', id(poId)) : undefined;
            if (debtSide === 'ar' ? !po || po.customerId !== partnerId || po.deleted : !purchase || purchase.supplierId !== partnerId || purchase.deleted) fail(400, 'Phiếu hàng không thuộc đúng đối tác.');
            if (legacy.some(inv => inv.ledgerVersion !== 1 && !inv.deleted && inv.type === (debtSide === 'ar' ? 'receivable' : 'payable') && (debtSide === 'ar' ? inv.poId === poId : inv.poId === purchaseId || inv.purchaseOrderId === purchaseId))) fail(409, 'Nguồn đã có hóa đơn theo luồng cũ. Cần đối soát, không lập lại công nợ mới.');
            const sourceLine = id(row.sourceLine), physical = rows(v!.lines).find(l => l.sourceLine === sourceLine); if (!physical) fail(400, 'Dòng phiếu hàng không tồn tại.');
            const quantity = warehouseQuantity(row.quantity); await reserve(String(v!.id), sourceLine, quantity, Number(physical!.quantity));
            const amounts = lineAmounts(quantity, row.unitPrice, row.discount, row.taxRate);
            lines.push({ id: `line-${index}`, sourceVoucherId: String(v!.id), sourceCode: String(v!.code), orderCode: String(debtSide === 'ar' ? po?.poCode || poId : purchase?.purCode || purchaseId), sourceLine, poId, purchaseId: debtSide === 'ap' ? purchaseId : '', poItemId: String(physical!.poItemId || ''), catalogItemId: String(physical!.catalogItemId), code: String(physical!.code), name: String(physical!.name), unit: String(physical!.unit), quantity, unitPrice: Number(row.unitPrice), discount: Number(row.discount), taxRate: Number(row.taxRate), ...amounts, adjustment: 0, adjustmentCount: 0, settled: 0, returnedQuantity: 0 });
          } else {
            const amount = money(row.amount, true), catalog = row.catalogItemId ? await read('item_catalog', id(row.catalogItemId)) : undefined;
            if (row.catalogItemId && (!catalog || !catalog.active)) fail(400, 'Chọn mã nội bộ đang hoạt động.');
            const purchaseId = row.purchaseId ? id(row.purchaseId) : '', poId = row.poId ? id(row.poId) : ''; let orderCode = '';
            if (debtSide === 'ap' && purchaseId) { const purchase = await read('purchase_orders', purchaseId); orderCode = String(purchase?.purCode || purchaseId); if (!purchase || purchase.supplierId !== partnerId || purchase.linkedPoId && purchase.linkedPoId !== poId) fail(400, 'Đơn mua đầu kỳ không thuộc đối tác/PO đã chọn.'); }
            if (debtSide === 'ar' && poId) { const po = await read('pos', poId); orderCode = String(po?.poCode || poId); if (!po || po.customerId !== partnerId) fail(400, 'PO đầu kỳ không thuộc khách hàng.'); }
            if (debtSide === 'ar' && purchaseId || debtSide === 'ap' && poId && !purchaseId) fail(400, 'Chọn đúng đơn bán/mua đầu kỳ.');
            lines.push({ id: `line-${index}`, sourceVoucherId: '', sourceCode: '', orderCode, sourceLine: '', poId, purchaseId, poItemId: '', catalogItemId: String(catalog?.id || ''), code: String(catalog?.code || ''), name: String(catalog?.name || 'Công nợ đầu kỳ chưa chi tiết mã'), unit: String(catalog?.baseUnit || ''), quantity: 0, unitPrice: 0, discount: 0, taxRate: 0, net: amount, tax: 0, gross: amount, adjustment: 0, adjustmentCount: 0, settled: 0, returnedQuantity: 0 });
          }
        }
        entry.amount = money(lines.reduce((n, l) => n + l.gross, 0));
        docs.set(requestId, { id: requestId, code: entry.code, kind, side: debtSide, partnerId, partnerName, reference, dueDate, openingAsOf, postingDate: today, lines, poIds: [...new Set(lines.map(l => l.poId).filter(Boolean))], voided: false }); changedDocs.add(requestId);
      }
    } else if (kind === 'payment' || kind === 'opening_advance') {
      entry.fundId = original?.fundId || requestId;
      if (original) { const fund = funds.get(entry.fundId); if (!fund || fund.voided || fund.used || fund.refunded) fail(409, 'Cần đảo phân bổ/hoàn tiền trước khi đảo khoản thu chi.'); fund!.voided = true; entry.amount = -original.amount; }
      else { if (!['cash', 'bank_transfer'].includes(String(body.method))) fail(400, 'Chọn tiền mặt hoặc chuyển khoản.'); entry.amount = money(body.amount, true); funds.set(requestId, { id: requestId, side: debtSide, partnerId, partnerName, amount: entry.amount, used: 0, refunded: 0, openingAsOf: kind === 'opening_advance' ? date(body.openingAsOf) : '', method: body.method as MoneyFund['method'], reference, postingDate: today, voided: false }); }
      if (funds.get(entry.fundId)!.openingAsOf > today) fail(400, 'Ngày đầu kỳ không được ở tương lai.');
      changedFunds.add(entry.fundId); entry.cashDelta = kind === 'opening_advance' ? 0 : entry.amount * (debtSide === 'ar' ? 1 : -1);
    } else if (kind === 'allocation' || kind === 'refund') {
      const fundId = original?.fundId || id(body.fundId), fund = funds.get(fundId);
      if (!fund || fund.voided || fund.side !== debtSide || fund.partnerId !== partnerId) fail(400, 'Chọn khoản tiền đang hiệu lực của đúng đối tác.');
      entry.fundId = fundId; changedFunds.add(fundId);
      if (kind === 'refund') { entry.amount = money(original ? original.amount : body.amount, true) * sign; fund!.refunded += entry.amount; entry.cashDelta = entry.amount * (debtSide === 'ar' ? -1 : 1); }
      else {
        const inputs = original ? original.allocations : checkLines(body.allocations);
        if (new Set(inputs.map(a => `${a.documentId}:${a.lineId}`)).size !== inputs.length) fail(400, 'Phân bổ bị trùng dòng.');
        for (const a of inputs) { const documentId = id(a.documentId), lineId = id(a.lineId), amount = money(a.amount, true), line = docLine(documentId, lineId); line.settled += sign * amount; entry.allocations.push({ documentId, lineId, amount }); }
        entry.amount = money(entry.allocations.reduce((n, a) => n + a.amount, 0), true) * sign; fund!.used += entry.amount;
      }
      if (fund!.used < 0 || fund!.refunded < 0 || fundAvailable(fund!) < 0) fail(409, 'Vượt tiền chưa phân bổ hoặc còn phiếu phụ thuộc.');
    } else if (kind === 'adjustment') {
      const inputs = original ? original.adjustments : checkLines(body.adjustments);
      if (new Set(inputs.map(a => `${a.documentId}:${a.lineId}`)).size !== inputs.length) fail(400, 'Điều chỉnh bị trùng dòng.');
      for (const a of inputs) {
        const documentId = id(a.documentId), lineId = id(a.lineId), line = docLine(documentId, lineId);
        const delta = original ? Number(a.amount) : money(a.amount, true) * (body.direction === 'decrease' ? -1 : body.direction === 'increase' ? 1 : fail(400, 'Chọn tăng hoặc giảm nợ.'));
        const returnVoucherId = String(a.returnVoucherId || ''), returnLine = String(a.returnLine || ''); let quantity = 0;
        if (returnVoucherId) {
          if (delta >= 0) fail(400, 'Hàng trả chỉ dùng điều chỉnh giảm.');
          const returned = await read('warehouse_vouchers', id(returnVoucherId)), physical = rows(returned?.lines).find(l => l.sourceLine === returnLine), delivery = line.sourceVoucherId ? await read('warehouse_vouchers', line.sourceVoucherId) : undefined;
          if (!returned || returned.reversedBy || returned.kind !== 'customer_return' || !physical || !delivery || returned.dispatchId !== delivery.dispatchId || physical.catalogItemId !== line.catalogItemId || physical.sourceLine !== line.sourceLine || debtSide === 'ap' && returned.returnToSupplier !== true) fail(400, 'Phiếu trả không khớp hàng đã ghi nợ hoặc không phải trả NCC.');
          quantity = warehouseQuantity(a.quantity); line.returnedQuantity = roundStock((line.returnedQuantity || 0) + quantity * sign); if (line.returnedQuantity < 0 || line.returnedQuantity > line.quantity) fail(409, 'Lượng trả vượt lượng trên dòng công nợ.'); await reserve(returnVoucherId, id(returnLine), quantity * sign, Number(physical!.quantity));
        }
        line.adjustmentCount = (line.adjustmentCount || 0) + sign; if (line.adjustmentCount < 0) fail(409, 'Trạng thái điều chỉnh cần đối soát.');
        line.adjustment += delta * sign; entry.amount += delta * sign; entry.adjustments.push({ documentId, lineId, amount: delta, returnVoucherId, returnLine, quantity });
      }
      if (!Number.isSafeInteger(entry.amount) || Math.abs(entry.amount) > 1e12) fail(400, 'Tổng điều chỉnh vượt giới hạn.');
    }
    for (const key of changedFunds) set('finance_funds', key, funds.get(key)!);
    for (const [key, state] of sourceStates) set('finance_source_state', key, state);
    const affectedPOs = new Set<string>();
    for (const key of changedDocs) {
      const doc = docs.get(key)!; doc.poIds.forEach(p => affectedPOs.add(p));
      if (doc.lines.some(l => !Number.isSafeInteger(l.gross + l.adjustment) || l.gross + l.adjustment < 0 || l.gross + l.adjustment > 1e12 || l.settled < 0 || !Number.isSafeInteger(l.settled) || lineDue(l) < 0)) fail(409, 'Vượt số còn nợ. Cần đảo phân bổ liên quan trước khi giảm/đảo công nợ.');
      const amount = doc.voided ? 0 : money(doc.lines.reduce((n, l) => n + l.gross + l.adjustment, 0)), paidAmount = doc.voided ? 0 : money(doc.lines.reduce((n, l) => n + l.settled, 0));
      set('finance_documents', key, doc);
      if (doc.kind === 'charge') set('invoices', `acc_${key}`, { ledgerVersion: 1, financeDocumentId: key, invoiceCode: doc.reference, poId: doc.side === 'ar' && doc.poIds.length === 1 ? doc.poIds[0] : '', poCode: doc.code, purchaseOrderId: doc.side === 'ap' && new Set(doc.lines.map(l => l.purchaseId)).size === 1 ? doc.lines[0].purchaseId : '', customerId: doc.partnerId, companyName: doc.partnerName, type: doc.side === 'ar' ? 'receivable' : 'payable', amount, paidAmount, dueDate: doc.dueDate, status: doc.voided ? 'reversed' : paidAmount >= amount ? 'paid' : paidAmount ? 'partially_paid' : 'unpaid', createdAt: doc.postingDate, updatedAt: now, deleted: false });
    }
    for (const poId of affectedPOs) {
      const po = await read('pos', poId); if (!po) continue;
      const relevant = [...docs.values()].filter(d => d.side === 'ar' && !d.voided && d.poIds.includes(poId));
      const outstanding = relevant.reduce((sum, d) => sum + d.lines.filter(l => l.poId === poId).reduce((n, l) => n + lineDue(l), 0), 0);
      const deliveries = (await tx.get(firestore.collection('warehouse_vouchers').where('poId', '==', poId))).docs.map(d => ({ ...d.data(), id: d.id }) as Data).filter(v => sourceKind(v, 'ar'));
      let fullyBilled = deliveries.length > 0;
      for (const delivery of deliveries) {
        const key = `ar_${delivery.id}`, state = sourceStates.get(key) || await read('finance_source_state', key) as unknown as FinanceSourceState | undefined;
        if (rows(delivery.lines).some(l => (state?.lines[String(l.sourceLine)]?.used || 0) < Number(l.quantity))) fullyBilled = false;
      }
      const paid = fullyBilled && relevant.length > 0 && outstanding === 0;
      update('pos', poId, { accountingFlowVersion: 1, accountingRevision: revision + 1, accountingProgress: paid ? 'paid' : fullyBilled ? 'invoiced' : 'partial',
        ...(po.goodsFlowVersion === 1 && po.goodsDeliveryClosed === true ? { status: fullyBilled ? paid ? 'waiting_discount' : 'waiting_receivable' : 'waiting_invoice' } : {}) });
    }
    set('finance_entries', requestId, entry);
    if (original) update('finance_entries', original.id, { reversedBy: requestId });
    set('finance_counters', today, { sequence });
    return finish({ success: true, id: requestId, code: entry.code }, { entry });
  });
}
