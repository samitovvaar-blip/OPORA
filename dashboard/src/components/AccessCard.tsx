// Владелец управляет доступом сотрудников к разделу «Задания»
import { FormEvent, useState } from "react";
import { arrayRemove, arrayUnion, collection, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { useEffect } from "react";
import { parseDays, Pay } from "../lib/pay";
import { db } from "../lib/firebase";
import { useWorkspace } from "../lib/workspace";
import { COURSES } from "../pages/Knowledge";
import { fmtMin } from "../pages/StaffHome";
const dayKey = (back: number) => { const d = new Date(); d.setDate(d.getDate() - back); return d.toLocaleDateString("sv-SE"); };

export default function AccessCard() {
  const { wsId, ws, isOwner } = useWorkspace();
  const [email, setEmail] = useState("");
  const [pay, setPay] = useState<Record<string, Pay>>({});
  const [pres, setPres] = useState<Record<string, { lastSeen?: any; days?: Record<string, number> }>>({});
  const [, tick] = useState(0);
  const [prog, setProg] = useState<Record<string, string[]>>({});
  const [kb, setKb] = useState<{ id: string; course?: string }[]>([]);
  useEffect(() => wsId && isOwner ? onSnapshot(collection(db, "workspaces", wsId, "progress"),
    (s) => setProg(Object.fromEntries(s.docs.map((d) => [d.id, (d.data().done as string[]) || []])))) : undefined, [wsId, isOwner]);
  useEffect(() => wsId && isOwner ? onSnapshot(collection(db, "workspaces", wsId, "kb"),
    (s) => setKb(s.docs.map((d) => ({ id: d.id, course: d.data().course })))) : undefined, [wsId, isOwner]);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => wsId && isOwner ? onSnapshot(collection(db, "workspaces", wsId, "presence"),
    (s) => setPres(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as any])))) : undefined, [wsId, isOwner]);
  useEffect(() => wsId && isOwner ? onSnapshot(collection(db, "workspaces", wsId, "staff"),
    (s) => setPay(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Pay])))) : undefined, [wsId, isOwner]);
  if (!isOwner || !wsId || !ws) return null;
  const ref = doc(db, "workspaces", wsId);

  async function invite(e: FormEvent) {
    e.preventDefault(); const v = email.trim().toLowerCase(); if (!v) return;
    await updateDoc(ref, { members: arrayUnion(v) }); setEmail("");
  }

  return (
    <div className="card wide">
      <h3>Сотрудники: доступ и оплата</h3>
      <div className="row">
        <span>{ws.open ? "🔓 Доступ открыт" : "🔒 Доступ закрыт"}</span>
        <button onClick={() => updateDoc(ref, { open: !ws.open })}>{ws.open ? "Закрыть доступ" : "Открыть доступ"}</button>
      </div>
      {ws.members.map((m) => {
        const p = pay[m] || { system: "", paydays: [] };
        const save = (patch: Partial<Pay>) => setDoc(doc(db, "workspaces", wsId, "staff", m), { ...p, ...patch });
        return (
          <div key={m} style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}>
            {(() => { const pr = pres[m] || {}; const last = pr.lastSeen?.toDate?.() as Date | undefined;
              const ago = last ? Math.round((Date.now() - +last) / 60000) : null; const online = ago != null && ago <= 2;
              const days = pr.days || {}; const sum = (n: number) => Object.entries(days).filter(([k]) => k >= dayKey(-n)).reduce((a, [, v]) => a + v, 0);
              return <div className="small" style={{ marginBottom: 4 }}>
                <span className={online ? "ok" : "muted"}>{online ? "🟢 онлайн" : ago == null ? "⚪ ещё не заходил(а)" : `⚪ был(а) ${ago < 60 ? ago + " мин" : ago < 1440 ? Math.round(ago / 60) + " ч" : Math.round(ago / 1440) + " дн"} назад`}</span>
                <span className="muted"> · сегодня {fmtMin(days[dayKey(0)] || 0)} · 7 дней {fmtMin(sum(6))} · 30 дней {fmtMin(sum(29))}</span>
              </div>; })()}
            <div className="row"><b>{m}</b>
              <button className="ghost" onClick={() => updateDoc(ref, { members: arrayRemove(m) })}>Убрать</button></div>
            <div className="inline" style={{ margin: "4px 0 0" }}>
              <input key={"s" + p.system} defaultValue={p.system} placeholder="Система оплаты: оклад 10 000 + 15% с проекта"
                onBlur={(e) => e.target.value.trim() !== p.system && save({ system: e.target.value.trim() })} style={{ flex: 1, minWidth: 220 }} />
              <input key={"d" + p.paydays.join()} defaultValue={p.paydays.join(", ")} placeholder="Дни ЗП: 10, 25"
                onBlur={(e) => save({ paydays: parseDays(e.target.value) })} style={{ width: 130 }} />
            </div>
            <div className="inline" style={{ margin: "6px 0 0" }}>
              {COURSES.map((c) => { const on = (p.courses || []).includes(c.id);
                return <button key={c.id} className={on ? "" : "ghost"} title={on ? "Курс открыт — нажми, чтобы закрыть" : "Открыть курс сотруднику"}
                  onClick={() => save({ courses: on ? (p.courses || []).filter((x) => x !== c.id) : [...(p.courses || []), c.id] })}>{on ? "🔓 " : "🔒 "}{c.name}{on ? (() => { const ls = kb.filter((l) => l.course === c.id); const d = ls.filter((l) => (prog[m] || []).includes(l.id)).length;
                  return ` · ${d}/${ls.length}`; })() : ""}</button>; })}
            </div>
          </div>);
      })}
      <form className="inline" onSubmit={invite}>
        <input type="email" placeholder="Почта сотрудника" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button>Добавить</button>
      </form>
      <div className="muted small">Сотрудник жмёт «Первый вход», придумывает пароль и подтверждает почту по ссылке из письма — только после этого видит «Задания».</div>
    </div>
  );
}
