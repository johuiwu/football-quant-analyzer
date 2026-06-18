// ======================== 纯 HTTP 投注执行器 ========================
// 替代浏览器 DOM 交互方式，使用纯 HTTP 请求完成投注
// 流程：FT_order_view → 构造 wagers XML → Total_bet/FT_bet

import axios from "axios";
import { loadCredentials, getBaseUrl } from "./credentialManager.js";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// ======================== 工具函数 ========================

function pick(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"));
  return m ? m[1] : null;
}

function pickAttr(xml, tag, attr) {
  const m = xml.match(new RegExp(`<${tag}\\s+[^>]*${attr}="([^"]*)"`, "i"));
  return m ? m[1] : null;
}

/**
 * 向 transform_nl.php 发送 POST 请求
 */
async function postNL(baseUrl, ver, cookieStr, body) {
  const url = baseUrl + "/transform_nl.php?ver=" + encodeURIComponent(ver);
  const res = await axios.post(url, body, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": DESKTOP_UA,
      Accept: "*/*",
      "Accept-Language": "zh-cn",
      Origin: baseUrl,
      Cookie: cookieStr,
    },
    timeout: 15000,
    validateStatus: (s) => s < 400,
  });
  return res.data;
}

/**
 * 向 transform.php 发送 POST 请求
 */
async function postTransform(baseUrl, ver, cookieStr, body) {
  const url = baseUrl + "/transform.php?ver=" + encodeURIComponent(ver);
  const res = await axios.post(url, body, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": DESKTOP_UA,
      Accept: "*/*",
      "Accept-Language": "zh-cn",
      Origin: baseUrl,
      Cookie: cookieStr,
    },
    timeout: 15000,
    validateStatus: (s) => s < 400,
  });
  return res.data;
}

// ======================== Step 1: FT_order_view ========================

/**
 * 调用 FT_order_view 获取投注单信息
 * @param {Object} cred - { uid, ver, cookieStr, apiDomain }
 * @param {string} gid - 比赛 ID
 * @param {string} wtype - 投注类型 (RE=让球, ROU=大小, R=独赢)
 * @param {string} choseTeam - 选择方向 (H=主, C=客, O=大, U=小)
 * @returns {Promise<Object|null>} orderView 字段对象，失败返回 null
 */
async function fetchOrderView(cred, gid, wtype, choseTeam) {
  const params = new URLSearchParams({
    p: "FT_order_view",
    uid: cred.uid,
    ver: cred.ver,
    langx: "zh-cn",
    odd_f_type: "H",
    gid,
    gtype: "FT",
    wtype,
    chose_team: choseTeam,
  });

  let dataStr = "";
  try {
    // 优先使用 transform_nl.php（浏览器实际使用的端点）
    const data = await postNL(cred.apiDomain, cred.ver, cred.cookieStr, params.toString());
    dataStr = typeof data === "string" ? data : JSON.stringify(data);
  } catch (e) {
    console.warn("[httpBet] FT_order_view (transform_nl.php) 失败，尝试 transform.php:", e.message);
    try {
      const data = await postTransform(cred.apiDomain, cred.ver, cred.cookieStr, params.toString());
      dataStr = typeof data === "string" ? data : JSON.stringify(data);
    } catch (e2) {
      console.error("[httpBet] FT_order_view 全部失败:", e2.message);
      return null;
    }
  }

  const code = pick(dataStr, "code");
  const errormsg = pick(dataStr, "errormsg");

  if (code === "501") {
    // 成功
    const ov = {
      ioratio: pick(dataStr, "ioratio"),
      ratio: pick(dataStr, "ratio"),
      spread: pick(dataStr, "spread"),
      strong: pick(dataStr, "strong"),
      con: pick(dataStr, "con"),
      gold_gmin: pick(dataStr, "gold_gmin"),
      gold_gmax: pick(dataStr, "gold_gmax"),
      num_c: pick(dataStr, "num_c"),
      num_h: pick(dataStr, "num_h"),
      ptype: pick(dataStr, "ptype"),
      dg: pick(dataStr, "dg"),
      delaysec: pick(dataStr, "delaysec") || "0",
      league_id: pick(dataStr, "league_id"),
      team_id_c: pick(dataStr, "team_id_c"),
      team_id_h: pick(dataStr, "team_id_h"),
      pay_type: pick(dataStr, "pay_type"),
      score: pick(dataStr, "score"),
      date: pick(dataStr, "date") || pick(dataStr, "dates"),
      time: pick(dataStr, "time") || pick(dataStr, "times"),
      league_name: pick(dataStr, "league_name"),
      team_name_c: pick(dataStr, "team_name_c"),
      team_name_h: pick(dataStr, "team_name_h"),
      rtype: pick(dataStr, "rtype") || "rb",
      ball_act: pick(dataStr, "ball_act") || "N",
      dg_mode: pick(dataStr, "dg_mode") || "N",
      gid: pick(dataStr, "gid") || gid,
      wtype: pick(dataStr, "wtype") || wtype,
    };
    console.log("[httpBet] FT_order_view 成功: ioratio=" + ov.ioratio + " gold范围=" + ov.gold_gmin + "~" + ov.gold_gmax);
    return ov;
  }

  // 错误处理
  if (code === "555") {
    console.warn("[httpBet] FT_order_view 盘口关闭: " + (errormsg || "555"));
    return null;
  }
  if (code === "617") {
    console.warn("[httpBet] FT_order_view 赔率已变动: " + (errormsg || "617"));
    return null;
  }
  if (dataStr.includes("doubleLogin")) {
    console.error("[httpBet] FT_order_view 凭证已过期（doubleLogin）");
    return null;
  }
  if (dataStr.includes("CheckEMNU")) {
    console.error("[httpBet] FT_order_view 参数缺失（CheckEMNU）");
    return null;
  }

  console.error("[httpBet] FT_order_view 未知响应: code=" + code + " errormsg=" + errormsg);
  return null;
}

