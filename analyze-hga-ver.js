#!/usr/bin/env node
/**
 * analyze-hga-ver.js
 * 辅助分析 hga050.com 的 ver 签名生成算法
 *
 * 功能：
 * 1. 下载首页 HTML
 * 2. 提取所有 <script src="..."> 链接
 * 3. 下载所有 JS 文件
 * 4. 搜索关键字：ver、sign、md5、get_game_list、timestamp、top.ver、window.ver
 * 5. 输出匹配结果及代码片段
 * 6. 额外提取 top.ver/window.ver 赋值表达式和 md5 调用参数
 *
 * 代理支持：
 * - 优先读取 PUPPETEER_PROXY 环境变量（与项目 browserPool.js 约定一致）
 * - 回退到 HTTP_PROXY / HTTPS_PROXY / ALL_PROXY 环境变量
 * - 支持 HTTP/HTTPS 和 SOCKS5 代理
 *
 * 用法：
 *   node analyze-hga-ver.js
 *   PUPPETEER_PROXY=http://127.0.0.1:7890 node analyze-hga-ver.js
 *   PUPPETEER_PROXY=socks5://127.0.0.1:17891 node analyze-hga-ver.js
 *   HGA_URL=https://www.hga051.com/ node analyze-hga-ver.js
 */

import axios from 'axios';
import { URL } from 'node:url';
import https from 'node:https';

// ========== 代理配置 ==========
let SocksProxyAgent;
try {
  const mod = await import('socks-proxy-agent');
  SocksProxyAgent = mod.SocksProxyAgent || mod.default;
} catch (_) {
  // socks-proxy-agent 未安装，SOCKS5 代理不可用
}

/**
 * 检测代理配置，返回代理信息对象
 */
function detectProxy() {
  // 优先级：PUPPETEER_PROXY > HTTPS_PROXY > HTTP_PROXY > ALL_PROXY
  const proxyUrl =
    process.env.PUPPETEER_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.ALL_PROXY ||
    null;

  if (!proxyUrl) {
    return { type: 'direct', url: null };
  }

  if (/^socks/i.test(proxyUrl)) {
    if (!SocksProxyAgent) {
      console.warn('⚠️  检测到 SOCKS5 代理但 socks-proxy-agent 未安装');
      console.warn('   请运行: npm install socks-proxy-agent');
      console.warn('   回退到直连模式');
      return { type: 'direct', url: null };
    }
    return { type: 'socks5', url: proxyUrl };
  }

  // HTTP/HTTPS 代理
  try {
    const parsed = new URL(proxyUrl);
    return {
      type: 'http',
      url: proxyUrl,
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || (parsed.protocol === 'https:' ? 443 : 80),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
    };
  } catch (e) {
    console.warn(`⚠️  代理 URL 解析失败: ${proxyUrl} - ${e.message}`);
    return { type: 'direct', url: null };
  }
}

// ========== 配置 ==========
const BASE_URL = process.env.HGA_URL || 'https://www.hga050.com/';
const TIMEOUT = 30000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// 搜索关键字（普通词使用 \b 边界匹配）
const KEYWORDS = ['sign', 'md5', 'get_game_list', 'timestamp'];
// ver 需要独立词匹配
const VER_KEYWORD = 'ver';
// 特殊模式
const TOP_VER_PATTERN = /top\.ver\s*=/;
const WINDOW_VER_PATTERN = /window\.ver\s*=/;
const MD5_CALL_PATTERN = /md5\s*\(/;

// ========== 工具函数 ==========

/**
 * 解析相对 URL 为绝对 URL
 */
function resolveUrl(src, baseUrl) {
  try {
    if (/^https?:\/\//i.test(src)) {
      return src;
    }
    return new URL(src, baseUrl).href;
  } catch (e) {
    console.warn(`⚠️  URL 解析失败: ${src} (基础: ${baseUrl}) - ${e.message}`);
    return null;
  }
}

/**
 * 构建 axios 请求配置（含代理）
 */
function buildAxiosConfig(url) {
  const config = {
    timeout: TIMEOUT,
    headers: { 'User-Agent': USER_AGENT },
    responseType: 'text',
  };

  const proxy = detectProxy();
  if (proxy.type === 'http') {
    config.proxy = {
      host: proxy.host,
      port: proxy.port,
      auth: proxy.username
        ? { username: proxy.username, password: proxy.password }
        : undefined,
    };
  } else if (proxy.type === 'socks5') {
    const agent = new SocksProxyAgent(proxy.url);
    config.httpsAgent = agent;
    config.httpAgent = agent;
    // 禁用 axios 内置 proxy 以避免冲突
    config.proxy = false;
  }

  return config;
}

/**
 * 下载指定 URL 内容
 */
async function download(url) {
  try {
    const config = buildAxiosConfig(url);
    const resp = await axios.get(url, config);
    return resp.data;
  } catch (e) {
    const msg = e.code === 'ECONNABORTED' ? '请求超时' : e.message;
    console.warn(`⚠️  下载失败: ${url} - ${msg}`);
    return null;
  }
}

/**
 * 从 HTML 中提取所有 <script src="..."> 链接
 */
function extractScriptSrcs(html) {
  const srcs = [];
  // 匹配 <script src="..."> 和 <script ... src="..."> 格式
  const re = /<script\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    srcs.push(m[1]);
  }
  return srcs;
}

