(() => {
  // ===============================
  // ИНИЦИАЛИЗАЦИЯ (защита от падения на старых WebView)
  // ===============================
  // Telegram WebApp может отсутствовать при открытии вне Telegram — работаем безопасно.
  const tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

  // ===============================
  // UTILS (must exist globally inside this bundle)
  // ===============================
  const escapeHtml = (val) => {
    const s = String(val == null ? "" : val);
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const formatMoney = (v) => {
    if (v === null || v === undefined || v === "" || v === "—") return "—";
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    try { return `${n.toLocaleString("ru-RU")} ₽`; } catch(_) { return `${n} ₽`; }
  };

  const formatDate = (ts) => {
    try {
      const d = new Date(ts);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yy = String(d.getFullYear()).slice(-2);
      return `${dd}.${mm}.${yy}`;
    } catch (_) {
      return "—";
    }
  };

  const normalizeStatus = (raw) => {
    if (!raw) return { label: "Принят", dot: "blue" };
    const s = String(raw).toLowerCase();

    const internal = ["из симфера", "из муссона", "отправили", "в цех", "севастополь"];
    if (internal.some(x => s.includes(x))) return { label: "В логистике", dot: "orange" };

    if (s.includes("соглас")) return { label: "Согласование", dot: "orange" };
    if (s.includes("готов")) return { label: "Готов", dot: "green" };
    if (s.includes("в работе") || s.includes("работе")) return { label: "В работе", dot: "orange" };
    if (s.includes("возврат")) return { label: "Возврат", dot: "red" };
    if (s.includes("закрыт") || s.includes("выдан") || s.includes("заверш")) return { label: "Завершён", dot: "gray" };
    if (s.includes("нов")) return { label: "Принят", dot: "blue" };
    return { label: "В работе", dot: "orange" };
  };
  // Диагностика: ловим ошибки JS и, если возможно, показываем алерт в Telegram.
  // Важно: НЕ используем optional chaining здесь, чтобы не ломаться на старых WebView.
  const _showFatal = (err) => {
    try { console.error(err); } catch (_) {}
    let msg = '';
    try {
      if (err && (err.message || err.reason)) msg = String(err.message || err.reason);
      else msg = String(err);
    } catch (_) { msg = 'Неизвестная ошибка'; }
    try { if (tg && tg.showAlert) tg.showAlert(('Ошибка в мини‑аппе: ' + msg).slice(0, 220)); } catch (_) {}
  };
  window.addEventListener('error', (ev) => {
    try { _showFatal(ev && (ev.error || ev.message) ? (ev.error || ev.message) : ev); } catch (_) {}
  });
  window.addEventListener('unhandledrejection', (ev) => {
    try { _showFatal(ev && ev.reason ? ev.reason : ev); } catch (_) {}
  });

	// NOTE: We used to wrap the whole app in a single try/catch.
	// On some builds this wrapper got out of sync during edits and could break parsing.
	// We keep smaller try/catch blocks around risky init parts instead.
  const SUPABASE_FUNCTION_URL = "https://jcnusmqellszoiuupaat.functions.supabase.co/enqueue_request";
  const SUPABASE_REST_URL = "https://jcnusmqellszoiuupaat.supabase.co/rest/v1";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjbnVzbXFlbGxzem9pdXVwYWF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzc1NjEsImV4cCI6MjA4MzgxMzU2MX0.6rtU1xX0kB_eJDaeoSnrIC47ChqxLAtSz3sv8Oo5TJQ";
  const SUPABASE_ESTIMATES_URL = "https://jcnusmqellszoiuupaat.functions.supabase.co/estimates";
  const SUPABASE_RESERVE_PROMO_URL = "https://jcnusmqellszoiuupaat.functions.supabase.co/reserve_promo";
  const SUPABASE_GET_PROFILE_URL = "https://jcnusmqellszoiuupaat.functions.supabase.co/get_profile";

  async function reservePromoCode() {
    const res = await fetch(SUPABASE_RESERVE_PROMO_URL, {
      method: "POST",
      mode: "cors",
      headers: {
        "content-type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({}),
    });
  
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch (_) {}
  
    if (!res.ok || !(data && data.ok) || !(data && data.code)) {
      throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}: ${raw}`);
    }
  
    return String(data.code);
  }

  function updatePhotoRequestsButton(requests){
    const btn = document.getElementById('photoRequestsBtn');
    if (!btn) return;
  
    if (!requests || requests.length === 0){
      btn.style.display = 'none';
      return;
    }
  
    btn.style.display = 'flex';
  
    const unread = requests.filter(r => r.has_admin_reply && !r.read).length;
  
    btn.classList.remove('green','blue','blink');
    var __tmp = btn.querySelector('.badge'); if (__tmp) __tmp.remove();
  
    if (unread > 0){
      btn.classList.add('blue');
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = unread;
      btn.appendChild(badge);
    } else {
      btn.classList.add('green','blink');
    }
  }
    
  async function getRemoteProfile(tg_id) {
    const res = await fetch(SUPABASE_GET_PROFILE_URL, {
      method: "POST",
      mode: "cors",
      headers: {
        "content-type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ tg_id }),
    });
  
    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch (_) {}
  
    if (!res.ok || !(data && data.ok)) return null;
    return data.profile || null;
  }

  // ---------------- PROFILE SYNC (Supabase -> mini-app) ----------------
  // Нужно, чтобы изменения профиля на одном устройстве подтягивались на другом.
  const REMOTE_STAMP_KEY = "_remote_updated_at";

  function _stampOfProfile(p){
    const s = (p && (p[REMOTE_STAMP_KEY] || p.updated_at)) ? String(p[REMOTE_STAMP_KEY] || p.updated_at) : "";
    return s;
  }

  async function syncRemoteProfileIfNewer({ force = false } = {}) {
    try {
      const tg_id = getTgId();
      if (!tg_id) return false;

      const rp = await getRemoteProfile(tg_id);
      if (!rp) return false;

      // Берём только то, что нужно мини-аппу.
      // ВАЖНО: не затираем локальные поля пустыми значениями с сервера.
      // (Особенно gender — иначе он "слетает" после переключения вкладок.)
      const remote = {
        city: (rp.city || "").toString(),
        first_name: rp.first_name || "",
        last_name: rp.last_name || "",
        phone: rp.phone || "",
        promo_code: ((rp.promo_code)!=null ? (rp.promo_code) : null),
        promo_percent: ((rp.promo_percent)!=null ? (rp.promo_percent) : null),
        promo_used: !!rp.promo_used,
        // синхронизация адресов (до 5)
        saved_addresses: Array.isArray(rp.saved_addresses) ? rp.saved_addresses : (Array.isArray(rp.saved_addresses_json) ? rp.saved_addresses_json : null),
      };

      // Если профиль в Supabase пустой — не трогаем локальный
      if (!(remote.city && remote.first_name && remote.phone)) return false;

      const local = loadProfile() || {};
      const localStamp = _stampOfProfile(local);
      const remoteStamp = String(rp.updated_at || "");

      const differs =
        String(local.city || "") !== String(remote.city || "") ||
        String(local.first_name || "") !== String(remote.first_name || "") ||
        String(local.last_name || "") !== String(remote.last_name || "") ||
        String(local.phone || "") !== String(remote.phone || "") ||
        (Array.isArray(remote.saved_addresses) && JSON.stringify(local.saved_addresses || []) !== JSON.stringify(remote.saved_addresses || []));

const shouldUpdate = force || differs || (!!remoteStamp && (!localStamp || remoteStamp > localStamp));
      if (!shouldUpdate) return false;

      const mergedCity = String(remote.city || "").trim() || (local.city || "");
      // не тащим null/пустые адреса
      const mergedSaved = Array.isArray(remote.saved_addresses)
        ? remote.saved_addresses.slice(0, 5)
        : (Array.isArray(local.saved_addresses) ? local.saved_addresses.slice(0, 5) : []);

      saveProfile({
        ...local,
        ...remote,
        city: mergedCity,
        saved_addresses: mergedSaved,
        [REMOTE_STAMP_KEY]: remoteStamp || localStamp || "",
      });
localStorage.setItem("shetka_registered_v1", "1");
return true;
    } catch (e) {
      console.log("syncRemoteProfileIfNewer error:", e);
      return false;
    }
  }
  
  // telegram init
  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.disableVerticalSwipes(); } catch (_) {}
  }
  
  // ---------------- Viewport height sync (fix 100vh issues in Telegram/iOS) ----------------
  const syncViewportVars = () => {
    const h = (tg && (tg.viewportHeight || tg.viewportStableHeight)) || window.innerHeight || 0;
    if (h) document.documentElement.style.setProperty('--vh', `${h}px`);
  };
  syncViewportVars();
  window.addEventListener('resize', syncViewportVars, { passive: true });
  try {
    if (tg && tg.onEvent) tg.onEvent('viewportChanged', syncViewportVars);
  } catch (_) {}


  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------------- Micro-animations helpers ----------------
  let _revealObs = null;
  function initRevealObserver(){
    // animations removed for performance
    return;
  }

  // Home intro animation (CTA buttons slide in every time Home opens)
  const runHomeIntro = () => {};

  const html = document.documentElement;
  try { html.classList.add("static-ui", "no-bg"); } catch (_) {}

  // sendData bridge
  const sendToBot = (cmd, payload = {}) => {
    const data = JSON.stringify({ cmd, ...payload, ts: Date.now() });
    if (tg) tg.sendData(data);
    else console.log("sendData:", data);
  };

  const haptic = (kind = "light") => {
    if (!(tg && tg.HapticFeedback)) return;
    try { tg.HapticFeedback.impactOccurred(kind); } catch (_) {}
  };

  // ---------------- SUPABASE QUEUE (enqueue_request) ----------------
  const getTgId = () => (tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? tg && tg.initDataUnsafe && tg.initDataUnsafe.user.id : undefined) || 0;

  async function supaEnqueue(kind, payload_json = {}) {
    const tg_id = getTgId();

    const res = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      mode: "cors",
      headers: {
        "content-type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ kind, tg_id, payload_json }),
    });

    const raw = await res.text();
    let data = null;
    try { data = JSON.parse(raw); } catch (_) {}

    if (!res.ok || !data || !data.ok) {
      throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}: ${raw}`);
    }
    return data;
  }

// ---------------- MODALS HELPERS ----------------
let __scrollY = 0;

const lockScroll = () => {
  __scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.body.style.position = "fixed";
  document.body.style.top = `-${__scrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
  document.body.style.overflow = "hidden";
};

const unlockScroll = () => {
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  document.body.style.overflow = "";
  window.scrollTo(0, __scrollY);
};

const openModalEl = (el) => {
  if (!el) return;
  el.classList.add("show");
  el.setAttribute("aria-hidden", "false");
  lockScroll();
};

const closeModalEl = (el) => {
  if (!el) return;
  el.classList.remove("show");
  el.setAttribute("aria-hidden", "true");
  unlockScroll();
};

  // ---------------- Dropoff choice + map (no API key) ----------------
  const dropoffChoiceBtn = $("#openDropoffChoice");
  const dropoffModal = $("#dropoffModal");
  const dropoffMapModal = $("#dropoffMapModal");
  const dropoffMapFrame = $("#dropoffMapFrame");
  const dropoffCopyBtn = $("#dropoffCopyBtn");
  const dropoffRouteBtn = $("#dropoffRouteBtn");

  // Константы точки (один источник)
  const DROPOFF_POINT = {
    lat: 44.61665,
    lon: 33.52537,
    address: "Адрес мастерской (изменить в DROPOFF_POINT)",
    hours: "Ежедневно 09:00–21:00",
  };

  function buildYandexMapUrl({ lat, lon, z = 14 } = {}) {
    const ll = `${lon},${lat}`;
    // Yandex maps embed without keys
    return `https://yandex.ru/map-widget/v1/?ll=${encodeURIComponent(ll)}&z=${encodeURIComponent(String(z))}&l=map&pt=${encodeURIComponent(ll)},pm2rdm`;
  }

  function openDropoffModal(){
    openModalEl(dropoffModal);
    initRevealObserver();
  }

  if (dropoffChoiceBtn) dropoffChoiceBtn.addEventListener('click', () => {
    haptic('light');
    openDropoffModal();
  });

  $$('[data-dropoff-close]').forEach(el => el.addEventListener('click', () => closeModalEl(dropoffModal)));
  $$('[data-map-close]').forEach(el => el.addEventListener('click', () => closeModalEl(dropoffMapModal)));

  // Open map modal + "zoom-in" steps via URL change
  var __el = document.getElementById('openDropoffMap'); if (__el) __el.addEventListener('click', () => {
    haptic('light');
    try { closeModalEl(dropoffModal); } catch(_) {}
    if (dropoffMapFrame) {
      // сначала показываем карту без сильного зума
      const initialSrc = buildYandexMapUrl({ ...DROPOFF_POINT, z: 13 });
      dropoffMapFrame.src = initialSrc;

      // Зум делаем только после того, как iframe успел загрузиться (и подождали 2–3 секунды)
      // чтобы избежать дерганий/перезагрузок на слабых устройствах.
      let zoomed = false;
      const onLoad = () => {
        if (zoomed) return;
        zoomed = true;
        setTimeout(() => {
          try { dropoffMapFrame.src = buildYandexMapUrl({ ...DROPOFF_POINT, z: 16 }); } catch(_){}
        }, 2400);
      };
      try {
        dropoffMapFrame.addEventListener('load', onLoad, { once: true });
      } catch(_) {
        setTimeout(onLoad, 2600);
      }
    }
    const addr = document.getElementById('dropoffAddr');
    const hrs = document.getElementById('dropoffHours');
    if (addr) addr.textContent = DROPOFF_POINT.address;
    if (hrs) hrs.textContent = DROPOFF_POINT.hours;
    openModalEl(dropoffMapModal);
  });

  if (dropoffCopyBtn) dropoffCopyBtn.addEventListener('click', async () => {
    const text = DROPOFF_POINT.address;
    try {
      await navigator.clipboard.writeText(text);
      if (tg && tg.showAlert) tg.showAlert('Адрес скопирован');
    } catch (_) {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch(_e) {}
      ta.remove();
      try { if (tg && tg.showAlert) tg.showAlert('Адрес скопирован'); } catch(_e){}
    }
    haptic('light');
  });

  if (dropoffRouteBtn) dropoffRouteBtn.addEventListener('click', () => {
    // Открываем маршрут в Yandex Navigator (если есть), иначе — в Яндекс.Картах
    const lat = DROPOFF_POINT.lat;
    const lon = DROPOFF_POINT.lon;
    const deep = `yandexnavi://build_route_on_map?lat_to=${encodeURIComponent(String(lat))}&lon_to=${encodeURIComponent(String(lon))}`;
    const web = `https://yandex.ru/maps/?rtext=~${encodeURIComponent(String(lat))},${encodeURIComponent(String(lon))}&rtt=auto&z=16`;

    try {
      // Telegram на мобилках обычно корректно открывает deep-link
      if (tg && tg.openLink) tg.openLink(deep);
      // fallback, если deep-link не сработал
      setTimeout(() => { try { if (tg && tg.openLink) tg.openLink(web); } catch(_) { window.open(web, '_blank'); } }, 420);
    } catch (_) {
      try { window.location.href = deep; } catch(_e) {}
      setTimeout(() => { try { window.open(web, '_blank'); } catch(_e) {} }, 420);
    }
    haptic('light');
  });
    
  // ---------------- THEME ----------------
  const themeBtn = $("#themeToggle");

  const getPreferredTheme = () => {
    const saved = localStorage.getItem("shetka_theme");
    if (saved === "light" || saved === "dark") return saved;
    if ((tg && tg.colorScheme)) return tg.colorScheme;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const applyTheme = (mode) => {
    html.setAttribute("data-theme", mode);
    localStorage.setItem("shetka_theme", mode);

    if (tg) {
      try {
        tg.setHeaderColor(mode === "dark" ? "#0f1115" : "#ffffff");
        tg.setBackgroundColor(mode === "dark" ? "#0b0c0f" : "#f6f7f8");
      } catch (_) {}
    }
  };

  const syncThemeSwitch = () => {
    if (!themeBtn) return;
    const cur = html.getAttribute("data-theme") || "light";
    themeBtn.setAttribute("aria-checked", cur === "dark" ? "true" : "false");
  };

  const toggleTheme = () => {
    const cur = html.getAttribute("data-theme") || "light";
    const next = cur === "dark" ? "light" : "dark";
    applyTheme(next);
    syncThemeSwitch();
    // pattern image depends on theme
    setPatternEnabled(getPatternEnabled());

    // обновляем отзывы под тему
    try {
      const theme = html.getAttribute('data-theme') || 'light';
      const suffix = theme === 'dark' ? 'b' : 'l';
      document.querySelectorAll('img.reviewImg[data-review]').forEach((img) => {
        const i = Number(img.getAttribute('data-review') || '1');
        img.src = `o${i}${suffix}.png`;
      });
    } catch (_) {}

    haptic("light");
  };

  // ---------------- PATTERN ----------------
  // По ТЗ: фон всегда включен. Кнопку/тумблер убрали.
  const patternBtn = $("#patternToggle");

  const getPatternEnabled = () => false;

  const syncPatternSwitch = () => {
    if (!patternBtn) return;
    const enabled = getPatternEnabled();
    patternBtn.setAttribute("aria-checked", enabled ? "true" : "false");
  };

  const setPatternEnabled = (enabled) => {
    html.classList.toggle("pattern-on", !!enabled);
    syncPatternSwitch();
  };

  // init theme + pattern
  applyTheme(getPreferredTheme());
  setPatternEnabled(false);
  syncThemeSwitch();

  if (themeBtn) themeBtn.addEventListener("click", toggleTheme);
  // patternBtn отсутствует (фон всегда включен)

  
  // =====================
  // ORDERS
  // =====================
  const ordersList = document.getElementById("ordersList");
  const searchInput = document.getElementById("orderSearchInput");
  const searchBtn = document.getElementById("orderSearchBtn");
  const searchResult = document.getElementById("searchResult");

  const modal = document.getElementById("orderModal");
  const modalContent = document.getElementById("modalContent");

  const myTgId = tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? (tg.initDataUnsafe.user.id || 0) : 0;

  // Demo data (если нужен реальный бэкенд — подключим позже; UI уже готов)
  let ORDERS = [];
  (function initDemoOrders(){
    const now = Date.now();
    ORDERS = [
      {
        id: "10234",
        owner_tg_id: myTgId,
        created_ts: now - 2 * 60 * 60 * 1000,
        item: "Обувь · кроссовки",
        services: ["Химчистка обуви"],
        status_raw: "В работе",
        price: 1990
      }
    ];
  })();

  const isMine = (o) => !!(myTgId && o && o.owner_tg_id === myTgId);

  const orderCard = (o, limited) => {
    const st = normalizeStatus(o.status_raw);
    const date = formatDate(o.created_ts);

    const lines = limited
      ? `
        <div class="orderLine"><span>Изделие:</span> ${escapeHtml(o.item || "—")}</div>
        <div class="orderLine"><span>Статус:</span> ${escapeHtml(st.label)}</div>
        <div class="orderLine"><span>Дата:</span> ${escapeHtml(date)}</div>
      `
      : `
        <div class="orderLine"><span>Изделие:</span> ${escapeHtml(o.item || "—")}</div>
        <div class="orderLine"><span>Услуги:</span> ${escapeHtml((o.services || []).join(", ") || "—")}</div>
        <div class="orderLine"><span>Статус:</span> ${escapeHtml(st.label)}</div>
        <div class="orderLine"><span>Стоимость:</span> ${escapeHtml(formatMoney(o.price))}</div>
        <div class="orderLine"><span>Дата:</span> ${escapeHtml(date)}</div>
      `;

    const wrap = document.createElement("div");
    wrap.className = "order glass";
    wrap.innerHTML = `
      <div class="orderTop">
        <div>
          <div class="orderId">Заказ №${escapeHtml(o.id)}</div>
          <div class="orderMeta">${escapeHtml(date)}</div>
        </div>
        <div class="status"><span class="sDot ${escapeHtml(st.dot)}"></span>${escapeHtml(st.label)}</div>
      </div>
      <div class="orderBody">${lines}</div>
    `;
    wrap.addEventListener("click", () => openOrderModal(o, limited));
    return wrap;
  };

  const renderSearchResult = (order) => {
    if (!searchResult) return;
    searchResult.innerHTML = "";
    if (!order) {
      const box = document.createElement("div");
      box.className = "order glass";
      box.innerHTML = `
        <div class="orderTop">
          <div>
            <div class="orderId">Ничего не найдено</div>
            <div class="orderMeta">Проверьте номер заказа</div>
          </div>
        </div>
      `;
      searchResult.appendChild(box);
      return;
    }
    const limited = !isMine(order);
    searchResult.appendChild(orderCard(order, limited));
  };

  const findOrderById = (id) => {
    const needle = String(id || "").trim();
    if (!needle) return null;
    return ORDERS.find(o => String(o.id) === needle) || null;
  };

  const openOrderModal = (o, limited) => {
    if (!modal || !modalContent) return;
    const st = normalizeStatus(o.status_raw);
    const date = formatDate(o.created_ts);

    modalContent.innerHTML = `
      <div class="modalH">Заказ №${escapeHtml(o.id)}</div>
      <p class="modalP">${limited ? "Показана краткая карточка заказа." : "Детали заказа."}</p>
      <div class="modalGrid">
        <div class="modalRow"><span>Статус</span><b>${escapeHtml(st.label)}</b></div>
        <div class="modalRow"><span>Изделие</span><b>${escapeHtml(o.item || "—")}</b></div>
        ${limited ? "" : `<div class="modalRow"><span>Услуги</span><b>${escapeHtml((o.services||[]).join(", ") || "—")}</b></div>`}
        ${limited ? "" : `<div class="modalRow"><span>Стоимость</span><b>${escapeHtml(formatMoney(o.price))}</b></div>`}
        <div class="modalRow"><span>Дата</span><b>${escapeHtml(date)}</b></div>
      </div>
    `;
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  };

  const closeModal = () => {
    if (!modal) return;
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };

  (function bindOrdersUi(){
    try {
      document.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", closeModal));
      searchBtn && searchBtn.addEventListener("click", () => {
        const id = (searchInput && searchInput.value ? searchInput.value : "").trim();
        if (!id) return;
        renderSearchResult(findOrderById(id));
      });
      searchInput && searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          searchBtn && searchBtn.click();
        }
      });
    } catch(_) {}
  })();

  const renderOrders = () => {
    if (!ordersList) return;
    ordersList.innerHTML = "";
    const my = ORDERS.filter(isMine);
    my.forEach(o => ordersList.appendChild(orderCard(o, false)));
  };

