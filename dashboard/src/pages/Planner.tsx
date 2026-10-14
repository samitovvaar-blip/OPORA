import { FormEvent, useState } from "react";
import { today, useCollection } from "../lib/store";
import { Task } from "../lib/types";

export function TaskRow({ t, update, remove }: { t: Task & { id: string }; update: (id: string, d: Partial<Task>) => void; remove: (id: string) => void }) {
  const overdue = !t.done && t.date && t.date < today();
  return (
    <div className="row task">
      <label className={t.done ? "done" : ""}>
        <input type="checkbox" checked={t.done} onChange={() => update(t.id, { done: !t.done })} /> {t.title}
      </label>
      <span className={`small ${overdue ? "error" : "muted"}`}>{t.date}
        <button className="ghost" onClick={() => remove(t.id)}>✕</button></span>
    </div>
  );
}

export default function Planner() {
  const { items, error, add, update, remove } = useCollection<Task>("tasks");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [showDone, setShowDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); if (!title.trim()) return;
    await add({ title: title.trim(), date, done: false }); setTitle("");
  }

  const open = items.filter((t) => !t.done).sort((a, b) => (a.date || "9").localeCompare(b.date || "9"));
  const groups = [
    { label: "Просрочено", list: open.filter((t) => t.date && t.date < today()) },
    { label: "Сегодня", list: open.filter((t) => t.date === today()) },
    { label: "Дальше", list: open.filter((t) => !t.date || t.date > today()) },
  ];
  const done = items.filter((t) => t.done);

  return (
    <>
      <h1>Планер</h1>
      {error && <div className="error">Firestore: {error}</div>}
      <form className="inline" onSubmit={submit}>
        <input placeholder="Что сделать?" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button>Добавить</button>
      </form>
      <div className="bento">
        {groups.map((g) => (
          <div key={g.label} className="card">
            <h3>{g.label} <span className="muted">{g.list.length}</span></h3>
            {g.list.map((t) => <TaskRow key={t.id} t={t} update={update} remove={remove} />)}
            {!g.list.length && <div className="muted small">Пусто</div>}
          </div>
        ))}
        <div className="card wide">
          <button className="ghost" onClick={() => setShowDone(!showDone)}>{showDone ? "▾" : "▸"} Выполнено ({done.length})</button>
          {showDone && done.map((t) => <TaskRow key={t.id} t={t} update={update} remove={remove} />)}
        </div>
      </div>
    </>
  );
}
