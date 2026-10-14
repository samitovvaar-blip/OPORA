// Владелец управляет доступом сотрудников к разделу «Задания»
import { FormEvent, useState } from "react";
import { arrayRemove, arrayUnion, doc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useWorkspace } from "../lib/workspace";

export default function AccessCard() {
  const { wsId, ws, isOwner } = useWorkspace();
  const [email, setEmail] = useState("");
  if (!isOwner || !wsId || !ws) return null;
  const ref = doc(db, "workspaces", wsId);

  async function invite(e: FormEvent) {
    e.preventDefault(); const v = email.trim().toLowerCase(); if (!v) return;
    await updateDoc(ref, { members: arrayUnion(v) }); setEmail("");
  }

  return (
    <div className="card wide">
      <h3>Доступ сотрудников к «Заданиям»</h3>
      <div className="row">
        <span>{ws.open ? "🔓 Доступ открыт" : "🔒 Доступ закрыт"}</span>
        <button onClick={() => updateDoc(ref, { open: !ws.open })}>{ws.open ? "Закрыть доступ" : "Открыть доступ"}</button>
      </div>
      {ws.members.map((m) => (
        <div key={m} className="row"><span>{m}</span>
          <button className="ghost" onClick={() => updateDoc(ref, { members: arrayRemove(m) })}>Убрать</button></div>
      ))}
      <form className="inline" onSubmit={invite}>
        <input type="email" placeholder="Почта сотрудника" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button>Добавить</button>
      </form>
      <div className="muted small">Сотрудник жмёт «Первый вход», придумывает пароль и подтверждает почту по ссылке из письма — только после этого видит «Задания».</div>
    </div>
  );
}
