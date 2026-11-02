// Товары: остатки по группам и номенклатуре за месяц + инвентаризация по итогам месяца.
// Остаток на начало = факт инвентаризации прошлого месяца (если была), иначе расчётный.
import { Fragment } from "react";
import { deleteField, doc, FieldPath, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ClientProject } from "../lib/catalog";
import { Goods } from "../lib/sheetPnl";
import { rub } from "../lib/money";

export default function GoodsReport({ g, mk, label, p, wsId, isOwner }: { g: Goods; mk: string; label: string; p: ClientProject; wsId: string; isOwner: boolean }) {
  // инвентаризация: из таблицы (лист «Товары Инвентаризация»), а если там нет — введённая в кабинете
  const sheetInv = g.inventory || {};
  const inv: Record<string, Record<string, number>> = {};
  [...new Set([...Object.keys(p.inventory || {}), ...Object.keys(sheetInv)])].forEach((m) => { inv[m] = { ...(p.inventory?.[m] || {}), ...(sheetInv[m] || {}) }; });
  const invSum = g.inventorySum || {};
  const names = [...new Set([...Object.keys(g.groups), ...Object.keys(g.items)])];
  // Количество и сумма. Сумма остатка — по себестоимости (средняя цена закупки):
  // средняя цена = (сумма остатка + сумма прихода) ÷ (кол-во остатка + кол-во прихода); расход списывается по ней.
  const rows = names.map((n) => {
    let bq = 0, bs = 0, start = 0, startS = 0, cur = { inQ: 0, outQ: 0, inS: 0, outS: 0 }, avg = 0, outCost = 0;
    for (const m of [...g.months.filter((x) => x <= mk)]) {
      const mv = g.items[n]?.[m] || { inQ: 0, outQ: 0, inS: 0, outS: 0 };
      const a = bq + mv.inQ > 0 ? (bs + mv.inS) / (bq + mv.inQ) : (bq ? bs / bq : 0);
      if (m === mk) { start = bq; startS = bs; cur = mv; avg = a; outCost = mv.outQ * a; }
      bq = bq + mv.inQ - mv.outQ; bs = bs + mv.inS - mv.outQ * a;
      if (inv[m]?.[n] != null) { bq = inv[m][n]; bs = invSum[m]?.[n] ?? bq * a; }   // после инвентаризации считаем от факта
    }
    if (!g.months.includes(mk)) { start = bq; startS = bs; avg = bq ? bs / bq : 0; }
    const calc = start + cur.inQ - cur.outQ, calcS = startS + cur.inS - outCost, fact = inv[mk]?.[n];
    const factS = fact != null ? invSum[mk]?.[n] ?? fact * avg : null;
    return { n, grp: g.groups[n] || "Без группы", start, startS, ...cur, outCost, calc, calcS, fact, factS, diff: fact != null ? fact - calc : null, diffS: factS != null ? factS - calcS : null };
  });
  const Q = ({ q, s, sign = "", cls = "" }: { q: number | null | undefined; s?: number | null; sign?: string; cls?: string }) => q == null || (!q && !s)
    ? <span className="muted">—</span>
    : <span className={cls}>{sign}{q} шт{s ? <div className="small muted">{sign}{rub(Math.round(s))}</div> : null}</span>;
  const groups = [...new Set(rows.map((r) => r.grp))];
  // FieldPath — в названиях товаров бывают точки
  const save = (n: string, v: string) => updateDoc(doc(db, "workspaces", wsId, "clients", p.id), new FieldPath("inventory", mk, n), v === "" ? deleteField() : Number(v));
  const done = rows.filter((r) => r.fact != null).length;

  return <div className="card soft-card" style={{ overflowX: "auto", maxWidth: 1000 }}>
    <h3 style={{ marginTop: 0 }}>📦 Товары · {label}</h3>
    {g.error && <div className="error small">{g.error}</div>}
    <div className="small muted" style={{ marginBottom: 8 }}>Инвентаризация: {done} из {rows.length} позиций · {rows.filter((r) => r.diff).length ? <span className="error">расхождений: {rows.filter((r) => r.diff).length}</span> : "расхождений нет"}</div>
    <table className="pnl-table">
      <thead><tr><th>Товар</th><th className="small">На начало<div className="muted">шт · ₽</div></th><th className="small">Приход<div className="muted">шт · ₽ закупки</div></th><th className="small">Расход<div className="muted">шт · ₽ по себест.</div></th><th className="small">Остаток (расчёт)<div className="muted">шт · ₽</div></th><th className="small">Факт (инвентаризация)<div className="muted">шт · ₽</div></th><th className="small">Расхождение<div className="muted">шт · ₽</div></th></tr></thead>
      <tbody>{groups.map((gr) => <Fragment key={gr}>
        <tr className="pnl-key"><td colSpan={7}>{gr}</td></tr>
        {rows.filter((r) => r.grp === gr).map((r) => <tr key={r.n}>
          <td style={{ paddingLeft: 20 }}>{r.n}</td>
          <td><Q q={r.start} s={r.startS} /></td>
          <td><Q q={r.inQ} s={r.inS} sign="+" cls="ok" /></td>
          <td><Q q={r.outQ} s={r.outCost} sign="−" cls="neg" />{r.outS ? <div className="small muted">продано на {rub(r.outS)}</div> : null}</td>
          <td><b><Q q={r.calc} s={r.calcS} /></b></td>
          <td>{sheetInv[mk]?.[r.n] != null ? <b title="из таблицы"><Q q={r.fact} s={r.factS} /></b> : isOwner ? <><input type="number" style={{ width: 90 }} key={mk + r.n + (r.fact ?? "")} defaultValue={r.fact ?? ""} onBlur={(e) => e.target.value !== String(r.fact ?? "") && save(r.n, e.target.value)} />{r.factS ? <div className="small muted">{rub(Math.round(r.factS))}</div> : null}</> : <Q q={r.fact} s={r.factS} />}</td>
          <td className={r.diff ? "error" : r.diff === 0 ? "ok" : "muted"}>{r.diff == null ? "—" : r.diff === 0 ? "✓ 0" : <>{(r.diff > 0 ? "+" : "") + r.diff} шт{r.diffS ? <div className="small">{(r.diffS > 0 ? "+" : "−") + rub(Math.round(Math.abs(r.diffS)))}</div> : null}</>}</td>
        </tr>)}
      </Fragment>)}
        {(() => { const t = (k: "start" | "inQ" | "outQ" | "calc") => rows.reduce((x, r) => x + (r[k] || 0), 0), ts = (k: "startS" | "inS" | "outCost" | "calcS" | "factS") => rows.reduce((x, r) => x + (r[k] || 0), 0);
          return <tr className="pnl-key"><td>Итого</td><td><Q q={t("start")} s={ts("startS")} /></td><td><Q q={t("inQ")} s={ts("inS")} sign="+" /></td><td><Q q={t("outQ")} s={ts("outCost")} sign="−" /></td><td><Q q={t("calc")} s={ts("calcS")} /></td><td>{done ? <Q q={rows.reduce((x, r) => x + (r.fact || 0), 0)} s={ts("factS")} /> : "—"}</td><td /></tr>; })()}
      </tbody>
    </table>
    {isOwner && <div className="small muted" style={{ marginTop: 6 }}>Количество — из листов «Товары Поставки» (приход), «Товары Реализации» (расход) и «Товары Инвентаризация» (факт). Суммы — по себестоимости: средняя цена закупки; «продано на» — сумма продажи из реализаций. Со следующего месяца остаток идёт от факта.</div>}
  </div>;
}
