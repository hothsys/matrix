// ═══════════════════════════════════════
// PHOTO LIST (sorted ascending by timestamp)
// ═══════════════════════════════════════
function photoSortKey(p) {
  if (p.date) return p.date + 'T' + (p.time || '00:00');
  return '9999-99-99T' + String(p.addedAt).padStart(16,'0');
}

// Duration scales with content height so small groups snap and large ones
// don't feel sluggish. Clamped to 180–420ms.
function _animDuration(h) {
  return Math.max(180, Math.min(420, 120 + h * 0.25));
}

function _animateBody(hdr, body, expand) {
  const prev = body._animEnd;
  if (prev) { body.removeEventListener('transitionend', prev); body._animEnd = null; }

  // Respect the user's reduced-motion preference — toggle instantly.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    hdr.classList.toggle('collapsed', !expand);
    body.style.maxHeight = '';
    return;
  }

  if (expand) {
    body.style.maxHeight = '';
    const h = body.scrollHeight;
    body.style.transitionDuration = _animDuration(h) + 'ms';
    body.style.maxHeight = '0';
    void body.scrollHeight;
    body.style.maxHeight = h + 'px';
    hdr.classList.remove('collapsed');
    // Clear inline overrides on completion so nested groups can grow later.
    const onEnd = () => {
      body.style.maxHeight = '';
      body.style.transitionDuration = '';
      body.removeEventListener('transitionend', onEnd);
      body._animEnd = null;
    };
    body._animEnd = onEnd;
    body.addEventListener('transitionend', onEnd);
  } else {
    const h = body.scrollHeight;
    body.style.transitionDuration = _animDuration(h) + 'ms';
    body.style.maxHeight = h + 'px';
    void body.scrollHeight;
    requestAnimationFrame(() => { hdr.classList.add('collapsed'); body.style.maxHeight = '0'; });
    const onEnd = () => {
      body.style.transitionDuration = '';
      body.removeEventListener('transitionend', onEnd);
      body._animEnd = null;
    };
    body._animEnd = onEnd;
    body.addEventListener('transitionend', onEnd);
  }
}

// Track expanded groups across rebuilds
const _expandedDecades = new Set(); // decade-level collapse (Photos tab)
const _expandedYears = new Set();   // year-level collapse (Photos tab)
const _tlCollapsedYears = new Set();

function _syncCollapseBtn(tab) {
  if (tab === 'photos') {
    const btn = document.getElementById('photos-collapse-all');
    const allExpanded = _decadeEntries.length > 0 && _decadeEntries.every(e => _expandedDecades.has(e.yr));
    if (btn) btn.classList.toggle('all-collapsed', !allExpanded);
  } else {
    const btn = document.getElementById('tl-collapse-all');
    const hdrs = document.querySelectorAll('#panel-timeline .year-hdr');
    const allExpanded = hdrs.length > 0 && [...hdrs].every(h => !h.classList.contains('collapsed'));
    if (btn) btn.classList.toggle('all-collapsed', !allExpanded);
  }
}

function toggleAllYears(tab) {
  if (tab === 'photos') {
    const allExpanded = _decadeEntries.length > 0 && _decadeEntries.every(e => _expandedDecades.has(e.yr));
    _decadeEntries.forEach(e => {
      const hdr = e.group.querySelector(':scope > .year-hdr');
      const body = hdr?.nextElementSibling;
      if (allExpanded) {
        _expandedDecades.delete(e.yr);
        if (hdr && body && !hdr.classList.contains('collapsed')) _animateBody(hdr, body, false);
      } else {
        _expandedDecades.add(e.yr);
        if (hdr && body && hdr.classList.contains('collapsed')) _animateBody(hdr, body, true);
        e.group.querySelectorAll('.year-group > .year-hdr.collapsed').forEach(yh => {
          const yb = yh.nextElementSibling;
          if (yb) _animateBody(yh, yb, true);
          _expandedYears.add(yh.querySelector('.year-hdr-label').textContent);
        });
      }
    });
    const btn = document.getElementById('photos-collapse-all');
    if (btn) btn.classList.toggle('all-collapsed', allExpanded);
  } else {
    const hdrs = document.querySelectorAll('#panel-timeline .year-hdr');
    const allExpanded = hdrs.length > 0 && [...hdrs].every(h => !h.classList.contains('collapsed'));
    hdrs.forEach(h => {
      const yr = h.querySelector('.year-hdr-label').textContent;
      const body = h.nextElementSibling;
      if (allExpanded) {
        _tlCollapsedYears.add(yr);
        if (body && !h.classList.contains('collapsed')) _animateBody(h, body, false);
      } else {
        _tlCollapsedYears.delete(yr);
        if (body && h.classList.contains('collapsed')) _animateBody(h, body, true);
      }
    });
    const btn = document.getElementById('tl-collapse-all');
    if (btn) btn.classList.toggle('all-collapsed', allExpanded);
  }
}