// ======================== Step 2: 构造 wagers XML ========================

/**
 * 从 FT_order_view 响应构造完整的 wagers XML 文档
 * @param {Object} ov - FT_order_view 返回的字段
 * @param {Object} betData - 投注参数
 * @returns {string} 完整的 wagers XML 文档
 */
function buildWagersXml(ov, betData) {
  const tid = String(Date.now());
  const { wtype, choseTeam, amount, matchName } = betData;

  // 确定方向
  const type = ov.strong === "C" ? "C" : "H";
  const showtype = "live";
  const ptype = ov.pay_type || "1";
  const dg = ov.dg || "N";
  const ballact = (dg === "Y" || ov.ball_act === "Y") ? "1" : "0";
  const delaysec = ov.delaysec || "0";
  const gold = String(amount || ov.gold_gmin || "50");
  const ioratio = ov.ioratio || "";
  const winGold = (parseFloat(gold) * parseFloat(ioratio || "0")).toFixed(2);

  // 解析队名
  const parts = (matchName || "").split(" vs ");
  const teamH = parts[0] || ov.team_name_h || "";
  const teamC = parts[1] || ov.team_name_c || "";

  // result 字段：选择方向对应的队名
  let result = "";
  if (choseTeam === "H") result = teamH;
  else if (choseTeam === "C") result = teamC;
  else if (choseTeam === "O") result = teamH + " " + (ov.con || "0");
  else if (choseTeam === "U") result = teamC + " " + (ov.con || "0");
  else result = teamH;

  // team_h_ratio / team_c_ratio
  let team_h_ratio = "";
  let team_c_ratio = "";
  const R_ary = ["R", "HR", "RE", "HRE", "PR", "HPR"];
  if (R_ary.includes(wtype)) {
    if (type === "H") team_h_ratio = ov.spread || "";
    else team_c_ratio = ov.spread || "";
  }

  // OU 方向 result 追加 concede
  const OU_ary = ["ROU", "HROU", "ROUH", "ROUC", "OU", "HOU", "OUH", "OUC"];
  if (OU_ary.includes(wtype)) {
    result += " " + (ov.con || "0");
  }

  // str_gtype: "FT " (带空格)
  const str_gtype = "FT ";
  const str_w_ms = "";
  const str_wtype = wtype;

  // wagers 片段
  const wagersXml =
    `<wagers tid='${tid}'>` +
    `<w_id>${tid}</w_id>` +
    `<addtime></addtime>` +
    `<oddf_type></oddf_type>` +
    `<gidfl>0</gidfl>` +
    `<gid></gid>` +
    `<gtype>${str_gtype}</gtype>` +
    `<bet_gtype>FT</bet_gtype>` +
    `<wtype>${_chkXmlTag(str_wtype)}</wtype>` +
    `<w_ms>${str_w_ms}</w_ms>` +
    `<bet_wtype>${wtype}</bet_wtype>` +
    `<league>${_chkXmlTag(ov.league_name || "")}</league>` +
    `<team_id_h>${ov.team_id_h || ""}</team_id_h>` +
    `<team_id_c>${ov.team_id_c || ""}</team_id_c>` +
    `<team_h_show>${_chkXmlTag(teamH)}</team_h_show>` +
    `<team_c_show>${_chkXmlTag(teamC)}</team_c_show>` +
    `<team_h_ratio>${team_h_ratio}</team_h_ratio>` +
    `<team_c_ratio>${team_c_ratio}</team_c_ratio>` +
    `<strong>${ov.strong || "H"}</strong>` +
    `<org_score></org_score>` +
    `<score>${ov.score || ""}</score>` +
    `<result>${_chkXmlTag(result)}</result>` +
    `<pname></pname>` +
    `<ioratio>${ioratio}</ioratio>` +
    `<rtype>${ov.rtype || "rb"}</rtype>` +
    `<type>${type}</type>` +
    `<concede>${ov.con || "0"}</concede>` +
    `<adddate></adddate>` +
    `<fore_result></fore_result>` +
    `<odd_f></odd_f>` +
    `<code_value></code_value>` +
    `<ptype>${ptype}</ptype>` +
    `<showtype>${showtype}</showtype>` +
    `<bet_showtype></bet_showtype>` +
    `<ball_map></ball_map>` +
    `<delaysec>${delaysec}</delaysec>` +
    `<dg>${dg}</dg>` +
    `<dg_str></dg_str>` +
    `<ball_act_class></ball_act_class>` +
    `<ball_act_ret></ball_act_ret>` +
    `<ballact>${ballact}</ballact>` +
    `<cancel_apn></cancel_apn>` +
    `<gold>${gold}</gold>` +
    `<win_gold>${winGold}</win_gold>` +
    `<cancel_line></cancel_line>` +
    `</wagers>`;

  // 完整 wagers XML 文档（必须包含 XML 声明和 serverresponse 包装）
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<serverresponse><code>todaywagers</code><amout_gold></amout_gold><count></count><ts>nocheck</ts>` +
    wagersXml +
    `</serverresponse>`;
}

/**
 * XML 标签特殊字符转义（与浏览器 JS 的 chkXmlTag 一致）
 */
function _chkXmlTag(tag) {
  if (!tag) return "";
  return String(tag)
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&nbsp;/g, " ");
}

// ======================== Step 3: Total_bet / FT_bet ========================

/**
 * 提交投注
 * @param {Object} cred - { uid, ver, cookieStr, apiDomain }
 * @param {string} wagersXml - 完整的 wagers XML 文档
 * @param {string} gid - 比赛 ID
 * @param {string} wtype - 投注类型
 * @returns {Promise<{ success: boolean, code?: string, error?: string, insufficient?: boolean }>}
 */
async function submitBet(cred, wagersXml, gid, wtype) {
  // 使用 Total_bet（浏览器实际使用的投注提交命令）
  const params = new URLSearchParams({
    p: "Total_bet",
    uid: cred.uid,
    ver: cred.ver,
    langx: "zh-cn",
    wagers: wagersXml,
    gtype: "ft",
    showtype: "live",
  });

  let dataStr = "";
  try {
    const data = await postNL(cred.apiDomain, cred.ver, cred.cookieStr, params.toString());
    dataStr = typeof data === "string" ? data : JSON.stringify(data);
  } catch (e) {
    console.error("[httpBet] Total_bet 请求失败:", e.message);
    return { success: false, error: "网络请求失败: " + e.message };
  }

  const code = pick(dataStr, "code");
  const errormsg = pick(dataStr, "errormsg");

  // todaywagers = 服务器接受了 wagers XML
  if (code === "todaywagers") {
    console.log("[httpBet] Total_bet 成功: code=todaywagers");
    return { success: true, code: "todaywagers" };
  }

  // 投注成功相关 code
  if (code === "501" || code === "502" || code === "503") {
    console.log("[httpBet] Total_bet 成功: code=" + code);
    return { success: true, code };
  }

  // 余额不足
  if (dataStr.includes("Insufficient") || dataStr.includes("不足") ||
      dataStr.includes("insufficient balance") || dataStr.includes("余额不足")) {
    console.warn("[httpBet] Total_bet 余额不足");
    return { success: false, insufficient: true, error: "余额不足" };
  }

  // 赔率变动
  if (code === "617" || (errormsg && errormsg.includes("odds changed"))) {
    console.warn("[httpBet] Total_bet 赔率已变动");
    return { success: false, error: "赔率已变动" };
  }

  // 盘口关闭
  if (code === "555") {
    console.warn("[httpBet] Total_bet 盘口已关闭");
    return { success: false, error: "盘口已关闭" };
  }

  // injection 检测
  if (dataStr.includes("injection")) {
    console.error("[httpBet] Total_bet injection 检测 - wagers XML 格式可能不正确");
    return { success: false, error: "injection 检测" };
  }

  // VariableStandard
  if (dataStr === "VariableStandard" || dataStr.includes("VariableStandard")) {
    console.error("[httpBet] Total_bet 参数验证失败 (VariableStandard)");
    return { success: false, error: "参数验证失败" };
  }

  // doubleLogin
  if (dataStr.includes("doubleLogin")) {
    console.error("[httpBet] Total_bet 凭证已过期 (doubleLogin)");
    return { success: false, error: "凭证已过期" };
  }

  // 未知响应
  console.error("[httpBet] Total_bet 未知响应: code=" + code + " errormsg=" + errormsg + " 长度=" + dataStr.length);
  return { success: false, error: "未知响应: code=" + code };
}

// ======================== 主入口：纯 HTTP 投注 ========================

/**
 * 通过纯 HTTP 执行投注
 * @param {Object} betData - 投注数据
 * @param {string} betData.matchName - 比赛名称
 * @param {string} betData.matchId - 比赛 ID (GID)
 * @param {number} betData.odds - 目标赔率
 * @param {number} betData.amount - 投注金额
 * @param {number} betData.handicap - 盘口值
 * @param {string} betData.strategyId - 策略ID
 * @param {string} betData.betDirection - 投注方向 (over/under/next/auto)
 * @returns {Promise<{success: boolean, transactionId?: string, error?: string, insufficient?: boolean}>}
 */
export async function executeBetViaHttp(betData) {
  const { matchName, matchId, odds, amount, strategyId, betDirection = "auto", handicap } = betData;

  console.log(`[httpBet] 开始纯HTTP投注: ${matchName} (${matchId}) 策略${strategyId} 方向${betDirection} 赔率${odds} 金额${amount}`);

  // 1. 加载凭证
  const cred = loadCredentials();
  if (!cred) {
    return { success: false, error: "凭证无效或已过期，请先登录" };
  }

  // ★ apiDomain fallback：凭证文件中可能未保存 apiDomain，使用 getBaseUrl() 回退
  if (!cred.apiDomain) {
    cred.apiDomain = getBaseUrl();
    console.log("[httpBet] apiDomain 为空，使用 getBaseUrl() fallback: " + cred.apiDomain);
  }

  // 2. 确定投注方向参数
  const { wtype, choseTeam } = resolveBetDirection(betDirection, handicap);
  console.log(`[httpBet] 投注方向: wtype=${wtype} choseTeam=${choseTeam}`);

  // 3. FT_order_view
  const ov = await fetchOrderView(cred, matchId, wtype, choseTeam);
  if (!ov) {
    return { success: false, error: "FT_order_view 失败（盘口可能已关闭）" };
  }

  // 4. 验证赔率
  if (ov.ioratio) {
    const ovOdds = parseFloat(ov.ioratio);
    if (!isNaN(ovOdds) && Math.abs(ovOdds - odds) > 0.15) {
      console.warn(`[httpBet] 赔率偏差: 期望=${odds} 实际=${ovOdds} 差值=${Math.abs(ovOdds - odds).toFixed(3)}`);
      // 不阻止投注，仅警告
    }
  }

  // 5. 验证金额范围
  const minGold = parseInt(ov.gold_gmin) || 10;
  const maxGold = parseInt(ov.gold_gmax) || 100000;
  const actualAmount = Math.max(minGold, Math.min(amount, maxGold));
  if (actualAmount !== amount) {
    console.log(`[httpBet] 金额调整: ${amount} → ${actualAmount} (范围 ${minGold}~${maxGold})`);
  }

  // 6. 构造 wagers XML
  const wagersXml = buildWagersXml(ov, {
    ...betData,
    wtype,
    choseTeam,
    amount: actualAmount,
  });

  // 7. 提交投注
  const result = await submitBet(cred, wagersXml, matchId, wtype);

  if (result.success) {
    const transactionId = "txn_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    console.log(`[httpBet] 投注成功: ${matchName} txn=${transactionId}`);
    return { success: true, transactionId };
  }

  return result;
}

// ======================== 方向映射 ========================

/**
 * 将 betDirection 映射为 wtype 和 choseTeam
 * @param {string} direction - over/under/next/auto
 * @param {number} handicap - 盘口值
 * @returns {{ wtype: string, choseTeam: string }}
 */
function resolveBetDirection(direction, handicap) {
  switch (direction) {
    case "over":
      return { wtype: "ROU", choseTeam: "O" };
    case "under":
      return { wtype: "ROU", choseTeam: "U" };
    case "home":
    case "next":
      return { wtype: "RE", choseTeam: "H" };
    case "away":
      return { wtype: "RE", choseTeam: "C" };
    case "auto":
    default:
      // 默认让球主队方向
      return { wtype: "RE", choseTeam: "H" };
  }
}

// ======================== 辅助：仅获取赔率（不下注） ========================

/**
 * 通过纯 HTTP 获取投注单信息（不下注）
 * @param {string} gid - 比赛 ID
 * @param {string} wtype - 投注类型
 * @param {string} choseTeam - 选择方向
 * @returns {Promise<Object|null>}
 */
export async function getOrderView(gid, wtype, choseTeam) {
  const cred = loadCredentials();
  if (!cred) return null;
  return await fetchOrderView(cred, gid, wtype, choseTeam);
}
