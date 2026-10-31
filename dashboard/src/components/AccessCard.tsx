// Админка: сотрудники — доступ, онлайн, оплата, дни ЗП, день рождения, открытые курсы (компактно)
import { FormEvent, useEffect, useState } from "react";
import { arrayRemove, arrayUnion, collection, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { parseDays, Pay } from "../lib/pay";
import { db } from "../lib/firebase";
import { useWorkspace } from "../lib/workspace";
import { COURSES } from "../pages/Knowledge";
import { fmtMin } from "../pages/StaffHome";

export const dayKey = (back: number) => { const d = new Date(); d.setDate(d.getDate() - back); return d.toLocaleDateString("sv-SE"); };
// «был(а) N назад» по отметке присутствия
export function seenText(last?: Date) {
  if (!last) return { online: false, text: "⚪ ещё не заходил(а)" };
  const ago = Math.round((Date.now() - +last) / 60000);
  if (ago <= 2) return { online: true, text: "🟢 онлайн" };
  return { online: false, text: `⚪ был(а) ${ago < 60 ? ago + " мин" : ago < 1440 ? Math.round(ago / 60) + " ч" : Math.round(ago / 1440) + " дн"} назад` };
}
// ближайший день рождения: «12 марта · через 5 дн.»
export function bdayText(b?: string) {
  if (!b) return null;
  const [, m, d] = b.split("-").map(Number); if (!m || !d) return null;
  const t = new Date(new Date().toDateString()); let n = new Date(t.getFullYear(), m - 1, d); if (n < t) n = new Date(t.getFullYear() + 1, m - 1, d);
  const days = Math.round((+n - +t) / 86400000);
  return `${n.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}${days === 0 ? " · сегодня 🎉" : days <= 14 ? ` · через ${days} дн.` : ""}`;
}

export default function AccessCard() {
  const { wsId, ws, isOwner } = useWorkspace();
  const [email, setEmail] = useState("");
  const [staff, setStaff] = useState<Record<string, Pay & { birthday?: string }>>({});
  const [pres, setPres] = useState<Record<string, { lastSeen?: any; days?: Record<string, number> }>>({});
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => wsId && isOwner ? onSnapshot(collection(db, "workspaces", wsId, "presence"),
    (s) => setPres(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as any])))) : undefined, [wsId, isOwner]);
  useEffect(() => wsId && isOwner ? onSnapshot(collection(db, "workspaces", wsId, "staff"),
    (s) => setStaff(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as any])))) : undefined, [wsId, isOwner]);
  if (!isOwner || !wsId || !ws) return null;
  const ref = doc(db, "workspaces", wsId);
  const courses = ws.courses ?? COURSES;
  async function invite(e: FormEvent) {
    e.preventDefault(); const v = email.trim().toLowerCase(); if (!v) return;
    await updateDoc(ref, { members: arrayUnion(v) }); setEmail("");
  }

  return (
    <div className="card">
      <div className="row" style={{ padding: 0 }}><h3 style={{ margin: 0 }}>👥 Сотрудники</h3>
        <button className={ws.open ? "" : "ghost"} onClick={() => updateDoc(ref, { open: !ws.open })}>{ws.open ? "🔓 Доступ открыт" : "🔒 Доступ закрыт"}</button></div>
      {ws.members.map((m) => {
        const p = staff[m] || { system: "", paydays: [] };
        const save = (patch: object) => setDoc(doc(db, "workspaces", wsId, "staff", m), patch, { merge: true });
        const pr = pres[m] || {}; const st = seenText(pr.lastSeen?.toDate?.());
        const myCourses = courses.filter((c) => (p.courses || []).includes(c.id));
        return (
          <div key={m} className="adm-client">
            <div className="row" style={{ padding: 0 }}><b>{m}</b>
              <button className="ghost small" onClick={() => confirm(`Убрать ${m}?`) && updateDoc(ref, { members: arrayRemove(m) })}>✕</button></div>
            <div className="small"><span className={st.online ? "ok" : "muted"}>{st.text}</span> <span className="muted">· сегодня {fmtMin(pr.days?.[dayKey(0)] || 0)}</span></div>
            <div className="adm-line">
              <span>💸 <input key={"s" + p.system} defaultValue={p.system} placeholder="система оплаты" onBlur={(e) => e.target.value.trim() !== p.system && save({ system: e.target.value.trim() })} /></span>
              <span>📅 ЗП <input key={"d" + p.paydays.join()} defaultValue={p.paydays.join(", ")} placeholder="10, 25" style={{ width: 70 }} onBlur={(e) => save({ paydays: parseDays(e.target.value) })} /></span>
              <span>🎂 <input type="date" defaultValue={p.birthday || ""} key={"b" + (p.birthday || "")} onBlur={(e) => e.target.value !== (p.birthday || "") && save({ birthday: e.target.value })} />
                {bdayText(p.birthday) && <span className="muted small"> {bdayText(p.birthday)}</span>}</span>
            </div>
            <div className="small muted">🎓 {myCourses.length ? myCourses.map((c) => c.name).join(", ") : "курсы не открыты"} <span>(открыть — в Базе знаний)</span></div>
          </div>);
      })}
      <form className="inline" style={{ marginTop: 8 }} onSubmit={invite}>
        <input type="email" placeholder="Почта нового сотрудника" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button>Добавить</button>
      </form>
    </div>
  );
}
