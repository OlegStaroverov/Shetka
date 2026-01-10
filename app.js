(() => {
  const tg = window.Telegram?.WebApp;

  // ---------- telegram init ----------
  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.disableVerticalSwipes(); } catch (_) {}
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- sendData bridge ----------
  const sendToBot = (cmd, payload = {}) => {
    const data = JSON.stringify({ cmd, ...payload, ts: Date.now() });
    if (tg) tg.sendData(data);
    else console.log("sendData:", data);
  };

  const haptic = (kind = "light") => {
    if (!tg?.HapticFeedback) return;
    try { tg.HapticFeedback.impactOccurred(kind); } catch (_) {}
  };

  // ---------- theme ----------
  const html = document.documentElement;
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

    if (themeBtn) {
      themeBtn.innerHTML = mode === "dark"
        ? `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
             <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3a7 7 0 1 0 11.5 11.5Z"
                   stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>`
        : `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
             <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" stroke="currentColor" stroke-width="2"/>
             <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"
                   stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
           </svg>`;
    }

    if (tg) {
      try {
        tg.setHeaderColor(mode === "dark" ? "#0f1115" : "#ffffff");
        tg.setBackgroundColor(mode === "dark" ? "#0b0c0f" : "#f6f7f8");
      } catch (_) {}
    }
  };

  // ---------- pattern toggle ----------
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

  themeBtn?.addEventListener("click", () => {
    const current = html.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
    // pattern depends on theme image
    setPatternEnabled(getPatternEnabled());
    haptic("light");
  });

  patternBtn?.addEventListener("click", () => {
    setPatternEnabled(!getPatternEnabled());
    haptic("light");
  });

  // ---------- navigation ----------
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

  // ---------- action buttons ----------
  $$("[data-send]").forEach(el => {
    el.addEventListener("click", () => {
      sendToBot(el.dataset.send);
      haptic("light");
    });
  });

  // ---------- status mapping ----------
  // Выкидываем внутренние/логистические статусы и “админские формулировки”
  const normalizeStatus = (raw) => {
    if (!raw) return { label: "Принят", dot: "blue" };

    const s = String(raw).toLowerCase();

    // скрываемо/внутреннее
    const internal = [
      "из симфера", "из муссона", "отправили", "в цех", "севастополь"
    ];
    if (internal.some(x => s.includes(x))) return { label: "В логистике", dot: "orange" };

    if (s.includes("соглас")) return { label: "Согласование", dot: "orange" };
    if (s.includes("готов")) return { label: "Готов", dot: "green" };
    if (s.includes("в работе") || s.includes("работе")) return { label: "В работе", dot: "orange" };
    if (s.includes("возврат")) return { label: "Возврат", dot: "red" };
    if (s.includes("закрыт") || s.includes("выдан") || s.includes("заверш")) return { label: "Завершён", dot: "gray" };
    if (s.includes("нов")) return { label: "Принят", dot: "blue" };

    // fallback
    return { label: "В работе", dot: "orange" };
  };

  // ---------- orders (demo now; ready for API) ----------
  const ordersList = $("#ordersList");
  const searchInput = $("#orderSearchInput");
  const searchBtn = $("#orderSearchBtn");
  const searchResult = $("#searchResult");

  const modal = $("#orderModal");
  const modalContent = $("#modalContent");

  // В реальности это будет API из общей базы бота.
  // Сейчас — демо, чтобы UI и логика работали.
  const now = Date.now();
  const myTgId = tg?.initDataUnsafe?.user?.id || 0;

  let ORDERS = [
    {
      id: "10234",
      owner_tg_id: myTgId,               // "мой"
      created_ts: now - 2 * 60 * 60 * 1000,
      item: "Обувь · кроссовки",
      services: ["Химчистка обуви"],
      status_raw: "В работе чистка",
      price: 1990,
      comment: "Ожидаем осмотр"
    },
    {
      id: "10111",
      owner_tg_id: myTgId,               // "мой"
      created_ts: now - 26 * 60 * 60 * 1000, // старше суток
      item: "Сумка · средняя",
      services: ["Полный уход сумок с покраской"],
      status_raw: "Закрыт",
      price: 4500,
      comment: "Завершено"
    },
    {
      id: "77777",
      owner_tg_id: 999999,               // "чужой"
      created_ts: now - 8 * 60 * 60 * 1000,
      item: "Обувь · ботинки",
      services: ["Ремонт подошвы"],
      status_raw: "Готов к выдаче",
      price: 3500,
      comment: "—"
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

  const orderCardHtml = (o, { limited = false } = {}) => {
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

    return `
      <div class="order glass" role="button">
        <div class="orderTop">
          <div>
            <div class="orderId">Заказ №${escapeHtml(o.id)}</div>
            <div class="orderMeta">${escapeHtml(date)}</div>
          </div>
          <div class="status"><span class="sDot ${st.dot}"></span>${escapeHtml(st.label)}</div>
        </div>
        <div class="orderBody">${lines}</div>
      </div>
    `;
  };

  const renderOrders = () => {
    purgeClosedOlderThan24h();
    if (!ordersList) return;

    const my = ORDERS.filter(o => isMine(o));

    ordersList.innerHTML = "";

    if (!my.length) {
      const empty = document.createElement("div");
      empty.className = "order glass";
      empty.innerHTML = `
        <div class="orderTop">
          <div>
            <div class="orderId">Пока нет заказов</div>
            <div class="orderMeta">Оформите курьера или оценку по фото</div>
          </div>
          <div class="status"><span class="sDot blue"></span>—</div>
        </div>
        <div class="orderBody">
          <div class="orderLine"><span>Быстрые действия:</span> на главной странице</div>
        </div>
      `;
      ordersList.appendChild(empty);
      return;
    }

    my.forEach(o => {
      const wrap = document.createElement("div");
      wrap.innerHTML = orderCardHtml(o, { limited: false });
      const card = wrap.firstElementChild;

      card.addEventListener("click", () => {
        openOrderModal(o, { limited: false });
        haptic("light");
      });

      ordersList.appendChild(card);
    });
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
            <div class="orderMeta">Проверьте номер и попробуйте ещё раз</div>
          </div>
        </div>
      `;
      searchResult.appendChild(box);
      return;
    }

    const limited = !isMine(order);
    const wrap = document.createElement("div");
    wrap.innerHTML = orderCardHtml(order, { limited });

    const card = wrap.firstElementChild;
    card.addEventListener("click", () => {
      openOrderModal(order, { limited });
      haptic("light");
    });

    searchResult.appendChild(card);
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

  // ---------- modal ----------
  const openOrderModal = (o, { limited = false } = {}) => {
    if (!modal || !modalContent) return;
    const st = normalizeStatus(o.status_raw);
    const date = formatDate(o.created_ts);

    modalContent.innerHTML = `
      <div class="modalH">Заказ №${escapeHtml(o.id)}</div>
      <p class="modalP">${limited ? "Доступна краткая карточка заказа." : "Детали вашего заказа."}</p>

      <div class="modalGrid">
        <div class="modalRow"><span>Статус</span><b>${escapeHtml(st.label)}</b></div>
        <div class="modalRow"><span>Изделие</span><b>${escapeHtml(o.item || "—")}</b></div>
        ${limited ? "" : `<div class="modalRow"><span>Услуги</span><b>${escapeHtml((o.services||[]).join(", ") || "—")}</b></div>`}
        ${limited ? "" : `<div class="modalRow"><span>Стоимость</span><b>${escapeHtml(formatMoney(o.price))}</b></div>`}
        <div class="modalRow"><span>Дата</span><b>${escapeHtml(date)}</b></div>
      </div>

      <div style="height:12px"></div>
      <button class="cta primary" type="button" id="modalAsk">Задать вопрос</button>
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

  // ---------- price ----------
  const priceTabs = $("#priceTabs");
  const priceContent = $("#priceContent");

  // Категории — как ты просил (без сроков и без мусора).
  // Если позже дашь полный список из CRM — заменим массив.
  const PRICE = [
    {
      key: "clean_shoes",
      title: "Чистка обуви",
      items: [
        ["Открытая обувь", 1690],
        ["Кроссовки / Туфли", 1990],
        ["Полусапоги / Ботинки", 2390],
        ["Сапоги / Ботфорты", 2690],
        ["Детская обувь", 1290],
      ]
    },
    {
      key: "bags",
      title: "Сумки",
      items: [
        ["Сумка маленькая", 2200],
        ["Сумка средняя", 2700],
        ["Сумка большая", 3800],
        ["Полный уход сумок с покраской — маленькая", 3500],
        ["Полный уход сумок с покраской — средняя", 4500],
        ["Полный уход сумок с покраской — большая", 5000],
      ]
    },
    {
      key: "other_clean",
      title: "Химчистка других изделий",
      items: [
        ["Колясок", 2500],
        ["Автокресел", 2000],
        ["Глобальная чистка кожаных курток и изделий", 5500],
      ]
    },
    {
      key: "disinfection",
      title: "Дезинфекция",
      items: [
        ["Устранение запаха", 500],
      ]
    },
    {
      key: "repair_sole",
      title: "Ремонт • Подошва",
      items: [
        ["Замена подошвы", 3500],
        ["Прошивка круговая", 1500],
        ["Переклейка подошвы", 1500],
        ["Прошивка + проклейка", 2000],
        ["Изготовление подошвы", 4500],
        ["Замена наката", 2000],
        ["Переклейка наката", 1000],
        ["Замена супинатора", 1500],
      ]
    },
    {
      key: "repair_sewing",
      title: "Ремонт • Швейные работы",
      items: [
        ["Замена молнии (за 10 см)", 600],
        ["Латки", 350],
        ["Прошивка", 500],
        ["Замена бегунка", 500],
        ["Ремонт задников", 1500],
        ["Замена обувных резинок", 800],
        ["Изготовление стелек", 1000],
      ]
    },
    {
      key: "coloring",
      title: "Покраска",
      items: [
        ["Покраска изделий", 1000],
        ["Комплексная реставрация обуви — туфли/кроссовки", 4500],
        ["Комплексная реставрация обуви — полусапоги/ботинки", 5500],
        ["Комплексная реставрация обуви — сапоги", 6000],
        ["Восстановление/покраска курток до 50 см", 6000],
        ["Восстановление/покраска курток свыше 50 см", 8000],
      ]
    }
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

  // ---------- profile ----------
  const hydrateProfile = () => {
    const user = tg?.initDataUnsafe?.user;

    const nameEl = $("#tgName");
    const phoneEl = $("#tgPhone");
    const imgEl = $("#tgAvatar");
    const fbEl = $("#avatarFallback");

    const displayName =
      user?.username ? `@${user.username}` :
      [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Пользователь";

    if (nameEl) nameEl.textContent = displayName;

    // телефона в initData обычно нет, поэтому показываем “—”
    if (phoneEl) phoneEl.textContent = "Телефон: —";

    // аватар: Telegram WebApp редко даёт photo_url.
    // Если будет — покажем.
    const photo = user?.photo_url;
    if (photo && imgEl) {
      imgEl.src = photo;
      imgEl.hidden = false;
      if (fbEl) fbEl.hidden = true;
    } else {
      if (imgEl) imgEl.hidden = true;
      if (fbEl) {
        fbEl.hidden = false;
        fbEl.textContent = (user?.first_name?.[0] || user?.username?.[0] || "Щ").toUpperCase();
      }
    }
  };

  // ---------- chat ----------
  const chat = $("#chat");
  const chatFab = $("#chatFab");
  const chatForm = $("#chatForm");
  const chatInput = $("#chatInput");
  const chatBody = $("#chatBody");

  const supportOpenFromHome = $("#supportOpenFromHome");
  const supportOpenFromProfile = $("#supportOpenFromProfile");

  const isChatOpen = () => chat?.classList.contains("show");

  const flashChatFab = () => {
    if (!chatFab) return;
    chatFab.classList.remove("flash");
    // restart animation
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
    chat.classList.add("show");
    chat.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(() => chatInput?.focus(), 60);

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
    if (!chatBody) return;
    const b = document.createElement("div");
    b.className = `bubble ${who}`;
    b.textContent = text;
    chatBody.appendChild(b);
    chatBody.scrollTop = chatBody.scrollHeight;
  };

  // emoji buttons
  $$("[data-emoji]").forEach(btn => {
    btn.addEventListener("click", () => {
      const e = btn.getAttribute("data-emoji") || "";
      if (!chatInput) return;
      chatInput.value = (chatInput.value || "") + e;
      chatInput.focus();
      haptic("light");
    });
  });

  chatForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = (chatInput?.value || "").trim();
    if (!text) return;

    addBubble(text, "me");
    chatInput.value = "";

    // отправляем в бота
    sendToBot("support_message", { text });
    haptic("light");

    // локальная подсказка (UI)
    setTimeout(() => {
      addBubble("Сообщение отправлено ✅ Менеджер ответит в Telegram.", "bot");
    }, 420);
  });

  // ---------- initial ----------
  setTabActive("home");
  hydrateProfile();
})();
