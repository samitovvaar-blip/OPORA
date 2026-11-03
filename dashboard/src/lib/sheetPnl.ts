// Разбор листа P&L из Google-таблицы (формат «ПНЛ по направлению»):
// строка с месяцами, над ней — статусы («СДАНО»), слева — статьи, «Итого» — по отделам.
export interface PnlMonth { mk?: string; col: number; label: string; year?: string; status: string; closed: boolean; }
export interface PnlRow { name: string; sub: string; total: boolean; section: boolean; values: (number | null)[]; }
export interface Dds { months: PnlMonth[]; rows: PnlRow[]; inflow: (number | null)[]; outflow: (number | null)[]; other?: (number | null)[]; net: (number | null)[]; }
export interface Pnl { db?: boolean; dds?: Dds; title: string; months: PnlMonth[]; rows: PnlRow[]; at?: string;
  revenue: (number | null)[]; profit: (number | null)[]; variable: (number | null)[]; fixed: (number | null)[]; depts: PnlRow[]; stale?: boolean;
  ddsRaw?: { months: string[]; rows: DbRow[] }; balances?: Balances | null;
  metrics?: Record<string, (number | null)[]>;
  tagMetrics?: Record<string, (number | null)[]>;
  salaryItems?: { name: string; values: (number | null)[] }[];   // из чего сложился ФОТ   // метрики из справочника (колонка D)
  goods?: Goods | null;   // товарный учёт (если есть в таблице)
}

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

// Таблица большая — скрипт иногда отвечает долго или с ошибкой Google. Пробуем до 3 раз,
// а если не вышло — показываем последний удачно загруженный отчёт из памяти браузера.
// ===== Заморозка сданных месяцев =====
// При отметке «Сдано» сохраняем снимок цифр месяца (ОПиУ + ДДС). Дальше этот месяц берётся из снимка,
// даже если в таблице что-то изменилось или слетело.
export interface MonthSnap { rows: { process: string; article: string; v: number }[]; dds: { process: string; article: string; account?: string; v: number }[]; at: string; }
export function sliceMonth(j: any, mk: string): MonthSnap {
  const pick = (rows: DbRow[] = []) => rows.filter((r) => r.values?.[mk] != null).map((r) => ({ process: r.process, article: r.article, account: r.account, v: r.values[mk] }));
  return { rows: pick(j.rows).map(({ account, ...x }) => x), dds: pick(j.dds?.rows), at: new Date().toISOString() };
}
function applySnaps(j: any, snaps: Record<string, MonthSnap>) {
  if (j.mode !== "db") return j;
  const put = (rows: DbRow[], items: { process: string; article: string; account?: string; v: number }[], mk: string) => {
    rows.forEach((r) => { if (r.values) delete r.values[mk]; });
    items.forEach((it) => {
      let r = rows.find((x) => x.process === it.process && x.article === it.article && (x.account || "") === (it.account || ""));
      if (!r) { r = { process: it.process, article: it.article, account: it.account, values: {} }; rows.push(r); }
      r.values[mk] = it.v;
    });
  };
  Object.entries(snaps).forEach(([mk, sn]) => {
    put(j.rows, sn.rows, mk); if (!j.months.includes(mk)) j.months = [...j.months, mk].sort();
    if (j.dds) { put(j.dds.rows, sn.dds, mk); if (!j.dds.months.includes(mk)) j.dds.months = [...j.dds.months, mk].sort(); }
  });
  return j;
}

