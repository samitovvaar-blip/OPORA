import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { feedbackResponses, useFeedbackPeriod } from "../lib/feedback";
import { useWorkspace } from "../lib/workspace";

export default function FeedbackReminder() {
  const { wsId, isOwner, clientOf, student, ws } = useWorkspace();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { week, isMonday } = useFeedbackPeriod();
  const [pendingKey, setPendingKey] = useState("");
  const [dismissedKey, setDismissedKey] = useState("");
  const role = student ? "student" : "staff";
  const email = user?.email?.toLowerCase();
  const eligible = !!wsId && !!email && !!user?.emailVerified && !isOwner && !clientOf
    && (student || ws?.open === true);
  const key = eligible ? "opora-feedback:" + wsId + "/" + role + "/" + user?.uid + "/" + week : "";

  useEffect(() => {
    setPendingKey("");
    if (!isMonday || !key || !wsId || !email) return;
    try { if (localStorage.getItem(key)) return; } catch { /* */ }
    return onSnapshot(doc(feedbackResponses(wsId, week, role), email), { includeMetadataChanges: true },
      (snapshot) => {
        if (!snapshot.metadata.fromCache) setPendingKey(snapshot.exists() ? "" : key);
      }, () => setPendingKey(""));
  }, [isMonday, key, wsId, email, week, role]);

  if (!isMonday || !key || pendingKey !== key || dismissedKey === key || pathname === "/neila") return null;
  return <aside className="feedback-reminder">
    <img src="neyla.jpg" alt="" />
    <div>
      <div role="status"><b>Нейла</b><div>Пройдите опрос обратной связи.</div></div>
      <Link to="/neila">Открыть опрос</Link>
    </div>
    <button type="button" aria-label="Закрыть напоминание" onClick={() => {
      setDismissedKey(key);
      try { localStorage.setItem(key, "1"); } catch { /* */ }
    }}>×</button>
  </aside>;
}
