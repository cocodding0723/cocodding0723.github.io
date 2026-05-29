// ============================================================
// SAO "LINK START" boot intro (once per session)
// ============================================================
(function () {
  var boot = document.getElementById('boot-sequence');
  if (!boot) return;

  // Show once per browser session
  if (sessionStorage.getItem('booted_v1')) {
    boot.parentNode && boot.parentNode.removeChild(boot);
    return;
  }
  sessionStorage.setItem('booted_v1', '1');

  document.body.classList.add('booting');

  var streamsBox = document.getElementById('boot-streams');
  var bloom      = document.getElementById('boot-bloom');
  var linkStart  = document.getElementById('boot-linkstart');
  var sysCheck   = document.getElementById('boot-syscheck');
  var sysList    = document.getElementById('sys-list');
  var allGreen   = document.getElementById('sys-allgreen');
  var welcome    = document.getElementById('boot-welcome');

  var COLORS = ['#ff1744','#ff9100','#ffeb3b','#00e676','#00e5ff','#2979ff','#a78bfa','#ec4899'];
  var timers = [];
  var finished = false;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  // ── tiny 8-bit blip ──
  function blip(freq, dur) {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.08, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (dur || 0.08));
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + (dur || 0.08) + 0.01);
    } catch (e) {}
  }

  // ── Phase 2: warp-tunnel light streaks rushing out from center (dive feel) ──
  function rushStreams() {
    if (!streamsBox) return;
    var cx = window.innerWidth / 2;
    var cy = window.innerHeight / 2;
    var radius = Math.sqrt(cx * cx + cy * cy);
    var n = Math.min(80, Math.floor(window.innerWidth / 14));

    for (var i = 0; i < n; i++) {
      (function (idx) {
        var bar = document.createElement('div');
        bar.className = 'boot-stream';
        var color = COLORS[idx % COLORS.length];
        var ang = Math.random() * Math.PI * 2;
        var len = 40 + Math.random() * 160;

        // Anchor at center, oriented outward along its angle
        bar.style.left = cx + 'px';
        bar.style.top = cy + 'px';
        bar.style.height = len + 'px';
        bar.style.width = (2 + Math.random() * 4) + 'px';
        bar.style.background = 'linear-gradient(to top, transparent, ' + color + ')';
        bar.style.boxShadow = '0 0 14px ' + color;
        bar.style.opacity = '0';
        bar.style.transformOrigin = 'center top';
        streamsBox.appendChild(bar);

        var deg = ang * 180 / Math.PI;
        var startD = 20 + Math.random() * 60;   // start near center
        var endD = radius + len;                 // shoot past the edge
        var delay = Math.random() * 450;

        // Rotate to face outward, scale streak length as it warps outward
        var base = 'translate(-50%, 0) rotate(' + deg + 'deg) ';
        var anim = bar.animate([
          { transform: base + 'translateY(' + startD + 'px) scaleY(0.3)', opacity: 0 },
          { transform: base + 'translateY(' + (startD + 60) + 'px) scaleY(0.8)', opacity: 1, offset: 0.18 },
          { transform: base + 'translateY(' + endD + 'px) scaleY(2.6)', opacity: 0 }
        ], { duration: 650 + Math.random() * 450, delay: delay, easing: 'cubic-bezier(0.5, 0, 1, 1)', fill: 'forwards' });
        anim.onfinish = function () { bar.remove(); };
      })(i);
    }
    blip(140, 0.6);
  }

  // ── Phase 3: system check ──
  var CHECKS = ['RENDER', 'AUDIO', 'INPUT', 'NETWORK', 'PIXELS', 'COMBO SYS'];
  function runSysCheck(done) {
    sysCheck.classList.add('active');
    var i = 0;
    (function next() {
      if (i >= CHECKS.length) {
        later(function () {
          allGreen.classList.add('shown');
          blip(880, 0.25);
          later(done, 700);
        }, 200);
        return;
      }
      var li = document.createElement('li');
      li.innerHTML = '<span>' + CHECKS[i] + '</span><span class="ok">OK</span>';
      sysList.appendChild(li);
      requestAnimationFrame(function () { li.classList.add('shown'); });
      blip(520 + i * 60, 0.06);
      i++;
      later(next, 230);
    })();
  }

  // ── Finish / cleanup — dive-in warp then fade ──
  function finish(instant) {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);

    if (instant) {
      boot.classList.add('done');
      document.body.classList.remove('booting');
      setTimeout(function () { boot.parentNode && boot.parentNode.removeChild(boot); }, 450);
      return;
    }

    // Warp zoom — content gets sucked into the screen
    boot.classList.add('warp-out');
    blip(90, 0.45);
    setTimeout(function () {
      boot.classList.add('done');
      document.body.classList.remove('booting');
      setTimeout(function () { boot.parentNode && boot.parentNode.removeChild(boot); }, 420);
    }, 480);
  }

  // ── Timeline ──
  later(function () {
    linkStart.classList.add('active');
    if (bloom) bloom.classList.add('on');
    blip(440, 0.3);
  }, 250);
  later(rushStreams, 950);
  later(function () {
    linkStart.classList.remove('active');
    if (bloom) bloom.classList.remove('on');
  }, 1550);
  later(function () {
    runSysCheck(function () {
      sysCheck.classList.remove('active');
      welcome.classList.add('active');
      blip(660, 0.4);
      later(finish, 1400);
    });
  }, 1650);

  // ── Skip via ESC only (no click-skip, per request) ──
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') finish(true);
  });

  // ── Hard safety: never leave the black screen stuck ──
  later(function () { finish(true); }, 7000);
})();

