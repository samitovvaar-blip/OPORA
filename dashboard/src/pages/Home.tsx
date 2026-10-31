// Главная владельца: сверху вниз — от срочного к общему.
// ① Внимание ② Сегодня ③ Деньги ④ Цели ⑤ Воронка ⑥ Проекты
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { today, useCollection } from "../lib/store";
import { isRecurring, occursOn } from "../lib/recurring";
import { projectDeadlines, useAssignments, useClientProjects, useMarks } from "../lib/clients";
import { monthKey, stamp } from "../lib/catalog";
import { addMonths, expected, rub, useBilling, useBusinessProfit, usePaid } from "../lib/money";
import { visibleItems } from "../components/Checklist";
import Goals from "../components/Goals";
import { api as leadsApi, session as leadsSession } from "../modules/leads/api";

const fmt = (s: string) => `${Number(s.slice(8))}.${s.slice(5, 7)}`;

// Новые заявки — только на экране, в Firebase не сохраняем
function useNewLeads() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => { if (leadsSession()) leadsApi.listLeads().then((l) => setN(l.filter((x) => x.status === "new").length)).catch(() => setN(null)); }, []);
  return n;
}

export default function Home() {
  const { user } = useAuth();
  const d = today(); const mk = monthKey(new Date()); const nk = addMonths(mk, 1);
  const { list: projects } = useClientProjects();
  const { marks, setMark } = useMarks(projects.map((p) => p.id), mk);
  const assignments = useAssignments();
  const newLeads = useNewLeads();
  const { map: billing } = useBilling();
  const pk = addMonths(mk, -1); const paidPrev = usePaid(pk), paidNow = usePaid(mk), paidNext = usePaid(nk);
  const [moreToday, setMoreToday] = useState(false);
  const biz = useBusinessProfit()(mk);
  const saves = useCollection<{ amount: number; date: string }>("walletSave").items;
  const [savePct, setSavePct] = useState(50);
  const [funnel, setFunnel] = useState<any>({});
  useEffect(() => onSnapshot(doc(db, "users", user!.uid, "meta", "wallet"), (x) => typeof x.data()?.savePct === "number" && setSavePct(x.data()!.savePct)), [user?.uid]);
  useEffect(() => onSnapshot(doc(db, "users", user!.uid, "funnel", mk), (x) => setFunnel(x.data() || {})), [user?.uid, mk]);

  // Сегодня: задания + сроки по проектам одним списком
  const tasks = assignments.filter((a) => isRecurring(a) ? occursOn(a, d) && !(a.doneDates || []).includes(d) : a.status !== "done" && a.date && a.date <= d)
    .map((a) => ({ key: "a" + a.id, kind: "task" as const, a, title: a.title, date: isRecurring(a) ? d : a.date, time: a.time || "", rec: isRecurring(a) }));
  const dls = projectDeadlines(projects, marks, mk).filter((x) => !x.done && x.date <= d)
    .map((x) => ({ key: "d" + x.key, kind: "dl" as const, x, title: x.title, date: x.date, time: "", rec: false }));
  const todayList = [...tasks, ...dls].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const overdue = todayList.filter((t) => t.date < d).length;

  // Внимание: неоплаты (срок прошёл), просрочки, «ждём ответ»
  // «убрать оплату» (неактуальна) — отметка skip, оплата пропадает из списка
  const pend = (m: any) => !m?.paid && !m?.skip;
  const unpaid = [
    ...expected(pk, projects, billing).filter((x) => pend(paidPrev.marks[x.key])).map((x) => ({ ...x, src: paidPrev })),
    ...expected(mk, projects, billing).filter((x) => pend(paidNow.marks[x.key])).map((x) => ({ ...x, src: paidNow })),
    ...expected(nk, projects, billing).filter((x) => pend(paidNext.marks[x.key])).map((x) => ({ ...x, src: paidNext })),
  ].filter((x) => x.due < d);
  const waiting = projects.reduce((a, p) => a + Object.values(marks[p.id] || {}).filter((m) => m.comment && !m.done).length, 0);
  const waitPay = expected(mk, projects, billing).filter((x) => !paidNow.marks[x.key]?.paid).reduce((a, x) => a + x.price, 0);

  const saveFact = saves.filter((x) => x.date?.startsWith(mk)).reduce((a, x) => a + x.amount, 0);
  const savePlan = Math.round(biz.income * savePct / 100);
  const date = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <h1>Привет, Арина 👋</h1>
      <div className="muted" style={{ marginTop: -12, marginBottom: 16 }}>{date}</div>

      {(unpaid.length > 0 || overdue > 0 || waiting > 0) && (
        <div className="attention">
          {unpaid.length > 0 && <Link to="/pnl">⚠ Не оплатили: <b>{unpaid.length}</b> · {rub(unpaid.reduce((a, x) => a + x.price, 0))}</Link>}
          {overdue > 0 && <Link to="/tasks">⚠ Просрочено: <b>{overdue}</b></Link>}
          {waiting > 0 && <Link to="/projects">⏳ Ждём ответ: <b>{waiting}</b></Link>}
        </div>)}
      <div className="home-2col">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>💸 Кто не оплатил {unpaid.length > 0 && <span className="notif-count" style={{ background: "var(--lost)" }}>{unpaid.length}</span>}</h3>
          {unpaid.map((x) => {
            const p = projects.find((q) => q.id === x.pid);
            const late = Math.round((+new Date(d) - +new Date(x.due)) / 86400000);
            return <div key={x.key} className="row small"><span><b>{x.project}</b> · {x.service} · {rub(x.price)} <span className="error">· {late} дн.</span></span>
              <span style={{ display: "flex", gap: 6 }}>
                {p?.links?.chat && <a className="linkbtn" href={p.links.chat} target="_blank" rel="noopener noreferrer">💬</a>}
                {late > 30 && <button className="ghost" title="Оплата неактуальна — убрать из списка" onClick={() => confirm(`Убрать оплату «${x.project} · ${x.service}»? Она больше не будет висеть как неоплаченная.`) && x.src.set(x.key, { paid: false, amount: 0, date: "", skip: true })}>🗑 Убрать</button>}
              </span></div>;
          })}
          {!unpaid.length && <div className="muted small">Все оплатили ✅</div>}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>{overdue ? "⚠ Просрочено и на сегодня" : "📋 Сегодня"} <span className="muted small">{todayList.length}</span></h3>
          {todayList.slice(0, moreToday ? 999 : 5).map((t) => (
            <label key={t.key} className="row task" style={{ cursor: t.kind === "dl" ? "pointer" : undefined }}>
              <span style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                {t.kind === "dl"
                  ? <input type="checkbox" onChange={() => setMark(t.x.pid, t.x.itemId, { done: true, doneBy: user!.email || "", doneAt: stamp() })} />
                  : <Link to="/tasks" style={{ textDecoration: "none" }}>▦</Link>}
                <span>{t.kind === "dl" && <span className="tagc">{t.x.project}</span>} {t.rec ? "🔁 " : ""}{t.title}</span></span>
              <span className={`small ${t.date < d ? "error" : "muted"}`}>{t.date < d ? "⚠ " + fmt(t.date) : t.time}</span>
            </label>))}
          {todayList.length > 5 && <button className="ghost" onClick={() => setMoreToday(!moreToday)}>{moreToday ? "Свернуть" : `Посмотреть ещё (${todayList.length - 5})`}</button>}
          {!todayList.length && <div className="muted small">Свободный день ✨</div>}
        </div>

        <Goals />

        <div className="card">
          <div className="row"><h3 style={{ margin: 0 }}>💰 Деньги месяца</h3><Link className="small" to="/pnl">P&L →</Link></div>
          <div className="row" style={{ marginTop: 8 }}><span>Доход</span><b className="ok">{rub(biz.income)}</b></div>
          <div className="row"><span>Расходы</span><span>{rub(biz.expenses)}</span></div>
          <div className="row"><span>Чистая прибыль</span><b className={biz.profit < 0 ? "error" : "ok"}>{rub(biz.profit)}</b></div>
          <div className="row small"><span className="muted">Ждём оплату</span><span>{rub(waitPay)}</span></div>
          <div className="row small" style={{ marginTop: 6 }}><Link to="/wallet">🐷 Копилка</Link><span>{rub(saveFact)} <span className="muted">/ {rub(savePlan)}</span></span></div>
          <div className="progress" style={{ margin: "4px 0" }}><div style={{ width: (savePlan ? Math.min(100, saveFact / savePlan * 100) : 0) + "%" }} /></div>
        </div>


        <div className="card home-full">
          <div className="row"><h3 style={{ margin: 0 }}>◆ Проекты</h3><Link className="small" to="/projects">все →</Link></div>
          {projects.map((p) => {
            const items = visibleItems(p); const done = items.filter((it) => marks[p.id]?.[it.id]?.done).length;
            const w = items.filter((it) => marks[p.id]?.[it.id]?.comment && !marks[p.id]?.[it.id]?.done).length;
            return (
              <Link key={p.id} to={"/projects?p=" + p.id} className="row" style={{ color: "inherit", textDecoration: "none", gap: 10 }}>
                <span style={{ minWidth: 100 }}>{p.name}</span>
                <div className="progress" style={{ flex: 1, margin: 0 }}><div style={{ width: (items.length ? done / items.length * 100 : 0) + "%" }} /></div>
                <span className="small muted" style={{ minWidth: 60, textAlign: "right" }}>{done}/{items.length}{w ? ` 💬${w}` : ""}</span>
              </Link>);
          })}
          {!projects.length && <div className="muted small">Пока нет проектов</div>}
        </div>
      </div>
    </>
  );
}
