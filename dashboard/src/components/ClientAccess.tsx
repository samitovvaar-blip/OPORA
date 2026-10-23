// Владелец: доступ клиента к кабинету, ссылка на P&L из таблицы, план на следующий месяц
import { FormEvent, useState } from "react";
import { arrayRemove, arrayUnion, deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ClientProject, monthKey } from "../lib/catalog";
import { addMonths, parseAmount } from "../lib/money";

export default function ClientAccess({ p, wsId }: { p: ClientProject; wsId: string }) {
  const ref = doc(db, "workspaces", wsId, "clients", p.id);
  const [email, setEmail] = useState("");
  const emails = p.clientEmails || [];
  const nk = addMonths(monthKey(new Date()), 1);
  const plan = p.clientPlan?.mk === nk ? p.clientPlan : { mk: nk };

  async function add(e: FormEvent) {
    e.preventDefault(); const v = email.trim().toLowerCase(); if (!v) return;
    await updateDoc(ref, { clientEmails: arrayUnion(v) });
    await setDoc(doc(db, "clientIndex", v), { ws: wsId, cid: p.id });
    setEmail("");
  }
  async function remove(v: string) {
    await updateDoc(ref, { clientEmails: arrayRemove(v) });
    await deleteDoc(doc(db, "clientIndex", v)).catch(() => {});
  }
  const savePlan = (patch: object) => updateDoc(ref, { clientPlan: { ...plan, ...patch } });

  return (
    <div className="card" style={{ background: "var(--bg)", marginTop: 8 }}>
      <div className="row"><b>👤 Кабинет клиента</b>
        <span><a className="small" href={"#/client?p=" + p.id}>👁 Как видит клиент</a>
          <button className={p.clientOpen ? "" : "ghost"} style={{ marginLeft: 8 }} onClick={() => updateDoc(ref, { clientOpen: !p.clientOpen })}>
            {p.clientOpen ? "🔓 Открыт" : "🔒 Закрыт"}</button></span></div>
      {emails.map((m) => <div key={m} className="row small"><span>{m}</span><button className="ghost" onClick={() => remove(m)}>Убрать</button></div>)}
      <form className="inline" onSubmit={add} style={{ margin: "6px 0" }}>
        <input type="email" placeholder="Почта клиента" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <button>+ Клиент</button>
      </form>
      <label className="small" style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>📑 Ссылка на P&L из таблицы (Apps Script)
        <input key={p.pnlUrl || ""} defaultValue={p.pnlUrl || ""} placeholder="https://script.google.com/macros/s/…/exec?key=СЕКРЕТ&dir=Кубики"
          onBlur={(e) => { const v = e.target.value.trim(); if (v !== (p.pnlUrl || "")) updateDoc(ref, { pnlUrl: v }); }} /></label>
      <div className="small" style={{ marginTop: 10 }}><b>✓ Сдано клиенту</b> <span className="muted">— отметь месяц после созвона</span></div>
      <div className="chips" style={{ margin: "4px 0" }}>
        {[-3, -2, -1, 0].map((k) => { const mk = addMonths(monthKey(new Date()), k); const on = (p.closedMonths || []).includes(mk);
          const [y, m] = mk.split("-").map(Number);
          return <button key={mk} className={`chipbtn ${on ? "on" : ""}`}
            onClick={() => updateDoc(ref, { closedMonths: on ? arrayRemove(mk) : arrayUnion(mk) })}>
            {on ? "✓ " : ""}{["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"][m - 1]} {y}</button>; })}
      </div>
      <div className="small" style={{ marginTop: 10 }}><b>🎯 План для клиента на следующий месяц</b></div>
      <div className="inline" style={{ margin: "4px 0" }}>
        {([["revenue", "Выручка"], ["expenses", "Расходы"], ["profit", "Прибыль"]] as const).map(([k, l]) =>
          <input key={k + String((plan as any)[k] ?? "")} inputMode="decimal" placeholder={l} defaultValue={(plan as any)[k] ?? ""} style={{ width: 120 }}
            onBlur={(e) => savePlan({ [k]: e.target.value.trim() ? parseAmount(e.target.value) : null })} />)}
      </div>
      <textarea key={"n" + (plan as any).note} placeholder="Комментарий к плану: что делаем, на что обратить внимание" defaultValue={(plan as any).note || ""}
        onBlur={(e) => savePlan({ note: e.target.value.trim() })} />
      <div className="muted small">Клиент видит: показатели и ОПиУ из таблицы, ход работы (без задач финансиста и без имён), план. Цены, оплаты и твои деньги — нет.</div>
    </div>
  );
}
