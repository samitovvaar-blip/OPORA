/**
 * ОПОРА · ОПиУ для кабинета клиента прямо из базы операций (ДДС).
 * Наружу уходят ТОЛЬКО суммы по месяцам и статьям выбранного направления —
 * контрагенты, назначения платежей и счета остаются в таблице.
 *
 * Установка (один раз на таблицу):
 * 1. Таблица → Расширения → Apps Script → вставить этот код целиком → 💾.
 * 2. Поменять KEY ниже на свой длинный секрет.
 * 3. Развернуть → Новое развертывание → ⚙ «Веб-приложение»:
 *    «Выполнять от имени» — я, «У кого есть доступ» — все → Развернуть → разрешить доступ.
 * 4. Скопировать URL и дописать параметры:
 *    https://script.google.com/macros/s/…/exec?key=СЕКРЕТ&dir=Кубики
 *    (несколько направлений: dir=Кубики,Часы · другой лист базы: &sheet=ДДС БОТ ОСНОВНЫЕ)
 * 5. Вставить ссылку в дашборд: Проекты → клиент → ⚙ → «Кабинет клиента» → «Ссылка на P&L».
 *
 * После изменения кода: Развернуть → Управление развертываниями → ✏️ → Версия «Новая» → Развернуть.
 */
// Ключ доступа. Код ОДИН для всех клиентов: ключом служит ID самой таблицы
// (часть ссылки между /d/ и /edit). Строку ниже можно оставить пустой; если в ней что-то
// записано — этот ключ тоже принимается (для старых подключений, например у Аслана).
var KEY = 'opora-af18tlqro6wg5bup';
function okKey(k) { return !!k && (k === KEY || k === SpreadsheetApp.getActiveSpreadsheet().getId()); }
var DEFAULT_SHEETS = ['ДДС БОТ ОСНОВНЫЕ', 'ДДС БОТ ФОНДЫ'];   // основная база + база фондов (траты из фондов — расход в ОПиУ)
var DIRECTORY = 'Справочник-общее';   // группы статей → статьи (A → B)
var BALANCES = 'БАЛАНСЫ СЕЙЧАС';
var GOODS_SHEETS = ['ТОВАРЫ', 'Товарный учет', 'Товарный учёт', 'ТОВАРЫ БОТ'];   // движение товаров (первый найденный лист)      // остатки по счетам и дата сверки с выпиской

