# OPORA

Личный дашборд: заявки, клиенты, проекты, админка.

| Папка | Что |
|---|---|
| `dashboard/` | React + Vite, вход через Firebase Auth (почта/пароль) |
| `crm/` | CRM (переносится 1:1, Yandex Cloud) — TODO |
| `firestore.rules` | Правила: каждый видит только `users/{uid}/**` |

**Контуры не пересекаются:** личное → Firebase, бизнес → Yandex Cloud. Во фронтенде они встречаются только на экране.

## Запуск
```bash
cd dashboard
cp .env.example .env   # заполнить
npm install && npm run dev
```
Пока `VITE_CRM_API_URL` пустой, заявки и клиенты показываются на тестовых данных.
