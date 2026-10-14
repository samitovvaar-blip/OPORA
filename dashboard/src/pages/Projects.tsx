import { FormEvent, useState } from "react";
import { useCollection } from "../lib/store";
import { Project } from "../lib/types";

export default function Projects() {
  const { items, error, add, update, remove } = useCollection<Project>("projects");
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault(); if (!name.trim()) return;
    await add({ name: name.trim(), progress: 0, deadline }); setName(""); setDeadline("");
  }

  return (
    <>
      <h1>Проекты</h1>
      {error && <div className="error">Firestore: {error}</div>}
      <form className="inline" onSubmit={submit}>
        <input placeholder="Новый проект" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        <button>Добавить</button>
      </form>
      <div className="bento">
        {items.map((p) => (
          <div key={p.id} className="card">
            <div className="row"><b>{p.name}</b><button className="ghost" onClick={() => remove(p.id)}>✕</button></div>
            {p.deadline && <div className="muted small">до {p.deadline}</div>}
            <input type="range" min={0} max={100} value={p.progress} onChange={(e) => update(p.id, { progress: +e.target.value })} />
            <div className="muted small">{p.progress}%</div>
          </div>
        ))}
        {!items.length && <div className="muted">Пока нет проектов</div>}
      </div>
    </>
  );
}
