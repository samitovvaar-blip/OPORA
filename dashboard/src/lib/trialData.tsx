import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { monthKey, STAGES, shown, type ClientProject, type Mark } from "./catalog";
import { demoServices } from "./demo";
import type { TrialKind } from "./trial";

type Row = { id: string; kind: string; [field: string]: unknown };
type Data = { project: ClientProject; crm: Row[] };
type TrialData = Data & {
  locked: boolean;
  marks: Record<string, Mark>;
  patchProject: (patch: Record<string, unknown>) => Promise<void>;
  addCrm: (data: object) => Promise<{ id: string } | undefined>;
  updateCrm: (id: string, data: object) => Promise<void>;
  deleteCrm: (id: string) => void;
};
const Context = createContext<TrialData | null>(null);
export const useTrialData = () => useContext(Context);

function seed(kind: TrialKind, id: string): Data {
  const now = new Date();
  const mk = monthKey(now);
  const next = monthKey(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const project: ClientProject = {
    id, name: kind === "goods" ? "Демо · Товары" : "Демо · Услуги", bizType: kind,
    flags: { org_ip: true, usn: true, mp: kind === "goods", sklad: kind === "goods" },
    monthlyOpen: false, calendarOpen: false, opEdit: true,
    ...(kind === "goods" ? {
      pnlUrl: "demo:goods",
      kpi: { [mk]: { units: 420, orders: 380, newClients: 160 } },
      planSales: { [mk]: 1200000, [next]: 1300000 },
      plans: { [next]: { note: "Проверить оборачиваемость и подготовить план закупок." } },
      payCal: { [next]: { start: 150000, items: [
        { id: "rent", name: "Аренда склада", dept: "4", amount: 60000, kind: "once", day: 5 },
        { id: "supplies", name: "Оплата поставщику", dept: "1", amount: 210000, kind: "once", day: 12 },
      ] } },
      workStatus: { [mk]: { loadedTo: now.toISOString().slice(0, 10), reportsDone: true, taxesPaid: false } },
      calls: [{ id: "first-call", at: now.toISOString(), text: "Обсудили закупки и цели на следующий месяц." }],
    } : {}),
  };
  if (kind === "goods") return { project, crm: [] };
  const samples = demoServices();
  const crm: Row[] = [
    ...samples.products.map(({ ref, ...data }) => ({ id: ref, kind: "product", ...data })),
    ...samples.clients.map(({ ref, phone: _phone, ...data }) => ({ id: ref, kind: "client", created: samples.start, ...data })),
    ...samples.projects.map(({ ref, clientRef, productRefs, ...data }) => ({
      id: ref, kind: "project", clientId: clientRef, productIds: productRefs, status: "work", start: samples.start, monthly: true, ...data,
    })),
    ...samples.staff.map(({ projectRefs, contact: _contact, ...data }, i) => ({ id: "employee-" + i, kind: "employee", projectIds: projectRefs, ...data })),
    ...samples.regulars.map(({ ref, ...data }) => ({ id: ref, kind: "regular", ...data })),
    ...samples.moves.map((item, i) => {
      const { projectRef, regularRef, ...data } = item as Record<string, unknown>;
      return { ...data, id: "move-" + i, kind: "move", projectId: projectRef, regularId: regularRef };
    }),
  ];
  return { project, crm };
}

function applyPatch(project: ClientProject, patch: Record<string, unknown>) {
  const next = structuredClone(project);
  for (const [path, value] of Object.entries(patch)) {
    const fields = path.split(".");
    if (fields.some((field) => ["__proto__", "constructor", "prototype"].includes(field))) continue;
    const field = fields.pop()!;
    let target = next as unknown as Record<string, unknown>;
    for (const key of fields) {
      target[key] ??= {};
      target = target[key] as Record<string, unknown>;
    }
    if (value === undefined) delete target[field];
    else target[field] = value;
  }
  return next;
}

export function TrialDataProvider({ kind, storageKey, projectId, editUntil, locked, children }: {
  kind: TrialKind; storageKey: string; projectId: string; editUntil: number; locked: boolean; children: ReactNode;
}) {
  const [data, setData] = useState<Data>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved?.project?.id === projectId && Array.isArray(saved.crm)) return saved;
    } catch { /* Start with sample data when storage is unavailable. */ }
    return seed(kind, projectId);
  });
  const latest = useRef(data);
  function change(update: (value: Data) => Data) {
    if (locked || Date.now() >= editUntil) return false;
    const next = update(latest.current);
    latest.current = next;
    setData(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Changes remain in this tab. */ }
    return true;
  }
  const value: TrialData = {
    ...data, locked,
    marks: Object.fromEntries(STAGES.flatMap((stage) => stage.items)
      .filter((item) => shown(item, data.project.flags)).slice(0, 6)
      .map((item) => [item.id, { done: true }])),
    patchProject: async (patch) => { change((current) => ({ ...current, project: applyPatch(current.project, patch) })); },
    addCrm: async (row) => {
      const id = crypto.randomUUID();
      return change((current) => ({ ...current, crm: [...current.crm, { ...row, id } as Row] })) ? { id } : undefined;
    },
    updateCrm: async (id, patch) => { change((current) => ({ ...current, crm: current.crm.map((row) => row.id === id ? { ...row, ...patch } : row) })); },
    deleteCrm: (id) => { change((current) => ({ ...current, crm: current.crm.filter((row) => row.id !== id) })); },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
