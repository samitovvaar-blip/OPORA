// Мастер подключения нового клиента: всё о клиенте собирается в одну карточку за 5 шагов.
// 1 Клиент → 2 Ссылки → 3 Отчётность (таблица + скрипт + проверка) → 4 Доступ и тариф → 5 Готово
import { useEffect, useState } from "react";
import { addDoc, collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useWorkspace } from "../lib/workspace";
import { Flag, shown, STAGES } from "../lib/catalog";
import FlagPicker from "./FlagPicker";
import { LinkEditor, Links } from "./ProjectLinks";
import type { Product } from "../pages/Products";
import { rub } from "../lib/money";

const STEPS = ["Клиент", "Ссылки", "Отчётность", "Доступ и тариф", "Готово"];
const genKey = () => "opora-" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

export default function NewClientWizard({ onClose, defaultName = "" }: { onClose: () => void; defaultName?: string }) {
  const { wsId, ws } = useWorkspace();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(defaultName);
  const [flags, setFlags] = useState<Partial<Record<Flag, boolean>>>({});
  const [birthday, setBirthday] = useState("");
  const [links, setLinks] = useState<Links>({});
  const [exec, setExec] = useState("");
  const [key, setKey] = useState(genKey);
  const [dir, setDir] = useState("");
  const [check, setCheck] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const [emails, setEmails] = useState("");
  const [open, setOpen] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [tariff, setTariff] = useState("");
  const [price, setPrice] = useState("");
  const [payDay, setPayDay] = useState("");
  const [staff, setStaff] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  useEffect(() => { const u = auth.currentUser; if (!u) return;
    getDocs(collection(db, "users", u.uid, "products")).then((q) => setProducts(q.docs.map((d) => d.data() as Product).sort((a, b) => (a.order || 0) - (b.order || 0)))).catch(() => {}); }, []);

  const base = exec.trim().replace(/\?.*$/, "");
  const pnlUrl = base ? `${base}?key=${encodeURIComponent(key)}&dir=${encodeURIComponent(dir.trim())}` : "";
  const items = STAGES.flatMap((s) => s.items).filter((it) => shown(it, flags)).length;

  // «Проверить подключение»: открываем скрипт и объясняем, что не так
  async function runCheck() {
    if (!base) return setCheck({ ok: false, lines: ["Вставь ссылку на скрипт (заканчивается на /exec)"] });
    if (!dir.trim()) return setCheck({ ok: false, lines: ["Укажи направление — как в колонке «Направление» базы"] });
    setChecking(true); setCheck(null);
    try {
      const j = await (await fetch(pnlUrl + "&fresh=1")).json();
      if (j.error) setCheck({ ok: false, lines: ["❌ " + j.error, /ключ/i.test(j.error) ? "→ в скрипте строка var KEY = '" + key + "';" : ""].filter(Boolean) });
      else setCheck({ ok: true, lines: [
        `✅ Таблица «${j.title || ""}» отвечает`,
        `✅ Найдено операций по направлению «${dir}»: ${j.matched ?? "—"} из ${j.scanned ?? "—"}`,
        `✅ Месяцев в отчёте: ${(j.months || []).length}`,
        j.balances ? `✅ Лист «БАЛАНСЫ СЕЙЧАС»: ${j.balances.accounts.length} счетов` : "⚠ Нет листа «БАЛАНСЫ СЕЙЧАС» — остатков в ДДС не будет",
        j.directory ? `✅ Справочник: ${j.directory} статей` : "⚠ Справочник пуст или не найден",
        j.typos?.length ? `⚠ Строк с опечаткой в годе даты: ${j.typos.length}` : "",
      ].filter(Boolean) });
    } catch (e: any) { setCheck({ ok: false, lines: ["❌ Скрипт не ответил JSON. Проверь: развёртывание «Веб-приложение», доступ «Все», ссылка /exec"] }); }
    setChecking(false);
  }

  async function create() {
    if (!wsId || !name.trim()) return;
    setSaving(true);
    const pr = products.find((x) => x.title === tariff);
    const list = emails.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter((x) => x.includes("@"));
    const data: any = { name: name.trim(), flags, links, monthlyOpen: false, calendarOpen: false, createdAt: serverTimestamp(),
      clientEmails: list, clientOpen: open && list.length > 0, staffEmails: staff };
    if (birthday) data.birthday = birthday;
    if (pnlUrl && dir.trim()) data.pnlUrl = pnlUrl;
    if (pr) data.tariff = { name: pr.title, price: Number(price) || pr.price, period: pr.period || "в месяц", payDay: payDay ? Number(payDay) : null,
      items: (pr.sections?.length ? pr.sections.flatMap((x) => x.items) : pr.includes) || [] };
    const r = await addDoc(collection(db, "workspaces", wsId, "clients"), data);
    await Promise.all(list.map((e) => setDoc(doc(db, "clientIndex", e), { ws: wsId, cid: r.id })));
    setCreated(r.id); setSaving(false); setStep(4);
  }

  const invite = `Здравствуйте! Ваш кабинет ОПОРЫ готов 🌀\n\n1. Откройте ${location.origin}${location.pathname}\n2. Нажмите «Первый вход», введите почту ${emails.split(/[\s,;]+/)[0] || ""} и придумайте пароль\n3. Подтвердите почту по ссылке из письма — и заходите.\n\nВ кабинете: показатели, отчётность (ОПиУ, ДДС, аналитика), ход работы и план.`;
  const can = [name.trim().length > 0, true, true, true];

  return <div className="card wizard" style={{ maxWidth: 860 }}>
    <div className="wiz-steps">{STEPS.map((s, i) => <span key={s} className={i === step ? "on" : i < step ? "done" : ""}>{i < step ? "✓" : i + 1}. {s}</span>)}</div>

    {step === 0 && <>
      <h3>Кто клиент</h3>
      <input placeholder="Название (например: Аслан ИП)" value={name} onChange={(e) => setName(e.target.value)} autoFocus style={{ width: "100%" }} />
      <div style={{ marginTop: 10 }}><b>Что есть у клиента?</b> <span className="muted small">— под это соберётся чек-лист: {items} задач</span></div>
      <FlagPicker flags={flags} onChange={setFlags} />
      <div className="inline" style={{ marginTop: 8 }}><span className="small">🎂 День рождения клиента</span><input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} /></div>
    </>}

    {step === 1 && <>
      <h3>Ссылки клиента</h3>
      <div className="muted small">Таблица, папка с документами, чат — появятся кнопками у тебя, сотрудника и клиента. Можно пропустить.</div>
      <LinkEditor links={links} onChange={setLinks} />
    </>}

    {step === 2 && <>
      <h3>Отчётность из Google-таблицы</h3>
      <ol className="small wiz-ol">
        <li>Сделай копию таблицы-шаблона (Файл → Создать копию) и заполни базу клиента.</li>
        <li>В копии: Расширения → Apps Script. В строке <code>var KEY</code> поставь ключ: <b>{key}</b> <button type="button" className="ghost small" onClick={() => navigator.clipboard?.writeText(`var KEY = '${key}';`)}>📋 скопировать строку</button> <button type="button" className="ghost small" onClick={() => setKey(genKey())}>↻ другой</button></li>
        <li>Развёртывание → Новое развёртывание → «Веб-приложение», доступ «Все» → скопируй ссылку <code>…/exec</code>.</li>
      </ol>
      <input placeholder="Ссылка на скрипт: https://script.google.com/macros/s/…/exec" value={exec} onChange={(e) => setExec(e.target.value)} style={{ width: "100%" }} />
      <input placeholder="Направление (как в колонке «Направление» базы, например: Кубики)" value={dir} onChange={(e) => setDir(e.target.value)} style={{ width: "100%", marginTop: 6 }} />
      <div className="inline" style={{ marginTop: 8 }}>
        <button type="button" onClick={runCheck} disabled={checking}>{checking ? "Проверяю…" : "🔍 Проверить подключение"}</button>
        <span className="muted small">Можно пропустить и подключить позже в настройках клиента</span></div>
      {check && <div className={`card small ${check.ok ? "" : "error"}`} style={{ background: "var(--bg)", marginTop: 8 }}>{check.lines.map((l, k) => <div key={k}>{l}</div>)}</div>}
    </>}

    {step === 3 && <>
      <h3>Доступ, тариф и сотрудник</h3>
      <input placeholder="Почта клиента для кабинета (можно несколько через запятую)" value={emails} onChange={(e) => setEmails(e.target.value)} style={{ width: "100%" }} />
      <label className="small" style={{ display: "block", margin: "6px 0" }}><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> Сразу открыть доступ к кабинету</label>
      <div className="inline">
        <select value={tariff} onChange={(e) => { setTariff(e.target.value); const p = products.find((x) => x.title === e.target.value); if (p) setPrice(String(p.price)); }}>
          <option value="">— тариф —</option>{products.map((x) => <option key={x.title} value={x.title}>{x.title} · {rub(x.price)}</option>)}</select>
        {tariff && <><input type="number" placeholder="сумма" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: 120 }} />
          <input type="number" min={1} max={31} placeholder="день оплаты" value={payDay} onChange={(e) => setPayDay(e.target.value)} style={{ width: 120 }} /></>}
      </div>
      <div className="small" style={{ marginTop: 8 }}><b>Кто ведёт клиента</b></div>
      <div className="inline">{(ws?.members || []).map((m) => { const on = staff.includes(m);
        return <button type="button" key={m} className={on ? "" : "ghost"} onClick={() => setStaff(on ? staff.filter((x) => x !== m) : [...staff, m])}>{on ? "🔓 " : "🔒 "}{m}</button>; })}
        {!(ws?.members || []).length && <span className="muted small">сотрудников пока нет</span>}</div>
    </>}

    {step === 4 && created && <>
      <h3>🎉 Клиент «{name}» подключён</h3>
      <div className="small">Чек-лист: {items} задач · {pnlUrl ? "отчётность подключена" : "отчётность — позже в настройках"} · {emails ? "доступ выдан" : "доступ — позже"}</div>
      <div className="inline" style={{ marginTop: 10 }}>
        <a className="linkbtn" href={"#/client?p=" + created}>👁 Посмотреть кабинет</a>
        <a className="linkbtn" href={"#/projects?p=" + created}>⚙ Открыть проект</a>
        {emails && <button type="button" onClick={() => navigator.clipboard?.writeText(invite).then(() => alert("Приглашение скопировано — отправь клиенту в чат"))}>📋 Скопировать приглашение клиенту</button>}
      </div>
    </>}

    <div className="row" style={{ marginTop: 14 }}>
      <button type="button" className="ghost" onClick={step === 0 || step === 4 ? onClose : () => setStep(step - 1)}>{step === 0 ? "Отмена" : step === 4 ? "Закрыть" : "← Назад"}</button>
      {step < 3 && <button type="button" disabled={!can[step]} onClick={() => setStep(step + 1)}>Далее →</button>}
      {step === 3 && <button type="button" disabled={saving || !name.trim()} onClick={create}>{saving ? "Создаю…" : "✓ Создать клиента"}</button>}
    </div>
  </div>;
}
