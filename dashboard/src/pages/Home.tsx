// Главная: всё нужное на сегодня на одном экране
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { today } from "../lib/store";
import { isRecurring, occursOn } from "../lib/recurring";
import { projectDeadlines, useAssignments, useClientProjects, useMarks } from "../lib/clients";
import { monthKey, stamp } from "../lib/catalog";
import { visibleItems } from "../components/Checklist";
import { useAuth } from "../lib/auth";
import { api as leadsApi, session as leadsSession } from "../modules/leads/api";

// Новые заявки — только показываем на экране, в Firebase не сохраняем
function useNewLeads() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    if (!leadsSession()) return;
    leadsApi.listLeads().then((l) => setN(l.filter((x) => x.status === "new").length)).catch(() => setN(null));
  }, []);
  return n;
}

export default function Home() {
  const { user } = useAuth();
  const d = today();
  const mk = monthKey(new Date());
  const { list: projects } = useClientProjects();
  const { marks, setMark } = useMarks(projects.map((p) => p.id), mk);
  const assignments = useAssignments();
  const newLeads = useNewLeads();

  const todayTasks = assignments.filter((a) => isRecurring(a) ? occursOn(a, d) && !(a.doneDates || []).includes(d)
    : a.status !== "done" && a.date && a.date <= d).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  const dl = projectDeadlines(projects, marks, mk).filter((x) => !x.done && x.date <= d).sort((a, b) => a.date.localeCompare(b.date));
  const soon = projectDeadlines(projects, marks, mk).filter((x) => !x.done && x.date > d).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const date = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  const fmt = (s: string) => `${Number(s.slice(8))}.${s.slice(5, 7)}`;

  return (
    <>
      <h1>Привет, Арина 👋</h1>
      <div className="muted" style={{ marginTop: -12, marginBottom: 20 }}>{date}</div>
      <div className="bento">
        <Link to="/tasks" className="card stat"><div className="muted">Задания на сегодня</div><b>{todayTasks.length}</b></Link>
        <Link to="/tasks" className="card stat"><div className="muted">Сроки по проектам</div><b className={dl.length ? "error" : ""}>{dl.length}</b><div className="muted small">на сегодня и просрочено</div></Link>
        <Link to="/leads" className="card stat"><div className="muted">Новые заявки с сайта</div><b>{newLeads ?? "—"}</b>{newLeads === null && <div className="muted small">войди в «Заявки»</div>}</Link>
        <Link to="/projects" className="card stat"><div className="muted">Проекты</div><b>{projects.length}</b></Link>

        <div className="card wide2">
          <h3>📋 Задания сегодня</h3>
          {todayTasks.map((a) => (
            <Link key={a.id} to="/tasks" className="row task" style={{ color: "inherit", textDecoration: "none" }}>
              <span>{isRecurring(a) ? "🔁 " : ""}{a.title}</span>
              <span className={`small ${!isRecurring(a) && a.date < d ? "error" : "muted"}`}>{a.time || (a.date < d ? fmt(a.date) : "")}</span>
            </Link>))}
          {!todayTasks.length && <div className="muted small">Свободный день ✨</div>}
        </div>

        <div className="card wide2">
          <h3>◆ Сроки по проектам</h3>
          {dl.map((x) => (
            <label key={x.key} className="row task" style={{ cursor: "pointer" }}>
              <span style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input type="checkbox" onChange={() => setMark(x.pid, x.itemId, { done: true, doneBy: user!.email || "", doneAt: stamp() })} />
                <span><span className="tagc">{x.project}</span> {x.title}</span></span>
              <span className={`small ${x.date < d ? "error" : "muted"}`}>{x.date < d ? "⚠ " : ""}{fmt(x.date)}</span>
            </label>))}
          {!dl.length && <div className="muted small">Ничего не горит ✅</div>}
          {soon.length > 0 && <>
            <div className="muted small" style={{ marginTop: 10 }}>Ближайшие:</div>
            {soon.map((x) => <div key={x.key} className="row small"><span><span className="tagc">{x.project}</span> {x.title}</span><span className="muted">{fmt(x.date)}</span></div>)}
          </>}
        </div>

        <div className="card wide">
          <h3>Проекты в этом месяце</h3>
          {projects.map((p) => {
            const items = visibleItems(p); const done = items.filter((it) => marks[p.id]?.[it.id]?.done).length;
            const waiting = items.filter((it) => marks[p.id]?.[it.id]?.comment && !marks[p.id]?.[it.id]?.done).length;
            return (
              <Link key={p.id} to={"/monthly?p=" + p.id} className="row" style={{ color: "inherit", textDecoration: "none", gap: 12 }}>
                <span style={{ minWidth: 120 }}>{p.name}</span>
                <div className="progress" style={{ flex: 1, margin: 0 }}><div style={{ width: (items.length ? done / items.length * 100 : 0) + "%" }} /></div>
                <span className="small muted" style={{ minWidth: 70, textAlign: "right" }}>{done}/{items.length}{waiting ? ` · 💬${waiting}` : ""}</span>
              </Link>);
          })}
          {!projects.length && <div className="muted small">Пока нет проектов</div>}
        </div>
      </div>
    </>
  );
}
