// server/app.js
const express      = require('express');
const bcrypt       = require('bcryptjs');
const cookieParser = require('cookie-parser');
const cors         = require('cors');
const path         = require('path');
const fs           = require('fs');

const { initDb, db } = require('./db');
const { sign, auth } = require('./auth');

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

/* ─────────── Раздача клиента (устойчиво к путям) ─────────── */

const candidates = [
  path.join(__dirname, '..', 'client'),
  path.join(__dirname, 'client'),
  path.resolve(process.cwd(), 'client'),
  path.resolve(process.cwd(), '..', 'client')
];

let clientPath = null;
for (const p of candidates) {
  if (fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html'))) {
    clientPath = p;
    break;
  }
}

if (clientPath) {
  console.log('📁 Раздача клиента из:', clientPath);
  app.use(express.static(clientPath));

  // Главная при заходе на /
  app.get('/', function (req, res) {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
} else {
  console.error('❌ Папка client не найдена!');
  console.error('__dirname:', __dirname);
  console.error('cwd:', process.cwd());
  console.error('Кандидаты:', candidates);
}

/* ─────────── Окружение ─────────── */

const IS_PRODUCTION = !!(process.env.RENDER) || process.env.NODE_ENV === 'production';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: IS_PRODUCTION ? 'none' : 'lax',
  secure:   IS_PRODUCTION ? true  : false,
  maxAge:   7 * 24 * 60 * 60 * 1000
};

/* ─────────── Хранилища в памяти (живой чат) ─────────── */

const typingUsers = {};
const onlineUsers = {};

/* ─────────── AUTH ─────────── */

app.post('/api/register', async function (req, res) {
  const name     = req.body.name;
  const email    = req.body.email;
  const password = req.body.password;

  if (!name || !email || !password)
    return res.status(400).json({ error: 'Все поля обязательны' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Пароль минимум 6 символов' });

  const hash = await bcrypt.hash(password, 10);

  try {
    const info = db.prepare(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'
    ).run(name, email, hash);

    const token = sign({ id: info.lastInsertRowid, name: name });
    res.cookie('token', token, COOKIE_OPTIONS);
    res.json({ id: info.lastInsertRowid, name: name, email: email });
  } catch (e) {
    res.status(400).json({ error: 'Email уже занят' });
  }
});

app.post('/api/login', async function (req, res) {
  const email    = req.body.email;
  const password = req.body.password;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Неверный email или пароль' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Неверный email или пароль' });

  const token = sign({ id: user.id, name: user.name });
  res.cookie('token', token, COOKIE_OPTIONS);
  res.json({ id: user.id, name: user.name, email: user.email });
});

app.post('/api/logout', function (req, res) {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: IS_PRODUCTION ? 'none' : 'lax',
    secure:   IS_PRODUCTION ? true  : false
  });
  res.json({ ok: true });
});

/* ─────────── PROFILE ─────────── */

app.get('/api/me', auth, function (req, res) {
  const user = db.prepare(
    'SELECT id, name, email, phone, bio, rating FROM users WHERE id = ?'
  ).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json(user);
});

app.put('/api/me', auth, function (req, res) {
  db.prepare('UPDATE users SET name = ?, phone = ?, bio = ? WHERE id = ?')
    .run(req.body.name || '', req.body.phone || '', req.body.bio || '', req.user.id);
  res.json({ ok: true });
});

/* ─────────── TRIPS ─────────── */

app.get('/api/trips', function (req, res) {
  const from = req.query.from;
  const to   = req.query.to;
  const date = req.query.date;

  const all = db.prepare('SELECT * FROM trips').all();
  const filtered = all.filter(function (t) {
    if (from && t.from_city.toLowerCase().indexOf(from.toLowerCase()) === -1) return false;
    if (to   && t.to_city.toLowerCase().indexOf(to.toLowerCase()) === -1)     return false;
    if (date && t.date !== date)                                              return false;
    return true;
  });

  const users = db.prepare('SELECT * FROM users').all();
  filtered.forEach(function (t) {
    const driver = users.find(function (u) { return u.id === t.driver_id; });
    t.driver = driver ? driver.name : 'Неизвестный';
    t.driver_rating = driver ? driver.rating : 0;
  });

  filtered.sort(function (a, b) {
    return (a.date + a.time).localeCompare(b.date + b.time);
  });

  res.json(filtered);
});

