export interface HistoryMove {
  type: "in" | "out";
  date: string;
  amount: number;
  account: string;
  note: string;
}

const months = [
  "январ", "феврал", "март", "апрел", "ма[йяе]", "июн",
  "июл", "август", "сентябр", "октябр", "ноябр", "декабр",
];

export function validHistoryDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function monthEnd(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return "";
  const [y, m] = month.split("-").map(Number);
  return month + "-" + new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function parseProjectHistory(text: string, fallbackMonth: string) {
  const rows: HistoryMove[] = [];
  const rejected: string[] = [];
  for (const line of text.split(/[\n;]+/).map((part) => part.trim()).filter(Boolean)) {
    const iso = line.match(/\b\d{4}-\d{2}-\d{2}\b/);
    const numeric = line.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
    const named = line.match(new RegExp(`(?:^|\\s)(${months.join("|")})[а-яё]*\\s+(\\d{4})(?=\\s|:|$)`, "iu"));
    const namedMonth = named ? named[2] + "-" + String(months.findIndex((month) => new RegExp(`^${month}$`, "iu").test(named[1])) + 1).padStart(2, "0") : "";
    const date = iso?.[0] ?? (numeric ? `${numeric[3]}-${numeric[2]}-${numeric[1]}` : monthEnd(namedMonth || fallbackMonth));
    const withoutDate = line.replace(iso?.[0] ?? numeric?.[0] ?? named?.[0] ?? "", " ");
    const amounts = [...withoutDate.matchAll(/(?:^|[\s:])([+−-])\s*((?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[,.]\d{1,2})?)(?:\s*(тыс(?:яч(?:и|а)?)?\.?|[кk]))?(?=[\s₽.,:]|$)/giu)];
    const [match] = amounts;
    const amount = match
      ? Math.round(Number(match[2].replace(/\s/g, "").replace(",", ".")) * (match[3] ? 1000 : 1) * 100) / 100 : 0;
    if (amounts.length !== 1 || !validHistoryDate(date) || !Number.isFinite(amount) || amount <= 0) {
      rejected.push(line);
      continue;
    }
    const account = withoutDate.match(/\sна\s+([^,.]+?)(?=\s+за\s|$)/iu)?.[1]?.trim() ?? "Расчётный счёт";
    rows.push({ type: match[1] === "+" ? "in" : "out", date, amount, account, note: line });
  }
  return { rows, rejected };
}

const smallNumbers: Record<string, number> = {
  ноль: 0, один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9,
  десять: 10, одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14, пятнадцать: 15, шестнадцать: 16,
  семнадцать: 17, восемнадцать: 18, девятнадцать: 19, двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50,
  шестьдесят: 60, семьдесят: 70, восемьдесят: 80, девяносто: 90, сто: 100, двести: 200, триста: 300,
  четыреста: 400, пятьсот: 500, шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900,
};

function spokenAmount(value: string) {
  const digit = value.match(/\b(\d+(?:[.,]\d{1,2})?)(?:\s*(миллион(?:а|ов)?|тысяч(?:а|и)?|тыс\.?|[кk]))?/iu);
  if (digit) {
    const suffix = digit[2] || value.slice((digit.index || 0) + digit[0].length).trimStart().match(/^(миллион(?:а|ов)?|тысяч(?:а|и)?|тыс\.?|[кk])/iu)?.[1];
    return Number(digit[1].replace(",", ".")) * (/миллион/iu.test(suffix || "") ? 1_000_000 : suffix ? 1000 : 1);
  }
  const words = value.toLowerCase().replace(/ё/g, "е").split(/[^а-я]+/).filter(Boolean);
  let total = 0, group = 0, found = false;
  for (const word of words) {
    if (word in smallNumbers) { group += smallNumbers[word]; found = true; continue; }
    if (/^тысяч/.test(word)) { total += Math.max(group, 1) * 1000; group = 0; found = true; continue; }
    if (/^миллион/.test(word)) { total += Math.max(group, 1) * 1_000_000; group = 0; found = true; continue; }
    if (found && /^(руб|рубл)/.test(word)) break;
  }
  return found ? total + group : 0;
}

const incomeWords = /(?:^|\s)(?:пришл[оиа]?|получил[аи]?|поступил[оиа]?|зачислил[оиа]?|внесл[аи]?)(?=\s|$)/iu;
const expenseWords = /(?:^|\s)(?:потратил[аи]?|заплатил[аи]?|заплатили|списал[ои]?|списали|купил[аи]?|оплатил[аи]?|оплатили|расход)(?=\s|$)/iu;

export function parseSpokenHistory(text: string, date: string) {
  const chunks = text.split(/[.!?;]+|\s+(?:а\s+)?(?:потом|затем)\s+|\s+а\s+(?=(?:я\s+)?(?:потрат|заплат|спис|купил|оплат|получ|приш|внес|поступ))/iu)
    .map((part) => part.trim()).filter(Boolean);
  const rows: HistoryMove[] = [], rejected: string[] = [];
  for (const chunk of chunks) {
    const hasExpense = expenseWords.test(chunk);
    const incomingContext = /(?:мне|нам|клиент|заказчик)\s+(?:оплатил[аи]?|оплатили|заплатил[аи]?|заплатили|перевел[аи]?|перевели)/iu.test(chunk);
    const hasIncome = incomeWords.test(chunk) || incomingContext;
    const type = hasExpense && !incomingContext ? "out" : hasIncome ? "in" : null;
    const amount = spokenAmount(chunk);
    if (!type || !amount) { rejected.push(chunk); continue; }
    const purpose = chunk.match(/\s(?:на|за)\s+(.+?)(?:\s+\d|$)/iu)?.[1]?.trim();
    rows.push({ type, date, amount, account: "Расчётный счёт", note: purpose || chunk });
  }
  return { rows, rejected };
}

export function calculateLtv(moves: { type: string; date: string; amount: number; projectId?: string }[], ids: string[]) {
  const projects = new Set(ids);
  let income = 0, expenses = 0;
  const paidMonths = new Set<string>();
  let entries = 0;
  for (const move of moves) {
    if (!move.projectId || !projects.has(move.projectId) || !Number.isFinite(move.amount)) continue;
    if (move.type === "in") {
      income += move.amount;
      if (move.amount > 0 && move.date) paidMonths.add(move.date.slice(0, 7));
    } else if (move.type === "out") expenses += move.amount;
    else continue;
    entries += 1;
  }
  return { sum: Math.round((income - expenses) * 100) / 100, income, expenses, months: paidMonths.size, entries };
}
