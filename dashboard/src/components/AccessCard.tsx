// Владелец управляет доступом сотрудников к разделу «Задания»
import { FormEvent, useState } from "react";
import { arrayRemove, arrayUnion, collection, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { useEffect } from "react";
import { parseDays, Pay } from "../lib/pay";
import { db } from "../lib/firebase";
import { useWorkspace } from "../lib/workspace";

export default function AccessCard() {
  const { wsId, ws, isOwner } = useWorkspace();
  const [email, setEmail] = useState("");
  const [pay, setPay] = useState<Record<string, Pay>>({});
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
            <div className="row"><b>{m}</b>
              <button className="ghost" onClick={() => updateDoc(ref, { members: arrayRemove(m) })}>Убрать</button></div>
            <div className="inline" style={{ margin: "4px 0 0" }}>
              <input key={"s" + p.system} defaultValue={p.system} placeholder="Система оплаты: оклад 10 000 + 15% с проекта"
                onBlur={(e) => e.target.value.trim() !== p.system && save({ system: e.target.value.trim() })} style={{ flex: 1, minWidth: 220 }} />
              <input key={"d" + p.paydays.join()} defaultValue={p.paydays.join(", ")} placeholder="Дни ЗП: 10, 25"
                onBlur={(e) => save({ paydays: parseDays(e.target.value) })} style={{ width: 130 }} />
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