// ---------------- NAV ----------------
  // Tab pages (bottom nav): home | orders | services | about
  // Flow pages (push stack): estimate | courierWizard | courier_requests | photo_estimates | ...
  let currentPage = "home";
  const pageStack = ["home"];

  const setTabActive = (page) => {
    $$(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.nav === page));
  };

  const showPage = (page, { push = true } = {}) => {
    if (page === currentPage) {
      if (page === "home") { try { runHomeIntro(); } catch(_) {} }
      return;
    }

    const curEl = $(`.page[data-page="${currentPage}"]`);
    const nextEl = $(`.page[data-page="${page}"]`);
    if (!nextEl) return;

    // page transition (fade + slight translateY)
    if (curEl) {
      curEl.classList.remove("pageActive");
      // hide after transition
      setTimeout(() => { try { curEl.hidden = true; } catch (_) {} }, 240);
    }
    nextEl.hidden = false;
    nextEl.classList.add("pageEntering");
    requestAnimationFrame(() => {
      nextEl.classList.add("pageActive");
      nextEl.classList.remove("pageEntering");
    });

    currentPage = page;
    if (push) pageStack.push(page);
    setTabActive(page);

    // при переключении страницы сбрасываем скролл, чтобы логотип "уходил под блоки" корректно везде
    try { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); } catch (_) { try { window.scrollTo(0, 0); } catch(_) {} }
    document.body.classList.remove("logoBehind");
    
    document.body.classList.toggle("page-estimate", page === "estimate");

    // Tab pages
    if (page === "home") {
      hydrateProfile();
      syncRemoteProfileIfNewer({ force: true }).then((changed) => {
        if (changed) hydrateProfile();
      });
      // replay CTA entrance each time
      try { runHomeIntro(); } catch(_) {}
    }
    if (page === "orders") renderOrders();
    if (page === "services") renderServices();
    if (page === "about") initAboutOnce();
    if (page === "photo_estimates") {
      // при заходе обновляем и рисуем
      peRefreshAll(true).catch(() => {});
    }
  };

  const confirmLeaveCourier = (next) => {
    const doLeave = () => {
      try { CR_WIZ = null; } catch(_) {}
      if (typeof next === "function") next();
    };
    try {
      if ((tg && tg.showConfirm)) {
        tg.showConfirm("Выйти из формы? Данные не сохранятся.", (ok) => {
          if (ok) doLeave();
        });
        return;
      }
    } catch(_) {}
    // fallback
    confirmDialog("Выйти из формы? Данные не сохранятся.").then((ok) => { if (ok) doLeave(); });
  };

  const goBack = () => {
    if (pageStack.length <= 1) return;
    pageStack.pop();
    const prev = pageStack[pageStack.length - 1];
    showPage(prev, { push: false });
    haptic("light");
  };

  $$ ("[data-nav]").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = String(btn.dataset.nav || "");
      const go = () => { showPage(target); haptic("light"); };
      if (currentPage === "courier" && CR_WIZ && target && target !== "courier") {
        confirmLeaveCourier(go);
        return;
      }
      go();
    });
  });
  $$ ("[data-back]").forEach(btn => btn.addEventListener("click", goBack));

  // ---------------- ABOUT (segmented) ----------------
let _aboutInited = false;
function initAboutOnce(){
  if (_aboutInited) return;
  _aboutInited = true;

  const seg = document.getElementById('aboutSeg');
  const pAbout = document.getElementById('aboutPanelAbout');
  const pReviews = document.getElementById('aboutPanelReviews');
  const pCases = document.getElementById('aboutPanelCases');

  const setAboutTab = (key) => {
    const k = String(key || 'about');

    // buttons
    if (seg) {
      Array.prototype.slice.call(seg.querySelectorAll('button[data-about-tab]')).forEach((b) => {
        const isActive = (b.getAttribute('data-about-tab') || '') === k;
        b.classList.toggle('active', isActive);
        try { b.setAttribute('aria-selected', isActive ? 'true' : 'false'); } catch (_) {}
      });
    }

    // panels
    if (pAbout) pAbout.hidden = (k !== 'about');
    if (pReviews) pReviews.hidden = (k !== 'reviews');
    if (pCases) pCases.hidden = (k !== 'cases');

    // jump to top on tab switch
    try { window.scrollTo(0, 0); } catch (_) {}
  };

  // tabs click
  if (seg) seg.addEventListener('click', (e) => {
    const btn = (e && e.target && e.target.closest) ? e.target.closest('button[data-about-tab]') : null;
    if (!btn) return;
    setAboutTab(btn.getAttribute('data-about-tab'));
    haptic('light');
  });

  // FAQ accordion
  Array.prototype.slice.call(document.querySelectorAll('[data-acc]')).forEach((acc) => {
    acc.addEventListener('click', (e) => {
      const head = (e && e.target && e.target.closest) ? e.target.closest('[data-acc-head]') : null;
      if (!head) return;
      const item = head.closest('[data-acc-item]');
      if (!item) return;
      const open = item.classList.toggle('open');
      try { item.setAttribute('aria-expanded', open ? 'true' : 'false'); } catch (_) {}
      haptic('light');
    });
  });

  // reviews carousel progress
  const track = document.getElementById('reviewsTrack');
  const progressBar = document.getElementById('reviewsProgressBar');
  if (track && progressBar) {
    const progressWrap = progressBar.parentElement;

    const updateProgress = () => {
      const max = (track.scrollWidth - track.clientWidth);
      const pct = max <= 0 ? 0 : Math.max(0, Math.min(1, track.scrollLeft / max));
      progressBar.style.width = String(Math.round(pct * 100)) + '%';
    };

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; updateProgress(); });
    };

    track.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    if (progressWrap && progressWrap.addEventListener) {
      progressWrap.addEventListener('click', (e) => {
        try {
          const rect = progressWrap.getBoundingClientRect();
          const x = (e && typeof e.clientX === 'number') ? (e.clientX - rect.left) : 0;
          const r = rect.width ? (x / rect.width) : 0;
          const max = (track.scrollWidth - track.clientWidth);
          const left = Math.max(0, Math.min(max, r * max));
          track.scrollLeft = left;
          updateProgress();
        } catch (_) {}
      });
    }

    updateProgress();
  }

  // BEFORE/AFTER (gallery with click viewer)
  const BA_PAIRS = [
    { before: 'do1.png', after: 'posle1.png' }
  ];

  const viewer = document.getElementById('baViewer');
  const imgB = document.getElementById('baImgBefore');
  const imgA = document.getElementById('baImgAfter');
  const thumbs = document.getElementById('baThumbs');

  const setImgSafe = (imgEl, url, fallbackUrl) => {
    if (!imgEl) return;
    const probe = new Image();
    probe.onload = () => { imgEl.src = url; };
    probe.onerror = () => { imgEl.src = fallbackUrl; };
    probe.src = url;
  };

  const openViewer = (pairIdx) => {
    const pair = BA_PAIRS[Math.max(0, Math.min(BA_PAIRS.length - 1, pairIdx))] || BA_PAIRS[0];
    setImgSafe(imgB, pair.before, 'do1.png');
    setImgSafe(imgA, pair.after, 'posle1.png');

    if (viewer) {
      viewer.classList.add('open');
      try { viewer.setAttribute('aria-hidden', 'false'); } catch (_) {}
    }

	  // lock background scroll + dim backdrop
	  try { document.body.classList.add('baOpen'); } catch (_) {}
	  try { document.documentElement.classList.add('baOpen'); } catch (_) {}
  };

  const closeViewer = () => {
    if (!viewer) return;
    viewer.classList.remove('open');
    try { viewer.setAttribute('aria-hidden', 'true'); } catch (_) {}
	  try { document.body.classList.remove('baOpen'); } catch (_) {}
	  try { document.documentElement.classList.remove('baOpen'); } catch (_) {}
  };

	// ------- 3D/parallax movement for scattered thumbs (mobile only) -------
	const isMobile = () => {
	  try {
	    const w = Math.min(window.innerWidth || 0, window.innerHeight || 0);
	    return w > 0 && w <= 820;
	  } catch (_) { return false; }
	};

	let _baOriOn = false;
	let _baGamma = 0;
	let _baBeta = 0;
	let _baRAF = 0;

	const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
	const applyBaParallax = () => {
	  _baRAF = 0;
	  if (!thumbs) return;
	  // normalize: gamma=-45..45 (left/right), beta=-45..45 (front/back)
	  const g = clamp(_baGamma, -35, 35) / 35; // -1..1
	  const b = clamp(_baBeta, -35, 35) / 35;
		  // subtle movement so it feels premium, not "crazy"
		  const btns = thumbs.querySelectorAll ? thumbs.querySelectorAll('.baThumb') : [];
		  for (let i = 0; i < btns.length; i++) {
		    const el = btns[i];
		    // pseudo-depth: spread a bit by index so cards move differently
		    const depth = 0.6 + (i % 5) * 0.18;
		    const dx = g * 14 * depth;
		    const dy = b * 12 * depth;
		    try { el.style.setProperty('--tx', dx.toFixed(2) + 'px'); } catch (_) {}
		    try { el.style.setProperty('--ty', dy.toFixed(2) + 'px'); } catch (_) {}
		  }
	};

	const scheduleBaParallax = () => {
	  if (_baRAF) return;
	  _baRAF = requestAnimationFrame(applyBaParallax);
	};

	const enableDeviceParallax = () => {
	  if (_baOriOn || !isMobile()) return;
	  _baOriOn = true;
	  window.addEventListener('deviceorientation', (ev) => {
	    // some devices provide nulls
	    _baGamma = (ev && typeof ev.gamma === 'number') ? ev.gamma : 0;
	    _baBeta  = (ev && typeof ev.beta === 'number') ? ev.beta : 0;
	    scheduleBaParallax();
	  }, { passive: true });
	};

	// iOS 13+ requires permission — request on first user gesture inside cases tab
	const requestDevicePermissionIfNeeded = async () => {
	  try {
	    const D = window.DeviceOrientationEvent;
	    if (!D) return;
	    if (typeof D.requestPermission === 'function') {
	      const res = await D.requestPermission();
	      if (res === 'granted') enableDeviceParallax();
	      return;
	    }
	    enableDeviceParallax();
	  } catch (_) {
	    // ignore
	  }
	};

	  let _baAsked = false;
	  if (thumbs) thumbs.addEventListener('click', (e) => {
	    if (!_baAsked) { _baAsked = true; requestDevicePermissionIfNeeded(); }
    const btn = (e && e.target && e.target.closest) ? e.target.closest('button.baThumb') : null;
    if (!btn) return;
    const raw = btn.getAttribute('data-pair') || '1';
    const idx = Math.max(0, (parseInt(raw, 10) || 1) - 1);
    openViewer(idx);
    haptic('light');
  });

  if (viewer) viewer.addEventListener('click', (e) => {
    const closeBtn = (e && e.target && e.target.closest) ? e.target.closest('[data-ba-close]') : null;
    if (closeBtn) { closeViewer(); haptic('light'); }
  });

  // default tab (safe)
  setAboutTab('about');
}

