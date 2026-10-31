// Личные финансы (только владелец): users/{uid}/payments, expenses, plans/{YYYY-MM}
import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./auth";

export interface Payment { projectId: string; projectName: string; amount: number; date: string; note?: string; }
export interface Expense { title: string; amount: number; date: string; category?: string;
  months?: number;   // расход: растянуть на N месяцев (подписка за полгода, разработка)
  period?: string;   // доход: за какой месяц (предоплата 25.09 за октябрь → "2026-10")
}
// Регулярный расход: фикс ₽ в месяц или % от доходов месяца
export interface Recurring { title: string; kind: "fixed" | "percent"; amount: number; category?: string; from: string; to?: string; }

export const addMonths = (mk: string, n: number) => { const [y, m] = mk.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
// Доля расхода в месяце mk (с учётом растягивания)
export function expShare(x: Expense, mk: string) {
  const start = x.date?.slice(0, 7); const n = Math.max(1, x.months || 1);
  if (!start || mk < start || mk > addMonths(start, n - 1)) return 0;
  return x.amount / n;
}
export const incMonth = (x: Expense) => x.period || x.date?.slice(0, 7);
export const recActive = (r: Recurring, mk: string) => r.from <= mk && (!r.to || mk <= r.to);
export interface PlanLine { title: string; amount: number; }
export interface Plan { income: PlanLine[]; expenses: PlanLine[]; }

export const rub = (n: number) => Math.round(n).toLocaleString("ru-RU") + " ₽";
export const parseAmount = (s: string) => { const n = Number(String(s).replace(/\s/g, "").replace(",", ".")); return isFinite(n) && n > 0 ? n : 0; };

export function usePlan(mk: string) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<Plan>({ income: [], expenses: [] });
  const ref = doc(db, "users", user!.uid, "plans", mk);
  useEffect(() => onSnapshot(ref, (s) => setPlan({ income: [], expenses: [], ...(s.data() as Plan | undefined) })), [user?.uid, mk]);
  return { plan, save: (p: Plan) => setDoc(ref, p) };
}

/* ---------- Абонентские услуги проекта ---------- */
// users/{uid}/billing/{projectId}: { services: Service[] }
// users/{uid}/paid/{YYYY-MM}: { [projectId_serviceId]: PaidMark }
export interface Service { id: string; title: string; price: number; day: number; from?: string; prepay?: boolean; }
export interface PaidMark { paid: boolean; amount: number; date: string; skip?: boolean }

import { collection } from "firebase/firestore";

export function useBilling() {
  const { user } = useAuth();
  const [map, setMap] = useState<Record<string, Service[]>>({});
  useEffect(() => onSnapshot(collection(db, "users", user!.uid, "billing"),
    (s) => setMap(Object.fromEntries(s.docs.map((d) => [d.id, (d.data().services || []) as Service[]])))), [user?.uid]);
  const save = (pid: string, services: Service[]) => setDoc(doc(db, "users", user!.uid, "billing", pid), { services });
  return { map, save };
}

export function usePaid(mk: string) {
  const { user } = useAuth();
  const [marks, setMarks] = useState<Record<string, PaidMark>>({});
  const ref = doc(db, "users", user!.uid, "paid", mk);
  useEffect(() => onSnapshot(ref, (s) => setMarks((s.data() as Record<string, PaidMark>) || {})), [user?.uid, mk]);
  const set = (key: string, m: PaidMark | null) => setDoc(ref, { [key]: m ?? { paid: false, amount: 0, date: "" } }, { merge: true });
  return { marks, set };
}

export const newId = () => Math.random().toString(36).slice(2, 9);
export const dueOf = (mk: string, day: number) => {
  const [y, m] = mk.split("-").map(Number);
  return `${mk}-${String(Math.min(day, new Date(y, m, 0).getDate())).padStart(2, "0")}`;
};

// Ожидаемые оплаты за месяц по всем проектам
export function expected(mk: string, projects: { id: string; name: string }[], billing: Record<string, Service[]>) {
  return projects.flatMap((p) => (billing[p.id] || [])
    .filter((s) => !s.from || s.from <= mk)
    .map((s) => ({ key: `${p.id}_${s.id}`, pid: p.id, project: p.name, service: s.title, price: s.price,
      // предоплата: за месяц mk платят в предыдущем месяце
      due: dueOf(s.prepay ? addMonths(mk, -1) : mk, s.day) })))
    .sort((a, b) => a.due.localeCompare(b.due));
}

// Все отметки об оплате по месяцам — для графика
export function usePaidAll() {
  const { user } = useAuth();
  const [byMonth, setByMonth] = useState<Record<string, number>>({});
  useEffect(() => onSnapshot(collection(db, "users", user!.uid, "paid"), (s) =>
    setByMonth(Object.fromEntries(s.docs.map((d) => [d.id,
      Object.values(d.data() as Record<string, PaidMark>).filter((m) => m?.paid).reduce((a, m) => a + (m.amount || 0), 0)])))), [user?.uid]);
  return byMonth;
}

// Чистая прибыль бизнеса за месяц — та же логика, что в P&L (для «Личных денег»)
import { useCollection } from "./store";
export function useBusinessProfit() {
  const payments = useCollection<Payment>("payments").items;
  const manual = useCollection<Expense>("incomes").items;
  const expenses = useCollection<Expense>("expenses").items;
  const recurring = useCollection<Recurring>("recurring").items;
  const paidByMonth = usePaidAll();
  return (mk: string) => {
    const I = payments.filter((p) => p.date?.startsWith(mk)).reduce((a, p) => a + p.amount, 0)
      + (paidByMonth[mk] || 0) + manual.filter((x) => incMonth(x) === mk).reduce((a, x) => a + x.amount, 0);
    const E = expenses.reduce((a, x) => a + expShare(x, mk), 0)
      + recurring.filter((r) => recActive(r, mk)).reduce((a, r) => a + (r.kind === "percent" ? I * r.amount / 100 : r.amount), 0);
    return { income: I, expenses: E, profit: I - E };
  };
}
