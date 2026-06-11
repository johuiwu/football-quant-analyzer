// login-and-ws.js - Node.js script to login and connect WebSocket
// Uses ws library which supports custom headers

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Config from INI
const CONFIG = {
    hgUrl: 'https://www.hga050.com',
    hgUsername: 'liuwei1108',
    hgPassword: 'Hc6957061',
    hgUid: 'q94s507em40685531l8731371b1',
    hgVer: '6f209d8aea89a7ef796ed9e7f002e7a3_1779944027525',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/600.1.4 (KHTML, like Gecko) Version/8.5 Mobile/12F70 Safari/600.1',
    apiHosts: ['m510.crw066.com', 'www.hga038.com', 'www.hga050.com']
};

// Bypass SSL
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function postRequest(host, path, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: host,
            port: 443,
            path: path,
            method: 'POST',
            headers: {
                'User-Agent': CONFIG.userAgent,
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': `https://${host}/`,
                'Origin': `https://${host}`,
                'Content-Length': Buffer.byteLength(body)
            }
        };
        
        const req = https.request(options, (res) => {
            let data = [];
            res.on('data', chunk => data.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(data).toString('utf8');
                resolve({ statusCode: res.statusCode, headers: res.headers, body });
            });
        });
        
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function tryLogin() {
    console.log('[1] Attempting login...\n');
    
    for (const host of CONFIG.apiHosts) {
        console.log(`  Trying: ${host}`);
        
        // Try chk_login
        const loginBody = `p=chk_login&langx=zh-cn&ver=${CONFIG.hgVer}&username=${CONFIG.hgUsername}&password=${CONFIG.hgPassword}`;
        try {
            const res = await postRequest(host, '/transform.php', loginBody);
            console.log(`    Response (${res.body.length} bytes): ${res.body.substring(0, 200)}`);
            
            if (res.body.includes('<code>200</code>') || res.body.includes('<code>601</code>')) {
                console.log(`    LOGIN SUCCESS on ${host}!`);
                const uidMatch = res.body.match(/<uid>([^<]+)<\/uid>/);
                if (uidMatch) {
                    CONFIG.hgUid = uidMatch[1];
                    console.log(`    UID: ${uidMatch[1]}`);
                }
                return host;
            }
            
            if (res.body.includes('CheckEMNU')) {
                console.log('    CheckEMNU - trying with Cookie uid...');
                
                // Try with existing UID cookie
                const loginBody2 = `p=chk_login&langx=zh-cn&ver=${CONFIG.hgVer}&username=${CONFIG.hgUsername}&password=${CONFIG.hgPassword}&uid=${CONFIG.hgUid}`;
                const res2 = await postRequest(host, '/transform.php', loginBody2);
                console.log(`    v2 Response: ${res2.body.substring(0, 200)}`);
                
                if (res2.body.includes('<code>200</code>') || res2.body.includes('<code>601</code>')) {
                    console.log(`    LOGIN SUCCESS on ${host}!`);
                    return host;
                }
            }
        } catch (e) {
            console.log(`    Error: ${e.message}`);
        }
    }
    
    return null;
}

async function tryGetMemberData(host) {
    console.log(`\n[2] Trying get_member_data on ${host}...`);
    const body = `p=get_member_data&uid=${CONFIG.hgUid}&langx=zh-cn&change=all`;
    try {
        const res = await postRequest(host, '/transform.php', body);
        console.log(`  Response (${res.body.length} bytes): ${res.body.substring(0, 300)}`);
        return res.body;
    } catch (e) {
        console.log(`  Error: ${e.message}`);
        return null;
    }
}

async function tryGetGameList(host) {
    console.log(`\n[3] Trying get_game_list on ${host}...`);
    const body = `p=get_game_list&p3type=&date=&gtype=ft&showtype=live&rtype=rcn&ltype=3&filter=&cupFantasy=N&sorttype=L&specialClick=&isFantasy=N&uid=${CONFIG.hgUid}&langx=zh-cn&ver=${CONFIG.hgVer}`;
    try {
        const res = await postRequest(host, '/transform.php', body);
        console.log(`  Response (${res.body.length} bytes): ${res.body.substring(0, 300)}`);
        return res.body;
    } catch (e) {
        console.log(`  Error: ${e.message}`);
        return null;
    }
}

