// Общее пространство владельца и сотрудника: workspaces/{ownerUid}
// Владелец сам открывает/закрывает доступ по email (members + open).
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { cabinetKey } from "./clientAccess";
import { db } from "./firebase";
import { useAuth } from "./auth";

// Почта владельца. Если задана — только она видит личные разделы,
// все остальные — максимум «Задания» (если приглашены и доступ открыт).
const OWNER = ((import.meta.env.VITE_OWNER_EMAIL as string) || "").toLowerCase();

const TEST_ACCOUNT_HASH = (import.meta.env.VITE_TEST_ACCOUNT_HASH || "").trim().toLowerCase();
async function isTestAccount(email: string) {
  if (!TEST_ACCOUNT_HASH || !globalThis.crypto?.subtle) return false;
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("") === TEST_ACCOUNT_HASH;
}
export type Role = "client" | "staff" | "student";
export const ROLE_LABELS: Record<Role, string> = { client: "Клиент", staff: "Сотрудник", student: "Ученик" };

export interface Workspace { members: string[]; open: boolean; courses?: { id: string; name: string; icon: string }[]; }
export interface Cabinet { ws: string; cid: string; name: string; detail: string }
interface Ctx { roles?: Role[]; role?: Role; chooseRole?: (role: Role | null) => void; cabinets?: Cabinet[]; chooseCabinet?: (cabinet: Cabinet | null) => void; accessError?: boolean; wsId: string | null; isOwner: boolean; ws: Workspace | null; ready: boolean; clientOf?: string; student?: boolean; demo?: boolean; }
const NONE: Ctx = { wsId: null, isOwner: false, ws: null, ready: true };
const C = createContext<Ctx>({ ...NONE, ready: false });

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<Ctx>({ wsId: null, isOwner: false, ws: null, ready: false });

  const [role, setRole] = useState<Role | null>(null);
  const [selected, setSelected] = useState<Cabinet | null>(null);
  const [testAccess, setTestAccess] = useState<{ cabinets: Cabinet[]; student?: string; staff?: string } | null>(null);
  const [roleWorkspace, setRoleWorkspace] = useState<{ id: string; ws: Workspace | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let unsub = () => {};
    setState({ ...NONE, ready: false });
    (async () => {
      const email = (user.email || "").toLowerCase();
      // Сотрудник: ищем пространство, куда его пригласили
      const ownerByEmail = OWNER ? email === OWNER : null;
      if (ownerByEmail !== true) {
        // Неподтверждённая почта — правила всё равно не пустят
        if (!user.emailVerified) { setState(NONE); return; }
        // Старое приглашение остаётся доступным вместе с новыми привязками.
        try {
          const [legacy, grants] = await Promise.all([
            getDoc(doc(db, "clientIndex", email)),
            getDocs(collection(db, "clientIndex", email, "cabinetGrants")),
          ]);
          const refs = new Map<string, { ws: string; cid: string }>();
          for (const entry of [legacy, ...grants.docs]) {
            const grant = entry.data();
            if (typeof grant?.ws === "string" && typeof grant.cid === "string") {
              refs.set(cabinetKey(grant.ws, grant.cid), { ws: grant.ws, cid: grant.cid });
            }
          }
          const available = await Promise.all([...refs.values()].map(async ({ ws, cid }) => {
            try {
              const project = await getDoc(doc(db, "workspaces", ws, "clients", cid));
              const data = project.data();
              return data?.clientOpen && data.clientEmails?.includes(email)
                ? { ws, cid, name: typeof data.name === "string" && data.name ? data.name : "Кабинет клиента", detail: data.bizType === "services" ? "Услуги" : "Товары" }
                : null;
            } catch (error) {
              if (typeof error === "object" && error !== null
                && "code" in error && error.code === "permission-denied") return null;
              throw error;
            }
          }));
          if (cancelled) return;
          const cabinets = available.filter((item): item is Cabinet => item !== null)
            .sort((a, b) => a.name.localeCompare(b.name, "ru"));
          if (await isTestAccount(email)) {
            const [student, staff] = await Promise.all([
              getDoc(doc(db, "studentIndex", email)),
              getDocs(query(collection(db, "workspaces"), where("members", "array-contains", email))),
            ]);
            const studentWs = student.data()?.ws;
            const studentCard = typeof studentWs === "string"
              ? await getDoc(doc(db, "workspaces", studentWs, "students", email))
              : null;
            if (cancelled) return;
            const staffWs = staff.docs.find((item) => item.id !== user.uid && item.data().open === true);
            setTestAccess({ cabinets, student: studentCard?.exists() ? studentWs : undefined, staff: staffWs?.id });
            setState(NONE);
            return;
          }
          if (cancelled) return;
          if (cabinets.length) {
            setState({
              ...NONE, cabinets,
              wsId: cabinets.length === 1 ? cabinets[0].ws : null,
              clientOf: cabinets.length === 1 ? cabinets[0].cid : undefined,
              chooseCabinet: (cabinet) => setState((current) => ({
                ...current, wsId: cabinet?.ws ?? null, clientOf: cabinet?.cid,
              })),
            });
            return;
          }
        } catch {
          if (!cancelled) setState({ ...NONE, accessError: true });
          return;
        }
        // Ученик: владелец добавил его в «Ученики» (studentIndex/{email})
        const si = await getDoc(doc(db, "studentIndex", email)).catch(() => null);
        if (cancelled) return;
        if (si?.exists()) {
          const w = si.data() as { ws: string };
          unsub = onSnapshot(doc(db, "workspaces", w.ws), (s) => setState({ wsId: w.ws, isOwner: false, ws: s.data() as Workspace, ready: true, student: true }),
            () => setState({ wsId: w.ws, isOwner: false, ws: null, ready: true, student: true }));
          return;
        }
        const inv = await getDocs(query(collection(db, "workspaces"), where("members", "array-contains", email)))
          .catch(() => null);
        if (cancelled) return;
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
    return () => { cancelled = true; unsub(); };
  }, [user?.uid, user?.emailVerified]);

  const roleWs = role === "student" ? testAccess?.student : role === "staff" ? testAccess?.staff : undefined;
  useEffect(() => {
    if (!roleWs) return;
    return onSnapshot(doc(db, "workspaces", roleWs), (snapshot) => {
      setRoleWorkspace({ id: roleWs, ws: snapshot.exists() ? snapshot.data() as Workspace : null });
    }, () => setRoleWorkspace({ id: roleWs, ws: null }));
  }, [roleWs]);

  // Демо-режим: владелец «входит» в демо-кабинет и видит его ровно как клиент
  const demoCid = (() => { try { return sessionStorage.getItem("opora-demo") || ""; } catch { return ""; } })();
  let value = state.isOwner && demoCid ? { ...state, isOwner: false, clientOf: demoCid, demo: true } : state;
  if (testAccess) {
    const { cabinets, student, staff } = testAccess;
    const roles: Role[] = [];
    if (cabinets.length) roles.push("client");
    if (staff) roles.push("staff");
    if (student) roles.push("student");
    const cabinet = role === "client" ? selected : null;
    const ws = roleWorkspace?.id === roleWs ? roleWorkspace?.ws ?? null : null;
    value = {
      ...NONE, roles, role: role ?? undefined,
      chooseRole: (next) => {
        setSelected(next === "client" && cabinets.length === 1 ? cabinets[0] : null);
        setRole(next);
      },
      cabinets: role === "client" ? cabinets : undefined,
      chooseCabinet: setSelected,
      clientOf: cabinet?.cid,
      student: role === "student",
      wsId: cabinet?.ws ?? roleWs ?? null,
      ws,
      ready: !roleWs || roleWorkspace?.id === roleWs,
    };
  }
  return <C.Provider value={value}>{children}</C.Provider>;
}
export const useWorkspace = () => useContext(C);
export const enterDemo = (cid: string) => { try { sessionStorage.setItem("opora-demo", cid); } catch { /* */ } location.hash = "#/"; location.reload(); };
export const exitDemo = () => { try { sessionStorage.removeItem("opora-demo"); } catch { /* */ } location.hash = "#/projects"; location.reload(); };
