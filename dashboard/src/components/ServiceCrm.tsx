// Кабинет «Услуги»: мини-CRM клиента — продукты, база клиентов, проекты, доходы и расходы.
// Хранится в workspaces/{ws}/clients/{cid}/crm (kind: product | client | project | move). Ведёт сам клиент, владелец видит.
// Если к кабинету привязана Google-таблица (p.crmSheet), после каждого изменения всё переписывается в листы «ПРИЛОЖЕНИЕ …».
import { FormEvent, Fragment, useEffect, useRef, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { rub } from "../lib/money";
import { ClientProject } from "../lib/catalog";

type CProduct = { id: string; kind: "product"; name: string; price: number; descr?: string };
type CClient = { id: string; kind: "client"; name: string; status?: string; company?: string; phone?: string; note?: string; source?: string; created?: string };
type Status = "new" | "work" | "done";
type CProject = { id: string; kind: "project"; name: string; clientId: string; productId?: string; price: number; status: Status; start: string; deadline?: string; payDate?: string };
type CMove = { id: string; kind: "move"; type: "in" | "out"; amount: number; date: string; note: string; projectId?: string; category?: string; account?: string };
type Item = CProduct | CClient | CProject | CMove;
export type CrmView = "home" | "fin" | "clients" | "products";

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const CATS = ["Аренда", "Реклама", "Зарплата", "Налоги", "Материалы", "Связь и сервисы", "Транспорт", "Обучение", "Банк и комиссии", "Прочее"];
const SOURCES = ["Instagram", "Сарафан / рекомендация", "Авито", "Сайт", "Telegram", "ВКонтакте", "Повторный клиент"];
const ACCOUNTS = ["Расчётный счёт", "Карта", "Наличные"];
// статусы клиента в базе (воронка) и их цвета
const CST: [string, string][] = [["Ждёт обработку", "#e8873a"], ["Ждёт предложение", "#8a3ab9"], ["Начали работу", "#16a34a"], ["Вернуться", "#2a5bd7"], ["Отказ", "#b02a2a"]];
const cstColor = (s?: string) => CST.find(([k]) => k === s)?.[1] || "#888";
const Badge = ({ s }: { s?: string }) => <span style={{ background: cstColor(s), color: "#fff", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{s || "без статуса"}</span>;
const ST: Record<Status, string> = { new: "🆕 новый", work: "🛠 в работе", done: "✓ сдан" };
const NEXT: Record<Status, Status> = { new: "work", work: "done", done: "new" };
const today = () => new Date().toISOString().slice(0, 10);
const mkOf = (d: string) => d.slice(0, 7);
const shift = (mk: string, n: number) => { const [y, m] = mk.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const dmy = (d?: string) => d ? d.split("-").reverse().join(".") : "";
const pct = (a: number, b: number) => b ? Math.round((a - b) / Math.abs(b) * 100) : null;

export default function ServiceCrm({ wsId, p, view, onNav }: { wsId: string; p: ClientProject; view: CrmView; onNav: (v: CrmView) => void }) {
  const col = collection(db, "workspaces", wsId, "clients", p.id, "crm");
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState("");
  const [sync, setSync] = useState<"" | "wait" | "sent" | "fail">("");
  const dirty = useRef(false);
  useEffect(() => onSnapshot(col, (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() } as Item))), (e) => setErr(e.message)), [wsId, p.id]);
  const [mk, setMk] = useState(today().slice(0, 7));

  const products = items.filter((x): x is CProduct => x.kind === "product").sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const clients = items.filter((x): x is CClient => x.kind === "client").sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const projects = items.filter((x): x is CProject => x.kind === "project").map((x) => ({ ...x, status: (["new", "work", "done"].includes(x.status) ? x.status : "work") as Status }))
    .sort((a, b) => b.start.localeCompare(a.start));
  const moves = items.filter((x): x is CMove => x.kind === "move").sort((a, b) => b.date.localeCompare(a.date));
  const paidOf = (pid: string) => moves.filter((m) => m.type === "in" && m.projectId === pid).reduce((a, m) => a + m.amount, 0);
  const costOf = (pid: string) => moves.filter((m) => m.type === "out" && m.projectId === pid).reduce((a, m) => a + m.amount, 0);
  const debt = (pr: CProject) => Math.max(0, pr.price - paidOf(pr.id));
  const cname = (id: string) => clients.find((c) => c.id === id)?.name || "—";
  const pname = (id?: string) => { const x = projects.find((y) => y.id === id); return x ? cname(x.clientId) + " · " + x.name : ""; };
  const sumM = (k: string, t: "in" | "out") => moves.filter((m) => mkOf(m.date) === k && m.type === t).reduce((a, m) => a + m.amount, 0);
  const touch = () => { dirty.current = true; };
  const add = (data: object) => { touch(); return addDoc(col, data).catch((e) => alert("Не сохранилось: " + e.message)); };
  const del = (id: string) => { if (confirm("Удалить?")) { touch(); deleteDoc(doc(col, id)); } };
  const upd = (id: string, data: object) => { touch(); return updateDoc(doc(col, id), data).catch((e) => alert("Не сохранилось: " + e.message)); };

  // ── выгрузка в Google-таблицу клиента (скрипт pnl.gs, doPost) ──
  const push = () => {
    const s = p.crmSheet; if (!s?.exec) return;
    setSync("wait");
    const body = JSON.stringify({ key: s.key,
      moves: [...moves].reverse().map((m) => { const pr = projects.find((x) => x.id === m.projectId);
        return [dmy(m.date), MONTHS[Number(m.date.slice(5, 7)) - 1] + " " + m.date.slice(0, 4), m.type === "in" ? "Приход" : "Расход", m.amount, m.account || "", m.type === "in" ? (pr ? "Оплата проекта" : "Доход") : m.category || "Прочее", pr?.name || "", pr ? cname(pr.clientId) : "", m.note]; }),
      projects: projects.map((x) => [dmy(x.start), x.name, products.find((y) => y.id === x.productId)?.name || "", cname(x.clientId), x.price, paidOf(x.id), debt(x), ST[x.status], dmy(x.deadline), dmy(x.payDate), costOf(x.id), x.price - costOf(x.id), x.price ? Math.round((x.price - costOf(x.id)) / x.price * 100) + "%" : ""]),
      clients: clients.map((x) => [x.name, x.company || "", x.phone || "", x.source || "", x.note || "", dmy(x.created), x.status || ""]) });
    // no-cors: Apps Script не отдаёт CORS-заголовки, ответ не читаем — запись в таблицу всё равно происходит
    fetch(s.exec, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body })
      .then(() => setSync("sent")).catch(() => setSync("fail"));
  };
  useEffect(() => { if (!dirty.current || !p.crmSheet?.exec) return; const t = setTimeout(() => { dirty.current = false; push(); }, 1500); return () => clearTimeout(t); }, [items]);

  const [y, m] = mk.split("-").map(Number);
  const MonthPick = <div className="row small" style={{ justifyContent: "flex-start", gap: 6, marginBottom: 10 }}>
    <button className="ghost" onClick={() => setMk(shift(mk, -1))}>‹</button>
    <b>{MONTHS[m - 1]} {y}</b>
    <button className="ghost" onClick={() => setMk(shift(mk, 1))}>›</button></div>;

  if (err) return <div className="card error">Нет доступа к данным: {err}</div>;
  if (view === "fin") return <FinTab {...{ MonthPick, mk, moves, projects, pname, add, del, sumM, p, push, sync }} />;
  if (view === "clients") return <ClientsTab {...{ clients, projects, products, moves, paidOf, costOf, debt, cname, add, del, upd }} />;
  if (view === "products") return <ProductsTab {...{ products, projects, add, del, upd }} />;

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
  const Delta = ({ v }: { v: number | null }) => v == null ? null : <span className="small"> {v >= 0 ? "▲" : "▼"} {Math.abs(v)}%</span>;
  const soon = projects.filter((x) => x.payDate && debt(x) > 0).sort((a, b) => a.payDate!.localeCompare(b.payDate!)).slice(0, 6);
  return <>
    {MonthPick}
    {/* 4 плитки — того же формата, что во всех кабинетах */}
    <div className="dash-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, alignItems: "stretch" }}>
      <div className="card stat g-blue tile tile-link" onClick={() => onNav("fin")}><span className="tile-ico">💰</span><div className="muted">Выручка</div><b>{rub(income)}</b><Delta v={pct(income, pIncome)} /></div>
      <div className="card stat g-orange tile tile-link" onClick={() => onNav("clients")}><span className="tile-ico">🛠</span><div className="muted">Проектов в работе</div><b>{work.length}</b>{late.length > 0 && <span className="small">⚠️ просрочено: {late.length}</span>}</div>
      <div className={`card stat ${unpaidClients.length ? "g-red" : "g-green"} tile tile-link`} onClick={() => onNav("clients")}><span className="tile-ico">⏳</span><div className="muted">Не оплатили</div><b>{unpaidClients.length}</b><span className="small">{rub(unpaid.reduce((a, x) => a + debt(x), 0))}</span></div>
      <div className={`card stat ${profit < 0 ? "g-red" : "g-green"} tile tile-link`} onClick={() => onNav("fin")}><span className="tile-ico">{profit < 0 ? "🔻" : "💎"}</span><div className="muted">{profit < 0 ? "Убыток" : "Чистая прибыль"}</div><b>{rub(profit)}</b>{profit > 0 && pProfit > 0 && <Delta v={pct(profit, pProfit)} />}</div>
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
    {(soon.length > 0 || late.length > 0) && <div className="card" style={{ marginTop: 12 }}>
      {soon.length > 0 && <><h3 style={{ marginTop: 0 }}>📅 Ближайшие оплаты</h3>
        {soon.map((x) => <div key={x.id} className="row small"><span>{dmy(x.payDate)} · {cname(x.clientId)} · {x.name}</span><b className={x.payDate! < today() ? "error" : ""}>{rub(debt(x))}</b></div>)}</>}
      {late.length > 0 && <><h3>⚠️ Просрочены по сроку</h3>
        {late.map((x) => <div key={x.id} className="row small"><span>{cname(x.clientId)} · {x.name}</span><b className="error">срок {dmy(x.deadline)}</b></div>)}</>}
    </div>}
  </>;
}

