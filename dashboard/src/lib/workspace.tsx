// Общее пространство владельца и сотрудника: workspaces/{ownerUid}
// Владелец сам открывает/закрывает доступ по email (members + open).
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { collection, doc, getDocs, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./auth";

export interface Workspace { members: string[]; open: boolean; }
interface Ctx { wsId: string | null; isOwner: boolean; ws: Workspace | null; ready: boolean; }
const C = createContext<Ctx>({ wsId: null, isOwner: false, ws: null, ready: false });

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<Ctx>({ wsId: null, isOwner: false, ws: null, ready: false });

  useEffect(() => {
    if (!user) return;
    let unsub = () => {};
    (async () => {
      const email = (user.email || "").toLowerCase();
      // Сотрудник: ищем пространство, куда его пригласили
      const inv = await getDocs(query(collection(db, "workspaces"), where("members", "array-contains", email)))
        .catch(() => null);
      const foreign = inv?.docs.find((d) => d.id !== user.uid);
      if (foreign) {
        unsub = onSnapshot(foreign.ref, (s) =>
          setState({ wsId: foreign.id, isOwner: false, ws: s.data() as Workspace, ready: true }),
          () => setState({ wsId: null, isOwner: false, ws: null, ready: true }));
        return;
      }
      // Владелец: своё пространство
      const ref = doc(db, "workspaces", user.uid);
      unsub = onSnapshot(ref, (s) => {
        if (!s.exists()) { setDoc(ref, { members: [], open: false }); return; }
        setState({ wsId: user.uid, isOwner: true, ws: s.data() as Workspace, ready: true });
      }, () => setState({ wsId: user.uid, isOwner: true, ws: null, ready: true }));
    })();
    return () => unsub();
  }, [user?.uid]);

  return <C.Provider value={state}>{children}</C.Provider>;
}
export const useWorkspace = () => useContext(C);
