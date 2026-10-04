// client/js/chat.js
// Живой чат: автообновление, индикатор «печатает...», онлайн-статус.

let CURRENT_TRIP_ID = null;
let CURRENT_USER = null;
let MESSAGES_TIMER = null;
let HEARTBEAT_TIMER = null;
let TYPING_SEND_TIMER = null;
let LAST_MESSAGE_KEY = '';       // ключ "count:lastId" — для отслеживания изменений

async function initChat() {
  CURRENT_USER = await getCurrentUser();
  if (!CURRENT_USER) { location.href = 'login.html'; return; }

  await renderChatList();

  const params = new URLSearchParams(location.search);
  const urlTrip = params.get('trip');
  if (urlTrip) openChat(Number(urlTrip));

  // Heartbeat — «я онлайн»
  sendHeartbeat();
  HEARTBEAT_TIMER = setInterval(sendHeartbeat, 10000);

  // Обновление сообщений + typing + online каждые 2 секунды
  MESSAGES_TIMER = setInterval(function () {
    if (CURRENT_TRIP_ID) {
      loadMessages(CURRENT_TRIP_ID);
      checkTyping(CURRENT_TRIP_ID);
      checkOnline(CURRENT_TRIP_ID);
    }
  }, 2000);

  // Форма отправки
  const form = document.getElementById('chat-form');
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !CURRENT_TRIP_ID) return;

    try {
      await Api.post('/trips/' + CURRENT_TRIP_ID + '/messages', { text: text });
      input.value = '';
      await loadMessages(CURRENT_TRIP_ID);
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  });

  // «Печатает...» — при вводе
  const input = document.getElementById('chat-input');
  input.addEventListener('input', function () {
    if (!CURRENT_TRIP_ID) return;
    if (TYPING_SEND_TIMER) return;
    Api.post('/trips/' + CURRENT_TRIP_ID + '/typing').catch(function () {});
    TYPING_SEND_TIMER = setTimeout(function () { TYPING_SEND_TIMER = null; }, 3000);
  });
}

async function sendHeartbeat() {
  try { await Api.post('/heartbeat'); } catch (e) {}
}

async function renderChatList() {
  const container = document.getElementById('chat-list-items');
  try {
    const trips = await Api.get('/trips');
    const myRequests = await Api.get('/me/requests').catch(function () { return []; });
    const requestedTrips = new Set(myRequests.map(function (r) { return r.trip_id; }));

    const mine = trips.filter(function (t) {
      return t.driver_id === CURRENT_USER.id || requestedTrips.has(t.id);
    });

    if (!mine.length) {
      container.innerHTML = '<p class="empty">Нет поездок для переписки.</p>';
      return;
    }

    container.innerHTML = mine.map(function (t) {
      const isDriver = t.driver_id === CURRENT_USER.id;
      return `
        <div class="chat-item" data-trip="${t.id}" onclick="openChat(${t.id})">
          <div class="chat-item-title">${t.from_city} → ${t.to_city}</div>
          <div class="chat-item-sub">${t.date} · ${isDriver ? '🚗 Вы водитель' : '✋ Вы пассажир'}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    container.innerHTML = '<p class="empty">Ошибка: ' + e.message + '</p>';
  }
}

async function openChat(tripId) {
  CURRENT_TRIP_ID = tripId;
  LAST_MESSAGE_KEY = '';           // сбрасываем ключ

  document.querySelectorAll('.chat-item').forEach(function (el) {
    el.classList.toggle('active', Number(el.getAttribute('data-trip')) === tripId);
  });

  document.getElementById('chat-form').style.display = 'block';

  try {
    const trips = await Api.get('/trips');
    const trip = trips.find(function (t) { return t.id === tripId; });
    if (trip) {
      document.getElementById('chat-header').innerHTML =
        '<h3>' + trip.from_city + ' → ' + trip.to_city + '</h3>' +
        '<small>Водитель: ' + trip.driver + ' · ' + trip.date + ' в ' + trip.time + '</small>' +
        '<div id="online-status" class="online-status"></div>';
    }
  } catch (e) { /* ignore */ }

  await loadMessages(tripId);
  await checkOnline(tripId);
}

async function loadMessages(tripId) {
  const box = document.getElementById('chat-box');
  try {
    const messages = await Api.get('/trips/' + tripId + '/messages');

    // Ключ: количество + id последнего сообщения
    const lastId = messages.length ? messages[messages.length - 1].id : 0;
    const key = messages.length + ':' + lastId;

    // Если ничего не изменилось — не перерисовываем
    if (key === LAST_MESSAGE_KEY) return;
    LAST_MESSAGE_KEY = key;

    if (!messages.length) {
      box.innerHTML = '<p class="empty">Сообщений пока нет. Напишите первым!</p>';
      return;
    }

    let html = '';
    let lastDate = '';

    messages.forEach(function (m) {
      const msgDate = parseServerDate(m.created_at);
      const dateLabel = formatDate(msgDate);

      if (dateLabel !== lastDate) {
        html += '<div class="chat-date-separator">' + dateLabel + '</div>';
        lastDate = dateLabel;
      }

      const isMe = m.author_id === CURRENT_USER.id;
      const time = msgDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

      html += `
        <div class="msg ${isMe ? 'me' : 'other'}">
          ${!isMe ? '<div class="msg-author">' + m.author + '</div>' : ''}
          <div class="msg-text">${escapeHtml(m.text)}</div>
          <div class="msg-time">${time}</div>
        </div>
      `;
    });

    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
  } catch (e) {
    box.innerHTML = '<p class="empty">Ошибка: ' + e.message + '</p>';
  }
}

async function checkTyping(tripId) {
  try {
    const data = await Api.get('/trips/' + tripId + '/typing');
    const indicator = document.getElementById('typing-indicator');

    if (data.typing && data.typing.length > 0) {
      if (!indicator) {
        const div = document.createElement('div');
        div.id = 'typing-indicator';
        div.className = 'typing-indicator';
        div.innerHTML = '<span></span><span></span><span></span> печатает...';
        document.getElementById('chat-box').appendChild(div);
        document.getElementById('chat-box').scrollTop = 999999;
      }
    } else {
      if (indicator) indicator.remove();
    }
  } catch (e) { /* ignore */ }
}

async function checkOnline(tripId) {
  try {
    const data = await Api.get('/trips/' + tripId + '/online');
    const statusEl = document.getElementById('online-status');
    if (!statusEl) return;

    if (data.online && data.online.length > 0) {
      statusEl.innerHTML = '<span class="dot online"></span> собеседник онлайн';
    } else {
      statusEl.innerHTML = '<span class="dot offline"></span> офлайн';
    }
  } catch (e) { /* ignore */ }
}

// Парсинг времени сервера
function parseServerDate(s) {
  if (!s) return new Date();
  if (s.charAt(s.length - 1) === 'Z') return new Date(s);
  return new Date(s + 'Z');
}

function formatDate(date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const y = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

  if (d.getTime() === t.getTime()) return 'Сегодня';
  if (d.getTime() === y.getTime()) return 'Вчера';

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

initChat();