// ============================================================
// Navigation: scroll behavior + active section highlighting
// ============================================================
(function () {
  const header = document.querySelector('.site-header');
  const navLinks = document.querySelectorAll('nav a[data-section], .mobile-nav a[data-section]');
  const sections = document.querySelectorAll('section[id]');
  const hamburger = document.querySelector('.hamburger');
  const mobileNav = document.querySelector('.mobile-nav');

  // Scrolled class on header
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
    updateActiveNav();
  }, { passive: true });

  // Hamburger menu toggle
  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('open');
      mobileNav.classList.toggle('open');
    });

    // Close mobile nav when link clicked
    mobileNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('open');
        mobileNav.classList.remove('open');
      });
    });
  }

  // Active nav link based on scroll position
  function updateActiveNav() {
    let current = '';
    sections.forEach(section => {
      const sectionTop = section.offsetTop - 100;
      if (window.scrollY >= sectionTop) {
        current = section.getAttribute('id');
      }
    });

    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('data-section') === current) {
        link.classList.add('active');
      }
    });
  }
})();

// ============================================================
// Intersection Observer: scroll animations
// ============================================================
(function () {
  // Fade-up animation for sections and cards
  const fadeTargets = document.querySelectorAll('.animate-fade-up, .section-title.animate-in');

  if ('IntersectionObserver' in window) {
    const fadeObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          fadeObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    fadeTargets.forEach(el => fadeObserver.observe(el));

    // Project cards with staggered delay
    const cards = document.querySelectorAll('.project-card');
    const cardObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const idx = parseInt(entry.target.getAttribute('data-index')) || 0;
          setTimeout(() => {
            entry.target.classList.add('visible');
          }, idx * 100);
          cardObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px -30px 0px' });

    cards.forEach((card, i) => {
      card.setAttribute('data-index', i);
      card.classList.add('animate-fade-up');
      cardObserver.observe(card);
    });

    // Skill tags with staggered delay
    const skillGroups = document.querySelectorAll('.skill-group');
    const skillObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const tags = entry.target.querySelectorAll('.skill-tag');
          tags.forEach((tag, i) => {
            setTimeout(() => {
              tag.classList.add('visible');
            }, i * 50);
          });
          skillObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });

    skillGroups.forEach(group => skillObserver.observe(group));

    // Timeline items
    const timelineItems = document.querySelectorAll('.timeline-item');
    const timelineObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          timelineObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    timelineItems.forEach(item => timelineObserver.observe(item));

    // Certification items
    const certificationItems = document.querySelectorAll('.certification-item');
    const certObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const idx = parseInt(entry.target.getAttribute('data-index')) || 0;
          setTimeout(() => {
            entry.target.classList.add('visible');
          }, idx * 80);
          certObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    certificationItems.forEach((item, i) => {
      item.setAttribute('data-index', i);
      certObserver.observe(item);
    });

  } else {
    // Fallback for browsers without IntersectionObserver
    fadeTargets.forEach(el => el.classList.add('visible'));
    document.querySelectorAll('.skill-tag, .project-card, .timeline-item, .certification-item')
      .forEach(el => el.classList.add('visible'));
  }
})();