// ---------------- SERVICES (based on PRICE data) ----------------
  // Важно: один источник данных для витрины "Услуги" и для курьер‑формы.
  const servicesTabs = $("#priceTabs");
  const servicesContent = $("#priceContent");

  // --- Прайс и услуги (единый источник правды) ---
  // Формат: { key, title, duration?, items: [{name, from?, price?, note?}] }
  const PRICE = [
    {
      key: "clean_shoes",
      title: "Химчистка обуви",
      duration: "3–5 рабочих дней",
      items: [
        { name: "Открытая обувь", from: 1690 },
        { name: "Кроссовки / Туфли", from: 1990 },
        { name: "Полусапоги / ботинки", from: 2390 },
        { name: "Сапоги ботфорты", from: 2690 },
        { name: "Детская обувь", from: 1290 },
      ],
    },
    {
      key: "clean_bags",
      title: "Химчистка сумок",
      duration: "3–5 рабочих дней",
      items: [
        { name: "Маленькая", from: 2200 },
        { name: "Средняя", from: 2700 },
        { name: "Большая", from: 3800 },
      ],
    },
    {
      key: "clean_other",
      title: "Химчистка (прочее)",
      duration: "5–10 рабочих дней",
      items: [
        { name: "Коляска", from: 2500 },
        { name: "Автокресло", from: 2000 },
      ],
    },
    {
      key: "global_leather",
      title: "Глобальная чистка кожаных курток и кожаных изделий",
      duration: "5–10 рабочих дней",
      items: [{ name: "Глобальная чистка", from: 5500 }],
    },
    {
      key: "dis",
      title: "Дезинфекция",
      items: [{ name: "Устранение запаха", from: 500 }],
    },
    {
      key: "repair",
      title: "Ремонт",
      duration: "7–10 рабочих дней",
      items: [
        { name: "Замена подошвы", price: 3500 },
        { name: "Прошивка круговая", price: 1500 },
        { name: "Переклейка подошвы", price: 1500 },
        { name: "Прошивка и проклейка", price: 2000 },
        { name: "Изготовление подошвы", from: 4500 },
        { name: "Замена наката", price: 2000 },
        { name: "Переклейка наката", price: 1000 },
        { name: "Замена супинатора", price: 1500 },
      ],
    },
    {
      key: "sew",
      title: "Швейные работы",
      duration: "3–5 рабочих дней",
      items: [
        { name: "Замена молнии", price: 600, note: "за 10 см" },
        { name: "Латки", from: 350 },
        { name: "Прошивка", from: 500 },
        { name: "Замена бегунка", price: 500 },
        { name: "Ремонт задников", from: 1500 },
        { name: "Замена обувных резинок", from: 800 },
      ],
    },
    {
      key: "insoles",
      title: "Изготовление стелек",
      duration: "3–5 рабочих дней",
      items: [{ name: "Стельки", from: 1000 }],
    },
    {
      key: "color_any",
      title: "Покраска изделий",
      items: [{ name: "Покраска", from: 1000 }],
    },
    {
      key: "bag_full_color",
      title: "Полный уход сумок с покраской",
      duration: "7–10 рабочих дней",
      items: [
        { name: "Маленькая", from: 3500 },
        { name: "Средняя", from: 4500 },
        { name: "Большая", from: 5000 },
      ],
    },
    {
      key: "shoe_restore",
      title: "Комплекс: реставрация / покраска / восстановление (обувь)",
      duration: "7–10 рабочих дней",
      items: [
        { name: "Туфли / кроссовки", from: 4500 },
        { name: "Полусапоги / ботинки", from: 5500 },
        { name: "Сапоги", from: 6000 },
      ],
    },
    {
      key: "jacket_restore",
      title: "Восстановление / покраска курток",
      duration: "10–15 рабочих дней",
      items: [
        { name: "До 50 см", from: 6000 },
        { name: "Свыше 50 см", from: 8000 },
      ],
    },
  ];

  // --- Courier: услуги из прайса по категории ---
  const PRICE_SERVICES_BY_KEY = Object.fromEntries(
    PRICE.map(c => [
      c.key,
      (c.items || [])
        .map(it => String((it && it.name) || "").trim())
        .filter(Boolean),
    ])
  );

  // грубая привязка категорий курьера к разделам прайса (можно расширять)
  const CR_CATEGORY_TO_PRICE_KEYS = {
    "Обувь": ["clean_shoes", "shoe_restore", "repair", "sew", "insoles", "color_any", "dis"],
    "Сумка": ["clean_bags", "bag_full_color", "sew", "color_any", "dis"],
    "Верхняя одежда": ["global_leather", "jacket_restore", "color_any", "dis"],
    "Аксессуар": ["clean_other", "sew", "color_any", "dis"],
    "Другое": ["clean_other", "sew", "color_any", "dis"],
  };

  const crServicesForCategory = (cat) => {
    const keys = CR_CATEGORY_TO_PRICE_KEYS[String(cat || "").trim()] || [];
    const set = new Set();
    keys.forEach(k => (PRICE_SERVICES_BY_KEY[k] || []).forEach(s => set.add(s)));
    return Array.from(set);
  };

  // Верхний фильтр (segmented) — витринные категории.
  // Важно: "Другое" и "Ремонт" — отдельно (по просьбе).
  const SERVICES_SEG = [
    { key: "shoes", title: "Обувь", price_keys: ["clean_shoes", "shoe_restore", "repair", "sew", "insoles", "color_any", "dis"] },
    { key: "bags", title: "Сумки", price_keys: ["clean_bags", "bag_full_color", "color_any", "dis"] },
    { key: "clothes", title: "Куртки", price_keys: ["global_leather", "jacket_restore", "color_any", "dis"] },
    { key: "other", title: "Прочее", price_keys: ["clean_other", "color_any", "dis"] },
  ];
  let activeServicesKey = SERVICES_SEG[0].key;

  
  const svcEmojiFor = (sourceKey, name) => {
    const k = String(sourceKey || "").toLowerCase();
    if (k.includes("clean_shoes")) return "👟🧼";
    if (k.includes("clean_bags")) return "👜🧼";
    if (k.includes("clean_other")) return "🧽";
    if (k.includes("global_leather")) return "🧥✨";
    if (k.includes("dis")) return "🦠";
    if (k.includes("repair")) return "🛠️";
    if (k.includes("sew")) return "🧵";
    if (k.includes("insoles")) return "🦶";
    if (k.includes("color")) return "🎨";
    if (k.includes("restore")) return "✨";
    // fallback by name hints
    const n = String(name || "").toLowerCase();
    if (n.includes("молни")) return "🧵";
    if (n.includes("подошв")) return "🛠️";
    if (n.includes("покра")) return "🎨";
    return "✨";
  };