export async function loadPnl(url: string, closed: string[] = [], snaps: Record<string, MonthSnap> = {}): Promise<Pnl> {
  const key = "pnl:" + url.replace("&fresh=1", "");
  const build = (j: any): Pnl => j.mode === "db" ? { ...buildFromDb(applySnaps(j, snaps), closed), goods: j.goods || null } : { ...parsePnl(j.values, j.title || j.sheet), at: j.at };
  let last = "";
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url);
      const j = await r.json().catch(() => { throw new Error("Таблица ответила не JSON — проверь ссылку и доступ «Все»"); });
      if (j.error) throw new Error(j.error);
      try { localStorage.setItem(key, JSON.stringify(j)); } catch {}
      return build(j);
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      if (/ключ|направлен|не найден|колонк/i.test(last)) break;   // ошибки настройки — повтор не поможет
      await new Promise((ok) => setTimeout(ok, 1500 * (a + 1)));
    }
  }
  try { const c = localStorage.getItem(key); if (c) { const j = JSON.parse(c); return { ...build(j), stale: true }; } } catch {}
  throw new Error(last === "Failed to fetch" || /load failed|network/i.test(last) ? "Google-таблица не ответила (нет связи или скрипт перегружен). Обнови страницу через минуту." : last);
}

/* ---------- Отчёт из базы операций (mode: "db") ---------- */
const RU = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const DEPTS: Record<string, string> = { "1": "1. Производственный отдел", "2": "2. Отдел продаж", "3": "3. Отдел маркетинга",
  "4": "4. Админ-хоз отдел и Руководство", "5": "5. Финансовый отдел", "6": "6. Фондирование" };

export interface DbRow { process: string; article: string; account?: string; fund?: boolean; values: Record<string, number>; }
export interface Balance { group: string; account: string; start: number; checked: boolean; checkedAt: string; balance: number; who: string; }
export interface Goods { groups: Record<string, string>; items: Record<string, Record<string, { inQ: number; outQ: number; inS: number; outS: number }>>; months: string[]; error?: string; inventory?: Record<string, Record<string, number>>; inventorySum?: Record<string, Record<string, number>>; }
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
  const isOther = (r: DbRow) => /^\s*\*\*|для ддс|не выяснен|между сч|внутрен|субсч|фонд|^\s*6\.|^\s*прочее/i.test(r.process + " | " + r.article);
  const ins = d.rows.filter((r) => !isOther(r) && /^\s*(доход|выручк|поступлен)/i.test(r.process));
  const outs = d.rows.filter((r) => !isOther(r) && !/^\s*(доход|выручк|поступлен)/i.test(r.process));
  const others = d.rows.filter(isOther);
  const inflow = sum(ins), outflow = sum(outs), other = sum(others);
  add("Поступления", mks.map(() => null), { section: true }); add("ПОСТУПЛЕНИЯ ИТОГО", inflow); group(ins);
  add("Выплаты", mks.map(() => null), { section: true }); add("ВЫПЛАТЫ ИТОГО", outflow); group(outs);
  add("Прочее", mks.map(() => null), { section: true }); add("ПРОЧЕЕ ИТОГО", other); group(others);
  const netFlow = mks.map((_, i) => ((inflow[i] || 0) + (outflow[i] || 0) + (other[i] || 0)) || null);
  add("ЧИСТЫЙ ДЕНЕЖНЫЙ ПОТОК", netFlow);
  return { months, rows, inflow, outflow, other, net: netFlow };
}

