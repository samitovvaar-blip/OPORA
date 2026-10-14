import { FormEvent, useState } from "react";
import { useCollection } from "../lib/store";
import { Note } from "../lib/types";

export default function Notes() {
  const { items, error, add, update, remove } = useCollection<Note>("notes");
  const [text, setText] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault(); if (!text.trim()) return;
    await add({ text: text.trim() }); setText("");
  }
  return (
    <>
      <h1>Заметки и идеи</h1>
      {error && <div className="error">Firestore: {error}</div>}
      <form onSubmit={submit} className="inline">
        <textarea placeholder="Мысль, идея, что добавить в дашборд…" value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1 }} />
        <button>Сохранить</button>
      </form>
      <div className="bento">
        {items.map((n) => (
          <div key={n.id} className="card">
            <textarea defaultValue={n.text} onBlur={(e) => update(n.id, { text: e.target.value })} />
            <button className="ghost" onClick={() => remove(n.id)}>Удалить</button>
          </div>
        ))}
      </div>
    </>
  );
}