// ============================================================
// Blog listing: category + tag filter + search + URL params
// ============================================================
(function () {
  const blogGrid = document.querySelector('.blog-post-grid');
  if (!blogGrid) return;

  // Staggered page-load entrance for blog listing cards (short stagger)
  const postCards = Array.from(blogGrid.querySelectorAll('.post-card'));
  postCards.forEach((c, i) => {
    c.style.setProperty('--enter-delay', (Math.min(i, 4) * 28) + 'ms');
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    postCards.forEach(c => c.classList.add('visible'));
  }));

  const params = new URLSearchParams(window.location.search);
  let activeCategory = params.get('category') || 'all';
  let activeTag = params.get('tag') || '';

  function getCards() { return blogGrid.querySelectorAll('.post-card'); }

  function filterPosts() {
    const searchQuery = (document.querySelector('.blog-search-input')?.value || '').toLowerCase().trim();
    let visible = 0;

    getCards().forEach(card => {
      const cardCat = card.getAttribute('data-category') || '';
      const cardTags = (card.getAttribute('data-tags') || '').split(',').map(t => t.trim()).filter(Boolean);
      const title = (card.querySelector('.card-title')?.textContent || '').toLowerCase();
      const excerpt = (card.querySelector('.card-excerpt')?.textContent || '').toLowerCase();

      const catOk = activeCategory === 'all' || cardCat === activeCategory;
      const tagOk = !activeTag || cardTags.includes(activeTag);
      const searchOk = !searchQuery || title.includes(searchQuery) || excerpt.includes(searchQuery);
      const show = catOk && tagOk && searchOk;

      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    // Update active UI states
    document.querySelectorAll('.cat-filter-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-category') === activeCategory);
    });
    document.querySelectorAll('.cloud-tag').forEach(tagEl => {
      tagEl.classList.toggle('active', tagEl.getAttribute('data-tag') === activeTag);
    });

    // Results count
    const countEl = document.getElementById('results-count');
    if (countEl) countEl.textContent = visible + '개의 글';

    // No results
    const noResults = document.getElementById('blog-no-results');
    if (noResults) noResults.style.display = visible === 0 ? '' : 'none';

    // Clear filter button
    const clearBtn = document.getElementById('clear-filter');
    if (clearBtn) {
      const hasFilter = activeCategory !== 'all' || activeTag || searchQuery;
      clearBtn.style.display = hasFilter ? '' : 'none';
    }
  }

  function updateURL() {
    const url = new URL(window.location);
    activeCategory !== 'all' ? url.searchParams.set('category', activeCategory) : url.searchParams.delete('category');
    activeTag ? url.searchParams.set('tag', activeTag) : url.searchParams.delete('tag');
    window.history.replaceState({}, '', url);
  }

  // Category filter
  document.querySelectorAll('.cat-filter-item').forEach(item => {
    item.addEventListener('click', () => {
      activeCategory = item.getAttribute('data-category');
      activeTag = '';
      const searchInput = document.querySelector('.blog-search-input');
      if (searchInput) searchInput.value = '';
      filterPosts();
      updateURL();
    });
  });

  // Tag cloud
  document.querySelectorAll('.cloud-tag').forEach(tagEl => {
    tagEl.addEventListener('click', () => {
      const tag = tagEl.getAttribute('data-tag');
      activeTag = (activeTag === tag) ? '' : tag;
      filterPosts();
      updateURL();
    });
  });

  // Search input (debounced)
  const searchInput = document.querySelector('.blog-search-input');
  if (searchInput) {
    let searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(filterPosts, 200);
    });
  }

  // Clear filter button
  const clearBtn = document.getElementById('clear-filter');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      activeCategory = 'all';
      activeTag = '';
      const searchInput = document.querySelector('.blog-search-input');
      if (searchInput) searchInput.value = '';
      filterPosts();
      updateURL();
    });
  }

  // Tag cloud font sizing based on data-count
  const cloudTags = document.querySelectorAll('.cloud-tag');
  if (cloudTags.length > 1) {
    const counts = Array.from(cloudTags).map(t => parseInt(t.getAttribute('data-count')) || 1);
    const maxCount = Math.max(...counts);
    const minCount = Math.min(...counts);
    const range = maxCount - minCount || 1;
    cloudTags.forEach(tag => {
      const count = parseInt(tag.getAttribute('data-count')) || 1;
      const ratio = (count - minCount) / range;
      tag.style.fontSize = (11 + ratio * 6) + 'px';
    });
  }

  // Apply initial URL params
  if (activeCategory !== 'all' || activeTag) {
    filterPosts();
  }
})();

// ============================================================
// Recent posts: staggered card animation
// ============================================================
(function () {
  const wraps = document.querySelectorAll('.recent-card-wrap');
  if (!wraps.length) return;

  // Set stagger delays upfront so CSS variable is ready before .visible is added
  wraps.forEach((w, i) => {
    w.style.setProperty('--card-delay', (i * 80) + 'ms');
  });

  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    wraps.forEach(w => obs.observe(w));
  } else {
    wraps.forEach(w => w.classList.add('visible'));
  }
})();

// ============================================================
// Blog post: TOC (desktop + mobile) + heading anchors
// ============================================================
(function () {
  const desktopTocList = document.getElementById('toc-list');
  const mobileTocList = document.getElementById('mobile-toc-list');
  const prose = document.querySelector('.prose');
  if (!prose) return;

  const headings = prose.querySelectorAll('h2, h3, h4');

  // Hide TOC if no headings
  if (!headings.length) {
    const tocEl = document.getElementById('toc');
    const mobileToc = document.querySelector('.mobile-toc');
    if (tocEl) tocEl.style.display = 'none';
    if (mobileToc) mobileToc.style.display = 'none';
    return;
  }

  const tocLinks = [];

  headings.forEach((h, i) => {
    // Assign ID, stripping out the anchor text if already added
    if (!h.id) {
      h.id = 'heading-' + i;
    }

    // Heading anchor link
    const anchor = document.createElement('a');
    anchor.href = '#' + h.id;
    anchor.className = 'heading-anchor';
    anchor.setAttribute('aria-hidden', 'true');
    anchor.textContent = '#';
    h.appendChild(anchor);

    // Build TOC entry
    const tocClass = 'toc-' + h.tagName.toLowerCase();
    const headingText = Array.from(h.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && !n.classList.contains('heading-anchor')))
      .map(n => n.textContent)
      .join('').trim();

    function makeTocLink(container) {
      if (!container) return null;
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = headingText;
      a.classList.add(tocClass);
      container.appendChild(a);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const top = h.getBoundingClientRect().top + window.scrollY - 88;
        window.scrollTo({ top, behavior: 'smooth' });
      });
      return a;
    }

    const desktopLink = makeTocLink(desktopTocList);
    const mobileLink = makeTocLink(mobileTocList);

    tocLinks.push({ el: h, desktop: desktopLink, mobile: mobileLink });
  });

  // Active heading on scroll
  if ('IntersectionObserver' in window) {
    const headingObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const idx = tocLinks.findIndex(t => t.el === entry.target);
        if (entry.isIntersecting && idx !== -1) {
          tocLinks.forEach(t => {
            if (t.desktop) t.desktop.classList.remove('active');
            if (t.mobile) t.mobile.classList.remove('active');
          });
          if (tocLinks[idx].desktop) tocLinks[idx].desktop.classList.add('active');
          if (tocLinks[idx].mobile) tocLinks[idx].mobile.classList.add('active');
        }
      });
    }, { rootMargin: '-80px 0px -70% 0px' });

    tocLinks.forEach(t => headingObserver.observe(t.el));
  }
})();

