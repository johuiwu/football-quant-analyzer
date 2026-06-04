import { getSharedPage, isLoggedIn } from "./browserPool.js";
import { navigateToCornersFast } from "./cornerCrawler.js";
import { handlePopups } from "./crawlerShared.js";

// ======================== 工具函数 ========================
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ======================== 投注执行 ========================

/**
 * 在 hga050.com 上执行一次真实的角球投注操作
 * @param {Object} betData - 投注数据
 * @param {string} betData.matchName - 比赛名称（用于定位比赛行）
 * @param {string} betData.matchId - 比赛ID
 * @param {number} betData.odds - 目标赔率
 * @param {number} betData.amount - 投注金额
 * @param {number} betData.handicap - 盘口值
 * @param {string} betData.strategyId - 策略ID
 * @returns {Promise<{success: boolean, transactionId?: string, error?: string}>}
 */
export async function executeBet(betData) {
  const { matchName, matchId, odds, amount, strategyId } = betData;

  // 1. 检查登录状态
  if (!isLoggedIn()) {
    console.error("[BetExecutor] 未登录，无法执行投注");
    return { success: false, error: "未登录，请先登录 hga050.com" };
  }

  // 2. 获取共享页面并验证实际登录状态
  const page = getSharedPage();
  if (!page) {
    console.error("[BetExecutor] 浏览器页面不可用");
    return { success: false, error: "浏览器页面不可用" };
  }

  // 验证页面是否确实处于已登录状态（非仅依赖 isLoggedIn 标记）
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
      return { success: false, error: "登录会话可能已过期，请重新登录 hga050.com" };
    }
  } catch (e) {
    console.warn("[BetExecutor] 登录验证检查异常:", e.message);
    // 不阻断，继续尝试投注
  }

  try {
    console.log(`[BetExecutor] 开始执行投注: ${matchName} (${matchId}) 策略${strategyId} 赔率${odds} 金额${amount}`);

    // 3. 导航到角球页面
    await navigateToCornersFast(page);
    await sleep(3000);
    await handlePopups(page);

    // 4. 在页面中查找匹配的比赛行（同时包含主队名和客队名）
    const matchFound = await page.evaluate((name) => {
      const parts = name.split(" vs ");
      const homeTeam = (parts[0] || "").trim();
      const awayTeam = (parts[1] || "").trim();
      const rows = document.querySelectorAll("tr, [class*='row'], [class*='event'], [class*='match']");
      for (const row of rows) {
        const text = row.textContent || "";
        // 必须同时包含主队和客队名称
        if (homeTeam && awayTeam && text.includes(homeTeam) && text.includes(awayTeam)) {
          return true;
        }
        // 回退：单一名称匹配
        if (text.includes(name)) return true;
      }
      return false;
    }, matchName);

    if (!matchFound) {
      console.error(`[BetExecutor] 未找到比赛: ${matchName}`);
      return { success: false, error: "未找到比赛: " + matchName };
    }

    // 5. 在比赛行中查找匹配赔率的投注选项并点击
    const betPlaced = await page.evaluate((data) => {
      const rows = document.querySelectorAll("tr, [class*='row'], [class*='event'], [class*='match']");
      for (const row of rows) {
        const text = row.textContent || "";
        if (!text.includes(data.matchName)) continue;

        // 查找所有可点击的赔率元素
        const clickables = row.querySelectorAll(
          "[class*='odd'], [class*='price'], [class*='bet'], [class*='sel'], [class*='btn'], a, span"
        );
        for (const el of clickables) {
          const elText = (el.textContent || "").trim();
          const val = parseFloat(elText);
          if (!isNaN(val) && Math.abs(val - data.odds) < 0.05) {
            el.scrollIntoView({ block: "center" });
            el.click();
            return true;
          }
        }
      }
      return false;
    }, { matchName, odds });

    if (!betPlaced) {
      console.error(`[BetExecutor] 未找到匹配的投注选项: 赔率${odds}`);
      return { success: false, error: "未找到匹配赔率 " + odds + " 的投注选项" };
    }

    // 6. 等待投注弹窗出现
    await sleep(2000);
    await handlePopups(page);

    // 7. 填写投注金额
    const amountFilled = await page.evaluate((amt) => {
      const inputs = document.querySelectorAll(
        "input[type='text'], input[type='number'], input:not([type='hidden'])"
      );
      for (const inp of inputs) {
        const placeholder = (inp.placeholder || "").toLowerCase();
        const name = (inp.name || "").toLowerCase();
        const className = (inp.className || "").toLowerCase();
        if (
          placeholder.includes("stake") || placeholder.includes("amount") ||
          placeholder.includes("金额") || placeholder.includes("bet") ||
          name.includes("stake") || name.includes("amount") || name.includes("bet") ||
          className.includes("stake") || className.includes("amount")
        ) {
          inp.value = "";
          inp.focus();
          // 使用原生事件触发
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value"
          ).set;
          nativeInputValueSetter.call(inp, String(amt));
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
          inp.dispatchEvent(new Event("blur", { bubbles: true }));
          return true;
        }
      }
  
      return false;
    }, amount);

    if (!amountFilled) {
      console.error("[BetExecutor] 未找到金额输入框，无法继续");
      return { success: false, error: "未找到金额输入框" };
    }

    await sleep(500);

    // 8. 点击确认投注按钮
    const confirmed = await page.evaluate(() => {
      const keywords = [
        "下单", "投注", "place bet", "confirm bet"
      ];
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

    // 9. 等待结果并验证
    await sleep(3000);
    await handlePopups(page);

    // 验证投注是否被平台接受
    const resultVerified = await page.evaluate(() => {
      const body = document.body?.textContent || "";
      if (body.includes("Accepted") || body.includes("成功") ||
          body.includes("confirmed") || body.includes("已接受") ||
          body.includes("bet placed") || body.includes("下单成功")) {
        return "success";
      }
      if (body.includes("Rejected") || body.includes("失败") ||
          body.includes("Insufficient") || body.includes("不足") ||
          body.includes("余额不足") || body.includes("超过限额")) {
        return "failed";
      }
      return "unknown";
    });

    if (resultVerified === "failed") {
      console.error("[BetExecutor] 平台拒绝了该投注");
      return { success: false, error: "投注被平台拒绝（余额不足或超过限额）" };
    }

    // 生成交易ID
    const transactionId = "txn_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

    console.log(`[BetExecutor] 投注执行成功: ${matchName} txn=${transactionId}`);
    return { success: true, transactionId };

  } catch (error) {
    console.error(`[BetExecutor] 投注失败 (${matchId}):`, error.message);
    // 调试截图（需设置 DEBUG_SCREENSHOTS=true）
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
