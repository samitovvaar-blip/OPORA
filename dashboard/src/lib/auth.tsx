import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { rememberAccess } from "./activeAccess";
import { auth } from "./firebase";

const Ctx = createContext<{ user: User | null; loading: boolean }>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const activeUid = useRef<string | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, (u) => {
    if (activeUid.current && activeUid.current !== u?.uid) rememberAccess(activeUid.current, null);
    activeUid.current = u?.uid;
    setUser(u);
    setLoading(false);
  }), []);
  return <Ctx.Provider value={{ user, loading }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
