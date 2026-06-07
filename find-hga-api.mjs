// ======================== find-hga-api.js ========================
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const HG_URL = "https://www.hga050.com";
const USERNAME = "johui888";
const PASSWORD = "aa123123";
const OUTPUT_DIR = "output";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "find-hga-result.json");
const NAV_TIMEOUT = 45000;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function safeEval(page, fn, ...args) {
  for (let retry = 0; retry < 3; retry++) {
    try { return await page.evaluate(fn, ...args); }
    catch (e) {
      if (e.message && e.message.includes("Execution context")) {
        console.log("  [eval] retry " + (retry + 1) + "/3");
        await sleep(3000); continue;
      }
      throw e;
    }
  }
  return null;
}

async function closePopups(page) {
  await safeEval(page, () => {
    const ids = ["ok_btn","C_ok_btn","alert_ok","msg_ok","message_ok","C_msg_ok",
      "C_alert_ok","C_alert_ok_system","L_close_alert_msg","close_alert_msg",
      "close_alert_msgsystem","kick_ok_btn","no_btn","C_no_btn","yes_btn","C_yes_btn"];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) { try { el.click(); } catch(_) {} }
    }
    document.querySelectorAll("button, a, div[onclick], span[onclick]").forEach((b) => {
      const t = (b.textContent || b.value || "").trim();
      if (["确认","OK","是","Yes","提交","Submit"].includes(t)) { try { b.click(); } catch(_) {} }
    });
  });
}

async function handleKick(page) {
  const result = await safeEval(page, () => {
    // 检测弹窗元素（而非 body 文本）
    const kickBtn = document.getElementById("kick_ok_btn");
    if (kickBtn) { kickBtn.click(); return "kick"; }
    
    const popup = document.getElementById("system_popup");
    if (popup && popup.classList.contains("on")) {
      for (const id of ["C_alert_ok_system","C_alert_ok","alert_ok","ok_btn","C_ok_btn","msg_ok","message_ok"]) {
        const el = document.getElementById(id);
        if (el) { el.click(); return "sys_" + id; }
      }
      // 点确认
      const all = popup.querySelectorAll("button, div[onclick]");
      for (const b of all) {
        if ((b.textContent||"").trim() === "确认") { b.click(); return "confirm"; }
      }
    }
    return "none";
  });
  if (result !== "none") console.log("  [kick] " + result);
}