/**
 * 从 HTML 中提取内联 <script> 标签中的 JS 代码
 */
function extractInlineScripts(html) {
  const scripts = [];
  // 匹配不含 src 属性的 <script>...</script>
  const re = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let idx = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    const code = m[1].trim();
    if (code.length > 0) {
      idx++;
      scripts.push({ name: `inline_script_${idx}`, code });
    }
  }
  return scripts;
}

/**
 * 逐行分析 JS 内容，搜索关键字
 */
function analyzeJs(filename, content) {
  const lines = content.split(/\r?\n/);
  const results = [];
  const verRe = new RegExp(`\\b${VER_KEYWORD}\\b`);
  const keywordRes = KEYWORDS.map((kw) => ({ kw, re: new RegExp(`\\b${kw}\\b`, 'i') }));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // 检查 ver 独立词
    if (verRe.test(line)) {
      results.push({
        file: filename,
        line: lineNum,
        keyword: VER_KEYWORD,
        content: line.trim(),
      });
    }

    // 检查其他关键字
    for (const { kw, re } of keywordRes) {
      if (re.test(line)) {
        results.push({
          file: filename,
          line: lineNum,
          keyword: kw,
          content: line.trim(),
        });
      }
    }

    // 检查 top.ver 赋值
    if (TOP_VER_PATTERN.test(line)) {
      results.push({
        file: filename,
        line: lineNum,
        keyword: 'top.ver 赋值',
        content: line.trim(),
        extra: '赋值表达式',
      });
    }

    // 检查 window.ver 赋值
    if (WINDOW_VER_PATTERN.test(line)) {
      results.push({
        file: filename,
        line: lineNum,
        keyword: 'window.ver 赋值',
        content: line.trim(),
        extra: '赋值表达式',
      });
    }

    // 检查 md5 调用
    if (MD5_CALL_PATTERN.test(line)) {
      results.push({
        file: filename,
        line: lineNum,
        keyword: 'md5 调用',
        content: line.trim(),
        extra: 'md5调用',
      });
    }
  }

  return results;
}

// ========== 主流程 ==========