// ============================================================
// Blog post: mobile TOC toggle
// ============================================================
(function () {
  const toggleBtn = document.querySelector('.mobile-toc-toggle');
  const mobileContent = document.querySelector('.mobile-toc-content');
  if (!toggleBtn || !mobileContent) return;

  toggleBtn.addEventListener('click', () => {
    const isOpen = mobileContent.classList.toggle('open');
    toggleBtn.setAttribute('aria-expanded', isOpen);
  });
})();

// ============================================================
// Smooth scroll for anchor links
// ============================================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (href === '#') return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      const headerHeight = 64;
      const top = target.getBoundingClientRect().top + window.scrollY - headerHeight;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

// ============================================================
// Reading progress bar (post pages only)
// ============================================================
(function () {
  const bar = document.getElementById('reading-progress');
  if (!bar) return;

  const prose = document.querySelector('.post-body');
  if (!prose) return;

  function updateProgress() {
    const proseRect = prose.getBoundingClientRect();
    const proseTop = prose.offsetTop;
    const proseHeight = prose.offsetHeight;
    const scrolled = window.scrollY - proseTop;
    const total = proseHeight - window.innerHeight;
    const pct = total <= 0 ? 100 : Math.min(100, Math.max(0, (scrolled / total) * 100));
    bar.style.width = pct + '%';
  }

  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();
})();

// ============================================================
// Code block header: language badge + copy button (post pages only)
// ============================================================
(function () {
  const prose = document.querySelector('.prose');
  if (!prose) return;

  prose.querySelectorAll('div.highlight, figure.highlight').forEach(block => {
    // Detect language from parent wrapper (language-xxx highlighter-rouge)
    const parent = block.parentElement;
    let lang = '';
    if (parent) {
      const m = parent.className.match(/language-(\w+)/);
      if (m) lang = m[1];
    }
    if (!lang) {
      const codeEl = block.querySelector('code[class]');
      if (codeEl) {
        const m = codeEl.className.match(/language-(\w+)/);
        if (m) lang = m[1];
      }
    }

    // Build code header bar
    const header = document.createElement('div');
    header.className = 'code-header';

    const langSpan = document.createElement('span');
    langSpan.className = 'lang-badge';
    langSpan.textContent = (lang && lang !== 'text' && lang !== 'plaintext') ? lang : '';
    header.appendChild(langSpan);

    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = '복사';
    btn.setAttribute('aria-label', '코드 복사');
    header.appendChild(btn);

    // Insert header before the block's pre content
    block.insertBefore(header, block.firstChild);

    btn.addEventListener('click', () => {
      const code = block.querySelector('code');
      if (!code) return;
      const text = code.innerText;
      const write = () => {
        btn.textContent = '✓';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = '복사'; btn.classList.remove('copied'); }, 1800);
      };
      navigator.clipboard.writeText(text).then(write).catch(() => {
        const ta = Object.assign(document.createElement('textarea'), { value: text });
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        write();
      });
    });
  });
})();

// ============================================================
// Back-to-top button
// ============================================================
(function () {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;

  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 300);
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

// ============================================================
// 8-bit Sound Effects (Web Audio API)
// ============================================================
(function () {
  let audioCtx = null;
  let userInteracted = false;

  function getCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // Mark interaction on first user gesture
  document.addEventListener('click', () => { userInteracted = true; }, { once: true });
  document.addEventListener('keydown', () => { userInteracted = true; }, { once: true });

  window.playSound = function (type) {
    if (!userInteracted) return;
    try {
      const ctx = getCtx();
      const sequences = {
        click:       [[880, 0,    0.06], [440, 0.06, 0.05]],
        hover:       [[600, 0,    0.04]],
        achievement: [[523, 0,    0.1],  [659, 0.1,  0.1],  [784, 0.2,  0.18]],
        konami:      [[784, 0,    0.08], [988, 0.1,  0.08], [1175, 0.2, 0.08], [1568, 0.3, 0.22]],
        combo:       [[1200, 0,   0.06], [1600, 0.06, 0.08]],
        error:       [[200, 0,    0.15]],
      };
      const seq = sequences[type] || sequences.click;
      const vol = type === 'hover' ? 0.05 : 0.1;

      seq.forEach(([freq, delay, dur]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(vol, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + dur + 0.01);
      });
    } catch (e) {}
  };

  // Hook nav hover sounds
  document.querySelectorAll('nav a, .mobile-nav a').forEach(el => {
    el.addEventListener('mouseenter', () => playSound('hover'));
  });

  // Hook button click sounds
  document.addEventListener('click', e => {
    if (e.target.closest('.btn-primary, .btn-secondary')) playSound('click');
    if (e.target.closest('.cat-filter-item, .cloud-tag')) playSound('hover');
  });
})();

// ============================================================
// Achievement System (PSN / Xbox style toasts)
// ============================================================
(function () {
  const ACHIEVEMENTS = {
    GAME_LOADED:         { icon: '▶', title: 'GAME LOADED',         desc: 'cocodding.dev connected' },
    PORTFOLIO_UNLOCKED:  { icon: '🎮', title: 'PORTFOLIO UNLOCKED', desc: 'Projects section discovered' },
    SKILL_TREE:          { icon: '⚡', title: 'SKILL TREE ACCESSED', desc: 'Tech stack loaded' },
    BLOG_ACCESSED:       { icon: '📜', title: 'CODEX ACCESSED',     desc: 'Blog archive opened' },
    POST_READ:           { icon: '📖', title: 'READING MODE',        desc: 'Article selected' },
    EXPLORER:            { icon: '🗺', title: 'EXPLORER',            desc: 'Scrolled to the bottom' },
    KONAMI:              { icon: '★', title: 'CHEAT CODE ACTIVE',   desc: '↑↑↓↓←→←→BA — nice' },
  };

  const earned = new Set(JSON.parse(localStorage.getItem('ach_v1') || '[]'));
  let queue = [], busy = false;

  const toast = document.getElementById('achievement-toast');
  const iconEl = document.getElementById('ach-icon');
  const titleEl = document.getElementById('ach-title');
  const descEl = document.getElementById('ach-desc');

  function unlock(key) {
    if (earned.has(key) || !ACHIEVEMENTS[key]) return;
    earned.add(key);
    localStorage.setItem('ach_v1', JSON.stringify([...earned]));
    queue.push(key);
    if (!busy) process();
  }

  function process() {
    if (!queue.length) { busy = false; return; }
    busy = true;
    const key = queue.shift();
    const ach = ACHIEVEMENTS[key];
    if (!toast || !ach) { process(); return; }

    iconEl.textContent  = ach.icon;
    titleEl.textContent = ach.title;
    descEl.textContent  = ach.desc;

    toast.classList.add('visible');
    playSound('achievement');

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(process, 350);
    }, 3800);
  }

  window.unlockAchievement = unlock;

  // Page load
  setTimeout(() => unlock('GAME_LOADED'), 1200);

  // Blog / post pages
  if (window.location.pathname.includes('/blog')) {
    if (document.querySelector('.post-page')) {
      setTimeout(() => unlock('POST_READ'), 800);
    } else {
      setTimeout(() => unlock('BLOG_ACCESSED'), 800);
    }
  }

  // Section observers
  if ('IntersectionObserver' in window) {
    const map = { projects: 'PORTFOLIO_UNLOCKED', skills: 'SKILL_TREE' };
    Object.entries(map).forEach(([id, key]) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) { unlock(key); obs.disconnect(); }
      }, { threshold: 0.3 });
      obs.observe(el);
    });

    // Bottom of page → Explorer
    const footer = document.querySelector('.site-footer');
    if (footer) {
      const footerObs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) { unlock('EXPLORER'); footerObs.disconnect(); }
      }, { threshold: 0.5 });
      footerObs.observe(footer);
    }
  }
})();