function FinTab({ MonthPick, mk, moves, projects, pname, add, del, sumM, p, push, sync }: {
  MonthPick: JSX.Element; mk: string; moves: CMove[]; projects: CProject[]; pname: (id?: string) => string;
  add: (d: object) => void; del: (id: string) => void; sumM: (k: string, t: "in" | "out") => number; p: ClientProject; push: () => void; sync: string;
}) {
  const [f, setF] = useState({ type: "in" as "in" | "out", amount: "", date: today(), note: "", projectId: "", category: "", account: ACCOUNTS[0] });
  const inM = moves.filter((m) => mkOf(m.date) === mk);
  const income = sumM(mk, "in"), expense = sumM(mk, "out");
  const submit = (e: FormEvent) => { e.preventDefault(); const amount = Number(f.amount); if (!amount) return;
    add({ kind: "move", type: f.type, amount, date: f.date, note: f.note.trim(), account: f.account,
      ...(f.projectId ? { projectId: f.projectId } : {}), ...(f.type === "out" ? { category: f.category.trim() || "Прочее" } : {}) });
    setF({ ...f, amount: "", note: "" }); };
  const byCat: Record<string, number> = {};
  inM.filter((m) => m.type === "out").forEach((m) => { const k = m.category || "Прочее"; byCat[k] = (byCat[k] || 0) + m.amount; });
  const accs = [...new Set([...ACCOUNTS, ...moves.map((m) => m.account || "").filter(Boolean)])];
  const bal = (a: string) => moves.filter((m) => (m.account || ACCOUNTS[0]) === a && mkOf(m.date) <= mk).reduce((x, m) => x + (m.type === "in" ? m.amount : -m.amount), 0);
  const prevOut = moves.filter((m) => m.type === "out" && mkOf(m.date) === shift(mk, -1));
  const lastDay = new Date(Number(mk.slice(0, 4)), Number(mk.slice(5)), 0).getDate();
  const copyPrev = () => { if (!prevOut.length) return alert("В прошлом месяце расходов нет");
    if (!confirm(`Скопировать ${prevOut.length} расход(ов) прошлого месяца в этот?`)) return;
    prevOut.forEach((m) => add({ kind: "move", type: "out", amount: m.amount, date: `${mk}-${String(Math.min(Number(m.date.slice(8)), lastDay)).padStart(2, "0")}`, note: m.note, category: m.category || "Прочее", account: m.account || ACCOUNTS[0] })); };
  return <>
    {MonthPick}
    <div className="card small" style={{ marginBottom: 12, background: "var(--bg)" }}>
      {p.crmSheet?.exec
        ? <div className="row" style={{ flexWrap: "wrap", gap: 6 }}><span>📗 Все доходы и расходы сами попадают в Google-таблицу (лист «ПРИЛОЖЕНИЕ ФИНАНСЫ»)
          {sync === "wait" ? " · отправляю…" : sync === "sent" ? " · ✓ отправлено" : sync === "fail" ? " · ⚠️ не отправилось" : ""}</span>
          <span>{p.crmSheet.url && <a className="linkbtn" href={p.crmSheet.url} target="_blank" rel="noopener noreferrer">Открыть таблицу</a>} <button className="ghost" onClick={push}>🔄 Отправить сейчас</button></span></div>
        : <span className="muted">📗 Таблица пока не привязана — бухгалтер подключит её в настройках, и операции будут попадать туда сами.</span>}
    </div>
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
        {projects.map((x) => <option key={x.id} value={x.id}>{pname(x.id)}</option>)}</select>
        : <><input list="crm-cats" placeholder="Статья" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={{ width: 150 }} />
          <datalist id="crm-cats">{CATS.map((c) => <option key={c} value={c} />)}</datalist>
          <select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">— на проект (необязательно) —</option>
            {projects.map((x) => <option key={x.id} value={x.id}>{pname(x.id)}</option>)}</select></>}
      <input placeholder="Комментарий" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} style={{ flex: "1 1 140px" }} />
      <button disabled={!Number(f.amount)}>+ Добавить</button>
    </form>
    <div className="row small" style={{ justifyContent: "flex-start", gap: 6, marginTop: 8 }}>
      <button className="ghost" onClick={copyPrev}>⧉ Расходы как в прошлом месяце</button>
    </div>
    <table className="pnl-table" style={{ marginTop: 12 }}><tbody>
      {inM.map((x) => <tr key={x.id}><td className="small">{dmy(x.date)}</td>
        <td>{x.type === "in" ? (x.projectId ? `Оплата: ${pname(x.projectId) || "проект"}` : "Доход") : (x.category || "Расход") + (x.projectId ? ` · ${pname(x.projectId)}` : "")}<div className="small muted">{x.account || ""}{x.note ? " · " + x.note : ""}</div></td>
        <td className={x.type === "in" ? "ok" : "neg"}>{x.type === "in" ? "+" : "−"}{rub(x.amount)}</td>
        <td><button className="ghost" onClick={() => del(x.id)}>🗑</button></td></tr>)}
      {!inM.length && <tr><td className="muted">В этом месяце операций нет</td></tr>}
    </tbody></table>
  </>;
}

