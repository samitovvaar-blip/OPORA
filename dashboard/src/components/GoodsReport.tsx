// Товары: остатки по группам и номенклатуре за месяц + инвентаризация по итогам месяца.
// Остаток на начало = факт инвентаризации прошлого месяца (если была), иначе расчётный.
import { Fragment } from "react";
import { deleteField, doc, FieldPath, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ClientProject } from "../lib/catalog";
import { Goods } from "../lib/sheetPnl";
import { rub } from "../lib/money";

export default function GoodsReport({ g, mk, label, p, wsId, isOwner }: { g: Goods; mk: string; label: string; p: ClientProject; wsId: string; isOwner: boolean }) {
  const inv = p.inventory || {};
  const names = [...new Set([...Object.keys(g.groups), ...Object.keys(g.items)])];
  const rows = names.map((n) => {
    let bal = 0, start = 0, cur = { inQ: 0, outQ: 0, inS: 0, outS: 0 };
    for (const m of [...g.months.filter((x) => x <= mk)]) {
      const mv = g.items[n]?.[m] || { inQ: 0, outQ: 0, inS: 0, outS: 0 };
      if (m === mk) { start = bal; cur = mv; }
      bal = bal + mv.inQ - mv.outQ;
      if (inv[m]?.[n] != null) bal = inv[m][n];   // после инвентаризации считаем от факта
    }
    if (!g.months.includes(mk)) start = bal;
    const calc = start + cur.inQ - cur.outQ, fact = inv[mk]?.[n];
    return { n, grp: g.groups[n] || "Без группы", start, ...cur, calc, fact, diff: fact != null ? fact - calc : null };
  });
  const groups = [...new Set(rows.map((r) => r.grp))];
  // FieldPath — в названиях товаров бывают точки
  const save = (n: string, v: string) => updateDoc(doc(db, "workspaces", wsId, "clients", p.id), new FieldPath("inventory", mk, n), v === "" ? deleteField() : Number(v));
  const done = rows.filter((r) => r.fact != null).length;

  return <div className="card soft-card" style={{ overflowX: "auto", maxWidth: 1000 }}>
    <h3 style={{ marginTop: 0 }}>📦 Товары · {label}</h3>
    {g.error && <div className="error small">{g.error}</div>}
    <div className="small muted" style={{ marginBottom: 8 }}>Инвентаризация: {done} из {rows.length} позиций · {rows.filter((r) => r.diff).length ? <span className="error">расхождений: {rows.filter((r) => r.diff).length}</span> : "расхождений нет"}</div>
    <table className="pnl-table">
      <thead><tr><th>Товар</th><th className="small">На начало</th><th className="small">Приход</th><th className="small">Расход</th><th className="small">Остаток (расчёт)</th><th className="small">Факт (инвентаризация)</th><th className="small">Расхождение</th></tr></thead>
      <tbody>{groups.map((gr) => <Fragment key={gr}>
        <tr className="pnl-key"><td colSpan={7}>{gr}</td></tr>
        {rows.filter((r) => r.grp === gr).map((r) => <tr key={r.n}>
          <td style={{ paddingLeft: 20 }}>{r.n}</td><td>{r.start}</td>
          <td className="ok">{r.inQ ? "+" + r.inQ : "—"}{r.inS ? <div className="small muted">{rub(r.inS)}</div> : null}</td>
          <td className="neg">{r.outQ ? "−" + r.outQ : "—"}{r.outS ? <div className="small muted">{rub(r.outS)}</div> : null}</td>
          <td><b>{r.calc}</b></td>
          <td>{isOwner ? <input type="number" style={{ width: 90 }} key={mk + r.n + (r.fact ?? "")} defaultValue={r.fact ?? ""} onBlur={(e) => e.target.value !== String(r.fact ?? "") && save(r.n, e.target.value)} /> : r.fact ?? "—"}</td>
          <td className={r.diff ? "error" : r.diff === 0 ? "ok" : "muted"}>{r.diff == null ? "—" : r.diff === 0 ? "✓ 0" : (r.diff > 0 ? "+" : "") + r.diff}</td>
        </tr>)}
      </Fragment>)}</tbody>
    </table>
    {isOwner && <div className="small muted" style={{ marginTop: 6 }}>Впиши факт по итогам пересчёта на конец месяца — со следующего месяца остаток пойдёт от факта.</div>}
  </div>;
}
