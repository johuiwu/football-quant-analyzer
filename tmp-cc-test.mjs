console.log('[test] starting import cornerCrawler...');
const mod = await import('./backend/services/cornerCrawler.js');
console.log('[test] import OK, exports:', Object.keys(mod).join(', '));
