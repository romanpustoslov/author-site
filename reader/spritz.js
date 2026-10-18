/**
 * BLE SPRITZ RSVP READER ENGINE
 * Режим скорочтения с расчетом ORP (Optimal Recognition Point)
 * Импринт «Бюро латеральной экстраполяции»
 */

class BLESpritzEngine {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.wordSlot = this.container ? this.container.querySelector('.ble-spritz-word-slot') : null;
    this.wpm = 320;
    this.words = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.timer = null;
    this.onProgress = null;
    this.onFinish = null;
  }

  setText(rawText) {
    if (!rawText) {
      this.words = [];
      return;
    }
    // Очистка от markdown тегов и разделение на слова с сохранением пунктуации
    const cleanText = rawText
      .replace(/#+\s+/g, '')
      .replace(/>\s+/g, '')
      .replace(/\[\^?\d+\]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    this.words = cleanText.split(' ').filter(w => w.length > 0);
    this.currentIndex = 0;
    this.renderCurrentWord();
  }

  /**
   * Интеллектуальный расчет индекса буквы ORP (Optimal Recognition Point)
   * Адаптирован под русскую морфологию и длинные корни
   */
  getORPIndex(word) {
    const len = word.length;
    if (len <= 1) return 0;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    if (len <= 13) return 3;
    return 4;
  }

  renderCurrentWord() {
    if (!this.wordSlot || this.words.length === 0) return;
    
    if (this.currentIndex >= this.words.length) {
      this.pause();
      if (this.onFinish) this.onFinish();
      return;
    }

    const word = this.words[this.currentIndex];
    const orpIdx = this.getORPIndex(word);
    
    const prefix = word.slice(0, orpIdx);
    const orpChar = word.slice(orpIdx, orpIdx + 1);
    const suffix = word.slice(orpIdx + 1);

    this.wordSlot.innerHTML = `${prefix}<span class="ble-spritz-orp">${orpChar}</span>${suffix}`;

    // Центрируем слово относительно буквы ORP
    // Так как визир риска находится на 36% ширины, смещаем слово влево на ширину prefix + половину orp
    requestAnimationFrame(() => {
      const orpElem = this.wordSlot.querySelector('.ble-spritz-orp');
      if (orpElem) {
        const offsetLeft = orpElem.offsetLeft;
        const halfChar = orpElem.offsetWidth / 2;
        this.wordSlot.style.transform = `translateX(-${offsetLeft + halfChar}px)`;
      }
    });

    if (this.onProgress) {
      this.onProgress(this.currentIndex, this.words.length);
    }
  }

  play() {
    if (this.isPlaying || this.words.length === 0) return;
    this.isPlaying = true;
    this.tick();
  }

  pause() {
    this.isPlaying = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
      return false;
    } else {
      this.play();
      return true;
    }
  }

  tick() {
    if (!this.isPlaying) return;

    this.renderCurrentWord();

    const currentWord = this.words[this.currentIndex] || '';
    let interval = (60 / this.wpm) * 1000;

    // Интеллектуальное замедление на знаках препинания
    if (/[.!?]$/.test(currentWord)) {
      interval *= 2.2; // Конец предложения
    } else if (/[,;:—]$/.test(currentWord)) {
      interval *= 1.6; // Запятая или тире
    } else if (currentWord.length > 12) {
      interval *= 1.25; // Очень длинное слово
    }

    this.currentIndex++;

    if (this.currentIndex < this.words.length) {
      this.timer = setTimeout(() => this.tick(), interval);
    } else {
      this.pause();
      if (this.onFinish) this.onFinish();
    }
  }

  seek(deltaWords) {
    this.currentIndex = Math.max(0, Math.min(this.words.length - 1, this.currentIndex + deltaWords));
    this.renderCurrentWord();
  }

  setWPM(newWpm) {
    this.wpm = Math.max(150, Math.min(800, parseInt(newWpm, 10) || 300));
  }
}

window.BLESpritzEngine = BLESpritzEngine;
