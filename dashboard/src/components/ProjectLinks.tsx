// Ссылки проекта: основная таблица, папка с документами, чат клиента
export interface Links { sheet?: string; folder?: string; chat?: string; }
export const LINK_FIELDS: [keyof Links, string, string][] = [
  ["sheet", "📊 Таблица", "Ссылка на основную таблицу"],
  ["folder", "📁 Документы", "Ссылка на папку с документами"],
  ["chat", "💬 Чат", "Ссылка на чат или @ник в Telegram"],
];

// Только http(s); @ник → Telegram
export function normUrl(v: string) {
  const s = v.trim();
  if (!s) return "";
  if (/^@[A-Za-z0-9_]{3,}$/.test(s)) return "https://t.me/" + s.slice(1);
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return "https://" + s;
  return "";
}

export function LinkButtons({ links }: { links?: Links }) {
  const list = LINK_FIELDS.filter(([k]) => links?.[k]);
  if (!list.length) return null;
  return (
    <div className="inline" style={{ marginTop: 8 }}>
      {list.map(([k, label]) => <a key={k} className="linkbtn" href={links![k]} target="_blank" rel="noopener noreferrer">{label}</a>)}
    </div>
  );
}

export function LinkEditor({ links, onChange }: { links?: Links; onChange: (l: Links) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
      {LINK_FIELDS.map(([k, label, ph]) => (
        <label key={k} className="row small" style={{ gap: 8 }}>
          <span style={{ minWidth: 100 }}>{label}</span>
          <input style={{ flex: 1 }} placeholder={ph} defaultValue={links?.[k] || ""}
            onBlur={(e) => {
              const v = normUrl(e.target.value);
              if (e.target.value.trim() && !v) { alert("Нужна ссылка, начинающаяся с https://, или @ник"); return; }
              if (v !== (links?.[k] || "")) onChange({ ...links, [k]: v });
            }} />
        </label>
      ))}
    </div>
  );
}
