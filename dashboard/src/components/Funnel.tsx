// Конверсия за месяц: лиды → квалифицированные → продажи → сумма. Личное: users/{uid}/funnel/{YYYY-MM}
import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { monthKey } from "../lib/catalog";
import { addMonths, rub } from "../lib/money";

interface F { leads: number; qualified: number; sales: number; amount: number; }
const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const pct = (a: number, b: number) => (b ? Math.round(a / b * 100) + "%" : "—");

export default function Funnel() {
  const { user } = useAuth();
  const [mk, setMk] = useState(monthKey(new Date()));
  const [f, setF] = useState<F>({ leads: 0, qualified: 0, sales: 0, amount: 0 });
  const [prev, setPrev] = useState<F | null>(null);
  const ref = (k: string) => doc(db, "users", user!.uid, "funnel", k);
  useEffect(() => onSnapshot(ref(mk), (d) => setF({ leads: 0, qualified: 0, sales: 0, amount: 0, ...(d.data() as F | undefined) })), [mk]);
  useEffect(() => onSnapshot(ref(addMonths(mk, -1)), (d) => setPrev((d.data() as F) || null)), [mk]);
  const save = (k: keyof F, v: string) => {
    const n = Math.max(0, Number(String(v).replace(/\s/g, "").replace(",", ".")) || 0);
    if (n !== f[k]) setDoc(ref(mk), { [k]: n }, { merge: true });
  };
  const [y, m] = mk.split("-").map(Number);
  const delta = (k: keyof F) => {
    if (!prev || !prev[k]) return null; const d = f[k] - prev[k];
    return <span className={`small ${d >= 0 ? "ok" : "error"}`}> {d >= 0 ? "▲" : "▼"} {k === "amount" ? rub(Math.abs(d)) : Math.abs(d)}</span>;
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
      </div>
    </div>
  );
}
