// login-emnu.cjs - Handle EMNU verification and login properly
// The HgCeApp uses a two-step login: get EMNU token first, then login with it

const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const CONFIG = {
    hgUsername: 'liuwei1108',
    hgPassword: 'Hc6957061',
    hgUid: 'q94s507em40685531l8731371b1',
    hgVer: '6f209d8aea89a7ef796ed9e7f002e7a3_1779944027525',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) Version/8.5 Mobile/12F70 Safari/600.1',
    apiHosts: ['m510.crw066.com', 'www.hga038.com', 'www.hga050.com']
};

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function request(host, path, method = 'GET', body = null, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: host,
            port: 443,
            path: path,
            method: method,
            headers: {
                'User-Agent': CONFIG.userAgent,
                'X-Requested-With': 'XMLHttpRequest',
                ...extraHeaders
            }
        };
        
        if (body) {
            options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            options.headers['Content-Length'] = Buffer.byteLength(body);
            options.headers['Referer'] = `https://${host}/`;
            options.headers['Origin'] = `https://${host}`;
        }
        
        const req = https.request(options, (res) => {
            let data = [];
            const cookies = res.headers['set-cookie'] || [];
            res.on('data', chunk => data.push(chunk));
            res.on('end', () => {
                const responseBody = Buffer.concat(data).toString('utf8');
                resolve({ 
                    statusCode: res.statusCode, 
                    headers: res.headers, 
                    cookies,
                    body: responseBody 
                });
            });
        });
        
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function main() {
    console.log('=== HgCeApp EMNU Login + WSS ===\n');
    
    let workingHost = null;
    let sessionCookies = [];
    let uid = CONFIG.hgUid;
    
    for (const host of CONFIG.apiHosts) {
        console.log(`[1] Trying: ${host}`);
        
        // Step 1a: GET the main page to get cookies/session
        console.log('  Fetching main page...');
        try {
            const mainRes = await request(host, '/');
            console.log(`    Status: ${mainRes.statusCode}`);
            console.log(`    Cookies: ${JSON.stringify(mainRes.cookies)}`);
            if (mainRes.cookies.length > 0) {
                sessionCookies = mainRes.cookies.map(c => c.split(';')[0]);
            }
        } catch (e) {
            console.log(`    Error: ${e.message}`);
        }
        
        // Step 1b: Try to get EMNU token
        console.log('  Fetching EMNU...');
        try {
            const emnuRes = await request(host, '/transform.php?p=get_emnu&langx=zh-cn', 'GET', null, {
                'Cookie': sessionCookies.join('; ')
            });
            console.log(`    EMNU response (${emnuRes.body.length} bytes): ${emnuRes.body.substring(0, 300)}`);
            
            // Check for EMNU value
            const emnuMatch = emnuRes.body.match(/<emnu>([^<]+)<\/emnu>/) || 
                              emnuRes.body.match(/"emnu"\s*:\s*"([^"]+)"/) ||
                              emnuRes.body.match(/emnu=([^&<\s]+)/);
            if (emnuMatch) {
                console.log(`    EMNU token: ${emnuMatch[1]}`);
            }
        } catch (e) {
            console.log(`    Error: ${e.message}`);
        }
        
        // Step 1c: Try login with various parameter combinations
        const loginVariants = [
            `p=chk_login&langx=zh-cn&ver=${CONFIG.hgVer}&username=${CONFIG.hgUsername}&password=${CONFIG.hgPassword}`,
            `p=chk_login&langx=zh-cn&username=${CONFIG.hgUsername}&password=${CONFIG.hgPassword}`,
            `p=login&langx=zh-cn&username=${CONFIG.hgUsername}&password=${CONFIG.hgPassword}`,
            `p=chk_login&langx=zh-cn&ver=${CONFIG.hgVer}&username=${CONFIG.hgUsername}&password=${CONFIG.hgPassword}&uid=${uid}`,
        ];
        
        for (let i = 0; i < loginVariants.length; i++) {
            console.log(`  Login variant ${i+1}...`);
            try {
                const loginRes = await request(host, '/transform.php', 'POST', loginVariants[i], {
                    'Cookie': sessionCookies.join('; ')
                });
                console.log(`    Response: ${loginRes.body.substring(0, 300)}`);
                
                // Check for cookies from login
                if (loginRes.cookies.length > 0) {
                    sessionCookies = sessionCookies.concat(loginRes.cookies.map(c => c.split(';')[0]));
                    console.log(`    New cookies: ${JSON.stringify(loginRes.cookies.map(c => c.split(';')[0]))}`);
                }
                
                if (loginRes.body.includes('<code>200</code>') || loginRes.body.includes('<code>601</code>')) {
                    workingHost = host;
                    console.log(`    LOGIN SUCCESS!`);
                    const uidMatch = loginRes.body.match(/<uid>([^<]+)<\/uid>/);
                    if (uidMatch) { uid = uidMatch[1]; console.log(`    UID: ${uid}`); }
                    break;
                }
            } catch (e) {
                console.log(`    Error: ${e.message}`);
            }
        }
        
        if (workingHost) break;
        
        // Step 1d: Try with stored UID + force login
        console.log('  Trying force login with stored UID...');
        try {
            const forceRes = await request(host, '/transform.php', 'POST', 
                `p=chk_login&langx=zh-cn&ver=${CONFIG.hgVer}&username=${CONFIG.hgUsername}&password=${CONFIG.hgPassword}&force=1`, {
                'Cookie': `uid=${uid}; ${sessionCookies.join('; ')}`
            });
            console.log(`    Force login: ${forceRes.body.substring(0, 300)}`);
            
            if (forceRes.body.includes('<code>200</code>') || forceRes.body.includes('<code>601</code>')) {
                workingHost = host;
                console.log(`    FORCE LOGIN SUCCESS!`);
                if (forceRes.cookies.length > 0) {
                    sessionCookies = sessionCookies.concat(forceRes.cookies.map(c => c.split(';')[0]));
                }
                break;
            }
        } catch (e) {
            console.log(`    Error: ${e.message}`);
        }
    }
    
    // Step 2: If still not logged in, try get_game_list with stored UID
    if (!workingHost) {
        console.log('\n[2] Trying API calls with stored UID...');
        for (const host of CONFIG.apiHosts) {
            try {
                const res = await request(host, '/transform.php', 'POST',
                    `p=get_game_list&p3type=&date=&gtype=ft&showtype=live&rtype=rcn&ltype=3&uid=${uid}&langx=zh-cn&ver=${CONFIG.hgVer}`, {
                    'Cookie': `uid=${uid}`
                });
                console.log(`  ${host}: ${res.body.substring(0, 200)}`);
                
                if (res.body.includes('<code>200</code>') || res.body.includes('<code>601</code>') || res.body.includes('<game')) {
                    workingHost = host;
                    console.log(`  API WORKS on ${host}!`);
                    break;
                }
            } catch (e) {
                console.log(`  ${host} error: ${e.message}`);
            }
        }
    }
    
    // Step 3: Connect WSS with full auth
    console.log('\n[3] Connecting WebSocket with auth...');
    const wsHost = workingHost || 'www.hga050.com';
    
    const WebSocket = require('ws');
    const wsPaths = ['/ws', '/realtime', '/client', '/push', '/live', '/socket', '/api/ws', '/eventbus', '/stream'];
    
    let wsUrl = null;
    
    for (const wsPath of wsPaths) {
        const url = `wss://${wsHost}${wsPath}`;
        console.log(`  WSS: ${url} ...`);
        
        try {
            const ws = new WebSocket(url, {
                headers: {
                    'User-Agent': CONFIG.userAgent,
                    'X-Requested-With': 'XMLHttpRequest',
                    'Cookie': `uid=${uid}; ${sessionCookies.join('; ')}`,
                    'Origin': `https://${wsHost}`,
                    'Referer': `https://${wsHost}/`
                },
                handshakeTimeout: 10000
            });
            
            const result = await new Promise((resolve) => {
                ws.on('open', () => {
                    console.log('    OPEN!');
                    resolve('OPEN');
                    setTimeout(() => ws.close(), 3000);
                });
                
                ws.on('message', (data) => {
                    console.log(`    Received: ${data.toString().substring(0, 200)}`);
                });
                
                ws.on('close', (code, reason) => {
                    console.log(`    Closed (code=${code})`);
                    resolve(`Closed:${code}`);
                });
                
                ws.on('error', (err) => {
                    const msg = err.message;
                    if (msg.includes('403')) { console.log('    403 Forbidden'); resolve('403'); }
                    else if (msg.includes('404')) { console.log('    404 Not Found'); resolve('404'); }
                    else if (msg.includes('unexpected') || msg.includes('upgrade')) { console.log('    Protocol error'); resolve('ProtocolError'); }
                    else { console.log(`    Error: ${msg.substring(0, 80)}`); resolve('Error'); }
                });
                
                setTimeout(() => { ws.terminate(); resolve('Timeout'); }, 12000);
            });
            
            if (result === 'OPEN') {
                wsUrl = url;
                break;
            }
        } catch (e) {
            console.log(`    Fatal: ${e.message}`);
        }
    }
    
    // Output
    console.log('\n' + '='.repeat(50));
    const urlFile = path.join(__dirname, 'websocket_url.txt');
    
    if (wsUrl) {
        fs.writeFileSync(urlFile, wsUrl, 'utf8');
        console.log(`[SUCCESS] WebSocket URL: ${wsUrl}`);
    } else {
        console.log(`[RESULT] WSS not established`);
        console.log(`Working host: ${workingHost || 'none'}`);
        console.log(`UID: ${uid}`);
        console.log(`Cookies: ${sessionCookies.join('; ')}`);
        console.log(`Best candidate: wss://www.hga050.com/ws`);
        fs.writeFileSync(urlFile, 'wss://www.hga050.com/ws', 'utf8');
    }
}

main().catch(console.error);
