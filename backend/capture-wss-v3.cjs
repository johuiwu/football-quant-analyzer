// capture-wss-v3.cjs
// Auto-login with new account + capture WebSocket via CDP
// Will NOT close browser until user is done

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const CONFIG = {
    url: 'https://m510.crw066.com',
    username: 'johui888',
    password: 'aa123123',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) Version/8.5 Mobile/12F70 Safari/600.1'
};

const urlFile = path.join(__dirname, 'websocket_url.txt');

async function main() {
    console.log('=== WSS Capture v3 (johui888) ===\n');
    
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            '--ignore-certificate-errors',
            '--no-sandbox',
            `--user-agent=${CONFIG.userAgent}`
        ],
        defaultViewport: { width: 1280, height: 900 }
    });
    
    const page = await browser.newPage();
    
    // Collect data
    const wsConnections = [];
    const wsMessages = [];
    const apiRequests = [];
    
    // CDP session for WebSocket monitoring
    const client = await page.target().createCDPSession();
    await client.send('Network.enable');
    
    client.on('Network.webSocketCreated', (params) => {
        console.log(`\n*** [WS CREATED] ${params.url} ***`);
        wsConnections.push({ url: params.url, requestId: params.requestId, time: new Date().toISOString() });
        fs.writeFileSync(urlFile, params.url, 'utf8');
        console.log(`*** Written to: ${urlFile} ***\n`);
    });
    
    client.on('Network.webSocketFrameReceived', (params) => {
        const data = params.response.payloadData;
        if (data.length < 500) {
            console.log(`[WS IN] ${data}`);
        } else {
            console.log(`[WS IN] (${data.length} bytes) ${data.substring(0, 200)}...`);
        }
        wsMessages.push({ direction: 'in', data: data.substring(0, 500), time: new Date().toISOString() });
    });
    
    client.on('Network.webSocketFrameSent', (params) => {
        const data = params.responseData;
        console.log(`[WS OUT] ${data.substring(0, 200)}`);
        wsMessages.push({ direction: 'out', data: data.substring(0, 500), time: new Date().toISOString() });
    });
    
    client.on('Network.webSocketClosed', (params) => {
        console.log(`[WS CLOSED] ${params.requestId}`);
    });
    
    client.on('Network.webSocketHandshakeResponseReceived', (params) => {
        console.log(`[WS HANDSHAKE] status=${params.response.status}`);
    });
    
    // Also use puppeteer websocket event
    page.on('websocket', (ws) => {
        console.log(`\n*** [PUPPETEER WS] ${ws.url()} ***`);
        ws.on('message', (msg) => {
            console.log(`[PUP WS MSG] ${msg.toString().substring(0, 200)}`);
        });
    });
    
    // Monitor HTTP requests
    page.on('request', (req) => {
        const url = req.url();
        if (url.includes('transform.php') || url.includes('gismo')) {
            const pd = req.postData() || '';
            const pMatch = pd.match(/p=([^&]+)/);
            const pName = pMatch ? pMatch[1] : '?';
            console.log(`[API] ${req.method()} p=${pName}`);
            apiRequests.push({ url, method: req.method(), postData: pd, time: new Date().toISOString() });
        }
    });
    
    // Navigate to login page
    console.log('[1] Navigating to login page...');
    await page.goto(CONFIG.url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    
    // Fill credentials
    console.log('[2] Filling credentials...');
    try {
        const userInput = await page.$('input[type="text"], input[name="username"], input[id*="user"]');
        if (userInput) {
            await userInput.click({ clickCount: 3 });
            await userInput.type(CONFIG.username);
            console.log('  Username filled: ' + CONFIG.username);
        }
        
        const passInput = await page.$('input[type="password"]');
        if (passInput) {
            await passInput.click({ clickCount: 3 });
            await passInput.type(CONFIG.password);
            console.log('  Password filled');
        }
        
        await new Promise(r => setTimeout(r, 500));
        
        // Try clicking login button
        const loginBtn = await page.$('button[type="submit"], input[type="submit"], .login-btn, #btn_Login, #btnLogin, button');
        if (loginBtn) {
            console.log('  Clicking login button...');
            await loginBtn.click();
        } else {
            console.log('  Pressing Enter...');
            await page.keyboard.press('Enter');
        }
    } catch (e) {
        console.log(`  Auto-fill error: ${e.message}`);
    }
    
    // Wait for login
    console.log('\n[3] Waiting for login...');
    await new Promise(r => setTimeout(r, 8000));
    
    const currentUrl = page.url();
    console.log(`  Current URL: ${currentUrl}`);
    
    // Screenshot
    const ssPath = path.join(__dirname, 'after-login-v3.png');
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log(`  Screenshot: ${ssPath}`);
    
    // Check if login succeeded
    const pageContent = await page.content();
    if (pageContent.includes('suspended') || pageContent.includes('Suspended')) {
        console.log('\n  [WARN] Account may be suspended!');
    } else if (currentUrl !== CONFIG.url + '/' || pageContent.includes('logout') || pageContent.includes('Logout')) {
        console.log('\n  [OK] Login appears successful!');
    }
    
    // Try to navigate to In-Play
    console.log('\n[4] Looking for In-Play / Live links...');
    try {
        const links = await page.evaluate(() => {
            const allElements = Array.from(document.querySelectorAll('a, button, [role="button"], span, div'));
            return allElements.map(el => ({
                text: el.textContent.trim().substring(0, 50),
                href: el.href || '',
                id: el.id || '',
                className: (el.className || '').toString().substring(0, 80)
            })).filter(l => 
                l.text.match(/in.?play|live|corner|滚球|角球|即场|running|sport|足球|football|soccer/i) ||
                l.href.match(/live|inplay|corner|rb|sport/i)
            ).slice(0, 20);
        });
        
        console.log(`  Found ${links.length} relevant elements:`);
        links.forEach(l => console.log(`    "${l.text}" href=${l.href} id=${l.id} class=${l.className}`));
        
        // Try clicking In-Play
        const inplayLink = links.find(l => l.text.match(/in.?play|live|滚球|即场/i));
        if (inplayLink && inplayLink.href) {
            console.log(`\n  Navigating to: ${inplayLink.href}`);
            await page.goto(inplayLink.href, { waitUntil: 'networkidle2', timeout: 15000 });
        }
    } catch (e) {
        console.log(`  Error: ${e.message}`);
    }
    
    // Monitor
    console.log('\n[5] Monitoring for WebSocket connections...');
    console.log('  The browser is still open. Please:');
    console.log('    - Navigate to a live match page');
    console.log('    - Click on Corners tab');
    console.log('    - Watch this console for WS connections');
    console.log('  When done, close the browser window.\n');
    
    // Periodic status
    const monitorInterval = setInterval(() => {
        if (wsConnections.length > 0) {
            console.log(`\n[STATUS] ${wsConnections.length} WS connection(s):`);
            wsConnections.forEach((ws, i) => {
                console.log(`  ${i+1}. ${ws.url}`);
            });
        } else {
            console.log(`[${new Date().toLocaleTimeString()}] Still monitoring... (0 WS connections so far)`);
        }
    }, 30000);
    
    // Wait for browser close
    await new Promise((resolve) => {
        browser.on('disconnected', () => {
            clearInterval(monitorInterval);
            resolve();
        });
    });
    
    // Final summary
    console.log('\n' + '='.repeat(50));
    console.log('FINAL SUMMARY\n');
    
    if (wsConnections.length > 0) {
        console.log('WebSocket URLs captured:');
        wsConnections.forEach((ws, i) => {
            console.log(`  ${i+1}. ${ws.url}`);
        });
        fs.writeFileSync(urlFile, wsConnections[0].url, 'utf8');
        console.log(`\nWritten to: ${urlFile}`);
    } else {
        console.log('No WebSocket connections captured.');
        console.log('API requests: ' + apiRequests.length);
        console.log('The site may use HTTP polling instead of WebSocket.');
    }
    
    // Save full log
    const logFile = path.join(__dirname, 'wss_capture_log.json');
    fs.writeFileSync(logFile, JSON.stringify({ wsConnections, wsMessages, apiRequests }, null, 2), 'utf8');
    console.log(`Full log: ${logFile}`);
}

main().catch(console.error);