// ============================================================
// Score HUD
// ============================================================
(function () {
  const el = document.getElementById('score-hud-value');
  if (!el) return;

  let score = parseInt(localStorage.getItem('score_v1') || '0');
  el.textContent = String(score).padStart(6, '0');

  function add(pts, highlight) {
    score = Math.min(score + pts, 999999);
    localStorage.setItem('score_v1', score);
    el.textContent = String(score).padStart(6, '0');
    // Only flash for significant gains (achievements, combo, konami)
    if (highlight) {
      el.classList.add('bump');
      setTimeout(() => el.classList.remove('bump'), 200);
    }
  }

  window.addScore = function(pts) { add(pts, true); };
  window.addScoreSilent = function(pts) { add(pts, false); };

  let scrollTick = 0;
  window.addEventListener('scroll', () => {
    scrollTick++;
    if (scrollTick % 8 === 0) add(1, false);
  }, { passive: true });
})();

// ============================================================
// Raging Demon — 瞬獄殺 (Konami Code: ↑↑↓↓←→←→ b a)
// ============================================================
(function () {
  var CODE = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown',
              'ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  var seq = [];

  function demonAudio(type) {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (type === 'intro') {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(110, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(22, ctx.currentTime + 1.1);
        g.gain.setValueAtTime(0.3, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.1);
        o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 1.1);
      } else if (type === 'hit') {
        var o2 = ctx.createOscillator(), g2 = ctx.createGain();
        o2.type = 'square';
        o2.frequency.setValueAtTime(900, ctx.currentTime);
        o2.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.07);
        g2.gain.setValueAtTime(0.18, ctx.currentTime);
        g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
        o2.connect(g2); g2.connect(ctx.destination);
        o2.start(); o2.stop(ctx.currentTime + 0.08);
      } else if (type === 'finish') {
        [392, 311, 247, 196].forEach(function(freq, i) {
          var o3 = ctx.createOscillator(), g3 = ctx.createGain();
          o3.type = 'square';
          o3.frequency.value = freq;
          g3.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.18);
          g3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.5);
          o3.connect(g3); g3.connect(ctx.destination);
          o3.start(ctx.currentTime + i * 0.18);
          o3.stop(ctx.currentTime + i * 0.18 + 0.55);
        });
      }
    } catch(e) {}
  }

  // ── Glass-crack sound ──
  function crackSound() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Noise burst for the shatter
      var dur = 0.4;
      var buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
      }
      var src = ctx.createBufferSource();
      src.buffer = buf;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.35, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2000;
      src.connect(hp); hp.connect(g); g.connect(ctx.destination);
      src.start();
    } catch(e) {}
  }

  // ── Full-screen shatter: crack flash + glass shards flying out ──
  function shatterGlass(overlay) {
    crackSound();

    // Brief white crack flash
    overlay.classList.add('flash');
    setTimeout(function() { overlay.classList.remove('flash'); }, 60);

    var layer = document.createElement('div');
    layer.style.cssText = 'position:absolute;inset:0;z-index:6;pointer-events:none;overflow:hidden;';
    overlay.appendChild(layer);

    var cx = window.innerWidth / 2;
    var cy = window.innerHeight / 2;
    var SHARDS = 46;

    for (var i = 0; i < SHARDS; i++) {
      var shard = document.createElement('div');
      var size = 14 + Math.random() * 46;
      // Random triangular glass piece via clip-path
      var p1 = Math.round(Math.random() * 50);
      var p2 = 50 + Math.round(Math.random() * 50);
      shard.style.cssText = [
        'position:absolute',
        'width:' + size + 'px', 'height:' + size + 'px',
        'left:' + cx + 'px', 'top:' + cy + 'px',
        'background:linear-gradient(135deg, rgba(255,255,255,0.85), rgba(150,200,255,0.35))',
        'box-shadow:0 0 8px rgba(180,220,255,0.6)',
        'clip-path:polygon(' + p1 + '% 0, 100% ' + p2 + '%, ' + (Math.random()*40|0) + '% 100%)',
        'opacity:0.95'
      ].join(';');
      layer.appendChild(shard);

      var ang = Math.random() * Math.PI * 2;
      var dist = 200 + Math.random() * Math.max(window.innerWidth, window.innerHeight) * 0.7;
      var tx = Math.cos(ang) * dist;
      var ty = Math.sin(ang) * dist;
      var rot = (Math.random() - 0.5) * 1080;

      var anim = shard.animate([
        { transform: 'translate(-50%,-50%) rotate(0deg) scale(1)', opacity: 1 },
        { transform: 'translate(calc(-50% + ' + tx + 'px), calc(-50% + ' + ty + 'px)) rotate(' + rot + 'deg) scale(0.3)', opacity: 0 }
      ], { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(0.12, 0.7, 0.3, 1)' });
      anim.onfinish = (function(s){ return function(){ s.remove(); }; })(shard);
    }

    setTimeout(function() { layer.remove(); }, 1400);
  }

  function triggerRagingDemon() {
    var overlay  = document.getElementById('konami-overlay');
    var kanji    = document.getElementById('rd-kanji');
    var hitsWrap = document.getElementById('rd-hits-wrap');
    var hitsEl   = document.getElementById('rd-hits-count');
    var finish   = document.getElementById('rd-finish');
    if (!overlay) return;
    var pageShakeEl = document.getElementById('page-shake') || document.body;

    // ── Reset ──
    [kanji, hitsWrap, finish].forEach(function(el) { if (el) el.classList.remove('visible'); });
    if (hitsEl) hitsEl.textContent = '0';
    if (finish) finish.innerHTML =
      '<span class="rd-char rd-c1">瞬</span>' +
      '<span class="rd-char rd-c2">獄</span>' +
      '<span class="rd-char rd-c3">殺</span>' +
      '<span class="rd-sub">SHUN GOKU SATSU</span>';
    overlay.classList.remove('flash');

    overlay.style.pointerEvents = 'all';
    overlay.classList.add('active');
    unlockAchievement('KONAMI');
    addScore(30000);
    demonAudio('intro');

    // ── Phase 1 — 瞬獄殺 appears first ──
    setTimeout(function() {
      if (finish) finish.classList.add('visible');
      demonAudio('finish');
    }, 400);

    // ── Phase 2 — rapid hit flicker (연타) ──
    var hits = 0, TOTAL = 15;
    setTimeout(function() {
      if (hitsWrap) hitsWrap.classList.add('visible');

      var iv = setInterval(function() {
        hits++;
        if (hitsEl) hitsEl.textContent = hits;

        overlay.classList.add('flash');
        setTimeout(function() { overlay.classList.remove('flash'); }, 35);

        var x = ((Math.random() - 0.5) * 18).toFixed(1);
        var y = ((Math.random() - 0.5) * 14).toFixed(1);
        pageShakeEl.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        setTimeout(function() { pageShakeEl.style.transform = ''; }, 50);

        demonAudio('hit');

        if (hits >= TOTAL) {
          clearInterval(iv);

          // ── Phase 3 — white blast → 天 finale + glass shatter ──
          setTimeout(function() {
            overlay.classList.add('flash');
            if (finish)   finish.classList.remove('visible');
            if (hitsWrap) hitsWrap.classList.remove('visible');

            setTimeout(function() {
              overlay.classList.remove('flash');
              shatterGlass(overlay);
              if (kanji) kanji.classList.add('visible');
              demonAudio('finish');

              setTimeout(function() {
                if (kanji) kanji.classList.remove('visible');
                setTimeout(function() {
                  overlay.classList.remove('active');
                  overlay.style.pointerEvents = 'none';
                  pageShakeEl.style.transform = '';
                }, 300);
              }, 2000);
            }, 400);
          }, 400);
        }
      }, 88);
    }, 1700);
  }

  document.addEventListener('keydown', function(e) {
    seq.push(e.key);
    if (seq.length > CODE.length) seq.shift();
    if (JSON.stringify(seq) === JSON.stringify(CODE)) {
      seq = [];
      triggerRagingDemon();
    }
  });
})();

