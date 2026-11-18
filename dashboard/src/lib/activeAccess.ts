type AccessIdentity =
  | { role: "trial"; ws: string; cid: string }
  | { role: "client"; ws: string; cid: string }
  | { role: "staff" | "student" | "owner"; ws: string };

const key = (uid: string) => "opora-active-access:" + uid;
const identity = (access: AccessIdentity) => JSON.stringify([
  access.role, access.ws, "cid" in access ? access.cid : null,
]);

export function rememberAccess(uid: string, access: AccessIdentity | null) {
  try {
    if (access) sessionStorage.setItem(key(uid), identity(access));
    else sessionStorage.removeItem(key(uid));
  } catch { /* Storage may be unavailable in this browser. */ }
}

export function restoredAccess<T extends AccessIdentity>(uid: string, choices: T[]): T | null {
  let saved: string | null = null;
  try { saved = sessionStorage.getItem(key(uid)); } catch { /* */ }
  const selected = saved ? choices.find((choice) => identity(choice) === saved) : undefined;
  if (saved && !selected) rememberAccess(uid, null);
  return selected ?? (choices.length === 1 ? choices[0] : null);
}
