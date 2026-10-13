# 🚗 Сервис поиска попутчиков

Веб-приложение: поездки, заявки, живой чат, отзывы и рейтинг водителей.

## 🛠 Стек
- **Frontend:** HTML, CSS, JavaScript (без фреймворков)
- **Backend:** Node.js + Express
- **Авторизация:** JWT (httpOnly cookie) + bcrypt
- **Хранилище:** JSON-файл `server/carpool.json`

## ✏️ Ваши контакты
Откройте `client/js/config.js` и впишите имя, Telegram, e-mail и телефон —
они появятся в бегущей строке и в подвале каждой страницы.

## 🚀 Локальный запуск
```bash
cd server
npm install
npm start
```
Откройте http://localhost:3000

При первом запуске создаются демо-поездки (помечены «демо»).
Отключить: переменная окружения `SEED_DEMO=0`.

## 🌐 Деплой на Render
1. На https://render.com → **New → Web Service** → выберите репозиторий.
2. Root Directory: `server` · Build: `npm install` · Start: `npm start`
3. Environment: `JWT_SECRET` = длинная случайная строка.
(Либо **New → Blueprint** — настройки возьмутся из `render.yaml`.)

> GitHub Pages не подойдёт: нужен Node.js-сервер.
> На бесплатном Render файловая система временная — данные сбрасываются при перезапуске.

## 📝 Лицензия
MIT
