async function runSearch() {
  const params = new URLSearchParams();
  const from = document.getElementById('s-from').value.trim();
  const to   = document.getElementById('s-to').value.trim();
  const date = document.getElementById('s-date').value;

  if (from) params.set('from', from);
  if (to)   params.set('to', to);
  if (date) params.set('date', date);

  const container = document.getElementById('search-results');
  container.innerHTML = '<p class="empty">Поиск...</p>';

  try {
    const trips = await Api.get('/trips?' + params.toString());

    if (!trips.length) {
      container.innerHTML = '<p class="empty">Ничего не найдено.</p>';
      return;
    }

    container.innerHTML = trips.map(t => `
      <div class="card">
        <h3>${t.from_city} → ${t.to_city}</h3>
        <p><strong>Дата:</strong> ${t.date} в ${t.time}</p>
        <p><strong>Мест:</strong> ${t.seats} &nbsp;·&nbsp; <strong>Цена:</strong> ${t.price} ₽</p>
        <p><strong>Водитель:</strong> ${t.driver}</p>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `<p class="empty">Ошибка: ${e.message}</p>`;
  }
}

document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  runSearch();
});

runSearch();