// Демонстрация: демо-кабинеты «Товары» и «Услуги» для показа при продаже. Вход — как клиент.
import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { enterDemo, useWorkspace } from "../lib/workspace";
import { monthKey } from "../lib/catalog";

export default function Demo() {
  const { wsId } = useWorkspace();
  const col = wsId ? collection(db, "workspaces", wsId, "clients") : null;
  // демо-кабинеты для показа при продаже: создаются один раз, «Услуги» каждый месяц обновляются свежими датами; вход — как клиент
  const [demoBusy, setDemoBusy] = useState(false);
  const [demos, setDemos] = useState<{ id: string; bizType?: string; demoSeed?: string }[]>([]);
  useEffect(() => { if (!col) return; getDocs(query(col, where("demo", "==", true))).then((q) => setDemos(q.docs.map((d) => ({ id: d.id, ...(d.data() as { bizType?: string; demoSeed?: string }) })))).catch(() => {}); }, [wsId, demoBusy]);
  async function seedServices(cid: string) {
    const { demoServices } = await import("../lib/demo");
    const crm = collection(db, "workspaces", wsId!, "clients", cid, "crm");
    const old = await getDocs(crm); await Promise.all(old.docs.map((d) => deleteDoc(d.ref)));
    const d = demoServices(), ids: Record<string, string> = {};
    const put = async (ref: string | undefined, data: object) => { const x = await addDoc(crm, data); if (ref) ids[ref] = x.id; };
    for (const x of d.products) await put(x.ref, { kind: "product", name: x.name, price: x.price, descr: x.descr });
    for (const x of d.clients) await put(x.ref, { kind: "client", name: x.name, company: x.company, phone: x.phone, source: x.source, status: x.status, created: d.start });
    for (const x of d.projects) await put(x.ref, { kind: "project", name: x.name, clientId: ids[x.clientRef], productIds: x.productRefs.map((k) => ids[k]), price: x.price, status: "work", start: d.start, monthly: true, payDay: x.payDay });
    for (const x of d.regulars) await put(x.ref, { kind: "regular", name: x.name, amount: x.amount, day: x.day, category: x.category, account: x.account });
    for (const x of d.staff) await put(undefined, { kind: "employee", name: x.name, contact: x.contact, projectIds: x.projectRefs.map((k) => ids[k]), payType: x.payType, amount: x.amount, day: x.day });
    for (const m of d.moves as Record<string, unknown>[]) { const { projectRef, regularRef, ...rest } = m as { projectRef?: string; regularRef?: string };
      await put(undefined, { ...rest, ...(projectRef ? { projectId: ids[projectRef] } : {}), ...(regularRef ? { regularId: ids[regularRef] } : {}) }); }
    await updateDoc(doc(db, "workspaces", wsId!, "clients", cid), { demoSeed: monthKey(new Date()) });
  }
  async function createDemo() {
    if (!col) return;
    setDemoBusy(true);
    try {
      const mk = monthKey(new Date());
      if (!demos.some((x) => x.bizType !== "services")) await addDoc(col, { name: "ДЕМО · Товары", demo: true, flags: { org_ip: true, usn: true, mp: true, sklad: true }, links: {}, monthlyOpen: false, calendarOpen: false, createdAt: serverTimestamp(),
        bizType: "goods", pnlUrl: "demo:goods", clientEmails: [], clientOpen: false, staffEmails: [], kpi: { [mk]: { units: 420, orders: 380, newClients: 160 } }, planSales: { [mk]: 1200000 } });
      if (!demos.some((x) => x.bizType === "services")) { const r = await addDoc(col, { name: "ДЕМО · Услуги", demo: true, flags: { org_ip: true, usn: true }, links: {}, monthlyOpen: false, calendarOpen: false, createdAt: serverTimestamp(),
        bizType: "services", clientEmails: [], clientOpen: false, staffEmails: [] }); await seedServices(r.id); }
    } catch (e) { alert("Не получилось: " + (e instanceof Error ? e.message : e)); }
    setDemoBusy(false);
  }
  async function openDemo(x: { id: string; bizType?: string; demoSeed?: string }) {
    setDemoBusy(true);
    try {
      if (x.bizType === "services" && x.demoSeed !== monthKey(new Date())) await seedServices(x.id);   // раз в месяц — свежие даты
      try { localStorage.removeItem("opora-tour-" + x.id); } catch { /* */ }   // обучение Нейлы показывается при каждом входе в демо
      enterDemo(x.id);
    } catch (e) { alert("Не получилось: " + (e instanceof Error ? e.message : e)); setDemoBusy(false); }
  }
  const dGoods = demos.find((x) => x.bizType !== "services"), dSvc = demos.find((x) => x.bizType === "services");
  return (
    <>
      <h1>Демонстрация</h1>
      <div className="inline">{dGoods && dSvc
        ? <><button disabled={demoBusy} onClick={() => openDemo(dGoods)}>📦 Демо · Товары</button><button disabled={demoBusy} onClick={() => openDemo(dSvc)}>🛠 Демо · Услуги</button></>
        : <button disabled={demoBusy} onClick={createDemo}>{demoBusy ? "Создаю…" : "Создать демо-кабинеты"}</button>}</div>
    </>
  );
}