function buildServiceCardsByKeys(keys){
    const out = [];
    (keys || []).forEach(k => {
      const cat = PRICE.find(x => x.key === k);
      if (!cat) return;
      out.push({ __section: true, title: cat.title, duration: cat.duration || "", key: cat.key });
      (cat.items || []).forEach((it) => {
        const n = String((it && it.name) || "").trim();
        if (!n) return;
        out.push({
          name: n,
          from: ((it && it.from) != null ? Number(it.from) : null),
          price: ((it && it.price) != null ? Number(it.price) : null),
          note: String((it && it.note) || "").trim(),
          source_key: k,
        });
      });
    });
    return out;
  }

  const renderServicesTabs = () => {
    if (!servicesTabs) return;
    servicesTabs.classList.add("seg", "servicesSeg");
    servicesTabs.innerHTML = SERVICES_SEG.map(x => {
      const isA = x.key === activeServicesKey;
      return `<button class="segBtn${isA ? " active" : ""}" type="button" data-svcseg="${x.key}">${escapeHtml(x.title)}</button>`;
    }).join("");

    servicesTabs.querySelectorAll("button[data-svcseg]").forEach(btn => {
      btn.addEventListener("click", () => {
        activeServicesKey = String(btn.getAttribute("data-svcseg") || SERVICES_SEG[0].key);
        renderServices();
        haptic("light");
      });
    });
  };

  const renderServices = () => {
    renderServicesTabs();
    if (!servicesContent) return;

    const seg = SERVICES_SEG.find(x => x.key === activeServicesKey) || SERVICES_SEG[0];
    const cards = buildServiceCardsByKeys(seg.price_keys);

    servicesContent.innerHTML = `
      <div class="servicesHero glass">
        <div class="servicesHeroTitle">${escapeHtml(seg.title)}</div>
        <div class="servicesHeroSub">Базовый прайс и сроки выполнения по категориям.</div>
      </div>
      <div class="servicesGrid">
        ${cards.map(c => {
          if (c.__section) {
            return `
              <div class="svcSection">
                <div class="svcSectionTitle">${escapeHtml(c.title)}</div>
                ${c.duration ? `<div class="svcSectionSub">Сроки: ${escapeHtml(c.duration)}</div>` : ``}
              </div>
            `;
          }
          const priceTxt = c.price ? escapeHtml(formatMoney(c.price)) : (c.from ? `от ${escapeHtml(formatMoney(c.from))}` : "по запросу");
          const noteTxt = c.note ? `<div class="svcNote">${escapeHtml(c.note)}</div>` : ``;
          return `
            <div class="svcCard glass reveal" data-reveal="${Math.random() > 0.5 ? "right" : "up"}" role="button" tabindex="0" data-svc-pick="1" data-svc-cat="${escapeHtml(seg.title)}" data-svc-name="${escapeHtml(c.name)}">
              <div class="svcIco" aria-hidden="true">${escapeHtml(svcEmojiFor(c.source_key, c.name))}</div>
              <div class="svcBody">
                <div class="svcTitle">${escapeHtml(c.name)}</div>
                ${noteTxt}
              </div>
              <div class="svcMeta">
                <div class="svcPrice">${priceTxt}</div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    // tap-scale on cards + prefill courier wizard (optional)
    servicesContent.querySelectorAll('[data-svc-pick]').forEach(el => {
      el.addEventListener('click', (e) => {
        const name = String(el.getAttribute('data-svc-name') || '').trim();
        const catTitle = String(el.getAttribute('data-svc-cat') || '').trim();
        const mapCat = (t) => {
          if (t === 'Сумки') return 'Сумка';
          if (t === 'Куртки') return 'Верхняя одежда';
          if (t === 'Прочее') return 'Другое';
          return 'Обувь';
        };
        if (!name) return;
        // Префилл: открываем выбор сдачи и затем курьера с предвыбором
        window.__SHETKA_PREFILL = { category: mapCat(catTitle), service: name };
        try { document.getElementById('openDropoffChoice' ? 'openDropoffChoice'.click : undefined)(); } catch (_) {}
        haptic('light');
      });
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); el.click(); }
      });
    });

  };

  // ---------------- PROFILE ----------------
  const phoneValue = $("#tgPhoneValue");
  const cityValue = $("#tgCityValue");

  // Промокоды / достижения
  const promoBtn = $("#promoBtn");
  const achievementsBtn = $("#achievementsBtn");
  const promoModal = $("#promoModal");
  const achievementsModal = $("#achievementsModal");
  const promoModalContent = $("#promoModalContent");

  $$('[data-promo-close]').forEach(el => el.addEventListener('click', () => closeModalEl(promoModal)));
  $$('[data-ach-close]').forEach(el => el.addEventListener('click', () => closeModalEl(achievementsModal)));

  // Профиль
  const hydrateProfile = () => {
    const user = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user);
    const p = loadProfile() || {};

    const nameEl = $("#tgName");
    const imgEl = null;

    const shownName = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    const tgName = [(user && user.first_name), (user && user.last_name)].filter(Boolean).join(" ").trim();
    if (nameEl) nameEl.textContent = shownName || tgName || "Пользователь";

    if (phoneValue) phoneValue.textContent = (p.phone || "").trim() || "—";
    if (cityValue) cityValue.textContent = (p.city || "").trim() || "—";

    // Кнопка "Промокод" показывается только если промокоды реально есть
    // Поддерживаем 2 формата:
    // - p.promo_code (старый)
    // - p.promo_codes: string[] (если когда-то появятся несколько)
    const codes = Array.isArray(p.promo_codes)
      ? p.promo_codes.map(x => String(x || "").trim()).filter(Boolean)
      : (p.promo_code ? [String(p.promo_code).trim()] : []);

    if (promoBtn) promoBtn.hidden = false;

    if (promoBtn) {
      promoBtn.onclick = () => {
        haptic("light");
        const list = (Array.isArray(codes) ? codes : []).filter(Boolean);
        if (!list.length) {
          promoModalContent.innerHTML = `<div class="modalP">У вас нет активных промокодов и акций.</div>`;
        } else {
          promoModalContent.innerHTML = list.map(c => {
            const code = (typeof c === "string") ? String(c).trim() : String((c && c.promo_code) || (c && c.code) || "").trim();
            const pct = (c && c.promo_percent) != null ? Number(c.promo_percent) : null;
            const used = !!(c && c.promo_used);
            const line = pct ? `Скидка: ${pct}%` : `Акция`;
            return `<div class="order glass" style="padding:12px; margin-bottom:10px;">
              <div class="orderTop">
                <div><div class="orderId">${escapeHtml(code || "Промокод")}</div></div>
                <div class="status">${used ? "Использован" : "Активен"}</div>
              </div>
              <div class="orderMeta" style="margin-top:6px;">${escapeHtml(line)}</div>
            </div>`;
          }).join("");
        }
        promoModal.classList.add("show");
        promoModal.setAttribute("aria-hidden", "false");
      };
    }
    
    if (achievementsBtn) {
      achievementsBtn.onclick = () => {
        openModalEl(achievementsModal);
        haptic("light");
      };
    }


    // обновляем блок заявок по фото в профиле
    peRefreshAll(false).catch(() => {
      if (peTile) peTile.hidden = true;
    });

    // обновляем блок курьерских заявок в профиле
    crRefreshAll(false).catch(() => {
      if (crTile) crTile.hidden = true;
    });
  };

  // ---------------- REGISTRATION / PROFILE via SUPABASE ----------------
  const LS_REGISTERED = "shetka_registered_v1";
  const LS_PROFILE = "shetka_profile_v1";

  const registerModal = $("#registerModal");
  const giftModal = $("#giftModal");
  const profileEditModal = $("#profileEditModal");

  const regCitySeg = $("#regCitySeg");
  const regGenderSeg = null; // removed
  const regFirstName = $("#regFirstName");
  const regLastName = $("#regLastName");
  const regPhone = $("#regPhone");
  const regAvatarGrid = $("#regAvatarGrid");
  const regAvatarFile = $("#regAvatarFile");
  const regSubmitBtn = $("#regSubmitBtn");
  const regError = $("#regError");

  const giftText = $("#giftText");
  const giftCodeBox = $("#giftCodeBox");

  const editProfileBtn = $("#editProfileBtn");
  const profCitySeg = $("#profCitySeg");
  const profGenderSeg = null; // removed
  const profFirstName = $("#profFirstName");
  const profLastName = $("#profLastName");
  const profPhone = $("#profPhone");
  const profSaveBtn = $("#profSaveBtn");

  // Размер подарка за регистрацию (скидка %)

  function loadProfile() {
    try {
      const raw = localStorage.getItem(LS_PROFILE);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function saveProfile(p) {
    localStorage.setItem(LS_PROFILE, JSON.stringify(p));
  }

  const setFormError = (msg) => {
    if (!regError) return;
    regError.hidden = !msg;
    regError.textContent = msg || "";
  };

  const normalizePhone = (v) => String(v || "").trim();

  const makeGiftCode = () => {
    // короткий читаемый код
    const s = Math.random().toString(16).slice(2, 6).toUpperCase();
    const t = Math.random().toString(16).slice(2, 6).toUpperCase();
    return `SHETKA-${s}${t}`;
  };

  let selectedCity = "";
  let selectedAvatarKind = "preset_1";
  let uploadedAvatarDataUrl = ""; // хранится локально, в бот не шлём

  // В регистрации не показываем красные ошибки/подсветки.
  // Вместо этого делаем кнопку "Завершить регистрацию" неактивной,
  // пока не заполнено всё обязательное.
    
  function applyPhoneAutoprefix(inputEl) {
    if (!inputEl) return;
  
    inputEl.addEventListener("input", () => {
      let v = inputEl.value || "";
      if (!v) return;
  
      // если первым символом пользователь ввёл '+' — не мешаем, он вводит полностью
      if (v[0] === "+") return;
  
      // только цифры в начале проверяем по первому символу
      const first = v[0];
  
      // если первый символ не цифра — ничего не делаем
      if (first < "0" || first > "9") return;
  
      if (first === "7") {
        // 7 -> +7...
        inputEl.value = "+" + v;
        return;
      }
  
      if (first === "8") {
        // 8 -> ничего не вставляем
        return;
      }
  
      // любая другая цифра -> +7<digit>...
      inputEl.value = "+7" + v;
    });
  }
  
  function isValidRuPhone(raw) {
    const s = String(raw || "").trim();
    if (!s) return false;
  
    // оставляем только цифры и плюс
    const cleaned = s.replace(/[^\d+]/g, "");
  
    // варианты:
    // +7XXXXXXXXXX (12 символов с +)
    if (/^\+7\d{10}$/.test(cleaned)) return true;
  
    // 8XXXXXXXXXX (11 цифр)
    if (/^8\d{10}$/.test(cleaned)) return true;
  
    // 7XXXXXXXXXX (11 цифр) — бывает когда без плюса
    if (/^7\d{10}$/.test(cleaned)) return true;
  
    return false;
  }

  function isRegFormReady() {
    const city = selectedCity;
    const first = ((regFirstName && regFirstName.value) || "").trim();
    const phone = ((regPhone && regPhone.value) || "").trim();
    return !!city && !!first && isValidRuPhone(phone);
  }

  function syncRegSubmitState() {
    if (!regSubmitBtn) return;
    regSubmitBtn.disabled = !isRegFormReady();
    // ошибки скрываем всегда (по ТЗ)
    if (regError) regError.hidden = true;
  }

  // Профиль: валидация телефона как при регистрации
  function isProfileFormReady() {
    const p = loadProfile() || {};
    const cityBtn = $("#profCitySeg .segBtn.active");
    const city = (cityBtn && cityBtn.dataset ? cityBtn && cityBtn.dataset.city : undefined) || p.city || "";
    const first = ((profFirstName && profFirstName.value) || "").trim();
    const phone = ((profPhone && profPhone.value) || "").trim();
    return !!city && !!first && isValidRuPhone(phone);
  }

  function syncProfSaveState() {
    if (!profSaveBtn) return;
    profSaveBtn.disabled = !isProfileFormReady();
  }


  applyPhoneAutoprefix(regPhone);
  applyPhoneAutoprefix(profPhone);

  // реактивная валидация профиля
  [profFirstName, profLastName, profPhone].forEach(function(el){ if (el && el.addEventListener) el.addEventListener("input", syncProfSaveState); });
if (profCitySeg  && profCitySeg && profCitySeg.addEventListener) profCitySeg.addEventListener("click", syncProfSaveState);
    
  // --- reset через URL: ?reset=1
  try {
    if (new URLSearchParams(location.search).get("reset") === "1") {
      localStorage.removeItem(LS_REGISTERED);
      localStorage.removeItem(LS_PROFILE);
      // телефон/прочее оставляем как было, если хочешь — можно тоже чистить
    }
  } catch (_) {}

  // --- город сегмент (регистрация)
  if (regCitySeg) regCitySeg.addEventListener("click", (e) => {
    const btn = (e && e.target && e.target.closest) ? e.target.closest("button[data-city]") : null;
    if (!btn) return;
    selectedCity = btn.dataset.city || "";
    $$("#regCitySeg .segBtn").forEach(b => b.classList.toggle("active", b === btn));
    haptic("light");
    syncRegSubmitState();
  });

  if (regFirstName) regFirstName.addEventListener("input", syncRegSubmitState);
  if (regPhone) regPhone.addEventListener("input", syncRegSubmitState);

  // --- подарок модалка: закрытие
  $$("[data-gift-close]").forEach(el => el.addEventListener("click", () => closeModalEl(giftModal)));


  // --- показать модалку регистрации если не зарегистрирован
  const ensureRegistration = async () => {
    const p = loadProfile() || {};
    const isReg = localStorage.getItem(LS_REGISTERED) === "1";
    const hasRequired = !!(p.city && p.first_name && p.phone && isValidRuPhone(p.phone));
    if (isReg && hasRequired) return;

    // 1) Если пользователь уже регистрировался на другом устройстве — подтягиваем профиль из Supabase
    try {
      const tg_id = getTgId();
      if (tg_id) {
        const rp = await getRemoteProfile(tg_id);
        if ((rp && rp.city) && (rp && rp.first_name) && (rp && rp.phone)) {
          saveProfile({
  city: rp.city,
  first_name: rp.first_name,
  last_name: rp.last_name || "",
  phone: rp.phone,
  promo_code: rp.promo_code || null,
  promo_percent: rp.promo_percent || null,
  promo_used: !!rp.promo_used,
});
          localStorage.setItem(LS_REGISTERED, "1");
          if (typeof hydrateProfile === "function") hydrateProfile();
          return;
        }
      }
    } catch (e) {
      console.log("getRemoteProfile error:", e);
    }

    // 2) Иначе показываем модалку регистрации
    // НЕЛЬЗЯ закрыть — поэтому не вешаем close на backdrop
    openModalEl(registerModal);
    // на старте делаем кнопку неактивной
    syncRegSubmitState();
  };

  // --- заполнить настройки профиля из localStorage
  const fillProfileEdit = () => {
    const p = loadProfile() || {};
    // город
    const city = p.city || "";
    selectedCity = city; // чтобы не сбить выбор
    $$("#profCitySeg .segBtn").forEach(b => b.classList.toggle("active", (b.dataset.city || "") === city));

    if (profFirstName) profFirstName.value = p.first_name || "";
    if (profLastName) profLastName.value = p.last_name || "";
    if (profPhone) profPhone.value = p.phone || "";  };

  // --- профиль: открыть модалку настроек
  if (editProfileBtn) editProfileBtn.addEventListener("click", () => {
    fillProfileEdit();
    syncProfSaveState();
    openModalEl(profileEditModal);
    haptic("light");
  });

  $$("[data-prof-close]").forEach(el => el.addEventListener("click", () => closeModalEl(profileEditModal)));

  // --- профиль: выбор города (настройки)
  if (profCitySeg) profCitySeg.addEventListener("click", (e) => {
    const btn = (e && e.target && e.target.closest) ? e.target.closest("button[data-city]") : null;
    if (!btn) return;
    const city = btn.dataset.city || "";
    $$("#profCitySeg .segBtn").forEach(b => b.classList.toggle("active", b === btn));
    haptic("light");
  });

  // --- регистрация: submit
  const GIFT_PERCENT = 20;

  if (regSubmitBtn) regSubmitBtn.addEventListener("click", async () => {
    try {
      const city = selectedCity;
            const first = ((regFirstName && regFirstName.value) || "").trim();
      const last = ((regLastName && regLastName.value) || "").trim();
      const phone = ((regPhone && regPhone.value) || "").trim();

      // По ТЗ: без красных ошибок. Просто не даём отправить.
      if (!city || !first || !isValidRuPhone(phone)) return;
  
      // 1) берём уникальный промокод из Supabase
      const promo_code = await reservePromoCode();
  
      // 2) кладём регистрацию в очередь Supabase -> бот заберёт
      await supaEnqueue("register", {
        city,
        first_name: first,
        last_name: last || null,
        phone,
        promo_percent: GIFT_PERCENT,
        promo_code,
      });
  
      // 3) сохраняем локально и закрываем модалку
      saveProfile({
        city,
        first_name: first,
        last_name: last || "",
        phone,
        promo_code,
        promo_percent: GIFT_PERCENT,
        promo_used: false,
      });
      localStorage.setItem(LS_REGISTERED, "1");
  
      closeModalEl(registerModal);
  
      // 4) подарок
      if (giftText) {
        giftText.textContent =
          `Вам доступна единоразовая скидка ${GIFT_PERCENT}%.\n` +
          `Покажите этот код администратору в мастерской или в пункте приёма — он будет применён один раз.`;
      }
      if (giftCodeBox) giftCodeBox.textContent = promo_code;
  
      openModalEl(giftModal);
  
      if (typeof hydrateProfile === "function") hydrateProfile();
      haptic("light");
    } catch (e) {
      console.log("registration error:", e);
    }
  });

  // --- профиль: сохранить изменения
  if (profSaveBtn) profSaveBtn.addEventListener("click", async () => {
    try {
      const p = loadProfile() || {};
      const cityBtn = $("#profCitySeg .segBtn.active");
      const city = (cityBtn && cityBtn.dataset ? cityBtn && cityBtn.dataset.city : undefined) || p.city || "";

      const first = ((profFirstName && profFirstName.value) || "").trim();
      const last = ((profLastName && profLastName.value) || "").trim();
      const phone = normalizePhone((profPhone && profPhone.value) || "");

      // валидация телефона — как в регистрации
      if (!city || !first || !isValidRuPhone(phone)) {
        // без изменения визуала — просто не даём сохранить
        return;
      }

      await supaEnqueue("profile_update", {
        city,
        first_name: first,
        last_name: last || null,
        phone,
      });

      saveProfile({
        ...p,
        city,
        first_name: first,
        last_name: last,
        phone,
      });

      hydrateProfile();
      
      closeModalEl(profileEditModal);
      haptic("light");
    } catch (e) {
      console.log("profile_update error:", e);
    }
  });

  // запуск проверки регистрации
  // + дотягиваем свежий профиль из Supabase (важно для 2-го устройства)
  ensureRegistration().then(() => {
    syncRemoteProfileIfNewer({ force: false }).then((changed) => {
      if (changed) hydrateProfile();
    });
  });
    
  // ---------------- CHAT (persist) ----------------
  const chat = $("#chat");
  const chatFab = $("#chatFab");
  const chatForm = $("#chatForm");
  const chatInput = $("#chatInput");
  const chatBody = $("#chatBody");

  const supportOpenFromHome = $("#supportOpenFromHome");
  const supportOpenFromProfile = $("#supportOpenFromProfile");

  const CHAT_KEY = "shetka_chat_v1";

  const loadChat = () => {
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { 
      return [];
    }
  };

  const saveChat = (arr) => {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(arr)); } catch (e) { }
  };

  let chatMessages = loadChat();

  const renderChat = () => {
    if (!chatBody) return;
    chatBody.innerHTML = "";
    if (!chatMessages.length) {
      chatMessages = [{ who:"bot", text:"Привет! 👋 Напишите, что нужно сделать — мы поможем." }];
      saveChat(chatMessages);
    }
    chatMessages.forEach(m => {
      const b = document.createElement("div");
      b.className = `bubble ${m.who === "me" ? "me" : "bot"}`;
      b.textContent = m.text;
      chatBody.appendChild(b);
    });
    chatBody.scrollTop = chatBody.scrollHeight;
  };

  const isChatOpen = () => (chat && chat.classList).contains("show");

  const flashChatFab = () => {
    if (!chatFab) return;
    chatFab.classList.remove("flash");
    void chatFab.offsetWidth;
    chatFab.classList.add("flash");
    setTimeout(() => chatFab.classList.remove("flash"), 650);
  };

  const openChat = (fromInside = false) => {
    if (!chat) return;
    if (isChatOpen()) {
      flashChatFab();
      return;
    }
    renderChat();
    chat.classList.add("show");
    chat.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(() => (chatInput && chatInput.focus)(), 80);
    if (!fromInside) haptic("light");
  };

  const closeChat = () => {
    if (!chat) return;
    chat.classList.remove("show");
    chat.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };

  if (chatFab) chatFab.addEventListener("click", () => openChat());
  if (supportOpenFromHome) supportOpenFromHome.addEventListener("click", () => openChat());
  if (supportOpenFromProfile) supportOpenFromProfile.addEventListener("click", () => openChat());

  $$("[data-chat-close]").forEach(el => el.addEventListener("click", closeChat));

  // =====================
  // PHOTO ESTIMATES (page + modal)
  // =====================
  const peTile = $("#photoEstimatesTile");
  const peCount = $("#photoEstimatesCount");
  const pePulse = $("#photoEstimatesPulse");
  
  const peActiveCount = $("#peActiveCount");
  const peSummary = $("#peSummary");
  const peActiveTitle = $("#peActiveTitle");
  const peActiveList = $("#peActiveList");
  
  const peCardModal = $("#peCardModal");
  const peCardContent = $("#peCardContent");
  
  let PE_CACHE = { active: [] };
  
  const fmtDt = (iso) => {
    try{
      const d = new Date(iso);
      const hh = String(d.getHours()).padStart(2,"0");
      const mm = String(d.getMinutes()).padStart(2,"0");
      const dd = String(d.getDate()).padStart(2,"0");
      const mo = String(d.getMonth()+1).padStart(2,"0");
      const yy = d.getFullYear();
      return `${hh}:${mm} ${dd}.${mo}.${yy}`;
    }catch (e) {  return "—"; }
  };
  
  const statusLabel = (s) => {
    if (s === "waiting_media") return "Ждём фото/видео в боте";
    if (s === "waiting_admin") return "На оценке у мастера";
    if (s === "answered") return "Есть ответ";
    return s || "—";
  };
  
  async function peFetchList() {
    const tg_id = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? tg && tg.initDataUnsafe && tg.initDataUnsafe.user.id : undefined) || 0;
    if (!tg_id) return { active: [] };
  
    const res = await fetch(SUPABASE_ESTIMATES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ action: "list_for_user", tg_id }),
    });
  
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  
    return { active: data.active || [] };
  }
  
  const PE_READ_KEY = "shetka_pe_read_ids_v1";
  
  function peLoadReadSet(){
    try{
      const raw = localStorage.getItem(PE_READ_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    }catch (e) { 
      return new Set();
    }
  }
  function peSaveReadSet(set){
    try{
      localStorage.setItem(PE_READ_KEY, JSON.stringify(Array.from(set)));
    }catch (e) { }
  }
  
  let peReadSet = peLoadReadSet();
  
  function peIsUnread(x){
    // НОВОЕ (синхронизация между устройствами):
    // если Supabase возвращает user_read_at — считаем непрочитанным, когда admin_reply есть, а user_read_at пустой.
    // если поля ещё нет (старый бэкенд) — используем локальный fallback через localStorage.
    const hasReply = !!(x && x.admin_reply);
    const hasServerFlag = x && ("user_read_at" in x);
    if (hasReply && hasServerFlag) return !x.user_read_at;

    // Fallback (пока Supabase не обновлён):
    return !!(hasReply && !peReadSet.has(Number(x.id)));
  }
  
  async function peMarkRead(id){
    const n = Number(id);
    if (!n) return;

    // 1) пробуем записать read в Supabase (чтобы синхронизировалось между устройствами)
    try{
      const tg_id = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? tg && tg.initDataUnsafe && tg.initDataUnsafe.user.id : undefined) || 0;
      if (tg_id){
        await fetch(SUPABASE_ESTIMATES_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
            "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ action: "mark_read", tg_id, id: n }),
        }).catch(() => null);
      }
    }catch (e) { }

    // 2) локальный fallback (если бэкенд ещё не обновлён)
    if (peReadSet.has(n)) return;
    peReadSet.add(n);
    peSaveReadSet(peReadSet);
  }
  
  function peUpdateProfileTile(active) {
    const list = Array.isArray(active) ? active : [];
    const activeCount = list.length;
  
    if (!peTile) return;
  
    const subText = $("#photoEstimatesSubText");
    const unreadEl = $("#photoEstimatesUnread"); // цифра внутри зелёной точки
  
    // helper: жёстко скрыть плитку
    const hideTile = () => {
      peTile.hidden = true;
      peTile.setAttribute("hidden", "");
      peTile.style.display = "none";
  
      // сброс хвостов
      if (peCount) {
        peCount.textContent = "0";
        peCount.style.display = "inline";
      }
      if (subText) subText.textContent = "активных";
  
      if (pePulse) { pePulse.style.display = "none"; pePulse.classList.remove("hasUnread"); }
      if (unreadEl) { unreadEl.hidden = true; unreadEl.textContent = ""; }
  
      peTile.classList.remove("peGreen", "peBlue");
    };
  
    // helper: показать плитку
    const showTile = () => {
      peTile.hidden = false;
      peTile.removeAttribute("hidden");
      peTile.style.display = "";
    };
  
    // === 0 активных -> плитки НЕТ вообще ===
    if (activeCount < 1) {
      hideTile();
      return;
    }
  
    // === есть активные -> плитка есть ===
    showTile();
  
    // считаем непрочитанные (есть admin_reply и ещё не отмечено прочитанным)
    const unreadCount = list.filter(peIsUnread).length;
  
    // всегда зелёный режим (синюю кнопку убрали)
    peTile.classList.remove("peBlue");
    peTile.classList.add("peGreen");
  
    // зелёная точка всегда есть, когда есть активные
    if (pePulse) pePulse.style.display = "flex";
    // если есть непрочитанные — делаем точку синей и усиливаем пульсацию
    if (pePulse) pePulse.classList.toggle("hasUnread", unreadCount > 0);

    // ТРЕБОВАНИЕ:
    // - если есть непрочитанные ответы админов: вместо "N активных" пишем "Непрочитанные ответы администрации"
    //   и число показываем ТОЛЬКО в зелёной кнопке.
    // - если непрочитанных нет: показываем "N активных", а в зелёной кнопке цифры нет.
    if (unreadCount > 0){
      if (peCount) {
        peCount.textContent = "";
        peCount.style.display = "none";
      }
      if (subText) subText.textContent = "Непрочитанные ответы администрации";
    } else {
      if (peCount) {
        peCount.textContent = String(activeCount);
        peCount.style.display = "inline";
      }
      if (subText) subText.textContent = "активных";
    }
  
    // цифра ВНУТРИ зелёной точки = ТОЛЬКО непрочитанные
    if (unreadEl) {
      if (unreadCount > 0) {
        unreadEl.hidden = false;
        unreadEl.textContent = String(unreadCount);
      } else {
        unreadEl.hidden = true;
        unreadEl.textContent = "";
      }
    }
}
  
  function peOpenCardModal(html) {
    if (!peCardModal || !peCardContent) return;
    peCardContent.innerHTML = html;
    peCardModal.classList.add("show");
    peCardModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  
  function peCloseCardModal() {
    if (!peCardModal) return;
    peCardModal.classList.remove("show");
    peCardModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  
  $$("[data-pec-close]").forEach(el => el.addEventListener("click", peCloseCardModal));
  
  async function peDelete(id) {
    const estId = Number(id) || 0;
    if (!estId) return;

    // 0) локально убираем «прочитано» (чтобы не копились id)
    try {
      if (peReadSet && peReadSet.has(estId)) {
        peReadSet.delete(estId);
        peSaveReadSet(peReadSet);
      }
    } catch (_) {}

    // 1) удаляем в Supabase (мини‑апп должен исчезнуть сразу)
    try {
      const res = await fetch(SUPABASE_ESTIMATES_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: "delete", id: estId }),
      });
      const raw = await res.text();
      let data = null;
      try { data = JSON.parse(raw); } catch (_) {}
      // даже если тут не ок — всё равно шлём в бота для гарантии
      if (!res.ok || (data && data.ok === false)) {
        console.log("peDelete supabase not ok:", res.status, raw);
      }
    } catch (e) {
      console.log("peDelete supabase error:", e);
    }

    // 2) дублируем в бота — чтобы гарантированно удалилось «отовсюду» (Supabase + внутренняя БД бота)
    sendToBot("estimate_delete", { estimate_id: estId });
  }
  
  async function peRateAndDelete(id, rating, comment) {
    const estId = Number(id) || 0;
    const r = Number(rating) || 0;
    const c = String(comment || "").trim();
    if (!estId || !(r >= 1 && r <= 5)) return;

    // 1) отправляем оценку в Supabase
    try {
      const res = await fetch(SUPABASE_ESTIMATES_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ action: "rate", id: estId, rating: r, rating_comment: c }),
      });
      const raw = await res.text();
      let data = null;
      try { data = JSON.parse(raw); } catch (_) {}
      if (!res.ok || (data && data.ok === false)) {
        console.log("peRate supabase not ok:", res.status, raw);
      }
    } catch (e) {
      console.log("peRate supabase error:", e);
    }

    // 2) сразу шлём админам в бота (реал‑тайм) + бот удалит заявку из Supabase и архива в своей БД
    //    Прикладываем максимум контекста по заявке и ответу мастера.
    const cur = (PE_CACHE && Array.isArray(PE_CACHE.active))
      ? (PE_CACHE.active.find(x => Number(x.id) === estId) || null)
      : null;

    sendToBot("estimate_rate", {
      estimate_id: estId,
      rating: r,
      comment: c,
      // контекст для админов
      payload_json: (cur && cur.payload_json) || null,
      admin_reply: (cur && cur.admin_reply) || null,
      status: (cur && cur.status) || null,
      created_at: (cur && cur.created_at) || null,
    });

    // 3) на всякий случай удаляем и здесь (чтобы мгновенно пропало из профиля)
    await peDelete(estId);
  }
  
  function peBuildCard(x) {
    const payload = x.payload_json || {};
    const title = `Оценка по фото №${x.id}`;
    const dt = fmtDt(x.created_at);
    const st = x.status || "";
    const reply = x.admin_reply ? String(x.admin_reply) : "";
  
    const itemVal = (payload.item || "").trim();
    const itemRow = itemVal ? `<div class="modalRow"><span>Вещь</span><b>${itemVal}</b></div>` : ``;

    const html = `
      <div class="modalH">${title}</div>
      <p class="modalP">${dt} • ${statusLabel(st)}</p>

      <div class="modalGrid peInfo">
        <div class="modalRow peInfoRow"><span>Категория</span><b>${payload.category || "—"}</b></div>
        ${itemRow}
        <div class="modalRow peInfoRow"><span>Описание</span><b>${payload.problem || "—"}</b></div>
      </div>

      ${reply ? `
        <div class="peReplyBox">
          <div class="peReplyTitle">Ответ мастера</div>
          <div class="peReplyText" style="white-space:pre-wrap">${reply}</div>
        </div>
      ` : ""}

      <div class="peActions">
        ${reply ? `<button class="smallBtn primary" type="button" id="peRateBtn">Оценить ответ</button>` : ``}
        ${reply ? `<button class="smallBtn" type="button" id="peReplyBtn">Ответить</button>` : ``}
        <button class="smallBtn danger" type="button" id="peDeleteBtn">Удалить</button>
      </div>
    `;
  
    return { html, title, id: x.id, hasReply: !!reply, status: st };
  }
  
  function peRenderPage(active) {
    // summary
    if (peSummary) peSummary.style.display = (active.length) ? "block" : "none";
    if (peActiveCount) peActiveCount.textContent = String(active.length);
  
    // active list
    if (peActiveTitle) peActiveTitle.style.display = active.length ? "block" : "none";
    if (peActiveList) peActiveList.innerHTML = "";
    active.forEach(x => {
      const payload = x.payload_json || {};
      const title = `Оценка по фото №${x.id}`;
      const dt = fmtDt(x.created_at);
      const st = x.status || "";
  
      const el = document.createElement("div");
      el.className = "order glass peItem";
      const itemVal = (payload.item || "").trim();
      const itemLine = itemVal ? `Вещь: ${itemVal}<br/>` : ``;

      el.innerHTML = `
        <div class="peTop">
          <div>
            <div class="peTitle">${title}</div>
            <div class="peMeta">${dt}</div>
          </div>
          <div class="peStatus"><span class="peDot ${st}"></span>${statusLabel(st)}</div>
        </div>
        <div class="peBody">
          Категория: ${payload.category || "—"}<br/>
          ${itemLine}
          Описание: ${payload.problem || "—"}
          ${""}
        </div>
      `;
      el.addEventListener("click", () => {
        const card = peBuildCard(x);
      
        // если есть ответ — считаем прочитанным в момент открытия карточки
        if (x.admin_reply) {
          peMarkRead(x.id);
          // если бэкенд уже отдаёт server-flag — обновим локально, чтобы UI сразу перестроился
          if (x && ("user_read_at" in x)) {
            x.user_read_at = x.user_read_at || new Date().toISOString();
          }
        }
      
        const bindCardButtons = () => {
          // Ответить
          var __el = $("#peReplyBtn"); if (__el && __el.addEventListener) __el.addEventListener("click", () => {
            peCloseCardModal();
            openChat(true);
            const inp = $("#chatInput");
            if (inp) inp.value = `По заявке ${card.title}: `;
          });
      
          // Удалить
          var __el = $("#peDeleteBtn"); if (__el && __el.addEventListener) __el.addEventListener("click", async () => {
            if (!(await confirmDialog("Удалить заявку?"))) return;
            await peDelete(card.id);
            await peRefreshAll(true);
            peCloseCardModal();
          });
      
          // Оценить ответ
          var __el = $("#peRateBtn"); if (__el && __el.addEventListener) __el.addEventListener("click", () => {
            const formHtml = `
              <div class="modalH">Оценить ответ</div>
              <p class="modalP">Выберите оценку и добавьте комментарий (по желанию).</p>
      
              <div class="rateStars" id="rateStars">
                ${[1,2,3,4,5].map(n => `<button type="button" class="rateStar" data-star="${n}">★</button>`).join("")}
              </div>
      
              <label class="field" style="margin-top:12px;">
                <div class="fieldLabel">Комментарий (необязательно)</div>
                <input id="rateComment" class="fieldInput" placeholder="Например: всё понятно" />
              </label>
      
              <div style="height:12px"></div>
              <button class="cta primary" type="button" id="rateSendBtn" disabled>Отправить оценку</button>
              <div style="height:10px"></div>
              <button class="smallBtn" type="button" id="rateBackBtn">Назад</button>
            `;
      
            peOpenCardModal(formHtml);
      
            let picked = 0;
      
            const syncStars = () => {
              $$(".rateStar").forEach(btn => {
                const n = Number(btn.dataset.star || 0);
                btn.classList.toggle("on", n <= picked);
              });
              var __el = $("#rateSendBtn"); if (__el && __el.toggleAttribute) __el.toggleAttribute("disabled", !(picked >= 1 && picked <= 5));
            };
      
            $$(".rateStar").forEach(btn => btn.addEventListener("click", () => {
              picked = Number(btn.dataset.star || 0);
              syncStars();
              haptic("light");
            }));
      
            syncStars();
      
            var __el = $("#rateBackBtn"); if (__el && __el.addEventListener) __el.addEventListener("click", () => {
              peOpenCardModal(card.html);
              bindCardButtons();
            });
      
            var __el = $("#rateSendBtn"); if (__el && __el.addEventListener) __el.addEventListener("click", async () => {
              if (!(picked >= 1 && picked <= 5)) return;
              if (!(await confirmDialog("После оценки заявка будет удалена из профиля. Продолжить?"))) return;
              var __c = $("#rateComment"); const comment = (((__c && __c.value) ? __c.value : "") || "").trim();
              await peRateAndDelete(card.id, picked, comment);
              await peRefreshAll(true);
              peCloseCardModal();
              try { if (tg && tg.showAlert) tg.showAlert("Спасибо! Оценка отправлена."); } catch(_){ }
            });
          });
        };
      
        peOpenCardModal(card.html);
        bindCardButtons();
      
        // обновляем UI сразу
        peUpdateProfileTile(PE_CACHE.active || []);
        // и перерисуем список, чтобы поменялась пометка (прочитан/непрочитан)
        peRenderPage(PE_CACHE.active || []);
      });
  
      (peActiveList && peActiveList.appendChild)(el);
    });
  
  }
  
  async function peRefreshAll(refreshPageIfOpened=false) {
    const { active } = await peFetchList();
    PE_CACHE = { active };

    peUpdateProfileTile(active);

    // если юзер сейчас на странице photo_estimates — обновим список
    if (refreshPageIfOpened && currentPage === "photo_estimates") {
      peRenderPage(active);
    }
  }
  
  // переход из профиля на страницу
  if (peTile) peTile.addEventListener("click", async () => {
    try{
      await peRefreshAll(true);
    }catch (e) { }
    showPage("photo_estimates");
    // рендер страницы
    peRenderPage(PE_CACHE.active);
    haptic("light");
  });

  // =====================
  // COURIER REQUESTS (profile tile + page)
  // =====================
  const crTile = $("#courierRequestsTile");
  const crCount = $("#courierRequestsCount");
  const crPulse = $("#courierRequestsPulse");
  const crUnread = $("#courierRequestsUnread");
  const crListEl = $("#crList");

  let CR_CACHE = { list: [] };

  const crStatusLabel = (s) => {
    if (s === "waiting_media") return "Ожидаем фото";
    if (s === "waiting_confirm") return "Ожидает подтверждения";
    if (s === "confirmed") return "Подтверждено";
    if (s === "enroute" || s === "in_route") return "Курьер в пути";
    if (s === "picked" || s === "picked_up") return "Забрано";
    if (s === "done") return "Завершено";
    if (s === "cancelled") return "Отменено";
    return s || "—";
  };

  const crStatusDot = (s) => {
    // используем существующие классы цветов
    if (s === "done") return "green";
    if (s === "cancelled") return "red";
    if (s === "enroute" || s === "in_route" || s === "picked" || s === "picked_up") return "orange";
    if (s === "confirmed") return "blue";
    return "gray";
  };

  async function crFetchList() {
    const tg_id = getTgId();
    if (!tg_id) return [];

    // читаем напрямую из Supabase REST (минимально, как fallback)
    const url = `${SUPABASE_REST_URL}/courier_requests?tg_id=eq.${encodeURIComponent(tg_id)}&select=id,date,slot,address_json,items_json,status,cancel_reason,created_at,updated_at&order=created_at.desc`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "accept": "application/json",
      },
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data)) {
      const msg = (data && data.message) ? data.message : `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return data;
  }

  function crUpdateProfileTile(list) {
  const arr = Array.isArray(list) ? list : [];
  const activeCount = arr.length;

  if (!crTile) return;

  const needsMedia = arr.filter(x => String((x && x.status) || "") === "waiting_media").length;

  const hideTile = () => {
    crTile.hidden = true;
    crTile.setAttribute("hidden", "");
    crTile.style.display = "none";
    if (crCount) crCount.textContent = "0";
    if (crPulse) crPulse.style.display = "none";
    if (crUnread) crUnread.hidden = true;
    if (crUnread) crUnread.textContent = "0";
  };

  const showTile = () => {
    crTile.hidden = false;
    crTile.removeAttribute("hidden");
    crTile.style.display = "";
  };

  if (activeCount < 1) {
    hideTile();
    return;
  }

  showTile();
  if (crCount) crCount.textContent = String(activeCount);

  // маленький индикатор если нужно добавить медиа
  if (crPulse) {
    crPulse.style.display = needsMedia > 0 ? "" : "none";
  }
  if (crUnread) {
    crUnread.textContent = String(needsMedia);
    crUnread.hidden = !(needsMedia > 0);
  }
}


  function crCard(x) {
    const id = Number((x && x.id) || 0);
    const date = String((x && x.date) || "");
    const slot = String((x && x.slot) || "");
    const addr = (x && x.address_json) || {};
    const items = Array.isArray((x && x.items_json)) ? x.items_json : [];
    const st = String((x && x.status) || "");

    const addrLine = [addr.city, addr.street, addr.house, addr.apartment].filter(Boolean).join(", ") || "—";
    const dtLine = [date, slot].filter(Boolean).join(" ") || "—";

    const wrap = document.createElement("div");
    wrap.className = "order glass";
    wrap.innerHTML = `
      <div class="orderTop">
        <div>
          <div class="orderId">Заявка №${escapeHtml(String(id))}</div>
          <div class="orderMeta">${escapeHtml(dtLine)}</div>
        </div>
        <div class="status"><span class="sDot ${escapeHtml(crStatusDot(st))}"></span>${escapeHtml(crStatusLabel(st))}</div>
      </div>
      <div class="orderBody">
        <div class="orderLine"><span>Адрес:</span> ${escapeHtml(addrLine)}</div>
        <div class="orderLine"><span>Вещей:</span> ${escapeHtml(String(items.length || 0))}</div>
      </div>
    `;

    wrap.addEventListener("click", () => crOpenDetailsModal(x));
    return wrap;
  }

  function crOpenDetailsModal(x) {
    const id = Number((x && x.id) || 0);
    if (!id) return;
    const date = String((x && x.date) || "");
    const slot = String((x && x.slot) || "");
    const addr = (x && x.address_json) || {};
    const items = Array.isArray((x && x.items_json)) ? x.items_json : [];
    const st = String((x && x.status) || "");
    const reason = String((x && x.cancel_reason) || "").trim();

    const addrLine = [addr.city, addr.street, addr.house, addr.apartment].filter(Boolean).join(", ") || "—";
    const dtLine = [date, slot].filter(Boolean).join(" ") || "—";

    const canEdit = !(st === "enroute" || st === "in_route" || st === "picked" || st === "picked_up" || st === "done" || st === "cancelled");
    const canAddMedia = (st === "waiting_media");
    const canCancel = canEdit;
    const canDelete = canEdit;

    const itemsHtml = items.map((it, idx) => {
      const cat = escapeHtml(String((it && it.category) || "—"));
      const svc = escapeHtml(String((it && it.service) || "—"));
      const prob = escapeHtml(String((it && it.problem) || "—"));
      return `<div class="orderLine"><span>${idx + 1}.</span> ${cat} • ${svc}<br/><span style="color:var(--muted)">${prob}</span></div>`;
    }).join("") || `<div class="orderLine"><span>Вещи:</span> —</div>`;

    const html = `
      <div class="modalH">Заявка курьера №${escapeHtml(String(id))}</div>
      <p class="modalP">
        <b>${escapeHtml(crStatusLabel(st))}</b><br/>
        ${escapeHtml(dtLine)}<br/>
        ${escapeHtml(addrLine)}
        ${reason ? `<br/><span style="color:var(--muted)">Причина отмены: ${escapeHtml(reason)}</span>` : ""}
      </p>
      <div style="height:8px"></div>
      ${itemsHtml}
      <div style="height:12px"></div>
      <div class="modalGrid">
        <button class="smallBtn primary" type="button" id="crWriteBtn">Написать</button>
        ${canAddMedia ? `<button class="smallBtn" type="button" id="crAddMediaBtn">Добавить медиа</button>` : ""}
        ${canEdit ? `<button class="smallBtn" type="button" id="crEditBtn">Редактировать вещи</button>` : ""}
        ${canCancel ? `<button class="smallBtn" type="button" id="crCancelBtn">Отменить</button>` : ""}
        ${canDelete ? `<button class="smallBtn danger" type="button" id="crDeleteBtn">Удалить</button>` : ""}
      </div>
    `;

    openOrderModal({ id: `courier_${id}`, item: "", services: [], status_raw: crStatusLabel(st), price: "—", created_ts: Date.now() }, true);
    // подменяем контент существующей модалки (не трогаем визуал)
    const mc = $("#modalContent");
    if (mc) mc.innerHTML = html;

    var __el = $("#crWriteBtn"); if (__el && __el.addEventListener) __el.addEventListener("click", () => {
      closeModal();
      openChat();
    });

    var __el = $("#crAddMediaBtn"); if (__el && __el.addEventListener) __el.addEventListener("click", () => {
      // Через очередь в бота: бот переведёт клиента в режим ожидания медиа по заявке
      showLoading();
      crUserAddMedia(id)
        .then(() => { try { if (tg && tg.close) tg.close(); } catch (_) {} })
        .catch((e) => { try { if (tg && tg.showAlert) tg.showAlert("Ошибка: " + String((e && e.message) || e)); } catch(_){ } })
        .finally(() => hideLoading());
    });

    var __el = $("#crEditBtn"); if (__el && __el.addEventListener) __el.addEventListener("click", () => {
      closeModal();
      crStartWizard({ mode: "edit", request: x });
      showPage("courier");
      haptic("light");
    });

    var __el = $("#crCancelBtn"); if (__el && __el.addEventListener) __el.addEventListener("click", async () => {
      if (!(await confirmDialog("Отменить курьерскую заявку?"))) return;
      try {
        await crUserCancel(id);
        await crRefreshAll(true);
        closeModal();
        try { if (tg && tg.showAlert) tg.showAlert("Заявка отменена"); } catch(_){ }
      } catch (e) {
        try { if (tg && tg.showAlert) tg.showAlert("Ошибка: " + String((e && e.message) || e)); } catch(_){ }
      }
    });

    var __el = $("#crDeleteBtn"); if (__el && __el.addEventListener) __el.addEventListener("click", async () => {
      if (!(await confirmDialog("Удалить курьерскую заявку полностью?"))) return;
      try {
        await crUserDelete(id);
        await crRefreshAll(true);
        closeModal();
        try { if (tg && tg.showAlert) tg.showAlert("Заявка удалена"); } catch (_) {}
      } catch (e) {
        try { if (tg && tg.showAlert) tg.showAlert("Ошибка: " + String((e && e.message) || e)); } catch (_) {}
      }
    });
  }

  async function crUserDelete(id) {
    const reqId = Number(id) || 0;
    if (!reqId) return;
    const tg_id = getTgId();
    if (!tg_id) throw new Error("Нет tg_id");
    // Полное удаление через очередь в бота: бот удалит из Supabase courier_requests и courier_media
    const res = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      mode: "cors",
      headers: {
        "content-type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        kind: "courier_delete",
        tg_id,
        payload_json: { request_id: reqId },
      }),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    if (!res.ok || !data || !data.ok) {
      const err = (data && data.error) ? data.error : `HTTP ${res.status}: ${text.slice(0, 140)}`;
      throw new Error(err);
    }
  }

  async function crUserCancel(id) {
    const reqId = Number(id) || 0;
    if (!reqId) return;
    const tg_id = getTgId();
    if (!tg_id) throw new Error("Нет tg_id");
    const res = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      mode: "cors",
      headers: {
        "content-type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        kind: "courier_cancel_user",
        tg_id,
        payload_json: { request_id: reqId },
      }),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    if (!res.ok || !data || !data.ok) {
      const err = (data && data.error) ? data.error : `HTTP ${res.status}: ${text.slice(0, 140)}`;
      throw new Error(err);
    }
  }

  async function crUserUpdateItems(id, items) {
    const reqId = Number(id) || 0;
    if (!reqId) return;
    const tg_id = getTgId();
    if (!tg_id) throw new Error("Нет tg_id");
    const res = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      mode: "cors",
      headers: {
        "content-type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        kind: "courier_update_items",
        tg_id,
        payload_json: {
          request_id: reqId,
          items_json: Array.isArray(items) ? items.map(it => {
            const cat = String((it && it.category) || "").trim();
            const other = String((it && it.category_other) || "").trim();
            return {
              category: (cat === "Другое" && other) ? other : cat,
              service: String((it && it.service) || ""),
              problem: String((it && it.problem) || ""),
            };
          }) : [],
        },
      }),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    if (!res.ok || !data || !data.ok) {
      const err = (data && data.error) ? data.error : `HTTP ${res.status}: ${text.slice(0, 140)}`;
      throw new Error(err);
    }
  }

  async function crUserAddMedia(id) {
    const reqId = Number(id) || 0;
    if (!reqId) return;
    const tg_id = getTgId();
    if (!tg_id) throw new Error("Нет tg_id");
    const res = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      mode: "cors",
      headers: {
        "content-type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        kind: "courier_add_media",
        tg_id,
        payload_json: { request_id: reqId },
      }),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    if (!res.ok || !data || !data.ok) {
      const err = (data && data.error) ? data.error : `HTTP ${res.status}: ${text.slice(0, 140)}`;
      throw new Error(err);
    }
  }

  function crRenderPage(list) {
    if (!crListEl) return;
    const arr = Array.isArray(list) ? list : [];
    crListEl.innerHTML = "";
    arr.forEach(x => crListEl.appendChild(crCard(x)));
  }

  async function crRefreshAll(refreshPageIfOpened = false) {
    const list = await crFetchList();
    CR_CACHE = { list };
    crUpdateProfileTile(list);
    if (refreshPageIfOpened && currentPage === "courier_requests") {
      crRenderPage(list);
    }
  }

  if (crTile) crTile.addEventListener("click", async () => {
    try { await crRefreshAll(true); } catch (_) {}
    showPage("courier_requests");
    crRenderPage(CR_CACHE.list || []);
    haptic("light");
  });
  
  const addBubble = (text, who = "me") => {
    chatMessages.push({ who, text });
    saveChat(chatMessages);
    renderChat();
  };

  if (chatForm) chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = ((chatInput && chatInput.value) || "").trim();
    if (!text) return;

    addBubble(text, "me");
    chatInput.value = "";

    sendToBot("support_message", { text });
    haptic("light");

    setTimeout(() => {
      addBubble("✅ Сообщение принято. Администратор скоро ответит.", "bot");
    }, 450);
  });

  const openSheet = (el) => {
    if (!el) return;
    el.classList.add("show");
    el.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  };
  
  const closeSheet = (el) => {
    if (!el) return;
    el.classList.remove("show");
    el.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };

  // ---------------- SHEETS: courier / estimate ----------------
  const courierSheet = $("#courierSheet");

  const openCourierSheetBtn = $("#openCourierSheet");
  const estimateBackBtn = $("#estimateBackBtn");

  const openEstimateSheetBtn = $("#openEstimateSheet");
  
  if (openEstimateSheetBtn) openEstimateSheetBtn.addEventListener("click", () => {
    resetEstimate();
    showPage("estimate");
    haptic("light");
  });

  // Новый модуль: курьерская доставка (многошаговая форма)
  if (openCourierSheetBtn) openCourierSheetBtn.addEventListener("click", () => {
    try { closeModalEl(dropoffModal); } catch (_) {}
    crStartWizard({ mode: "create" });
    // optional prefill from Services screen
    try {
      const p = window.__SHETKA_PREFILL;
      if (p && CR_WIZ && Array.isArray(CR_WIZ.items) && CR_WIZ.items[0]) {
        CR_WIZ.items[0].category = String(p.category || CR_WIZ.items[0].category || "Обувь");
        CR_WIZ.items[0].service = String(p.service || "");
      }
      window.__SHETKA_PREFILL = null;
    } catch (_) {}
    showPage("courier");
    haptic("light");
  });

  const estimateSendModal = $("#estimateSendModal");
  const estimateSubmitBtn = $("#estimateSubmitBtn");

  const openAnyModal = (el) => {
    if (!el) return;
    el.classList.add("show");
    el.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  };
  const closeAnyModal = (el) => {
    if (!el) return;
    el.classList.remove("show");
    el.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };

  $$("[data-est-send-close]").forEach(el =>
    el.addEventListener("click", () => closeAnyModal(estimateSendModal))
  );
  
  const courierAddress = $("#courierAddress");
  const courierComment = $("#courierComment");
  const courierSendBtn = $("#courierSendBtn");

  // --- ESTIMATE 2-STEP ---

  const estimateCategory = $("#estimateCategory");
  const estimateOtherWrap = $("#estimateOtherWrap");
  const estimateOtherItem = $("#estimateOtherItem");
  const estimateProblem = $("#estimateProblem");
  
  const estimateNextBtn = $("#estimateNextBtn");
  
  // leave confirm
  const leaveEstimateModal = $("#leaveEstimateModal");
  const leaveStayBtn = $("#leaveStayBtn");
  const leaveExitBtn = $("#leaveExitBtn");
  
  // loading
  const globalLoading = $("#globalLoading");
  const dots = $("#dots");
  let dotsTimer = null;
  
  const showLoading = () => {
    (globalLoading && globalLoading.classList).add("show");
    (globalLoading && globalLoading.setAttribute)("aria-hidden", "false");
    let n = 0;
    dotsTimer = setInterval(() => {
      n = (n + 1) % 4;
      if (dots) dots.textContent = ".".repeat(n || 1);
    }, 320);
  };
  const hideLoading = () => {
    (globalLoading && globalLoading.classList).remove("show");
    (globalLoading && globalLoading.setAttribute)("aria-hidden", "true");
    if (dotsTimer) clearInterval(dotsTimer);
    dotsTimer = null;
  };

  // =====================
  // COURIER WIZARD (new screens)
  // =====================
  const courierWizardEl = $("#courierWizard");
  const courierStepSub = $("#courierStepSub");
  const courierBackBtn = $("#courierBackBtn");

  const COURIER_SLOTS = [
    "10:00-12:00",
    "12:00-14:00",
    "14:00-16:00",
    "16:00-18:00",
    "18:00-20:00",
  ];

  let CR_WIZ = null;

  function crStartWizard({ mode = "create", request = null } = {}) {
    const p = loadProfile() || {};
    const baseCity = String(p.city || "").trim();

    const items = (() => {
      const src = request && Array.isArray(request.items_json) ? request.items_json : null;
      if (src && src.length) {
        return src.map(it => ({
          category: String((it && it.category) || "Обувь"),
          service: String((it && it.service) || ""),
          problem: String((it && it.problem) || ""),
        }));
      }
      return [{ category: "Обувь", service: "", problem: "" }];
    })();

    const addr = (request && request.address_json) || {};
    CR_WIZ = {
      mode,
      request_id: request ? Number(request.id || 0) : 0,
      status: String((request && request.status) || "").trim(),
      step: "items",
      items,
      address: {
        city: String(addr.city || baseCity || "").trim(),
        street: String(addr.street || "").trim(),
        house: String(addr.house || "").trim(),
        apartment: String(addr.apartment || "").trim(),
        entrance: String(addr.entrance || "").trim(),
        floor: String(addr.floor || "").trim(),
        intercom: String(addr.intercom || "").trim(),
        comment: String(addr.comment || "").trim(),
      },
      date: String((request && request.date) || "").trim(),
      slot: String((request && request.slot) || "").trim(),
      need_media: (mode === "edit") ? (String((request && request.status) || "") === "waiting_media") : false,
      slotBlocks: {},
    };

    crRenderWizard();
  }

  function crSetStepSub(text) {
    if (courierStepSub) courierStepSub.textContent = text || "";
  }

  function crIsBeforeVisitMinus2h(dateStr, slotStr) {
    // правило: "+ Добавить вещь" доступно до (время визита − 2 часа)
    try {
      const slotStart = String(slotStr || "").split("-")[0] || "";
      const [hh, mm] = slotStart.split(":").map(x => Number(x));
      const d = new Date(`${dateStr}T${String(hh).padStart(2,"0")}:${String(mm||0).padStart(2,"0")}:00`);
      const cutoff = new Date(d.getTime() - 2 * 60 * 60 * 1000);
      return Date.now() < cutoff.getTime();
    } catch (e) { 
      return false;
    }
  }

  function crCanMutateItems() {
    if (!CR_WIZ) return false;
    // удаление: пока статус < "В пути" (для create статус ещё не установлен)
    if (CR_WIZ.mode === "create") return true;
    const st = String(((CR_WIZ.request && CR_WIZ.request.status) || CR_WIZ._status) || "");
    return !(st === "in_route" || st === "picked_up" || st === "done" || st === "cancelled");
  }

  async function crFetchSlotBlocks(dateStr, city) {
    if (!dateStr || !city) return [];
    const url = `${SUPABASE_REST_URL}/courier_slot_blocks?date=eq.${encodeURIComponent(dateStr)}&city=eq.${encodeURIComponent(city)}&active=eq.true&select=slot,reason`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "accept": "application/json",
      },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data)) return [];
    return data
      .map(x => ({
        slot: String((x && x.slot) || "").trim(),
        reason: String((x && x.reason) || "").trim(),
      }))
      .filter(x => x.slot);
  }

  function crValidateItems(items) {
    const arr = Array.isArray(items) ? items : [];
    if (arr.length < 1) return false;
    for (const it of arr) {
      const cat = String((it && it.category) || "").trim();
      const catOther = String((it && it.category_other) || "").trim();
      const prob = String((it && it.problem) || "").trim();
      // обязательные: категория, описание; если категория=Другое — доп. поле
      if (!cat || !prob) return false;
      if (cat === "Другое" && !catOther) return false;
    }
    return true;
  }

  function crValidateAddress(a) {
    const city = String((a && a.city) || '').trim();
    const street = String((a && a.street) || '').trim();
    const house = String((a && a.house) || '').trim();
    const apartment = String((a && a.apartment) || '').trim();
    return !!(city && street && house && apartment);
  }

  function crValidateTime(dateStr, timeStr) {
    const d = String(dateStr || "").trim();
    const t = String(timeStr || "").trim();
    if (!d || !t) return false;
    // нельзя выбрать прошедшее время; минимум — через час от текущего момента
    try {
      const chosen = new Date(`${d}T${t}:00`);
      const min = new Date(Date.now() + 60 * 60 * 1000);
      return chosen.getTime() >= min.getTime();
    } catch (e) { 
      return false;
    }
  }

  function crRenderWizard() {
    if (!CR_WIZ || !courierWizardEl) return;

    const CITY_OPTIONS = ["Севастополь", "Симферополь"];
    const WORK_HOURS = {
      "Севастополь": { start: "09:00", end: "21:00" },
      "Симферополь": { start: "09:00", end: "21:00" },
      default: { start: "09:00", end: "21:00" },
    };

    const step = CR_WIZ.step;
    const formatDt = (dateStr, timeStr) => {
      try {
        const dt = new Date(`${dateStr}T${timeStr}:00`);
        if (!isFinite(dt.getTime())) return "—";
        let d = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(dt);
        // убираем "г." если Intl добавил
        d = d.replace(/\s?г\.?\s?/g, "").trim();
        const t = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(dt);
        return `в ${t}, ${d}`;
      } catch (e) { 
        return "—";
      }
    };

    const roundUpTo5 = (d) => {
      const ms = d.getTime();
      const step = 10 * 60 * 1000;
      return new Date(Math.ceil(ms / step) * step);
    };

    const _unused_hmToMin = (hm) => {
      const [h, m] = String(hm || "").split(":").map(n => Number(n));
      if (!isFinite(h) || !isFinite(m)) return null
    };

    const parseHM = (hm) => {
      try {
        const [h, m] = String(hm || "").split(":");
        const hh = Number(h);
        const mm = Number(m);
        if (!isFinite(hh) || !isFinite(mm)) return null;
        return hh * 60 + mm;
      } catch (e) { 
        return null;
      }
    };

    const inRange = (t, a, b) => {
      const tt = parseHM(t);
      const aa = parseHM(a);
      const bb = parseHM(b);
      if (tt === null || aa === null || bb === null) return true;
      return tt >= aa && tt <= bb;
    };

    const getSavedKey = () => `cr_saved_addrs_${getTgId() || 0}`;
    const loadSavedAddrs = () => {
      try {
        // 1) пробуем взять из профиля (синхронизируется между устройствами)
        const p = loadProfile() || {};
        if (Array.isArray(p.saved_addresses) && p.saved_addresses.length) {
          return p.saved_addresses.slice(0, 5);
        }

        // 2) fallback — локальный storage (для оффлайна)
        const raw = localStorage.getItem(getSavedKey());
        const arr = JSON.parse(raw || "[]");
        return Array.isArray(arr) ? arr.slice(0, 5) : [];
      } catch (e) { 
        return [];
      }
    };

    const persistSavedAddrs = async (list) => {
      const safe = Array.isArray(list) ? list.slice(0, 5) : [];
      // локально
      try { localStorage.setItem(getSavedKey(), JSON.stringify(safe)); } catch (_) {}
      // в профиль (и дальнейшая синхронизация через бот -> Supabase profiles)
      const cur = loadProfile() || {};
      saveProfile({ ...cur, saved_addresses: safe });
      try {
        // профиль обновляется через очередь Supabase — чтобы видеть на другом устройстве
        await supaEnqueue("profile_update", { saved_addresses: safe });
      } catch (_) {}
    };

    const saveAddrIfNeeded = () => {
      if (!(CR_WIZ && CR_WIZ.remember_address)) return;
      const a = CR_WIZ.address || {};
      const entry = {
        city: String(a.city || "").trim(),
        street: String(a.street || "").trim(),
        house: String(a.house || "").trim(),
        apartment: String(a.apartment || "").trim(),
        entrance: String(a.entrance || "").trim(),
        floor: String(a.floor || "").trim(),
        intercom: String(a.intercom || "").trim(),
        comment: String(a.comment || "").trim(),
      };
      if (!crValidateAddress(entry)) return;
      const list = loadSavedAddrs();
      const fingerprint = `${entry.city}|${entry.street}|${entry.house}|${entry.apartment}`.toLowerCase();
      const exists = list.some(x => `${x.city}|${x.street}|${x.house}|${x.apartment}`.toLowerCase() == fingerprint);
      if (!exists) {
        list.unshift(entry);
        persistSavedAddrs(list);
      }
    };

    const isBlockedTime = (timeStr) => {
      const blocks = Array.isArray(CR_WIZ.slotBlocks) ? CR_WIZ.slotBlocks : [];
      for (const b of blocks) {
        const slot = String((b && b.slot) || "").trim();
        const reason = String((b && b.reason) || "").trim();
        if (!slot) continue;
        if (slot === "*" || slot.toUpperCase() === "ALL") return reason || "Недоступно";
        if (slot.includes("-")) {
          const [a, c] = slot.split("-", 2);
          if (inRange(timeStr, a.trim(), c.trim())) return reason || "Недоступно";
        }
        if (slot === timeStr) return reason || "Недоступно";
      }
      return null;
    };

    if (step === "items") {
      crSetStepSub("Что забрать");

      const st = String(CR_WIZ.status || "");
      const canMutateByStatus = !(st === "in_route" || st === "picked_up" || st === "done" || st === "cancelled");
      const canDelete = (CR_WIZ.mode === "create") ? true : canMutateByStatus;
      const canAdd = (CR_WIZ.mode === "create") ? true : (canMutateByStatus && crIsBeforeVisitMinus2h(CR_WIZ.date, CR_WIZ.slot));

      courierWizardEl.innerHTML = `
        <div class="crSectionTitle">Вещи</div>
        <div class="crSectionSub">Укажите, что именно нужно будет забрать курьеру.</div>
        <div id="crItems" class="crItemsList"></div>
        <div class="crActionsRow">
          <button class="smallBtn" type="button" id="crAddItemBtn" ${canAdd ? "" : "disabled"}>+ Добавить вещь</button>
          <button class="smallBtn primary" type="button" id="crItemsNextBtn" disabled>${CR_WIZ.mode === "edit" ? "Сохранить" : "Далее"}</button>
        </div>
      `;

      const itemsWrap = $("#crItems");

      const renderItems = () => {
        if (!itemsWrap) return;
        itemsWrap.innerHTML = "";
        CR_WIZ.items.forEach((it, idx) => {
          const card = document.createElement("div");
          card.className = "crItemCard glass";
          card.innerHTML = `
            <div class="crItemHead">
              <div class="crItemTitle">Вещь №${idx + 1}</div>
              ${(CR_WIZ.items.length > 1 && canDelete) ? `<button class="smallBtn" type="button" data-cr-del="${idx}">Удалить</button>` : ``}
            </div>

            <label class="field">
              <div class="fieldLabel">Категория *</div>
              <select class="fieldSelect" data-cr-cat="${idx}">
                <option value="Обувь" ${it.category === "Обувь" ? "selected" : ""}>Обувь</option>
                <option value="Сумка" ${it.category === "Сумка" ? "selected" : ""}>Сумка</option>
                <option value="Верхняя одежда" ${it.category === "Верхняя одежда" ? "selected" : ""}>Верхняя одежда</option>
                <option value="Аксессуар" ${it.category === "Аксессуар" ? "selected" : ""}>Аксессуар</option>
                <option value="Другое" ${it.category === "Другое" ? "selected" : ""}>Другое</option>
              </select>
            </label>

            <label class="field" data-cr-cat-other-wrap="${idx}" style="${it.category === "Другое" ? "" : "display:none;"}">
              <div class="fieldLabel">Укажите категорию *</div>
              <input class="fieldInput" data-cr-cat-other="${idx}" value="${escapeHtml(it.category_other || "")}" />
            </label>

            ${(() => {
              const cat = String(it.category || "");
              // если категория "Другое" — услуга текстом (необязательно)
              if (cat === "Другое") {
                return `
                  <label class="field">
                    <div class="fieldLabel">Услуга <span class="hint">(необязательно)</span></div>
                    <input class="fieldInput" data-cr-svc="${idx}" value="${escapeHtml(it.service || "")}" placeholder="Например: чистка / ремонт" />
                  </label>
                `;
              }

              const services = crServicesForCategory(cat);
              if (!services.length) {
                return `
                  <label class="field">
                    <div class="fieldLabel">Услуга <span class="hint">(необязательно)</span></div>
                    <input class="fieldInput" data-cr-svc="${idx}" value="${escapeHtml(it.service || "")}" placeholder="Например: чистка / ремонт" />
                  </label>
                `;
              }

              const cur = String(it.service || "");
              const isOther = cur && !services.includes(cur);
              const selectVal = isOther ? "Другое" : (cur || "");
              return `
                <label class="field">
                  <div class="fieldLabel">Услуга <span class="hint">(необязательно)</span></div>
                  <select class="fieldSelect" data-cr-svcsel="${idx}">
                    <option value="">Не выбирать</option>
                    ${services.map(s => `<option value="${escapeHtml(s)}" ${selectVal === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
                    <option value="Другое" ${selectVal === "Другое" ? "selected" : ""}>Другое</option>
                  </select>
                </label>

                <label class="field" data-cr-svc-other-wrap="${idx}" style="${selectVal === "Другое" ? "" : "display:none;"}">
                  <div class="fieldLabel">Укажите услугу <span class="hint">(необязательно)</span></div>
                  <input class="fieldInput" data-cr-svc-other="${idx}" value="${escapeHtml(isOther ? cur : (it.service_other || ""))}" />
                </label>
              `;
            })()}

            <label class="field">
              <div class="fieldLabel">Описание проблемы *</div>
              <input class="fieldInput" data-cr-prob="${idx}" value="${escapeHtml(it.problem)}" />
            </label>
          `;
          itemsWrap.appendChild(card);
        });
      };

      const syncNext = () => {
        const btn = $("#crItemsNextBtn");
        if (btn) btn.disabled = !crValidateItems(CR_WIZ.items);
      };

      renderItems();
      syncNext();

      if (itemsWrap) itemsWrap.addEventListener("input", (e) => {
        const t = e.target;
        if (!t) return;
        const idx = Number(
          t.getAttribute("data-cr-svc") ||
          t.getAttribute("data-cr-prob") ||
          t.getAttribute("data-cr-cat-other") ||
          t.getAttribute("data-cr-svc-other") ||
          0
        );
        if (!CR_WIZ.items[idx]) return;
        if (t.hasAttribute("data-cr-svc")) CR_WIZ.items[idx].service = String(t.value || "");
        if (t.hasAttribute("data-cr-prob")) CR_WIZ.items[idx].problem = String(t.value || "");
        if (t.hasAttribute("data-cr-svc-other")) CR_WIZ.items[idx].service_other = String(t.value || "");
        if (t.hasAttribute("data-cr-cat-other")) CR_WIZ.items[idx].category_other = String(t.value || "");
        syncNext();
      });

      if (itemsWrap) itemsWrap.addEventListener("change", (e) => {
        const t = e.target;
        if (!t) return;

        if (t.hasAttribute("data-cr-svcsel")) {
          const idx = Number(t.getAttribute("data-cr-svcsel") || 0);
          if (!CR_WIZ.items[idx]) return;
          const v = String(t.value || "");
          const wrap = itemsWrap.querySelector(`[data-cr-svc-other-wrap="${idx}"]`);
          if (wrap) wrap.style.display = (v === "Другое") ? "" : "none";
          if (!v) {
            CR_WIZ.items[idx].service = "";
          } else if (v === "Другое") {
            CR_WIZ.items[idx].service = String(CR_WIZ.items[idx].service_other || "").trim();
          } else {
            CR_WIZ.items[idx].service = v;
          }
          syncNext();
          return;
        }

        const idx = Number(t.getAttribute("data-cr-cat") || 0);
        if (!CR_WIZ.items[idx]) return;
        CR_WIZ.items[idx].category = String(t.value || "Обувь");
        const wrap = itemsWrap.querySelector(`[data-cr-cat-other-wrap="${idx}"]`);
        if (wrap) wrap.style.display = (CR_WIZ.items[idx].category === "Другое") ? "" : "none";
        syncNext();
      });

      if (itemsWrap) itemsWrap.addEventListener("click", (e) => {
        const btn = (e && e.target && e.target.closest) ? e.target.closest("button[data-cr-del]") : null;
        if (!btn) return;
        const idx = Number(btn.getAttribute("data-cr-del") || 0);
        if (CR_WIZ.items.length <= 1) return;
        CR_WIZ.items.splice(idx, 1);
        renderItems();
        syncNext();
        haptic("light");
      });

      var __el = $("#crAddItemBtn"); if (__el && __el.addEventListener) __el.addEventListener("click", () => {
        CR_WIZ.items.push({ category: "Обувь", service: "", problem: "" });
        renderItems();
        syncNext();
        haptic("light");
      });

      var __el = $("#crItemsNextBtn"); if (__el && __el.addEventListener) __el.addEventListener("click", async () => {
        haptic("light");
        if (CR_WIZ.mode === "edit") {
          const rid = Number(CR_WIZ.request_id || 0);
          if (!rid) return;
          try {
            showLoading();
            await crUserUpdateItems(rid, CR_WIZ.items);
            CR_WIZ = null;
            hideLoading();
            await crRefreshAll(true).catch(() => null);
            showPage("courier_requests");
            crRenderPage(CR_CACHE.list || []);
            try { if (tg && tg.showAlert) tg.showAlert("Сохранено"); } catch(_){}
          } catch (e) {
            hideLoading();
            try { if (tg && tg.showAlert) tg.showAlert("Ошибка: " + String((e && e.message) || e)); } catch(_){}
          }
          return;
        }
        CR_WIZ.step = "address";
        crRenderWizard();
      });
      return;
    }

    if (step === "address") {
      crSetStepSub("Адрес");
      const a = CR_WIZ.address || {};
      const saved = loadSavedAddrs();

      courierWizardEl.innerHTML = `
        <div class="crSectionTitle">Адрес забора</div>
        <div class="crSectionSub">Обязательные поля отмечены *</div>

        <div class="modalRowCol">
          <span>Город *</span>
          <div class="seg" id="crCitySeg">
            ${CITY_OPTIONS.map(c => `<button class="segBtn" type="button" data-city="${c}">${c}</button>`).join('')}
          </div>
        </div>

        ${saved.length ? `
          <div class="crSavedBlock">
            <div class="crSavedTitle">Сохранённые адреса</div>
            <div class="crSavedList">
              ${saved.map((x, i) => {
                const line = [x.city, x.street, x.house, x.apartment ? ('кв ' + x.apartment) : ''].filter(Boolean).join(', ');
                return `
                  <div class="crSavedRow">
                    <button class="smallBtn crSavedPick" type="button" data-cr-saved="${i}">${escapeHtml(line)}</button>
                    <button class="crSavedDel" type="button" aria-label="Удалить адрес" data-cr-saved-del="${i}">✕</button>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <label class="field">
          <div class="fieldLabel">Улица *</div>
          <input class="fieldInput" id="crStreet" value="${escapeHtml(a.street)}" />
        </label>

        <div class="crTwoCols">
          <label class="field">
            <div class="fieldLabel">Дом *</div>
            <input class="fieldInput" id="crHouse" value="${escapeHtml(a.house)}" />
          </label>
          <label class="field">
            <div class="fieldLabel">Квартира *</div>
            <input class="fieldInput" id="crApartment" value="${escapeHtml(a.apartment)}" />
          </label>
        </div>

        <div class="crTwoCols">
          <label class="field">
            <div class="fieldLabel">Подъезд</div>
            <input class="fieldInput" id="crEntrance" value="${escapeHtml(a.entrance)}" />
          </label>
          <label class="field">
            <div class="fieldLabel">Этаж</div>
            <input class="fieldInput" id="crFloor" value="${escapeHtml(a.floor)}" />
          </label>
        </div>

        <label class="field">
          <div class="fieldLabel">Домофон</div>
          <input class="fieldInput" id="crIntercom" value="${escapeHtml(a.intercom)}" />
        </label>

        <label class="field">
          <div class="fieldLabel">Комментарий</div>
          <input class="fieldInput" id="crComment" value="${escapeHtml(a.comment)}" />
        </label>

        <label class="crRemember">
          <input type="checkbox" id="crRememberAddr" ${CR_WIZ.remember_address ? "checked" : ""} />
          Запомнить адрес
        </label>

        <div class="crActionsRow">
          <button class="smallBtn" type="button" id="crAddrBackBtn">Назад</button>
          <button class="smallBtn primary" type="button" id="crAddrNextBtn" disabled>Далее</button>
        </div>
      `;

      const applyCityActive = (city) => {
        const c = String(city || "").trim();
        $$("#crCitySeg .segBtn").forEach(b => b.classList.toggle("active", String(b.dataset.city || "").trim() === c));
      };

      const sync = () => {
  const cityBtn = $("#crCitySeg .segBtn.active");
  const city = (cityBtn && cityBtn.dataset && cityBtn.dataset.city) ? cityBtn.dataset.city : (a.city || "");
  const v = (id) => {
    const el = $(id);
    return (el && (el.value != null)) ? String(el.value) : "";
  };

  CR_WIZ.address = {
    city: String(city || "").trim(),
    street: v("#crStreet").trim(),
    house: v("#crHouse").trim(),
    apartment: v("#crApartment").trim(),
    entrance: v("#crEntrance").trim(),
    floor: v("#crFloor").trim(),
    intercom: v("#crIntercom").trim(),
    comment: v("#crComment").trim(),
  };

  const remember = $("#crRememberAddr");
  CR_WIZ.remember_address = !!(remember && remember.checked);

  const ok = crValidateAddress(CR_WIZ.address);
  const btn = $("#crAddrNextBtn");
  if (btn) btn.disabled = !ok;
};
        var __el = $("#crRememberAddr"); CR_WIZ.remember_address = !!(__el && __el.checked);
        const ok = crValidateAddress(CR_WIZ.address);
        const btn = $("#crAddrNextBtn");
        if (btn) btn.disabled = !ok;
      };

      // init city
      const initCity = String(a.city || CITY_OPTIONS[0]).trim();
      applyCityActive(initCity);

      $$("#crCitySeg .segBtn").forEach(btn => btn.addEventListener("click", () => {
        $$("#crCitySeg .segBtn").forEach(b => b.classList.toggle("active", b === btn));
        sync();
        haptic("light");
      }));

      $$("[data-cr-saved]").forEach(btn => btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-cr-saved") || 0);
        const sel = saved[i];
        if (!sel) return;
        // подставляем
        $("#crStreet").value = sel.street || "";
        $("#crHouse").value = sel.house || "";
        $("#crApartment").value = sel.apartment || "";
        $("#crEntrance").value = sel.entrance || "";
        $("#crFloor").value = sel.floor || "";
        $("#crIntercom").value = sel.intercom || "";
        $("#crComment").value = sel.comment || "";
        applyCityActive(sel.city || initCity);
        sync();
        haptic("light");
      }));

      // delete saved address
      $$ ("[data-cr-saved-del]").forEach(btn => btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const i = Number(btn.getAttribute("data-cr-saved-del") || 0);
        const list = loadSavedAddrs();
        if (i < 0 || i >= list.length) return;
        list.splice(i, 1);
        persistSavedAddrs(list);
        // rerender same step
        CR_WIZ.step = "address";
        crRenderWizard();
        haptic("light");
      }));

      courierWizardEl.querySelectorAll("input").forEach(el => el.addEventListener("input", sync));
      var __el = $("#crRememberAddr"); if (__el && __el.addEventListener) __el.addEventListener("change", sync);
      sync();

      var __el = $("#crAddrBackBtn"); if (__el && __el.addEventListener) __el.addEventListener("click", () => {
        CR_WIZ.step = "items";
        crRenderWizard();
        haptic("light");
      });
      var __el = $("#crAddrNextBtn"); if (__el && __el.addEventListener) __el.addEventListener("click", () => {
        CR_WIZ.step = "time";
        crRenderWizard();
        haptic("light");
      });
      return;
    }

    if (step === "time") {
      crSetStepSub("Дата и время");
      // Telegram WebView (some Android/iOS) can be strict; keep syntax simple.
      const address = CR_WIZ.address || {};
      const city = String((address && address.city) || "").trim();
      const wh = WORK_HOURS[city] || WORK_HOURS.default;

      const today = (() => {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      })();

      courierWizardEl.innerHTML = `
        <div class="crSectionTitle">Когда приехать</div>
        <div class="crSectionSub">Рабочие часы: ${wh.start}–${wh.end}. Время можно выбрать не раньше, чем через 1 час.</div>

        <label class="field">
          <div class="fieldLabel">Дата</div>
          <input class="fieldInput" id="crDate" type="date" min="${today}" value="${escapeHtml(CR_WIZ.date || '')}" />
        </label>

        <label class="field">
          <div class="fieldLabel">Время</div>
          <input class="fieldInput" id="crTime" type="time" step="600" value="${escapeHtml(CR_WIZ.slot || '')}" />
        </label>

        <div id="crTimeErr" class="crErr" style="display:none"></div>

        <div class="crActionsRow">
          <button class="smallBtn" type="button" id="crTimeBackBtn">Назад</button>
          <button class="smallBtn primary" type="button" id="crTimeNextBtn" disabled>Далее</button>
        </div>
      `;

      const dateInput = $("#crDate");
      const timeInput = $("#crTime");
      const errEl = $("#crTimeErr");
      const nextBtn = $("#crTimeNextBtn");

      const showErr = (msg) => {
        if (!errEl) return;
        if (!msg) {
          errEl.style.display = "none";
          errEl.textContent = "";
          return;
        }
        errEl.style.display = "block";
        errEl.textContent = msg;
      };

      const minAllowed = () => {
        const d = new Date(Date.now() + 60 * 60 * 1000);
        return roundUpTo5(d);
      };

      const applyMinMax = () => {
        if (!timeInput) return;
        const d = String(CR_WIZ.date || "").trim();
        // базовый min/max — рабочие часы
        timeInput.min = wh.start;
        timeInput.max = wh.end;

        if (d === today) {
          const m = minAllowed();
          const hh = String(m.getHours()).padStart(2, "0");
          const mm = String(m.getMinutes()).padStart(2, "0");
          const minHm = `${hh}:${mm}`;
          // минимум = max(рабочее начало, now+1h)
          const startOk = inRange(minHm, wh.start, wh.end) ? minHm : wh.start;
          timeInput.min = startOk;
        }
      };

      const validate = () => {
        const d = String(CR_WIZ.date || "").trim();
        const t = String(CR_WIZ.slot || "").trim();
        showErr("");
        if (!d || !t) return false;

        // дата не может быть прошлой (iOS иногда позволяет выбрать, поэтому показываем ошибку)
        if (d < today) {
          showErr("Дата уже прошла. Выберите актуальную дату.");
          return false;
        }

        // рабочие часы
        if (!inRange(t, wh.start, wh.end)) {
          showErr(`Время вне рабочих часов. Доступно: ${wh.start}–${wh.end}`);
          return false;
        }

        // блокировки
        const br = isBlockedTime(t);
        if (br) {
          showErr(`Время недоступно: ${br}`);
          return false;
        }

        // минимум: +1 час от текущего момента
        try {
          const dt = new Date(`${d}T${t}:00`);
          const minDt = minAllowed();
          if (!isFinite(dt.getTime())) return false;
          if (dt.getTime() < minDt.getTime()) {
            showErr("Можно выбрать время не раньше, чем через 1 час от текущего момента.");
            return false;
          }
        } catch (e) { 
          showErr("Некорректная дата или время");
          return false;
        }

        return true;
      };

      const syncNext = () => {
        const ok = validate();
        if (nextBtn) nextBtn.disabled = !ok;
      };

      const refreshBlocks = async () => {
        const d = String(CR_WIZ.date || "").trim();
        if (!d || !city) {
          CR_WIZ.slotBlocks = [];
          syncNext();
          return;
        }
        CR_WIZ.slotBlocks = await crFetchSlotBlocks(d, city);
        if (CR_WIZ.slot && isBlockedTime(CR_WIZ.slot)) CR_WIZ.slot = "";
        syncNext();
      };

      if (dateInput) dateInput.addEventListener("change", async () => {
        CR_WIZ.date = String(dateInput.value || "").trim();
        applyMinMax();
        await refreshBlocks();
        syncNext();
        haptic("light");
      });

      if (timeInput) timeInput.addEventListener("change", () => {
        CR_WIZ.slot = String(timeInput.value || "").trim();
        syncNext();
        haptic("light");
      });

      // init
      applyMinMax();
      refreshBlocks().catch(() => null);
      syncNext();

      var __el = $("#crTimeBackBtn"); if (__el && __el.addEventListener) __el.addEventListener("click", () => {
        CR_WIZ.step = "address";
        crRenderWizard();
        haptic("light");
      });
      var __el = $("#crTimeNextBtn"); if (__el && __el.addEventListener) __el.addEventListener("click", () => {
        CR_WIZ.step = "confirm";
        crRenderWizard();
        haptic("light");
      });
      return;
    }

    if (step === "confirm") {
      crSetStepSub("Подтверждение");

      const a = CR_WIZ.address || {};
      const addrLine = [a.city, a.street, a.house, a.apartment ? ('кв ' + a.apartment) : ""].filter(Boolean).join(", ") || "—";
      const dtPretty = (CR_WIZ.date && CR_WIZ.slot) ? formatDt(CR_WIZ.date, CR_WIZ.slot) : "—";

      const items = CR_WIZ.items || [];
      const itemsHtml = (() => {
        if (items.length <= 1) {
          const it = items[0] || {};
          const cat = (String((it && it.category) || "") === "Другое" && String((it && it.category_other) || "").trim()) ? String(it.category_other) : String((it && it.category) || "");
          return `
            <div class="crPreviewItemSingle">
              <div class="crPreviewItemTitle">${escapeHtml(cat)} • ${escapeHtml(String(it.service||''))}</div>
              <div class="crPreviewItemProblem">${escapeHtml(String(it.problem||''))}</div>
            </div>
          `;
        }
        return `
          <div class="crPreviewCount">Вещей: ${items.length}</div>
          ${items.map((it, i) => {
            const cat = (String((it && it.category) || "") === "Другое" && String((it && it.category_other) || "").trim()) ? String(it.category_other) : String((it && it.category) || "");
            return `
              <div class="crPreviewItem">
                <div class="crPreviewItemTitle">${i+1}. ${escapeHtml(cat)} • ${escapeHtml(String(it.service||''))}</div>
                <div class="crPreviewItemProblem">${escapeHtml(String(it.problem||''))}</div>
              </div>
            `;
          }).join('')}
        `;
      })();

      courierWizardEl.innerHTML = `
        <div class="crSectionTitle">Проверьте данные</div>

        <div class="crPreview glass">
          <div class="crPreviewRow">
            <span class="crPreviewKey">Дата:</span>
            <span class="crPreviewVal"><b>${escapeHtml(dtPretty)}</b></span>
          </div>
          <div class="crPreviewRow">
            <span class="crPreviewKey">Адрес:</span>
            <span class="crPreviewVal"><b>${escapeHtml(addrLine)}</b></span>
          </div>
        </div>

        <div class="crPreviewItems">
          ${itemsHtml}
        </div>

        <div class="crSectionTitle" style="margin-top:10px;">Прикрепить фото?</div>
        <div class="crSectionSub">Если да — откроется бот, и вы отправите фото/видео.</div>

        <div class="crActionsRow crActionsRow3">
          <button class="smallBtn primary" type="button" id="crSendYes">Да</button>
          <button class="smallBtn" type="button" id="crSendNo">Нет</button>
          <button class="smallBtn" type="button" id="crConfirmBackBtn">Назад</button>
        </div>
      `;

      const doSend = async (needMedia) => {
        const tg_id = getTgId();
        if (!tg_id) throw new Error("Нет tg_id");
        const p = loadProfile() || {};
        const user = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) || {};
        if (!crValidateItems(CR_WIZ.items)) throw new Error("Заполните все вещи");
        if (!crValidateAddress(CR_WIZ.address)) throw new Error("Заполните обязательные поля адреса");
        if (!crValidateTime(CR_WIZ.date, CR_WIZ.slot)) throw new Error("Выберите дату и время");

        showLoading();
        try {
          const res = await fetch(SUPABASE_FUNCTION_URL, {
            method: "POST",
            mode: "cors",
            headers: {
              "content-type": "application/json",
              "apikey": SUPABASE_ANON_KEY,
              "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              kind: "courier_create",
              tg_id,
              payload_json: {
                username: (user && user.username) || "",
                city: CR_WIZ.address.city,
                phone: String(p.phone || "").trim(),
                address_json: CR_WIZ.address,
                items_json: CR_WIZ.items.map(it => {
                  const cat = String((it && it.category) || "").trim();
                  const other = String((it && it.category_other) || "").trim();
                  return {
                    category: (cat === "Другое" && other) ? other : cat,
                    service: String((it && it.service) || ""),
                    problem: String((it && it.problem) || ""),
                  };
                }),
                date: CR_WIZ.date,
                slot: CR_WIZ.slot,
                need_media: !!needMedia,
              },
            }),
          });

          const raw = await res.text();
          let data = null;
          try { data = JSON.parse(raw); } catch(_) {}
          if (!res.ok || !data || !data.ok) {
            const err = (data && data.error) ? data.error : `HTTP ${res.status}: ${raw.slice(0, 160)}`;
            throw new Error(err);
          }
        } finally {
          hideLoading();
        }

        saveAddrIfNeeded();
        CR_WIZ = null;

        if (needMedia) {
          try { (tg && tg.close)(); } catch(_) {}
          return;
        }

        try { if (tg && tg.showAlert) tg.showAlert("Заявка отправлена"); } catch(_) {}
        await crRefreshAll(true).catch(() => null);
        showPage("profile");
      };

      var __el = $("#crConfirmBackBtn"); if (__el && __el.addEventListener) __el.addEventListener("click", () => {
        CR_WIZ.step = "time";
        crRenderWizard();
        haptic("light");
      });
      var __el = $("#crSendYes"); if (__el && __el.addEventListener) __el.addEventListener("click", () => { haptic("light"); doSend(true).catch(e => { try { if (tg && tg.showAlert) tg.showAlert("Ошибка: " + String((e && e.message) || e)); } catch(_){} }); });
      var __el = $("#crSendNo"); if (__el && __el.addEventListener) __el.addEventListener("click", () => { haptic("light"); doSend(false).catch(e => { try { if (tg && tg.showAlert) tg.showAlert("Ошибка: " + String((e && e.message) || e)); } catch(_){} }); });
      return;
    }
	  // back button in wizard header

  // back button in wizard header
  if (courierBackBtn) courierBackBtn.addEventListener("click", () => {
    if (!CR_WIZ) { goBack(); return; }
    const step = CR_WIZ.step;
    if (step === "items") { confirmLeaveCourier(() => goBack()); return; }
    if (step === "address") CR_WIZ.step = "items";
    else if (step === "time") CR_WIZ.step = "address";
    else if (step === "confirm") CR_WIZ.step = "time";
    crRenderWizard();
    haptic("light");
  });
  
  let estimateDirty = false;
  let leaveAction = null;
  
  const openLeaveEstimateModal = (el) => {
    if (!el) return;
    el.classList.add("show");
    el.setAttribute("aria-hidden", "false");
  };
  const closeLeaveEstimateModal = (el) => {
    if (!el) return;
    el.classList.remove("show");
    el.setAttribute("aria-hidden", "true");
  };
  
  $$("[data-leave-close]").forEach(el => el.addEventListener("click", () => closeLeaveEstimateModal(leaveEstimateModal)));
  
  if (leaveStayBtn) leaveStayBtn.addEventListener("click", () => {
    closeLeaveEstimateModal(leaveEstimateModal);
    leaveAction = null;
    haptic("light");
  });
  if (leaveExitBtn) leaveExitBtn.addEventListener("click", () => {
    closeLeaveEstimateModal(leaveEstimateModal);
    const fn = leaveAction;
    leaveAction = null;
    if (typeof fn === "function") fn();
    haptic("light");
  });
  
  const resetEstimate = () => {
    estimateDirty = false;
    if (estimateCategory) estimateCategory.value = "Обувь";
    if (estimateOtherItem) estimateOtherItem.value = "";
    if (estimateProblem) estimateProblem.value = "";
  
    (estimateOtherWrap && estimateOtherWrap.classList).remove("show");
    (estimateOtherWrap && estimateOtherWrap.setAttribute)("aria-hidden", "true");
  
    syncEstimate();
  };
  
  const getEstimate = () => {
    const category = ((estimateCategory && estimateCategory.value) || "").trim();
    const item = ((estimateOtherItem && estimateOtherItem.value) || "").trim();
    const problem = ((estimateProblem && estimateProblem.value) || "").trim();
    return { category, item, problem };
  };
  
  const isValid = () => {
    const { category, item, problem } = getEstimate();
    if (!category) return false;
    if (category === "Другое" && !item) return false;
    if (!problem) return false;
    return true;
  };
  
  const syncEstimate = () => {
    const { category, item, problem } = getEstimate();
  
    const needOther = category === "Другое";
    if (estimateOtherWrap) {
      estimateOtherWrap.classList.toggle("show", needOther);
      estimateOtherWrap.setAttribute("aria-hidden", needOther ? "false" : "true");
    }
  
    if (estimateNextBtn) estimateNextBtn.disabled = !isValid();
  };
  
  const markDirty = () => {
    const { item, problem } = getEstimate();
    const cat = ((estimateCategory && estimateCategory.value) || "").trim();
    // считаем "грязным", если юзер реально что-то заполнял:
    estimateDirty = !!(problem || (cat === "Другое" && item));
  };
  
  if (estimateCategory) estimateCategory.addEventListener("change", () => { markDirty(); syncEstimate(); });
  if (estimateOtherItem) estimateOtherItem.addEventListener("input", () => { markDirty(); syncEstimate(); });
  if (estimateProblem) estimateProblem.addEventListener("input", () => { markDirty(); syncEstimate(); });

  if (estimateBackBtn) estimateBackBtn.addEventListener("click", () => {
    const doExit = () => {
      closeAnyModal(estimateSendModal);
      resetEstimate();
      goBack();
    };
  
    if (estimateDirty) {
      leaveAction = doExit;
      openLeaveEstimateModal(leaveEstimateModal);
    } else {
      doExit();
    }
  });
  
  // Далее / Назад
  if (estimateNextBtn) estimateNextBtn.addEventListener("click", () => {
    if (!isValid()) return;
    openAnyModal(estimateSendModal);
    haptic("light");
  });
  
  // Финал: отправка в бота
