// Проверка авторизации + отрисовка меню
async function getCurrentUser() {
    try {
      return await Api.get('/me');
    } catch {
      return null;
    }
  }
  
  async function renderAuthNav() {
    const user = await getCurrentUser();
    const navUl = document.querySelector('nav ul');
    if (!navUl) return;
  
    // Убираем старый auth-блок, если есть
    const old = navUl.querySelector('.auth-nav');
    if (old) old.remove();
  
    const authLi = document.createElement('li');
    authLi.className = 'auth-nav';
  
    if (user) {
      authLi.innerHTML = `
        <span style="color:var(--muted); margin-right:.5rem;">
          ${user.name}
        </span>
        <a href="#" id="logout-link">Выйти</a>
      `;
    } else {
      authLi.innerHTML = `
        <a href="login.html">Войти</a>
        <a href="register.html">Регистрация</a>
      `;
    }
  
    navUl.appendChild(authLi);
  
    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
      logoutLink.addEventListener('click', async (e) => {
        e.preventDefault();
        await Api.post('/logout');
        location.href = 'index.html';
      });
    }
  }
  
  // Запускается на каждой странице
  document.addEventListener('DOMContentLoaded', renderAuthNav);