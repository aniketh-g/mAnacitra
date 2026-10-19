(() => {
  const nav = document.querySelector('body > header nav');
  if (!nav) return;
  const links = [...nav.querySelectorAll('a')];
  const active = nav.querySelector('a.active');
  if (!active) return;
  active.setAttribute('aria-current', 'page');
  const indicator = document.createElement('span');
  indicator.className = 'header-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  nav.append(indicator);
  let target = active;
  function draw() {
    indicator.style.width = `${target.offsetWidth}px`;
    indicator.style.transform = `translateX(${target.offsetLeft}px)`;
    if (!nav.classList.contains('header-indicator-ready')) {
      void indicator.offsetWidth;
      nav.classList.add('header-indicator-ready');
    }
  }
  function select(link) { target = link; draw(); }
  links.forEach(link => {
    link.addEventListener('mouseenter', () => select(link));
    link.addEventListener('focus', () => select(link));
    link.addEventListener('click', () => select(link));
  });
  nav.addEventListener('mouseleave', () => select(links.includes(document.activeElement) ? document.activeElement : active));
  nav.addEventListener('focusout', () => requestAnimationFrame(() => select(nav.querySelector('a:hover') || (links.includes(document.activeElement) ? document.activeElement : active))));
  const observer = new ResizeObserver(draw);
  observer.observe(nav);
  links.forEach(link => observer.observe(link));
  draw();
})();
