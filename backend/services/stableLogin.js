// ================================================================
// stableLogin.js — 稳定的登录模块
// 优先复用已登录的共享页面，避免重复登录导致强制登出
// 唯一公开接口：performStableLogin(username, password)
// ================================================================

import { loginToHG } from './hgCrawlerService.js';
import { getSharedPage, setSharedPage, isBrowserActive, isPageLoggedIn } from './browserPool.js';

/**
 * 执行稳定的登录流程
 * ★ 优先复用已登录的共享页面，避免重复登录导致强制登出
 * @param {string} username - HG 用户名
 * @param {string} password - HG 密码
 * @returns {Promise<{ success: boolean, page: object|null, error?: string }>}
 */
export async function performStableLogin(username, password) {
  // ★ 1. 先检查共享页面是否已登录，如果是则直接复用
  const sharedPage = getSharedPage();
  if (sharedPage && !sharedPage.isClosed() && isBrowserActive()) {
    try {
      const loggedIn = await isPageLoggedIn(sharedPage);
      if (loggedIn) {
        console.log('[StableLogin] 共享页面已登录，直接复用（跳过重新登录）');
        return { success: true, page: sharedPage };
      }
    } catch (e) {
      console.log('[StableLogin] 共享页面检查失败:', e.message);
    }
  }

  if (!username || !password) {
    console.error('[StableLogin] 缺少用户名或密码');
    return { success: false, page: null, error: '缺少用户名或密码' };
  }

  try {
    // ★ 2. 使用共享浏览器登录（不再 forceNew/isolated，避免创建新浏览器实例）
    console.log('[StableLogin] 共享页面未登录，执行登录（复用共享浏览器）...');
    const result = await loginToHG({ username, password }, false, false);

    if (!result?.success) {
      console.error('[StableLogin] 登录失败:', result?.error || '未知错误');
      return { success: false, page: null, error: result?.error || '登录失败' };
    }

    // loginToHG(forceNew=false, isolated=false) 成功后会自动设置 sharedPage
    const page = getSharedPage();
    if (!page) {
      console.error('[StableLogin] 登录成功但未获取到共享页面');
      return { success: false, page: null, error: '登录后未获取到共享页面' };
    }

    console.log('[StableLogin] 登录完成，共享页面已就绪');
    return { success: true, page };
  } catch (error) {
    console.error('[StableLogin] 登录流程异常:', error.message);
    return { success: false, page: null, error: error.message };
  }
}
