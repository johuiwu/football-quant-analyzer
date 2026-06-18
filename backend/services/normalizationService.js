function calculateMean(numbers) {
  if (!numbers || numbers.length === 0) return 0;
  return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
}

function calculateStdDev(numbers, mean) {
  if (!numbers || numbers.length <= 1) return 1;
  const variance = numbers.reduce((sum, num) => sum + Math.pow(num - mean, 2), 0) / numbers.length;
  return Math.sqrt(variance);
}

function normalizeFeature(value, mean, stdDev) {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

export function normalizeFeatures(featureVectors) {
  if (!featureVectors || featureVectors.length === 0) return { normalized: [], stats: {} };

  const featureNames = Object.keys(featureVectors[0]).filter(key => 
    typeof featureVectors[0][key] === 'number' && key !== 'teamId'
  );

  const stats = {};

  featureNames.forEach(feature => {
    const values = featureVectors.map(v => v[feature]);
    const mean = calculateMean(values);
    const stdDev = calculateStdDev(values, mean);
    stats[feature] = { mean, stdDev };
  });

  const normalized = featureVectors.map(vector => {
    const result = { ...vector };
    featureNames.forEach(feature => {
      const { mean, stdDev } = stats[feature];
      result[`${feature}_normalized`] = normalizeFeature(vector[feature], mean, stdDev);
    });
    return result;
  });

  return { normalized, stats };
}

export function normalizeSingleFeature(value, mean, stdDev) {
  return normalizeFeature(value, mean, stdDev);
}

export function getFeatureStats(featureVectors) {
  if (!featureVectors || featureVectors.length === 0) return {};

  const featureNames = Object.keys(featureVectors[0]).filter(key => 
    typeof featureVectors[0][key] === 'number' && key !== 'teamId'
  );

  const stats = {};

  featureNames.forEach(feature => {
    const values = featureVectors.map(v => v[feature]);
    stats[feature] = {
      mean: calculateMean(values),
      stdDev: calculateStdDev(values, calculateMean(values)),
      min: Math.min(...values),
      max: Math.max(...values),
      median: values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
    };
  });

  return stats;
}
