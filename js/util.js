// ابزارهای عمومی: ارقام فارسی، فرمت ریال، تاریخ شمسی، عدد به حروف
const FA = '۰۱۲۳۴۵۶۷۸۹';
export const toFa = s => String(s).replace(/\d/g, d => FA[d]);
export const toEn = s => String(s).replace(/[۰-۹]/g, d => FA.indexOf(d)).replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632).replace(/[٬,،]/g, '');
export const num = v => { const n = parseFloat(toEn(v ?? '').replace(/[٫\/]/g, '.')); return isNaN(n) ? 0 : n; };
export const fmt = n => toFa(Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));
export const rial = n => fmt(n) + ' ریال';
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- تقویم شمسی (الگوریتم jalaali) ----
const div = (a, b) => ~~(a / b), mod = (a, b) => a - ~~(a / b) * b;
const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
function jalCal(jy) {
  const bl = breaks.length, gy = jy + 621; let leapJ = -14, jp = breaks[0], jm, jump, leap, n, i;
  for (i = 1; i < bl; i++) { jm = breaks[i]; jump = jm - jp; if (jy < jm) break; leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4); jp = jm; }
  n = jy - jp; leapJ += div(n, 4) * 1 + 0; leapJ = leapJ - 0;
  leapJ = -14; jp = breaks[0];
  for (i = 1; i < bl; i++) { jm = breaks[i]; jump = jm - jp; if (jy < jm) break; leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4); jp = jm; }
  n = jy - jp; leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150, march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  leap = mod(mod(n + 1, 33) - 1, 4); if (leap === -1) leap = 4;
  return { leap, gy, march };
}
const g2d = (gy, gm, gd) => { let d = div((div(gy + div(gm - 8, 6) + 100100, 1) * 1461), 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408; d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752; return d; };
const d2g = jdn => { let j = 4 * jdn + 139361631; j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908; const i = div(mod(j, 1461), 4) * 5 + 308; const gd = div(mod(i, 153), 5) + 1, gm = mod(div(i, 153), 12) + 1, gy = div(j, 1461) - 100100 + div(8 - gm, 6); return [gy, gm, gd]; };
const j2d = (jy, jm, jd) => { const r = jalCal(jy); return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1; };
const d2j = jdn => { const gy = d2g(jdn)[0]; let jy = gy - 621; const r = jalCal(jy); const jdn1f = g2d(gy, 3, r.march); let k = jdn - jdn1f, jm, jd;
  if (k >= 0) { if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return [jy, jm, jd]; } k -= 186; } else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
  jm = 7 + div(k, 30); jd = mod(k, 30) + 1; return [jy, jm, jd]; };
export const toJalali = (gy, gm, gd) => d2j(g2d(gy, gm, gd));
export const toGregorian = (jy, jm, jd) => d2g(j2d(jy, jm, jd));
export const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const p2 = n => String(n).padStart(2, '0');
export const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export const isoToJ = iso => { const [y, m, d] = iso.split('-').map(Number); return toJalali(y, m, d); };
export const jToIso = (jy, jm, jd) => { const [y, m, d] = toGregorian(jy, jm, jd); return `${y}-${p2(m)}-${p2(d)}`; };
export const showDate = iso => { if (!iso) return ''; const [y, m, d] = isoToJ(iso); return toFa(`${y}/${p2(m)}/${p2(d)}`); };
export const longDate = iso => { const [y, m, d] = isoToJ(iso); return toFa(d) + ' ' + MONTHS[m - 1] + ' ' + toFa(y); };
export const parseJ = s => { const m = toEn(s).match(/^\s*(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\s*$/); if (!m) return null; const [y, mo, d] = [+m[1], +m[2], +m[3]]; if (mo < 1 || mo > 12 || d < 1 || d > (mo <= 6 ? 31 : 30)) return null; const iso = jToIso(y, mo, d); return isoToJ(iso).join() === [y, mo, d].join() ? iso : null; };
export const jMonthKey = iso => { const [y, m] = isoToJ(iso); return y * 100 + m; };

// ---- عدد به حروف فارسی ----
const ones = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه', 'ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const tens = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const hund = ['', 'یکصد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const units = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];
const three = n => { const p = []; if (n >= 100) { p.push(hund[~~(n / 100)]); n %= 100; } if (n >= 20) { p.push(tens[~~(n / 10)]); n %= 10; } if (n > 0) p.push(ones[n]); return p.join(' و '); };
export function words(n) {
  n = Math.round(n); if (n === 0) return 'صفر'; if (n < 0) return 'منفی ' + words(-n);
  const parts = []; let i = 0; while (n > 0) { const g = n % 1000; if (g) parts.unshift(three(g) + (units[i] ? ' ' + units[i] : '')); n = ~~(n / 1000); i++; }
  return parts.join(' و ');
}
