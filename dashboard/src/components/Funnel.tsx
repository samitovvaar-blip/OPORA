// Конверсия за месяц: лиды → квалифицированные → продажи → сумма. Личное: users/{uid}/funnel/{YYYY-MM}
import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { monthKey } from "../lib/catalog";
import { addMonths, expShare, Expense, recActive, Recurring, rub } from "../lib/money";
import { useCollection } from "../lib/store";

// «Маркетинг» в расходах P&L: категория со словами маркетинг / реклама / продвижение
const isMkt = (c?: string) => /маркет|реклам|продвиж|таргет|smm/i.test(c || "");

interface F { spent: number; leads: number; qualified: number; sales: number; amount: number; }
const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const pct = (a: number, b: number) => (b ? Math.round(a / b * 100) + "%" : "—");

export default function Funnel() {
  const { user } = useAuth();
  const [mk, setMk] = useState(monthKey(new Date()));
  const [f, setF] = useState<F>({ spent: 0, leads: 0, qualified: 0, sales: 0, amount: 0 });
  const [prev, setPrev] = useState<F | null>(null);
  const ref = (k: string) => doc(db, "users", user!.uid, "funnel", k);
  useEffect(() => onSnapshot(ref(mk), (d) => setF({ spent: 0, leads: 0, qualified: 0, sales: 0, amount: 0, ...(d.data() as F | undefined) })), [mk]);
  useEffect(() => onSnapshot(ref(addMonths(mk, -1)), (d) => setPrev((d.data() as F) || null)), [mk]);
  const save = (k: keyof F, v: string) => {
    const n = Math.max(0, Number(String(v).replace(/\s/g, "").replace(",", ".")) || 0);
    if (n !== f[k]) setDoc(ref(mk), { [k]: n }, { merge: true });
  };
  const [y, m] = mk.split("-").map(Number);
  // Вложено — берём из расходов P&L с категорией «Маркетинг»
  const expenses = useCollection<Expense>("expenses").items;
  const recurring = useCollection<Recurring>("recurring").items;
  const mktItems = [
    ...expenses.filter((x) => isMkt(x.category) && expShare(x, mk) > 0).map((x) => ({ t: x.title, v: expShare(x, mk) })),
    ...recurring.filter((r) => isMkt(r.category) && r.kind === "fixed" && recActive(r, mk)).map((r) => ({ t: r.title, v: r.amount })),
  ];
  f.spent = mktItems.reduce((a, x) => a + x.v, 0);
  const delta = (k: keyof F) => {
    if (!prev || !prev[k]) return null; const d = f[k] - prev[k];
    return <span className={`small ${d >= 0 ? "ok" : "error"}`}> {d >= 0 ? "▲" : "▼"} {k === "amount" || k === "spent" ? rub(Math.abs(d)) : Math.abs(d)}</span>;
  };
  const cell = (k: keyof F, label: string, money = false) => (
    <div className="card stat funnel-cell">
      <div className="muted">{label}</div>
      <input key={mk + k + f[k]} inputMode="decimal" defaultValue={f[k] || ""} placeholder="0" onBlur={(e) => save(k, e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="funnel-input" />
      <div className="small muted">{money && f[k] ? rub(f[k]) : " "}{delta(k)}</div>
    </div>);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row">
        <h3 style={{ margin: 0 }}>📈 Конверсия</h3>
        <span><button className="ghost" onClick={() => setMk(addMonths(mk, -1))}>‹</button>
          <b>{MONTHS[m - 1]} {y}</b>
          <button className="ghost" onClick={() => setMk(addMonths(mk, 1))}>›</button></span>
      </div>
      <div className="funnel">
        <div className="card stat funnel-cell" title={mktItems.map((x) => `${x.t}: ${rub(x.v)}`).join("\n") || "Нет расходов с категорией «Маркетинг»"}>
          <div className="muted">Вложено</div>
          <div className="funnel-input" style={{ padding: "4px 0" }}>{f.spent ? rub(f.spent) : "0"}</div>
          <div className="small muted">из <a href="#/pnl">P&L</a> · «Маркетинг»</div>
        </div>
        <div className="funnel-arrow">→<span>{f.leads && f.spent ? rub(f.spent / f.leads) : ""}</span></div>
        {cell("leads", "Лиды")}
        <div className="funnel-arrow">→<span>{pct(f.qualified, f.leads)}</span></div>
        {cell("qualified", "Квал. лиды")}
        <div className="funnel-arrow">→<span>{pct(f.sales, f.qualified)}</span></div>
        {cell("sales", "Продажи")}
        {cell("amount", "Сумма продаж", true)}
      </div>
      <div className="inline small muted" style={{ gap: 16 }}>
        <span>Лид → продажа: <b>{pct(f.sales, f.leads)}</b></span>
        <span>Средний чек: <b>{f.sales ? rub(f.amount / f.sales) : "—"}</b></span>
        <span>Выручка на лид: <b>{f.leads ? rub(f.amount / f.leads) : "—"}</b></span>
        <span>Цена лида: <b>{f.leads && f.spent ? rub(f.spent / f.leads) : "—"}</b></span>
        <span>Цена квал. лида: <b>{f.qualified && f.spent ? rub(f.spent / f.qualified) : "—"}</b></span>
        <span>Цена клиента: <b>{f.sales && f.spent ? rub(f.spent / f.sales) : "—"}</b></span>
        <span>ROMI: <b className={f.spent && f.amount < f.spent ? "error" : "ok"}>{f.spent ? Math.round((f.amount - f.spent) / f.spent * 100) + "%" : "—"}</b></span>
      </div>
    </div>
  );
}
