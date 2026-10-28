// Разбор листа P&L из Google-таблицы (формат «ПНЛ по направлению»):
// строка с месяцами, над ней — статусы («СДАНО»), слева — статьи, «Итого» — по отделам.
export interface PnlMonth { mk?: string; col: number; label: string; year?: string; status: string; closed: boolean; }
export interface PnlRow { name: string; sub: string; total: boolean; section: boolean; values: (number | null)[]; }
export interface Dds { months: PnlMonth[]; rows: PnlRow[]; inflow: (number | null)[]; outflow: (number | null)[]; other?: (number | null)[]; net: (number | null)[]; }
export interface Pnl { db?: boolean; dds?: Dds; title: string; months: PnlMonth[]; rows: PnlRow[]; at?: string;
  revenue: (number | null)[]; profit: (number | null)[]; variable: (number | null)[]; fixed: (number | null)[]; depts: PnlRow[];
  ddsRaw?: { months: string[]; rows: DbRow[] }; balances?: Balances | null;
  metrics?: Record<string, (number | null)[]>; }

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

export async function loadPnl(url: string, closed: string[] = []): Promise<Pnl> {
  const r = await fetch(url);
  const j = await r.json().catch(() => { throw new Error("Таблица ответила не JSON — проверь ссылку и доступ «Все»"); });
  if (j.error) throw new Error(j.error);
  // новый скрипт: суммы из базы операций; старый: готовый лист ОПиУ
  if (j.mode === "db") return buildFromDb(j, closed);
  return { ...parsePnl(j.values, j.title || j.sheet), at: j.at };
}

/* ---------- Отчёт из базы операций (mode: "db") ---------- */
const RU = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const DEPTS: Record<string, string> = { "1": "1. Производственный отдел", "2": "2. Отдел продаж", "3": "3. Отдел маркетинга",
  "4": "4. Админ-хоз отдел и Руководство", "5": "5. Финансовый отдел", "6": "6. Фондирование" };

export interface DbRow { process: string; article: string; account?: string; values: Record<string, number>; }
export interface Balance { group: string; account: string; start: number; checked: boolean; checkedAt: string; balance: number; who: string; }
export interface Balances { start: string; accounts: Balance[]; }
// ДДС: поступления и выплаты по «Дате операции», сгруппированы по процессам
export function buildDds(d0: { months: string[]; rows: DbRow[] }, accounts?: string[]): Dds {
  // фильтр по счетам и склейка одинаковых процесс+статья с разных счетов
  const m = new Map<string, DbRow>();
  d0.rows.filter((r) => !accounts || accounts.includes(r.account || "")).forEach((r) => {
    const k = r.process + "\u0001" + r.article, x = m.get(k) || { process: r.process, article: r.article, values: {} };
    Object.entries(r.values).forEach(([mk, v]) => { x.values[mk] = (x.values[mk] || 0) + v; }); m.set(k, x);
  });
  const d = { months: d0.months, rows: [...m.values()] };
  const mks = d.months;
  const months: PnlMonth[] = mks.map((mk, i) => { const [y, m] = mk.split("-"); return { mk, col: i, label: RU[Number(m) - 1], year: y, status: "", closed: false }; });
  const vec = (f: (mk: string) => number) => mks.map((mk) => { const v = f(mk); return Math.abs(v) < 0.005 ? null : Math.round(v * 100) / 100; });
  const sum = (l: DbRow[]) => vec((mk) => l.reduce((a, r) => a + (r.values[mk] || 0), 0));
  const rows: PnlRow[] = [];
  const add = (name: string, values: (number | null)[], o: Partial<PnlRow> = {}) => rows.push({ name, sub: "", total: false, section: false, values, ...o });
  const group = (list: DbRow[]) => [...new Set(list.map((r) => r.process))].sort((a, b) => a.localeCompare(b, "ru")).forEach((proc) => {
    const l = list.filter((r) => r.process === proc);
    add(proc || "Без процесса", sum(l), { sub: "Процесс" });
    l.sort((a, b) => a.article.localeCompare(b.article, "ru")).forEach((r) => add(r.article, sum([r]), { sub: r.article }));
  });
  // Приход — только процесс «Доходы». Все остальные процессы — расход (их плюсы, напр. выручка СДЭК, уменьшают расход).
  // Отдельно внизу: фонды, «Для ДДС», «Не выяснено», переводы между счетами.
  const isOther = (r: DbRow) => /^\s*\*\*|для ддс|не выяснен|между сч|внутрен|субсч|фонд|^\s*6\./i.test(r.process + " | " + r.article);
  const ins = d.rows.filter((r) => !isOther(r) && /^\s*доход/i.test(r.process));
  const outs = d.rows.filter((r) => !isOther(r) && !/^\s*доход/i.test(r.process));
  const others = d.rows.filter(isOther);
  const inflow = sum(ins), outflow = sum(outs), other = sum(others);
  add("Поступления", mks.map(() => null), { section: true }); add("ПОСТУПЛЕНИЯ ИТОГО", inflow); group(ins);
  add("Выплаты", mks.map(() => null), { section: true }); add("ВЫПЛАТЫ ИТОГО", outflow); group(outs);
  add("Прочее", mks.map(() => null), { section: true }); add("ПРОЧЕЕ ИТОГО", other); group(others);
  const netFlow = mks.map((_, i) => ((inflow[i] || 0) + (outflow[i] || 0) + (other[i] || 0)) || null);
  add("ЧИСТЫЙ ДЕНЕЖНЫЙ ПОТОК", netFlow);
  return { months, rows, inflow, outflow, other, net: netFlow };
}

