// Кабинет «Услуги»: мини-CRM клиента — продукты, база клиентов, проекты, доходы и расходы.
// Хранится в workspaces/{ws}/clients/{cid}/crm (kind: product | client | project | move). Ведёт сам клиент, владелец видит.
// Если к кабинету привязана Google-таблица (p.crmSheet), после каждого изменения всё переписывается в листы «ПРИЛОЖЕНИЕ …».
import { FormEvent, Fragment, useEffect, useRef, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { rub } from "../lib/money";
import { ClientProject } from "../lib/catalog";

type CProduct = { id: string; kind: "product"; name: string; price: number; descr?: string };
type CClient = { id: string; kind: "client"; name: string; status?: string; comments?: { at: string; text: string }[]; company?: string; phone?: string; note?: string; source?: string; created?: string };
type Status = "new" | "work" | "done";
type CProject = { id: string; kind: "project"; name: string; clientId: string; productId?: string; price: number; status: Status; start: string; deadline?: string; payDate?: string; monthly?: boolean; payDay?: number };
type CMove = { id: string; kind: "move"; type: "in" | "out"; amount: number; date: string; note: string; projectId?: string; category?: string; account?: string; regularId?: string };
type CRegular = { id: string; kind: "regular"; name: string; amount: number; day: number; category?: string; account?: string; projectId?: string; off?: boolean };
type Item = CProduct | CClient | CProject | CMove | CRegular;
export type CrmView = "home" | "fin" | "clients" | "products";

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const CATS = ["Аренда", "Реклама", "Зарплата", "Налоги", "Материалы", "Связь и сервисы", "Транспорт", "Обучение", "Банк и комиссии", "Прочее"];
const SOURCES = ["Instagram", "Сарафан / рекомендация", "Авито", "Сайт", "Telegram", "ВКонтакте", "Повторный клиент"];
const ACCOUNTS = ["Расчётный счёт", "Карта", "Наличные"];
// статусы клиента в базе (воронка) и их цвета
const CST: [string, string][] = [["Ждёт обработку", "#e8873a"], ["Ждёт предложение", "#8a3ab9"], ["Вернуться", "#2a5bd7"], ["Отказ", "#b02a2a"], ["Закончили работу", "#16a34a"]];
const cstColor = (s?: string) => CST.find(([k]) => k === s)?.[1] || "#888";
const Badge = ({ s }: { s?: string }) => <span style={{ background: cstColor(s), color: "#fff", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{s || "без статуса"}</span>;
// компактная сводка в одну строку внутри карточки: «● Статус 5 · 22%», нажал — фильтр
function Summary({ items, cur, onPick }: { items: { k: string; l: string; c: string; n: number; extra?: string }[]; cur: string; onPick: (k: string) => void }) {
  const total = items[0]?.n || 0;
  return <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", margin: "8px 0", fontSize: 13 }}>
    {items.map((x, i) => <span key={x.k} onClick={() => onPick(cur === x.k ? "all" : x.k)} style={{ cursor: "pointer", fontWeight: cur === x.k ? 800 : 500, textDecoration: cur === x.k ? "underline" : undefined }}>
      <span style={{ color: x.c }}>●</span> {x.l} <b style={{ color: x.c }}>{x.n}</b>{i > 0 && total ? <span className="muted"> · {Math.round(x.n / total * 100)}%</span> : null}{x.extra ? <span className="muted"> · {x.extra}</span> : null}</span>)}
  </div>;
}
// статус — цветными кнопками
function StatusBtns({ cur, onPick, pad = "0 14px 10px" }: { cur?: string; onPick: (k: string) => void; pad?: string }) {
  return <div className="row" style={{ justifyContent: "flex-start", gap: 4, flexWrap: "wrap", padding: pad }}>
    {CST.map(([k, c]) => <button type="button" key={k} onClick={(e) => { e.stopPropagation(); onPick(k); }}
      style={{ background: cur === k ? c : "transparent", color: cur === k ? "#fff" : c, border: `1.5px solid ${c}`, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
      {cur === k ? "✓ " : ""}{k}</button>)}</div>;
}
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
  const [anN, setAnN] = useState(6);
  const [margOpen, setMargOpen] = useState(false);

  const products = items.filter((x): x is CProduct => x.kind === "product").sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const clients = items.filter((x): x is CClient => x.kind === "client").sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const projects = items.filter((x): x is CProject => x.kind === "project").map((x) => ({ ...x, status: (["new", "work", "done"].includes(x.status) ? x.status : "work") as Status }))
    .sort((a, b) => b.start.localeCompare(a.start));
  const regulars = items.filter((x): x is CRegular => x.kind === "regular").sort((a, b) => a.day - b.day);
  const moves = items.filter((x): x is CMove => x.kind === "move").sort((a, b) => b.date.localeCompare(a.date));
  const paidOf = (pid: string) => moves.filter((m) => m.type === "in" && m.projectId === pid).reduce((a, m) => a + m.amount, 0);
  const costOf = (pid: string) => moves.filter((m) => m.type === "out" && m.projectId === pid).reduce((a, m) => a + m.amount, 0);
  // ежемесячный проект: ожидается price за каждый месяц с начала (текущий — когда наступил день оплаты)
  const monthsOf = (pr: CProject) => { const t = today(), out: string[] = []; let k = mkOf(pr.start);
    const lastMk = Number(t.slice(8)) >= (pr.payDay || 1) ? mkOf(t) : shift(mkOf(t), -1);
    while (k <= lastMk && out.length < 120) { out.push(k); k = shift(k, 1); } return out; };
  const expectedOf = (pr: CProject) => pr.monthly ? pr.price * monthsOf(pr).length : pr.price;
  const debt = (pr: CProject) => pr.status === "done" && pr.monthly ? 0 : Math.max(0, expectedOf(pr) - paidOf(pr.id));
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
  if (view === "fin") return <FinTab {...{ MonthPick, mk, moves, projects, pname, add, del, upd, sumM, p, push, sync, regulars, nActive: projects.filter((x) => x.status !== "done").length }} />;
  if (view === "clients") return <ClientsTab {...{ clients, projects, products, moves, paidOf, costOf, debt, monthsOf, expectedOf, cname, add, del, upd }} />;
  if (view === "products") return <ProductsTab {...{ products, projects, add, del, upd }} />;

  // ── Мой кабинет = финансы ──
  const projIncome = (k: string, pid?: string) => moves.filter((m) => m.type === "in" && m.projectId && (!pid || m.projectId === pid) && mkOf(m.date) === k).reduce((a, m) => a + m.amount, 0);
  const projCost = (k: string, pid?: string) => moves.filter((m) => m.type === "out" && m.projectId && (!pid || m.projectId === pid) && mkOf(m.date) === k).reduce((a, m) => a + m.amount, 0);
  const stat = (k: string) => { const inc = sumM(k, "in"), out = sumM(k, "out"), pi = projIncome(k), pc = projCost(k);
    return { inc, out, prof: inc - out, rent: inc ? Math.round((inc - out) / inc * 100) : null, marg: pi ? Math.round((pi - pc) / pi * 100) : null }; };
  const S = stat(mk), P = stat(shift(mk, -1));
  const work = projects.filter((x) => x.status !== "done");
  // не оплатили в этом месяце: ежемесячные (день оплаты наступил, оплачено меньше суммы) и разовые с долгом и «оплата до» не позже этого месяца
  const nowMk = today().slice(0, 7);
  const unpaidM = work.filter((x) => x.monthly ? (mk < nowMk || (mk === nowMk && Number(today().slice(8)) >= (x.payDay || 1))) && mkOf(x.start) <= mk && projIncome(mk, x.id) < x.price
    : debt(x) > 0 && !!x.payDate && mkOf(x.payDate) <= mk);
  const newProj = projects.filter((x) => mkOf(x.start) === mk);
  const avg = newProj.length ? newProj.reduce((a, x) => a + x.price, 0) / newProj.length : null;
  const newClients = clients.filter((c) => c.created && mkOf(c.created) === mk).length;
  const leadsN = (st: string) => clients.filter((c) => (c.status || "") === st && !projects.some((p) => p.clientId === c.id && p.status !== "done")).length;
  const Delta = ({ v, w }: { v: number; w: number }) => !w ? null : <span className="small"> {v >= w ? "▲" : "▼"} {Math.abs(Math.round((v - w) / Math.abs(w) * 100))}%</span>;
  const pctS = (v: number | null) => v == null ? "—" : v + "%";
  const series = Array.from({ length: anN }, (_, k) => shift(mk, k - anN + 1)).map((k) => ({ k, ...stat(k) }));
  const max = Math.max(1, ...series.map((x) => Math.max(x.inc, Math.abs(x.prof))));
  const tot = series.reduce((a, x) => ({ inc: a.inc + x.inc, out: a.out + x.out, pi: a.pi + projIncome(x.k), pc: a.pc + projCost(x.k) }), { inc: 0, out: 0, pi: 0, pc: 0 });
  // общие расходы месяца (без проекта) делятся поровну на проекты, активные в этом месяце
  const activeIn = (k: string) => projects.filter((x) => mkOf(x.start) <= k && (x.status !== "done" || projIncome(k, x.id) > 0));
  const shared = (k: string) => moves.filter((m) => m.type === "out" && !m.projectId && mkOf(m.date) === k).reduce((a, m) => a + m.amount, 0);
  const shareOf = (k: string) => { const n = activeIn(k).length; return n ? shared(k) / n : 0; };
  const margRows = projects.filter((x) => x.status !== "done" || projIncome(mk, x.id)).map((x) => { const i = projIncome(mk, x.id), c = projCost(mk, x.id); const sh = activeIn(mk).some((y) => y.id === x.id) ? shareOf(mk) : 0; return { x, i, c, sh, mm: i ? Math.round((i - c) / i * 100) : null, mm2: i ? Math.round((i - c - sh) / i * 100) : null }; })
    .sort((a, b) => (b.mm ?? -999) - (a.mm ?? -999));
  return <>
    {MonthPick}
    <div className="dash-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, alignItems: "stretch" }}>
      <div className="card stat g-blue tile"><span className="tile-ico">💰</span><div className="muted">Выручка</div><b>{rub(S.inc)}</b><Delta v={S.inc} w={P.inc} /></div>
      <div className="card stat g-orange tile tile-link" onClick={() => onNav("clients")}><span className="tile-ico">🛠</span><div className="muted">Проектов в работе</div><b>{work.length}</b>
        <span className="small">{unpaidM.length ? `⏳ не оплатили в этом месяце: ${unpaidM.length}` : "✓ все оплатили"}</span></div>
      <div className={`card stat ${S.prof < 0 ? "g-red" : "g-green"} tile`}><span className="tile-ico">{S.prof < 0 ? "🔻" : "💎"}</span><div className="muted">{S.prof < 0 ? "Убыток" : "Чистая прибыль"}</div><b>{rub(S.prof)}</b>{S.prof > 0 && P.prof > 0 && <Delta v={S.prof} w={P.prof} />}</div>
      <div className="card stat g-orange t-light tile"><span className="tile-ico">📈</span><div className="muted">Рентабельность</div><b>{pctS(S.rent)}</b><span className="small">прибыль ÷ выручка</span></div>
      <div className="card stat g-blue t-light tile tile-link" onClick={() => setMargOpen(!margOpen)}><span className="tile-ico">🎯</span><div className="muted">Маржинальность {margOpen ? "▾" : "▸"}</div><b>{pctS(S.marg)}</b><span className="small">по проектам · нажми</span></div>
    </div>
    {unpaidM.length > 0 && <div className="card small" style={{ marginTop: 12 }}><b>⏳ Не оплатили · {MONTHS[m - 1]}</b>
      {unpaidM.map((x) => <div key={x.id} className="row"><span>{cname(x.clientId)} · {x.name}{x.monthly ? ` · ${x.payDay || 1}-го` : ""}</span><b className="neg">{rub(x.monthly ? x.price - projIncome(mk, x.id) : debt(x))}</b></div>)}</div>}
    {margOpen && <div className="card" style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>🎯 Маржинальность по проектам · {MONTHS[m - 1]}</h3>
      <div style={{ overflowX: "auto" }}><table className="pnl-table"><tbody>
        <tr className="muted small"><td>Проект</td><td>Доходы</td><td>Расходы проекта</td><td>Доля общих</td><td>Прибыль</td><td>Маржа</td><td>Маржа с общими</td></tr>
        {margRows.map(({ x, i, c, sh, mm, mm2 }) => <tr key={x.id}><td>{x.name}<div className="small muted">{cname(x.clientId)}</div></td><td>{rub(i)}</td><td className="neg">{c ? rub(c) : "—"}</td>
          <td className="neg">{sh ? rub(sh) : "—"}</td><td className={i - c - sh < 0 ? "error" : "ok"}>{rub(i - c - sh)}</td><td>{pctS(mm)}</td><td><b className={mm2 != null && mm2 < 0 ? "error" : ""}>{pctS(mm2)}</b></td></tr>)}
        {!margRows.length && <tr><td className="muted">Нет проектов</td></tr>}
      </tbody></table></div>
      <div className="small muted">Маржа = (доходы проекта − расходы проекта) ÷ доходы проекта. «Доля общих» — общие расходы месяца ({rub(shared(mk))}) ÷ проектов в работе ({activeIn(mk).length}) = {rub(shareOf(mk))} на проект.</div>
    </div>}
    <div className="card" style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>Показатели · {MONTHS[m - 1]}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 24px" }}>
        <div className="small">
          <div className="row"><span>Новых проектов</span><b>{newProj.length}</b></div>
          <div className="row"><span>Средний чек</span><b>{avg != null ? rub(avg) : "—"}</b></div>
          <div className="row"><span>Новых клиентов</span><b>{newClients}</b></div>
          <div className="row"><span>Расходы</span><b className="neg">{rub(S.out)}</b></div>
        </div>
        <div className="small">
          <div className="muted">Лиды ждут действия</div>
          {["Ждёт обработку", "Ждёт предложение", "Вернуться"].map((st) => <div key={st} className="row" style={{ cursor: "pointer" }} onClick={() => onNav("clients")}>
            <span><span style={{ color: cstColor(st) }}>●</span> {st}</span><b>{leadsN(st)}</b></div>)}
        </div>
      </div>
    </div>
    <div className="card" style={{ marginTop: 12 }}>
      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}><h3 style={{ margin: 0 }}>📊 Аналитика</h3>
        <span>{[3, 6, 9, 12].map((n) => <button key={n} className={anN === n ? "" : "ghost"} style={{ padding: "2px 10px", marginLeft: 4 }} onClick={() => setAnN(n)}>{n === 12 ? "год" : n + " мес."}</button>)}</span></div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110, marginTop: 10 }}>
        {series.map((x) => <div key={x.k} style={{ flex: 1, textAlign: "center" }} title={`${rub(x.inc)} · прибыль ${rub(x.prof)}`}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2, height: 90 }}>
            <div style={{ width: 9, height: `${x.inc / max * 100}%`, background: "#25476f", borderRadius: 3 }} />
            <div style={{ width: 9, height: `${Math.abs(x.prof) / max * 100}%`, background: x.prof < 0 ? "#c0392b" : "#16a34a", borderRadius: 3 }} /></div>
          <div className="small muted">{MONTHS[Number(x.k.slice(5)) - 1].slice(0, 3)}</div></div>)}
      </div>
      <div className="small muted">■ <span style={{ color: "#25476f" }}>выручка</span> · ■ <span style={{ color: "#16a34a" }}>прибыль</span></div>
      <div style={{ overflowX: "auto" }}><table className="pnl-table" style={{ marginTop: 8 }}><tbody>
        <tr className="muted small"><td>Месяц</td><td>Выручка</td><td>Прибыль</td><td>Маржинальность</td><td>Рентабельность</td></tr>
        {series.slice().reverse().map((x) => <tr key={x.k}><td>{MONTHS[Number(x.k.slice(5)) - 1]} {x.k.slice(0, 4)}</td><td>{rub(x.inc)}</td><td className={x.prof < 0 ? "error" : "ok"}>{rub(x.prof)}</td><td>{pctS(x.marg)}</td><td>{pctS(x.rent)}</td></tr>)}
        <tr className="pnl-key"><td>Итого за {anN === 12 ? "год" : anN + " мес."}</td><td>{rub(tot.inc)}</td><td className={tot.inc - tot.out < 0 ? "error" : "ok"}>{rub(tot.inc - tot.out)}</td>
          <td>{pctS(tot.pi ? Math.round((tot.pi - tot.pc) / tot.pi * 100) : null)}</td><td>{pctS(tot.inc ? Math.round((tot.inc - tot.out) / tot.inc * 100) : null)}</td></tr>
      </tbody></table></div>
    </div>
    <h3 style={{ margin: "22px 0 8px" }}>₽ Доходы и расходы · {MONTHS[m - 1]}</h3>
    <FinTab {...{ MonthPick: <></>, mk, moves, projects, pname, add, del, upd, sumM, p, push, sync, regulars, nActive: activeIn(mk).length }} />
  </>;
}

