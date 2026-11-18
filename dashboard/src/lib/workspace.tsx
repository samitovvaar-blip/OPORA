import { findTrial, trialKinds, trialNames, trialRef, TRIAL_DURATION, type TrialInvite, type TrialKind } from "./trial";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from "firebase/firestore";
import type { ClientProject } from "./catalog";
import { restoreClientGrants } from "./clientAccess";
import { db } from "./firebase";
import { rememberAccess, restoredAccess } from "./activeAccess";
import { useAuth } from "./auth";

const OWNER = ((import.meta.env.VITE_OWNER_EMAIL as string) || "").trim().toLowerCase();
export const ROLE_LABELS = { client: "Клиент", staff: "Сотрудник", student: "Ученик", trial: "Демо", owner: "Владелец" };
type Access =
  | { role: "owner"; ws: string; name: string }
  | { role: "trial"; ws: string; cid: TrialKind; name: string; email: string }
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
  trial?: Extract<Access, { role: "trial" }>;
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

function trialChoices(email: string, invite: TrialInvite | null): Access[] {
  return invite ? trialKinds.map((cid) => ({
    role: "trial", ws: invite.owner, cid, name: trialNames[cid], email,
  })) : [];
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<Ctx>(LOADING);
  const [realChoices, setRealChoices] = useState<Access[]>([]);
  const [demoChoices, setDemoChoices] = useState<Access[]>([]);
  const [selected, setSelected] = useState<Access | null>(null);
  const workspaceId = selected && (selected.role === "staff" || selected.role === "student") ? selected.ws : null;
  const [selectedWorkspace, setSelectedWorkspace] = useState<{ id: string; ws: Workspace | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    const email = (user.email || "").toLowerCase();
    let cancelled = false;
    let unsub = () => {};
    setState(LOADING);
    setRealChoices([]);
    setDemoChoices([]);
    setSelected(null);

    function openOwnerWorkspace(uid: string) {
      const ref = doc(db, "workspaces", uid);
      let restoring = false;
      setSelected({ role: "owner", ws: uid, name: "Владелец" });
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
        if (user.emailVerified) {
          const invite = await findTrial(email);
          if (!cancelled && invite) {
            const demos = trialChoices(email, invite);
            setDemoChoices(demos);
            setSelected(restoredAccess(user.uid, [{ role: "owner", ws: user.uid, name: "Владелец" }, ...demos])
              ?? { role: "owner", ws: user.uid, name: "Владелец" });
          }
        }
        return;
      }
      if (!user.emailVerified || !email) {
        setState(NONE);
        return;
      }
      try {
        const [access, invite] = await Promise.all([findAccess(email, user.uid), findTrial(email)]);
        if (cancelled) return;
        const demos = trialChoices(email, invite);
        if (!access.choices.length && !demos.length && !OWNER && !access.invitedStaff) {
          openOwnerWorkspace(user.uid);
          return;
        }
        setRealChoices(access.choices);
        setDemoChoices(demos);
        setSelected(restoredAccess(user.uid, [...access.choices, ...demos]));
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

  const email = user?.email?.trim().toLowerCase();
  useEffect(() => {
    if (!state.ready || !email || !user?.emailVerified) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = onSnapshot(trialRef(email), { includeMetadataChanges: true }, (snap) => {
      if (snap.metadata.fromCache) return;
      const invite = snap.data() as TrialInvite | undefined;
      const remaining = invite ? invite.issuedAt.toMillis() + TRIAL_DURATION - Date.now() : 0;
      clearTimeout(timer);
      setDemoChoices(trialChoices(email, invite && remaining > 0 ? invite : null));
      if (remaining > 0) timer = setTimeout(() => setDemoChoices([]), remaining);
    }, () => {
      clearTimeout(timer);
      setDemoChoices([]);
    });
    return () => { clearTimeout(timer); stop(); };
  }, [state.ready, email, user?.emailVerified]);

  const ownerChoice: Access | null = state.isOwner && state.wsId
    ? { role: "owner", ws: state.wsId, name: "Владелец" } : null;
  const choices = [...(ownerChoice ? [ownerChoice] : realChoices), ...demoChoices];

  let value = state;
  if (choices.length || selected?.role === "trial") {
    const workspaceLoaded = selectedWorkspace?.id === workspaceId;
    const current = selected ?? (ownerChoice && ownerChoice.ws === state.wsId && !demoChoices.length ? ownerChoice : null);
    value = {
      ...state, choices, picking: !current,
      selectAccess: (choice) => {
        if (user) rememberAccess(user.uid, choice);
        setSelected(choice);
      },
      isOwner: current?.role === "owner",
      wsId: current?.role === "trial" ? null : current?.ws ?? null,
      trial: current?.role === "trial" ? current : undefined,
      ws: current?.role === "owner" ? state.ws : workspaceLoaded ? selectedWorkspace?.ws ?? null : null,
      ready: state.ready && (!workspaceId || workspaceLoaded),
      clientOf: current?.role === "client" ? current.cid : current?.role === "trial" ? "preview-" + current.cid : undefined,
      clientProject: current?.role === "client" ? current.project : undefined,
      student: current?.role === "student",
    };
  }
  if (value.isOwner) {
    let demoCid = "";
    try { demoCid = sessionStorage.getItem("opora-demo") || ""; } catch { /* */ }
    if (demoCid) value = { ...value, isOwner: false, clientOf: demoCid, demo: true };
  }
  return <C.Provider value={value}>{children}</C.Provider>;
}
export const useWorkspace = () => useContext(C);
export const enterDemo = (cid: string) => { try { sessionStorage.setItem("opora-demo", cid); } catch { /* */ } location.hash = "#/"; location.reload(); };
export const exitDemo = () => { try { sessionStorage.removeItem("opora-demo"); } catch { /* */ } location.hash = "#/projects"; location.reload(); };
