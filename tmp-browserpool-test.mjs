import { getSharedBrowser, closeSharedBrowser } from './backend/services/browserPool.js';
console.log('Testing browserPool launch...');
try {
  const browser = await getSharedBrowser();
  console.log('browserPool launch OK, browser:', !!browser);
  await closeSharedBrowser();
  console.log('browserPool close OK');
} catch(e) {
  console.error('browserPool error:', e.message);
}
console.log('Done');
