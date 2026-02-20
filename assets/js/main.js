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

  // All cards start visible (no scroll animation on blog list)
  blogGrid.querySelectorAll('.post-card').forEach(c => c.classList.add('visible'));

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