// ============================================================
// Click explosion burst (every click, pixel squares)
// ============================================================
(function () {
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const PIXEL_COLORS = [
    '#ffeb3b', '#00e676', '#5b9cf6', '#a78bfa',
    '#ec4899', '#00e5ff', '#ff1744', '#ffffff',
  ];

  function explode(cx, cy, intensity) {
    intensity = intensity || 0.5;
    const count = Math.round(8 + intensity * 8);

    for (let i = 0; i < count; i++) {
      const size = 3 + Math.floor(Math.random() * 5);
      const color = PIXEL_COLORS[Math.floor(Math.random() * PIXEL_COLORS.length)];
      const p = document.createElement('div');
      p.style.cssText = [
        'position:fixed', 'pointer-events:none', 'z-index:9998',
        `width:${size}px`, `height:${size}px`, 'border-radius:0',
        `background:${color}`, `box-shadow:0 0 ${size}px ${color}`,
        `left:${cx}px`, `top:${cy}px`,
        'transform:translate(-50%,-50%)',
        'image-rendering:pixelated',
      ].join(';');
      document.body.appendChild(p);

      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
      const dist = (40 + Math.random() * 70) * (0.6 + intensity * 0.6);
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist;

      const anim = p.animate([
        { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 1 },
        { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0)`, opacity: 0 },
      ], { duration: 500 + Math.random() * 250, easing: 'cubic-bezier(0,0.9,0.57,1)', delay: Math.random() * 50 });
      anim.onfinish = () => p.remove();
    }

    // Pixel flash ring at click center
    const ring = document.createElement('div');
    ring.style.cssText = [
      'position:fixed', 'pointer-events:none', 'z-index:9997',
      'width:16px', 'height:16px', 'border-radius:0',
      'border:3px solid #ffeb3b',
      `left:${cx}px`, `top:${cy}px`,
      'transform:translate(-50%,-50%)',
    ].join(';');
    document.body.appendChild(ring);
    ring.animate([
      { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 1 },
      { transform: 'translate(-50%,-50%) scale(3.5)', opacity: 0 },
    ], { duration: 320, easing: 'steps(5)' }).onfinish = () => ring.remove();
  }

  window.clickExplode = explode;

  document.addEventListener('click', e => {
    if (e.target.closest('#achievement-toast, #konami-overlay, #score-hud')) return;
    explode(e.clientX, e.clientY, 0.4);
  });
})();

// ============================================================
// Combo counter — PunchScale at cursor, Combo x2 → x3 → ...
// ============================================================
(function () {
  var popup = document.getElementById('combo-popup');
  if (!popup) return;

  var count = 0, hideTimer = null, currentAnim = null;

  var LABELS = ['','','COMBO','COMBO','COMBO','NICE!','GREAT!','AWESOME!','SUPER!','ULTRA!'];
  function getLabel(n) {
    if (n >= 20) return 'GODLIKE!!';
    if (n >= 15) return 'UNSTOPPABLE!';
    if (n >= 10) return 'ULTRA!';
    return LABELS[Math.min(n, LABELS.length - 1)] || 'COMBO';
  }

  // DOTween PunchScale: fast burst → overshoot → elastic settle, stays at click center
  function punchScale(el) {
    try { if (currentAnim) currentAnim.cancel(); } catch(e) {}
    el.style.opacity = '1';
    currentAnim = el.animate([
      { transform: 'translate(-50%,-50%) scale(0.05)', opacity: 0, offset: 0    },
      { transform: 'translate(-50%,-50%) scale(1.2)',  opacity: 1, offset: 0.10 },
      { transform: 'translate(-50%,-50%) scale(0.86)', opacity: 1, offset: 0.28 },
      { transform: 'translate(-50%,-50%) scale(1.08)', opacity: 1, offset: 0.46 },
      { transform: 'translate(-50%,-50%) scale(0.97)', opacity: 1, offset: 0.62 },
      { transform: 'translate(-50%,-50%) scale(1.0)',  opacity: 1, offset: 0.74 },
      { transform: 'translate(-50%,-50%) scale(1.0)',  opacity: 0, offset: 1    },
    ], { duration: 520, easing: 'linear', fill: 'none' });
    currentAnim.onfinish = function() { el.style.opacity = '0'; };
  }

  function trigger(cx, cy) {
    count++;
    clearTimeout(hideTimer);

    if (count >= 2) {
      popup.textContent = getLabel(count) + ' x' + count;
      // Center the popup exactly on the click point
      popup.style.left = cx + 'px';
      popup.style.top  = cy + 'px';
      punchScale(popup);
      playSound('combo');
      addScoreSilent(count * 3);  // no green bump flash on every combo click

      if (window.clickExplode && count >= 5) {
        clickExplode(cx, cy, Math.min(count / 10, 1.5));
      }
      // Shake only at high combos (rapid clicking = intentional chaos)
      if (window.screenShake && count >= 5) {
        screenShake(Math.min(2 + count * 0.4, 9), 200 + count * 8);
      }
    }

    hideTimer = setTimeout(function() {
      count = 0;
      popup.style.opacity = '0';
    }, 800);
  }

  document.addEventListener('click', function(e) {
    if (e.target.closest('#achievement-toast, #konami-overlay, #score-hud')) return;
    trigger(e.clientX, e.clientY);
  });
})();

// ============================================================
// Cursor glow follower (desktop only)
// ============================================================
(function () {
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const glow = document.createElement('div');
  glow.id = 'cursor-glow';
  document.body.appendChild(glow);

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let glowX = mouseX, glowY = mouseY;
  let ticking = false;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(tick);
    }
  }, { passive: true });

  function tick() {
    glowX += (mouseX - glowX) * 0.07;
    glowY += (mouseY - glowY) * 0.07;
    glow.style.transform = `translate(${glowX - 200}px, ${glowY - 200}px)`;
    ticking = false;
    if (Math.abs(mouseX - glowX) > 0.5 || Math.abs(mouseY - glowY) > 0.5) {
      ticking = true;
      requestAnimationFrame(tick);
    }
  }
})();

// ============================================================
// 3D card tilt effect on hover (desktop only)
// ============================================================
(function () {
  if (window.matchMedia('(pointer: coarse)').matches) return;

  function applyTilt(card) {
    const maxTilt = 7;

    card.addEventListener('mouseenter', () => {
      card.style.transition = 'transform 0.15s ease, box-shadow 0.3s ease, border-color 0.3s ease';
    });

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const dx = (x / rect.width - 0.5) * 2;
      const dy = (y / rect.height - 0.5) * 2;
      card.style.transform =
        `perspective(900px) rotateX(${-dy * maxTilt}deg) rotateY(${dx * maxTilt}deg) translateY(-5px) scale(1.01)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transition = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.3s ease, border-color 0.3s ease';
      card.style.transform = '';
    });
  }

  document.querySelectorAll('.project-card, .post-card').forEach(applyTilt);
})();


// ============================================================
// Hero: YouTube video background
// ============================================================
(function () {
  const bg = document.getElementById('hero-video-bg');
  if (!bg) return;

  // Game video IDs — add more here as you create games
  const VIDEO_IDS = [
    'hp6LrmIztKU', // Katana Zero style action game
  ];

  let player;
  let currentIdx = 0;

  // Load YouTube IFrame API
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);

  window.onYouTubeIframeAPIReady = function () {
    player = new YT.Player('hero-yt-player', {
      videoId: VIDEO_IDS[0],
      playerVars: {
        autoplay: 1,
        mute: 1,
        loop: 1,
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        playsinline: 1,
        iv_load_policy: 3,
        rel: 0,
        showinfo: 0,
        playlist: VIDEO_IDS.join(','),
      },
      events: {
        onReady: (e) => {
          e.target.playVideo();
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) {
            bg.classList.add('playing');
          }
          // Cycle to next video when done (if multiple)
          if (e.data === YT.PlayerState.ENDED && VIDEO_IDS.length > 1) {
            currentIdx = (currentIdx + 1) % VIDEO_IDS.length;
            player.loadVideoById(VIDEO_IDS[currentIdx]);
          }
        },
      },
    });
  };
})();