function ClientsTab({ clients, projects, products, moves, paidOf, costOf, debt, cname, add, del, upd }: {
  clients: CClient[]; projects: CProject[]; products: CProduct[]; moves: CMove[]; paidOf: (id: string) => number; costOf: (id: string) => number; debt: (p: CProject) => number; cname: (id: string) => string;
  add: (d: object) => Promise<unknown>; del: (id: string) => void; upd: (id: string, d: object) => void;
}) {
  const [sub, setSub] = useState<"projects" | "base">("projects");
  const [c, setC] = useState({ name: "", company: "", phone: "", note: "", source: "" });
  const blankP = { name: "", clientId: "", productId: "", price: "", deadline: "", payDate: "" };
  const [pr, setPr] = useState(blankP);
  const [pay, setPay] = useState<{ id: string; amount: string; date: string; account: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [bulk, setBulk] = useState<string | null>(null);
  const [cst, setCst] = useState("all");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | Status | "debt">("all");
  const ql = q.trim().toLowerCase();
  const shownC = clients.filter((x) => cst === "all" || (x.status || "") === cst).filter((x) => !ql || [x.name, x.company, x.phone, x.note].join(" ").toLowerCase().includes(ql));
  const shownP = projects.filter((x) => (filter === "all" || (filter === "debt" ? debt(x) > 0 : x.status === filter)) && (!ql || (x.name + " " + cname(x.clientId)).toLowerCase().includes(ql)));
  const bySrc: Record<string, { n: number; sum: number }> = {};
  clients.forEach((x) => { const k = x.source || "Не указан"; const s = bySrc[k] = bySrc[k] || { n: 0, sum: 0 }; s.n++;
    s.sum += moves.filter((m) => m.type === "in" && projects.some((p) => p.id === m.projectId && p.clientId === x.id)).reduce((a, m) => a + m.amount, 0); });
  const toProject = (x: CClient) => { setPr({ ...blankP, clientId: x.id }); setSub("projects"); };
  const pickProduct = (id: string) => { const pd = products.find((x) => x.id === id); setPr({ ...pr, productId: id, name: pr.name || pd?.name || "", price: pd ? String(pd.price) : pr.price }); };

  return <>
    <div className="chips" style={{ marginBottom: 10 }}>
      <button className={`chipbtn ${sub === "projects" ? "on" : ""}`} onClick={() => setSub("projects")}>🛠 Проекты</button>
      <button className={`chipbtn ${sub === "base" ? "on" : ""}`} onClick={() => setSub("base")}>👥 База клиентов</button>
    </div>
    <input placeholder="🔍 Поиск" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />

    {sub === "projects" && <div className="card">
      <form className="row small" style={{ flexWrap: "wrap", gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (!pr.name.trim() || !pr.clientId) return;
        add({ kind: "project", name: pr.name.trim(), clientId: pr.clientId, price: Number(pr.price) || 0, status: "new", start: today(),
          ...(pr.productId ? { productId: pr.productId } : {}), ...(pr.deadline ? { deadline: pr.deadline } : {}), ...(pr.payDate ? { payDate: pr.payDate } : {}) });
        setPr(blankP); }}>
        <select value={pr.clientId} onChange={(e) => setPr({ ...pr, clientId: e.target.value })}><option value="">— клиент —</option>{clients.map((x) => <option key={x.id} value={x.id}>{x.name}{x.company ? ` (${x.company})` : ""}</option>)}</select>
        <select value={pr.productId} onChange={(e) => pickProduct(e.target.value)}><option value="">— продукт —</option>{products.map((x) => <option key={x.id} value={x.id}>{x.name} · {rub(x.price)}</option>)}</select>
        <input placeholder="Услуга / название проекта" value={pr.name} onChange={(e) => setPr({ ...pr, name: e.target.value })} style={{ flex: "1 1 150px" }} />
        <input type="number" placeholder="Сумма оплаты" value={pr.price} onChange={(e) => setPr({ ...pr, price: e.target.value })} style={{ width: 120 }} />
        <span className="muted">оплата до</span><input type="date" value={pr.payDate} onChange={(e) => setPr({ ...pr, payDate: e.target.value })} />
        <span className="muted">срок сдачи</span><input type="date" value={pr.deadline} onChange={(e) => setPr({ ...pr, deadline: e.target.value })} />
        <button disabled={!pr.name.trim() || !pr.clientId}>+ Проект</button>
      </form>
      {!clients.length && <div className="muted small">Сначала добавь клиента во вкладке «База клиентов».</div>}
      {!products.length && <div className="muted small">Продукты с ценами можно завести во вкладке «Продукты» — тогда сумма подставится сама.</div>}
      <div className="row small" style={{ justifyContent: "flex-start", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
        {([["all", "Все"], ["new", "Новые"], ["work", "В работе"], ["done", "Сданы"], ["debt", "С долгом"]] as const).map(([k, l]) =>
          <button key={k} className={filter === k ? "" : "ghost"} style={{ padding: "2px 10px" }} onClick={() => setFilter(k)}>{l}</button>)}</div>
      <table className="pnl-table" style={{ marginTop: 8 }}><tbody>
        {shownP.map((x) => { const late = x.status !== "done" && x.deadline && x.deadline < today(), payLate = debt(x) > 0 && x.payDate && x.payDate < today();
          const pd = products.find((y) => y.id === x.productId);
          return <Fragment key={x.id}><tr style={{ opacity: x.status === "done" && !debt(x) ? .6 : 1 }}>
            <td>{x.name}<div className="small muted">{cname(x.clientId)}{pd ? " · " + pd.name : ""} · с {dmy(x.start)}
              {x.deadline && <span className={late ? "error" : ""}> · сдать {dmy(x.deadline)}{late ? " ⚠️" : ""}</span>}
              {x.payDate && debt(x) > 0 && <span className={payLate ? "error" : ""}> · оплата до {dmy(x.payDate)}{payLate ? " ⚠️" : ""}</span>}</div></td>
            <td className="small">{rub(x.price)}<div className={debt(x) ? "neg" : "ok"}>{debt(x) ? `долг ${rub(debt(x))}` : "✓ оплачен"}</div><div className="muted">оплачено {rub(paidOf(x.id))}</div>
              {costOf(x.id) > 0 && <div className="muted">расходы {rub(costOf(x.id))} · прибыль <b className={x.price - costOf(x.id) < 0 ? "error" : "ok"}>{rub(x.price - costOf(x.id))}</b>{x.price ? ` · маржа ${Math.round((x.price - costOf(x.id)) / x.price * 100)}%` : ""}</div>}</td>
            <td style={{ whiteSpace: "nowrap" }}>
              {debt(x) > 0 && <button title="Внести оплату" onClick={() => setPay(pay?.id === x.id ? null : { id: x.id, amount: String(debt(x)), date: today(), account: ACCOUNTS[0] })}>💰</button>}
              <button className={x.status === "done" ? "ghost" : ""} title="Нажми, чтобы сменить статус" onClick={() => upd(x.id, { status: NEXT[x.status] })}>{ST[x.status]}</button>
              <button className="ghost" onClick={() => del(x.id)}>🗑</button></td></tr>
            {pay?.id === x.id && <tr><td colSpan={3}><div className="row small" style={{ flexWrap: "wrap", gap: 6 }}>
              <span>Оплата:</span><input type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} style={{ width: 110 }} />
              <input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} />
              <select value={pay.account} onChange={(e) => setPay({ ...pay, account: e.target.value })}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
              <button disabled={!Number(pay.amount)} onClick={() => { add({ kind: "move", type: "in", amount: Number(pay.amount), date: pay.date, note: "", projectId: x.id, account: pay.account }); setPay(null); }}>✓ Внести</button>
              <span className="muted">— попадёт в «Финансы» как доход</span></div></td></tr>}
          </Fragment>; })}
        {!shownP.length && <tr><td className="muted">Проектов нет</td></tr>}
      </tbody></table>
      <div className="small muted">💰 — внести оплату по проекту. Статус меняется нажатием: новый → в работе → сдан.</div>
    </div>}

    {sub === "base" && <>
      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}><b>👥 База клиентов · {clients.length}</b>
          <button onClick={() => setBulk(bulk == null ? "" : null)}>{bulk == null ? "📋 Вставить списком из таблицы" : "✕ Закрыть"}</button></div>
        {bulk != null && <div style={{ marginBottom: 10 }} className="card soft-card">
          <div className="small muted">Скопируй строки из таблицы (Имя · Телефон или Telegram · Комментарий) и вставь сюда — каждая строка станет клиентом. Строка заголовков и повторы пропускаются.</div>
          <textarea rows={6} style={{ width: "100%" }} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"Артур\t@ArturBilimbaev\nИнсаф и Лия\t\tпо Максу предложить"} />
          {(() => { const have = new Set(clients.map((x) => x.name.trim().toLowerCase()));
            const rows = bulk.split(/\r?\n/).map((l) => l.split("\t").map((x) => x.trim())).filter((x) => x[0] && !/^имя$/i.test(x[0]));
            const fresh = rows.filter((x, i) => !have.has(x[0].toLowerCase()) && rows.findIndex((y) => y[0].toLowerCase() === x[0].toLowerCase()) === i);
            return <button disabled={!fresh.length} onClick={() => { fresh.forEach((x) => add({ kind: "client", name: x[0], company: "", phone: x[1] || "", note: [x[2], x[3]].filter(Boolean).join(" · "), source: c.source.trim(), created: today() })); setBulk(null); }}>
              ✓ Добавить {fresh.length} клиент.{rows.length - fresh.length ? ` (повторов пропущено: ${rows.length - fresh.length})` : ""}</button>; })()}
        </div>}
        <form className="row small" style={{ flexWrap: "wrap", gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (!c.name.trim()) return;
          add({ kind: "client", name: c.name.trim(), company: c.company.trim(), phone: c.phone.trim(), note: c.note.trim(), source: c.source.trim(), created: today() }); setC({ name: "", company: "", phone: "", note: "", source: c.source }); }}>
          <input placeholder="Имя" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} style={{ flex: "1 1 130px" }} />
          <input placeholder="Компания" value={c.company} onChange={(e) => setC({ ...c, company: e.target.value })} style={{ flex: "1 1 130px" }} />
          <input placeholder="Телефон / Telegram" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} style={{ width: 140 }} />
          <input list="crm-src" placeholder="Откуда пришёл" value={c.source} onChange={(e) => setC({ ...c, source: e.target.value })} style={{ width: 160 }} />
          <datalist id="crm-src">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
          <input placeholder="Заметка" value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} style={{ flex: "1 1 140px" }} />
          <button disabled={!c.name.trim()}>+ Клиент</button>
        </form>
        <div className="row small" style={{ justifyContent: "flex-start", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {[["all", "Все"], ...CST.map(([k]) => [k, k]), ["", "Без статуса"]].map(([k, l]) => { const n = k === "all" ? clients.length : clients.filter((x) => (x.status || "") === k).length;
            return <button key={k || "none"} className={cst === k ? "" : "ghost"} style={{ padding: "2px 10px" }} onClick={() => setCst(k)}>{l} · {n}</button>; })}</div>
        <table className="pnl-table" style={{ marginTop: 8 }}><tbody>
          {shownC.map((x) => { const ps = projects.filter((p) => p.clientId === x.id), d = ps.reduce((a, p) => a + debt(p), 0);
            return <tr key={x.id} style={{ cursor: "pointer" }} onClick={() => setOpen(open === x.id ? null : x.id)}>
              <td>{open === x.id ? "▾" : "▸"} {x.name}{x.company && <span className="muted"> · {x.company}</span>} <Badge s={x.status} />
                <div className="small muted">{[x.phone, x.source].filter(Boolean).join(" · ")}</div>
                {open !== x.id && x.note && <div className="small muted">📝 {x.note.length > 80 ? x.note.slice(0, 80) + "…" : x.note}</div>}
                {open === x.id && <div className="small" style={{ marginTop: 6, display: "grid", gap: 4, cursor: "default" }} onClick={(e) => e.stopPropagation()}>
                  <div className="row" style={{ justifyContent: "flex-start", gap: 4, flexWrap: "wrap" }}><span>Статус:</span>
                    {CST.map(([k, c]) => <button key={k} style={{ padding: "2px 8px", background: x.status === k ? c : undefined, color: x.status === k ? "#fff" : undefined, borderColor: c }}
                      className={x.status === k ? "" : "ghost"} onClick={() => upd(x.id, { status: x.status === k ? "" : k })}>{k}</button>)}</div>
                  {([["name", "Имя"], ["company", "Компания"], ["phone", "Телефон / Telegram"], ["source", "Откуда пришёл"]] as const).map(([k, l]) =>
                    <label key={k} className="row" style={{ gap: 6 }}><span className="muted" style={{ minWidth: 120 }}>{l}</span>
                      <input key={x.id + k + (x[k] || "")} defaultValue={x[k] || ""} list={k === "source" ? "crm-src" : undefined} style={{ flex: 1 }}
                        onBlur={(e) => e.target.value.trim() !== (x[k] || "") && (k !== "name" || e.target.value.trim()) && upd(x.id, { [k]: e.target.value.trim() })} /></label>)}
                  <label><span className="muted">📝 Заметки</span>
                    <textarea rows={3} style={{ width: "100%" }} key={x.id + "n" + (x.note || "")} defaultValue={x.note || ""} placeholder="Договорились созвониться в пятницу…"
                      onBlur={(e) => e.target.value !== (x.note || "") && upd(x.id, { note: e.target.value })} /></label>
                  {x.created && <div className="muted">в базе с {dmy(x.created)} · изменения сохраняются сами</div>}
                {ps.map((p) => <div key={p.id}>• {p.name} — {rub(p.price)}{debt(p) ? `, долг ${rub(debt(p))}` : ", оплачен"} · {ST[p.status]}</div>)}</div>}</td>
              <td className="small">{ps.length ? `${ps.length} проект.` : <span className="muted">без проекта</span>}{d > 0 && <div className="neg">долг {rub(d)}</div>}</td>
              <td style={{ whiteSpace: "nowrap" }}><button onClick={(e) => { e.stopPropagation(); toProject(x); }}>→ В проект</button>
                <button className="ghost" onClick={(e) => { e.stopPropagation(); del(x.id); }}>🗑</button></td></tr>; })}
          {!shownC.length && <tr><td className="muted">Клиентов нет</td></tr>}
        </tbody></table>
        <div className="small muted">«→ В проект» — открывает форму проекта с этим клиентом: выбери продукт, сумму и дату оплаты.</div>
      </div>
      {clients.length > 0 && <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>📣 Откуда приходят клиенты</h3>
        {Object.entries(bySrc).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => <div key={k} className="row small"><span>{k}</span><span><b>{v.n}</b> клиент. · оплатили {rub(v.sum)}</span></div>)}
      </div>}
    </>}
  </>;
}

