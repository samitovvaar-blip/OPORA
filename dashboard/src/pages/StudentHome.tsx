// Кабинет ученика: домашние задания (ссылка на таблицу + срок) и переход к курсам
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useWorkspace } from "../lib/workspace";
import { today } from "../lib/store";

export interface Homework { id: string; title: string; url: string; due: string; note?: string; }
export interface Student { courses?: string[]; homework?: Homework[]; hwDone?: Record<string, string>; name?: string; }

export default function StudentHome() {
  const { wsId } = useWorkspace();
  const me = (auth.currentUser?.email || "").toLowerCase();
  const [st, setSt] = useState<Student>({});
  const ref = wsId && me ? doc(db, "workspaces", wsId, "students", me) : null;
  useEffect(() => ref ? onSnapshot(ref, (s) => setSt((s.data() as Student) || {}), () => {}) : undefined, [wsId, me]);
  const d = today(), done = st.hwDone || {};
  const hw = [...(st.homework || [])].sort((a, b) => (!!done[a.id] as any) - (!!done[b.id] as any) || a.due.localeCompare(b.due));
  const toggle = (id: string) => ref && setDoc(ref, { hwDone: { ...done, [id]: done[id] ? "" : d } }, { merge: true });

  return <>
    <h1>Привет! 👋</h1>
    <div className="card" style={{ maxWidth: 820 }}>
      <h3 style={{ marginTop: 0 }}>📝 Домашние задания</h3>
      {hw.map((h) => { const late = !done[h.id] && h.due < d;
        return <div key={h.id} className={`row task ${done[h.id] ? "done" : ""}`} style={{ borderBottom: "1px solid var(--border)" }}>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1, cursor: "pointer" }}>
            <input type="checkbox" checked={!!done[h.id]} onChange={() => toggle(h.id)} style={{ marginTop: 3 }} />
            <span><b>{h.title}</b>{h.note && <div className="small muted">{h.note}</div>}
              <div className="small"><span className={late ? "error" : "muted"}>срок: {new Date(h.due).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}{late ? " ⚠ просрочено" : ""}</span>
                {done[h.id] && <span className="ok"> · ✓ сдано {new Date(done[h.id]).toLocaleDateString("ru-RU")}</span>}</div></span>
          </label>
          {h.url && <a className="linkbtn" href={h.url} target="_blank" rel="noopener noreferrer">📊 Таблица</a>}
        </div>; })}
      {!hw.length && <div className="muted small">Заданий пока нет ✨</div>}
    </div>
    <Link to="/kb" className="cab-btn" style={{ maxWidth: 820, marginTop: 14 }}>🎓 Перейти к курсам</Link>
  </>;
}