let _decadeEntries = [];

function rebuildPhotoList() {
  const list = document.getElementById('photos-list');
  const scrollParent = list.parentElement;
  const scrollTop = scrollParent ? scrollParent.scrollTop : 0;
  const sorted = photos.filter(p => !p.isEmptyPin).sort((a,b) => photoSortKey(a) < photoSortKey(b) ? -1 : 1);
  if (!sorted.length) {
    list.innerHTML = `<div class="empty-state"><div class="big">🌍</div>Add photos to build your travel map</div>`;
    _decadeEntries = [];
    return;
  }

  // Group: decade → year → photos
  const byDecade = {};
  sorted.forEach(p => {
    const yr = p.date ? p.date.slice(0,4) : null;
    if (!yr) {
      (byDecade['Undated'] = byDecade['Undated'] || {})['Undated'] = byDecade['Undated']?.['Undated'] || [];
      byDecade['Undated']['Undated'].push(p);
      return;
    }
    const dk = String(Math.floor(parseInt(yr) / 10) * 10);
    if (!byDecade[dk]) byDecade[dk] = {};
    if (!byDecade[dk][yr]) byDecade[dk][yr] = [];
    byDecade[dk][yr].push(p);
  });

  const decades = Object.keys(byDecade).sort((a,b) => {
    if (a === 'Undated') return 1;
    if (b === 'Undated') return -1;
    return parseInt(a) < parseInt(b) ? -1 : 1;
  });

  _decadeEntries = [];
  const frag = document.createDocumentFragment();

  decades.forEach(dk => {
    const isUndated = dk === 'Undated';
    const decadeLabel = isUndated ? 'Undated' : `${dk} – ${parseInt(dk) + 9}`;

    // Total count across all years in this decade
    let totalCount = 0;
    Object.values(byDecade[dk]).forEach(arr => { totalCount += arr.length; });

    const decadeGroup = document.createElement('div');
    decadeGroup.className = 'year-group';

    const decadeHdr = document.createElement('div');
    decadeHdr.className = _expandedDecades.has(dk) ? 'year-hdr' : 'year-hdr collapsed';
    decadeHdr.innerHTML = `<span class="year-hdr-label">${decadeLabel}</span><span class="year-hdr-count">${totalCount}</span><span class="year-hdr-line"></span>`;
    decadeGroup.appendChild(decadeHdr);

    const decadeBody = document.createElement('div');
    decadeBody.className = 'year-body';

    const yearKeys = Object.keys(byDecade[dk]).sort();
    const yearEntries = [];
    yearKeys.forEach(yr => {
      const yearGroup = document.createElement('div');
      yearGroup.className = 'year-group';

      const yearHdr = document.createElement('div');
      yearHdr.className = _expandedYears.has(yr) ? 'year-hdr' : 'year-hdr collapsed';
      yearHdr.innerHTML = `<span class="year-hdr-label">${yr}</span><span class="year-hdr-count">${byDecade[dk][yr].length}</span><span class="year-hdr-line"></span>`;
      yearGroup.appendChild(yearHdr);

      const yearBody = document.createElement('div');
      yearBody.className = 'year-body';
      byDecade[dk][yr].forEach(p => yearBody.appendChild(_makeCard(p)));
      yearGroup.appendChild(yearBody);

      yearHdr.addEventListener('click', () => {
        const expanding = yearHdr.classList.contains('collapsed');
        if (expanding) _expandedYears.add(yr);
        else _expandedYears.delete(yr);
        _animateBody(yearHdr, yearBody, expanding);
      });

      decadeBody.appendChild(yearGroup);
      yearEntries.push({ yr, hdr: yearHdr, body: yearBody });
    });

    decadeGroup.appendChild(decadeBody);
    frag.appendChild(decadeGroup);

    decadeHdr.addEventListener('click', () => {
      const expanding = decadeHdr.classList.contains('collapsed');
      if (expanding) _expandedDecades.add(dk);
      else _expandedDecades.delete(dk);
      _animateBody(decadeHdr, decadeBody, expanding);
      _syncCollapseBtn('photos');
    });

    _decadeEntries.push({ yr: dk, group: decadeGroup, years: yearEntries });
  });

  list.innerHTML = '';
  list.appendChild(frag);
  if (scrollParent) scrollParent.scrollTop = scrollTop;
  _syncCollapseBtn('photos');
}

