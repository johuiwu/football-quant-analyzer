import { getSharedPage, isLoggedIn } from "./browserPool.js";
import { navigateToCornersFast } from "./cornerCrawler.js";

// ======================== 工具函数 ========================
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ======================== 三级弹窗处理（投注流程专用） ========================

/**
 * 三级弹窗处理策略
 * 1. 优先点击"否/取消"按钮
 * 2. 再尝试点击"确认/OK"按钮
 * 3. 最后暴力清理（移除 .on 类 + ESC）
 */
async function handleBetPopups(page) {
  try {
    const handled = await page.evaluate(() => {
      // Level 1：点击否/取消按钮
      const cancelSelectors = ["#C_no_btn", "#no_btn", ".btn_cancel"];
      for (const sel of cancelSelectors) {
        const btns = document.querySelectorAll(sel);
        for (const btn of btns) {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const text = (btn.textContent || "").trim().toUpperCase();
            if (text === "NO" || text === "否" || text === "CANCEL" || text === "取消") {
              btn.click();
              return { level: 1, action: "cancel" };
            }
          }
        }
      }

      // Level 2：点击确认/OK按钮
      const okSelectors = ["#C_ok_btn", "#ok_btn", ".btn_confirm", ".btn_submit"];
      for (const sel of okSelectors) {
        const btns = document.querySelectorAll(sel);
        for (const btn of btns) {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const text = (btn.textContent || "").trim().toUpperCase();
            if (text === "OK" || text === "确认" || text === "确定" || text === "是") {
              btn.click();
              return { level: 2, action: "ok" };
            }
          }
        }
      }

      // Level 3：暴力清理
      let cleaned = 0;
      const popupIds = ["C_alert_confirm", "alert_confirm", "alert_show", "system_popup", "alert_kick"];
      for (const id of popupIds) {
        const el = document.getElementById(id);
        if (el && el.classList.contains("on")) {
          el.classList.remove("on");
          cleaned++;
        }
      }
      if (document.body) {
        document.body.classList.remove("scroll_lock", "locked");
        document.body.style.overflow = "";
      }
      return cleaned > 0 ? { level: 3, action: "brutal", cleaned } : null;
    });

    if (handled) {
      console.log("[BetExecutor] 弹窗处理: Level " + handled.level + " " + handled.action);
    }
  } catch (e) {
    // 忽略弹窗处理异常
  }
  try { await page.keyboard.press("Escape"); } catch (_) {}
}

// ======================== 投注执行 ========================

/**
 * 在 hga038.com 上执行一次真实的角球投注操作
 * @param {Object} betData - 投注数据
 * @param {string} betData.matchName - 比赛名称（用于定位比赛行）
 * @param {string} betData.matchId - 比赛ID
 * @param {number} betData.odds - 目标赔率
 * @param {number} betData.amount - 投注金额
 * @param {number} betData.handicap - 盘口值
 * @param {string} betData.strategyId - 策略ID
 * @param {string} betData.betDirection - 投注方向 (over/under/next/auto)
 * @returns {Promise<{success: boolean, transactionId?: string, error?: string, insufficient?: boolean}>}
 */
