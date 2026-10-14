// Личный контур: проекты хранятся в Firestore users/{uid}/projects
import { FormEvent, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";

interface Project { id: string; name: string; progress: number; deadline?: string; }

export default function Projects() {
  const { user } = useAuth();
  const [items, setItems] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [err, setErr] = useState("");
  const col = collection(db, "users", user!.uid, "projects");

  useEffect(() => onSnapshot(query(col, orderBy("createdAt", "desc")),
    (s) => setItems(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, "id">) }))),
    (e) => setErr(e.message)), [user?.uid]);

  async function add(e: FormEvent) {
    e.preventDefault(); if (!name.trim()) return;
    await addDoc(col, { name: name.trim(), progress: 0, deadline, createdAt: serverTimestamp() });
    setName(""); setDeadline("");
  }

  return (
    <>
      <h1>Проекты</h1>
      {err && <div className="error">Firestore: {err}</div>}
      <form className="inline" onSubmit={add}>
        <input placeholder="Новый проект" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        <button>Добавить</button>
      </form>
      <div className="bento">
        {items.map((p) => (
          <div key={p.id} className="card">
            <div className="row"><b>{p.name}</b><button className="ghost" onClick={() => deleteDoc(doc(col, p.id))}>✕</button></div>
            {p.deadline && <div className="muted small">до {p.deadline}</div>}
            <input type="range" min={0} max={100} value={p.progress}
              onChange={(e) => updateDoc(doc(col, p.id), { progress: +e.target.value })} />
            <div className="muted small">{p.progress}%</div>
          </div>
        ))}
        {!items.length && <div className="muted">Пока нет проектов</div>}
      </div>
    </>
  );
}
