// Система оплаты сотрудника: workspaces/{ws}/staff/{email}. Видят владелец и сам сотрудник.
export interface Pay { system: string; paydays: number[]; note?: string; courses?: string[]; }

// Ближайшая дата выплаты (сегодня или позже)
export function nextPayday(days: number[], from = new Date()) {
  const ok = days.filter((d) => d >= 1 && d <= 31).sort((a, b) => a - b);
  if (!ok.length) return null;
  for (let add = 0; add < 3; add++) {
    const y = from.getFullYear(), m = from.getMonth() + add;
    const last = new Date(y, m + 1, 0).getDate();
    for (const d of ok) {
      const dt = new Date(y, m, Math.min(d, last));
      if (dt >= new Date(from.getFullYear(), from.getMonth(), from.getDate())) return dt;
    }
  }
  return null;
}
export const parseDays = (s: string) => [...new Set(s.split(/[^\d]+/).map(Number).filter((n) => n >= 1 && n <= 31))];
