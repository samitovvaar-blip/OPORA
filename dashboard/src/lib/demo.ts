// Демо-кабинеты: товарный (отчёт строится без таблицы, pnlUrl = "demo:goods") и «Услуги» (данные мини-CRM).
const mkAt = (back: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - back); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const rnd = (base: number, k: number, spread = 0.15) => Math.round(base * (1 + Math.sin(k * 1.7) * spread));

export function demoGoodsJson() {
  const months = [5, 4, 3, 2, 1, 0].map(mkAt);
  const vals = (base: number, sign: number, spread?: number) => Object.fromEntries(months.map((mk, k) => [mk, sign * rnd(base * (1 + k * 0.04), k, spread)]));
  const rows = [
    { process: "Выручка", article: "Продажи маркетплейсы", values: vals(820000, 1) },
    { process: "Выручка", article: "Продажи сайт", values: vals(260000, 1) },
    { process: "Производство", article: "Закупка товара", values: vals(390000, -1) },
    { process: "Производство", article: "Упаковка", values: vals(28000, -1) },
    { process: "Маркетинг", article: "Реклама на маркетплейсах", values: vals(95000, -1, 0.3) },
    { process: "Маркетинг", article: "Блогеры", values: vals(40000, -1, 0.5) },
    { process: "Логистика", article: "Доставка до склада", values: vals(36000, -1) },
    { process: "Аренда и офис", article: "Аренда склада", values: vals(60000, -1, 0) },
    { process: "Зарплаты", article: "Зарплата менеджера", values: vals(90000, -1, 0) },
    { process: "Зарплаты", article: "Зарплата кладовщика", values: vals(55000, -1, 0) },
    { process: "Налоги", article: "Налог УСН", values: vals(65000, -1, 0.1) },
  ];
  const dds = { months, rows: rows.map((r) => ({ ...r, account: "Расчётный счёт" })) };
  const groups: Record<string, string> = { "Худи oversize": "Одежда", "Футболка basic": "Одежда", "Шопер": "Аксессуары", "Кепка": "Аксессуары" };
  const items: Record<string, Record<string, { inQ: number; outQ: number; inS: number; outS: number }>> = {};
  const price: Record<string, [number, number]> = { "Худи oversize": [1800, 4200], "Футболка basic": [600, 1500], "Шопер": [350, 990], "Кепка": [420, 1200] };
  Object.keys(groups).forEach((n, i) => { items[n] = {}; months.forEach((mk, k) => { const inQ = 80 + ((i * 13 + k * 7) % 40), outQ = 60 + ((i * 11 + k * 9) % 45);
    items[n][mk] = { inQ, outQ, inS: inQ * price[n][0], outS: outQ * price[n][1] }; }); });
  return {
    mode: "db", title: "ДЕМО · Магазин одежды", months, rows, dds, balances: null, typos: [], at: new Date().toISOString(),
    dirMeta: { types: { "Выручка": "Доход", "Производство": "Переменные", "Маркетинг": "Переменные", "Логистика": "Переменные", "Аренда и офис": "Постоянные", "Зарплаты": "Постоянные", "Налоги": "Постоянные" }, metrics: {}, order: [] },
    goods: { groups, items, months, inventory: {} },
  };
}

