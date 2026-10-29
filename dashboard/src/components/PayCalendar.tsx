// Платёжный календарь клиента: приход — план выручки равномерно по дням,
// расход — плановые платежи (разово / каждый день / раз в неделю / равномерно за месяц).
// Остаток копится день за днём; минус — кассовый разрыв.
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ClientProject, PayItem } from "../lib/catalog";
import { rub } from "../lib/money";

const DEPTS = ["1. Производство", "2. Продажи", "3. Маркетинг", "4. Админ-хоз", "5. Финансы"];
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const KIND: Record<PayItem["kind"], string> = { once: "разово", daily: "каждый день", weekly: "раз в неделю", spread: "равномерно за месяц" };

// сколько платёж стоит за месяц
export function monthSum(it: PayItem, mk: string) {
  const [y, m] = mk.split("-").map(Number), days = new Date(y, m, 0).getDate();
  if (it.kind === "daily") return it.amount * days;
  if (it.kind === "weekly") return it.amount * Array.from({ length: days }, (_, k) => (new Date(y, m - 1, k + 1).getDay() + 6) % 7).filter((w) => w === (it.weekday ?? 0)).length;
  return it.amount;
}

export default function PayCalendar({ p, wsId, mk, planRevenue, startBalance, isOwner }: {
  p: ClientProject; wsId: string; mk: string; planRevenue: number | null; startBalance: number | null; isOwner: boolean;
}) {
  const cal = p.payCal?.[mk] || {}, items = cal.items || [];
  const [y, m] = mk.split("-").map(Number), days = new Date(y, m, 0).getDate();
  const ref = doc(db, "workspaces", wsId, "clients", p.id);
  const save = (patch: object) => updateDoc(ref, { [`payCal.${mk}`]: { ...cal, ...patch } });
  const [draft, setDraft] = useState<PayItem>({ id: "", name: "", dept: "4", amount: 0, kind: "once", day: 1 });
  const [openDay, setOpenDay] = useState<number | null>(null);

  // сумма платежа в конкретный день
  const wdOf = (d: number) => (new Date(y, m - 1, d).getDay() + 6) % 7;
  const onDay = (it: PayItem, d: number) => it.kind === "daily" ? it.amount : it.kind === "spread" ? it.amount / days
    : it.kind === "weekly" ? (wdOf(d) === (it.weekday ?? 0) ? it.amount : 0) : (it.day === d ? it.amount : 0);
  const inc = cal.revenue ?? planRevenue ?? 0, incDay = inc / days;
  let bal = cal.start ?? startBalance ?? 0;
  const rows = Array.from({ length: days }, (_, k) => {
    // оплаченные заранее платежи остаток не уменьшают; приходы из списка — добавляют
    const d = k + 1, out = items.filter((it) => !it.paid && !it.income).reduce((a, it) => a + onDay(it, d), 0);
    const extra = items.filter((it) => it.income).reduce((a, it) => a + onDay(it, d), 0);
    bal += incDay + extra - out;
    return { d, out, extra, net: incDay + extra - out, bal };
  });
  const gap = rows.find((r) => r.bal < 0);
  const totalOut = items.filter((it) => !it.paid && !it.income).reduce((a, it) => a + monthSum(it, mk), 0);
  const byDept = DEPTS.map((n, i) => ({ n, v: items.filter((it) => !it.income && it.dept === String(i + 1)).reduce((a, it) => a + monthSum(it, mk), 0) }));
  const lead = wdOf(1);

  const Num = ({ v, k, ph }: { v?: number | null; k: "start" | "revenue"; ph: string }) => isOwner
    ? <input type="number" step="any" style={{ width: 140 }} placeholder={ph} key={k + mk + (v ?? "")} defaultValue={v ?? ""}
      onBlur={(e) => save({ [k]: e.target.value === "" ? null : Number(e.target.value) })} />
    : <b>{ph}</b>;

  return <div className="card" style={{ marginTop: 14 }}>
    <h3 style={{ marginTop: 0 }}>📅 Платёжный календарь</h3>
    <div className="row small" style={{ flexWrap: "wrap", gap: 10 }}>
      <span>Остаток на начало: <Num v={cal.start} k="start" ph={rub(startBalance ?? 0)} /></span>
      <span>Приход за месяц: <Num v={cal.revenue} k="revenue" ph={rub(planRevenue ?? 0)} /> <span className="muted">→ {rub(Math.round(incDay))}/день</span></span>
    </div>
    <div className="row small" style={{ margin: "8px 0" }}>
      <span>Расходы по плану: <b className="neg">−{rub(Math.round(totalOut))}</b></span>
      <span>Остаток на конец: <b className={bal < 0 ? "error" : "ok"}>{rub(Math.round(bal))}</b></span>
    </div>
    {gap && <div className="card error small" style={{ margin: "6px 0" }}>⚠️ Кассовый разрыв {gap.d} {["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"][m - 1]}: не хватит {rub(Math.round(-gap.bal))}</div>}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4, marginTop: 8 }}>
      {WD.map((w) => <div key={w} className="small muted" style={{ textAlign: "center" }}>{w}</div>)}
      {Array.from({ length: lead }, (_, k) => <div key={"e" + k} />)}
      {rows.map((r) => <div key={r.d} onClick={() => setOpenDay(openDay === r.d ? null : r.d)} style={{ cursor: "pointer", border: "1px solid var(--border, #333)", borderRadius: 8, padding: 4, fontSize: 11, minWidth: 0,
        background: r.bal < 0 ? "rgba(232,80,80,.18)" : undefined, outline: openDay === r.d ? "2px solid var(--accent)" : undefined }}>
        <div style={{ textAlign: "right" }}><b>{r.d}</b></div>
        <div className="ok">+{Math.round((incDay + r.extra) / 1000)}к</div>
        {r.out > 0 && <div className="neg">−{Math.round(r.out / 1000)}к</div>}
        <div style={{ borderTop: "1px solid var(--border, #333)", marginTop: 2 }} className={r.bal < 0 ? "error" : ""}>{Math.round(r.bal / 1000)}к</div>
      </div>)}
    </div>
    {openDay && <div className="comment small" style={{ marginTop: 8 }}>
      <b>{openDay} число:</b> приход +{rub(Math.round(incDay))}{items.filter((it) => onDay(it, openDay)).map((it) => <div key={it.id} style={{ textDecoration: it.paid ? "line-through" : undefined }}>{it.income ? "+" : "−"}{rub(Math.round(onDay(it, openDay)))} · {it.name}{it.paid ? " (оплачено заранее)" : ""}</div>)}
      <div>Остаток на конец дня: <b>{rub(Math.round(rows[openDay - 1].bal))}</b></div>
    </div>}

    <h3 style={{ marginBottom: 6 }}>Плановые платежи</h3>
    <table className="pnl-table"><tbody>
      {items.map((it) => <tr key={it.id} style={{ opacity: it.paid ? .55 : 1 }}>
        <td>{it.income ? "➕ " : ""}{it.name}{it.paid && <span className="ok small"> ✓ оплачено заранее</span>}<div className="small muted">{it.income ? "Приход" : DEPTS[Number(it.dept) - 1]} · {KIND[it.kind]}{it.kind === "once" ? `, ${it.day} число` : it.kind === "weekly" ? `, ${WD[it.weekday ?? 0]}` : ""}</div></td>
        <td className={it.income ? "ok" : "neg"}>{it.income ? "+" : "−"}{rub(it.amount)}</td>
        {isOwner && <td style={{ whiteSpace: "nowrap" }}>
          {!it.income && <button className="ghost" title="Оплачено заранее — не уменьшает остаток" onClick={() => save({ items: items.map((x) => x.id === it.id ? { ...x, paid: !x.paid } : x) })}>{it.paid ? "↩" : "✓"}</button>}
          <button className="ghost" onClick={() => save({ items: items.filter((x) => x.id !== it.id) })}>🗑</button></td>}
      </tr>)}
      <tr className="pnl-key"><td>Итого по отделам</td><td colSpan={2}>{byDept.filter((x) => x.v).map((x) => <div key={x.n} className="small">{x.n}: −{rub(Math.round(x.v))}</div>)}</td></tr>
    </tbody></table>

    {isOwner && <div className="row small" style={{ flexWrap: "wrap", gap: 6, marginTop: 10 }}>
      <select value={draft.income ? "in" : "out"} onChange={(e) => setDraft({ ...draft, income: e.target.value === "in" })}><option value="out">Расход</option><option value="in">Приход</option></select>
      <input placeholder="Статья (напр. Аренда)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ flex: "1 1 160px" }} />
      {!draft.income && <select value={draft.dept} onChange={(e) => setDraft({ ...draft, dept: e.target.value })}>{DEPTS.map((d, i) => <option key={d} value={String(i + 1)}>{d}</option>)}</select>}
      <input type="number" placeholder="Сумма" value={draft.amount || ""} onChange={(e) => setDraft({ ...draft, amount: Number(e.target.value) })} style={{ width: 110 }} />
      <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as PayItem["kind"] })}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {draft.kind === "once" && <input type="number" min={1} max={days} value={draft.day} onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })} style={{ width: 60 }} title="число" />}
      {draft.kind === "weekly" && <select value={draft.weekday ?? 0} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}>{WD.map((w, i) => <option key={w} value={i}>{w}</option>)}</select>}
      <button disabled={!draft.name || !draft.amount} onClick={() => { save({ items: [...items, { ...draft, id: String(Date.now()) }] }); setDraft({ ...draft, name: "", amount: 0 }); }}>+ Добавить</button>
      {!items.length && <button className="ghost" onClick={() => { const [py, pm] = [m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1]; const prev = p.payCal?.[`${py}-${String(pm).padStart(2, "0")}`]?.items; if (prev?.length) save({ items: prev }); else alert("В прошлом месяце платежей нет"); }}>⧉ Скопировать из прошлого месяца</button>}
    </div>}
  </div>;
}
