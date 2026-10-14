// Сотрудник подтверждает почту письмом — только после этого правила дают доступ к заданиям
import { useState } from "react";
import { sendEmailVerification } from "firebase/auth";
import { auth } from "../lib/firebase";

export default function VerifyEmail() {
  const [msg, setMsg] = useState("");
  const user = auth.currentUser!;
  async function check() {
    await user.reload();
    if (auth.currentUser?.emailVerified) {
      await auth.currentUser.getIdToken(true); // свежий токен с email_verified=true
      location.reload();
    } else setMsg("Почта ещё не подтверждена. Открой письмо и нажми ссылку.");
  }
  async function resend() {
    try { await sendEmailVerification(user); setMsg("Письмо отправлено ещё раз. Проверь «Спам»."); }
    catch { setMsg("Слишком часто. Подожди минуту и попробуй снова."); }
  }
  return (
    <>
      <h1>Подтверди почту</h1>
      <div className="card" style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 10 }}>
        <div>📧 Мы отправили письмо на <b>{user.email}</b>.</div>
        <div className="muted small">Открой его и нажми ссылку. Потом вернись сюда и нажми «Я подтвердил(а)».</div>
        <button onClick={check}>Я подтвердил(а)</button>
        <button className="ghost" onClick={resend}>Отправить письмо ещё раз</button>
        {msg && <div className="small">{msg}</div>}
      </div>
    </>
  );
}
