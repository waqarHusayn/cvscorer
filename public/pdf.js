export const itemsToLines = (pages) => pages.flat().reduce((lines, item) => {
  const line = lines.find((candidate) => Math.abs(candidate.y - item.y) < 3);
  if (line) line.items.push(item); else lines.push({ y: item.y, items: [item] });
  return lines.sort((a, b) => b.y - a.y);
}, []);
export const linesToText = (lines) => {
  const output = [];
  let previousIndent = 0;
  for (const { items } of lines) {
    const sorted = items.sort((a, b) => a.x - b.x);
    const value = sorted.map((item) => item.str.replace(/[\uf0b7\u2022▪◦]/g, '•')).join(' ').replace(/\s+/g, ' ').trim();
    const indent = sorted[0]?.x || 0;
    if (value.startsWith('•') || !output.length || !output.at(-1).startsWith('•') || indent <= previousIndent) output.push(value);
    else output[output.length - 1] += ' ' + value;
    previousIndent = indent;
  }
  return output.join('\n').replace(/\n•\s*/g, '\n• ');
};