function buildReport(e) {
  var p = (e && e.parameter) || {};
  if (!okKey(p.key)) return out({ error: 'Неверный ключ' });
  var dirs = String(p.dir || '').split(',').map(norm).filter(String);
  if (!dirs.length) return out({ error: 'Не указано направление: добавь &dir=Кубики' });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = p.sheet ? String(p.sheet).split(',') : DEFAULT_SHEETS;

  var groupsOf = readDirectory(ss);   // статья → [группы] из справочника
  var typos = [];                      // строки, где год даты операции не совпадает с датой для отчёта
  var sums = {}, months = {}, seen = 0, total = 0, foundDirs = {};
  var dds = {}, ddsMonths = {};   // ДДС: по «Дате операции», все движения денег
  for (var s = 0; s < names.length; s++) {
    var sh = ss.getSheetByName(names[s].trim());
    if (!sh) return out({ error: 'Лист не найден: ' + names[s] });
    var v = sh.getDataRange().getValues();
    var h = v[0].map(norm);
    var col = function (re) { for (var i = 0; i < h.length; i++) if (re.test(h[i])) return i; return -1; };
    // «Направление» может быть в нескольких колонках (одна пустая) — проверяем все
    var cDirs = []; for (var i = 0; i < h.length; i++) if (/^направлен/.test(h[i])) cDirs.push(i);
    var cDir = cDirs.length ? cDirs[0] : -1, cProc = col(/^процесс/), cArt = col(/^стать/), cSum = col(/^сумма/),
        cType = col(/приход/), cDate = col(/дата для отч/), cDate2 = col(/дата оп/), cAcc = col(/^сч[её]т/);
    if (cDir < 0 || cArt < 0 || cSum < 0) return out({ error: 'Не нашёл колонки «Направление», «Статьи», «Сумма» на листе ' + names[s] });
    total += v.length - 1;
    for (var r = 1; r < v.length; r++) {
      var row = v[r];
      var hit = false;
      for (var c = 0; c < cDirs.length; c++) { var dv = String(row[cDirs[c]] || '').trim(); if (dv) foundDirs[dv] = 1; if (dirs.indexOf(norm(dv)) >= 0) { hit = true; break; } }
      if (!hit) continue;
      seen++;
      var proc = String(row[cProc] || '').trim(), art = String(row[cArt] || '').trim();
      // Группа статьи — по справочнику (как в отчёте ОПиУ). Если статья в нескольких группах — берём ту, что в базе.
      var gs = groupsOf[norm(art)];
      if (gs && gs.length && gs.map(norm).indexOf(norm(proc)) < 0) proc = gs[0];
      var dRep = toDate(cDate >= 0 ? row[cDate] : null), dOp0 = toDate(cDate2 >= 0 ? row[cDate2] : null);
      if (dRep && dOp0 && Math.abs(dRep.getFullYear() - dOp0.getFullYear()) >= 1 && typos.length < 100)
        typos.push({ sheet: names[s], row: r + 1, op: fmtD(dOp0), report: fmtD(dRep), article: art });
      var amtD = Math.abs(toNum(row[cSum]));
      var outD = cType >= 0 ? /расход/i.test(String(row[cType])) : toNum(row[cSum]) < 0;
      // ДДС: все движения по дате операции (переводы между счетами, «Для ДДС», фонды — дашборд покажет отдельной таблицей)
      var dOp = toDate(cDate2 >= 0 ? row[cDate2] : null) || toDate(cDate >= 0 ? row[cDate] : null);
      if (art && amtD && dOp) {
        var mkD = dOp.getFullYear() + '-' + ('0' + (dOp.getMonth() + 1)).slice(-2);
        var kD = proc + '\u0001' + art + '\u0001' + (cAcc >= 0 ? String(row[cAcc] || '').trim() : '');
        dds[kD] = dds[kD] || {};
        dds[kD][mkD] = (dds[kD][mkD] || 0) + (outD ? -amtD : amtD);
        ddsMonths[mkD] = true;
      }
      // Оплата налогов идёт в ОПиУ (финансовый отдел), даже если проведена через субсчёт
      var tax = /налог/i.test(art) && !/фонд/i.test(art + proc);
      if (!art || (!tax && (/^\*\*/.test(proc) || /субсч/i.test(proc) || /между сч|внутрен/i.test(art)))) continue;   // переводы между своими счетами (в т.ч. в фонды) — не расход
      var d = toDate(cDate >= 0 ? row[cDate] : null) || toDate(cDate2 >= 0 ? row[cDate2] : null);
      if (!d) continue;
      var mk = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
      var amt = Math.abs(toNum(row[cSum]));
      if (!amt) continue;
      var out_ = cType >= 0 ? /расход/i.test(String(row[cType])) : toNum(row[cSum]) < 0;
      var k = proc + '\u0001' + art;
      sums[k] = sums[k] || {};
      sums[k][mk] = (sums[k][mk] || 0) + (out_ ? -amt : amt);
      months[mk] = true;
    }
  }
  var rows = Object.keys(sums).map(function (k) { var x = k.split('\u0001'); return { process: x[0], article: x[1], values: sums[k] }; });
  var ddsRows = Object.keys(dds).map(function (k) { var x = k.split('\u0001'); return { process: x[0], article: x[1], account: x[2], values: dds[k] }; });
  if (!seen && total) return out({ error: 'В базе нет строк с направлением «' + dirs.join(', ') + '». В колонке «Направление» есть: ' + Object.keys(foundDirs).join(', ') + '. Впиши в кабинете одно из них.' });
  return out({ mode: 'db', goods: readGoods(ss), dirMeta: readDirMeta(ss), balances: readBalances(ss), typos: typos, directory: Object.keys(groupsOf).length, dds: { months: Object.keys(ddsMonths).sort(), rows: ddsRows }, title: ss.getName(), dirs: dirs, scanned: total, matched: seen, months: Object.keys(months).sort(), rows: rows, at: new Date().toISOString() });
}

