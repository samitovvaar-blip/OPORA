// Обновление свайпом вниз (в PWA на телефоне нет браузерного pull-to-refresh)
import { useEffect, useRef, useState } from "react";

const THRESHOLD = 70;

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [loading, setLoading] = useState(false);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      startY.current = window.scrollY <= 0 && !loading ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const d = e.touches[0].clientY - startY.current;
      if (d > 0 && window.scrollY <= 0) setPull(Math.min(d * 0.5, 110));
      else setPull(0);
    };
    const onEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      setPull((p) => {
        if (p >= THRESHOLD) { setLoading(true); setTimeout(() => location.reload(), 250); return THRESHOLD; }
        return 0;
      });
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [loading]);

  if (!pull && !loading) return null;
  const ready = pull >= THRESHOLD;
  return (
    <div className="ptr" style={{ height: pull }}>
      <span className={`ptr-icon ${loading ? "spin" : ""}`} style={{ transform: loading ? undefined : `rotate(${pull * 3}deg)` }}>↻</span>
      <span className="small muted">{loading ? "Обновляю…" : ready ? "Отпусти, чтобы обновить" : "Потяни вниз"}</span>
    </div>
  );
}
