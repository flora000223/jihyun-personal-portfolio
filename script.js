document.addEventListener('DOMContentLoaded', () => {
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
  window.addEventListener('resize', syncUFixed);

  const initStaffCanvas = (staffCanvas, options = {}) => {
    if (!staffCanvas) return;
    const ctx = staffCanvas.getContext('2d');
    if (!ctx) return;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let staffFrameId = 0;
    let staffCanvasActive = true;
    const initialAnimationOffset = options.initialAnimationOffset ?? 2000;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const background = options.background ?? '#020204';
    const primaryAlpha = options.primaryAlpha ?? 0.68;
    const secondaryAlpha = options.secondaryAlpha ?? 0.3;

    const resizeStaffCanvas = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.35);
      width = staffCanvas.clientWidth || window.innerWidth;
      height = staffCanvas.clientHeight || window.innerHeight;
      staffCanvas.width = Math.floor(width * dpr);
      staffCanvas.height = Math.floor(height * dpr);
      staffCanvas.style.width = `${width}px`;
      staffCanvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      } = config;

      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, `rgba(255,255,255,${alpha * 0.12})`);
      gradient.addColorStop(0.24, `rgba(255,255,255,${alpha * 0.44})`);
      gradient.addColorStop(0.52, `rgba(${hue},${alpha * 0.78})`);
      gradient.addColorStop(0.78, `rgba(255,255,255,${alpha * 0.62})`);
      gradient.addColorStop(1, `rgba(255,255,255,${alpha * 0.1})`);

      for (let line = 0; line < count; line += 1) {
        const staffIndex = line % 5;
        const group = Math.floor(line / 5);
        const offset = (staffIndex - 2) * spacing + group * spacing * 7.2;
        const glow = staffIndex === 2 ? 0.22 : 0.08;

        ctx.beginPath();
        for (let x = -80; x <= width + 80; x += 14) {
          const nx = x / width;
          const drift = time * (0.00018 + group * 0.000018);
          const waveA = Math.sin(nx * Math.PI * frequency + phase + drift * 7) * amplitude;
          const waveB = Math.sin(nx * Math.PI * (frequency * 0.58) - phase + drift * 4) * amplitude * 0.42;
          const y = centerY
            + offset
            + waveA
            + waveB
            + Math.sin(nx * Math.PI * 9 + time * 0.0012 + line) * lift;

          if (x === -80) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.strokeStyle = gradient;
        ctx.lineWidth = thickness + (staffIndex === 2 ? 0.22 : 0);
        ctx.shadowBlur = staffIndex === 2 ? 10 : 0;
        ctx.shadowColor = `rgba(255,255,255,${0.18 + glow})`;
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

    const renderStaffCanvas = (time = 0) => {
      staffFrameId = 0;
      const animationTime = time + initialAnimationOffset;
      const isMobile = width < 760;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      drawStaffRibbon(animationTime, {
        centerY: height * (options.primaryCenterY ?? 0.42),
        amplitude: height * (isMobile ? 0.075 : 0.092),
        frequency: 3.12,
        phase: 1.4,
        thickness: 0.9,
        count: isMobile ? 18 : 25,
        spacing: Math.max(7, height * 0.011),
        alpha: primaryAlpha,
        hue: '238,240,246',
        lift: 2.1,
        highlight: true,
      });

      drawStaffRibbon(animationTime, {
        centerY: height * (options.secondaryCenterY ?? 0.63),
        amplitude: height * (isMobile ? 0.052 : 0.064),
        frequency: 2.5,
        phase: -0.95,
        thickness: 0.72,
        count: isMobile ? 14 : 20,
        spacing: Math.max(6, height * 0.009),
        alpha: secondaryAlpha,
        hue: '205,211,224',
        lift: 1.7,
        highlight: false,
      });

      ctx.globalCompositeOperation = 'source-over';
      requestStaffFrame();
    };

    resizeStaffCanvas();
    window.addEventListener('resize', resizeStaffCanvas);
    const staffObserver = new IntersectionObserver((entries) => {
      staffCanvasActive = entries.some((entry) => entry.isIntersecting);
      if (staffCanvasActive) requestStaffFrame();
    }, { rootMargin: '120px 0px' });
    staffObserver.observe(staffCanvas);
    requestStaffFrame();
    if (reduceMotion) renderStaffCanvas(initialAnimationOffset);
  };

  initStaffCanvas(document.getElementById('staffCanvas'));
  initStaffCanvas(document.getElementById('footerStaffCanvas'), {
    initialAnimationOffset: 6200,
    primaryCenterY: 0.48,
    secondaryCenterY: 0.68,
    primaryAlpha: 0.42,
    secondaryAlpha: 0.2,
  });

  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mobileNav = document.getElementById('mobileNav');
  const navLinks = document.querySelectorAll('.nav__link, .mobile-nav__link');
  const sections = document.querySelectorAll('main > section[id]');

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
  // as its top crosses the vertical center of the screen — but #intro's
  // sibling .intro-reasons block (the long scroll-dwell section right after
  // the hero) is still tall enough to still be filling most of the screen
  // at that point. So instead: the active section is whichever one's top
  // has most recently crossed near the top of the viewport, which only
  // happens once the previous section has fully scrolled out of view.
  const sectionEls = Array.from(sections);
  const updateActiveNav = () => {
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
    window.addEventListener('resize', updateActiveNav);
  }

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      closeMobileNav();
    }
  });

  /* Header visibility: stays visible while scrolling down, hides while scrolling up —
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
      if (stableFrames >= 3 && reachedTarget) {
        isNavJumping = false;
        lastScrollY = window.scrollY;
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  };

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
      navJumpToken += 1;
      header.classList.remove('header--hidden');
      releaseCardsRevealLock();
      releaseSkillCarouselLock();

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

  window.addEventListener('scroll', () => {
    if (isScrollLocked) return;

    const currentScrollY = window.scrollY;
    updateHeaderHeroState();

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
      // cqw component can't resolve there — copy the resolved px value
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

      if (progress >= 1 && !docked) {
        docked = true;
        introReasons.classList.add('is-docked');
      } else if (progress < 0.9 && docked) {
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
    window.addEventListener('resize', onResize);
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
  let reasonDarkContribution = 0;
  let cardsDarkContribution = 0;
  let workTransitionDarkContribution = 0;
  let workDetailDarkContribution = 0;
  let workDetail2DarkContribution = 0;
  let workDetail3DarkContribution = 0;
  let skillTransitionDarkContribution = 0;
  let skillContentDarkContribution = 0;
  let aboutTransitionDarkContribution = 0;
  let quickQaDarkContribution = 0;

  // A direct black<->white swap (.header--inverted, see CSS) once the
  // overlay is dark enough -- not a per-frame RGB blend. Blending toward
  // white tracked the scroll position 1:1, so for most of the scroll it
  // sat at some intermediate gray -- exactly the muted color inactive
  // links already use, making active/inactive momentarily
  // indistinguishable, and it meant black text stayed low-contrast
  // against the darkening background for a long stretch instead of
  // becoming legible (white) as soon as darkening starts.
  const applyCombinedDarkState = () => {
    const combined = Math.max(reasonDarkContribution, cardsDarkContribution, workTransitionDarkContribution, workDetailDarkContribution, workDetail2DarkContribution, workDetail3DarkContribution, skillTransitionDarkContribution, skillContentDarkContribution, aboutTransitionDarkContribution, quickQaDarkContribution);
    if (darkOverlayEl) darkOverlayEl.style.opacity = String(combined);
    if (headerEl) headerEl.classList.toggle('header--inverted', combined > HEADER_DARK_THRESHOLD);
    return combined;
  };

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

    const updateReasonQuote = () => {
      // Mobile fallback (see CSS) shows everything at rest with a plain
      // static black block -- skip the scroll-scrubbed overlay/header
      // inversion and reveal-threshold math entirely, and clear any
      // inline styles left over from a wider viewport instead of letting
      // them fight the CSS override.
      if (window.innerWidth <= 768) {
        reasonDarkContribution = 0;
        applyCombinedDarkState();
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
    window.addEventListener('resize', updateReasonQuote);
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
    const correctLockedScroll = () => {
      if (scrollLockActive && !isNavJumping && window.scrollY !== lockedScrollY) {
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
      if (window.innerWidth <= 768) {
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
    window.addEventListener('resize', onCardsResize);
    window.addEventListener('load', () => {
      measureCardFlight();
      updateCardsReveal();
    });
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
    // third, not near the end -- "가로로 흐르다가 중간에 반전" means the
    // title should already be well underway scrolling by the time the
    // invert starts, and still have room to keep scrolling after it ends.
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
      if (window.innerWidth <= 768) {
        workTransitionDarkContribution = 0;
        applyCombinedDarkState();
        applyFogChars(fogCharsBase, 0);
        applyFogChars(fogCharsWipe, 0);
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
    window.addEventListener('resize', onWorkTransitionResize);
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
      return Math.min(1, Math.max(0, rect.bottom / vh));
    };

    const getSkillTransitionDwellProgress = () => {
      const rect = skillTransitionEl.getBoundingClientRect();
      const dwellDist = skillTransitionEl.offsetHeight - window.innerHeight;
      return dwellDist > 0 ? Math.min(1, Math.max(0, -rect.top / dwellDist)) : 0;
    };

    const updateSkillTransition = () => {
      if (window.innerWidth <= 768) {
        skillTransitionDarkContribution = 0;
        applyCombinedDarkState();
        applySkillFogChars(skillFogCharsBase, 0);
        applySkillFogChars(skillFogCharsWipe, 0);
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
    window.addEventListener('resize', onSkillTransitionResize);
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
      return Math.min(1, Math.max(0, rect.bottom / vh));
    };

    const updateSkillContentDark = () => {
      const entry = getSkillContentEntryProgress();
      const exit = getSkillContentExitProgress();
      skillContentDarkContribution = Math.min(entry, exit);
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
    window.addEventListener('resize', updateSkillContentDark);
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

    const updateAboutTransition = () => {
      if (window.innerWidth <= 768) {
        aboutTransitionDarkContribution = 0;
        applyCombinedDarkState();
        applyAboutFogChars(aboutFogCharsBase, 0);
        applyAboutFogChars(aboutFogCharsWipe, 0);
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
    window.addEventListener('resize', onAboutTransitionResize);
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
        lines: ['다양한 환경을 경험하며', '더 넓은 시각으로 세상을 바라갑니다.'],
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
    const GALLERY_LABEL_SCROLL_SCALE = 0.42;
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
    const cardImageSources = imageOrder.map((n) => `images/card-${String(n).padStart(2, '0')}.jpg`);

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
      const colorLocation = gl.getUniformLocation(program, 'u_color');
      const textureLocation = gl.getUniformLocation(program, 'u_texture');
      const sizeLocation = gl.getUniformLocation(program, 'u_size');
      const radiusLocation = gl.getUniformLocation(program, 'u_radius');
      const alphaLocation = gl.getUniformLocation(program, 'u_alpha');
      const hasTextureLocation = gl.getUniformLocation(program, 'u_hasTexture');
      const imageAspectLocation = gl.getUniformLocation(program, 'u_imageAspect');
      const cardAspectLocation = gl.getUniformLocation(program, 'u_cardAspect');
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

      const createTextureFromImage = (image) => {
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

      // Cards should stagger in when the user actually scrolls the section
      // into view, not the instant their images finish loading (which
      // happens almost immediately on page load, long before the user
      // has scrolled anywhere near this section). revealStartedAt is only
      // set once both the images are ready AND the section has entered
      // the viewport, timed from whichever happens later.
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
      }));

      cards.forEach((card, index) => {
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
        resizeCanvas(width, height);

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
        const cardW = mobile ? 30 : tablet ? width * 0.031 : Math.min(59, Math.max(38, width * (59 / 1920)));
        const cardH = cardW * (77 / 59);
        const cardGap = mobile ? 6 : width * (14 / 1920);
        const centerX = width * 0.5;
        const centerY = height * 0.5;
        const arcSceneLift = height * (mobile ? 0.1 : tablet ? 0.115 : 0.13);
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
          const appearDelay = revealRank[index] * 108;
          const now = window.performance.now();
          const revealElapsed = revealStartedAt === null ? 0 : now - revealStartedAt;
          const appearByTime = range(revealElapsed, appearDelay, appearDelay + 720);
          const appearByScroll = range(visualProgress, 0.025 + revealRank[index] * 0.005, 0.24 + revealRank[index] * 0.005);
          const appear = card.isLoaded ? Math.max(appearByTime, appearByScroll) : 0;

          let x = centerX + scatter[index][0] * width;
          let y = centerY + scatter[index][1] * height;
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
          const zoomCenterY = centerY + finalRingRadius * zoomIn * (mobile ? 1.9 : 3.15) - arcSceneLift * zoomIn;
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
        renderCards(centerX, centerY);

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

    const update = () => {
      // Mobile fallback (see CSS) drops the pin/slide for a plain static
      // stack already showing the filled end state -- skip the
      // dark-overlay/transform/fill math entirely, same pattern as
      // reason-quote/cards-reveal's own mobile guards.
      if (window.innerWidth <= 768) {
        setDarkContribution(0);
        if (trackEl) {
          trackEl.style.transform = 'none';
          trackEl.style.removeProperty('--detail-overlay-x');
        }
        if (glowCurveEl) glowCurveEl.style.transform = 'none';
        if (coverPanelEl) coverPanelEl.style.filter = 'none';
        scenes.forEach((scene) => {
          if (scene.panelEl) scene.panelEl.style.transform = 'none';
        });
        // Mobile shows every scene as a plain static stack with no scroll
        // gating -- just start each video once, the first time this runs.
        scenes.forEach((scene) => {
          if (scene.videos.length && !scene.videoStarted) {
            scene.videoStarted = true;
            scene.videos.forEach((v) => v.play().catch(() => {}));
          }
        });
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
      }

      scenes.forEach((scene, i) => {
        if (scene.panelEl) {
          const x = (i + 1 - totalSlide) * 100;
          scene.panelEl.style.transform = `translateX(${x}%)`;
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
          const startRGB = [0x45, 0x45, 0x45];
          const n = scene.fillChars.length;
          scene.fillChars.forEach((span, i) => {
            const t = Math.min(1, Math.max(0, fillProgress * n - i));
            const r = Math.round(startRGB[0] + (255 - startRGB[0]) * t);
            const g = Math.round(startRGB[1] + (255 - startRGB[1]) * t);
            const b = Math.round(startRGB[2] + (255 - startRGB[2]) * t);
            span.style.color = `rgb(${r}, ${g}, ${b})`;
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

    const chipsEnd = cloneChipEls.length * 60;
    cloneChipEls.forEach((el, i) => {
      el.style.setProperty('--fog-delay', `${i * 60}ms`);
    });
    titleChars.forEach((el, i) => {
      el.style.setProperty('--fog-delay', `${chipsEnd + 150 + i * 25}ms`);
    });
    if (cloneSubtitleEl) {
      const titleEnd = titleChars.length * 25;
      cloneSubtitleEl.style.setProperty('--fog-delay', `${chipsEnd + 150 + titleEnd + 150}ms`);
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

    skillTitleChars.forEach((el, i) => {
      el.style.setProperty('--fog-delay', `${i * 25}ms`);
    });
    if (skillSubtitleEl) {
      const titleEnd = skillTitleChars.length * 25;
      skillSubtitleEl.style.setProperty('--fog-delay', `${titleEnd + 150}ms`);
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

    quickQaTitleChars.forEach((el, i) => {
      el.style.setProperty('--fog-delay', `${i * 25}ms`);
    });
    if (quickQaSubtitleEl) {
      const titleEnd = quickQaTitleChars.length * 25;
      quickQaSubtitleEl.style.setProperty('--fog-delay', `${titleEnd + 150}ms`);
    }

    const updateQuickQaDarkState = () => {
      const rect = quickQaEl.getBoundingClientRect();
      const vh = window.innerHeight;
      const entry = Math.min(1, Math.max(0, (vh - rect.top) / vh));
      const exit = Math.min(1, Math.max(0, rect.bottom / vh));
      quickQaDarkContribution = Math.min(entry, exit);
      applyCombinedDarkState();
    };

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

    window.addEventListener('resize', () => {
      quickQaItems.forEach((item) => {
        if (!item.classList.contains('is-open')) return;
        const answer = item.querySelector('.quick-qa__answer');
        const inner = item.querySelector('.quick-qa__answer-inner');
        if (answer && inner) answer.style.maxHeight = `${inner.scrollHeight}px`;
      });
    });

    const quickQaObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        quickQaEl.classList.toggle('is-revealed', entry.isIntersecting);
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });

    quickQaObserver.observe(quickQaEl);
    updateQuickQaDarkState();
    window.addEventListener('scroll', updateQuickQaDarkState, { passive: true });
    window.addEventListener('resize', updateQuickQaDarkState);
    window.addEventListener('load', updateQuickQaDarkState);
  }

  const footerTopButton = document.querySelector('.site-footer__top');
  if (footerTopButton) {
    footerTopButton.addEventListener('click', () => {
      isNavJumping = true;
      navJumpToken += 1;
      header.classList.remove('header--hidden');
      releaseCardsRevealLock();
      releaseSkillCarouselLock();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      window.history.pushState(null, '', '#intro');
      waitForJumpToSettle(0);
    });
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

    window.addEventListener(
      'scroll',
      () => {
        if (isEngaged && !isNavJumping && window.scrollY !== lockedScrollY) {
          window.scrollTo(0, lockedScrollY);
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
      if (isNavJumping) return false;
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
