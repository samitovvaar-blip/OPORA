// Личные финансы (только владелец): users/{uid}/payments, expenses, plans/{YYYY-MM}
import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./auth";

export interface Payment { projectId: string; projectName: string; amount: number; date: string; note?: string; }
export interface Expense { title: string; amount: number; date: string; category?: string; }
export interface PlanLine { title: string; amount: number; }
export interface Plan { income: PlanLine[]; expenses: PlanLine[]; }

export const rub = (n: number) => Math.round(n).toLocaleString("ru-RU") + " ₽";
export const parseAmount = (s: string) => { const n = Number(String(s).replace(/\s/g, "").replace(",", ".")); return isFinite(n) && n > 0 ? n : 0; };

export function usePlan(mk: string) {
  const { user } = useAuth();
  const [plan, setPlan] = useState<Plan>({ income: [], expenses: [] });
  const ref = doc(db, "users", user!.uid, "plans", mk);
  useEffect(() => onSnapshot(ref, (s) => setPlan({ income: [], expenses: [], ...(s.data() as Plan | undefined) })), [user?.uid, mk]);
  return { plan, save: (p: Plan) => setDoc(ref, p) };
}
