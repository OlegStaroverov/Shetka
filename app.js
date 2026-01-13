(() => {
  const tg = window.Telegram?.WebApp;

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

    if (page === "orders") renderOrders();
    if (page === "price") renderPrice();
    if (page === "profile") hydrateProfile();
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
  const addPhoneBtn = $("#addPhoneBtn");
  const phoneValue = $("#tgPhoneValue");

  const getStoredPhone = () => localStorage.getItem("shetka_phone") || "";
  const setStoredPhone = (v) => localStorage.setItem("shetka_phone", v);

  const hydrateProfile = () => {
    const user = tg?.initDataUnsafe?.user;

    const nameEl = $("#tgName");
    const imgEl = $("#tgAvatar");
    const fbEl = $("#avatarFallback");

    const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
    if (nameEl) nameEl.textContent = fullName || "Пользователь";

    const phone = getStoredPhone();
    if (phoneValue) phoneValue.textContent = phone ? phone : "—";
    if (addPhoneBtn) addPhoneBtn.hidden = !!phone;

    const photo = user?.photo_url;
    if (photo && imgEl) {
      imgEl.src = photo;
      imgEl.hidden = false;
      if (fbEl) fbEl.hidden = true;
    } else {
      if (imgEl) imgEl.hidden = true;
      if (fbEl) {
        fbEl.hidden = false;
        fbEl.textContent = (user?.first_name?.[0] || "Щ").toUpperCase();
      }
    }
  };

  // Phone modal
  const phoneModal = $("#phoneModal");
  const phoneInput = $("#phoneInput");
  const phoneSaveBtn = $("#phoneSaveBtn");
  const phoneRequestBtn = $("#phoneRequestBtn");

  const openPhoneModal = () => {
    if (!phoneModal) return;
    phoneModal.classList.add("show");
    phoneModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (phoneInput) phoneInput.value = getStoredPhone();
    setTimeout(() => phoneInput?.focus(), 60);
  };

  const closePhoneModal = () => {
    if (!phoneModal) return;
    phoneModal.classList.remove("show");
    phoneModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };

  addPhoneBtn?.addEventListener("click", () => { openPhoneModal(); haptic("light"); });
  $$("[data-phone-close]").forEach(el => el.addEventListener("click", closePhoneModal));

  phoneSaveBtn?.addEventListener("click", () => {
    const v = (phoneInput?.value || "").trim();
    if (!v) return;
    setStoredPhone(v);
    sendToBot("set_phone", { phone: v });
    closePhoneModal();
    hydrateProfile();
    haptic("light");
  });

  phoneRequestBtn?.addEventListener("click", () => {
    sendToBot("request_phone");
    // бот должен отправить запрос контакта
    closePhoneModal();
    haptic("light");
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
  const estimateSheet = $("#estimateSheet");

  const openCourierSheetBtn = $("#openCourierSheet");
  const openEstimateSheetBtn = $("#openEstimateSheet");
  const estimateCloseBtn = $("#estimateCloseBtn");

  const courierAddress = $("#courierAddress");
  const courierComment = $("#courierComment");
  const courierSendBtn = $("#courierSendBtn");

  // --- ESTIMATE 2-STEP ---
  const estimateStep1 = $("#estimateStep1");
  const estimateStep2 = $("#estimateStep2");
  
  const estimateCategory = $("#estimateCategory");
  const estimateOtherWrap = $("#estimateOtherWrap");
  const estimateOtherItem = $("#estimateOtherItem");
  const estimateProblem = $("#estimateProblem");
  
  const estimateNextBtn = $("#estimateNextBtn");
  const estimateBackBtn = $("#estimateBackBtn");
  const estimateSubmitBtn = $("#estimateSubmitBtn");
  
  const prevCategory = $("#prevCategory");
  const prevOtherRow = $("#prevOtherRow");
  const prevOther = $("#prevOther");
  const prevProblem = $("#prevProblem");
  
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
  
    if (estimateStep1) estimateStep1.hidden = false;
    if (estimateStep2) estimateStep2.hidden = true;
  
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
  
    if (prevCategory) prevCategory.textContent = category || "—";
    if (prevProblem) prevProblem.textContent = problem || "—";
  
    if (prevOtherRow) prevOtherRow.hidden = !needOther;
    if (prevOther) prevOther.textContent = item || "—";
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
  
  openEstimateSheetBtn?.addEventListener("click", () => {
    resetEstimate();
    showPage("estimate");
    haptic("light");
  });
  
  // Закрытие шторки оценки — с подтверждением
  const closeEstimateSafely = () => {
    const doClose = () => { closeSheet(estimateSheet); resetEstimate(); };
    if (estimateDirty) {
      leaveAction = doClose;
      openLeaveEstimateModal(leaveEstimateModal);
    } else {
      doClose();
    }
  };
  
  $$("[data-estimate-close]").forEach(el => el.addEventListener("click", closeEstimateSafely));
  
  // Далее / Назад
  estimateNextBtn?.addEventListener("click", () => {
    if (!isValid()) return;
    if (estimateStep1) estimateStep1.hidden = true;
    if (estimateStep2) estimateStep2.hidden = false;
    syncEstimate();
    haptic("light");
  });
  estimateBackBtn?.addEventListener("click", () => {
    if (estimateStep1) estimateStep1.hidden = false;
    if (estimateStep2) estimateStep2.hidden = true;
    haptic("light");
  });
  
  // Финал: отправка в бота
  estimateSubmitBtn?.addEventListener("click", () => {
    if (!isValid()) return;
  
    const { category, item, problem } = getEstimate();
  
    showLoading();
    haptic("light");
  
    sendToBot("estimate_submit", {
      category,
      item: category === "Другое" ? item : "",
      problem
    });
  
    // маленькая задержка "ощущение сохранения", затем закрываем mini app
    setTimeout(() => {
      hideLoading();
      try { tg?.close(); } catch (_) {}
      closeSheet(estimateSheet);
      resetEstimate();
    }, 1100);
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
})();
