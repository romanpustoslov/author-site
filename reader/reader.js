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
  }

  bindEvents() {
    window.addEventListener('hashchange', () => this.onHashChange());

    // Глобальное закрытие и шорткаты
    document.addEventListener('keydown', (e) => {
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
          <p>Оставьте отзыв или комментарий автору прямо со страницы чтения (без регистрации):</p>
        </div>
        <div id="cusdis_thread">
          <iframe
            id="cusdis_iframe"
            title="Комментарии к главе"
            src="https://cusdis.com/api/open/html?appId=9be9d4a8-6f71-4235-977d-7880f08960fa&pageId=${encodeURIComponent(pageId)}&pageUrl=${encodeURIComponent(pageUrl)}&pageTitle=${encodeURIComponent(pageTitle)}&theme=dark"
            loading="lazy"
            style="width: 100%; min-height: 280px; border: none; overflow: hidden;"
          ></iframe>
        </div>
      </section>
    `;

    this.dom.article.innerHTML = `
      <h1>${ch.title}</h1>
      ${paragraphs}
      ${navHtml}
      ${commentsHtml}
    `;

    // Автоматическая подстройка высоты iframe по сообщению от Cusdis
    this.setupCusdisAutoHeight();

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

  setupCusdisAutoHeight() {
    if (this._cusdisMsgBound) return;
    this._cusdisMsgBound = true;
    window.addEventListener('message', (e) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (data && data.from === 'cusdis') {
          if (data.event === 'resize') {
            const ifr = document.getElementById('cusdis_iframe');
            if (ifr && data.data) {
              ifr.style.height = `${Math.max(280, data.data)}px`;
            }
          }
        }
      } catch (err) {}
    });
  }

  renderTOC() {
    if (!this.currentBook) return;
    this.dom.tocList.innerHTML = this.currentBook.chapters.map((ch, idx) => `
      <li class="ble-toc-item ${idx === this.currentChapterIndex ? 'active' : ''}" data-index="${idx}">
        ${idx + 1}. ${ch.title}
      </li>
    `).join('');

    this.dom.tocList.querySelectorAll('.ble-toc-item').forEach(item => {
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

  close(updateHash = true) {
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