app.post('/api/trips', auth, function (req, res) {
  const from_city   = req.body.from_city;
  const to_city     = req.body.to_city;
  const date        = req.body.date;
  const time        = req.body.time;
  const seats       = req.body.seats;
  const price       = req.body.price;
  const description = req.body.description;

  if (!from_city || !to_city || !date || !time || !seats || !price)
    return res.status(400).json({ error: 'Заполните обязательные поля' });

  const info = db.prepare(`
    INSERT INTO trips (driver_id, from_city, to_city, date, time, seats, price, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, from_city, to_city, date, time, seats, price, description || '');

  res.json({ id: info.lastInsertRowid });
});

/* ─────────── REQUESTS ─────────── */

app.post('/api/trips/:id/requests', auth, function (req, res) {
  const tripId = Number(req.params.id);
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
  if (!trip) return res.status(404).json({ error: 'Поездка не найдена' });
  if (trip.driver_id === req.user.id)
    return res.status(400).json({ error: 'Нельзя оставить заявку на свою поездку' });

  const all = db.prepare('SELECT * FROM requests').all();
  const exists = all.find(function (r) {
    return r.trip_id === tripId && r.passenger_id === req.user.id;
  });
  if (exists) return res.status(400).json({ error: 'Заявка уже отправлена' });

  const info = db.prepare(
    'INSERT INTO requests (trip_id, passenger_id, status) VALUES (?, ?, ?)'
  ).run(tripId, req.user.id, 'ожидает');

  res.json({ id: info.lastInsertRowid });
});

app.get('/api/me/requests', auth, function (req, res) {
  const all = db.prepare('SELECT * FROM requests').all();
  const my  = all.filter(function (r) { return r.passenger_id === req.user.id; });

  const trips = db.prepare('SELECT * FROM trips').all();
  const users = db.prepare('SELECT * FROM users').all();

  my.forEach(function (r) {
    const t = trips.find(function (x) { return x.id === r.trip_id; });
    if (t) {
      r.from_city = t.from_city;
      r.to_city   = t.to_city;
      r.date      = t.date;
      r.time      = t.time;
      r.driver_id = t.driver_id;
      const d = users.find(function (u) { return u.id === t.driver_id; });
      r.driver = d ? d.name : 'Неизвестный';
    }
  });

  res.json(my);
});

app.get('/api/me/incoming-requests', auth, function (req, res) {
  const allRequests = db.prepare('SELECT * FROM requests').all();
  const trips       = db.prepare('SELECT * FROM trips').all();
  const users       = db.prepare('SELECT * FROM users').all();

  const myTrips = trips.filter(function (t) { return t.driver_id === req.user.id; });
  const myTripIds = myTrips.map(function (t) { return t.id; });

  const incoming = allRequests.filter(function (r) {
    return myTripIds.indexOf(r.trip_id) !== -1;
  });

  incoming.forEach(function (r) {
    const trip = myTrips.find(function (t) { return t.id === r.trip_id; });
    const passenger = users.find(function (u) { return u.id === r.passenger_id; });
    if (trip) {
      r.from_city = trip.from_city;
      r.to_city   = trip.to_city;
      r.date      = trip.date;
      r.time      = trip.time;
    }
    r.passenger_name  = passenger ? passenger.name  : 'Неизвестный';
    r.passenger_phone = passenger ? passenger.phone : '';
    r.passenger_email = passenger ? passenger.email : '';
  });

  res.json(incoming);
});

app.post('/api/requests/:id/accept', auth, function (req, res) {
  const requestId = Number(req.params.id);
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
  if (!request) return res.status(404).json({ error: 'Заявка не найдена' });

  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(request.trip_id);
  if (!trip) return res.status(404).json({ error: 'Поездка не найдена' });
  if (trip.driver_id !== req.user.id)
    return res.status(403).json({ error: 'Это не ваша поездка' });

  db.prepare('UPDATE requests SET status = ? WHERE id = ?').run('принята', requestId);
  res.json({ ok: true });
});

app.post('/api/requests/:id/reject', auth, function (req, res) {
  const requestId = Number(req.params.id);
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
  if (!request) return res.status(404).json({ error: 'Заявка не найдена' });

  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(request.trip_id);
  if (!trip) return res.status(404).json({ error: 'Поездка не найдена' });
  if (trip.driver_id !== req.user.id)
    return res.status(403).json({ error: 'Это не ваша поездка' });

  db.prepare('UPDATE requests SET status = ? WHERE id = ?').run('отклонена', requestId);
  res.json({ ok: true });
});

/* ─────────── MESSAGES ─────────── */

app.get('/api/trips/:id/messages', auth, function (req, res) {
  const tripId = Number(req.params.id);
  const all = db.prepare('SELECT * FROM messages').all();
  const messages = all.filter(function (m) {
    return Number(m.trip_id) === tripId;
  });

  const users = db.prepare('SELECT * FROM users').all();
  messages.forEach(function (m) {
    const u = users.find(function (x) { return x.id === m.author_id; });
    m.author = u ? u.name : 'Неизвестный';
  });

  messages.sort(function (a, b) {
    return (a.created_at || '').localeCompare(b.created_at || '');
  });
  res.json(messages);
});

app.post('/api/trips/:id/messages', auth, function (req, res) {
  const tripId = Number(req.params.id);
  const text   = req.body.text;

  if (!text || !text.trim())
    return res.status(400).json({ error: 'Пустое сообщение' });

  const info = db.prepare(
    'INSERT INTO messages (trip_id, author_id, text) VALUES (?, ?, ?)'
  ).run(tripId, req.user.id, text.trim());

  res.json({ id: info.lastInsertRowid });
});

app.post('/api/trips/:id/typing', auth, function (req, res) {
  const tripId = Number(req.params.id);
  if (!typingUsers[tripId]) typingUsers[tripId] = {};
  typingUsers[tripId][req.user.id] = Date.now();
  res.json({ ok: true });
});

app.get('/api/trips/:id/typing', auth, function (req, res) {
  const tripId = Number(req.params.id);
  const users = typingUsers[tripId] || {};
  const now = Date.now();
  const typing = [];

  Object.keys(users).forEach(function (userId) {
    if (Number(userId) !== req.user.id && now - users[userId] < 5000) {
      typing.push(Number(userId));
    }
  });

  res.json({ typing: typing });
});

app.post('/api/heartbeat', auth, function (req, res) {
  onlineUsers[req.user.id] = Date.now();
  res.json({ ok: true });
});

app.get('/api/trips/:id/online', auth, function (req, res) {
  const tripId = Number(req.params.id);
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId);
  if (!trip) return res.json({ online: [] });

  const requests = db.prepare('SELECT * FROM requests').all();
  const accepted = requests.filter(function (r) {
    return Number(r.trip_id) === tripId && r.status === 'принята';
  });

  const participantIds = new Set([trip.driver_id]);
  accepted.forEach(function (r) { participantIds.add(r.passenger_id); });

  const now = Date.now();
  const online = [];
  participantIds.forEach(function (id) {
    if (id !== req.user.id && onlineUsers[id] && now - onlineUsers[id] < 15000) {
      online.push(id);
    }
  });

  res.json({ online: online });
});

/* ─────────── REVIEWS ─────────── */

app.get('/api/reviews', function (req, res) {
  const reviews = db.prepare('SELECT * FROM reviews').all();
  const users   = db.prepare('SELECT * FROM users').all();
  reviews.forEach(function (r) {
    const d = users.find(function (u) { return u.id === r.driver_id; });
    const a = users.find(function (u) { return u.id === r.author_id; });
    r.driver = d ? d.name : 'Неизвестный';
    r.author = a ? a.name : 'Неизвестный';
  });
  res.json(reviews);
});

app.get('/api/users/:id/reviews', function (req, res) {
  const userId = Number(req.params.id);
  const all = db.prepare('SELECT * FROM reviews').all();
  const users = db.prepare('SELECT * FROM users').all();

  const mine = all.filter(function (r) {
    return Number(r.driver_id) === userId;
  });
  mine.forEach(function (r) {
    const a = users.find(function (u) { return u.id === r.author_id; });
    r.author = a ? a.name : 'Неизвестный';
  });
  res.json(mine);
});

app.post('/api/reviews', auth, function (req, res) {
  const driver_id = Number(req.body.driver_id);
  const rating    = Number(req.body.rating);
  const text      = req.body.text || '';

  if (!driver_id || !rating)
    return res.status(400).json({ error: 'Укажите водителя и оценку' });
  if (rating < 1 || rating > 5)
    return res.status(400).json({ error: 'Оценка от 1 до 5' });
  if (driver_id === req.user.id)
    return res.status(400).json({ error: 'Нельзя оставить отзыв себе' });

  const all = db.prepare('SELECT * FROM reviews').all();
  const exists = all.find(function (r) {
    return r.driver_id === driver_id && r.author_id === req.user.id;
  });
  if (exists) return res.status(400).json({ error: 'Вы уже оставили отзыв этому водителю' });

  const info = db.prepare(
    'INSERT INTO reviews (driver_id, author_id, rating, text) VALUES (?, ?, ?, ?)'
  ).run(driver_id, req.user.id, rating, text);

  const allAfter = db.prepare('SELECT * FROM reviews').all();
  const driverRevs = allAfter.filter(function (r) { return r.driver_id === driver_id; });
  const avg = driverRevs.reduce(function (s, r) { return s + r.rating; }, 0) / driverRevs.length;

  db.prepare('UPDATE users SET rating = ? WHERE id = ?').run(Math.round(avg * 10) / 10, driver_id);

  res.json({ id: info.lastInsertRowid, average: Math.round(avg * 10) / 10 });
});

/* ─────────── START ─────────── */

const PORT = process.env.PORT || 3000;

initDb().then(function () {
  app.listen(PORT, function () {
    console.log('🚀 Сервер запущен на порту ' + PORT);
    if (clientPath) console.log('🌐 Сайт: http://localhost:' + PORT + '/index.html');
  });
}).catch(function (err) {
  console.error('❌ Ошибка запуска БД:', err);
});