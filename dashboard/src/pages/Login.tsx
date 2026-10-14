import { FormEvent, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Navigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await signInWithEmailAndPassword(auth, email, pw); }
    catch { setErr("Неверная почта или пароль"); }
    finally { setBusy(false); }
  }

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <div className="logo">OPORA</div>
        <input type="email" placeholder="Почта" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Пароль" value={pw} onChange={(e) => setPw(e.target.value)} required />
        {err && <div className="error">{err}</div>}
        <button disabled={busy}>{busy ? "Вход…" : "Войти"}</button>
      </form>
    </div>
  );
}