async function connectWebSocket(host, path) {
    return new Promise((resolve) => {
        const WebSocket = require('ws');
        const url = `wss://${host}${path}`;
        
        console.log(`  WSS: ${url} ... `);
        
        const ws = new WebSocket(url, {
            headers: {
                'User-Agent': CONFIG.userAgent,
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': `uid=${CONFIG.hgUid}`,
                'Origin': `https://${host}`,
                'Referer': `https://${host}/`
            },
            handshakeTimeout: 8000
        });
        
        let result = { url, status: 'unknown', data: null };
        
        ws.on('open', () => {
            console.log(`    OPEN!`);
            result.status = 'OPEN';
            // Wait for initial message
            setTimeout(() => {
                ws.close();
                resolve(result);
            }, 3000);
        });
        
        ws.on('message', (data) => {
            const msg = data.toString();
            console.log(`    Received: ${msg.substring(0, 200)}`);
            result.data = msg;
        });
        
        ws.on('close', (code, reason) => {
            const desc = reason ? reason.toString() : '';
            console.log(`    Closed (code=${code} desc="${desc}")`);
            if (result.status !== 'OPEN') {
                result.status = `Closed:${code}`;
            }
            resolve(result);
        });
        
        ws.on('error', (err) => {
            const msg = err.message;
            if (msg.includes('403') || msg.includes('Forbidden')) {
                console.log(`    403 Forbidden (path exists!)`);
                result.status = '403';
            } else if (msg.includes('404') || msg.includes('not found')) {
                console.log(`    404 Not Found`);
                result.status = '404';
            } else if (msg.includes('unexpected') || msg.includes('protocol') || msg.includes('upgrade')) {
                console.log(`    Protocol error (path may exist)`);
                result.status = 'ProtocolError';
            } else {
                console.log(`    Error: ${msg.substring(0, 80)}`);
                result.status = 'Error';
            }
            resolve(result);
        });
        
        // Timeout
        setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) {
                ws.terminate();
                result.status = 'Timeout';
                resolve(result);
            }
        }, 10000);
    });
}

async function main() {
    console.log('=== HgCeApp Login + WebSocket (Node.js) ===\n');
    
    // Step 1: Login
    let workingHost = await tryLogin();
    
    // Step 2: Try member data
    if (!workingHost) {
        for (const host of CONFIG.apiHosts) {
            const data = await tryGetMemberData(host);
            if (data && (data.includes('<code>200</code>') || data.includes('<code>601</code>'))) {
                workingHost = host;
                console.log(`  SESSION VALID on ${host}!`);
                break;
            }
        }
    }
    
    // Step 3: Try game list
    if (workingHost) {
        await tryGetGameList(workingHost);
    }
    
    // Step 4: Connect WebSocket
    console.log('\n[4] Connecting to WebSocket...\n');
    
    const wsHost = workingHost || 'www.hga050.com';
    const wsPaths = [
        '/ws', '/realtime', '/socket', '/api/ws', '/eventbus',
        '/client', '/push', '/live', '/stream', '/feed',
        '/corner/ws', '/game/ws', '/data/ws', '/sport/ws',
        '/bet/ws', '/app/ws', '/connect', '/ws/live',
        '/api/socket', '/hub', '/signalr/connect', '/v1/ws'
    ];
    
    let wsUrl = null;
    const results = [];
    
    for (const path of wsPaths) {
        const result = await connectWebSocket(wsHost, path);
        results.push(result);
        if (result.status === 'OPEN') {
            wsUrl = result.url;
            break;
        }
    }
    
    // Also try on m510.crw066.com if different
    if (wsHost !== 'm510.crw066.com') {
        console.log('\n  Also trying m510.crw066.com...');
        for (const path of ['/ws', '/realtime', '/client', '/push', '/live']) {
            const result = await connectWebSocket('m510.crw066.com', path);
            results.push(result);
            if (result.status === 'OPEN') {
                wsUrl = result.url;
                break;
            }
        }
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('SUMMARY\n');
    
    const interesting = results.filter(r => r.status !== 'Error' && r.status !== 'Timeout' && r.status !== '404');
    if (interesting.length > 0) {
        console.log('Interesting results:');
        interesting.forEach(r => console.log(`  ${r.status} - ${r.url}`));
    }
    
    // Write result
    const fs = require('fs');
    const path = require('path');
    const urlFile = path.join(__dirname, 'websocket_url.txt');
    
    if (wsUrl) {
        fs.writeFileSync(urlFile, wsUrl, 'utf8');
        console.log(`\n[SUCCESS] WebSocket URL: ${wsUrl}`);
    } else {
        // Find 403 or ProtocolError results (path exists but needs auth)
        const authNeeded = results.filter(r => r.status === '403' || r.status === 'ProtocolError');
        if (authNeeded.length > 0) {
            fs.writeFileSync(urlFile, authNeeded[0].url, 'utf8');
            console.log(`\nLikely WS URL (needs auth): ${authNeeded[0].url}`);
        } else {
            // Find Closed results
            const closed = results.filter(r => r.status.startsWith('Closed'));
            if (closed.length > 0) {
                fs.writeFileSync(urlFile, closed[0].url, 'utf8');
                console.log(`\nBest candidate (server responded): ${closed[0].url}`);
            } else {
                fs.writeFileSync(urlFile, 'wss://www.hga050.com/ws', 'utf8');
                console.log('\nBest guess: wss://www.hga050.com/ws');
            }
        }
    }
    
    console.log(`Written to: ${urlFile}`);
}

main().catch(console.error);
