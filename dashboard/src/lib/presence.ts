// Онлайн сотрудника: пока вкладка открыта и есть активность (мышь, клавиши, касания) —
// раз в минуту отмечаемся. Нет активности 5 минут — время не засчитывается.
// workspaces/{ws}/presence/{email}: { lastSeen, days: { "2026-10-31": минуты } }
import { doc, increment, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { today } from "./store";

export function startPresence(wsId: string, email: string) {
  let lastAct = Date.now();
  const act = () => { lastAct = Date.now(); };
  const evs = ["mousemove", "keydown", "touchstart", "scroll", "click"];
  evs.forEach((e) => window.addEventListener(e, act, { passive: true }));
  const ref = doc(db, "workspaces", wsId, "presence", email.toLowerCase());
  const beat = () => {
    if (document.visibilityState !== "visible" || Date.now() - lastAct > 5 * 60000) return;
    setDoc(ref, { lastSeen: serverTimestamp(), days: { [today()]: increment(1) } }, { merge: true }).catch(() => {});
  };
  beat();
  const t = setInterval(beat, 60000);
  return () => { clearInterval(t); evs.forEach((e) => window.removeEventListener(e, act)); };
}