function _makeCard(photo) {
  const div = document.createElement('div');
  div.className = 'photo-card';
  div.id = `card_${photo.id}`;
  div.innerHTML = cardHTML(photo);
  div.addEventListener('click', () => focusPhoto(photo.id));
  return div;
}

function cardHTML(p) {
  const gps = p.lat !== null;
  return `<img class="photo-thumb-sm${gps?'':' no-gps'}" src="${p.thumbUrl}" alt="" loading="lazy"/>
    <div class="photo-info">
      <div class="photo-meta-row${gps?'':' no-gps-row'}">
        ${p.date?`<span class="badge badge-date">${fmtDate(p.date,p.time)}</span>`:''}
        ${gps?'':`<span class="badge badge-nogps">⊘</span>`}
      </div>
      ${p.placeName?`<div class="place-label">${esc(p.placeName)}</div>`:''}
    </div>
    <div class="card-actions">
      <button class="card-btn" onclick="openPhotoMetaModal('${p.id}',event)" title="Edit">✏️</button>
      <button class="card-btn del" onclick="deletePhoto('${p.id}',event)" title="Delete">✕</button>
    </div>`;
}

function focusPhoto(id) {
  const p = photoMap.get(id);
  if (!p) return;
  highlightCard(id);
  if (p.lat !== null) {
    const targetZoom = Math.max(map.getZoom(), 14);
    const dist = Math.hypot(map.getCenter().lng - p.lng, map.getCenter().lat - p.lat);
    const alreadyThere = dist < 0.005 && map.getZoom() >= 13;
    openPinPopup(p.lat, p.lng);
    if (!alreadyThere) {
      map.flyTo({center:[p.lng,p.lat], zoom:targetZoom, duration:1200, offset:[0,150]});
    }
  } else {
    openLightboxId(id);
  }
}

function highlightCard(id) {
  document.querySelectorAll('.photo-card.active').forEach(c => c.classList.remove('active'));
  outer: for (const de of _decadeEntries) {
    for (const ye of de.years) {
      const card = ye.body.querySelector(`#card_${id}`);
      if (card) {
        const dhdr = de.group.querySelector(':scope > .year-hdr');
        const dBody = dhdr?.nextElementSibling;
        if (dhdr && dBody && !_expandedDecades.has(de.yr)) {
          _expandedDecades.add(de.yr);
          _animateBody(dhdr, dBody, true);
        }
        if (!_expandedYears.has(ye.yr)) {
          _expandedYears.add(ye.yr);
          _animateBody(ye.hdr, ye.body, true);
        }
        _syncCollapseBtn('photos');
        break outer;
      }
    }
  }
  const c = document.getElementById(`card_${id}`);
  if (c) { c.classList.add('active'); c.scrollIntoView({behavior:'smooth',block:'nearest'}); }
}

