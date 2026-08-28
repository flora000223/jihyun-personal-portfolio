document.addEventListener('DOMContentLoaded', () => {
  // Mobile browsers (iOS Safari especially) fire several 'resize' events back
  // to back for a single user action -- URL bar show/hide while scrolling,
  // on-screen keyboard open/close, orientation change settling. Most resize
  // handlers below read layout (getBoundingClientRect etc.) and write styles
  // immediately/synchronously, so an unthrottled burst means that same
  // expensive read/write work runs several times in a row within one frame.
  // Wrapping a handler in rafCoalesce collapses any such burst down to a
  // single call on the next animation frame -- same end result, once the
  // burst settles, just without the redundant work in between. This does not
  // touch any handler's own existing trailing setTimeout "re-settle" logic.
  const rafCoalesce = (fn) => {
    let scheduled = false;
    return (...args) => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        fn(...args);
      });
    };
  };

  // --u-fixed used to be a pure-CSS min(1vw, 19.2px), while --u (used by
  // every container-type: inline-size section, including the work-transition
  // wipe's own local grid copy) is min(1cqw, 19.2px) -- 1cqw there resolves
  // against that section's own rendered content-box width. On a real desktop
  // browser with a classic (space-reserving) scrollbar, `vw` includes the
  // scrollbar's width while a container's own width does not, so the two
  // units silently diverge by a few px -- enough to visibly offset the
  // global fixed grid's outer lines from the wipe-local grid's lines (the
  // exact center line still lines up by symmetry, which is why only the
  // outer/off-center lines looked misaligned). Measuring the same
  // clientWidth basis the containers use and driving --u-fixed from that in
  // JS keeps both grids pixel-identical regardless of scrollbar behavior.
  const syncUFixed = () => {
    const u = Math.min(document.documentElement.clientWidth / 100, 19.2);
    document.documentElement.style.setProperty('--u-fixed', `${u}px`);
  };
  syncUFixed();
  window.addEventListener('resize', rafCoalesce(syncUFixed));

  // Shared across both staff-canvas instances (hero + footer) -- a true
  // constant, so computing it once here instead of on every drawStaffRibbon
  // call (previously: every point of every line, every frame) costs nothing
  // and changes nothing about the result.
  const NINE_PI = Math.PI * 9;

  // Chatbot header wave opacity controls (0 = invisible, 1 = opaque).
  // Adjust only these five values to tune the foreground/background layers.
  const CHATBOT_WAVE_OPACITY = Object.freeze({
    front: 0.44,
    middle: 0.24,
    backTop: 0.24,
    backBottom: 0.2,
    backCenter: 0.35,
  });

  const initStaffCanvas = (staffCanvas, options = {}) => {
    if (!staffCanvas) return;
    const ctx = staffCanvas.getContext('2d');
    if (!ctx) return;
    let width = 0;
    let height = 0;
    let ribbonWidth = 0;
    let dpr = 1;
    let staffFrameId = 0;
    let staffCanvasActive = true;
    const initialAnimationOffset = options.initialAnimationOffset ?? 2000;
    // options.static freezes this canvas on a single rendered frame instead
    // of animating -- reusing the existing prefers-reduced-motion path (one
    // renderStaffCanvas call, no rAF loop) does exactly that.
    const reduceMotion = options.static === true
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const background = options.background ?? '#020204';
    const primaryAlpha = options.primaryAlpha ?? 0.68;
    const secondaryAlpha = options.secondaryAlpha ?? 0.3;

    const resizeStaffCanvas = () => {
      dpr = Math.min(window.devicePixelRatio || 1, options.dprCap ?? 1.35);
      // clientWidth/clientHeight, not the previous canvas.width/height --
      // the CSS (width/height: 100%) already drives the canvas's on-screen
      // size responsively, so measuring straight off that stays accurate on
      // every resize. Writing canvas.style.width/height as a fixed px value
      // here (as this used to do) would set an inline style that overrides
      // that CSS rule -- clientWidth would then just keep reporting back
      // whatever this function itself wrote last time, permanently pinning
      // the wave to whatever size the window happened to be on first paint.
      width = staffCanvas.clientWidth || window.innerWidth;
      height = staffCanvas.clientHeight || window.innerHeight;
      staffCanvas.width = Math.floor(width * dpr);
      staffCanvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // The outer stroke gradient only actually depends on ribbonWidth/alpha/
    // hue (all static per ribbon config across a whole animation session,
    // changing only on resize) -- yet this used to be rebuilt from scratch
    // every single call, i.e. ~45 createLinearGradient + ~225
    // addColorStop calls every frame across both ribbon calls on this
    // canvas. Caching by a key covering all three (auto-invalidated
    // whenever ribbonWidth changes, e.g. on resize) turns that into a
    // one-time cost per resize instead of a per-frame one.
    const outerGradientCache = new Map();
    const getOuterGradient = (alpha, hue) => {
      const key = `${ribbonWidth}-${alpha}-${hue}`;
      const cached = outerGradientCache.get(key);
      if (cached) return cached;
      const gradient = ctx.createLinearGradient(0, 0, ribbonWidth, 0);
      gradient.addColorStop(0, `rgba(255,255,255,${alpha * 0.12})`);
      gradient.addColorStop(0.24, `rgba(255,255,255,${alpha * 0.44})`);
      gradient.addColorStop(0.52, `rgba(${hue},${alpha * 0.78})`);
      gradient.addColorStop(0.78, `rgba(255,255,255,${alpha * 0.62})`);
      gradient.addColorStop(1, `rgba(255,255,255,${alpha * 0.1})`);
      outerGradientCache.set(key, gradient);
      return gradient;
    };

    const drawStaffRibbon = (time, config) => {
      const {
        centerY,
        amplitude,
        frequency,
        phase,
        thickness,
        count,
        spacing,
        alpha,
        hue,
        lift,
        highlight,
        phaseSpread = 0,
        amplitudeSpread = 0,
        softGlow = true,
      } = config;

      const gradient = getOuterGradient(alpha, hue);

      // frequency/phase/amplitude are the same for every line and every
      // x-step in this whole ribbon call (only offset/group/line vary),
      // so the PI multiplications and the 0.42 scale factor are safe to
      // do once here instead of redundantly inside the x-step loop below.
      const freqPi = Math.PI * frequency;
      const freqPiB = Math.PI * (frequency * 0.58);
      const amplitudeB = amplitude * 0.42;
      const curveStep = options.curveStep ?? 14;

      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      for (let line = 0; line < count; line += 1) {
        const staffIndex = line % 5;
        const group = Math.floor(line / 5);
        const offset = (staffIndex - 2) * spacing + group * spacing * 7.2;
        const glow = staffIndex === 2 ? 0.22 : 0.08;
        // Compact treatments such as the chatbot header can fan neighbouring
        // strokes out slightly. The subtle phase/amplitude differences make
        // them cross and overlap like translucent wave layers instead of
        // looking like one curve duplicated at fixed vertical offsets.
        const lineCenter = (count - 1) / 2;
        const lineDelta = line - lineCenter;
        const linePhase = phase + lineDelta * phaseSpread;
        const lineAmplitude = amplitude * (1 + lineDelta * amplitudeSpread);

        // drift only depends on time/group (both fixed for this whole
        // line), not on x -- it was being recomputed on every one of the
        // ~148 x-steps below for no reason. Same for driftA/driftB/
        // liftPhase, which just repackage it for the two wave terms.
        const drift = time * (0.00018 + group * 0.000018);
        const driftA = drift * 7;
        const driftB = drift * 4;
        const liftPhase = time * 0.0012 + line;

        ctx.beginPath();
        for (let x = -80; x <= ribbonWidth + 80; x += curveStep) {
          const nx = x / ribbonWidth;
          const waveA = Math.sin(nx * freqPi + linePhase + driftA) * lineAmplitude;
          const waveB = Math.sin(nx * freqPiB - linePhase + driftB)
            * amplitudeB * (1 - lineDelta * amplitudeSpread * 0.45);
          const y = centerY
            + offset
            + waveA
            + waveB
            + Math.sin(nx * NINE_PI + liftPhase) * lift;

          if (x === -80) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.strokeStyle = gradient;
        ctx.lineWidth = thickness + (staffIndex === 2 ? 0.22 : 0);
        ctx.shadowBlur = softGlow && staffIndex === 2 ? 10 : 0;
        ctx.shadowColor = softGlow
          ? `rgba(255,255,255,${0.18 + glow})`
          : 'rgba(255,255,255,0)';
        ctx.stroke();

        if (highlight && (staffIndex === 1 || staffIndex === 2 || staffIndex === 3)) {
          const band = (time * 0.000085 + line * 0.013 + group * 0.08) % 1;
          const light = ctx.createLinearGradient(0, 0, width, 0);
          const left = Math.max(0, band - 0.11);
          const coreLeft = Math.max(0, band - 0.026);
          const coreRight = Math.min(1, band + 0.026);
          const right = Math.min(1, band + 0.11);

          light.addColorStop(0, 'rgba(255,255,255,0)');
          light.addColorStop(left, 'rgba(255,255,255,0)');
          light.addColorStop(coreLeft, 'rgba(255,255,255,0.2)');
          light.addColorStop(band, 'rgba(255,255,255,0.92)');
          light.addColorStop(coreRight, 'rgba(255,255,255,0.22)');
          light.addColorStop(right, 'rgba(255,255,255,0)');
          light.addColorStop(1, 'rgba(255,255,255,0)');

          ctx.strokeStyle = light;
          ctx.lineWidth = thickness + 0.82;
          ctx.shadowBlur = 18;
          ctx.shadowColor = 'rgba(255,255,255,0.56)';
          ctx.stroke();
        }
      }
    };

    const requestStaffFrame = () => {
      if (!reduceMotion && staffCanvasActive && !staffFrameId) {
        staffFrameId = requestAnimationFrame(renderStaffCanvas);
      }
    };

    // This is a slow, ambient wave -- nothing about it needs 60fps
    // precision, but every requestAnimationFrame tick was doing the full
    // draw (2 ribbon calls x ~20-25 lines x ~150 points of trig each,
    // several ctx.stroke()s with shadowBlur, which is one of canvas's
    // more expensive operations). Skipping ticks that land under ~33ms
    // apart caps the actual draw rate at ~30fps -- half the work -- while
    // the wave's own position still tracks real elapsed time exactly (it
    // reads the live rAF timestamp each time it *does* draw, so this
    // doesn't slow the animation down, just samples it less often, which
    // reads as identical for motion this gentle.
    const FRAME_INTERVAL_MS = 1000 / 30;
    let lastDrawTime = 0;

    const renderStaffCanvas = (time = 0) => {
      staffFrameId = 0;
      if (time - lastDrawTime < FRAME_INTERVAL_MS) {
        requestStaffFrame();
        return;
      }
      lastDrawTime = time;
      const animationTime = time + initialAnimationOffset;
      const isMobile = width < 760;
      const mobileCropWidth = options.mobileCropWidth ?? 1180;
      ribbonWidth = isMobile && options.mobileCrop !== false
        ? Math.max(mobileCropWidth, width * 2.8)
        : width;
      const cropX = Math.max(0, (ribbonWidth - width) / 2);
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.save();
      ctx.translate(-cropX, 0);

      const amplitudeScale = options.amplitudeScale ?? 1;
      const spacingScale = options.spacingScale ?? 1;

      // Optional low-opacity copies behind the two main ribbons. Keeping each
      // echo at five lines preserves the staff motif while small differences
      // in position, frequency and phase create depth rather than a hard clone.
      (options.echoLayers || []).forEach((layer) => {
        drawStaffRibbon(animationTime, {
          centerY: height * layer.centerY,
          amplitude: height * layer.amplitude * amplitudeScale,
          frequency: layer.frequency,
          phase: layer.phase,
          thickness: layer.thickness ?? 0.62,
          count: 5,
          spacing: Math.max(6, height * 0.009) * spacingScale,
          alpha: layer.alpha,
          hue: layer.hue ?? '205,211,224',
          lift: 0,
          highlight: false,
          phaseSpread: layer.phaseSpread ?? 0,
          amplitudeSpread: layer.amplitudeSpread ?? 0,
          softGlow: layer.softGlow ?? true,
        });
      });

      drawStaffRibbon(animationTime, {
        centerY: height * (options.primaryCenterY ?? 0.42),
        amplitude: height * (isMobile ? 0.075 : 0.092) * amplitudeScale,
        frequency: options.primaryFrequency ?? 3.12,
        phase: options.primaryPhase ?? 1.4,
        thickness: options.primaryThickness ?? 0.9,
        count: options.primaryCount ?? (isMobile ? 18 : 25),
        spacing: Math.max(7, height * 0.011) * spacingScale,
        alpha: primaryAlpha,
        hue: '238,240,246',
        lift: options.primaryLift ?? 2.1,
        highlight: options.primaryHighlight ?? true,
        phaseSpread: options.primaryPhaseSpread ?? 0,
        amplitudeSpread: options.primaryAmplitudeSpread ?? 0,
        softGlow: options.primarySoftGlow ?? true,
      });

      drawStaffRibbon(animationTime, {
        centerY: height * (options.secondaryCenterY ?? 0.63),
        amplitude: height * (isMobile ? 0.052 : 0.064) * amplitudeScale,
        frequency: options.secondaryFrequency ?? 2.5,
        phase: options.secondaryPhase ?? -0.95,
        thickness: options.secondaryThickness ?? 0.72,
        count: options.secondaryCount ?? (isMobile ? 14 : 20),
        spacing: Math.max(6, height * 0.009) * spacingScale,
        alpha: secondaryAlpha,
        hue: '205,211,224',
        lift: options.secondaryLift ?? 1.7,
        highlight: false,
        phaseSpread: options.secondaryPhaseSpread ?? 0,
        amplitudeSpread: options.secondaryAmplitudeSpread ?? 0,
        softGlow: options.secondarySoftGlow ?? true,
      });

      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      requestStaffFrame();
    };

    // Resizing the canvas element clears its pixels, so a frozen (reduceMotion
    // or static) frame must be explicitly redrawn after every resize. rafCoalesce
    // defers the redraw to a requestAnimationFrame tick, but a frozen canvas has
    // no ongoing rAF loop pumping frames -- nothing guarantees that tick actually
    // gets serviced, which can leave the canvas cleared and never repainted. Only
    // the still-animating path (which does have a live rAF loop) uses rafCoalesce;
    // the frozen path redraws synchronously instead.
    const refreshStaffCanvas = reduceMotion
      ? () => {
        resizeStaffCanvas();
        // renderStaffCanvas's frame-throttle compares against lastDrawTime --
        // calling it again with the same fixed initialAnimationOffset "time"
        // (as the initial frozen render below already did) reads as 0ms
        // elapsed and gets skipped, leaving the just-cleared canvas blank.
        // Resetting lastDrawTime first forces this redraw through.
        lastDrawTime = -Infinity;
        renderStaffCanvas(initialAnimationOffset);
      }
      : () => {
        resizeStaffCanvas();
        // Same stale-canvas problem as the reduceMotion branch above, but
        // for the animating path: resizeStaffCanvas() clears the canvas
        // immediately, while the actual redraw only happens on the next
        // *throttled* (~30fps) tick of the ongoing rAF loop -- and not at
        // all if the canvas is currently scrolled out of view (the
        // IntersectionObserver below pauses that loop entirely). Cancelling
        // any pending frame and forcing a draw right here closes that gap
        // so the wave always matches the new size immediately, whether or
        // not the loop happens to be running.
        if (staffFrameId) {
          cancelAnimationFrame(staffFrameId);
          staffFrameId = 0;
        }
        lastDrawTime = -Infinity;
        renderStaffCanvas(window.performance.now());
      };

    resizeStaffCanvas();
    window.addEventListener('resize', reduceMotion ? refreshStaffCanvas : rafCoalesce(refreshStaffCanvas));
    const staffObserver = new IntersectionObserver((entries) => {
      staffCanvasActive = entries.some((entry) => entry.isIntersecting);
      if (staffCanvasActive) requestStaffFrame();
    }, { rootMargin: '120px 0px' });
    staffObserver.observe(staffCanvas);
    requestStaffFrame();
    if (reduceMotion) renderStaffCanvas(initialAnimationOffset);

    // Lets a canvas that starts out at zero size (e.g. inside a
    // `display: none`-hidden panel, like the chatbot header) be redrawn
    // on demand once it actually becomes visible and has real dimensions,
    // without waiting for an unrelated window resize.
    return { refresh: refreshStaffCanvas };
  };

  initStaffCanvas(document.getElementById('staffCanvas'), {
    background: '#000000',
  });
  initStaffCanvas(document.getElementById('footerStaffCanvas'), {
    initialAnimationOffset: 6200,
    primaryCenterY: 0.48,
    secondaryCenterY: 0.68,
    primaryAlpha: 0.42,
    secondaryAlpha: 0.2,
    static: true,
  });
  // Two translucent five-line staves for the compact chatbot header. Lines
  // within each staff stay almost parallel so the musical structure remains
  // legible; only the two complete staves drift slightly against one another.
  const chatbotHeaderStaffCanvas = initStaffCanvas(document.getElementById('portfolioChatbotHeaderCanvas'), {
    initialAnimationOffset: 3400,
    background: 'transparent',
    primaryCenterY: 0.53,
    secondaryCenterY: 0.57,
    primaryCount: 5,
    secondaryCount: 5,
    amplitudeScale: 1.28,
    spacingScale: 0.52,
    primaryFrequency: 4.25,
    secondaryFrequency: 3.92,
    primaryPhase: 0.18,
    secondaryPhase: -0.02,
    primaryPhaseSpread: 0.008,
    secondaryPhaseSpread: -0.006,
    primaryAmplitudeSpread: 0.004,
    secondaryAmplitudeSpread: -0.003,
    primaryLift: 0,
    secondaryLift: 0,
    primaryThickness: 0.72,
    secondaryThickness: 0.56,
    primaryHighlight: true,
    primarySoftGlow: true,
    secondarySoftGlow: true,
    primaryAlpha: CHATBOT_WAVE_OPACITY.front,
    secondaryAlpha: CHATBOT_WAVE_OPACITY.middle,
    dprCap: 3,
    curveStep: 2,
    echoLayers: [
      {
        centerY: 0.43,
        amplitude: 0.07,
        frequency: 4.9,
        phase: 0.72,
        alpha: CHATBOT_WAVE_OPACITY.backTop,
        phaseSpread: 0.004,
        thickness: 0.48,
        softGlow: true,
      },
      {
        centerY: 0.66,
        amplitude: 0.058,
        frequency: 3.28,
        phase: -0.82,
        alpha: CHATBOT_WAVE_OPACITY.backBottom,
        phaseSpread: -0.004,
        thickness: 0.48,
        softGlow: true,
      },
      {
        centerY: 0.55,
        amplitude: 0.075,
        frequency: 4.55,
        phase: 1.18,
        alpha: CHATBOT_WAVE_OPACITY.backCenter,
        phaseSpread: 0.003,
        thickness: 0.44,
        softGlow: true,
      },
    ],
    mobileCrop: false,
    static: true,
  });

  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mobileNav = document.getElementById('mobileNav');
  const navLinks = document.querySelectorAll('.nav__link, .mobile-nav__link');
  // The footer (id="contact", data-nav-id="contact") is a <footer>, not a
  // <section> -- excluded by a bare "section[id]" selector, so it never
  // took part in scroll-spy at all despite already having the right
  // data-nav-id set on it.
  const sections = document.querySelectorAll('main > section[id], main > footer[id]');

  /* Mobile menu toggle */
  const closeMobileNav = () => {
    hamburgerBtn.classList.remove('is-open');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    mobileNav.classList.remove('is-open');
  };

  hamburgerBtn.addEventListener('click', () => {
    const isOpen = hamburgerBtn.classList.toggle('is-open');
    hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
    mobileNav.classList.toggle('is-open', isOpen);
  });

  mobileNav.addEventListener('click', (e) => {
    if (e.target.classList.contains('mobile-nav__link')) {
      closeMobileNav();
    }
  });

  /* Active nav link on scroll (scroll-spy) */
  const setActiveNav = (id) => {
    navLinks.forEach((link) => {
      link.classList.toggle('is-active', link.dataset.nav === id);
    });
  };

  // A mid-viewport IntersectionObserver band would flag #work active as soon
  // as its top crosses the vertical center of the screen ??but #intro's
  // sibling .intro-reasons block (the long scroll-dwell section right after
  // the hero) is still tall enough to still be filling most of the screen
  // at that point. So instead: the active section is whichever one's top
  // has most recently crossed near the top of the viewport, which only
  // happens once the previous section has fully scrolled out of view.
  const sectionEls = Array.from(sections);
  // While a nav-jump's smooth-scroll is in flight, the scroll-spy below
  // would sweep the highlight through every section the jump flies past
  // (WORK -> SKILL -> ABOUT in under a second), which reads as the nav
  // links rapidly blinking. The click handler sets the destination link
  // active up front and holds this lock until the jump settles.
  let navJumpActiveLock = false;
  const updateActiveNav = () => {
    if (navJumpActiveLock) return;
    const line = window.scrollY + 120;
    let current = sectionEls[0];
    sectionEls.forEach((sec) => {
      const top = sec.getBoundingClientRect().top + window.scrollY;
      if (top <= line) current = sec;
    });
    // The workDetail2/workDetail3 sections (see index.html) have their own
    // ids for scroll-target/testing purposes, but should still count as
    // "work" for nav highlighting -- data-nav-id overrides id for that
    // mapping without the sections needing to actually be id="work".
    if (current) setActiveNav(current.dataset.navId || current.id);
  };

  if (sectionEls.length) {
    updateActiveNav();
    window.addEventListener('scroll', updateActiveNav, { passive: true });
    window.addEventListener('resize', rafCoalesce(updateActiveNav));
  }

  window.addEventListener('resize', () => {
    if (window.innerWidth > 1023) {
      closeMobileNav();
    }
  });

  /* Header visibility: stays visible while scrolling down, hides while scrolling up ??
     except over the hero section, where it always stays visible. */
  const header = document.querySelector('.header');
  const hero = document.getElementById('intro');
  let lastScrollY = window.scrollY;
  const updateHeaderHeroState = () => {
    if (header && hero) {
      header.classList.toggle('header--hero', window.scrollY < hero.offsetHeight - 80);
    }
  };
  updateHeaderHeroState();

  // Clicking a nav link (e.g. WORK) jumps the page via the browser's native
  // #anchor handling. When that jump lands above the current scroll
  // position, it's indistinguishable from a manual "scroll up" to the
  // handler below, which would hide the header right as it lands. Force
  // the header visible for the duration of the jump, and only hand control
  // back to the normal scroll-direction logic once the position has held
  // steady for a few frames (covers both an instant jump and any future
  // smooth-scroll animation).
  let isNavJumping = false;

  // Separate from isNavJumping -- that flag clears via waitForJumpToSettle's
  // own "3 stable frames within 2px of target" polling loop, which can take
  // a while (the browser's smooth-scroll easing tail keeps nudging the
  // position by sub-pixel amounts well after the jump is visually done), so
  // gating writes on it meant e.g. the header could sit black-on-black for
  // up to a couple seconds after actually arriving. This instead clears on
  // the native 'scrollend' event, which fires right when the browser itself
  // considers the scroll finished. Also used by .about-transition (see
  // updateAboutTransition) to skip animating its own black -> white wipe
  // reveal in whatever compressed time a nav-jump's smooth-scroll takes to
  // cross its 440vh -- not a race like the header's, just a real section
  // the jump has to fly through, which otherwise reads as an unwanted flash
  // of black rather than a deliberate transition.
  let suspendNavJumpVisuals = false;

  // Scroll-jacked sections further down (the SKILL carousel) freeze real
  // page scrolling while engaged and drive their own animation off raw
  // wheel/key deltas instead -- window.scrollY genuinely never moves, so
  // this handler's own scroll-direction comparison below never fires and
  // the header just sits frozen in whatever state it was in when the lock
  // engaged. Exposing this lets that section's input handlers nudge the
  // header the same way a real scroll would, keyed off the same delta
  // sign they already have on hand, so "scroll down hides it / scroll up
  // shows it" keeps working even though no real scrolling is happening.
  const updateHeaderForDelta = (delta) => {
    if (isNavJumping) {
      header.classList.remove('header--hidden');
    } else if (delta > 0) {
      header.classList.add('header--hidden');
    } else if (delta < 0) {
      header.classList.remove('header--hidden');
    }
  };

  // SKILL used to install its own scroll clamp; this remains as a harmless
  // hook for nav clicks so older section code can clean up local state if
  // needed.
  let releaseSkillCarouselLock = () => {};
  let releaseCardsRevealLock = () => {};

  let isScrollLocked = false;

  let navJumpToken = 0;
  const waitForJumpToSettle = (targetY = null) => {
    const token = navJumpToken;
    let prevY = window.scrollY;
    let stableFrames = 0;
    const check = () => {
      if (token !== navJumpToken) return;
      const y = window.scrollY;
      if (y === prevY) {
        stableFrames += 1;
      } else {
        stableFrames = 0;
        prevY = y;
      }
      const reachedTarget = targetY === null || Math.abs(y - targetY) <= 2;
      // A wheel/touch input mid-flight cancels the browser's smooth scroll,
      // so the target may never be reached -- without the fallback the poll
      // would spin (and hold isNavJumping/navJumpActiveLock) until the next
      // nav click. ~45 motionless frames means the scroll is over, wherever
      // it stopped.
      if ((stableFrames >= 3 && reachedTarget) || stableFrames >= 45) {
        isNavJumping = false;
        navJumpActiveLock = false;
        if (darkOverlayEl) darkOverlayEl.style.transition = '';
        lastScrollY = window.scrollY;
        // applyCombinedDarkState's own writes were suspended for the whole
        // jump (see that function) -- every section's *DarkContribution is
        // still fresh (only the header/overlay write itself was skipped),
        // so this one call now applies the correct settled state exactly
        // once, instead of whatever was last (possibly mid-transit and
        // wrong) before the jump began.
        applyCombinedDarkState();
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  };

  // The dark overlay's opacity at each nav destination's landing position.
  // Known statically: skill lands inside the pinned dark carousel (1);
  // every other target lands on a light background or (contact) on the
  // footer's own opaque black, which deliberately keeps the overlay at 0
  // -- see the blackSectionDarkContribution comment in
  // applyCombinedDarkState.
  const NAV_DEST_OVERLAY = { intro: 0, work: 0, skill: 1, about: 0, contact: 0 };

  // header--inverted's own write is held off for the whole jump (see
  // applyCombinedDarkState's isNavJumping guard) so it doesn't blink through
  // every section a long jump flies past. But that also meant the logo/
  // active-link colors sat frozen at the ORIGIN's state for the entire
  // flight (even though the overlay above already started easing toward the
  // destination immediately) and only snapped to correct at the very end,
  // once isNavJumping cleared -- a late, out-of-sync correction that reads
  // as the exact "logo/link blinks" flicker this is meant to prevent, not a
  // fix for it. Setting it to the known destination value here, in step
  // with NAV_DEST_OVERLAY, lets it transition (via its own 0.2s ease, see
  // .logo/.nav__link in style.css) right when the click happens instead.
  const NAV_DEST_HEADER_DARK = { intro: false, work: false, skill: true, about: false, contact: true };

  navLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      const hash = link.getAttribute('href');
      const rawTarget = hash && hash.startsWith('#') ? document.querySelector(hash) : null;
      const target = hash === '#skill'
        ? document.getElementById('skillCarouselStage') || rawTarget
        : rawTarget;
      if (target) {
        event.preventDefault();
      }

      isNavJumping = true;
      suspendNavJumpVisuals = true;
      navJumpToken += 1;
      header.classList.remove('header--hidden');
      releaseCardsRevealLock();
      releaseSkillCarouselLock();

      // applyCombinedDarkState holds its overlay write for the whole jump,
      // which used to leave the overlay frozen at the ORIGIN's opacity --
      // jumping out of a dark section meant a solid black screen for the
      // entire 1.5s+ flight, snapping away only on arrival ("black
      // background flashes when I jump to about"). Instead, ease the
      // overlay to the DESTINATION's known landing value right away, and
      // pin the nav highlight to the destination so the scroll-spy sweep
      // doesn't blink through every section in between.
      if (target && link.dataset.nav in NAV_DEST_OVERLAY) {
        navJumpActiveLock = true;
        setActiveNav(link.dataset.nav);
        if (darkOverlayEl) {
          darkOverlayEl.style.transition = 'opacity 0.45s ease';
          darkOverlayEl.style.opacity = String(NAV_DEST_OVERLAY[link.dataset.nav]);
        }
        header.classList.toggle('header--inverted', NAV_DEST_HEADER_DARK[link.dataset.nav]);
      }

      if (target) {
        const targetY = target.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({
          top: targetY,
          behavior: 'smooth',
        });
        window.history.pushState(null, '', hash);
        waitForJumpToSettle(targetY);
      } else {
        waitForJumpToSettle();
      }
    });
  });

  // Native signal that a scroll (including the smooth-scroll a nav-link
  // jump kicks off) has actually finished -- fires reliably right when the
  // browser itself considers the scroll done, unlike isNavJumping's own
  // "3 stable frames" polling (which can lag well behind the visual end of
  // a smooth-scroll's easing tail). navJumpResumeCallbacks collects
  // callbacks from sections suspended for the jump's duration (currently
  // just .about-transition, see updateAboutTransition) that need one final
  // recompute against the real, settled scroll position once it's over.
  //
  // applyCombinedDarkState() is also called unconditionally here (not just
  // while suspendNavJumpVisuals was set): every *DarkContribution is only
  // ever recomputed as a side effect of some 'scroll' listener firing, and
  // applyCombinedDarkState's own rAF-batched write only runs when one of
  // those calls it. If the browser's very last 'scroll' event of a
  // smooth-scroll (nav-jump or otherwise) fires before the animation has
  // fully settled to its rest position -- entirely possible during the
  // easing tail -- nothing else is left to trigger one more recompute, so
  // the header/overlay can get stuck showing whatever that last, not-quite-
  // final position implied, indefinitely (confirmed: minutes, not frames).
  // 'scrollend' is the one signal guaranteed to fire after scrolling has
  // truly stopped, so forcing a recompute here closes that gap for good.
  const navJumpResumeCallbacks = [];
  window.addEventListener('scrollend', () => {
    // The overlay's arrival value matches what the click handler already
    // eased it to, so dropping the temporary transition here never causes
    // a visible snap.
    if (!isNavJumping && darkOverlayEl) darkOverlayEl.style.transition = '';
    if (!isNavJumping) navJumpActiveLock = false;
    applyCombinedDarkState();
    if (suspendNavJumpVisuals) {
      suspendNavJumpVisuals = false;
      navJumpResumeCallbacks.forEach((fn) => fn());
    }
  });

  window.addEventListener('scroll', () => {
    // Always kept in sync with the real scrollY, even while isScrollLocked
    // -- a scrollbar drag straight up to the hero can land here on the one
    // 'scroll' event where a section's lock (cards-reveal, the SKILL
    // carousel) is still flagged active (its own listener releases it
    // moments later, on this same event, but after this handler already
    // ran). Gating this below the isScrollLocked check meant that one
    // event -- often the last, since the drag has already reached the top
    // -- got skipped and .header--hero never reapplied, leaving the logo/
    // nav text black-on-black over the hero until something else (a manual
    // refresh) recomputed it from scratch. Nothing bad comes from calling
    // it while genuinely locked either: real scrollY isn't moving then, so
    // it just recomputes the same value.
    updateHeaderHeroState();
    if (isScrollLocked) return;

    const currentScrollY = window.scrollY;

    if (isNavJumping) {
      header.classList.remove('header--hidden');
    } else if (currentScrollY <= hero.offsetHeight) {
      header.classList.remove('header--hidden');
    } else if (currentScrollY > lastScrollY) {
      header.classList.add('header--hidden');
    } else if (currentScrollY < lastScrollY) {
      header.classList.remove('header--hidden');
    }

    lastScrollY = currentScrollY;
  });

  /* Hero title -> Intro-reasons title scroll-linked hand-off.
     The hero title clones into a fixed "flying" element while the
     intro-reasons section scrolls into view, interpolating in document
     coordinates between the two resting positions; once it docks, the
     Korean subtitle, photo, and English subtext reveal in sequence. */
  const heroTitleEl = document.querySelector('.hero__legacy-title');
  const dockedTitleEl = document.querySelector('.intro-reasons__title');
  const flyingTitleEl = document.getElementById('flyingTitle');
  const introReasons = document.querySelector('.intro-reasons');
  const subtitleEl = document.querySelector('.intro-reasons__subtitle');
  const textEl = document.querySelector('.intro-reasons__text');

  /* Splits every text node under `root` into one <span class="fill-char">
     (or a custom className, e.g. work-transition's "fog-char") per
     character (keeping <strong> etc. wrapping intact), so each
     character's color/opacity/transform can be driven independently by
     scroll position. */
  const wrapChars = (root, className = 'fill-char') => {
    Array.from(root.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        Array.from(node.textContent).forEach((ch) => {
          // Whitespace stays a plain text node instead of its own
          // display:inline-block span: a span whose *entire* content is
          // one collapsible space is -- per the whitespace-collapsing
          // rules -- both the first and last thing in its own inline
          // formatting context, so browsers collapse it to zero width
          // and every word runs together. Plain text between the
          // char-spans isn't its own formatting context, so the space
          // renders normally (and doesn't need the fade/blur anyway).
          if (/\s/.test(ch)) {
            frag.appendChild(document.createTextNode(ch));
            return;
          }
          const span = document.createElement('span');
          span.className = className;
          span.textContent = ch;
          frag.appendChild(span);
        });
        root.replaceChild(frag, node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        wrapChars(node, className);
      }
    });
  };

  let fillChars = [];
  if (subtitleEl) {
    wrapChars(subtitleEl);
    fillChars = Array.from(subtitleEl.querySelectorAll('.fill-char'));
  }

  if (introReasons) {
    document.body.classList.add('js-anim');

    let docked = false;

    const measure = () => {
      return;
      // #flyingTitle lives outside any container-query ancestor (it must,
      // so that position:fixed stays truly viewport-fixed instead of being
      // contained by .intro-reasons' container-type box), so var(--u)'s
      // cqw component can't resolve there ??copy the resolved px value
      // from a container-query descendant instead.
      flyingTitleEl.style.setProperty('--u', getComputedStyle(dockedTitleEl).getPropertyValue('--u'));

      const startRect = heroTitleEl.getBoundingClientRect();
      const stickyRect = introStickyEl.getBoundingClientRect();
      const endRect = dockedTitleEl.getBoundingClientRect();

      // Both anchors are captured in *viewport* space, not document space:
      // - startPos is the hero title's document top, which equals its
      //   viewport position at progress 0 (scrollY 0, since the hero is
      //   exactly 100vh tall).
      // - endPos is the docked title's offset *inside* the sticky box
      //   (title.top - sticky.top), which never changes with scroll --
      //   .intro-reasons__sticky centers its content the same way whether
      //   it's currently pinned or not. Once actually pinned, the sticky
      //   box sits at viewport top 0, so this offset IS the title's final
      //   on-screen resting position.
      // Blending directly between these two fixed viewport points (instead
      // of the old document-coordinate lerp minus a live scrollY) keeps the
      // flight strictly monotonic -- no more dipping past the docked spot
      // and rising back up to correct itself.
      startPos = { top: startRect.top + window.scrollY, left: startRect.left };
      endPos = { top: endRect.top - stickyRect.top, left: endRect.left };
    };

    const getProgress = () => {
      const rect = introReasons.getBoundingClientRect();
      const vh = window.innerHeight;
      return Math.min(1, Math.max(0, (vh - rect.top) / vh));
    };

    const update = () => {
      const progress = getProgress();

      // Mobile drops the sticky pin entirely (see .intro-reasons height:auto
      // in CSS), so there's no dwell to scrub the reveal against -- it just
      // needs to feel like it fires promptly as the section scrolls in,
      // rather than waiting for the section's top edge to fully reach the
      // viewport top like the desktop hand-off does.
      const dockThreshold = window.innerWidth <= 1023 ? 0.55 : 1;
      const undockThreshold = window.innerWidth <= 1023 ? 0.45 : 0.9;

      if (progress >= dockThreshold && !docked) {
        docked = true;
        introReasons.classList.add('is-docked');
      } else if (progress < undockThreshold && docked) {
        docked = false;
        introReasons.classList.remove('is-docked');
      }

      // Once the section fully fills the viewport (rect.top <= 0), continuing
      // to scroll plays a sequence of stages while the layout stays pinned
      // (see .intro-reasons' height / .intro-reasons__sticky in CSS): the
      // subtitle sweeps gray -> black, a short hold, the English subtext
      // cross-fades to Korean in place, then another hold. Only once the
      // whole sequence finishes does the pin release and the next section
      // can scroll into view. dwellDist is measured from the actual layout
      // (not a hardcoded vh figure) so it stays correct if the CSS height
      // of .intro-reasons ever changes.
      const dwellRect = introReasons.getBoundingClientRect();
      const dwellDist = introReasons.offsetHeight - window.innerHeight;
      const dwellProgress = dwellDist > 0
        ? Math.min(1, Math.max(0, -dwellRect.top / dwellDist))
        : 0;

      const stage = (start, end, p) => Math.min(1, Math.max(0, (p - start) / (end - start)));
      // Fill and the Korean-swap trigger are pinned to fixed *vh* distances
      // (converted to px via the live viewport height, then to a
      // dwellProgress fraction via the live dwellDist) rather than
      // baked-in fractions of the whole dwell -- so however long
      // .intro-reasons' CSS height (and therefore dwellDist) is tuned to
      // be, fill/swap always happen after the same amount of physical
      // scrolling, and any extra dwell height added beyond
      // SWAP_TRIGGER_VH always lands entirely in the final hold (the pause
      // after the Korean subtext has fully settled, before the pin
      // releases and the next section is allowed in).
      const vh = window.innerHeight / 100;
      const FILL_END_VH = 187.5;
      const SWAP_TRIGGER_VH = 218.85;
      const fillProgress = stage(0, (FILL_END_VH * vh) / dwellDist, dwellProgress);
      // The English->Korean crossfade used to map opacity directly to
      // scroll distance across this whole window, which read as a
      // mechanical wipe keyed to scroll speed rather than a genuine
      // fade-in. Now it's a single trigger at SWAP_TRIGGER_VH --
      // .is-swapped's CSS transition (see .intro-reasons__text-kr) plays
      // the actual low-opacity-rising-to-full fade over a fixed duration,
      // matching how .intro-reasons__reveal and the reason-quote word
      // reveals already animate elsewhere in this file.
      const krSwapThreshold = (SWAP_TRIGGER_VH * vh) / dwellDist;

      if (fillChars.length) {
        const startRGB = [0xec, 0xea, 0xe9];
        const n = fillChars.length;
        fillChars.forEach((span, i) => {
          const t = Math.min(1, Math.max(0, fillProgress * n - i));
          const r = Math.round(startRGB[0] * (1 - t));
          const g = Math.round(startRGB[1] * (1 - t));
          const b = Math.round(startRGB[2] * (1 - t));
          span.style.color = `rgb(${r}, ${g}, ${b})`;
        });
      }

      if (textEl) {
        textEl.classList.toggle('is-swapped', dwellProgress >= krSwapThreshold);
      }
    };

    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          update();
          ticking = false;
        });
      }
    };

    let resizeTimer;
    const onResize = () => {
      measure();
      update();
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        measure();
        update();
      }, 200);
    };

    measure();
    update();

    // Smooth entrance for the hero title on first load: fade + rise in from
    // slightly below (only when we're actually starting at the top -- if the
    // page loaded mid-scroll, update() above already put it in the right
    // state and it shouldn't be touched). The transition is inline and
    // temporary, not a CSS animation with fill-mode -- a filled animation
    // keeps overriding any later inline opacity change on the same element
    // forever, which previously left the hero title stuck visible even
    // after script.js tried to hide it once scrolling into the hand-off,
    // showing it doubled up alongside the flying/docked title.
    if (heroTitleEl && getProgress() <= 0) {
      heroTitleEl.style.transition = 'none';
      heroTitleEl.style.opacity = '0';
      heroTitleEl.style.transform = 'translateY(28px)';
      heroTitleEl.getBoundingClientRect();
      requestAnimationFrame(() => {
        heroTitleEl.style.transition = 'opacity 0.9s ease, transform 0.9s ease';
        heroTitleEl.style.opacity = '1';
        heroTitleEl.style.transform = 'translateY(0)';
        // A hard timeout, not transitionend: if the user scrolls before this
        // finishes, update() changes the opacity target mid-flight, which
        // means the transition never reaches "1" and transitionend never
        // fires -- leaving this slow transition attached indefinitely and
        // making every later scroll-driven opacity change (the hand-off to
        // the flying title) crawl instead of snap instantly.
        setTimeout(() => {
          heroTitleEl.style.transition = '';
        }, 900);
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', rafCoalesce(onResize));
    window.addEventListener('load', () => {
      measure();
      update();
    });
  }

  /* Shared full-screen dark takeover, contributed to by both reason-quote
     and cards-reveal (two consecutive black sections) -- whichever one is
     more "on screen" at a given scroll position drives #scrollDarkOverlay
     and the header inversion, so the header/overlay stay dark across the
     handoff between them instead of the header flashing back to black at
     exactly the point reason-quote's own dark contribution fades out
     (which happens right as cards-reveal takes over -- see each
     section's own entry/exit math below). */
  const darkOverlayEl = document.getElementById('scrollDarkOverlay');
  const headerEl = document.querySelector('.header');
  // How much of the overlay fade counts as "in the dark section" for the
  // header's own colors -- deliberately low, so the logo/active nav link
  // swap to white as soon as the screen visibly starts darkening rather
  // than waiting for it to nearly finish.
  const HEADER_DARK_THRESHOLD = 0.08;
  // Every section below already exposes pure, side-effect-free
  // getXEntryProgress/getXExitProgress/getXDwellProgress getters (used for
  // its own reveal/wipe timing), but each one's *DarkContribution write is
  // bundled inside that SAME section's own independently rAF-throttled
  // scroll handler (its "xTicking" guard) alongside its other, heavier
  // per-scroll visual work. During a fast scroll (a nav-jump's smooth-scroll
  // especially), if one section's rAF happens to still be pending when a
  // new 'scroll' event arrives, its update -- and therefore its
  // contribution -- skips that event entirely, while an adjacent section
  // (not currently pending) updates immediately. The two can end up representing
  // *different instants*, and if that mismatch briefly drops `combined`
  // below threshold before the stale one catches up next frame, that's a
  // real, separately-painted frame -- the header genuinely blinking off and
  // back on. Each section below registers a tiny refresher here (reusing
  // its own existing getters/formula, nothing new) that recomputes just its
  // *DarkContribution from current geometry; applyCombinedDarkState calls
  // all of them, synchronously, immediately before every write, so no
  // combined value is ever built from a mix of stale and fresh contributions.
  const darkContributionRefreshers = [];
  let reasonDarkContribution = 0;
  let cardsDarkContribution = 0;
  let workTransitionDarkContribution = 0;
  let workDetailDarkContribution = 0;
  let workDetail2DarkContribution = 0;
  let workDetail3DarkContribution = 0;
  let skillTransitionDarkContribution = 0;
  let skillContentDarkContribution = 0;
  let aboutTransitionDarkContribution = 0;
  // .site-footer (and .ready-cta, the always-solid-black section right
  // before it) are always solid black, unlike every other section above
  // (which fade a dark overlay in/out via their own *DarkContribution).
  // quickQaDarkContribution's own "exit" factor drops to 0 as soon as
  // quick-qa's bottom scrolls above the viewport -- with nothing covering
  // for .ready-cta/.site-footer after it, the header logo (plain black SVG,
  // only inverted to white while some *DarkContribution is above threshold)
  // would go black-on-black and effectively disappear over them. No fade
  // needed here since that whole remaining stretch is already fully opaque
  // -- this is just 1 while the viewport's top edge is over it, 0
  // otherwise. Set inside updateQuickQaDarkState itself (not a separate
  // listener) -- see that function for why sharing its one rect read
  // matters here.
  let blackSectionDarkContribution = 0;
  let quickQaDarkContribution = 0;
  // Mobile only (see updateSkillContentDark below): keeps the header
  // inverted while it still overlaps skill-content's black remnant,
  // WITHOUT also forcing the shared full-viewport #scrollDarkOverlay
  // opaque for that same stretch -- skill-content already paints its own
  // solid black background, so the overlay never needs to reflect it.
  let skillContentHeaderOverlap = 0;

  // A direct black<->white swap (.header--inverted, see CSS) once the
  // overlay is dark enough -- not a per-frame RGB blend. Blending toward
  // white tracked the scroll position 1:1, so for most of the scroll it
  // sat at some intermediate gray -- exactly the muted color inactive
  // links already use, making active/inactive momentarily
  // indistinguishable, and it meant black text stayed low-contrast
  // against the darkening background for a long stretch instead of
  // becoming legible (white) as soon as darkening starts.
  // Batching the actual DOM write into one rAF (rather than writing on
  // every single applyCombinedDarkState() call, several of which can land
  // for what's functionally the same on-screen instant during a fast
  // scroll) means only one, fully-settled value gets painted per frame.
  // Combined with darkContributionRefreshers above (refreshing every
  // section's contribution from live geometry immediately before reading
  // any of them, right here), the value read on any given frame can never
  // be a mix of one section's stale figure and another's fresh one --
  // eliminating the header/overlay flicker without delaying the write
  // itself (color changes land the same frame the underlying scroll
  // position does, nav-jump or otherwise -- see .about-transition's own
  // suspend-during-jump handling below for the one section that needs a
  // real behavioral change during a jump, not just a timing fix).
  let darkStateFrameId = 0;
  const applyCombinedDarkState = () => {
    if (darkStateFrameId) return;
    darkStateFrameId = requestAnimationFrame(() => {
      darkStateFrameId = 0;
      darkContributionRefreshers.forEach((refresh) => refresh());
      // While a nav-jump's smooth-scroll is in flight, its target can be a
      // full page-length away (e.g. the header's own CONTACT link, hero ->
      // footer) -- the refreshers above still track live geometry each
      // frame, so `combined`/`headerDark` genuinely flip section-by-section
      // as the jump flies past everything in between in a fraction of a
      // normal scroll's time. Writing each of those intermediate values is
      // exactly what read as the header logo and active nav link (both
      // driven by .header--inverted, see style.css) rapidly blinking rather
      // than transitioning once. Holding the actual DOM write off until
      // isNavJumping clears -- while still letting contributions refresh
      // above, so whichever call finally does write has fresh geometry --
      // fixes that; waitForJumpToSettle already calls this function once
      // more right after clearing isNavJumping, applying the real
      // destination state in one clean frame instead of several flickery
      // ones.
      if (isNavJumping) return;
      const combined = Math.max(reasonDarkContribution, cardsDarkContribution, workTransitionDarkContribution, workDetailDarkContribution, workDetail2DarkContribution, workDetail3DarkContribution, skillTransitionDarkContribution, skillContentDarkContribution, aboutTransitionDarkContribution, quickQaDarkContribution);
      if (darkOverlayEl) darkOverlayEl.style.opacity = String(combined);
      // blackSectionDarkContribution deliberately does NOT feed into
      // `combined`: combined drives #scrollDarkOverlay's opacity (a
      // full-viewport position:fixed layer at z-index 40, well above
      // .site-footer__inner's own z-index: 1), and the footer is already
      // opaque black on its own -- fading that overlay in over it just
      // paints solid black across the *whole* screen, including the
      // footer's own white text, which reads as the footer having
      // disappeared. blackSectionDarkContribution only needs to flip the
      // header logo white; it has no gradient to blend and nothing above
      // it that needs covering.
      const headerDark = combined > HEADER_DARK_THRESHOLD || skillContentHeaderOverlap > HEADER_DARK_THRESHOLD || blackSectionDarkContribution > 0;
      if (headerEl) headerEl.classList.toggle('header--inverted', headerDark);
    });
  };

  const readColor = (value) => {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
    return {
      r: parts[0] || 0,
      g: parts[1] || 0,
      b: parts[2] || 0,
      a: parts.length > 3 ? parts[3] : 1,
    };
  };

  const updateMobileHeaderSurface = () => {
    if (!headerEl || window.innerWidth > 1023) {
      if (headerEl) headerEl.classList.remove('header--surface-dark');
      return;
    }

    if (darkOverlayEl && Number.parseFloat(getComputedStyle(darkOverlayEl).opacity || '0') > HEADER_DARK_THRESHOLD) {
      headerEl.classList.add('header--surface-dark');
      return;
    }

    const x = Math.min(window.innerWidth - 1, Math.max(1, window.innerWidth / 2));
    const y = Math.min(window.innerHeight - 1, 34);
    const stack = document.elementsFromPoint(x, y);
    let isDarkSurface = false;

    for (const startEl of stack) {
      if (!startEl || headerEl.contains(startEl) || startEl.classList.contains('fixed-grid-lines')) continue;
      let el = startEl;
      while (el && el !== document.documentElement) {
        const color = readColor(getComputedStyle(el).backgroundColor);
        if (color && color.a > 0.5) {
          const brightness = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
          isDarkSurface = brightness < 90;
          break;
        }
        el = el.parentElement;
      }
      break;
    }

    headerEl.classList.toggle('header--surface-dark', isDarkSurface);
  };

  let mobileHeaderSurfaceTicking = false;
  const requestMobileHeaderSurfaceUpdate = () => {
    if (mobileHeaderSurfaceTicking) return;
    mobileHeaderSurfaceTicking = true;
    requestAnimationFrame(() => {
      mobileHeaderSurfaceTicking = false;
      updateMobileHeaderSurface();
    });
  };

  updateMobileHeaderSurface();
  window.addEventListener('scroll', requestMobileHeaderSurfaceUpdate, { passive: true });
  window.addEventListener('resize', requestMobileHeaderSurfaceUpdate);
  window.addEventListener('load', updateMobileHeaderSurface);

  /* Reason-quote: personal statement that scrolls in right after
     intro-reasons. The *whole viewport* (not just this section's own box)
     crossfades white -> black continuously as the section slides into
     place, via #scrollDarkOverlay -- a fixed full-screen layer whose
     opacity is scroll-scrubbed (like the flying-title hand-off above) --
     and fades back out once the section is scrolled past. In sync, the
     fixed header's logo/active nav-link invert from black to white so
     they stay legible over the darkening screen. Once pinned, words/chips
     reveal in scroll-triggered batches -- each batch that's been scrolled
     past gets .is-revealed and animates in over its own CSS transition,
     independent of scroll speed, matching INTERACTION_GUIDE.md's
     mask-wipe + chip-expand pattern. */
  const reasonQuoteEl = document.querySelector('.reason-quote');

  if (reasonQuoteEl) {
    const reasonSequence = Array.from(reasonQuoteEl.querySelectorAll('.word, .media-chip'));

    // Cumulative reveal count at each dwellProgress threshold -- lines up
    // with the sentence's own word groups and inline chips (e.g. the first
    // threshold reveals "FROM music", the next adds the piano chip + "TO").
    const reasonThresholds = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
    const reasonRevealCounts = [2, 4, 6, 7, 9, 10, 12, 14];

    const getReasonEntryProgress = () => {
      const rect = reasonQuoteEl.getBoundingClientRect();
      const vh = window.innerHeight;
      return Math.min(1, Math.max(0, (vh - rect.top) / vh));
    };

    // Mirrors getReasonEntryProgress but off the section's *bottom* edge,
    // so the overlay fades back out as the section scrolls past rather
    // than staying pinned black for every section that follows it.
    const getReasonExitProgress = () => {
      const rect = reasonQuoteEl.getBoundingClientRect();
      const vh = window.innerHeight;
      return Math.min(1, Math.max(0, rect.bottom / vh));
    };

    const getReasonDwellProgress = () => {
      const rect = reasonQuoteEl.getBoundingClientRect();
      const dwellDist = reasonQuoteEl.offsetHeight - window.innerHeight;
      return dwellDist > 0 ? Math.min(1, Math.max(0, -rect.top / dwellDist)) : 0;
    };

    darkContributionRefreshers.push(() => {
      reasonDarkContribution = window.innerWidth <= 1023
        ? 0
        : Math.min(getReasonEntryProgress(), getReasonExitProgress());
    });

    const updateReasonQuote = () => {
      // Mobile fallback (see CSS) shows everything at rest with a plain
      // static black block -- skip the scroll-scrubbed overlay/header
      // inversion and reveal-threshold math entirely, and clear any
      // inline styles left over from a wider viewport instead of letting
      // them fight the CSS override.
      if (window.innerWidth <= 1023) {
        reasonDarkContribution = 0;
        applyCombinedDarkState();
        const mobileEntry = getReasonEntryProgress();
        const shouldRevealMobileChips = mobileEntry > 0.42;
        reasonSequence.forEach((el) => {
          if (el.classList.contains('media-chip')) {
            el.classList.toggle('is-revealed', shouldRevealMobileChips);
          }
        });
        return;
      }

      const entry = getReasonEntryProgress();
      const exit = getReasonExitProgress();
      reasonDarkContribution = Math.min(entry, exit);
      applyCombinedDarkState();

      // Only start evaluating reveal batches once the section is actually
      // pinned (entry fully complete) -- dwellProgress alone can't tell
      // "just reached the start of the dwell" apart from "haven't scrolled
      // anywhere near the section yet", since both clamp to 0.
      const dwellProgress = entry >= 1 ? getReasonDwellProgress() : 0;
      let activeCount = 0;
      if (entry >= 1) {
        reasonThresholds.forEach((threshold, i) => {
          if (dwellProgress >= threshold) activeCount = reasonRevealCounts[i];
        });
      }
      reasonSequence.forEach((el, i) => {
        el.classList.toggle('is-revealed', i < activeCount);
      });
    };

    let reasonTicking = false;
    const onReasonScroll = () => {
      if (!reasonTicking) {
        reasonTicking = true;
        requestAnimationFrame(() => {
          updateReasonQuote();
          reasonTicking = false;
        });
      }
    };

    updateReasonQuote();
    window.addEventListener('scroll', onReasonScroll, { passive: true });
    window.addEventListener('resize', rafCoalesce(updateReasonQuote));
    window.addEventListener('load', updateReasonQuote);
  }

  /* Cards-reveal: scrolls in right after reason-quote. Its three big cards
     are the same piano photo + two placeholders as reason-quote's three
     inline chips, landing at full size -- as this section scrolls into
     place, three fixed "flying" clones (#flyingCard1-3) interpolate from
     each chip's resting position/size (while reason-quote was pinned) to
     its matching big card's resting position/size (once cards-reveal is
     pinned), the same flying-clone hand-off technique as the hero title ->
     intro-reasons title above, generalized to three elements animating in
     parallel instead of one. */
  const cardsRevealEl = document.querySelector('.cards-reveal');

  if (reasonQuoteEl && cardsRevealEl) {
    const reasonStickyEl = document.querySelector('.reason-quote__sticky');
    const cardsStickyEl = document.querySelector('.cards-reveal__sticky');

    const cardSmoothstep = (t) => t * t * (3 - 2 * t);

    const SCROLL_LOCK_MS = 1200;
    const SCROLL_LOCK_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
    let scrollLockActive = false;
    let scrollLockTimer = null;
    let lockedScrollY = 0;

    const preventScroll = (e) => e.preventDefault();
    const preventScrollKey = (e) => {
      if (SCROLL_LOCK_KEYS.includes(e.key)) e.preventDefault();
    };
    // While engaged, wheel/touchmove/keydown never touch real page scroll
    // themselves -- preventScroll/preventScrollKey block them outright, so
    // any *other* scroll-position change seen here can only be an input
    // this lock doesn't listen for: a scrollbar drag, middle-click
    // autoscroll, etc. Unconditionally releasing on any such nudge (an
    // earlier version of this) meant the dwell pause died the instant
    // *anything* moved scrollY even slightly -- including the tiny
    // scroll-anchoring correction the browser fires on its own right as
    // the flip's layout change lands -- which read as the pause not
    // engaging at all. Snapping back to lockedScrollY (like a plain wheel
    // scroll gets) is correct for that case and restores the intended
    // dwell. The one input that should still win outright is a scrollbar
    // drag/click landing at the very top or bottom of the page -- a
    // deliberate "jump to the end", not incidental drift -- so that alone
    // is left to release the lock immediately.
    const isAtScrollExtreme = () => {
      const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
      return window.scrollY <= 2 || window.scrollY >= maxScrollY - 2;
    };
    const correctLockedScroll = () => {
      if (!scrollLockActive || isNavJumping || window.scrollY === lockedScrollY) return;
      if (isAtScrollExtreme()) {
        releaseScrollLock();
      } else {
        window.scrollTo(0, lockedScrollY);
      }
    };
    const releaseScrollLock = () => {
      clearTimeout(scrollLockTimer);
      if (!scrollLockActive) return;
      scrollLockActive = false;
      isScrollLocked = false;
      window.removeEventListener('wheel', preventScroll);
      window.removeEventListener('touchmove', preventScroll);
      window.removeEventListener('keydown', preventScrollKey);
      window.removeEventListener('scroll', correctLockedScroll);
    };

    const engageScrollLock = () => {
      if (isNavJumping) return;
      clearTimeout(scrollLockTimer);
      if (!scrollLockActive) {
        scrollLockActive = true;
        isScrollLocked = true;
        lockedScrollY = window.scrollY;
        window.addEventListener('wheel', preventScroll, { passive: false });
        window.addEventListener('touchmove', preventScroll, { passive: false });
        window.addEventListener('keydown', preventScrollKey);
        window.addEventListener('scroll', correctLockedScroll);
      }
      scrollLockTimer = setTimeout(releaseScrollLock, SCROLL_LOCK_MS);
    };
    releaseCardsRevealLock = releaseScrollLock;

    const cardPairs = [
      { chip: document.getElementById('chipMusic'), card: document.getElementById('cardsRevealCard1'), flying: document.getElementById('flyingCard1') },
      { chip: document.getElementById('chipDesign'), card: document.getElementById('cardsRevealCard2'), flying: document.getElementById('flyingCard2') },
      { chip: document.getElementById('chipExperiences'), card: document.getElementById('cardsRevealCard3'), flying: document.getElementById('flyingCard3') },
    ].filter((pair) => pair.chip && pair.card && pair.flying);

    // measureCardFlight() runs once on load/resize, not per scroll frame --
    // valid only because both endpoints are timing-stable to measure. The
    // *card* end is simple (its size is constant; only opacity is ever
    // toggled). The *chip* start is not: .media-chip's width/margin only
    // reach their final revealed values once .is-revealed has been on it
    // for a full transition (width 1s, margin 1s) -- measured at load time
    // (or any time before reason-quote's own scroll-triggered reveal has
    // played out), getBoundingClientRect() would instead capture it
    // mid-collapse (width ~0), so the flight would launch from the wrong
    // size. forceMeasureRevealed briefly forces .is-revealed with
    // transitions killed, reads the *settled* box synchronously, then
    // reverts both -- a transition can't be sampled synchronously (it only
    // animates via the compositor over real time), so this is the only way
    // to read its end state without actually waiting out the animation.
    const forceMeasureRevealed = (el) => {
      const hadClass = el.classList.contains('is-revealed');
      const prevTransition = el.style.transition;
      el.style.transition = 'none';
      if (!hadClass) el.classList.add('is-revealed');
      void el.offsetHeight; // flush the transition:none + class change together
      const rect = el.getBoundingClientRect();
      const radius = parseFloat(getComputedStyle(el).borderRadius) || 0;
      if (!hadClass) el.classList.remove('is-revealed');
      void el.offsetHeight; // flush the revert too, before transitions come back
      el.style.transition = prevTransition;
      return { rect, radius };
    };

    // Both anchors are captured as an offset from their own sticky
    // container's top/left edge, not a live getBoundingClientRect() read
    // -- this offset is timing-independent (it only reflects the fixed
    // internal layout inside .reason-quote__sticky / .cards-reveal__sticky,
    // never the sticky box's own current on-screen position), so it's
    // valid however early or late measure() runs, exactly like
    // .intro-reasons__title's endPos above. Once the relevant sticky box
    // is actually stuck (top: 0), this same offset doubles as the correct
    // position:fixed viewport coordinate for the flying clone.
    const measureCardFlight = () => {
      const reasonStickyRect = reasonStickyEl.getBoundingClientRect();
      const cardsStickyRect = cardsStickyEl.getBoundingClientRect();
      cardPairs.forEach((pair) => {
        const { rect: chipRect, radius: startRadius } = forceMeasureRevealed(pair.chip);
        const cardRect = pair.card.getBoundingClientRect();
        pair.start = {
          top: chipRect.top - reasonStickyRect.top,
          left: chipRect.left - reasonStickyRect.left,
          width: chipRect.width,
          height: chipRect.height,
        };
        pair.end = {
          top: cardRect.top - cardsStickyRect.top,
          left: cardRect.left - cardsStickyRect.left,
          width: cardRect.width,
          height: cardRect.height,
        };
        pair.startRadius = startRadius;
        pair.endRadius = parseFloat(getComputedStyle(pair.card).borderRadius) || 0;
      });
    };

    const getCardsEntryProgress = () => {
      const rect = cardsRevealEl.getBoundingClientRect();
      const vh = window.innerHeight;
      return Math.min(1, Math.max(0, (vh - rect.top) / vh));
    };

    // Mirrors getCardsEntryProgress but off the section's *bottom* edge,
    // same reasoning as reason-quote's own getReasonExitProgress.
    const getCardsExitProgress = () => {
      const rect = cardsRevealEl.getBoundingClientRect();
      const vh = window.innerHeight;
      return Math.min(1, Math.max(0, rect.bottom / vh));
    };

    // Same dwellProgress pattern as reason-quote's getReasonDwellProgress:
    // only meaningful once the section is actually pinned (entry === 1),
    // 0 -> 1 across the scroll distance from dock to release.
    const getCardsDwellProgress = () => {
      const rect = cardsRevealEl.getBoundingClientRect();
      const dwellDist = cardsRevealEl.offsetHeight - window.innerHeight;
      return dwellDist > 0 ? Math.min(1, Math.max(0, -rect.top / dwellDist)) : 0;
    };

    darkContributionRefreshers.push(() => {
      cardsDarkContribution = window.innerWidth <= 1023
        ? 0
        : Math.min(getCardsEntryProgress(), getCardsExitProgress());
    });

    // Fixed vh distance (not a bare fraction -- see script.js's earlier
    // FILL_END_VH/SWAP_TRIGGER_VH comment for why this needs converting
    // via window.innerHeight first) into the post-dock dwell before the
    // cards flip. Reversible: toggled from live dwellProgress every
    // frame, not a one-shot trigger, so scrolling back up un-flips them.
    const FLIP_TRIGGER_VH = 75;

    let cardsDocked = false;
    let cardsFlipped = false;

    const updateCardsReveal = () => {
      // Mobile fallback (see CSS) shows the three cards already stacked
      // at rest -- skip the flight/dark math entirely.
      if (window.innerWidth <= 1023) {
        cardsDarkContribution = 0;
        applyCombinedDarkState();
        cardPairs.forEach((pair) => {
          pair.chip.style.opacity = '';
          pair.card.style.opacity = '';
          pair.flying.style.opacity = '0';
        });
        return;
      }

      const entry = getCardsEntryProgress();
      const exit = getCardsExitProgress();
      cardsDarkContribution = Math.min(entry, exit);
      applyCombinedDarkState();

      const ease = cardSmoothstep(entry);

      const dwellProgress = entry >= 1 ? getCardsDwellProgress() : 0;
      const dwellDist = cardsRevealEl.offsetHeight - window.innerHeight;
      const vh = window.innerHeight / 100;
      const flipThreshold = dwellDist > 0 ? (FLIP_TRIGGER_VH * vh) / dwellDist : 1;
      const nowFlipped = entry >= 1 && dwellProgress >= flipThreshold;
      const nearViewport = entry > 0 && exit > 0;
      if (nowFlipped !== cardsFlipped && nearViewport) {
        engageScrollLock();
      }
      cardsFlipped = nowFlipped;
      cardsRevealEl.classList.toggle('is-flipped', nowFlipped);

      cardPairs.forEach((pair) => {
        if (!pair.start || !pair.end) return;

        if (entry <= 0) {
          pair.flying.style.opacity = '0';
          pair.chip.style.opacity = '';
          pair.card.style.opacity = '0';
        } else if (entry >= 1) {
          pair.flying.style.opacity = '0';
          pair.chip.style.opacity = '0';
          pair.card.style.opacity = '1';
        } else {
          pair.chip.style.opacity = '0';
          pair.card.style.opacity = '0';
          pair.flying.style.opacity = '1';

          const top = pair.start.top + (pair.end.top - pair.start.top) * ease;
          const left = pair.start.left + (pair.end.left - pair.start.left) * ease;

          // Interpolating width/height independently (old approach) warps the
          // box through every intermediate aspect ratio between the chip's
          // landscape shape and the card's portrait shape for the *entire*
          // flight -- most visible right when the box is largest, which reads
          // as the photo squishing as it grows. Instead, resolve the aspect
          // ratio early (while the box is still small, over the first
          // SHAPE_EASE_FRACTION of the flight via shapeT below) via an
          // area-preserving blend, then let the remaining growth scale that
          // already-correct shape up uniformly, so no distortion is visible
          // once the card is prominent on screen.
          const SHAPE_EASE_FRACTION = 0.35;
          const shapeT = Math.min(1, ease / SHAPE_EASE_FRACTION);
          const startAspect = pair.start.width / pair.start.height;
          const endAspect = pair.end.width / pair.end.height;
          const aspect = startAspect + (endAspect - startAspect) * shapeT;
          const startArea = pair.start.width * pair.start.height;
          const endArea = pair.end.width * pair.end.height;
          const area = startArea + (endArea - startArea) * ease;
          const width = Math.sqrt(area * aspect);
          const height = Math.sqrt(area / aspect);
          const radius = pair.startRadius + (pair.endRadius - pair.startRadius) * ease;

          pair.flying.style.top = `${top}px`;
          pair.flying.style.left = `${left}px`;
          pair.flying.style.width = `${width}px`;
          pair.flying.style.height = `${height}px`;
          pair.flying.style.borderRadius = `${radius}px`;
        }
      });

      if (entry >= 1 && !cardsDocked) {
        cardsDocked = true;
        cardsRevealEl.classList.add('is-docked');
      } else if (entry < 0.9 && cardsDocked) {
        cardsDocked = false;
        cardsRevealEl.classList.remove('is-docked');
      }
    };

    let cardsTicking = false;
    const onCardsScroll = () => {
      if (!cardsTicking) {
        cardsTicking = true;
        requestAnimationFrame(() => {
          updateCardsReveal();
          cardsTicking = false;
        });
      }
    };

    let cardsResizeTimer;
    const onCardsResize = () => {
      measureCardFlight();
      updateCardsReveal();
      clearTimeout(cardsResizeTimer);
      cardsResizeTimer = setTimeout(() => {
        measureCardFlight();
        updateCardsReveal();
      }, 200);
    };

    measureCardFlight();
    updateCardsReveal();
    window.addEventListener('scroll', onCardsScroll, { passive: true });
    window.addEventListener('resize', rafCoalesce(onCardsResize));
    window.addEventListener('load', () => {
      measureCardFlight();
      updateCardsReveal();
    });

    // Mobile card flip: updateCardsReveal's own mobile branch above skips
    // the scroll-scrubbed is-flipped toggle entirely (no pinned dwell to
    // scrub against under 768px), so drive a quick one-shot flip off
    // viewport entry instead -- same replay-on-every-reentry pattern as
    // the fog-in observers further down this file.
    const cardsMobileFlipObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (window.innerWidth > 1023) return;
        cardsRevealEl.classList.toggle('is-mobile-flipped', entry.isIntersecting);
      });
    }, { threshold: 0.35, rootMargin: '0px 0px -10% 0px' });

    cardsMobileFlipObserver.observe(cardsRevealEl);
  }

  /* Work transition: "WORK selected projects" title screen between
     cards-reveal and the work-detail cover (see CSS for the full writeup
     of the two-layer clip-path technique this borrows from
     SCROLL-INTERACTIONS.md's Color-Invert Wipe). Same pinned-dwell +
     live-progress pattern as every section above -- entry/exit/dwell all
     read fresh off getBoundingClientRect() every scroll frame, no GSAP. */
  const workTransitionEl = document.querySelector('.work-transition');

  if (workTransitionEl) {
    const scrollerBaseEl = document.getElementById('workTransitionScrollerBase');
    const scrollerWipeEl = document.getElementById('workTransitionScrollerWipe');
    const wipeEl = document.getElementById('workTransitionWipe');

    // The wipe's reveal window sits centered on the dwell's own middle
    // third, not near the end -- the title should already be well
    // underway scrolling by the time the invert starts, and still
    // have room to keep scrolling after it ends.
    const WIPE_START = 0.4;
    const WIPE_END = 0.6;

    // SCROLL-INTERACTIONS.md's "A. Smoke Scroll": characters blur/fade/
    // drift up as they near the left edge, instead of being hard-clipped
    // by overflow: hidden. Both the base and wipe copies get their own
    // set of char spans (kept in sync since both scrollers always share
    // the same translateX), each pre-measured once via offsetLeft/Width
    // -- a layout property transforms don't affect -- so applying the
    // fade every scroll frame is a pure style write (no per-frame
    // getBoundingClientRect reads): viewport-x = static center + the
    // frame's own translateX.
    // FOG_START stays low (just under where "WORK" itself starts at rest)
    // so nothing pre-fades before any scrolling happens. FOG_END was pulled
    // in further (300 -> 150, a ~330px runway instead of 180px) and the
    // progress curve below is eased rather than linear -- feedback was that
    // the dissolve read as a fast "snap" instead of a gentle smoke-like
    // fade. FOG_MAX_BLUR pushed up again per "more blur is fine".
    // FOG_END pushed further negative still (150 -> -350, ~830px runway):
    // each char's own fade duration is span / slide-rate, and slide-rate is
    // fixed by section geometry (scrollToCenter / (SCROLL_PHASE_END *
    // dwellDist)) -- with the old 330px span that worked out to well under
    // one scroll gesture per character. Widening the span is what actually
    // stretches a single char's fade across multiple gestures; changing
    // SCROLL_PHASE_END alone (see below) only shifts how the *dwell* is
    // split, it doesn't change how far, in px, a char has to travel to fade.
    const FOG_START = 480; // px from the left edge where the fade begins
    const FOG_END = -350; // px from the left edge where it's essentially gone
    const FOG_MAX_BLUR = 65; // px of blur at full dissolve
    const FOG_RISE = 200; // px drifted upward at full dissolve
    // Blur no longer ramps linearly with progress: below FOG_BLUR_KNEE it
    // rises gently (FOG_BLUR_KNEE_BLUR px by that point), then steepens for
    // the remaining stretch to FOG_MAX_BLUR -- an extra "gets much blurrier
    // right before it's gone" stage layered on the existing fade/rise,
    // requested after the settle dissolve read as too quick/subtle to
    // actually see mid-scroll.
    const FOG_BLUR_KNEE = 0.55;
    const FOG_BLUR_KNEE_BLUR = 22;

    // Eases the 0-1 dissolve progress instead of a straight linear ramp, so
    // it reads as gradually thickening/thinning smoke rather than a hard
    // linear wipe -- same curve used for both the position-driven fade below
    // and the settle-fade in updateWorkTransition.
    const smoothstep = (t) => t * t * (3 - 2 * t);

    const titleBaseEl = scrollerBaseEl.querySelector('.work-transition__title');
    const titleWipeEl = scrollerWipeEl.querySelector('.work-transition__title');
    wrapChars(titleBaseEl, 'fog-char');
    wrapChars(titleWipeEl, 'fog-char');
    const fogCharsBase = Array.from(titleBaseEl.querySelectorAll('.fog-char')).map((el) => ({ el, center: 0 }));
    const fogCharsWipe = Array.from(titleWipeEl.querySelectorAll('.fog-char')).map((el) => ({ el, center: 0 }));

    const measureFogChars = () => {
      [...fogCharsBase, ...fogCharsWipe].forEach((c) => {
        c.center = c.el.offsetLeft + c.el.offsetWidth / 2;
      });
    };
    measureFogChars();
    // If the custom webfont ('Neue Montreal' etc.) is still loading at this
    // point, these centers are measured against the fallback font's (usually
    // narrower) glyph widths. Once the real font swaps in, layout reflows
    // but nothing re-measures until the next resize -- so every char's
    // "static" center stays off by a growing amount toward the end of the
    // string, which was pushing all of "projects" past centerX and making
    // them clamp to the same staggerDelay (one chunk fading together
    // instead of one at a time). Re-measuring once fonts actually settle
    // fixes that permanently for the rest of the session.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measureFogChars);
    }

    // Once translateX freezes (phase 2 in updateWorkTransition), the whole
    // still-visible cluster used to fade as one flat block -- every char
    // sharing the same settleProgress. The stagger below instead delays each
    // char's settle-fade by how far its *frozen* position sits from center:
    // a char already left of the window starts dissolving the instant phase
    // 2 begins (delay 0), while a char sitting right at center (the last
    // one) is held back until near the very end -- so the cluster dissolves
    // left-to-right, one at a time, not in one puff.
    //
    // Each char's own fade uses the same fixed FADE_DURATION (a slice of
    // settleProgress), only the start time (staggerDelay) shifts per char --
    // that keeps every char's dissolve speed identical (same as before) and
    // only changes when it starts. The earlier version instead divided by
    // (1 - staggerDelay), which made chars nearer center fade *faster* than
    // earlier ones and, combined with delays capped at 0.6, packed most
    // chars' fade windows so close together they visibly overlapped almost
    // entirely -- reading as "falling together" instead of one-by-one, even
    // though their still-frame opacities technically differed. Spreading
    // delays across the full 0..(1 - FADE_DURATION) range with a fixed
    // duration keeps every char's own pace the same while making adjacent
    // chars' start times clearly separated.
    const FADE_DURATION = 0.45;

    // extraFade0 is the settle-phase's own (unstaggered) 0-1 progress from
    // updateWorkTransition's phase 2; combined with Math.max so it can only
    // ever push a char further toward invisible, never undo the
    // position-based fade that already ran during phase 1.
    const applyFogChars = (chars, x, settleProgress = 0, centerX = 0) => {
      const staggerSpanPx = Math.max(1, centerX - FOG_END);
      chars.forEach((c) => {
        const viewportX = c.center + x;
        const linear = Math.min(1, Math.max(0, (FOG_START - viewportX) / (FOG_START - FOG_END)));
        const positional = smoothstep(linear);
        let extra = 0;
        if (settleProgress > 0) {
          const normalizedPos = Math.min(1, Math.max(0, (viewportX - (centerX - staggerSpanPx)) / staggerSpanPx));
          const staggerDelay = normalizedPos * (1 - FADE_DURATION);
          const staggeredT = Math.min(1, Math.max(0, (settleProgress - staggerDelay) / FADE_DURATION));
          extra = smoothstep(staggeredT);
        }
        const progress = Math.max(positional, extra);
        if (progress <= 0) {
          c.el.style.opacity = '';
          c.el.style.filter = '';
          c.el.style.transform = '';
        } else {
          c.el.style.opacity = String(1 - progress);
          // See FOG_BLUR_KNEE below -- blur ramps faster than opacity past
          // that point, so the char reads as thickening into heavy fog
          // right before it fully vanishes instead of thinning evenly.
          const blurRamp = progress <= FOG_BLUR_KNEE
            ? progress * (FOG_BLUR_KNEE_BLUR / FOG_BLUR_KNEE)
            : FOG_BLUR_KNEE_BLUR + ((progress - FOG_BLUR_KNEE) / (1 - FOG_BLUR_KNEE)) * (FOG_MAX_BLUR - FOG_BLUR_KNEE_BLUR);
          c.el.style.filter = `blur(${blurRamp}px)`;
          c.el.style.transform = `translateY(${-progress * FOG_RISE}px)`;
        }
      });
    };

    const getWorkTransitionEntryProgress = () => {
      const rect = workTransitionEl.getBoundingClientRect();
      const vh = window.innerHeight;
      return Math.min(1, Math.max(0, (vh - rect.top) / vh));
    };

    const getWorkTransitionExitProgress = () => {
      const rect = workTransitionEl.getBoundingClientRect();
      const vh = window.innerHeight;
      return Math.min(1, Math.max(0, rect.bottom / vh));
    };

    const getWorkTransitionDwellProgress = () => {
      const rect = workTransitionEl.getBoundingClientRect();
      const dwellDist = workTransitionEl.offsetHeight - window.innerHeight;
      return dwellDist > 0 ? Math.min(1, Math.max(0, -rect.top / dwellDist)) : 0;
    };

    const updateWorkTransition = () => {
      // Mobile fallback (see CSS): static stacked end-state, no pin/scrub.
      // Also clears any fog-char styles left over from a desktop-width
      // scroll before the viewport was resized down.
      if (window.innerWidth <= 1023) {
        workTransitionDarkContribution = 0;
        applyCombinedDarkState();
        [...fogCharsBase, ...fogCharsWipe].forEach((c) => {
          c.el.style.opacity = '';
          c.el.style.filter = '';
          c.el.style.transform = '';
        });
        return;
      }

      const entry = getWorkTransitionEntryProgress();
      const exit = getWorkTransitionExitProgress();
      const dwellProgress = entry >= 1 ? getWorkTransitionDwellProgress() : 0;

      // Both scroller copies (base + wipe) move by the exact same amount
      // every frame -- that's what makes the wipe read as one continuous
      // title inverting color rather than two independently-scrolling
      // texts sliding past each other.
      //
      // Scroll distance is measured off the title's own right edge
      // (offsetLeft/offsetWidth, unaffected by the transform), not
      // scrollWidth - viewportWidth: that old formula only scrolled far
      // enough for the content's trailing padding to reach the viewport's
      // right edge, so on any normal-width screen "projects" stalled out
      // well short of FOG_START and never dissolved -- it just sat parked
      // near the right side of the screen at the end of the dwell.
      //
      // Two phases, not one continuous scroll: the reference (see
      // frame_036 of the captured riadmammadov.com video) shows the last
      // glyph stall right around screen-center and blur away in place --
      // it never keeps sliding toward the edge. So the first
      // SCROLL_PHASE_END share of the dwell translates the title left
      // until the last character's right edge reaches horizontal center;
      // the remaining share freezes translateX there and drives a
      // position-independent "settle" fade (below) that finishes
      // dissolving whatever's still visible, so the pin releases into
      // work-detail right as that settle completes instead of the text
      // continuing to travel left.
      const centerX = workTransitionEl.getBoundingClientRect().width / 2;
      const contentEnd = titleBaseEl.offsetLeft + titleBaseEl.offsetWidth;
      const scrollToCenter = Math.max(0, contentEnd - centerX);

      // The *primary* per-char dissolve is actually this phase, not settle
      // below: applyFogChars' positional fade dissolves each char the
      // instant its slid (x-shifted) screen position crosses FOG_START..
      // FOG_END, so as the title slides left every char fades in turn, one
      // at a time, at whatever rate the slide itself moves. That rate is
      // scrollToCenter / (SCROLL_PHASE_END * dwellDist) -- raising
      // SCROLL_PHASE_END (more of the dwell spent sliding) directly slows
      // that rate, i.e. more real scroll input per char dissolved. Was
      // 0.85, then dropped to 0.65 so settle (below) wouldn't collapse into
      // 1-2 frames -- but that trade-off was backwards: shrinking this
      // value speeds the slide up, so the leading chars were dissolving
      // almost instantly (confirmed: "S" already fully gone after a single
      // 5-notch wheel burst). Settle only has to carry the handful of
      // trailing chars that freeze mid-slide, which needs far less of the
      // dwell than the whole positional cascade does -- so this goes back
      // up, higher than either previous value, to actually spread every
      // char's own dissolve across multiple real scroll gestures.
      const SCROLL_PHASE_END = 0.78;
      const scrollPhaseProgress = Math.min(1, dwellProgress / SCROLL_PHASE_END);
      const x = -scrollToCenter * scrollPhaseProgress;
      // Raw (unstaggered, uneased) 0-1 progress through phase 2 -- each
      // char in applyFogChars derives its own staggered/eased version of
      // this from its frozen distance to centerX.
      const settleProgress = Math.min(1, Math.max(0, (dwellProgress - SCROLL_PHASE_END) / (1 - SCROLL_PHASE_END)));

      const xPx = `${x}px`;
      scrollerBaseEl.style.transform = `translateX(${xPx})`;
      scrollerWipeEl.style.transform = `translateX(${xPx})`;
      applyFogChars(fogCharsBase, x, settleProgress, centerX);
      applyFogChars(fogCharsWipe, x, settleProgress, centerX);

      // clip-path grows left-to-right from the right edge: 100% (hidden)
      // down to 0% (full width) as wipeProgress goes 0 -> 1.
      const wipeProgress = Math.min(1, Math.max(0, (dwellProgress - WIPE_START) / (WIPE_END - WIPE_START)));
      const revealFrom = 100 - wipeProgress * 100;
      wipeEl.style.clipPath = `polygon(${revealFrom}% 0%, 100% 0%, 100% 100%, ${revealFrom}% 100%)`;

      // Dark contribution fades out as the wipe completes (screen turns
      // white), same entry/exit-gated pattern as reason-quote/cards-reveal
      // above so the header only inverts back while this section is
      // actually the one on screen.
      workTransitionDarkContribution = 0;
      applyCombinedDarkState();
    };

    let workTransitionTicking = false;
    const onWorkTransitionScroll = () => {
      if (!workTransitionTicking) {
        workTransitionTicking = true;
        requestAnimationFrame(() => {
          updateWorkTransition();
          workTransitionTicking = false;
        });
      }
    };

    let workTransitionResizeTimer;
    const onWorkTransitionResize = () => {
      measureFogChars();
      updateWorkTransition();
      clearTimeout(workTransitionResizeTimer);
      workTransitionResizeTimer = setTimeout(() => {
        measureFogChars();
        updateWorkTransition();
      }, 200);
    };

    updateWorkTransition();
    window.addEventListener('scroll', onWorkTransitionScroll, { passive: true });
    window.addEventListener('resize', rafCoalesce(onWorkTransitionResize));
  }

  const isMobileFogViewport = () => window.innerWidth <= 1023;
  const mobileTransitionFogEls = Array.from(document.querySelectorAll('.work-transition, .skill-transition, .about-transition'));
  if (mobileTransitionFogEls.length) {
    const mobileTransitionFogObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!isMobileFogViewport()) return;
        entry.target.classList.toggle('is-mobile-fog-visible', entry.isIntersecting);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    mobileTransitionFogEls.forEach((el) => mobileTransitionFogObserver.observe(el));
  }

  // Skill-transition: 1:1 mirror of the work-transition block above (same
  // scroll-in title, per-char fog dissolve, mid-dwell clip-path wipe) --
  // only the light/dark roles invert. Base starts white/black text and the
  // wipe reveals black/white text, so unlike work-transition (dark
  // contribution fades OUT as the wipe completes) this one fades dark
  // contribution IN as the wipe completes, since the dark state only
  // exists *after* the reveal here.
  const skillTransitionEl = document.querySelector('.skill-transition');

  if (skillTransitionEl) {
    const skillScrollerBaseEl = document.getElementById('skillTransitionScrollerBase');
    const skillScrollerWipeEl = document.getElementById('skillTransitionScrollerWipe');
    const skillWipeEl = document.getElementById('skillTransitionWipe');

    // Local copy of work-transition's own smoothstep -- that one is scoped
    // inside the `if (workTransitionEl)` block above, out of reach here.
    const smoothstep = (t) => t * t * (3 - 2 * t);

    const SKILL_WIPE_START = 0.4;
    const SKILL_WIPE_END = 0.6;

    // Lower than work-transition's 480: "SKILL " is narrower than "WORK ",
    // so its first char sits further left at rest -- 480 would still catch
    // it in the blur window before any scrolling happens. 430 sits just
    // under where "S" actually starts at rest, same margin work-transition
    // keeps for "W".
    const SKILL_FOG_START = 400;
    // See FOG_END in updateWorkTransition -- widened the same way (150 ->
    // -350) so each char's own fade spans multiple scroll gestures instead
    // of finishing inside one.
    const SKILL_FOG_END = -350;
    const SKILL_FOG_MAX_BLUR = 65;
    const SKILL_FOG_RISE = 200;
    // See FOG_BLUR_KNEE in updateWorkTransition -- same two-tier blur ramp,
    // kept in sync.
    const SKILL_FOG_BLUR_KNEE = 0.55;
    const SKILL_FOG_BLUR_KNEE_BLUR = 22;

    const skillTitleBaseEl = skillScrollerBaseEl.querySelector('.skill-transition__title');
    const skillTitleWipeEl = skillScrollerWipeEl.querySelector('.skill-transition__title');
    wrapChars(skillTitleBaseEl, 'fog-char');
    wrapChars(skillTitleWipeEl, 'fog-char');
    const skillFogCharsBase = Array.from(skillTitleBaseEl.querySelectorAll('.fog-char')).map((el) => ({ el, center: 0 }));
    const skillFogCharsWipe = Array.from(skillTitleWipeEl.querySelectorAll('.fog-char')).map((el) => ({ el, center: 0 }));

    const measureSkillFogChars = () => {
      [...skillFogCharsBase, ...skillFogCharsWipe].forEach((c) => {
        c.center = c.el.offsetLeft + c.el.offsetWidth / 2;
      });
    };
    measureSkillFogChars();
    // See the matching comment in the work-transition block above -- webfont
    // swap-in after the initial measure was leaving these centers stale.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measureSkillFogChars);
    }

    const SKILL_FADE_DURATION = 0.45;

    const applySkillFogChars = (chars, x, settleProgress = 0, centerX = 0) => {
      const staggerSpanPx = Math.max(1, centerX - SKILL_FOG_END);
      chars.forEach((c) => {
        const viewportX = c.center + x;
        const linear = Math.min(1, Math.max(0, (SKILL_FOG_START - viewportX) / (SKILL_FOG_START - SKILL_FOG_END)));
        const positional = smoothstep(linear);
        let extra = 0;
        if (settleProgress > 0) {
          const normalizedPos = Math.min(1, Math.max(0, (viewportX - (centerX - staggerSpanPx)) / staggerSpanPx));
          const staggerDelay = normalizedPos * (1 - SKILL_FADE_DURATION);
          const staggeredT = Math.min(1, Math.max(0, (settleProgress - staggerDelay) / SKILL_FADE_DURATION));
          extra = smoothstep(staggeredT);
        }
        const progress = Math.max(positional, extra);
        if (progress <= 0) {
          c.el.style.opacity = '';
          c.el.style.filter = '';
          c.el.style.transform = '';
        } else {
          c.el.style.opacity = String(1 - progress);
          const blurRamp = progress <= SKILL_FOG_BLUR_KNEE
            ? progress * (SKILL_FOG_BLUR_KNEE_BLUR / SKILL_FOG_BLUR_KNEE)
            : SKILL_FOG_BLUR_KNEE_BLUR
              + ((progress - SKILL_FOG_BLUR_KNEE) / (1 - SKILL_FOG_BLUR_KNEE)) * (SKILL_FOG_MAX_BLUR - SKILL_FOG_BLUR_KNEE_BLUR);
          c.el.style.filter = `blur(${blurRamp}px)`;
          c.el.style.transform = `translateY(${-progress * SKILL_FOG_RISE}px)`;
        }
      });
    };

    const getSkillTransitionEntryProgress = () => {
      const rect = skillTransitionEl.getBoundingClientRect();
      const vh = window.innerHeight;
      return Math.min(1, Math.max(0, (vh - rect.top) / vh));
    };

    const getSkillTransitionExitProgress = () => {
      const rect = skillTransitionEl.getBoundingClientRect();
      const vh = window.innerHeight;
      // Mobile: same fix as skill-content's exit progress below -- a
      // vh-wide margin means this stays nonzero well past skill-transition's
      // own footprint (it's much shorter than a full viewport, ~52svh), so
      // it was still feeding the shared overlay dark all the way through
      // skill-content and bleeding into about-transition/gallery below.
      if (window.innerWidth <= 1023) {
        return rect.bottom > 80 ? 1 : 0;
      }
      return Math.min(1, Math.max(0, rect.bottom / vh));
    };

    const getSkillTransitionDwellProgress = () => {
      const rect = skillTransitionEl.getBoundingClientRect();
      const dwellDist = skillTransitionEl.offsetHeight - window.innerHeight;
      return dwellDist > 0 ? Math.min(1, Math.max(0, -rect.top / dwellDist)) : 0;
    };

    darkContributionRefreshers.push(() => {
      const entry = getSkillTransitionEntryProgress();
      const exit = getSkillTransitionExitProgress();
      if (window.innerWidth <= 1023) {
        skillTransitionDarkContribution = Math.min(entry, exit);
        return;
      }
      const dwellProgress = entry >= 1 ? getSkillTransitionDwellProgress() : 0;
      const wipeProgress = Math.min(1, Math.max(0, (dwellProgress - SKILL_WIPE_START) / (SKILL_WIPE_END - SKILL_WIPE_START)));
      skillTransitionDarkContribution = Math.min(entry, exit) * wipeProgress;
    });

    const updateSkillTransition = () => {
      // Mobile fallback (see CSS): static stacked end-state, no pin/scrub --
      // same "reveal as one whole block" pattern as work-transition/
      // about-transition (.is-mobile-fog-visible, toggled once by
      // mobileTransitionFogObserver above), not a continuous per-char
      // scroll-driven dissolve. Also clears any fog-char styles left over
      // from a desktop-width scroll before the viewport was resized down.
      if (window.innerWidth <= 1023) {
        const entry = getSkillTransitionEntryProgress();
        const exit = getSkillTransitionExitProgress();
        skillTransitionDarkContribution = Math.min(entry, exit);
        applyCombinedDarkState();
        [...skillFogCharsBase, ...skillFogCharsWipe].forEach((c) => {
          c.el.style.opacity = '';
          c.el.style.filter = '';
          c.el.style.transform = '';
        });
        return;
      }

      const entry = getSkillTransitionEntryProgress();
      const exit = getSkillTransitionExitProgress();
      const dwellProgress = entry >= 1 ? getSkillTransitionDwellProgress() : 0;

      const centerX = skillTransitionEl.getBoundingClientRect().width / 2;
      const contentEnd = skillTitleBaseEl.offsetLeft + skillTitleBaseEl.offsetWidth;
      const scrollToCenter = Math.max(0, contentEnd - centerX);

      // See SCROLL_PHASE_END in updateWorkTransition -- raised to 0.78 to
      // slow the slide phase itself (the primary per-char positional
      // dissolve), kept in sync.
      const SKILL_SCROLL_PHASE_END = 0.78;
      const scrollPhaseProgress = Math.min(1, dwellProgress / SKILL_SCROLL_PHASE_END);
      const x = -scrollToCenter * scrollPhaseProgress;
      const settleProgress = Math.min(1, Math.max(0, (dwellProgress - SKILL_SCROLL_PHASE_END) / (1 - SKILL_SCROLL_PHASE_END)));

      const xPx = `${x}px`;
      skillScrollerBaseEl.style.transform = `translateX(${xPx})`;
      skillScrollerWipeEl.style.transform = `translateX(${xPx})`;
      applySkillFogChars(skillFogCharsBase, x, settleProgress, centerX);
      applySkillFogChars(skillFogCharsWipe, x, settleProgress, centerX);

      const wipeProgress = Math.min(1, Math.max(0, (dwellProgress - SKILL_WIPE_START) / (SKILL_WIPE_END - SKILL_WIPE_START)));
      const revealFrom = 100 - wipeProgress * 100;
      skillWipeEl.style.clipPath = `polygon(${revealFrom}% 0%, 100% 0%, 100% 100%, ${revealFrom}% 100%)`;

      // Flipped vs. work-transition: dark contribution grows WITH
      // wipeProgress instead of shrinking, since the black state is the
      // *end* state here, not the start.
      skillTransitionDarkContribution = Math.min(entry, exit) * wipeProgress;
      applyCombinedDarkState();
    };

    let skillTransitionTicking = false;
    const onSkillTransitionScroll = () => {
      if (!skillTransitionTicking) {
        skillTransitionTicking = true;
        requestAnimationFrame(() => {
          updateSkillTransition();
          skillTransitionTicking = false;
        });
      }
    };

    let skillTransitionResizeTimer;
    const onSkillTransitionResize = () => {
      measureSkillFogChars();
      updateSkillTransition();
      clearTimeout(skillTransitionResizeTimer);
      skillTransitionResizeTimer = setTimeout(() => {
        measureSkillFogChars();
        updateSkillTransition();
      }, 200);
    };

    updateSkillTransition();
    window.addEventListener('scroll', onSkillTransitionScroll, { passive: true });
    window.addEventListener('resize', rafCoalesce(onSkillTransitionResize));
  }

  /* Skill-content: solid black section right after the skill-transition
     wipe. skillTransitionDarkContribution (above) only covers the wipe
     itself and fades back to 0 as soon as its bottom edge clears the
     header -- exactly when this section takes over -- so without a
     contribution of its own here the header would flip back to
     non-inverted for the rest of the scroll through this section,
     leaving the black "SKILL" active nav link invisible against its
     black background. Same plain entry/exit crossfade as reason-quote;
     no dwell/wipe math needed since it's uniformly black throughout. */
  const skillContentEl = document.querySelector('.skill-content');

  if (skillContentEl) {
    const getSkillContentEntryProgress = () => {
      const rect = skillContentEl.getBoundingClientRect();
      const vh = window.innerHeight;
      return Math.min(1, Math.max(0, (vh - rect.top) / vh));
    };

    const getSkillContentExitProgress = () => {
      const rect = skillContentEl.getBoundingClientRect();
      const vh = window.innerHeight;
      // Mobile: skill-content already paints its own solid black background,
      // so this contribution's only real job here is keeping the header
      // inverted while the header still physically overlaps skill-content's
      // remaining black sliver -- it should NOT also fade the shared
      // full-viewport overlay across the rest of the (already-visible,
      // meant to stay plain white) about-transition/gallery content below.
      // A step tied to the header's own height removes that gradual wash
      // entirely instead of merely shortening it.
      if (window.innerWidth <= 1023) {
        return rect.bottom > 80 ? 1 : 0;
      }
      return Math.min(1, Math.max(0, rect.bottom / vh));
    };

    darkContributionRefreshers.push(() => {
      const entry = getSkillContentEntryProgress();
      const exit = getSkillContentExitProgress();
      if (window.innerWidth <= 1023) {
        skillContentDarkContribution = 0;
        skillContentHeaderOverlap = Math.min(entry, exit);
      } else {
        skillContentDarkContribution = Math.min(entry, exit);
        skillContentHeaderOverlap = 0;
      }
    });

    const updateSkillContentDark = () => {
      const entry = getSkillContentEntryProgress();
      const exit = getSkillContentExitProgress();
      // On mobile this used to feed skillContentDarkContribution directly,
      // which -- via applyCombinedDarkState's shared Math.max -- pinned the
      // full-viewport #scrollDarkOverlay fully opaque for the entire stretch
      // where rect.bottom stayed above 80 (until skill-content's remnant
      // cleared the header), then snapped it to 0. That stretch reaches well
      // past the about-transition wipe into the gallery reveal below, so the
      // whole screen (including the gallery's own cards, visible through the
      // WebGL canvas's transparent gaps) rendered solid black and then
      // flashed bright the instant the step flipped -- exactly the "dark
      // then suddenly bright" flash reported entering the gallery section.
      // Route it to the header-only signal instead: skill-content's own
      // background is already opaque black, so the overlay never needed
      // this contribution to look dark in the first place.
      if (window.innerWidth <= 1023) {
        skillContentDarkContribution = 0;
        skillContentHeaderOverlap = Math.min(entry, exit);
      } else {
        skillContentDarkContribution = Math.min(entry, exit);
        skillContentHeaderOverlap = 0;
      }
      applyCombinedDarkState();
    };

    let skillContentTicking = false;
    const onSkillContentScroll = () => {
      if (!skillContentTicking) {
        skillContentTicking = true;
        requestAnimationFrame(() => {
          updateSkillContentDark();
          skillContentTicking = false;
        });
      }
    };

    updateSkillContentDark();
    window.addEventListener('scroll', onSkillContentScroll, { passive: true });
    window.addEventListener('resize', rafCoalesce(updateSkillContentDark));
  }

  /* About transition: "ABOUT more about me" title screen right after
     skill-content, before the ABOUT section proper. 1:1 mirror of the
     work-transition block above -- same scroll-in title, per-char fog
     dissolve, mid-dwell clip-path wipe -- and the same black-to-white
     direction (dark contribution starts high and fades OUT as the wipe
     completes), not skill-transition's white-to-black. */
  const aboutTransitionEl = document.querySelector('.about-transition');

  if (aboutTransitionEl) {
    const aboutScrollerBaseEl = document.getElementById('aboutTransitionScrollerBase');
    const aboutScrollerWipeEl = document.getElementById('aboutTransitionScrollerWipe');
    const aboutWipeEl = document.getElementById('aboutTransitionWipe');

    // Local copy of work-transition's own smoothstep -- that one is scoped
    // inside the `if (workTransitionEl)` block above, out of reach here.
    const smoothstep = (t) => t * t * (3 - 2 * t);

    const ABOUT_WIPE_START = 0.4;
    const ABOUT_WIPE_END = 0.6;

    // "A"'s rest-state center sits at ~414px (narrower than "W"'s ~454px),
    // so work-transition's 480 start left it already ~10% dissolved before
    // any scrolling -- same issue SKILL_FOG_START's 400 was tuned to avoid
    // for "S". 380 sits just under where "A" starts at rest so the fade
    // zone doesn't reach it until scroll actually pushes it left.
    const ABOUT_FOG_START = 380;
    // See FOG_END in updateWorkTransition -- widened the same way (150 ->
    // -350) so each char's own fade spans multiple scroll gestures instead
    // of finishing inside one.
    const ABOUT_FOG_END = -350;
    const ABOUT_FOG_MAX_BLUR = 65;
    const ABOUT_FOG_RISE = 200;
    // See FOG_BLUR_KNEE in updateWorkTransition -- same two-tier blur ramp,
    // kept in sync.
    const ABOUT_FOG_BLUR_KNEE = 0.55;
    const ABOUT_FOG_BLUR_KNEE_BLUR = 22;

    const aboutTitleBaseEl = aboutScrollerBaseEl.querySelector('.about-transition__title');
    const aboutTitleWipeEl = aboutScrollerWipeEl.querySelector('.about-transition__title');
    wrapChars(aboutTitleBaseEl, 'fog-char');
    wrapChars(aboutTitleWipeEl, 'fog-char');
    const aboutFogCharsBase = Array.from(aboutTitleBaseEl.querySelectorAll('.fog-char')).map((el) => ({ el, center: 0 }));
    const aboutFogCharsWipe = Array.from(aboutTitleWipeEl.querySelectorAll('.fog-char')).map((el) => ({ el, center: 0 }));

    const measureAboutFogChars = () => {
      [...aboutFogCharsBase, ...aboutFogCharsWipe].forEach((c) => {
        c.center = c.el.offsetLeft + c.el.offsetWidth / 2;
      });
    };
    measureAboutFogChars();
    // See the matching comment in the work-transition block above -- webfont
    // swap-in after the initial measure was leaving these centers stale.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measureAboutFogChars);
    }

    const ABOUT_FADE_DURATION = 0.45;

    const applyAboutFogChars = (chars, x, settleProgress = 0, centerX = 0) => {
      const staggerSpanPx = Math.max(1, centerX - ABOUT_FOG_END);
      chars.forEach((c) => {
        const viewportX = c.center + x;
        const linear = Math.min(1, Math.max(0, (ABOUT_FOG_START - viewportX) / (ABOUT_FOG_START - ABOUT_FOG_END)));
        const positional = smoothstep(linear);
        let extra = 0;
        if (settleProgress > 0) {
          const normalizedPos = Math.min(1, Math.max(0, (viewportX - (centerX - staggerSpanPx)) / staggerSpanPx));
          const staggerDelay = normalizedPos * (1 - ABOUT_FADE_DURATION);
          const staggeredT = Math.min(1, Math.max(0, (settleProgress - staggerDelay) / ABOUT_FADE_DURATION));
          extra = smoothstep(staggeredT);
        }
        const progress = Math.max(positional, extra);
        if (progress <= 0) {
          c.el.style.opacity = '';
          c.el.style.filter = '';
          c.el.style.transform = '';
        } else {
          c.el.style.opacity = String(1 - progress);
          const blurRamp = progress <= ABOUT_FOG_BLUR_KNEE
            ? progress * (ABOUT_FOG_BLUR_KNEE_BLUR / ABOUT_FOG_BLUR_KNEE)
            : ABOUT_FOG_BLUR_KNEE_BLUR
              + ((progress - ABOUT_FOG_BLUR_KNEE) / (1 - ABOUT_FOG_BLUR_KNEE)) * (ABOUT_FOG_MAX_BLUR - ABOUT_FOG_BLUR_KNEE_BLUR);
          c.el.style.filter = `blur(${blurRamp}px)`;
          c.el.style.transform = `translateY(${-progress * ABOUT_FOG_RISE}px)`;
        }
      });
    };

    const getAboutTransitionEntryProgress = () => {
      const rect = aboutTransitionEl.getBoundingClientRect();
      const vh = window.innerHeight;
      return Math.min(1, Math.max(0, (vh - rect.top) / vh));
    };

    const getAboutTransitionExitProgress = () => {
      const rect = aboutTransitionEl.getBoundingClientRect();
      const vh = window.innerHeight;
      return Math.min(1, Math.max(0, rect.bottom / vh));
    };

    const getAboutTransitionDwellProgress = () => {
      const rect = aboutTransitionEl.getBoundingClientRect();
      const dwellDist = aboutTransitionEl.offsetHeight - window.innerHeight;
      return dwellDist > 0 ? Math.min(1, Math.max(0, -rect.top / dwellDist)) : 0;
    };

    darkContributionRefreshers.push(() => {
      // Forced to 0 for the same reason updateAboutTransition itself skips
      // its normal calculation during a nav-jump -- see that function.
      if (suspendNavJumpVisuals || window.innerWidth <= 1023) {
        aboutTransitionDarkContribution = 0;
        return;
      }
      const entry = getAboutTransitionEntryProgress();
      const exit = getAboutTransitionExitProgress();
      const dwellProgress = entry >= 1 ? getAboutTransitionDwellProgress() : 0;
      const wipeProgress = Math.min(1, Math.max(0, (dwellProgress - ABOUT_WIPE_START) / (ABOUT_WIPE_END - ABOUT_WIPE_START)));
      aboutTransitionDarkContribution = Math.min(entry, exit) * (1 - wipeProgress);
    });

    const updateAboutTransition = () => {
      if (window.innerWidth <= 1023) {
        aboutTransitionDarkContribution = 0;
        applyCombinedDarkState();
        [...aboutFogCharsBase, ...aboutFogCharsWipe].forEach((c) => {
          c.el.style.opacity = '';
          c.el.style.filter = '';
          c.el.style.transform = '';
        });
        return;
      }

      // Unlike the header/overlay race this same flag also guards elsewhere,
      // this section isn't fighting another listener -- it's a real, solid
      // black 440vh block (.about-transition's own background, independent
      // of #scrollDarkOverlay) that a nav-jump's smooth-scroll has to cross
      // in a second or two. Left to animate normally, that plays its black
      // -> white wipe reveal in whatever compressed time the jump takes,
      // which reads as an unwanted flash rather than the deliberate
      // scroll-paced reveal it's designed to be. Snapping straight to the
      // fully-revealed end state keeps it looking "already done" for the
      // whole jump; the 'scrollend' resume callback recomputes the real
      // state for wherever the jump actually lands once it's over.
      if (suspendNavJumpVisuals) {
        const centerX = aboutTransitionEl.getBoundingClientRect().width / 2;
        const contentEnd = aboutTitleBaseEl.offsetLeft + aboutTitleBaseEl.offsetWidth;
        const scrollToCenter = Math.max(0, contentEnd - centerX);
        const xPx = `${-scrollToCenter}px`;
        aboutScrollerBaseEl.style.transform = `translateX(${xPx})`;
        aboutScrollerWipeEl.style.transform = `translateX(${xPx})`;
        applyAboutFogChars(aboutFogCharsBase, -scrollToCenter, 1, centerX);
        applyAboutFogChars(aboutFogCharsWipe, -scrollToCenter, 1, centerX);
        aboutWipeEl.style.clipPath = 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';
        aboutTransitionDarkContribution = 0;
        return;
      }

      const entry = getAboutTransitionEntryProgress();
      const exit = getAboutTransitionExitProgress();
      const dwellProgress = entry >= 1 ? getAboutTransitionDwellProgress() : 0;

      const centerX = aboutTransitionEl.getBoundingClientRect().width / 2;
      const contentEnd = aboutTitleBaseEl.offsetLeft + aboutTitleBaseEl.offsetWidth;
      const scrollToCenter = Math.max(0, contentEnd - centerX);

      // See SCROLL_PHASE_END in updateWorkTransition -- raised to 0.78 to
      // slow the slide phase itself (the primary per-char positional
      // dissolve), kept in sync.
      const ABOUT_SCROLL_PHASE_END = 0.78;
      const scrollPhaseProgress = Math.min(1, dwellProgress / ABOUT_SCROLL_PHASE_END);
      const x = -scrollToCenter * scrollPhaseProgress;
      const settleProgress = Math.min(1, Math.max(0, (dwellProgress - ABOUT_SCROLL_PHASE_END) / (1 - ABOUT_SCROLL_PHASE_END)));

      const xPx = `${x}px`;
      aboutScrollerBaseEl.style.transform = `translateX(${xPx})`;
      aboutScrollerWipeEl.style.transform = `translateX(${xPx})`;
      applyAboutFogChars(aboutFogCharsBase, x, settleProgress, centerX);
      applyAboutFogChars(aboutFogCharsWipe, x, settleProgress, centerX);

      const wipeProgress = Math.min(1, Math.max(0, (dwellProgress - ABOUT_WIPE_START) / (ABOUT_WIPE_END - ABOUT_WIPE_START)));
      const revealFrom = 100 - wipeProgress * 100;
      aboutWipeEl.style.clipPath = `polygon(${revealFrom}% 0%, 100% 0%, 100% 100%, ${revealFrom}% 100%)`;

      // Same as work-transition: dark contribution fades OUT as the wipe
      // completes (screen turns white), since black is the *start* state
      // here, not the end.
      aboutTransitionDarkContribution = Math.min(entry, exit) * (1 - wipeProgress);
      applyCombinedDarkState();
    };

    let aboutTransitionTicking = false;
    const onAboutTransitionScroll = () => {
      if (!aboutTransitionTicking) {
        aboutTransitionTicking = true;
        requestAnimationFrame(() => {
          updateAboutTransition();
          aboutTransitionTicking = false;
        });
      }
    };

    let aboutTransitionResizeTimer;
    const onAboutTransitionResize = () => {
      measureAboutFogChars();
      updateAboutTransition();
      clearTimeout(aboutTransitionResizeTimer);
      aboutTransitionResizeTimer = setTimeout(() => {
        measureAboutFogChars();
        updateAboutTransition();
      }, 200);
    };

    updateAboutTransition();
    window.addEventListener('scroll', onAboutTransitionScroll, { passive: true });
    window.addEventListener('resize', rafCoalesce(onAboutTransitionResize));
    navJumpResumeCallbacks.push(updateAboutTransition);
  }

  /* Gallery interaction ("WHAT shapes ME"): ported from the standalone
     gallery-interaction-clone project (see GALLERY_INTERACTION_GUIDE.md) --
     a WebGL canvas of 24 photo cards that morphs scatter -> line -> ring ->
     orbiting arc as the user scrolls. The clone drove this off
     window.scrollY / document scrollHeight (whole page); here progress is
     rescoped to this section's own sticky-pinned scroll range, mirroring
     the about-transition dwell-progress pattern above. Header/scroll-rail/
     footer from the clone are dropped -- the portfolio has its own. */
  const galleryInteractionEl = document.querySelector('.gallery-interaction');

  if (galleryInteractionEl) {
    const subTextItems = [
      {
        title: 'TRAVEL',
        lines: ['다양한 환경을 경험하며', '더 넓은 시각으로 세상을 바라봅니다.'],
      },
      {
        title: 'EXHIBITION',
        lines: [
          '전시를 통해 다양한 시각과 표현 방식을 접하며',
          '디자인의 영감을 넓혀갑니다.',
        ],
      },
      {
        title: 'CONCERT',
        lines: ['무대가 전하는 감정과 에너지를 경험하며', '몰입의 가치를 느낍니다.'],
      },
      {
        title: 'MUSIC',
        lines: [
          '전공을 마친 지금도 음악은',
          '제 일상 속에서 감각과 영감을 이어주는 소중한 존재입니다.',
        ],
      },
      {
        title: 'PHOTOGRAPHY',
        lines: [
          '사진의 프레임 안에서 구도와 색감을 익히며,',
          '일상의 따뜻한 순간과 감정을 바라보는 시선도 함께 넓혀왔습니다.',
        ],
      },
    ];
    // ABOUT gallery text timing knobs:
    // - subTextChangePoints controls when each label appears, in visualProgress.
    //   Order: TRAVEL, EXHIBITION, CONCERT, MUSIC, PHOTOGRAPHY.
    //   Move a number lower to show that label earlier, higher to show it later.
    // - GALLERY_LABEL_SCROLL_SCALE controls the wheel resistance while these
    //   labels are active. Lower = more held/resistant, higher = freer scroll.
    const subTextChangePoints = [0.78, 0.83, 0.88, 0.92, 0.98];
    const GALLERY_LABEL_RESISTANCE_START = subTextChangePoints[0];
    const GALLERY_LABEL_RESISTANCE_END = 1;
    const GALLERY_LABEL_SCROLL_SCALE = 0.72;
    const GALLERY_LABEL_RESISTANCE_RAMP = 0.012;
    const GALLERY_LABEL_WHEEL_HOLD_MS = 180;
    const GALLERY_SOFT_STOP_START = 1;

    const CARD_COUNT = 24;
    const imageOrder = [
      6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
      18, 19, 20, 21, 22, 23, 24, 1, 2, 3, 4, 5,
    ];
    const targetImageIndex = imageOrder.indexOf(3);
    // -0.5 shifts the whole ring by half a card-step so a *gap* between two
    // cards sits on the vertical centerline at rest, matching how the line
    // formation already centers (even card count -> the middle two cards'
    // shared edge, not a card center, lands on centerX). Without it, one
    // card's center sits exactly on the centerline instead. Must match the
    // same constant used in `ringAngle` below so the orbit math (which
    // relies on the two canceling out) still docks the target image dead
    // center at the end.
    const targetImageAngle = ((targetImageIndex - (CARD_COUNT * 0.75 - 0.5)) * Math.PI * 2) / CARD_COUNT;
    const targetOrbitRotation = -Math.PI * 2 + (-Math.PI / 2 - targetImageAngle);
    const orbitScrollStart = 0.66;
    const orbitScrollEnd = 1;
    const visualHoldStart = 0.965;
    // Scatter/line/ring (progress 0-0.64) scrolls faster now; the zoom-in
    // + arc/orbit phase (0.64-1, where the ring enlarges and settles into
    // an arc) keeps its original scroll speed. The section's own CSS
    // height was shortened to match (see .gallery-interaction), so
    // scrollFraction (raw scroll / new shorter range) needs remapping
    // into `progress` piecewise instead of the old 1:1 linear mapping,
    // otherwise the zoom/orbit phase would speed up too.
    const zoomPhaseStart = 0.64;
    const earlyPhaseSpeedup = 1.25;
    const earlyScrollFraction = (zoomPhaseStart / earlyPhaseSpeedup)
      / (zoomPhaseStart / earlyPhaseSpeedup + (1 - zoomPhaseStart));
    const cardImageSources = imageOrder.map((n) => `images/card-${String(n).padStart(2, '0')}.webp`);

    const scatter = [
      [-0.438, 0.059], [-0.401, -0.393], [-0.362, -0.165], [-0.325, -0.275],
      [-0.287, -0.165], [-0.248, -0.393], [-0.21, 0.059], [-0.172, 0.172],
      [-0.134, 0.059], [-0.096, -0.275], [-0.057, 0.172], [-0.02, 0.172],
      [0.019, 0.285], [0.057, -0.056], [0.095, -0.275], [0.133, 0.285],
      [0.172, -0.056], [0.21, -0.393], [0.247, 0.397], [0.286, -0.056],
      [0.324, -0.165], [0.363, 0.059], [0.4, -0.165], [0.439, -0.275],
    ];

    const revealSequence = [5, 2, 0, 17, 4, 11, 8, 14, 20, 6, 1, 9, 16, 13, 3, 22, 10, 19, 7, 21, 15, 12, 23, 18];
    const revealRank = Array(CARD_COUNT);
    revealSequence.forEach((cardIndex, rank) => {
      revealRank[cardIndex] = rank;
    });

    const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
    const lerp = (from, to, t) => from + (to - from) * t;
    const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const range = (value, start, end) => easeInOut(clamp((value - start) / (end - start)));
    const normalizeDegrees = (degrees) => (((degrees + 180) % 360 + 360) % 360) - 180;
    const lerpAngleDegrees = (from, to, t) => from + normalizeDegrees(to - from) * t;
    const toRadians = (degrees) => (degrees * Math.PI) / 180;

    const gallery = galleryInteractionEl.querySelector('.gallery-interaction__gallery');
    const galleryStage = galleryInteractionEl.querySelector('.gallery-interaction__stage');
    const visionTitle = galleryInteractionEl.querySelector('.gallery-interaction__vision-title');
    const visionDescription = galleryInteractionEl.querySelector('.gallery-interaction__vision-description');
    const ringHint = galleryInteractionEl.querySelector('.gallery-interaction__ring-hint');
    const ringLabel = galleryInteractionEl.querySelector('.gallery-interaction__ring-label');

    const canvas = document.createElement('canvas');
    canvas.className = 'gallery-interaction__webgl-canvas';
    gallery.append(canvas);

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      depth: false,
      premultipliedAlpha: false,
    });

    // Uniform locations are assigned inside the `if (gl)` setup block just
    // below, but declared here (rather than with `const` down there) so
    // drawCard -- defined later, gl-only itself but still parsed either
    // way -- can close over them regardless of which path this page ends
    // up taking.
    let colorLocation;
    let textureLocation;
    let sizeLocation;
    let radiusLocation;
    let alphaLocation;
    let hasTextureLocation;
    let imageAspectLocation;
    let cardAspectLocation;

    // WebGL-specific setup -- program/shaders/texture uploads only ever
    // needed on the gl path. createTextureFromImage stays null on the
    // fallback path (see the image-loading branch below, which never
    // calls it in that case).
    let createTextureFromImage = null;

    if (gl) {
      const vertexShaderSource = `
        attribute vec2 a_position;
        attribute vec2 a_uv;
        varying vec2 v_uv;
        void main() {
          v_uv = a_uv;
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `;

      const fragmentShaderSource = `
        precision mediump float;
        varying vec2 v_uv;
        uniform vec4 u_color;
        uniform sampler2D u_texture;
        uniform vec2 u_size;
        uniform float u_radius;
        uniform float u_alpha;
        uniform float u_hasTexture;
        uniform float u_imageAspect;
        uniform float u_cardAspect;

        float roundedRect(vec2 uv, vec2 size, float radius) {
          vec2 halfSize = size * 0.5;
          vec2 p = abs((uv - 0.5) * size) - (halfSize - vec2(radius));
          return length(max(p, 0.0)) + min(max(p.x, p.y), 0.0) - radius;
        }

        void main() {
          float d = roundedRect(v_uv, u_size, u_radius);
          if (d > 0.0) discard;
          float edge = 1.0 - smoothstep(-1.5, 0.0, d);
          vec2 sampleUv = v_uv;
          if (u_imageAspect > u_cardAspect) {
            float visibleWidth = u_cardAspect / u_imageAspect;
            sampleUv.x = (v_uv.x - 0.5) * visibleWidth + 0.5;
          } else {
            float visibleHeight = u_imageAspect / u_cardAspect;
            sampleUv.y = (v_uv.y - 0.5) * visibleHeight + 0.5;
          }
          vec4 imageColor = texture2D(u_texture, sampleUv);
          vec3 fallback = u_color.rgb + vec3((1.0 - v_uv.y) * 0.045);
          vec3 color = mix(fallback, imageColor.rgb, u_hasTexture);
          float alpha = mix(u_color.a, imageColor.a, u_hasTexture);
          gl_FragColor = vec4(color, alpha * u_alpha * edge);
        }
      `;

      const compileShader = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(shader));
        }
        return shader;
      };

      const createProgram = () => {
        const program = gl.createProgram();
        gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexShaderSource));
        gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program));
        }
        return program;
      };

      const program = createProgram();
      const positionLocation = gl.getAttribLocation(program, 'a_position');
      const uvLocation = gl.getAttribLocation(program, 'a_uv');
      colorLocation = gl.getUniformLocation(program, 'u_color');
      textureLocation = gl.getUniformLocation(program, 'u_texture');
      sizeLocation = gl.getUniformLocation(program, 'u_size');
      radiusLocation = gl.getUniformLocation(program, 'u_radius');
      alphaLocation = gl.getUniformLocation(program, 'u_alpha');
      hasTextureLocation = gl.getUniformLocation(program, 'u_hasTexture');
      imageAspectLocation = gl.getUniformLocation(program, 'u_imageAspect');
      cardAspectLocation = gl.getUniformLocation(program, 'u_cardAspect');
      const buffer = gl.createBuffer();

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(uvLocation);
      gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 16, 8);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform1i(textureLocation, 0);

      createTextureFromImage = (image) => {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
      };
    }

    // Cards should stagger in when the user actually scrolls the section
    // into view, not the instant their images finish loading (which
    // happens almost immediately on page load, long before the user
    // has scrolled anywhere near this section). revealStartedAt is only
    // set once both the images are ready AND the section has entered
    // the viewport, timed from whichever happens later. Shared by both
    // the WebGL and DOM-fallback paths.
    let loadSettledCount = 0;
    let imagesSettledAt = null;
    let sectionEnteredAt = null;
    let revealStartedAt = null;
    const markCardSettled = () => {
      loadSettledCount += 1;
      if (loadSettledCount === CARD_COUNT && imagesSettledAt === null) {
        imagesSettledAt = window.performance.now();
      }
    };

    const galleryEntryObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && sectionEnteredAt === null) {
          sectionEnteredAt = window.performance.now();
        }
      });
    }, { threshold: 0 });
    galleryEntryObserver.observe(galleryInteractionEl);

    const cards = Array.from({ length: CARD_COUNT }, (_, index) => ({
      index,
      color: index % 2
        ? [199 / 255, 202 / 255, 204 / 255, 1]
        : [215 / 255, 217 / 255, 218 / 255, 1],
      backColor: [186 / 255, 191 / 255, 193 / 255, 1],
      texture: null,
      imageAspect: 1,
      isLoaded: false,
      hoverLift: 0,
      state: null,
      el: null,
      frontImg: null,
    }));

    // DOM fallback cards -- only built when WebGL isn't available (see the
    // render-call branch in layout() below). Two stacked faces per card
    // (front image / back solid color) so the ring's flip animation still
    // shows the right face via backface-visibility, same as the WebGL
    // path's manual faceTowardCamera check.
    // Fixed at a size at least as big as the largest this card ever
    // actually reaches on screen (cardW tops out at 59px, zoomScale at
    // ~3.05, plus a bit of hover-lift headroom) -- see renderCardsDOM's own
    // comment for why. Set once here and never touched again; all the
    // per-frame size change happens via `scale()` down from this instead.
    const FALLBACK_CARD_BASE_W = 220;
    const FALLBACK_CARD_BASE_H = FALLBACK_CARD_BASE_W * (77 / 59);

    if (!gl) {
      cards.forEach((card) => {
        const el = document.createElement('div');
        el.className = 'gallery-interaction__card-dom';
        const [r, g, b] = card.color;
        el.innerHTML = `
          <div class="gallery-interaction__card-face gallery-interaction__card-face--front" style="background: rgb(${r * 255}, ${g * 255}, ${b * 255});">
            <img alt="" draggable="false">
          </div>
          <div class="gallery-interaction__card-face gallery-interaction__card-face--back"></div>
        `;
        el.style.width = `${FALLBACK_CARD_BASE_W}px`;
        el.style.height = `${FALLBACK_CARD_BASE_H}px`;
        gallery.append(el);
        card.el = el;
        card.frontImg = el.querySelector('img');
      });
    }

    cards.forEach((card, index) => {
      if (gl) {
        const image = new Image();
        image.onload = () => {
          card.texture = createTextureFromImage(image);
          card.imageAspect = image.naturalWidth / image.naturalHeight;
          card.isLoaded = true;
          markCardSettled();
        };
        image.onerror = () => {
          markCardSettled();
        };
        image.src = cardImageSources[index];
      } else {
        const img = card.frontImg;
        img.onload = () => {
          card.imageAspect = img.naturalWidth / img.naturalHeight;
          card.isLoaded = true;
          markCardSettled();
        };
        img.onerror = () => {
          markCardSettled();
        };
        img.src = cardImageSources[index];
      }
    });

    let smoothScroll = 0;
    let galleryWheelDirection = 0;
    let galleryWheelActiveUntil = 0;
    let galleryWheelTicking = false;
    let lastGalleryWheelTickAt = null;
    let pointerX = 0;
    let pointerY = 0;
    let hoverActive = false;
    let hoveredCard = -1;
    let viewportWidth = 0;
    let viewportHeight = 0;
    let dpr = 1;

    const updatePointerFromEvent = (event) => {
      const rect = gallery.getBoundingClientRect();
      pointerX = event.clientX - rect.left;
      pointerY = event.clientY - rect.top;
      hoverActive = true;
    };

    const handlePointerLeave = () => {
      hoverActive = false;
    };

    const resizeCanvas = (width, height) => {
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      if (viewportWidth === width && viewportHeight === height && dpr === nextDpr) return;
      viewportWidth = width;
      viewportHeight = height;
      dpr = nextDpr;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const projectPoint = (point, centerX, centerY) => {
      const perspective = 900;
      const depthScale = perspective / (perspective - point.z);
      return {
        x: centerX + (point.x - centerX) * depthScale,
        y: centerY + (point.y - centerY) * depthScale,
        z: point.z,
        scale: depthScale,
      };
    };

    const getCardCorners = (card, centerX, centerY) => {
      const projectedCenter = projectPoint({ x: card.x, y: card.y, z: card.z }, centerX, centerY);
      const flipSqueeze = Math.max(0.08, Math.abs(Math.cos(toRadians(card.flipX))));
      const halfW = (card.w * card.scale * projectedCenter.scale) / 2;
      const halfH = (card.h * card.scale * projectedCenter.scale * flipSqueeze) / 2;
      const rotate = toRadians(card.rotation);
      const cosZ = Math.cos(rotate);
      const sinZ = Math.sin(rotate);
      const local = [
        [-halfW, -halfH, 0, 0],
        [halfW, -halfH, 1, 0],
        [halfW, halfH, 1, 1],
        [-halfW, halfH, 0, 1],
      ];

      return local.map(([lx, ly, u, v]) => {
        const rx = lx * cosZ - ly * sinZ;
        const ry = lx * sinZ + ly * cosZ;
        return {
          x: projectedCenter.x + rx,
          y: projectedCenter.y + ry,
          scale: projectedCenter.scale,
          u,
          v,
        };
      });
    };

    const drawCard = (card, centerX, centerY) => {
      if (card.opacity <= 0.002) return;

      const corners = getCardCorners(card, centerX, centerY);
      const faceTowardCamera = Math.cos(toRadians(card.flipX)) >= 0;
      const vertices = [
        corners[0], corners[1], corners[2],
        corners[0], corners[2], corners[3],
      ];
      const data = new Float32Array(vertices.flatMap((corner) => [
        (corner.x / viewportWidth) * 2 - 1,
        1 - (corner.y / viewportHeight) * 2,
        corner.u,
        faceTowardCamera ? corner.v : 1 - corner.v,
      ]));
      const color = faceTowardCamera ? card.color : card.backColor;
      const visualScale = card.scale * Math.max(0.65, corners.reduce((sum, corner) => sum + corner.scale, 0) / corners.length);

      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, card.texture);
      gl.uniform4f(colorLocation, color[0], color[1], color[2], color[3]);
      gl.uniform2f(sizeLocation, card.w * visualScale, card.h * visualScale);
      gl.uniform1f(radiusLocation, 6 * visualScale);
      gl.uniform1f(alphaLocation, card.opacity);
      gl.uniform1f(hasTextureLocation, card.texture ? 1 : 0);
      gl.uniform1f(imageAspectLocation, card.imageAspect || 1);
      gl.uniform1f(cardAspectLocation, card.w / card.h);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const renderCards = (centerX, centerY) => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      cards
        .filter((card) => card.state)
        .map((card) => card.state)
        .sort((a, b) => a.z - b.z)
        .forEach((state) => drawCard(state, centerX, centerY));
    };

    // DOM fallback renderer: same per-card x/y/z/rotation/flipX/scale/
    // opacity values as the WebGL path above, applied as a real CSS 3D
    // transform instead of a manual per-vertex projection -- the
    // `perspective: 900px` on .gallery-interaction__gallery (matching the
    // `perspective = 900` constant in projectPoint above) makes the browser
    // do the same depth scaling the WebGL path computes by hand. flipX
    // drives rotateX (it squashes card.h in the WebGL version above, i.e.
    // a horizontal-axis flip) with a real two-sided element (see
    // .gallery-interaction__card-face--back's own rotateX(180deg) in CSS)
    // instead of swapping a color uniform.
    //
    // Every card's own box stays fixed at FALLBACK_CARD_BASE_W/H (set once
    // at creation, never touched here) -- all size change happens through
    // this scale() instead of resizing the element. A resized box forces
    // the browser to re-decode/re-rasterize the <img> at the new size, and
    // browsers cache that decode at whatever size it was last shown at;
    // cards here start tiny (the scatter/line phases) and later zoom to
    // ~3x, so a box that's resized larger over time can end up reusing a
    // decode meant for the earlier, much smaller size and read as blurry --
    // even though the source photos (see images/card-XX.webp) are plenty
    // high-res. Since FALLBACK_CARD_BASE_W/H is already at least as large
    // as this card is ever shown, boxScale here is always <= 1: the
    // browser only ever scales this one full-size decode *down*, which
    // stays sharp at any size, instead of ever scaling a smaller decode up.
    const renderCardsDOM = (centerX, centerY) => {
      cards.forEach((card) => {
        const state = card.state;
        if (!state || !card.el) return;
        const { el } = card;
        if (state.opacity <= 0.002) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          return;
        }
        el.style.pointerEvents = '';
        const width = state.w * state.scale;
        const boxScale = width / FALLBACK_CARD_BASE_W;
        el.style.left = `${state.x}px`;
        el.style.top = `${state.y}px`;
        el.style.transform = `translate3d(-50%, -50%, ${state.z}px) rotateZ(${state.rotation}deg) rotateX(${state.flipX}deg) scale(${boxScale})`;
        el.style.opacity = String(state.opacity);
        el.style.zIndex = String(Math.round(1000 + state.z));
      });
    };

    const getGalleryScrollState = () => {
        const height = window.innerHeight;
        const rect = galleryInteractionEl.getBoundingClientRect();
        const scrollRange = Math.max(0, galleryInteractionEl.offsetHeight - height);
        const sectionTop = rect.top + window.scrollY;
        const current = scrollRange > 0 ? clamp(-rect.top, 0, scrollRange) : 0;
        return { height, rect, scrollRange, sectionTop, current };
      };

      const mapScrollFractionToProgress = (scrollFraction) => (
        scrollFraction <= earlyScrollFraction
          ? (scrollFraction / earlyScrollFraction) * zoomPhaseStart
          : zoomPhaseStart + ((scrollFraction - earlyScrollFraction) / (1 - earlyScrollFraction)) * (1 - zoomPhaseStart)
      );

      const getGalleryVisualProgress = (progress) => {
        const rawVisualProgress = progress < visualHoldStart
          ? progress / visualHoldStart
          : 1;
        if (GALLERY_SOFT_STOP_START >= 1) {
          return rawVisualProgress;
        }
        const softStopT = clamp((rawVisualProgress - GALLERY_SOFT_STOP_START) / (1 - GALLERY_SOFT_STOP_START));
        const softStopProgress = softStopT * softStopT * softStopT * (softStopT * (softStopT * 6 - 15) + 10);
        return rawVisualProgress < GALLERY_SOFT_STOP_START
          ? rawVisualProgress
          : GALLERY_SOFT_STOP_START + (1 - GALLERY_SOFT_STOP_START) * softStopProgress;
      };

      const getGalleryLabelResistance = (visualProgress) => {
        if (
          visualProgress < GALLERY_LABEL_RESISTANCE_START - GALLERY_LABEL_RESISTANCE_RAMP
          || visualProgress > GALLERY_LABEL_RESISTANCE_END + GALLERY_LABEL_RESISTANCE_RAMP
        ) {
          return 1;
        }

        const fadeIn = easeInOut(clamp(
          (visualProgress - (GALLERY_LABEL_RESISTANCE_START - GALLERY_LABEL_RESISTANCE_RAMP))
          / GALLERY_LABEL_RESISTANCE_RAMP,
        ));
        const fadeOut = GALLERY_LABEL_RESISTANCE_END >= 1
          ? 1
          : easeInOut(clamp(
            ((GALLERY_LABEL_RESISTANCE_END + GALLERY_LABEL_RESISTANCE_RAMP) - visualProgress)
            / GALLERY_LABEL_RESISTANCE_RAMP,
          ));
        const resistanceAmount = Math.min(fadeIn, fadeOut);
        return lerp(1, GALLERY_LABEL_SCROLL_SCALE, resistanceAmount);
      };

      const tickGalleryWheel = () => {
        const now = window.performance.now();
        if (!galleryWheelDirection || now > galleryWheelActiveUntil) {
          galleryWheelDirection = 0;
          galleryWheelTicking = false;
          lastGalleryWheelTickAt = null;
          return;
        }

        const deltaSeconds = lastGalleryWheelTickAt === null
          ? 1 / 60
          : Math.min(0.05, Math.max(0.001, (now - lastGalleryWheelTickAt) / 1000));
        lastGalleryWheelTickAt = now;

        const { height, scrollRange, sectionTop, current } = getGalleryScrollState();
        if (scrollRange <= 0) {
          galleryWheelDirection = 0;
          galleryWheelTicking = false;
          lastGalleryWheelTickAt = null;
          return;
        }

        const direction = galleryWheelDirection;
        const scrollFraction = scrollRange > 0 ? clamp(current / scrollRange) : 0;
        const progress = mapScrollFractionToProgress(scrollFraction);
        const visualProgress = getGalleryVisualProgress(progress);
        const labelResistance = getGalleryLabelResistance(visualProgress);
        const step = height * 1.2 * deltaSeconds * labelResistance;
        const nextLocalScroll = clamp(current + direction * step, 0, scrollRange);
        window.scrollTo(0, sectionTop + nextLocalScroll);

        if ((nextLocalScroll <= 0 && direction < 0) || (nextLocalScroll >= scrollRange && direction > 0)) {
          galleryWheelDirection = 0;
        }

        requestAnimationFrame(tickGalleryWheel);
      };

      const handleGalleryWheel = (event) => {
        if (event.ctrlKey || Math.abs(event.deltaY) < 1) return;

        const { height, rect, scrollRange, current } = getGalleryScrollState();
        if (scrollRange <= 0) return;

        const direction = Math.sign(event.deltaY);
        const projectedLocalScroll = current + event.deltaY;
        const pinActive = rect.top <= 0 && rect.bottom >= height;
        const currentProgress = mapScrollFractionToProgress(clamp(current / scrollRange));
        const projectedProgress = mapScrollFractionToProgress(clamp(projectedLocalScroll / scrollRange));
        const currentVisualProgress = getGalleryVisualProgress(currentProgress);
        const projectedVisualProgress = getGalleryVisualProgress(projectedProgress);
        const minVisualProgress = Math.min(currentVisualProgress, projectedVisualProgress);
        const maxVisualProgress = Math.max(currentVisualProgress, projectedVisualProgress);
        const inLabelResistanceZone = maxVisualProgress >= GALLERY_LABEL_RESISTANCE_START
          && minVisualProgress <= GALLERY_LABEL_RESISTANCE_END;
        if (!pinActive || !inLabelResistanceZone) return;
        if (
          (direction < 0 && projectedLocalScroll <= 0)
          || (direction > 0 && projectedLocalScroll >= scrollRange)
        ) {
          galleryWheelDirection = 0;
          galleryWheelTicking = false;
          lastGalleryWheelTickAt = null;
          return;
        }

        event.preventDefault();
        updateHeaderForDelta(direction);

        galleryWheelDirection = direction;
        galleryWheelActiveUntil = window.performance.now() + GALLERY_LABEL_WHEEL_HOLD_MS;

        if (!galleryWheelTicking) {
          galleryWheelTicking = true;
          requestAnimationFrame(tickGalleryWheel);
        }
      };

      const layout = () => {
        // clientWidth (not innerWidth) on purpose: innerWidth includes the
        // reserved scrollbar strip, but the sitewide .fixed-grid-lines is
        // position:fixed, so its left/right offsets resolve against the
        // initial containing block, which excludes that strip. Sizing the
        // canvas off innerWidth made it 15-20px wider than the page's actual
        // content box, overflowing under the scrollbar and shifting this
        // canvas's own centerX away from the grid's true center divider by
        // half that gap -- exactly the rightward drift reported against the
        // grid line.
        const width = document.documentElement.clientWidth;
        const height = window.innerHeight;
        if (gl) resizeCanvas(width, height);

        const scrollRange = galleryInteractionEl.offsetHeight - height;
        const targetScroll = scrollRange > 0
          ? clamp(-galleryInteractionEl.getBoundingClientRect().top, 0, scrollRange)
          : 0;
        const targetFraction = scrollRange > 0 ? clamp(targetScroll / scrollRange) : 0;
        smoothScroll = lerp(smoothScroll, targetScroll, 0.075);
        const scrollFraction = scrollRange > 0 ? clamp(smoothScroll / scrollRange) : 0;
        const progress = mapScrollFractionToProgress(scrollFraction);
        const visualProgress = getGalleryVisualProgress(progress);

        const mobile = width <= 520;
        const tablet = width <= 900;
        const cardW = width <= 768 ? 30 : tablet ? width * 0.031 : Math.min(59, Math.max(38, width * (59 / 1920)));
        const cardH = cardW * (77 / 59);
        const cardGap = width <= 768 ? 6 : width * (14 / 1920);
        const centerX = width * 0.5;
        const centerY = height * 0.5;
        const arcSceneLift = height * (mobile ? 0.05 : tablet ? 0.115 : 0.13);
        const baseRadius = mobile
          ? Math.min(width, height) * 0.32
          : tablet
            ? Math.min(width, height) * 0.295
            : Math.min(width * (328 / 1920), height * 0.38);
        const finalRingRadius = baseRadius;

        const makeLine = range(visualProgress, 0.08, 0.29);
        const ringProgress = range(visualProgress, 0.29, 0.64);
        const arcZoomIn = range(visualProgress, 0.64, 0.84);
        const arcZoomBlend = easeInOut(arcZoomIn);
        const subTextIndex = subTextChangePoints.reduce(
          (activeIndex, point, i) => (visualProgress >= point ? i : activeIndex),
          0,
        );
        const hoverReady = range(visualProgress, 0.72, 0.84);
        const hoverSearch = { index: -1, distance: Infinity };

        if (revealStartedAt === null && imagesSettledAt !== null && sectionEnteredAt !== null) {
          revealStartedAt = Math.max(imagesSettledAt, sectionEnteredAt);
        }

        cards.forEach((card, index) => {
          const lineT = index / (cards.length - 1);
          const appearDelay = revealRank[index] * 75;
          const now = window.performance.now();
          const revealElapsed = revealStartedAt === null ? 0 : now - revealStartedAt;
          const appearByTime = range(revealElapsed, appearDelay, appearDelay + 500);
          const appearByScroll = range(visualProgress, 0.025 + revealRank[index] * 0.005, 0.175 + revealRank[index] * 0.005);
          const appear = card.isLoaded ? Math.max(appearByTime, appearByScroll) : 0;

          let x = centerX + scatter[index][0] * width;
          let y = centerY + scatter[index][1] * height;
          // scatter[10]/[11] sit only 0.037 of width apart (same y) -- on
          // desktop/tablet cardW scales down with width so that's still a
          // clear gap, but mobile's cardW is a flat 30px that doesn't shrink
          // with the viewport, so on any mobile width under ~810px that gap
          // is narrower than the two cards' combined half-widths and they
          // visibly overlap in the scatter phase. Nudge just this one pair
          // further apart on mobile rather than touching the shared array
          // (which desktop's line/ring math also reads).
          if (width <= 768 && (index === 10 || index === 11)) {
            x += (index === 10 ? -1 : 1) * width * 0.045;
          }
          let z = 0;
          let rotation = 0;
          let flipX = 0;
          let scale = lerp(0.94, 1, appear);

          const lineWidth = cardW * cards.length + cardGap * (cards.length - 1);
          const lineStart = centerX - lineWidth / 2 + cardW / 2;
          const lineX = lineStart + index * (cardW + cardGap);
          const lineY = centerY;
          x = lerp(x, lineX, makeLine);
          y = lerp(y, lineY, makeLine);

          const edgeDistance = Math.abs(lineT - 0.5) * 2;
          // Symmetric distance-from-nearest-edge, 0-indexed (cards.length - 1,
          // matching lineT above) -- the previous `cards.length - index` was
          // off by one, so the two center cards (11/12 of 24) got unequal
          // edgeRank (11 vs 12) and every right-side card folded into the
          // ring 0.035s later than its mirrored left-side card, reading as a
          // persistent rightward lag/shift during the line->ring fold.
          const edgeRank = Math.min(index, cards.length - 1 - index);
          const foldDelay = edgeRank * 0.035;
          const localFold = range(ringProgress, foldDelay, Math.min(1, foldDelay + 0.62));
          const planeOpen = Math.pow(ringProgress, 2.6);
          const ringAngle = ((index - (cards.length * 0.75 - 0.5)) * Math.PI * 2) / cards.length;
          const ringX = centerX + Math.cos(ringAngle) * finalRingRadius;
          const ringY = centerY + Math.sin(ringAngle) * finalRingRadius * planeOpen;
          const ringZ = -(Math.sin(ringAngle) + 1) * finalRingRadius * (1 - planeOpen) * 1.15;

          const localFlipProgress = range(ringProgress, foldDelay, Math.min(1, foldDelay + 0.5));
          const flipToBack = range(localFlipProgress, 0, 0.34);
          const flipSettle = range(localFlipProgress, 0.34, 1);
          const flipArc = Math.sin(localFlipProgress * Math.PI);
          const radialRotation = normalizeDegrees((ringAngle * 180) / Math.PI + 90);

          if (visualProgress > 0.29) {
            x = lerp(lineX, ringX, localFold);
            y = lerp(lineY, ringY, localFold) - flipArc * cardH * 0.14;
          }
          z = lerp(0, ringZ, localFold) - edgeDistance * cardH * 0.42 * flipArc;
          rotation = lerp(0, radialRotation, localFold * planeOpen);
          flipX = -180 * flipToBack - 180 * flipSettle * planeOpen;

          const zoomIn = arcZoomBlend;
          const orbitRawProgress = clamp((visualProgress - orbitScrollStart) / (orbitScrollEnd - orbitScrollStart));
          const orbitProgress = orbitRawProgress;
          const zoomScale = lerp(1, mobile ? 2.4 : 3.05, zoomIn);
          const zoomRotation = orbitProgress * targetOrbitRotation;
          const zoomAngle = ringAngle + zoomRotation;
          const zoomCenterY = centerY + finalRingRadius * zoomIn * (mobile ? 2.1 : 3.15) - arcSceneLift * zoomIn;
          const zoomX = centerX + Math.cos(zoomAngle) * finalRingRadius * zoomScale;
          const zoomY = zoomCenterY + Math.sin(zoomAngle) * finalRingRadius * zoomScale;
          const zoomCardRotation = normalizeDegrees((zoomAngle * 180) / Math.PI + 90);
          x = lerp(x, zoomX, zoomIn);
          y = lerp(y, zoomY, zoomIn);
          scale *= zoomScale;
          rotation = lerpAngleDegrees(rotation, zoomCardRotation, zoomIn);

          if (hoverActive && hoverReady > 0.05) {
            const hitW = Math.max(cardW * scale * 0.68, 96);
            const hitH = Math.max(cardH * scale * 0.68, 128);
            const dx = (pointerX - x) / hitW;
            const dy = (pointerY - y) / hitH;
            const distance = dx * dx + dy * dy;
            if (distance < 1 && distance < hoverSearch.distance) {
              hoverSearch.index = index;
              hoverSearch.distance = distance;
            }
          }

          card.hoverLift = lerp(card.hoverLift, hoveredCard === index ? hoverReady : 0, 0.16);
          y -= cardH * scale * 0.42 * card.hoverLift;
          z += 180 * card.hoverLift;
          scale *= 1 + 0.08 * card.hoverLift;

          card.state = {
            x, y, z,
            w: cardW,
            h: cardH,
            scale,
            rotation,
            flipX,
            opacity: appear,
            color: card.color,
            backColor: card.backColor,
            texture: card.texture,
            imageAspect: card.imageAspect,
          };
        });

        hoveredCard = hoverSearch.index;
        if (gl) {
          renderCards(centerX, centerY);
        } else {
          renderCardsDOM(centerX, centerY);
        }

        const activeSubText = subTextItems[subTextIndex];
        if (visionTitle) visionTitle.textContent = activeSubText.title;
        if (visionDescription) {
          visionDescription.innerHTML = activeSubText.lines.map((line) => `<p>${line}</p>`).join('');
        }
        if (ringLabel) ringLabel.textContent = '';
        if (ringHint) ringHint.textContent = '';

        galleryInteractionEl.classList.toggle('is-vision', visualProgress > 0.67);
        galleryInteractionEl.classList.toggle('is-intro-ready', visualProgress > 0.52);
        galleryInteractionEl.classList.toggle('is-vision-copy-ready', visualProgress >= subTextChangePoints[0]);
      };

      const animate = () => {
        layout();
        requestAnimationFrame(animate);
      };

      galleryStage.addEventListener('pointermove', updatePointerFromEvent);
      galleryStage.addEventListener('pointerleave', handlePointerLeave);
      window.addEventListener('pointermove', updatePointerFromEvent);
      window.addEventListener('wheel', handleGalleryWheel, { passive: false });
      window.addEventListener('resize', layout);
      animate();
  }

  /* Work-detail: each project's cover stays pinned past its own 100vh of
     rest. .work-detail__track holds the cover plus every scene after it as
     side-by-side panels -- a real filmstrip, .work-detail__panel's
     flex:0 0 100% already supports any panel count -- and once pinned,
     scroll first just pauses at the cover, then slides that track left to
     carry each scene into view in turn. The background crossfades white ->
     black on its own, in sync with the first slide but as an independent
     layer (#scrollDarkOverlay, same technique reason-quote/cards-reveal
     use) -- not something carried by the sliding content itself, and it
     stays black (not re-crossfading) through every scene after that first
     one. Once each scene is docked, further scroll fills its own
     .work-scenes__desc-en gray -> white character by character (same
     wrapChars/fillChars technique as .intro-reasons__subtitle), then holds
     before either the next slide or (on the last scene) releasing.
     initWorkDetailSequence is one reusable driver for this whole pattern,
     parameterized per project (rootEl + its own timing config) since
     project 2 (W:RUN) repeats the exact same cover+scene(s) mechanism as
     project 1 (ILKW) but with its own panel count/pacing and no glow
     curve -- see the two call sites below for each project's own numbers. */
  function initWorkDetailSequence(rootEl, config) {
    if (!rootEl) return;

    const {
      slideStarts, // fraction of the post-dock dwell where each scene's slide begins, in order
      slideEnds, // ...where each scene's slide ends
      fillEnds, // ...where each scene's desc-en fill finishes
      glowPeaks = null, // optional: see buildGlowPath below -- omit entirely for a project with no glow curve in its markup
      glowSpeed = 1, // ease-out exponent for glowProgress -- see the comment where it's used
      sceneBackgrounds = ['#000000'], // one color per scene panel; blended while sliding between scenes
      setDarkContribution, // callback(value) -- writes this project's own *DarkContribution global and calls applyCombinedDarkState
    } = config;

    const trackEl = rootEl.querySelector('.work-detail__track');
    const glowCurveEl = rootEl.querySelector('.work-detail__glow-curve');
    const coverPanelEl = rootEl.querySelector('.work-detail__panel');
    // One .work-scenes__stage per scene panel, in DOM order -- used both to
    // size the scenes array to the actual panel count (rather than assuming
    // one .work-scenes__desc-en per scene globally) and to look up each
    // scene's own video, if it has one, scoped to just that stage. Scoping
    // the video lookup per-stage (rather than one flat, index-zipped list
    // across the whole document) is what lets a scene contain zero, one, or
    // even two device mockups without shifting every later scene's video
    // off by one.
    const sceneStages = Array.from(rootEl.querySelectorAll('.work-scenes__stage'));

    // One path spans every work-scenes panel in this project (see the CSS
    // comment on .work-detail__glow-curve) so it draws on once,
    // continuously, across the whole journey rather than resetting per
    // scene.
    //
    // GLOW_PEAKS is the only part of this meant to be hand-tuned: one
    // number per scene panel, in scene order, with no path/SVG syntax
    // involved. Each number is how far the curve bulges away from its
    // 150-unit baseline at the middle of that panel -- positive bulges up
    // (toward the mockup sitting above), negative bulges down, and 0 is a
    // flat line through that panel. Every panel's curve always starts and
    // ends exactly at the shared baseline (see buildGlowPath below), so
    // changing one entry can never break the seam with its neighbors --
    // edit freely.
    const GLOW_PANEL_WIDTH = 1920; // matches .work-scenes__stage's own 1920-wide design unit
    const GLOW_BASELINE = 150; // vertical center of the curve's viewBox band
    const GLOW_SAMPLE_STEP = 60; // smaller = smoother curve, larger = shorter path string

    // Builds one continuous polyline: within each panel, x runs 0..1 as t
    // and y = baseline + peak * half*(1-cos(2*pi*t)) -- a raised-cosine
    // "bump" that is 0 at both t=0 and t=1 AND has zero slope at both
    // t=0 and t=1, regardless of peak's value or sign (derivative is
    // peak*pi*sin(2*pi*t), which is 0 whenever sin(2*pi*t) is, i.e. at
    // every integer t). That's what makes adjacent panels meet with no
    // kink even though their peaks differ: each panel arrives at the
    // shared boundary already flat, so there's nothing for the next
    // panel's own flat start to clash with. The bump peaks at exactly
    // `peak` at t=0.5 (mid-panel), so GLOW_PEAKS keeps the same meaning
    // as before -- edit freely.
    const buildGlowPath = (peaks) => {
      const points = [];
      peaks.forEach((peak, i) => {
        const xOffset = i * GLOW_PANEL_WIDTH;
        for (let x = 0; x <= GLOW_PANEL_WIDTH; x += GLOW_SAMPLE_STEP) {
          if (i > 0 && x === 0) continue; // already emitted as previous panel's last point
          const t = x / GLOW_PANEL_WIDTH;
          const y = GLOW_BASELINE + peak * 0.5 * (1 - Math.cos(2 * Math.PI * t));
          points.push(`${xOffset + x},${y.toFixed(2)}`);
        }
      });
      return `M ${points.join(' L ')}`;
    };

    // getTotalLength() is pure path geometry in the SVG's own user space,
    // so it's stable regardless of screen size -- no resize-driven
    // remeasurement needed, unlike the fog-chars' offsetLeft/Width
    // measurements elsewhere in this file. It has to run after setAttribute
    // (not against whatever static "d" shipped in the markup) since that's
    // the shape actually being drawn now.
    let glowPath = null;
    let glowLength = 0;
    if (glowPeaks) {
      glowPath = rootEl.querySelector('.work-detail__glow-curve path');
      if (glowPath) {
        glowPath.setAttribute('d', buildGlowPath(glowPeaks));
        glowLength = glowPath.getTotalLength();
      }
    }

    const scenes = sceneStages.map((stageEl, i) => {
      const descEnEl = stageEl.querySelector('.work-scenes__desc-en');
      if (descEnEl) wrapChars(descEnEl);
      return {
        panelEl: stageEl.closest('.work-detail__panel'),
        fillChars: descEnEl ? Array.from(descEnEl.querySelectorAll('.fill-char')) : [],
        slideEnd: slideEnds[i],
        fillEnd: fillEnds[i],
        // This scene's video is worth having ready from a bit before its
        // own slide-in completes (giving it the tail of the slide plus
        // fill/hold as a loading buffer) until the next scene's slide-in
        // begins (or, for the last scene, through the rest of the dwell).
        // The very first scene instead starts as soon as the section is
        // pinned at all, so it's already playing by the time the first
        // slide reveals it -- there's no earlier "previous scene" stage
        // to wait out.
        activeFrom: i === 0 ? 0 : fillEnds[i - 1],
        activeTo: i < slideStarts.length - 1 ? slideStarts[i + 1] : Infinity,
        // An array (not a single element) since COMMUNITY & CREW packs two
        // device mockups -- and so two videos -- into one .work-scenes__stage;
        // every other scene just gets a one-element array here.
        videos: Array.from(stageEl.querySelectorAll('video.work-scenes__device-media')),
        videoStarted: false,
      };
    });

    // Mobile is a plain static stack (see CSS) with no scroll-driven
    // gating, so instead of starting every scene's video at once on load
    // (which was saturating mobile bandwidth with several 20-40MB clips
    // simultaneously -- the actual cause of some clips "never" playing),
    // each scene's video only starts once that scene's own panel actually
    // scrolls near the viewport.
    if ('IntersectionObserver' in window) {
      const mobileVideoObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || window.innerWidth > 1023) return;
          const scene = scenes.find((s) => s.panelEl === entry.target);
          if (!scene || scene.videoStarted || !scene.videos.length) return;
          scene.videoStarted = true;
          scene.videos.forEach((v) => v.play().catch(() => {}));
          mobileVideoObserver.unobserve(entry.target);
        });
      }, { rootMargin: '400px 0px', threshold: 0 });
      scenes.forEach((scene) => {
        if (scene.panelEl && scene.videos.length) mobileVideoObserver.observe(scene.panelEl);
      });
    }

    const getEntryProgress = () => {
      const rect = rootEl.getBoundingClientRect();
      const vh = window.innerHeight;
      return Math.min(1, Math.max(0, (vh - rect.top) / vh));
    };

    const getExitProgress = () => {
      const rect = rootEl.getBoundingClientRect();
      const vh = window.innerHeight;
      return Math.min(1, Math.max(0, rect.bottom / vh));
    };

    const getDwellProgress = () => {
      const rect = rootEl.getBoundingClientRect();
      const dwellDist = rootEl.offsetHeight - window.innerHeight;
      return dwellDist > 0 ? Math.min(1, Math.max(0, -rect.top / dwellDist)) : 0;
    };

    const stage = (start, end, p) => Math.min(1, Math.max(0, (p - start) / (end - start)));

    darkContributionRefreshers.push(() => {
      if (window.innerWidth <= 1023) {
        setDarkContribution(0);
        return;
      }
      const entry = getEntryProgress();
      const exit = getExitProgress();
      const dwellProgress = entry >= 1 ? getDwellProgress() : 0;
      let totalSlide = 0;
      slideStarts.forEach((start, i) => {
        totalSlide += stage(start, slideEnds[i], dwellProgress);
      });
      const darkProgress = Math.min(1, totalSlide);
      setDarkContribution(Math.min(entry >= 1 ? darkProgress : 0, exit));
    });
    const sceneBgColors = sceneBackgrounds
      .map((hex) => {
        const clean = String(hex).replace('#', '').trim();
        if (clean.length !== 6) return null;
        return [
          parseInt(clean.slice(0, 2), 16),
          parseInt(clean.slice(2, 4), 16),
          parseInt(clean.slice(4, 6), 16),
        ];
      })
      .filter(Boolean);
    const sceneBgAt = (slideAmount) => {
      if (!sceneBgColors.length) return '#000000';
      const sceneProgress = Math.min(sceneBgColors.length - 1, Math.max(0, slideAmount - 1));
      const fromIndex = Math.floor(sceneProgress);
      const toIndex = Math.min(sceneBgColors.length - 1, fromIndex + 1);
      const rawT = sceneProgress - fromIndex;
      const t = rawT * rawT * (3 - 2 * rawT);
      const from = sceneBgColors[fromIndex];
      const to = sceneBgColors[toIndex];
      const mixed = from.map((channel, i) => Math.round(channel + (to[i] - channel) * t));
      return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
    };

    const update = () => {
      // Mobile fallback (see CSS) drops the pin/slide for a plain static
      // stack already showing the filled end state -- skip the
      // dark-overlay/transform/fill math entirely, same pattern as
      // reason-quote/cards-reveal's own mobile guards.
      if (window.innerWidth <= 1023) {
        setDarkContribution(0);
        if (trackEl) {
          trackEl.style.transform = 'none';
          trackEl.style.removeProperty('--detail-overlay-x');
          trackEl.style.removeProperty('--detail-scene-bg');
        }
        if (glowCurveEl) glowCurveEl.style.transform = 'none';
        if (coverPanelEl) coverPanelEl.style.filter = 'none';
        scenes.forEach((scene, i) => {
          if (scene.panelEl) scene.panelEl.style.transform = 'none';
          if (scene.panelEl) scene.panelEl.style.removeProperty('--scene-divider-opacity');
          // Desktop reaches each scene's own sceneBackgrounds color by
          // crossfading --detail-scene-bg as it scrolls there; the mobile
          // static stack has no scroll-driven crossfade to do that, so
          // (CSS otherwise hardcodes every scene panel to plain black,
          // which is why a per-project background color only ever showed
          // up on desktop) paint each panel with its own scene color here.
          const bg = sceneBgColors[Math.min(i, sceneBgColors.length - 1)];
          if (bg) {
            const rgb = `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`;
            if (scene.panelEl) scene.panelEl.style.backgroundColor = rgb;
            scene.panelEl.querySelectorAll('.work-scenes__stage').forEach((stageEl) => {
              stageEl.style.backgroundColor = rgb;
            });
          }
          scene.fillChars.forEach((span) => {
            span.style.color = '#ffffff';
            span.style.opacity = '1';
            span.style.filter = 'none';
            span.style.transform = 'none';
          });
        });
        // Video starts are handled by mobileVideoObserver above instead of
        // being fired here -- see its comment.
        return;
      }

      const entry = getEntryProgress();
      const exit = getExitProgress();
      const dwellProgress = entry >= 1 ? getDwellProgress() : 0;

      // Each slide is its own 0->1 ramp over its explicit [start, end]
      // window (see slideStarts/slideEnds above -- NOT back-to-back with
      // the previous slide, since a fill and a hold sit in the gap
      // between them); summing them gives the track's total travel in
      // whole panel-widths (0 = cover, 1 = scene 1, 2 = scene 2, ...).
      // Before its own window a ramp is 0, after it it's clamped at 1, so
      // this stays flat during every fill/hold and monotonic overall.
      let totalSlide = 0;
      slideStarts.forEach((start, i) => {
        totalSlide += stage(start, slideEnds[i], dwellProgress);
      });

      // Darkness ramps up with the *first* slide (cover is white, every
      // scene after it is black) and then just stays maxed -- no
      // re-crossfading between later, already-black scenes.
      const darkProgress = Math.min(1, totalSlide);
      setDarkContribution(Math.min(entry >= 1 ? darkProgress : 0, exit));
      if (coverPanelEl) {
        const coverBrightness = 1 - 0.78 * darkProgress;
        coverPanelEl.style.filter = `brightness(${coverBrightness})`;
      }

      if (trackEl) {
        trackEl.style.transform = 'none';
        trackEl.style.setProperty('--detail-overlay-x', `${Math.max(0, 1 - totalSlide) * 100}%`);
        trackEl.style.setProperty('--detail-scene-bg', sceneBgAt(totalSlide));
      }

      scenes.forEach((scene, i) => {
        const slideProgress = stage(slideStarts[i], slideEnds[i], dwellProgress);
        if (scene.panelEl) {
          const x = (i + 1 - totalSlide) * 100;
          scene.panelEl.style.transform = `translateX(${x}%)`;
          scene.panelEl.style.setProperty('--scene-divider-opacity', `${Math.sin(slideProgress * Math.PI).toFixed(3)}`);
        }
      });

      if (glowCurveEl) {
        glowCurveEl.style.transform = `translateX(${-totalSlide * document.documentElement.clientWidth}px)`;
      }

      // Single draw-on reveal across the *entire* work-scenes journey (from
      // the first scene's slide-in to the last scene's fill-end), rather
      // than a per-scene fillProgress -- a viewer asked for the light
      // streak to keep growing continuously as they scroll through the
      // scenes instead of restarting fresh in every panel, so this ties it
      // to one span's worth of progress instead of resetting per scene.
      if (glowPath) {
        // Raw span is the *entire* journey (first slide-in to last fill-end).
        // A plain linear map of that felt too slow to keep up with scroll,
        // but speeding it up with a flat multiplier (clamped at 1) made the
        // streak finish early and then sit dead/static for the rest of the
        // last scene -- reads as the light stopping partway rather than
        // reaching the end. This ease-out curve (y = 1-(1-x)^glowSpeed)
        // fixes both: it's steeper than linear everywhere in between (so it
        // still catches up quickly), but y(1) is always exactly 1, so it
        // only ever finishes exactly in sync with the scroll dwell's own
        // end, never before. Raise glowSpeed for an even faster-feeling
        // catch-up, lower it (toward 1, which is plain linear) to ease off.
        const rawGlowProgress = stage(slideStarts[0], fillEnds[fillEnds.length - 1], dwellProgress);
        const glowProgress = 1 - Math.pow(1 - rawGlowProgress, glowSpeed);
        glowPath.style.strokeDasharray = `${glowLength}`;
        glowPath.style.strokeDashoffset = `${glowLength * (1 - glowProgress)}`;
      }

      scenes.forEach((scene) => {
        const fillProgress = stage(scene.slideEnd, scene.fillEnd, dwellProgress);

        if (scene.fillChars.length) {
          const n = scene.fillChars.length;
          scene.fillChars.forEach((span, i) => {
            span.style.removeProperty('opacity');
            span.style.removeProperty('filter');
            span.style.removeProperty('transform');
            const t = Math.min(1, Math.max(0, fillProgress * n - i));
            const alpha = 0.2 + 0.8 * t;
            span.style.color = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
          });
        }

        // preload="none" means nothing downloads until .play()/.load() is
        // actually called -- videoStarted tracks whether that's happened
        // yet so each clip only starts fetching once its own scene is
        // actually the one in (or about to be in) view, and pauses
        // (without re-fetching) once scrolled away from.
        if (scene.videos.length) {
          const isActive = entry >= 1 && dwellProgress >= scene.activeFrom && dwellProgress < scene.activeTo;
          if (isActive && !scene.videoStarted) {
            scene.videoStarted = true;
            // Always restart from the top -- these clips are scrolling
            // tours of the whole site, not clean loops, so resuming
            // mid-clip (e.g. after the user scrolled away and back) could
            // land on any of their scrolled-past, non-full-bleed moments
            // instead of the full-screen opening shot.
            scene.videos.forEach((v) => {
              v.currentTime = 0;
              v.play().catch(() => {});
            });
          } else if (!isActive && scene.videoStarted) {
            scene.videoStarted = false;
            scene.videos.forEach((v) => v.pause());
          }
        }
      });
    };

    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          update();
          ticking = false;
        });
      }
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('load', update);
  }

  // Project 01/03 (ILKW web) -- six panels (cover + 5 scenes), full glow
  // curve. Numbers unchanged from before this was refactored into a
  // reusable function.
  initWorkDetailSequence(document.getElementById('work'), {
    slideStarts: [50 / 1510, 320 / 1510, 590 / 1510, 860 / 1510, 1130 / 1510],
    slideEnds: [140 / 1510, 410 / 1510, 680 / 1510, 950 / 1510, 1220 / 1510],
    fillEnds: [280 / 1510, 550 / 1510, 820 / 1510, 1090 / 1510, 1360 / 1510],
    sceneBackgrounds: ['#666666', '#4d4d4d', '#333333', '#1a1a1a', '#000000'],
    glowPeaks: [160, -190, -265, 195, -205], // CRAFTING, TYPO, BEFOREAFTER, EDITORIAL, TOGETHER
    glowSpeed: 0.9,
    setDarkContribution: (v) => {
      workDetailDarkContribution = v;
      applyCombinedDarkState();
    },
  });

  // Project 02/03 (W:RUN app) -- five panels (cover + RETENTION scene +
  // COMMUNITY & CREW scene + SHARE your RUN scene + AI running PARTNER scene), same pin/slide/dark-overlay mechanism as
  // project 1 but its own (shorter) pacing and no glow curve (its markup
  // has no .work-detail__glow-curve at all, so glowPeaks is simply
  // omitted). 1240-unit total = 50 (initial hold) + 4 scene budgets
  // (slide/fill/hold) + 150 (final hold), matching .work-detail--p2's
  // expanded height in CSS.
  initWorkDetailSequence(document.getElementById('workDetail2'), {
    slideStarts: [50 / 1240, 320 / 1240, 590 / 1240, 860 / 1240],
    slideEnds: [140 / 1240, 410 / 1240, 680 / 1240, 950 / 1240],
    fillEnds: [280 / 1240, 550 / 1240, 820 / 1240, 1090 / 1240],
    sceneBackgrounds: ['#666666', '#444444', '#222222', '#000000'],
    glowPeaks: [-280, 190, -265, 195], // RETENTION, COMMUNITY, SHARE RUN, AI PARTNER
    glowSpeed: 0.9,
    setDarkContribution: (v) => {
      workDetail2DarkContribution = v;
      applyCombinedDarkState();
    },
  });

  // Project 03/03 (MU:it app) -- cover + USER RESEARCH + ONBOARDING + MATCHING + BEYOND + DEPLOYMENT.
  initWorkDetailSequence(document.getElementById('workDetail3'), {
    slideStarts: [50 / 1510, 320 / 1510, 590 / 1510, 860 / 1510, 1130 / 1510],
    slideEnds: [140 / 1510, 410 / 1510, 680 / 1510, 950 / 1510, 1220 / 1510],
    fillEnds: [280 / 1510, 550 / 1510, 820 / 1510, 1090 / 1510, 1360 / 1510],
    sceneBackgrounds: ['#666666', '#4d4d4d', '#333333', '#1a1a1a', '#000000'],
    glowPeaks: [160, -190, -265, 195, -205], // USER RESEARCH, ONBOARDING, MATCHING, BEYOND, DEPLOYMENT
    glowSpeed: 0.9,
    setDarkContribution: (v) => {
      workDetail3DarkContribution = v;
      applyCombinedDarkState();
    },
  });

  // Clone-coding gallery -- each card rises into place once as it scrolls
  // into view (see .clone-coding__card / .is-revealed in style.css).
  const cloneCards = document.querySelectorAll('.clone-coding__card');
  if (cloneCards.length) {
    const cloneObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          cloneObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });

    cloneCards.forEach((card) => cloneObserver.observe(card));
  }

  // Clone-coding intro -- fog-in reveal across the whole sticky intro
  // (chips, title, subtitle), the reverse of .work-transition__title's
  // fog-dissolve: everything starts blurred/faded/dropped and condenses
  // into place, staggered chips -> title chars -> subtitle. Unlike the
  // one-time card reveal, this toggles .is-revealed on and off as the
  // intro enters/leaves the viewport, so it replays every time you
  // scroll away and back in.
  const cloneIntroEl = document.querySelector('.clone-coding__intro');
  if (cloneIntroEl) {
    const cloneChipEls = Array.from(cloneIntroEl.querySelectorAll('.clone-coding__chip'));
    const cloneTitleEl = cloneIntroEl.querySelector('.clone-coding__title');
    const cloneSubtitleEl = cloneIntroEl.querySelector('.clone-coding__subtitle');

    if (cloneTitleEl) {
      wrapChars(cloneTitleEl, 'clone-coding__title-char');
    }
    const titleChars = cloneTitleEl
      ? Array.from(cloneTitleEl.querySelectorAll('.clone-coding__title-char'))
      : [];

    const cloneDelayStep = isMobileFogViewport() ? 8 : 60;
    // Matches .ai-lab__title-char's own flat 8ms stagger (see the AI Lab
    // block below) -- was 25ms on desktop, visibly slower than AI Lab's
    // title reveal even though both use the same fog-in mechanics.
    const cloneTitleDelayStep = 8;
    const cloneGroupGap = isMobileFogViewport() ? 35 : 150;
    const chipsEnd = cloneChipEls.length * cloneDelayStep;
    cloneChipEls.forEach((el, i) => {
      el.style.setProperty('--fog-delay', `${i * cloneDelayStep}ms`);
    });
    titleChars.forEach((el, i) => {
      el.style.setProperty('--fog-delay', `${chipsEnd + cloneGroupGap + i * cloneTitleDelayStep}ms`);
    });
    if (cloneSubtitleEl) {
      const titleEnd = titleChars.length * cloneTitleDelayStep;
      cloneSubtitleEl.style.setProperty('--fog-delay', `${chipsEnd + cloneGroupGap + titleEnd + cloneGroupGap}ms`);
    }

    const cloneIntroObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        cloneIntroEl.classList.toggle('is-revealed', entry.isIntersecting);
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });

    cloneIntroObserver.observe(cloneIntroEl);
  }

  // AI Lab -- title fog-in reveal, matching the clone-coding title rhythm.
  const aiLabHeadEl = document.querySelector('.ai-lab__head');
  if (aiLabHeadEl) {
    const aiLabTitleEl = aiLabHeadEl.querySelector('.ai-lab__title');
    const aiLabSummaryEl = aiLabHeadEl.querySelector('.ai-lab__summary');
    const aiLabLinksEl = aiLabHeadEl.querySelector('.ai-lab__links');

    if (aiLabTitleEl) {
      wrapChars(aiLabTitleEl, 'ai-lab__title-char');
    }
    const aiLabTitleChars = aiLabTitleEl
      ? Array.from(aiLabTitleEl.querySelectorAll('.ai-lab__title-char'))
      : [];

    aiLabTitleChars.forEach((el, i) => {
      el.style.setProperty('--fog-delay', `${i * 8}ms`);
    });
    if (aiLabSummaryEl) {
      aiLabSummaryEl.style.setProperty('--fog-delay', '35ms');
    }
    if (aiLabLinksEl) {
      aiLabLinksEl.style.setProperty('--fog-delay', '50ms');
    }

    const aiLabObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        aiLabHeadEl.classList.toggle('is-revealed', entry.isIntersecting);
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });

    aiLabObserver.observe(aiLabHeadEl);
  }

  const aiLabBrowserEl = document.querySelector('.ai-lab__browser');
  if (aiLabBrowserEl) {
    const aiLabTryOverlayEl = aiLabBrowserEl.querySelector('.ai-lab__try-overlay');
    const aiLabTryButtonEl = aiLabBrowserEl.querySelector('.ai-lab__try-button');

    if (aiLabTryButtonEl) {
      aiLabTryButtonEl.addEventListener('click', () => {
        aiLabBrowserEl.classList.add('is-unlocked');
        if (aiLabTryOverlayEl) aiLabTryOverlayEl.setAttribute('aria-hidden', 'true');
      });
    }
  }

  const aiLabEl = document.querySelector('.ai-lab');
  if (aiLabEl && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const aiLabCursorEl = aiLabEl.querySelector('.ai-lab__cursor-card');
    const aiLabCursorCopyEl = aiLabEl.querySelector('.ai-lab__cursor-copy');
    const aiLabLinksEl = aiLabEl.querySelector('.ai-lab__links');
    const aiLabAppUrl = aiLabCursorEl ? aiLabCursorEl.dataset.appUrl : '';
    const aiLabCopyText = aiLabCursorCopyEl ? aiLabCursorCopyEl.dataset.text || '' : '';
    const aiLabCopyChars = aiLabCursorCopyEl
      ? aiLabCopyText.split('').map((char, index) => {
        const span = document.createElement('span');
        span.className = 'ai-lab__cursor-copy-char';
        span.textContent = char === ' ' ? '\u00a0' : char;
        span.style.setProperty('--trail-index', index);
        aiLabCursorCopyEl.appendChild(span);
        return span;
      })
      : [];
    let aiLabCursorRaf = 0;
    let aiLabCursorX = -999;
    let aiLabCursorY = -999;
    let aiLabIsOverBrowser = false;
    let aiLabPressTimer = null;

    const isNearAiLabLinks = (event) => {
      if (!aiLabLinksEl) return false;
      const rect = aiLabLinksEl.getBoundingClientRect();
      const gap = 28;
      return event.clientX >= rect.left - gap
        && event.clientX <= rect.right + gap
        && event.clientY >= rect.top - gap
        && event.clientY <= rect.bottom + gap;
    };

    const updateAiLabCursorVisibility = (event) => {
      aiLabEl.classList.toggle('is-cursor-hidden', aiLabIsOverBrowser || isNearAiLabLinks(event));
    };

    const setAiLabCursor = (event) => {
      aiLabCursorX = event.clientX;
      aiLabCursorY = event.clientY;
      updateAiLabCursorVisibility(event);
      if (!aiLabCursorEl || aiLabCursorRaf) return;

      aiLabCursorRaf = window.requestAnimationFrame(() => {
        aiLabCursorEl.style.transform = `translate3d(${aiLabCursorX}px, ${aiLabCursorY}px, 0) translate(-50%, -50%) rotate(-5deg)`;
        if (aiLabCursorCopyEl) {
          aiLabCursorCopyEl.style.transform = `translate3d(${aiLabCursorX + 26}px, ${aiLabCursorY + 18}px, 0)`;
        }
        aiLabCursorRaf = 0;
      });
    };

    aiLabEl.addEventListener('mouseenter', (event) => {
      setAiLabCursor(event);
      aiLabEl.classList.add('is-cursor-active');
    });

    aiLabEl.addEventListener('mousemove', (event) => {
      setAiLabCursor(event);
    });

    aiLabEl.addEventListener('mouseleave', () => {
      aiLabEl.classList.remove('is-cursor-active', 'is-cursor-hidden');
      if (aiLabCursorRaf) {
        window.cancelAnimationFrame(aiLabCursorRaf);
        aiLabCursorRaf = 0;
      }
    });

    aiLabEl.addEventListener('pointerdown', (event) => {
      if (event.target.closest('a, button, iframe, .ai-lab__browser')) return;
      if (isNearAiLabLinks(event)) return;
      if (aiLabCursorEl) aiLabCursorEl.classList.add('is-pressed');
    });

    aiLabEl.addEventListener('click', (event) => {
      if (event.target.closest('a, button, iframe, .ai-lab__browser')) return;
      if (isNearAiLabLinks(event)) return;
      if (aiLabAppUrl) {
        window.open(aiLabAppUrl, '_blank', 'noopener');
        if (aiLabCursorEl) {
          aiLabCursorEl.classList.add('is-pressed');
          window.clearTimeout(aiLabPressTimer);
          aiLabPressTimer = window.setTimeout(() => {
            aiLabCursorEl.classList.remove('is-pressed');
          }, 180);
        }
      }
    });

    if (aiLabBrowserEl) {
      aiLabBrowserEl.addEventListener('mouseenter', () => {
        aiLabIsOverBrowser = true;
        aiLabEl.classList.add('is-cursor-hidden');
      });

      aiLabBrowserEl.addEventListener('mouseleave', () => {
        aiLabIsOverBrowser = false;
        aiLabEl.classList.remove('is-cursor-hidden');
      });
    }
  }

  // Skill content -- fog-in reveal for the SKILL title + Korean subtitle,
  // identical mechanics to .clone-coding__intro above (title chars wrap
  // + stagger via --fog-delay, subtitle fades as one block), replaying on
  // every re-entry via IntersectionObserver.
  const skillIntroEl = document.querySelector('.skill-content__intro');
  if (skillIntroEl) {
    const skillTitleEl = skillIntroEl.querySelector('.skill-content__title');
    const skillSubtitleEl = skillIntroEl.querySelector('.skill-content__subtitle');

    if (skillTitleEl) {
      wrapChars(skillTitleEl, 'skill-content__title-char');
    }
    const skillTitleChars = skillTitleEl
      ? Array.from(skillTitleEl.querySelectorAll('.skill-content__title-char'))
      : [];

    // Matches .ai-lab__title-char's flat 8ms stagger -- was 25ms on desktop.
    const skillFogDelayStep = 8;
    skillTitleChars.forEach((el, i) => {
      el.style.setProperty('--fog-delay', `${i * skillFogDelayStep}ms`);
    });
    if (skillSubtitleEl) {
      const titleEnd = skillTitleChars.length * skillFogDelayStep;
      skillSubtitleEl.style.setProperty('--fog-delay', `${titleEnd + (isMobileFogViewport() ? 35 : 150)}ms`);
    }

    const skillIntroObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        skillIntroEl.classList.toggle('is-revealed', entry.isIntersecting);
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });

    skillIntroObserver.observe(skillIntroEl);
  }

  // Quick Q&A -- title fog-in reveal plus accessible accordion behavior.
  const quickQaEl = document.querySelector('.quick-qa');
  if (quickQaEl) {
    const quickQaTitleEl = quickQaEl.querySelector('.quick-qa__title');
    const quickQaSubtitleEl = quickQaEl.querySelector('.quick-qa__subtitle');
    const quickQaItems = Array.from(quickQaEl.querySelectorAll('.quick-qa__item'));

    if (quickQaTitleEl) {
      wrapChars(quickQaTitleEl, 'quick-qa__title-char');
    }
    const quickQaTitleChars = quickQaTitleEl
      ? Array.from(quickQaTitleEl.querySelectorAll('.quick-qa__title-char'))
      : [];

    // Matches .ai-lab__title-char's flat 8ms stagger -- was 25ms on desktop.
    const quickQaFogDelayStep = 8;
    quickQaTitleChars.forEach((el, i) => {
      el.style.setProperty('--fog-delay', `${i * quickQaFogDelayStep}ms`);
    });
    if (quickQaSubtitleEl) {
      const titleEnd = quickQaTitleChars.length * quickQaFogDelayStep;
      quickQaSubtitleEl.style.setProperty('--fog-delay', `${titleEnd + (isMobileFogViewport() ? 35 : 150)}ms`);
    }

    const updateQuickQaDarkState = () => {
      const rect = quickQaEl.getBoundingClientRect();
      const vh = window.innerHeight;
      // Mobile: the section right before this one (the about gallery) is a
      // long, transparent-background pinned dwell -- ramping this a full
      // viewport-height early (like desktop) let the overlay visibly tint
      // over its still fully-on-screen white content. Desktop doesn't hit
      // this because whatever precedes each ramp there is already
      // dark/opaque by the time its own early ramp starts.
      const entryMargin = window.innerWidth <= 1023 ? 200 : vh;
      const entry = Math.min(1, Math.max(0, (entryMargin - rect.top) / entryMargin));
      const exit = Math.min(1, Math.max(0, rect.bottom / vh));
      quickQaDarkContribution = Math.min(entry, exit);
      // .ready-cta and .site-footer both sit directly after quick-qa with no
      // gap between any of them, and both are solid black with no fade of
      // their own, so rect.bottom here IS the top edge of that whole opaque
      // black run through to the end of the page -- reusing this same
      // reading (rather than separate scroll-ordered listeners on each
      // section after it) is what actually matters: independent listeners
      // computing complementary halves of the same boundary can transiently
      // disagree for one 'scroll' event during a fast (nav-jump) scroll, if
      // one has updated its contribution for the new position and calls
      // applyCombinedDarkState before the other has -- producing exactly one
      // frame where the header logo flicks black then immediately back to
      // white. Deriving all of it from one reading, in one function, closes
      // that gap entirely. Tolerance (not a strict <= 0): at rest, sub-pixel
      // scroll rounding can leave rect.bottom reading as a tiny positive
      // value (observed 0.1171875) even when the footer visually fills the
      // entire viewport, which a strict <= 0 check would miss forever.
      blackSectionDarkContribution = rect.bottom <= 1 ? 1 : 0;
      applyCombinedDarkState();
    };

    // No internal rAF throttle on this one already (registered directly
    // below), so it was never actually at risk of the staleness the other
    // sections' refreshers guard against -- registered anyway so every
    // contribution is refreshed from the exact same instant, no exceptions.
    darkContributionRefreshers.push(() => {
      const rect = quickQaEl.getBoundingClientRect();
      const vh = window.innerHeight;
      const entryMargin = window.innerWidth <= 1023 ? 200 : vh;
      const entry = Math.min(1, Math.max(0, (entryMargin - rect.top) / entryMargin));
      const exit = Math.min(1, Math.max(0, rect.bottom / vh));
      quickQaDarkContribution = Math.min(entry, exit);
      blackSectionDarkContribution = rect.bottom <= 1 ? 1 : 0;
    });

    const setQuickQaItem = (item, open) => {
      const button = item.querySelector('.quick-qa__question');
      const answer = item.querySelector('.quick-qa__answer');
      const inner = item.querySelector('.quick-qa__answer-inner');
      if (!button || !answer || !inner) return;

      item.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));

      if (open) {
        answer.hidden = false;
        void answer.offsetHeight;
        answer.style.maxHeight = `${inner.scrollHeight}px`;
      } else {
        answer.style.maxHeight = '0px';
        answer.addEventListener('transitionend', function onEnd(event) {
          if (event.propertyName !== 'max-height') return;
          answer.removeEventListener('transitionend', onEnd);
          if (!item.classList.contains('is-open')) answer.hidden = true;
        });
      }
    };

    quickQaItems.forEach((item) => {
      const button = item.querySelector('.quick-qa__question');
      const answer = item.querySelector('.quick-qa__answer');
      if (!button || !answer) return;
      answer.hidden = true;
      answer.style.maxHeight = '0px';
      button.addEventListener('click', () => {
        setQuickQaItem(item, !item.classList.contains('is-open'));
      });
    });

    window.addEventListener('resize', rafCoalesce(() => {
      quickQaItems.forEach((item) => {
        if (!item.classList.contains('is-open')) return;
        const answer = item.querySelector('.quick-qa__answer');
        const inner = item.querySelector('.quick-qa__answer-inner');
        if (answer && inner) answer.style.maxHeight = `${inner.scrollHeight}px`;
      });
    }));

    const quickQaObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        quickQaEl.classList.toggle('is-revealed', entry.isIntersecting);
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });

    quickQaObserver.observe(quickQaEl);
    updateQuickQaDarkState();
    window.addEventListener('scroll', updateQuickQaDarkState, { passive: true });
    window.addEventListener('resize', rafCoalesce(updateQuickQaDarkState));
    window.addEventListener('load', updateQuickQaDarkState);
  }

  // .site-footer__nav a's :hover swaps its font (uppercase Neue Montreal ->
  // italic lowercase Cardinal Fruit), which renders noticeably narrower --
  // and since the link has no explicit width, both it and its auto-sized
  // .site-footer__nav parent shrink to match. If the cursor happens to sit
  // in that shrunk-away sliver (most likely right at the link's own,
  // now-stale right edge), the box retracting out from under it ends
  // :hover, which grows the box back, which re-enters :hover, which
  // shrinks it again -- a rapid oscillation that reads as the hover
  // "lagging"/jittering. Pinning each link's natural (un-hovered) width as
  // a min-width means the box can only ever grow on hover, never shrink
  // back past where the cursor already was, so it can't retrigger itself.
  const footerNavLinks = document.querySelectorAll('.site-footer__nav a');
  const pinFooterNavLinkWidths = () => {
    footerNavLinks.forEach((link) => {
      // Cleared first: the link's own font-size scales with --u (the
      // footer's own cqw-based unit), so a leftover min-width from before a
      // resize would otherwise floor this remeasurement too high/low.
      link.style.minWidth = '';
      link.style.minWidth = `${link.getBoundingClientRect().width}px`;
    });
  };
  pinFooterNavLinkWidths();
  window.addEventListener('resize', rafCoalesce(pinFooterNavLinkWidths));

  const footerTopButton = document.querySelector('.site-footer__top');
  if (footerTopButton) {
    footerTopButton.addEventListener('click', () => {
      isNavJumping = true;
      suspendNavJumpVisuals = true;
      navJumpToken += 1;
      header.classList.remove('header--hidden');
      releaseCardsRevealLock();
      releaseSkillCarouselLock();
      navJumpActiveLock = true;
      setActiveNav('intro');
      if (darkOverlayEl) {
        darkOverlayEl.style.transition = 'opacity 0.45s ease';
        darkOverlayEl.style.opacity = '0';
      }
      header.classList.remove('header--inverted');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      window.history.pushState(null, '', '#intro');
      waitForJumpToSettle(0);
    });
  }

  const portfolioChatbotEl = document.getElementById('portfolioChatbot');
  if (portfolioChatbotEl) {
    const chatbotToggle = portfolioChatbotEl.querySelector('.portfolio-chatbot__toggle');
    const chatbotPanel = portfolioChatbotEl.querySelector('.portfolio-chatbot__panel');
    const chatbotClose = portfolioChatbotEl.querySelector('.portfolio-chatbot__close');
    const chatbotMessages = portfolioChatbotEl.querySelector('.portfolio-chatbot__messages');
    const chatbotForm = portfolioChatbotEl.querySelector('.portfolio-chatbot__form');
    const chatbotInput = portfolioChatbotEl.querySelector('.portfolio-chatbot__input');
    const chatbotChips = Array.from(portfolioChatbotEl.querySelectorAll('[data-chat-question]'));
    const chatbotLightbox = document.getElementById('portfolioChatbotLightbox');
    const chatbotLightboxImg = document.getElementById('portfolioChatbotLightboxImg');
    const chatbotLightboxClose = chatbotLightbox ? chatbotLightbox.querySelector('.portfolio-chatbot__lightbox-close') : null;
    let chatbotSeeded = false;

    const openChatbotLightbox = (src, alt) => {
      if (!chatbotLightbox || !chatbotLightboxImg) return;
      chatbotLightboxImg.src = src;
      chatbotLightboxImg.alt = alt || '';
      chatbotLightbox.hidden = false;
    };

    const closeChatbotLightbox = () => {
      if (!chatbotLightbox) return;
      chatbotLightbox.hidden = true;
    };

    if (chatbotLightboxClose) chatbotLightboxClose.addEventListener('click', closeChatbotLightbox);
    if (chatbotLightbox) {
      chatbotLightbox.addEventListener('click', (event) => {
        if (event.target === chatbotLightbox) closeChatbotLightbox();
      });
    }
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && chatbotLightbox && !chatbotLightbox.hidden) closeChatbotLightbox();
    });

    // overscroll-behavior alone doesn't reliably stop scroll from chaining
    // to the page when the wheel event fires over panel chrome (header,
    // chips, form) that has nothing of its own to scroll, so block it here:
    // let .portfolio-chatbot__messages scroll freely, but swallow the wheel
    // event once it hits either edge or when it's outside the messages list.
    // stopPropagation is required too -- several sections (gallery-interaction,
    // the hero intro) hijack scroll via their own window-level wheel
    // listeners that call window.scrollTo directly, so merely calling
    // preventDefault here (which only cancels the browser's native scroll)
    // doesn't stop those from still moving the page underneath the panel.
    if (chatbotPanel) {
      chatbotPanel.addEventListener('wheel', (event) => {
        event.stopPropagation();
        const insideMessages = chatbotMessages && chatbotMessages.contains(event.target);
        if (!insideMessages) {
          event.preventDefault();
          return;
        }
        const { scrollTop, scrollHeight, clientHeight } = chatbotMessages;
        const atTop = scrollTop <= 0 && event.deltaY < 0;
        const atBottom = scrollTop + clientHeight >= scrollHeight && event.deltaY > 0;
        if (atTop || atBottom) event.preventDefault();
      }, { passive: false });
    }

    const BIRTH_DATE = new Date(2000, 1, 23); // 2000-02-23

    const getKoreanAge = (birthDate, today = new Date()) => {
      let age = today.getFullYear() - birthDate.getFullYear();
      const hasHadBirthdayThisYear = (
        today.getMonth() > birthDate.getMonth()
        || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate())
      );
      if (!hasHadBirthdayThisYear) age -= 1;
      return age;
    };

    const chatbotInfo = {
      education: '단국대학교 음악대학 피아노과를 졸업하고,\n이화여자대학교 대학원에서 피아노과를 졸업했습니다.\n피아노를 전공했지만 디자인을 통해 다채로운 경험을 만드는 일에 매력을 느껴 새로운 분야에 도전하게 되었습니다.',
      major: '전공은 피아노입니다. 현재는 UX/UI 디자인, 서비스 기획, Frontend 화면 구현까지 함께 다룹니다.',
      get age() {
        return `2000년 2월 23일생으로, 만 ${getKoreanAge(BIRTH_DATE)}세입니다.`;
      },
      mbti: 'MBTI는 ISFJ입니다.\n책임감과 꼼꼼함을 바탕으로 완성도 높은 결과를 만드는 사람입니다.',
      hobby: '취미와 관심사는 사진 촬영, 전시 관람, 콘서트 관람, 음악 감상입니다.\n다양한 경험을 디자인의 시선으로 관찰하고 의미를 발견하는 것을 좋아합니다.',
      philosophy: '디자인은 단순히 보기 좋은 결과물을 만드는 것이 아니라, 사람들이 서비스를 계속 사용하고 머물고 싶어 하는 이유를 만드는 과정이라고 생각합니다.\n사용자의 행동과 감정을 이해하고 작은 디테일까지 고민할 때 비로소 의미 있는 경험이 만들어진다고 믿습니다.',
      projects: '대표 프로젝트는 일광전구 웹 리뉴얼, W:RUN 러닝 팬덤 앱, MU:it 클래식 음악 레슨 매칭 앱, AI Font Pairing Poster Studio입니다.',
      transition: '피아노를 전공하면서도 연주회 포스터를 직접 제작할 만큼 디자인에 관심이 많았습니다.\n디자인 직무 중에서도 사용자의 행동과 감정을 고려해 더 나은 경험을 만들어가는 UX/UI 디자인은 저에게 새로운 형태의 창작으로 다가왔고, 큰 흥미와 매력을 느껴 UX/UI 디자이너의 길을 선택하게 되었습니다.',
    };

    // thumb: pre-downscaled (900px-wide) copy for the grid -- the source
    // photos are up to 4500px wide, and letting the browser downsize that
    // much on the fly for a ~130px grid cell looks soft/aliased. full is the
    // original, used only when the poster is opened larger in the lightbox.
    const posterItems = [
      { title: '연주회 포스터', thumb: 'images/chat-poster-1-thumb.webp', full: 'images/chat-poster-1.webp' },
      { title: '연주회 포스터', thumb: 'images/chat-poster-2-thumb.webp', full: 'images/chat-poster-2.webp' },
      { title: '연주회 포스터', thumb: 'images/chat-poster-3-thumb.webp', full: 'images/chat-poster-3.webp' },
      { title: '연주회 포스터', thumb: 'images/chat-poster-4-thumb.webp', full: 'images/chat-poster-4.webp' },
      { title: '연주회 포스터', thumb: 'images/chat-poster-5-thumb.webp', full: 'images/chat-poster-5.webp' },
      { title: '연주회 포스터', thumb: 'images/chat-poster-6-thumb.webp', full: 'images/chat-poster-6.webp' },
      { title: '연주회 포스터', thumb: 'images/chat-poster-7-thumb.webp', full: 'images/chat-poster-7.webp' },
      { title: '연주회 포스터', thumb: 'images/chat-poster-8-thumb.webp', full: 'images/chat-poster-8.webp' },
      { title: '연주회 포스터', thumb: 'images/chat-poster-9-thumb.webp', full: 'images/chat-poster-9.webp' },
    ];

    // Keyed by an internal id (not the display name) so showProjectDetail can
    // look a project up after showProjectMenu passes only the id around.
    const projectShortcuts = {
      ilkw: {
        name: '일광전구 웹 리뉴얼 프로젝트',
        desc: '조명 브랜드 일광전구가 가진 역사와 감성을 전달하기 위해 기획한 웹사이트 리뉴얼 프로젝트입니다. (팀 프로젝트)',
        mockup: { type: 'image', src: 'images/work-ilkw-mockup.webp', alt: '일광전구 웹사이트 목업' },
        options: [
          { label: '기획서', href: 'https://www.figma.com/proto/hlugZvAft0bIvHr3sZrKwU/%EC%9D%BC%EA%B4%91%EC%A0%84%EA%B5%AC_%ED%8C%80%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8?node-id=40-469&viewport=2066%2C9299%2C0.28&t=KKgqrZJwd6AlwidY-1&scaling=min-zoom&content-scaling=fixed&page-id=1%3A1508' },
          { label: '웹사이트', href: 'https://ezen-teamproject-1.vercel.app/' },
        ],
      },
      werun: {
        name: 'W:RUN 러닝 팬덤 어플',
        desc: '러닝 팬덤을 위한 커뮤니티 러닝 앱 서비스를 기획하고 구현한 프로젝트입니다. (팀 프로젝트)',
        mockup: { type: 'image', src: 'images/work-werun-mockup.webp', alt: 'W:RUN 앱 목업' },
        options: [
          { label: '기획서', href: 'https://www.figma.com/proto/cH2dx12auBMFkl7k0c71JD/%EC%9C%84%EB%9F%B0_%ED%8C%80%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8?node-id=1-87&viewport=371%2C924%2C0.19&t=yvpTHuz9spNYRSIv-1&scaling=min-zoom&content-scaling=fixed&page-id=0%3A1' },
          { label: '어플', href: 'https://ezenteamproject2.vercel.app/' },
        ],
      },
      muit: {
        name: 'MU:it 레슨 매칭 및 성장 관리 어플',
        desc: '클래식 음악 레슨 매칭 및 성장 관리를 돕는 어플 서비스입니다. (개인 프로젝트)',
        mockup: { type: 'image', src: 'images/work-muit-mockup.webp', alt: 'MU:it 앱 목업' },
        options: [
          { label: '기획서', href: 'https://www.figma.com/proto/qRzZGUELmg7uROT616MDIk/%EB%AE%A4%EC%9E%87_%EA%B0%9C%EC%9D%B8%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8?node-id=80-1863&viewport=-2114%2C4043%2C0.13&t=rYdodlYd3H1WPOpw-1&scaling=min-zoom&content-scaling=fixed&page-id=1%3A22552' },
          { label: '어플', href: 'https://muit-app.vercel.app/' },
        ],
      },
      aiPoster: {
        name: 'AI 폰트 페어링 포스터 스튜디오',
        desc: '사용자가 다양한 폰트 조합과 디자인 시안을 탐색할 수 있도록 AI를 활용한 폰트 페어링 및 포스터 생성 기능을 기획한 프로젝트입니다.',
        // The AI Lab section on the page itself layers this same screen
        // capture inside this same bezel frame (see .ai-lab__ipad-device /
        // .ai-lab__ipad-bezel in style.css) rather than using one flattened
        // image, so the thumbnail here does the same composite.
        mockup: { type: 'ipad', screen: 'images/ai-ipad.webp', bezel: 'images/ai-lab-ipad-device.webp', alt: 'AI 포스터 스튜디오 iPad 화면' },
        options: [
          { label: '케이스 스터디', href: 'https://in-app-case-study.vercel.app/' },
          { label: '데모', href: 'https://ai-font-poster-studio.vercel.app/' },
        ],
      },
    };
    const projectShortcutOrder = ['ilkw', 'werun', 'muit', 'aiPoster'];

    const escapeHtml = (value) => String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const getChatbotAnswer = (rawQuestion) => {
      const question = rawQuestion.trim().toLowerCase();
      if (/^(안녕|안녕하세요|하이|hi|hello)[!?.~\s]*$/i.test(question)) {
        return { text: '안녕하세요. 궁금한 점이 있으시다면 편하게 질문해주세요!' };
      }
      if (!question) return { text: '궁금한 내용을 한 단어로만 적어도 괜찮아요. 예: 학력, MBTI, 포스터' };
      if (question.includes('학력') || question.includes('학교') || question.includes('education')) {
        return { text: chatbotInfo.education };
      }
      if (question.includes('전환') || question.includes('바꾸게') || question.includes('바뀌게') || question.includes('선택')) {
        return { text: chatbotInfo.transition };
      }
      if (question.includes('전공') || question.includes('피아노') || question.includes('major')) {
        return { text: chatbotInfo.major };
      }
      if (question.includes('나이') || question.includes('age')) {
        return { text: chatbotInfo.age };
      }
      if (question.includes('mbti')) {
        return { text: chatbotInfo.mbti };
      }
      if (question.includes('취미') || question.includes('관심') || question.includes('hobby')) {
        return { text: chatbotInfo.hobby };
      }
      if (question.includes('철학') || question.includes('가치') || question.includes('디자인')) {
        return { text: chatbotInfo.philosophy };
      }
      if (question.includes('프로젝트') || question.includes('작업') || question.includes('work')) {
        return { text: chatbotInfo.projects };
      }
      if (question.includes('포스터') || question.includes('연주회') || question.includes('poster')) {
        return {
          text: '학사와 석사 졸업연주를 준비하며 직접 연주회 포스터를 제작했었고, 이후 동기들의 졸업연주 포스터 제작도 맡아 진행했습니다.\n이 경험을 통해 시각적 커뮤니케이션과 디자인에 관심을 갖게 되었습니다.',
          posters: posterItems,
        };
      }
      if (question.includes('연락') || question.includes('메일') || question.includes('contact')) {
        return { text: '메일은 flora000223@naver.com, 연락처는 010-8379-0023입니다.' };
      }
      if (question.includes('채용') || question.includes('면접') || question.includes('컨택') || question.includes('상담') || question.includes('피드백') || question.includes('문의') || question.includes('제안')) {
        return { text: '채용 및 면접 관련 문의는 flora000223@naver.com 또는 010-8379-0023으로 연락 주시면 빠르게 회신드리겠습니다.' };
      }
      return null;
    };

    // Anything that doesn't match a known keyword above falls through to
    // this serverless proxy (see /api/chat.js) rather than a canned "모르는
    // 질문입니다" reply -- the proxy holds the Anthropic key server-side and
    // forwards it a short bio so Claude can answer in-character as 박지현.
    const fetchClaudeAnswer = async (question) => {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question }),
      });
      if (!response.ok) throw new Error(`chat api responded ${response.status}`);
      const data = await response.json();
      if (!data || !data.answer) throw new Error('empty answer from chat api');
      return data.answer;
    };

    const renderChatbotMessageText = (text) => String(text || '')
      .split('\n')
      .filter(Boolean)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('');

    // Returns the message element so callers (the Claude fallback path) can
    // swap a "답변을 준비하고 있어요..." placeholder for the real answer once
    // it arrives, instead of appending a second bubble.
    const setChatbotMessageText = (el, text) => {
      if (!el || !chatbotMessages) return;
      el.innerHTML = renderChatbotMessageText(text);
      chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    };

    const appendChatbotPosters = (message, posters) => {
      if (!message || !posters) return;
      const grid = document.createElement('div');
      grid.className = 'portfolio-chatbot__poster-grid';
      posters.forEach((poster) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'portfolio-chatbot__poster';
        card.innerHTML = `
          <img src="${escapeHtml(poster.thumb)}" alt="${escapeHtml(poster.title)}">
        `;
        card.addEventListener('click', () => openChatbotLightbox(poster.full, poster.title));
        grid.append(card);
      });
      message.append(grid);
      chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    };

    // Renders either link buttons (item.href -- opens the project's proposal/
    // site in a new tab) or action buttons (item.onSelect -- picks a project
    // from the shortcut menu and continues the conversation in-place).
    const appendChatbotOptions = (message, items) => {
      if (!message || !items || !items.length) return;
      const wrap = document.createElement('div');
      wrap.className = 'portfolio-chatbot__options';
      // Link groups (proposal/website) are always short and read better side
      // by side; the project-picker menu stays stacked since it can hold
      // four items. All items in one call share a type, so checking the
      // first is enough.
      if (items[0].href) wrap.classList.add('portfolio-chatbot__options--row');
      items.forEach((item) => {
        const el = document.createElement(item.href ? 'a' : 'button');
        el.className = 'portfolio-chatbot__option';
        el.textContent = item.label;
        if (item.href) {
          el.href = item.href;
          el.target = '_blank';
          el.rel = 'noopener';
        } else {
          el.type = 'button';
          // Deliberately left enabled after click (unlike a typical picked
          // state) so a project menu earlier in the conversation history can
          // still be reused to pull up a different project's detail.
          el.addEventListener('click', () => item.onSelect());
        }
        wrap.append(el);
      });
      message.append(wrap);
      chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    };

    const appendChatbotMessage = (type, answer) => {
      if (!chatbotMessages) return null;
      const message = document.createElement('div');
      message.className = `portfolio-chatbot__message portfolio-chatbot__message--${type}`;
      if (type === 'bot') message.classList.add('portfolio-chatbot__message--entering');
      message.innerHTML = renderChatbotMessageText(answer.text);

      appendChatbotPosters(message, answer.posters);
      appendChatbotOptions(message, answer.options);

      chatbotMessages.append(message);
      chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
      return message;
    };

    // Sits above the detail bubble as its own element (not inside the
    // message bubble) so it can be sized independently -- small, and capped
    // to roughly the bubble's own width rather than stretching full-width.
    const appendChatbotMockup = (mockup) => {
      if (!mockup || !chatbotMessages) return;
      const wrap = document.createElement('div');
      wrap.className = 'portfolio-chatbot__project-mockup portfolio-chatbot__message--entering';
      if (mockup.type === 'ipad') {
        wrap.classList.add('portfolio-chatbot__project-mockup--ipad');
        const screen = document.createElement('img');
        screen.className = 'portfolio-chatbot__project-mockup-screen';
        screen.src = mockup.screen;
        screen.alt = '';
        const bezel = document.createElement('img');
        bezel.className = 'portfolio-chatbot__project-mockup-bezel';
        bezel.src = mockup.bezel;
        bezel.alt = mockup.alt || '';
        wrap.append(screen, bezel);
      } else {
        const img = document.createElement('img');
        img.src = mockup.src;
        img.alt = mockup.alt || '';
        wrap.append(img);
      }
      chatbotMessages.append(wrap);
      chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    };

    const showProjectDetail = (key) => {
      const project = projectShortcuts[key];
      if (!project) return;
      appendChatbotMessage('user', { text: project.name });
      appendChatbotMockup(project.mockup);
      appendChatbotMessage('bot', { text: project.desc, options: project.options });
    };

    const showProjectMenu = () => {
      appendChatbotMessage('bot', {
        text: '프로젝트를 선택해주세요.',
        options: projectShortcutOrder.map((key) => ({
          label: projectShortcuts[key].name,
          onSelect: () => showProjectDetail(key),
        })),
      });
    };

    const openChatbot = () => {
      if (!chatbotPanel || !chatbotToggle) return;
      chatbotPanel.hidden = false;
      chatbotToggle.setAttribute('aria-expanded', 'true');
      chatbotToggle.setAttribute('aria-label', '챗봇 닫기');
      // The header canvas sits inside this panel, which is `display: none`
      // until now -- it measured 0x0 on the initial (hidden) page load, so
      // it needs an explicit redraw now that it actually has real size.
      chatbotHeaderStaffCanvas?.refresh();
      if (!chatbotSeeded) {
        chatbotSeeded = true;
        appendChatbotMessage('bot', {
          text: '안녕하세요. 지원자 박지현입니다.\n학력, 나이, MBTI 등 저에 대해 궁금한 점이 있으시다면 편하게 질문해주세요.',
        });
      }
      if (chatbotInput) chatbotInput.focus();
    };

    const closeChatbot = () => {
      if (!chatbotPanel || !chatbotToggle) return;
      chatbotPanel.hidden = true;
      chatbotToggle.setAttribute('aria-expanded', 'false');
      chatbotToggle.setAttribute('aria-label', '챗봇 열기');
    };

    const askChatbot = async (question) => {
      appendChatbotMessage('user', { text: question });
      if (question.includes('바로가기')) {
        showProjectMenu();
        return;
      }
      const knownAnswer = getChatbotAnswer(question);
      if (knownAnswer) {
        appendChatbotMessage('bot', knownAnswer);
        return;
      }
      const pending = appendChatbotMessage('bot', { text: '답변을 준비하고 있어요...' });
      try {
        const answerText = await fetchClaudeAnswer(question);
        setChatbotMessageText(pending, answerText);
      } catch (err) {
        setChatbotMessageText(pending, '지금은 답변을 가져오지 못했어요. 학력, 나이, MBTI, 취미, 디자인 철학, 프로젝트, 연주회 포스터 등 다른 질문으로 다시 물어봐주세요.');
      }
    };

    if (chatbotToggle) {
      chatbotToggle.addEventListener('click', () => {
        if (chatbotPanel && chatbotPanel.hidden) openChatbot();
        else closeChatbot();
      });
    }

    if (chatbotClose) chatbotClose.addEventListener('click', closeChatbot);

    chatbotChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        openChatbot();
        askChatbot(chip.dataset.chatQuestion || chip.textContent || '');
      });
    });

    if (chatbotForm && chatbotInput) {
      chatbotForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const question = chatbotInput.value.trim();
        if (!question) return;
        chatbotInput.value = '';
        askChatbot(question);
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && chatbotPanel && !chatbotPanel.hidden) closeChatbot();
    });

    // Click anywhere outside the widget (toggle button + panel) closes it.
    // portfolioChatbotEl wraps both, so a click on the toggle itself is
    // still "inside" here and left to its own handler above instead of
    // being double-closed.
    document.addEventListener('click', (event) => {
      if (chatbotPanel && !chatbotPanel.hidden && !portfolioChatbotEl.contains(event.target)) {
        closeChatbot();
      }
    });

    // Hidden while the footer (whose own "scroll to top" button sits in
    // this same corner) is in view.
    const footerEl = document.getElementById('contact');
    let chatbotOverFooter = false;
    const updateChatbotVisibility = () => {
      portfolioChatbotEl.classList.toggle('portfolio-chatbot--hidden', chatbotOverFooter);
    };
    if (footerEl) {
      const footerObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          chatbotOverFooter = entry.isIntersecting;
          updateChatbotVisibility();
        });
      }, { rootMargin: '0px' });
      footerObserver.observe(footerEl);
    }
  }

  /* Ready CTA -- title/desc fade in via IntersectionObserver as the section
     first scrolls into view, then a pinned scroll dwell (.ready-cta__sticky)
     plays the three photo cards falling into place one at a time (back card
     first, matching DOM/z-index order), then cross-fades the English desc to
     Korean and holds there for a while, all before the footer is allowed to
     scroll in. Same dwellProgress + vh-pinned-threshold technique as
     intro-reasons' update() above, just simpler (no title hand-off, no char
     fill). Dropped entirely on mobile -- see .ready-cta's max-width:1023px
     rules, which already show every card/the English line in its final
     static state. */
  const readyCtaEl = document.querySelector('.ready-cta');
  if (readyCtaEl && window.matchMedia('(min-width: 1024px)').matches) {
    const readyCtaCardA = readyCtaEl.querySelector('.ready-cta__card--a');
    const readyCtaCardB = readyCtaEl.querySelector('.ready-cta__card--b');
    const readyCtaCardC = readyCtaEl.querySelector('.ready-cta__card--c');
    const readyCtaDescEl = readyCtaEl.querySelector('.ready-cta__desc');
    const readyCtaTextEl = readyCtaEl.querySelector('.ready-cta__text');

    if (readyCtaTextEl) {
      const readyCtaTextObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          readyCtaTextEl.classList.toggle('is-revealed', entry.isIntersecting);
        });
      }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });
      readyCtaTextObserver.observe(readyCtaTextEl);
    }

    const getReadyCtaDwellProgress = () => {
      const rect = readyCtaEl.getBoundingClientRect();
      const dwellDist = readyCtaEl.offsetHeight - window.innerHeight;
      return dwellDist > 0 ? Math.min(1, Math.max(0, -rect.top / dwellDist)) : 0;
    };

    let readyCtaPrevScrollY = window.scrollY;
    let readyCtaScrollingUp = false;

    const updateReadyCta = () => {
      const dwellProgress = getReadyCtaDwellProgress();
      const dwellDist = readyCtaEl.offsetHeight - window.innerHeight;
      if (dwellDist <= 0) return;

      const vh = window.innerHeight / 100;
      // Fixed vh distances (not fractions of the whole dwell) so however
      // long .ready-cta's CSS height is tuned to be, each stage always
      // fires after the same amount of physical scrolling -- same
      // reasoning as intro-reasons' FILL_END_VH/SWAP_TRIGGER_VH.
      const CARD_A_VH = 30;
      const CARD_B_VH = 80;
      const CARD_C_VH = 130;
      const DESC_SWAP_VH = 165;
      // Scrolling back up, every stage un-reveals this much earlier (at
      // higher dwell progress) than it revealed on the way down. Without
      // the lead, card A starts its 0.9s fly-up only 30vh before the pin
      // releases, so it's still mid-flight when the section un-sticks and
      // visibly rides up with the page; with it, the whole stack has
      // exited while still pinned and only then does the scroll let go.
      const UP_LEAD_VH = 60;

      const scrollYNow = window.scrollY;
      if (scrollYNow !== readyCtaPrevScrollY) readyCtaScrollingUp = scrollYNow < readyCtaPrevScrollY;
      readyCtaPrevScrollY = scrollYNow;
      const leadVh = readyCtaScrollingUp ? UP_LEAD_VH : 0;

      if (readyCtaCardA) readyCtaCardA.classList.toggle('is-revealed', dwellProgress >= ((CARD_A_VH + leadVh) * vh) / dwellDist);
      if (readyCtaCardB) readyCtaCardB.classList.toggle('is-revealed', dwellProgress >= ((CARD_B_VH + leadVh) * vh) / dwellDist);
      if (readyCtaCardC) readyCtaCardC.classList.toggle('is-revealed', dwellProgress >= ((CARD_C_VH + leadVh) * vh) / dwellDist);
      if (readyCtaDescEl) readyCtaDescEl.classList.toggle('is-swapped', dwellProgress >= ((DESC_SWAP_VH + leadVh) * vh) / dwellDist);
    };

    let readyCtaTicking = false;
    const onReadyCtaScroll = () => {
      if (!readyCtaTicking) {
        readyCtaTicking = true;
        requestAnimationFrame(() => {
          updateReadyCta();
          readyCtaTicking = false;
        });
      }
    };

    updateReadyCta();
    window.addEventListener('scroll', onReadyCtaScroll, { passive: true });
    window.addEventListener('resize', rafCoalesce(updateReadyCta));
  }

  // Skill content carousel -- the pin sticks while wheel/key input drives the
  // orbit, then releases back to normal page scroll at either end.
  const skillCarouselStageEl = document.getElementById('skillCarouselStage');
  const skillCarouselPinEl = document.getElementById('skillCarouselPin');
  const skillCarouselEl = document.getElementById('skillCarousel');

  if (skillCarouselStageEl && skillCarouselPinEl && skillCarouselEl) {
    const items = [
      { src: 'images/gemini.svg', alt: 'Gemini' },
      { src: 'images/gpt.svg', alt: 'GPT' },
      { src: 'images/css.svg', alt: 'CSS' },
      { src: 'images/html.svg', alt: 'HTML' },
      { src: 'images/photoshop.svg', alt: 'Photoshop' },
      { src: 'images/midjourney.svg', alt: 'Midjourney' },
      { src: 'images/claude.svg', alt: 'Claude' },
      { src: 'images/javascript.svg', alt: 'JavaScript' },
      { src: 'images/illustrator.svg', alt: 'Illustrator' },
      { src: 'images/figma.svg', alt: 'Figma' },
    ];

    const cardCount = items.length;

    // ---- Tunable knobs -----------------------------------------------
    const SCROLL_SPEED = 0.002;
    // CARD_SPACING_SCALE: multiplies every breakpoint's orbit radius in
    // getLayout() below. 1 = original spacing; lower shrinks the gaps
    // between cards (tighter cluster), higher spreads them further apart.
    const CARD_SPACING_SCALE = 0.87;
    // --------------------------------------------------------------------
    const scrollSpeed = SCROLL_SPEED;
    const dragSpeed = 0.008;
    const fullTurn = Math.PI * 2;
    const enterDelay = 105;
    const enterDuration = 980;
    const enterScrollDelay = 0.11;
    const enterScrollDuration = 1.1;
    const exitScrollDelay = 0.15;
    const exitScrollDuration = 1.35;
    const minScrollPosition = -(enterScrollDuration + enterScrollDelay * (cardCount - 1));
    const maxScrollPosition = fullTurn + exitScrollDuration + exitScrollDelay * (cardCount - 1);

    let rotation = 0;
    let targetRotation = 0;
    let scrollPosition = 0;
    let animatedScrollPosition = 0;
    let pointerStartX = 0;
    let dragStartRotation = 0;
    let isDragging = false;
    let isEngaged = false;
    let hasEntered = false;
    let entranceStartTime = null;
    let wasNearViewport = false;

    // A real mouse/trackpad, vs. touch-only -- see syncScrollLock's own
    // comment on why this section's desktop-style scroll-hijack (wheel
    // input consumed as carousel rotation) only ever runs for the former.
    const hasFinePointer = () => window.matchMedia('(pointer: fine)').matches;

    function resetCarouselState(position = 0) {
      rotation = position;
      targetRotation = position;
      scrollPosition = position;
      animatedScrollPosition = position;
      pointerStartX = 0;
      dragStartRotation = 0;
      isDragging = false;
      isEngaged = false;
      hasEntered = position !== 0;
      entranceStartTime = position === 0 ? null : performance.now() - enterDuration - enterDelay * cardCount;
      isScrollLocked = false;
      lockedScrollY = window.scrollY;
    }

    releaseSkillCarouselLock = () => {
      resetCarouselState();
      lastScrollY = window.scrollY;
    };

    const cards = items.map((item, index) => {
      const card = document.createElement('div');
      card.className = 'skill-content__carousel-card';
      card.dataset.index = index;
      card.innerHTML = `<img src="${item.src}" alt="${item.alt}" draggable="false">`;
      skillCarouselEl.append(card);
      return card;
    });

    // Mobile only: the desktop orbit (render() below) keeps writing
    // transform/opacity/zIndex to every card regardless of viewport --
    // CSS cancels that with !important on mobile and switches the cards
    // to position: absolute instead. This positions each card's top/
    // left/right so it sits level with its own matching word inside the
    // DESIGN/FRONTEND/AI lists (e.g. the Photoshop icon next to the
    // "Photoshop" list item), rather than being evenly spread down the
    // column independent of the text. item.alt is "GPT" (its filename/
    // accessible name) but the visible list item reads "ChatGPT", so
    // that one pair needs an explicit remap; every other icon's alt
    // matches its list item's text exactly.
    const skillMobileLabelByAlt = {
      GPT: 'ChatGPT',
    };

    function positionSkillMobileCards() {
      if (window.innerWidth > 1023) return;
      const pinRect = skillCarouselPinEl.getBoundingClientRect();
      const listItems = Array.from(document.querySelectorAll('.skill-content__column-list li'));

      // On mobile the three word lists (DESIGN/FRONTEND/AI) stack as
      // separate blocks, each with its own title + gap before it, so each
      // side's 5 icons -- which are matched across all three lists -- land
      // at naturally uneven gaps (small within a list, a big jump crossing
      // into the next list's block). Snapping each icon to its own word
      // looked closer but left the icon stack itself visibly uneven, so
      // instead: keep the icons in the same top-to-bottom order as their
      // matched words, but respace them at a constant pitch across that
      // same overall span.
      const sides = [[], []];
      cards.forEach((card, index) => {
        const label = skillMobileLabelByAlt[items[index].alt] || items[index].alt;
        const li = listItems.find((el) => el.textContent.trim() === label);
        if (!li) return;
        const liRect = li.getBoundingClientRect();
        const naturalCenter = liRect.top - pinRect.top + liRect.height / 2;
        sides[index < 5 ? 0 : 1].push({ card, naturalCenter, index });
      });

      sides.forEach((group) => group.sort((a, b) => a.naturalCenter - b.naturalCenter));

      // Use one shared pitch for both sides (the wider of the two natural
      // spans) so the left and right icon stacks line up with identical
      // gaps instead of each side spacing itself out independently.
      const steps = sides.map((group) => {
        if (group.length < 2) return 0;
        const first = group[0].naturalCenter;
        const last = group[group.length - 1].naturalCenter;
        return (last - first) / (group.length - 1);
      });
      const sharedStep = Math.max(...steps);

      // Centering each side on its OWN mid (the old approach) left left/
      // right pairs at different heights whenever the two sides' matched
      // words happened to span different ranges of the stacked text list --
      // exactly the "카드 위치가 안 맞음" mismatch. Both sides always hold
      // the same number of icons (5 each, split by items[] order), so
      // centering both around one shared mid -- the midpoint of every
      // matched word's position across both sides combined, not just this
      // side's own -- makes every row's left/right icon land at the exact
      // same top, pairing them off two-by-two regardless of which side of
      // the text list either one's word happens to sit in.
      const allCenters = sides.flatMap((group) => group.map((entry) => entry.naturalCenter));
      const sharedMid = (Math.min(...allCenters) + Math.max(...allCenters)) / 2;

      // Horizontal placement: hug the actual rendered text column rather
      // than sitting a fixed distance from the screen edge. The column is
      // centered and each word is only as wide as its own text, so using
      // the single widest line on each side keeps every icon on one
      // straight vertical line (no zigzag) while still landing right next
      // to the text instead of stranded out near the viewport edge.
      const CARD_TEXT_GAP = 44;
      const cardWidth = cards[0] ? cards[0].offsetWidth : 50;
      const liRects = listItems.map((li) => li.getBoundingClientRect());
      const textLeftEdge = Math.min(...liRects.map((r) => r.left));
      const textRightEdge = Math.max(...liRects.map((r) => r.right));
      // Both computed as "left" offsets (pin-relative) -- the left group
      // sits just outside the text's leftmost edge, the right group just
      // outside its rightmost edge. Using `left` for both instead of
      // mixing in the `right` property (which anchors to the opposite
      // edge and inverts the math) avoids flipping the sign by mistake.
      const leftInset = textLeftEdge - pinRect.left - CARD_TEXT_GAP - cardWidth;
      const rightInset = textRightEdge - pinRect.left + CARD_TEXT_GAP;

      sides.forEach((group) => {
        if (!group.length) return;
        const startCenter = sharedMid - (sharedStep * (group.length - 1)) / 2;
        group.forEach((entry, i) => {
          const center = startCenter + sharedStep * i;
          const cardH = entry.card.offsetHeight;
          entry.card.style.top = `${center - cardH / 2}px`;
          entry.card.style.right = 'auto';
          entry.card.style.left = `${entry.index < 5 ? leftInset : rightInset}px`;
        });
      });
    }

    positionSkillMobileCards();
    requestAnimationFrame(positionSkillMobileCards);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(positionSkillMobileCards);
    }
    let skillMobileCardsResizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(skillMobileCardsResizeTimer);
      skillMobileCardsResizeTimer = setTimeout(positionSkillMobileCards, 150);
    });

    function getLayout() {
      // The pin's own rendered width, not window.innerWidth: .skill-content__stage
      // caps at min(100cqw, 1920px), so on an ultra-wide monitor the two
      // diverge -- basing the orbit radius on the wider window figure while
      // the stage itself stays capped and centered made the carousel read
      // as oversized and shifted off to one side instead of centered.
      const width = skillCarouselPinEl.clientWidth;

      if (width <= 430) {
        return { radiusX: width * 0.39 * CARD_SPACING_SCALE, depth: 190 };
      }

      if (width <= 768) {
        return { radiusX: width * 0.36 * CARD_SPACING_SCALE, depth: 260 };
      }

      if (width <= 1280) {
        return { radiusX: Math.min(width * 0.3, 380) * CARD_SPACING_SCALE, depth: 360 };
      }

      return { radiusX: Math.min(width * 0.29, 460) * CARD_SPACING_SCALE, depth: 440 };
    }

    function clamp01(value) {
      return Math.max(0, Math.min(1, value));
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function easeOutCubic(value) {
      return 1 - Math.pow(1 - value, 3);
    }

    function smoothstep(value) {
      return value * value * (3 - 2 * value);
    }

    let lockedScrollY = 0;

    function lockPageScroll() {
      lockedScrollY = window.scrollY;
    }

    function unlockPageScroll() {}

    // While engaged, wheel/keydown/pointer-drag input never touches real
    // page scroll themselves (they preventDefault the native scroll and
    // drive the carousel's rotation as internal state instead) -- the
    // only page-scroll changes those cause are engageAtRect's/
    // releaseEngagement's own explicit scrollBy snaps. So any *other*
    // scroll-position change seen here while engaged can only be an
    // input this carousel doesn't listen for -- a scrollbar drag,
    // Home/End, middle-click autoscroll, etc. This used to always force
    // it back to lockedScrollY, which fights a scrollbar drag on every
    // 'scroll' event it fires (there's no timeout here unlike
    // cards-reveal's own lock, so nothing else ever re-enables further
    // progress) and traps the user at this position indefinitely.
    // Releasing the engagement instead lets that kind of scroll win
    // immediately, the same way isNavJumping already does for nav-link
    // jumps.
    window.addEventListener(
      'scroll',
      () => {
        if (isEngaged && !isNavJumping && window.scrollY !== lockedScrollY) {
          releaseEngagement(0);
        }
      },
      { passive: true },
    );

    function engageAtRect(stageRect) {
      const topOvershoot = -stageRect.top;
      const bottomOvershoot = stageRect.bottom - window.innerHeight;
      if (topOvershoot <= bottomOvershoot) {
        window.scrollBy(0, stageRect.top);
      } else {
        window.scrollBy(0, stageRect.bottom - window.innerHeight);
      }
      lockPageScroll();
      isEngaged = true;
      isScrollLocked = true;
      if (!hasEntered) {
        hasEntered = true;
        entranceStartTime = performance.now();
      }
    }

    function syncScrollLock() {
      const viewportBuffer = window.innerHeight * 0.1;
      const visibilityRect = skillCarouselStageEl.getBoundingClientRect();
      const nearViewport = visibilityRect.bottom > -viewportBuffer
        && visibilityRect.top < window.innerHeight + viewportBuffer;
      if (window.innerWidth <= 1023) {
        const mobileReveal = visibilityRect.top < window.innerHeight * 0.62
          && visibilityRect.bottom > window.innerHeight * 0.28;
        if (mobileReveal && !hasEntered) {
          hasEntered = true;
          entranceStartTime = performance.now();
        }
        isEngaged = false;
        isScrollLocked = false;
        wasNearViewport = mobileReveal;
        return;
      }
      // Touch-primary tablet (>1023px, so it still gets the full
      // desktop-style orbit rather than the mobile static layout above) --
      // iOS/iPadOS can't have an in-progress touch-scroll gesture reliably
      // hijacked by calling preventDefault() on a later touchmove: the
      // browser commits a gesture to native scrolling within its first
      // touch/touchmove or two and ignores preventDefault() from then on,
      // so trying to mirror the wheel handler's "intercept and consume as
      // rotation" model here just desynced the carousel's internal state
      // from what was actually on screen. Instead of fighting that, let
      // native touch scroll proceed completely untouched and read rotation
      // straight off normal scroll position within this section's own
      // already-present sticky dwell (.skill-content__stage's 160vh vs
      // .skill-content__pin's 100vh, same as every other scroll-linked
      // section on the site already does reliably) -- nothing is ever
      // captured, so there's nothing that can get stuck.
      if (!hasFinePointer()) {
        const dwellDist = skillCarouselStageEl.offsetHeight - window.innerHeight;
        const dwellProgress = dwellDist > 0 ? clamp01(-visibilityRect.top / dwellDist) : 0;
        if (nearViewport && !hasEntered) {
          hasEntered = true;
          entranceStartTime = performance.now();
        }
        const position = minScrollPosition + (maxScrollPosition - minScrollPosition) * dwellProgress;
        scrollPosition = position;
        targetRotation = position;
        isEngaged = false;
        isScrollLocked = false;
        wasNearViewport = nearViewport;
        return;
      }

      if (wasNearViewport && !nearViewport) {
        resetCarouselState(visibilityRect.bottom <= -viewportBuffer ? maxScrollPosition : 0);
      }
      wasNearViewport = nearViewport;

      if (isEngaged || isNavJumping) return;
      const stageRect = skillCarouselStageEl.getBoundingClientRect();
      const nowEngaged = stageRect.top <= 0 && stageRect.bottom > window.innerHeight;
      if (!nowEngaged) return;
      engageAtRect(stageRect);
    }

    function releaseEngagement(rawDelta) {
      unlockPageScroll();
      isEngaged = false;
      isScrollLocked = false;
      lastScrollY = window.scrollY;
      const stageRect = skillCarouselStageEl.getBoundingClientRect();
      if (rawDelta > 0) {
        window.scrollBy(0, stageRect.bottom - window.innerHeight + 1);
      } else if (rawDelta < 0) {
        window.scrollBy(0, stageRect.top - 1);
      }
    }

    function render() {
      const { radiusX, depth } = getLayout();
      const step = (Math.PI * 2) / cards.length;
      const now = performance.now();
      const elapsedSinceEntrance = entranceStartTime === null ? -Infinity : now - entranceStartTime;

      cards.forEach((card, index) => {
        const angle = rotation + index * step;
        const x = Math.sin(angle) * radiusX;
        const z = Math.cos(angle);
        const scale = 0.62 + ((z + 1) / 2) * 0.42;
        const rotateY = -Math.sin(angle) * 68;
        const baseOpacity = 0.36 + ((z + 1) / 2) * 0.64;
        const timedEnterProgress = easeOutCubic(
          clamp01((elapsedSinceEntrance - index * enterDelay) / enterDuration),
        );
        const reversedIndex = cards.length - 1 - index;
        const reverseEnterProgress = smoothstep(
          clamp01((-animatedScrollPosition - reversedIndex * enterScrollDelay) / enterScrollDuration),
        );
        const enterProgress = Math.min(timedEnterProgress, 1 - reverseEnterProgress);
        const rawExitProgress = clamp01(
          (animatedScrollPosition - fullTurn - index * exitScrollDelay) / exitScrollDuration,
        );
        const exitProgress = smoothstep(rawExitProgress);
        const wave = Math.sin(index * 1.37) * 0.5 + 0.5;
        const enterCurve = 1 - enterProgress;
        const exitCurve = exitProgress;
        const diagonalLean = index % 2 === 0 ? -1 : 1;
        const introX = (-110 + diagonalLean * 18 + wave * 26) * enterCurve;
        const introY = (-190 - wave * 42) * enterCurve;
        const introZ = -depth * 0.28 * enterCurve;
        const outroX = (118 + diagonalLean * 16 + wave * 22) * exitCurve;
        const outroY = (170 + wave * 38) * exitCurve;
        const outroZ = -depth * 0.12 * exitCurve;
        const y = introY + outroY;
        const exitOpacity = 1 - exitProgress;
        const opacity = baseOpacity * enterProgress * exitOpacity;
        const spinIn = (1 - enterProgress) * (index % 2 === 0 ? -7 : 7);
        const spinOut = exitProgress * (index % 2 === 0 ? 8 : -8);

        card.style.transform = [
          'translate(-50%, -50%)',
          `translate3d(${x + introX + outroX}px, ${y}px, ${z * depth + introZ + outroZ}px)`,
          `rotateY(${rotateY + spinIn + spinOut}deg)`,
          `rotateZ(${spinIn * 0.22 + spinOut * 0.2}deg)`,
          `scale(${scale * (0.82 + enterProgress * 0.18) * (1 - exitProgress * 0.18)})`,
        ].join(' ');
        card.style.opacity = opacity.toFixed(3);
        card.style.zIndex = z >= 0 ? Math.round(10 + z * 90) : Math.round(1 + (z + 1) * 3);
      });
    }

    function animate() {
      syncScrollLock();
      const scrollDelta = scrollPosition - animatedScrollPosition;
      animatedScrollPosition += clamp(scrollDelta * 0.12, -0.09, 0.09);
      rotation += (targetRotation - rotation) * 0.12;
      render();
      requestAnimationFrame(animate);
    }

    function applyRawDelta(rawDelta) {
      const delta = rawDelta * scrollSpeed;
      const next = clamp(scrollPosition + delta, minScrollPosition, maxScrollPosition);
      const atBound = next === scrollPosition
        && ((delta > 0 && scrollPosition >= maxScrollPosition) || (delta < 0 && scrollPosition <= minScrollPosition));
      if (atBound) return false;

      scrollPosition = next;
      targetRotation = scrollPosition;
      return true;
    }

    function tryProactiveEntry(rawDelta) {
      if (window.innerWidth <= 1023) return false;
      if (isNavJumping) return false;
      if (!hasFinePointer()) return false;
      const stageRect = skillCarouselStageEl.getBoundingClientRect();
      if (stageRect.top > 0 && rawDelta > 0 && rawDelta >= stageRect.top) {
        resetCarouselState(0);
        window.scrollBy(0, stageRect.top);
        engageAtRect(skillCarouselStageEl.getBoundingClientRect());
        return true;
      }
      const belowThreshold = stageRect.bottom - window.innerHeight;
      if (belowThreshold <= 0 && rawDelta < 0 && rawDelta <= belowThreshold) {
        resetCarouselState(maxScrollPosition);
        window.scrollBy(0, belowThreshold);
        engageAtRect(skillCarouselStageEl.getBoundingClientRect());
        return true;
      }
      return false;
    }

    window.addEventListener(
      'wheel',
      (event) => {
        const rawDelta = event.deltaY + event.deltaX;
        if (!isEngaged) {
          if (tryProactiveEntry(rawDelta)) event.preventDefault();
          return;
        }
        event.preventDefault();
        updateHeaderForDelta(rawDelta);
        if (applyRawDelta(rawDelta)) return;
        releaseEngagement(rawDelta);
      },
      { passive: false },
    );

    const SKILL_SCROLL_LOCK_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
    const SCROLL_KEY_DELTA = { ArrowDown: 80, PageDown: 500, ' ': 500, ArrowUp: -80, PageUp: -500 };

    window.addEventListener('keydown', (event) => {
      if (!SKILL_SCROLL_LOCK_KEYS.includes(event.key)) return;
      const rawDelta = SCROLL_KEY_DELTA[event.key];
      if (!isEngaged) {
        if (rawDelta !== undefined && tryProactiveEntry(rawDelta)) event.preventDefault();
        return;
      }
      event.preventDefault();
      if (rawDelta === undefined) return;
      updateHeaderForDelta(rawDelta);
      if (applyRawDelta(rawDelta)) return;
      releaseEngagement(rawDelta);
    });

    // isEngaged is never true without a fine pointer (see
    // tryProactiveEntry/syncScrollLock), so this never actually
    // preventDefault()s on a touch-only device -- native touch scroll
    // always reaches the page. Kept only for the fine-pointer case, where
    // a connected trackpad/mouse can dispatch touch-like events too.
    window.addEventListener(
      'touchmove',
      (event) => {
        if (!isEngaged) return;
        event.preventDefault();
      },
      { passive: false },
    );

    skillCarouselPinEl.addEventListener('pointerdown', (event) => {
      if (!isEngaged) return;
      isDragging = true;
      pointerStartX = event.clientX;
      dragStartRotation = targetRotation;
      skillCarouselPinEl.setPointerCapture(event.pointerId);
    });

    skillCarouselPinEl.addEventListener('pointermove', (event) => {
      if (!isDragging) return;
      targetRotation = dragStartRotation + (event.clientX - pointerStartX) * dragSpeed;
    });

    skillCarouselPinEl.addEventListener('pointerup', (event) => {
      isDragging = false;
      skillCarouselPinEl.releasePointerCapture(event.pointerId);
    });

    skillCarouselPinEl.addEventListener('pointercancel', () => {
      isDragging = false;
    });

    window.addEventListener('resize', render);

    syncScrollLock();
    render();
    requestAnimationFrame(animate);
  }

});
