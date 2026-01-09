
(function () {
  const tg = window.Telegram?.WebApp;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  // --- Telegram init ---
  if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor("#F6F7F8");
    tg.setBackgroundColor("#F6F7F8");

    // Чуть более iOS‑вайб: минимизируем лишние элементы
    try { tg.enableClosingConfirmation(); } catch (_) {}
  }

  const state = {
    page: "home",
  };

  function haptic(type = "impact", style = "light") {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (type === "impact") tg.HapticFeedback.impactOccurred(style);
      if (type === "notification") tg.HapticFeedback.notificationOccurred(style);
    } catch (_) {}
  }

  function showPage(name) {
    state.page = name;
    $$(".page").forEach(p => p.classList.toggle("is-active", p.dataset.page === name));
    $$(".tab").forEach(t => t.classList.toggle("is-active", t.dataset.tab === name));
    // небольшой “подскролл” чтобы не дергалось
    const main = $(".main");
    if (main) main.scrollTo({ top: 0, behavior: "smooth" });
  }

  function send(action, payload = {}) {
    const data = { action, ...payload };
    if (tg) {
      tg.sendData(JSON.stringify(data));
      haptic("impact", "light");
      // Не закрываем автоматически: пусть пользователь видит, что “отправили”
      // но если это "orders", можно закрыть по желанию
    } else {
      console.log("WebApp sendData:", data);
    }
  }

  // Tabs
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      haptic("impact", "light");
      showPage(btn.dataset.tab);
    });
  });

  // Close button
  const closeBtn = $("#closeBtn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      haptic("impact", "light");
      tg?.close();
    });
  }

  // Cards / Buttons actions
  const actionEls = $$("[data-action]");
  actionEls.forEach(el => {
    const action = el.dataset.action;
    el.addEventListener("click", () => {
      switch (action) {
        case "orders":
          showPage("orders");
          break;
        case "price":
          showPage("price");
          break;
        case "support":
          send("support_start");
          break;
        case "courier":
          send("courier_start");
          break;
        case "estimate":
          send("estimate_start");
          break;
        case "new_order":
          // в текущем боте нет отдельного "создать заказ", поэтому ведём на курьера (самый понятный сценарий)
          send("courier_start");
          break;
        case "show_orders":
          send("show_orders");
          break;
        case "track": {
          const v = ($("#trackInput")?.value || "").trim();
          if (!v) { haptic("notification", "warning"); return; }
          send("track_order", { order_id: v });
          break;
        }
        case "open_profile":
          send("open_profile");
          break;
      }
    });
  });

  // Enable card keyboard access
  $$(".card[tabindex]").forEach(card => {
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") card.click();
    });
  });

  // Hydrate profile preview from initDataUnsafe (если Telegram даёт)
  function setText(id, val) {
    const el = $(id);
    if (el) el.textContent = val ?? "—";
  }
  if (tg?.initDataUnsafe?.user) {
    setText("#pName", tg.initDataUnsafe.user.first_name || "—");
  }

  // Дефолтная страница
  showPage("home");
})();
