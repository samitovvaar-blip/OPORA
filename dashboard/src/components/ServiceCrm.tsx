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
type CProject = { id: string; kind: "project"; name: string; clientId: string; productId?: string; productIds?: string[]; price: number; status: Status; start: string; deadline?: string; payDate?: string; monthly?: boolean; payDay?: number; end?: string };
type CMove = { id: string; kind: "move"; type: "in" | "out"; amount: number; date: string; note: string; projectId?: string; category?: string; account?: string; regularId?: string; employeeId?: string };
type CRegular = { id: string; kind: "regular"; name: string; amount: number; day: number; category?: string; account?: string; projectId?: string; off?: boolean };
type PayType = "fixed" | "fixedProj" | "percent";
type CEmployee = { id: string; kind: "employee"; name: string; contact?: string; projectIds?: string[]; payType: PayType; amount: number; day?: number; off?: boolean };
type Item = CProduct | CClient | CProject | CMove | CRegular | CEmployee;
export type CrmView = "home" | "fin" | "clients" | "products" | "staff" | "tips";

// личный Telegram бухгалтера — кнопка «Чат и поддержка» у всех клиентов на услугах
export const SUPPORT_URL = "https://t.me/samitovva";
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const CATS = ["Аренда", "Реклама", "Зарплата", "Налоги", "Материалы", "Связь и сервисы", "Транспорт", "Обучение", "Банк и комиссии", "Прочее"];
const SOURCES = ["Instagram", "Сарафан / рекомендация", "Авито", "Сайт", "Telegram", "ВКонтакте", "Повторный клиент"];
const ACCOUNTS = ["Расчётный счёт", "Карта", "Наличные"];
// статусы клиента в базе (воронка) и их цвета
// шкала от зелёного к красному: зелёные — хорошо, жёлтый — вернуться, оранжевые — ждут действия, красный — отказ
const BLUES = ["#16304f", "#25476f", "#3b6db3", "#6f8fc9", "#a9c0e8", "#cfe0f5"];
const CST: [string, string][] = [["Ждёт обработку", "#e8873a"], ["Не дозвонились", "#d9622b"], ["Созвон / в диалоге", "#7cb342"], ["Вернуться", "#d4a017"], ["Отказ", "#c0392b"], ["Закончили работу", "#16a34a"]];
const cstColor = (s?: string) => CST.find(([k]) => k === s)?.[1] || "#888";
const Badge = ({ s }: { s?: string }) => <span style={{ background: cstColor(s), color: "#fff", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{s || "без статуса"}</span>;
// вставка списком из таблицы: маленькая кнопка-значок; строки → колонки через Tab
function BulkPaste({ cols, onRows }: { cols: string; onRows: (rows: string[][]) => void }) {
  const [t, setT] = useState<string | null>(null);
  const rows = (t || "").split(/\r?\n/).map((l) => l.split("\t").map((x) => x.trim())).filter((x) => x[0] && !/^(имя|название|наименование)$/i.test(x[0]));
  return <>
    <button type="button" className="ghost" title={"Вставить списком из таблицы: " + cols} style={{ padding: "2px 8px", opacity: .6 }} onClick={() => setT(t == null ? "" : null)}>📋</button>
    {t != null && <div className="card soft-card small" style={{ gridColumn: "1 / -1", width: "100%", marginTop: 8, display: "grid", gap: 6 }}>
      <span className="muted">{cols}</span>
      <textarea rows={5} value={t} onChange={(e) => setT(e.target.value)} />
      <span><button disabled={!rows.length} onClick={() => { onRows(rows); setT(null); }}>✓ Добавить {rows.length}</button> <button className="ghost" onClick={() => setT(null)}>✕</button></span>
    </div>}
  </>;
}
// фирменные линейные значки ОПОРЫ (вместо стандартных смайликов)
export const ICONS: Record<string, string> = {
  home: "M3 11l9-8 9 8M5 9v11h14V9",
  tasks: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  cap: "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
  plan: "M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  case: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  book: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  wallet: "M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3zM3 7l12-4v4M17 13.5h.01",
  source: "M4 12h4l6-6v12l-6-6M18 9a4 4 0 0 1 0 6",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-5-5.9",
  box: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  in: "M12 19V5M5 12l7-7 7 7",
  out: "M12 5v14M5 12l7 7 7-7",
  repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  sheet: "M5 3h10l4 4v14H5zM5 10h14M5 15h14M10 10v11",
  chat: "M4 5h16v11H8l-4 4z",
  spark: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z",
  pie: "M12 3a9 9 0 1 0 9 9h-9z",
  money: "M3 6h18v12H3zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  heart: "M12 20s-8-5-8-11a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 6-8 11-8 11z",
};
export function Ic({ n, c = "#e8873a", s = 18 }: { n: string; c?: string; s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "-3px", marginRight: 6, flexShrink: 0 }}><path d={ICONS[n]} /></svg>;
}
// свёрнутый раздел: строка с иконкой и жирным заголовком, по нажатию раскрывается
function Fold({ icon, title, extra, children, alert }: { icon: string; title: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode; alert?: boolean }) {
  return <details className="fold" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border, #e5e5e5)",
    ...(alert ? { background: "rgba(232,135,58,.10)", borderLeft: "4px solid #e8873a" } : {}) }}>
    <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <b style={alert ? { color: "#c2661c" } : undefined}><Ic n={icon} c={alert ? "#c2661c" : undefined} />{title}</b>
      <span className="small" style={alert ? { color: "#c2661c", fontWeight: 700 } : { color: "var(--muted, #888)" }}>{extra}</span></summary>
    <div style={{ marginTop: 10 }}>{children}</div></details>;
}
// подсказка «как считается» — открывается по нажатию
function Info({ title, children }: { title: string; children: React.ReactNode }) {
  return <details className="small" style={{ marginTop: 8 }}><summary className="muted" style={{ cursor: "pointer" }}>ⓘ {title}</summary>
    <div style={{ padding: "6px 10px", background: "var(--bg)", borderRadius: 8, marginTop: 4, lineHeight: 1.5 }}>{children}</div></details>;
}
// компактная сводка в одну строку внутри карточки: «● Статус 5 · 22%», нажал — фильтр
function Summary({ items, cur, onPick }: { items: { k: string; l: string; c: string; n: number; extra?: string }[]; cur: string; onPick: (k: string) => void }) {
  const total = items[0]?.n || 0;
  return <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", margin: "8px 0", fontSize: 13 }}>
    {items.map((x, i) => <span key={x.k} onClick={() => onPick(cur === x.k ? "all" : x.k)} style={{ cursor: "pointer", fontWeight: cur === x.k ? 800 : 500, textDecoration: cur === x.k ? "underline" : undefined }}>
      <span style={{ color: x.c }}>●</span> {x.l} <b style={{ color: x.c }}>{x.n}</b>{i > 0 && total ? <span className="muted"> · {Math.round(x.n / total * 100)}%</span> : null}{x.extra ? <span className="muted"> · {x.extra}</span> : null}</span>)}
  </div>;
}
// статус — цветными кнопками
function StatusBtns({ cur, onPick, pad = "0 14px 10px", onStart }: { cur?: string; onPick: (k: string) => void; pad?: string; onStart?: () => void }) {
  return <div className="row" style={{ justifyContent: "flex-start", gap: 4, flexWrap: "wrap", padding: pad }}>
    {CST.map(([k, c]) => <button type="button" key={k} onClick={(e) => { e.stopPropagation(); onPick(k); }}
      style={{ background: cur === k ? c : "transparent", color: cur === k ? "#fff" : c, border: `1.5px solid ${c}`, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>
      {cur === k ? "✓ " : ""}{k}</button>)}{onStart && <button type="button" onClick={(e) => { e.stopPropagation(); onStart(); }} style={{ background: "#16a34a", color: "#fff", border: "1.5px solid #16a34a", borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>▶ Начали работу</button>}</div>;
}
// продукты проекта: несколько (productIds) или старое одно поле productId
const pids = (x: { productId?: string; productIds?: string[] }) => x.productIds || (x.productId ? [x.productId] : []);
const ST: Record<Status, string> = { new: "🆕 новый", work: "🛠 в работе", done: "✓ сдан" };
const NEXT: Record<Status, Status> = { new: "work", work: "done", done: "new" };
const today = () => new Date().toISOString().slice(0, 10);
const mkOf = (d: string) => d.slice(0, 7);
const shift = (mk: string, n: number) => { const [y, m] = mk.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const dmy = (d?: string) => d ? d.split("-").reverse().join(".") : "";
const pct = (a: number, b: number) => b ? Math.round((a - b) / Math.abs(b) * 100) : null;

export default function ServiceCrm({ wsId, p, view, onNav, isOwner }: { wsId: string; p: ClientProject; view: CrmView; onNav: (v: CrmView) => void; isOwner?: boolean }) {
  const col = collection(db, "workspaces", wsId, "clients", p.id, "crm");
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState("");
  const [sync, setSync] = useState<"" | "wait" | "sent" | "fail">("");
  const dirty = useRef(false);
  useEffect(() => onSnapshot(col, (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() } as Item))), (e) => setErr(e.message)), [wsId, p.id]);
  const [mk, setMk] = useState(today().slice(0, 7));
  const [anN, setAnN] = useState(6);
  const [margOpen, setMargOpen] = useState(false);
  const [pfOpen, setPfOpen] = useState<Record<string, boolean>>({});
  const [gs, setGs] = useState<{ url: string; exec: string } | null>(null);
  const [calc, setCalc] = useState<"inc" | "out" | "prof" | "rent" | null>(null);
  const [pwx, setPwx] = useState<{ id: string; k: "p" | "m" } | null>(null);
  const [tipSub, setTipSub] = useState<"advice" | "help" | "sheet">("advice");
  const [tour, setTour] = useState<number | null>(() => { try { return !isOwner && !localStorage.getItem("opora-tour-" + p.id) ? 0 : null; } catch { return null; } });
  const goTour = (n: number | null) => { setTour(n); if (n == null) { try { localStorage.setItem("opora-tour-" + p.id, "1"); } catch { /* */ } return; } onNav(TOUR[n].view); if (!TOUR[n].sel) scrollTo({ top: 0, behavior: "smooth" }); };
  useEffect(() => { if (tour != null) onNav(TOUR[tour].view); }, []);

  const products = items.filter((x): x is CProduct => x.kind === "product").sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const clients = items.filter((x): x is CClient => x.kind === "client").sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const projects = items.filter((x): x is CProject => x.kind === "project").map((x) => ({ ...x, status: (["new", "work", "done"].includes(x.status) ? x.status : "work") as Status }))
    .sort((a, b) => b.start.localeCompare(a.start));
  const regulars = items.filter((x): x is CRegular => x.kind === "regular").sort((a, b) => a.day - b.day);
  const staff = items.filter((x): x is CEmployee => x.kind === "employee").sort((a, b) => a.name.localeCompare(b.name, "ru"));
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
  const del0 = (id: string) => { touch(); deleteDoc(doc(col, id)); };
  const upd = (id: string, data: object) => { touch(); return updateDoc(doc(col, id), data).catch((e) => alert("Не сохранилось: " + e.message)); };

  // ── выгрузка в Google-таблицу клиента (скрипт pnl.gs, doPost) ──
  const push = () => {
    const s = p.crmSheet; if (!s?.exec) return;
    setSync("wait");
    const body = JSON.stringify({ key: s.key,
      moves: [...moves].reverse().map((m) => { const pr = projects.find((x) => x.id === m.projectId);
        return [dmy(m.date), MONTHS[Number(m.date.slice(5, 7)) - 1] + " " + m.date.slice(0, 4), m.type === "in" ? "Приход" : "Расход", m.amount, m.account || "", m.type === "in" ? (pr ? "Оплата проекта" : "Доход") : m.category || "Прочее", pr?.name || "", pr ? cname(pr.clientId) : "", m.note]; }),
      projects: projects.map((x) => [dmy(x.start), x.name, pids(x).map((id) => products.find((y) => y.id === id)?.name).filter(Boolean).join(", "), cname(x.clientId), x.price, paidOf(x.id), debt(x), ST[x.status], dmy(x.deadline), dmy(x.payDate), costOf(x.id), x.price - costOf(x.id), x.price ? Math.round((x.price - costOf(x.id)) / x.price * 100) + "%" : ""]),
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
  // зарплата: начислить строки, которых ещё нет в месяце (по проекту или общую)
  const incK = (K: string, pid: string) => moves.filter((m) => m.type === "in" && m.projectId === pid && mkOf(m.date) === K).reduce((a, m) => a + m.amount, 0);
  const lastDayOf = (K: string) => new Date(Number(K.slice(0, 4)), Number(K.slice(5)), 0).getDate();
  const salPosted = (e: CEmployee, K: string, pid?: string) => moves.some((m) => m.employeeId === e.id && mkOf(m.date) === K && (m.projectId || "") === (pid || ""));
  const salPending = (e: CEmployee, K: string) => e.off ? [] : salaryLines(e, K, (pid) => incK(K, pid)).filter((l) => !salPosted(e, K, l.projectId));
  const postSal = (e: CEmployee, K: string, pid?: string) => { const date = `${K}-${String(Math.min(e.day || 10, lastDayOf(K))).padStart(2, "0")}`;
    salPending(e, K).filter((l) => pid === undefined || (l.projectId || "") === pid).forEach((l) => add({ kind: "move", type: "out", amount: l.amount, date, note: e.name, category: "Зарплата", account: ACCOUNTS[0], employeeId: e.id, ...(l.projectId ? { projectId: l.projectId } : {}) })); };
  // всё, что за месяц ещё не проведено: ожидаемые оплаты проектов, ежемесячные расходы, зарплаты
  const pendingOf = (K: string) => {
    const out: { key: string; date: string; label: string; amount: number; type: "in" | "out"; run: () => void }[] = [];
    projects.filter((x) => x.status !== "done" && x.monthly && mkOf(x.start) <= K).forEach((x) => { const left = x.price - incK(K, x.id); if (left <= 0) return;
      const date = `${K}-${String(Math.min(x.payDay || 1, lastDayOf(K))).padStart(2, "0")}`;
      out.push({ key: "p" + x.id, date, label: `Оплата: ${cname(x.clientId)} · ${x.name}`, amount: left, type: "in", run: () => add({ kind: "move", type: "in", amount: left, date, note: "", projectId: x.id, account: ACCOUNTS[0] }) }); });
    regulars.filter((r) => !r.off && (!r.projectId || projects.some((x) => x.id === r.projectId && x.status !== "done")) && !moves.some((m) => m.regularId === r.id && mkOf(m.date) === K)).forEach((r) => {
      const date = `${K}-${String(Math.min(r.day, lastDayOf(K))).padStart(2, "0")}`;
      out.push({ key: "r" + r.id, date, label: `${r.category || "Сервисы"} · ${r.name}${r.projectId ? " · " + pname(r.projectId) : ""}`, amount: r.amount, type: "out",
        run: () => add({ kind: "move", type: "out", amount: r.amount, date, note: r.name, category: r.category || "Сервисы", account: r.account || ACCOUNTS[0], regularId: r.id, ...(r.projectId ? { projectId: r.projectId } : {}) }) }); });
    staff.forEach((e) => salPending(e, K).forEach((l) => out.push({ key: "s" + e.id + (l.projectId || ""), date: `${K}-${String(Math.min(e.day || 10, lastDayOf(K))).padStart(2, "0")}`,
      label: `Зарплата · ${e.name}${l.projectId ? " · " + pname(l.projectId) : " · общий"}`, amount: l.amount, type: "out", run: () => postSal(e, K, l.projectId || "") })));
    return out.sort((a, b) => a.date.localeCompare(b.date));
  };
  // Нейла: только иконка справа снизу; нажал — короткий совет по цифрам, ещё раз — закрыла
  const nowK = today().slice(0, 7), incNow = sumM(nowK, "in"), incPrev = sumM(shift(nowK, -1), "in"), profNow = incNow - sumM(nowK, "out");
  const neylaLines = [
    incPrev ? (incNow >= incPrev ? `Выручка уже ${rub(incNow)} — это ${Math.round(incNow / incPrev * 100)}% от прошлого месяца 💪` : `Выручка пока ${rub(incNow)}, в прошлом месяце было ${rub(incPrev)}. Догоним!`) : `Выручка за месяц: ${rub(incNow)}.`,
    profNow < 0 ? `Пока месяц в минусе на ${rub(-profNow)}. Проверь расходы — может, что-то можно сдвинуть.` : `Чистая прибыль месяца: ${rub(profNow)} ✨`,
    (() => { const n = projects.filter((x) => x.status !== "done" && x.monthly && paidOf(x.id) < expectedOf(x)).length; return n ? `${n} проект(а) ещё не оплатили — загляни в «Проекты».` : "Все проекты оплачены — красота!"; })(),
    (() => { const n = clients.filter((c) => (c.status || "Ждёт обработку") === "Ждёт обработку" && !projects.some((p) => p.clientId === c.id && p.status !== "done")).length; return n ? `${n} лид(ов) ждут обработки. Один звонок — и может быть новый проект 📞` : ""; })(),
  ].filter(Boolean);
  // обучение: при первом входе клиента (и по кнопке в «Рекомендациях»)
  const fab = <>{tour == null ? <NeylaFab lines={neylaLines} /> : <TourCard n={tour} go={goTour} />}</>;
  if (view === "clients") return <>{fab}<ClientsTab {...{ del0, staff, salPending, postSal, clients, projects, products, moves, regulars, paidOf, costOf, debt, monthsOf, expectedOf, cname, add, del, upd }} /></>;
  if (view === "products") return <>{fab}<ProductsTab {...{ del0, products, projects, add, del, upd }} /></>;
  if (view === "staff") return <>{fab}<StaffTab {...{ del0, MonthPick, mk, staff, projects, moves, cname, add, del, upd, postSal, salPending }} /></>;

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
  const leadsN = (st: string) => clients.filter((c) => (c.status || "Ждёт обработку") === st && !projects.some((p) => p.clientId === c.id && p.status !== "done")).length;
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
  const planFact = (K: string) => {
    // План: ежемесячные проекты (сумма в месяц) + разовые с «оплата до» в этом месяце; расходы — шаблоны «каждый месяц» (общие и по проектам)
    const act = projects.filter((x) => x.status !== "done" && mkOf(x.start) <= K);
    const planP = act.filter((x) => x.monthly || (x.payDate && mkOf(x.payDate) === K)).map((x) => ({ x, plan: x.price, fact: projIncome(K, x.id), day: x.monthly ? x.payDay || 1 : Number(x.payDate!.slice(8)) }))
      .sort((a, b) => a.day - b.day);
    const regs = regulars.filter((r) => !r.off && (!r.projectId || act.some((x) => x.id === r.projectId)));
    const factReg = (r: CRegular) => moves.filter((m) => m.regularId === r.id && mkOf(m.date) === K).reduce((a, m) => a + m.amount, 0);
    const otherOut = moves.filter((m) => m.type === "out" && !m.regularId && !m.employeeId && mkOf(m.date) === K);
    const otherIn = moves.filter((m) => m.type === "in" && !m.projectId && mkOf(m.date) === K);
    const staffPlan = staff.filter((e) => !e.off).map((e) => ({ e, v: salaryLines(e, K, (pid) => projIncome(K, pid) || projects.find((x) => x.id === pid)?.price || 0).reduce((a, l) => a + l.amount, 0) }));
    const pIn = planP.reduce((a, y) => a + y.plan, 0), pOut = regs.reduce((a, r) => a + r.amount, 0) + staffPlan.reduce((a, x) => a + x.v, 0);
    const fIn = stat(K).inc, fOut = stat(K).out;
    const projPlanCost = regs.filter((r) => r.projectId).reduce((a, r) => a + r.amount, 0);
    const pMarg = pIn ? Math.round((pIn - projPlanCost) / pIn * 100) : null, fMarg = stat(K).marg;
    // отклонение факта от плана: без оценки «хорошо/плохо», только направление и процент
    const pc = (pl: number, fa: number, _inv?: boolean) => { const v = pl ? Math.round((fa - pl) / Math.abs(pl) * 100) : null;
      return <td>{v == null ? "—" : v === 0 ? "0%" : `${v > 0 ? "▲" : "▼"} ${Math.abs(v)}%`}</td>; };
    const Sub = ({ l, pl, fa, warn }: { l: string; pl: number | null; fa: number; warn?: boolean }) => <tr className="small"><td style={{ paddingLeft: 22 }}>{l}</td><td>{pl != null ? rub(pl) : "—"}</td><td className={warn ? "error" : ""}>{fa ? rub(fa) : "—"}</td><td /></tr>;
    const tog = (k: string) => setPfOpen({ ...pfOpen, [k]: !pfOpen[k] });
    return <div data-tour="fin-pf" className="card" style={{ margin: 0 }}>
      <h3 style={{ marginTop: 0 }}><Ic n="plan" />План / факт · {MONTHS[Number(K.slice(5)) - 1]} {K.slice(0, 4)}</h3>
      <div style={{ overflowX: "auto" }}><table className="pnl-table crm-t">
        <thead><tr><th /><th className="small">План</th><th className="small">Факт</th><th className="small">Отклонение</th></tr></thead>
        <tbody>
          <tr className="pnl-key" style={{ cursor: "pointer" }} onClick={() => tog("in")}><td>{pfOpen.in ? "▾" : "▸"} Доходы</td><td>{rub(pIn)}</td><td>{rub(fIn)}</td>{pc(pIn, fIn)}</tr>
          {pfOpen.in && <>{planP.map(({ x, plan, fact, day }) => <Sub key={x.id} l={`${day}-го · ${cname(x.clientId)} · ${x.name}`} pl={plan} fa={fact}
            warn={fact < plan && K === today().slice(0, 7) && day < Number(today().slice(8))} />)}
            {otherIn.length > 0 && <Sub l="Прочие доходы" pl={null} fa={otherIn.reduce((a, m) => a + m.amount, 0)} />}
            {!planP.length && <tr className="small muted"><td style={{ paddingLeft: 22 }} colSpan={4}>Нет ежемесячных проектов</td></tr>}</>}
          <tr className="pnl-key" style={{ cursor: "pointer" }} onClick={() => tog("out")}><td>{pfOpen.out ? "▾" : "▸"} Расходы</td><td>{rub(pOut)}</td><td>{rub(fOut)}</td>{pc(pOut, fOut, true)}</tr>
          {pfOpen.out && <>{regs.map((r) => <Sub key={r.id} l={`${r.day}-го · ${r.name}${r.projectId ? " · " + pname(r.projectId) : " · общий"}`} pl={r.amount} fa={factReg(r)} />)}
            {staffPlan.map(({ e, v }) => <Sub key={e.id} l={`👷 ${e.name} · зарплата`} pl={v} fa={moves.filter((m) => m.employeeId === e.id && mkOf(m.date) === K).reduce((a, m) => a + m.amount, 0)} />)}
            {otherOut.length > 0 && <Sub l="Разовые расходы" pl={null} fa={otherOut.reduce((a, m) => a + m.amount, 0)} />}
            {!regs.length && <tr className="small muted"><td style={{ paddingLeft: 22 }} colSpan={4}>Ежемесячных расходов нет</td></tr>}</>}
          <tr className="pnl-key"><td className="profit">Чистая прибыль</td><td>{rub(pIn - pOut)}</td><td className={fIn - fOut < 0 ? "error profit" : "profit"}>{rub(fIn - fOut)}</td>{pc(pIn - pOut, fIn - fOut)}</tr>
          <tr><td>Рентабельность</td><td>{pIn ? Math.round((pIn - pOut) / pIn * 100) + "%" : "—"}</td><td>{fIn ? Math.round((fIn - fOut) / fIn * 100) + "%" : "—"}</td><td /></tr>
          <tr><td>Маржинальность</td><td>{pMarg != null ? pMarg + "%" : "—"}</td><td>{fMarg != null ? fMarg + "%" : "—"}</td><td /></tr>
        </tbody></table></div>
    </div>;
  };
  const donut = (
(() => {
      // структура расходов месяца: по статьям (проектные и общие вместе), круговая диаграмма как в кабинете по таблице
      const COLORS = ["#16304f", "#25476f", "#3b6db3", "#6f8fc9", "#a9c0e8", "#e8873a", "#8a3ab9", "#16a34a"];
      const by: Record<string, number> = {};
      moves.filter((x) => x.type === "out" && mkOf(x.date) === mk).forEach((x) => { const k = x.category || "Прочее"; by[k] = (by[k] || 0) + x.amount; });
      const ds = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([n, v], i) => ({ n, v, c: COLORS[i % COLORS.length] }));
      if (!ds.length) return null;
      const tot = ds.reduce((x, d) => x + d.v, 0); let acc = 0;
      const grad = ds.map((d) => { const from = acc / tot * 360; acc += d.v; return `${d.c} ${from}deg ${acc / tot * 360}deg`; }).join(", ");
      return <div data-tour="fin-struct" className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Структура расходов · {MONTHS[m - 1]}</h3>
        <div className="row small" style={{ marginBottom: 6 }}><b>Расходы итого</b><b>{rub(tot)} <span className="muted">· {S.inc ? (tot / S.inc * 100).toFixed(1) + "% выручки" : ""}</span></b></div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 150, height: 150, borderRadius: "50%", background: `conic-gradient(${grad})`, display: "grid", placeItems: "center", flexShrink: 0 }}>
            <div style={{ width: 92, height: 92, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", textAlign: "center" }} className="small">
              <div><div className="muted">расходы</div><b>{S.inc ? Math.round(tot / S.inc * 100) + "%" : "—"}</b><div className="muted">выручки</div></div></div>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>{ds.map((d) => <div key={d.n} className="row small" style={{ padding: "3px 0" }}>
            <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: d.c, marginRight: 6 }} />{d.n}</span>
            <span>{rub(d.v)} <span className="muted">· {((v) => v > 0 && v < 1 ? v.toFixed(2).replace(".", ",") : Math.round(v))(d.v / tot * 100)}%</span></span></div>)}</div>
        </div>
      </div>;
    })()
  );
  const renderTips = () => {
    // ориентиры для бизнеса в сфере услуг (за текущий месяц)
    const K = today().slice(0, 7), T = stat(K);
    const salary = moves.filter((x) => x.type === "out" && (x.employeeId || /зарплат/i.test(x.category || "")) && mkOf(x.date) === K).reduce((a, x) => a + x.amount, 0);
    const sharedK = shared(K), debtAll = projects.reduce((a, x) => a + debt(x), 0);
    const leadsAll = clients.length, conv = leadsAll ? Math.round(clients.filter((c) => projects.some((p) => p.clientId === c.id)).length / leadsAll * 100) : null;
    const rows: { t: string; v: number | null; goal: string; ok: (v: number) => boolean; why: string; unit?: string }[] = [
      { t: "Рентабельность бизнеса", v: T.rent, goal: "от 20%, хорошо 25–35%", ok: (v) => v >= 20, why: "Я смотрю, сколько прибыли остаётся с каждого рубля выручки после всех расходов." },
      { t: "Маржинальность проектов", v: T.marg, goal: "от 40%, хорошо 50–60%", ok: (v) => v >= 40, why: "Это то, что остаётся с проекта после оплаты исполнителей и сервисов проекта." },
      { t: "Зарплаты (ФОТ) от выручки", v: T.inc ? Math.round(salary / T.inc * 100) : null, goal: "не больше 40–50%", ok: (v) => v <= 50, why: "Если зарплаты съедают больше половины выручки, на развитие и прибыль почти ничего не останется — я бы за этим следила." },
      { t: "Общие расходы от выручки", v: T.inc ? Math.round(sharedK / T.inc * 100) : null, goal: "не больше 15–20%", ok: (v) => v <= 20, why: "Аренда, сервисы, подписки растут незаметно. Советую пересматривать их раз в квартал." },
      { t: "Конверсия лидов в проекты", v: conv, goal: "20–30%", ok: (v) => v >= 20, why: "Из 10 лидов 2–3 должны становиться клиентами. Если меньше — давайте посмотрим, как вы обрабатываете заявки и что в КП." },
      { t: "Долги клиентов", v: debtAll, unit: "₽", goal: "0 ₽ — все оплаты вовремя", ok: (v) => v === 0, why: "Неоплаченный проект — это ваша работа без денег. Я бы напоминала клиенту об оплате прямо в день платежа." },
    ];
    return <>
      <div className="card">
        <div className="row" style={{ justifyContent: "flex-start", gap: 12, alignItems: "center", marginBottom: 10 }}>
          <img src="neyla.jpg" alt="" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
          <div><b>Нейла советует · {MONTHS[Number(K.slice(5)) - 1]}</b>
            <div className="small muted">Я сравнила ваши цифры с тем, к чему стремятся хорошие бизнесы в сфере услуг. Вот что вижу:</div></div></div>
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((x) => { const has = x.v != null, good = has && x.ok(x.v!);
            return <div key={x.t} style={{ padding: "10px 12px", border: "1px solid var(--border, #e5e5e5)", borderRadius: 12, borderLeft: `4px solid ${!has ? "#ccc" : good ? "#16a34a" : "#e8873a"}` }}>
              <div className="row" style={{ flexWrap: "wrap", gap: 6 }}><b>{x.t}</b>
                <span><b style={{ fontSize: 18 }}>{!has ? "—" : x.unit === "₽" ? rub(x.v!) : x.v + "%"}</b> <span className="small" style={{ color: !has ? "#999" : good ? "#16a34a" : "#c2661c" }}>{!has ? "нет данных" : good ? "в норме" : "есть куда расти"}</span></span></div>
              <div className="small"><span className="muted">Стремимся к:</span> <b>{x.goal}</b></div>
              <div className="small muted">{x.why}</div></div>; })}
        </div>
      </div>
      <div className="card" style={{ marginTop: 12, textAlign: "center" }}>
        <h3 style={{ marginTop: 0 }}><Ic n="heart" />Нравится, как мы вместе считаем деньги?</h3>
        <div className="small muted" style={{ marginBottom: 10 }}>Расскажите про ОПОРУ знакомым предпринимателям — я и им помогу разобраться с цифрами 💛 — Нейла</div>
        <button style={{ background: "#16304f", color: "#fff", border: 0, fontWeight: 700, padding: "8px 18px" }} onClick={() => { const url = location.origin + location.pathname, text = "Веду финансы бизнеса с ОПОРОЙ — понятные цифры каждый месяц. Рекомендую!";
          if (navigator.share) navigator.share({ title: "ОПОРА", text, url }).catch(() => {}); else { navigator.clipboard?.writeText(text + " " + url); alert("Ссылка скопирована — отправьте её другу 💛"); } }}><Ic n="heart" c="#fff" />Порекомендовать ОПОРУ</button>
      </div>
    </>;
  };
  if (view === "tips") return <>{fab}
    <div className="card row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ display: "flex", gap: 12, alignItems: "center" }}><img src="neyla.jpg" alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
        <span><b style={{ fontSize: 17 }}>Нейла — ваш помощник</b><div className="small muted">Советы по вашим цифрам, обучение и связь с бухгалтером</div></span></span>
      <a className="work-btn" href="https://t.me/dsmitovvaservbot" target="_blank" rel="noopener noreferrer"><Ic n="spark" />Написать Нейле</a>
    </div>
    <div data-tour="tips-chips" className="chips" style={{ margin: "12px 0" }}>
      {([["advice", "spark", "Нейла советует"], ["help", "book", "Помощь"], ["sheet", "sheet", "Google-таблица"]] as const).map(([k, ic, l]) =>
        <button key={k} className={`chipbtn ${tipSub === k ? "on" : ""}`} onClick={() => setTipSub(k)}><Ic n={ic} c="currentColor" s={16} />{l}</button>)}
    </div>
    {tipSub === "advice" && renderTips()}
    {tipSub === "help" && <div className="card">
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}><span><b><Ic n="book" />Обучение</b><div className="small muted">Нейла по шагам покажет все вкладки кабинета</div></span>
        <button style={{ background: "#16304f", color: "#fff", border: 0, fontWeight: 700 }} onClick={() => goTour(0)}>▶ Пройти обучение</button></div>
      <div style={{ marginTop: 14 }}><b>📱 Установить кабинет на телефон</b><InstallHow /></div>
      <div className="row" style={{ marginTop: 16, flexWrap: "wrap", gap: 8, paddingTop: 12, borderTop: "1px solid var(--border, #e5e5e5)" }}>
        <span><b><Ic n="chat" />Остались вопросы?</b><div className="small muted">Напишите бухгалтеру — ответим в рабочее время</div></span>
        <a className="work-btn" href={p.links?.chat || SUPPORT_URL} target="_blank" rel="noopener noreferrer"><Ic n="chat" />Чат поддержки</a></div>
    </div>}
    {tipSub === "sheet" && <div className="card">
      <h3 style={{ marginTop: 0 }}><Ic n="sheet" />Google-таблица</h3>
      <div className="work-btns">
        {(p.crmSheet?.url || p.links?.sheet) ? <a className="work-btn" href={p.crmSheet?.url || p.links?.sheet} target="_blank" rel="noopener noreferrer"><Ic n="sheet" />Открыть таблицу</a> : <span className="work-btn off"><Ic n="sheet" c="#999" />Таблица не подключена</span>}
      {p.crmSheet?.exec
        ? <span className="work-btn" style={{ cursor: "pointer" }} onClick={push} title="Отправить все данные в Google-таблицу"><Ic n="sheet" />Google-таблица {sync === "wait" ? "· отправляю…" : sync === "sent" ? "· ✓ отправлено" : sync === "fail" ? "· ⚠️ ошибка" : "· 🔄 обновить"}</span>
        : isOwner ? <span className="work-btn" style={{ cursor: "pointer" }} onClick={() => setGs(gs ? null : { url: "", exec: "" })}><Ic n="sheet" />Добавить Google-таблицу</span> : null}
        </div>
    {gs && <div className="card small" style={{ marginTop: 10, display: "grid", gap: 6 }}>
      <b><Ic n="sheet" />Google-таблица для данных клиента</b>
      <div className="muted">Все доходы, расходы, проекты и клиенты будут сами попадать в таблицу (листы «ПРИЛОЖЕНИЕ …»).</div>
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        <li>Создай Google-таблицу и вставь ссылку на неё:</li></ol>
      <input placeholder="https://docs.google.com/spreadsheets/d/…/edit" value={gs.url} onChange={(e) => setGs({ ...gs, url: e.target.value })} />
      <ol start={2} style={{ margin: 0, paddingLeft: 18 }}>
        <li>Расширения → Apps Script → вставь общий скрипт pnl.gs → Развёртывание → «Веб-приложение», доступ «Все» → скопируй ссылку …/exec:</li></ol>
      <input placeholder="https://script.google.com/macros/s/…/exec" value={gs.exec} onChange={(e) => setGs({ ...gs, exec: e.target.value })} />
      {(() => { const key = (gs.url.match(/\/d\/([\w-]{20,})/) || [])[1];
        return <button disabled={!key || !gs.exec.trim()} onClick={() => { updateDoc(doc(db, "workspaces", wsId, "clients", p.id), { crmSheet: { url: gs.url.trim(), exec: gs.exec.trim().replace(/\?.*$/, ""), key } }); setGs(null); }}>💾 Привязать таблицу</button>; })()}
    </div>}
    </div>}
  </>;
  if (view === "fin") return <>
    {fab}
    {MonthPick}
    {planFact(mk)}
    {donut}
    <div style={{ marginTop: 12 }}><FinTab {...{ del0, pending: pendingOf(mk), MonthPick: <></>, mk, moves, projects, pname, add, del, upd, sumM, p, push, sync, regulars, nActive: activeIn(mk).length }} /></div>
  </>;
  // расчёт плитки — раскрывается прямо внутри плитки
  const calcBody = (k: "inc" | "out" | "prof" | "rent") => {
    const ins = moves.filter((x) => x.type === "in" && mkOf(x.date) === mk), outs = moves.filter((x) => x.type === "out" && mkOf(x.date) === mk);
    const group = (list: CMove[], key: (x: CMove) => string) => { const g: Record<string, number> = {}; list.forEach((x) => { const kk = key(x); g[kk] = (g[kk] || 0) + x.amount; }); return Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 8); };
    const Line = ({ l, v, b }: { l: string; v: string; b?: boolean }) => <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "2px 0", borderBottom: "1px dashed rgba(255,255,255,.35)", fontWeight: b ? 700 : 400 }}><span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{l}</span><span style={{ whiteSpace: "nowrap" }}>{v}</span></div>;
    return <div className="small tile-calc" style={{ position: "absolute", left: 0, right: 0, top: "calc(100% - 8px)", zIndex: 30, background: "inherit", color: "inherit", padding: "8px 14px 10px",
      borderRadius: "0 0 14px 14px", boxShadow: "0 10px 24px rgba(22,48,79,.28)", fontSize: 12, lineHeight: 1.35, textAlign: "left" }} onClick={(e) => e.stopPropagation()}>
      {k === "inc" && <>{group(ins, (x) => x.projectId ? pname(x.projectId) || "Проект" : x.category || "Прочий доход").map(([kk, v]) => <Line key={kk} l={kk} v={rub(v)} />)}<Line l="= Выручка" v={rub(S.inc)} b /></>}
      {k === "out" && <>{group(outs, (x) => (x.category || "Прочее") + (x.projectId ? " · проект" : " · общий")).map(([kk, v]) => <Line key={kk} l={kk} v={rub(v)} />)}<Line l="= Расходы" v={rub(S.out)} b /></>}
      {k === "prof" && <><Line l="Выручка" v={rub(S.inc)} /><Line l="− Расходы" v={rub(S.out)} /><Line l={S.prof < 0 ? "= Убыток" : "= Чистая прибыль"} v={rub(S.prof)} b /></>}
      {k === "rent" && <><Line l="Чистая прибыль" v={rub(S.prof)} /><Line l="÷ Выручка × 100%" v={rub(S.inc)} /><Line l="= Рентабельность" v={pctS(S.rent)} b /></>}
      <div style={{ textAlign: "center", marginTop: 4, opacity: .8, cursor: "pointer" }} onClick={() => setCalc(null)}>▲ свернуть</div>
    </div>;
  };
  return <>
    {fab}
    {MonthPick}
    <div data-tour="home-tiles" className="crm-tiles">
      <div className={`card stat g-blue tile tile-link ${calc === "inc" ? "on" : ""}`} onClick={() => setCalc(calc === "inc" ? null : "inc")}><span className="tile-ico"><Ic n="money" c="#fff" s={26} /></span><div className="muted">Выручка</div><b>{rub(S.inc)}</b><Delta v={S.inc} w={P.inc} />{calc === "inc" && calcBody("inc")}</div>
      <div className="card stat g-orange tile tile-link" onClick={() => setCalc(calc === "out" ? null : "out")}><span className="tile-ico"><Ic n="out" c="#fff" s={26} /></span><div className="muted">Расходы</div><b>{rub(S.out)}</b><span className="small">{S.inc ? Math.round(S.out / S.inc * 100) + "% выручки" : ""}</span>{calc === "out" && calcBody("out")}</div>
      <div className={`card stat ${S.prof < 0 ? "g-red" : "g-green"} tile tile-link`} onClick={() => setCalc(calc === "prof" ? null : "prof")}><span className="tile-ico"><Ic n="trend" c="#fff" s={26} /></span><div className="muted">{S.prof < 0 ? "Убыток" : "Чистая прибыль"}</div><b>{rub(S.prof)}</b>{S.prof > 0 && P.prof > 0 && <Delta v={S.prof} w={P.prof} />}{calc === "prof" && calcBody("prof")}</div>
      <div className="card stat g-orange t-light tile tile-link" onClick={() => setCalc(calc === "rent" ? null : "rent")}><span className="tile-ico"><Ic n="chart" c="#fff" s={26} /></span><div className="muted">Рентабельность бизнеса</div><b>{pctS(S.rent)}</b>{calc === "rent" && calcBody("rent")}</div>
    </div>
    <div data-tour="home-proj" className="card" style={{ marginTop: 12 }}>
      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
        <h3 style={{ margin: 0 }}><Ic n="case" />Проекты в работе · {work.length}</h3>
        <span className="small">{unpaidM.length ? <span className="neg">⏳ не оплатили: {unpaidM.length} · {rub(unpaidM.reduce((a, x) => a + (x.monthly ? x.price - projIncome(mk, x.id) : debt(x)), 0))}</span> : <span className="ok">✓ все оплатили</span>}</span></div>
      {<>
      <div style={{ overflowX: "auto", marginTop: 10 }}><table className="pnl-table crm-t"><tbody>
        <tr className="muted small"><td>Проект</td><td>Оплата</td><td>Чистая прибыль</td><td>Маржа</td></tr>
        {margRows.map(({ x, i, c, sh, mm, mm2 }) => { const un = unpaidM.some((y) => y.id === x.id), prof = i - c - sh, open = pwx?.id === x.id ? pwx.k : null;
          const tg = (k: "p" | "m") => setPwx(open === k ? null : { id: x.id, k });
          const Ln = ({ l, v, b, cl }: { l: string; v: string; b?: boolean; cl?: string }) => <div className="row" style={{ padding: "2px 0", fontWeight: b ? 700 : 400 }}><span>{l}</span><span className={cl}>{v}</span></div>;
          return <Fragment key={x.id}><tr><td>{x.name}<div className="small muted">{cname(x.clientId)}</div></td>
            <td className={un ? "error" : "ok"}>{un ? `⏳ ${rub(x.monthly ? x.price - i : debt(x))}` : i ? "✓ оплатил" : "—"}</td>
            <td style={{ cursor: "pointer" }} onClick={() => tg("p")}><b className={prof < 0 ? "error" : "ok"} style={{ borderBottom: "1px dashed currentColor" }}>{rub(prof)}</b></td>
            <td style={{ cursor: "pointer" }} onClick={() => tg("m")}>{mm2 != null && mm2 < 0 ? <span className="error" style={{ borderBottom: "1px dashed currentColor" }}>невыгодный</span> : <b style={{ borderBottom: "1px dashed currentColor" }}>{pctS(mm2)}</b>}</td></tr>
            {open && <tr><td colSpan={4}><div className="small" style={{ padding: "6px 10px", background: "var(--bg)", borderRadius: 8, maxWidth: 420, marginLeft: "auto" }}>
              <Ln l="Доходы проекта" v={rub(i)} cl="ok" /><Ln l="− Расходы проекта" v={rub(c)} cl="neg" /><Ln l="− Доля общих расходов" v={rub(sh)} cl="neg" />
              <Ln l="= Чистая прибыль проекта" v={rub(prof)} b cl={prof < 0 ? "error" : "ok"} />
              {open === "m" && <><Ln l="÷ Доходы проекта × 100%" v={rub(i)} /><Ln l="= Маржа" v={mm2 != null && mm2 < 0 ? "невыгодный (" + mm2 + "%)" : pctS(mm2)} b /></>}
            </div></td></tr>}</Fragment>; })}
        {!margRows.length && <tr><td className="muted">Нет проектов</td></tr>}
      </tbody></table></div>
      </>}
    </div>
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
          {["Ждёт обработку", "Не дозвонились", "Созвон / в диалоге", "Вернуться"].map((st) => <div key={st} className="row" style={{ cursor: "pointer" }} onClick={() => onNav("clients")}>
            <span><span style={{ color: cstColor(st) }}>●</span> {st}</span><b>{leadsN(st)}</b></div>)}
        </div>
      </div>
    </div>
    <div className="card" style={{ marginTop: 12 }} id="crm-an">
      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}><h3 style={{ margin: 0 }}><Ic n="chart" />Аналитика</h3>
        <span>{[3, 6, 9, 12].map((n) => <button key={n} className={anN === n ? "" : "ghost"} style={{ padding: "2px 10px", marginLeft: 4 }} onClick={() => setAnN(n)}>{n === 12 ? "год" : n + " мес."}</button>)}</span></div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110, marginTop: 10 }}>
        {series.map((x) => <div key={x.k} style={{ flex: 1, textAlign: "center" }} title={`${rub(x.inc)} · прибыль ${rub(x.prof)}`}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2, height: 90 }}>
            <div style={{ width: 9, height: `${x.inc / max * 100}%`, background: "#25476f", borderRadius: 3 }} />
            <div style={{ width: 9, height: `${Math.abs(x.prof) / max * 100}%`, background: x.prof < 0 ? "#c0392b" : "#16a34a", borderRadius: 3 }} /></div>
          <div className="small muted">{MONTHS[Number(x.k.slice(5)) - 1].slice(0, 3)}</div></div>)}
      </div>
      <div className="small muted">■ <span style={{ color: "#25476f" }}>выручка</span> · ■ <span style={{ color: "#16a34a" }}>прибыль</span></div>
      <div style={{ overflowX: "auto" }}><table className="pnl-table crm-t" style={{ marginTop: 8 }}><tbody>
        <tr className="muted small"><td>Месяц</td><td>Выручка</td><td>Прибыль</td><td>Маржинальность</td><td>Рентабельность</td></tr>
        {series.slice().reverse().map((x) => <tr key={x.k}><td>{MONTHS[Number(x.k.slice(5)) - 1]} {x.k.slice(0, 4)}</td><td>{rub(x.inc)}</td><td className={x.prof < 0 ? "error" : "ok"}>{rub(x.prof)}</td><td>{pctS(x.marg)}</td><td>{pctS(x.rent)}</td></tr>)}
        <tr className="pnl-key"><td>Итого за {anN === 12 ? "год" : anN + " мес."}</td><td>{rub(tot.inc)}</td><td className={tot.inc - tot.out < 0 ? "error" : "ok"}>{rub(tot.inc - tot.out)}</td>
          <td>{pctS(tot.pi ? Math.round((tot.pi - tot.pc) / tot.pi * 100) : null)}</td><td>{pctS(tot.inc ? Math.round((tot.inc - tot.out) / tot.inc * 100) : null)}</td></tr>
      </tbody></table></div>
    </div>
  </>;
}

