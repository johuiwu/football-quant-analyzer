// Poisson mathematical distribution helper
export function poisson(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  const exp = Math.exp(-lambda);
  let factorial = 1;
  for (let i = 1; i <= k; i++) {
    factorial *= i;
  }
  return (Math.pow(lambda, k) * exp) / factorial;
}

// Dixon-Coles Correlation Adjustment for low-scoring matches (0-0, 1-0, 0-1, 1-1)
export function dixonColesAdjustment(x: number, y: number, lambda: number, mu: number, rho: number = -0.075): number {
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
