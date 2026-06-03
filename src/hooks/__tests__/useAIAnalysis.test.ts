import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAIAnalysis } from '../useAIAnalysis';

// Mock ValidationService
vi.mock('../../services/ValidationService', () => ({
  ValidationService: {
    validateAIAnalysis: vi.fn(),
  },
}));

describe('useAIAnalysis()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置全局 fetch
    vi.stubGlobal('fetch', vi.fn());
  });

  it('初始状态：analysis=null, isLoading=false', () => {
    const { result } = renderHook(() => useAIAnalysis());
    expect(result.current.analysis).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('成功响应 → analysis 非空', async () => {
    const mockCommentary = '基于数据分析，主队获胜概率较高。';
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, commentary: mockCommentary }),
    } as Response);

    const { result } = renderHook(() => useAIAnalysis());

    await act(async () => {
      await result.current.fetchAiAnalysis('home1', 'away1', {}, { homeProb: 0.5, drawProb: 0.25, awayProb: 0.25 } as any);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.analysis).toContain('主队获胜概率较高');
  });

  it('接口返回 success:false → 显示错误信息', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false, error: '分析服务不可用' }),
    } as Response);

    const { result } = renderHook(() => useAIAnalysis());

    await act(async () => {
      await result.current.fetchAiAnalysis('home1', 'away1', {}, { homeProb: 0.5, drawProb: 0.25, awayProb: 0.25 } as any);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.analysis).toBeTruthy();
    });
  });

  it('HTTP 错误（500）→ catch 分支', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    const { result } = renderHook(() => useAIAnalysis());

    await act(async () => {
      await result.current.fetchAiAnalysis('home1', 'away1', {}, { homeProb: 0.5, drawProb: 0.25, awayProb: 0.25 } as any);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.analysis).toBeTruthy();
      expect(result.current.analysis).toContain('系统异常');
    });
  });

  it('网络异常（fetch reject）→ catch 分支', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network Error'));

    const { result } = renderHook(() => useAIAnalysis());

    await act(async () => {
      await result.current.fetchAiAnalysis('home1', 'away1', {}, { homeProb: 0.5, drawProb: 0.25, awayProb: 0.25 } as any);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.analysis).toBeTruthy();
    });
  });

  it('调用 fetchAiAnalysis 后 isLoading 切换', async () => {
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({
        ok: true,
        json: async () => ({ success: true, commentary: 'test' }),
      } as Response), 50))
    );

    const { result } = renderHook(() => useAIAnalysis());

    act(() => {
      result.current.fetchAiAnalysis('home1', 'away1', {}, { homeProb: 0.5, drawProb: 0.25, awayProb: 0.25 } as any);
    });

    // isLoading should be true immediately after calling
    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    // Wait for the async to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    }, { timeout: 1000 });
  });
});
