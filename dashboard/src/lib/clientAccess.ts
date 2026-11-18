import { arrayRemove, arrayUnion, doc, writeBatch } from "firebase/firestore";
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
