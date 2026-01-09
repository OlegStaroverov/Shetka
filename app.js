(() => {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.disableVerticalSwipes(); } catch (e) {}
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ----------------- BOT BRIDGE -----------------
  const sendToBot = (cmd, payload = {}) => {
    const data = JSON.stringify({ cmd, ...payload, ts: Date.now() });
    if (tg) tg.sendData(data);
    else console.log('sendData:', data);
  };

  const haptic = (kind = 'light') => {
    if (!tg?.HapticFeedback) return;
    try { tg.HapticFeedback.impactOccurred(kind); } catch (e) {}
  };

  // ----------------- THEME -----------------
  const html = document.documentElement;
  const themeBtn = $('#themeToggle');

  const getPreferredTheme = () => {
    const saved = localStorage.getItem('shetka_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    if (tg?.colorScheme) return tg.colorScheme;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  };

  const applyTheme = (mode) => {
    html.setAttribute('data-theme', mode);
    document.body.classList.toggle('dark', mode === 'dark');
    document.body.classList.toggle('light', mode !== 'dark');
    localStorage.setItem('shetka_theme', mode);

    if (themeBtn) themeBtn.innerHTML = (mode === 'dark') ? '☾' : '☀︎';

    if (tg) {
      try {
        tg.setHeaderColor(mode === 'dark' ? '#0f1115' : '#ffffff');
        tg.setBackgroundColor(mode === 'dark' ? '#0b0c0f' : '#f6f7f8');
      } catch (e) {}
    }
  };

  // ----------------- PATTERN (infinite wallpaper) -----------------
  const patternBtn = $('#patternToggle');

  const getPatternEnabled = () => localStorage.getItem('patternEnabled') !== '0';
  const syncPatternSwitch = () => {
    if (!patternBtn) return;
    const enabled = getPatternEnabled();
    patternBtn.setAttribute('aria-checked', enabled ? 'true' : 'false');
    patternBtn.classList.toggle('on', enabled);
  };

  const setPatternEnabled = (enabled) => {
    document.body.classList.toggle('pattern-on', !!enabled);
    localStorage.setItem('patternEnabled', enabled ? '1' : '0');
    syncPatternSwitch();
  };

  // init theme + pattern
  applyTheme(getPreferredTheme());
  setPatternEnabled(getPatternEnabled());

  themeBtn?.addEventListener('click', () => {
    const current = html.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
    // pattern visuals depend on theme
    setPatternEnabled(getPatternEnabled());
    haptic('light');
  });

  patternBtn?.addEventListener('click', () => {
    setPatternEnabled(!getPatternEnabled());
    haptic('light');
  });

  // ----------------- NAV / PAGES (no heavy animations) -----------------
  let currentPage = 'home';
  const pageStack = ['home'];

  const setTabActive = (page) => {
    $$('.tab').forEach(btn => btn.classList.toggle('active', btn.dataset.nav === page));
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

    if (page === 'orders') renderOrders();
  };

  const goBack = () => {
    if (pageStack.length <= 1) return;
    pageStack.pop();
    const prev = pageStack[pageStack.length - 1];
    showPage(prev, { push: false });
    haptic('light');
  };

  $$('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      showPage(btn.dataset.nav);
      haptic('light');
    });
  });

  $$('[data-back]').forEach(btn => btn.addEventListener('click', goBack));

  // ----------------- ACTION BUTTONS -----------------
  $$('[data-send]').forEach(el => {
    el.addEventListener('click', () => {
      sendToBot(el.dataset.send);
      haptic('light');
    });
  });

  // ----------------- ORDERS (UI + modal) -----------------
  const ordersList = $('#ordersList');
  const modal = $('#orderModal');
  const modalContent = $('#modalContent');

  const demoOrders = [
    { id: '10234', status: 'in_progress', title: 'Обувь · кроссовки', created: 'Сегодня', price: '—', note: 'Ожидаем осмотр' },
    { id: '10111', status: 'ready', title: 'Сумка · средняя', created: 'Вчера', price: '4500', note: 'Можно забирать' },
  ];

  const statusMap = {
    pending: { label: 'Принят', dot: 'pending' },
    in_progress: { label: 'В работе', dot: 'in_progress' },
    ready: { label: 'Готов', dot: 'ready' },
    delivery: { label: 'Доставка', dot: 'delivery' },
    completed: { label: 'Завершён', dot: 'completed' },
  };

  const escapeHtml = (str) => String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const renderOrders = async () => {
    if (!ordersList) return;
    const items = demoOrders;

    ordersList.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'notice glass';
      empty.innerHTML = '<div class="noticeDot"></div><div class="noticeTxt">Пока нет заказов. Нажми “Вызвать курьера” или “Оценка по фото”.</div>';
      ordersList.appendChild(empty);
      return;
    }

    items.forEach(o => {
      const st = statusMap[o.status] || { label: o.status, dot: 'pending' };
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'order glass';
      card.innerHTML = `
        <div class="orderTop">
          <div>
            <div class="orderId">Заказ №${escapeHtml(o.id)}</div>
            <div class="orderMeta">${escapeHtml(o.created || '')}</div>
          </div>
          <div class="status"><span class="sDot ${st.dot}"></span>${escapeHtml(st.label)}</div>
        </div>
        <div class="orderBody">
          <div class="orderLine"><span>Изделие:</span> ${escapeHtml(o.title || '—')}</div>
          <div class="orderLine"><span>Комментарий:</span> ${escapeHtml(o.note || '—')}</div>
          <div class="orderLine"><span>Стоимость:</span> ${escapeHtml(o.price || '—')}</div>
        </div>
        <div class="orderBtnRow">
          <button class="smallBtn" data-inner="track">Отследить</button>
          <button class="smallBtn primary" data-inner="open">Открыть</button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        const inner = e.target?.closest?.('[data-inner]');
        if (inner?.dataset?.inner === 'track') {
          e.preventDefault();
          e.stopPropagation();
          sendToBot('track_order', { order_id: o.id });
          haptic('light');
          return;
        }
        openOrderModal(o);
        haptic('light');
      });

      ordersList.appendChild(card);
    });
  };

  const openOrderModal = (o) => {
    if (!modal || !modalContent) return;
    const st = statusMap[o.status] || { label: o.status, dot: 'pending' };

    modalContent.innerHTML = `
      <div class="modalH">Заказ №${escapeHtml(o.id)}</div>
      <p class="modalP">Карточка заказа. Фото/изменения — через админку в боте.</p>
      <div class="modalGrid">
        <div class="modalRow"><span>Статус</span><b>${escapeHtml(st.label)}</b></div>
        <div class="modalRow"><span>Изделие</span><b>${escapeHtml(o.title || '—')}</b></div>
        <div class="modalRow"><span>Комментарий</span><b>${escapeHtml(o.note || '—')}</b></div>
        <div class="modalRow"><span>Стоимость</span><b>${escapeHtml(o.price || '—')}</b></div>
      </div>
      <div style="height:12px"></div>
      <button class="cta primary" type="button" id="modalTrack">Отследить в боте</button>
    `;

    $('#modalTrack')?.addEventListener('click', () => {
      sendToBot('track_order', { order_id: o.id });
      closeModal();
      haptic('light');
    });

    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  $$('[data-close]').forEach(el => el.addEventListener('click', closeModal));

  // ----------------- CHAT WIDGET -----------------
  const chat = $('#chat');
  const chatFab = $('#chatFab');
  const chatForm = $('#chatForm');
  const chatInput = $('#chatInput');
  const chatBody = $('#chatBody');

  const openChat = () => {
    if (!chat) return;
    chat.classList.add('show');
    chat.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => chatInput?.focus(), 50);
  };

  const closeChat = () => {
    if (!chat) return;
    chat.classList.remove('show');
    chat.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  chatFab?.addEventListener('click', () => { openChat(); haptic('light'); });
  $$('[data-chat-close]').forEach(el => el.addEventListener('click', closeChat));

  const addBubble = (text, who = 'me') => {
    if (!chatBody) return;
    const b = document.createElement('div');
    b.className = `bubble ${who}`;
    b.textContent = text;
    chatBody.appendChild(b);
    chatBody.scrollTop = chatBody.scrollHeight;
  };

  chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = (chatInput?.value || '').trim();
    if (!text) return;
    addBubble(text, 'me');
    chatInput.value = '';

    sendToBot('support_message', { text });
    haptic('light');

    window.setTimeout(() => {
      addBubble('Сообщение отправлено. Менеджер ответит в чате Telegram.', 'bot');
    }, 420);
  });

  // initial tab
  setTabActive('home');
})();
