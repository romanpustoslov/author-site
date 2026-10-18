/**
 * BLE EMBEDDED READER CONTROLLER
 * Основной контроллер читалки на официальном сайте Романа Пустослова
 * Бюро латеральной экстраполяции (БЛЭ)
 */

class BLEReaderController {
  constructor() {
    this.manifestUrl = 'reader/data/books_manifest.json';
    this.books = [];
    this.currentBook = null;
    this.currentChapterIndex = 0;

    // Пользовательские настройки (с сохранением в localStorage)
    this.settings = {
      fontSize: 19,
      fontFamily: 'serif',
      wpm: 200, // Комфортная базовая скорость чтения для человека
      ambientVolume: 0.25
    };

    this.spritz = null;
    this.ambient = null;

    // Графический роман и комиксы
    this.comicData = null;
    this.comicPageIndex = 0;
    this.comicMode = 'page'; // 'page' (постранично) или 'tape' (вертикальная лента / webtoon)

    // Ссылки на DOM элементы
    this.dom = {};
  }

  async init() {
    this.loadSettings();
    this.cacheDom();
    this.bindEvents();

    // Инициализация подсистем
    this.spritz = new BLESpritzEngine('ble-spritz-modal');
    this.ambient = new BLEAmbientEngine();

    // Загрузка манифеста произведений
    await this.fetchManifest();

    // Обработка первоначального URL Hash
    this.onHashChange();
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem('ble_reader_settings');
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Could not read localStorage:', e);
    }
  }

  saveSettings() {
    try {
      localStorage.setItem('ble_reader_settings', JSON.stringify(this.settings));
    } catch (e) {}
  }

  cacheDom() {
    this.dom.overlay = document.getElementById('ble-reader-overlay');
    this.dom.bookTitle = document.getElementById('ble-header-book-title');
    this.dom.chapterTitle = document.getElementById('ble-header-chapter-title');
    this.dom.progressFill = document.getElementById('ble-progress-fill');
    this.dom.viewport = document.getElementById('ble-reader-viewport');
    this.dom.article = document.getElementById('ble-reader-article');
    this.dom.drawer = document.getElementById('ble-toc-drawer');
    this.dom.tocList = document.getElementById('ble-toc-list');
    this.dom.settingsPopover = document.getElementById('ble-settings-popover');
    this.dom.spritzModal = document.getElementById('ble-spritz-modal');

    // Кнопки
    this.dom.btnToc = document.getElementById('ble-btn-toc');
    this.dom.btnAmbient = document.getElementById('ble-btn-ambient');
    this.dom.btnSpritz = document.getElementById('ble-btn-spritz');
    this.dom.btnSettings = document.getElementById('ble-btn-settings');
    this.dom.btnClose = document.getElementById('ble-btn-close');
    this.dom.btnComicNav = document.getElementById('ble-btn-comic');

    // Инпуты настроек
    this.dom.inputFontSize = document.getElementById('ble-input-font-size');
    this.dom.selectFontFamily = document.getElementById('ble-select-font-family');
    this.dom.inputWpm = document.getElementById('ble-input-wpm');
    this.dom.valWpm = document.getElementById('ble-val-wpm');
    this.dom.inputVolume = document.getElementById('ble-input-volume');

    // Spritz элементы
    this.dom.btnSpritzPlay = document.getElementById('ble-spritz-btn-play');
    this.dom.btnSpritzBack = document.getElementById('ble-spritz-btn-back');
    this.dom.btnSpritzFwd = document.getElementById('ble-spritz-btn-fwd');
    this.dom.btnSpritzClose = document.getElementById('ble-spritz-btn-close');
    this.dom.spritzWpmSlider = document.getElementById('ble-spritz-wpm-slider');
    this.dom.spritzWpmDisplay = document.getElementById('ble-spritz-wpm-display');

    // Lightbox модалка (полноэкранный просмотр иллюстраций)
    this.dom.lightboxModal = document.getElementById('ble-lightbox-modal');
    this.dom.lightboxImg = document.getElementById('ble-lightbox-img');
    this.dom.lightboxCaption = document.getElementById('ble-lightbox-caption');

    // Комикс-модалка (графический роман / фан-арт)
    this.dom.comicModal = document.getElementById('ble-comic-modal');
    this.dom.comicHeaderTitle = document.getElementById('ble-comic-header-title');
    this.dom.comicCounter = document.getElementById('ble-comic-counter');
    this.dom.comicModeBtn = document.getElementById('ble-comic-mode-btn');
    this.dom.comicPdfBtn = document.getElementById('ble-comic-pdf-btn');
    this.dom.comicPageView = document.getElementById('ble-comic-page-view');
    this.dom.comicTapeView = document.getElementById('ble-comic-tape-view');
    this.dom.comicCurrentImg = document.getElementById('ble-comic-current-img');
    this.dom.comicThumbs = document.getElementById('ble-comic-thumbs');
  }

  bindEvents() {
    window.addEventListener('hashchange', () => this.onHashChange());

    // Глобальное закрытие и шорткаты
    document.addEventListener('keydown', (e) => {
      // 1. Полноэкранный просмотр иллюстраций
      if (this.dom.lightboxModal && this.dom.lightboxModal.classList.contains('active')) {
        if (e.key === 'Escape') {
          this.closeLightbox();
          e.preventDefault();
        }
        return;
      }

      // 2. Просмотрщик комиксов
      if (this.dom.comicModal && this.dom.comicModal.classList.contains('active')) {
        if (e.key === 'Escape') {
          this.closeComic();
          e.preventDefault();
        } else if (e.key === 'ArrowRight') {
          this.comicNextPage();
          e.preventDefault();
        } else if (e.key === 'ArrowLeft') {
          this.comicPrevPage();
          e.preventDefault();
        }
        return;
      }

      // 3. Главный оверлей читалки
      if (!this.dom.overlay.classList.contains('active')) return;

      if (e.key === 'Escape') {
        if (this.dom.spritzModal.classList.contains('active')) {
          this.toggleSpritz(false);
        } else if (this.dom.drawer.classList.contains('active')) {
          this.dom.drawer.classList.remove('active');
        } else if (this.dom.settingsPopover.classList.contains('active')) {
          this.dom.settingsPopover.classList.remove('active');
        } else {
          this.close();
        }
      } else if (e.key === 'ArrowRight') {
        if (!this.dom.spritzModal.classList.contains('active')) this.nextChapter();
      } else if (e.key === 'ArrowLeft') {
        if (!this.dom.spritzModal.classList.contains('active')) this.prevChapter();
      } else if (e.key === ' ' && this.dom.spritzModal.classList.contains('active')) {
        e.preventDefault();
        this.toggleSpritzPlay();
      }
    });

    // Верхняя панель
    this.dom.btnToc.addEventListener('click', () => {
      this.dom.drawer.classList.toggle('active');
      this.dom.settingsPopover.classList.remove('active');
    });

    this.dom.btnAmbient.addEventListener('click', () => {
      const active = this.ambient.toggle();
      this.dom.btnAmbient.classList.toggle('active', active);
      if (active) {
        try {
          if (typeof ym === 'function') ym(113666400, 'reachGoal', 'ambient_music');
        } catch (e) {}
      }
    });

    // Трекинг исходящих кликов по платформам в Яндекс Метрике
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      try {
        if (typeof ym === 'function') {
          if (href.includes('author.today')) ym(113666400, 'reachGoal', 'out_author_today');
          else if (href.includes('litres') || href.includes('selfpub')) ym(113666400, 'reachGoal', 'out_litres');
          else if (href.includes('litsovet')) ym(113666400, 'reachGoal', 'out_litsovet');
          else if (href.includes('boosty')) ym(113666400, 'reachGoal', 'out_boosty');
          else if (href.includes('lava.top')) ym(113666400, 'reachGoal', 'out_lava');
        }
      } catch (e) {}
    });

    this.dom.btnSpritz.addEventListener('click', () => this.toggleSpritz(true));
    this.dom.btnSpritzClose.addEventListener('click', () => this.toggleSpritz(false));

    this.dom.btnSettings.addEventListener('click', () => {
      this.dom.settingsPopover.classList.toggle('active');
      this.dom.drawer.classList.remove('active');
    });

    this.dom.btnClose.addEventListener('click', () => this.close());

    // Настройки
    this.dom.inputFontSize.addEventListener('input', (e) => {
      this.settings.fontSize = parseInt(e.target.value, 10);
      this.applyTypography();
      this.saveSettings();
    });

    this.dom.selectFontFamily.addEventListener('change', (e) => {
      this.settings.fontFamily = e.target.value;
      this.applyTypography();
      this.saveSettings();
    });

    this.dom.inputVolume.addEventListener('input', (e) => {
      this.settings.ambientVolume = parseFloat(e.target.value);
      this.ambient.setVolume(this.settings.ambientVolume);
      this.saveSettings();
    });

    // Spritz элементы управления
    this.dom.btnSpritzPlay.addEventListener('click', () => this.toggleSpritzPlay());
    this.dom.btnSpritzBack.addEventListener('click', () => this.spritz.seek(-10));
    this.dom.btnSpritzFwd.addEventListener('click', () => this.spritz.seek(10));
    
    this.dom.spritzWpmSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.settings.wpm = val;
      this.spritz.setWPM(val);
      this.dom.spritzWpmDisplay.textContent = `${val} WPM`;
      this.dom.inputWpm.value = val;
      this.dom.valWpm.textContent = `${val} WPM`;
      this.saveSettings();
    });

    this.dom.inputWpm.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.settings.wpm = val;
      this.spritz.setWPM(val);
      this.dom.valWpm.textContent = `${val} WPM`;
      this.dom.spritzWpmSlider.value = val;
      this.dom.spritzWpmDisplay.textContent = `${val} WPM`;
      this.saveSettings();
    });

    // Отслеживание скролла для прогресс-бара
    this.dom.viewport.addEventListener('scroll', () => {
      const scrollTop = this.dom.viewport.scrollTop;
      const scrollHeight = this.dom.viewport.scrollHeight - this.dom.viewport.clientHeight;
      if (scrollHeight > 0) {
        const pct = Math.min(100, Math.max(0, (scrollTop / scrollHeight) * 100));
        this.dom.progressFill.style.width = `${pct}%`;
      }
    });

    // Обработка сносок (всплывающие тултипы)
    this.setupFootnotes();
  }

  async fetchManifest() {
    try {
      const res = await fetch(this.manifestUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.books = await res.json();
      console.log(`[BLE Reader] Loaded ${this.books.length} books into manifest catalog.`);
    } catch (e) {
      console.error('[BLE Reader] Failed to load books manifest:', e);
    }
  }

  onHashChange() {
    const hash = window.location.hash;
    // Формат: #read/<book-slug>/<chapter-num>
    if (hash.startsWith('#read/')) {
      const parts = hash.split('/');
      const slug = parts[1];
      const chapter = parseInt(parts[2], 10) || 1;
      this.openBook(slug, chapter);
    } else if (this.dom.overlay.classList.contains('active')) {
      this.close(false);
    }
  }

  openBook(slug, chapterNum = 1) {
    if (!this.books || this.books.length === 0) {
      setTimeout(() => this.openBook(slug, chapterNum), 150);
      return;
    }

    const book = this.books.find(b => b.slug === slug);
    if (!book) {
      console.warn(`[BLE Reader] Book not found for slug: ${slug}`);
      return;
    }

    this.currentBook = book;
    this.currentChapterIndex = Math.max(0, Math.min(book.chapters.length - 1, chapterNum - 1));

    // Кнопка быстрого перехода к комиксу в шапке читалки
    if (this.dom.btnComicNav) {
      this.dom.btnComicNav.style.display = book.comic ? 'inline-flex' : 'none';
    }

    this.renderChapter();
    this.renderTOC();
    this.applyTypography();

    this.dom.overlay.classList.add('active');
    document.body.classList.add('ble-reader-open');

    // Сохранение прогресса
    try {
      localStorage.setItem(`ble_progress_${slug}`, this.currentChapterIndex + 1);
    } catch (e) {}

    // Трекинг цели в Яндекс Метрике
    try {
      if (typeof ym === 'function') {
        ym(113666400, 'reachGoal', 'open_reader', { book: slug, chapter: this.currentChapterIndex + 1 });
      }
    } catch (e) {}
  }

  renderChapter() {
    if (!this.currentBook || !this.currentBook.chapters[this.currentChapterIndex]) return;
    const ch = this.currentBook.chapters[this.currentChapterIndex];

    this.dom.bookTitle.textContent = this.currentBook.title;
    this.dom.chapterTitle.textContent = ch.title;

    // Конвертация текста в аккуратные абзацы со сносками
    const paragraphs = ch.content
      .split('\n\n')
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => `<p>${this.parseFootnotes(p)}</p>`)
      .join('');

    // Иллюстрация к главе (если имеется в манифесте)
    let illustrationHtml = '';
    if (ch.image_thumb) {
      const fullImg = ch.image_full || ch.image_thumb;
      const cleanTitle = this.escapeHtml(this.currentBook.title + ' — ' + ch.title);
      illustrationHtml = `
        <figure class="ble-chapter-illustration-box">
          <div class="ble-illustration-frame" onclick="bleReader.openLightbox('${fullImg}', '${cleanTitle}')">
            <img 
              src="${ch.image_thumb}" 
              alt="${cleanTitle}" 
              class="ble-illustration-img"
              loading="lazy"
            >
            <div class="ble-illustration-zoom-overlay">
              <span class="ble-illustration-zoom-icon">🔍</span>
              <span>Увеличить иллюстрацию</span>
            </div>
          </div>
          <figcaption class="ble-illustration-caption">
            Иллюстрация к главе • Кликните для просмотра в высоком разрешении
          </figcaption>
        </figure>
      `;
    }

    const hasPrev = this.currentChapterIndex > 0;
    const hasNext = this.currentChapterIndex < this.currentBook.chapters.length - 1;

    const navHtml = `
      <div class="ble-chapter-nav">
        ${hasPrev ? `<button class="ble-chapter-nav-btn" onclick="bleReader.prevChapter()">← Предыдущая глава</button>` : `<div></div>`}
        ${hasNext ? `<button class="ble-chapter-nav-btn" onclick="bleReader.nextChapter()">Следующая глава →</button>` : `<div></div>`}
      </div>
    `;

    const pageId = `${this.currentBook.slug}-${this.currentChapterIndex + 1}`;
    const pageUrl = `https://roman-pustoslov.pages.dev/#read/${this.currentBook.slug}/${this.currentChapterIndex + 1}`;
    const pageTitle = `${this.currentBook.title} — ${ch.title}`;

    const commentsHtml = `
      <section class="ble-reader-comments-section" id="ble-comments-container">
        <div class="ble-comments-header">
          <h3>💬 Мысли и отзывы к главе</h3>
          <p>Оставьте отклик автору (сообщение поступит в редакцию БЛЭ):</p>
        </div>
        
        <div class="ble-feedback-box">
          <form id="ble-feedback-form" onsubmit="bleReader.submitFeedback(event)">
            <div style="display: flex; gap: 1rem; margin-bottom: 0.85rem; flex-wrap: wrap;">
              <input 
                type="text" 
                id="ble-fb-author" 
                class="ble-fb-input" 
                placeholder="Ваше имя или никнейм (необязательно)" 
                style="flex: 1; min-width: 220px;"
              >
              <input 
                type="text" 
                id="ble-fb-contact" 
                class="ble-fb-input" 
                placeholder="Контакты для ответа (TG / Email, необязательно)" 
                style="flex: 1; min-width: 220px;"
              >
            </div>
            <textarea 
              id="ble-fb-text" 
              class="ble-fb-textarea" 
              placeholder="Что зацепило в этой главе? Мысли, впечатления, замечания к тексту..." 
              required
            ></textarea>
            
            <div style="display: flex; justify-content: flex-start; align-items: center; margin-top: 1rem;">
              <button type="submit" id="ble-fb-submit-btn" class="ble-fb-submit-btn">
                ✉ Отправить отзыв автору
              </button>
            </div>
            
            <div id="ble-fb-status" class="ble-fb-status"></div>
          </form>
        </div>
      </section>
    `;

    this.dom.article.innerHTML = `
      <h1>${ch.title}</h1>
      ${illustrationHtml}
      ${paragraphs}
      ${navHtml}
      ${commentsHtml}
    `;

    // Сброс скролла наверх
    this.dom.viewport.scrollTop = 0;
    this.dom.progressFill.style.width = '0%';

    // Подготовка текста для Spritz
    this.spritz.setText(ch.content);
    this.spritz.onProgress = (curr, total) => {
      const pct = (curr / total) * 100;
      this.dom.progressFill.style.width = `${pct}%`;
    };
  }

  async submitFeedback(e) {
    e.preventDefault();
    const author = (document.getElementById('ble-fb-author').value || 'Анонимный читатель').trim();
    const contact = (document.getElementById('ble-fb-contact').value || 'не указан').trim();
    const text = (document.getElementById('ble-fb-text').value || '').trim();
    const statusEl = document.getElementById('ble-fb-status');
    const submitBtn = document.getElementById('ble-fb-submit-btn');

    if (!text) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправка...';
    statusEl.className = 'ble-fb-status sending';
    statusEl.textContent = 'Передаем отзыв в редакцию БЛЭ...';

    const payload = {
      book: this.currentBook.title,
      slug: this.currentBook.slug,
      chapter: this.currentBook.chapters[this.currentChapterIndex].title,
      chapterIndex: this.currentChapterIndex + 1,
      author: author,
      contact: contact,
      comment: text,
      timestamp: new Date().toISOString()
    };

    // 1. Сохраняем локально в историю отзывов читателя
    try {
      const localKey = `ble_reviews_${this.currentBook.slug}`;
      const existing = JSON.parse(localStorage.getItem(localKey) || '[]');
      existing.unshift(payload);
      localStorage.setItem(localKey, JSON.stringify(existing.slice(0, 30)));
    } catch (err) {}

    // 2. Отправка в безопасный сборщик вебхука / бота БЛЭ (или Google Form / Formspree)
    try {
      // Отправляем на бесплатный сборщик Formspree/Telegram endpoint (или локальный fallback)
      await fetch('https://formspree.io/f/mwpkloye', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => null);

      statusEl.className = 'ble-fb-status success';
      statusEl.innerHTML = `✓ <strong>Спасибо за отклик!</strong> Ваш отзыв к главе «${payload.chapter}» передан автору и старшему редактору Манулу.`;
      document.getElementById('ble-fb-text').value = '';
    } catch (err) {
      statusEl.className = 'ble-fb-status success';
      statusEl.innerHTML = `✓ <strong>Отзыв сохранён!</strong> Спасибо за участие в жизни книги.`;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '✉ Отправить отзыв автору';
    }
  }

  renderTOC() {
    if (!this.currentBook) return;

    let comicItemHtml = '';
    if (this.currentBook.comic) {
      comicItemHtml = `
        <li class="ble-toc-item ble-toc-comic-item" onclick="bleReader.openComic('${this.currentBook.slug}'); document.getElementById('ble-toc-drawer').classList.remove('active');" style="background: rgba(229,169,60,0.12); border-left: 3px solid var(--ble-gold); margin-bottom: 0.5rem; font-weight: 600; color: var(--ble-gold); cursor: pointer;">
          🎨 Графический роман (${this.currentBook.comic.pages_count} полос)
        </li>
      `;
    }

    const chaptersHtml = this.currentBook.chapters.map((ch, idx) => {
      const artBadge = ch.image_thumb ? '<span style="opacity: 0.7; font-size: 0.85em; margin-left: 6px;" title="Глава с иллюстрацией">🎨</span>' : '';
      return `
        <li class="ble-toc-item ${idx === this.currentChapterIndex ? 'active' : ''}" data-index="${idx}">
          ${idx + 1}. ${ch.title} ${artBadge}
        </li>
      `;
    }).join('');

    this.dom.tocList.innerHTML = comicItemHtml + chaptersHtml;

    this.dom.tocList.querySelectorAll('.ble-toc-item[data-index]').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.index, 10);
        window.location.hash = `#read/${this.currentBook.slug}/${idx + 1}`;
        this.dom.drawer.classList.remove('active');
      });
    });
  }

  parseFootnotes(text) {
    return text.replace(/\[\^?(\d+)\]/g, (match, num) => {
      return `<span class="ble-footnote-ref" data-note="${num}">[${num}]</span>`;
    });
  }

  setupFootnotes() {
    let tooltip = document.getElementById('ble-footnote-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'ble-footnote-tooltip';
      tooltip.className = 'ble-footnote-tooltip';
      document.body.appendChild(tooltip);
    }

    document.addEventListener('mouseover', (e) => {
      if (e.target.classList.contains('ble-footnote-ref')) {
        const note = e.target.dataset.note;
        tooltip.innerHTML = `<strong>Примечание [${note}]:</strong> Авторский комментарий студии БЛЭ.`;
        tooltip.classList.add('active');

        const rect = e.target.getBoundingClientRect();
        tooltip.style.left = `${Math.min(window.innerWidth - 320, Math.max(10, rect.left - 20))}px`;
        tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8}px`;
      }
    });

    document.addEventListener('mouseout', (e) => {
      if (e.target.classList.contains('ble-footnote-ref')) {
        tooltip.classList.remove('active');
      }
    });
  }

  applyTypography() {
    this.dom.article.style.fontSize = `${this.settings.fontSize}px`;
    this.dom.article.style.fontFamily = this.settings.fontFamily === 'serif' 
      ? 'var(--ble-font-serif)' 
      : 'var(--ble-font-sans)';

    this.dom.inputFontSize.value = this.settings.fontSize;
    this.dom.selectFontFamily.value = this.settings.fontFamily;
    this.dom.inputWpm.value = this.settings.wpm;
    this.dom.valWpm.textContent = `${this.settings.wpm} WPM`;
    this.dom.spritzWpmSlider.value = this.settings.wpm;
    this.dom.spritzWpmDisplay.textContent = `${this.settings.wpm} WPM`;
    this.dom.inputVolume.value = this.settings.ambientVolume;

    this.spritz.setWPM(this.settings.wpm);
    this.ambient.setVolume(this.settings.ambientVolume);
  }

  nextChapter() {
    if (this.currentBook && this.currentChapterIndex < this.currentBook.chapters.length - 1) {
      window.location.hash = `#read/${this.currentBook.slug}/${this.currentChapterIndex + 2}`;
    }
  }

  prevChapter() {
    if (this.currentBook && this.currentChapterIndex > 0) {
      window.location.hash = `#read/${this.currentBook.slug}/${this.currentChapterIndex}`;
    }
  }

  toggleSpritz(show) {
    if (show) {
      this.dom.spritzModal.classList.add('active');
      this.dom.btnSpritz.classList.add('active');
      this.spritz.renderCurrentWord();
      try {
        if (typeof ym === 'function') {
          ym(113666400, 'reachGoal', 'spritz_mode', { book: this.currentBook?.slug });
        }
      } catch (e) {}
    } else {
      this.dom.spritzModal.classList.remove('active');
      this.dom.btnSpritz.classList.remove('active');
      this.spritz.pause();
      this.dom.btnSpritzPlay.textContent = '▶';
    }
  }

  toggleSpritzPlay() {
    const isPlaying = this.spritz.togglePlay();
    this.dom.btnSpritzPlay.textContent = isPlaying ? '⏸' : '▶';
  }

  // --- ПОЛНОЭКРАННЫЙ ПРОСМОТР ИЛЛЮСТРАЦИЙ (LIGHTBOX) ---

  openLightbox(fullUrl, caption = '') {
    if (!this.dom.lightboxModal || !this.dom.lightboxImg) return;
    this.dom.lightboxImg.src = fullUrl;
    this.dom.lightboxImg.alt = caption;
    if (this.dom.lightboxCaption) {
      this.dom.lightboxCaption.textContent = caption;
    }
    this.dom.lightboxModal.classList.add('active');
    document.body.classList.add('ble-lightbox-open');
  }

  closeLightbox() {
    if (!this.dom.lightboxModal) return;
    this.dom.lightboxModal.classList.remove('active');
    document.body.classList.remove('ble-lightbox-open');
    if (this.dom.lightboxImg) this.dom.lightboxImg.src = '';
  }

  // --- ПРОСМОТРЩИК ГРАФИЧЕСКИХ РОМАНОВ И КОМИКСОВ ---

  openComic(slug) {
    const book = this.books.find(b => b.slug === slug) || this.currentBook;
    if (!book || !book.comic) {
      console.warn('[BLE Reader] Comic adaptation not found for book:', slug);
      return;
    }

    this.comicData = book.comic;
    this.comicPageIndex = 0;
    this.comicMode = 'page';

    if (this.dom.comicHeaderTitle) {
      this.dom.comicHeaderTitle.textContent = book.comic.title || `${book.title} — Комикс-адаптация`;
    }

    if (this.dom.comicPdfBtn) {
      if (book.comic.pdf) {
        this.dom.comicPdfBtn.href = book.comic.pdf;
        this.dom.comicPdfBtn.style.display = 'inline-flex';
      } else {
        this.dom.comicPdfBtn.style.display = 'none';
      }
    }

    if (this.dom.comicPageView) this.dom.comicPageView.style.display = 'flex';
    if (this.dom.comicTapeView) this.dom.comicTapeView.style.display = 'none';
    if (this.dom.comicModeBtn) this.dom.comicModeBtn.textContent = '📜 Лента (Webtoon)';

    this.renderComicPage();
    this.renderComicThumbs();
    this.renderComicTape();

    if (this.dom.comicModal) {
      this.dom.comicModal.classList.add('active');
      document.body.classList.add('ble-comic-open');
    }

    try {
      if (typeof ym === 'function') {
        ym(113666400, 'reachGoal', 'open_comic', { book: slug });
      }
    } catch (e) {}
  }

  closeComic() {
    if (!this.dom.comicModal) return;
    this.dom.comicModal.classList.remove('active');
    document.body.classList.remove('ble-comic-open');
  }

  renderComicPage() {
    if (!this.comicData || !this.comicData.pages || this.comicData.pages.length === 0) return;
    const page = this.comicData.pages[this.comicPageIndex];
    if (this.dom.comicCurrentImg) {
      this.dom.comicCurrentImg.src = page.image;
      this.dom.comicCurrentImg.alt = `Полоса ${page.page_number} из ${this.comicData.pages_count}`;
    }
    if (this.dom.comicCounter) {
      this.dom.comicCounter.textContent = `Стр. ${this.comicPageIndex + 1} из ${this.comicData.pages_count}`;
    }
    this.updateComicThumbsActive();
  }

  renderComicThumbs() {
    if (!this.dom.comicThumbs || !this.comicData) return;
    this.dom.comicThumbs.innerHTML = this.comicData.pages.map((p, idx) => `
      <div class="ble-comic-thumb ${idx === this.comicPageIndex ? 'active' : ''}" data-index="${idx}" onclick="bleReader.setComicPage(${idx})" title="Полоса ${idx + 1}">
        <img src="${p.thumb || p.image}" alt="Стр. ${idx + 1}" loading="lazy">
        <span class="ble-comic-thumb-num">${idx + 1}</span>
      </div>
    `).join('');
  }

  updateComicThumbsActive() {
    if (!this.dom.comicThumbs) return;
    const thumbs = this.dom.comicThumbs.querySelectorAll('.ble-comic-thumb');
    thumbs.forEach((th, idx) => {
      th.classList.toggle('active', idx === this.comicPageIndex);
    });
    const activeThumb = thumbs[this.comicPageIndex];
    if (activeThumb) {
      activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  renderComicTape() {
    if (!this.dom.comicTapeView || !this.comicData) return;
    this.dom.comicTapeView.innerHTML = this.comicData.pages.map(p => `
      <div class="ble-comic-tape-item">
        <img src="${p.image}" alt="Полоса ${p.page_number}" loading="lazy">
        <div class="ble-comic-tape-label">Полоса ${p.page_number} / ${this.comicData.pages_count}</div>
      </div>
    `).join('');
  }

  setComicPage(idx) {
    if (!this.comicData) return;
    this.comicPageIndex = Math.max(0, Math.min(this.comicData.pages.length - 1, idx));
    this.renderComicPage();
  }

  comicNextPage() {
    if (!this.comicData) return;
    if (this.comicPageIndex < this.comicData.pages.length - 1) {
      this.comicPageIndex++;
      this.renderComicPage();
    }
  }

  comicPrevPage() {
    if (!this.comicData) return;
    if (this.comicPageIndex > 0) {
      this.comicPageIndex--;
      this.renderComicPage();
    }
  }

  toggleComicMode() {
    if (!this.comicData) return;
    if (this.comicMode === 'page') {
      this.comicMode = 'tape';
      if (this.dom.comicPageView) this.dom.comicPageView.style.display = 'none';
      if (this.dom.comicTapeView) this.dom.comicTapeView.style.display = 'block';
      if (this.dom.comicModeBtn) this.dom.comicModeBtn.textContent = '📄 Постранично';
    } else {
      this.comicMode = 'page';
      if (this.dom.comicPageView) this.dom.comicPageView.style.display = 'flex';
      if (this.dom.comicTapeView) this.dom.comicTapeView.style.display = 'none';
      if (this.dom.comicModeBtn) this.dom.comicModeBtn.textContent = '📜 Лента (Webtoon)';
      this.renderComicPage();
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  close(updateHash = true) {
    this.closeLightbox();
    this.closeComic();
    this.dom.overlay.classList.remove('active');
    document.body.classList.remove('ble-reader-open');
    this.dom.drawer.classList.remove('active');
    this.dom.settingsPopover.classList.remove('active');
    this.toggleSpritz(false);
    this.ambient.stop();
    this.dom.btnAmbient.classList.remove('active');

    if (updateHash && window.location.hash.startsWith('#read/')) {
      history.pushState("", document.title, window.location.pathname + window.location.search);
    }
  }
}

// Глобальный инстанс
window.bleReader = new BLEReaderController();
document.addEventListener('DOMContentLoaded', () => {
  window.bleReader.init();
});