async function main() {
  console.log('═'.repeat(70));
  console.log('  hga050.com ver 签名算法分析工具');
  console.log('═'.repeat(70));

  // 显示代理配置
  const proxy = detectProxy();
  if (proxy.type === 'direct') {
    console.log('\n📡 网络模式: 直连（未设置代理）');
    console.log('   提示: 如需代理，请设置环境变量:');
    console.log('     PUPPETEER_PROXY=http://127.0.0.1:7890');
    console.log('     PUPPETEER_PROXY=socks5://127.0.0.1:17891');
  } else if (proxy.type === 'socks5') {
    console.log(`\n📡 网络模式: SOCKS5 代理 (${proxy.url})`);
  } else {
    console.log(`\n📡 网络模式: HTTP 代理 (${proxy.host}:${proxy.port})`);
  }

  // 显示目标 URL
  const targetUrl = BASE_URL;
  console.log(`🎯 目标地址: ${targetUrl}`);

  // 1. 下载首页
  console.log(`\n📥 正在下载首页: ${targetUrl}`);
  let html = await download(targetUrl);

  // 如果主域名失败，尝试备用域名
  if (!html && !process.env.HGA_URL) {
    const fallbacks = [
      'https://www.hga051.com/',
      'https://www.hga052.com/',
      'https://www.hga053.com/',
    ];
    for (const fb of fallbacks) {
      console.log(`\n🔄 主域名失败，尝试备用: ${fb}`);
      html = await download(fb);
      if (html) {
        console.log(`✅ 备用域名 ${fb} 可用`);
        break;
      }
    }
  }

  if (!html) {
    console.error('❌ 无法下载首页（所有域名均失败），退出');
    console.error('   建议: 1) 检查网络连接  2) 设置代理环境变量  3) 通过 HGA_URL 指定可用域名');
    process.exit(1);
  }

  // 使用实际成功的 URL 作为基础 URL
  let effectiveBaseUrl = process.env.HGA_URL || BASE_URL;
  console.log(`✅ 首页下载成功，长度: ${html.length} 字符`);

  // 检测是否为 JS 跳转页面（首页无 <script src> 且包含 getWebUrl/goToUrl 等跳转函数）
  const isRedirectPage = html.includes('getWebUrl') || html.includes('goToUrl');
  if (isRedirectPage && !extractScriptSrcs(html).length) {
    console.log('\n🔄 检测到首页为 JS 跳转页面，尝试 POST 跳转获取实际内容...');

    // 从 HTML 中提取跳转目标域名
    const domainMatch = html.match(/getWebDomain\s*\(\)\s*\{\s*return\s*["']([^"']+)["']/);
    const protocolMatch = html.match(/getProtocal\s*\(\)\s*\{\s*return\s*["']([^"']+)["']/);

    // 构造跳转 URL
    let redirectUrl;
    if (domainMatch) {
      const proto = protocolMatch ? protocolMatch[1] : 'https:';
      redirectUrl = proto + '//' + domainMatch[1];
    } else {
      // getWebUrl() = protocol + "//" + domain，即跳转回自身
      redirectUrl = effectiveBaseUrl.replace(/\/$/, '');
    }

    console.log(`   跳转目标: ${redirectUrl}`);

    // 模拟 POST 跳转（首页 init() 通过 POST 提交表单）
    try {
      const config = buildAxiosConfig(redirectUrl);
      config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      config.headers['Referer'] = effectiveBaseUrl;
      const postResp = await axios.post(redirectUrl, 'detection=Y&sub_doubleLogin=&isapp=&q=&appversion=', config);
      const postHtml = postResp.data;
      if (postHtml && postHtml.length > html.length) {
        console.log(`✅ POST 跳转成功，获取到 ${postHtml.length} 字符的页面`);
        html = postHtml;
        effectiveBaseUrl = redirectUrl + '/';
      } else {
        console.log(`⚠️  POST 跳转返回页面较小 (${postHtml?.length || 0} 字符)，忽略`);
      }
    } catch (e) {
      console.warn(`⚠️  POST 跳转失败: ${e.message}`);
    }

    // 如果 POST 跳转后仍无 script src 和内联脚本，尝试 GET 请求常见路径
    if (!extractScriptSrcs(html).length && !extractInlineScripts(html).length) {
      console.log('\n🔄 尝试常见应用路径...');
      const paths = ['/index.html', '/app.html', '/main.html', '/home.html', '/sports'];
      for (const path of paths) {
        const tryUrl = redirectUrl + path;
        console.log(`   尝试: ${tryUrl}`);
        const tryHtml = await download(tryUrl);
        if (tryHtml && extractScriptSrcs(tryHtml).length > 0) {
          console.log(`✅ 找到应用页面: ${tryUrl} (${tryHtml.length} 字符)`);
          html = tryHtml;
          effectiveBaseUrl = redirectUrl;
          break;
        }
      }
    }
  }

  // 调试：输出 HTML 内容预览
  if (html.length < 5000) {
    console.log('\n📄 HTML 完整内容:');
    console.log('─'.repeat(70));
    console.log(html);
    console.log('─'.repeat(70));
  } else {
    console.log('\n📄 HTML 内容预览 (前 2000 字符):');
    console.log('─'.repeat(70));
    console.log(html.substring(0, 2000));
    console.log('─'.repeat(70));
  }

  // 2. 提取 script src
  const srcs = extractScriptSrcs(html);
  console.log(`\n🔍 发现 ${srcs.length} 个 <script src> 标签:`);
  srcs.forEach((s, i) => console.log(`   [${i + 1}] ${s}`));

  // 提取内联 script
  const inlineScripts = extractInlineScripts(html);
  console.log(`🔍 发现 ${inlineScripts.length} 个内联 <script> 标签`);

  // 3. 解析绝对 URL
  const jsUrls = [];
  for (const src of srcs) {
    const abs = resolveUrl(src, effectiveBaseUrl);
    if (abs) {
      jsUrls.push(abs);
    }
  }
  console.log(`\n📋 待下载 JS 文件 (${jsUrls.length} 个):`);
  jsUrls.forEach((u, i) => console.log(`   [${i + 1}] ${u}`));

  // 4. 下载所有 JS 文件
  console.log('\n📥 开始下载 JS 文件...');
  const jsContents = [];
  for (const url of jsUrls) {
    const filename = url.split('/').pop() || url;
    console.log(`   下载: ${filename} ...`);
    const content = await download(url);
    if (content) {
      jsContents.push({ filename, url, content });
      console.log(`   ✅ ${filename} (${content.length} 字符)`);
    } else {
      console.log(`   ❌ ${filename} 下载失败`);
    }
  }

  // 将内联 script 也加入分析
  for (const { name, code } of inlineScripts) {
    jsContents.push({ filename: name, url: '(inline)', content: code });
  }

  if (jsContents.length === 0) {
    console.error('\n❌ 没有成功下载任何 JS 文件，也无内联脚本，退出');
    process.exit(1);
  }

  // 5. 逐文件分析
  console.log('\n' + '═'.repeat(70));
  console.log('  关键字搜索结果');
  console.log('═'.repeat(70));

  const allResults = [];
  const assignments = []; // top.ver / window.ver 赋值
  const md5Calls = []; // md5 调用

  for (const { filename, content } of jsContents) {
    const results = analyzeJs(filename, content);
    allResults.push(...results);

    for (const r of results) {
      if (r.extra === '赋值表达式') {
        assignments.push(r);
      }
      if (r.extra === 'md5调用') {
        md5Calls.push(r);
      }
    }
  }

  // 输出所有匹配结果
  if (allResults.length === 0) {
    console.log('\n😶 未找到任何关键字匹配');
  } else {
    console.log(`\n共找到 ${allResults.length} 处匹配:\n`);
    for (const r of allResults) {
      console.log(`[${r.file}]:[行${r.line}] 找到关键词 {${r.keyword}}`);
      console.log(`  代码片段: ${r.content}`);
    }
  }

  // 6. 额外输出：ver 赋值表达式
  console.log('\n' + '─'.repeat(70));
  console.log('  🔑 top.ver / window.ver 赋值表达式');
  console.log('─'.repeat(70));
  if (assignments.length === 0) {
    console.log('未发现 top.ver 或 window.ver 赋值');
  } else {
    for (const a of assignments) {
      console.log(`\n[${a.file}]:[行${a.line}]`);
      console.log(`  ${a.content}`);
    }
  }

  // 7. 额外输出：md5 调用
  console.log('\n' + '─'.repeat(70));
  console.log('  🔑 md5 函数调用');
  console.log('─'.repeat(70));
  if (md5Calls.length === 0) {
    console.log('未发现 md5 函数调用');
  } else {
    for (const m of md5Calls) {
      console.log(`\n[${m.file}]:[行${m.line}]`);
      console.log(`  ${m.content}`);
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log('  分析完成');
  console.log('═'.repeat(70));
}

main().catch((e) => {
  console.error('❌ 运行出错:', e.message);
  process.exit(1);
});
