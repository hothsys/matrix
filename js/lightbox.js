// ═══════════════════════════════════════
// LIGHTBOX
// lbIds, lbIdx moved to state.js to fix circular dependency with playback.js (2026-05-16)
// ═══════════════════════════════════════

function _updateLbNav(){
  const vis = lbIds.length > 1 ? '' : 'none';
  document.querySelectorAll('.lb-nav-btn').forEach(b => b.style.display = vis);
}
function openLightboxId(id,e){
  e&&e.stopPropagation();
  lbIds=photos.map(p=>p.id);
  lbIdx=lbIds.indexOf(id);
  showLbPhoto();
  _updateLbNav();
  document.getElementById('lightbox').classList.add('open');
}
function openPinLightbox(id,e){
  e&&e.stopPropagation();
  lbIds=pinPopupPhotoIds&&pinPopupPhotoIds.length?pinPopupPhotoIds:photos.map(p=>p.id);
  lbIdx=lbIds.indexOf(id);
  showLbPhoto();
  _updateLbNav();
  document.getElementById('lightbox').classList.add('open');
}
function showLbPhoto(animate=false){
  const p=photoMap.get(lbIds[lbIdx]);
  if(!p) return;
  const img=document.getElementById('lb-img');
  const cap=document.getElementById('lb-caption');
  const camEl=document.getElementById('lb-camera');
  const caption = (p.date ? fmtDate(p.date,p.time) : '') +
    (p.placeName ? (p.date?' · ':'') + p.placeName : '');
  if (camEl) camEl.textContent = p.camera ? `📷 ${p.camera}` : '';
  if (animate) {
    img.style.transition='opacity .18s ease, transform .18s ease';
    cap.style.transition='opacity .18s ease';
    img.style.opacity='0';
    img.style.transform='scale(.97)';
    cap.style.opacity='0';
    setTimeout(()=>{
      const next = new Image();
      next.onload = () => {
        img.src = next.src;
        cap.textContent = caption;
        requestAnimationFrame(() => {
          img.style.opacity='1';
          img.style.transform='scale(1)';
          cap.style.opacity='1';
        });
      };
      next.src = p.dataUrl;
    },180);
  } else {
    // Clear stale image immediately to prevent a flash of the previous photo,
    // then preload the new image and restore once decoded.
    img.style.opacity='0';
    img.removeAttribute('src');
    cap.textContent = caption;
    const next = new Image();
    next.onload = () => {
      img.src = next.src;
      requestAnimationFrame(() => { img.style.opacity='1'; });
    };
    next.src = p.dataUrl;
  }
  highlightCard(p.id);
}
function lbNav(dir){lbIdx=(lbIdx+dir+lbIds.length)%lbIds.length;showLbPhoto(true);}
function closeLightbox(){
  if (_playbackActive) { stopPlayback(); return; }
  document.getElementById('lightbox').classList.remove('open');
}
document.getElementById('lightbox').addEventListener('click',e=>{if(e.target===e.currentTarget)closeLightbox();});
document.addEventListener('keydown',e=>{
  const lb=document.getElementById('lightbox').classList.contains('open');
  if(lb&&e.key==='Escape')closeLightbox();
  if(lb&&e.key==='ArrowLeft')lbNav(-1);
  if(lb&&e.key==='ArrowRight')lbNav(1);
  if(!lb&&e.key==='Escape'){closeMetaModal();clearDestSearch();}
});