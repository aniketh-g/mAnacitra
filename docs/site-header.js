
(() => {
 const root=new URL('.',document.currentScript.src);window.SiteRoot=root;
 const header=document.querySelector('body > header');header.className='site-header';
 const page=header.dataset.page;document.body.classList.add(page==='map'?'map-page':'content-page');
 header.innerHTML=`<h1><a href="${new URL('index.html',root)}">मानचित्रम्</a></h1>
 <div id="place-search" role="search"><span class="place-search-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg></span>
 <input id="place-search-input" type="search" placeholder="नाम अन्विष्यताम् - 'दानवी', 'DĀNVBIVS', उत 'दानुब्युस्' " aria-label="Search place names" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="place-search-results" autocomplete="off" spellcheck="false">
 <button id="place-search-clear" type="button" aria-label="Clear search" hidden>×</button><ul id="place-search-results" role="listbox" aria-label="Matching places" hidden></ul><div id="place-search-status" role="status" aria-live="polite"></div></div>`;
 const nav=document.createElement('nav');nav.setAttribute('aria-label','Main navigation');header.append(nav);
 const pencil='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z"/></svg>';
 const logout='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>';
 const initiallyLoggedIn=sessionStorage.getItem('site-logged-in')==='true';
 for(const [key,text,path] of [['map','मानचित्रम्','index.html'],['about','अस्मद्विषये','about.html'],['feedback','प्रतिमन्त्रणम्','feedback.html'],['editor','सूचयितृ','contribute/'],['signin','अभिमन्त्रयितुं सम्प्रवेशः','contribute/']]){
  const a=document.createElement('a');a.textContent=text;a.href=new URL(path,root);a.dataset.tab=key;
  if(key==='editor'||key==='signin'){a.insertAdjacentHTML('afterbegin',pencil);a.classList.add('auth-nav-link');}
  a.hidden=key===(initiallyLoggedIn?'signin':'editor');
  if(key===page||(page==='editor'&&key===(initiallyLoggedIn?'editor':'signin'))){a.className+=' active';a.setAttribute('aria-current','page');}nav.append(a);
 }
 const signout=document.createElement('button');signout.id='signout';signout.type='button';signout.textContent='बहिर्वेशः';signout.insertAdjacentHTML('afterbegin',logout);signout.hidden=!initiallyLoggedIn;nav.append(signout);
 window.setHeaderUser=user=>{
  window.headerUser=user;window.dispatchEvent(new CustomEvent("site-user",{detail:user}));
  sessionStorage.setItem('site-logged-in',String(!!user));
  nav.querySelector('[data-tab=editor]').hidden=!user;nav.querySelector('[data-tab=signin]').hidden=!!user;signout.hidden=!user;
  for(const a of nav.querySelectorAll('a')){const active=!a.hidden&&(a.dataset.tab===page||(page==='editor'&&a.dataset.tab===(user?'editor':'signin')));a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
  window.dispatchEvent(new Event('site-auth-change'));
 };
 if(page!=='map')document.getElementById('place-search').remove();
})();
