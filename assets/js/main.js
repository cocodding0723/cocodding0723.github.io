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

  function add(pts) {
    score = Math.min(score + pts, 999999);
    localStorage.setItem('score_v1', score);
    el.textContent = String(score).padStart(6, '0');
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 200);
  }

  window.addScore = add;

  let scrollTick = 0;
  window.addEventListener('scroll', () => {
    scrollTick++;
    if (scrollTick % 8 === 0) add(1);
  }, { passive: true });

  document.addEventListener('click', e => {
    if (e.target.closest('.btn, a')) add(5);
  });
})();

// ============================================================
// Konami Code easter egg
// ============================================================
(function () {
  const CODE = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown',
                'ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let seq = [];

  document.addEventListener('keydown', e => {
    seq.push(e.key);
    if (seq.length > CODE.length) seq.shift();
    if (JSON.stringify(seq) === JSON.stringify(CODE)) {
      seq = [];
      const overlay = document.getElementById('konami-overlay');
      if (!overlay) return;
      overlay.classList.add('active');
      playSound('konami');
      unlockAchievement('KONAMI');
      addScore(30000);
      setTimeout(() => overlay.classList.remove('active'), 2800);
    }
  });
})();

// ============================================================
// Combo system — rapid link/button clicks
// ============================================================
(function () {
  const popup = document.getElementById('combo-popup');
  if (!popup) return;

  let count = 0, timer = null;

  function trigger() {
    count++;
    clearTimeout(timer);

    if (count >= 3) {
      const label = count >= 10 ? 'ULTRA COMBO!!' : count >= 6 ? 'GREAT COMBO!' : 'COMBO!';
      popup.textContent = `${label} x${count}`;
      popup.classList.add('show');
      playSound('combo');
      addScore(count * 2);
    }

    timer = setTimeout(() => {
      count = 0;
      popup.classList.remove('show');
    }, 900);
  }

  document.addEventListener('click', e => {
    if (e.target.closest('a, button, .cat-filter-item, .cloud-tag')) trigger();
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
// Sparkle / particle burst on primary button click
// ============================================================
(function () {
  const COLORS = ['#5b9cf6', '#a78bfa', '#ec4899', '#38bdf8', '#f97316'];

  function burst(cx, cy) {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      const color = COLORS[i % COLORS.length];
      const size = 5 + Math.random() * 5;
      p.style.cssText = [
        'position:fixed', 'pointer-events:none', 'z-index:9999',
        `width:${size}px`, `height:${size}px`, 'border-radius:50%',
        `background:${color}`, `left:${cx}px`, `top:${cy}px`,
        'transform:translate(-50%,-50%)',
        `box-shadow:0 0 ${size * 2}px ${color}`
      ].join(';');
      document.body.appendChild(p);

      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 50 + Math.random() * 60;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist;

      const anim = p.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0)`, opacity: 0 }
      ], { duration: 650, easing: 'cubic-bezier(0, 0.9, 0.57, 1)', delay: Math.random() * 80 });
      anim.onfinish = () => p.remove();
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-primary, .btn.btn-primary');
    if (btn) burst(e.clientX, e.clientY);
  });
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