function FinTab({ del0, pending, MonthPick, mk, moves, projects, pname, add, del, upd, sumM, p, push, sync, regulars, nActive }: {
  MonthPick: JSX.Element; mk: string; moves: CMove[]; projects: CProject[]; pname: (id?: string) => string;
  add: (d: object) => void; del: (id: string) => void; upd: (id: string, d: object) => void; sumM: (k: string, t: "in" | "out") => number; p: ClientProject; push: () => void; sync: string; regulars: CRegular[]; nActive: number; del0: (id: string) => void; pending?: { key: string; date: string; label: string; amount: number; type: "in" | "out"; run: () => void }[];
}) {
  const [f, setF] = useState({ type: "out" as "in" | "out", amount: "", date: today(), note: "", projectId: "", category: "", account: ACCOUNTS[0], repeat: true });
  const inM = moves.filter((m) => mkOf(m.date) === mk);
  const [addF, setAddF] = useState(false);
  const [selO, setSelO] = useState<string[]>([]);
  const income = sumM(mk, "in"), expense = sumM(mk, "out");
  const submit = (e: FormEvent) => { e.preventDefault(); const amount = Number(f.amount); if (!amount) return;
    if (f.type === "out" && f.repeat) { add({ kind: "regular", name: f.note.trim() || f.category.trim() || "Расход", amount, day: Number(f.date.slice(8)) || 1, category: f.category.trim() || "Прочее", account: f.account }); setF({ ...f, amount: "", note: "" }); setAddF(false); return; }
    add({ kind: "move", type: f.type, amount, date: f.date, note: f.note.trim(), account: f.account,
      category: f.category.trim() || (f.type === "in" ? "Прочий доход" : "Прочее") });
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
    <div data-tour="fin-folds" className="card" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
    <Fold icon="layers" title="Общие расходы" extra={rub(moves.filter((m) => m.type === "out" && !m.projectId && mkOf(m.date) === mk).reduce((a, m) => a + m.amount, 0)) + " за месяц"}>
    <Regulars {...{ mk, regulars: regulars.filter((x) => !x.projectId), moves, projects, pname, add, del, upd, nActive, projectId: undefined, flat: true }} extra={<>
      <div className="row small" style={{ justifyContent: "flex-start", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={() => setAddF(!addF)} style={{ background: "#16304f", color: "#fff", border: 0, fontWeight: 700 }}>{addF ? "✕ Закрыть" : "+ Добавить"}</button>
        <button className="ghost" onClick={copyPrev}>⧉ Скопировать расходы прошлого месяца</button>
        <BulkPaste cols="Название · Сумма · Число месяца · Статья (каждая строка — ежемесячный общий расход)" onRows={(rows) => rows.forEach(([n, a, d, c]) => add({ kind: "regular", name: n, amount: Number(String(a || "").replace(/[^\d.,]/g, "").replace(",", ".")) || 0, day: Math.min(31, Math.max(1, Number(d) || 1)), category: c || "Прочее", account: ACCOUNTS[0] }))} />
      </div>
      {addF &&     <form className="row small" onSubmit={submit} style={{ flexWrap: "wrap", gap: 6, marginTop: 10 }}>
      <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as "in" | "out" })}><option value="in">➕ Доход</option><option value="out">➖ Расход</option></select>
      <input type="number" step="any" placeholder="Сумма" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} style={{ width: 110 }} />
      <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      <select value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
      <input list="crm-cats" placeholder={f.type === "in" ? "Статья дохода (прочий доход)" : "Статья (аренда, ЗП, сервисы…)"} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={{ width: 170 }} />
      <datalist id="crm-cats">{(f.type === "in" ? ["Прочий доход", "Возврат", "Проценты банка"] : CATS).map((c) => <option key={c} value={c} />)}</datalist>
      <input placeholder={f.type === "out" ? "Название (Тильда, аренда, ЗП…)" : "Комментарий"} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} style={{ flex: "1 1 140px" }} />
      {f.type === "out" && <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.checked })} /> повторять каждый месяц</label>}
      <button disabled={!Number(f.amount)}>✓ Сохранить</button>
    </form>}
    </>} />
    </Fold>
    {(pending || []).length > 0 && <Fold alert icon="repeat" title={`Ждут проведения · ${(pending || []).length}`} extra={rub((pending || []).reduce((a, x) => a + (x.type === "out" ? -x.amount : x.amount), 0))}>
      <button className="ghost small" onClick={() => (pending || []).forEach((x) => x.run())}>✓ Провести всё</button>
      <table className="pnl-table crm-t" style={{ marginTop: 8 }}><tbody>
      {(pending || []).map((x) => <tr key={x.key}><td className="small">{dmy(x.date)}</td>
        <td>{x.label}<div className="small muted">не проведено</div></td>
        <td className={x.type === "in" ? "ok" : "neg"}>{x.type === "in" ? "+" : "−"}{rub(x.amount)}</td>
        <td><button style={{ padding: "2px 10px" }} onClick={x.run}>Провести</button></td></tr>)}
      </tbody></table>
    </Fold>}
    <Fold icon="book" title="Операции за месяц" extra={`${inM.length} операц.`}>
      <div className="row small" style={{ flexWrap: "wrap", gap: 6 }}><span />
        <span><label style={{ cursor: "pointer" }}><input type="checkbox" checked={inM.length > 0 && inM.every((x) => selO.includes(x.id))} onChange={(e) => setSelO(e.target.checked ? inM.map((x) => x.id) : [])} /> выбрать все</label>
          <button className="ghost" style={{ marginLeft: 6, padding: "2px 8px" }} onClick={() => setSelO(inM.filter((x) => x.employeeId || /зарплат/i.test(x.category || "")).map((x) => x.id))}>выбрать зарплаты</button></span></div>
      {selO.length > 0 && <div className="row small" style={{ marginTop: 6, padding: "6px 10px", background: "var(--bg)", borderRadius: 8 }}><b>Выбрано: {selO.length} · {rub(inM.filter((x) => selO.includes(x.id)).reduce((a, x) => a + x.amount, 0))}</b>
        <span><button className="ghost" onClick={() => setSelO([])}>✕ Снять</button> <button style={{ background: "#c0392b", color: "#fff", border: 0 }} onClick={() => { if (confirm(`Удалить ${selO.length} операций?`)) { selO.forEach((id) => del0(id)); setSelO([]); } }}>🗑 Удалить выбранные</button></span></div>}
    <table className="pnl-table crm-t" style={{ marginTop: 8 }}><tbody>
      {inM.map((x) => <tr key={x.id}><td style={{ width: 22 }}><input type="checkbox" checked={selO.includes(x.id)} onChange={(e) => setSelO(e.target.checked ? [...selO, x.id] : selO.filter((i) => i !== x.id))} /></td><td className="small">{dmy(x.date)}</td>
        <td>{x.type === "in" ? (x.projectId ? `Оплата: ${pname(x.projectId) || "проект"}` : x.category || "Доход") : (x.category || "Расход") + (x.projectId ? ` · ${pname(x.projectId)}` : "")}<div className="small muted">{x.account || ""}{x.note ? " · " + x.note : ""}</div></td>
        <td className={x.type === "in" ? "ok" : "neg"}>{x.type === "in" ? "+" : "−"}{rub(x.amount)}</td>
        <td style={{ whiteSpace: "nowrap" }}><span className="small muted">{x.projectId ? "проект" : "общий"}</span> <button className="ghost" style={{ padding: "0 6px" }} onClick={() => del(x.id)}>🗑</button></td></tr>)}
      {!inM.length && <tr><td className="muted">В этом месяце операций нет</td></tr>}
    </tbody></table>
    </Fold>
    <Fold icon="wallet" title="Остатки на конец месяца" extra={rub(accs.reduce((x, a) => x + bal(a), 0))}>
        <div>
        {accs.map((a) => <div key={a} className="row small"><span>{a}</span><b className={bal(a) < 0 ? "error" : ""}>{rub(bal(a))}</b></div>)}
        <div className="row small" style={{ borderTop: "1px solid var(--border, #ddd)", paddingTop: 4 }}><b>Всего</b><b>{rub(accs.reduce((x, a) => x + bal(a), 0))}</b></div>
        </div>
    </Fold>
    </div>
  </>;
}

