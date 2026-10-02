export const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const rank = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((value) => {
    const indexes = sorted.reduce((list, item, index) => item === value ? [...list, index + 1] : list, []);
    return mean(indexes);
  });
};

export const spearman = (left, right) => {
  if (left.length !== right.length || left.length < 2) return 0;
  const a = rank(left), b = rank(right);
  const aMean = mean(a), bMean = mean(b);
  const numerator = a.reduce((sum, value, index) => sum + (value - aMean) * (b[index] - bMean), 0);
  const denominator = Math.sqrt(
    a.reduce((sum, value) => sum + (value - aMean) ** 2, 0) *
    b.reduce((sum, value) => sum + (value - bMean) ** 2, 0),
  );
  return denominator ? numerator / denominator : 0;
};

export const meanAbsoluteError = (predicted, actual) => mean(predicted.map((value, index) => Math.abs(value - actual[index])));
export const shortlistAgreement = (predicted, actual) =>
  predicted.filter((value, index) => Boolean(value) === Boolean(actual[index])).length / Math.max(1, predicted.length);
