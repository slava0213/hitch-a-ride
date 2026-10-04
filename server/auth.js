const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'замените-на-длинную-случайную-строку-минимум-32-символа';

function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

function auth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Не авторизован' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Токен недействителен' });
  }
}

module.exports = { sign, auth, SECRET };