// ============================================================
// Run dust — pixel particle trail on mousemove
// ============================================================
(function () {
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const DUST_COLORS = [
    '#ffffff', '#d0d0d0', '#a0a0a0',
    '#5b9cf6', '#a78bfa', '#ec4899',
  ];

  let lastX = 0, lastY = 0, lastTime = 0;

  function spawnDust(x, y, speed) {
    const count = Math.min(5, 1 + Math.floor(speed / 8));

    for (let i = 0; i < count; i++) {
      const size = 3 + Math.floor(Math.random() * 4);
      const color = DUST_COLORS[Math.floor(Math.random() * DUST_COLORS.length)];

      const p = document.createElement('div');
      p.style.cssText = [
        'position:fixed', 'pointer-events:none', 'z-index:9997',
        `width:${size}px`, `height:${size}px`, `background:${color}`,
        `left:${x}px`, `top:${y}px`,
        'transform:translate(-50%,-50%)',
        'image-rendering:pixelated', 'border-radius:0',
      ].join(';');
      document.body.appendChild(p);

      let vx = (Math.random() - 0.5) * 5;
      let vy = -(Math.random() * 2 + 0.5);
      let px = x, py = y, life = 1;
      const gravity = 0.18;
      const decay = 0.045 + Math.random() * 0.02;

      (function tick() {
        vx *= 0.92;
        vy += gravity;
        px += vx;
        py += vy;
        life -= decay;
        p.style.left = px + 'px';
        p.style.top = py + 'px';
        p.style.opacity = life;
        if (life > 0) {
          requestAnimationFrame(tick);
        } else {
          p.remove();
        }
      })();
    }
  }

  document.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - lastTime < 16) return;
    lastTime = now;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    const speed = Math.sqrt(dx * dx + dy * dy);

    if (speed > 4) spawnDust(e.clientX, e.clientY, speed);

    lastX = e.clientX;
    lastY = e.clientY;
  }, { passive: true });
})();

