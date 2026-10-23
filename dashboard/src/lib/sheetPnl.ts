// Разбор листа P&L из Google-таблицы (формат «ПНЛ по направлению»):
// строка с месяцами, над ней — статусы («СДАНО»), слева — статьи, «Итого» — по отделам.
export interface PnlMonth { col: number; label: string; year?: string; status: string; closed: boolean; }
export interface PnlRow { name: string; sub: string; total: boolean; section: boolean; values: (number | null)[]; }
export interface Pnl { title: string; months: PnlMonth[]; rows: PnlRow[]; at?: string;
  revenue: (number | null)[]; profit: (number | null)[]; variable: (number | null)[]; fixed: (number | null)[]; depts: PnlRow[]; }

const MONTHS = ["январ", "феврал", "март", "апрел", "май", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"];
const isMonth = (s: string) => MONTHS.some((m) => s.toLowerCase().trim().startsWith(m));

export function num(s: string): number | null {
  if (!s) return null;
  const t = String(s).replace(/ /g, " ").trim();
  if (!t || t.includes("%")) return null;
  const neg = /^-|^\(|−/.test(t);
  const clean = t.replace(/р\.|₽|руб\.?|\s|\(|\)|−|-/gi, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const n = Number(clean); return neg ? -n : n;
}

export function parsePnl(values: string[][], title = ""): Pnl {
  const mRow = values.findIndex((r) => r.filter(isMonth).length >= 1 && r.filter(isMonth).length >= Math.min(2, r.filter(Boolean).length));
  if (mRow < 0) throw new Error("Не нашёл строку с месяцами (Январь, Февраль…)");
  const months: PnlMonth[] = [];
  values[mRow].forEach((c, i) => {
    if (!isMonth(c)) return;
    let status = "", year = "";
    for (let r = 0; r < mRow; r++) {
      const v = (values[r][i] || "").trim();
      if (/^20\d\d$/.test(v)) year = v;
      else if (v && /сдан|закрыт|готов|предв|в работе|план/i.test(v)) status = v;
    }
    months.push({ col: i, label: c.trim(), year, status, closed: /сдан|закрыт|готов/i.test(status) });
  });
  const rows: PnlRow[] = [];
  for (let r = mRow + 1; r < values.length; r++) {
    const row = values[r]; const a = (row[0] || "").trim(), b = (row[1] || "").trim();
    if (!a && !b) continue;
    const vals = months.map((m) => num(row[m.col] || ""));
    rows.push({ name: a || b, sub: a ? b : "", total: /^итого$/i.test(b), section: !vals.some((v) => v != null), values: vals });
  }
  // первая строка с этим названием, где есть числа (а не заголовок раздела)
  const find = (re: RegExp) => rows.find((x) => (re.test(x.name) || re.test(x.sub)) && !x.section)?.values || months.map(() => null);
  return {
    title, months, rows,
    revenue: find(/выручк|доход/i),
    profit: find(/чистая прибыль/i),
    variable: find(/переменн/i),
    fixed: find(/постоянн/i),
    depts: rows.filter((x) => x.total),
  };
}

export async function loadPnl(url: string): Promise<Pnl> {
  const r = await fetch(url);
  const j = await r.json().catch(() => { throw new Error("Таблица ответила не JSON — проверь ссылку и доступ «Все»"); });
  if (j.error) throw new Error(j.error);
  return { ...parsePnl(j.values, j.title || j.sheet), at: j.at };
}
