const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loader(stubs = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(root, file); if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} }; cache.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const resolve = name => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name.endsWith('.css')) return {};
      if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
      const base = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(file), name);
      const candidate = [base.replace(/\.js$/, '.ts'), `${base}.ts`, `${base}.tsx`, base].find(file => fs.existsSync(file));
      if (!candidate) throw new Error(`Missing ${name}`); return load(candidate);
    };
    new Function('require', 'module', 'exports', code)(resolve, mod, mod.exports); return mod.exports;
  }
  return load;
}

const model=loader()('src/features/accounting/model/accountingReports.ts');
const ops=loader()('src/features/accounting/model/operationalReports.ts');
const access=loader()('src/features/accounting/model/reportAccess.ts');
const admin={uid:'a',displayName:'Admin',active:true,role:'admin',allowedPages:[]};
const accountant={...admin,role:'accountant',allowedPages:['accounting']};
const sale={...admin,uid:'sale1',role:'sale',allowedPages:['crm']};
const purchaser={...admin,role:'purchaser',allowedPages:['purchase']};
const line=(id,gross=100)=>({id,gross,adjustment:999,settled:999,code:'TP1',name:'Tem',quantity:100,unit:'cái',poId:'po',poItemId:'p1',purchaseId:'buy',sourceLine:'line-0',orderCode:'PO1'});
const doc=(id='d',extra={})=>({id,code:id,side:'ar',partnerId:'c',partnerName:'Khách',kind:'charge',postingDate:'2026-01-05',dueDate:'2026-02-10',lines:[line('l')],voided:true,...extra});
const entry=(id,kind,date,extra={})=>({id,code:id,kind,side:'ar',partnerId:'c',partnerName:'Khách',postingDate:date,createdAt:date+'T00:00:00Z',amount:0,cashDelta:0,documentId:'',fundId:'',allocations:[],adjustments:[],...extra});
const base=()=>({documents:[doc()],funds:[{id:'f',side:'ar',partnerId:'c',amount:200,used:0,refunded:0,voided:true,postingDate:'2026-01-06'}],entries:[entry('d','charge','2026-01-05',{documentId:'d',amount:100}),entry('f','payment','2026-01-06',{fundId:'f',amount:200,cashDelta:200}),entry('a','allocation','2026-01-07',{fundId:'f',amount:40,allocations:[{documentId:'d',lineId:'l',amount:40}]}),entry('r','reversal','2026-02-03',{originalKind:'allocation',fundId:'f',amount:-40,allocations:[{documentId:'d',lineId:'l',amount:40}],reversalOf:'a'}),entry('adjust','adjustment','2026-02-04',{amount:-10,adjustments:[{documentId:'d',lineId:'l',amount:-10}]}),entry('ra','reversal','2026-03-01',{originalKind:'adjustment',amount:10,adjustments:[{documentId:'d',lineId:'l',amount:-10}],reversalOf:'adjust'}),entry('rd','reversal','2026-03-02',{originalKind:'charge',documentId:'d',amount:-100})]});
const report=(b,from,to)=>model.buildDebtReport(b.documents,b.funds,b.entries,from,to);

