// Мини-CRM клиента на услугах: его клиенты, проекты, доходы и расходы.
// Хранится в workspaces/{ws}/clients/{cid}/crm (kind: client | project | move). Ведёт сам клиент, владелец видит.
import { FormEvent, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { rub } from "../lib/money";

type CClient = { id: string; kind: "client"; name: string; phone?: string; note?: string; source?: string; created?: string };
type Status = "new" | "work" | "done";
type CProject = { id: string; kind: "project"; name: string; clientId: string; price: number; status: Status; start: string; deadline?: string };
type CMove = { id: string; kind: "move"; type: "in" | "out"; amount: number; date: string; note: string; projectId?: string; category?: string; account?: string };
type Item = CClient | CProject | CMove;

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const CATS = ["Аренда", "Реклама", "Зарплата", "Налоги", "Материалы", "Связь и сервисы", "Транспорт", "Обучение", "Банк и комиссии", "Прочее"];
const SOURCES = ["Instagram", "Сарафан / рекомендация", "Авито", "Сайт", "Telegram", "ВКонтакте", "Повторный клиент"];
const ACCOUNTS = ["Расчётный счёт", "Карта", "Наличные"];
const ST: Record<Status, string> = { new: "🆕 новый", work: "🛠 в работе", done: "✓ сдан" };
const NEXT: Record<Status, Status> = { new: "work", work: "done", done: "new" };
const today = () => new Date().toISOString().slice(0, 10);
const mkOf = (d: string) => d.slice(0, 7);
const shift = (mk: string, n: number) => { const [y, m] = mk.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const dmy = (d: string) => d.split("-").reverse().join(".");
const pct = (a: number, b: number) => b ? Math.round((a - b) / Math.abs(b) * 100) : null;

export default function ServiceCrm({ wsId, cid, view }: { wsId: string; cid: string; view: "home" | "fin" | "clients" }) {
  const col = collection(db, "workspaces", wsId, "clients", cid, "crm");
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => onSnapshot(col, (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() } as Item))), (e) => setErr(e.message)), [wsId, cid]);
  const [mk, setMk] = useState(today().slice(0, 7));

  const clients = items.filter((x): x is CClient => x.kind === "client").sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const projects = items.filter((x): x is CProject => x.kind === "project").map((p) => ({ ...p, status: (p.status as string) === "work" || p.status === "new" || p.status === "done" ? p.status : "work" as Status }))
    .sort((a, b) => b.start.localeCompare(a.start));
  const moves = items.filter((x): x is CMove => x.kind === "move").sort((a, b) => b.date.localeCompare(a.date));
  const paidOf = (pid: string) => moves.filter((m) => m.type === "in" && m.projectId === pid).reduce((a, m) => a + m.amount, 0);
  const debt = (pr: CProject) => Math.max(0, pr.price - paidOf(pr.id));
  const cname = (id: string) => clients.find((c) => c.id === id)?.name || "—";
  const sumM = (k: string, t: "in" | "out") => moves.filter((m) => mkOf(m.date) === k && m.type === t).reduce((a, m) => a + m.amount, 0);
  const add = (data: object) => addDoc(col, data).catch((e) => alert("Не сохранилось: " + e.message));
  const del = (id: string) => confirm("Удалить?") && deleteDoc(doc(col, id));
  const upd = (id: string, data: object) => updateDoc(doc(col, id), data).catch((e) => alert("Не сохранилось: " + e.message));

  const [y, m] = mk.split("-").map(Number);
  const MonthPick = <div className="row small" style={{ justifyContent: "flex-start", gap: 6, marginBottom: 10 }}>
    <button className="ghost" onClick={() => setMk(shift(mk, -1))}>‹</button>
    <b>{MONTHS[m - 1]} {y}</b>
    <button className="ghost" onClick={() => setMk(shift(mk, 1))}>›</button></div>;

  if (err) return <div className="card error">Нет доступа к данным: {err}</div>;
  if (view === "fin") return <FinTab {...{ MonthPick, mk, moves, projects, cname, add, del, sumM }} />;
  if (view === "clients") return <ClientsTab {...{ clients, projects, moves, paidOf, debt, cname, add, del, upd }} />;

  // ── Мой кабинет ──
  const income = sumM(mk, "in"), expense = sumM(mk, "out"), profit = income - expense;
  const pIncome = sumM(shift(mk, -1), "in"), pProfit = pIncome - sumM(shift(mk, -1), "out");
  const work = projects.filter((x) => x.status !== "done");
  const unpaid = projects.filter((x) => debt(x) > 0);
  const unpaidClients = [...new Set(unpaid.map((x) => x.clientId))];
  const late = projects.filter((x) => x.status !== "done" && x.deadline && x.deadline < today());
  const newProj = projects.filter((x) => mkOf(x.start) === mk);
  const avg = newProj.length ? newProj.reduce((a, x) => a + x.price, 0) / newProj.length : null;
  const newClients = clients.filter((c) => c.created && mkOf(c.created) === mk).length;
  const series = Array.from({ length: 6 }, (_, k) => shift(mk, k - 5)).map((k) => ({ k, inc: sumM(k, "in"), prof: sumM(k, "in") - sumM(k, "out") }));
  const max = Math.max(1, ...series.map((s) => Math.max(s.inc, Math.abs(s.prof))));
  const Delta = ({ v }: { v: number | null }) => v == null ? null : <div className="small">{v >= 0 ? "▲" : "▼"} {Math.abs(v)}% к прошлому месяцу</div>;
  return <>
    {MonthPick}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
      <div className="card stat g-blue tile"><span className="tile-ico">💰</span><div className="muted">Выручка</div><b>{rub(income)}</b><Delta v={pct(income, pIncome)} /></div>
      <div className="card stat g-orange tile"><span className="tile-ico">🛠</span><div className="muted">Проектов в работе</div><b>{work.length}</b>{late.length > 0 && <div className="small">⚠️ просрочено: {late.length}</div>}</div>
      <div className={`card stat ${unpaidClients.length ? "g-red" : "g-green"} tile`}><span className="tile-ico">⏳</span><div className="muted">Не оплатили</div><b>{unpaidClients.length} клиент.</b><div className="small">{rub(unpaid.reduce((a, x) => a + debt(x), 0))}</div></div>
      <div className={`card stat ${profit < 0 ? "g-red" : "g-green"} tile`}><span className="tile-ico">{profit < 0 ? "🔻" : "💎"}</span><div className="muted">{profit < 0 ? "Убыток" : "Чистая прибыль"}</div><b>{rub(profit)}</b>{profit > 0 && pProfit > 0 && <Delta v={pct(profit, pProfit)} />}</div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 12 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Показатели · {MONTHS[m - 1]}</h3>
        <div className="row small"><span>Новых проектов</span><b>{newProj.length}</b></div>
        <div className="row small"><span>Средний чек</span><b>{avg != null ? rub(avg) : "—"}</b></div>
        <div className="row small"><span>Новых клиентов</span><b>{newClients}</b></div>
        <div className="row small"><span>Расходы</span><b className="neg">{rub(expense)}</b></div>
        <div className="row small"><span>Рентабельность</span><b>{income ? Math.round(profit / income * 100) + "%" : "—"}</b></div>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Выручка и прибыль · 6 месяцев</h3>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
          {series.map((s) => <div key={s.k} style={{ flex: 1, textAlign: "center" }} title={`${rub(s.inc)} · прибыль ${rub(s.prof)}`}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2, height: 100 }}>
              <div style={{ width: 10, height: `${s.inc / max * 100}%`, background: "#25476f", borderRadius: 3 }} />
              <div style={{ width: 10, height: `${Math.abs(s.prof) / max * 100}%`, background: s.prof < 0 ? "#c0392b" : "#16a34a", borderRadius: 3 }} /></div>
            <div className="small muted">{MONTHS[Number(s.k.slice(5)) - 1].slice(0, 3)}</div></div>)}
        </div>
        <div className="small muted">■ <span style={{ color: "#25476f" }}>выручка</span> · ■ <span style={{ color: "#16a34a" }}>прибыль</span></div>
      </div>
    </div>
    {(unpaid.length > 0 || late.length > 0) && <div className="card" style={{ marginTop: 12 }}>
      {unpaid.length > 0 && <><h3 style={{ marginTop: 0 }}>⏳ Ждём оплату</h3>
        {unpaid.map((x) => <div key={x.id} className="row small"><span>{cname(x.clientId)} · {x.name}</span><b className="neg">{rub(debt(x))}</b></div>)}</>}
      {late.length > 0 && <><h3>⚠️ Просрочены</h3>
        {late.map((x) => <div key={x.id} className="row small"><span>{cname(x.clientId)} · {x.name}</span><b className="error">срок {dmy(x.deadline!)}</b></div>)}</>}
    </div>}
  </>;
}

