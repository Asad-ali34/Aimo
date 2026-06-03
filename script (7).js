/* ── Aimo shared JS ── */
(function(){
  /* Mobile nav toggle */
  const burger=document.getElementById('navBurger');
  const menu=document.getElementById('navMenu');
  if(burger&&menu){
    burger.addEventListener('click',function(){
      menu.classList.toggle('open');
      burger.setAttribute('aria-expanded',menu.classList.contains('open'));
    });
    document.addEventListener('click',function(e){
      if(!burger.contains(e.target)&&!menu.contains(e.target))menu.classList.remove('open');
    });
  }

  /* Scroll reveal */
  const revealObs=new IntersectionObserver(function(entries){
    entries.forEach(function(e,i){
      if(e.isIntersecting){setTimeout(function(){e.target.classList.add('revealed');},i*55);revealObs.unobserve(e.target);}
    });
  },{threshold:0.08});
  document.querySelectorAll('.reveal').forEach(function(el){revealObs.observe(el);});

  /* Ripple effect on buttons */
  function addRipple(el){
    el.addEventListener('click',function(e){
      const r=el.getBoundingClientRect();
      const w=document.createElement('span');
      const size=Math.max(r.width,r.height)*2;
      w.style.cssText='position:absolute;border-radius:50%;background:rgba(255,255,255,.25);pointer-events:none;transform:scale(0);animation:ripple .55s linear;width:'+size+'px;height:'+size+'px;left:'+(e.clientX-r.left-size/2)+'px;top:'+(e.clientY-r.top-size/2)+'px';
      el.appendChild(w);setTimeout(function(){w.remove();},580);
    });
  }
  document.querySelectorAll('.btn,.nav-cta,.cat-tab').forEach(addRipple);

  /* Feature icon click bounce */
  document.querySelectorAll('.feat-icon').forEach(function(el){
    el.addEventListener('click',function(){el.classList.remove('icon-click');void el.offsetWidth;el.classList.add('icon-click');});
  });
})();
