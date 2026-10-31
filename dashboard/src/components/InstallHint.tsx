// Подсказка «Установить приложение» — один раз на телефоне, если сайт открыт в браузере (не как приложение)
import { useEffect, useState } from "react";

export default function InstallHint() {
  const [show, setShow] = useState(false);
  const [prompt, setPrompt] = useState<any>(null);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  useEffect(() => {
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;
    let seen = false; try { seen = !!localStorage.getItem("install-hint"); } catch {}
    if (standalone || seen || innerWidth > 900) return;
    const t = setTimeout(() => setShow(true), 4000);
    const h = (e: Event) => { e.preventDefault(); setPrompt(e); };
    addEventListener("beforeinstallprompt", h);
    return () => { clearTimeout(t); removeEventListener("beforeinstallprompt", h); };
  }, []);
  const close = () => { setShow(false); try { localStorage.setItem("install-hint", "1"); } catch {} };
  if (!show) return null;
  return <div className="install-hint">
    <img src="spiral.png" alt="" className="spin-slow" />
    <div><b>Установите ОПОРУ на телефон</b>
      {prompt ? <p>Кабинет откроется как приложение — одним касанием.</p>
        : ios ? <p>Нажмите <b>«Поделиться» ⬆️</b> внизу Safari → <b>«На экран „Домой“»</b>.</p>
        : <p>Откройте меню браузера <b>⋮</b> → <b>«Добавить на главный экран»</b>.</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {prompt && <button onClick={() => { prompt.prompt(); close(); }}>Установить</button>}
        <button className="ghost" onClick={close}>Позже</button>
      </div>
    </div>
  </div>;
}