// Лист «БАЛАНСЫ СЕЙЧАС»: A — остаток на дату ввода, B — сверено, C — дата сверки, D — остаток сейчас, E — счёт, F — кто проверял
function readBalances(ss) {
  var sh = ss.getSheetByName(BALANCES);
  if (!sh) return null;
  var v = sh.getDataRange().getDisplayValues(), raw = sh.getDataRange().getValues(), list = [], group = '', start = '';
  for (var r = 0; r < v.length; r++) {
    var line = v[r].join(' ');
    var m = line.match(/ввод остатков на\s*(\d{1,2}\.\d{1,2}\.\d{4})/i); if (m) start = m[1];
    var acc = String(v[r][4] || '').trim();
    if (!acc && /Баланс/i.test(line)) { group = (line.match(/(\d\.\s*)?Баланс[а-яё ]+/i) || [''])[0].trim(); continue; }
    if (/^[34]\./.test(group)) break;   // заказы/товары — не деньги на счетах
    if (!acc || !group) continue;
    list.push({ group: group, account: acc, start: toNum(raw[r][0]), checked: raw[r][1] === true,
      checkedAt: String(v[r][2] || ''), balance: toNum(raw[r][3]), who: String(v[r][5] || '') });
  }
  return { start: start, accounts: list };
}

// Справочник «Справочник-общее». Два формата (определяется по заголовку колонки A):
//  • 3 колонки (заголовок A начинается с «Тип»): A — Тип (Доход / Переменные / Постоянные / Фонд / Не учитывать),
//    B — Отдел (процесс), C — Статья ДДС. Тип и отдел можно писать один раз — ниже действуют они же.
//  • 2 колонки (как раньше): A — Группа (процесс), B — Статья.
function readDirRows(ss) {
  var sh = ss.getSheetByName(DIRECTORY);
  if (!sh) return [];
  var cols = Math.min(3, Math.max(2, sh.getLastColumn()));   // читаем только A–C (рядом может быть «Товарный учёт»)
  var v = sh.getRange(1, 1, sh.getLastRow(), cols).getDisplayValues(), out = [];
  // строка заголовков может быть не первой (сверху бывает название «Учет финансов»): ищем «Тип» в колонке A
  var head = 0, three = false;
  for (var h = 0; h < Math.min(6, v.length); h++) if (/(^|\s)тип/.test(norm(v[h][0]))) { head = h; three = true; break; }
  var type = '', dept = '';
  for (var r = head + 1; r < v.length; r++) {
    var a = String(v[r][0] || '').trim(), b = String(v[r][1] || '').trim(), c = cols > 2 ? String(v[r][2] || '').trim() : '';
    if (three) {
      if (a) { type = a; dept = ''; }
      if (b) dept = b;
      if (c && dept) out.push({ type: type, dept: dept, art: c });
    } else {
      if (a) dept = a;
      if (b && dept) out.push({ type: c, dept: dept, art: b });
    }
  }
  return out;
}
function readDirectory(ss) {
  var map = {};
  readDirRows(ss).forEach(function (x) { var k = norm(x.art); map[k] = map[k] || []; if (map[k].indexOf(x.dept) < 0) map[k].push(x.dept); });
  return map;
}
function readDirMeta(ss) {
  var types = {}, order = [];
  readDirRows(ss).forEach(function (x) { if (order.indexOf(x.dept) < 0) order.push(x.dept); if (x.type && !types[x.dept]) types[x.dept] = x.type; });
  return { types: types, metrics: {}, order: order };
}

