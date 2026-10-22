// Повторяющиеся задачи: один раз / каждый день / по дням недели
import { Task } from "./types";

export const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const wd = (ymd: string) => (new Date(ymd + "T12:00:00").getDay() + 6) % 7;
export const isRecurring = (t: Task) => t.repeat === "daily" || t.repeat === "weekly";

export function occursOn(t: Task, ymd: string) {
  if (!isRecurring(t)) return t.date === ymd;
  if (t.date && ymd < t.date) return false;
  return t.repeat === "daily" || (t.days || []).includes(wd(ymd));
}
export const doneOn = (t: Task, ymd: string) => (isRecurring(t) ? (t.doneDates || []).includes(ymd) : t.done);

// Патч для отметки «сделано» на конкретный день
export function togglePatch(t: Task, ymd: string): Partial<Task> {
  if (!isRecurring(t)) return { done: !t.done };
  const set = new Set(t.doneDates || []);
  set.has(ymd) ? set.delete(ymd) : set.add(ymd);
  return { doneDates: [...set].sort().slice(-90) }; // храним последние 90 отметок
}

export function describe(t: Task) {
  const at = t.time ? ` в ${t.time}` : "";
  if (t.repeat === "daily") return "каждый день" + at;
  if (t.repeat === "weekly") {
    const d = [...(t.days || [])].sort();
    if (d.join() === "0,1,2,3,4") return "по будням" + at;
    return d.map((i) => WD[i]).join(", ") + at;
  }
  return (t.date || "без даты") + at;
}
