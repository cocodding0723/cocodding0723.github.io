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

  } else {
    // Fallback for browsers without IntersectionObserver
    fadeTargets.forEach(el => el.classList.add('visible'));
    document.querySelectorAll('.skill-tag, .project-card, .timeline-item')
      .forEach(el => el.classList.add('visible'));
  }
})();

// ============================================================
// Blog: tag filter
// ============================================================
(function () {
  const filterBtns = document.querySelectorAll('.filter-btn');
  const postItems = document.querySelectorAll('.post-item');
  if (!filterBtns.length) return;

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tag = btn.getAttribute('data-tag');
      postItems.forEach(item => {
        if (tag === 'all') {
          item.classList.remove('hidden');
        } else {
          const tags = (item.getAttribute('data-tags') || '').split(',').map(t => t.trim());
          item.classList.toggle('hidden', !tags.includes(tag));
        }
      });
    });
  });
})();

// ============================================================
// Blog post: auto generate TOC + active heading highlight
// ============================================================
(function () {
  const tocList = document.getElementById('toc-list');
  const prose = document.querySelector('.prose');
  if (!tocList || !prose) return;

  const headings = prose.querySelectorAll('h2, h3, h4');
  if (!headings.length) {
    document.getElementById('toc').style.display = 'none';
    return;
  }

  const tocLinks = [];
  headings.forEach((h, i) => {
    // ID 부여
    if (!h.id) {
      h.id = 'heading-' + i;
    }

    const a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = h.textContent;
    a.classList.add('toc-' + h.tagName.toLowerCase());
    tocList.appendChild(a);
    tocLinks.push({ el: h, link: a });

    a.addEventListener('click', (e) => {
      e.preventDefault();
      const top = h.getBoundingClientRect().top + window.scrollY - 88;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

  // Active heading on scroll
  if ('IntersectionObserver' in window) {
    let activeIdx = 0;

    const headingObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const idx = tocLinks.findIndex(t => t.el === entry.target);
        if (entry.isIntersecting && idx !== -1) {
          tocLinks.forEach(t => t.link.classList.remove('active'));
          tocLinks[idx].link.classList.add('active');
          activeIdx = idx;
        }
      });
    }, { rootMargin: '-80px 0px -70% 0px' });

    tocLinks.forEach(t => headingObserver.observe(t.el));
  }
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