// данные мини-CRM для демо «Услуги» (без id — их создаст Firestore); ссылки между документами — через ключи *Ref
export function demoServices() {
  const t = new Date(), iso = (d: Date) => d.toISOString().slice(0, 10);
  const day = (back: number, dd: number) => { const d = new Date(t.getFullYear(), t.getMonth() - back, Math.min(dd, 28)); return iso(d); };
  const products = [
    { ref: "p1", name: "Ведение соцсетей", price: 60000, descr: "Контент-план, 12 постов, сторис" },
    { ref: "p2", name: "Таргетированная реклама", price: 40000, descr: "Настройка и ведение кампаний" },
    { ref: "p3", name: "Чат-бот", price: 25000, descr: "Разработка и поддержка" },
  ];
  const clients = [
    { ref: "c1", name: "Анна", company: "Студия йоги «Прана»", phone: "@anna_prana", source: "Instagram", status: "Закончили работу" },
    { ref: "c2", name: "Игорь", company: "Кофейня «Зерно»", phone: "+7 900 111-22-33", source: "Сарафан / рекомендация", status: "Закончили работу" },
    { ref: "c3", name: "Марина", company: "Салон красоты «Лоск»", phone: "@marina_losk", source: "Telegram", status: "Закончили работу" },
    { ref: "c4", name: "Олег", company: "Автосервис", phone: "@oleg_auto", source: "Авито", status: "Ждёт обработку" },
    { ref: "c5", name: "Светлана", company: "Детский центр", phone: "@sveta_kids", source: "Instagram", status: "Созвон / в диалоге" },
    { ref: "c6", name: "Дмитрий", company: "Фитнес-клуб", phone: "+7 900 222-33-44", source: "Сайт", status: "Вернуться" },
    { ref: "c7", name: "Елена", company: "Магазин цветов", phone: "@lena_flowers", source: "Telegram", status: "Не дозвонились" },
    { ref: "c8", name: "Руслан", company: "Строительная компания", phone: "@ruslan_build", source: "Сарафан / рекомендация", status: "Отказ" },
  ];
  const projects = [
    { ref: "j1", clientRef: "c1", name: "Ведение соцсетей", productRefs: ["p1"], price: 60000, payDay: 5 },
    { ref: "j2", clientRef: "c2", name: "Соцсети + таргет", productRefs: ["p1", "p2"], price: 100000, payDay: 10 },
    { ref: "j3", clientRef: "c3", name: "Чат-бот для записи", productRefs: ["p3"], price: 25000, payDay: 15 },
  ];
  const moves: object[] = [];
  [3, 2, 1, 0].forEach((b) => projects.forEach((j) => { if (b === 0 && j.ref === "j3") return;   // один проект в этом месяце ещё не оплатил
    moves.push({ kind: "move", type: "in", amount: j.price, date: day(b, j.payDay), note: "", projectRef: j.ref, account: "Расчётный счёт" }); }));
  [3, 2, 1, 0].forEach((b) => {
    moves.push({ kind: "move", type: "out", amount: 18000, date: day(b, 12), note: "Таргетолог", category: "ЗП исполнителю", projectRef: "j2", account: "Карта" });
    moves.push({ kind: "move", type: "out", amount: 15000, date: day(b, 12), note: "Контент-мейкер", category: "ЗП исполнителю", projectRef: "j1", account: "Карта" });
    moves.push({ kind: "move", type: "out", amount: 3500, date: day(b, 3), note: "Тильда", category: "Сервисы", account: "Карта", regularRef: "r1" });
    moves.push({ kind: "move", type: "out", amount: 25000, date: day(b, 1), note: "Коворкинг", category: "Аренда", account: "Расчётный счёт", regularRef: "r2" });
    moves.push({ kind: "move", type: "out", amount: 9000, date: day(b, 25), note: "Налог УСН", category: "Налоги", account: "Расчётный счёт" });
  });
  const regulars = [
    { ref: "r1", name: "Тильда", amount: 3500, day: 3, category: "Сервисы", account: "Карта" },
    { ref: "r2", name: "Коворкинг", amount: 25000, day: 1, category: "Аренда", account: "Расчётный счёт" },
  ];
  const staff = [
    { name: "Катя · контент-мейкер", contact: "@katya_content", projectRefs: ["j1"], payType: "fixedProj", amount: 15000, day: 12 },
    { name: "Миша · таргетолог", contact: "@misha_target", projectRefs: ["j2"], payType: "percent", amount: 18, day: 12 },
    { name: "Ассистент", contact: "@assist", projectRefs: [], payType: "fixed", amount: 20000, day: 10 },
  ];
  return { products, clients, projects, moves, regulars, staff, start: day(3, 1) };
}
