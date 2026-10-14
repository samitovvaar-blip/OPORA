// Личный контур: всё хранится в Firestore users/{uid}/<коллекция>
import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./auth";

export function useCollection<T>(name: string) {
  const { user } = useAuth();
  const [items, setItems] = useState<(T & { id: string })[]>([]);
  const [error, setError] = useState("");
  const col = collection(db, "users", user!.uid, name);

  useEffect(() => onSnapshot(query(col, orderBy("createdAt", "desc")),
    (s) => setItems(s.docs.map((d) => ({ id: d.id, ...(d.data() as T) }))),
    (e) => setError(e.message)), [user?.uid, name]);

  return {
    items, error,
    add: (data: Partial<T>) => addDoc(col, { ...data, createdAt: serverTimestamp() }),
    update: (id: string, data: Partial<T>) => updateDoc(doc(col, id), data as Record<string, unknown>),
    remove: (id: string) => deleteDoc(doc(col, id)),
  };
}

export const today = () => new Date().toLocaleDateString("sv-SE");
