import { describe, it, expect } from 'vitest';
import { poisson, dixonColesAdjustment } from '../poisson';

// ======================== poisson() 测试 ========================
describe('poisson(k, lambda)', () => {
  describe('边界值测试', () => {
    it('lambda=0 时 k=0 应返回 1', () => {
      expect(poisson(0, 0)).toBe(1);
    });

    it('lambda=0 时 k>0 应返回 0', () => {
      expect(poisson(1, 0)).toBe(0);
      expect(poisson(5, 0)).toBe(0);
    });

    it('lambda 为负数时应安全处理', () => {
      expect(poisson(0, -1)).toBe(1);
      expect(poisson(1, -1)).toBe(0);
    });

    it('k=0 时的概率应为 e^(-lambda)', () => {
      expect(poisson(0, 1)).toBeCloseTo(Math.exp(-1), 10);
      expect(poisson(0, 2.1)).toBeCloseTo(Math.exp(-2.1), 10);
    });
  });

  describe('典型值测试 (lambda=1.2)', () => {
    const lambda = 1.2;
    const probs = [0, 1, 2, 3].map((k) => poisson(k, lambda));
    const sum = probs.reduce((a, b) => a + b, 0);

    it('k=0,1,2,3 的概率和为合理值', () => {
      expect(sum).toBeGreaterThan(0.9);
      expect(sum).toBeLessThan(1.0);
    });

    it('k=0 概率约等于 e^(-1.2)', () => {
      expect(probs[0]).toBeCloseTo(Math.exp(-1.2), 5);
    });

    it('k=1 概率 = 1.2 * e^(-1.2)', () => {
      expect(probs[1]).toBeCloseTo(1.2 * Math.exp(-1.2), 5);
    });
  });

  describe('典型值测试 (lambda=2.1)', () => {
    const lambda = 2.1;

    it('k=0,1,2,3 概率和为合理值', () => {
      const probs = [0, 1, 2, 3].map((k) => poisson(k, lambda));
      const sum = probs.reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThan(0.7);
      expect(sum).toBeLessThan(1.0);
    });

    it('概率列单调递减在 k > lambda 后', () => {
      const p2 = poisson(2, lambda);
      const p3 = poisson(3, lambda);
      expect(p3).toBeLessThan(p2);
    });
  });

  describe('大 k 值测试', () => {
    it('lambda=5, k=6 不应崩溃', () => {
      const result = poisson(6, 5);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });

    it('lambda=5, k=10 概率很小但非零', () => {
      const result = poisson(10, 5);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(0.05);
    });
  });

  describe('概率归一化', () => {
    it('lambda=1.2 时 k=0..8 的概率和约等于 1', () => {
      const sum = Array.from({ length: 9 }, (_, k) => poisson(k, 1.2)).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 2);
    });

    it('lambda=3.0 时 k=0..12 的概率和约等于 1', () => {
      const sum = Array.from({ length: 13 }, (_, k) => poisson(k, 3.0)).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 2);
    });
  });
});

// ======================== dixonColesAdjustment() 测试 ========================
describe('dixonColesAdjustment(x, y, lambda, mu, rho)', () => {
  const lambda = 1.5;
  const mu = 1.2;
  const rho = -0.075;

  it('0-0 比分修正 = 1 - lambda*mu*rho', () => {
    const expected = 1 - lambda * mu * rho;
    expect(dixonColesAdjustment(0, 0, lambda, mu, rho)).toBeCloseTo(expected, 10);
  });

  it('1-0 比分修正 = 1 + mu*rho', () => {
    const expected = 1 + mu * rho;
    expect(dixonColesAdjustment(1, 0, lambda, mu, rho)).toBeCloseTo(expected, 10);
  });

  it('0-1 比分修正 = 1 + lambda*rho', () => {
    const expected = 1 + lambda * rho;
    expect(dixonColesAdjustment(0, 1, lambda, mu, rho)).toBeCloseTo(expected, 10);
  });

  it('1-1 比分修正 = 1 - rho', () => {
    const expected = 1 - rho;
    expect(dixonColesAdjustment(1, 1, lambda, mu, rho)).toBeCloseTo(expected, 10);
  });

  it('其他比分返回 1.0', () => {
    expect(dixonColesAdjustment(2, 0, lambda, mu, rho)).toBe(1.0);
    expect(dixonColesAdjustment(0, 2, lambda, mu, rho)).toBe(1.0);
    expect(dixonColesAdjustment(2, 1, lambda, mu, rho)).toBe(1.0);
    expect(dixonColesAdjustment(3, 3, lambda, mu, rho)).toBe(1.0);
  });

  it('默认 rho=-0.075 时行为正确', () => {
    const result0 = dixonColesAdjustment(0, 0, lambda, mu);
    const expected0 = 1 - lambda * mu * (-0.075);
    expect(result0).toBeCloseTo(expected0, 10);

    const result1 = dixonColesAdjustment(1, 1, lambda, mu);
    const expected1 = 1 - (-0.075);
    expect(result1).toBeCloseTo(expected1, 10);
  });
});
// ======================== Dixon-Coles 边界（补充） ========================
describe('dixonColesAdjustment 边界扩展', () => {
  const lambda = 1.5;
  const mu = 1.2;

  it('rho=0 → 0-0/1-0/0-1/1-1 均返回 1.0', () => {
    expect(dixonColesAdjustment(0, 0, lambda, mu, 0)).toBe(1.0);
    expect(dixonColesAdjustment(1, 0, lambda, mu, 0)).toBe(1.0);
    expect(dixonColesAdjustment(0, 1, lambda, mu, 0)).toBe(1.0);
    expect(dixonColesAdjustment(1, 1, lambda, mu, 0)).toBe(1.0);
  });

  it('rho=0.1 → 验证修正方向', () => {
    // 0-0: 1 - lambda*mu*rho = 1 - 1.5*1.2*0.1 = 0.82
    expect(dixonColesAdjustment(0, 0, lambda, mu, 0.1)).toBeCloseTo(0.82, 10);
    // 1-0: 1 + mu*rho = 1 + 1.2*0.1 = 1.12
    expect(dixonColesAdjustment(1, 0, lambda, mu, 0.1)).toBeCloseTo(1.12, 10);
    // 1-1: 1 - rho = 0.9
    expect(dixonColesAdjustment(1, 1, lambda, mu, 0.1)).toBeCloseTo(0.9, 10);
  });

  it('lambda=0 时不崩溃', () => {
    expect(() => dixonColesAdjustment(0, 0, 0, mu)).not.toThrow();
    expect(dixonColesAdjustment(0, 0, 0, mu)).toBeCloseTo(1.0, 10);
  });

  it('mu=0 时不崩溃', () => {
    expect(() => dixonColesAdjustment(0, 0, lambda, 0)).not.toThrow();
    expect(dixonColesAdjustment(0, 0, lambda, 0)).toBeCloseTo(1.0, 10);
  });
});
