/**
 * BLE AMBIENT SOUND GENERATOR & AUDIO PLAYER
 * Процедурный генератор розового шума / теплого лампового фона
 * Импринт «Бюро латеральной экстраполяции»
 */

class BLEAmbientEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.filterNode = null;
    this.sourceNode = null;
    this.isPlaying = false;
    this.volume = 0.25;
    this.fadeDuration = 2.0;
  }

  initAudioContext() {
    if (this.ctx) return;
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtxClass();
    
    // Мастер-громкость
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // Низкочастотный фильтр (эффект мягкого рассеянного лампового эмбиента)
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.setValueAtTime(450, this.ctx.currentTime);
    this.filterNode.Q.setValueAtTime(1.0, this.ctx.currentTime);
    this.filterNode.connect(this.masterGain);
  }

  /**
   * Генерация бесконечного розового шума (алгоритм Пола Келлета)
   */
  createPinkNoiseBuffer() {
    const bufferSize = this.ctx.sampleRate * 4; // 4 секунды с циклом
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
      b6 = white * 0.115926;
    }

    return buffer;
  }

  play() {
    this.initAudioContext();
    if (this.isPlaying) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const buffer = this.createPinkNoiseBuffer();
    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = buffer;
    this.sourceNode.loop = true;
    this.sourceNode.connect(this.filterNode);
    this.sourceNode.start();

    // Плавный Fade-In
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(0.0001, now);
    this.masterGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.volume), now + this.fadeDuration);

    this.isPlaying = true;
  }

  stop() {
    if (!this.isPlaying || !this.ctx) return;

    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + this.fadeDuration);

    setTimeout(() => {
      if (this.sourceNode) {
        try {
          this.sourceNode.stop();
          this.sourceNode.disconnect();
        } catch (e) {}
        this.sourceNode = null;
      }
      this.isPlaying = false;
    }, this.fadeDuration * 1000);
  }

  toggle() {
    if (this.isPlaying) {
      this.stop();
      return false;
    } else {
      this.play();
      return true;
    }
  }

  setVolume(newVol) {
    this.volume = Math.max(0, Math.min(1, parseFloat(newVol) || 0.25));
    if (this.ctx && this.isPlaying && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.volume), now + 0.1);
    }
  }
}

window.BLEAmbientEngine = BLEAmbientEngine;
