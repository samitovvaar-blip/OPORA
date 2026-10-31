// Главная сотрудника: что сделать сегодня, сроки, прогресс чек-листов, новые уроки.
// Читает только то, что владелец открыл (shared / monthlyOpen / calendarOpen).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useWorkspace } from "../lib/workspace";
import { today } from "../lib/store";
import { isRecurring, occursOn } from "../lib/recurring";
import { projectDeadlines, useClientProjects, useMarks } from "../lib/clients";
import { monthKey, stamp } from "../lib/catalog";
import { visibleItems } from "../components/Checklist";
import { nextPayday, Pay } from "../lib/pay";

const fmt = (s: string) => `${Number(s.slice(8))}.${s.slice(5, 7)}`;

export default function StaffHome() {
  const { user } = useAuth();
  const { wsId, ws } = useWorkspace();
  const d = today(); const mk = monthKey(new Date());
  const [tasks, setTasks] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const { list: projects } = useClientProjects();
  const [pay, setPay] = useState<Pay | null>(null);
  useEffect(() => wsId && user?.email ? onSnapshot(doc(db, "workspaces", wsId, "staff", user.email.toLowerCase()),
    (s) => setPay((s.data() as Pay) || null), () => {}) : undefined, [wsId, user?.email]);
  const { marks, setMark } = useMarks(projects.map((p) => p.id), mk);

  useEffect(() => wsId ? onSnapshot(query(collection(db, "workspaces", wsId, "assignments"), where("shared", "==", true)),
    (s) => setTasks(s.docs.map((x) => ({ id: x.id, ...x.data() }))), () => {}) : undefined, [wsId]);
  // новые уроки — только из курсов, открытых сотруднику
  const courses = (pay?.courses || []).join();
  useEffect(() => {
    if (!wsId || !courses) { setLessons([]); return; }
    const parts: Record<string, any[]> = {};
    const subs = courses.split(",").map((c) => onSnapshot(query(collection(db, "workspaces", wsId, "kb"), where("course", "==", c)), (s) => {
      parts[c] = s.docs.map((x) => ({ id: x.id, ...x.data() }));
      setLessons(Object.values(parts).flat().sort((a: any, b: any) => (b.order || 0) - (a.order || 0)).slice(0, 3));
    }, () => {}));
    return () => subs.forEach((u) => u());
  }, [wsId, courses]);
  const [allDl, setAllDl] = useState(false);

  if (ws && !ws.open) return <><h1>Привет! 👋</h1><div className="card">🔒 Доступ сейчас закрыт.</div></>;

  const col = wsId ? collection(db, "workspaces", wsId, "assignments") : null;
  const todayTasks = tasks.filter((a) => isRecurring(a) ? occursOn(a, d) : a.status !== "done" && a.date && a.date <= d)
    .sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  const toggle = (a: any) => {
    if (!col) return;
    if (isRecurring(a)) {
      const set = new Set<string>(a.doneDates || []); set.has(d) ? set.delete(d) : set.add(d);
      updateDoc(doc(col, a.id), { doneDates: [...set].sort().slice(-90) });
    } else updateDoc(doc(col, a.id), { status: "done" });
  };
  const doneToday = (a: any) => isRecurring(a) && (a.doneDates || []).includes(d);
  const calProjects = projects.filter((p) => p.calendarOpen);
  const dl = projectDeadlines(calProjects, marks, mk).filter((x) => !x.done && x.date <= d).sort((a, b) => a.date.localeCompare(b.date));
  const soon = projectDeadlines(calProjects, marks, mk).filter((x) => !x.done && x.date > d).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const checklists = projects.filter((p) => (p.staffEmails || []).includes((auth.currentUser?.email || "").toLowerCase()));
  const left = todayTasks.filter((a) => !doneToday(a)).length + dl.length;
  const date = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <h1>Привет! 👋</h1>
      <div className="muted" style={{ marginTop: -12, marginBottom: 20 }}>{date}</div>
      <div className="bento">
        <div className="card wide">
          <h3>📋 Задания на сегодня</h3>
          {todayTasks.map((a) => (
            <label key={a.id} className={`row task ${doneToday(a) ? "done" : ""}`} style={{ cursor: "pointer" }}>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={doneToday(a)} onChange={() => toggle(a)} />
                {isRecurring(a) ? "🔁 " : ""}{a.title}</span>
              <span className={`small ${!isRecurring(a) && a.date < d ? "error" : "muted"}`}>{a.time || (a.date < d ? "⚠ " + fmt(a.date) : "")}</span>
            </label>))}
          {!todayTasks.length && <div className="muted small">На сегодня заданий нет ✨</div>}
          <div className="muted small" style={{ marginTop: 6 }}>Задания с чекпоинтами — в <Link to="/tasks">календаре</Link>.</div>
        </div>

        <div className="card wide">
          <h3>👥 Мои клиенты</h3>
          <div className="home-clients">{checklists.map((p) => {
            const items = visibleItems(p); const done = items.filter((it) => marks[p.id]?.[it.id]?.done).length;
            return <Link key={p.id} to={"/monthly?p=" + p.id} className="home-client">
              <b>{p.name}</b>
              <div className="progress" style={{ margin: "8px 0 4px" }}><div style={{ width: (items.length ? done / items.length * 100 : 0) + "%" }} /></div>
              <span className="small muted">чек-лист: {done} из {items.length} →</span>
            </Link>; })}</div>
          {!checklists.length && <div className="muted small">Пока нет открытых клиентов</div>}
        </div>

        <div className="card wide">
          <h3>◆ Сроки по проектам</h3>
          {(allDl ? dl : dl.slice(0, 5)).map((x) => (
            <label key={x.key} className="row task" style={{ cursor: "pointer" }}>
              <span style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input type="checkbox" onChange={() => setMark(x.pid, x.itemId, { done: true, doneBy: user!.email || "", doneAt: stamp() })} />
                <span><span className="tagc">{x.project}</span> {x.title}</span></span>
              <span className={`small ${x.date < d ? "error" : "muted"}`}>{x.date < d ? "⚠ " : ""}{fmt(x.date)}</span>
            </label>))}
          {dl.length > 5 && <button className="ghost" onClick={() => setAllDl(!allDl)}>{allDl ? "Свернуть" : `Посмотреть ещё (${dl.length - 5})`}</button>}
          {!dl.length && <div className="muted small">Ничего не горит ✅</div>}
          {!dl.length && soon.length > 0 && <>
            <div className="muted small" style={{ marginTop: 10 }}>Ближайшие:</div>
            {soon.map((x) => <div key={x.key} className="row small"><span><span className="tagc">{x.project}</span> {x.title}</span><span className="muted">{fmt(x.date)}</span></div>)}
          </>}
        </div>

        <div className="card wide2">
          <h3>🎓 Новое в базе знаний</h3>
          {lessons.map((l) => <Link key={l.id} to="/kb" className="row small" style={{ color: "inherit", textDecoration: "none" }}><span>▶ {l.title}</span><span className="muted">{l.section || ""}</span></Link>)}
          {!lessons.length && <div className="muted small">Уроки скоро появятся</div>}
        </div>

        <div className="card wide2">
          <h3>💸 Моя оплата</h3>
          <div>{pay?.system || <span className="muted small">Система оплаты пока не указана</span>}</div>
          {(() => { const nd = pay ? nextPayday(pay.paydays) : null;
            const days = nd ? Math.round((+nd - +new Date(new Date().toDateString())) / 86400000) : null;
            return nd ? <div style={{ marginTop: 6 }}>Следующая ЗП: <b>{nd.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</b> <span className="muted small">{days === 0 ? "сегодня 🎉" : `через ${days} дн.`}</span></div> : null; })()}
          {pay?.paydays?.length ? <div className="muted small" style={{ marginTop: 6 }}>Выплаты: {pay.paydays.map((x) => x + "-го").join(" и ")} числа каждого месяца</div> : null}
        </div>
      </div>
    </>
  );
}