function FinTab({ MonthPick, mk, moves, projects, pname, add, del, upd, sumM, p, push, sync, regulars, nActive }: {
  MonthPick: JSX.Element; mk: string; moves: CMove[]; projects: CProject[]; pname: (id?: string) => string;
  add: (d: object) => void; del: (id: string) => void; upd: (id: string, d: object) => void; sumM: (k: string, t: "in" | "out") => number; p: ClientProject; push: () => void; sync: string; regulars: CRegular[]; nActive: number;
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
    <Regulars {...{ mk, regulars, moves, projects, pname, add, del, upd, nActive }} />
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

function ClientsTab({ clients, projects, products, moves, paidOf, costOf, debt, monthsOf, expectedOf, cname, add, del, upd }: {
  clients: CClient[]; projects: CProject[]; products: CProduct[]; moves: CMove[]; paidOf: (id: string) => number; costOf: (id: string) => number; monthsOf: (p: CProject) => string[]; expectedOf: (p: CProject) => number; debt: (p: CProject) => number; cname: (id: string) => string;
  add: (d: object) => Promise<unknown>; del: (id: string) => void; upd: (id: string, d: object) => void;
}) {
  const [sub, setSub] = useState<"projects" | "base">("projects");
  const [c, setC] = useState({ name: "", company: "", phone: "", note: "", source: "", status: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [pAdd, setPAdd] = useState(false);
  const [costF, setCostF] = useState<{ id: string; amount: string; category: string; note: string; date: string; account: string } | null>(null);
  const [cmt, setCmt] = useState<Record<string, string>>({});
  const blankP = { name: "", clientId: "", productId: "", price: "", deadline: "", payDate: "", monthly: true, payDay: "" };
  const [pr, setPr] = useState(blankP);
  const [pay, setPay] = useState<{ id: string; amount: string; date: string; account: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [bulk, setBulk] = useState<string | null>(null);
  const [cst, setCst] = useState("all");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | Status | "debt">("all");
  const ql = q.trim().toLowerCase();
  const active = (cid: string) => projects.some((p) => p.clientId === cid && p.status !== "done");
  const leads = clients.filter((x) => !active(x.id));
  const shownC = leads.filter((x) => cst === "all" || (x.status || "") === cst).filter((x) => !ql || [x.name, x.company, x.phone, x.note].join(" ").toLowerCase().includes(ql));
  const shownP = projects.filter((x) => (filter === "all" ? x.status !== "done" : filter === "debt" ? debt(x) > 0 : x.status === filter) && (!ql || (x.name + " " + cname(x.clientId)).toLowerCase().includes(ql)));
  const bySrc: Record<string, { n: number; sum: number }> = {};
  clients.forEach((x) => { const k = x.source || "Не указан"; const s = bySrc[k] = bySrc[k] || { n: 0, sum: 0 }; s.n++;
    s.sum += moves.filter((m) => m.type === "in" && projects.some((p) => p.id === m.projectId && p.clientId === x.id)).reduce((a, m) => a + m.amount, 0); });
  const finish = (x: CProject) => { if (!confirm(`Отключить проект «${x.name}»? Клиент вернётся в базу лидов со статусом «Закончили работу», вся история сохранится.`)) return;
    upd(x.id, { status: "done" }); upd(x.clientId, { status: "Закончили работу" }); setOpen(null); };
  const toProject = (x: CClient) => { setPr({ ...blankP, clientId: x.id }); setSub("projects"); setPAdd(true); setOpen(null); };
  const pickProduct = (id: string) => { const pd = products.find((x) => x.id === id); setPr({ ...pr, productId: id, name: pr.name || pd?.name || "", price: pd ? String(pd.price) : pr.price }); };

  return <>
    <div className="chips" style={{ marginBottom: 10 }}>
      <button className={`chipbtn ${sub === "projects" ? "on" : ""}`} onClick={() => setSub("projects")}>🛠 Проекты</button>
      <button className={`chipbtn ${sub === "base" ? "on" : ""}`} onClick={() => setSub("base")}>👥 База лидов</button>
    </div>
    <input placeholder="🔍 Поиск" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />

    {sub === "projects" && <>
      <div className="card">
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}><b>🛠 {filter === "done" ? "Отключённые проекты" : "Проекты"} · {shownP.length}</b><span>
          {projects.some((x) => x.status === "done") && <button className="ghost" style={{ marginRight: 6 }} onClick={() => setFilter(filter === "done" ? "all" : "done")}>{filter === "done" ? "← Активные" : `⏸ Отключённые · ${projects.filter((x) => x.status === "done").length}`}</button>}
          <button onClick={() => setPAdd(!pAdd)}>{pAdd ? "✕ Закрыть" : "+ Новый проект"}</button></span></div>
        {pAdd && <form className="card soft-card" style={{ marginTop: 10, display: "grid", gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (!pr.name.trim() || !pr.clientId) return;
          add({ kind: "project", name: pr.name.trim(), clientId: pr.clientId, price: Number(pr.price) || 0, status: "new", start: today(),
            ...(pr.productId ? { productId: pr.productId } : {}), ...(pr.deadline ? { deadline: pr.deadline } : {}), ...(!pr.monthly && pr.payDate ? { payDate: pr.payDate } : {}), monthly: pr.monthly, ...(pr.monthly ? { payDay: Math.min(31, Math.max(1, Number(pr.payDay) || Number(today().slice(8)))) } : {}) });
          setPr(blankP); setPAdd(false); }}>
          <b>Новый проект</b>
          <select value={pr.clientId} onChange={(e) => setPr({ ...pr, clientId: e.target.value })}><option value="">— клиент * —</option>{clients.map((x) => <option key={x.id} value={x.id}>{x.name}{x.company ? ` (${x.company})` : ""}</option>)}</select>
          <select value={pr.productId} onChange={(e) => pickProduct(e.target.value)}><option value="">— продукт —</option>{products.map((x) => <option key={x.id} value={x.id}>{x.name} · {rub(x.price)}</option>)}</select>
          <input placeholder="Название проекта / услуга *" value={pr.name} onChange={(e) => setPr({ ...pr, name: e.target.value })} />
          <div className="row small" style={{ justifyContent: "flex-start", gap: 6 }}><span className="muted">Оплата:</span>
            <button type="button" className={pr.monthly ? "" : "ghost"} onClick={() => setPr({ ...pr, monthly: true })}>каждый месяц</button>
            <button type="button" className={!pr.monthly ? "" : "ghost"} onClick={() => setPr({ ...pr, monthly: false })}>разово</button></div>
          <input type="number" placeholder={pr.monthly ? "Сумма в месяц" : "Сумма оплаты по проекту"} value={pr.price} onChange={(e) => setPr({ ...pr, price: e.target.value })} />
          {pr.monthly
            ? <label className="row small" style={{ gap: 6 }}><span className="muted" style={{ minWidth: 110 }}>Число оплаты</span><input type="number" min={1} max={31} placeholder={"например " + Number(today().slice(8))} value={pr.payDay} onChange={(e) => setPr({ ...pr, payDay: e.target.value })} style={{ flex: 1 }} /></label>
            : <label className="row small" style={{ gap: 6 }}><span className="muted" style={{ minWidth: 110 }}>Оплата до</span><input type="date" value={pr.payDate} onChange={(e) => setPr({ ...pr, payDate: e.target.value })} style={{ flex: 1 }} /></label>}
          <label className="row small" style={{ gap: 6 }}><span className="muted" style={{ minWidth: 110 }}>Срок сдачи</span><input type="date" value={pr.deadline} onChange={(e) => setPr({ ...pr, deadline: e.target.value })} style={{ flex: 1 }} /></label>
          <button disabled={!pr.name.trim() || !pr.clientId}>✓ Создать проект</button>
          {!clients.length && <div className="muted small">Сначала добавь клиента во вкладке «База лидов».</div>}
        </form>}
      {filter !== "done" && <div style={{ margin: "10px 0 4px", fontSize: 15 }}>🟢 В работе сейчас: <b style={{ fontSize: 20 }}>{projects.filter((x) => x.status !== "done").length}</b>
        <span className="muted small"> · ждём в этом месяце {rub(projects.filter((x) => x.status !== "done" && x.monthly).reduce((a, x) => a + x.price, 0))}{projects.some((x) => debt(x) > 0) ? ` · долг ${rub(projects.reduce((a, x) => a + debt(x), 0))}` : ""}</span></div>}
      {/* Проекты — плитками; ⚙ раскрывает проект на всю ширину */}
      <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
        {shownP.map((x) => { const on = open === x.id, paid = paidOf(x.id), cost = costOf(x.id), d = debt(x);
          const payLate = d > 0 && !x.monthly && x.payDate && x.payDate < today();
          const pays = moves.filter((m) => m.projectId === x.id && m.type === "in").sort((a, b) => b.date.localeCompare(a.date));
          const costs = moves.filter((m) => m.projectId === x.id && m.type === "out").sort((a, b) => b.date.localeCompare(a.date));
          const exp = expectedOf(x), share = exp ? Math.min(100, Math.round(paid / exp * 100)) : paid ? 100 : 0;
          const profit = paid - cost, margin = paid ? Math.round(profit / paid * 100) : null;
          const L = ({ l, children }: { l: string; children: React.ReactNode }) => <label className="row" style={{ gap: 6 }}><span className="muted" style={{ minWidth: 120 }}>{l}</span><span style={{ flex: 1, display: "flex" }}>{children}</span></label>;
          return <div key={x.id} style={{ border: `1px solid ${on ? "#16304f" : "var(--border, #e5e5e5)"}`, borderRadius: 12, overflow: "hidden", background: "var(--surface, #fff)", opacity: x.status === "done" ? .7 : 1 }}>
            <div className="row" style={{ padding: "10px 14px", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: "1 1 240px" }}><b>{x.name}</b> <span className="muted small">· {cname(x.clientId)}</span>
                <div style={{ height: 6, background: "var(--border, #e5e5e5)", borderRadius: 3, margin: "6px 0 2px", maxWidth: 320 }}><div style={{ width: share + "%", height: "100%", background: d ? "#e8873a" : "#16a34a", borderRadius: 3 }} /></div>
                <div className="small muted">{x.monthly ? `${rub(x.price)} в месяц, ${x.payDay || 1}-го` : `${rub(x.price)} разово`} · доходы {rub(paid)} · расходы {rub(cost)}{d > 0 && <span className={payLate ? "error" : "neg"}> · долг {rub(d)}</span>}</div></div>
              <div className="row" style={{ alignItems: "center", gap: 14 }}>
                <span className="small"><span className="muted">маржа </span><b className={margin != null && margin < 0 ? "error" : "ok"} style={{ fontSize: 18 }}>{margin != null ? margin + "%" : "—"}</b></span>
                <button onClick={() => { setOpen(on ? null : x.id); setPay(null); setCostF(null); }} style={{ background: "#16304f", color: "#fff", border: 0, fontWeight: 700 }}>{on ? "✕ Закрыть" : "⚙ Настройки"}</button></div>
            </div>
            {on && <div className="small" style={{ padding: "8px 14px 14px", background: "var(--bg)", display: "grid", gap: 12 }}>
              {/* итог: доходы − расходы = прибыль, маржа */}
              <div className="card" style={{ margin: 0, padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: "6px 22px", alignItems: "baseline" }}>
                <span><span className="muted">Доходы</span> <b className="ok" style={{ fontSize: 16 }}>{rub(paid)}</b></span>
                <span className="muted">−</span>
                <span><span className="muted">Расходы</span> <b className="neg" style={{ fontSize: 16 }}>{rub(cost)}</b></span>
                <span className="muted">=</span>
                <span><span className="muted">Прибыль</span> <b className={profit < 0 ? "error" : "ok"} style={{ fontSize: 16 }}>{rub(profit)}</b></span>
                <span><span className="muted">Маржа</span> <b style={{ fontSize: 18 }} className={margin != null && margin < 0 ? "error" : ""}>{margin != null ? margin + "%" : "—"}</b></span>
                {d > 0 && <span className="neg">долг {rub(d)}</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                {/* доходы */}
                <div className="card" style={{ margin: 0 }}>
                  <div className="row"><b>💰 Доходы по проекту</b><b className="ok">{rub(paid)}</b></div>
                  {pays.map((m) => <div key={m.id} className="row" style={{ borderBottom: "1px dashed var(--border, #ddd)", padding: "3px 0" }}>
                    <span>{dmy(m.date)}<span className="muted"> · {m.account || ""}{m.note ? " · " + m.note : ""}</span></span><span><b className="ok">+{rub(m.amount)}</b> <button className="ghost" style={{ padding: "0 6px" }} onClick={() => del(m.id)}>✕</button></span></div>)}
                  {!pays.length && <div className="muted">Оплат пока нет</div>}
                  {pay?.id === x.id
                    ? <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                        <input type="number" placeholder="Сумма" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                        <input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} />
                        <select value={pay.account} onChange={(e) => setPay({ ...pay, account: e.target.value })}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
                        <span><button disabled={!Number(pay.amount)} onClick={() => { add({ kind: "move", type: "in", amount: Number(pay.amount), date: pay.date, note: "", projectId: x.id, account: pay.account }); setPay(null); }}>✓ Внести</button> <button className="ghost" onClick={() => setPay(null)}>Отмена</button></span></div>
                    : <button style={{ marginTop: 8 }} onClick={() => { setCostF(null); setPay({ id: x.id, amount: String(x.monthly ? (d ? Math.min(d, x.price) : x.price) : d || x.price), date: today(), account: ACCOUNTS[0] }); }}>+ Внести оплату</button>}
                </div>
                {/* расходы */}
                <div className="card" style={{ margin: 0 }}>
                  <div className="row"><b>➖ Расходы по проекту</b><b className="neg">{rub(cost)}</b></div>
                  {costs.map((m) => <div key={m.id} className="row" style={{ borderBottom: "1px dashed var(--border, #ddd)", padding: "3px 0" }}>
                    <span>{dmy(m.date)} · {m.category || "Расход"}<span className="muted">{m.note ? " · " + m.note : ""}</span></span><span><b className="neg">−{rub(m.amount)}</b> <button className="ghost" style={{ padding: "0 6px" }} onClick={() => del(m.id)}>✕</button></span></div>)}
                  {!costs.length && <div className="muted">Расходов пока нет</div>}
                  {costF?.id === x.id
                    ? <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                        <input type="number" placeholder="Сумма" value={costF.amount} onChange={(e) => setCostF({ ...costF, amount: e.target.value })} />
                        <input list="crm-pcats" placeholder="Статья (ЗП исполнителю, сервисы…)" value={costF.category} onChange={(e) => setCostF({ ...costF, category: e.target.value })} />
                        <datalist id="crm-pcats">{["ЗП исполнителю", "Сервисы", "Реклама", "Налоги", ...CATS].map((c) => <option key={c} value={c} />)}</datalist>
                        <input placeholder="Кому / комментарий" value={costF.note} onChange={(e) => setCostF({ ...costF, note: e.target.value })} />
                        <input type="date" value={costF.date} onChange={(e) => setCostF({ ...costF, date: e.target.value })} />
                        <select value={costF.account} onChange={(e) => setCostF({ ...costF, account: e.target.value })}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
                        <span><button disabled={!Number(costF.amount)} onClick={() => { add({ kind: "move", type: "out", amount: Number(costF.amount), date: costF.date, note: costF.note.trim(), category: costF.category.trim() || "Прочее", projectId: x.id, account: costF.account }); setCostF(null); }}>✓ Внести</button> <button className="ghost" onClick={() => setCostF(null)}>Отмена</button></span></div>
                    : <button style={{ marginTop: 8 }} onClick={() => { setPay(null); setCostF({ id: x.id, amount: "", category: "", note: "", date: today(), account: ACCOUNTS[0] }); }}>+ Внести расход</button>}
                </div>
              </div>
              {x.monthly && monthsOf(x).length > 0 && <details><summary style={{ cursor: "pointer" }}><b>📅 По месяцам</b></summary>
                <table className="pnl-table" style={{ marginTop: 4, maxWidth: 560 }}><tbody>
                  <tr className="muted"><td>Месяц</td><td>Ожидалось</td><td>Доходы</td><td>Расходы</td><td>Маржа</td></tr>
                  {monthsOf(x).slice().reverse().map((k) => { const pm = pays.filter((m) => mkOf(m.date) === k).reduce((a, m) => a + m.amount, 0), cm = costs.filter((m) => mkOf(m.date) === k).reduce((a, m) => a + m.amount, 0);
                    return <tr key={k}><td>{MONTHS[Number(k.slice(5)) - 1]} {k.slice(0, 4)}</td><td>{rub(x.price)}</td><td className={pm >= x.price ? "ok" : pm ? "neg" : "error"}>{rub(pm)}</td><td className="muted">{cm ? rub(cm) : "—"}</td><td>{pm ? Math.round((pm - cm) / pm * 100) + "%" : "—"}</td></tr>; })}
                </tbody></table></details>}
              {/* общие настройки */}
              <div className="card" style={{ margin: 0 }}>
                <b>⚙ Общие настройки</b>
                <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                  <L l="Название"><input key={x.id + "n" + x.name} defaultValue={x.name} style={{ flex: 1 }} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== x.name && upd(x.id, { name: e.target.value.trim() })} /></L>
                  <L l="Клиент"><select value={x.clientId} onChange={(e) => upd(x.id, { clientId: e.target.value })} style={{ flex: 1 }}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
                  <L l="Продукт"><select value={x.productId || ""} onChange={(e) => upd(x.id, { productId: e.target.value })} style={{ flex: 1 }}><option value="">—</option>{products.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></L>
                  <L l={x.monthly ? "Сумма в месяц" : "Сумма"}><input type="number" key={x.id + "p" + x.price} defaultValue={x.price} style={{ flex: 1 }} onBlur={(e) => Number(e.target.value) !== x.price && upd(x.id, { price: Number(e.target.value) || 0 })} /></L>
                  <L l="Периодичность"><select value={x.monthly ? "m" : "o"} onChange={(e) => upd(x.id, { monthly: e.target.value === "m" })} style={{ flex: 1 }}><option value="m">каждый месяц</option><option value="o">разово</option></select></L>
                  {x.monthly
                    ? <L l="Дата оплаты (число)"><input type="number" min={1} max={31} key={x.id + "d" + (x.payDay || "")} defaultValue={x.payDay || 1} style={{ flex: 1 }} onBlur={(e) => upd(x.id, { payDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} /></L>
                    : <L l="Оплата до"><input type="date" value={x.payDate || ""} onChange={(e) => upd(x.id, { payDate: e.target.value })} style={{ flex: 1 }} /></L>}
                  <L l="Начало"><input type="date" value={x.start} onChange={(e) => e.target.value && upd(x.id, { start: e.target.value })} style={{ flex: 1 }} /></L>
                </div>
                <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 10 }}><span className="muted">изменения сохраняются сами</span>
                  <span>{x.status !== "done" ? <button style={{ background: "#6b7280", color: "#fff", border: 0, fontWeight: 700 }} onClick={() => finish(x)}>⏸ Отключить проект</button>
                    : <button style={{ background: "#16a34a", color: "#fff", border: 0, fontWeight: 700 }} onClick={() => { upd(x.id, { status: "work" }); setFilter("all"); }}>▶ Включить проект</button>} <button className="ghost" onClick={() => del(x.id)}>🗑 Удалить</button></span></div>
              </div>
            </div>}
          </div>; })}
        {!shownP.length && <div className="muted" style={{ padding: 6 }}>Проектов нет</div>}
      </div>
      </div>
    </>}

    {sub === "base" && <>
      {/* Добавить лида — отдельная форма */}
      <div className="card">
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}><b>📊 Свод по лидам · {leads.length}</b>
          <span><button onClick={() => { setAddOpen(!addOpen); setBulk(null); }}>{addOpen ? "✕ Закрыть" : "+ Добавить лида"}</button>
            <button className="ghost" style={{ marginLeft: 6 }} onClick={() => { setBulk(bulk == null ? "" : null); setAddOpen(false); }}>{bulk == null ? "📋 Списком из таблицы" : "✕ Закрыть"}</button></span></div>
        {/* Свод: статусы и источники — списком */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, margin: "10px 0" }}>
          <div className="small"><div className="muted" style={{ marginBottom: 4 }}>По статусам</div>
            {[["all", "Всего лидов", "#16304f"] as [string, string, string], ...CST.map(([k, c]) => [k, k, c] as [string, string, string])].map(([k, l, c]) => {
              const n = k === "all" ? leads.length : leads.filter((x) => (x.status || "") === k).length;
              return <div key={k} className="row" onClick={() => setCst(cst === k ? "all" : k)} style={{ cursor: "pointer", padding: "3px 6px", borderRadius: 6, background: cst === k ? "var(--bg)" : undefined, fontWeight: k === "all" || cst === k ? 700 : 400 }}>
                <span><span style={{ color: c, fontSize: 14 }}>●</span> {l}</span><span><b>{n}</b>{k !== "all" && leads.length ? <span className="muted"> · {Math.round(n / leads.length * 100)}%</span> : null}</span></div>; })}
          </div>
          <div className="small"><div className="muted" style={{ marginBottom: 4 }}>📣 Откуда приходят</div>
            {Object.entries(bySrc).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => <div key={k} className="row" style={{ padding: "3px 6px" }}>
              <span>{k}</span><span><b>{v.n}</b>{v.sum ? <span className="muted"> · оплатили {rub(v.sum)}</span> : null}</span></div>)}
            {!clients.length && <div className="muted">Пока нет лидов</div>}
          </div>
        </div>
        {addOpen && <form className="card soft-card" style={{ marginTop: 10, display: "grid", gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (!c.name.trim()) return;
          add({ kind: "client", name: c.name.trim(), company: c.company.trim(), phone: c.phone.trim(), note: c.note.trim(), source: c.source.trim(), status: c.status || "Ждёт обработку", created: today() });
          setC({ name: "", company: "", phone: "", note: "", source: c.source, status: "" }); setAddOpen(false); }}>
          <b>Новый лид</b>
          <input placeholder="Имя *" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} autoFocus />
          <input placeholder="Компания" value={c.company} onChange={(e) => setC({ ...c, company: e.target.value })} />
          <input placeholder="Телефон / Telegram" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />
          <input list="crm-src" placeholder="Откуда пришёл" value={c.source} onChange={(e) => setC({ ...c, source: e.target.value })} />
          <datalist id="crm-src">{SOURCES.map((x) => <option key={x} value={x} />)}</datalist>
          <div><span className="small muted">Статус</span><StatusBtns cur={c.status || "Ждёт обработку"} onPick={(k) => setC({ ...c, status: k })} pad="4px 0" /></div>
          <textarea rows={2} placeholder="Заметка" value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} />
          <button disabled={!c.name.trim()}>✓ Добавить</button>
        </form>}
        {bulk != null && <div style={{ marginBottom: 10 }} className="card soft-card" >
          <div className="small muted">Скопируй строки из таблицы (Имя · Телефон или Telegram · Комментарий) и вставь сюда — каждая строка станет клиентом. Строка заголовков и повторы пропускаются.</div>
          <textarea rows={6} style={{ width: "100%" }} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"Артур\t@ArturBilimbaev\nИнсаф и Лия\t\tпо Максу предложить"} />
          {(() => { const have = new Set(clients.map((x) => x.name.trim().toLowerCase()));
            const rows = bulk.split(/\r?\n/).map((l) => l.split("\t").map((x) => x.trim())).filter((x) => x[0] && !/^имя$/i.test(x[0]));
            const fresh = rows.filter((x, i) => !have.has(x[0].toLowerCase()) && rows.findIndex((y) => y[0].toLowerCase() === x[0].toLowerCase()) === i);
            return <button disabled={!fresh.length} onClick={() => { fresh.forEach((x) => add({ kind: "client", name: x[0], company: "", phone: x[1] || "", note: [x[2], x[3]].filter(Boolean).join(" · "), source: c.source.trim(), created: today() })); setBulk(null); }}>
              ✓ Добавить {fresh.length} клиент.{rows.length - fresh.length ? ` (повторов пропущено: ${rows.length - fresh.length})` : ""}</button>; })()}
        </div>}
      </div>
      {/* База лидов: имя слева, статус справа; нажал — карточка с правкой и комментариями */}
      <div className="card" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
        <div className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--border, #e5e5e5)" }}><b>📋 База лидов{cst !== "all" ? ` · ${cst}` : ""} · {shownC.length}</b>
          {cst !== "all" && <button className="ghost small" onClick={() => setCst("all")}>показать всех</button>}</div>
        {shownC.map((x) => { const ps = projects.filter((p) => p.clientId === x.id), d = ps.reduce((a, p) => a + debt(p), 0), on = open === x.id;
          return <div key={x.id} style={{ borderBottom: "1px solid var(--border, #e5e5e5)" }}>
            <div className="row" style={{ padding: "10px 14px", gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}><b>{x.name}</b>{x.company && <span className="muted"> · {x.company}</span>}{" "}
                <button onClick={() => setPick(pick === x.id ? null : x.id)} title="Сменить статус"
                  style={{ background: cstColor(x.status), color: "#fff", border: 0, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700, marginLeft: 4 }}>{x.status || "Статус"} ▾</button>
                <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[x.phone, x.source, ps.length ? `${ps.length} проект.` : "", d > 0 ? `долг ${rub(d)}` : ""].filter(Boolean).join(" · ") || "—"}</div></div>
              <button onClick={() => setOpen(on ? null : x.id)} style={{ background: "#16304f", color: "#fff", border: 0, fontWeight: 700, flexShrink: 0 }}>{on ? "✕ Закрыть" : "⚙ Настройки"}</button>
            </div>
            {pick === x.id && <StatusBtns cur={x.status} onPick={(k) => { upd(x.id, { status: k }); setPick(null); }} />}
            {on && <div className="small" style={{ padding: "4px 14px 14px", display: "grid", gap: 6, background: "var(--bg)" }}>
              {([["name", "Имя"], ["company", "Компания"], ["phone", "Телефон / Telegram"], ["source", "Откуда пришёл"]] as const).map(([k, l]) =>
                <label key={k} className="row" style={{ gap: 6 }}><span className="muted" style={{ minWidth: 130 }}>{l}</span>
                  <input key={x.id + k + (x[k] || "")} defaultValue={x[k] || ""} list={k === "source" ? "crm-src" : undefined} style={{ flex: 1 }}
                    onBlur={(e) => e.target.value.trim() !== (x[k] || "") && (k !== "name" || e.target.value.trim()) && upd(x.id, { [k]: e.target.value.trim() })} /></label>)}
              <label><span className="muted">📝 Заметка</span>
                <textarea rows={3} style={{ width: "100%" }} key={x.id + "n" + (x.note || "")} defaultValue={x.note || ""} placeholder="Главное о лиде"
                  onBlur={(e) => e.target.value !== (x.note || "") && upd(x.id, { note: e.target.value })} /></label>
              <div><span className="muted">💬 Комментарии</span>
                {(x.comments || []).map((cm, k) => <div key={k} className="row" style={{ gap: 6, padding: "3px 0", borderBottom: "1px dashed var(--border, #ddd)" }}>
                  <span><span className="muted">{dmy(cm.at.slice(0, 10))}</span> {cm.text}</span>
                  <button className="ghost" style={{ padding: "0 6px" }} onClick={() => upd(x.id, { comments: (x.comments || []).filter((_, n) => n !== k) })}>✕</button></div>)}
                <form className="row" style={{ gap: 6, marginTop: 4 }} onSubmit={(e) => { e.preventDefault(); const t = (cmt[x.id] || "").trim(); if (!t) return;
                  upd(x.id, { comments: [...(x.comments || []), { at: new Date().toISOString(), text: t }] }); setCmt({ ...cmt, [x.id]: "" }); }}>
                  <input placeholder="Написать комментарий: созвонились, отправил КП…" value={cmt[x.id] || ""} onChange={(e) => setCmt({ ...cmt, [x.id]: e.target.value })} style={{ flex: 1 }} />
                  <button disabled={!(cmt[x.id] || "").trim()}>➤</button></form></div>
              {ps.length > 0 && <div>{ps.map((p) => <div key={p.id}>• {p.name} — {rub(p.price)}{debt(p) ? `, долг ${rub(debt(p))}` : ", оплачен"} · {ST[p.status]}</div>)}</div>}
              <div className="row" style={{ flexWrap: "wrap", gap: 6 }}><span className="muted">{x.created ? `в базе с ${dmy(x.created)} · ` : ""}изменения сохраняются сами</span>
                <span><button onClick={() => toProject(x)} style={{ background: "#16304f", color: "#fff", border: 0, fontWeight: 700 }}>→ В проект</button> <button className="ghost" onClick={() => del(x.id)}>🗑 Удалить</button></span></div>
            </div>}
          </div>; })}
        {!shownC.length && <div className="muted" style={{ padding: 14 }}>Лидов нет</div>}
      </div>
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

