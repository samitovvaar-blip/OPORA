import { EXTRAS, Flag, ORGS, REGIMES } from "../lib/catalog";

export default function FlagPicker({ flags, onChange }: { flags: Partial<Record<Flag, boolean>>; onChange: (f: Partial<Record<Flag, boolean>>) => void }) {
  const row = (label: string, opts: [Flag, string][], single = false) => (
    <div className="inline" style={{ alignItems: "center", margin: "6px 0" }}>
      <span className="muted small" style={{ minWidth: 90 }}>{label}</span>
      {opts.map(([k, t]) => <button key={k} type="button" className={`chipbtn ${flags[k] ? "on" : ""}`}
        onClick={() => onChange(single ? { ...flags, ...Object.fromEntries(opts.map(([o]) => [o, false])), [k]: !flags[k] } : { ...flags, [k]: !flags[k] })}>{t}</button>)}
    </div>
  );
  return <>{row("Организация", ORGS, true)}{row("Режим", REGIMES)}{row("Ещё", EXTRAS)}</>;
}
