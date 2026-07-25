document.addEventListener('DOMContentLoaded', () => {
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
    if (current) setActiveNav(current.id);
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

  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;

    if (currentScrollY <= hero.offsetHeight) {
      header.classList.remove('header--hidden');
    } else if (currentScrollY > lastScrollY) {
      header.classList.remove('header--hidden');
    } else if (currentScrollY < lastScrollY) {
      header.classList.add('header--hidden');
    }

    lastScrollY = currentScrollY;
  });

  /* Hero title -> Intro-reasons title scroll-linked hand-off.
     The hero title clones into a fixed "flying" element while the
     intro-reasons section scrolls into view, interpolating in document
     coordinates between the two resting positions; once it docks, the
     Korean subtitle, photo, and English subtext reveal in sequence. */
  const heroTitleEl = document.querySelector('.hero__title');
  const dockedTitleEl = document.querySelector('.intro-reasons__title');
  const flyingTitleEl = document.getElementById('flyingTitle');
  const introReasons = document.querySelector('.intro-reasons');
  const subtitleEl = document.querySelector('.intro-reasons__subtitle');
  const textEl = document.querySelector('.intro-reasons__text');

  /* Splits every text node under `root` into one <span class="fill-char">
     per character (keeping <strong> etc. wrapping intact), so each
     character's color can be driven independently by scroll position. */
  const wrapChars = (root) => {
    Array.from(root.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        Array.from(node.textContent).forEach((ch) => {
          const span = document.createElement('span');
          span.className = 'fill-char';
          span.textContent = ch;
          frag.appendChild(span);
        });
        root.replaceChild(frag, node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        wrapChars(node);
      }
    });
  };

  let fillChars = [];
  if (subtitleEl) {
    wrapChars(subtitleEl);
    fillChars = Array.from(subtitleEl.querySelectorAll('.fill-char'));
  }

  if (heroTitleEl && dockedTitleEl && flyingTitleEl && introReasons) {
    document.body.classList.add('js-anim');

    const introStickyEl = document.querySelector('.intro-reasons__sticky');
    let startPos = { top: 0, left: 0 };
    let endPos = { top: 0, left: 0 };
    let docked = false;

    const smoothstep = (t) => t * t * (3 - 2 * t);

    const measure = () => {
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

      if (progress <= 0) {
        heroTitleEl.style.opacity = '1';
        flyingTitleEl.style.opacity = '0';
        dockedTitleEl.style.opacity = '0';
      } else if (progress >= 1) {
        heroTitleEl.style.opacity = '0';
        flyingTitleEl.style.opacity = '0';
        dockedTitleEl.style.opacity = '1';
      } else {
        heroTitleEl.style.opacity = '0';
        dockedTitleEl.style.opacity = '0';
        flyingTitleEl.style.opacity = '1';

        const ease = smoothstep(progress);
        const top = startPos.top + (endPos.top - startPos.top) * ease;
        const left = startPos.left + (endPos.left - startPos.left) * ease;
        flyingTitleEl.style.top = `${top}px`;
        flyingTitleEl.style.left = `${left}px`;
      }

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
    if (getProgress() <= 0) {
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

  // A direct black<->white swap (.header--inverted, see CSS) once the
  // overlay is dark enough -- not a per-frame RGB blend. Blending toward
  // white tracked the scroll position 1:1, so for most of the scroll it
  // sat at some intermediate gray -- exactly the muted color inactive
  // links already use, making active/inactive momentarily
  // indistinguishable, and it meant black text stayed low-contrast
  // against the darkening background for a long stretch instead of
  // becoming legible (white) as soon as darkening starts.
  const applyCombinedDarkState = () => {
    const combined = Math.max(reasonDarkContribution, cardsDarkContribution);
    if (darkOverlayEl) darkOverlayEl.style.opacity = String(combined);
    if (headerEl) headerEl.classList.toggle('header--inverted', combined > HEADER_DARK_THRESHOLD);
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
          const width = pair.start.width + (pair.end.width - pair.start.width) * ease;
          const height = pair.start.height + (pair.end.height - pair.start.height) * ease;
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

      const dwellProgress = entry >= 1 ? getCardsDwellProgress() : 0;
      const dwellDist = cardsRevealEl.offsetHeight - window.innerHeight;
      const vh = window.innerHeight / 100;
      const flipThreshold = dwellDist > 0 ? (FLIP_TRIGGER_VH * vh) / dwellDist : 1;
      cardsRevealEl.classList.toggle('is-flipped', entry >= 1 && dwellProgress >= flipThreshold);
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
});