function csv(name: string, rows: (string | number)[][]) {
  const text = "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = name; a.click();
}

function FinTab({ MonthPick, mk, moves, projects, cname, add, del, sumM }: {
  MonthPick: JSX.Element; mk: string; moves: CMove[]; projects: CProject[]; cname: (id: string) => string;
  add: (d: object) => void; del: (id: string) => void; sumM: (k: string, t: "in" | "out") => number;
}) {
  const [f, setF] = useState({ type: "in" as "in" | "out", amount: "", date: today(), note: "", projectId: "", category: "", account: ACCOUNTS[0] });
  const inM = moves.filter((m) => mkOf(m.date) === mk);
  const income = sumM(mk, "in"), expense = sumM(mk, "out");
  const submit = (e: FormEvent) => { e.preventDefault(); const amount = Number(f.amount); if (!amount) return;
    add({ kind: "move", type: f.type, amount, date: f.date, note: f.note.trim(), account: f.account,
      ...(f.type === "in" && f.projectId ? { projectId: f.projectId } : {}), ...(f.type === "out" ? { category: f.category.trim() || "Прочее" } : {}) });
    setF({ ...f, amount: "", note: "" }); };
  const byCat: Record<string, number> = {};
  inM.filter((m) => m.type === "out").forEach((m) => { const k = m.category || "Прочее"; byCat[k] = (byCat[k] || 0) + m.amount; });
  // остатки по счетам: все движения до конца выбранного месяца
  const accs = [...new Set([...ACCOUNTS, ...moves.map((m) => m.account || "").filter(Boolean)])];
  const bal = (a: string) => moves.filter((m) => (m.account || ACCOUNTS[0]) === a && mkOf(m.date) <= mk).reduce((x, m) => x + (m.type === "in" ? m.amount : -m.amount), 0);
  const prevOut = moves.filter((m) => m.type === "out" && mkOf(m.date) === shift(mk, -1));
  const copyPrev = () => { if (!prevOut.length) return alert("В прошлом месяце расходов нет");
    if (!confirm(`Скопировать ${prevOut.length} расход(ов) прошлого месяца в этот?`)) return;
    prevOut.forEach((m) => add({ kind: "move", type: "out", amount: m.amount, date: `${mk}-${String(Math.min(Number(m.date.slice(8)), new Date(Number(mk.slice(0, 4)), Number(mk.slice(5)), 0).getDate())).padStart(2, "0")}`, note: m.note, category: m.category || "Прочее", account: m.account || ACCOUNTS[0] })); };
  const pname = (id?: string) => { const p = projects.find((x) => x.id === id); return p ? cname(p.clientId) + " · " + p.name : ""; };
  return <>
    {MonthPick}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
      <div className="card">
        <div className="row"><span>Доходы</span><b className="ok">+{rub(income)}</b></div>
        <div className="row"><span>Расходы</span><b className="neg">−{rub(expense)}</b></div>
        <div className="row" style={{ borderTop: "1px solid var(--border, #ddd)", paddingTop: 4 }}><b>Чистая прибыль</b><b className={income - expense < 0 ? "error" : "ok"}>{rub(income - expense)}</b></div>
        {Object.keys(byCat).length > 0 && <div className="small" style={{ marginTop: 8 }}><b>Расходы по статьям</b>{Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
          <div key={k} className="row muted"><span>{k}</span><span>{rub(v)} · {expense ? Math.round(v / expense * 100) : 0}%</span></div>)}</div>}
      </div>
      <div className="card">
        <b>💳 Остатки на конец месяца</b>
        {accs.map((a) => <div key={a} className="row small"><span>{a}</span><b className={bal(a) < 0 ? "error" : ""}>{rub(bal(a))}</b></div>)}
        <div className="row small" style={{ borderTop: "1px solid var(--border, #ddd)", paddingTop: 4 }}><b>Всего</b><b>{rub(accs.reduce((x, a) => x + bal(a), 0))}</b></div>
      </div>
    </div>
    <form className="card row small" onSubmit={submit} style={{ flexWrap: "wrap", gap: 6, marginTop: 12 }}>
      <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as "in" | "out" })}><option value="in">➕ Доход</option><option value="out">➖ Расход</option></select>
      <input type="number" step="any" placeholder="Сумма" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} style={{ width: 110 }} />
      <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      <select value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
      {f.type === "in" ? <select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">— оплата по проекту —</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{cname(p.clientId)} · {p.name}</option>)}</select>
        : <><input list="crm-cats" placeholder="Статья" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={{ width: 150 }} />
          <datalist id="crm-cats">{CATS.map((c) => <option key={c} value={c} />)}</datalist></>}
      <input placeholder="Комментарий" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} style={{ flex: "1 1 140px" }} />
      <button disabled={!Number(f.amount)}>+ Добавить</button>
    </form>
    <div className="row small" style={{ justifyContent: "flex-start", gap: 6, marginTop: 8 }}>
      <button className="ghost" onClick={copyPrev}>⧉ Расходы как в прошлом месяце</button>
      <button className="ghost" onClick={() => csv(`финансы-${mk}.csv`, [["Дата", "Тип", "Сумма", "Счёт", "Статья / проект", "Комментарий"],
        ...inM.map((x) => [dmy(x.date), x.type === "in" ? "Доход" : "Расход", x.amount, x.account || "", x.type === "in" ? pname(x.projectId) : x.category || "", x.note])])}>⬇ Выгрузить месяц (открывается в Google-таблице)</button>
    </div>
    <table className="pnl-table" style={{ marginTop: 12 }}><tbody>
      {inM.map((x) => <tr key={x.id}><td className="small">{dmy(x.date)}</td>
        <td>{x.type === "in" ? (x.projectId ? `Оплата: ${pname(x.projectId) || "проект"}` : "Доход") : x.category || "Расход"}<div className="small muted">{x.account || ""}{x.note ? " · " + x.note : ""}</div></td>
        <td className={x.type === "in" ? "ok" : "neg"}>{x.type === "in" ? "+" : "−"}{rub(x.amount)}</td>
        <td><button className="ghost" onClick={() => del(x.id)}>🗑</button></td></tr>)}
      {!inM.length && <tr><td className="muted">В этом месяце операций нет</td></tr>}
    </tbody></table>
  </>;
}

