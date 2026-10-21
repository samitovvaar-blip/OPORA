import { EXTRAS, Flag, REGIMES } from "../lib/catalog";

export default function FlagPicker({ flags, onChange }: { flags: Partial<Record<Flag, boolean>>; onChange: (f: Partial<Record<Flag, boolean>>) => void }) {
  const row = (label: string, opts: [Flag, string][]) => (
    <div className="inline" style={{ alignItems: "center", margin: "6px 0" }}>
      <span className="muted small" style={{ minWidth: 60 }}>{label}</span>
      {opts.map(([k, t]) => <button key={k} type="button" className={`chipbtn ${flags[k] ? "on" : ""}`}
        onClick={() => onChange({ ...flags, [k]: !flags[k] })}>{t}</button>)}
    </div>
  );
  return <>{row("Режим", REGIMES)}{row("Ещё", EXTRAS)}</>;
}
