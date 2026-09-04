const POSITIVE = /\b(beat|beats|growth|upgrade|record|surge|raises guidance|approval|partnership|buyback)\b|增长|超预期|上调|创新高|获批|回购|合作/i;
const NEGATIVE = /\b(miss|misses|decline|downgrade|lawsuit|probe|recall|cuts guidance|layoff|fraud)\b|下滑|不及预期|下调|调查|诉讼|召回|裁员|造假/i;

export function classifyHeadlineSentiment(text: string): number | null {
  const positive = POSITIVE.test(text);
  const negative = NEGATIVE.test(text);
  if (positive === negative) return null;
  return positive ? 0.5 : -0.5;
}
