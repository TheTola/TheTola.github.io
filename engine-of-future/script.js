
document.addEventListener('DOMContentLoaded', () => {
  // ─────────────────────────────────────────────────────────────
  // Elements
  // ─────────────────────────────────────────────────────────────
  const overlay   = document.getElementById('curtain-overlay');
  const cLeft     = document.getElementById('curtain-left');
  const cRight    = document.getElementById('curtain-right');
  const beginBtn  = document.getElementById('begin-button');

  const slides    = Array.from(document.querySelectorAll('.slide'));
  const prevBtn   = document.getElementById('prev');
  const nextBtn   = document.getElementById('next');
  const progress  = document.getElementById('progress');

  const turn       = document.getElementById('turn');
  const turnShadow = document.getElementById('turnShadow');
  const sheetFront = document.getElementById('sheetFront');
  const sheetBack  = document.getElementById('sheetBack');
  const imgFront   = document.getElementById('turnFrontImg');
  const imgBack    = document.getElementById('turnBackImg');

  const wall       = document.getElementById('textWall');
  const closeText  = document.getElementById('close-text');
  const openText   = document.getElementById('open-text');

  const slideshowEl = document.getElementById('slideshow');
  const volumeControl = document.getElementById('volume-control');
  const volIcon   = document.getElementById('volume-icon');
  const volIconImg = document.getElementById('volume-icon-img');
  const music     = document.getElementById('bg-music');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const curtainIntroRevealMs = prefersReducedMotion ? 80 : 520;
  // Curtain opening is synced to the actual glissando duration when metadata is available.
  // Fallback is only used if the browser cannot read glissando metadata quickly.
  const curtainFallbackOpenMs = prefersReducedMotion ? 140 : 2600;
  const curtainCleanupPadMs = prefersReducedMotion ? 20 : 0;
  const glissSafetyPadMs = prefersReducedMotion ? 120 : 450;
  const flipDurationBaseMs = prefersReducedMotion ? 0 : 430;
  const flipDurationJitterMs = prefersReducedMotion ? 0 : 36;
  const flipDurationMinMs = prefersReducedMotion ? 0 : 395;
  const flipDurationMaxMs = prefersReducedMotion ? 0 : 478;
  const flipBehindAngleDeg = 104;
  const musicFadeMs = prefersReducedMotion ? 120 : 900;

  // ─────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────
  const TOTAL = slides.length; // 4
  let started = false;
  let introControlsLocked = false;

  let idx = 0;
  let flipping = false;

  // wall overlay behavior (index 2)
  let wallClosedByUser = false;

  // Volume (NO persistence allowed)
  let slider = null;

  // Audio pool
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
  let stageReady = false;
  let introStarted = false;
  let deferredWarmStarted = false;
  let currentTurnDeg = 0;
  let currentTurnProgress = 0;
  let currentTurnGoingNext = true;

  function setHiddenState(el, hidden){
    if (!el) return;
    el.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  }

  function setExpandedState(el, expanded){
    if (!el) return;
    el.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  function bindPress(el, handler){
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
      if (img.complete && img.naturalWidth === 0){
        handleError();
      }
    });

    [cLeft, cRight].forEach((img) => {
      const handleError = () => {
        img.style.display = 'none';
        overlay.classList.add('curtain-fallback');
      };
      img.addEventListener('error', handleError, { once: true });
      if (img.complete && img.naturalWidth === 0){
        handleError();
      }
    });
  }

  function waitForImageReady(img){
    if (!img) return Promise.resolve(false);

    if (img.complete){
      if (img.naturalWidth === 0) return Promise.resolve(false);
      if (typeof img.decode === 'function'){
        return img.decode().then(() => true).catch(() => true);
      }
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const handleLoad = () => {
        if (typeof img.decode === 'function'){
          img.decode().then(() => resolve(true)).catch(() => resolve(true));
          return;
        }
        resolve(true);
      };

      img.addEventListener('load', handleLoad, { once: true });
      img.addEventListener('error', () => resolve(false), { once: true });
    });
  }

  function waitForCriticalAssets(){
    const criticalImages = [cLeft, cRight, slideImageEl(slides[0])].filter(Boolean);
    const assetWait = Promise.allSettled(criticalImages.map(waitForImageReady));
    const timeoutWait = new Promise((resolve) => {
      setTimeout(resolve, prefersReducedMotion ? 120 : 1600);
    });
    return Promise.race([assetWait, timeoutWait]);
  }

  function revealStage(){
    if (stageReady) return;
    stageReady = true;
    setHiddenState(slideshowEl, false);
    setHiddenState(volumeControl, false);
    document.body.classList.add('stage-ready');
    setActiveIndex(0);
    syncButtons();
    syncWallUI();
    setTurnVisible(false);
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

    requestAnimationFrame(() => {
      overlay.classList.add('is-visible');
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────
  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function setDisabled(btn, disabled){
    btn.disabled = !!disabled;
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  }

  function updateProgress(){
    progress.textContent = `Page ${idx + 1} of ${TOTAL}`;
  }

  function activeSlide(){
    return slides[idx];
  }

  function slideImageEl(slide){
    return slide ? slide.querySelector('img') : null;
  }

  function slideImageSrc(slide){
    const im = slideImageEl(slide);
    return im ? im.getAttribute('src') : '';
  }

  function setActiveIndex(newIdx){
    idx = clamp(newIdx, 0, TOTAL - 1);
    slides.forEach((s, i) => {
      s.classList.toggle('active', i === idx);
      s.classList.remove('peek');
      s.classList.remove('ghost');
    });
    updateProgress();
    syncButtons();
    syncWallUI();
  }

  function syncButtons(){
    const atFirst = (idx === 0);
    const atLast  = (idx === TOTAL - 1);
    const locked = !started || introControlsLocked || flipping;
    setDisabled(prevBtn, locked || atFirst);
    setDisabled(nextBtn, locked || atLast);
  }

  function isWallPage(){ return idx === 2; }

  function setWallOpen(open){
    wall.classList.toggle('is-open', open);
    setHiddenState(wall, !open);
    openText.classList.toggle('is-visible', !open);
    setHiddenState(openText, open);
    closeText.classList.toggle('is-visible', open);
    setHiddenState(closeText, !open);
    setExpandedState(openText, open);
  }

  function syncWallUI(){
    const onWall = isWallPage();

    if (!onWall){
      wall.classList.remove('is-open');
      openText.classList.remove('is-visible');
      closeText.classList.remove('is-visible');
      setHiddenState(wall, true);
      setHiddenState(openText, true);
      setHiddenState(closeText, true);
      setExpandedState(openText, false);
      return;
    }

    if (!wallClosedByUser){
      setWallOpen(true);
    } else {
      setWallOpen(false);
    }
  }

  function setSliderOpen(open){
    const shouldOpen = !!open;
    volumeControl.classList.toggle('slider-open', shouldOpen);
    setExpandedState(volIcon, shouldOpen);
    if (slider){
      setHiddenState(slider, !shouldOpen);
    }
  }

  function playOneShot(src, volume01){
    try{
      const a = new Audio(src);
      a.preload = 'auto';
      a.volume = clamp(volume01, 0, 1);
      a.play().catch(()=>{});
    }catch(_){}
  }

  function playFlip(){
    const pick = flipPool[Math.floor(Math.random() * flipPool.length)];
    const vol = clamp(music.volume, 0, 1);
    playOneShot(pick, vol);
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
    document.getElementById('volume-control').appendChild(slider);

    slider.addEventListener('input', () => {
      const v = clamp(parseInt(slider.value || '0', 10), 0, 100);
      setVolume0to100(v);
    });

    return slider;
  }

  // IMPORTANT: NO persistence. Always comes from injected INITIAL_VOLUME.
  function loadVolume0to100(){
    const v0 = (typeof INITIAL_VOLUME === 'number') ? INITIAL_VOLUME : 50;
    return clamp(Math.round(v0), 0, 100);
  }

  // IMPORTANT: NO persistence. Session-only changes.
  function setVolume0to100(v){
    const vv = clamp(Math.round(v), 0, 100);
    const vol01 = vv / 100;
    const muted = vv === 0;

    music.volume = vol01;
    music.muted = muted;

    volIconImg.src = muted ? 'gallery/controls/voloff.png' : 'gallery/controls/volon.png';
    volIcon.setAttribute('aria-label', muted ? 'Volume muted. Toggle volume slider' : 'Toggle volume slider');
    if (slider) slider.value = String(vv);
  }

  function rectForActiveImage(){
    const s = activeSlide();
    const im = slideImageEl(s);
    if (!im) return null;
    const r = im.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) return null;
    return r;
  }

  function placeTurnToRect(r){
    turn.style.left = `${r.left}px`;
    turn.style.top = `${r.top}px`;
    turn.style.width = `${r.width}px`;
    turn.style.height = `${r.height}px`;

    turnShadow.style.left = `${r.left}px`;
    turnShadow.style.top = `${r.top}px`;
    turnShadow.style.width = `${r.width}px`;
    turnShadow.style.height = `${r.height}px`;
  }

  function easeInOutCubic(t){
    return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2;
  }

  function easePageTurn(t){
    const u = clamp(t, 0, 1);
    return u < 0.5
      ? 2 * Math.pow(u, 2.12)
      : 1 - Math.pow(-2 * u + 2, 2.28) / 2;
  }

  function nextFlipDurationMs(){
    if (prefersReducedMotion) return 0;
    const jitter = (Math.random() * 2 - 1) * flipDurationJitterMs;
    return clamp(
      Math.round(flipDurationBaseMs + jitter),
      flipDurationMinMs,
      flipDurationMaxMs
    );
  }

  function setTurnVisible(on){
    turn.style.opacity = on ? '1' : '0';
    turnShadow.style.opacity = on ? '1' : '0';
  }

  function setTurnPhase(phase){
    const behind = phase === 'behind';
    turn.classList.toggle('phase-front', !behind);
    turn.classList.toggle('phase-behind', behind);
    turnShadow.classList.toggle('phase-front', !behind);
    turnShadow.classList.toggle('phase-behind', behind);
  }

  function resetTurnState(){
    setTurnPhase('front');
    setTurnVisible(false);
    turn.style.width = '0px';
    turn.style.height = '0px';
    turnShadow.style.width = '0px';
    turnShadow.style.height = '0px';
    turn.style.transform = 'rotateY(0deg)';
    turnShadow.style.setProperty('--sx', '18%');
    turnShadow.style.setProperty('--sd', '0.14');
    turnShadow.style.setProperty('--sb', '10px');
    currentTurnDeg = 0;
    currentTurnProgress = 0;
    imgFront.src = '';
    imgBack.src = '';
    sheetBack.classList.add('hidden');
    sheetBack.classList.remove('visible');
    sheetFront.classList.remove('hidden');
    sheetFront.classList.add('visible');
    sheetFront.style.setProperty('--edgeA', '0');
    sheetFront.style.setProperty('--glintA', '0');
  }

  function setTurnRotationDeg(deg, rawProgress, goingNext){
    currentTurnDeg = deg;
    currentTurnProgress = rawProgress;
    currentTurnGoingNext = goingNext;

    const turnProgress = clamp(rawProgress, 0, 1);
    const curl = Math.sin(turnProgress * Math.PI);
    turn.style.transformOrigin = '0% 50%';
    turn.style.transform = `rotateY(${deg}deg)`;

    const edge = Math.pow(curl, 1.0);
    const glint = Math.pow(curl, 1.55);

    sheetFront.style.setProperty('--edgeA', String(0.26 * edge));
    sheetFront.style.setProperty('--glintA', String(0.15 * glint));

    const behindNextPage = goingNext && Math.abs(deg) >= flipBehindAngleDeg;
    setTurnPhase(behindNextPage ? 'behind' : 'front');

    const sx = goingNext
      ? 18 + (34 * turnProgress)
      : 52 - (34 * turnProgress);
    const sd = 0.10 + 0.24 * Math.pow(curl, 1.08);
    const sb = 10 + 12 * curl;
    turnShadow.style.setProperty('--sx', `${sx}%`);
    turnShadow.style.setProperty('--sd', `${sd}`);
    turnShadow.style.setProperty('--sb', `${sb}px`);
  }

  function cleanupTransient(curSlide, tgtSlide){
    if (curSlide) curSlide.classList.remove('ghost');
    if (tgtSlide) tgtSlide.classList.remove('peek');
  }

  function flipTo(targetIdx){
    if (!started) return;
    if (introControlsLocked) return;
    if (flipping) return;

    const tIdx = clamp(targetIdx, 0, TOTAL - 1);
    if (tIdx === idx) return;

    const r = rectForActiveImage();
    if (!r){
      setActiveIndex(tIdx);
      return;
    }

    flipping = true;
    syncButtons();

    const goingNext = (tIdx > idx);

    const curSlide = slides[idx];
    const tgtSlide = slides[tIdx];

    const curSrc = slideImageSrc(curSlide);
    const tgtSrc = slideImageSrc(tgtSlide);

    placeTurnToRect(r);
    sheetBack.classList.remove('hidden');
    sheetBack.classList.add('visible');
    sheetFront.classList.remove('hidden');
    sheetFront.classList.add('visible');

    if (goingNext){
      tgtSlide.classList.add('peek');
      curSlide.classList.add('ghost');
      imgFront.src = curSrc;
      imgBack.src = curSrc;
      setTurnVisible(true);
      setTurnRotationDeg(0, 0, true);
    } else {
      imgFront.src = tgtSrc;
      imgBack.src = tgtSrc;
      setTurnVisible(true);
      setTurnRotationDeg(-180, 0, false);
    }

    playFlip();

    const DURATION = nextFlipDurationMs();
    if (DURATION <= 0){
      cleanupTransient(curSlide, tgtSlide);
      setActiveIndex(tIdx);
      resetTurnState();
      flipping = false;
      syncButtons();
      return;
    }

    const t0 = performance.now();

    function step(now){
      const elapsed = now - t0;
      const raw = clamp(elapsed / DURATION, 0, 1);
      const e = easePageTurn(raw);

      const deg = goingNext
        ? (0 + (-180 - 0) * e)
        : (-180 + (0 - (-180)) * e);

      setTurnRotationDeg(deg, raw, goingNext);

      if (raw < 1){
        requestAnimationFrame(step);
        return;
      }

      cleanupTransient(curSlide, tgtSlide);
      setActiveIndex(tIdx);
      requestAnimationFrame(() => {
        resetTurnState();
      });

      flipping = false;
      syncButtons();
    }

    requestAnimationFrame(step);
  }

  window.addEventListener('resize', () => {
    if (!flipping) return;
    const r = rectForActiveImage();
    if (r){
      placeTurnToRect(r);
      setTurnRotationDeg(currentTurnDeg, currentTurnProgress, currentTurnGoingNext);
    }
  });

  function glissDurationMs(audioEl){
    const d = audioEl && Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
    if (d > 0.25) return Math.round(d * 1000);
    return curtainFallbackOpenMs;
  }

  function runCurtainMotion(durationMs, onDone){
    const openMs = prefersReducedMotion ? 140 : Math.max(500, Math.round(durationMs || curtainFallbackOpenMs));

    // Curtains move first. The overlay itself does NOT fade during this motion.
    // If the parent fades at the same time, the slide motion becomes invisible.
    overlay.style.opacity = '1';
    overlay.style.animation = 'none';
    overlay.style.background = 'transparent';

    // The curtain images start with opacity: 0 in CSS and are made visible by
    // the intro fade animation. Setting a new animation can drop them back to 0,
    // so force them visible before sliding.
    cLeft.style.opacity = '1';
    cRight.style.opacity = '1';
    cLeft.style.transform = 'translateX(0)';
    cRight.style.transform = 'translateX(0)';

    // Reset first so the slide animation reliably starts.
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

    // Make sure the slideshow is visible BEFORE the curtain opens.
    // Without this, removing the overlay can expose a black/hidden stage.
    revealStage();

    beginBtn.disabled = true;
    beginBtn.style.opacity = '0';
    beginBtn.style.pointerEvents = 'none';

    // Controls unlock only after BOTH the curtain has opened and glissando has ended.
    let musicStarted = false;
    let glissDone = false;
    let curtainDone = false;
    let introMotionStarted = false;
    let safetyTimer = null;

    function tryUnlockIntroControls(){
      if (!glissDone || !curtainDone) return;
      introControlsLocked = false;
      syncButtons();
    }

    function startMusicAfterGliss(){
      if (musicStarted) return;
      musicStarted = true;
      glissDone = true;

      if (safetyTimer !== null){
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }

      // No intentional pause: the music starts immediately after glissando ends.
      // ALWAYS initialize from injected INITIAL_VOLUME.
      const v = loadVolume0to100();
      setVolume0to100(v);

      try{
        music.currentTime = 0;
        music.volume = 0;
        music.muted = (v === 0);
        music.play().catch(()=>{});
      }catch(_){}

      const target = clamp(v / 100, 0, 1);
      const fadeMs = musicFadeMs;
      const start = performance.now();

      function fadeStep(now){
        const t = clamp((now - start) / fadeMs, 0, 1);
        const e = easeInOutCubic(t);
        music.volume = target * e;
        if (t < 1) requestAnimationFrame(fadeStep);
      }
      requestAnimationFrame(fadeStep);

      tryUnlockIntroControls();
    }

    function beginGlissAndCurtain(g){
      if (introMotionStarted) return;
      introMotionStarted = true;

      const openMs = runCurtainMotion(glissDurationMs(g), () => {
        curtainDone = true;
        tryUnlockIntroControls();
      });

      try{
        g.currentTime = 0;
        g.play().catch(() => {
          startMusicAfterGliss();
        });
      }catch(_){
        startMusicAfterGliss();
      }

      // Safety only. Normal path is the audio ended event.
      safetyTimer = setTimeout(startMusicAfterGliss, openMs + glissSafetyPadMs);
    }

    try{
      const g = new Audio(glissSrc);
      g.preload = 'auto';
      g.volume = 0.10;

      g.addEventListener('ended', startMusicAfterGliss, { once: true });
      g.addEventListener('error', () => {
        beginGlissAndCurtain(g);
        startMusicAfterGliss();
      }, { once: true });
      g.addEventListener('loadedmetadata', () => {
        beginGlissAndCurtain(g);
      }, { once: true });

      g.load();

      // If metadata is slow or blocked, still open using fallback timing.
      setTimeout(() => beginGlissAndCurtain(g), 250);
    } catch(_){
      const openMs = runCurtainMotion(curtainFallbackOpenMs, () => {
        curtainDone = true;
        tryUnlockIntroControls();
      });
      setTimeout(startMusicAfterGliss, openMs);
    }
  }

  bindPress(beginBtn, (e) => {
    e.preventDefault();
    openCurtain();
  });

  prevBtn.addEventListener('click', () => flipTo(idx - 1));
  nextBtn.addEventListener('click', () => flipTo(idx + 1));

  window.addEventListener('keydown', (e) => {
    if (!started) return;
    if (introControlsLocked) return;
    if (flipping) return;

    if (e.key === 'ArrowLeft'){
      e.preventDefault();
      flipTo(idx - 1);
    } else if (e.key === 'ArrowRight'){
      e.preventDefault();
      flipTo(idx + 1);
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
    setWallOpen(false);
    wallClosedByUser = true;
    openText.focus({preventScroll:true});
  });

  bindPress(openText, () => {
    if (!isWallPage()) return;
    setWallOpen(true);
    wallClosedByUser = false;
    closeText.focus({preventScroll:true});
  });

  bindPress(volIcon, () => {
    const s = ensureSlider();
    const shouldOpen = !volumeControl.classList.contains('slider-open');
    setSliderOpen(shouldOpen);
    if (shouldOpen){
      s.focus({preventScroll:true});
    }
  });

  ensureSlider();
  setSliderOpen(false);

  // Initialize immediately (still session-only)
  setVolume0to100(loadVolume0to100());
  setHiddenState(wall, true);
  setHiddenState(openText, true);
  setHiddenState(closeText, true);
  setExpandedState(openText, false);

  installImageFallbacks();
  waitForCriticalAssets().finally(startCurtainIntro);
});
