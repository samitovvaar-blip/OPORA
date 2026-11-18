import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocsFromServer, updateDoc, writeBatch } from "firebase/firestore";
import { endTrial } from "./trial";
import { db } from "./firebase";

export const cabinetKey = (ws: string, cid: string) => ws + "_" + cid;
export const cabinetGrant = (email: string, ws: string, cid: string) =>
  doc(db, "clientIndex", email, "cabinetGrants", cabinetKey(ws, cid));

export async function changeClientAccess(ws: string, cid: string, email: string, grant: boolean) {
  const batch = writeBatch(db);
  batch.update(doc(db, "workspaces", ws, "clients", cid), {
    clientEmails: grant ? arrayUnion(email) : arrayRemove(email),
  });
  const ref = cabinetGrant(email, ws, cid);
  if (grant) batch.set(ref, { ws, cid });
  else batch.delete(ref);
  await batch.commit();
  if (grant) {
    const project = await getDoc(doc(db, "workspaces", ws, "clients", cid)).catch(() => null);
    if (project?.data()?.clientOpen === true) await endTrial(ws, email);
  }
}

export async function restoreClientGrants(ws: string) {
  const projects = await getDocsFromServer(collection(db, "workspaces", ws, "clients"));
  const grants = projects.docs.flatMap((project) => {
    const emails = project.data().clientEmails;
    if (!Array.isArray(emails)) return [];
    return [...new Set(emails)].filter((email): email is string =>
      typeof email === "string" && email.includes("@") && !email.includes("/"),
    ).map((email) => ({ email, cid: project.id }));
  });
  for (let offset = 0; offset < grants.length; offset += 400) {
    const batch = writeBatch(db);
    for (const { email, cid } of grants.slice(offset, offset + 400)) {
      batch.set(cabinetGrant(email, ws, cid), { ws, cid });
    }
    await batch.commit();
  }
  await updateDoc(doc(db, "workspaces", ws), { cabinetGrantsBackfilled: true });
}

export async function setClientOpen(ws: string, cid: string, open: boolean) {
  const ref = doc(db, "workspaces", ws, "clients", cid);
  await updateDoc(ref, { clientOpen: open });
  if (!open) return;
  const project = await getDoc(ref).catch(() => null);
  const emails = project?.data()?.clientEmails;
  if (Array.isArray(emails)) await Promise.all(emails.map((email) => endTrial(ws, email)));
}
