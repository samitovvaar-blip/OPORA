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
    const incoming = /(?:^|\s)(?:приход|доход|поступление|выручка)(?=$|[\s:])/iu.test(line);
    const outgoing = /(?:^|\s)(?:расход|затраты)(?=$|[\s:])/iu.test(line);
    const iso = line.match(/\b\d{4}-\d{2}-\d{2}\b/);
    const numeric = line.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
    const named = line.match(new RegExp(`(?:^|\\s)(${months.join("|")})[а-яё]*\\s+(\\d{4})(?=\\s|:|$)`, "iu"));
    const namedMonth = named ? named[2] + "-" + String(months.findIndex((month) => new RegExp(`^${month}$`, "iu").test(named[1])) + 1).padStart(2, "0") : "";
    const date = iso?.[0] ?? (numeric ? `${numeric[3]}-${numeric[2]}-${numeric[1]}` : monthEnd(namedMonth || fallbackMonth));
    const withoutDate = line.replace(iso?.[0] ?? numeric?.[0] ?? named?.[0] ?? "", " ");
    const amountMatch = withoutDate.match(/(?:^|[\s:])((?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[,.]\d{1,2})?)(?:\s*(тыс(?:яч(?:и|а)?)?\.?|[кk]))?(?=[\s₽.,:]|$)/iu);
    const amount = amountMatch
      ? Math.round(Number(amountMatch[1].replace(/[\s\u00a0\u202f]/g, "").replace(",", ".")) * (amountMatch[2] ? 1000 : 1) * 100) / 100 : 0;
    if (incoming === outgoing || !validHistoryDate(date) || !Number.isFinite(amount) || amount <= 0) {
      rejected.push(line);
      continue;
    }
    const account = withoutDate.match(/\sна\s+([^,.]+?)(?=\s+за\s|$)/iu)?.[1]?.trim() ?? "Расчётный счёт";
    rows.push({ type: incoming ? "in" : "out", date, amount, account, note: line });
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
