// Мини-CRM клиента на услугах: его клиенты, проекты, доходы и расходы.
// Хранится в workspaces/{ws}/clients/{cid}/crm (kind: client | project | move). Ведёт сам клиент, владелец видит.
import { FormEvent, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { rub } from "../lib/money";

type CClient = { id: string; kind: "client"; name: string; phone?: string; note?: string };
type CProject = { id: string; kind: "project"; name: string; clientId: string; price: number; status: "work" | "done"; start: string };
type CMove = { id: string; kind: "move"; type: "in" | "out"; amount: number; date: string; note: string; projectId?: string; category?: string };
type Item = CClient | CProject | CMove;

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const today = () => new Date().toISOString().slice(0, 10);
const mkOf = (d: string) => d.slice(0, 7);

export default function ServiceCrm({ wsId, cid, view }: { wsId: string; cid: string; view: "home" | "fin" | "clients" }) {
  const col = collection(db, "workspaces", wsId, "clients", cid, "crm");
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => onSnapshot(col, (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() } as Item))), (e) => setErr(e.message)), [wsId, cid]);
  const [mk, setMk] = useState(today().slice(0, 7));

  const clients = items.filter((x): x is CClient => x.kind === "client").sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const projects = items.filter((x): x is CProject => x.kind === "project").sort((a, b) => b.start.localeCompare(a.start));
  const moves = items.filter((x): x is CMove => x.kind === "move").sort((a, b) => b.date.localeCompare(a.date));
  const paidOf = (pid: string) => moves.filter((m) => m.type === "in" && m.projectId === pid).reduce((a, m) => a + m.amount, 0);
  const debt = (pr: CProject) => Math.max(0, pr.price - paidOf(pr.id));
  const cname = (id: string) => clients.find((c) => c.id === id)?.name || "—";
  const inM = moves.filter((m) => mkOf(m.date) === mk);
  const income = inM.filter((m) => m.type === "in").reduce((a, m) => a + m.amount, 0);
  const expense = inM.filter((m) => m.type === "out").reduce((a, m) => a + m.amount, 0);
  const add = (data: object) => addDoc(col, data).catch((e) => alert("Не сохранилось: " + e.message));
  const del = (id: string) => confirm("Удалить?") && deleteDoc(doc(col, id));

  const [y, m] = mk.split("-").map(Number);
  const MonthPick = <div className="row small" style={{ justifyContent: "flex-start", gap: 6, marginBottom: 10 }}>
    <button className="ghost" onClick={() => setMk(new Date(y, m - 2, 2).toISOString().slice(0, 7))}>‹</button>
    <b>{MONTHS[m - 1]} {y}</b>
    <button className="ghost" onClick={() => setMk(new Date(y, m, 2).toISOString().slice(0, 7))}>›</button></div>;

  if (err) return <div className="card error">Нет доступа к данным: {err}</div>;

  // ── Главная ──
  if (view === "home") {
    const work = projects.filter((x) => x.status === "work");
    const unpaid = projects.filter((x) => debt(x) > 0);
    const unpaidClients = [...new Set(unpaid.map((x) => x.clientId))];
    const profit = income - expense;
    return <>
      {MonthPick}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <div className="card stat g-blue tile"><span className="tile-ico">💰</span><div className="muted">Выручка</div><b>{rub(income)}</b></div>
        <div className="card stat g-orange tile"><span className="tile-ico">🛠</span><div className="muted">Проектов в работе</div><b>{work.length}</b></div>
        <div className={`card stat ${unpaidClients.length ? "g-red" : "g-green"} tile`}><span className="tile-ico">⏳</span><div className="muted">Не оплатили</div><b>{unpaidClients.length} клиент.</b><div className="small">{rub(unpaid.reduce((a, x) => a + debt(x), 0))}</div></div>
        <div className={`card stat ${profit < 0 ? "g-red" : "g-green"} tile`}><span className="tile-ico">{profit < 0 ? "🔻" : "💎"}</span><div className="muted">{profit < 0 ? "Убыток" : "Чистая прибыль"}</div><b>{rub(profit)}</b></div>
      </div>
      {unpaid.length > 0 && <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>⏳ Ждём оплату</h3>
        {unpaid.map((x) => <div key={x.id} className="row small"><span>{cname(x.clientId)} · {x.name}</span><b className="neg">{rub(debt(x))}</b></div>)}
      </div>}
    </>;
  }

  // ── Финансы ──
  if (view === "fin") return <FinTab {...{ MonthPick, inM, income, expense, projects, cname, add, del }} />;

  // ── Клиенты и проекты ──
  return <ClientsTab {...{ clients, projects, paidOf, debt, cname, add, del, col }} />;
}