export function buildFromDb(j: { title?: string; months: string[]; rows: DbRow[]; at?: string; dds?: { months: string[]; rows: DbRow[] }; balances?: Balances | null; dirMeta?: { types: Record<string, string>; metrics: Record<string, string>; order: string[] } }, closed: string[] = []): Pnl {
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
  // Справочник с нумерованными отделами (1.x…6.x, как у ОПОРЫ) или свой (просто группы: «Доходы», «Расходы», …)
  const numbered = j.rows.some((r) => /^[1-5]/.test(r.process.trim()));
  if (numbered) j = { ...j, rows: j.rows.map((r) => isTax(r) && deptOf0(r.process) !== "5" ? { ...r, process: "5.1. Процесс: Налоги, кредиты и займы" } : r) };
  // «Выручка доставка СДЭК» — отдельной строкой рядом с «Выручка почта» (в производственном отделе)
  const postProc = j.rows.find((r) => /выручк.*почт/i.test(r.article))?.process;
  if (postProc) j = { ...j, rows: j.rows.map((r) => /выручк.*сдэк/i.test(r.article) ? { ...r, process: postProc } : r) };
  const deptOf = deptOf0;
  // Доход — только процесс «Доходы». Прочее без номера («Расходы: Вывел на личный счёт» и т.п.)
  // — это движение денег собственника, в ОПиУ не входит.
  const isIncome = (r: DbRow) => /^(доход|выручк|поступлен)/i.test(r.process.trim());
  const income = j.rows.filter(isIncome);
  // не расходы бизнеса: переводы между своими счетами, вывод собственнику, фонды (они ниже прибыли)
  const notExpense = (r: DbRow) => /между сч|внутрен|вывел|на личн/i.test(r.article + " " + r.process) || /^\s*\*\*|субсч/i.test(r.process);
  const isFund = (r: DbRow) => /^6/.test(r.process.trim()) || /фондир|^фонд/i.test(r.process.trim());
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
  // Метрики из справочника (колонка D): статьи с одной меткой суммируются
  const tagMetrics: Record<string, (number | null)[]> = {};
  const mt = j.dirMeta?.metrics || {};
  const lowMt = Object.fromEntries(Object.entries(mt).map(([a, m]) => [a.trim().toLowerCase(), m]));
  [...new Set(Object.values(mt))].forEach((tag) => { tagMetrics[tag] = sumOf(j.rows.filter((r) => lowMt[r.article.trim().toLowerCase()] === tag)); });
  // Общие метрики для всех клиентов: ищем по названию статьи
  const art = (re: RegExp, not?: RegExp) => sumOf(j.rows.filter((r) => !isIncome(r) && re.test(r.article) && !(not && not.test(r.article))));
  const common = { dividends: art(/дивиден/i), refunds: art(/возврат/i), taxes: sumOf(j.rows.filter((r) => isTax(r) && !isIncome(r))),
    salary: art(/зарплат|з\/п|\bзп\b|фот|оклад|преми|мотивац/i, /налог/i) };
  const salRe = /зарплат|з\/п|\bзп\b|фот|оклад|преми|мотивац|аванс сотр/i;
  const salaryItems = [...new Set(j.rows.filter((r) => !isIncome(r) && salRe.test(r.article) && !/налог/i.test(r.article)).map((r) => r.article.trim()))]
    .map((name) => ({ name, values: sumOf(j.rows.filter((r) => !isIncome(r) && r.article.trim() === name)) }));
  const types = j.dirMeta?.types || {};
  // Простой справочник: колонка A — сразу ТИП (Доход / Переменные / Постоянные / Фонд / Не учитывать), B — статьи
  const TYPE_RE = /^(доход|выручк|переменн|постоянн|фонд|не учит|проч)/i;
  const simple = j.rows.some((r) => TYPE_RE.test(r.process.trim()) && !/^доход/i.test(r.process.trim()));
  if (Object.keys(types).length || simple) {
    // Справочник с типами групп (колонка C) — отчёт строится строго по нему
    const lowT = Object.fromEntries(Object.entries(types).map(([g, t]) => [g.trim().toLowerCase(), t.toLowerCase()]));
    const kind = (r: DbRow) => { const t = lowT[r.process.trim().toLowerCase()] || (TYPE_RE.test(r.process.trim()) ? r.process.trim().toLowerCase() : "");
      if (/доход|выруч|поступл/.test(t)) return "inc"; if (/перемен/.test(t)) return "var"; if (/постоян/.test(t)) return "fix";
      if (/фонд/.test(t)) return "fund"; if (/не уч|исключ|не ву|проч/.test(t)) return "skip";   // «Прочее» (капитал, займы, ошибочные возвраты) — не в ОПиУ
      return isIncome(r) ? "inc" : notExpense(r) ? "skip" : isFund(r) ? "fund" : "fix"; };
    // выручку пересчитываем по типам (строки выручки уже добавлены выше — перестраиваем отчёт с нуля)
    rows.length = 0;
    const incT = j.rows.filter((r) => kind(r) === "inc"), varT = j.rows.filter((r) => kind(r) === "var"), fixT = j.rows.filter((r) => kind(r) === "fix"), fundT = j.rows.filter((r) => kind(r) === "fund");
    const order = (j.dirMeta?.order || []).map((x) => x.trim().toLowerCase());
    const groupsOf = (list: DbRow[]) => [...new Set(list.map((r) => r.process || "Без группы"))].sort((a, b) => {
      const ia = order.indexOf(a.trim().toLowerCase()), ib = order.indexOf(b.trim().toLowerCase()); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b, "ru"); });
    const block = (list: DbRow[]) => groupsOf(list).forEach((g) => { const inG = list.filter((r) => (r.process || "Без группы") === g);
      // группа = сам тип (простой справочник) — статьи сразу под разделом, без промежуточной строки
      if (TYPE_RE.test(g.trim())) { inG.sort((a, b) => a.article.localeCompare(b.article, "ru")).forEach((r) => add(r.article, sumOf([r]), { sub: "Процесс" })); return; }
      add(g, sumOf(inG), { sub: "Итого", total: true });
      inG.sort((a, b) => a.article.localeCompare(b.article, "ru")).forEach((r) => add(r.article, sumOf([r]), { sub: "Процесс" })); });
    add("Доходы", mks.map(() => null), { section: true });
    const revT = sumOf(incT); add("ВЫРУЧКА ИТОГО", revT);
    incT.sort((a, b) => a.article.localeCompare(b.article, "ru")).forEach((r) => add(r.article, sumOf([r]), { sub: "Процесс" }));
    add("Расходы", mks.map(() => null), { section: true });
    const vS = sumOf(varT), fS = sumOf(fixT);
    if (varT.length) { add("ПЕРЕМЕННЫЕ РАСХОДЫ", vS); block(varT); }
    if (fixT.length) { add("ПОСТОЯННЫЕ РАСХОДЫ", fS); block(fixT); }
    const profT = revT.map((v, i) => (v || 0) + (vS[i] || 0) + (fS[i] || 0) || null);
    add("ЧИСТАЯ ПРИБЫЛЬ", profT);
    if (fundT.length) { add("Фондирование (после прибыли)", sumOf(fundT)); fundT.forEach((r) => add(r.article, sumOf([r]), { sub: "Процесс" })); }
    const none = mks.map(() => null);
    // ключевые метрики по справочнику: доля переменных, постоянных и каждого отдела (если своих меток нет)
    if (!Object.keys(tagMetrics).length) {
      if (varT.length) tagMetrics["Переменные расходы"] = vS;
      if (fixT.length) tagMetrics["Постоянные расходы"] = fS;
      groupsOf([...varT, ...fixT]).filter((g) => !TYPE_RE.test(g.trim())).forEach((g) => { tagMetrics[g] = sumOf([...varT, ...fixT].filter((r) => (r.process || "Без группы") === g)); });
    }
    return { salaryItems, metrics: { ...common, outsource: none, d1: tagMetrics["Себестоимость"] || none, d2: none, d3: tagMetrics["Маркетинг"] || none, d4: none, d5: none },
      tagMetrics, ddsRaw: j.dds, balances: cleanBalances(j.balances), db: true, dds: j.dds ? buildDds(j.dds) : undefined, title: j.title || "", months, rows, at: j.at,
      revenue: revT, profit: profT, variable: vS, fixed: fS,
      // структура расходов: группы, а в простом справочнике — сами статьи расходов
      depts: rows.some((r) => r.total) ? rows.filter((r) => r.total)
        : [...varT, ...fixT].map((r) => ({ name: r.article, sub: "Итого", total: true, section: false, values: sumOf([r]) })) };
  }
  if (!numbered) {
    // Универсально: каждая группа (процесс) из справочника — строка расходов, внутри статьи
    const exp = j.rows.filter((r) => !isIncome(r) && !notExpense(r) && !isFund(r));
    const expSum = sumOf(exp);
    add("РАСХОДЫ ИТОГО", expSum);
    [...new Set(exp.map((r) => r.process || "Без группы"))].sort((a, b) => a.localeCompare(b, "ru")).forEach((proc) => {
      const inP = exp.filter((r) => (r.process || "Без группы") === proc);
      add(proc, sumOf(inP), { sub: "Процесс" });
      inP.sort((a, b) => a.article.localeCompare(b.article, "ru")).forEach((r) => add(r.article, sumOf([r]), { sub: r.article }));
    });
    const profitU = revenue.map((v, i) => (v || 0) + (expSum[i] || 0) || null);
    add("ЧИСТАЯ ПРИБЫЛЬ", profitU);
    const fondU = j.rows.filter((r) => !isIncome(r) && isFund(r));
    if (fondU.length) { add("Фондирование (после прибыли)", sumOf(fondU)); articles(fondU); }
    const none = mks.map(() => null);
    const groups = [...new Set(exp.map((r) => r.process || "Без группы"))].map((proc) => ({ name: proc, sub: "Итого", total: true, section: false, values: sumOf(exp.filter((r) => (r.process || "Без группы") === proc)) }));
    return { tagMetrics, metrics: { ...common, outsource: none, d1: none, d2: none, d3: none, d4: none, d5: none },
      ddsRaw: j.dds, balances: cleanBalances(j.balances), db: true, dds: j.dds ? buildDds(j.dds) : undefined, title: j.title || "", months, rows, at: j.at, revenue, profit: profitU, variable: expSum, fixed: none, depts: groups };
  }
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

  return { salaryItems, metrics, tagMetrics, ddsRaw: j.dds, balances: cleanBalances(j.balances), db: true, dds: j.dds ? buildDds(j.dds) : undefined, title: j.title || "", months, rows, at: j.at, revenue, profit, variable: varSum, fixed: fixSum,
    depts: rows.filter((r) => r.total) };
}

