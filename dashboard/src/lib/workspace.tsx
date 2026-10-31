// Общее пространство владельца и сотрудника: workspaces/{ownerUid}
// Владелец сам открывает/закрывает доступ по email (members + open).
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./auth";

// Почта владельца. Если задана — только она видит личные разделы,
// все остальные — максимум «Задания» (если приглашены и доступ открыт).
const OWNER = ((import.meta.env.VITE_OWNER_EMAIL as string) || "").toLowerCase();

export interface Workspace { members: string[]; open: boolean; courses?: { id: string; name: string; icon: string }[]; }
interface Ctx { wsId: string | null; isOwner: boolean; ws: Workspace | null; ready: boolean; clientOf?: string; student?: boolean; }
const NONE: Ctx = { wsId: null, isOwner: false, ws: null, ready: true };
const C = createContext<Ctx>({ ...NONE, ready: false });

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<Ctx>({ wsId: null, isOwner: false, ws: null, ready: false });

  useEffect(() => {
    if (!user) return;
    let unsub = () => {};
    (async () => {
      const email = (user.email || "").toLowerCase();
      // Сотрудник: ищем пространство, куда его пригласили
      const ownerByEmail = OWNER ? email === OWNER : null;
      if (ownerByEmail !== true) {
        // Неподтверждённая почта — правила всё равно не пустят
        if (!user.emailVerified) { setState(NONE); return; }
        // Клиент: владелец выдал доступ к кабинету проекта (clientIndex/{email})
        const ci = await getDoc(doc(db, "clientIndex", email)).catch(() => null);
        if (ci?.exists()) {
          const c = ci.data() as { ws: string; cid: string };
          setState({ wsId: c.ws, isOwner: false, ws: null, ready: true, clientOf: c.cid });
          return;
        }
        // Ученик: владелец добавил его в «Ученики» (studentIndex/{email})
        const si = await getDoc(doc(db, "studentIndex", email)).catch(() => null);
        if (si?.exists()) {
          const w = si.data() as { ws: string };
          unsub = onSnapshot(doc(db, "workspaces", w.ws), (s) => setState({ wsId: w.ws, isOwner: false, ws: s.data() as Workspace, ready: true, student: true }),
            () => setState({ wsId: w.ws, isOwner: false, ws: null, ready: true, student: true }));
          return;
        }
        const inv = await getDocs(query(collection(db, "workspaces"), where("members", "array-contains", email)))
          .catch(() => null);
        const foreign = inv?.docs.find((d) => d.id !== user.uid);
        if (foreign) {
          unsub = onSnapshot(foreign.ref, (s) =>
            setState({ wsId: foreign.id, isOwner: false, ws: s.data() as Workspace, ready: true }),
            () => setState(NONE));
          return;
        }
        // Не владелец и не приглашён (или ошибка) — никаких личных разделов
        if (ownerByEmail === false || !inv) { setState(NONE); return; }
      }
      // Владелец: своё пространство
      const ref = doc(db, "workspaces", user.uid);
      unsub = onSnapshot(ref, (s) => {
        if (!s.exists()) { setDoc(ref, { members: [], open: false }); return; }
        setState({ wsId: user.uid, isOwner: true, ws: s.data() as Workspace, ready: true });
      }, () => setState({ wsId: user.uid, isOwner: true, ws: null, ready: true }));
    })();
    return () => unsub();
  }, [user?.uid, user?.emailVerified]);

  return <C.Provider value={state}>{children}</C.Provider>;
}
export const useWorkspace = () => useContext(C);