export async function executeBet(betData) {
  const { matchName, matchId, odds, amount, strategyId, betDirection = "auto", handicap } = betData;

  // 1. 检查登录状态
  if (!isLoggedIn()) {
    console.error("[BetExecutor] 未登录，无法执行投注");
    return { success: false, error: "未登录，请先登录 hga038.com" };
  }

  // 2. 获取共享页面（增加恢复机制）
  let page = getSharedPage();
  if (!page) {
    // 尝试重新获取或创建页面
    console.log("[BetExecutor] 共享页面不可用，尝试恢复...");
    try {
      const bpModule = await import("./browserPool.js");
      if (typeof bpModule.ensureSharedPage === "function") {
        page = await bpModule.ensureSharedPage();
      }
    } catch (e) {
      console.warn("[BetExecutor] 页面恢复失败:", e.message);
    }
    if (!page) {
      console.error("[BetExecutor] 浏览器页面不可用，无法恢复");
      return { success: false, error: "浏览器页面不可用，请确保已登录" };
    }
    console.log("[BetExecutor] 页面恢复成功");
  }

  // 验证页面是否确实处于已登录状态
  try {
    const loginVerified = await page.evaluate(() => {
      const body = document.body?.textContent || "";
      const hasBalance = body.includes("Balance") || body.includes("余额") ||
                         body.includes("Credit") || body.includes("额度");
      const hasAccount = !!document.querySelector(
        "[class*='user'], [class*='account'], [class*='balance'], [class*='member']"
      );
      const hasLogout = body.includes("Logout") || body.includes("登出") ||
                        body.includes("退出");
      return hasBalance || hasAccount || hasLogout;
    });
    if (!loginVerified) {
      console.error("[BetExecutor] 页面未检测到已登录特征");
      return { success: false, error: "登录会话可能已过期，请重新登录 hga038.com" };
    }
  } catch (e) {
    console.warn("[BetExecutor] 登录验证检查异常:", e.message);
  }

  try {
    console.log(`[BetExecutor] 开始执行投注: ${matchName} (${matchId}) 策略${strategyId} 方向${betDirection} 赔率${odds} 金额${amount}`);

    // 3. 导航到角球页面
    await navigateToCornersFast(page);
    await sleep(3000);
    await handleBetPopups(page);

    // 3.5 检测角球页面是否有比赛行
    const hasCornerMatches = await page.evaluate(() => {
      const rows = document.querySelectorAll("div.box_lebet, tr[class*='row'], [class*='event'], [class*='match']");
      return rows.length > 0;
    });

    if (!hasCornerMatches) {
      // 角球页面无比赛，回退到让球/大小页面并尝试在该页面执行投注
      console.log("[BetExecutor] 角球页面无比赛，回退到让球/大小页面尝试投注");
      try {
        await page.evaluate(() => {
          const tabRnou = document.getElementById("tab_rnou");
          if (tabRnou) { tabRnou.click(); return; }
          const allEls = document.querySelectorAll("div, span, a, li");
          for (const el of allEls) {
            const text = (el.textContent || "").trim().toUpperCase();
            if (text === "HDP&O/U" || text === "让球" || text.includes("HANDICAP")) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 10 && rect.height > 8) { el.click(); return; }
            }
          }
        });
        await sleep(2000);
      } catch (e) {}
      // 不再直接返回失败，继续执行后续比赛查找+赔率匹配+投注逻辑
      // 若让球/大小页面也无比赛，后续 match_not_found 会返回失败
    }

    // 4+5. 查找比赛并点击匹配方向的赔率
    const betPlaced = await page.evaluate((data) => {
      const { matchName, odds, betDirection } = data;
      // 支持多种分隔符: " vs ", " v ", " vs.", " v.", " - ", " — "
      const parts = matchName.split(/\s+(?:vs?\.?|[-—])\s+/i);
      const homeTeam = (parts[0] || "").trim();
      const awayTeam = (parts[1] || "").trim();

      // 查找匹配的比赛行
      const rows = document.querySelectorAll("div.box_lebet, tr, [class*='row'], [class*='event'], [class*='match']");
      let targetRow = null;
      for (const row of rows) {
        const text = row.textContent || "";
        if (homeTeam && awayTeam && text.includes(homeTeam) && text.includes(awayTeam)) {
          targetRow = row; break;
        }
        if (text.includes(matchName)) { targetRow = row; break; }
      }
      if (!targetRow) return { success: false, reason: "match_not_found" };

      // 精确选择器：优先 span.text_odds，扩展更多选择器以增强容错
      const selectors = ["span.text_odds", "[class*='text_odds']", "[class*='odd']", "[class*='price']", "[class*='ior']", "[class*='bet']", "[data-odds]"];
      let allOdds = [];
      for (const sel of selectors) {
        const els = targetRow.querySelectorAll(sel);
        if (els.length > 0) { allOdds = Array.from(els); break; }
      }
      if (allOdds.length === 0) {
        // 兜底：支持2-3位小数赔率
        allOdds = Array.from(targetRow.querySelectorAll("span, a")).filter(el => {
          const t = (el.textContent || "").trim();
          return /^\d+\.\d{2,3}$/.test(t);
        });
      }

      // 方向感知匹配
      if (betDirection === "over" && allOdds.length >= 2) {
        for (let i = 0; i < Math.min(2, allOdds.length); i++) {
          const val = parseFloat((allOdds[i].textContent || "").trim());
          if (!isNaN(val) && Math.abs(val - odds) < 0.05) {
            allOdds[i].scrollIntoView({ block: "center" });
            allOdds[i].click();
            return { success: true, clickedOdds: val };
          }
        }
      } else if (betDirection === "under" && allOdds.length >= 2) {
        for (let i = Math.max(0, allOdds.length - 2); i < allOdds.length; i++) {
          const val = parseFloat((allOdds[i].textContent || "").trim());
          if (!isNaN(val) && Math.abs(val - odds) < 0.05) {
            allOdds[i].scrollIntoView({ block: "center" });
            allOdds[i].click();
            return { success: true, clickedOdds: val };
          }
        }
      } else if (betDirection === "next") {
        for (const el of allOdds) {
          const val = parseFloat((el.textContent || "").trim());
          if (!isNaN(val) && Math.abs(val - odds) < 0.05) {
            el.scrollIntoView({ block: "center" });
            el.click();
            return { success: true, clickedOdds: val };
          }
        }
      }

      // auto 或回退：匹配任意赔率
      for (const el of allOdds) {
        const val = parseFloat((el.textContent || "").trim());
        if (!isNaN(val) && Math.abs(val - odds) < 0.05) {
          el.scrollIntoView({ block: "center" });
          el.click();
          return { success: true, clickedOdds: val };
        }
      }

      return { success: false, reason: "odds_not_found" };
    }, { matchName, odds, betDirection });

    if (!betPlaced.success) {
      const errMsg = betPlaced.reason === "match_not_found"
        ? "未找到比赛: " + matchName
        : "未找到匹配赔率 " + odds + " (方向: " + betDirection + ")";
      console.error("[BetExecutor] " + errMsg);
      return { success: false, error: errMsg };
    }

    // 6. 等待投注弹窗出现
    await sleep(2000);
    await handleBetPopups(page);

    // 7. 填写投注金额（三级优先级：ID → 弹窗容器 → 属性匹配）
    const amountFilled = await page.evaluate((amt) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
      ).set;
      function fillInput(inp) {
        inp.value = "";
        inp.focus();
        nativeInputValueSetter.call(inp, String(amt));
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
        inp.dispatchEvent(new Event("blur", { bubbles: true }));
        return true;
      }

      // 优先级1：ID 匹配
      const ids = ["bet_finish_gold", "gold", "credit", "wager_amount", "bet_gold"];
      for (const id of ids) {
        const inp = document.getElementById(id);
        if (inp && inp.tagName === "INPUT") return fillInput(inp);
      }

      // 优先级2：弹窗容器内查找
      const popupSelectors = [
        "[class*='bet_finish']", "[id*='bet_finish']",
        "[class*='bet_popup']", "[class*='wager']"
      ];
      for (const sel of popupSelectors) {
        const container = document.querySelector(sel);
        if (container) {
          const inputs = container.querySelectorAll("input");
          for (const inp of inputs) {
            if (inp.type !== "hidden" && inp.getBoundingClientRect().width > 0) {
              return fillInput(inp);
            }
          }
        }
      }

      // 优先级3：属性匹配
      const inputs = document.querySelectorAll("input[type='text'], input[type='number'], input:not([type='hidden'])");
      for (const inp of inputs) {
        const placeholder = (inp.placeholder || "").toLowerCase();
        const name = (inp.name || "").toLowerCase();
        const className = (inp.className || "").toLowerCase();
        const id = (inp.id || "").toLowerCase();
        if (
          placeholder.includes("stake") || placeholder.includes("amount") ||
          placeholder.includes("金额") || placeholder.includes("bet") ||
          name.includes("stake") || name.includes("amount") || name.includes("bet") ||
          name.includes("gold") || name.includes("credit") ||
          className.includes("stake") || className.includes("amount") ||
          className.includes("gold") || className.includes("credit") ||
          id.includes("gold") || id.includes("credit") || id.includes("amount")
        ) {
          return fillInput(inp);
        }
      }

      return false;
    }, amount);

    if (!amountFilled) {
      console.error("[BetExecutor] 未找到金额输入框，无法继续");
      return { success: false, error: "未找到金额输入框" };
    }

    await sleep(500);

    // 8. 点击确认投注按钮（三级优先级：ID → 弹窗容器 → 文本匹配）
    const confirmed = await page.evaluate(() => {
      // 优先级1：ID 匹配
      const ids = ["btn_submit", "btn_confirm", "bet_finish_submit", "submit_bet"];
      for (const id of ids) {
        const btn = document.getElementById(id);
        if (btn) {
          const rect = btn.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            btn.scrollIntoView({ block: "center" });
            btn.click();
            return true;
          }
        }
      }

      // 优先级2：弹窗容器内查找
      const popupSelectors = [
        "[class*='bet_finish']", "[id*='bet_finish']",
        "[class*='bet_popup']", "[class*='wager']"
      ];
      for (const sel of popupSelectors) {
        const container = document.querySelector(sel);
        if (container) {
          const btns = container.querySelectorAll("button, input[type='submit'], input[type='button'], [class*='submit'], [class*='confirm']");
          for (const btn of btns) {
            const rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              btn.scrollIntoView({ block: "center" });
              btn.click();
              return true;
            }
          }
        }
      }

      // 优先级3：文本匹配
      const keywords = ["下单", "投注", "place bet", "confirm bet", "确认", "提交"];
      const btns = document.querySelectorAll("button, [class*='btn'], a[class*='btn'], input[type='submit'], input[type='button']");
      for (const btn of btns) {
        const text = (btn.textContent || btn.value || "").trim().toLowerCase();
        for (const kw of keywords) {
          if (text.includes(kw)) {
            btn.scrollIntoView({ block: "center" });
            btn.click();
            return true;
          }
        }
      }
      return false;
    });

    if (!confirmed) {
      console.warn("[BetExecutor] 未找到确认按钮，投注可能未完成");
      return { success: false, error: "未找到确认下单按钮" };
    }

    // 9. 等待结果并验证（三分类：insufficient / success / failed）
    await sleep(3000);
    await handleBetPopups(page);

    const resultVerified = await page.evaluate(() => {
      const body = document.body?.textContent || "";
      // 余额不足（单独分类，不阻止后续重试）
      if (body.includes("Insufficient") || body.includes("不足") ||
          body.includes("余额不足") || body.includes("超过限额") ||
          body.includes("balance is not enough") || body.includes("insufficient balance")) {
        return "insufficient";
      }
      // 投注成功
      if (body.includes("Accepted") || body.includes("成功") ||
          body.includes("confirmed") || body.includes("已接受") ||
          body.includes("bet placed") || body.includes("下单成功")) {
        return "success";
      }
      // 投注失败
      if (body.includes("Rejected") || body.includes("失败") ||
          body.includes("suspended") || body.includes("暂停") ||
          body.includes("odds changed") || body.includes("赔率变动")) {
        return "failed";
      }
      return "unknown";
    });

    if (resultVerified === "insufficient") {
      console.warn("[BetExecutor] 余额不足，投注未执行（链路畅通）");
      return { success: false, insufficient: true, error: "余额不足" };
    }

    if (resultVerified === "failed") {
      console.error("[BetExecutor] 平台拒绝了该投注");
      return { success: false, error: "投注被平台拒绝" };
    }

    if (resultVerified === "unknown") {
      console.warn(`[BetExecutor] 投注结果未知: ${matchName}，标记为 pending 等待人工确认`);
      return { success: false, pending: true, reason: "unknown_result" };
    }

    // success
    const transactionId = "txn_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    console.log(`[BetExecutor] 投注执行成功: ${matchName} txn=${transactionId}`);
    return { success: true, transactionId };

  } catch (error) {
    console.error(`[BetExecutor] 投注失败 (${matchId}):`, error.message);
    if (process.env.DEBUG_SCREENSHOTS === "true") {
      try {
        const fs = await import("fs");
        const dir = "debug";
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: `debug/bet-fail-${Date.now()}.png` });
        console.log("[BetExecutor] 已保存失败截图");
      } catch (_) {}
    }
    return { success: false, error: error.message };
  }
}