function FinTab({ MonthPick, inM, income, expense, projects, cname, add, del }: {
  MonthPick: JSX.Element; inM: CMove[]; income: number; expense: number; projects: CProject[]; cname: (id: string) => string;
  add: (d: object) => void; del: (id: string) => void;
}) {
  const [f, setF] = useState({ type: "in" as "in" | "out", amount: "", date: today(), note: "", projectId: "", category: "" });
  const submit = (e: FormEvent) => { e.preventDefault(); const amount = Number(f.amount); if (!amount) return;
    add({ kind: "move", type: f.type, amount, date: f.date, note: f.note.trim(), ...(f.type === "in" && f.projectId ? { projectId: f.projectId } : {}), ...(f.type === "out" && f.category ? { category: f.category.trim() } : {}) });
    setF({ ...f, amount: "", note: "" }); };
  const byCat: Record<string, number> = {};
  inM.filter((m) => m.type === "out").forEach((m) => { const k = m.category || "Без статьи"; byCat[k] = (byCat[k] || 0) + m.amount; });
  return <>
    {MonthPick}
    <div className="card">
      <div className="row"><span>Доходы</span><b className="ok">+{rub(income)}</b></div>
      <div className="row"><span>Расходы</span><b className="neg">−{rub(expense)}</b></div>
      <div className="row" style={{ borderTop: "1px solid var(--border, #ddd)", paddingTop: 4 }}><b>Чистая прибыль</b><b className={income - expense < 0 ? "error" : "ok"}>{rub(income - expense)}</b></div>
      {Object.keys(byCat).length > 0 && <div className="small muted" style={{ marginTop: 8 }}>{Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k} className="row"><span>{k}</span><span>{rub(v)}</span></div>)}</div>}
    </div>
    <form className="card row small" onSubmit={submit} style={{ flexWrap: "wrap", gap: 6, marginTop: 12 }}>
      <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as "in" | "out" })}><option value="in">➕ Доход</option><option value="out">➖ Расход</option></select>
      <input type="number" step="any" placeholder="Сумма" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} style={{ width: 110 }} />
      <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      {f.type === "in" ? <select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">— проект (оплата) —</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{cname(p.clientId)} · {p.name}</option>)}</select>
        : <input placeholder="Статья (аренда, реклама…)" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={{ width: 170 }} />}
      <input placeholder="Комментарий" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} style={{ flex: "1 1 140px" }} />
      <button disabled={!Number(f.amount)}>+ Добавить</button>
    </form>
    <table className="pnl-table" style={{ marginTop: 12 }}><tbody>
      {inM.map((m) => <tr key={m.id}><td className="small">{m.date.split("-").reverse().join(".")}</td>
        <td>{m.type === "in" ? (m.projectId ? `Оплата: ${(() => { const p = projects.find((x) => x.id === m.projectId); return p ? cname(p.clientId) + " · " + p.name : "проект"; })()}` : "Доход") : m.category || "Расход"}{m.note && <div className="small muted">{m.note}</div>}</td>
        <td className={m.type === "in" ? "ok" : "neg"}>{m.type === "in" ? "+" : "−"}{rub(m.amount)}</td>
        <td><button className="ghost" onClick={() => del(m.id)}>🗑</button></td></tr>)}
      {!inM.length && <tr><td className="muted">В этом месяце операций нет</td></tr>}
    </tbody></table>
  </>;
}

