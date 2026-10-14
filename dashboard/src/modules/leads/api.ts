// Бизнес-контур: ТОЛЬКО Yandex Cloud. Никаких импортов Firebase в этом модуле.
// Перенесено 1:1 из antonioavanzato/opora (js/api.js, js/config.js).
export const API_BASE = "https://d5dvkugdfacr66cp5re7.g2n58e0c.apigw.yandexcloud.net";
export const VAPID_PUBLIC_KEY = "BOCHfX4UX6WKg_XgHOo5R0fhlLlUdi9JuE1Z6utsq065iXCOBrgTYJdF4jfZYPNOoRhp-LWReAw3-1T9GpGQX0s";

const SESSION_KEY = "opora.session";

export type Status = "new" | "contacted" | "call" | "client" | "lost";
export const STATUSES: { id: Status; label: string }[] = [
  { id: "new", label: "Новая" },
  { id: "contacted", label: "Связалась" },
  { id: "call", label: "Созвон назначен" },
  { id: "client", label: "Клиент" },
  { id: "lost", label: "Отказ" },
];
export interface Lead {
  id: string; createdAt: string; name: string; contactType: "Telegram" | "Телефон"; contact: string;
  pain: string; form: string; sphere: string; team: string; cash?: string; page?: string;
  status: Status; notes?: { at: string; text: string }[];
}
interface Session { token: string; user: { email: string } }

export function session(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
}
function writeSession(s: Session | null) {
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch {}
}

export class AuthError extends Error {}

async function call<T>(path: string, { method = "GET", body }: { method?: string; body?: unknown } = {}): Promise<T> {
  const s = session();
  const res = await fetch(API_BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(s?.token ? { Authorization: "Bearer " + s.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw new Error("Нет связи с Yandex Cloud: облако недоступно или не разрешён этот адрес (CORS). Данные в облаке не пострадали.");
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/auth/login") { writeSession(null); throw new AuthError("Сессия истекла, войдите снова."); }
  if (!res.ok) throw new Error(data.error || "Ошибка сервера (" + res.status + ").");
  return data as T;
}

export const api = {
  async login(email: string, password: string) {
    const s = await call<Session>("/auth/login", { method: "POST", body: { email, password } });
    writeSession(s); return s;
  },
  logout: () => writeSession(null),
  listLeads: () => call<Lead[]>("/leads"),
  updateLead: (id: string, patch: { status: Status }) => call<Lead>("/leads/" + encodeURIComponent(id), { method: "PATCH", body: patch }),
  addNote: (id: string, text: string) => call<Lead>("/leads/" + encodeURIComponent(id) + "/notes", { method: "POST", body: { text } }),
  deleteLead: (id: string) => call("/leads/" + encodeURIComponent(id), { method: "DELETE" }),
  bulkLeads: (ids: string[], action: "status" | "delete", status?: Status) =>
    call<{ done: string[]; missing: string[] }>("/leads/bulk", { method: "POST", body: { ids, action, status } }),
  savePush: (sub: PushSubscriptionJSON) => call("/push/subscribe", { method: "POST", body: sub }),
};

/* ---------- утилиты (из app.js) ---------- */
export const statusLabel = (id: string) => STATUSES.find((s) => s.id === id)?.label || id;
export const shortPain = (p: string) => (p || "").replace(" — нужна отчётность в срок", "").replace(" и сценариям", "");
export function fmtDate(iso: string) {
  const d = new Date(iso); if (isNaN(+d)) return "";
  const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return "Сегодня, " + time;
  if (d.toDateString() === y.toDateString()) return "Вчера, " + time;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) + ", " + time;
}
// Рекомендуемый пакет (эвристика из docs/spec.md, пакеты с 13.10.2026)
export function recommend(l: Lead) {
  const big = l.team === "больше 15" ? " (расчёт)" : "";
  if (/прогноз/i.test(l.pain)) return "Контроль" + big;
  if (/хаос/i.test(l.pain)) return "Аудит + Цифры" + big;
  if (/прибыль/i.test(l.pain)) return "Цифры" + big;
  if (l.team === "больше 15") return "Контроль (расчёт)";
  return "Бухгалтерия";
}
export function contactLink(l: Lead) {
  if (l.contactType === "Телефон") return "tel:+" + String(l.contact).replace(/\D/g, "");
  return "https://t.me/" + String(l.contact).replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "");
}
export const periodFrom = (p: string) => (p === "all" ? 0 : Date.now() - Number(p) * 86400e3);
export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
};

export function exportCsv(list: Lead[]) {
  const cols: [string, (l: Lead) => string][] = [
    ["Дата", (l) => new Date(l.createdAt).toLocaleString("ru-RU")], ["Имя", (l) => l.name], ["Способ связи", (l) => l.contactType],
    ["Контакт", (l) => l.contact], ["Запрос", (l) => l.pain], ["Форма", (l) => l.form], ["Сфера", (l) => l.sphere],
    ["Сотрудников", (l) => l.team], ["Знает остаток", (l) => l.cash || ""], ["Пакет", recommend],
    ["Статус", (l) => statusLabel(l.status)], ["Заметки", (l) => (l.notes || []).map((n) => n.text).join(" | ")],
  ];
  const cell = (v: string) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const csv = "﻿" + [cols.map((c) => cell(c[0])).join(";"), ...list.map((l) => cols.map((c) => cell(c[1](l))).join(";"))].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "opora-zayavki-" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- push ---------- */
function b64ToUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export async function enablePush(): Promise<string> {
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
  if (!("serviceWorker" in navigator) || !("Notification" in window) || !("PushManager" in window))
    return /iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone
      ? "На iPhone: «Поделиться» → «На экран Домой», затем откройте OPORA с главного экрана"
      : "Этот браузер не поддерживает уведомления";
  if (Notification.permission === "denied") return "Уведомления запрещены в настройках";
  if ((await Notification.requestPermission()) !== "granted") return "Уведомления не разрешены";
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(VAPID_PUBLIC_KEY) }));
  await api.savePush(sub.toJSON());
  reg.showNotification("ОПОРА · уведомления включены", { body: "Новые заявки с сайта будут приходить сюда.", icon: "icon-192.png", tag: "opora-enabled", data: { url: "./#/leads" } });
  return "Уведомления включены";
}