function ClientsTab({ clients, projects, moves, paidOf, debt, cname, add, del, upd }: {
  clients: CClient[]; projects: CProject[]; moves: CMove[]; paidOf: (id: string) => number; debt: (p: CProject) => number; cname: (id: string) => string;
  add: (d: object) => void; del: (id: string) => void; upd: (id: string, d: object) => void;
}) {
  const [c, setC] = useState({ name: "", phone: "", note: "", source: "" });
  const [pr, setPr] = useState({ name: "", clientId: "", price: "", deadline: "" });
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | Status | "debt">("all");
  const ql = q.trim().toLowerCase();
  const shownC = clients.filter((x) => !ql || (x.name + " " + (x.phone || "") + " " + (x.note || "")).toLowerCase().includes(ql));
  const shownP = projects.filter((x) => (filter === "all" || (filter === "debt" ? debt(x) > 0 : x.status === filter)) && (!ql || (x.name + " " + cname(x.clientId)).toLowerCase().includes(ql)));
  const bySrc: Record<string, { n: number; sum: number }> = {};
  clients.forEach((x) => { const k = x.source || "Не указан"; const s = bySrc[k] = bySrc[k] || { n: 0, sum: 0 }; s.n++;
    s.sum += moves.filter((m) => m.type === "in" && projects.some((p) => p.id === m.projectId && p.clientId === x.id)).reduce((a, m) => a + m.amount, 0); });
  return <>
    <input placeholder="🔍 Поиск по клиентам и проектам" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />
    <div className="card">
      <h3 style={{ marginTop: 0 }}>🛠 Проекты</h3>
      <form className="row small" style={{ flexWrap: "wrap", gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (!pr.name.trim() || !pr.clientId) return;
        add({ kind: "project", name: pr.name.trim(), clientId: pr.clientId, price: Number(pr.price) || 0, status: "new", start: today(), ...(pr.deadline ? { deadline: pr.deadline } : {}) });
        setPr({ name: "", clientId: pr.clientId, price: "", deadline: "" }); }}>
        <select value={pr.clientId} onChange={(e) => setPr({ ...pr, clientId: e.target.value })}><option value="">— клиент —</option>{clients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <input placeholder="Проект / услуга" value={pr.name} onChange={(e) => setPr({ ...pr, name: e.target.value })} style={{ flex: "1 1 150px" }} />
        <input type="number" placeholder="Стоимость" value={pr.price} onChange={(e) => setPr({ ...pr, price: e.target.value })} style={{ width: 110 }} />
        <span className="muted">срок</span><input type="date" value={pr.deadline} onChange={(e) => setPr({ ...pr, deadline: e.target.value })} />
        <button disabled={!pr.name.trim() || !pr.clientId}>+ Проект</button>
      </form>
      {!clients.length && <div className="muted small">Сначала добавь клиента ниже.</div>}
      <div className="row small" style={{ justifyContent: "flex-start", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
        {([["all", "Все"], ["new", "Новые"], ["work", "В работе"], ["done", "Сданы"], ["debt", "С долгом"]] as const).map(([k, l]) =>
          <button key={k} className={filter === k ? "" : "ghost"} style={{ padding: "2px 10px" }} onClick={() => setFilter(k)}>{l}</button>)}</div>
      <table className="pnl-table" style={{ marginTop: 8 }}><tbody>
        {shownP.map((x) => { const late = x.status !== "done" && x.deadline && x.deadline < today();
          return <tr key={x.id} style={{ opacity: x.status === "done" && !debt(x) ? .6 : 1 }}>
          <td>{x.name}<div className="small muted">{cname(x.clientId)} · с {dmy(x.start)}{x.deadline && <span className={late ? "error" : ""}> · срок {dmy(x.deadline)}{late ? " ⚠️" : ""}</span>}</div></td>
          <td className="small">{rub(x.price)}<div className={debt(x) ? "neg" : "ok"}>{debt(x) ? `долг ${rub(debt(x))}` : "✓ оплачен"}</div><div className="muted">оплачено {rub(paidOf(x.id))}</div></td>
          <td style={{ whiteSpace: "nowrap" }}><button className={x.status === "done" ? "ghost" : ""} title="Нажми, чтобы сменить статус" onClick={() => upd(x.id, { status: NEXT[x.status] })}>{ST[x.status]}</button>
            <button className="ghost" onClick={() => del(x.id)}>🗑</button></td></tr>; })}
        {!shownP.length && <tr><td className="muted">Проектов нет</td></tr>}
      </tbody></table>
      <div className="small muted">Оплату проекта вносишь во вкладке «Финансы» → Доход → выбрать проект. Статус меняется нажатием: новый → в работе → сдан.</div>
    </div>

    <div className="card" style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>👥 База клиентов</h3>
      <form className="row small" style={{ flexWrap: "wrap", gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (!c.name.trim()) return;
        add({ kind: "client", name: c.name.trim(), phone: c.phone.trim(), note: c.note.trim(), source: c.source.trim(), created: today() }); setC({ name: "", phone: "", note: "", source: c.source }); }}>
        <input placeholder="Имя / компания" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} style={{ flex: "1 1 150px" }} />
        <input placeholder="Телефон" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} style={{ width: 140 }} />
        <input list="crm-src" placeholder="Откуда пришёл" value={c.source} onChange={(e) => setC({ ...c, source: e.target.value })} style={{ width: 160 }} />
        <datalist id="crm-src">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
        <input placeholder="Заметка" value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} style={{ flex: "1 1 140px" }} />
        <button disabled={!c.name.trim()}>+ Клиент</button>
      </form>
      <table className="pnl-table" style={{ marginTop: 8 }}><tbody>
        {shownC.map((x) => { const ps = projects.filter((p) => p.clientId === x.id), d = ps.reduce((a, p) => a + debt(p), 0);
          return <tr key={x.id} style={{ cursor: "pointer" }} onClick={() => setOpen(open === x.id ? null : x.id)}>
            <td>{open === x.id ? "▾" : "▸"} {x.name}<div className="small muted">{[x.phone, x.source].filter(Boolean).join(" · ")}</div>{open === x.id && <div className="small" style={{ marginTop: 4 }}>
              {x.note && <div className="muted">{x.note}</div>}{x.created && <div className="muted">в базе с {dmy(x.created)}</div>}
              {ps.map((p) => <div key={p.id}>• {p.name} — {rub(p.price)}{debt(p) ? `, долг ${rub(debt(p))}` : ", оплачен"} · {ST[p.status]}</div>)}
              {!ps.length && <div className="muted">Проектов пока нет</div>}</div>}</td>
            <td className="small">{ps.length} проект.{d > 0 && <div className="neg">долг {rub(d)}</div>}</td>
            <td><button className="ghost" onClick={(e) => { e.stopPropagation(); del(x.id); }}>🗑</button></td></tr>; })}
        {!shownC.length && <tr><td className="muted">Клиентов нет</td></tr>}
      </tbody></table>
      <button className="ghost small" style={{ marginTop: 6 }} onClick={() => csv("клиенты.csv", [["Клиент", "Телефон", "Откуда", "Заметка", "Проектов", "Долг"],
        ...clients.map((x) => { const ps = projects.filter((p) => p.clientId === x.id); return [x.name, x.phone || "", x.source || "", x.note || "", ps.length, ps.reduce((a, p) => a + debt(p), 0)]; })])}>⬇ Выгрузить базу</button>
    </div>

    {clients.length > 0 && <div className="card" style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>📣 Откуда приходят клиенты</h3>
      {Object.entries(bySrc).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => <div key={k} className="row small"><span>{k}</span><span><b>{v.n}</b> клиент. · оплатили {rub(v.sum)}</span></div>)}
    </div>}
  </>;
}
