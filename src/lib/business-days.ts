// Feriados nacionais brasileiros + utilitários de dias úteis.

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toKey(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

// Algoritmo de Gauss/Meeus para calcular a Páscoa (domingo).
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Feriados nacionais brasileiros como Set de chaves "YYYY-MM-DD". */
export function brazilianHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  const carnavalTue = addDays(easter, -47);
  const carnavalMon = addDays(easter, -48);
  const sextaSanta = addDays(easter, -2);
  const corpusChristi = addDays(easter, 60);

  const fixed: Array<[number, number]> = [
    [1, 1],   // Confraternização Universal
    [4, 21],  // Tiradentes
    [5, 1],   // Dia do Trabalho
    [9, 7],   // Independência
    [10, 12], // Nossa Senhora Aparecida
    [11, 2],  // Finados
    [11, 15], // Proclamação da República
    [11, 20], // Consciência Negra
    [12, 25], // Natal
  ];

  const set = new Set<string>();
  for (const [m, d] of fixed) set.add(toKey(year, m, d));
  for (const d of [carnavalMon, carnavalTue, sextaSanta, corpusChristi]) {
    set.add(toKey(d.getFullYear(), d.getMonth() + 1, d.getDate()));
  }
  return set;
}

export function isBusinessDay(date: Date, holidays?: Set<string>): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  const hs = holidays ?? brazilianHolidays(date.getFullYear());
  return !hs.has(toKey(date.getFullYear(), date.getMonth() + 1, date.getDate()));
}

/** Lista dos dias úteis (números 1..N) de um mês. */
export function businessDaysOfMonth(year: number, monthZeroBased: number): number[] {
  const holidays = brazilianHolidays(year);
  const last = new Date(year, monthZeroBased + 1, 0).getDate();
  const out: number[] = [];
  for (let d = 1; d <= last; d++) {
    if (isBusinessDay(new Date(year, monthZeroBased, d), holidays)) out.push(d);
  }
  return out;
}