test('January history survives mutable voided/settled and future reversals',()=>{
 const r=report(base(),'2026-01-01','2026-01-31'),p=r.partners[0];
 assert.deepEqual([p.opening,p.increase,p.decrease,p.allocated,p.closing,p.advanceClosing,p.cashIn,p.cashOut],[0,100,0,40,60,160,200,0]);
});
test('February reversal unallocates in its own month, adjustment reduces debt separately from cash',()=>{
 const p=report(base(),'2026-02-01','2026-02-28').partners[0];
 assert.deepEqual([p.opening,p.increase,p.decrease,p.allocated,p.closing,p.advanceOpening,p.advanceClosing,p.cashIn],[60,0,10,-40,90,160,200,0]);
});
test('March adjustment reversal and full charge reversal retain source snapshots',()=>{
 const p=report(base(),'2026-03-01','2026-03-31').partners[0];
 assert.deepEqual([p.opening,p.increase,p.decrease,p.allocated,p.closing],[90,10,100,0,0]);
});
test('entry ordering does not change period totals and arbitrary ranges include boundaries',()=>{
 const b=base();assert.deepEqual(report({...b,entries:[...b.entries].reverse()},'2026-01-05','2026-02-04').partners,report(b,'2026-01-05','2026-02-04').partners);
 assert.equal(report(b,'2026-01-07','2026-01-07').partners[0].opening,100);
 assert.equal(report(b,'2026-01-07','2026-01-07').partners[0].closing,60);
});
test('openingAsOf is evidence, never silently backdates an opening or creates cash',()=>{
 const b={documents:[doc('o',{kind:'opening',postingDate:'2026-02-01',openingAsOf:'2025-12-31'})],funds:[{id:'of',postingDate:'2026-02-01'}],entries:[entry('o','opening','2026-02-01',{documentId:'o',amount:100}),entry('of','opening_advance','2026-02-01',{fundId:'of',amount:50})]};
 assert.equal(report(b,'2026-01-01','2026-01-31').partners.length,0);
 const p=report(b,'2026-02-01','2026-02-28').partners[0];assert.deepEqual([p.opening,p.increase,p.cashIn,p.advanceClosing],[0,100,0,50]);
});
test('refund and its later reversal change advances and actual cash, not debt',()=>{
 const b=base();b.entries.push(entry('refund','refund','2026-01-08',{fundId:'f',amount:20,cashDelta:-20}),entry('rr','reversal','2026-02-09',{originalKind:'refund',fundId:'f',amount:-20,cashDelta:20}));
 let p=report(b,'2026-01-01','2026-01-31').partners[0];assert.deepEqual([p.closing,p.advanceClosing,p.cashIn,p.cashOut],[60,140,200,20]);
 p=report(b,'2026-02-01','2026-02-28').partners[0];assert.deepEqual([p.advanceOpening,p.advanceClosing,p.cashIn,p.cashOut],[140,200,20,0]);
});
test('AR and AP for same partner id never net together; advances never reduce reported debt',()=>{
 const b=base();b.documents.push(doc('ap',{side:'ap'}));b.entries.push(entry('ap','charge','2026-01-05',{side:'ap',documentId:'ap',amount:100}));
 const r=report(b,'2026-01-01','2026-01-31');assert.equal(r.partners.length,2);assert.equal(r.partners.find(p=>p.side==='ar').closing,60);assert.equal(r.partners.find(p=>p.side==='ap').closing,100);
});
test('allocation distributes to exact lines across documents and uses event amounts, not mutable totals',()=>{
 const d=doc('d',{lines:[line('l',30),line('l2',70)]});const b={documents:[d,doc('d2')],funds:[{id:'f',postingDate:'2026-01-01'}],entries:[entry('d','charge','2026-01-05',{documentId:'d'}),entry('d2','charge','2026-01-05',{documentId:'d2'}),entry('f','payment','2026-01-05',{fundId:'f',amount:100,cashDelta:100}),entry('a','allocation','2026-01-05',{fundId:'f',amount:60,allocations:[{documentId:'d',lineId:'l2',amount:40},{documentId:'d2',lineId:'l',amount:20}]})]};
 const r=report(b,'2026-01-01','2026-01-31');assert.deepEqual(r.lines.map(l=>l.closing),[30,30,80]);assert.equal(r.partners[0].advanceClosing,40);
});
test('invalid dates, reversed ranges, unsafe totals and missing event evidence fail explicitly',()=>{
 for(const [a,b]of [['2026-02-30','2026-03-01'],['bad','2026-01-01'],['2026-02-01','2026-01-01']])assert.throws(()=>report(base(),a,b));
 assert.throws(()=>report({...base(),entries:[]},'2026-01-01','2026-01-31'),/thiếu/i);
 const b=base();b.documents[0].lines=[line('l',Number.MAX_SAFE_INTEGER),line('l2',100)];assert.throws(()=>report(b,'2026-01-01','2026-01-31'),/an toàn/);
});
test('age buckets include exact due date, boundary days and unknown date',()=>{
 assert.deepEqual([-1,0,1,30,31,60,61,90,91,null].map(model.ageBucket),['Chưa đến hạn','Đến hạn','1–30 ngày','1–30 ngày','31–60 ngày','31–60 ngày','61–90 ngày','61–90 ngày','Trên 90 ngày','Chưa có hạn']);
 assert.equal(model.overdueDays('2026-01-31','2026-02-01'),1);assert.equal(model.overdueDays('2026-02-30','2026-03-01'),null);
});
test('lead windows, reconciliations and stock thresholds share explicit semantics including zero/unset',()=>{
 assert.equal(ops.deadlineAlert('2026-01-10','2026-01-07',3,1),'Sắp đến hạn');assert.equal(ops.deadlineAlert('2026-01-11','2026-01-07',3,1),'Chưa đến hạn');
 assert.equal(ops.deadlineAlert('2026-01-01','2026-01-07',3,0),'Hoàn tất');assert.equal(ops.deadlineAlert('','2026-01-07',3,null),'Cần đối soát');
 assert.equal(ops.goodsReportAlert({reconciliation:'stale'},'2026-01-01',3),'Cần đối soát');
 assert.deepEqual([ops.stockAlert(-1,null),ops.stockAlert(0,null),ops.stockAlert(0,0),ops.stockAlert(2,3),ops.stockAlert(3,3)],['Tồn âm','Chưa thiết lập ngưỡng','Trong ngưỡng','Cần nhập hàng','Trong ngưỡng']);
});
test('CSV has BOM, quoted newlines and quotes; neutralizes formulas but retains numeric negatives',()=>{
 const s=model.reportCsv(['Tên','Tiền'],[['=HYPERLINK("x")',-10],['\n@sum',20],['a,b\nc',null]]);
 assert.ok(s.startsWith('\uFEFF'));assert.ok(s.includes('"\'=HYPERLINK(""x"")"'));assert.ok(s.includes('"-10"'));assert.ok(s.includes('"a,b\nc"'));
});
test('current partner sums and legacy debt separate projections, soft deletes and advances',()=>{
 const d=doc('d',{voided:false,lines:[{...line('l'),gross:100,adjustment:-20,settled:30}]});
 assert.deepEqual(model.currentPartnerBalances([d,doc('void')],[{id:'f',side:'ar',partnerId:'c',amount:90,used:40,refunded:10,voided:false}]),[{side:'ar',partnerId:'c',debt:50,advance:40}]);
 const old=loader()('src/features/accounting/model/partnerDebt.ts').legacyPartnerDebt([{customerId:'c',type:'receivable',amount:100,paidAmount:20},{customerId:'c',type:'receivable',amount:999,ledgerVersion:1},{customerId:'c',type:'receivable',amount:999,deleted:true}]);assert.deepEqual(old,[{side:'ar',partnerId:'c',debt:80,count:1}]);
});

