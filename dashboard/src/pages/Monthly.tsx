// Ежемесячные задачи по проектам-клиентам. Владелец видит все проекты,
// сотрудник — только те, где владелец открыл чек-лист.
import { useEffect, useState } from "react";
import { deleteDoc, doc, updateDoc } from "firebase/firestore";
import Payments from "../components/Payments";
import ClientReport from "../components/ClientReport";
import ClientAccess from "../components/ClientAccess";
import { db } from "../lib/firebase";
import { useWorkspace } from "../lib/workspace";
import { useClientProjects, useMarks } from "../lib/clients";
import { monthKey } from "../lib/catalog";
import Checklist from "../components/Checklist";
import FlagPicker from "../components/FlagPicker";
import { LinkButtons, LinkEditor } from "../components/ProjectLinks";

const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

export default function Monthly({ embedded = false }: { embedded?: boolean }) {
  const { wsId, isOwner, ws } = useWorkspace();
  const { list: all, error } = useClientProjects();
  const list = isOwner ? all : all.filter((p) => p.monthlyOpen);
  const [sel, setSel] = useState<string | null>(() => new URLSearchParams(location.hash.split("?")[1]).get("p"));
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [editFlags, setEditFlags] = useState(false);
  const [report, setReport] = useState(false);
  const mk = monthKey(month);
  const p = list.find((x) => x.id === sel) || list[0];
  useEffect(() => { if (p && p.id !== sel) setSel(p.id); }, [p?.id]);
  const { marks, setMark } = useMarks(p ? [p.id] : [], mk);

  if (!isOwner && ws && !ws.open) return <><h1>Ежемесячные задачи</h1><div className="card">🔒 Доступ сейчас закрыт.</div></>;
  const upd = (data: object) => updateDoc(doc(db, "workspaces", wsId!, "clients", p!.id), data);

  return (
    <>
      {!embedded && <h1>Ежемесячные задачи</h1>}
      {error && <div className="error">{error}</div>}
      {!list.length ? <div className="card">{isOwner ? <>Пока нет проектов. Создай первый кнопкой «+ Новый проект» — список задач подберётся сам.</> : "Пока нет открытых тебе проектов."}</div> : <>
        <div className="chips">{list.map((x) =>
          <button key={x.id} className={`chipbtn ${x.id === p?.id ? "on" : ""}`} onClick={() => setSel(x.id)}>{x.name}</button>)}</div>
        {p && <div className="card" style={{ maxWidth: 860 }}>
          <div className="row">
            <button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <b>{p.name} · {MONTHS[month.getMonth()]} {month.getFullYear()}</b>
            <button className="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
          </div>
          {isOwner && <div className="inline" style={{ marginTop: 8 }}>
            <button className={p.monthlyOpen ? "" : "ghost"} onClick={() => upd({ monthlyOpen: !p.monthlyOpen })}>
              {p.monthlyOpen ? "🔓 Чек-лист открыт сотруднику" : "🔒 Чек-лист закрыт"}</button>
            <button className={p.calendarOpen ? "" : "ghost"} onClick={() => upd({ calendarOpen: !p.calendarOpen })}>
              {p.calendarOpen ? "🔓 Сроки в календаре сотрудника" : "🔒 Сроки только у меня"}</button>
            <button onClick={() => setReport(true)}>📄 Отчёт клиенту</button>
            <button className="ghost" onClick={() => setEditFlags(!editFlags)}>⚙ Данные и ссылки</button>
            <button className="ghost" onClick={() => confirm(`Удалить проект «${p.name}»?`) && deleteDoc(doc(db, "workspaces", wsId!, "clients", p.id))}>✕ Удалить</button>
          </div>}
          {isOwner && editFlags && <div className="card" style={{ background: "var(--bg)", marginTop: 8 }}>
            <FlagPicker flags={p.flags || {}} onChange={(f) => upd({ flags: f })} />
            <LinkEditor key={p.id} links={p.links} onChange={(l) => upd({ links: l })} />
            <ClientAccess p={p} wsId={wsId!} /></div>}
          <LinkButtons links={p.links} />
          {isOwner && <details style={{ marginTop: 10 }}><summary className="small"><b>💰 Услуги и оплата</b></summary>
            <Payments projectId={p.id} projectName={p.name} /></details>}
          {report && <ClientReport p={p} mk={mk} marks={marks[p.id] || {}} onClose={() => setReport(false)} />}
          <Checklist p={p} mk={mk} marks={marks[p.id] || {}} setMark={(id, m) => setMark(p.id, id, m)} />
        </div>}
      </>}
    </>
  );
}
