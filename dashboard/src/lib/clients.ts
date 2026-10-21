// Подписки на проекты-клиенты и отметки месяца (общее пространство владельца)
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { useWorkspace } from "./workspace";
import { ClientProject, Mark } from "./catalog";

export function useClientProjects() {
  const { wsId, isOwner } = useWorkspace();
  const [list, setList] = useState<ClientProject[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!wsId) return;
    const col = collection(db, "workspaces", wsId, "clients");
    const put = (part: string) => (s: any) => setParts((p) => ({ ...p, [part]: s.docs.map((d: any) => ({ id: d.id, ...d.data() })) }));
    const err = (e: any) => setError(e.code === "permission-denied" ? "Доступ закрыт владельцем" : e.message);
    // Сотрудник читает только открытые ему проекты — запросы должны совпадать с правилами
    const subs = isOwner ? [onSnapshot(col, put("all"), err)]
      : [onSnapshot(query(col, where("monthlyOpen", "==", true)), put("m"), err),
         onSnapshot(query(col, where("calendarOpen", "==", true)), put("c"), err)];
    return () => subs.forEach((u) => u());
  }, [wsId, isOwner]);
  const [parts, setParts] = useState<Record<string, ClientProject[]>>({});
  useEffect(() => {
    const m = new Map<string, ClientProject>();
    Object.values(parts).flat().forEach((p) => m.set(p.id, p));
    setList([...m.values()].sort((a, b) => a.name.localeCompare(b.name, "ru")));
  }, [parts]);
  return { list, error };
}

export function useMarks(projectIds: string[], mk: string) {
  const { wsId } = useWorkspace();
  const [marks, setMarks] = useState<Record<string, Record<string, Mark>>>({});
  const idsKey = projectIds.join(",");
  useEffect(() => {
    if (!wsId) return;
    const subs = projectIds.map((pid) => onSnapshot(collection(db, "workspaces", wsId, "clients", pid, "months", mk, "items"),
      (s) => setMarks((m) => ({ ...m, [pid]: Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Mark])) })), () => {}));
    return () => subs.forEach((u) => u());
  }, [wsId, idsKey, mk]);
  const setMark = (pid: string, itemId: string, data: Mark) =>
    setDoc(doc(db, "workspaces", wsId!, "clients", pid, "months", mk, "items", itemId), data, { merge: true });
  return { marks, setMark };
}
