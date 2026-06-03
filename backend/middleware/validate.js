/**
 * 输入校验中间件
 * 提供请求体字段的类型检查和必填验证
 */

/**
 * 校验请求体中的必填字段
 * @param {string[]} requiredFields - 必填字段名列表
 * @returns {Function} Express 中间件
 */
export function requireFields(requiredFields) {
  return (req, res, next) => {
    const missing = [];
    for (const field of requiredFields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        missing.push(field);
      }
    }
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `缺少必填参数: ${missing.join(', ')}`,
      });
    }
    next();
  };
}

/**
 * 校验请求体字段类型
 * @param {Object} schema - { fieldName: 'string'|'number'|'boolean'|'object' }
 * @returns {Function} Express 中间件
 */
export function validateTypes(schema) {
  return (req, res, next) => {
    for (const [field, expectedType] of Object.entries(schema)) {
      const value = req.body[field];
      if (value === undefined || value === null) continue; // 跳过可选字段
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== expectedType) {
        return res.status(400).json({
          success: false,
          error: `参数 ${field} 类型错误: 期望 ${expectedType}, 实际 ${actualType}`,
        });
      }
    }
    next();
  };
}

/**
 * 校验并限制数值范围
 * @param {Object} ranges - { fieldName: { min: number, max: number } }
 * @returns {Function} Express 中间件
 */
export function validateRanges(ranges) {
  return (req, res, next) => {
    for (const [field, { min, max }] of Object.entries(ranges)) {
      const value = req.body[field];
      if (value === undefined || value === null) continue;
      const num = Number(value);
      if (isNaN(num) || num < min || num > max) {
        return res.status(400).json({
          success: false,
          error: `参数 ${field} 超出范围: 需要 ${min}-${max}, 实际 ${value}`,
        });
      }
    }
    next();
  };
}

/**
 * 校验字符串长度
 * @param {Object} limits - { fieldName: { min: number, max: number } }
 * @returns {Function} Express 中间件
 */
export function validateLength(limits) {
  return (req, res, next) => {
    for (const [field, { min, max }] of Object.entries(limits)) {
      const value = req.body[field];
      if (value === undefined || value === null) continue;
      if (typeof value !== 'string') {
        return res.status(400).json({
          success: false,
          error: `参数 ${field} 应为字符串`,
        });
      }
      if (value.length < min || value.length > max) {
        return res.status(400).json({
          success: false,
          error: `参数 ${field} 长度需在 ${min}-${max} 之间, 实际 ${value.length}`,
        });
      }
    }
    next();
  };
}