export function buildFromDb(j: { title?: string; months: string[]; rows: DbRow[]; at?: string; dds?: { months: string[]; rows: DbRow[] }; balances?: Balances | null }, closed: string[] = []): Pnl {
  const mks = j.months;
  const months: PnlMonth[] = mks.map((mk, i) => {
    const [y, m] = mk.split("-"); const isClosed = closed.includes(mk);
    return { mk, col: i, label: RU[Number(m) - 1], year: y, status: isClosed ? "СДАНО" : "", closed: isClosed };
  });
  const vec = (f: (mk: string) => number) => mks.map((mk) => { const v = f(mk); return Math.abs(v) < 0.005 ? null : Math.round(v * 100) / 100; });
  const sumOf = (list: DbRow[]) => vec((mk) => list.reduce((a, r) => a + (r.values[mk] || 0), 0));
  const isTax = (r: DbRow) => /налог/i.test(r.article) && !/фонд/i.test(r.article + r.process);
  // Оплата налогов — всегда в финансовый отдел (как в ОПиУ), даже если процесс в базе не указан
  const deptOf0 = (proc: string) => (proc.match(/^(\d)/) || [])[1] || "";
  j = { ...j, rows: j.rows.map((r) => isTax(r) && deptOf0(r.process) !== "5" ? { ...r, process: "5.1. Процесс: Налоги, кредиты и займы" } : r) };
  // «Выручка доставка СДЭК» — отдельной строкой рядом с «Выручка почта» (в производственном отделе)
  const postProc = j.rows.find((r) => /выручк.*почт/i.test(r.article))?.process;
  if (postProc) j = { ...j, rows: j.rows.map((r) => /выручк.*сдэк/i.test(r.article) ? { ...r, process: postProc } : r) };
  const deptOf = deptOf0;
  // Доход — только процесс «Доходы». Прочее без номера («Расходы: Вывел на личный счёт» и т.п.)
  // — это движение денег собственника, в ОПиУ не входит.
  const income = j.rows.filter((r) => /^доход/i.test(r.process.trim()));
  const byDept = (d: string) => j.rows.filter((r) => deptOf(r.process) === d);
  const variable = j.rows.filter((r) => ["1", "2", "3"].includes(deptOf(r.process)));
  const fixed = j.rows.filter((r) => ["4", "5"].includes(deptOf(r.process)));

  const rows: PnlRow[] = [];
  const add = (name: string, values: (number | null)[], o: Partial<PnlRow> = {}) => rows.push({ name, sub: "", total: false, section: false, values, ...o });
  const articles = (list: DbRow[]) => [...new Set(list.map((r) => r.process))].sort().forEach((proc) => {
    const inProc = list.filter((r) => r.process === proc);
    if (deptOf(proc)) add(proc, sumOf(inProc), { sub: "Процесс" });
    inProc.sort((a, b) => a.article.localeCompare(b.article, "ru")).forEach((r) => add(r.article, sumOf([r]), { sub: r.article }));
  });

  add("Доходы", mks.map(() => null), { section: true });
  const revenue = sumOf(income);
  add("ВЫРУЧКА ИТОГО", revenue);
  articles(income);
  add("Расходы", mks.map(() => null), { section: true });
  const varSum = sumOf(variable);
  add("ПЕРЕМЕННЫЕ РАСХОДЫ", varSum);
  ["1", "2", "3"].forEach((d) => { const l = byDept(d); if (l.length) { add(DEPTS[d], sumOf(l), { sub: "Итого", total: true }); articles(l); } });
  const fixSum = sumOf(fixed);
  add("ПОСТОЯННЫЕ РАСХОДЫ", fixSum);
  ["4", "5"].forEach((d) => { const l = byDept(d); if (l.length) { add(DEPTS[d], sumOf(l), { sub: "Итого", total: true }); articles(l); } });
  const profit = revenue.map((v, i) => (v || 0) + (varSum[i] || 0) + (fixSum[i] || 0) || null);
  add("ЧИСТАЯ ПРИБЫЛЬ", profit);
  const fond = byDept("6");
  if (fond.length) { add(DEPTS["6"] + " (после прибыли)", sumOf(fond)); articles(fond); }

  // Ключевые метрики (как в блоке «Ключевые метрики бизнеса» ОПиУ)
  const opex = j.rows.filter((r) => ["1", "2", "3", "4", "5"].includes(deptOf(r.process)));
  const by = (re: RegExp, not?: RegExp) => sumOf(opex.filter((r) => re.test(r.article) && !(not && not.test(r.article))));
  const metrics: Record<string, (number | null)[]> = {
    dividends: by(/дивиден/i), taxes: sumOf(j.rows.filter(isTax)), outsource: by(/аутсорс|наилю/i), refunds: by(/возврат/i),
    salary: by(/зарплат|з\/п|\bзп\b|фот|оклад|преми|мотивац|аванс сотр/i, /налог/i),
    d1: sumOf(byDept("1")), d2: sumOf(byDept("2")), d3: sumOf(byDept("3")), d4: sumOf(byDept("4")), d5: sumOf(byDept("5")) };

  return { metrics, ddsRaw: j.dds, balances: j.balances, db: true, dds: j.dds ? buildDds(j.dds) : undefined, title: j.title || "", months, rows, at: j.at, revenue, profit, variable: varSum, fixed: fixSum,
    depts: rows.filter((r) => r.total) };
}