function ClientsTab({ del0, staff, salPending, postSal, clients, projects, products, moves, regulars, paidOf, costOf, debt, monthsOf, expectedOf, cname, add, del, upd }: {
  staff: CEmployee[]; salPending: (e: CEmployee, K: string) => { amount: number; projectId?: string }[]; postSal: (e: CEmployee, K: string, pid?: string) => void;
  clients: CClient[]; projects: CProject[]; products: CProduct[]; moves: CMove[]; regulars: CRegular[]; paidOf: (id: string) => number; costOf: (id: string) => number; monthsOf: (p: CProject) => string[]; expectedOf: (p: CProject) => number; debt: (p: CProject) => number; cname: (id: string) => string;
  add: (d: object) => Promise<unknown>; del: (id: string) => void; del0: (id: string) => void; upd: (id: string, d: object) => void;
}) {
  const [sub, setSub] = useState<"projects" | "base">("projects");
  const [c, setC] = useState({ name: "", company: "", phone: "", note: "", source: "", status: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [bulkSrc, setBulkSrc] = useState("");
  const [selP, setSelP] = useState<string[]>([]);
  const [srcF, setSrcF] = useState<string | null>(null);
  // убранный статус «Ждёт предложение» → «Ждёт обработку»
  useEffect(() => { clients.filter((x) => x.status === "Ждёт предложение").forEach((x) => upd(x.id, { status: "Ждёт обработку" })); }, [clients.length]);
  const [pAdd, setPAdd] = useState(false);
  const [costF, setCostF] = useState<{ id: string; amount: string; category: string; note: string; date: string; account: string } | null>(null);
  const [cmt, setCmt] = useState<Record<string, string>>({});
  const blankP = { name: "", clientId: "", productIds: [] as string[], price: "", deadline: "", payDate: "", monthly: true, payDay: "" };
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
  const shownC = leads.filter((x) => cst === "all" || (x.status || "Ждёт обработку") === cst).filter((x) => srcF == null || (x.source || "Не указан") === srcF).filter((x) => !ql || [x.name, x.company, x.phone, x.note].join(" ").toLowerCase().includes(ql));
  const shownP = projects.filter((x) => (filter === "all" ? x.status !== "done" : filter === "debt" ? debt(x) > 0 : x.status === filter) && (!ql || (x.name + " " + cname(x.clientId)).toLowerCase().includes(ql)));
  const bySrc: Record<string, { n: number; sum: number }> = {};
  clients.forEach((x) => { const k = x.source || "Не указан"; const s = bySrc[k] = bySrc[k] || { n: 0, sum: 0 }; s.n++;
    s.sum += moves.filter((m) => m.type === "in" && projects.some((p) => p.id === m.projectId && p.clientId === x.id)).reduce((a, m) => a + m.amount, 0); });
  const finish = (x: CProject) => { if (!confirm(`Завершить работу по «${x.name}»? Клиент перейдёт в базу лидов со статусом «Закончили работу», вся история по проекту сохранится в его карточке.`)) return;
    upd(x.id, { status: "done", end: today() }); upd(x.clientId, { status: "Закончили работу" }); setOpen(null); };
  const srcList = Object.entries(bySrc).sort((a, b) => b[1].n - a[1].n);
  const toProject = (x: CClient) => { setPr({ ...blankP, clientId: x.id }); setSub("projects"); setPAdd(true); setOpen(null); };
  const sumOf = (ids: string[]) => ids.reduce((a, id) => a + (products.find((y) => y.id === id)?.price || 0), 0);
  const ProdChips = ({ ids, onChange }: { ids: string[]; onChange: (v: string[]) => void }) => <div className="row" style={{ justifyContent: "flex-start", gap: 4, flexWrap: "wrap" }}>
    {products.map((y) => { const on = ids.includes(y.id); return <button type="button" key={y.id} className={on ? "" : "ghost"} style={{ padding: "2px 10px" }}
      onClick={() => onChange(on ? ids.filter((i) => i !== y.id) : [...ids, y.id])}>{on ? "✓ " : ""}{y.name} · {rub(y.price)}</button>; })}
    {!products.length && <span className="muted">Продуктов нет</span>}</div>;

  return <>
    <div className="chips" style={{ marginBottom: 10 }}>
      <button data-tour="proj-chip" className={`chipbtn ${sub === "projects" ? "on" : ""}`} onClick={() => setSub("projects")}><Ic n="case" />Проекты</button>
      <button className={`chipbtn ${sub === "base" ? "on" : ""}`} onClick={() => setSub("base")}><Ic n="users" />База лидов</button>
    </div>
    <input placeholder="🔍 Поиск" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 10 }} />

    {sub === "projects" && <>
      <div className="card">
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}><b><Ic n="case" />Проекты · {shownP.length}</b><span>
          <button onClick={() => setPAdd(!pAdd)}>{pAdd ? "✕ Закрыть" : "+ Новый проект"}</button>
          <BulkPaste cols="Название · Клиент · Сумма в месяц · Число оплаты" onRows={async (rows) => {
            for (const [name, cl, price, day] of rows) {
              let cid = clients.find((c) => c.name.trim().toLowerCase() === (cl || "").trim().toLowerCase())?.id;
              if (!cid && cl) { const ref = await add({ kind: "client", name: cl.trim(), status: "Ждёт обработку", created: today() }) as { id?: string } | undefined; cid = ref?.id; }
              if (!cid) continue;
              add({ kind: "project", name, clientId: cid, price: Number(String(price || "").replace(/[^\d.,]/g, "").replace(",", ".")) || 0, status: "work", start: today(), monthly: true, payDay: Math.min(31, Math.max(1, Number(day) || 1)) });
            } }} /></span></div>
        {pAdd && <form className="card soft-card" style={{ marginTop: 10, display: "grid", gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (!pr.name.trim() || !pr.clientId) return;
          add({ kind: "project", name: pr.name.trim(), clientId: pr.clientId, price: Number(pr.price) || 0, status: "new", start: today(),
            ...(pr.productIds.length ? { productIds: pr.productIds } : {}), ...(pr.deadline ? { deadline: pr.deadline } : {}), ...(!pr.monthly && pr.payDate ? { payDate: pr.payDate } : {}), monthly: pr.monthly, ...(pr.monthly ? { payDay: Math.min(31, Math.max(1, Number(pr.payDay) || Number(today().slice(8)))) } : {}) });
          setPr(blankP); setPAdd(false); }}>
          <b>Новый проект</b>
          <select value={pr.clientId} onChange={(e) => setPr({ ...pr, clientId: e.target.value })}><option value="">— клиент * —</option>{clients.map((x) => <option key={x.id} value={x.id}>{x.name}{x.company ? ` (${x.company})` : ""}</option>)}</select>
          <div className="small"><span className="muted">Продукты (сумма посчитается сама, её можно поправить)</span>
            <ProdChips ids={pr.productIds} onChange={(v) => setPr({ ...pr, productIds: v, price: String(sumOf(v)), name: pr.name || (v[0] ? products.find((y) => y.id === v[0])?.name || "" : "") })} /></div>
          <input placeholder="Название проекта / услуга *" value={pr.name} onChange={(e) => setPr({ ...pr, name: e.target.value })} />
          <div className="row small" style={{ justifyContent: "flex-start", gap: 6 }}><span className="muted">Оплата:</span>
            <button type="button" className={pr.monthly ? "" : "ghost"} onClick={() => setPr({ ...pr, monthly: true })}>каждый месяц</button>
            <button type="button" className={!pr.monthly ? "" : "ghost"} onClick={() => setPr({ ...pr, monthly: false })}>разово</button></div>
          <input type="number" placeholder={pr.monthly ? "Сумма в месяц" : "Сумма оплаты по проекту"} value={pr.price} onChange={(e) => setPr({ ...pr, price: e.target.value })} />
          {pr.monthly
            ? <label className="row small" style={{ gap: 6 }}><span className="muted" style={{ minWidth: 110 }}>Число оплаты</span><input type="number" min={1} max={31} placeholder={"например " + Number(today().slice(8))} value={pr.payDay} onChange={(e) => setPr({ ...pr, payDay: e.target.value })} style={{ flex: 1 }} /></label>
            : <label className="row small" style={{ gap: 6 }}><span className="muted" style={{ minWidth: 110 }}>Оплата до</span><input type="date" value={pr.payDate} onChange={(e) => setPr({ ...pr, payDate: e.target.value })} style={{ flex: 1 }} /></label>}
          <button disabled={!pr.name.trim() || !pr.clientId}>✓ Создать проект</button>
        </form>}
      {filter !== "done" && <div style={{ margin: "10px 0 4px", fontSize: 15 }}><Ic n="case" c="#16a34a" />В работе сейчас: <b style={{ fontSize: 20 }}>{projects.filter((x) => x.status !== "done").length}</b>
        <span className="muted small"> · ждём в этом месяце {rub(projects.filter((x) => x.status !== "done" && x.monthly).reduce((a, x) => a + x.price, 0))}{projects.some((x) => debt(x) > 0) ? ` · долг ${rub(projects.reduce((a, x) => a + debt(x), 0))}` : ""}</span></div>}
      <div className="row small" style={{ marginTop: 10, flexWrap: "wrap", gap: 6 }}>
        <label style={{ cursor: "pointer" }}><input type="checkbox" checked={shownP.length > 0 && shownP.every((x) => selP.includes(x.id))} onChange={(e) => setSelP(e.target.checked ? shownP.map((x) => x.id) : [])} /> выбрать все</label>
        {selP.length > 0 && <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}><b>Выбрано: {selP.length}</b>
          <button style={{ background: "#16304f", color: "#fff", border: 0 }} onClick={() => { if (!confirm(`Завершить работу по ${selP.length} проект(ам)? Клиенты перейдут в лиды «Закончили работу».`)) return;
            projects.filter((x) => selP.includes(x.id)).forEach((x) => { upd(x.id, { status: "done", end: today() }); upd(x.clientId, { status: "Закончили работу" }); }); setSelP([]); }}>✓ Завершить работу</button>
          <button className="ghost" style={{ color: "#b02a2a" }} onClick={() => { if (confirm(`Удалить ${selP.length} проект(ов)? Оплаты и расходы по ним останутся в операциях.`)) { selP.forEach((id) => del0(id)); setSelP([]); } }}>🗑 Удалить</button>
          <button className="ghost" onClick={() => setSelP([])}>✕</button></span>}
      </div>
      {/* Проекты — плитками; ⚙ раскрывает проект на всю ширину */}
      <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
        {shownP.map((x) => { const on = open === x.id, paid = paidOf(x.id), cost = costOf(x.id), d = debt(x);
          const payLate = d > 0 && !x.monthly && x.payDate && x.payDate < today();
          const pays = moves.filter((m) => m.projectId === x.id && m.type === "in").sort((a, b) => b.date.localeCompare(a.date));
          const costs = moves.filter((m) => m.projectId === x.id && m.type === "out").sort((a, b) => b.date.localeCompare(a.date));
          const exp = expectedOf(x), share = exp ? Math.min(100, Math.round(paid / exp * 100)) : paid ? 100 : 0;
          const profit = paid - cost, margin = paid ? Math.round(profit / paid * 100) : null;
          const cm = today().slice(0, 7), mi = moves.filter((m) => m.projectId === x.id && m.type === "in" && mkOf(m.date) === cm).reduce((a, m) => a + m.amount, 0),
            mc = moves.filter((m) => m.projectId === x.id && m.type === "out" && mkOf(m.date) === cm).reduce((a, m) => a + m.amount, 0), mmg = mi ? Math.round((mi - mc) / mi * 100) : null;
          const L = ({ l, children }: { l: string; children: React.ReactNode }) => <label className="row" style={{ gap: 6 }}><span className="muted" style={{ minWidth: 120 }}>{l}</span><span style={{ flex: 1, display: "flex" }}>{children}</span></label>;
          return <div key={x.id} style={{ border: `1px solid ${on ? "#16304f" : "var(--border, #e5e5e5)"}`, borderRadius: 12, overflow: "hidden", background: "var(--surface, #fff)", opacity: x.status === "done" ? .7 : 1 }}>
            <div className="row" style={{ padding: "10px 14px", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <input type="checkbox" checked={selP.includes(x.id)} onChange={(e) => setSelP(e.target.checked ? [...selP, x.id] : selP.filter((i) => i !== x.id))} />
              <div style={{ minWidth: 0, flex: "1 1 240px" }}><b>{x.name}</b> <span className="muted small">· {cname(x.clientId)}</span>
                <div className="small muted">{x.monthly ? `${rub(x.price)} в месяц, ${x.payDay || 1}-го` : `${rub(x.price)} разово`}{d > 0 && <span className={payLate ? "error" : "neg"}> · долг {rub(d)}</span>}</div>
                <div className="small" style={{ marginTop: 6, display: "inline-flex", flexWrap: "wrap", gap: "2px 10px", alignItems: "baseline", background: "var(--bg)", border: "1px solid var(--border, #e5e5e5)", borderRadius: 999, padding: "4px 12px" }}>
                  <span><span className="muted">Доходы</span> <b className="ok">{rub(paid)}</b></span><span className="muted">−</span>
                  <span><span className="muted">Расходы</span> <b className="neg">{rub(cost)}</b></span><span className="muted">=</span>
                  <span><span className="muted">Прибыль</span> <b className={profit < 0 ? "error" : "ok"}>{rub(profit)}</b></span>
                  <span><span className="muted">Маржа</span> <b className={margin != null && margin < 0 ? "error" : ""}>{margin != null ? margin + "%" : "—"}</b></span></div></div>
              <div className="row" style={{ alignItems: "center", gap: 14 }}>
                <button onClick={() => { setOpen(on ? null : x.id); setPay(null); setCostF(null); }} style={{ background: "#16304f", color: "#fff", border: 0, fontWeight: 700 }}>{on ? "✕ Закрыть" : "⚙ Настройки"}</button></div>
            </div>
            {on && <div className="small" style={{ padding: "8px 14px 14px", background: "var(--bg)", display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                {/* доходы */}
                <div className="card" style={{ margin: 0 }}>
                  <div className="row"><b><Ic n="in" c="#16a34a" />Доходы по проекту</b><b className="ok">{rub(paid)}</b></div>
                  {pays.map((m) => <div key={m.id} className="row" style={{ borderBottom: "1px dashed var(--border, #ddd)", padding: "3px 0" }}>
                    <span>{dmy(m.date)}<span className="muted"> · {m.account || ""}{m.note ? " · " + m.note : ""}</span></span><span><b className="ok">+{rub(m.amount)}</b> <button className="ghost" style={{ padding: "0 6px" }} onClick={() => del(m.id)}>✕</button></span></div>)}
                  {!pays.length && <div className="muted">Оплат пока нет</div>}
                  {pay?.id === x.id
                    ? <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                        <input type="number" placeholder="Сумма" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                        <input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} />
                        <select value={pay.account} onChange={(e) => setPay({ ...pay, account: e.target.value })}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
                        <span><button disabled={!Number(pay.amount)} onClick={() => { add({ kind: "move", type: "in", amount: Number(pay.amount), date: pay.date, note: "", projectId: x.id, account: pay.account }); setPay(null); }}>✓ Внести</button> <button className="ghost" onClick={() => setPay(null)}>Отмена</button></span></div>
                    : <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {x.monthly && mi < x.price && (() => { const dd = `${cm}-${String(Math.min(x.payDay || 1, new Date(Number(cm.slice(0, 4)), Number(cm.slice(5)), 0).getDate())).padStart(2, "0")}`;
                        return <button style={{ background: "#16a34a", color: "#fff", border: 0, fontWeight: 700 }} onClick={() => add({ kind: "move", type: "in", amount: x.price - mi, date: dd, note: "", projectId: x.id, account: ACCOUNTS[0] })}>✓ {dmy(dd).slice(0, 5)} оплатили {rub(x.price - mi)}</button>; })()}
                      {x.monthly && mi >= x.price && <span className="ok">✓ {MONTHS[Number(cm.slice(5)) - 1].toLowerCase()} оплачен</span>}
                      <button className="ghost" onClick={() => { setCostF(null); setPay({ id: x.id, amount: String(x.monthly ? (d ? Math.min(d, x.price) : x.price) : d || x.price), date: today(), account: ACCOUNTS[0] }); }}>+ Внести оплату</button></span>}
                </div>
                {/* расходы */}
                <div className="card" style={{ margin: 0 }}>
                  <div className="row"><b><Ic n="out" />Расходы по проекту</b><b className="neg">{rub(cost)}</b></div>
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
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--border, #e5e5e5)", paddingTop: 6 }}>
                    {(() => { const K = today().slice(0, 7), sts = staff.filter((e) => !e.off && e.payType !== "fixed" && (e.projectIds || []).includes(x.id));
                      if (!sts.length) return null;
                      return <div style={{ marginBottom: 8 }}><b><Ic n="users" />Зарплата · {MONTHS[Number(K.slice(5)) - 1].toLowerCase()}</b>
                        {sts.map((e) => { const pend = salPending(e, K).find((l) => l.projectId === x.id);
                          return <div key={e.id} className="row" style={{ padding: "3px 0" }}><span>{e.name} <span className="muted">· {e.payType === "percent" ? e.amount + "%" : "фикса"}</span></span>
                            {pend ? <span><b className="neg">{rub(pend.amount)}</b> <button style={{ padding: "2px 10px" }} onClick={() => postSal(e, K, x.id)}>Провести</button></span>
                              : <span className="ok small">✓ проведено</span>}</div>; })}</div>; })()}
                    <Regulars {...{ mk: today().slice(0, 7), regulars: regulars.filter((y) => y.projectId === x.id), moves, projects, pname: () => "", add, del, upd, nActive: 0, projectId: x.id }} />
                  </div>
                </div>
              </div>
              {/* общие настройки */}
              <details style={{ margin: 0 }}>
                <summary className="ghost" style={{ cursor: "pointer", display: "inline-block", padding: "4px 12px", border: "1px solid var(--border, #ddd)", borderRadius: 8 }}>⚙ Общие настройки</summary>
                <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                  <L l="Название"><input key={x.id + "n" + x.name} defaultValue={x.name} style={{ flex: 1 }} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== x.name && upd(x.id, { name: e.target.value.trim() })} /></L>
                  <L l="Клиент"><select value={x.clientId} onChange={(e) => upd(x.id, { clientId: e.target.value })} style={{ flex: 1 }}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
                  <div><span className="muted">Продукты</span><ProdChips ids={pids(x)} onChange={(v) => upd(x.id, { productIds: v, productId: "", price: sumOf(v) })} /></div>
                  <L l={x.monthly ? "Сумма в месяц" : "Сумма"}><input type="number" key={x.id + "p" + x.price} defaultValue={x.price} style={{ flex: 1 }} onBlur={(e) => Number(e.target.value) !== x.price && upd(x.id, { price: Number(e.target.value) || 0 })} /></L>
                  <L l="Периодичность"><select value={x.monthly ? "m" : "o"} onChange={(e) => upd(x.id, { monthly: e.target.value === "m" })} style={{ flex: 1 }}><option value="m">каждый месяц</option><option value="o">разово</option></select></L>
                  {x.monthly
                    ? <L l="Дата оплаты (число)"><input type="number" min={1} max={31} key={x.id + "d" + (x.payDay || "")} defaultValue={x.payDay || 1} style={{ flex: 1 }} onBlur={(e) => upd(x.id, { payDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} /></L>
                    : <L l="Оплата до"><input type="date" value={x.payDate || ""} onChange={(e) => upd(x.id, { payDate: e.target.value })} style={{ flex: 1 }} /></L>}
                  <L l="Начало"><input type="date" value={x.start} onChange={(e) => e.target.value && upd(x.id, { start: e.target.value })} style={{ flex: 1 }} /></L>
                </div>
                <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 10 }}><span />
                  <span><button className="ghost" onClick={() => finish(x)}>Завершить работу</button> <button className="ghost" onClick={() => del(x.id)}>Удалить проект</button></span></div>
              </details>
            </div>}
          </div>; })}
        {!shownP.length && <div className="muted" style={{ padding: 6 }}>Проектов нет</div>}
      </div>
      </div>
    </>}

    {sub === "base" && <>
      {/* Добавить лида — отдельная форма */}
      <div className="card">
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}><b><Ic n="pie" />Свод по лидам · {leads.length}</b>
          <span><button data-tour="lead-add" onClick={() => { setAddOpen(!addOpen); setBulk(null); }}>{addOpen ? "✕ Закрыть" : "+ Добавить лида"}</button>
            <button className="ghost" title="Вставить списком из таблицы" style={{ marginLeft: 6, padding: "2px 8px", opacity: .6 }} onClick={() => { setBulk(bulk == null ? "" : null); setAddOpen(false); }}>{bulk == null ? "📋" : "✕"}</button></span></div>
        {/* Свод: статусы и источники — списком */}
        <div data-tour="lead-sum" className="lead-sum" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20, margin: "10px 0", alignItems: "stretch" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: 10, background: "#eef4fb", border: "1px solid #cfe0f5", borderRadius: 12 }}>
          {(() => { // круговая диаграмма по источникам — голубые оттенки
            const ds = srcList.map(([k, v], n) => ({ k, n: v.n, c: BLUES[n % BLUES.length] }));
            const tot = ds.reduce((a, d) => a + d.n, 0) || 1; let acc = 0;
            const gap = ds.length > 1 ? 1.5 : 0;
            const grad = ds.map((d) => { const f = acc / tot * 360; acc += d.n; const t = acc / tot * 360; return `${d.c} ${f}deg ${t - gap}deg, transparent ${t - gap}deg ${t}deg`; }).join(", ") || "#cfe0f5 0deg 360deg";
            return <div style={{ display: "grid", placeItems: "center", flexShrink: 0 }}>
              <div style={{ width: 104, height: 104, borderRadius: "50%", background: `conic-gradient(${grad})`, display: "grid", placeItems: "center" }}>
                <div style={{ width: 78, height: 78, borderRadius: "50%", background: "#eef4fb", display: "grid", placeItems: "center", textAlign: "center" }} className="small">
                  <div><b style={{ fontSize: 18 }}>{clients.length}</b><div className="muted">лидов</div></div></div></div></div>; })()}
            <div style={{ flex: 1, minWidth: 0 }}>
          <div className="small"><div className="muted" style={{ marginBottom: 4 }}><Ic n="source" s={15} />Откуда приходят</div>
            {srcList.map(([k, v], n) => <div key={k} className="row" onClick={() => setSrcF(srcF === k ? null : k)}
              style={{ padding: "3px 6px", cursor: "pointer", borderRadius: 6, background: srcF === k ? "var(--bg)" : undefined, fontWeight: srcF === k ? 700 : 400 }}>
              <span><span style={{ color: BLUES[n % BLUES.length], fontSize: 14 }}>●</span> {k}</span><span><b>{v.n}</b>{v.sum ? <span className="muted"> · оплатили {rub(v.sum)}</span> : null}</span></div>)}
            {!clients.length && <div className="muted">Пока нет лидов</div>}
          </div>
            </div>
          </div>
          <div style={{ padding: 10, background: "#eef4fb", border: "1px solid #cfe0f5", borderRadius: 12 }}>
          <div className="small"><div className="muted" style={{ marginBottom: 4 }}>По статусам</div>
            {[["all", "Всего лидов", "#16304f"] as [string, string, string], ...CST.map(([k, c]) => [k, k, c] as [string, string, string])].map(([k, l, c]) => {
              const n = k === "all" ? leads.length : leads.filter((x) => (x.status || "Ждёт обработку") === k).length;
              return <div key={k} className="row" onClick={() => setCst(cst === k ? "all" : k)} style={{ cursor: "pointer", padding: "3px 6px", borderRadius: 6, background: cst === k ? "var(--bg)" : undefined, fontWeight: k === "all" || cst === k ? 700 : 400 }}>
                <span><span style={{ color: c, fontSize: 14 }}>●</span> {l}</span><span><b>{n}</b>{k !== "all" && leads.length ? <span className="muted"> · {Math.round(n / leads.length * 100)}%</span> : null}</span></div>; })}
          </div>
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
          <textarea rows={6} style={{ width: "100%" }} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"Артур\t@ArturBilimbaev\nИнсаф и Лия\t\tпо Максу предложить"} />
          {(() => { const have = new Set(clients.map((x) => x.name.trim().toLowerCase()));
            const rows = bulk.split(/\r?\n/).map((l) => l.split("\t").map((x) => x.trim())).filter((x) => x[0] && !/^имя$/i.test(x[0]));
            const fresh = rows.filter((x, i) => !have.has(x[0].toLowerCase()) && rows.findIndex((y) => y[0].toLowerCase() === x[0].toLowerCase()) === i);
            return <button disabled={!fresh.length} onClick={() => { fresh.forEach((x) => add({ kind: "client", status: "Ждёт обработку", name: x[0], company: "", phone: x[1] || "", note: [x[2], x[3]].filter(Boolean).join(" · "), source: c.source.trim(), created: today() })); setBulk(null); }}>
              ✓ Добавить {fresh.length} клиент.{rows.length - fresh.length ? ` (повторов пропущено: ${rows.length - fresh.length})` : ""}</button>; })()}
        </div>}
      </div>
      {/* База лидов: имя слева, статус справа; нажал — карточка с правкой и комментариями */}
      <div data-tour="lead-list" className="card" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
        <div className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--border, #e5e5e5)" }}><b>📋 База лидов{cst !== "all" ? ` · ${cst}` : ""}{srcF ? ` · ${srcF}` : ""} · {shownC.length}</b>
          <span>{(cst !== "all" || srcF) && <button className="ghost small" onClick={() => { setCst("all"); setSrcF(null); }}>показать всех</button>}
            <label className="small" style={{ marginLeft: 8, cursor: "pointer" }}><input type="checkbox" checked={shownC.length > 0 && shownC.every((x) => sel.includes(x.id))}
              onChange={(e) => setSel(e.target.checked ? shownC.map((x) => x.id) : [])} /> выбрать всех</label></span></div>
        {sel.length > 0 && <div className="small" style={{ padding: "8px 14px", background: "var(--bg)", borderBottom: "1px solid var(--border, #e5e5e5)", display: "grid", gap: 6 }}>
          <div className="row"><b>Выбрано: {sel.length}</b><span><button className="ghost" onClick={() => setSel([])}>✕ Снять</button>
            <button className="ghost" style={{ color: "#b02a2a" }} onClick={() => { if (confirm(`Удалить ${sel.length} лид(ов)?`)) { sel.forEach((id) => del0(id)); setSel([]); } }}>🗑 Удалить</button></span></div>
          <div className="row" style={{ justifyContent: "flex-start", gap: 4, flexWrap: "wrap" }}><span className="muted">Откуда пришёл:</span>
            <input list="crm-src" placeholder="Telegram, Instagram…" value={bulkSrc} onChange={(e) => setBulkSrc(e.target.value)} style={{ width: 180 }} />
            <datalist id="crm-src">{SOURCES.map((x) => <option key={x} value={x} />)}</datalist>
            <button disabled={!bulkSrc.trim()} onClick={() => { sel.forEach((id) => upd(id, { source: bulkSrc.trim() })); setSel([]); setBulkSrc(""); }}>✓ Применить</button></div>
          <div className="row" style={{ justifyContent: "flex-start", gap: 4, flexWrap: "wrap" }}><span className="muted">Перенести в статус:</span>
            {CST.map(([k, c]) => <button key={k} onClick={() => { sel.forEach((id) => upd(id, { status: k })); setSel([]); }}
              style={{ background: "transparent", color: c, border: `1.5px solid ${c}`, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>{k}</button>)}</div>
        </div>}
        {shownC.map((x) => { const ps = projects.filter((p) => p.clientId === x.id), d = ps.reduce((a, p) => a + debt(p), 0), on = open === x.id;
          return <div key={x.id} style={{ borderBottom: "1px solid var(--border, #e5e5e5)" }}>
            <div className="row" style={{ padding: "10px 14px", gap: 8 }}>
              <input type="checkbox" checked={sel.includes(x.id)} onChange={(e) => setSel(e.target.checked ? [...sel, x.id] : sel.filter((i) => i !== x.id))} style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}><b>{x.name}</b>{x.company && <span className="muted"> · {x.company}</span>}{" "}
                <button onClick={() => setPick(pick === x.id ? null : x.id)} title="Сменить статус"
                  style={{ background: cstColor(x.status || "Ждёт обработку"), color: "#fff", border: 0, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700, marginLeft: 4 }}>{x.status || "Ждёт обработку"} ▾</button>
                <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[x.phone, x.source, ps.length ? `${ps.length} проект.` : "", d > 0 ? `долг ${rub(d)}` : ""].filter(Boolean).join(" · ") || "—"}</div></div>
              <button onClick={() => setOpen(on ? null : x.id)} style={{ background: "#16304f", color: "#fff", border: 0, fontWeight: 700, flexShrink: 0 }}>{on ? "✕ Закрыть" : "⚙ Настройки"}</button>
            </div>
            {pick === x.id && <StatusBtns cur={x.status || "Ждёт обработку"} onPick={(k) => { upd(x.id, { status: k }); setPick(null); }}
              onStart={() => { add({ kind: "project", name: x.company || x.name, clientId: x.id, price: 0, status: "work", start: today(), monthly: true, payDay: Number(today().slice(8)) }); setPick(null); setSub("projects"); }} />}
            {on && <div className="small" style={{ padding: "4px 14px 14px", display: "grid", gap: 6, background: "var(--bg)" }}>
              {([["name", "Имя"], ["company", "Компания"], ["phone", "Телефон / Telegram"], ["source", "Откуда пришёл"]] as const).map(([k, l]) =>
                <label key={k} className="row" style={{ gap: 6 }}><span className="muted" style={{ minWidth: 130 }}>{l}</span>
                  <input key={x.id + k + (x[k] || "")} defaultValue={x[k] || ""} list={k === "source" ? "crm-src" : undefined} style={{ flex: 1 }}
                    onBlur={(e) => e.target.value.trim() !== (x[k] || "") && (k !== "name" || e.target.value.trim()) && upd(x.id, { [k]: e.target.value.trim() })} /></label>)}
              <label><span className="muted">📝 Заметка</span>
                <textarea rows={3} style={{ width: "100%" }} key={x.id + "n" + (x.note || "")} defaultValue={x.note || ""} placeholder="Главное о лиде"
                  onBlur={(e) => e.target.value !== (x.note || "") && upd(x.id, { note: e.target.value })} /></label>
              <div><span className="muted"><Ic n="chat" s={15} />Комментарии</span>
                {(x.comments || []).map((cm, k) => <div key={k} className="row" style={{ gap: 6, padding: "3px 0", borderBottom: "1px dashed var(--border, #ddd)" }}>
                  <span><span className="muted">{dmy(cm.at.slice(0, 10))}</span> {cm.text}</span>
                  <button className="ghost" style={{ padding: "0 6px" }} onClick={() => upd(x.id, { comments: (x.comments || []).filter((_, n) => n !== k) })}>✕</button></div>)}
                <form className="row" style={{ gap: 6, marginTop: 4 }} onSubmit={(e) => { e.preventDefault(); const t = (cmt[x.id] || "").trim(); if (!t) return;
                  upd(x.id, { comments: [...(x.comments || []), { at: new Date().toISOString(), text: t }] }); setCmt({ ...cmt, [x.id]: "" }); }}>
                  <input placeholder="Написать комментарий: созвонились, отправил КП…" value={cmt[x.id] || ""} onChange={(e) => setCmt({ ...cmt, [x.id]: e.target.value })} style={{ flex: 1 }} />
                  <button disabled={!(cmt[x.id] || "").trim()}>➤</button></form></div>
              {ps.length > 0 && <div><span className="muted"><Ic n="case" s={15} />История проектов</span>
                {ps.map((p) => { const pin = moves.filter((m) => m.projectId === p.id && m.type === "in").sort((a, b) => a.date.localeCompare(b.date)), pc = moves.filter((m) => m.projectId === p.id && m.type === "out").reduce((a, m) => a + m.amount, 0);
                  const tot = pin.reduce((a, m) => a + m.amount, 0), mg = tot ? Math.round((tot - pc) / tot * 100) : null;
                  return <details key={p.id} style={{ marginTop: 4, padding: "6px 10px", border: "1px solid var(--border, #e5e5e5)", borderRadius: 10, background: "var(--surface, #fff)" }}>
                    <summary style={{ cursor: "pointer" }}><b>{p.name}</b> <span className="muted">· {dmy(p.start)} — {p.status === "done" ? dmy(p.end) || "завершён" : "в работе"} · {p.monthly ? `${rub(p.price)} в мес.` : rub(p.price)}</span>
                      <div style={{ display: "inline-flex", gap: 8, marginLeft: 6 }}><span>оплатили <b className="ok">{rub(tot)}</b></span><span>расходы <b className="neg">{rub(pc)}</b></span><span>маржа <b>{mg != null ? mg + "%" : "—"}</b></span></div></summary>
                    {pin.map((m) => <div key={m.id} className="row"><span>{dmy(m.date)}{m.note ? " · " + m.note : ""}</span><b className="ok">+{rub(m.amount)}</b></div>)}
                    {!pin.length && <div className="muted">Оплат не было</div>}
                  </details>; })}</div>}
              <div className="row" style={{ flexWrap: "wrap", gap: 6 }}><span className="muted">{x.created ? `в базе с ${dmy(x.created)}` : ""}</span>
                <span><button onClick={() => toProject(x)} style={{ background: "#16304f", color: "#fff", border: 0, fontWeight: 700 }}>→ В проект</button> <button className="ghost" onClick={() => del(x.id)}>🗑 Удалить</button></span></div>
            </div>}
          </div>; })}
        {!shownC.length && <div className="muted" style={{ padding: 14 }}>Лидов нет</div>}
      </div>
    </>}
  </>;
}

