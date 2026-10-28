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
var KEY = 'поменяй-меня-на-длинный-секрет';
var DEFAULT_SHEETS = ['ДДС БОТ ОСНОВНЫЕ'];

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.key !== KEY) return out({ error: 'Неверный ключ' });
  var dirs = String(p.dir || '').split(',').map(norm).filter(String);
  if (!dirs.length) return out({ error: 'Не указано направление: добавь &dir=Кубики' });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = p.sheet ? String(p.sheet).split(',') : DEFAULT_SHEETS;

  var sums = {}, months = {}, seen = 0, total = 0;
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
        cType = col(/приход/), cDate = col(/дата для отч/), cDate2 = col(/дата оп/);
    if (cDir < 0 || cArt < 0 || cSum < 0) return out({ error: 'Не нашёл колонки «Направление», «Статьи», «Сумма» на листе ' + names[s] });
    total += v.length - 1;
    for (var r = 1; r < v.length; r++) {
      var row = v[r];
      var hit = false;
      for (var c = 0; c < cDirs.length; c++) if (dirs.indexOf(norm(row[cDirs[c]])) >= 0) { hit = true; break; }
      if (!hit) continue;
      seen++;
      var proc = String(row[cProc] || '').trim(), art = String(row[cArt] || '').trim();
      var amtD = Math.abs(toNum(row[cSum]));
      var outD = cType >= 0 ? /расход/i.test(String(row[cType])) : toNum(row[cSum]) < 0;
      // ДДС: все движения по дате операции, кроме внутренних переводов между своими счетами
      var dOp = toDate(cDate2 >= 0 ? row[cDate2] : null) || toDate(cDate >= 0 ? row[cDate] : null);
      if (art && amtD && dOp && !/между сч|внутрен/i.test(art) && !/субсч/i.test(proc)) {
        var mkD = dOp.getFullYear() + '-' + ('0' + (dOp.getMonth() + 1)).slice(-2);
        var kD = proc + '\u0001' + art;
        dds[kD] = dds[kD] || {};
        dds[kD][mkD] = (dds[kD][mkD] || 0) + (outD ? -amtD : amtD);
        ddsMonths[mkD] = true;
      }
      if (!art || /^\*\*/.test(proc) || /субсч/i.test(proc)) continue;      // переводы между счетами — не в ОПиУ
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
  var ddsRows = Object.keys(dds).map(function (k) { var x = k.split('\u0001'); return { process: x[0], article: x[1], values: dds[k] }; });
  return out({ mode: 'db', dds: { months: Object.keys(ddsMonths).sort(), rows: ddsRows }, title: ss.getName(), dirs: dirs, scanned: total, matched: seen, months: Object.keys(months).sort(), rows: rows, at: new Date().toISOString() });
}

function norm(s) { return String(s || '').trim().toLowerCase().replace(/ё/g, 'е'); }
function toNum(x) { if (typeof x === 'number') return x; var n = Number(String(x).replace(/\s|р\.|₽/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; }
function toDate(x) {
  if (x instanceof Date && !isNaN(x)) return x;
  var m = String(x || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
