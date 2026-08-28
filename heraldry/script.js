
document.addEventListener('DOMContentLoaded', () => {
  const overlay   = document.getElementById('curtain-overlay');
  const cLeft     = document.getElementById('curtain-left');
  const cRight    = document.getElementById('curtain-right');
  const beginBtn  = document.getElementById('begin-button');

  const slides    = Array.from(document.querySelectorAll('.slide'));
  const prevBtn   = document.getElementById('prev');
  const nextBtn   = document.getElementById('next');
  const progress  = document.getElementById('progress');

  const wall       = document.getElementById('textWall');
  const closeText  = document.getElementById('close-text');
  const openText   = document.getElementById('open-text');

  const slideshowEl = document.getElementById('slideshow');
  const volumeControl = document.getElementById('volume-control');
  const volIcon   = document.getElementById('volume-icon');
  const volIconImg = document.getElementById('volume-icon-img');
  const music     = document.getElementById('bg-music');

  const turnEl = document.getElementById('turn');
  const sheetFront = document.getElementById('sheetFront');
  const turnFrontImg = document.getElementById('turnFrontImg');
  const turnShadow = document.getElementById('turnShadow');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const curtainIntroRevealMs = prefersReducedMotion ? 80 : 520;
  const curtainFallbackOpenMs = prefersReducedMotion ? 140 : 2600;
  const curtainCleanupPadMs = prefersReducedMotion ? 20 : 0;
  const glissSafetyPadMs = prefersReducedMotion ? 120 : 450;
  const musicFadeMs = prefersReducedMotion ? 120 : 900;
  const wallRevealDelayMs = prefersReducedMotion ? 80 : 2200;
  const wallRevealFadeMs = prefersReducedMotion ? 120 : 900;
  const beginWelcomeHoldMs = prefersReducedMotion ? 400 : 1500;
  const pageFlipMs = prefersReducedMotion ? 0 : 600;

  const TOTAL = slides.length;
  let started = false;
  let introControlsLocked = false;
  let idx = 0;
  let wallClosedByUser = false;
  let wallRevealLocked = false;
  let wallRevealTimer = null;
  let wallRevealUnlockTimer = null;
  let pageFlipLocked = false;
  let pageFlipTimer = null;
  let slider = null;
  let stageReady = false;
  let introStarted = false;
  let deferredWarmStarted = false;

  const flipPool = Array.from({length: 10}, (_, i) => `gallery/sounds/flip${i+1}.mp3`);
  const glissSrc = 'gallery/sounds/glissando.mp3';
  const deferredAssets = [
    { as: 'image', href: 'gallery/pages/letter.png' },
    { as: 'image', href: 'gallery/pages/wall.png' },
    { as: 'image', href: 'gallery/pages/back.png' },
    { as: 'image', href: 'gallery/controls/ppage.png' },
    { as: 'image', href: 'gallery/controls/npage.png' },
    { as: 'image', href: 'gallery/controls/volon.png' },
    { as: 'image', href: 'gallery/controls/voloff.png' },
    { as: 'image', href: 'gallery/controls/showmessageicon.png' },
    { as: 'audio', href: 'gallery/sounds/music.mp3', type: 'audio/mpeg' },
    ...flipPool.map((href) => ({ as: 'audio', href, type: 'audio/mpeg' })),
  ];

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
  function setHiddenState(el, hidden){ if (el) el.setAttribute('aria-hidden', hidden ? 'true' : 'false'); }
  function setExpandedState(el, expanded){ if (el) el.setAttribute('aria-expanded', expanded ? 'true' : 'false'); }

  function bindPress(el, handler){
    if (!el) return;
    el.addEventListener('click', handler);
    if (el instanceof HTMLButtonElement) return;
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      handler(e);
    });
  }

  function warmDeferredAssets(){
    if (deferredWarmStarted) return;
    deferredWarmStarted = true;
    const warm = () => {
      deferredAssets.forEach((asset) => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = asset.as;
        link.href = asset.href;
        if (asset.type) link.type = asset.type;
        document.head.appendChild(link);
      });
    };
    if (typeof window.requestIdleCallback === 'function'){
      window.requestIdleCallback(warm, { timeout: prefersReducedMotion ? 120 : 900 });
      return;
    }
    setTimeout(warm, prefersReducedMotion ? 60 : 180);
  }

  function slideImageEl(slide){ return slide ? slide.querySelector('img') : null; }
  function markSlideAssetFailed(slide, img){
    if (!slide || slide.classList.contains('asset-failed')) return;
    slide.classList.add('asset-failed');
    slide.dataset.fallbackLabel = img?.getAttribute('alt') || 'Page image unavailable';
  }

  function installImageFallbacks(){
    slides.forEach((slide) => {
      const img = slideImageEl(slide);
      if (!img) return;
      const handleError = () => markSlideAssetFailed(slide, img);
      img.addEventListener('error', handleError, { once: true });
      if (img.complete && img.naturalWidth === 0) handleError();
    });
    [cLeft, cRight].forEach((img) => {
      if (!img) return;
      const handleError = () => {
        img.style.display = 'none';
        overlay.classList.add('curtain-fallback');
      };
      img.addEventListener('error', handleError, { once: true });
      if (img.complete && img.naturalWidth === 0) handleError();
    });
  }

  function waitForImageReady(img){
    if (!img) return Promise.resolve(false);
    if (img.complete){
      if (img.naturalWidth === 0) return Promise.resolve(false);
      if (typeof img.decode === 'function') return img.decode().then(() => true).catch(() => true);
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      img.addEventListener('load', () => resolve(true), { once: true });
      img.addEventListener('error', () => resolve(false), { once: true });
    });
  }

  function waitForCriticalAssets(){
    const criticalImages = [cLeft, cRight, slideImageEl(slides[0])].filter(Boolean);
    const assetWait = Promise.allSettled(criticalImages.map(waitForImageReady));
    const timeoutWait = new Promise((resolve) => setTimeout(resolve, prefersReducedMotion ? 120 : 1600));
    return Promise.race([assetWait, timeoutWait]);
  }

  function revealStage(){
    if (stageReady) return;
    stageReady = true;
    setHiddenState(slideshowEl, false);
    setHiddenState(volumeControl, false);
    document.body.classList.add('stage-ready');
    setActiveIndex(0, { playSound: false });
  }

  function startCurtainIntro(){
    if (introStarted) return;
    introStarted = true;
    warmDeferredAssets();
    function onIntroEnd(e){
      if (e.animationName !== 'curtainIntroFadeIn') return;
      overlay.removeEventListener('animationend', onIntroEnd);
      revealStage();
    }
    overlay.addEventListener('animationend', onIntroEnd);
    setTimeout(revealStage, curtainIntroRevealMs);
    requestAnimationFrame(() => overlay.classList.add('is-visible'));
  }

  function updateProgress(){ progress.textContent = `Page ${idx + 1} of ${TOTAL}`; }
  function isWallPage(){ return idx === 2; }
  function setDisabled(btn, disabled){
    btn.disabled = !!disabled;
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  }
  function syncButtons(){
    const locked = !started || introControlsLocked || wallRevealLocked || pageFlipLocked;
    setDisabled(prevBtn, locked || idx === 0);
    setDisabled(nextBtn, locked || idx === TOTAL - 1);
  }

  function clearWallRevealTimers(){
    if (wallRevealTimer !== null){ clearTimeout(wallRevealTimer); wallRevealTimer = null; }
    if (wallRevealUnlockTimer !== null){ clearTimeout(wallRevealUnlockTimer); wallRevealUnlockTimer = null; }
  }
  function setWallOpen(open){
    wall.classList.toggle('is-open', open);
    setHiddenState(wall, !open);
    openText.classList.toggle('is-visible', !open);
    setHiddenState(openText, open);
    closeText.classList.toggle('is-visible', open);
    setHiddenState(closeText, !open);
    setExpandedState(openText, open);
  }
  function hideWallDuringRevealDelay(){
    wall.classList.remove('is-open');
    openText.classList.remove('is-visible');
    closeText.classList.remove('is-visible');
    setHiddenState(wall, true);
    setHiddenState(openText, true);
    setHiddenState(closeText, true);
    setExpandedState(openText, false);
  }
  function unlockWallReveal(){
    wallRevealLocked = false;
    syncButtons();
  }
  function beginWallRevealSequence(){
    clearWallRevealTimers();
    wallRevealLocked = true;
    syncButtons();
    hideWallDuringRevealDelay();
    wallRevealTimer = setTimeout(() => {
      wallRevealTimer = null;
      if (!isWallPage() || wallClosedByUser){ unlockWallReveal(); return; }
      setWallOpen(true);
      wallRevealUnlockTimer = setTimeout(() => {
        wallRevealUnlockTimer = null;
        unlockWallReveal();
      }, wallRevealFadeMs + 120);
    }, wallRevealDelayMs);
  }
  function syncWallUI(){
    if (!isWallPage()){
      clearWallRevealTimers();
      wallRevealLocked = false;
      wall.classList.remove('is-open');
      openText.classList.remove('is-visible');
      closeText.classList.remove('is-visible');
      setHiddenState(wall, true);
      setHiddenState(openText, true);
      setHiddenState(closeText, true);
      setExpandedState(openText, false);
      syncButtons();
      return;
    }
    if (wallClosedByUser){
      clearWallRevealTimers();
      wallRevealLocked = false;
      setWallOpen(false);
      syncButtons();
      return;
    }
    beginWallRevealSequence();
  }

  function playOneShot(src, volume01){
    try{
      const a = new Audio(src);
      a.preload = 'auto';
      a.volume = clamp(volume01, 0, 1);
      a.play().catch(()=>{});
    }catch(_){ }
  }
  function playFlip(){
    const pick = flipPool[Math.floor(Math.random() * flipPool.length)];
    const vol = music ? clamp(music.volume, 0, 1) : 0.5;
    playOneShot(pick, vol);
  }

  function pageImageRect(slide){
    const img = slideImageEl(slide);
    if (!img || !slideshowEl || !turnEl) return null;
    const imgRect = img.getBoundingClientRect();
    const stageRect = slideshowEl.getBoundingClientRect();
    if (imgRect.width < 2 || imgRect.height < 2) return null;
    return {
      left: imgRect.left - stageRect.left,
      top: imgRect.top - stageRect.top,
      width: imgRect.width,
      height: imgRect.height,
    };
  }

  function resetPageTurnLayer(){
    if (pageFlipTimer !== null){ clearTimeout(pageFlipTimer); pageFlipTimer = null; }
    if (turnEl){
      turnEl.classList.remove('is-active', 'turn-forward', 'turn-back');
      turnEl.style.left = '0px';
      turnEl.style.top = '0px';
      turnEl.style.width = '0px';
      turnEl.style.height = '0px';
    }
    if (turnShadow){
      turnShadow.classList.remove('is-active', 'turn-forward', 'turn-back');
      turnShadow.style.left = '0px';
      turnShadow.style.top = '0px';
      turnShadow.style.width = '0px';
      turnShadow.style.height = '0px';
    }
    if (turnFrontImg){
      turnFrontImg.removeAttribute('src');
    }
  }

  function sizePageTurnLayer(rect){
    if (!rect || !turnEl || !turnShadow) return;
    const css = {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    };
    Object.assign(turnEl.style, css);
    Object.assign(turnShadow.style, css);
  }

  function finishPageTurn(target){
    resetPageTurnLayer();
    idx = target;
    slides.forEach((s, i) => s.classList.toggle('active', i === idx));
    pageFlipLocked = false;
    updateProgress();
    syncButtons();
    syncWallUI();
  }

  function startPageTurn(oldSlide, newSlide, target){
    const oldImg = slideImageEl(oldSlide);
    const rect = pageImageRect(oldSlide);
    if (!oldImg || !rect || !turnEl || !sheetFront || !turnFrontImg || !turnShadow) return false;

    const forward = target > idx;
    const directionClass = forward ? 'turn-forward' : 'turn-back';
    const src = oldImg.currentSrc || oldImg.src;
    if (!src) return false;

    pageFlipLocked = true;
    syncButtons();

    turnFrontImg.src = src;
    sizePageTurnLayer(rect);

    idx = target;
    slides.forEach((s, i) => s.classList.toggle('active', i === idx));
    if (idx === 2) wallClosedByUser = false;

    turnEl.classList.remove('turn-forward', 'turn-back', 'is-active');
    turnShadow.classList.remove('turn-forward', 'turn-back', 'is-active');
    void turnEl.offsetWidth;
    turnEl.classList.add('is-active', directionClass);
    turnShadow.classList.add('is-active', directionClass);

    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      finishPageTurn(target);
    };

    sheetFront.addEventListener('animationend', cleanup, { once: true });
    pageFlipTimer = setTimeout(cleanup, pageFlipMs + 180);
    return true;
  }

  function setActiveIndex(newIdx, opts = {}){
    const target = clamp(newIdx, 0, TOTAL - 1);
    if (target === idx && opts.force !== true){
      updateProgress();
      syncButtons();
      syncWallUI();
      return;
    }

    resetPageTurnLayer();
    clearWallRevealTimers();
    wallRevealLocked = false;

    const oldIdx = idx;
    const oldSlide = slides[oldIdx];
    const newSlide = slides[target];
    const shouldAnimate = opts.animate !== false
      && stageReady
      && started
      && !introControlsLocked
      && !prefersReducedMotion
      && oldSlide
      && newSlide
      && oldSlide !== newSlide;

    if (oldIdx === 2 && target !== 2){
      setWallOpen(false);
      wallClosedByUser = false;
    }

    if (opts.playSound !== false) playFlip();

    if (shouldAnimate && startPageTurn(oldSlide, newSlide, target)){
      return;
    }

    idx = target;
    if (idx === 2) wallClosedByUser = false;
    pageFlipLocked = false;
    slides.forEach((s, i) => s.classList.toggle('active', i === idx));
    updateProgress();
    syncButtons();
    syncWallUI();
  }
  function go(delta){
    if (!started || introControlsLocked || wallRevealLocked || pageFlipLocked) return;
    setActiveIndex(idx + delta);
  }

  function ensureSlider(){
    if (slider) return slider;
    slider = document.createElement('input');
    slider.type = 'range';
    slider.id = 'volume-slider';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round(loadVolume0to100()));
    slider.title = 'Volume';
    slider.setAttribute('aria-label', 'Volume level');
    setHiddenState(slider, true);
    volumeControl.appendChild(slider);
    slider.addEventListener('input', () => setVolume0to100(clamp(parseInt(slider.value || '0', 10), 0, 100)));
    return slider;
  }
  function loadVolume0to100(){
    const v0 = (typeof INITIAL_VOLUME === 'number') ? INITIAL_VOLUME : 50;
    return clamp(Math.round(v0), 0, 100);
  }
  function setVolume0to100(v){
    const vv = clamp(Math.round(v), 0, 100);
    const vol01 = vv / 100;
    const muted = vv === 0;
    if (music){
      music.volume = vol01;
      music.muted = muted;
    }
    volIconImg.src = muted ? 'gallery/controls/voloff.png' : 'gallery/controls/volon.png';
    volIcon.setAttribute('aria-label', muted ? 'Volume muted. Toggle volume slider' : 'Toggle volume slider');
    if (slider) slider.value = String(vv);
  }
  function setSliderOpen(open){
    const shouldOpen = !!open;
    volumeControl.classList.toggle('slider-open', shouldOpen);
    setExpandedState(volIcon, shouldOpen);
    if (slider) setHiddenState(slider, !shouldOpen);
  }

  function glissDurationMs(audioEl){
    const d = audioEl && Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
    if (d > 0.25) return Math.round(d * 1000);
    return curtainFallbackOpenMs;
  }
  function runCurtainMotion(durationMs, onDone){
    const openMs = prefersReducedMotion ? 140 : Math.max(500, Math.round(durationMs || curtainFallbackOpenMs));
    overlay.style.opacity = '1';
    overlay.style.animation = 'none';
    overlay.style.background = 'transparent';
    cLeft.style.opacity = '1';
    cRight.style.opacity = '1';
    cLeft.style.transform = 'translateX(0)';
    cRight.style.transform = 'translateX(0)';
    cLeft.style.animation = 'none';
    cRight.style.animation = 'none';
    void cLeft.offsetWidth;
    cLeft.style.animation = `curtainLeftOut ${openMs}ms cubic-bezier(.2,.9,.1,1) forwards`;
    cRight.style.animation = `curtainRightOut ${openMs}ms cubic-bezier(.2,.9,.1,1) forwards`;
    setTimeout(() => {
      overlay.style.pointerEvents = 'none';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.remove();
      if (typeof onDone === 'function') onDone();
    }, openMs + curtainCleanupPadMs);
    return openMs;
  }
  function openCurtain(){
    if (started) return;
    started = true;
    introControlsLocked = true;
    syncButtons();
    revealStage();
    setActiveIndex(0, { playSound: false, animate: false, force: true });

    beginBtn.disabled = true;
    beginBtn.textContent = 'Welcome';
    beginBtn.classList.add('has-begun');
    beginBtn.setAttribute('aria-disabled', 'true');

    let musicStarted = false;
    let glissDone = false;
    let curtainDone = false;
    let introMotionStarted = false;
    let safetyTimer = null;

    function tryUnlockIntroControls(){
      if (!glissDone || !curtainDone) return;
      introControlsLocked = false;
      setActiveIndex(0, { playSound: false, animate: false, force: true });
      syncButtons();
    }
    function startMusicAfterGliss(){
      if (musicStarted) return;
      musicStarted = true;
      glissDone = true;
      if (safetyTimer !== null){ clearTimeout(safetyTimer); safetyTimer = null; }
      const v = loadVolume0to100();
      setVolume0to100(v);
      try{
        music.currentTime = 0;
        music.volume = 0;
        music.muted = (v === 0);
        music.play().catch(()=>{});
      }catch(_){ }
      const target = clamp(v / 100, 0, 1);
      const start = performance.now();
      function fadeStep(now){
        const t = clamp((now - start) / musicFadeMs, 0, 1);
        const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2;
        music.volume = target * e;
        if (t < 1) requestAnimationFrame(fadeStep);
      }
      requestAnimationFrame(fadeStep);
      tryUnlockIntroControls();
    }
    function beginGlissAndCurtain(g){
      if (introMotionStarted) return;
      introMotionStarted = true;
      beginBtn.classList.add('is-opening');
      const openMs = runCurtainMotion(glissDurationMs(g), () => {
        curtainDone = true;
        tryUnlockIntroControls();
      });
      try{
        g.currentTime = 0;
        g.play().catch(() => startMusicAfterGliss());
      }catch(_){ startMusicAfterGliss(); }
      safetyTimer = setTimeout(startMusicAfterGliss, openMs + glissSafetyPadMs);
    }

    setTimeout(() => {
      try{
        const g = new Audio(glissSrc);
        g.preload = 'auto';
        g.volume = 0.10;
        g.addEventListener('ended', startMusicAfterGliss, { once: true });
        g.addEventListener('error', () => { beginGlissAndCurtain(g); startMusicAfterGliss(); }, { once: true });
        g.addEventListener('loadedmetadata', () => beginGlissAndCurtain(g), { once: true });
        g.load();
        setTimeout(() => beginGlissAndCurtain(g), 250);
      }catch(_){
        beginBtn.classList.add('is-opening');
        const openMs = runCurtainMotion(curtainFallbackOpenMs, () => { curtainDone = true; tryUnlockIntroControls(); });
        setTimeout(startMusicAfterGliss, openMs);
      }
    }, beginWelcomeHoldMs);
  }

  bindPress(beginBtn, (e) => { e.preventDefault(); if (!beginBtn.disabled) openCurtain(); });
  prevBtn.addEventListener('click', () => go(-1));
  nextBtn.addEventListener('click', () => go(1));
  window.addEventListener('keydown', (e) => {
    if (!started || introControlsLocked || wallRevealLocked) return;
    if (e.key === 'ArrowLeft'){
      e.preventDefault();
      go(-1);
    } else if (e.key === 'ArrowRight'){
      e.preventDefault();
      go(1);
    } else if (e.key === 'Escape'){
      if (isWallPage() && wall.classList.contains('is-open')){
        setWallOpen(false);
        wallClosedByUser = true;
        openText.focus({preventScroll:true});
      }
    }
  });
  closeText.addEventListener('click', () => {
    if (!isWallPage()) return;
    clearWallRevealTimers();
    wallRevealLocked = false;
    setWallOpen(false);
    wallClosedByUser = true;
    syncButtons();
    openText.focus({preventScroll:true});
  });
  bindPress(openText, () => {
    if (!isWallPage()) return;
    clearWallRevealTimers();
    wallRevealLocked = false;
    setWallOpen(true);
    wallClosedByUser = false;
    syncButtons();
    closeText.focus({preventScroll:true});
  });
  bindPress(volIcon, () => {
    const s = ensureSlider();
    const shouldOpen = !volumeControl.classList.contains('slider-open');
    setSliderOpen(shouldOpen);
    if (shouldOpen) s.focus({preventScroll:true});
  });

  ensureSlider();
  setSliderOpen(false);
  setVolume0to100(loadVolume0to100());
  setHiddenState(wall, true);
  setHiddenState(openText, true);
  setHiddenState(closeText, true);
  setExpandedState(openText, false);
  installImageFallbacks();
  waitForCriticalAssets().finally(startCurtainIntro);
});