function ProductsTab({ del0, products, projects, add, del, upd }: {
  del0: (id: string) => void; products: CProduct[]; projects: CProject[]; add: (d: object) => void; del: (id: string) => void; upd: (id: string, d: object) => void;
}) {
  const [f, setF] = useState({ name: "", price: "", descr: "" });
  const [sel, setSel] = useState<string[]>([]), [np, setNp] = useState("");
  return <div className="card">
    <div className="row"><h3 style={{ margin: 0 }}><Ic n="box" />Мои продукты и услуги</h3>
      <BulkPaste cols="Название · Цена · Что входит" onRows={(rows) => rows.forEach(([n, pr, d]) => add({ kind: "product", name: n, price: Number(String(pr || "").replace(/[^\d.,]/g, "").replace(",", ".")) || 0, descr: d || "" }))} /></div>
    <form data-tour="prod-add" className="row small" style={{ flexWrap: "wrap", gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (!f.name.trim()) return;
      add({ kind: "product", name: f.name.trim(), price: Number(f.price) || 0, descr: f.descr.trim() }); setF({ name: "", price: "", descr: "" }); }}>
      <input placeholder="Название (например: Дизайн логотипа)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ flex: "1 1 180px" }} />
      <input type="number" placeholder="Цена" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} style={{ width: 110 }} />
      <input placeholder="Что входит" value={f.descr} onChange={(e) => setF({ ...f, descr: e.target.value })} style={{ flex: "1 1 180px" }} />
      <button disabled={!f.name.trim()}>+ Продукт</button>
    </form>
    <div data-tour="prod-select" className="row small" style={{ marginTop: 8, flexWrap: "wrap", gap: 6 }}>
      <label style={{ cursor: "pointer" }}><input type="checkbox" checked={products.length > 0 && products.every((x) => sel.includes(x.id))} onChange={(e) => setSel(e.target.checked ? products.map((x) => x.id) : [])} /> выбрать все</label>
      {sel.length > 0 && <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}><b>Выбрано: {sel.length}</b>
        <input type="number" placeholder="Новая цена" value={np} onChange={(e) => setNp(e.target.value)} style={{ width: 110 }} />
        <button disabled={np === ""} onClick={() => { sel.forEach((id) => upd(id, { price: Number(np) || 0 })); setSel([]); setNp(""); }}>✓ Поставить цену</button>
        <button className="ghost" style={{ color: "#b02a2a" }} onClick={() => { if (confirm(`Удалить ${sel.length} продукт(ов)?`)) { sel.forEach((id) => del0(id)); setSel([]); } }}>🗑 Удалить</button>
        <button className="ghost" onClick={() => setSel([])}>✕</button></span>}
    </div>
    <table data-tour="prod-list" className="pnl-table crm-t" style={{ marginTop: 8 }}><tbody>
      {products.map((x) => { const used = projects.filter((p) => pids(p).includes(x.id));
        return <tr key={x.id}><td style={{ width: 24 }}><input type="checkbox" checked={sel.includes(x.id)} onChange={(e) => setSel(e.target.checked ? [...sel, x.id] : sel.filter((i) => i !== x.id))} /></td><td>{x.name}{x.descr && <div className="small muted">{x.descr}</div>}<div className="small muted">продано: {used.length} · на {rub(used.reduce((a, p) => a + p.price, 0))}</div></td>
          <td><input type="number" style={{ width: 110 }} key={x.id + x.price} defaultValue={x.price} onBlur={(e) => Number(e.target.value) !== x.price && upd(x.id, { price: Number(e.target.value) || 0 })} /></td>
          <td><button className="ghost" onClick={() => del(x.id)}>🗑</button></td></tr>; })}
      {!products.length && <tr><td className="muted">Продуктов пока нет</td></tr>}
    </tbody></table>
  </div>;
}

