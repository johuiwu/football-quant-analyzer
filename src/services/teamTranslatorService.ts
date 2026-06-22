/**
 * 球队名称翻译服务
 * 三级查找：localStorage 缓存 → 硬编码映射 → AI 翻译 API
 * 内置请求队列、节流、去重机制
 */

import { teamTranslation, countryTranslation } from '../data/cornerTranslations';

// ==================== 常量 ====================

const CACHE_KEY = 'football_team_translations';
const MAX_CACHE_SIZE = 1000;
const SETTLE_DELAY = 200;
const MAX_CONCURRENCY = 5;

// ==================== 缓存操作 ====================

function getTranslationCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}

function setTranslationCache(enName: string, zhName: string): void {
  try {
    const cache = getTranslationCache();
    cache[enName] = zhName;

    // FIFO 淘汰：超出上限时删除最早写入的 key
    const keys = Object.keys(cache);
    if (keys.length > MAX_CACHE_SIZE) {
      const removeCount = keys.length - MAX_CACHE_SIZE;
      for (let i = 0; i < removeCount; i++) {
        delete cache[keys[i]];
      }
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage 不可用时静默降级
  }
}

// ==================== 硬编码映射查找 ====================

function lookupHardcoded(enName: string): string | null {
  if (teamTranslation[enName]) return teamTranslation[enName];
  if (countryTranslation[enName]) return countryTranslation[enName];

  // 处理带 U21/U20/U19/U17 等后缀的国家队名
  const ageGroupMatch = enName.match(/^(.+?)\s+(U\d{2})$/i);
  if (ageGroupMatch) {
    const countryName = ageGroupMatch[1].trim();
    const ageGroup = ageGroupMatch[2];
    const cnCountry = countryTranslation[countryName] || teamTranslation[countryName];
    if (cnCountry) return cnCountry + ' ' + ageGroup;
  }

  return null;
}

// ==================== 请求队列与节流 ====================

interface PendingItem {
  name: string;
  resolve: (v: string) => void;
  reject: (e: any) => void;
}

const pendingQueue: PendingItem[] = [];
let activeCount = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const inflightMap: Map<string, Promise<string>> = new Map();

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushQueue();
  }, SETTLE_DELAY);
}

function flushQueue(): void {
  while (pendingQueue.length > 0 && activeCount < MAX_CONCURRENCY) {
    const item = pendingQueue.shift()!;
    activeCount++;
    executeRequest(item);
  }
}

async function executeRequest(item: PendingItem): Promise<void> {
  try {
    const result = await callTranslateApi(item.name);
    item.resolve(result);
  } catch (e) {
    item.reject(e);
  } finally {
    activeCount--;
    // 处理队列中等待的请求
    if (pendingQueue.length > 0) {
      flushQueue();
    }
  }
}

async function callTranslateApi(enName: string): Promise<string> {
  try {
    const response = await fetch('/api/ai-translate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: enName }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const zhName: string | undefined = data?.translatedName || data?.zhName || data?.name;
    if (zhName && typeof zhName === 'string' && zhName.trim()) {
      setTranslationCache(enName, zhName.trim());
      return zhName.trim();
    }
    return enName;
  } catch {
    return enName;
  }
}

function enqueueRequest(enName: string): Promise<string> {
  // 去重：同一队名共享同一 Promise
  const existing = inflightMap.get(enName);
  if (existing) return existing;

  const promise = new Promise<string>((resolve, reject) => {
    pendingQueue.push({ name: enName, resolve, reject });
    scheduleFlush();
  });

  inflightMap.set(enName, promise);

  // 翻译完成后从 inflightMap 中移除
  promise.finally(() => {
    inflightMap.delete(enName);
  });

  return promise;
}

// ==================== 核心导出函数 ====================

/**
 * 获取球队翻译名称
 * 三级查找：localStorage 缓存 → 硬编码映射 → AI 翻译 API
 * 空值/null/undefined 直接返回，绝不向上抛出异常
 */
export async function getTranslatedTeamName(enName: string): Promise<string> {
  try {
    // 空值直接返回
    if (!enName || typeof enName !== 'string') return enName ?? '';

    const trimmed = enName.trim();
    if (!trimmed) return '';

    // 第一级：localStorage 缓存
    const cache = getTranslationCache();
    if (cache[trimmed]) return cache[trimmed];

    // 第二级：硬编码映射
    const hardcoded = lookupHardcoded(trimmed);
    if (hardcoded) {
      setTranslationCache(trimmed, hardcoded);
      return hardcoded;
    }

    // 第三级：AI 翻译 API（通过队列节流）
    return await enqueueRequest(trimmed);
  } catch {
    return enName ?? '';
  }
}