// Выручка = факт продаж от отдела продаж (вносится вручную). Поступления по банку остаются строкой для сверки.
export function applySales(p: Pnl, sales?: Record<string, number>, prepay?: Record<string, number>): Pnl {
  if (!p.db || !sales) return p;
  const revenue = [...p.revenue], profit = [...p.profit], bank = [...p.revenue];
  p.months.forEach((m, i) => {
    const s = m.mk ? sales[m.mk] : undefined;
    if (s == null) return;
    revenue[i] = s; profit[i] = (p.profit[i] || 0) - (bank[i] || 0) + s;
  });
  const rows: PnlRow[] = [];
  let extra: PnlRow[] = [];
  p.rows.forEach((r) => {
    // предоплаты и проверку — после статей поступлений, перед расходами
    if (extra.length && !r.sub) { rows.push(...extra); extra = []; }
    if (r.name === "ВЫРУЧКА ИТОГО") { rows.push({ ...r, name: "ВЫРУЧКА (факт продаж ОП)", values: revenue }); rows.push({ ...r, name: "Поступления по банку (для сверки)", values: bank });
      const pre = p.months.map((m) => (m.mk && prepay?.[m.mk] != null ? prepay[m.mk] : null));
      extra = [{ ...r, name: "Факт предоплат", values: pre },
        { ...r, name: "Проверка: продажи ОП − банк − предоплаты", values: p.months.map((m, i) => m.mk && sales[m.mk] != null && pre[i] != null ? Math.round((sales[m.mk] - (bank[i] || 0) - pre[i]!) * 100) / 100 : null) }]; }
    else if (r.name === "ЧИСТАЯ ПРИБЫЛЬ") rows.push({ ...r, values: profit });
    else rows.push(r);
  });
  return { ...p, rows, revenue, profit };
}

// Остатки: чистим хвосты в названиях групп («…на счетах     р»), убираем повторы счетов
function cleanBalances(b?: Balances | null): Balances | null {
  if (!b) return null;
  const seen = new Set<string>();
  const accounts = b.accounts.map((a) => ({ ...a, group: a.group.replace(/\s{2,}.*$/, "").trim() }))
    .filter((a) => !seen.has(a.account) && (seen.add(a.account), true));
  return { ...b, accounts };
}
