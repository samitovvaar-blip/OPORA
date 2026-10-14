// Задания сотруднику в виде календаря. Видят оба; создаёт и удаляет — владелец,
// сотрудник отмечает чекпоинты и статус.
import { FormEvent, useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useWorkspace } from "../lib/workspace";
import { today } from "../lib/store";

interface Checkpoint { text: string; done: boolean; }
interface Assignment { id: string; title: string; description: string; date: string; checkpoints: Checkpoint[]; status: "todo" | "doing" | "done"; }
const statusLabel = { todo: "Не начато", doing: "В работе", done: "Готово" };

const ymd = (d: Date) => d.toLocaleDateString("sv-SE");
const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

export default function Tasks() {
  const { user } = useAuth();
  const { wsId, isOwner, ws, ready } = useWorkspace();
  const [items, setItems] = useState<Assignment[]>([]);
  const [error, setError] = useState("");
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selDay, setSelDay] = useState(today());
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", checkpoints: "" });

  const col = wsId ? collection(db, "workspaces", wsId, "assignments") : null;
  useEffect(() => {
    if (!col) return;
    return onSnapshot(col, (s) => setItems(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Assignment, "id">) }))),
      (e) => setError(e.code === "permission-denied" ? "Доступ закрыт владельцем" : e.message));
  }, [wsId]);

  const days = useMemo(() => {
    const start = new Date(month); start.setDate(1 - ((month.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);

  if (!ready) return <div className="muted">Загрузка…</div>;
  if (!isOwner && ws && !ws.open) return <><h1>Задания</h1><div className="card">🔒 Доступ сейчас закрыт. Обратись к владельцу.</div></>;

  async function add(e: FormEvent) {
    e.preventDefault(); if (!col || !form.title.trim()) return;
    await addDoc(col, {
      title: form.title.trim(), description: form.description.trim(), date: selDay, status: "todo",
      checkpoints: form.checkpoints.split("\n").map((t) => t.trim()).filter(Boolean).map((text) => ({ text, done: false })),
      createdAt: serverTimestamp(), createdBy: user!.email,
    });
    setForm({ title: "", description: "", checkpoints: "" });
  }
  const upd = (id: string, d: Partial<Assignment>) => updateDoc(doc(col!, id), d);
  const toggleCp = (a: Assignment, i: number) =>
    upd(a.id, { checkpoints: a.checkpoints.map((c, j) => (j === i ? { ...c, done: !c.done } : c)) });

  const dayItems = items.filter((a) => a.date === selDay);
  const progress = (a: Assignment) => a.checkpoints.length ? Math.round(a.checkpoints.filter((c) => c.done).length / a.checkpoints.length * 100) : 0;

  return (
    <>
      <h1>Задания {isOwner ? <span className="badge">{ws?.open ? "🔓 доступ открыт" : "🔒 доступ закрыт"}</span> : null}</h1>
      {error && <div className="error">{error}</div>}
      <div className="cal-wrap">
        <div className="card">
          <div className="row">
            <button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <b>{MONTHS[month.getMonth()]} {month.getFullYear()}</b>
            <button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
          </div>
          <div className="cal">
            {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map((d) => <div key={d} className="cal-h muted small">{d}</div>)}
            {days.map((d) => {
              const key = ymd(d); const list = items.filter((a) => a.date === key);
              return (
                <div key={key} onClick={() => setSelDay(key)}
                  className={`cal-d ${d.getMonth() !== month.getMonth() ? "out" : ""} ${key === today() ? "now" : ""} ${key === selDay ? "sel" : ""}`}>
                  <span className="small">{d.getDate()}</span>
                  {list.slice(0, 3).map((a) => <div key={a.id} className={`chip s-${a.status}`}>{a.title}</div>)}
                  {list.length > 3 && <div className="muted small">+{list.length - 3}</div>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h3>{new Date(selDay).toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" })}</h3>
          {dayItems.map((a) => (
            <div key={a.id} className="assign">
              <div className="row" onClick={() => setOpenId(openId === a.id ? null : a.id)} style={{ cursor: "pointer" }}>
                <b>{a.title}</b><span className={`badge s-${a.status}`}>{statusLabel[a.status]} · {progress(a)}%</span>
              </div>
              {openId === a.id && <>
                {a.description && <p className="small">{a.description}</p>}
                {a.checkpoints.map((c, i) => (
                  <label key={i} className={`task row ${c.done ? "done" : ""}`} style={{ justifyContent: "flex-start" }}>
                    <input type="checkbox" checked={c.done} onChange={() => toggleCp(a, i)} /> {c.text}
                  </label>
                ))}
                <div className="inline">
                  <select value={a.status} onChange={(e) => upd(a.id, { status: e.target.value as Assignment["status"] })}>
                    {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {isOwner && <>
                    <input type="date" value={a.date} onChange={(e) => upd(a.id, { date: e.target.value })} />
                    <button className="ghost" onClick={() => confirm("Удалить задание?") && deleteDoc(doc(col!, a.id))}>Удалить</button>
                  </>}
                </div>
              </>}
            </div>
          ))}
          {!dayItems.length && <div className="muted small">На этот день заданий нет</div>}

          {isOwner && (
            <form onSubmit={add} className="newtask">
              <h3>+ Новое задание на этот день</h3>
              <input placeholder="Название" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <textarea placeholder="Описание" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <textarea placeholder={"Чекпоинты — каждый с новой строки"} value={form.checkpoints} onChange={(e) => setForm({ ...form, checkpoints: e.target.value })} />
              <button>Добавить</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
