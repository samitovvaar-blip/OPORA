import { FormEvent, useState } from "react";
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword } from "firebase/auth";
import { Navigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [signup, setSignup] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      if (signup) {
        const cred = await createUserWithEmailAndPassword(auth, email, pw);
        await sendEmailVerification(cred.user).catch(() => {});
      }
      else await signInWithEmailAndPassword(auth, email, pw);
    } catch (e: any) {
      setErr(signup ? (e?.code === "auth/weak-password" ? "Пароль минимум 6 символов" : "Не удалось создать аккаунт (возможно, он уже есть)") : "Неверная почта или пароль");
    }
    finally { setBusy(false); }
  }

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <div className="login-brand"><img src="spiral-orange.png" alt="" /><span>ОПОРА</span></div>
        <input type="email" placeholder="Почта" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Пароль" value={pw} onChange={(e) => setPw(e.target.value)} required />
        {err && <div className="error">{err}</div>}
        <button disabled={busy}>{busy ? "…" : signup ? "Создать пароль и войти" : "Войти"}</button>
        <button type="button" className="ghost" onClick={() => setSignup(!signup)}>
          {signup ? "У меня уже есть пароль" : "Первый вход"}
        </button>
      </form>
    </div>
  );
}
