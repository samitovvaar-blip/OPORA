import { arrayRemove, arrayUnion, collection, doc, getDocsFromServer, updateDoc, writeBatch } from "firebase/firestore";
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
