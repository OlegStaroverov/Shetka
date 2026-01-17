(() => {
  const tg = window.Telegram?.WebApp;

  // Диагностика: ловим ошибки JS и показываем алерт в Telegram
  const _showFatal = (err) => {
    try { console.error(err); } catch (_) {}
    const msg = (err && (err.message || err.reason)) ? String(err.message || err.reason) : String(err);
    try { tg?.showAlert?.('Ошибка в мини‑аппе: ' + msg.slice(0, 220)); } catch (_) {}
  };
  window.addEventListener('error', (ev) => _showFatal(ev?.error || ev?.message || ev));
  window.addEventListener('unhandledrejection', (ev) => _showFatal(ev?.reason || ev));

  try {

  const SUPABASE_FUNCTION_URL = "https://jcnusmqellszoiuupaat.functions.supabase.co/enqueue_request";
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
  
    if (!res.ok || !data?.ok || !data?.code) {
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
    btn.querySelector('.badge')?.remove();
  
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
  
    if (!res.ok || !data?.ok) return null;
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
      const remote = {
        city: rp.city || "",
        gender: (rp.gender || "").toString().toUpperCase() || "",
        first_name: rp.first_name || "",
        last_name: rp.last_name || "",
        phone: rp.phone || "",
        avatar_kind: rp.avatar_kind || ((rp.gender || "").toString().toUpperCase() === "M" ? "ava_m" : "ava_w"),
        avatar_url: (rp.avatar_url || "").trim() || genderToAvatar((rp.gender || "").toString().toUpperCase()),
        promo_code: rp.promo_code ?? null,
        promo_percent: rp.promo_percent ?? null,
        promo_used: !!rp.promo_used,
      };

      // Если профиль в Supabase пустой — не трогаем локальный
      if (!(remote.city && remote.first_name && remote.phone)) return false;

      const local = loadProfile() || {};
      const localStamp = _stampOfProfile(local);
      const remoteStamp = String(rp.updated_at || "");

      const differs =
        String(local.city || "") !== String(remote.city || "") ||
        String((local.gender || "").toUpperCase()) !== String((remote.gender || "").toUpperCase()) ||
        String(local.first_name || "") !== String(remote.first_name || "") ||
        String(local.last_name || "") !== String(remote.last_name || "") ||
        String(local.phone || "") !== String(remote.phone || "") ||
        String(local.avatar_kind || "") !== String(remote.avatar_kind || "") ||
        String(local.avatar_url || "") !== String(remote.avatar_url || "");

      const shouldUpdate = force || differs || (!!remoteStamp && (!localStamp || remoteStamp > localStamp));
      if (!shouldUpdate) return false;

      saveProfile({
        ...local,
        ...remote,
        // на всякий случай нормализуем аватар под пол (в мини-аппе используем только пресеты)
        avatar_url: remote.avatar_url || genderToAvatar(remote.gender),
        avatar_kind: remote.avatar_kind || ((remote.gender || "").toUpperCase() === "M" ? "ava_m" : "ava_w"),
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

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const html = document.documentElement;

  // sendData bridge
  const sendToBot = (cmd, payload = {}) => {
    const data = JSON.stringify({ cmd, ...payload, ts: Date.now() });
    if (tg) tg.sendData(data);
    else console.log("sendData:", data);
  };

  const haptic = (kind = "light") => {
    if (!tg?.HapticFeedback) return;
    try { tg.HapticFeedback.impactOccurred(kind); } catch (_) {}
  };

  // ---------------- SUPABASE QUEUE (enqueue_request) ----------------
  const getTgId = () => tg?.initDataUnsafe?.user?.id || 0;

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
  const openModalEl = (el) => {
    if (!el) return;
    el.classList.add("show");
    el.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  };

  const closeModalEl = (el) => {
    if (!el) return;
    el.classList.remove("show");
    el.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };
    
  // ---------------- THEME ----------------
  const themeBtn = $("#themeToggle");

  const getPreferredTheme = () => {
    const saved = localStorage.getItem("shetka_theme");
    if (saved === "light" || saved === "dark") return saved;
    if (tg?.colorScheme) return tg.colorScheme;
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
    haptic("light");
  };

  // ---------------- PATTERN ----------------
  const patternBtn = $("#patternToggle");

  const getPatternEnabled = () => localStorage.getItem("patternEnabled") !== "0";

  const syncPatternSwitch = () => {
    if (!patternBtn) return;
    const enabled = getPatternEnabled();
    patternBtn.setAttribute("aria-checked", enabled ? "true" : "false");
  };

  const setPatternEnabled = (enabled) => {
    html.classList.toggle("pattern-on", !!enabled);
    localStorage.setItem("patternEnabled", enabled ? "1" : "0");
    syncPatternSwitch();
  };

  // init theme + pattern
  applyTheme(getPreferredTheme());
  setPatternEnabled(getPatternEnabled());
  syncThemeSwitch();

  themeBtn?.addEventListener("click", toggleTheme);
  patternBtn?.addEventListener("click", () => { setPatternEnabled(!getPatternEnabled()); haptic("light"); });

  // ---------------- NAV ----------------
  let currentPage = "home";
  const pageStack = ["home"];

  const setTabActive = (page) => {
    $$(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.nav === page));
  };

  const showPage = (page, { push = true } = {}) => {
    if (page === currentPage) return;

    const curEl = $(`.page[data-page="${currentPage}"]`);
    const nextEl = $(`.page[data-page="${page}"]`);
    if (!nextEl) return;

    if (curEl) curEl.hidden = true;
    nextEl.hidden = false;

    currentPage = page;
    if (push) pageStack.push(page);
    setTabActive(page);

    // при переключении страницы сбрасываем скролл, чтобы логотип "уходил под блоки" корректно везде
    try { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); } catch (_) { try { window.scrollTo(0, 0); } catch(_) {} }
    document.body.classList.remove("logoBehind");
    
    document.body.classList.toggle("page-estimate", page === "estimate");

    if (page === "orders") renderOrders();
    if (page === "price") renderPrice();
    if (page === "profile") {
      // 1) показываем то, что уже есть локально
      hydrateProfile();
      // 2) подтягиваем свежий профиль из Supabase (для второго устройства)
      syncRemoteProfileIfNewer({ force: true }).then((changed) => {
        if (changed) hydrateProfile();
      });
    }
    if (page === "photo_estimates") {
      // при заходе обновляем и рисуем
      peRefreshAll(true).catch(() => {});
    }
  };

  const goBack = () => {
    if (pageStack.length <= 1) return;
    pageStack.pop();
    const prev = pageStack[pageStack.length - 1];
    showPage(prev, { push: false });
    haptic("light");
  };

  $$("[data-nav]").forEach(btn => {
    btn.addEventListener("click", () => {
      showPage(btn.dataset.nav);
      haptic("light");
    });
  });
  $$("[data-back]").forEach(btn => btn.addEventListener("click", goBack));

  // ---------------- STATUS NORMALIZATION ----------------
  const normalizeStatus = (raw) => {
    if (!raw) return { label: "Принят", dot: "blue" };
    const s = String(raw).toLowerCase();

    // скрываем внутрянку/логистику: для клиента сводим
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

  // ---------------- ORDERS (demo, ready for API) ----------------
  const ordersList = $("#ordersList");
  const searchInput = $("#orderSearchInput");
  const searchBtn = $("#orderSearchBtn");
  const searchResult = $("#searchResult");

  const modal = $("#orderModal");
  const modalContent = $("#modalContent");

  const now = Date.now();
  const myTgId = tg?.initDataUnsafe?.user?.id || 0;

  let ORDERS = [
    {
      id: "10234",
      owner_tg_id: myTgId,
      created_ts: now - 2 * 60 * 60 * 1000,
      item: "Обувь · кроссовки",
      services: ["Химчистка обуви"],
      status_raw: "В работе чистка",
      price: 1990
    },
    {
      id: "77777",
      owner_tg_id: 999999,
      created_ts: now - 8 * 60 * 60 * 1000,
      item: "Обувь · ботинки",
      services: ["Ремонт подошвы"],
      status_raw: "Готов к выдаче",
      price: 3500
    }
  ];

  const isClosed = (status_raw) => {
    const s = String(status_raw || "").toLowerCase();
    return s.includes("закрыт") || s.includes("выдан") || s.includes("заверш");
  };

  const purgeClosedOlderThan24h = () => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    ORDERS = ORDERS.filter(o => !(isClosed(o.status_raw) && o.created_ts < cutoff));
  };

  const formatDate = (ts) => {
    try {
      const d = new Date(ts);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yy = String(d.getFullYear()).slice(-2);
      return `${dd}.${mm}.${yy}`;
    } catch {
      return "—";
    }
  };

  const formatMoney = (v) => {
    if (v === null || v === undefined || v === "" || v === "—") return "—";
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    return `${n.toLocaleString("ru-RU")} ₽`;
  };

  const escapeHtml = (str) => String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const isMine = (o) => !!(myTgId && o.owner_tg_id === myTgId);

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
        <div class="status"><span class="sDot ${st.dot}"></span>${escapeHtml(st.label)}</div>
      </div>
      <div class="orderBody">${lines}</div>
    `;
    wrap.addEventListener("click", () => openOrderModal(o, limited));
    return wrap;
  };

  const renderOrders = () => {
    purgeClosedOlderThan24h();
    if (!ordersList) return;

    const my = ORDERS.filter(o => isMine(o));
    ordersList.innerHTML = "";

    my.forEach(o => ordersList.appendChild(orderCard(o, false)));
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

  searchBtn?.addEventListener("click", () => {
    const id = (searchInput?.value || "").trim();
    if (!id) return;
    renderSearchResult(findOrderById(id));
    haptic("light");
  });

  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchBtn?.click();
    }
  });

  // ---------------- ORDER MODAL ----------------
  const openOrderModal = (o, limited) => {
    if (!modal || !modalContent) return;
    const st = normalizeStatus(o.status_raw);
    const date = formatDate(o.created_ts);

    modalContent.innerHTML = `
      <div class="modalH">Заказ №${escapeHtml(o.id)}</div>
      <p class="modalP">${limited ? "Показана краткая карточка заказа." : "Детали вашего заказа."}</p>

      <div class="modalGrid">
        <div class="modalRow"><span>Статус</span><b>${escapeHtml(st.label)}</b></div>
        <div class="modalRow"><span>Изделие</span><b>${escapeHtml(o.item || "—")}</b></div>
        ${limited ? "" : `<div class="modalRow"><span>Услуги</span><b>${escapeHtml((o.services||[]).join(", ") || "—")}</b></div>`}
        ${limited ? "" : `<div class="modalRow"><span>Стоимость</span><b>${escapeHtml(formatMoney(o.price))}</b></div>`}
        <div class="modalRow"><span>Дата</span><b>${escapeHtml(date)}</b></div>
      </div>

      <div style="height:12px"></div>
      <button class="smallBtn primary" type="button" id="modalAsk">Написать в поддержку</button>
    `;

    $("#modalAsk")?.addEventListener("click", () => {
      closeModal();
      openChat(true);
      haptic("light");
    });

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

  $$("[data-close]").forEach(el => el.addEventListener("click", closeModal));

  // ---------------- PRICE ----------------
  const priceTabs = $("#priceTabs");
  const priceContent = $("#priceContent");

  const PRICE = [
    { key:"clean_shoes", title:"Чистка обуви", items:[
      ["Открытая обувь", 1690],
      ["Кроссовки / Туфли", 1990],
      ["Полусапоги / Ботинки", 2390],
      ["Сапоги / Ботфорты", 2690],
      ["Детская обувь", 1290],
    ]},
    { key:"bags", title:"Сумки", items:[
      ["Сумка маленькая", 2200],
      ["Сумка средняя", 2700],
      ["Сумка большая", 3800],
      ["Полный уход с покраской — маленькая", 3500],
      ["Полный уход с покраской — средняя", 4500],
      ["Полный уход с покраской — большая", 5000],
    ]},
    { key:"other", title:"Другие изделия", items:[
      ["Колясок", 2500],
      ["Автокресел", 2000],
      ["Глобальная чистка кожи", 5500],
    ]},
    { key:"dis", title:"Дезинфекция", items:[
      ["Устранение запаха", 500],
    ]},
    { key:"sole", title:"Ремонт • Подошва", items:[
      ["Замена подошвы", 3500],
      ["Прошивка круговая", 1500],
      ["Переклейка подошвы", 1500],
      ["Прошивка + проклейка", 2000],
      ["Изготовление подошвы", 4500],
      ["Замена наката", 2000],
      ["Переклейка наката", 1000],
      ["Замена супинатора", 1500],
    ]},
    { key:"sew", title:"Ремонт • Швейные работы", items:[
      ["Замена молнии (10 см)", 600],
      ["Латки", 350],
      ["Прошивка", 500],
      ["Замена бегунка", 500],
      ["Ремонт задников", 1500],
      ["Замена обувных резинок", 800],
      ["Изготовление стелек", 1000],
    ]},
    { key:"color", title:"Покраска", items:[
      ["Покраска изделий", 1000],
      ["Реставрация — туфли/кроссовки", 4500],
      ["Реставрация — полусапоги/ботинки", 5500],
      ["Реставрация — сапоги", 6000],
      ["Куртки до 50 см", 6000],
      ["Куртки свыше 50 см", 8000],
    ]},
  ];

  let activePriceKey = PRICE[0].key;

  const renderPriceTabs = () => {
    if (!priceTabs) return;
    priceTabs.innerHTML = "";
    PRICE.forEach(cat => {
      const b = document.createElement("button");
      b.className = "priceTab" + (cat.key === activePriceKey ? " active" : "");
      b.type = "button";
      b.textContent = cat.title;
      b.addEventListener("click", () => {
        activePriceKey = cat.key;
        renderPrice();
        haptic("light");
      });
      priceTabs.appendChild(b);
    });
  };

  const renderPrice = () => {
    renderPriceTabs();
    if (!priceContent) return;

    const cat = PRICE.find(x => x.key === activePriceKey) || PRICE[0];

    const card = document.createElement("div");
    card.className = "priceCard glass";
    card.innerHTML = `
      <div class="priceH">${escapeHtml(cat.title)}</div>
      <ul class="priceList">
        ${cat.items.map(([name, price]) => `
          <li><span>${escapeHtml(name)}</span><b>${escapeHtml(formatMoney(price))}</b></li>
        `).join("")}
      </ul>
    `;

    priceContent.innerHTML = "";
    priceContent.appendChild(card);
  };

  // ---------------- PROFILE ----------------
  const phoneValue = $("#tgPhoneValue");
  const cityValue = $("#tgCityValue");

  // Профиль
  const hydrateProfile = () => {
    const user = tg?.initDataUnsafe?.user;
    const p = loadProfile() || {};

    const nameEl = $("#tgName");
    const imgEl = $("#tgAvatar");

    const shownName = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    const tgName = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
    if (nameEl) nameEl.textContent = shownName || tgName || "Пользователь";

    if (phoneValue) phoneValue.textContent = (p.phone || "").trim() || "—";
    if (cityValue) cityValue.textContent = (p.city || "").trim() || "—";

    // Аватар: ТОЛЬКО PNG (по полу). Никаких рамок/букв/фоллбеков.
    const g = (p.gender || "").toUpperCase();
    const avatar = (p.avatar_url || "").trim() || genderToAvatar(g) || "ava_m_1.png";
    if (imgEl) imgEl.src = avatar;

    // обновляем блок заявок по фото в профиле
    peRefreshAll(false).catch(() => {
      if (peTile) peTile.hidden = true;
    });
  };

  // ---------------- REGISTRATION / PROFILE via SUPABASE ----------------
  const LS_REGISTERED = "shetka_registered_v1";
  const LS_PROFILE = "shetka_profile_v1";

  const registerModal = $("#registerModal");
  const giftModal = $("#giftModal");
  const profileEditModal = $("#profileEditModal");

  const regCitySeg = $("#regCitySeg");
  const regGenderSeg = $("#regGenderSeg");
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
  const profGenderSeg = $("#profGenderSeg");
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
  let selectedGender = "";

  const genderToAvatar = (g) => {
    const gg = String(g || "").toUpperCase();
    if (gg === "M") return "ava_m_1.png";
    if (gg === "W" || gg === "Ж") return "ava_w_1.png";
    return "";
  };
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
    const gender = selectedGender;
    const first = (regFirstName?.value || "").trim();
    const phone = (regPhone?.value || "").trim();
    return !!city && !!gender && !!first && isValidRuPhone(phone);
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
    const city = cityBtn?.dataset?.city || p.city || "";
    const genderBtn = $("#profGenderSeg .segBtn.active");
    const gender = genderBtn?.dataset?.gender || p.gender || "";
    const first = (profFirstName?.value || "").trim();
    const phone = (profPhone?.value || "").trim();
    return !!city && !!gender && !!first && isValidRuPhone(phone);
  }

  function syncProfSaveState() {
    if (!profSaveBtn) return;
    profSaveBtn.disabled = !isProfileFormReady();
  }


  applyPhoneAutoprefix(regPhone);
  applyPhoneAutoprefix(profPhone);

  // реактивная валидация профиля
  [profFirstName, profLastName, profPhone].forEach(el => el?.addEventListener?.("input", syncProfSaveState));
  profCitySeg?.addEventListener?.("click", syncProfSaveState);
  profGenderSeg?.addEventListener?.("click", syncProfSaveState);
    
  // --- reset через URL: ?reset=1
  try {
    if (new URLSearchParams(location.search).get("reset") === "1") {
      localStorage.removeItem(LS_REGISTERED);
      localStorage.removeItem(LS_PROFILE);
      // телефон/прочее оставляем как было, если хочешь — можно тоже чистить
    }
  } catch (_) {}

  // --- город сегмент (регистрация)
  regCitySeg?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-city]");
    if (!btn) return;
    selectedCity = btn.dataset.city || "";
    $$("#regCitySeg .segBtn").forEach(b => b.classList.toggle("active", b === btn));
    haptic("light");
    syncRegSubmitState();
  });

  // --- пол сегмент (регистрация)
  regGenderSeg?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-gender]");
    if (!btn) return;
    selectedGender = btn.dataset.gender || "";
    $$("#regGenderSeg .segBtn").forEach(b => b.classList.toggle("active", b === btn));
    haptic("light");
    syncRegSubmitState();
  });

  regFirstName?.addEventListener("input", syncRegSubmitState);
  regPhone?.addEventListener("input", syncRegSubmitState);

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
        if (rp?.city && rp?.first_name && rp?.phone) {
          const rg = (rp.gender || rp.avatar_kind || "").toString().toUpperCase();
          saveProfile({
            city: rp.city,
            first_name: rp.first_name,
            last_name: rp.last_name || "",
            phone: rp.phone,
            gender: rg === "M" || rg === "W" ? rg : "",
            avatar_url: genderToAvatar(rg),
            promo_code: rp.promo_code || null,
            promo_percent: rp.promo_percent || null,
            promo_used: !!rp.promo_used,
          });
          localStorage.setItem(LS_REGISTERED, "1");
          hydrateProfile?.();
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
    if (profPhone) profPhone.value = p.phone || "";

    // пол
    const g = (p.gender || "").toUpperCase();
    selectedGender = g;
    $$("#profGenderSeg .segBtn").forEach(b => b.classList.toggle("active", (b.dataset.gender || "").toUpperCase() === g));
  };

  // --- профиль: открыть модалку настроек
  editProfileBtn?.addEventListener("click", () => {
    fillProfileEdit();
    syncProfSaveState();
    openModalEl(profileEditModal);
    haptic("light");
  });

  $$("[data-prof-close]").forEach(el => el.addEventListener("click", () => closeModalEl(profileEditModal)));

  // --- профиль: выбор города (настройки)
  profCitySeg?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-city]");
    if (!btn) return;
    const city = btn.dataset.city || "";
    $$("#profCitySeg .segBtn").forEach(b => b.classList.toggle("active", b === btn));
    haptic("light");
  });

  // --- профиль: выбор пола (настройки)
  profGenderSeg?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-gender]");
    if (!btn) return;
  
    selectedGender = (btn.dataset.gender || "").toUpperCase();
  
    // ВАЖНО: как и с городом — ставим active на выбранную кнопку
    $$("#profGenderSeg .segBtn").forEach(b => b.classList.toggle("active", b === btn));
  
    haptic("light");
    syncProfSaveState();
  });

  // --- регистрация: submit
  const GIFT_PERCENT = 20;

  regSubmitBtn?.addEventListener("click", async () => {
    try {
      const city = selectedCity;
      const gender = selectedGender;
      const first = (regFirstName?.value || "").trim();
      const last = (regLastName?.value || "").trim();
      const phone = (regPhone?.value || "").trim();

      // По ТЗ: без красных ошибок. Просто не даём отправить.
      if (!city || !gender || !first || !isValidRuPhone(phone)) return;
  
      // 1) берём уникальный промокод из Supabase
      const promo_code = await reservePromoCode();
  
      // 2) кладём регистрацию в очередь Supabase -> бот заберёт
      await supaEnqueue("register", {
        city,
        gender,
        first_name: first,
        last_name: last || null,
        phone,
        avatar_kind: (gender || "").toUpperCase() === "M" ? "ava_m" : "ava_w",
        promo_percent: GIFT_PERCENT,
        promo_code,
      });
  
      // 3) сохраняем локально и закрываем модалку
      saveProfile({
        city,
        gender,
        first_name: first,
        last_name: last || "",
        phone,
        avatar_url: genderToAvatar(gender),
        avatar_kind: (gender || "").toUpperCase() === "M" ? "ava_m" : "ava_w",
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
  
      hydrateProfile?.();
      haptic("light");
    } catch (e) {
      console.log("registration error:", e);
    }
  });

  // --- профиль: сохранить изменения
  profSaveBtn?.addEventListener("click", async () => {
    try {
      const p = loadProfile() || {};
      const cityBtn = $("#profCitySeg .segBtn.active");
      const city = cityBtn?.dataset?.city || p.city || "";

      const genderBtn = $("#profGenderSeg .segBtn.active");
      const gender = genderBtn?.dataset?.gender || p.gender || "";

      const first = (profFirstName?.value || "").trim();
      const last = (profLastName?.value || "").trim();
      const phone = normalizePhone(profPhone?.value || "");

      // валидация телефона — как в регистрации
      if (!city || !gender || !first || !isValidRuPhone(phone)) {
        // без изменения визуала — просто не даём сохранить
        return;
      }

      await supaEnqueue("profile_update", {
        city,
        gender,
        first_name: first,
        last_name: last || null,
        phone,
        avatar_kind: (gender || "").toUpperCase() === "M" ? "ava_m" : "ava_w",
      });

      saveProfile({
        ...p,
        city,
        gender,
        avatar_url: genderToAvatar(gender),
        avatar_kind: (gender || "").toUpperCase() === "M" ? "ava_m" : "ava_w",
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
    } catch {
      return [];
    }
  };

  const saveChat = (arr) => {
    try { localStorage.setItem(CHAT_KEY, JSON.stringify(arr)); } catch {}
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

  const isChatOpen = () => chat?.classList.contains("show");

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
    setTimeout(() => chatInput?.focus(), 80);
    if (!fromInside) haptic("light");
  };

  const closeChat = () => {
    if (!chat) return;
    chat.classList.remove("show");
    chat.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };

  chatFab?.addEventListener("click", () => openChat());
  supportOpenFromHome?.addEventListener("click", () => openChat());
  supportOpenFromProfile?.addEventListener("click", () => openChat());

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
    }catch{ return "—"; }
  };
  
  const statusLabel = (s) => {
    if (s === "waiting_media") return "Ждём фото/видео в боте";
    if (s === "waiting_admin") return "На оценке у мастера";
    if (s === "answered") return "Есть ответ";
    return s || "—";
  };
  
  async function peFetchList() {
    const tg_id = tg?.initDataUnsafe?.user?.id || 0;
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
    }catch{
      return new Set();
    }
  }
  function peSaveReadSet(set){
    try{
      localStorage.setItem(PE_READ_KEY, JSON.stringify(Array.from(set)));
    }catch{}
  }
  
  let peReadSet = peLoadReadSet();
  
  function peIsUnread(x){
    // “непрочитанное” = есть ответ админа и пользователь ещё не прочитал.
    // 1) если бэкенд отдаёт read-статус (user_read_at/is_read/read_at) — используем его (это синхрон между устройствами)
    // 2) иначе fallback на локальный localStorage (пока бэкенд не обновлён)
    if (!x || !x.admin_reply) return false;
    const isRead = !!(
      x.user_read_at ||
      x.read_at ||
      x.user_read ||
      x.is_read ||
      x.read === true
    );
    if (isRead) return false;
    return !peReadSet.has(Number(x.id));
  }
  
  function peMarkRead(id){
    const n = Number(id);
    if (!n) return;
    if (peReadSet.has(n)) return;
    peReadSet.add(n);
    peSaveReadSet(peReadSet);

    // Пытаемся синхронизировать “прочитано” на бэкенд (если добавишь action mark_read).
    // Если на бэке нет — просто молча игнорируем.
    (async () => {
      try{
        await fetch(SUPABASE_ESTIMATES_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
            "authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ action: "mark_read", id: n, tg_id: getTgId() }),
        });
      }catch(_){ }
    })();
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
  
      if (pePulse) pePulse.style.display = "none";
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
  
    // Текст/счётчик:
    // - если есть непрочитанные ответы — вместо "N активных" пишем "Непрочитанные ответы администрации"
    // - число непрочитанных рисуем ТОЛЬКО внутри зелёной точки
    if (unreadCount > 0) {
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
    if (pePulse) pePulse.style.display = "flex";
  
    // цифра непрочитанных рисуется ВНУТРИ зелёной точки
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
      payload_json: cur?.payload_json || null,
      admin_reply: cur?.admin_reply || null,
      status: cur?.status || null,
      created_at: cur?.created_at || null,
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
          ${x.admin_reply ? (() => {
              const unread = peIsUnread(x);
              return `<div style="height:8px"></div><b style="color:var(--txt)">${unread ? "Непрочитанный ответ" : "Ответ прочитан"}</b>`;
            })() : ""}
        </div>
      `;
      el.addEventListener("click", () => {
        const card = peBuildCard(x);
      
        // если есть ответ — считаем прочитанным в момент открытия карточки
        if (x.admin_reply) peMarkRead(x.id);
      
        const bindCardButtons = () => {
          // Ответить
          $("#peReplyBtn")?.addEventListener("click", () => {
            peCloseCardModal();
            openChat(true);
            const inp = $("#chatInput");
            if (inp) inp.value = `По заявке ${card.title}: `;
          });
      
          // Удалить
          $("#peDeleteBtn")?.addEventListener("click", async () => {
            if (!confirm("Удалить заявку?")) return;
            await peDelete(card.id);
            await peRefreshAll(true);
            peCloseCardModal();
          });
      
          // Оценить ответ
          $("#peRateBtn")?.addEventListener("click", () => {
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
              $("#rateSendBtn")?.toggleAttribute("disabled", !(picked >= 1 && picked <= 5));
            };
      
            $$(".rateStar").forEach(btn => btn.addEventListener("click", () => {
              picked = Number(btn.dataset.star || 0);
              syncStars();
              haptic("light");
            }));
      
            syncStars();
      
            $("#rateBackBtn")?.addEventListener("click", () => {
              peOpenCardModal(card.html);
              bindCardButtons();
            });
      
            $("#rateSendBtn")?.addEventListener("click", async () => {
              if (!(picked >= 1 && picked <= 5)) return;
              if (!confirm("После оценки заявка будет удалена из профиля. Продолжить?") ) return;
              const comment = ($("#rateComment")?.value || "").trim();
              await peRateAndDelete(card.id, picked, comment);
              await peRefreshAll(true);
              peCloseCardModal();
              try { tg?.showAlert?.("Спасибо! Оценка отправлена."); } catch(_){ }
            });
          });
        };
      
        peOpenCardModal(card.html);
        bindCardButtons();
      
        // обновляем плитку в профиле (синий/зелёный режим)
        peUpdateProfileTile(PE_CACHE.active || []);
      });
  
      peActiveList?.appendChild(el);
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
  peTile?.addEventListener("click", async () => {
    try{
      await peRefreshAll(true);
    }catch{}
    showPage("photo_estimates");
    // рендер страницы
    peRenderPage(PE_CACHE.active);
    haptic("light");
  });
  
  const addBubble = (text, who = "me") => {
    chatMessages.push({ who, text });
    saveChat(chatMessages);
    renderChat();
  };

  chatForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = (chatInput?.value || "").trim();
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
  
  openEstimateSheetBtn?.addEventListener("click", () => {
    resetEstimate();
    showPage("estimate");
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
    globalLoading?.classList.add("show");
    globalLoading?.setAttribute("aria-hidden", "false");
    let n = 0;
    dotsTimer = setInterval(() => {
      n = (n + 1) % 4;
      if (dots) dots.textContent = ".".repeat(n || 1);
    }, 320);
  };
  const hideLoading = () => {
    globalLoading?.classList.remove("show");
    globalLoading?.setAttribute("aria-hidden", "true");
    if (dotsTimer) clearInterval(dotsTimer);
    dotsTimer = null;
  };
  
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
  
  leaveStayBtn?.addEventListener("click", () => {
    closeLeaveEstimateModal(leaveEstimateModal);
    leaveAction = null;
    haptic("light");
  });
  leaveExitBtn?.addEventListener("click", () => {
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
  
    estimateOtherWrap?.classList.remove("show");
    estimateOtherWrap?.setAttribute("aria-hidden", "true");
  
    syncEstimate();
  };
  
  const getEstimate = () => {
    const category = (estimateCategory?.value || "").trim();
    const item = (estimateOtherItem?.value || "").trim();
    const problem = (estimateProblem?.value || "").trim();
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
    const cat = (estimateCategory?.value || "").trim();
    // считаем "грязным", если юзер реально что-то заполнял:
    estimateDirty = !!(problem || (cat === "Другое" && item));
  };
  
  estimateCategory?.addEventListener("change", () => { markDirty(); syncEstimate(); });
  estimateOtherItem?.addEventListener("input", () => { markDirty(); syncEstimate(); });
  estimateProblem?.addEventListener("input", () => { markDirty(); syncEstimate(); });

  estimateBackBtn?.addEventListener("click", () => {
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
  estimateNextBtn?.addEventListener("click", () => {
    if (!isValid()) return;
    openAnyModal(estimateSendModal);
    haptic("light");
  });
  
  // Финал: отправка в бота
estimateSubmitBtn?.addEventListener("click", async () => {
  if (!isValid()) return;

  const { category, item, problem } = getEstimate();
  const tg_id = tg?.initDataUnsafe?.user?.id || 0;

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
    try { tg?.close(); } catch (_) {}
  } catch (e) {
    hideLoading();
    const msg = String(e?.message || e);
    try { tg?.showAlert?.("Ошибка записи: " + msg); } catch (_) {}
    console.error(e);
  }
});
  
  syncEstimate();

  // ---------------- HEADER: logo goes behind blocks + fades a bit on scroll ----------------
  const headerLogoFade = () => {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.classList.toggle("logoBehind", y > 12); // порог можно менять (12..30)
  };

  window.addEventListener("scroll", headerLogoFade, { passive: true });
  headerLogoFade(); // сразу применяем состояние при загрузке
  
  // ---------------- INIT ----------------
  setTabActive("home");
  hydrateProfile();
  renderChat();
  } catch (e) {
    _showFatal(e);
  }

})();
