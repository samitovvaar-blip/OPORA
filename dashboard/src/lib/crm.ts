// Бизнес-контур: Yandex Cloud. В Firebase ничего не сохраняется —
// передаём только ID-токен для проверки на стороне шлюза.
import { auth } from "./firebase";

export type LeadStatus = "new" | "in_progress" | "won" | "lost";
export interface Lead { id: string; title: string; client: string; status: LeadStatus; amount: number; createdAt: string; }
export interface Client { id: string; name: string; phone: string; leads: number; }

const API = import.meta.env.VITE_CRM_API_URL as string;

async function call<T>(path: string): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`CRM ${r.status}`);
  return r.json();
}

const mockLeads: Lead[] = [
  { id: "1", title: "Ремонт офиса", client: "ООО Вектор", status: "new", amount: 450000, createdAt: "2026-10-12" },
  { id: "2", title: "Поставка оборудования", client: "ИП Смирнов", status: "in_progress", amount: 120000, createdAt: "2026-10-10" },
  { id: "3", title: "Консультация", client: "Альфа Групп", status: "won", amount: 35000, createdAt: "2026-10-05" },
  { id: "4", title: "Монтаж", client: "ООО Вектор", status: "in_progress", amount: 210000, createdAt: "2026-10-09" },
  { id: "5", title: "Аудит", client: "Бета", status: "lost", amount: 60000, createdAt: "2026-10-01" },
];
const mockClients: Client[] = [
  { id: "c1", name: "ООО Вектор", phone: "+7 900 000-00-01", leads: 2 },
  { id: "c2", name: "ИП Смирнов", phone: "+7 900 000-00-02", leads: 1 },
  { id: "c3", name: "Альфа Групп", phone: "+7 900 000-00-03", leads: 1 },
  { id: "c4", name: "Бета", phone: "+7 900 000-00-04", leads: 1 },
];

export const getLeads = () => (API ? call<Lead[]>("/leads") : Promise.resolve(mockLeads));
export const getClients = () => (API ? call<Client[]>("/clients") : Promise.resolve(mockClients));
export const isMock = !API;
