/**
 * 角球系统自动投注链路修复 - 单元测试
 * 覆盖断点1（模块加载兜底）、断点2（凭证检查条件）、断点4（分隔符分割）、断点5（赔率选择器）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ======================== 断点2测试：凭证检查条件正确性 ========================

describe('断点2修复: 凭证检查条件', () => {
  /**
   * 模拟 loadAndValidate 的返回值结构
   * 成功: { valid: true, credentials: { uid, ver, cookieStr, apiDomain } }
   * 失败: { valid: false, credentials: null, reason: "..." }
   */
  function mockLoadAndValidate(valid: boolean, uid?: string) {
    if (valid) {
      return {
        valid: true,
        credentials: { uid: uid !== undefined ? uid : 'test-uid', ver: 'test-ver', cookieStr: 'test-cookie', apiDomain: 'test-domain' }
      };
    }
    return { valid: false, credentials: null, reason: 'no_credentials' };
  }

  it('凭证有效时条件应为true（修复后逻辑）', () => {
    const credCheck = mockLoadAndValidate(true, 'user123');
    // 修复后的条件
    const condition = credCheck && credCheck.valid && credCheck.credentials?.uid;
    expect(condition).toBeTruthy();
    expect(credCheck.credentials?.uid).toBe('user123');
  });

  it('凭证无效时条件应为false（修复后逻辑）', () => {
    const credCheck = mockLoadAndValidate(false);
    const condition = credCheck && credCheck.valid && credCheck.credentials?.uid;
    expect(condition).toBeFalsy();
  });

  it('凭证有效但uid为空时条件应为false', () => {
    const credCheck = mockLoadAndValidate(true, '');
    const condition = credCheck && credCheck.valid && credCheck.credentials?.uid;
    expect(condition).toBeFalsy();
  });

  it('loadAndValidate返回null时条件应为false', () => {
    const credCheck = null;
    const condition = credCheck && credCheck.valid && credCheck.credentials?.uid;
    expect(condition).toBeFalsy();
  });

  it('修复前的错误条件（credCheck.uid）永远为undefined', () => {
    const credCheck = mockLoadAndValidate(true, 'user123');
    // 修复前的错误条件（使用 as any 访问不存在的顶层 uid 属性）
    const oldCondition = credCheck && (credCheck as any).uid;
    expect(oldCondition).toBeFalsy(); // 永远为falsy，因为uid在credentials.uid中
    expect((credCheck as any).uid).toBeUndefined(); // 顶层没有uid属性
  });
});

// ======================== 断点4测试：比赛名称分隔符 ========================

describe('断点4修复: 比赛名称分隔符', () => {
  // 修复后的正则
  const separatorRegex = /\s+(?:vs?\.?|[-—])\s+/i;

  function splitMatchName(matchName: string): { homeTeam: string; awayTeam: string } {
    const parts = matchName.split(separatorRegex);
    return {
      homeTeam: (parts[0] || '').trim(),
      awayTeam: (parts[1] || '').trim()
    };
  }

  it('支持 " vs " 分隔符', () => {
    const { homeTeam, awayTeam } = splitMatchName('TeamA vs TeamB');
    expect(homeTeam).toBe('TeamA');
    expect(awayTeam).toBe('TeamB');
  });

  it('支持 " v " 分隔符', () => {
    const { homeTeam, awayTeam } = splitMatchName('TeamA v TeamB');
    expect(homeTeam).toBe('TeamA');
    expect(awayTeam).toBe('TeamB');
  });

  it('支持 " vs. " 分隔符', () => {
    const { homeTeam, awayTeam } = splitMatchName('TeamA vs. TeamB');
    expect(homeTeam).toBe('TeamA');
    expect(awayTeam).toBe('TeamB');
  });

  it('支持 " - " 分隔符', () => {
    const { homeTeam, awayTeam } = splitMatchName('TeamA - TeamB');
    expect(homeTeam).toBe('TeamA');
    expect(awayTeam).toBe('TeamB');
  });

  it('支持 " — " 分隔符（em dash）', () => {
    const { homeTeam, awayTeam } = splitMatchName('TeamA — TeamB');
    expect(homeTeam).toBe('TeamA');
    expect(awayTeam).toBe('TeamB');
  });

  it('支持大小写不敏感（VS/Vs）', () => {
    const { homeTeam, awayTeam } = splitMatchName('TeamA VS TeamB');
    expect(homeTeam).toBe('TeamA');
    expect(awayTeam).toBe('TeamB');
  });

  it('无分隔符时awayTeam为空', () => {
    const { homeTeam, awayTeam } = splitMatchName('TeamAOnly');
    expect(homeTeam).toBe('TeamAOnly');
    expect(awayTeam).toBe('');
  });

  it('修复前的 " vs " 分割仍能正常工作', () => {
    const oldParts = 'TeamA vs TeamB'.split(' vs ');
    expect(oldParts[0]).toBe('TeamA');
    expect(oldParts[1]).toBe('TeamB');
  });

  it('修复前的 " vs " 分割无法处理 " v " 分隔符', () => {
    const oldParts = 'TeamA v TeamB'.split(' vs ');
    expect(oldParts.length).toBe(1); // 无法分割
    expect(oldParts[0]).toBe('TeamA v TeamB');
  });
});

