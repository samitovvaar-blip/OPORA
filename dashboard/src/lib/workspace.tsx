import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from "firebase/firestore";
import type { ClientProject } from "./catalog";
import { restoreClientGrants } from "./clientAccess";
import { db } from "./firebase";
import { useAuth } from "./auth";

const OWNER = ((import.meta.env.VITE_OWNER_EMAIL as string) || "").trim().toLowerCase();
export const ROLE_LABELS = { client: "Клиент", staff: "Сотрудник", student: "Ученик" };
type Access =
  | { role: "client"; ws: string; cid: string; name: string; detail: string; project: ClientProject }
  | { role: "staff" | "student"; ws: string; name?: string };

export interface Workspace { members: string[]; open: boolean; courses?: { id: string; name: string; icon: string }[]; }
interface Ctx {
  wsId: string | null;
  isOwner: boolean;
  ws: Workspace | null;
  ready: boolean;
  accessError?: boolean;
  clientOf?: string;
  clientProject?: ClientProject;
  student?: boolean;
  demo?: boolean;
  choices?: Access[];
  picking?: boolean;
  selectAccess?: (access: Access | null) => void;
}

const NONE: Ctx = { wsId: null, isOwner: false, ws: null, ready: true };
const LOADING: Ctx = { ...NONE, ready: false };
const C = createContext<Ctx>(LOADING);

