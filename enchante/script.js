
console.log("script.js loaded");

document.addEventListener('DOMContentLoaded', () => {
  const slides         = document.querySelectorAll('.slide');
  const prevBtn        = document.getElementById('prev');
  const nextBtn        = document.getElementById('next');
  const progress       = document.getElementById('progress');
  const closeTextBtn   = document.getElementById('close-text');
  const openTextBtn    = document.getElementById('open-text');
  const textWall       = document.querySelector('.text-wall');
  const curtainOverlay = document.getElementById('curtain-overlay');
  const curtainLeft    = document.getElementById('curtain-left');
  const curtainRight   = document.getElementById('curtain-right');
  const beginButton    = document.getElementById('begin-button');

  const music = /** @type {HTMLAudioElement} */ (document.getElementById('bg-music'));
  if (music) {
    music.loop = true;
  }

  let current = 0;
  const total = slides.length;

  let wallUserClosed = false;
  let wallEverOpened = false;

  // 0–100 or 0–1 accepted; TRUE 0 supported
  const START_VOL_PCT = (typeof INITIAL_VOLUME === 'number')
    ? (INITIAL_VOLUME <= 1
        ? Math.round(INITIAL_VOLUME * 100)
        : Math.max(0, Math.min(100, INITIAL_VOLUME))
      )
    : 10;

  const START_VOL = START_VOL_PCT / 100;
  const clamp01 = v => Math.min(1, Math.max(0, v));

  // Create slider at runtime
  const vc = document.getElementById('volume-control');
  const slider = document.createElement('input');
  slider.type  = 'range';
  slider.id    = 'volume-slider';
  slider.min   = '0';
  slider.max   = '100';
  slider.value = String(START_VOL_PCT);
  slider.style.display = 'none';
  vc.appendChild(slider);

  const icon = document.getElementById('volume-icon');

  function updateProgress() {
    progress.textContent = `Page ${current + 1} of ${total}`;
  }

  function showMessage() {
    textWall.style.display = 'block';
    closeTextBtn.style.display = 'block';
    if (current === 2) openTextBtn.style.display = 'none';
    wallEverOpened = true;
  }

  function hideMessage() {
    textWall.style.display = 'none';
    closeTextBtn.style.display = 'none';
    if (current === 2) openTextBtn.style.display = 'block';
    wallUserClosed = true;
  }

  function showSlide(idx) {
    const nextIdx = ((idx % total) + total) % total;
    if (nextIdx === current) {
      slides[nextIdx].classList.add('active');
      updateProgress();
      if (nextIdx === 2) {
        if (!wallUserClosed && textWall.style.display !== 'block') showMessage();
        else {
          openTextBtn.style.display  = (textWall.style.display === 'block') ? 'none'  : 'block';
          closeTextBtn.style.display = (textWall.style.display === 'block') ? 'block' : 'none';
        }
      } else {
        openTextBtn.style.display = 'none';
      }
      return;
    }

    const oldSlide = slides[current];
    const newSlide = slides[nextIdx];
    oldSlide.classList.add('flip-out');

    oldSlide.addEventListener('animationend', function onOut() {
      oldSlide.removeEventListener('animationend', onOut);
      oldSlide.classList.remove('active', 'flip-out');

      newSlide.classList.add('active', 'flip-in');
      newSlide.addEventListener('animationend', function onIn() {
        newSlide.removeEventListener('animationend', onIn);
        newSlide.classList.remove('flip-in');

        current = nextIdx;
        updateProgress();

        if (current === 2) {
          if (!wallUserClosed && textWall.style.display !== 'block') showMessage();
          else {
            openTextBtn.style.display  = (textWall.style.display === 'block') ? 'none'  : 'block';
            closeTextBtn.style.display = (textWall.style.display === 'block') ? 'block' : 'none';
          }
        } else {
          openTextBtn.style.display = 'none';
        }
      });
    });
  }

  // Flip SFX
  const flipSounds = Array.from({ length: 10 }, (_, i) => new Audio(`gallery/sounds/flip${i + 1}.mp3`));
  flipSounds.forEach(a => { try { a.load(); } catch {} });

  function playFlipSound() {
    const snd = flipSounds[Math.floor(Math.random() * flipSounds.length)];
    snd.currentTime = 0;
    snd.play().catch(() => {});
  }

  // Fade helper
  let fadeTimer = null;
  function fadeToVolume(target01, durationMs = 300) {
    if (!music) return;
    target01 = clamp01(target01);
    if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
    const steps = 20;
    const delta = (target01 - music.volume) / steps;
    let i = 0;
    fadeTimer = setInterval(() => {
      music.volume = clamp01(music.volume + delta);
      if (++i >= steps) {
        clearInterval(fadeTimer);
        fadeTimer = null;
        music.volume = target01;
      }
    }, Math.max(10, Math.floor(durationMs / steps)));
  }

  window.handleVolumeChange = function(val) {
    if (!music) return;
    if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
    const pct = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
    const vol = clamp01(pct / 100);
    music.volume = vol;
    music.muted = (pct === 0);
    icon.src = (pct === 0) ? 'gallery/controls/voloff.png' : 'gallery/controls/volon.png';
  };

  async function openCurtain() {
    curtainLeft.style.animation  = 'slideLeft 2s forwards';
    curtainRight.style.animation = 'slideRight 2s forwards';
    curtainRight.addEventListener('animationend', () => {
      curtainOverlay.style.display = 'none';
    }, { once: true });

    const gliss = new Audio('gallery/sounds/glissando.mp3');
    gliss.volume = 0.3;
    try { gliss.load(); } catch {}

    if (music) {
      try { music.load(); } catch {}
      music.volume = 0;
      music.muted  = true;
      try { await music.play(); } catch {}
    }

    try { await gliss.play(); } catch {}

    gliss.addEventListener('ended', () => {
      if (!music) return;
      if (START_VOL_PCT === 0) {
        music.muted = true;
        music.volume = 0;
        icon.src = 'gallery/controls/voloff.png';
        return;
      }
      music.muted = false;
      fadeToVolume(START_VOL, 1200);
    }, { once: true });
  }

  // UI wiring
  prevBtn.addEventListener('click', () => { playFlipSound(); showSlide(current - 1); });
  nextBtn.addEventListener('click', () => { playFlipSound(); showSlide(current + 1); });

  openTextBtn.addEventListener('click', showMessage);
  closeTextBtn.addEventListener('click', hideMessage);

  icon.addEventListener('click', () => {
    slider.style.display = (slider.style.display === 'block') ? 'none' : 'block';
  });
  slider.addEventListener('input', e => window.handleVolumeChange(e.target.value));

  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft')  { playFlipSound(); showSlide(current - 1); }
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { playFlipSound(); showSlide(current + 1); }
    if (current === 2 && e.key === 'Escape') { if (textWall.style.display === 'block') hideMessage(); }
  });

  let curtainOpened = false;
  const gesture = () => {
    if (curtainOpened) return;
    curtainOpened = true;
    openCurtain();
  };

  if (beginButton) {
    beginButton.addEventListener('click', gesture);
    beginButton.addEventListener('pointerdown', gesture);
    beginButton.addEventListener('touchstart', gesture);
  }
  if (curtainOverlay) {
    curtainOverlay.addEventListener('click', gesture);
    curtainOverlay.addEventListener('pointerdown', gesture);
    curtainOverlay.addEventListener('touchstart', gesture);
  }

  slider.value = String(START_VOL_PCT);
  if (music) {
    music.volume = START_VOL;
    music.muted = true;
  }
  icon.src = (START_VOL_PCT === 0) ? 'gallery/controls/voloff.png' : 'gallery/controls/volon.png';

  openTextBtn.style.display = 'none';
  closeTextBtn.style.display = 'none';

  updateProgress();
});