// Товарный учёт (необязательный — если листа нет, кабинет вкладку «Товары» не показывает).
// Справочник: блок справа с заголовками «Группа товаров» и «Номенклатура товара».
// Лист движения: колонки (по заголовкам) Дата · Номенклатура/Товар · Приход/Расход (тип) или отдельные «Приход»/«Расход» ·
// Количество · Сумма (необязательно). Результат: по каждому товару за месяц — приход и расход (кол-во и сумма).
function readGoods(ss) {
  var sh = null;
  for (var i = 0; i < GOODS_SHEETS.length && !sh; i++) sh = ss.getSheetByName(GOODS_SHEETS[i]);
  var groups = {};
  var dir = ss.getSheetByName(DIRECTORY);
  if (dir) {
    var dv = dir.getDataRange().getDisplayValues(), gc = -1, nc = -1, hr = -1;
    for (var r = 0; r < Math.min(6, dv.length) && hr < 0; r++) for (var c = 0; c < dv[r].length; c++) {
      if (/групп.*товар/.test(norm(dv[r][c]))) { gc = c; hr = r; }
      if (/номенклатур/.test(norm(dv[r][c]))) nc = c;
    }
    var g = '';
    if (hr >= 0 && nc >= 0) for (var r = hr + 1; r < dv.length; r++) {
      if (gc >= 0 && String(dv[r][gc]).trim()) g = String(dv[r][gc]).trim();
      var n = String(dv[r][nc] || '').trim(); if (n) groups[n] = g || 'Без группы';
    }
  }
  // Два листа: «Товары Поставки» — приход (закупка), «Товары Реализации» — расход (продажа).
  // Колонки по заголовкам: «наименование…» (или «Номенклатура»), «Количество», «Сумма…», «Дата для отчета».
  var sheets = ss.getSheets(), inSh = null, outSh = null, invSh = null;
  for (var i = 0; i < sheets.length; i++) { var nm = norm(sheets[i].getName());
    if (!inSh && /товар.*поставк/.test(nm)) inSh = sheets[i];
    if (!outSh && /товар.*реализац/.test(nm)) outSh = sheets[i];
    if (!invSh && /инвентаризац/.test(nm)) invSh = sheets[i]; }
  if (!inSh && !outSh && !invSh && !sh) return Object.keys(groups).length ? { groups: groups, items: {}, months: [] } : null;
  var items = {}, months = {}, errs = [];
  // название товара: «наименование…» или «номенклатурный номер» — берём то, что есть в справочнике товаров
  var nameOf = function (row, cN, cNum) {
    var a = cN >= 0 ? String(row[cN] || '').trim() : '', b = cNum >= 0 ? String(row[cNum] || '').trim() : '';
    if (b && groups[b] !== undefined) return b; if (a && groups[a] !== undefined) return a;
    return a || b;
  };
  var readMoves = function (sheet, dir) {
    var v = sheet.getDataRange().getValues(), hr = 0;
    for (var r = 0; r < Math.min(6, v.length); r++) if (v[r].map(norm).some(function (x) { return /^кол/.test(x); })) { hr = r; break; }
    var h = v[hr].map(norm);
    var col = function (re) { for (var i = 0; i < h.length; i++) if (re.test(h[i])) return i; return -1; };
    var cN = col(/наименован/); if (cN < 0) cN = col(/^номенклатур(?!ный)/); if (cN < 0) cN = col(/^товар/);
    var cD = col(/дата для отч/); if (cD < 0) cD = col(/^дата/);
    var cQ = col(/^кол/), cS = col(/сумм/), cT = col(/приход\s*\/|тип|операц/), cNum = col(/номенкла.*номер|номенклатурн/);
    if (cN < 0 || cQ < 0) { errs.push('На листе «' + sheet.getName() + '» не нашла колонки «наименование» или «Количество»'); return; }
    for (var r = hr + 1; r < v.length; r++) {
      var row = v[r], name = nameOf(row, cN, cNum); if (!name) continue;
      var d = toDate(cD >= 0 ? row[cD] : null); if (!d) continue;
      var mk = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); months[mk] = true;
      var it = items[name] = items[name] || {}; var m = it[mk] = it[mk] || { inQ: 0, outQ: 0, inS: 0, outS: 0 };
      var q = Math.abs(toNum(row[cQ])), sum = cS >= 0 ? Math.abs(toNum(row[cS])) : 0;
      var out = dir ? dir === 'out' : (cT >= 0 ? /расход|списан|продаж|отгруз|реализ/i.test(String(row[cT])) : toNum(row[cQ]) < 0);
      if (out) { m.outQ += q; m.outS += sum; } else { m.inQ += q; m.inS += sum; }
    }
  };
  if (inSh) readMoves(inSh, 'in');
  if (outSh) readMoves(outSh, 'out');
  if (!inSh && !outSh && sh) readMoves(sh, '');
  // Лист «Товары Инвентаризация»: наименование · Количество (факт) · Дата — факт на конец месяца этой даты.
  // Остатки на старте учёта — та же инвентаризация, датой последнего дня месяца перед началом.
  var inv = {}, invS = {};
  if (invSh) {
    var v = invSh.getDataRange().getValues(), hr = 0;
    for (var r = 0; r < Math.min(6, v.length); r++) if (v[r].map(norm).some(function (x) { return /^кол|факт/.test(x); })) { hr = r; break; }
    var h = v[hr].map(norm), c = function (re) { for (var i = 0; i < h.length; i++) if (re.test(h[i])) return i; return -1; };
    var cN = c(/наименован/); if (cN < 0) cN = c(/^номенклатур(?!ный)/); if (cN < 0) cN = c(/^товар/);
    var cQ = c(/факт/); if (cQ < 0) cQ = c(/^кол/); var cNum2 = c(/номенкла.*номер|номенклатурн/);
    var cD = c(/дата для отч/); if (cD < 0) cD = c(/^дата/); var cS2 = c(/сумм/);
    if (cN >= 0 && cQ >= 0) for (var r = hr + 1; r < v.length; r++) {
      var n = nameOf(v[r], cN, cNum2), d = toDate(cD >= 0 ? v[r][cD] : null); if (!n || !d || v[r][cQ] === '') continue;
      var mk = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); months[mk] = true;
      inv[mk] = inv[mk] || {}; inv[mk][n] = toNum(v[r][cQ]);
      if (cS2 >= 0 && v[r][cS2] !== '') { invS[mk] = invS[mk] || {}; invS[mk][n] = Math.abs(toNum(v[r][cS2])); }
    }
  }
  return { groups: groups, items: items, inventory: inv, inventorySum: invS, months: Object.keys(months).sort(), error: errs.join('; ') || undefined };
}

