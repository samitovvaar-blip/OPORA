// Цели на месяц с прогрессом. Личное: users/{uid}/goals/{YYYY-MM}
import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { monthKey } from "../lib/catalog";
import { addMonths, parseAmount, rub, useBusinessProfit } from "../lib/money";

interface Custom { title: string; target: number; current: number; }
interface G { income?: number; profit?: number; clients?: number; custom?: Custom[]; }

export default function Goals() {
  const { user } = useAuth();
  const mk = monthKey(new Date());
  const ref = doc(db, "users", user!.uid, "goals", mk);
  const [g, setG] = useState<G>({});
  const [edit, setEdit] = useState(false);
  const [funnelSales, setSales] = useState(0);
  const biz = useBusinessProfit()(mk);
  useEffect(() => onSnapshot(ref, (d) => setG((d.data() as G) || {})), [user?.uid, mk]);
  useEffect(() => onSnapshot(doc(db, "users", user!.uid, "funnel", mk), (d) => setSales(d.data()?.sales || 0)), [user?.uid, mk]);
  const save = (patch: Partial<G>) => setDoc(ref, patch, { merge: true });
  const [nt, setNt] = useState({ title: "", target: "" });

  const rows: { label: string; cur: number; target?: number; money?: boolean; key?: keyof G }[] = [
    { label: "💰 Доход", cur: biz.income, target: g.income, money: true, key: "income" },
    { label: "📈 Чистая прибыль", cur: biz.profit, target: g.profit, money: true, key: "profit" },
    { label: "🤝 Новые клиенты", cur: funnelSales, target: g.clients, key: "clients" },
  ];
  const custom = g.custom || [];
  const setCustom = (c: Custom[]) => save({ custom: c });
  const daysLeft = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate();

  const Bar = ({ cur, target }: { cur: number; target: number }) => {
    const p = target ? Math.max(0, Math.min(100, cur / target * 100)) : 0;
    return <div className="progress" style={{ margin: "4px 0" }}><div style={{ width: p + "%", background: p >= 100 ? "var(--won)" : "var(--accent)" }} /></div>;
  };

  return (
    <div className="card wide">
      <div className="row"><h3 style={{ margin: 0 }}>🎯 Цели на месяц <span className="muted small">· осталось {daysLeft} дн.</span></h3>
        <button className="ghost" onClick={() => setEdit(!edit)}>{edit ? "Готово" : "✏️ Цели"}</button></div>
      {rows.map((r) => (
        <div key={r.label} style={{ marginTop: 8 }}>
          <div className="row small">
            <span>{r.label}</span>
            {edit ? <input key={r.key + String(r.target)} inputMode="decimal" defaultValue={r.target || ""} placeholder="цель" style={{ width: 120 }}
                onBlur={(e) => save({ [r.key!]: parseAmount(e.target.value) || 0 })} />
              : <span><b>{r.money ? rub(r.cur) : r.cur}</b> <span className="muted">/ {r.target ? (r.money ? rub(r.target) : r.target) : "цель не задана"}</span>
                {r.target ? <span className={r.cur >= r.target ? "ok" : "muted"}> · {Math.round(r.cur / r.target * 100)}%</span> : null}</span>}
          </div>
          {!edit && r.target ? <Bar cur={r.cur} target={r.target} /> : null}
        </div>))}
      {custom.map((c, i) => (
        <div key={i} style={{ marginTop: 8 }}>
          <div className="row small"><span>⭐ {c.title}</span>
            <span>
              <button className="ghost" onClick={() => setCustom(custom.map((x, j) => j === i ? { ...x, current: Math.max(0, x.current - 1) } : x))}>−</button>
              <b>{c.current}</b> <span className="muted">/ {c.target}</span>
              <button className="ghost" onClick={() => setCustom(custom.map((x, j) => j === i ? { ...x, current: x.current + 1 } : x))}>+</button>
              {edit && <button className="ghost" onClick={() => setCustom(custom.filter((_, j) => j !== i))}>✕</button>}
            </span></div>
          <Bar cur={c.current} target={c.target} />
        </div>))}
      {edit && <form className="inline" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); const t = parseAmount(nt.target); if (!nt.title.trim() || !t) return;
        setCustom([...custom, { title: nt.title.trim(), target: t, current: 0 }]); setNt({ title: "", target: "" }); }}>
        <input placeholder="Своя цель: 2 видео в базу знаний" value={nt.title} onChange={(e) => setNt({ ...nt, title: e.target.value })} style={{ flex: 1, minWidth: 160 }} />
        <input inputMode="decimal" placeholder="сколько" value={nt.target} onChange={(e) => setNt({ ...nt, target: e.target.value })} style={{ width: 90 }} />
        <button>+</button>
      </form>}
      {edit && <button className="ghost small" onClick={async () => {
        const prev = await new Promise<G>((res) => { const u = onSnapshot(doc(db, "users", user!.uid, "goals", addMonths(mk, -1)), (d) => { u(); res((d.data() as G) || {}); }); });
        save({ income: prev.income || 0, profit: prev.profit || 0, clients: prev.clients || 0, custom: (prev.custom || []).map((c) => ({ ...c, current: 0 })) });
      }}>↺ Как в прошлом месяце</button>}
      <div className="muted small" style={{ marginTop: 6 }}>Доход и прибыль — из P&L, новые клиенты — «Продажи» в Конверсии.</div>
    </div>
  );
}
