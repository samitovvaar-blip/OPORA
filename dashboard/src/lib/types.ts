export type ClientStatus = "new" | "call" | "work" | "done" | "pause";
export const clientStatuses: { id: ClientStatus; label: string }[] = [
  { id: "new", label: "Новый" },
  { id: "call", label: "Созвон" },
  { id: "work", label: "В работе" },
  { id: "pause", label: "Пауза" },
  { id: "done", label: "Завершён" },
];
export interface Client { name: string; contact: string; source: string; service: string; status: ClientStatus; note: string; projectId?: string;
  links?: { sheet?: string; folder?: string; chat?: string }; }
export type Repeat = "once" | "daily" | "weekly";
// once: date — день; daily/weekly: date — с какого дня; days — 0=Пн … 6=Вс; doneDates — отметки по дням
export interface Task { title: string; date: string; done: boolean; clientId?: string;
  repeat?: Repeat; days?: number[]; time?: string; doneDates?: string[]; }
export interface Note { text: string; }
export interface Project { name: string; progress: number; deadline?: string; }
