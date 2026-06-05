import { getSharedBrowser, closeSharedBrowser } from './backend/services/browserPool.js';
const t0 = Date.now();
console.log('[test] importing OK, launching...');
try {
  const b = await getSharedBrowser();
  console.log('[test] browser launched in ' + (Date.now()-t0) + 'ms, browser=' + !!b);
  if (b) {
    const page = await b.newPage();
    console.log('[test] newPage OK');
    await page.close();
    console.log('[test] page closed');
  }
  await closeSharedBrowser();
  console.log('[test] done');
} catch(e) {
  console.error('[test] ERROR:', e.message);
}
