// 泊松分布数学工具 — 含 Dixon-Coles 低比分修正

/** 泊松分布概率质量函数
 *  使用迭代累积算法避免阶乘溢出，支持大 k 值
 */
export function poisson(k: number, lambda: number): number {
  // 防御性编程
  if (!Number.isFinite(k) || k < 0 || !Number.isInteger(k)) return 0;
  if (lambda <= 0) return k === 0 ? 1 : 0;

  // 用对数累积法避免中间阶乘溢出
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) {
    logP -= Math.log(i);
  }
  const result = Math.exp(logP);

  // 对极小概率值提供 0 兜底，避免 subnormal
  return result < 1e-300 ? 0 : result;
}

/** Dixon-Coles 低比分相关性修正 (0-0, 1-0, 0-1, 1-1) */
export function dixonColesAdjustment(
  x: number,
  y: number,
  lambda: number,
  mu: number,
  rho: number = -0.075,
): number {
  if (x === 0 && y === 0) {
    return 1 - lambda * mu * rho;
  }
  if (x === 1 && y === 0) {
    return 1 + mu * rho;
  }
  if (x === 0 && y === 1) {
    return 1 + lambda * rho;
  }
  if (x === 1 && y === 1) {
    return 1 - rho;
  }
  return 1.0;
}