async function findAccess(email: string, uid: string) {
  const [legacy, grants, student, staff] = await Promise.all([
    getDoc(doc(db, "clientIndex", email)),
    getDocs(collection(db, "clientIndex", email, "cabinetGrants")).catch((error) => {
      if (error?.code === "permission-denied") return null;
      throw error;
    }),
    getDoc(doc(db, "studentIndex", email)),
    getDocs(query(collection(db, "workspaces"), where("members", "array-contains", email))),
  ]);
  const refs = new Map<string, { ws: string; cid: string }>();
  for (const entry of [legacy, ...(grants?.docs ?? [])]) {
    const grant = entry.data();
    if (typeof grant?.ws === "string" && typeof grant.cid === "string") {
      refs.set(grant.ws + "/" + grant.cid, { ws: grant.ws, cid: grant.cid });
    }
  }
  const studentWs = student.data()?.ws;
  const otherWorkspaces = staff.docs.filter((item) => item.id !== uid);
  const workspaceIds = new Set([...refs.values()].map(({ ws }) => ws));
  for (const item of otherWorkspaces) workspaceIds.add(item.id);
  if (typeof studentWs === "string") workspaceIds.add(studentWs);

  const workspaces = await Promise.all([...workspaceIds].map(async (ws) => {
    try {
      const snap = await getDocs(query(collection(db, "workspaces", ws, "clients"),
        where("clientOpen", "==", true), where("clientEmails", "array-contains", email)));
      return { ws, docs: snap.docs };
    } catch (error) {
      // Старые правила или отсутствующий индекс не должны блокировать вход по приглашению.
      if (typeof error === "object" && error !== null && "code" in error
        && (error.code === "permission-denied" || error.code === "failed-precondition")) return null;
      throw error;
    }
  }));
  const queried = new Set(workspaces.flatMap((item) => item ? [item.ws] : []));
  const [indexed, studentCard] = await Promise.all([
    Promise.all([...refs.values()].filter(({ ws }) => !queried.has(ws)).map(async ({ ws, cid }) => {
      try {
        return await getDoc(doc(db, "workspaces", ws, "clients", cid));
      } catch (error) {
        if (typeof error === "object" && error !== null
          && "code" in error && error.code === "permission-denied") return null;
        throw error;
      }
    })),
    typeof studentWs === "string" ? getDoc(doc(db, "workspaces", studentWs, "students", email)) : null,
  ]);
  const docs = [...workspaces.flatMap((item) => item?.docs ?? []), ...indexed];
  const choices: Access[] = docs.flatMap((snap): Access[] => {
    const data = snap?.data();
    const ws = snap?.ref.parent.parent?.id;
    if (!snap || !ws || data?.clientOpen !== true || !Array.isArray(data.clientEmails)
      || !data.clientEmails.includes(email)) return [];
    return [{
      role: "client", ws, cid: snap.id, project: { ...data, id: snap.id } as ClientProject,
      name: typeof data.name === "string" && data.name ? data.name : "Кабинет клиента",
      detail: data.bizType === "services" ? "Услуги" : "Товары",
    }];
  }).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ru"));
  const openStaff = otherWorkspaces.filter((item) => item.data().open === true);
  openStaff.forEach((item, index) => {
    const name = item.data().name;
    choices.push({ role: "staff", ws: item.id,
      name: typeof name === "string" && name ? name : openStaff.length > 1 ? `Рабочее пространство ${index + 1}` : undefined });
  });
  if (typeof studentWs === "string" && studentCard?.exists()) choices.push({ role: "student", ws: studentWs });
  return { choices, invitedStaff: otherWorkspaces.length > 0 };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<Ctx>(LOADING);
  const [choices, setChoices] = useState<Access[]>([]);
  const [selected, selectAccess] = useState<Access | null>(null);
  const workspaceId = selected && selected.role !== "client" ? selected.ws : null;
  const [selectedWorkspace, setSelectedWorkspace] = useState<{ id: string; ws: Workspace | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    const email = (user.email || "").toLowerCase();
    let cancelled = false;
    let unsub = () => {};
    setState(LOADING);
    setChoices([]);
    selectAccess(null);

    function openOwnerWorkspace(uid: string) {
      const ref = doc(db, "workspaces", uid);
      let restoring = false;
      unsub = onSnapshot(ref, { includeMetadataChanges: true }, (snapshot) => {
        if (snapshot.exists()) {
          setState({ ...NONE, wsId: uid, isOwner: true, ws: snapshot.data() as Workspace });
          if (!restoring && !snapshot.metadata.fromCache && snapshot.data().cabinetGrantsBackfilled !== true) {
            restoring = true;
            restoreClientGrants(uid).catch((error) => console.warn("Не удалось обновить доступы клиентов", error));
          }
        } else {
          setDoc(ref, { members: [], open: false }).catch(() => {
            if (!cancelled) setState({ ...NONE, accessError: true });
          });
        }
      }, () => setState({ ...NONE, accessError: true }));
    }

    (async () => {
      if (OWNER && email === OWNER) {
        openOwnerWorkspace(user.uid);
        return;
      }
      if (!user.emailVerified || !email) {
        setState(NONE);
        return;
      }
      try {
        const access = await findAccess(email, user.uid);
        if (cancelled) return;
        if (!access.choices.length && !OWNER && !access.invitedStaff) {
          openOwnerWorkspace(user.uid);
          return;
        }
        setChoices(access.choices);
        selectAccess(access.choices.length === 1 ? access.choices[0] : null);
        setState(NONE);
      } catch {
        if (!cancelled) setState({ ...NONE, accessError: true });
      }
    })();
    return () => { cancelled = true; unsub(); };
  }, [user?.uid, user?.email, user?.emailVerified]);

  useEffect(() => {
    if (!workspaceId) return;
    return onSnapshot(doc(db, "workspaces", workspaceId), (snapshot) => {
      setSelectedWorkspace({ id: workspaceId, ws: snapshot.exists() ? snapshot.data() as Workspace : null });
    }, () => setSelectedWorkspace({ id: workspaceId, ws: null }));
  }, [workspaceId]);

  let value = state;
  if (choices.length) {
    const workspaceLoaded = selectedWorkspace?.id === workspaceId;
    value = {
      ...state, choices, selectAccess, picking: !selected,
      wsId: selected?.ws ?? null,
      ws: workspaceLoaded ? selectedWorkspace?.ws ?? null : null,
      ready: state.ready && (!workspaceId || workspaceLoaded),
      clientOf: selected?.role === "client" ? selected.cid : undefined,
      clientProject: selected?.role === "client" ? selected.project : undefined,
      student: selected?.role === "student",
    };
  } else if (state.isOwner) {
    let demoCid = "";
    try { demoCid = sessionStorage.getItem("opora-demo") || ""; } catch { /* */ }
    if (demoCid) value = { ...state, isOwner: false, clientOf: demoCid, demo: true };
  }
  return <C.Provider value={value}>{children}</C.Provider>;
}
export const useWorkspace = () => useContext(C);
export const enterDemo = (cid: string) => { try { sessionStorage.setItem("opora-demo", cid); } catch { /* */ } location.hash = "#/"; location.reload(); };
export const exitDemo = () => { try { sessionStorage.removeItem("opora-demo"); } catch { /* */ } location.hash = "#/projects"; location.reload(); };
