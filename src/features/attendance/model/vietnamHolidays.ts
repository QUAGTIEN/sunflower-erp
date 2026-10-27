/**
 * Vietnamese public holidays (Labour Code 2019, art. 112) computed per year.
 * Lunar dates use Ho Ngoc Duc's algorithm at UTC+7: Chinese (UTC+8) lunar libraries
 * occasionally start a month one day apart, which would move Tết.
 */
const VIETNAM_TIME_ZONE = 7;
const SYNODIC_MONTH = 29.530588853;
const LUNAR_EPOCH = 2415021.076998695;
const floor = Math.floor;
const radians = Math.PI / 180;

export interface Holiday {
  date: string;
  name: string;
}

function julianDay(day: number, month: number, year: number) {
  const a = floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + floor((153 * m + 2) / 5) + 365 * y + floor(y / 4) - floor(y / 100) + floor(y / 400) - 32045;
}

function isoDateFromJulianDay(julian: number) {
  const a = julian + 32044;
  const b = floor((4 * a + 3) / 146097);
  const c = a - floor((b * 146097) / 4);
  const d = floor((4 * c + 3) / 1461);
  const e = c - floor((1461 * d) / 4);
  const m = floor((5 * e + 2) / 153);
  const day = e - floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * floor(m / 10);
  const year = b * 100 + d - 4800 + floor(m / 10);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function newMoon(k: number) {
  const t = k / 1236.85;
  const t2 = t * t;
  const t3 = t2 * t;
  const mean = 2415020.75933 + 29.53058868 * k + 0.0001178 * t2 - 0.000000155 * t3;
  const corrected = mean + 0.00033 * Math.sin((166.56 + 132.87 * t - 0.009173 * t2) * radians);
  const sunAnomaly = 359.2242 + 29.10535608 * k - 0.0000333 * t2 - 0.00000347 * t3;
  const moonAnomaly = 306.0253 + 385.81691806 * k + 0.0107306 * t2 + 0.00001236 * t3;
  const latitude = 21.2964 + 390.67050646 * k - 0.0016528 * t2 - 0.00000239 * t3;
  const sin = (degrees: number) => Math.sin(degrees * radians);
  const correction =
    (0.1734 - 0.000393 * t) * sin(sunAnomaly) +
    0.0021 * sin(2 * sunAnomaly) -
    0.4068 * sin(moonAnomaly) +
    0.0161 * sin(2 * moonAnomaly) -
    0.0004 * sin(3 * moonAnomaly) +
    0.0104 * sin(2 * latitude) -
    0.0051 * sin(sunAnomaly + moonAnomaly) -
    0.0074 * sin(sunAnomaly - moonAnomaly) +
    0.0004 * sin(2 * latitude + sunAnomaly) -
    0.0004 * sin(2 * latitude - sunAnomaly) -
    0.0006 * sin(2 * latitude + moonAnomaly) +
    0.001 * sin(2 * latitude - moonAnomaly) +
    0.0005 * sin(2 * moonAnomaly + sunAnomaly);
  const deltaT =
    t < -11
      ? 0.001 + 0.000839 * t + 0.0002261 * t2 - 0.00000845 * t3 - 0.000000081 * t * t3
      : -0.000278 + 0.000265 * t + 0.000262 * t2;
  return corrected + correction - deltaT;
}

function sunLongitude(julian: number) {
  const t = (julian - 2451545.0) / 36525;
  const t2 = t * t;
  const anomaly = 357.5291 + 35999.0503 * t - 0.0001559 * t2 - 0.00000048 * t * t2;
  const meanLongitude = 280.46645 + 36000.76983 * t + 0.0003032 * t2;
  const equation =
    (1.9146 - 0.004817 * t - 0.000014 * t2) * Math.sin(radians * anomaly) +
    (0.019993 - 0.000101 * t) * Math.sin(radians * 2 * anomaly) +
    0.00029 * Math.sin(radians * 3 * anomaly);
  const longitude = (meanLongitude + equation) * radians;
  return longitude - Math.PI * 2 * floor(longitude / (Math.PI * 2));
}

const newMoonDay = (k: number) => floor(newMoon(k) + 0.5 + VIETNAM_TIME_ZONE / 24);
const sunSector = (julian: number) => floor((sunLongitude(julian - 0.5 - VIETNAM_TIME_ZONE / 24) / Math.PI) * 6);

function lunarMonth11(year: number) {
  const k = floor((julianDay(31, 12, year) - 2415021) / SYNODIC_MONTH);
  const day = newMoonDay(k);
  return sunSector(day) >= 9 ? newMoonDay(k - 1) : day;
}

function leapMonthOffset(month11: number) {
  const k = floor((month11 - LUNAR_EPOCH) / SYNODIC_MONTH + 0.5);
  let index = 1;
  let sector = sunSector(newMoonDay(k + index));
  let previous: number;
  do {
    previous = sector;
    index += 1;
    sector = sunSector(newMoonDay(k + index));
  } while (sector !== previous && index < 14);
  return index - 1;
}

/** Julian day of a (non-leap) lunar date in the Vietnamese calendar. */
function lunarJulianDay(lunarDay: number, lunarMonth: number, lunarYear: number) {
  const before11 = lunarMonth < 11;
  const start = lunarMonth11(before11 ? lunarYear - 1 : lunarYear);
  const end = lunarMonth11(before11 ? lunarYear : lunarYear + 1);
  const k = floor(0.5 + (start - LUNAR_EPOCH) / SYNODIC_MONTH);
  let offset = (lunarMonth - 11 + 12) % 12;
  // A 13-month lunar year has a leap month; months after it shift by one new moon.
  if (end - start > 365 && offset >= leapMonthOffset(start)) offset += 1;
  return newMoonDay(k + offset) + lunarDay - 1;
}

/** Solar date (YYYY-MM-DD) of a lunar date, e.g. Tết is lunarToSolar(1, 1, year). */
export const lunarToSolar = (lunarDay: number, lunarMonth: number, lunarYear: number) =>
  isoDateFromJulianDay(lunarJulianDay(lunarDay, lunarMonth, lunarYear));

const isSunday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
const nextDay = (date: string) => {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
};

/**
 * Default holidays of a year. Tết spans New Year's Eve to the 4th day and Quốc khánh adds 1/9; the
 * government fixes the exact days each year, so Admin/Kế toán can override them on the calendar.
 */
export function defaultHolidays(year: number): Holiday[] {
  const tet = lunarJulianDay(1, 1, year);
  const holidays: Holiday[] = [
    { date: `${year}-01-01`, name: 'Tết Dương lịch' },
    ...[-1, 0, 1, 2, 3].map(offset => ({ date: isoDateFromJulianDay(tet + offset), name: 'Tết Nguyên đán' })),
    { date: lunarToSolar(10, 3, year), name: 'Giỗ Tổ Hùng Vương' },
    { date: `${year}-04-30`, name: 'Ngày Giải phóng miền Nam' },
    { date: `${year}-05-01`, name: 'Quốc tế Lao động' },
    { date: `${year}-09-01`, name: 'Nghỉ lễ Quốc khánh' },
    { date: `${year}-09-02`, name: 'Quốc khánh' }
  ];
  const taken = new Set(holidays.map(holiday => holiday.date));
  // A single-day holiday on Sunday is compensated on the next working day; Tết is fixed as one block.
  const compensations = holidays
    .filter(holiday => holiday.name !== 'Tết Nguyên đán' && isSunday(holiday.date))
    .map(holiday => {
      let date = nextDay(holiday.date);
      while (taken.has(date) || isSunday(date)) date = nextDay(date);
      taken.add(date);
      return { date, name: `Nghỉ bù ${holiday.name}` };
    });
  return [...holidays, ...compensations].sort((a, b) => a.date.localeCompare(b.date));
}
