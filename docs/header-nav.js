(() => {
 const nav=document.querySelector('body > header nav');if(!nav)return;
 const links=[...nav.querySelectorAll('a')],active=()=>nav.querySelector('a.active:not([hidden])');
 const indicator=document.createElement('span');indicator.className='header-indicator';indicator.setAttribute('aria-hidden','true');nav.append(indicator);
 let target=active();
 function draw(){if(!target||target.hidden)target=active();indicator.hidden=!target;if(!target)return;indicator.style.width=`${target.offsetWidth}px`;indicator.style.transform=`translateX(${target.offsetLeft}px)`;nav.classList.add('header-indicator-ready');}
 function select(link){target=link;draw();}
 links.forEach(link=>{link.addEventListener('mouseenter',()=>select(link));link.addEventListener('focus',()=>select(link));});
 nav.addEventListener('mouseleave',()=>select(links.includes(document.activeElement)?document.activeElement:active()));
 nav.addEventListener('focusout',()=>requestAnimationFrame(()=>select(links.includes(document.activeElement)?document.activeElement:active())));
 window.addEventListener('site-auth-change',()=>select(active()));
 const observer=new ResizeObserver(draw);observer.observe(nav);links.forEach(link=>observer.observe(link));draw();
})();
