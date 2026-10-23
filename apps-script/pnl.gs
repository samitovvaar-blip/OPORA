/**
 * ОПОРА · выгрузка P&L из Google-таблицы в кабинет клиента.
 * Отдаёт ТОЛЬКО лист с отчётом (ОПиУ), а не базу операций.
 *
 * Установка (один раз на таблицу клиента):
 * 1. Таблица → Расширения → Apps Script → вставить этот код целиком.
 * 2. Поменять KEY на любую длинную случайную строку.
 * 3. Развернуть → Новое развертывание → тип «Веб-приложение»:
 *    «Выполнять от имени» — я, «У кого есть доступ» — все.
 * 4. Скопировать URL веб-приложения и вставить в дашборд:
 *    Проекты → проект → ⚙ Данные и ссылки → «Кабинет клиента» → ссылка на P&L,
 *    в виде  https://script.google.com/macros/s/…/exec?key=ВАШ_KEY&sheet=Название листа
 */
var KEY = 'поменяй-меня-на-длинный-секрет';

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.key !== KEY) return out({ error: 'Неверный ключ' });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = p.sheet ? ss.getSheetByName(p.sheet) : ss.getSheets()[0];
  if (!sh) return out({ error: 'Лист не найден: ' + p.sheet });
  // Отчёт небольшой: берём видимые значения (как на экране)
  var rows = Math.min(sh.getLastRow(), 400), cols = Math.min(sh.getLastColumn(), 80);
  var values = sh.getRange(1, 1, rows, cols).getDisplayValues();
  return out({ sheet: sh.getName(), title: ss.getName(), values: values, at: new Date().toISOString() });
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