// Ежемесячные расходы (сервисы, аренда, подписки): шаблон → каждый месяц «провести» в один клик
function Regulars({ mk, regulars, moves, projects, pname, add, del, upd, nActive, projectId, extra, flat }: {
  mk: string; regulars: CRegular[]; moves: CMove[]; projects: CProject[]; pname: (id?: string) => string;
  add: (d: object) => void; del: (id: string) => void; upd: (id: string, d: object) => void; nActive: number; projectId?: string; extra?: React.ReactNode; flat?: boolean;
}) {
  const [f, setF] = useState<{ name: string; amount: string; day: string; category: string; account: string; projectId: string } | null>(null);
  const lastDay = new Date(Number(mk.slice(0, 4)), Number(mk.slice(5)), 0).getDate();
  const doneIn = (r: CRegular) => moves.find((m) => m.regularId === r.id && mkOf(m.date) === mk);
  const run = (r: CRegular) => add({ kind: "move", type: "out", amount: r.amount, date: `${mk}-${String(Math.min(r.day, lastDay)).padStart(2, "0")}`, note: r.name,
    category: r.category || "Сервисы", account: r.account || ACCOUNTS[0], regularId: r.id, ...(r.projectId ? { projectId: r.projectId } : {}) });
  const inProject = !!projectId;
  const act = regulars.filter((r) => !r.off), todo = act.filter((r) => !doneIn(r));
  const sharedM = moves.filter((m) => m.type === "out" && !m.projectId && mkOf(m.date) === mk).reduce((a, m) => a + m.amount, 0);
  return <div className={inProject || flat ? "" : "card"} style={{ marginTop: inProject || flat ? 0 : 12 }}>
    <div className="row" style={{ flexWrap: "wrap", gap: 6 }}><b>{inProject ? <Ic n="repeat" /> : <Ic n="layers" />}{inProject ? `Каждый месяц · ${rub(regulars.filter((r) => !r.off).reduce((a, r) => a + r.amount, 0))}` : `Общие расходы · ${rub(sharedM)} за месяц`}</b>
      <span>{todo.length > 0 && <button style={{ marginRight: 6 }} onClick={() => todo.forEach(run)}>✓ Провести все за месяц ({todo.length})</button>}
        {inProject && <button className="ghost" onClick={() => setF(f ? null : { name: "", amount: "", day: "1", category: "Сервисы", account: ACCOUNTS[0], projectId: "" })}>{f ? "✕" : "+ Добавить"}</button>}</span></div>
    {!inProject && <div className="small" style={{ margin: "6px 0", padding: "6px 10px", background: "var(--bg)", borderRadius: 8 }}>
      Общие расходы: <b>{rub(sharedM)}</b> ÷ <b>{nActive}</b> проект. = <b>{nActive ? rub(sharedM / nActive) : "—"}</b> на проект
      </div>}
    {f && <div className="row small" style={{ flexWrap: "wrap", gap: 6, marginTop: 8 }}>
      <input placeholder="Название (Тильда, Figma, аренда…)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ flex: "1 1 180px" }} />
      <input type="number" placeholder="Сумма" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} style={{ width: 100 }} />
      <span className="muted">число</span><input type="number" min={1} max={31} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} style={{ width: 60 }} />
      <input list="crm-rcats" placeholder="Статья" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={{ width: 130 }} />
      <datalist id="crm-rcats">{["Сервисы", ...CATS].map((c) => <option key={c} value={c} />)}</datalist>
      <select value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}>{ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select>
      <button disabled={!f.name.trim() || !Number(f.amount)} onClick={() => { add({ kind: "regular", name: f.name.trim(), amount: Number(f.amount), day: Math.min(31, Math.max(1, Number(f.day) || 1)),
        category: f.category.trim() || "Сервисы", account: f.account, ...(projectId ? { projectId } : {}) }); setF(null); }}>✓ Сохранить</button>
    </div>}
    <table className="pnl-table crm-t" style={{ marginTop: 8 }}><tbody>
      {regulars.map((r) => { const m = doneIn(r);
        return <tr key={r.id} style={{ opacity: r.off ? .5 : 1 }}><td>{r.name}<div className="small muted">{r.day}-го · {r.category || "Сервисы"}{r.projectId ? " · " + pname(r.projectId) : ""}</div></td>
          <td className="neg">−{rub(r.amount)}</td>
          <td style={{ whiteSpace: "nowrap" }}>{r.off ? <span className="muted small">пауза</span> : m ? <span className="ok small">✓ проведён {dmy(m.date)}</span> : <><span className="small muted">черновик</span> <button onClick={() => run(r)}>Провести</button></>}
            {" "}<button className="ghost" title={r.off ? "Включить" : "Пауза"} onClick={() => upd(r.id, { off: !r.off })}>{r.off ? "▶" : "⏸"}</button>
            <button className="ghost" onClick={() => del(r.id)}>🗑</button></td></tr>; })}
      {!regulars.length && <tr><td className="muted">{inProject ? "ЗП исполнителю, сервисы проекта — то, что платится каждый месяц" : "Аренда, сервисы, подписки — то, что платится каждый месяц и делится на все проекты"}</td></tr>}
    </tbody></table>
    {extra}
  </div>;
}