if (estimateSubmitBtn) estimateSubmitBtn.addEventListener("click", async () => {
  if (!isValid()) return;

  const { category, item, problem } = getEstimate();
  const tg_id = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? tg && tg.initDataUnsafe && tg.initDataUnsafe.user.id : undefined) || 0;

  showLoading();
  haptic("light");

  try {
    const res = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      mode: "cors",
      headers: {
        "content-type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        kind: "estimate_photo",
        tg_id,
        payload_json: {
          category,
          item: category === "Другое" ? item : "",
          problem,
        },
      }),
    });

    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}

    if (!res.ok || !data || !data.ok) {
      const err = (data && data.error) ? data.error : `HTTP ${res.status}: ${text.slice(0, 140)}`;
      throw new Error(err);
    }

    hideLoading();
    try { (tg && tg.close)(); } catch (_) {}
  } catch (e) {
    hideLoading();
    const msg = String((e && e.message) || e);
    try { if (tg && tg.showAlert) tg.showAlert("Ошибка записи: " + msg); } catch (_) {}
    console.error(e);
  }
});
  
  syncEstimate();

  // ---------------- HEADER: logo goes behind blocks + fades a bit on scroll ----------------
  // Throttled (rAF) scroll handler for 60fps
  let _logoTicking = false;
  const headerLogoFade = () => {
    _logoTicking = false;
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.classList.toggle("logoBehind", y > 12);
  };
  const onScroll = () => {
    if (_logoTicking) return;
    _logoTicking = true;
    requestAnimationFrame(headerLogoFade);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  headerLogoFade();
  
  // ---------------- INIT ----------------
  // Важно: инициализация должна быть "неубиваемой" — одна ошибка не должна ломать весь мини‑апп.
  try { setTabActive("home"); } catch (e) { _showFatal(e); }
  // помечаем первую страницу активной для CSS-переходов
  try { var _pHome = document.querySelector('.page[data-page="home"]'); if (_pHome && _pHome.classList) _pHome.classList.add('pageActive'); } catch (e) { _showFatal(e); }
  try { hydrateProfile(); } catch (e) { _showFatal(e); }
  try { runHomeIntro(); } catch (e) { /* интро не критично */ }
  try { initRevealObserver(); } catch (e) { _showFatal(e); }
	try { renderChat(); } catch (e) { _showFatal(e); }

})();
    const applyCaseImages = () => {
      document.querySelectorAll('img.reviewImg[data-case]').forEach((img) => {
        const key = String(img.getAttribute('data-case') || '').trim();
        if (key === 'do1') img.src = 'do1.png';
        else if (key === 'posle1') img.src = 'posle1.png';
      });
    };

    const initCasesProgress = () => {
      const track = document.getElementById('casesTrack');
      const bar = document.getElementById('casesProgressBar');
      if (!track || !bar) return;

      const update = () => {
        const max = (track.scrollWidth - track.clientWidth);
        const pct = max <= 0 ? 0 : Math.max(0, Math.min(1, track.scrollLeft / max));
        bar.style.width = `${Math.round(pct * 100)}%`;
      };

      let raf = 0;
      const onScroll = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => { raf = 0; update(); });
      };
      track.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      update();
    };


