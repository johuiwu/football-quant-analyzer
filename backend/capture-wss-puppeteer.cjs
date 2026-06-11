// capture-wss-puppeteer.cjs
// Semi-auto: Puppeteer opens browser, fills credentials, user enters captcha
// After login, script captures WebSocket connections automatically

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
    console.log('=== WSS Capture via Puppeteer (Semi-Auto) ===\n');
    console.log('Browser will open. Please:');
    console.log('  1. Enter the captcha code when prompted');
    console.log('  2. Click login');
    console.log('  3. Navigate to a live match page');
    console.log('  4. The script will capture all WebSocket connections\n');
    
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            '--ignore-certificate-errors',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--user-agent=${CONFIG.userAgent}`
        ],
        defaultViewport: { width: 1280, height: 900 }
    });
    
    const page = await browser.newPage();
    
    // Collect all WebSocket connections
    const wsConnections = [];
    const wsMessages = [];
    
    // Intercept WebSocket frames
    page.on('websocket', (ws) => {
        const wsUrl = ws.url();
        console.log(`\n[WS CONNECT] ${wsUrl}`);
        wsConnections.push({ url: wsUrl, time: new Date().toISOString() });
        
        ws.on('message', (msg) => {
            const msgStr = msg.toString();
            if (msgStr.length < 500) {
                console.log(`[WS MSG] ${msgStr}`);
            } else {
                console.log(`[WS MSG] (${msgStr.length} bytes) ${msgStr.substring(0, 200)}...`);
            }
            wsMessages.push({ url: wsUrl, direction: 'in', data: msgStr.substring(0, 500) });
        });
        
        ws.on('close', (code, reason) => {
            console.log(`[WS CLOSE] ${wsUrl} code=${code}`);
        });
        
        ws.on('error', (err) => {
            console.log(`[WS ERROR] ${wsUrl} ${err.message}`);
        });
        
        // Write to file immediately
        fs.writeFileSync(urlFile, wsUrl, 'utf8');
        console.log(`\n*** WebSocket URL captured: ${wsUrl} ***`);
        console.log(`*** Written to: ${urlFile} ***\n`);
    });
    
    // Also intercept network requests for API calls
    const apiRequests = [];
    page.on('request', (req) => {
        const url = req.url();
        if (url.includes('transform.php') || url.includes('gismo') || url.includes('websocket') || url.includes('ws')) {
            const entry = {
                url: url,
                method: req.method(),
                type: req.resourceType(),
                time: new Date().toISOString()
            };
            if (req.method() === 'POST') {
                entry.postData = req.postData();
            }
            apiRequests.push(entry);
            
            if (url.includes('websocket') || url.includes('ws://') || url.includes('wss://')) {
                console.log(`[NET WS] ${req.method()} ${url}`);
            } else if (url.includes('transform.php')) {
                const pd = req.postData() || '';
                console.log(`[API] ${req.method()} ${url.substring(0, 80)}... p=${pd.match(/p=([^&]+)/)?.[1] || '?'}`);
            }
        }
    });
    
    // Navigate to login page
    console.log('[1] Navigating to login page...');
    try {
        await page.goto(CONFIG.url, { waitUntil: 'networkidle2', timeout: 30000 });
    } catch (e) {
        console.log(`Navigation error: ${e.message}`);
        console.log('Trying alternative URL...');
        try {
            await page.goto('https://www.hga038.com', { waitUntil: 'networkidle2', timeout: 30000 });
        } catch (e2) {
            console.log(`Alternative also failed: ${e2.message}`);
        }
    }
    
    // Wait a bit for page to load
    await new Promise(r => setTimeout(r, 3000));
    
    // Try to fill in credentials
    console.log('[2] Looking for login form...');
    
    // Take screenshot for debugging
    const screenshotPath = path.join(__dirname, 'login-page.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved: ${screenshotPath}`);
    
    // Try to find and fill username/password fields
    try {
        // Common selectors for login forms
        const usernameSelectors = [
            'input[name="username"]', 'input[name="UserName"]', 
            'input[type="text"]', 'input[id*="user"]', 'input[id*="name"]',
            '#username', '#UserName'
        ];
        const passwordSelectors = [
            'input[name="password"]', 'input[name="PassWord"]',
            'input[type="password"]', 'input[id*="pass"]', 'input[id*="pwd"]',
            '#password', '#PassWord'
        ];
        
        let usernameField = null;
        let passwordField = null;
        
        for (const sel of usernameSelectors) {
            usernameField = await page.$(sel);
            if (usernameField) { console.log(`  Found username: ${sel}`); break; }
        }
        
        for (const sel of passwordSelectors) {
            passwordField = await page.$(sel);
            if (passwordField) { console.log(`  Found password: ${sel}`); break; }
        }
        
        if (usernameField && passwordField) {
            await usernameField.click({ clickCount: 3 });
            await usernameField.type(CONFIG.username);
            await passwordField.click({ clickCount: 3 });
            await passwordField.type(CONFIG.password);
            console.log('  Credentials filled!');
        } else {
            console.log('  Could not auto-fill credentials. Please enter them manually.');
        }
    } catch (e) {
        console.log(`  Auto-fill error: ${e.message}`);
    }
    
    console.log('\n[3] Waiting for you to login...');
    console.log('    Please enter the captcha and click login.');
    console.log('    After login, navigate to a live match page.');
    console.log('    The script will capture all WebSocket connections.\n');
    
    // Wait for navigation after login (up to 5 minutes)
    console.log('Monitoring for WebSocket connections (press Ctrl+C when done)...\n');
    
    // Keep the script running and monitoring
    const monitorInterval = setInterval(() => {
        if (wsConnections.length > 0) {
            console.log(`\n[STATUS] ${wsConnections.length} WS connection(s) captured:`);
            wsConnections.forEach((ws, i) => {
                console.log(`  ${i+1}. ${ws.url} (at ${ws.time})`);
            });
        }
    }, 30000);
    
    // Also monitor page URL changes
    page.on('framenavigated', (frame) => {
        const url = frame.url();
        if (url.includes('corner') || url.includes('live') || url.includes('inplay') || url.includes('rb')) {
            console.log(`[NAV] Navigated to: ${url}`);
        }
    });
    
    // Wait indefinitely until user closes browser
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
        console.log('WebSocket connections captured:');
        wsConnections.forEach((ws, i) => {
            console.log(`  ${i+1}. ${ws.url}`);
        });
        
        // Write the first WSS URL
        const firstWs = wsConnections[0].url;
        fs.writeFileSync(urlFile, firstWs, 'utf8');
        console.log(`\nWebSocket URL: ${firstWs}`);
        console.log(`Written to: ${urlFile}`);
    } else {
        console.log('No WebSocket connections captured.');
        console.log('This could mean:');
        console.log('  1. Login was not completed');
        console.log('  2. No live match page was visited');
        console.log('  3. The site uses a different real-time mechanism');
        
        // Show API requests that were captured
        if (apiRequests.length > 0) {
            console.log(`\nAPI requests captured: ${apiRequests.length}`);
            apiRequests.slice(0, 20).forEach((r, i) => {
                console.log(`  ${i+1}. ${r.method} ${r.url.substring(0, 100)}`);
            });
        }
    }
    
    // Save full log
    const logFile = path.join(__dirname, 'wss_capture_log.json');
    fs.writeFileSync(logFile, JSON.stringify({ wsConnections, wsMessages, apiRequests }, null, 2), 'utf8');
    console.log(`\nFull log saved: ${logFile}`);
}

main().catch(console.error);
