// client/js/trips.js

function cityIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.indexOf('москв') !== -1)   return '🏛️';
  if (n.indexOf('петербург') !== -1 || n.indexOf('спб') !== -1) return '🌉';
  if (n.indexOf('казан') !== -1)   return '🕌';
  if (n.indexOf('екатеринбург') !== -1) return '🏔️';
  if (n.indexOf('новосибирск') !== -1) return '🌲';
  if (n.indexOf('сочи') !== -1)    return '🏖️';
  return '📍';
}

async function loadTrips() {
  const container = document.getElementById('trips-list');
  if (!container) return;

  try {
    const trips = await Api.get('/trips');
    const me = await getCurrentUser();

    if (!trips.length) {
      container.innerHTML = '<p class="empty">Пока нет ни одной поездки. <a href="create-trip.html">Создайте первую</a>!</p>';
      return;
    }

    container.innerHTML = trips.map(function (t) {
      const isMine = me && t.driver_id === me.id;
      return `
        <div class="trip-card">
          <div class="trip-route">
            <div class="trip-city">
              <span class="trip-city-icon">${cityIcon(t.from_city)}</span>
              ${t.from_city}
            </div>
            <div class="trip-arrow">↓</div>
            <div class="trip-city">
              <span class="trip-city-icon">${cityIcon(t.to_city)}</span>
              ${t.to_city}
            </div>
          </div>

          <div class="trip-info">
            <div class="trip-info-row">📅 <strong>${t.date}</strong> в ${t.time}</div>
            <div class="trip-info-row">💺 Мест: <strong>${t.seats}</strong></div>
            <div class="trip-info-row">💰 Цена: <strong>${t.price} ₽</strong></div>
            <div class="trip-info-row">👤 ${t.driver}${t.driver_rating ? ' ⭐ ' + t.driver_rating.toFixed(1) : ''}</div>
            ${t.description ? `<div class="trip-info-row">📝 ${t.description}</div>` : ''}
          </div>

          <div class="trip-actions">
            <div class="trip-driver">${isMine ? '🚗 Ваша поездка' : ''}</div>
            ${isMine
              ? `<a class="btn btn-secondary" href="chat.html?trip=${t.id}">💬 Чат</a>`
              : (me
                  ? `<button class="btn" onclick="sendRequest(${t.id})">✋ Заявка</button>
                     <a class="btn btn-secondary" href="chat.html?trip=${t.id}">💬 Написать</a>`
                  : `<a class="btn" href="login.html">Войти</a>`)}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    container.innerHTML = '<p class="empty">Ошибка: ' + e.message + '</p>';
  }
}

async function sendRequest(tripId) {
  try {
    await Api.post('/trips/' + tripId + '/requests');
    alert('Заявка отправлена! Водитель увидит её в своём профиле.');
  } catch (e) {
    alert('Ошибка: ' + e.message);
  }
}

async function loadStats() {
  try {
    const trips = await Api.get('/trips');
    const statTrips = document.getElementById('stat-trips');
    const statUsers = document.getElementById('stat-users');
    const statCities = document.getElementById('stat-cities');

    if (statTrips) statTrips.textContent = trips.length;

    const cities = new Set();
    trips.forEach(function (t) {
      cities.add(t.from_city.toLowerCase());
      cities.add(t.to_city.toLowerCase());
    });
    if (statCities) statCities.textContent = cities.size;

    // Пользователей — считаем по уникальным водителям + 1
    const drivers = new Set(trips.map(function (t) { return t.driver_id; }));
    if (statUsers) statUsers.textContent = Math.max(drivers.size, 1);
  } catch (e) {
    console.warn('Не удалось загрузить статистику:', e);
  }
}