// Ежемесячные расходы (сервисы, аренда, подписки): шаблон → каждый месяц «провести» в один клик
function Regulars({ mk, regulars, moves, projects, pname, add, del, upd, nActive }: {
  mk: string; regulars: CRegular[]; moves: CMove[]; projects: CProject[]; pname: (id?: string) => string;
  add: (d: object) => void; del: (id: string) => void; upd: (id: string, d: object) => void; nActive: number;
}) {
  const [f, setF] = useState<{ name: string; amount: string; day: string; category: string; account: string; projectId: string } | null>(null);
  const lastDay = new Date(Number(mk.slice(0, 4)), Number(mk.slice(5)), 0).getDate();
  const doneIn = (r: CRegular) => moves.find((m) => m.regularId === r.id && mkOf(m.date) === mk);
  const run = (r: CRegular) => add({ kind: "move", type: "out", amount: r.amount, date: `${mk}-${String(Math.min(r.day, lastDay)).padStart(2, "0")}`, note: r.name,
    category: r.category || "Сервисы", account: r.account || ACCOUNTS[0], regularId: r.id, ...(r.projectId ? { projectId: r.projectId } : {}) });
  const act = regulars.filter((r) => !r.off), todo = act.filter((r) => !doneIn(r));
  const sharedM = moves.filter((m) => m.type === "out" && !m.projectId && mkOf(m.date) === mk).reduce((a, m) => a + m.amount, 0);
  return <div className="card" style={{ marginTop: 12 }}>
    <div className="row" style={{ flexWrap: "wrap", gap: 6 }}><b>🧩 Общие расходы · {rub(sharedM)} за месяц</b>
      <span>{todo.length > 0 && <button style={{ marginRight: 6 }} onClick={() => todo.forEach(run)}>✓ Провести все за месяц ({todo.length})</button>}
        <button className="ghost" onClick={() => setF(f ? null : { name: "", amount: "", day: "1", category: "Сервисы", account: ACCOUNTS[0], projectId: "" })}>{f ? "✕" : "+ Добавить"}</button></span></div>
    <div className="small" style={{ margin: "6px 0", padding: "6px 10px", background: "var(--bg)", borderRadius: 8 }}>
      Все расходы без проекта — общие и делятся поровну на проекты в работе: <b>{rub(sharedM)}</b> ÷ <b>{nActive}</b> проект. = <b>{nActive ? rub(sharedM / nActive) : "—"}</b> на каждый проект.
      <span className="muted"> Ниже — шаблоны тех, что повторяются каждый месяц: проводишь одной кнопкой.</span></div>
    {f && <div className="row small" style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}>
      <input placeholder="Название (Тильда, Figma, аренда…)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ flex: "1 1 180px" }} />
      <input type="number" placeholder="Сумма" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} style={{ width: 100 }} />
      <span className="muted">число</span><input type="number" min={1} max={31} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} style={{ width: 60 }} />
      <input list="crm-rcats" placeholder="Статья" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={{ width: 130 }} />
      <datalist id="crm-rcats">{["Сервисы", ...CATS].map((c) => <option key={c} value={c} />)}</datalist>
      <select value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
      <select value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">— общий —</option>{projects.filter((x) => x.status !== "done").map((x) => <option key={x.id} value={x.id}>{pname(x.id)}</option>)}</select>
      <button disabled={!f.name.trim() || !Number(f.amount)} onClick={() => { add({ kind: "regular", name: f.name.trim(), amount: Number(f.amount), day: Math.min(31, Math.max(1, Number(f.day) || 1)),
        category: f.category.trim() || "Сервисы", account: f.account, ...(f.projectId ? { projectId: f.projectId } : {}) }); setF(null); }}>✓ Сохранить</button>
    </div>}
    <table className="pnl-table" style={{ marginTop: 8 }}><tbody>
      {regulars.map((r) => { const m = doneIn(r);
        return <tr key={r.id} style={{ opacity: r.off ? .5 : 1 }}><td>{r.name}<div className="small muted">{r.day}-го · {r.category || "Сервисы"}{r.projectId ? " · " + pname(r.projectId) : ""}</div></td>
          <td className="neg">−{rub(r.amount)}</td>
          <td style={{ whiteSpace: "nowrap" }}>{r.off ? <span className="muted small">пауза</span> : m ? <span className="ok small">✓ проведён {dmy(m.date)}</span> : <button onClick={() => run(r)}>Провести</button>}
            {" "}<button className="ghost" title={r.off ? "Включить" : "Пауза"} onClick={() => upd(r.id, { off: !r.off })}>{r.off ? "▶" : "⏸"}</button>
            <button className="ghost" onClick={() => del(r.id)}>🗑</button></td></tr>; })}
      {!regulars.length && <tr><td className="muted">Добавь сервисы и подписки, которые оплачиваются каждый месяц — потом проводишь их одной кнопкой</td></tr>}
    </tbody></table>
  </div>;
}
