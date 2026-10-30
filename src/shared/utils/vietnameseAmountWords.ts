const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const GROUP_NAMES = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

/** Reads 0–999; `full` keeps "không trăm" / "linh" for a group that follows a higher group. */
function readGroup(value: number, full: boolean) {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor(value / 10) % 10;
  const units = value % 10;
  const words: string[] = [];
  if (full || hundreds > 0) words.push(`${DIGITS[hundreds]} trăm`);
  if (tens > 1) {
    words.push(`${DIGITS[tens]} mươi`);
    if (units === 1) words.push('mốt');
    else if (units === 5) words.push('lăm');
    else if (units > 0) words.push(DIGITS[units]);
  } else if (tens === 1) {
    words.push('mười');
    if (units === 5) words.push('lăm');
    else if (units > 0) words.push(DIGITS[units]);
  } else if (units > 0) {
    if (full || hundreds > 0) words.push('linh');
    words.push(DIGITS[units]);
  }
  return words.join(' ');
}

/** Amount in Vietnamese words for documents, e.g. 1.005.000 → "Một triệu không trăm linh năm nghìn đồng". */
export function vietnameseAmountWords(amount: number) {
  const value = Math.round(Math.abs(Number(amount) || 0));
  if (value === 0) return 'Không đồng';
  const groups: number[] = [];
  for (let rest = value; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  const words: string[] = [];
  for (let index = groups.length - 1; index >= 0; index--) {
    if (groups[index] === 0) continue;
    const full = index < groups.length - 1;
    words.push([readGroup(groups[index], full), GROUP_NAMES[index]].filter(Boolean).join(' '));
  }
  const sentence = `${amount < 0 ? 'âm ' : ''}${words.join(' ')} đồng`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
