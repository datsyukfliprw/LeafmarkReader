export function normalizeIsbn(input: string) { return input.replace(/[\s-]/g, '').toUpperCase(); }
export function isValidIsbn10(input: string) {
  const isbn = normalizeIsbn(input);
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  const sum = [...isbn].reduce((acc, ch, i) => acc + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0);
  return sum % 11 === 0;
}
export function isValidIsbn13(input: string) {
  const isbn = normalizeIsbn(input);
  if (!/^\d{13}$/.test(isbn)) return false;
  const sum = [...isbn.slice(0,12)].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === Number(isbn[12]);
}
export function isValidIsbn(input: string) {
  const normalized = normalizeIsbn(input);
  return normalized.length === 10 ? isValidIsbn10(normalized) : normalized.length === 13 ? isValidIsbn13(normalized) : false;
}
export function wordCount(text: string) { return text.trim() ? text.trim().split(/\s+/).length : 0; }
export function nextPage(start: number | null, end: number | null) { return end && end >= 0 ? end + 1 : start; }
export function formatMinutes(totalSeconds: number) { const m = Math.floor(totalSeconds / 60); const h = Math.floor(m/60); return h ? `${h}h ${m%60}m` : `${m}m`; }

export function elapsedSecondsSince(startedAt:string|Date|number,nowMs=Date.now()){const start=typeof startedAt==='number'?startedAt:new Date(startedAt).getTime();return Number.isFinite(start)?Math.max(0,Math.floor((nowMs-start)/1000)):0}
export function readingGoalReached(seconds:number,goalSeconds=900){return seconds>=goalSeconds}
