// Кабинет «Товары»: всё, что вносится в кабинете (данные ОП, планирование, платёжный календарь, ход работы, созвоны),
// выгружается в Google-таблицу клиента на листы «КАБИНЕТ · …» (скрипт pnl.gs, doPost). Ключ и адрес скрипта — из pnlUrl.
import { ClientProject } from "./catalog";

const MON = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const mName = (mk: string) => `${MON[Number(mk.slice(5, 7)) - 1]} ${mk.slice(0, 4)}`;
const DEPTS = ["Производство", "Продажи", "Маркетинг", "Админ-хоз", "Финансы"];
const KIND: Record<string, string> = { once: "разово", daily: "каждый день", weekly: "раз в неделю", spread: "равномерно за месяц" };
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function cabinetSheets(p: ClientProject) {
  const keys = (...objs: (Record<string, unknown> | undefined)[]) => [...new Set(objs.flatMap((o) => Object.keys(o || {})))].sort();
  const op = keys(p.sales, p.prepay, p.kpi, p.planSales).map((mk) => [mName(mk), p.sales?.[mk] ?? "", p.prepay?.[mk] ?? "", p.kpi?.[mk]?.units ?? "", p.kpi?.[mk]?.newClients ?? "", p.kpi?.[mk]?.orders ?? "", p.planSales?.[mk] ?? ""]);
  const plan = keys(p.plans, p.payCal).map((mk) => { const pl = p.plans?.[mk] || {}, pc = p.payCal?.[mk] || {};
    return [mName(mk), pl.d1 ?? "", pl.d2 ?? "", pl.d3 ?? "", pl.d4 ?? "", pl.d5 ?? "", pc.start ?? "", pc.revenue ?? "", pl.note || ""]; });
  const cal = keys(p.payCal).flatMap((mk) => (p.payCal?.[mk]?.items || []).map((it) => [mName(mk), it.name, it.income ? "Приход" : "Расход", it.income ? "" : DEPTS[Number(it.dept) - 1] || "",
    it.amount, KIND[it.kind] || it.kind, it.kind === "once" ? it.day ?? "" : it.kind === "weekly" ? WD[it.weekday ?? 0] : "", it.paid ? "да" : ""]));
  const work = keys(p.workStatus).map((mk) => { const w = p.workStatus?.[mk] || {};
    return [mName(mk), w.loadedTo || "", w.reportsDone ? "да" : "", w.taxesPaid ? "да" : "", w.callNote || ""]; });
  const calls = (p.calls || []).map((c) => [c.at.slice(0, 10).split("-").reverse().join("."), c.text, c.archived ? "да" : ""]);
  return {
    "КАБИНЕТ · ДАННЫЕ ОП": { head: ["Месяц", "Выручка ОП", "Предоплаты", "Продано товаров", "Новых клиентов", "Заказов", "План продаж"], rows: op },
    "КАБИНЕТ · ПЛАНИРОВАНИЕ": { head: ["Месяц", "План: Производство", "План: Продажи", "План: Маркетинг", "План: Админ-хоз", "План: Финансы", "Остаток на начало", "Приход за месяц", "Фокус месяца"], rows: plan },
    "КАБИНЕТ · ПЛАТЁЖНЫЙ КАЛЕНДАРЬ": { head: ["Месяц", "Платёж", "Приход/Расход", "Отдел", "Сумма", "Периодичность", "День", "Оплачено заранее"], rows: cal },
    "КАБИНЕТ · ХОД РАБОТЫ": { head: ["Месяц", "Выписки загружены по", "Отчёты сданы", "Налоги оплачены", "Комментарий"], rows: work },
    "КАБИНЕТ · СОЗВОНЫ": { head: ["Дата", "Итог созвона", "В архиве"], rows: calls },
  };
}

// отправка: только если данные изменились с прошлого раза (запоминаем отпечаток в браузере)
export function exportCabinet(p: ClientProject, force = false): Promise<boolean> {
  const url = p.pnlUrl || "";
  if (!url || url.startsWith("demo:")) return Promise.resolve(false);
  const exec = url.replace(/\?.*$/, ""), key = new URL(url).searchParams.get("key") || "";
  const sheets = cabinetSheets(p), body = JSON.stringify({ key, sheets }), mark = "opora-exp-" + p.id;
  try { if (!force && localStorage.getItem(mark) === String(body.length) + body.slice(-200)) return Promise.resolve(false); } catch { /* */ }
  return fetch(exec, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body })
    .then(() => { try { localStorage.setItem(mark, String(body.length) + body.slice(-200)); } catch { /* */ } return true; }).catch(() => false);
}
