export type ClientStatus = "new" | "call" | "work" | "done" | "pause";
export const clientStatuses: { id: ClientStatus; label: string }[] = [
  { id: "new", label: "Новый" },
  { id: "call", label: "Созвон" },
  { id: "work", label: "В работе" },
  { id: "pause", label: "Пауза" },
  { id: "done", label: "Завершён" },
];
export interface Client { name: string; contact: string; source: string; service: string; status: ClientStatus; note: string; }
export interface Task { title: string; date: string; done: boolean; clientId?: string; }
export interface Note { text: string; }
export interface Project { name: string; progress: number; deadline?: string; }
