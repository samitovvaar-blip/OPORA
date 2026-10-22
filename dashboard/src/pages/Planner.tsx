import { FormEvent, useState } from "react";
import { today, useCollection } from "../lib/store";
import { Repeat, Task } from "../lib/types";
import { describe, doneOn, isRecurring, occursOn, togglePatch, WD } from "../lib/recurring";
import { askNotify, canNotify } from "../lib/reminders";

type T = Task & { id: string };

export function TaskRow({ t, day = today(), update, remove }: { t: T; day?: string; update: (id: string, d: Partial<Task>) => void; remove: (id: string) => void }) {
  const done = doneOn(t, day);
  const overdue = !done && !isRecurring(t) && t.date && t.date < today();
  return (
    <div className="row task">
      <label className={done ? "done" : ""}>
        <input type="checkbox" checked={done} onChange={() => update(t.id, togglePatch(t, day))} />
        {isRecurring(t) && <span title="Повторяется">🔁</span>} {t.title}
      </label>
      <span className={`small ${overdue ? "error" : "muted"}`}>{isRecurring(t) ? (t.time || "") : describe(t)}
        <button className="ghost" onClick={() => confirm(`Удалить «${t.title}»?`) && remove(t.id)}>✕</button></span>
    </div>
  );
}

export default function Planner() {
  const { items, error, add, update, remove } = useCollection<Task>("tasks");
  const [title, setTitle] = useState("");
  const [repeat, setRepeat] = useState<Repeat>("once");
  const [date, setDate] = useState(today());
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [time, setTime] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [msg, setMsg] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault(); if (!title.trim()) return;
    if (repeat === "weekly" && !days.length) return setMsg("Выбери хотя бы один день недели");
    await add({ title: title.trim(), date: repeat === "once" ? date : today(), done: false, repeat,
      ...(repeat === "weekly" ? { days } : {}), ...(time ? { time } : {}) });
    setTitle(""); setTime(""); setMsg("");
  }

  const d = today();
  const once = items.filter((t) => !isRecurring(t));
  const rec = items.filter(isRecurring);
  const openOnce = once.filter((t) => !t.done).sort((a, b) => (a.date || "9").localeCompare(b.date || "9"));
  const todayList = [...rec.filter((t) => occursOn(t, d)), ...openOnce.filter((t) => t.date === d)]
    .sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  const groups = [
    { label: "Просрочено", list: openOnce.filter((t) => t.date && t.date < d) },
    { label: "Сегодня", list: todayList },
    { label: "Дальше", list: openOnce.filter((t) => !t.date || t.date > d) },
  ];
  const done = once.filter((t) => t.done);

  return (
    <>
      <h1>Планер</h1>
      {error && <div className="error">Firestore: {error}</div>}
      <form className="card" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        <input placeholder="Что сделать?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="chips" style={{ margin: 0 }}>
          {([["once", "Один раз"], ["daily", "Каждый день"], ["weekly", "По дням недели"]] as [Repeat, string][]).map(([k, l]) =>
            <button key={k} type="button" className={`chipbtn ${repeat === k ? "on" : ""}`} onClick={() => setRepeat(k)}>{l}</button>)}
        </div>
        {repeat === "weekly" && <div className="chips" style={{ margin: 0 }}>
          {WD.map((w, i) => <button key={i} type="button" className={`chipbtn ${days.includes(i) ? "on" : ""}`}
            onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])}>{w}</button>)}
        </div>}
        <div className="inline" style={{ alignItems: "center" }}>
          {repeat === "once" && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          <label className="small muted" style={{ display: "flex", gap: 6, alignItems: "center" }}>⏰
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
          <button>Добавить</button>
          {!canNotify() && <button type="button" className="ghost" onClick={async () => setMsg(await askNotify())}>🔔 Включить напоминания</button>}
        </div>
        {msg && <div className="small">{msg}</div>}
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
          <h3>🔁 Регулярные <span className="muted">{rec.length}</span></h3>
          {rec.map((t) => (
            <div key={t.id} className="row task">
              <span>{t.title} <span className="muted small">· {describe(t)}</span></span>
              <button className="ghost" onClick={() => confirm(`Удалить регулярную задачу «${t.title}»?`) && remove(t.id)}>✕</button>
            </div>
          ))}
          {!rec.length && <div className="muted small">Нет регулярных задач. Выбери «Каждый день» или «По дням недели» при создании.</div>}
        </div>
        <div className="card wide">
          <button className="ghost" onClick={() => setShowDone(!showDone)}>{showDone ? "▾" : "▸"} Выполнено ({done.length})</button>
          {showDone && done.map((t) => <TaskRow key={t.id} t={t} update={update} remove={remove} />)}
        </div>
      </div>
    </>
  );
}