function fmtD(d) { return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear(); }
function norm(s) { return String(s || '').trim().toLowerCase().replace(/ё/g, 'е'); }
function toNum(x) { if (typeof x === 'number') return x; var n = Number(String(x).replace(/\s|р\.|₽/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; }
function toDate(x) {
  if (x instanceof Date && !isNaN(x)) return x;
  var m = String(x || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}
// Кеш: таблица большая, поэтому готовый ответ храним 10 минут — отчёт открывается мгновенно.
// &fresh=1 в ссылке — пересчитать сразу (кнопка «Обновить данные» в кабинете).
var CACHE_SEC = 600;
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!okKey(p.key)) return out({ error: 'Неверный ключ' });
  var cache = CacheService.getScriptCache(), ck = 'r:' + (p.dir || '') + '|' + (p.sheet || '');
  if (p.fresh !== '1') {
    var n = Number(cache.get(ck + ':n') || 0);
    if (n) {
      var keys = []; for (var i = 0; i < n; i++) keys.push(ck + ':' + i);
      var parts = cache.getAll(keys), txt = '';
      for (var i = 0; i < n; i++) { if (parts[keys[i]] == null) { txt = ''; break; } txt += parts[keys[i]]; }
      if (txt) return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
    }
  }
  var res = buildReport(e), body = res.getContent();
  if (body.indexOf('"error"') < 0) {
    var CH = 90000, map = {}, cnt = Math.ceil(body.length / CH);
    for (var i = 0; i < cnt; i++) map[ck + ':' + i] = body.substr(i * CH, CH);
    map[ck + ':n'] = String(cnt);
    try { cache.putAll(map, CACHE_SEC); } catch (err) {}
  }
  return res;
}

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
