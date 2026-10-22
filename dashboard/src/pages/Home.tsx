import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";
import { today, useCollection } from "../lib/store";
import { Client, clientStatuses } from "../lib/types";
import { isRecurring, occursOn } from "../lib/recurring";
import { useClientProjects } from "../lib/clients";
import { useWorkspace } from "../lib/workspace";

// Задания из календаря на сегодня (разовые и регулярные)
function useTodayAssignments() {
  const { wsId } = useWorkspace();
  const [list, setList] = useState<any[]>([]);
  useEffect(() => wsId ? onSnapshot(collection(db, "workspaces", wsId, "assignments"),
    (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {}) : undefined, [wsId]);
  const d = today();
  return list.filter((a) => isRecurring(a) ? occursOn(a, d) && !(a.doneDates || []).includes(d)
    : a.status !== "done" && a.date && a.date <= d)
    .sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
}

export default function Home() {
  const clients = useCollection<Client>("clients").items;
  const projects = useClientProjects().list;

  const todayList = useTodayAssignments();
  const date = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <h1>Привет, Арина 👋</h1>
      <div className="muted" style={{ marginTop: -12, marginBottom: 20 }}>{date}</div>
      <div className="bento">
        <Link to="/tasks" className="card stat"><div className="muted">Задачи на сегодня</div><b>{todayList.length}</b></Link>
        <Link to="/clients" className="card stat"><div className="muted">Новые клиенты</div><b>{clients.filter((c) => c.status === "new").length}</b></Link>
        <Link to="/clients" className="card stat"><div className="muted">В работе</div><b>{clients.filter((c) => c.status === "work").length}</b></Link>
        <Link to="/projects" className="card stat"><div className="muted">Проекты</div><b>{projects.length}</b></Link>
        <div className="card wide2">
          <h3>Сегодня и просрочено</h3>
          {todayList.map((a) => (
            <Link key={a.id} to="/tasks" className="row task" style={{ color: "inherit", textDecoration: "none" }}>
              <span>{isRecurring(a) ? "🔁 " : ""}{a.title}</span>
              <span className={`small ${!isRecurring(a) && a.date < today() ? "error" : "muted"}`}>{a.time || (a.date < today() ? a.date : "")}</span>
            </Link>))}
          {!todayList.length && <div className="muted small">Свободный день ✨</div>}
        </div>
        <div className="card wide2">
          <h3>Клиенты по статусам</h3>
          {clientStatuses.map((s) => (
            <div key={s.id} className="row"><span>{s.label}</span><b>{clients.filter((c) => c.status === s.id).length}</b></div>
          ))}
        </div>
      </div>
    </>
  );
}