async function deletePhoto(id, e) {
  e && e.stopPropagation();
  const p = photoMap.get(id);
  if (!p) return;
  if (!confirm('Are you sure you want to delete this photo?')) return;
  photos.splice(photos.indexOf(p), 1);
  await dbDel('photos', id);
  deletePhotoFiles(id);
  // Remove from all albums
  for (const a of albums) {
    const idx = a.photoIds.indexOf(id);
    if (idx !== -1) { a.photoIds.splice(idx,1); await dbPut('albums',a); }
  }
  refreshAll();
  if (activeAlbumId) renderAlbumDetail(activeAlbumId);
  scheduleAutoSave();
  showToast('Photo deleted','error');
}

// ═══════════════════════════════════════
// TIMELINE
// ═══════════════════════════════════════
function buildTimeline() {
  const panel = document.getElementById('panel-timeline');
  const dated = photos.filter(p=>p.date).sort((a,b)=>photoSortKey(a)<photoSortKey(b)?-1:1);
  if (!dated.length) {
    panel.innerHTML=`<div class="empty-state"><div class="big">📅</div>Photos with dates appear here<br/>in chronological order</div>`;
    return;
  }
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  // Group photos: year → month → day
  const byYear={};
  const yearCounts={};
  dated.forEach(p=>{
    const[y,m]=p.date.split('-');
    const mk=`${y}-${m}`;
    (byYear[y]=byYear[y]||{})[mk]=byYear[y][mk]||{};
    (byYear[y][mk][p.date]=byYear[y][mk][p.date]||[]).push(p);
    yearCounts[y]=(yearCounts[y]||0)+1;
  });
  const frag = document.createDocumentFragment();
  const tlHdr = document.createElement('div');
  tlHdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between';
  tlHdr.innerHTML = `<div class="section-label">Timeline</div><button class="collapse-all-btn" id="tl-collapse-all" onclick="toggleAllYears('timeline')"></button>`;
  frag.appendChild(tlHdr);
  Object.keys(byYear).sort().forEach(yr=>{
    const group = document.createElement('div');
    group.className = 'year-group';
    const collapsed = _tlCollapsedYears.has(yr);
    const hdr = document.createElement('div');
    hdr.className = collapsed ? 'year-hdr collapsed' : 'year-hdr';
    hdr.innerHTML = `<span class="year-hdr-label">${yr}</span><span class="year-hdr-count">${yearCounts[yr]}</span><span class="year-hdr-line"></span>`;
    group.appendChild(hdr);

    const body = document.createElement('div');
    body.className = 'year-body';
    let bodyHtml='';
    Object.keys(byYear[yr]).sort().forEach(mk=>{
      const mi=parseInt(mk.split('-')[1])-1;
      bodyHtml+=`<div class="tl-month"><div class="tl-month-label">${MONTHS[mi]}</div>`;
      Object.keys(byYear[yr][mk]).sort().forEach(dk=>{
        const d=parseInt(dk.split('-')[2]);
        bodyHtml+=`<div class="tl-day"><div class="tl-day-label">${d}</div><div class="tl-strip">`;
        byYear[yr][mk][dk].forEach(p=>{
          bodyHtml+=`<img class="tl-thumb" src="${p.thumbUrl}" title="${esc(p.name)}${p.time?' · '+p.time:''}" loading="lazy" onclick="focusTLPhoto('${p.id}')"/>`;
        });
        bodyHtml+=`</div></div>`;
      });
      bodyHtml+=`</div>`;
    });
    body.innerHTML=bodyHtml;
    group.appendChild(body);

    hdr.addEventListener('click', () => {
      const expanding = hdr.classList.contains('collapsed');
      if (expanding) _tlCollapsedYears.delete(yr);
      else _tlCollapsedYears.add(yr);
      _animateBody(hdr, body, expanding);
      _syncCollapseBtn('timeline');
    });

    frag.appendChild(group);
  });
  panel.innerHTML='';
  panel.appendChild(frag);
  _syncCollapseBtn('timeline');
}
function focusTLPhoto(id) {
  const p = photoMap.get(id);
  if (!p) return;
  if (p.lat !== null) {
    const targetZoom = Math.max(map.getZoom(), 14);
    openPinPopup(p.lat, p.lng);
    map.flyTo({center:[p.lng,p.lat], zoom:targetZoom, duration:1200, offset:[0,150]});
  } else {
    openLightboxId(id);
  }
}
