console.log('[test] native node import...');
const mod = await import('./backend/services/cornerCrawler.js');
console.log('[test] OK, keys:', Object.keys(mod).join(', '));
