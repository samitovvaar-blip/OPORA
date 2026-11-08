// ОПОРА · короткий скрипт для таблицы клиента.
// Вся логика — в общей библиотеке OporaLib (режим «HEAD»): обновляется сразу во всех таблицах.
function doGet(e) { return OporaLib.doGet(e, SpreadsheetApp.getActiveSpreadsheet()); }
function doPost(e) { return OporaLib.doPost(e, SpreadsheetApp.getActiveSpreadsheet()); }