// Зарплата сотрудника за месяц → строки расходов:
//  fixed — фикса, общий расход (делится на все проекты); fixedProj — фикса поровну на его проекты; percent — % от дохода каждого его проекта
function salaryLines(e: CEmployee, mk: string, incomeOf: (pid: string) => number): { amount: number; projectId?: string }[] {
  const ps = e.projectIds || [];
  if (e.payType === "fixed" || !ps.length) return e.amount ? [{ amount: e.amount }] : [];
  if (e.payType === "fixedProj") return ps.map((pid) => ({ amount: Math.round(e.amount / ps.length * 100) / 100, projectId: pid }));
  return ps.map((pid) => ({ amount: Math.round(incomeOf(pid) * e.amount) / 100, projectId: pid })).filter((l) => l.amount > 0);
}
const PAY: Record<PayType, string> = { fixed: "Фикса · общий расход", fixedProj: "Фикса · делится на его проекты", percent: "% от дохода его проектов" };

function StaffTab({ del0, MonthPick, mk, staff, projects, moves, cname, add, del, upd, postSal, salPending }: {
  MonthPick: JSX.Element; mk: string; staff: CEmployee[]; projects: CProject[]; moves: CMove[]; cname: (id: string) => string;
  add: (d: object) => void; del: (id: string) => void; upd: (id: string, d: object) => void;
  del0: (id: string) => void; postSal: (e: CEmployee, K: string, pid?: string) => void; salPending: (e: CEmployee, K: string) => { amount: number; projectId?: string }[];
}) {
  const blank = { name: "", contact: "", projectIds: [] as string[], payType: "fixed" as PayType, amount: "", day: "10" };
  const [f, setF] = useState(blank);
  const [addOpen, setAddOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const active = projects.filter((x) => x.status !== "done");
  const pn = (id: string) => { const x = projects.find((y) => y.id === id); return x ? x.name + " · " + cname(x.clientId) : "—"; };
  const incomeOf = (pid: string) => moves.filter((m) => m.type === "in" && m.projectId === pid && mkOf(m.date) === mk).reduce((a, m) => a + m.amount, 0);
  const lastDay = new Date(Number(mk.slice(0, 4)), Number(mk.slice(5)), 0).getDate();
  const paidIn = (e: CEmployee) => moves.filter((m) => m.employeeId === e.id && mkOf(m.date) === mk);
  const pay = (e: CEmployee) => postSal(e, mk);
  const [arch, setArch] = useState(false), [selS, setSelS] = useState<string[]>([]);
  const shownS = staff.filter((e) => !!e.off === arch);
  const total = staff.filter((e) => !e.off).reduce((a, e) => a + salaryLines(e, mk, incomeOf).reduce((x, l) => x + l.amount, 0), 0);
  const ProjPick = ({ ids, onChange }: { ids: string[]; onChange: (v: string[]) => void }) => <div className="row" style={{ justifyContent: "flex-start", gap: 4, flexWrap: "wrap" }}>
    {active.map((x) => { const on = ids.includes(x.id); return <button type="button" key={x.id} className={on ? "" : "ghost"} style={{ padding: "2px 10px" }}
      onClick={() => onChange(on ? ids.filter((i) => i !== x.id) : [...ids, x.id])}>{on ? "✓ " : ""}{x.name}</button>; })}
    {!active.length && <span className="muted">Проектов в работе нет</span>}</div>;
  return <>
    {MonthPick}
    <div className="card">
      <div className="row" style={{ flexWrap: "wrap", gap: 6 }}><b><Ic n="users" />Сотрудники · {staff.length}</b>
        <button data-tour="staff-add" onClick={() => setAddOpen(!addOpen)} style={{ background: "#16304f", color: "#fff", border: 0, fontWeight: 700 }}>{addOpen ? "✕ Закрыть" : "+ Добавить сотрудника"}</button>
        <BulkPaste cols="Имя · Контакт · Сумма в месяц (фикса, общий расход)" onRows={(rows) => rows.forEach(([n, c, a]) => add({ kind: "employee", name: n, contact: c || "", projectIds: [], payType: "fixed", amount: Number(String(a || "").replace(/[^\d.,]/g, "").replace(",", ".")) || 0, day: 10 }))} /></div>
      <div className="small" style={{ marginTop: 6 }}>Зарплаты за месяц: <b>{rub(total)}</b></div>
      {addOpen && <form className="card soft-card" style={{ marginTop: 10, display: "grid", gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (!f.name.trim()) return;
        add({ kind: "employee", name: f.name.trim(), contact: f.contact.trim(), projectIds: f.projectIds, payType: f.payType, amount: Number(f.amount) || 0, day: Math.min(31, Math.max(1, Number(f.day) || 10)) });
        setF(blank); setAddOpen(false); }}>
        <b>Новый сотрудник</b>
        <input placeholder="Имя *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        <input placeholder="Телефон / Telegram / Instagram" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} />
        <div className="small"><span className="muted">Проекты, с которыми работает</span><ProjPick ids={f.projectIds} onChange={(v) => setF({ ...f, projectIds: v })} /></div>
        <div className="small"><span className="muted">Способ оплаты</span>
          <div className="row" style={{ justifyContent: "flex-start", gap: 4, flexWrap: "wrap" }}>{(Object.keys(PAY) as PayType[]).map((k) =>
            <button type="button" key={k} className={f.payType === k ? "" : "ghost"} style={{ padding: "2px 10px" }} onClick={() => setF({ ...f, payType: k })}>{PAY[k]}</button>)}</div></div>
        <input type="number" placeholder={f.payType === "percent" ? "Процент, например 30" : "Сумма в месяц"} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <label className="row small" style={{ gap: 6 }}><span className="muted" style={{ minWidth: 110 }}>День выплаты</span><input type="number" min={1} max={31} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} style={{ flex: 1 }} /></label>
        <button disabled={!f.name.trim()}>✓ Добавить</button>
      </form>}
    </div>
    <div data-tour="staff-arch" className="row small" style={{ marginTop: 12, flexWrap: "wrap", gap: 6 }}>
      <span><button className={!arch ? "" : "ghost"} style={{ padding: "2px 10px" }} onClick={() => { setArch(false); setSelS([]); }}>Работают · {staff.filter((e) => !e.off).length}</button>
        <button className={arch ? "" : "ghost"} style={{ padding: "2px 10px", marginLeft: 4 }} onClick={() => { setArch(true); setSelS([]); }}>🗄 Архив · {staff.filter((e) => e.off).length}</button></span>
      <label style={{ cursor: "pointer" }}><input type="checkbox" checked={shownS.length > 0 && shownS.every((e) => selS.includes(e.id))} onChange={(ev) => setSelS(ev.target.checked ? shownS.map((e) => e.id) : [])} /> выбрать всех</label>
    </div>
    {selS.length > 0 && <div className="card small row" style={{ marginTop: 8, flexWrap: "wrap", gap: 6 }}><b>Выбрано: {selS.length}</b>
      <span><button className="ghost" onClick={() => setSelS([])}>✕ Снять</button>
        {arch ? <button onClick={() => { selS.forEach((id) => upd(id, { off: false })); setSelS([]); }}>▶ Вернуть в работу</button>
          : <button style={{ background: "#16304f", color: "#fff", border: 0 }} onClick={() => { selS.forEach((id) => upd(id, { off: true })); setSelS([]); }}>🗄 В архив (неактивен)</button>}
        <button className="ghost" style={{ color: "#b02a2a" }} onClick={() => { if (confirm(`Удалить ${selS.length}?`)) { selS.forEach((id) => del0(id)); setSelS([]); } }}>🗑</button></span></div>}
    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
      {shownS.map((e) => { const lines = salaryLines(e, mk, incomeOf), sum = lines.reduce((a, l) => a + l.amount, 0), done = paidIn(e), on = open === e.id;
        return <div key={e.id} style={{ border: "1px solid var(--border, #e5e5e5)", borderRadius: 12, overflow: "hidden", background: "var(--surface, #fff)", opacity: e.off ? .6 : 1 }}>
          <div className="row" style={{ padding: "10px 14px", gap: 10, flexWrap: "wrap" }}>
            <input type="checkbox" checked={selS.includes(e.id)} onChange={(ev) => setSelS(ev.target.checked ? [...selS, e.id] : selS.filter((i) => i !== e.id))} />
            <div style={{ flex: "1 1 240px", minWidth: 0 }}><b>{e.name}</b> {e.contact && <span className="muted small">· {e.contact}</span>}
              <div className="small muted">{PAY[e.payType]}{e.payType === "percent" ? ` · ${e.amount}%` : ` · ${rub(e.amount)}`} · {e.day || 10}-го{(e.projectIds || []).length ? ` · проекты: ${(e.projectIds || []).map(pn).join(", ")}` : ""}</div>
              <div className="small" style={{ marginTop: 6, display: "inline-flex", gap: 10, flexWrap: "wrap", background: "var(--bg)", border: "1px solid var(--border, #e5e5e5)", borderRadius: 999, padding: "4px 12px" }}>
                <span><span className="muted">к выплате</span> <b className="neg">{rub(sum)}</b></span>
                {lines.map((l, k) => <span key={k} className="muted">{l.projectId ? projects.find((x) => x.id === l.projectId)?.name : "общий"} {rub(l.amount)}</span>)}
                {done.length > 0 && <span className="ok">✓ выплачено {rub(done.reduce((a, m) => a + m.amount, 0))}</span>}</div></div>
            <span style={{ display: "flex", gap: 6 }}>
              {salPending(e, mk).length > 0 && <button style={{ background: "#16a34a", color: "#fff", border: 0, fontWeight: 700 }} onClick={() => pay(e)}>✓ Провести ЗП</button>}
              <button onClick={() => setOpen(on ? null : e.id)} style={{ background: "#16304f", color: "#fff", border: 0, fontWeight: 700 }}>{on ? "✕ Закрыть" : "⚙ Настройки"}</button></span>
          </div>
          {on && <div className="small" style={{ padding: "8px 14px 14px", background: "var(--bg)", display: "grid", gap: 6 }}>
            <label className="row" style={{ gap: 6 }}><span className="muted" style={{ minWidth: 120 }}>Имя</span><input key={e.id + "n" + e.name} defaultValue={e.name} style={{ flex: 1 }} onBlur={(ev) => ev.target.value.trim() && upd(e.id, { name: ev.target.value.trim() })} /></label>
            <label className="row" style={{ gap: 6 }}><span className="muted" style={{ minWidth: 120 }}>Контакт</span><input key={e.id + "c" + (e.contact || "")} defaultValue={e.contact || ""} style={{ flex: 1 }} onBlur={(ev) => upd(e.id, { contact: ev.target.value.trim() })} /></label>
            <div><span className="muted">Проекты</span><ProjPick ids={e.projectIds || []} onChange={(v) => upd(e.id, { projectIds: v })} /></div>
            <div><span className="muted">Способ оплаты</span><div className="row" style={{ justifyContent: "flex-start", gap: 4, flexWrap: "wrap" }}>{(Object.keys(PAY) as PayType[]).map((k) =>
              <button key={k} className={e.payType === k ? "" : "ghost"} style={{ padding: "2px 10px" }} onClick={() => upd(e.id, { payType: k })}>{PAY[k]}</button>)}</div></div>
            <label className="row" style={{ gap: 6 }}><span className="muted" style={{ minWidth: 120 }}>{e.payType === "percent" ? "Процент" : "Сумма в месяц"}</span><input type="number" key={e.id + "a" + e.amount} defaultValue={e.amount} style={{ flex: 1 }} onBlur={(ev) => upd(e.id, { amount: Number(ev.target.value) || 0 })} /></label>
            <label className="row" style={{ gap: 6 }}><span className="muted" style={{ minWidth: 120 }}>День выплаты</span><input type="number" min={1} max={31} key={e.id + "d" + (e.day || "")} defaultValue={e.day || 10} style={{ flex: 1 }} onBlur={(ev) => upd(e.id, { day: Math.min(31, Math.max(1, Number(ev.target.value) || 10)) })} /></label>
            {done.length > 0 && <div><span className="muted">Выплаты за месяц</span>{done.map((m) => <div key={m.id} className="row"><span>{dmy(m.date)} · {m.projectId ? projects.find((x) => x.id === m.projectId)?.name : "общий"}</span><span>{rub(m.amount)} <button className="ghost" style={{ padding: "0 6px" }} onClick={() => del(m.id)}>✕</button></span></div>)}</div>}
            <div className="row" style={{ flexWrap: "wrap", gap: 6 }}><span />
              <span><button className="ghost" onClick={() => upd(e.id, { off: !e.off })}>{e.off ? "▶ Вернуть в работу" : "🗄 В архив"}</button> <button className="ghost" onClick={() => del(e.id)}>🗑</button></span></div>
          </div>}
        </div>; })}
      {!shownS.length && staff.length > 0 && <div className="card muted">{arch ? "Архив пуст" : "Все сотрудники в архиве"}</div>}
      {!staff.length && <div className="card muted">Сотрудников пока нет — нажми «+ Добавить сотрудника»</div>}
    </div>
  </>;
}

