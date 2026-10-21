// Ежемесячные задачи: владелец ведёт шаблон, каждый месяц — свой чек-лист.
// Шаблон: workspaces/{ws}/monthly/{id}; отметки месяца: workspaces/{ws}/months/{YYYY-MM}/items/{id}
import { FormEvent, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useWorkspace } from "../lib/workspace";

interface Template { id: string; title: string; dueDay: number | null; order: number; active: boolean; }
interface Mark { id: string; done?: boolean; doneBy?: string; doneAt?: string; comment?: string; commentBy?: string; commentAt?: string; }

const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const now = () => new Date().toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function Monthly() {
  const { user } = useAuth();
  const { wsId, isOwner, ws } = useWorkspace();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [tpl, setTpl] = useState<Template[]>([]);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ title: "", dueDay: "" });
  const [openC, setOpenC] = useState<string | null>(null);

  const mk = key(month);
  const tplCol = wsId ? collection(db, "workspaces", wsId, "monthly") : null;
  const markCol = wsId ? collection(db, "workspaces", wsId, "months", mk, "items") : null;
  const onErr = (e: any) => setErr(e.code === "permission-denied" ? "Доступ закрыт владельцем" : e.message);

  useEffect(() => tplCol ? onSnapshot(tplCol, (s) =>
    setTpl(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Template, "id">) })).sort((a, b) => a.order - b.order)), onErr) : undefined, [wsId]);
  useEffect(() => markCol ? onSnapshot(markCol, (s) =>
    setMarks(Object.fromEntries(s.docs.map((d) => [d.id, { ...(d.data() as Mark), id: d.id }]))), onErr) : undefined, [wsId, mk]);

  if (!isOwner && ws && !ws.open) return <><h1>Ежемесячные задачи</h1><div className="card">🔒 Доступ сейчас закрыт.</div></>;

  const list = tpl.filter((t) => t.active !== false);
  const doneN = list.filter((t) => marks[t.id]?.done).length;
  const today = new Date();
  const isCurrent = mk === key(today);
  const isPast = month < new Date(today.getFullYear(), today.getMonth(), 1);
  const overdue = (t: Template) => !marks[t.id]?.done && t.dueDay != null && (isPast || (isCurrent && today.getDate() > t.dueDay));

  const setMark = (id: string, data: Partial<Mark>) => setDoc(doc(markCol!, id), data, { merge: true }).catch(onErr);
  const toggle = (t: Template) => marks[t.id]?.done
    ? setMark(t.id, { done: false, doneBy: "", doneAt: "" })
    : setMark(t.id, { done: true, doneBy: user!.email || "", doneAt: now() });
  const saveComment = (t: Template, text: string) => {
    if ((marks[t.id]?.comment || "") === text) return;
    setMark(t.id, { comment: text, commentBy: user!.email || "", commentAt: now() });
  };

  async function addTpl(e: FormEvent) {
    e.preventDefault(); if (!form.title.trim()) return;
    const d = parseInt(form.dueDay);
    await addDoc(tplCol!, { title: form.title.trim(), dueDay: d >= 1 && d <= 31 ? d : null, order: Date.now(), active: true, createdAt: serverTimestamp() });
    setForm({ title: "", dueDay: "" });
  }

  return (
    <>
      <h1>Ежемесячные задачи</h1>
      {err && <div className="error">{err}</div>}
      <div className="card" style={{ maxWidth: 760 }}>
        <div className="row">
          <button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
          <b>{MONTHS[month.getMonth()]} {month.getFullYear()}</b>
          <button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
        </div>
        <div className="progress"><div style={{ width: (list.length ? doneN / list.length * 100 : 0) + "%" }} /></div>
        <div className="muted small">Выполнено {doneN} из {list.length}</div>

        {list.map((t) => {
          const m = marks[t.id] || ({} as Mark);
          return (
            <div key={t.id} className="mrow">
              <div className="row">
                <label className={`task ${m.done ? "done" : ""}`} style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                  <input type="checkbox" checked={!!m.done} onChange={() => toggle(t)} /> {t.title}
                </label>
                <span className={`small ${overdue(t) ? "error" : "muted"}`}>
                  {t.dueDay ? `до ${t.dueDay}-го` : ""}{overdue(t) ? " ⚠" : ""}
                </span>
                <button className="ghost" title="Комментарий" onClick={() => setOpenC(openC === t.id ? null : t.id)}>💬{m.comment ? "•" : ""}</button>
              </div>
              {m.done && <div className="muted small">✓ {m.doneAt} · {m.doneBy}</div>}
              {m.comment && openC !== t.id && <div className="comment small" onClick={() => setOpenC(t.id)}>💬 {m.comment} <span className="muted">— {m.commentBy}, {m.commentAt}</span></div>}
              {openC === t.id && (
                <textarea autoFocus placeholder="Например: отправила бухгалтеру, ждём ответ" defaultValue={m.comment || ""}
                  onBlur={(e) => { saveComment(t, e.target.value.trim()); setOpenC(null); }} />
              )}
            </div>
          );
        })}
        {!list.length && <div className="muted small" style={{ marginTop: 10 }}>{isOwner ? "Добавь задачи в шаблон ниже 👇" : "Список задач пока пуст."}</div>}
      </div>

      {isOwner && (
        <div className="card" style={{ maxWidth: 760, marginTop: 14 }}>
          <div className="row"><h3 style={{ margin: 0 }}>Шаблон (повторяется каждый месяц)</h3>
            <button className="ghost" onClick={() => setEdit(!edit)}>{edit ? "Готово" : "Изменить"}</button></div>
          {edit && tpl.map((t, i) => (
            <div key={t.id} className="row">
              <input defaultValue={t.title} onBlur={(e) => e.target.value.trim() && updateDoc(doc(tplCol!, t.id), { title: e.target.value.trim() })} style={{ flex: 1 }} />
              <input type="number" min={1} max={31} placeholder="день" defaultValue={t.dueDay ?? ""} style={{ width: 70 }}
                onBlur={(e) => { const d = parseInt(e.target.value); updateDoc(doc(tplCol!, t.id), { dueDay: d >= 1 && d <= 31 ? d : null }); }} />
              <button className="ghost" disabled={!i} onClick={() => { const p = tpl[i - 1]; updateDoc(doc(tplCol!, t.id), { order: p.order }); updateDoc(doc(tplCol!, p.id), { order: t.order }); }}>↑</button>
              <button className="ghost" onClick={() => confirm(`Удалить «${t.title}» из шаблона?`) && deleteDoc(doc(tplCol!, t.id))}>✕</button>
            </div>
          ))}
          <form className="inline" onSubmit={addTpl} style={{ marginTop: 10 }}>
            <input placeholder="Новая ежемесячная задача" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
            <input type="number" min={1} max={31} placeholder="до числа" value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} style={{ width: 100 }} />
            <button>Добавить</button>
          </form>
        </div>
      )}
    </>
  );
}
