// Админка: ученики — доступ к курсам и домашние задания (ссылка на таблицу + срок)
import { FormEvent, useEffect, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useWorkspace } from "../lib/workspace";
import { COURSES } from "../pages/Knowledge";
import type { Student } from "../pages/StudentHome";
import { normUrl } from "./ProjectLinks";

export default function StudentsCard() {
  const { wsId, ws } = useWorkspace();
  const [list, setList] = useState<Record<string, Student>>({});
  const [email, setEmail] = useState("");
  const [hwFor, setHwFor] = useState<string | null>(null);
  useEffect(() => wsId ? onSnapshot(collection(db, "workspaces", wsId, "students"), (s) => setList(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Student]))), () => {}) : undefined, [wsId]);
  if (!wsId) return null;
  const courses = ws?.courses ?? COURSES;
  const sref = (m: string) => doc(db, "workspaces", wsId, "students", m);
  async function add(e: FormEvent) {
    e.preventDefault(); const v = email.trim().toLowerCase(); if (!v) return;
    await setDoc(doc(db, "studentIndex", v), { ws: wsId });
    await setDoc(sref(v), { courses: [], homework: [] }, { merge: true }); setEmail("");
  }
  const remove = async (m: string) => { if (!confirm(`Убрать ученика ${m}?`)) return; await deleteDoc(doc(db, "studentIndex", m)); await deleteDoc(sref(m)); };

  return <div className="card" style={{ marginTop: 14 }}>
    <h3 style={{ marginTop: 0 }}>🎓 Ученики</h3>
    {Object.entries(list).map(([m, s]) => {
      const done = s.hwDone || {}, hw = s.homework || [];
      return <div key={m} className="adm-client">
        <div className="row" style={{ padding: 0 }}><b>{m}</b><button className="ghost small" onClick={() => remove(m)}>✕</button></div>
        <div className="adm-line">{courses.map((c) => { const on = (s.courses || []).includes(c.id);
          return <button key={c.id} className={on ? "" : "ghost"} style={{ padding: "4px 10px" }}
            onClick={() => setDoc(sref(m), { courses: on ? (s.courses || []).filter((x) => x !== c.id) : [...(s.courses || []), c.id] }, { merge: true })}>{on ? "🔓 " : "🔒 "}{c.name}</button>; })}</div>
        <div className="small muted">📝 Домашки: сдано {hw.filter((h) => done[h.id]).length} из {hw.length}</div>
        {hw.map((h) => <div key={h.id} className="row small" style={{ padding: "2px 0" }}>
          <span>{done[h.id] ? "✅" : "▫️"} {h.title} <span className="muted">· до {new Date(h.due).toLocaleDateString("ru-RU")}</span></span>
          <button className="ghost small" onClick={() => setDoc(sref(m), { homework: hw.filter((x) => x.id !== h.id) }, { merge: true })}>✕</button></div>)}
        {hwFor === m ? <form className="inline" style={{ marginTop: 6 }} onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget);
            const title = String(f.get("t") || "").trim(), due = String(f.get("d") || ""); if (!title || !due) return alert("Нужны название и срок");
            setDoc(sref(m), { homework: [...hw, { id: Date.now().toString(36), title, url: normUrl(String(f.get("u") || "")) || "", due, note: String(f.get("n") || "").trim() }] }, { merge: true }); setHwFor(null); }}>
            <input name="t" placeholder="Задание" style={{ flex: 1, minWidth: 140 }} autoFocus />
            <input name="u" placeholder="Ссылка на таблицу" style={{ flex: 1, minWidth: 140 }} />
            <input name="d" type="date" />
            <input name="n" placeholder="Комментарий (необяз.)" style={{ flex: 1, minWidth: 120 }} />
            <button>Добавить</button><button type="button" className="ghost" onClick={() => setHwFor(null)}>Отмена</button></form>
          : <button className="ghost small" onClick={() => setHwFor(m)}>+ домашнее задание</button>}
      </div>; })}
    <form className="inline" style={{ marginTop: 8 }} onSubmit={add}>
      <input type="email" placeholder="Почта ученика" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button>Добавить</button>
    </form>
    <div className="muted small">Ученик жмёт «Первый вход» со своей почтой, подтверждает её — и видит свои курсы и домашки.</div>
  </div>;
}