// плавающая Нейла: иконка в правом нижнем углу, сообщение только по нажатию
const NEYLA_JOKES = ["Деньги любят счёт. А я люблю ваши цифры 💙", "Совет дня: сначала заплати себе — отложи в резерв 💰", "Каждый проведённый расход — минус одна бессонная ночь 😌", "Маржа — это не имя, но звучит красиво ✨"];
export function NeylaFab({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false), [taps, setTaps] = useState(0);
  const msg = taps >= 5 ? [NEYLA_JOKES[taps % NEYLA_JOKES.length]] : lines.slice(0, 3);
  return <div className="no-print" style={{ position: "fixed", right: 16, bottom: 84, zIndex: 50, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
    {open && <div className="card small" style={{ margin: 0, maxWidth: 280, boxShadow: "0 6px 20px rgba(22,48,79,.18)", borderRadius: 14 }} onClick={() => setOpen(false)}>
      <b>Нейла</b>{msg.map((l, k) => <p key={k} style={{ margin: "4px 0" }}>{l}</p>)}</div>}
    <img src="neyla.jpg" alt="Нейла" title="Нейла" onClick={() => { setOpen(!open); setTaps((t) => t + 1); }}
      style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", cursor: "pointer", boxShadow: "0 4px 14px rgba(22,48,79,.25)", border: "2px solid #fff" }} />
  </div>;
}

// шаги обучения: Нейла подсвечивает элемент (data-tour) и объясняет именно его
const TOUR: { view: CrmView; sel?: string; title: string; text: string }[] = [
  { view: "home", title: "Привет! Я Нейла 👋", text: "Покажу кабинет по шагам — я буду подсвечивать кнопки и объяснять, что они делают. Пока идёт обучение, нажимать ничего не нужно: просто листайте «Далее»." },
  { view: "products", sel: "prod-add", title: "Добавить продукт", text: "Впишите название услуги, цену и что входит — и нажмите «+ Продукт». Значок 📋 справа от заголовка — вставить сразу список из таблицы." },
  { view: "products", sel: "prod-list", title: "Изменить или удалить", text: "Цену меняете прямо в строке — она сохранится сама. 🗑 справа — удалить продукт." },
  { view: "products", sel: "prod-select", title: "Сразу несколько", text: "Отметьте продукты галочками (или «выбрать все») — появятся кнопки «Поставить цену» и «Удалить» для всех выбранных." },
  { view: "staff", sel: "staff-add", title: "Добавить сотрудника", text: "Имя, контакт, проекты, на которых он работает, и способ оплаты: фикса или % от проектов. Потом «✓ Провести ЗП» — и зарплата попадёт в расходы." },
  { view: "staff", sel: "staff-arch", title: "Архив", text: "Кто больше не работает — отметьте галочкой и нажмите «В архив». Вкладка «Архив» хранит всех бывших сотрудников." },
  { view: "clients", sel: "lead-sum", title: "Свод по лидам", text: "Сколько всего лидов, откуда они приходят и в каких статусах. Нажмите на источник или статус — список ниже отфильтруется." },
  { view: "clients", sel: "lead-add", title: "Добавить лида", text: "«+ Добавить лида» — новый человек сразу получит статус «Ждёт обработку». 📋 — добавить списком из таблицы." },
  { view: "clients", sel: "lead-list", title: "База лидов", text: "Цветная плашка рядом с именем — статус, нажмите и выберите новый. «▶ Начали работу» сразу создаёт проект. «⚙ Настройки» — заметки и комментарии." },
  { view: "clients", sel: "proj-chip", title: "Проекты", text: "Здесь ваши клиенты в работе: сумма в месяц, кнопка «✓ Оплатили», доходы и расходы по проекту, прибыль и маржа." },
  { view: "fin", sel: "fin-pf", title: "План / факт", text: "Сколько должно прийти и уйти в этом месяце — и сколько реально. Нажмите «Доходы» или «Расходы» — раскроется по каждому проекту." },
  { view: "fin", sel: "fin-struct", title: "Структура расходов", text: "Куда уходят деньги: каждая статья и её доля." },
  { view: "fin", sel: "fin-folds", title: "Общие расходы и операции", text: "Аренда и сервисы, то, что ждёт проведения (оранжевая строка), все операции месяца и остатки на счетах. Нажмите на строку — она раскроется." },
  { view: "home", sel: "home-tiles", title: "Главные цифры", text: "Выручка, расходы, чистая прибыль и рентабельность. Нажмите на любую плитку — увидите расчёт, откуда взялась цифра." },
  { view: "home", sel: "home-proj", title: "Проекты в работе", text: "Кто оплатил, чистая прибыль и маржа каждого проекта. Нажмите на цифру — покажу расчёт." },
  { view: "tips", sel: "tips-chips", title: "Вкладка «Нейла»", text: "Мои советы по вашим цифрам, помощь (обучение, установка на телефон, чат поддержки) и Google-таблица." },
  { view: "tips", title: "Установите кабинет на телефон 📱", text: "iPhone: Safari → «Поделиться» ⬆ → «На экран „Домой“». Android: Chrome → ⋮ → «Установить приложение». А если нужен совет — нажмите на меня справа внизу 💛" },
];
function TourCard({ n, go }: { n: number; go: (n: number | null) => void }) {
  const st = TOUR[n], last = n === TOUR.length - 1;
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    setRect(null); if (!st.sel) return;
    let tries = 0, scrolled = false;
    const t = setInterval(() => { const el = document.querySelector(`[data-tour="${st.sel}"]`) as HTMLElement | null; tries++;
      if (el) { if (!scrolled) { el.scrollIntoView({ block: "center", behavior: "smooth" }); scrolled = true; } setRect(el.getBoundingClientRect()); }
      if (tries > 40) clearInterval(t); }, 150);
    return () => clearInterval(t);
  }, [n]);
  const pad = 6, vh = window.innerHeight, w = Math.min(340, window.innerWidth - 32);
  const below = rect ? rect.bottom + 180 < vh : true;
  const top = rect ? (below ? rect.bottom + pad + 10 : Math.max(10, rect.top - pad - 10 - 200)) : vh / 2 - 120;
  const left = rect ? Math.min(Math.max(16, rect.left), window.innerWidth - w - 16) : (window.innerWidth - w) / 2;
  return <div className="no-print" style={{ position: "fixed", inset: 0, zIndex: 1000 }} onClick={(e) => e.stopPropagation()}>
    {/* затемнение и «окно» вокруг подсвеченного элемента; клики по кабинету заблокированы */}
    {rect ? <div style={{ position: "fixed", left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, borderRadius: 14,
      boxShadow: "0 0 0 9999px rgba(15,25,45,.6)", border: "2px solid #e8873a", transition: "all .25s", pointerEvents: "none" }} />
      : <div style={{ position: "fixed", inset: 0, background: "rgba(15,25,45,.6)" }} />}
    <div className="card" style={{ position: "fixed", top, left, width: w, margin: 0, boxShadow: "0 10px 30px rgba(0,0,0,.35)", borderRadius: 16, borderTop: "4px solid #e8873a", transition: "all .25s" }}>
      <div className="row" style={{ justifyContent: "flex-start", gap: 10, alignItems: "center" }}>
        <img src="neyla.jpg" alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
        <div><b>{st.title}</b><div className="small muted">шаг {n + 1} из {TOUR.length}</div></div></div>
      <div className="small" style={{ marginTop: 8, lineHeight: 1.45 }}>{st.text}</div>
      <div style={{ display: "flex", gap: 3, margin: "10px 0" }}>{TOUR.map((_, k) => <span key={k} style={{ flex: 1, height: 4, borderRadius: 2, background: k <= n ? "#e8873a" : "var(--border, #e5e5e5)" }} />)}</div>
      <div className="row" style={{ gap: 6 }}>
        <button className="ghost" onClick={() => go(null)}>Пропустить</button>
        <span>{n > 0 && <button className="ghost" onClick={() => go(n - 1)}>← Назад</button>}{" "}
          <button style={{ background: "#16304f", color: "#fff", border: 0, fontWeight: 700 }} onClick={() => go(last ? null : n + 1)}>{last ? "Готово ✓" : "Далее →"}</button></span></div>
    </div>
  </div>;
}

// как поставить кабинет на телефон
export function InstallHow() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return <div className="small" style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
    <div style={{ padding: 10, borderRadius: 10, border: `1px solid ${ios ? "#e8873a" : "var(--border, #e5e5e5)"}` }}><b>📱 iPhone</b>
      <ol style={{ margin: "4px 0 0", paddingLeft: 18 }}><li>Откройте кабинет в <b>Safari</b></li><li>Нажмите «Поделиться» ⬆ внизу экрана</li><li>Выберите <b>«На экран „Домой“»</b> → «Добавить»</li></ol></div>
    <div style={{ padding: 10, borderRadius: 10, border: `1px solid ${!ios ? "#e8873a" : "var(--border, #e5e5e5)"}` }}><b>🤖 Android</b>
      <ol style={{ margin: "4px 0 0", paddingLeft: 18 }}><li>Откройте кабинет в <b>Chrome</b></li><li>Нажмите ⋮ в правом верхнем углу</li><li>Выберите <b>«Установить приложение»</b> или «Добавить на главный экран»</li></ol></div>
  </div>;
}
