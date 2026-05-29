/**
 * GIU Nexus — minimal browser API client.
 *
 * Talks to the Express backend (Backend/src/app.js). The base URL is read,
 * in order, from:
 *   1. window.GIU_NEXUS_API_BASE — for runtime overrides (e.g. tests)
 *   2. <meta name="api-base" content="..."> — for build/deploy-time config
 *   3. http://localhost:5000/api — sensible local dev default
 *
 * The token is stored in localStorage under `giu-nexus.token` and attached
 * automatically as a Bearer header on every request when present.
 *
 * No bundler, no dependencies. Loaded as a regular <script>; exposes a
 * single global `window.api`.
 */
(function (global) {
  'use strict';

  var TOKEN_KEY = 'giu-nexus.token';
  var DEFAULT_BASE = 'http://localhost:5000/api';

  function resolveBaseUrl() {
    if (typeof global.GIU_NEXUS_API_BASE === 'string' && global.GIU_NEXUS_API_BASE) {
      return global.GIU_NEXUS_API_BASE.replace(/\/$/, '');
    }
    var meta = document.querySelector('meta[name="api-base"]');
    if (meta && meta.content) return meta.content.replace(/\/$/, '');
    return DEFAULT_BASE;
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (_e) {
      return null;
    }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (_e) {
      // localStorage unavailable (e.g. private mode) — token only lives in memory.
    }
  }

  function clearToken() {
    setToken(null);
  }

  /**
   * Low-level request helper.
   * Resolves with the parsed JSON body on 2xx.
   * Rejects with an Error whose .status and .body are set on non-2xx,
   * or with a generic Error on network failure.
   */
  async function request(method, path, options) {
    options = options || {};
    var url = resolveBaseUrl() + path;
    var headers = Object.assign({ Accept: 'application/json' }, options.headers || {});

    var body = options.body;
    if (body !== undefined && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    var token = getToken();
    if (token && !headers.Authorization) {
      headers.Authorization = 'Bearer ' + token;
    }

    var res;
    try {
      res = await fetch(url, { method: method, headers: headers, body: body });
    } catch (networkErr) {
      var err = new Error('Network error: ' + (networkErr && networkErr.message));
      err.cause = networkErr;
      err.network = true;
      throw err;
    }

    var payload = null;
    var text = await res.text();
    if (text) {
      try { payload = JSON.parse(text); } catch (_e) { payload = { raw: text }; }
    }

    if (!res.ok) {
      var apiErr = new Error((payload && payload.message) || ('HTTP ' + res.status));
      apiErr.status = res.status;
      apiErr.body = payload;
      throw apiErr;
    }
    return payload;
  }

  function buildQuery(params) {
    if (!params) return '';
    var keys = Object.keys(params).filter(function (k) {
      return params[k] !== undefined && params[k] !== null && params[k] !== '';
    });
    if (!keys.length) return '';
    return '?' + keys.map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
  }

  var api = {
    // Configuration
    getBaseUrl: resolveBaseUrl,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,

    // Health
    health: function () { return request('GET', '/health'); },

    // Auth
    register: function (payload) {
      // payload: { name, email, password, role, company? }
      return request('POST', '/auth/register', { body: payload }).then(function (res) {
        var token = res && res.data && res.data.token;
        if (token) setToken(token);
        return res;
      });
    },
    login: function (payload) {
      return request('POST', '/auth/login', { body: payload }).then(function (res) {
        var token = res && res.data && res.data.token;
        if (token) setToken(token);
        return res;
      });
    },
    logout: function () { clearToken(); },
    me: function () { return request('GET', '/auth/me'); },

    // Jobs
    getJobs: function (params) {
      return request('GET', '/jobs' + buildQuery(params));
    },
    getJob: function (id) { return request('GET', '/jobs/' + encodeURIComponent(id)); },

    // AI (Hugging Face)
    extractSkills: function (text) {
      return request('POST', '/ai/skills/extract', { body: { text: text } });
    },
    matchScore: function (payload) {
      // payload: { cvText: string, jobs: [{ id, title?, description, requirements? }] }
      return request('POST', '/ai/match', { body: payload });
    },
    summarize: function (text, opts) {
      const body = { text: text };
      if (opts && typeof opts.minLength === 'number') body.minLength = opts.minLength;
      if (opts && typeof opts.maxLength === 'number') body.maxLength = opts.maxLength;
      return request('POST', '/ai/summarize', { body: body });
    }
  };

  global.api = api;
})(typeof window !== 'undefined' ? window : globalThis);
