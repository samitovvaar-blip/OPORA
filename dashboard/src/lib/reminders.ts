// «Будильник» для задач со временем: пока приложение открыто (или висит в фоне),
// раз в 30 секунд проверяем, не пора ли напомнить. Настоящий push без открытого
// приложения требует сервера — это следующий шаг.
import { Task } from "./types";
import { doneOn, occursOn } from "./recurring";
import { today } from "./store";

const KEY = "opora.reminded";
function seen(): Record<string, 1> { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } }
function mark(k: string) {
  const s = seen(); s[k] = 1;
  const keep = Object.fromEntries(Object.entries(s).filter(([x]) => x.startsWith(today()))); // только сегодняшние
  try { localStorage.setItem(KEY, JSON.stringify(keep)); } catch {}
}

export const canNotify = () => "Notification" in window && Notification.permission === "granted";
export async function askNotify() {
  if (!("Notification" in window)) return "Этот браузер не умеет уведомления. На iPhone поставь приложение на экран «Домой».";
  return (await Notification.requestPermission()) === "granted" ? "Напоминания включены 🔔" : "Уведомления не разрешены";
}

export function checkReminders(tasks: (Task & { id: string })[]) {
  const d = today();
  const now = new Date().toTimeString().slice(0, 5);
  const s = seen();
  for (const t of tasks) {
    if (!t.time || !occursOn(t, d) || doneOn(t, d) || t.time > now) continue;
    const k = `${d}:${t.id}`;
    if (s[k]) continue;
    mark(k);
    if (canNotify()) {
      navigator.serviceWorker?.ready.then((r) => r.showNotification("⏰ " + t.title, {
        body: `Напоминание на ${t.time}`, icon: "icon-192.png", tag: k, data: { url: "./#/planner" },
      })).catch(() => new Notification("⏰ " + t.title));
    }
  }
}
