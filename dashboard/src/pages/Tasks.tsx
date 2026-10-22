// Задания сотруднику в виде календаря. Видят оба; создаёт и удаляет — владелец,
// сотрудник отмечает чекпоинты и статус.
import { FormEvent, useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { useClientProjects, useMarks } from "../lib/clients";
import { describe, isRecurring, occursOn, WD } from "../lib/recurring";
import { Repeat } from "../lib/types";
import { dueDate, monthKey, shown, STAGES, stamp } from "../lib/catalog";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { useWorkspace } from "../lib/workspace";
import { today } from "../lib/store";

interface Checkpoint { text: string; done: boolean; }
interface Assignment { id: string; title: string; description: string; date: string; checkpoints: Checkpoint[]; status: "todo" | "doing" | "done"; shared?: boolean;
  repeat?: Repeat; days?: number[]; time?: string; doneDates?: string[]; }
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
  const [repeat, setRepeat] = useState<Repeat>("once");
  const [rdays, setRdays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [rtime, setRtime] = useState("");

  const col = wsId ? collection(db, "workspaces", wsId, "assignments") : null;
  useEffect(() => {
    if (!col) return;
    // Сотрудник видит только задания, открытые ему (shared == true)
    return onSnapshot(isOwner ? col : query(col, where("shared", "==", true)), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Assignment, "id">) }));
      // старые задания без флага считаем открытыми — проставляем один раз
      if (isOwner) list.filter((a) => a.shared === undefined).forEach((a) => updateDoc(doc(col, a.id), { shared: true }));
      setItems(list);
    }, (e) => setError(e.code === "permission-denied" ? "Доступ закрыт владельцем" : e.message));
  }, [wsId, isOwner]);

  const days = useMemo(() => {
    const start = new Date(month); start.setDate(1 - ((month.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);

  // Ежемесячные задачи со сроком из проектов — в календарь
  const mk = monthKey(month);
  const { list: projects } = useClientProjects();
  const calProjects = projects.filter((p) => isOwner || p.calendarOpen);
  const { marks, setMark } = useMarks(calProjects.map((p) => p.id), mk);
  const deadlines = calProjects.flatMap((p) => STAGES.flatMap((st) => st.items
    .filter((it) => it.due != null && shown(it, p.flags || {}))
    .map((it) => ({ key: p.id + it.id, pid: p.id, itemId: it.id, project: p.name, title: it.title, date: dueDate(mk, it.due!), done: !!marks[p.id]?.[it.id]?.done, open: p.calendarOpen }))));

  if (!ready) return <div className="muted">Загрузка…</div>;
  if (!isOwner && ws && !ws.open) return <><h1>Задания</h1><div className="card">🔒 Доступ сейчас закрыт. Обратись к владельцу.</div></>;

  async function add(e: FormEvent) {
    e.preventDefault(); if (!col || !form.title.trim()) return;
    await addDoc(col, {
      title: form.title.trim(), description: form.description.trim(), date: selDay, status: "todo", repeat,
      ...(repeat === "weekly" ? { days: rdays } : {}), ...(rtime ? { time: rtime } : {}), ...(repeat !== "once" ? { doneDates: [] } : {}),
      checkpoints: form.checkpoints.split("\n").map((t) => t.trim()).filter(Boolean).map((text) => ({ text, done: false })),
      createdAt: serverTimestamp(), createdBy: user!.email, shared: true,
    });
    setForm({ title: "", description: "", checkpoints: "" }); setRtime("");
  }
  const upd = (id: string, d: Partial<Assignment>) => updateDoc(doc(col!, id), d);
  const toggleCp = (a: Assignment, i: number) =>
    upd(a.id, { checkpoints: a.checkpoints.map((c, j) => (j === i ? { ...c, done: !c.done } : c)) });

  const onDay = (a: Assignment, d: string) => occursOn(a as any, d);
  const isDone = (a: Assignment, d: string) => isRecurring(a as any) ? (a.doneDates || []).includes(d) : a.status === "done";
  const toggleDay = (a: Assignment, d: string) => {
    const set = new Set(a.doneDates || []); set.has(d) ? set.delete(d) : set.add(d);
    upd(a.id, { doneDates: [...set].sort().slice(-90) });
  };
  const dayItems = items.filter((a) => onDay(a, selDay)).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
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
              const key = ymd(d); const list = items.filter((a) => onDay(a, key));
              const dl = deadlines.filter((x) => x.date === key);
              return (
                <div key={key} onClick={() => setSelDay(key)}
                  className={`cal-d ${d.getMonth() !== month.getMonth() ? "out" : ""} ${key === today() ? "now" : ""} ${key === selDay ? "sel" : ""}`}>
                  <span className="small">{d.getDate()}</span>
                  {list.slice(0, 3).map((a) => <div key={a.id} className={`chip s-${isRecurring(a as any) ? (isDone(a, key) ? "done" : "todo") : a.status}`}>{isRecurring(a as any) ? "🔁 " : ""}{a.title}</div>)}
                  {dl.length > 0 && <div className={`chip dl ${dl.every((x) => x.done) ? "s-done" : ""}`}>◆ {dl.filter((x) => !x.done).length || "✓"} {dl.length === 1 ? dl[0].project : "срок"}</div>}
                  {list.length > 3 && <div className="muted small">+{list.length - 3}</div>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h3>{new Date(selDay).toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" })}</h3>
          {dayItems.filter((a) => isRecurring(a as any)).map((a) => (
            <div key={a.id} className="assign">
              <div className="row">
                <label className={`task ${isDone(a, selDay) ? "done" : ""}`} style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, cursor: "pointer" }}>
                  <input type="checkbox" checked={isDone(a, selDay)} onChange={() => toggleDay(a, selDay)} />
                  🔁 <b>{a.title}</b></label>
                <span className="muted small">{describe(a as any)}</span>
                {isOwner && <button className="ghost" title={a.shared === false ? "Сотрудник не видит" : "Сотрудник видит"}
                  onClick={() => upd(a.id, { shared: a.shared === false })}>{a.shared === false ? "🔒" : "🔓"}</button>}
                {isOwner && <button className="ghost" onClick={() => confirm(`Удалить регулярное задание «${a.title}» со всех дней?`) && deleteDoc(doc(col!, a.id))}>✕</button>}
              </div>
              {a.description && <div className="muted small">{a.description}</div>}
            </div>
          ))}
          {dayItems.filter((a) => !isRecurring(a as any)).map((a) => (
            <div key={a.id} className="assign">
              <div className="row" onClick={() => setOpenId(openId === a.id ? null : a.id)} style={{ cursor: "pointer" }}>
                <b>{a.title}</b><span className={`badge s-${a.status}`}>{statusLabel[a.status]} · {progress(a)}%</span>
                {isOwner && <button className="ghost" title={a.shared === false ? "Сотрудник не видит" : "Сотрудник видит"}
                  onClick={(e) => { e.stopPropagation(); upd(a.id, { shared: a.shared === false }); }}>{a.shared === false ? "🔒" : "🔓"}</button>}
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
          {!dayItems.length && !deadlines.some((x) => x.date === selDay) && <div className="muted small">На этот день заданий нет</div>}
          {deadlines.some((x) => x.date === selDay) && <h3 style={{ marginTop: 16 }}>◆ Сроки по проектам</h3>}
          {deadlines.filter((x) => x.date === selDay).map((x) => (
            <label key={x.key} className={`task row ${x.done ? "done" : ""}`} style={{ justifyContent: "flex-start", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={x.done} onChange={() => setMark(x.pid, x.itemId, x.done
                ? { done: false, doneBy: "", doneAt: "" } : { done: true, doneBy: user!.email || "", doneAt: stamp() })} />
              <span><span className="tagc">{x.project}</span> {x.title}
                {isOwner && <span className="muted small"> {x.open ? "🔓" : "🔒"}</span>}</span>
            </label>
          ))}
          {deadlines.some((x) => x.date === selDay) && <div className="muted small">Весь чек-лист — в <a href="#/monthly">Ежемесячных</a>. 🔓/🔒 видит ли сотрудник — переключается в проекте.</div>}

          {isOwner && (
            <form onSubmit={add} className="newtask">
              <h3>+ Новое задание {repeat === "once" ? "на этот день" : "(начиная с этого дня)"}</h3>
              <input placeholder="Название" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <div className="chips" style={{ margin: 0 }}>
                {([["once", "Один раз"], ["daily", "Каждый день"], ["weekly", "По дням недели"]] as [Repeat, string][]).map(([k, l]) =>
                  <button key={k} type="button" className={`chipbtn ${repeat === k ? "on" : ""}`} onClick={() => setRepeat(k)}>{l}</button>)}
              </div>
              {repeat === "weekly" && <div className="chips" style={{ margin: 0 }}>
                {WD.map((w, i) => <button key={i} type="button" className={`chipbtn ${rdays.includes(i) ? "on" : ""}`}
                  onClick={() => setRdays(rdays.includes(i) ? rdays.filter((x) => x !== i) : [...rdays, i])}>{w}</button>)}
              </div>}
              <label className="small muted" style={{ display: "flex", gap: 6, alignItems: "center" }}>⏰ время (по желанию)
                <input type="time" value={rtime} onChange={(e) => setRtime(e.target.value)} /></label>
              <textarea placeholder="Описание" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              {repeat === "once" && <textarea placeholder={"Чекпоинты — каждый с новой строки"} value={form.checkpoints} onChange={(e) => setForm({ ...form, checkpoints: e.target.value })} />}
              <button disabled={repeat === "weekly" && !rdays.length}>Добавить</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
