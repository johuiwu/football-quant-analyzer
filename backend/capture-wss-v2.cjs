// capture-wss-v2.cjs
// Auto-login (no captcha on English page) + capture WebSocket

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const CONFIG = {
    url: 'https://m510.crw066.com',
    username: 'liuwei1108',
    password: 'Hc6957061',
    uid: 'q94s507em40685531l8731371b1',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) Version/8.5 Mobile/12F70 Safari/600.1'
};

const urlFile = path.join(__dirname, 'websocket_url.txt');

async function main() {
    console.log('=== WSS Capture v2 (Auto-Login) ===\n');
    
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
    
    // Collect WebSocket connections
    const wsConnections = [];
    const wsMessages = [];
    const apiRequests = [];
    
    // CDP session for WebSocket monitoring
    const client = await page.target().createCDPSession();
    await client.send('Network.enable');
    
    // Monitor WebSocket via CDP
    client.on('Network.webSocketCreated', (params) => {
        console.log(`\n*** [WS CREATED] ${params.requestId} ${params.url} ***`);
        wsConnections.push({ url: params.url, requestId: params.requestId, time: new Date().toISOString() });
        
        // Write to file immediately
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
        wsMessages.push({ direction: 'in', data: data.substring(0, 500) });
    });
    
    client.on('Network.webSocketFrameSent', (params) => {
        const data = params.responseData;
        console.log(`[WS OUT] ${data.substring(0, 200)}`);
        wsMessages.push({ direction: 'out', data: data.substring(0, 500) });
    });
    
    client.on('Network.webSocketClosed', (params) => {
        console.log(`[WS CLOSED] ${params.requestId}`);
    });
    
    client.on('Network.webSocketHandshakeResponseReceived', (params) => {
        console.log(`[WS HANDSHAKE] ${params.requestId} status=${params.response.status}`);
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
            console.log(`[API] ${req.method()} p=${pMatch ? pMatch[1] : '?'} ${url.substring(0, 60)}`);
            apiRequests.push({ url, method: req.method(), postData: pd, time: new Date().toISOString() });
        }
    });
    
    // Navigate to login page
    console.log('[1] Navigating to login page...');
    await page.goto(CONFIG.url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    
    // Fill credentials and click login
    console.log('[2] Filling credentials...');
    try {
        // Click on Login ID field and type
        await page.waitForSelector('input[type="text"], input[name="username"], input[id*="user"]', { timeout: 5000 });
        const userInput = await page.$('input[type="text"], input[name="username"], input[id*="user"]');
        if (userInput) {
            await userInput.click({ clickCount: 3 });
            await userInput.type(CONFIG.username);
            console.log('  Username filled');
        }
        
        const passInput = await page.$('input[type="password"]');
        if (passInput) {
            await passInput.click({ clickCount: 3 });
            await passInput.type(CONFIG.password);
            console.log('  Password filled');
        }
        
        // Click Login button
        await new Promise(r => setTimeout(r, 500));
        const loginBtn = await page.$('button[type="submit"], input[type="submit"], .login-btn, #btn_Login, #btnLogin');
        if (loginBtn) {
            console.log('  Clicking login button...');
            await loginBtn.click();
        } else {
            // Try pressing Enter
            console.log('  Pressing Enter to submit...');
            await page.keyboard.press('Enter');
        }
    } catch (e) {
        console.log(`  Auto-fill error: ${e.message}`);
        console.log('  Please login manually in the browser');
    }
    
    // Wait for login to complete
    console.log('\n[3] Waiting for login to complete...');
    await new Promise(r => setTimeout(r, 5000));
    
    // Check if logged in
    const currentUrl = page.url();
    console.log(`  Current URL: ${currentUrl}`);
    
    // Take screenshot
    const ssPath = path.join(__dirname, 'after-login.png');
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log(`  Screenshot: ${ssPath}`);
    
    // Try to navigate to In-Play / Corners
    console.log('\n[4] Trying to navigate to In-Play / Corners...');
    try {
        // Look for In-Play or live betting link
        const links = await page.evaluate(() => {
            const allLinks = Array.from(document.querySelectorAll('a, button, [role="button"], [onclick]'));
            return allLinks.map(el => ({
                text: el.textContent.trim().substring(0, 50),
                href: el.href || '',
                onclick: el.getAttribute('onclick') || '',
                id: el.id || '',
                className: el.className || ''
            })).filter(l => 
                l.text.match(/in.?play|live|corner|滚球|角球|即场|running/i) ||
                l.href.match(/live|inplay|corner|rb/i) ||
                l.onclick.match(/live|inplay|corner|rb/i)
            );
        });
        
        console.log(`  Found ${links.length} relevant links:`);
        links.forEach(l => console.log(`    "${l.text}" href=${l.href} onclick=${l.onclick} id=${l.id}`));
        
        // Click the first In-Play link
        if (links.length > 0) {
            const target = links[0];
            if (target.href) {
                console.log(`  Navigating to: ${target.href}`);
                await page.goto(target.href, { waitUntil: 'networkidle2', timeout: 15000 });
            } else if (target.onclick) {
                console.log(`  Executing onclick: ${target.onclick}`);
                await page.evaluate(target.onclick);
            }
        }
    } catch (e) {
        console.log(`  Navigation error: ${e.message}`);
    }
    
    // Wait and monitor
    console.log('\n[5] Monitoring for WebSocket connections...');
    console.log('  Please navigate to a live match page in the browser.');
    console.log('  Press Ctrl+C when done.\n');
    
    // Keep monitoring
    const monitorInterval = setInterval(() => {
        if (wsConnections.length > 0) {
            console.log(`\n[STATUS] ${wsConnections.length} WS connection(s):`);
            wsConnections.forEach((ws, i) => {
                console.log(`  ${i+1}. ${ws.url}`);
            });
        }
    }, 20000);
    
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
        console.log('API requests captured: ' + apiRequests.length);
    }
    
    // Save full log
    const logFile = path.join(__dirname, 'wss_capture_log.json');
    fs.writeFileSync(logFile, JSON.stringify({ wsConnections, wsMessages, apiRequests }, null, 2), 'utf8');
    console.log(`Full log: ${logFile}`);
}

main().catch(console.error);
