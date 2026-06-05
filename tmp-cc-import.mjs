console.log('[test] starting import...');
const t0 = Date.now();
const mod = await import('./backend/services/cornerCrawler.js');
console.log('[test] imported in ' + (Date.now()-t0) + 'ms, keys:', Object.keys(mod).join(', '));
