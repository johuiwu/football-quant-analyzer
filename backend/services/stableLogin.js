// ================================================================
// stableLogin.js — 独立、稳定的登录模块
// 严禁任何 AI 或自动化工具修改此文件
// 唯一公开接口：performStableLogin(username, password)
// ================================================================

import { loginToHG } from './hgCrawlerService.js';
import { setSharedPage } from './browserPool.js';

/**
 * 执行稳定、完整的 HgCrawler 登录流程
 * @param {string} username - HG 用户名
 * @param {string} password - HG 密码
 * @returns {Promise<{ success: boolean, page: object|null, error?: string }>}
 */
export async function performStableLogin(username, password) {
  console.log('[StableLogin] 开始执行稳定的完整登录流程...');

  if (!username || !password) {
    console.error('[StableLogin] 缺少用户名或密码');
    return { success: false, page: null, error: '缺少用户名或密码' };
  }

  try {
    // 强制完整登录：forceNew=true 跳过 Cookie/会话复用，isolated=true 返回 page 对象
    const result = await loginToHG({ username, password }, true, true);

    if (!result?.success || !result?.page) {
      console.error('[StableLogin] 登录失败:', result?.error || '未知错误');
      return { success: false, page: null, error: result?.error || '登录失败' };
    }

    // 将登录成功的页面设为共享页面，供 DOM 路径复用
    setSharedPage(result.page);

    console.log('[StableLogin] 稳定登录完成，页面已就绪');
    return { success: true, page: result.page };
  } catch (error) {
    console.error('[StableLogin] 登录流程异常:', error.message);
    return { success: false, page: null, error: error.message };
  }
}