// server/db.js
const fs   = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'carpool.json');

const EMPTY_DB = {
  users:    [],
  trips:    [],
  requests: [],
  messages: [],
  reviews:  []
};

let _db = null;

function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    try {
      _db = JSON.parse(raw);
      Object.keys(EMPTY_DB).forEach(function (key) {
        if (!Array.isArray(_db[key])) _db[key] = [];
      });
    } catch (e) {
      console.error('⚠️ Ошибка чтения БД:', e.message);
      _db = JSON.parse(JSON.stringify(EMPTY_DB));
    }
  } else {
    _db = JSON.parse(JSON.stringify(EMPTY_DB));
  }
}

function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(_db, null, 2), 'utf8');
}

function nextId(collection) {
  let max = 0;
  collection.forEach(function (item) {
    if (item.id && item.id > max) max = item.id;
  });
  return max + 1;
}

async function initDb() {
  loadDb();
  saveDb();
  console.log('✅ БД готова:', DB_FILE);
}

function prepare(sql) {
  return {
    run: function () {
      const params = Array.prototype.slice.call(arguments);
      return runSql(sql, params);
    },
    get: function () {
      const params = Array.prototype.slice.call(arguments);
      const rows = runSelect(sql, params);
      return rows.length ? rows[0] : null;
    },
    all: function () {
      const params = Array.prototype.slice.call(arguments);
      return runSelect(sql, params);
    }
  };
}

function tableOf(sql) {
  const mInsert = sql.match(/INSERT\s+INTO\s+(\w+)/i);
  if (mInsert) return { op: 'insert', table: mInsert[1] };
  const mUpdate = sql.match(/UPDATE\s+(\w+)/i);
  if (mUpdate) return { op: 'update', table: mUpdate[1] };
  const mSelect = sql.match(/FROM\s+(\w+)/i);
  if (mSelect) return { op: 'select', table: mSelect[1] };
  return null;
}

function runSql(sql, params) {
  const info = tableOf(sql);
  if (!info) throw new Error('Неизвестный SQL: ' + sql);
  const table = _db[info.table];
  if (!table) throw new Error('Таблица не найдена: ' + info.table);

  if (info.op === 'insert') {
    const colsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
    if (!colsMatch) throw new Error('Не разобрать INSERT');
    const cols = colsMatch[1].split(',').map(function (c) { return c.trim(); });

    const row = {};
    cols.forEach(function (col, i) { row[col] = params[i]; });

    if (row.email) {
      const exists = table.find(function (u) { return u.email === row.email; });
      if (exists) throw new Error('Email уже занят');
    }

    if (info.table === 'requests' && !row.status) row.status = 'ожидает';

    row.id = nextId(table);
    row.created_at = new Date().toISOString();
    table.push(row);
    saveDb();
    return { lastInsertRowid: row.id };
  }

  if (info.op === 'update') {
    const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
    if (!setMatch) throw new Error('Не разобрать UPDATE');
    const setCols = setMatch[1].split(',').map(function (s) {
      return s.split('=')[0].trim();
    });
    const whereMatch = sql.match(/WHERE\s+(\w+)\s*=/i);
    const whereCol = whereMatch ? whereMatch[1].trim() : 'id';
    const valueParams = params.slice(0, setCols.length);
    const whereParam  = params[setCols.length];

    let changed = 0;
    table.forEach(function (row) {
      if (String(row[whereCol]) === String(whereParam)) {
        setCols.forEach(function (col, i) { row[col] = valueParams[i]; });
        changed++;
      }
    });
    saveDb();
    return { changes: changed };
  }

  throw new Error('Операция не поддержана: ' + info.op);
}

function runSelect(sql, params) {
  const info = tableOf(sql);
  if (!info) throw new Error('Неизвестный SQL');
  const table = _db[info.table];
  if (!table) throw new Error('Таблица не найдена');

  const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
  const whereCol = whereMatch ? whereMatch[1].trim() : null;

  let rows = table.slice();
  if (whereCol && params.length > 0) {
    const needle = String(params[0]).toLowerCase();
    rows = rows.filter(function (row) {
      return String(row[whereCol]).toLowerCase() === needle;
    });
  }

  const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
  if (orderMatch) {
    const col = orderMatch[1];
    const desc = (orderMatch[2] || '').toUpperCase() === 'DESC';
    rows.sort(function (a, b) {
      if (a[col] < b[col]) return desc ? 1 : -1;
      if (a[col] > b[col]) return desc ? -1 : 1;
      return 0;
    });
  }
  return rows;
}

const db = {
  prepare: prepare,
  run: function (sql, params) { return runSql(sql, params || []); }
};

module.exports = { initDb: initDb, db: db };