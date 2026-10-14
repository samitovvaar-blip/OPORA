# CRM · заявки с сайта (Yandex Cloud)

Перенесено 1:1 из `antonioavanzato/opora` (`cloud/`, `docs/`).
Интерфейс теперь — модуль «Заявки» в дашборде: `dashboard/src/modules/leads/`.

- Бизнес-данные (заявки) живут **только** в Yandex Cloud: API Gateway → Cloud Function → YDB.
- Вход в модуль — отдельный, по e-mail и паролю облака (токен на 30 дней). В Firebase заявки не попадают.
- Квиз на oporasamitovva.ru шлёт заявки на `POST /leads` — не менялось.
- В `cloud/gateway.yaml` добавлен CORS-домен `https://samitovvaar-blip.github.io`.
  Чтобы он заработал: `./cloud/deploy.sh gateway` (нужен `yc` с профилем `opora`).