function ProductsTab({ products, projects, add, del, upd }: {
  products: CProduct[]; projects: CProject[]; add: (d: object) => void; del: (id: string) => void; upd: (id: string, d: object) => void;
}) {
  const [f, setF] = useState({ name: "", price: "", descr: "" });
  return <div className="card">
    <h3 style={{ marginTop: 0 }}>📦 Мои продукты и услуги</h3>
    <div className="small muted" style={{ marginBottom: 8 }}>Заведи услуги с ценой — при создании проекта выбираешь продукт, и сумма подставится сама.</div>
    <form className="row small" style={{ flexWrap: "wrap", gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (!f.name.trim()) return;
      add({ kind: "product", name: f.name.trim(), price: Number(f.price) || 0, descr: f.descr.trim() }); setF({ name: "", price: "", descr: "" }); }}>
      <input placeholder="Название (например: Дизайн логотипа)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ flex: "1 1 180px" }} />
      <input type="number" placeholder="Цена" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} style={{ width: 110 }} />
      <input placeholder="Что входит" value={f.descr} onChange={(e) => setF({ ...f, descr: e.target.value })} style={{ flex: "1 1 180px" }} />
      <button disabled={!f.name.trim()}>+ Продукт</button>
    </form>
    <table className="pnl-table" style={{ marginTop: 8 }}><tbody>
      {products.map((x) => { const used = projects.filter((p) => p.productId === x.id);
        return <tr key={x.id}><td>{x.name}{x.descr && <div className="small muted">{x.descr}</div>}<div className="small muted">продано: {used.length} · на {rub(used.reduce((a, p) => a + p.price, 0))}</div></td>
          <td><input type="number" style={{ width: 110 }} key={x.id + x.price} defaultValue={x.price} onBlur={(e) => Number(e.target.value) !== x.price && upd(x.id, { price: Number(e.target.value) || 0 })} /></td>
          <td><button className="ghost" onClick={() => del(x.id)}>🗑</button></td></tr>; })}
      {!products.length && <tr><td className="muted">Продуктов пока нет</td></tr>}
    </tbody></table>
  </div>;
}
