import { doc, getDocFromServer, runTransaction } from "firebase/firestore";
import { db } from "./firebase";

export const trialKinds = ["goods", "services", "staff"] as const;
export type TrialKind = typeof trialKinds[number];
export const trialNames = { goods: "Демо · Товары", services: "Демо · Услуги", staff: "Демо · Сотрудник" };
export const DAY = 86_400_000;
export const TRIAL_DURATION = 3 * DAY;
export interface TrialInvite {
  owner: string;
  issuedAt: { toMillis(): number };
  offers: string[];
}

export const trialRef = (email: string) => doc(db, "demoInvites", email);

export async function findTrial(email: string) {
  try {
    const snap = await getDocFromServer(trialRef(email));
    const invite = snap.data() as TrialInvite | undefined;
    return invite && Date.now() < invite.issuedAt.toMillis() + TRIAL_DURATION ? invite : null;
  } catch (error) {
    if ((error as { code?: string })?.code !== "permission-denied") console.warn("Не удалось проверить демо-доступ", error);
    return null;
  }
}

export async function endTrial(owner: string, email: string) {
  try {
    await runTransaction(db, async (transaction) => {
      const ref = trialRef(email);
      const snap = await transaction.get(ref);
      if (snap.data()?.owner === owner) transaction.delete(ref);
    });
  } catch (error) {
    // Рабочий доступ уже сохранён. При следующем входе он имеет приоритет над демо.
    if ((error as { code?: string })?.code !== "permission-denied") console.warn("Не удалось закрыть демо", error);
  }
}
