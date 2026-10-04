// client/js/profile.js

let CURRENT_USER = null;

async function loadProfile() {
  CURRENT_USER = await getCurrentUser();
  if (!CURRENT_USER) { location.href = 'login.html'; return; }

  document.getElementById('p-name').value  = CURRENT_USER.name  || '';
  document.getElementById('p-email').value = CURRENT_USER.email || '';
  document.getElementById('p-phone').value = CURRENT_USER.phone || '';
  document.getElementById('p-bio').value   = CURRENT_USER.bio   || '';

  document.getElementById('profile-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const errBox = document.getElementById('profile-error');
    const okBox  = document.getElementById('profile-success');
    errBox.style.display = 'none';
    okBox.style.display  = 'none';

    try {
      await Api.put('/me', {
        name:  document.getElementById('p-name').value.trim(),
        phone: document.getElementById('p-phone').value.trim(),
        bio:   document.getElementById('p-bio').value.trim()
      });
      okBox.style.display = 'block';
      setTimeout(function () { okBox.style.display = 'none'; }, 2000);
      renderAuthNav();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    }
  });
}

// ── Мои заявки (как пассажир) ──
async function loadMyRequests() {
  const container = document.getElementById('my-requests');
  try {
    const reqs = await Api.get('/me/requests');
    if (!reqs.length) {
      container.innerHTML = '<p class="empty">У вас пока нет заявок.</p>';
      return;
    }

    const reviews = await Api.get('/reviews').catch(function () { return []; });

    container.innerHTML = reqs.map(function (r) {
      const badge = r.status === 'принята'    ? 'badge-success'
                  : r.status === 'отклонена'  ? 'badge-danger'
                  : 'badge-warning';

      const alreadyReviewed = reviews.some(function (rv) {
        return rv.author_id === CURRENT_USER.id && rv.driver_id === r.driver_id;
      });

      let reviewButton = '';
      if (r.status === 'принята' && !alreadyReviewed) {
        reviewButton = `<button class="btn btn-small" onclick="openReviewModal(${r.driver_id})">⭐ Оставить отзыв</button>`;
      } else if (alreadyReviewed) {
        reviewButton = `<span class="badge badge-success">⭐ Отзыв оставлен</span>`;
      }

      return `
        <div class="card">
          <h3>${r.from_city} → ${r.to_city}</h3>
          <p><strong>Дата:</strong> ${r.date} в ${r.time}</p>
          <p><strong>Водитель:</strong> ${r.driver}</p>
          <p>Статус: <span class="badge ${badge}">${r.status}</span></p>
          <div style="display:flex; gap:.5rem; margin-top:.7rem; flex-wrap:wrap">
            <a class="btn btn-secondary btn-small" href="chat.html?trip=${r.trip_id}">💬 Написать</a>
            ${reviewButton}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    container.innerHTML = '<p class="empty">Ошибка: ' + e.message + '</p>';
  }
}

// ── Заявки на мои поездки (как водитель) ──
async function loadIncomingRequests() {
  const container = document.getElementById('incoming-requests');
  try {
    const reqs = await Api.get('/me/incoming-requests');
    if (!reqs.length) {
      container.innerHTML = '<p class="empty">Пока никто не оставил заявок на ваши поездки.</p>';
      return;
    }
    container.innerHTML = reqs.map(function (r) {
      const badge = r.status === 'принята'    ? 'badge-success'
                  : r.status === 'отклонена'  ? 'badge-danger'
                  : 'badge-warning';

      const actions = r.status === 'ожидает' ? `
        <div style="display:flex; gap:.5rem; margin-top:.7rem; flex-wrap:wrap">
          <button class="btn btn-small" onclick="acceptRequest(${r.id})">✅ Принять</button>
          <button class="btn btn-secondary btn-small" onclick="rejectRequest(${r.id})">❌ Отклонить</button>
          <a class="btn btn-secondary btn-small" href="chat.html?trip=${r.trip_id}">💬 Написать</a>
        </div>
      ` : `
        <div style="display:flex; gap:.5rem; margin-top:.7rem; flex-wrap:wrap">
          <a class="btn btn-secondary btn-small" href="chat.html?trip=${r.trip_id}">💬 Написать</a>
        </div>
      `;

      return `
        <div class="card">
          <h3>${r.from_city} → ${r.to_city}</h3>
          <p><strong>Дата:</strong> ${r.date} в ${r.time}</p>
          <p><strong>Пассажир:</strong> ${r.passenger_name}</p>
          <p><strong>Контакты:</strong> ${r.passenger_phone || r.passenger_email || '—'}</p>
          <p>Статус: <span class="badge ${badge}">${r.status}</span></p>
          ${actions}
        </div>
      `;
    }).join('');
  } catch (e) {
    container.innerHTML = '<p class="empty">Ошибка: ' + e.message + '</p>';
  }
}

async function acceptRequest(id) {
  try {
    await Api.post('/requests/' + id + '/accept');
    loadIncomingRequests();
  } catch (e) { alert('Ошибка: ' + e.message); }
}

async function rejectRequest(id) {
  try {
    await Api.post('/requests/' + id + '/reject');
    loadIncomingRequests();
  } catch (e) { alert('Ошибка: ' + e.message); }
}

// ── Отзывы ──
async function loadReviews() {
  const container = document.getElementById('reviews-list');
  try {
    const reviews = await Api.get('/reviews');
    if (!reviews.length) {
      container.innerHTML = '<p class="empty">Отзывов пока нет.</p>';
      return;
    }
    container.innerHTML = reviews.map(function (r) {
      return `
        <div class="card">
          <p><strong>${r.driver}</strong> — ${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</p>
          <p>${r.text || ''}</p>
          <p><small>от ${r.author}</small></p>
        </div>
      `;
    }).join('');
  } catch (e) {
    container.innerHTML = '<p class="empty">Ошибка: ' + e.message + '</p>';
  }
}

// ── Модальное окно отзыва ──
let currentRating = 0;
let currentDriverId = null;

function openReviewModal(driverId) {
  currentDriverId = Number(driverId);   // ← ЯВНОЕ приведение к числу
  currentRating = 0;

  if (!currentDriverId || isNaN(currentDriverId)) {
    alert('Ошибка: не удалось определить водителя');
    return;
  }

  document.getElementById('review-text').value = '';
  document.getElementById('review-error').style.display = 'none';

  updateStars();
  document.getElementById('review-modal').style.display = 'flex';
}

function closeReviewModal() {
  document.getElementById('review-modal').style.display = 'none';
}

function setRating(n) {
  currentRating = n;
  updateStars();
}

function updateStars() {
  const stars = document.querySelectorAll('#review-stars span');
  stars.forEach(function (s, i) {
    s.textContent = i < currentRating ? '★' : '☆';
    s.classList.toggle('active', i < currentRating);
  });
}

async function submitReview() {
  const errBox = document.getElementById('review-error');
  errBox.style.display = 'none';

  if (currentRating < 1) {
    errBox.textContent = 'Поставьте оценку (1–5 звёзд)';
    errBox.style.display = 'block';
    return;
  }

  if (!currentDriverId) {
    errBox.textContent = 'Ошибка: не удалось определить водителя';
    errBox.style.display = 'block';
    return;
  }

  try {
    await Api.post('/reviews', {
      driver_id: currentDriverId,
      rating: currentRating,
      text: document.getElementById('review-text').value.trim()
    });
    closeReviewModal();
    loadReviews();
    loadMyRequests();
    alert('Спасибо за отзыв!');
  } catch (e) {
    errBox.textContent = e.message;
    errBox.style.display = 'block';
  }
}

document.addEventListener('DOMContentLoaded', function () {
  loadProfile();
  loadIncomingRequests();
  loadMyRequests();
  loadReviews();
});