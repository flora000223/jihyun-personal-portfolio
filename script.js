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
  const textEnEl = document.querySelector('.intro-reasons__text-en');
  const textKrEl = document.querySelector('.intro-reasons__text-kr');

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
      // Fill gets a wider share of the dwell than hold/swap/hold below it --
      // with a short subtitle sentence, a narrow fill window reads as an
      // near-instant snap to black rather than a scroll-paced fill.
      // (These fractions are scaled down from their original 0.75/0.8/0.95
      // values to keep the same absolute scroll distance for fill/hold/swap
      // after .intro-reasons' dwell height grew from 250vh to 300vh below
      // 1 -- the extra vh all goes to the final hold instead.)
      const fillProgress = stage(0, 0.625, dwellProgress);
      // Widened, and eased rather than linear, so the English->Korean
      // crossfade reads as a gradual blend instead of snapping over too
      // short a scroll distance.
      const swapProgress = smoothstep(stage(0.667, 0.792, dwellProgress));
      // Everything from here to dwellProgress 1 is a final hold: the extra
      // dwell height added above means several more scroll actions are
      // needed after the Korean swap finishes before the pin releases and
      // the next section is allowed to scroll into view.

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

      if (textEnEl && textKrEl) {
        textEnEl.style.opacity = String(1 - swapProgress);
        textKrEl.style.opacity = String(swapProgress);
        textKrEl.style.setProperty('--swap-rise', String(1 - swapProgress));
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

  /* Reason-quote: personal statement that scrolls in right after
     intro-reasons. The background crossfades white -> black continuously as
     the section slides into place (scroll-scrubbed, like the flying-title
     hand-off above), then once pinned, words/chips reveal in scroll-triggered
     batches -- each batch that's been scrolled past gets .is-revealed and
     animates in over its own CSS transition, independent of scroll speed,
     matching INTERACTION_GUIDE.md's mask-wipe + chip-expand pattern. */
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

    const getReasonDwellProgress = () => {
      const rect = reasonQuoteEl.getBoundingClientRect();
      const dwellDist = reasonQuoteEl.offsetHeight - window.innerHeight;
      return dwellDist > 0 ? Math.min(1, Math.max(0, -rect.top / dwellDist)) : 0;
    };

    const updateReasonQuote = () => {
      // Mobile fallback (see CSS) shows everything at rest with a plain
      // static black block -- clear any inline background left over from
      // a wider viewport instead of letting it fight the CSS override,
      // and skip the reveal-threshold math entirely.
      if (window.innerWidth <= 768) {
        reasonQuoteEl.style.backgroundColor = '';
        return;
      }

      const entry = getReasonEntryProgress();
      const shade = Math.round(255 * (1 - entry));
      reasonQuoteEl.style.backgroundColor = `rgb(${shade}, ${shade}, ${shade})`;

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
});