function ClientsTab({ clients, projects, paidOf, debt, cname, add, del, col }: {
  clients: CClient[]; projects: CProject[]; paidOf: (id: string) => number; debt: (p: CProject) => number; cname: (id: string) => string;
  add: (d: object) => void; del: (id: string) => void; col: ReturnType<typeof collection>;
}) {
  const [c, setC] = useState({ name: "", phone: "", note: "" });
  const [pr, setPr] = useState({ name: "", clientId: "", price: "" });
  const [open, setOpen] = useState<string | null>(null);
  return <>
    <div className="card">
      <h3 style={{ marginTop: 0 }}>🛠 Проекты</h3>
      <form className="row small" style={{ flexWrap: "wrap", gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (!pr.name.trim() || !pr.clientId) return;
        add({ kind: "project", name: pr.name.trim(), clientId: pr.clientId, price: Number(pr.price) || 0, status: "work", start: today() }); setPr({ name: "", clientId: pr.clientId, price: "" }); }}>
        <select value={pr.clientId} onChange={(e) => setPr({ ...pr, clientId: e.target.value })}><option value="">— клиент —</option>{clients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <input placeholder="Проект / услуга" value={pr.name} onChange={(e) => setPr({ ...pr, name: e.target.value })} style={{ flex: "1 1 150px" }} />
        <input type="number" placeholder="Стоимость" value={pr.price} onChange={(e) => setPr({ ...pr, price: e.target.value })} style={{ width: 110 }} />
        <button disabled={!pr.name.trim() || !pr.clientId}>+ Проект</button>
      </form>
      {!clients.length && <div className="muted small">Сначала добавь клиента ниже.</div>}
      <table className="pnl-table" style={{ marginTop: 8 }}><tbody>
        {projects.map((x) => <tr key={x.id} style={{ opacity: x.status === "done" && !debt(x) ? .6 : 1 }}>
          <td>{x.name}<div className="small muted">{cname(x.clientId)} · с {x.start.split("-").reverse().join(".")}</div></td>
          <td className="small">{rub(x.price)}<div className={debt(x) ? "neg" : "ok"}>{debt(x) ? `долг ${rub(debt(x))}` : "✓ оплачен"}</div><div className="muted">оплачено {rub(paidOf(x.id))}</div></td>
          <td style={{ whiteSpace: "nowrap" }}><button className={x.status === "work" ? "" : "ghost"} onClick={() => updateDoc(doc(col, x.id), { status: x.status === "work" ? "done" : "work" })}>{x.status === "work" ? "в работе" : "✓ готов"}</button>
            <button className="ghost" onClick={() => del(x.id)}>🗑</button></td></tr>)}
        {!projects.length && <tr><td className="muted">Проектов пока нет</td></tr>}
      </tbody></table>
      <div className="small muted">Оплату проекта вносишь во вкладке «Финансы» → Доход → выбрать проект.</div>
    </div>

    <div className="card" style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>👥 База клиентов</h3>
      <form className="row small" style={{ flexWrap: "wrap", gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (!c.name.trim()) return;
        add({ kind: "client", name: c.name.trim(), phone: c.phone.trim(), note: c.note.trim() }); setC({ name: "", phone: "", note: "" }); }}>
        <input placeholder="Имя / компания" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} style={{ flex: "1 1 150px" }} />
        <input placeholder="Телефон" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} style={{ width: 140 }} />
        <input placeholder="Заметка" value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} style={{ flex: "1 1 140px" }} />
        <button disabled={!c.name.trim()}>+ Клиент</button>
      </form>
      <table className="pnl-table" style={{ marginTop: 8 }}><tbody>
        {clients.map((x) => { const ps = projects.filter((p) => p.clientId === x.id), d = ps.reduce((a, p) => a + debt(p), 0);
          return <tr key={x.id} style={{ cursor: "pointer" }} onClick={() => setOpen(open === x.id ? null : x.id)}>
            <td>{x.name}{x.phone && <div className="small muted">{x.phone}</div>}{open === x.id && <div className="small" style={{ marginTop: 4 }}>
              {x.note && <div className="muted">{x.note}</div>}{ps.map((p) => <div key={p.id}>• {p.name} — {rub(p.price)}{debt(p) ? `, долг ${rub(debt(p))}` : ", оплачен"}</div>)}</div>}</td>
            <td className="small">{ps.length} проект.{d > 0 && <div className="neg">долг {rub(d)}</div>}</td>
            <td><button className="ghost" onClick={(e) => { e.stopPropagation(); del(x.id); }}>🗑</button></td></tr>; })}
        {!clients.length && <tr><td className="muted">Клиентов пока нет</td></tr>}
      </tbody></table>
    </div>
  </>;
}
