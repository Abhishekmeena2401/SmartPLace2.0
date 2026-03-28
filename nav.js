/* nav.js — inject consistent navbar + sidebar on every page */
(function () {
  const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';

  const navItems = [
    { href: 'dashboard.html',  icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',  label: 'Dashboard' },
    { href: 'company.html',   icon: '<path d="M3 21V7l9-4 9 4v14"/><path d="M9 21v-6h6v6"/>',                                                                                           label: 'Companies' },
    { href: 'index.html',     icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',  label: 'Resume Analyzer' },
    { href: 'quiz.html',      icon: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',                     label: 'Technical Quiz' },
    { href: 'courses.html',   icon: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',                                   label: 'Courses' },
    { href: 'job.html',       icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',                                          label: 'Jobs' },
  ];

  function svg(inner) {
    return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">${inner}</svg>`;
  }

  const sidebarHTML = `
    <span class="sidebar-label">Navigation</span>
    ${navItems.map(item => `
      <a href="${item.href}" class="nav-item ${currentPage === item.href ? 'active' : ''}">
        ${svg(item.icon)} ${item.label}
      </a>
    `).join('')}
  `;

  const navbarHTML = `
    <button class="hamburger" id="hamburger" aria-label="Toggle menu">
      <span></span><span></span><span></span>
    </button>
    <a href="dashboard.html" class="brand">Smart<em>Place</em></a>
    <div class="nav-spacer"></div>
    <span class="nav-badge">Student Portal</span>
  `;

  document.addEventListener('DOMContentLoaded', () => {
    const navbar  = document.getElementById('navbar');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');

    if (navbar)  navbar.innerHTML  = navbarHTML;
    if (sidebar) sidebar.innerHTML = sidebarHTML;

    const hamburger = document.getElementById('hamburger');
    if (hamburger) {
      hamburger.addEventListener('click', () => {
        sidebar?.classList.toggle('open');
        overlay?.classList.toggle('open');
      });
    }

    overlay?.addEventListener('click', () => {
      sidebar?.classList.remove('open');
      overlay?.classList.remove('open');
    });
  });
})();
