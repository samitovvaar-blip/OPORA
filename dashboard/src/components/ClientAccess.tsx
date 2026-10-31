// Владелец: доступ клиента к кабинету, ссылка на P&L из таблицы, план на следующий месяц
import { FormEvent, useEffect, useState } from "react";
import { arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import type { Product } from "../pages/Products";
import { ClientProject, monthKey } from "../lib/catalog";
import { sliceMonth } from "../lib/sheetPnl";
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

  // «Сдано»: сохраняем снимок цифр месяца из таблицы; снятие отметки — удаляем снимок (месяц снова живой)
  const [freezing, setFreezing] = useState(false);
  async function toggleClosed(mk: string, on: boolean) {
    const snapRef = doc(db, "workspaces", wsId, "clients", p.id, "snapshots", mk);
    if (on) {
      if (!confirm("Снять «Сдано»? Цифры месяца снова будут браться из таблицы.")) return;
      await deleteDoc(snapRef).catch(() => {}); await updateDoc(ref, { closedMonths: arrayRemove(mk) }); return;
    }
    if (p.pnlUrl) {
      setFreezing(true);
      try {
        const j = await (await fetch(p.pnlUrl + "&fresh=1")).json();
        if (j.error) throw new Error(j.error);
        await setDoc(snapRef, sliceMonth(j, mk));
      } catch (e: any) { setFreezing(false); return alert("Не удалось сохранить цифры месяца: " + (e?.message || e) + ". Попробуй ещё раз."); }
      setFreezing(false);
    }
    await updateDoc(ref, { closedMonths: arrayUnion(mk) });
  }

  // Тариф клиента: выбираешь из своих продуктов — копируем название, цену и что входит в карточку клиента
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => { const u = auth.currentUser; if (!u) return;
    getDocs(collection(db, "users", u.uid, "products")).then((q) => setProducts(q.docs.map((d) => d.data() as Product).sort((a, b) => (a.order || 0) - (b.order || 0)))).catch(() => {}); }, []);
  const pickTariff = (title: string) => {
    const pr = products.find((x) => x.title === title); if (!pr) return updateDoc(ref, { tariff: deleteField() });
    const items = (pr.sections?.length ? pr.sections.flatMap((x) => x.items) : pr.includes) || [];
    updateDoc(ref, { tariff: { name: pr.title, price: pr.price, period: pr.period || "в месяц", payDay: p.tariff?.payDay ?? null, items } });
  };

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
      <div className="small" style={{ marginTop: 10 }}><b>💳 Тариф клиента</b> <span className="muted">— клиент видит внизу меню</span></div>
      <div className="inline" style={{ margin: "4px 0" }}>
        <select value={p.tariff?.name || ""} onChange={(e) => pickTariff(e.target.value)}>
          <option value="">— не выбран —</option>{products.map((x) => <option key={x.title} value={x.title}>{x.title}</option>)}</select>
        {p.tariff && <>
          <input type="number" style={{ width: 120 }} key={"tp" + p.tariff.price} defaultValue={p.tariff.price} title="Сумма оплаты"
            onBlur={(e) => updateDoc(ref, { "tariff.price": Number(e.target.value) || 0 })} />
          <input type="number" min={1} max={31} style={{ width: 90 }} key={"td" + (p.tariff.payDay ?? "")} defaultValue={p.tariff.payDay ?? ""} placeholder="день оплаты"
            onBlur={(e) => updateDoc(ref, { "tariff.payDay": e.target.value ? Number(e.target.value) : null })} />
        </>}
      </div>
      <div className="small" style={{ marginTop: 10 }}><b>✓ Сдано клиенту</b> <span className="muted">— отметь месяц после созвона. Цифры месяца замораживаются: правки в таблице их больше не меняют.</span></div>
      {freezing && <div className="small muted">🧊 Сохраняю цифры месяца…</div>}
      <div className="chips" style={{ margin: "4px 0" }}>
        {[-3, -2, -1, 0].map((k) => { const mk = addMonths(monthKey(new Date()), k); const on = (p.closedMonths || []).includes(mk);
          const [y, m] = mk.split("-").map(Number);
          return <button key={mk} className={`chipbtn ${on ? "on" : ""}`}
            onClick={() => toggleClosed(mk, on)}>
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
