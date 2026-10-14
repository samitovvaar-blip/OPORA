import { Link } from "react-router-dom";
import { today, useCollection } from "../lib/store";
import { Client, Project, Task, clientStatuses } from "../lib/types";
import { TaskRow } from "./Planner";

export default function Home() {
  const tasks = useCollection<Task>("tasks");
  const clients = useCollection<Client>("clients").items;
  const projects = useCollection<Project>("projects").items;

  const open = tasks.items.filter((t) => !t.done);
  const todayList = open.filter((t) => t.date && t.date <= today());
  const date = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <h1>Привет, Арина 👋</h1>
      <div className="muted" style={{ marginTop: -12, marginBottom: 20 }}>{date}</div>
      <div className="bento">
        <Link to="/planner" className="card stat"><div className="muted">Задачи на сегодня</div><b>{todayList.length}</b></Link>
        <Link to="/clients" className="card stat"><div className="muted">Новые клиенты</div><b>{clients.filter((c) => c.status === "new").length}</b></Link>
        <Link to="/clients" className="card stat"><div className="muted">В работе</div><b>{clients.filter((c) => c.status === "work").length}</b></Link>
        <Link to="/projects" className="card stat"><div className="muted">Проекты</div><b>{projects.length}</b></Link>
        <div className="card wide2">
          <h3>Сегодня и просрочено</h3>
          {todayList.map((t) => <TaskRow key={t.id} t={t} update={tasks.update} remove={tasks.remove} />)}
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