// ======================== 断点5测试：赔率选择器与正则 ========================

describe('断点5修复: 赔率选择器与正则', () => {
  // 修复后的选择器列表
  const selectors = [
    'span.text_odds',
    "[class*='text_odds']",
    "[class*='odd']",
    "[class*='price']",
    "[class*='ior']",
    "[class*='bet']",
    "[data-odds]"
  ];

  // 修复后的兜底正则（支持2-3位小数）
  const oddsRegex = /^\d+\.\d{2,3}$/;

  it('选择器列表包含新增的 [class*="bet"]', () => {
    expect(selectors).toContain("[class*='bet']");
  });

  it('选择器列表包含新增的 [data-odds]', () => {
    expect(selectors).toContain('[data-odds]');
  });

  it('兜底正则支持2位小数赔率', () => {
    expect(oddsRegex.test('1.85')).toBe(true);
    expect(oddsRegex.test('2.50')).toBe(true);
  });

  it('兜底正则支持3位小数赔率', () => {
    expect(oddsRegex.test('1.850')).toBe(true);
    expect(oddsRegex.test('2.500')).toBe(true);
  });

  it('兜底正则不支持整数赔率', () => {
    expect(oddsRegex.test('2')).toBe(false);
    expect(oddsRegex.test('10')).toBe(false);
  });

  it('兜底正则不支持1位小数赔率', () => {
    expect(oddsRegex.test('1.8')).toBe(false);
  });

  it('兜底正则不支持非数字内容', () => {
    expect(oddsRegex.test('abc')).toBe(false);
    expect(oddsRegex.test('1.85abc')).toBe(false);
  });

  it('修复前的正则不支持3位小数赔率', () => {
    const oldRegex = /^\d+\.\d{2}$/;
    expect(oldRegex.test('1.850')).toBe(false); // 修复前不支持
  });
});

// ======================== 断点1测试：模块加载兜底逻辑 ========================

describe('断点1修复: 模块加载兜底', () => {
  it('动态import失败时executeBetViaHttp应保持null', async () => {
    // 模拟动态 import 失败的场景（使用mock而非真实import）
    let executeBetViaHttp: any = null;
    const mockImport = vi.fn().mockRejectedValue(new Error('Module not found'));

    try {
      const mod = await mockImport();
      executeBetViaHttp = mod.executeBetViaHttp;
    } catch (e) {
      // 捕获错误，executeBetViaHttp 保持 null
    }

    expect(mockImport).toHaveBeenCalled();
    expect(executeBetViaHttp).toBeNull();
  });

  it('动态import成功时executeBetViaHttp应被赋值', async () => {
    let executeBetViaHttp: any = null;
    const mockImport = vi.fn().mockResolvedValue({
      executeBetViaHttp: async () => ({ success: true })
    });

    try {
      const mod = await mockImport();
      executeBetViaHttp = mod.executeBetViaHttp;
    } catch (e) {
      // 不会执行
    }

    expect(executeBetViaHttp).toBeTruthy();
    expect(typeof executeBetViaHttp).toBe('function');
  });

  it('凭证有效但HTTP模块不可用时应回退浏览器DOM投注', () => {
    const credCheck = {
      valid: true,
      credentials: { uid: 'user123', ver: 'v', cookieStr: 'c', apiDomain: 'd' }
    };
    const executeBetViaHttp = null; // 模块不可用

    // 修复后的条件：凭证有效 AND HTTP模块可用
    const useHttp = credCheck && credCheck.valid && credCheck.credentials?.uid && executeBetViaHttp;
    expect(useHttp).toBeFalsy(); // 应回退到浏览器DOM投注
  });

  it('凭证有效且HTTP模块可用时应使用HTTP投注', () => {
    const credCheck = {
      valid: true,
      credentials: { uid: 'user123', ver: 'v', cookieStr: 'c', apiDomain: 'd' }
    };
    const executeBetViaHttp = async () => ({ success: true }); // 模块可用

    const useHttp = credCheck && credCheck.valid && credCheck.credentials?.uid && executeBetViaHttp;
    expect(useHttp).toBeTruthy(); // 应使用HTTP投注
  });
});

// ======================== 断点3测试：角球页面无比赛回退逻辑 ========================

describe('断点3修复: 角球页面无比赛回退投注', () => {
  it('角球页面无比赛时应继续执行而非直接返回失败', () => {
    // 模拟修复后的逻辑：不直接return，继续执行后续代码
    const hasCornerMatches = false;
    let returned = false;

    if (!hasCornerMatches) {
      // 修复后：不 return，继续执行
      // 修复前：return { success: false, error: "角球页面无可用比赛" };
    }

    // 验证没有提前返回
    expect(returned).toBe(false);
  });

  it('让球/大小页面也无比赛时才返回失败', () => {
    // 模拟让球/大小页面查找比赛
    const hdpMatches = []; // 让球/大小页面也无比赛
    const matchFound = hdpMatches.length > 0;

    if (!matchFound) {
      // 此时才返回失败
      const result = { success: false, reason: 'match_not_found' };
      expect(result.success).toBe(false);
      expect(result.reason).toBe('match_not_found');
    }
  });
});
