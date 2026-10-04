// client/js/api.js
// Универсальный API-клиент: работает и локально, и на Render.

const API = (function () {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:3000/api';
  }
  return window.location.origin + '/api';
})();

const Api = {
  async request(method, path, body) {
    const opts = {
      method: method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(API + path, opts);
    const data = await res.json().catch(function () { return {}; });

    if (!res.ok) {
      const err = new Error(data.error || ('Ошибка ' + res.status));
      err.status = res.status;
      throw err;
    }
    return data;
  },

  get:  function (path)        { return Api.request('GET',  path); },
  post: function (path, body)  { return Api.request('POST', path, body); },
  put:  function (path, body)  { return Api.request('PUT',  path, body); }
};