function reportBackend(extra={}) {
 const po={id:'po',poCode:'PO',customerId:'c',items:[{itemId:'p1',quantity:10,productName:'Tem',unit:'hộp',deliveryDate:'2026-01-10'}],status:'waiting_delivery'};
 const purchase={id:'buy',purCode:'PUR',supplierId:'s',linkedPoId:'po',sourcingType:'finished_good',expectedReceiveDate:'2026-01-11',items:[{quantity:10,unit:'hộp',productName:'Tem',poItemId:'p1'}],status:'ordered'};
 const store=new Map(Object.entries({'pos/po':po,'purchase_orders/buy':purchase,'customers/c':{companyName:'Khách',assignedSaleId:'sale1'},'customers/hidden':{companyName:'Hidden',assignedSaleId:'someone'},'suppliers/s':{supplierName:'NCC'},'item_catalog/tp':{id:'tp',active:true,kind:'finished_good',code:'TP1',name:'Tem',baseUnit:'cái'},...extra}));
 const firestore={collection:name=>({name}),runTransaction:async callback=>callback({get:async ref=>({docs:[...store].filter(([k])=>k.startsWith(ref.name+'/')).map(([k,v])=>({id:k.split('/')[1],data:()=>structuredClone(v)}))}),set:()=>assert.fail('report must not write'),update:()=>assert.fail('report must not write')})};
 class ApiError extends Error {constructor(status,msg){super(msg);this.status=status;}}
 const load=loader({'./firebaseAdmin.js':{getFirebaseAdminServices:()=>({firestore})},'./adminUsers.js':{AdminApiError:ApiError}});
 return {store,load,server:load('server/accountingReports.ts'),po,purchase};
}
test('report API restricts full reports to active Admin/accountants, read summaries do not grant posting',async()=>{
 const b=reportBackend();for(const actor of [sale,purchaser,{...admin,active:false},{...accountant,allowedPages:[]}])await assert.rejects(b.server.loadAccountingReports(actor),e=>e.status===403);
 for(const actor of [admin,accountant])assert.equal((await b.server.loadAccountingReports(actor)).success,true);
 assert.equal(access.canReadPartnerSummary(sale),true);assert.equal(access.canReadPartnerSummary({...sale,allowedPages:[]}),false);
 assert.equal(loader()('src/features/accounting/model/accountingLedger.ts').canUseLedger(sale),false);
});
test('shared summaries hide other sales customers and wrong debt side and never add legacy to new',async()=>{
 const b=reportBackend({'finance_documents/d':doc('d',{voided:false,lines:[{...line('l'),adjustment:0,settled:40}]}),'finance_documents/hidden':doc('hidden',{partnerId:'hidden',voided:false}),'finance_documents/ap':doc('ap',{side:'ap',partnerId:'s',voided:false}),'invoices/old':{customerId:'c',type:'receivable',amount:300,paidAmount:50},'invoices/proj':{ledgerVersion:1,customerId:'c',type:'receivable',amount:10000}});
 const r=await b.server.loadPartnerSummary(sale);assert.equal(r.partners.length,1);assert.deepEqual([r.partners[0].debt,r.partners[0].legacyDebt],[60,250]);assert.ok(!r.documents && !r.entries);
 assert.equal((await b.server.loadPartnerSummary(purchaser)).partners[0].side,'ap');
 await assert.rejects(b.server.loadPartnerSummary({...admin,role:'designer'}),e=>e.status===403);
});
test('finished order report converts base counters per row; transit is not customer receipt',async()=>{
 const b=reportBackend(),stamp=b.load('server/finishedGoods.ts').poStamp(b.po);
 b.store.set('goods_order_state/po',{id:'po',fingerprint:stamp,lines:{p1:{catalogItemId:'tp',code:'TP1',name:'Tem',unit:'hộp',factor:10,required:100,sent:80,delivered:50,failedReturned:10,customerReturned:10,closedShort:5}}});
 const r=(await b.server.loadAccountingReports(admin)).goods.find(r=>r.side==='ar');
 assert.deepEqual([r.required,r.received,r.transit,r.returned,r.closedShort,r.remaining,r.toDispatch],[10,4,2,1,0.5,5.5,3.5]);assert.equal(r.unit,'hộp');
});
test('supplier-direct counts POD and failed goods into company, subtracts actual return to supplier',async()=>{
 const b=reportBackend(),stamp=b.load('server/finishedGoods.ts').sourceStamp(b.purchase,'purchase');
 b.store.set('goods_source_state/purchase_buy',{fingerprint:stamp,lines:{'line-0':{catalogItemId:'tp',factor:10,received:10,directSent:70,directDelivered:40,directFailed:20,failedIntoCompany:10,directCustomerReturned:10}}});
 const r=(await b.server.loadAccountingReports(admin)).goods.find(r=>r.side==='ap');assert.deepEqual([r.received,r.transit,r.returned,r.remaining],[5,1,1,5]);
});
test('raw receipt uses BASE quantity and explicit factor; no goods source is inferred from old received status',async()=>{
 const b=reportBackend();b.purchase.sourcingType='raw_material';b.store.set('purchase_orders/buy',b.purchase);const stamp=b.load('server/warehouse.ts').sourceStamp('purchase',b.purchase);
 b.store.set('warehouse_source_state/purchase_buy',{fingerprint:stamp,lines:{'line-0':{catalogItemId:'tp',factor:10,quantity:30}}});
 assert.equal((await b.server.loadAccountingReports(admin)).goods.find(r=>r.side==='ap').received,3);
 b.store.delete('warehouse_source_state/purchase_buy');b.purchase.status='received';b.store.set('purchase_orders/buy',b.purchase);
 const r=(await b.server.loadAccountingReports(admin)).goods.find(r=>r.side==='ap');assert.equal(r.remaining,null);assert.match(r.reconciliation,/đối soát/);
});
test('stale source, old delivery and invalid factor show unknown, not fabricated zero',async()=>{
 const b=reportBackend();b.po.items[0].qtyDelivered=3;b.store.set('pos/po',b.po);
 let r=(await b.server.loadAccountingReports(admin)).goods.find(r=>r.side==='ar');assert.equal(r.received,null);
 b.store.set('goods_order_state/po',{fingerprint:'stale',lines:{p1:{factor:10,required:100}}});r=(await b.server.loadAccountingReports(admin)).goods.find(r=>r.side==='ar');assert.equal(r.remaining,null);
 b.store.set('goods_source_state/purchase_buy',{fingerprint:b.load('server/finishedGoods.ts').sourceStamp(b.purchase,'purchase'),lines:{'line-0':{factor:0}}});r=(await b.server.loadAccountingReports(admin)).goods.find(r=>r.side==='ap');assert.equal(r.received,null);
});
test('same SKU in different warehouses uses scoped balances; null threshold stays unknown',async()=>{
 const b=reportBackend({'warehouse_balances/tp':{quantity:999,minQuantity:1},'warehouse_balances/fg_tp':{catalogItemId:'tp',warehouseId:'finished_main',quantity:3,minQuantity:5},'item_catalog/raw':{active:true,kind:'raw_material',code:'N1',name:'NVL',baseUnit:'kg'}});
 const r=await b.server.loadAccountingReports(admin);assert.equal(r.stock.find(s=>s.code==='TP1').quantity,3);assert.equal(r.stock.find(s=>s.code==='TP1').alert,'Cần nhập hàng');assert.equal(r.stock.find(s=>s.code==='N1').alert,'Chưa thiết lập ngưỡng');
});
test('full report and summary wrappers verify server-side caller, client never reads new ledger collections',()=>{
 const api=fs.readFileSync(path.join(root,'api/accounting/reports.ts'),'utf8');assert.match(api,/requireActiveErpCaller/);assert.match(api,/loadPartnerSummary/);
 const ui=fs.readFileSync(path.join(root,'src/features/accounting/components/AccountingReportsWorkspace.tsx'),'utf8');assert.match(ui,/buildDebtReport/);assert.match(ui,/Xuất CSV/);assert.match(ui,/DataTablePagination/);assert.match(ui,/RowActionMenu/);assert.doesNotMatch(ui,/subscribeCollection|VisualCharts/);
});

