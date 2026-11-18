import { useEffect, useState } from "react";
import { collection } from "firebase/firestore";
import { db } from "./firebase";

export type FeedbackRole = "staff" | "student";
const moscow = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow", year: "numeric", month: "numeric", day: "numeric",
});
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export function feedbackPeriod(now = new Date()) {
  const parts = moscow.formatToParts(now);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  const date = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day + 6) % 7);
  return { week: isoDate(date), isMonday: day === 1 };
}

export function useFeedbackPeriod() {
  const [period, setPeriod] = useState(() => feedbackPeriod());
  useEffect(() => {
    const refresh = () => {
      const next = feedbackPeriod();
      setPeriod((current) => current.week === next.week && current.isMonday === next.isMonday ? current : next);
    };
    const timer = setInterval(refresh, 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return period;
}

export const feedbackResponses = (ws: string, week: string, role: FeedbackRole) =>
  collection(db, "workspaces", ws, "feedbackWeeks", week, "roles", role, "responses");
