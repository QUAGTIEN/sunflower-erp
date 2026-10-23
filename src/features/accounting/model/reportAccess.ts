import type { WarehouseActor } from '../../inventory/model/warehouse.js';
import { canUseLedger } from './accountingLedger.js';
// Existing page summaries only; never grants report/ledger detail or posting access.
export const canReadPartnerSummary = (a: WarehouseActor) => canUseLedger(a) || a.active === true && (
  a.role === 'sale' && a.allowedPages?.some(p => ['crm','sales'].includes(p)) === true ||
  a.role === 'purchaser' && a.allowedPages?.some(p => ['suppliers','purchase'].includes(p)) === true
);