async function getState(page) {
  return await safeEval(page, () => {
    const b = document.body?.textContent || "";
    const usr = document.getElementById("usr");
    const h = (k) => b.includes(k);
    const sportBtn = document.getElementById("old_ft_live_league");
    return {
      hasUsr: !!usr,
      formHidden: usr ? (getComputedStyle(usr).display === "none" || getComputedStyle(usr).visibility === "hidden") : true,
      hasSport: !!(sportBtn && getComputedStyle(sportBtn).display !== "none" && getComputedStyle(sportBtn).visibility !== "hidden"),
      hasMyEv: h("My Events") || h("My Bets"),
      hasInPlay: h("In-Play"),
      hasPc: (() => { const e = document.getElementById("back_login"); return !!(e && getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden"); })(),
      hasErr: (() => { const e = document.getElementById("text_error"); return !!(e && e.style.display !== "none" && (e.textContent||"").trim()); })(),
      kicked: b.includes("logged out") || b.includes("kicked") || b.includes("被踢"),
      url: window.location.href,
      title: document.title || "",
      bodyLen: b.length,
      bodyPv: b.replace(/\s+/g, " ").substring(0, 150),
    };
  }) || {};
}

async function login(page) {
  console.log("[login] goto ...");
  await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
  try { console.log("[login] url=" + page.url()); } catch(_) {}
  await sleep(8000);
  await closePopups(page);
  await handleKick(page);
  try { await page.screenshot({ path: "output/login-01.png" }); } catch (_) {}

  let st = await getState(page);
  console.log("[login] usr=" + st.hasUsr + " sport=" + st.hasSport + " bodyLen=" + st.bodyLen);

  // 主循环
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      console.log("[login] attempt " + (attempt+1) + "/5");
      await page.goto(HG_URL, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      await sleep(8000);
    }
    await closePopups(page);
    await handleKick(page);
    st = await getState(page);

    // 登录成功
    if ((st.hasSport || st.hasMyEv || st.hasInPlay || st.formHidden) && !st.kicked) {
      console.log("[login] OK " + JSON.stringify({sport:st.hasSport,myEv:st.hasMyEv,inPlay:st.hasInPlay,formH:st.formHidden}));
      return true;
    }

    // 等登录表单
    if (!st.hasUsr) {
      for (let w = 0; w < 6; w++) {
        await sleep(5000);
        await closePopups(page);
        await handleKick(page);
        st = await getState(page);
        if (st.hasSport || st.hasMyEv || st.hasInPlay) { console.log("[login] logged in"); return true; }
        if (st.hasUsr) break;
      }
    }

    if (!st.hasUsr) { console.log("[login] no form"); continue; }

    // 填表（即使 kicked 也填，因为弹窗已关闭）
    console.log("[login] fill form...");
    await safeEval(page, (u, p) => {
      const ue = document.getElementById("usr"); const pe = document.getElementById("pwd");
      if (ue) { ue.value = u; ue.dispatchEvent(new Event("input", { bubbles: true })); }
      if (pe) { pe.value = p; pe.dispatchEvent(new Event("input", { bubbles: true })); }
    }, USERNAME, PASSWORD);
    await sleep(1000);
    try {
      const r = await page.$("#remember");
      if (r) { const c = await page.evaluate((el) => el.checked, r); if (!c) await r.click(); }
    } catch (_) {}
    await sleep(500);

    console.log("[login] click login...");
    await safeEval(page, () => { const b = document.getElementById("btn_login"); if (b) b.click(); });
    await sleep(15000);
    try { await page.screenshot({ path: "output/login-02-after.png" }); } catch (_) {}

    // 轮询
    console.log("[login] polling (60s)...");
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      await closePopups(page);
      await handleKick(page);

      try { st = await getState(page); } catch (_) { await sleep(3000); continue; }
      if (!st) continue;

      if (st.hasErr) { console.error("[login] error"); return false; }
      if (st.hasPc) {
        console.log("[login] passcode...");
        await safeEval(page, () => { const b = document.querySelector("#back_login"); if (b) b.click(); });
        await sleep(4000);
        await safeEval(page, (u, p) => {
          const ue = document.getElementById("usr"); const pe = document.getElementById("pwd");
          if (ue) { ue.value = u; ue.dispatchEvent(new Event("input", { bubbles: true })); }
          if (pe) { pe.value = p; pe.dispatchEvent(new Event("input", { bubbles: true })); }
        }, USERNAME, PASSWORD);
        await sleep(500);
        await safeEval(page, () => { const b = document.getElementById("btn_login"); if (b) b.click(); });
        await sleep(10000);
        continue;
      }

      if ((st.hasSport || st.hasMyEv || st.hasInPlay || st.formHidden) && !st.kicked) {
        console.log("[login] OK round " + (i+1));
        console.log("[login] body: " + (st.bodyPv||"").substring(0,100));
        try { await page.screenshot({ path: "output/login-03-ok.png" }); } catch (_) {}
        return true;
      }

      if (i % 15 === 14) console.log("[login] " + (i+1) + "s " + JSON.stringify({sport:st.hasSport,myEv:st.hasMyEv,formH:st.formHidden,kicked:st.kicked,body:st.bodyPv.substring(0,60)}));
    }
  }

  try { await page.screenshot({ path: "output/login-timeout.png" }); } catch (_) {}
  console.error("[login] timeout");
  return false;
}

// ======================== 响应分析 ========================
const MK = [
  "homeTeam","awayTeam","home_team","away_team","home","away","team1","team2",
  "TEAM_H","TEAM_C","GID","LEAGUE",
  "score","SCORE_H","SCORE_C","homeScore","awayScore",
  "handicap","odds","corner","RATIO_ROUO","RATIO_XROUO",
  "matchId","match_id","eventId","event_id","gameId",
  "RETIMESET","RUNNING","MORE","IOR_ROUHO","IOR_XROUO","RATIO_ROUHO","RATIO_ROUCO",
];

function scoreResponse(url, text) {
  const reasons = [];
  let score = 0, mf = [], fmt = "?";
  const uh = ["transform","api","live","match","odds","corner","data","gismo","betradar","event","game","fixture"]
    .filter((k) => url.toLowerCase().includes(k));
  if (uh.length) { score += 3; reasons.push("URL:" + uh.join(",")); }
  let p = null;
  try { p = JSON.parse(text); fmt = "json"; } catch (_) {}
  if (!p) {
    const om = text.match(/<original>([\s\S]*?)<\/original>/);
    if (om) { fmt = "xml+json"; try { p = JSON.parse(om[1]); reasons.push("XML+JSON"); score += 2; } catch (_) {} }
    else if (text.startsWith("<?xml") || text.startsWith("<serverresponse")) {
      fmt = "xml";
      score += text.includes("<GID>") || text.includes("<TEAM_H>") ? 2 : 1;
      reasons.push(score >= 2 ? "XML含比赛标签" : "XML");
    }
  }
  if (p) {
    const found = new Set();
    (function s(o, d) {
      if (d > 5 || !o || typeof o !== "object") return;
      if (Array.isArray(o)) { if (o.length > 0) s(o[0], d+1); return; }
      for (const k of Object.keys(o)) {
        if (MK.some((kw) => k === kw || k.toLowerCase() === kw.toLowerCase())) found.add(k);
        if (typeof o[k] === "object" && o[k] !== null) s(o[k], d+1);
      }
    })(p, 0);
    mf = [...found].sort();
    if (mf.length >= 5) { score += 5; reasons.push(mf.length + "fields"); }
    else if (mf.length >= 2) { score += 3; reasons.push(mf.length + "fields"); }
    else if (mf.length === 1) { score += 1; reasons.push("1field"); }
    let ac = 0;
    (function ca(obj, d) {
      if (d > 3) return;
      if (Array.isArray(obj) && obj.length > 0 && obj[0] && typeof obj[0] === "object") {
        if (Object.keys(obj[0]).filter((k) => MK.some((kw) => k===kw || k.toLowerCase()===kw.toLowerCase())).length >= 3) ac++;
      }
      if (obj && typeof obj === "object" && !Array.isArray(obj)) for (const v of Object.values(obj)) ca(v, d+1);
    })(p, 0);
    if (ac > 0) { score += 2; reasons.push(ac + "arr"); }
    const gk = Object.keys(p).filter((k) => k.startsWith("GAME_"));
    if (gk.length) { score += 2; reasons.push("GAME_x" + gk.length); }
  }
  return { score, reason: reasons, matchFields: mf, format: fmt };
}

async function navigateInPlay(page) {
  console.log("[nav] In-Play...");
  await closePopups(page);
  await sleep(2000);
  const already = await safeEval(page, () => {
    const b = document.body?.textContent || "";
    return b.includes("In-Play") || b.includes("Soccer");
  });
  if (!already) {
    try {
      const ok = await safeEval(page, () => {
        const btn = document.getElementById("old_ft_live_league");
        if (btn) { btn.click(); return true; }
        return false;
      });
      console.log("[nav] Soccer: " + (ok ? "ok" : "nf"));
    } catch (_) {}
  }
  await sleep(8000);
  try {
    await page.waitForFunction(() => document.querySelectorAll("div.box_lebet_odd, div.box_lebet, div.bet_box").length > 0, { timeout: 20000 });
    console.log("[nav] rendered");
  } catch (_) { console.log("[nav] timeout"); }
}

async function main() {
  console.log("=".repeat(40) + "\n  find-hga-api  " + new Date().toISOString() + "\n" + "=".repeat(40) + "\n");
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu","--disable-blink-features=AutomationControlled","--lang=zh-CN,zh"],
    timeout: 60000,
  });
  console.log("[browser] " + (await browser.version()));

  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
  await page.setViewport({ width: 1920, height: 1400 });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", { get: () => [1,2,3,4,5] });
    Object.defineProperty(navigator, "languages", { get: () => ["zh-CN","zh"] });
    Object.defineProperty(navigator, "platform", { get: () => "Win32" });
  });

  const captured = [];
  const wsUrls = [];
  let abortCount = 0;

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const rt = req.resourceType();
    if (["image","stylesheet","font","media"].includes(rt)) { abortCount++; req.abort(); return; }
    if (rt === "xhr" || rt === "fetch") console.log("[REQ] " + req.method() + " " + req.url().substring(0,180));
    req.continue();
  });

  page.on("response", async (res) => {
    if (res.request().resourceType() !== "xhr" && res.request().resourceType() !== "fetch") return;
    try {
      const t = await res.text();
      captured.push({ url: res.url(), method: res.request().method(), status: res.status(), ct: res.headers()["content-type"] || "", body: t.substring(0, 150000) });
      console.log("[RES] " + res.status() + " " + res.url().substring(0,180) + " (" + t.length + "b)");
    } catch (_) {}
  });

  page.on("websocket", (ws) => { wsUrls.push(ws.url()); console.log("[WS] " + ws.url()); });

  if (!(await login(page))) { console.error("[main] login fail"); await browser.close(); process.exit(1); }

  await navigateInPlay(page);
  console.log("[nav] collect 25s...");
  await sleep(25000);

  console.log("\n" + "=".repeat(40) + "\n  Results (" + captured.length + " XHR, " + abortCount + " static, " + wsUrls.length + " WS)\n" + "=".repeat(40));

  const analyzed = [];
  for (const e of captured) {
    const { score, reason, matchFields, format } = scoreResponse(e.url, e.body);
    analyzed.push({ url: e.url, status: e.status, ct: e.ct, fmt: format, score, reason, mf: matchFields, size: e.body.length });
  }
  analyzed.sort((a, b) => b.score - a.score);

  let mc = 0;
  const seenU = new Set();
  for (const a of analyzed) {
    const uk = a.url + "|" + a.size;
    if (seenU.has(uk)) continue;
    seenU.add(uk);
    let label;
    if (a.score >= 6) { label = "LIKELY"; mc++; }
    else if (a.score >= 3) label = "MAYBE";
    else label = "---";
    console.log("\n[" + label + "|" + a.score + "] " + a.url.substring(0,130));
    console.log("  " + a.status + " " + a.fmt + " " + a.size + "b " + a.ct);
    if (a.mf.length) console.log("  fields(" + a.mf.length + "): " + a.mf.slice(0,15).join(", ") + (a.mf.length>15?" ...":""));
    for (const r of a.reason) console.log("  -> " + r);
  }

  console.log("\n=== Summary ===");
  console.log("Match APIs: " + mc + "/" + captured.length);
  if (mc > 0) {
    console.log("\nTop:");
    for (const a of analyzed.filter((x) => x.score >= 6)) {
      console.log("  " + a.url);
      console.log("  " + a.score + "pts " + a.status + " " + a.fmt + " " + a.mf.slice(0,20).join(", "));
    }
  }
  if (wsUrls.length) console.log("\nWS: " + wsUrls.join(", "));

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    meta: { ts: new Date().toISOString(), total: captured.length, ws: wsUrls.length, mc, abort: abortCount },
    wsUrls, analyzed,
    all: captured.map((c) => ({ url: c.url, status: c.status, preview: c.body.substring(0, 3000), size: c.body.length })),
  }, null, 2), "utf-8");
  console.log("\nSaved: " + OUTPUT_FILE + "\nDone");
  await browser.close();
}

main().catch((e) => { console.error("[fatal]", e); process.exit(1); });