// ============================================================
// Magnetic button effect (subtle pull toward cursor)
// ============================================================
(function () {
  if (window.matchMedia('(pointer: coarse)').matches) return;

  document.querySelectorAll('.btn-primary, .btn-secondary').forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) * 0.18;
      const dy = (e.clientY - cy) * 0.18;
      btn.style.transform = `translate(${dx}px, ${dy}px) translateY(-3px)`;
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.transition = 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)';
      btn.style.transform = '';
      setTimeout(() => { btn.style.transition = ''; }, 400);
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.transition = 'transform 0.1s ease';
    });
  });
})();

// ============================================================
// Screen shake (exposed; called only by combo / konami — NOT every click)
// ============================================================
(function () {
  let shaking = false;

  // intensity in px, optional duration ms
  window.screenShake = function (intensity, duration) {
    if (shaking) return;
    shaking = true;

    intensity = Math.min(intensity || 4, 10);
    duration = duration || 220;
    const steps = 6;
    const interval = duration / steps;
    const target = document.getElementById('page-shake') || document.body;
    let i = 0;

    const tick = setInterval(() => {
      const decay = 1 - i / steps;
      const x = ((Math.random() - 0.5) * 2 * intensity * decay).toFixed(2);
      const y = ((Math.random() - 0.5) * 2 * intensity * decay).toFixed(2);
      target.style.transform = `translate(${x}px, ${y}px)`;
      i++;
      if (i >= steps) {
        clearInterval(tick);
        target.style.transform = '';
        shaking = false;
      }
    }, interval);
  };
})();