test('missing order rows remain in reconciliation instead of disappearing from goods report',async()=>{
 const b=reportBackend({'goods_order_state/po':{fingerprint:'old',lines:{removed:{catalogItemId:'tp',code:'TP1',name:'Mã cũ',unit:'hộp',factor:10}}},'goods_order_state/orphan':{fingerprint:'old',lines:{p1:{catalogItemId:'tp',unit:'hộp'}}}});
 const r=await b.server.loadAccountingReports(admin);assert.equal(r.goods.find(g=>g.lineId==='removed').remaining,null);assert.equal(r.goods.find(g=>g.orderId==='orphan').required,null);assert.match(r.goods.find(g=>g.orderId==='orphan').reconciliation,/Thiếu đơn/);
});

const treeNodes=tree=>!tree||typeof tree!=='object'?[]:[tree,...(Array.isArray(tree.props?.children)?tree.props.children.flat(Infinity):[tree.props?.children]).flatMap(treeNodes)];
function harness(file,name,props,initial={},stubs={}) {
 const React=require('react'),ast=ts.createSourceFile(file,fs.readFileSync(path.join(root,file),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),names=[];
 function visit(n){if(ts.isVariableDeclaration(n)&&ts.isArrayBindingPattern(n.name)&&n.initializer&&ts.isCallExpression(n.initializer)&&n.initializer.expression.getText(ast)==='useState')names.push(n.name.elements[0].getText(ast));ts.forEachChild(n,visit);}visit(ast);
 const state=new Map(Object.entries(initial)),refs=[];let cursor=0,refCursor=0;
 const react={...React,useEffect(){},useMemo:fn=>fn(),useRef(value){const i=refCursor++;return refs[i]||={current:value};},useState(value){const key=names[cursor++]||'hook'+cursor;if(!state.has(key))state.set(key,typeof value==='function'?value():value);return[state.get(key),next=>state.set(key,typeof next==='function'?next(state.get(key)):next)];}};
 const component=loader({react,'@/infrastructure/firebase/erpDataGateway':{isFirebaseRuntimeEnabled:false,authService:{}},...stubs})(file)[name];return{state,refs,render(){cursor=0;refCursor=0;return component(props);}};
}
test('actual report controls drill into partner, line and current goods; CSV exports all filtered rows',async()=>{
 const b=base(),data={...b,goods:[{side:'ar',id:'g',orderId:'po',lineId:'p1',unit:'cái',remaining:3}],stock:[],legacy:[],loadedAt:'2026-03-01T12:00:00Z',asOf:'2026-03-31'};
 for(let i=0;i<30;i++){data.documents.push(doc('extra'+i));data.entries.push(entry('extra'+i,'charge','2026-01-05',{documentId:'extra'+i,amount:100}));}
 const ui=harness('src/features/accounting/components/AccountingReportsWorkspace.tsx','AccountingReportsWorkspace',{actor:admin},{data,loading:false,from:'2026-01-01',to:'2026-01-31'},{'../api/accountingReportsService':{loadAccountingReports:async()=>data},'@/features/inventory/api/warehouseService':{warehouseRequest:async()=>({success:true})}});
 let tree=ui.render(),menu=treeNodes(tree).find(n=>n.type?.name==='RowActionMenu');menu.props.actions[0].onSelect();assert.equal(ui.state.get('partnerId'),'c');assert.equal(ui.state.get('view'),'lines');
 tree=ui.render();menu=treeNodes(tree).find(n=>n.type?.name==='RowActionMenu');assert.equal(menu.props.actions.length,2);menu.props.actions[1].onSelect();assert.equal(ui.state.get('goodsDetail').remaining,3);
 const oldDocument=global.document,oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;let blob,filename;
 try {global.document={createElement:()=>({set href(v){},set download(v){filename=v;},click(){}})};URL.createObjectURL=b=>{blob=b;return 'blob:test';};URL.revokeObjectURL=()=>{};treeNodes(ui.render()).find(n=>n.type==='button'&&n.props.children==='Xuất CSV').props.onClick();assert.equal((await blob.text()).split('\r\n').length,32);assert.match(filename,/ar-2026-01-01-2026-01-31/);}finally{global.document=oldDocument;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;}
 ui.state.set('age','Trên 90 ngày');tree=ui.render();assert.equal(treeNodes(tree).find(n=>n.type==='button'&&n.props.children==='Xuất CSV').props.disabled,true);
 ui.state.set('age','');ui.state.set('view','aging');tree=ui.render();assert.ok(treeNodes(tree).some(n=>n.type==='th'&&n.props.children==='1–30 ngày'));
 ui.state.set('to','2026-04-01');tree=ui.render();assert.ok(treeNodes(tree).some(n=>n.props?.role==='alert'));assert.equal(treeNodes(tree).find(n=>n.type==='button'&&n.props.children==='Xuất CSV').props.disabled,true);
});
test('actual threshold form freezes ambiguous payload and only reports confirmed success',async()=>{
 const oldWindow=global.window;global.window={confirm:()=>true};const sent=[],success=[];let saved=0;
 class Unknown extends Error {constructor(){super('Mất phản hồi');this.uncertain=true;}}
 try {
 const ui=harness('src/features/inventory/components/StockThresholdDialog.tsx','StockThresholdDialog',{stock:{catalogItemId:'tp',warehouseId:'finished_main',code:'TP1',name:'Tem',revision:2,minQuantity:10},onClose(){},onSaved(){saved++;}},{value:'20'},{'../api/warehouseService':{WarehouseRequestError:Unknown,mutateWarehouse:async body=>{sent.push(structuredClone(body));if(sent.length===1)throw new Unknown();return{success:true};}},'@/shared/feedback/mutationFeedback':{showSuccessToast:m=>success.push(m),showErrorToast(){}}});
 await treeNodes(ui.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(saved,0);assert.equal(success.length,0);assert.equal(ui.state.get('uncertain'),true);
 ui.state.set('value','999');await treeNodes(ui.render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.deepEqual(sent[0],sent[1]);assert.equal(sent[1].minQuantity,20);assert.equal(sent[1].expectedRevision,2);assert.equal(saved,1);assert.equal(success.length,1);
 }finally{global.window=oldWindow;}
});
