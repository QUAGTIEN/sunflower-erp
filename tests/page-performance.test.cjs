const test = require('node:test');
const assert = require('node:assert/strict');
const { createLoader, readSource } = require('./helpers/loadTs.cjs');

test('kept-alive pages follow most-recent use and drop the oldest page past the limit', () => {
  const { rememberPage, KEEP_ALIVE_PAGE_LIMIT } = createLoader()('src/app/navigation/pageKeepAlive.ts');
  assert.equal(KEEP_ALIVE_PAGE_LIMIT, 5);
  const pages = ['dashboard'];
  assert.equal(rememberPage(pages, 'dashboard'), pages, 'reopening the current page keeps the same list');
  assert.deepEqual(rememberPage(['dashboard', 'crm'], 'dashboard'), ['crm', 'dashboard']);
  assert.deepEqual(rememberPage(['a', 'b', 'c', 'd', 'e'], 'f'), ['b', 'c', 'd', 'e', 'f']);
});

test('hidden pages skip shell re-renders and render again when shown', () => {
  const { KeepAlivePage } = createLoader({
    '@/components/LoadingStates': { PageLoadingFallback: () => null }
  })('src/app/KeepAlivePage.tsx');
  const compare = KeepAlivePage.compare;
  assert.equal(compare({ active: false }, { active: false }), true);
  assert.equal(compare({ active: true }, { active: false }), false);
  assert.equal(compare({ active: false }, { active: true }), false);
  assert.equal(compare({ active: true }, { active: true }), false);
});

test('loading status shows a skeleton on first load and a small indicator when data exists', () => {
  const { LoadingStatus, RefreshingIndicator, TableSkeleton } = createLoader()('src/components/LoadingStates.tsx');
  assert.equal(LoadingStatus({ loading: false, hasData: false }), null);
  assert.equal(LoadingStatus({ loading: true, hasData: true }).type, RefreshingIndicator);
  assert.equal(LoadingStatus({ loading: true, hasData: false }).type, TableSkeleton);
});

test('shell keeps pages and data alive and only the visible page sets the breadcrumb', () => {
  const shell = readSource('src/app/AppShell.tsx');
  const header = readSource('src/components/PageContextHeader.tsx');
  const vite = readSource('vite.config.ts');
  assert.match(shell, /mountedPages\.map\(/);
  assert.match(shell, /SUBSCRIPTION_LINGER_MS/);
  assert.match(shell, /pageNeeds\(\.\.\.COLLECTION_PAGES\.customers\)/);
  assert.match(shell, /isPageWaitingForData\(pageId, pendingCollections\)/);
  assert.match(shell, /setMountedPages\(\['dashboard'\]\)/, 'logout drops pages of the previous user');
  assert.match(header, /if \(isPageActive\) setPageContext/);
  for (const chunk of ['vendor-react', 'vendor-firebase', 'vendor-icons']) assert.match(vite, new RegExp(chunk));
});
