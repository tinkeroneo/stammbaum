(() => {
'use strict';

// -- Data / persistence ----------------------------------------------------
const storeKey = 'mobile-family-tree-v5-clean';
const minZoom = 0.045;
const maxZoom = 2.4;
const minFitZoom = 0.42;
const defaultDataUrl = 'Bodensteiner.json';

const sample = { people: [
  {id:'p1',name:'Großvater',born:'1932',died:'2011',birthName:'',note:'Familienzweig A',x:520,y:180,parents:[],partner:'p2'},
  {id:'p2',name:'Großmutter',born:'1936',died:'',birthName:'',note:'',x:760,y:180,parents:[],partner:'p1'},
  {id:'p3',name:'Elternteil',born:'1962',died:'',birthName:'',note:'',x:640,y:420,parents:['p1','p2'],partner:'p4'},
  {id:'p4',name:'Partner/in',born:'1965',died:'',birthName:'',note:'',x:890,y:420,parents:[],partner:'p3'},
  {id:'p5',name:'Kind 1',born:'1990',died:'',birthName:'',note:'',x:650,y:690,parents:['p3','p4'],partner:''},
  {id:'p6',name:'Kind 2',born:'1994',died:'',birthName:'',note:'',x:900,y:690,parents:['p3','p4'],partner:''}
]};

let data = load();
let selected = null;
let view = { x: 0, y: 0, s: 0.72 };
let drag = null;
let pan = null;
let selection = null;
let suppressOpenUntil = 0;
let pinch = null;
let collapsed = new Set(JSON.parse(localStorage.getItem(storeKey + '-collapsed') || '[]'));
let longPressTimer = null;
let pendingNewPos = null;

// -- DOM selector helpers -------------------------------------------------
const $ = id => document.getElementById(id);
const main = $('main');
const world = $('world');
const nodes = $('nodes');
const lines = $('lines');
const generationBands = $('generationBands');
const selectionRect = $('selectionRect');
const minimap = $('minimap');
const minimapInner = minimap ? minimap.querySelector('.minimapInner') : null;
const minimapViewport = $('minimapViewport');
const minimapSvg = $('minimapSvg');
let compactMode = false;
let minimapState = null;
let renderFrame = null;
let focusMode = false;
let focusId = null;
let activeFamily = '';
let editMode = false;
let nameMode = 'short';
let layoutMode = 'classic';
let savedClassicPositions = null;
let rootId = '';
localStorage.removeItem(storeKey + '-root');
let spotlightId = null;
let spotlightTimer = null;
let sheetSnapshot = '';
let scrollExpanded = new Set();

const familyPalette = [
  '#6b8f71', '#c9895e', '#6f88b6', '#b86b77', '#8f7ab8',
  '#5d9a9a', '#b39a4d', '#7b8d57', '#b0709b', '#8a765f'
];

function normalize(d) {
  if (!d || !Array.isArray(d.people)) d = structuredClone(sample);
  d.people = d.people.map((p, i) => {
    const name = String(p.name || 'Ohne Name');
    const firstName = String(p.firstName || p.vorname || '').trim();
    const rawBirthName = String(p.birthName || p.birth_name || '').trim();
    const lastName = String(p.lastName || p.nachname || '').trim() || rawBirthName;
    const nickname = String(p.nickname || p.ruename || '').trim();
    const explicitName = firstName || lastName ? `${firstName} ${lastName}`.trim() : name;
    const partners = [...new Set([
      ...(Array.isArray(p.partners) ? p.partners.map(String) : []),
      String(p.partner || '')
    ].filter(Boolean))];
    return {
      id: String(p.id || 'p' + (i + 1)),
      name: explicitName || name,
      firstName: firstName || (name.split(/\s+/).slice(0, -1).join(' ') || name),
      lastName: lastName || (name.split(/\s+/).slice(-1).join(' ') || ''),
      nickname,
      born: String(p.born || ''),
      died: String(p.died || ''),
      birthName: rawBirthName,
      note: String(p.note || ''),
      x: Number.isFinite(+p.x) ? +p.x : 200 + i * 40,
      y: Number.isFinite(+p.y) ? +p.y : 200 + i * 40,
      parents: Array.isArray(p.parents) ? p.parents.map(String).filter(Boolean) : [],
      partner: partners[0] || '',
      partners
    };
  });
  return d;
}

function load() {
  try {
    const raw = localStorage.getItem(storeKey);
    if (raw) return normalize(JSON.parse(raw));
  } catch {}
  return normalize(structuredClone(sample));
}
async function loadDefaultDataIfAvailable() {
  if (localStorage.getItem(storeKey)) return;
  try {
    const response = await fetch(defaultDataUrl, { cache: 'no-store' });
    if (!response.ok) return;
    const imported = normalize(await response.json());
    data = imported;
    save();
    render();
    fit();
    if ($('sideNav')?.classList.contains('open')) renderNavigator();
    if ($('scrollSheet')?.classList.contains('open')) renderScrollView();
  } catch {}
}
function save() { localStorage.setItem(storeKey, JSON.stringify(data, null, 2)); }
function person(id) { return data.people.find(p => p.id === id); }
function uniqueIds(ids) { return [...new Set((ids || []).map(String).filter(Boolean))]; }
function setPartnerIds(p, ids) {
  if (!p) return;
  p.partners = uniqueIds(ids).filter(id => id !== p.id);
  p.partner = p.partners[0] || '';
}
function partnerIds(p) {
  if (!p) return [];
  return uniqueIds([...(Array.isArray(p.partners) ? p.partners : []), p.partner])
    .filter(id => id !== p.id && person(id));
}
function primaryPartner(p) { return person(partnerIds(p)[0]); }
function mutualPartnerIds(p) {
  return partnerIds(p).filter(id => partnerIds(person(id)).includes(p.id));
}
function addPartnerLink(p, q, reciprocal = true) {
  if (!p || !q || p.id === q.id) return;
  setPartnerIds(p, [...partnerIds(p), q.id]);
  if (reciprocal) setPartnerIds(q, [...partnerIds(q), p.id]);
}
function removePartnerLink(p, otherId, reciprocal = true) {
  if (!p || !otherId) return;
  setPartnerIds(p, partnerIds(p).filter(id => id !== otherId));
  if (reciprocal) {
    const q = person(otherId);
    if (q) setPartnerIds(q, partnerIds(q).filter(id => id !== p.id));
  }
}
function esc(s) { return String(s || '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function initials(n) { return (n || '?').split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase(); }
function fullName(p) {
  if (!p) return '';
  const name = `${p.firstName || ''} ${p.lastName || ''}`.trim();
  return name || p.name || '';
}
function birthNameDiffers(p) {
  if (!p?.birthName) return false;
  return String(p.birthName).trim().toLowerCase() !== String(p.lastName || '').trim().toLowerCase();
}
function displayName(p) { return p ? (fullName(p) || p.name) : ''; }
function selectPersonLabel(p, mode = 'person') {
  if (!p) return '';
  const dates = [p.born && formatBirthDate(p.born), p.died && '- ' + p.died].filter(Boolean).join(' ');
  const birth = birthNameDiffers(p) ? `geb. ${p.birthName}` : '';
  const partners = partnerIds(p)
    .map(id => person(id))
    .filter(Boolean)
    .map(q => fullName(q) || q.name)
    .join(', ');
  const relation = partners ? `Partner/in: ${partners}` : '';
  const parts = [dates, birth, mode === 'partner' ? relation : ''].filter(Boolean);
  return `${displayName(p)}${parts.length ? ' - ' + parts.join(' · ') : ''}`;
}
function visibleName(p) {
  if (!p) return '';
  if (nameMode === 'initials') return initials(fullName(p) || p.name);
  if (nameMode === 'full') return displayName(p);
  return p.nickname || p.firstName || p.name;
}
function surnameOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1].toLowerCase() : '';
}
function familyLabel(p) {
  return String(p?.lastName || p?.birthName || surnameOf(p?.name) || 'Unbekannt').trim() || 'Unbekannt';
}
function familyKey(p) {
  return familyLabel(p).toLowerCase();
}
function familyColor(key) {
  let hash = 0;
  for (const ch of String(key || '')) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return familyPalette[Math.abs(hash) % familyPalette.length];
}
function matchesFamily(p, key = activeFamily) {
  if (!key) return true;
  const own = familyKey(p);
  const birth = String(p?.birthName || '').trim().toLowerCase();
  return own === key || birth === key;
}
function nextId() {
  let max = 0;
  for (const p of data.people) {
    const m = String(p.id).match(/\d+/);
    if (m) max = Math.max(max, +m[0]);
  }
  return 'p' + (max + 1);
}

// -- View transform helpers --------------------------------------------
function applyView() {
  world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
  updateZoomClass();
  updateMinimapViewport();
}
function updateWorldBounds() {
  const margin = 600;
  const maxX = Math.max(1600, ...data.people.map(p => p.x)) + margin;
  const maxY = Math.max(1100, ...data.people.map(p => p.y)) + margin;
  world.style.width = maxX + 'px';
  world.style.height = maxY + 'px';
  lines.setAttribute('width', maxX);
  lines.setAttribute('height', maxY);
  lines.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
  updateMinimap(maxX, maxY);
}
function updateMinimap(maxX, maxY) {
  if (!minimap || !minimapInner || !minimapViewport || !minimapSvg) return;
  
  const visible = visibleIds();
  const mapW = minimapInner.clientWidth || 150;
  const mapH = minimapInner.clientHeight || 90;
  const scale = Math.min(mapW / maxX, mapH / maxY);
  const offsetX = (mapW - maxX * scale) / 2;
  const offsetY = (mapH - maxY * scale) / 2;
  
  minimapSvg.setAttribute('viewBox', `0 0 ${mapW} ${mapH}`);
  minimapSvg.innerHTML = '';
  minimapState = { maxX, maxY, mapW, mapH, scale, offsetX, offsetY };
  
  for (const p of data.people) {
    if (!visible.has(p.id)) continue;
    for (const partnerId of partnerIds(p)) {
      if (!(p.id < partnerId) || !visible.has(partnerId)) continue;
      const q = person(partnerId);
      if (q && visible.has(q.id)) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', offsetX + p.x * scale);
        line.setAttribute('y1', offsetY + p.y * scale);
        line.setAttribute('x2', offsetX + q.x * scale);
        line.setAttribute('y2', offsetY + q.y * scale);
        line.setAttribute('class', 'line');
        minimapSvg.appendChild(line);
      }
    }
    for (const pid of p.parents || []) {
      const q = person(pid);
      if (q && visible.has(q.id)) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', offsetX + q.x * scale);
        line.setAttribute('y1', offsetY + q.y * scale);
        line.setAttribute('x2', offsetX + p.x * scale);
        line.setAttribute('y2', offsetY + p.y * scale);
        line.setAttribute('class', 'line');
        minimapSvg.appendChild(line);
      }
    }
  }
  
  for (const p of data.people) {
    if (!visible.has(p.id)) continue;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', offsetX + p.x * scale);
    circle.setAttribute('cy', offsetY + p.y * scale);
    circle.setAttribute('r', Math.max(1.5, 4 * scale));
    circle.setAttribute('class', 'node');
    minimapSvg.appendChild(circle);
  }
  
  updateMinimapViewport();
}
function updateMinimapViewport() {
  if (!minimapState || !minimapViewport) return;

  const { maxX, maxY, scale, offsetX, offsetY } = minimapState;
  const rect = main.getBoundingClientRect();
  const topLeft = screenToWorld(rect.left, rect.top);
  const bottomRight = screenToWorld(rect.right, rect.bottom);
  const viewX = Math.max(0, topLeft.x);
  const viewY = Math.max(0, topLeft.y);
  const viewW = Math.max(0, Math.min(maxX, bottomRight.x) - viewX);
  const viewH = Math.max(0, Math.min(maxY, bottomRight.y) - viewY);
  
  const left = offsetX + viewX * scale;
  const top = offsetY + viewY * scale;
  const width = Math.max(6, viewW * scale);
  const height = Math.max(6, viewH * scale);
  minimapViewport.style.left = `${left}px`;
  minimapViewport.style.top = `${top}px`;
  minimapViewport.style.width = `${width}px`;
  minimapViewport.style.height = `${height}px`;
}
function scheduleRender() {
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(() => {
    renderFrame = null;
    render();
  });
}
function screenToWorld(clientX, clientY) {
  const r = main.getBoundingClientRect();
  return {
    x: (clientX - r.left - r.width / 2 - view.x) / view.s,
    y: (clientY - r.top - r.height / 2 - view.y) / view.s
  };
}

function addLine(x1, y1, x2, y2, cls, color = '') {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const mid = (y1 + y2) / 2;
  path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`);
  path.setAttribute('class', cls);
  if (color) path.style.setProperty('--line-color', color);
  lines.appendChild(path);
}
function addDot(x, y, cls, color = '') {
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', x);
  circle.setAttribute('cy', y);
  circle.setAttribute('r', 8);
  circle.setAttribute('class', cls);
  if (color) circle.style.setProperty('--line-color', color);
  lines.appendChild(circle);
}
function lineageFamilyKey(p) {
  return String(p?.birthName || p?.lastName || surnameOf(p?.name) || '').trim().toLowerCase();
}
function lineageColorFor(people) {
  const source = people.find(p => lineageFamilyKey(p)) || people[0];
  return familyColor(lineageFamilyKey(source) || familyKey(source));
}
function isStemBridge(child, parents = []) {
  const childLineage = lineageFamilyKey(child);
  const currentFamily = familyKey(child);
  if (childLineage && currentFamily && childLineage !== currentFamily) return true;
  return parents.some(parent => familyKey(parent) !== currentFamily && lineageFamilyKey(parent) !== currentFamily);
}
function parentGroupKey(ids) {
  return [...ids].sort().join('|');
}
function parentGroupPoint(parents, children) {
  const parentX = parents.reduce((sum, p) => sum + p.x, 0) / parents.length;
  const parentY = parents.reduce((sum, p) => sum + p.y, 0) / parents.length;
  const firstChildY = Math.min(...children.map(c => c.y));
  const hubY = Math.min(parentY + 78, firstChildY - 72);
  return { x: parentX, y: Math.max(parentY + 34, hubY) };
}
function renderFamilyLines(visible) {
  const groups = new Map();

  for (const child of data.people) {
    if (!visible.has(child.id)) continue;
    const parents = (child.parents || []).map(person).filter(p => p && visible.has(p.id));
    if (!parents.length) continue;

    if (parents.length === 1) {
      const parent = parents[0];
      const color = lineageColorFor([parent, child]);
      const bridge = isStemBridge(child, parents) ? ' stemBridge' : '';
      addLine(parent.x, parent.y + 38, child.x, child.y - 46, `line childLine lineageLine singleParentLine${bridge}`, color);
      continue;
    }

    const key = parentGroupKey(parents.map(p => p.id));
    const group = groups.get(key) || { parents, children: [] };
    group.children.push(child);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const hub = parentGroupPoint(group.parents, group.children);
    const parentMidX = group.parents.reduce((sum, p) => sum + p.x, 0) / group.parents.length;
    const parentMidY = group.parents.reduce((sum, p) => sum + p.y, 0) / group.parents.length;
    const color = lineageColorFor(group.parents);
    addLine(parentMidX, parentMidY + 28, hub.x, hub.y, 'line familyStem lineageLine', color);
    addDot(hub.x, hub.y, 'familyHub', color);
    for (const child of group.children) {
      const bridge = isStemBridge(child, group.parents) ? ' stemBridge' : '';
      addLine(hub.x, hub.y, child.x, child.y - 46, `line childLine lineageLine${bridge}`, color);
    }
  }
}

function familyStats() {
  const stats = new Map();
  for (const p of data.people) {
    const key = familyKey(p);
    const label = familyLabel(p);
    const item = stats.get(key) || { key, label, count: 0, people: [] };
    item.count++;
    item.people.push(p);
    stats.set(key, item);
  }

  return [...stats.values()]
    .sort((a,b) => b.count - a.count || a.label.localeCompare(b.label));
}

function fitPeople(people, minScale = 0.58) {
  if (!people.length) return;
  const xs = people.map(p => p.x);
  const ys = people.map(p => p.y);
  const minX = Math.min(...xs) - 230, maxX = Math.max(...xs) + 230;
  const minY = Math.min(...ys) - 180, maxY = Math.max(...ys) + 180;
  const fitScale = Math.min(main.clientWidth / (maxX - minX), main.clientHeight / (maxY - minY));
  view.s = Math.max(minScale, Math.min(1.4, fitScale));
  view.x = -((minX + maxX) / 2) * view.s;
  view.y = -((minY + maxY) / 2) * view.s;
  applyView();
}

function jumpToFamily(key) {
  activeFamily = key || '';
  const people = activeFamily ? data.people.filter(p => matchesFamily(p, activeFamily)) : [];
  if (people.length) selected = people[0].id;
  render();
  if (people.length) {
    fitPeople(people);
  } else {
    fit();
  }
  renderNavigator();
}
function buildExportSvg() {
  const ids = visibleIds();
  const people = data.people.filter(p => ids.has(p.id));
  if (!people.length) return null;
  const xs = people.map(p => p.x);
  const ys = people.map(p => p.y);
  const minX = Math.min(...xs) - 260, minY = Math.min(...ys) - 220;
  const maxX = Math.max(...xs) + 260, maxY = Math.max(...ys) + 220;
  const w = maxX - minX, h = maxY - minY;
  const node = p => {
    const x = p.x - minX, y = p.y - minY;
    const color = familyColor(familyKey(p));
    return `<g transform="translate(${x-85},${y-42})"><rect width="170" height="84" rx="18" fill="#fffaf0" stroke="${color}" stroke-width="2"/><circle cx="27" cy="28" r="17" fill="${color}"/><text x="27" y="33" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${esc(initials(fullName(p)||p.name))}</text><text x="52" y="28" font-size="14" font-weight="700" fill="#2f2a24">${esc(visibleName(p)).slice(0,24)}</text><text x="52" y="46" font-size="11" fill="#7b7166">${esc(p.born || '')}</text></g>`;
  };
  const line = (a,b,cls='') => `<line x1="${a.x-minX}" y1="${a.y-minY}" x2="${b.x-minX}" y2="${b.y-minY}" stroke="#9d7c52" stroke-width="${cls==='partner'?2:3}" opacity="${cls==='partner'?0.45:0.62}" stroke-dasharray="${cls==='partner'?'8 8':''}"/>`;
  let svgLines = '';
  for (const p of people) {
    for (const partnerId of partnerIds(p)) {
      if (p.id < partnerId && ids.has(partnerId)) svgLines += line(p, person(partnerId), 'partner');
    }
    for (const pid of p.parents || []) {
      const q = person(pid);
      if (q && ids.has(q.id)) svgLines += line(q, p);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}" viewBox="0 0 ${Math.round(w)} ${Math.round(h)}"><rect width="100%" height="100%" fill="#f6f2ea"/><g>${svgLines}</g><g>${people.map(node).join('')}</g></svg>`;
  return { svg, w: Math.round(w), h: Math.round(h) };
}
function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
function exportSvgView() {
  const output = buildExportSvg();
  if (!output) return;
  downloadBlob(new Blob([output.svg], { type:'image/svg+xml' }), 'stammbaum-ansicht.svg');
}
function exportPngView(scaleChoice = '') {
  const output = buildExportSvg();
  if (!output) return;
  const blob = new Blob([output.svg], { type:'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const requestedScale = Number.parseFloat(String(scaleChoice).replace(',', '.'));
    const baseScale = Number.isFinite(requestedScale) && requestedScale > 0 ? requestedScale : 3;
    const maxEdgeScale = 8192 / Math.max(output.w, output.h);
    const maxPixelScale = Math.sqrt(36000000 / Math.max(1, output.w * output.h));
    const scale = Math.max(0.5, Math.min(baseScale, maxEdgeScale, maxPixelScale));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(output.w * scale);
    canvas.height = Math.round(output.h * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob(png => {
      if (png) downloadBlob(png, 'stammbaum-ansicht.png');
    }, 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert('PNG-Export konnte nicht erstellt werden. SVG-Export bleibt verfügbar.');
  };
  img.src = url;
}
function exportImageView() {
  const format = prompt('Bildformat: png oder svg', 'png');
  if (!format) return;
  if (format.trim().toLowerCase().startsWith('s')) exportSvgView();
  else {
    const scale = prompt('PNG-Qualität: 2, 3 oder 4', '3');
    if (scale === null) return;
    exportPngView(scale);
  }
}

function saveCollapsed(){ localStorage.setItem(storeKey + '-collapsed', JSON.stringify([...collapsed])); }
function descendantsOf(id){
  const out = new Set();
  let changed = true;

  while(changed){
    changed = false;

    for(const p of data.people){
      if(out.has(p.id)) continue;

      const parents = p.parents || [];
      const isDescendant =
        parents.includes(id) ||
        parents.some(pid => out.has(pid));

      if(isDescendant){
        out.add(p.id);

        for (const partnerId of partnerIds(p)) {
          const partner = person(partnerId);
          if (partner && (!partner.parents || partner.parents.length === 0)) {
            out.add(partner.id);
          }
        }

        changed = true;
      }
    }
  }

  return out;
}
function hiddenIds(){
  const hidden=new Set();
  for(const id of collapsed){
    for(const d of descendantsOf(id)) hidden.add(d);
  }
  return hidden;
}
function hasChildren(id){
  return data.people.some(p=>(p.parents||[]).includes(id));
}
function depthMap(){
  const byId = new Map(data.people.map(p => [p.id, p]));
  const memo = new Map();
  const depthOf = (id, seen = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (seen.has(id)) return 0;
    const p = byId.get(id);
    if (!p) return 0;
    seen.add(id);
    const parents = (p.parents || []).filter(pid => byId.has(pid));
    const d = parents.length
      ? Math.max(...parents.map(pid => depthOf(pid, new Set(seen)))) + 1
      : 0;
    memo.set(id, d);
    return d;
  };
  data.people.forEach(p => depthOf(p.id));
  return memo;
}
function focusNeighborhood(id) {
  const base = person(id);
  if (!base) return new Set();

  const ids = new Set([id]);
  const parents = new Set(base.parents || []);
  const childIds = new Set();
  parents.forEach(pid => ids.add(pid));
  partnerIds(base).forEach(pid => ids.add(pid));

  for (const p of data.people) {
    const pParents = p.parents || [];
    const isSibling = p.id !== id && pParents.some(pid => parents.has(pid));
    const isChild = pParents.includes(id) || partnerIds(base).some(pid => pParents.includes(pid));
    if (isSibling || isChild) {
      ids.add(p.id);
      partnerIds(p).forEach(pid => ids.add(pid));
    }
    if (isChild) childIds.add(p.id);
  }

  for (const p of data.people) {
    if ((p.parents || []).some(pid => childIds.has(pid))) ids.add(p.id);
  }

  return ids;
}
function visibleIds() {
  const hidden = hiddenIds();
  const focused = focusMode && focusId ? focusNeighborhood(focusId) : null;
  return new Set(data.people
    .filter(p => !hidden.has(p.id) && (!focused || focused.has(p.id)))
    .map(p => p.id));
}
function directLineIds(id) {
  const ids = new Set();
  const root = person(id);
  if (!root) return ids;

  const walkAncestors = pid => {
    if (!pid || ids.has(pid)) return;
    ids.add(pid);
    const p = person(pid);
    (p?.parents || []).forEach(walkAncestors);
  };
  const walkDescendants = pid => {
    if (!pid || ids.has(pid)) return;
    ids.add(pid);
    data.people
      .filter(p => (p.parents || []).includes(pid))
      .forEach(child => walkDescendants(child.id));
  };

  walkAncestors(id);
  walkDescendants(id);
  return ids;
}
function updateModeUI() {
  document.body.classList.toggle('editMode', editMode);
  document.body.classList.toggle('viewMode', !editMode);
  const btn = $('modeBtn');
  if (btn) {
    btn.textContent = editMode ? 'Ansehen' : 'Bearbeiten';
    btn.setAttribute('aria-pressed', editMode ? 'true' : 'false');
    btn.classList.add('primary');
  }
  $('addBtn')?.classList.toggle('hidden', !editMode);
}
function currentViewPreset() {
  if (compactMode && nameMode === 'initials') return 'initials';
  if (compactMode) return 'compact';
  if (nameMode === 'full') return 'detail';
  return 'short';
}
function setViewPreset(preset) {
  compactMode = preset === 'compact' || preset === 'initials';
  nameMode = preset === 'detail' ? 'full' : preset === 'initials' ? 'initials' : 'short';
}
function cycleViewPreset() {
  const order = ['short', 'detail', 'compact', 'initials'];
  const next = order[(order.indexOf(currentViewPreset()) + 1) % order.length];
  setViewPreset(next);
  updateNameModeButton();
  render();
}
function updateNameModeButton() {
  const labels = { short: 'Kurz', detail: 'Detail', compact: 'Kompakt', initials: 'Initialen' };
  const btn = $('nameModeBtn');
  if (btn) btn.textContent = `Ansicht: ${labels[currentViewPreset()]}`;
}
function updateLayoutButton() {
  const labels = { classic: 'Klassisch', tree: 'Baum', radial: 'Radial' };
  const btn = $('layoutBtn');
  if (btn) btn.textContent = `Layout: ${labels[layoutMode]}`;
}
function updateRootButton() {
  const btn = $('rootBtn');
  if (!btn) return;
  btn.textContent = rootId ? 'Start*' : 'Start';
  btn.classList.toggle('primary', !!rootId);
}
function zoomClass() {
  if (view.s < 0.12) return ' mini';
  if (view.s < 0.32) return ' zoomCompact';
  return '';
}
function updateZoomClass() {
  world.classList.toggle('zoomMini', view.s < 0.12);
  world.classList.toggle('zoomCompactLevel', view.s >= 0.12 && view.s < 0.32);
}
function updateFocusButton() {
  const btn = $('focusBtn');
  if (!btn) return;
  btn.textContent = focusMode ? 'Alle' : 'Fokus';
  btn.classList.toggle('primary', focusMode);
}
function setFocusMode(enabled, id = selected || focusId) {
  focusMode = !!enabled && !!id && !!person(id);
  focusId = focusMode ? id : null;
  updateFocusButton();
  render();
  fit();
}
function captureClassicPositions() {
  if (!savedClassicPositions) {
    savedClassicPositions = new Map(data.people.map(p => [p.id, { x: p.x, y: p.y }]));
  }
}
function restoreClassicPositions() {
  if (!savedClassicPositions) return;
  for (const p of data.people) {
    const pos = savedClassicPositions.get(p.id);
    if (pos) { p.x = pos.x; p.y = pos.y; }
  }
}
function relationComponents() {
  const ids = data.people.map(p => p.id);
  const byId = new Map(data.people.map(p => [p.id, p]));
  const links = new Map(ids.map(id => [id, new Set()]));

  const link = (a, b) => {
    if (!byId.has(a) || !byId.has(b)) return;
    links.get(a).add(b);
    links.get(b).add(a);
  };

  for (const p of data.people) {
    partnerIds(p).forEach(partnerId => link(p.id, partnerId));
    for (const pid of p.parents || []) link(p.id, pid);
  }

  const seen = new Set();
  const components = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const stack = [id];
    const component = [];
    seen.add(id);
    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      for (const next of links.get(current) || []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    components.push(component);
  }

  return components.sort((a,b) => {
    const ax = Math.min(...a.map(id => byId.get(id)?.x ?? 0));
    const bx = Math.min(...b.map(id => byId.get(id)?.x ?? 0));
    return ax - bx;
  });
}
function componentDepths(ids) {
  const idSet = new Set(ids);
  const byId = new Map(data.people.map(p => [p.id, p]));
  const depths = new Map();
  let roots = ids
    .map(id => byId.get(id))
    .filter(Boolean)
    .filter(p => !(p.parents || []).some(pid => idSet.has(pid)));

  if (!roots.length) {
    roots = ids
      .map(id => byId.get(id))
      .filter(Boolean)
      .sort((a,b) => (a.x - b.x) || fullName(a).localeCompare(fullName(b)))
      .slice(0, 1);
  }

  const queue = [];
  for (const root of roots) {
    depths.set(root.id, 0);
    queue.push(root.id);
    for (const partnerId of partnerIds(root)) {
      if (idSet.has(partnerId) && !depths.has(partnerId)) {
        depths.set(partnerId, 0);
        queue.push(partnerId);
      }
    }
  }

  while (queue.length) {
    const id = queue.shift();
    const p = byId.get(id);
    const depth = depths.get(id) || 0;
    if (!p) continue;

    for (const partnerId of partnerIds(p)) {
      if (idSet.has(partnerId) && (!depths.has(partnerId) || depths.get(partnerId) > depth)) {
        depths.set(partnerId, depth);
        queue.push(partnerId);
      }
    }

    for (const child of data.people) {
      if (!idSet.has(child.id) || !(child.parents || []).includes(id)) continue;
      const nextDepth = depth + 1;
      if (!depths.has(child.id) || depths.get(child.id) > nextDepth) {
        depths.set(child.id, nextDepth);
        queue.push(child.id);
      }
    }
  }

  for (const id of ids) {
    if (!depths.has(id)) depths.set(id, 0);
  }
  return depths;
}
function applyTreeLayout() {
  autoLayout(false);
  if (!data.people.length) return;

  const top = 130;
  const ys = data.people.map(p => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  for (const p of data.people) {
    p.y = Math.round(top + (maxY - p.y) + (minY - top));
  }
}
function applyRadialLayout() {
  autoLayout(false);
  const byId = new Map(data.people.map(p => [p.id, p]));
  const components = relationComponents();
  const packed = [];
  const maxRowWidth = 4200;
  let cursorX = 520;
  let cursorY = 520;
  let rowHeight = 0;

  for (const ids of components) {
    const depths = componentDepths(ids);
    const rings = new Map();
    for (const id of ids) {
      const depth = depths.get(id) || 0;
      if (!rings.has(depth)) rings.set(depth, []);
      rings.get(depth).push(byId.get(id));
    }

    let maxRadius = 180;
    for (const [depth, people] of rings.entries()) {
      const ringRadius = depth === 0
        ? (people.length > 1 ? Math.max(70, people.length * 28) : 0)
        : Math.max(170 + depth * 230, people.length * 46);
      maxRadius = Math.max(maxRadius, ringRadius);
    }

    const size = maxRadius * 2 + 260;
    if (packed.length && cursorX + size > maxRowWidth) {
      cursorX = 520;
      cursorY += rowHeight + 320;
      rowHeight = 0;
    }
    packed.push({ ids, depths, rings, cx: cursorX + size / 2, cy: cursorY + maxRadius + 130, size, maxRadius });
    cursorX += size + 300;
    rowHeight = Math.max(rowHeight, size);
  }

  for (const island of packed) {
    const ringEntries = [...island.rings.entries()].sort((a,b) => a[0] - b[0]);
    for (const [depth, people] of ringEntries) {
      people.sort((a,b) => (a.x - b.x) || fullName(a).localeCompare(fullName(b)));
      const radius = depth === 0
        ? (people.length > 1 ? Math.max(70, people.length * 28) : 0)
        : Math.max(170 + depth * 230, people.length * 46);
      const start = -Math.PI / 2;
      people.forEach((p, i) => {
        if (!p) return;
        const angle = start + (Math.PI * 2 * i / Math.max(1, people.length));
        p.x = Math.round(island.cx + Math.cos(angle) * radius);
        p.y = Math.round(island.cy + Math.sin(angle) * radius);
      });
    }
  }
}
function setLayoutMode(next) {
  if (next !== 'classic') {
    captureClassicPositions();
    restoreClassicPositions();
  }
  layoutMode = next;
  if (layoutMode === 'classic') restoreClassicPositions();
  if (layoutMode === 'tree') applyTreeLayout();
  if (layoutMode === 'radial') applyRadialLayout();
  updateLayoutButton();
  render();
  fit();
}
function cycleLayoutMode() {
  const order = ['classic', 'tree', 'radial'];
  setLayoutMode(order[(order.indexOf(layoutMode) + 1) % order.length]);
}
function personTileContent(p, className = '') {
  const dates = [p.born, p.died && '– ' + p.died].filter(Boolean).join(' ');
  const birth = birthNameDiffers(p) ? ` <span class="birthInfo">(geb. ${esc(p.birthName)})</span>` : '';
  const meta = dates || birth ? `<div class="meta">${esc(dates)}${birth}</div>` : '';
  const tags = p.note ? `<div class="tags"><span class="tag">${esc(p.note).slice(0,22)}</span></div>` : '';
  const display = visibleName(p);
  const title = fullName(p) !== display ? ` title="${esc(fullName(p))}"` : '';
  const cls = className ? ` class="${className}"` : '';
  return `<div${cls} data-member-id="${esc(p.id)}"><div class="avatar">${esc(initials(display))}</div><h3${title}>${esc(display)}</h3>${meta}${tags}</div>`;
}

// -- Rendering ---------------------------------------------------------
function render() {
  updateWorldBounds();
  updateZoomClass();
  const visible = visibleIds();
  const directIds = rootId ? directLineIds(rootId) : new Set();
  const zClass = zoomClass();
  nodes.innerHTML = '';
  lines.innerHTML = '';
  if (generationBands) generationBands.innerHTML = '';

  for (const p of data.people) {
    if(!visible.has(p.id)) continue;
    if (editMode) {
      for (const partnerId of partnerIds(p)) {
        if (!(p.id < partnerId) || !visible.has(partnerId)) continue;
        const q = person(partnerId);
        if (q && visible.has(q.id)) addLine(p.x, p.y, q.x, q.y, 'line partner');
      }
    }
  }

  renderFamilyLines(visible);

  const renderedPairs = new Set();
  const renderedCoupleMembers = new Set();
  for (const p of data.people) {
    if(!visible.has(p.id)) continue;
    if (renderedCoupleMembers.has(p.id)) continue;
    const partner = !editMode ? person(mutualPartnerIds(p).find(id => visible.has(id) && !renderedCoupleMembers.has(id))) : null;
    const isCouple = !editMode && partner && visible.has(partner.id);
    if (isCouple) {
      const pairKey = [p.id, partner.id].sort().join('|');
      if (renderedPairs.has(pairKey)) continue;
      renderedPairs.add(pairKey);
      renderedCoupleMembers.add(p.id);
      renderedCoupleMembers.add(partner.id);
      const pair = [p, partner].sort((a,b) => a.x - b.x || a.id.localeCompare(b.id));
      const [a, b] = pair;
      const el = document.createElement('div');
      const collapseId = hasChildren(a.id) ? a.id : hasChildren(b.id) ? b.id : '';
      const key = familyKey(a);
      const familyMuted = activeFamily && !pair.some(member => matchesFamily(member, activeFamily));
      const sideLine = rootId && !pair.some(member => directIds.has(member.id));
      el.className = 'person couplePerson' + zClass + (compactMode ? ' compact' : '') + (pair.some(member => selected === member.id) ? ' selected' : '') + (pair.some(member => focusMode && focusId === member.id) ? ' focusRoot' : '') + (pair.some(member => rootId === member.id) ? ' rootPerson' : '') + (pair.some(member => directIds.has(member.id)) ? ' directPerson' : '') + (sideLine ? ' sidePerson' : '') + (pair.some(member => spotlightId === member.id) ? ' spotlight' : '') + (familyMuted ? ' familyMuted' : '') + (collapseId && collapsed.has(collapseId) ? ' collapsed' : '');
      el.style.left = Math.round((a.x + b.x) / 2) + 'px';
      el.style.top = Math.round((a.y + b.y) / 2) + 'px';
      el.style.setProperty('--family-color', familyColor(key));
      el.style.setProperty('--partner-color', familyColor(familyKey(b)));
      el.dataset.id = a.id;
      el.innerHTML = `<div class="coupleMembers">${personTileContent(a, 'coupleMember')}${personTileContent(b, 'coupleMember')}</div>${collapseId ? `<button class="collapseBtn" title="Ast ein-/ausklappen">${collapsed.has(collapseId)?'+' : '−'}</button>` : ''}`;
      el.addEventListener('click', e => {
        e.stopPropagation();
        if (Date.now() < suppressOpenUntil) return;
        const member = e.target.closest('[data-member-id]');
        selected = member?.dataset.memberId || a.id;
        openSheet(selected);
      });
      el.addEventListener('touchend', e => {
        if (Date.now() < suppressOpenUntil) return;
        e.preventDefault();
        e.stopPropagation();
        const member = e.target.closest('[data-member-id]');
        selected = member?.dataset.memberId || a.id;
        openSheet(selected);
      }, { passive:false });
      const cb = el.querySelector('.collapseBtn');
      if(cb){
        const toggleCollapse = ev => {
          ev.preventDefault();
          ev.stopPropagation();
          suppressOpenUntil = Date.now() + 500;
          if(collapsed.has(collapseId)) collapsed.delete(collapseId); else collapsed.add(collapseId);
          saveCollapsed();
          render();
          fit();
        };
        cb.addEventListener('pointerdown', ev=>{ev.preventDefault();ev.stopPropagation();}, {passive:false});
        cb.addEventListener('click', toggleCollapse);
        cb.addEventListener('touchend', toggleCollapse, {passive:false});
      }
      nodes.appendChild(el);
      continue;
    }
    const el = document.createElement('div');
    const canCollapse = hasChildren(p.id);
    const key = familyKey(p);
    const familyMuted = activeFamily && !matchesFamily(p, activeFamily);
    const sideLine = rootId && !directIds.has(p.id);
    el.className = 'person' + zClass + (compactMode ? ' compact' : '') + (selected === p.id ? ' selected' : '') + (focusMode && focusId === p.id ? ' focusRoot' : '') + (rootId === p.id ? ' rootPerson' : '') + (directIds.has(p.id) ? ' directPerson' : '') + (sideLine ? ' sidePerson' : '') + (spotlightId === p.id ? ' spotlight' : '') + (familyMuted ? ' familyMuted' : '') + (collapsed.has(p.id) ? ' collapsed' : '');
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.style.setProperty('--family-color', familyColor(key));
    el.dataset.id = p.id;

    el.innerHTML = `${personTileContent(p)}${canCollapse ? `<button class="collapseBtn" title="Ast ein-/ausklappen">${collapsed.has(p.id)?'+' : '−'}</button>` : ''}`;

    el.addEventListener('pointerdown', onNodePointerDown);
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (Date.now() < suppressOpenUntil) return;
      selected = p.id;
      openSheet(p.id);
    });
    el.addEventListener('touchend', e => {
      if (Date.now() < suppressOpenUntil) return;
      if (!drag || (drag.id === p.id && !drag.moved)) {
        e.preventDefault();
        e.stopPropagation();
        drag = null;
        selected = p.id;
        openSheet(p.id);
      }
    }, { passive:false });
    const cb = el.querySelector('.collapseBtn');
    if(cb){
      const toggleCollapse = ev => {
        ev.preventDefault();
        ev.stopPropagation();
        drag = null;
        suppressOpenUntil = Date.now() + 500;
        if(collapsed.has(p.id)) collapsed.delete(p.id); else collapsed.add(p.id);
        saveCollapsed();
        render();
        fit();
      };
      cb.addEventListener('pointerdown', ev=>{ev.preventDefault();ev.stopPropagation();}, {passive:false});
      cb.addEventListener('click', toggleCollapse);
      cb.addEventListener('touchend', toggleCollapse, {passive:false});
    }
    nodes.appendChild(el);
  }
}
function renderGenerationBands(visible) {
  const ys = data.people
    .filter(p => visible.has(p.id))
    .map(p => p.y)
    .sort((a,b) => a - b);

  const rows = [];
  for (const y of ys) {
    const last = rows[rows.length - 1];
    if (!last || Math.abs(y - last.center) > 96) {
      rows.push({ center: y, values: [y] });
    } else {
      last.values.push(y);
      last.center = last.values.reduce((sum, v) => sum + v, 0) / last.values.length;
    }
  }

  generationBands.innerHTML = rows
    .map((row, index) => {
      const y = row.values.sort((a,b) => a - b)[Math.floor(row.values.length / 2)];
      return `<div class="generationBand" style="top:${Math.round(y - 76)}px"><span>Ebene ${index + 1}</span></div>`;
    }).join('');
}

// -- Interaction / drag & pan ------------------------------------------
function onNodePointerDown(e) {
  e.stopPropagation();
  if (!editMode) return;
  const id = e.currentTarget.dataset.id;
  const p = person(id);
  if (!p) return;
  selected = id;
  drag = { id, sx: e.clientX, sy: e.clientY, px: p.x, py: p.y, moved: false };
}

window.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = person(drag.id);
  if (!p) return;
  const dx = (e.clientX - drag.sx) / view.s;
  const dy = (e.clientY - drag.sy) / view.s;
  if (Math.abs(dx) + Math.abs(dy) > 7) drag.moved = true;
  if (drag.moved) {
    p.x = drag.px + dx;
    p.y = drag.py + dy;
    scheduleRender();
  }
});

window.addEventListener('pointerup', e => {
  if (!drag) return;
  const id = drag.id;
  const moved = drag.moved;
  drag = null;
  if (moved) {
    if (renderFrame) {
      cancelAnimationFrame(renderFrame);
      renderFrame = null;
    }
    save();
    render();
    suppressOpenUntil = Date.now() + 450;
    return;
  }
  selected = id;
  openSheet(id);
});

const interactiveSelector = '.person,.sheet,.sideNav,.searchSheet,.checkSheet,.birthdaySheet,.scrollSheet,.listSheet,button,input,select,textarea,label';

main.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') return;
  if (e.target.closest(interactiveSelector)) return;
  selection = null;
  selectionRect.classList.add('hidden');
  main.setPointerCapture?.(e.pointerId);
  if (e.shiftKey) {
    selection = { sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY };
    selectionRect.classList.remove('hidden');
    selectionRect.style.left = `${e.clientX}px`;
    selectionRect.style.top = `${e.clientY}px`;
    selectionRect.style.width = '0px';
    selectionRect.style.height = '0px';
    pan = null;
    clearTimeout(longPressTimer);
    return;
  }

  pan = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };

  clearTimeout(longPressTimer);
});

main.addEventListener('pointermove', e => {
  if (selection) {
    selection.x = e.clientX;
    selection.y = e.clientY;
    const x = Math.min(selection.sx, selection.x);
    const y = Math.min(selection.sy, selection.y);
    const w = Math.abs(selection.x - selection.sx);
    const h = Math.abs(selection.y - selection.sy);
    selectionRect.style.left = `${x}px`;
    selectionRect.style.top = `${y}px`;
    selectionRect.style.width = `${w}px`;
    selectionRect.style.height = `${h}px`;
    return;
  }
  if (!pan) return;
  const dx = e.clientX - pan.sx;
  const dy = e.clientY - pan.sy;
  if (Math.abs(dx) + Math.abs(dy) > 10) {
    pan.moved = true;
    clearTimeout(longPressTimer);
  }
  view.x = pan.vx + dx;
  view.y = pan.vy + dy;
  applyView();
});
window.addEventListener('pointerup', e => {
  clearTimeout(longPressTimer);
  main.releasePointerCapture?.(e.pointerId);
  if (selection) {
    const rect = selectionRect.getBoundingClientRect();
    selectionRect.classList.add('hidden');
    const width = rect.width;
    const height = rect.height;
    selection = null;
    if (width > 12 && height > 12) {
      const ratio = Math.min(main.clientWidth / width, main.clientHeight / height) * 0.88;
      zoomTo(Math.max(minZoom, Math.min(maxZoom, view.s * ratio)), rect.left + width / 2, rect.top + height / 2);
    }
    pan = null;
    return;
  }
  if (!drag) {
    pan = null;
    return;
  }
  const id = drag.id;
  const moved = drag.moved;
  drag = null;
  if (moved) {
    if (renderFrame) {
      cancelAnimationFrame(renderFrame);
      renderFrame = null;
    }
    save();
    render();
    suppressOpenUntil = Date.now() + 450;
    return;
  }
  selected = id;
  openSheet(id);
});
window.addEventListener('pointercancel', e => { clearTimeout(longPressTimer); main.releasePointerCapture?.(e.pointerId); pan = null; drag = null; selection = null; selectionRect.classList.add('hidden'); });

// -- Touch / pointer helpers -------------------------------------------
function isInteractiveTarget(t) {
  return !!(t && t.closest && t.closest(interactiveSelector));
}

let touchLong = null;
main.addEventListener('touchstart', e => {
  if (isInteractiveTarget(e.target)) return;
  if (e.touches.length !== 1) return;
  const t = e.touches[0];
  touchLong = { x:t.clientX, y:t.clientY, vx:view.x, vy:view.y, moved:false };
  clearTimeout(longPressTimer);
}, { passive:true });

main.addEventListener('touchmove', e => {
  if (!touchLong || e.touches.length !== 1) return;
  e.preventDefault();
  const t = e.touches[0];
  const dx = t.clientX - touchLong.x;
  const dy = t.clientY - touchLong.y;
  if (Math.abs(dx) + Math.abs(dy) > 12) {
    touchLong.moved = true;
    clearTimeout(longPressTimer);
  }
  if (touchLong.moved) {
    view.x = touchLong.vx + dx;
    view.y = touchLong.vy + dy;
    applyView();
  }
}, { passive:false });

main.addEventListener('touchend', () => {
  clearTimeout(longPressTimer);
  touchLong = null;
}, { passive:true });

main.addEventListener('wheel', e => {
  if (e.target.closest(interactiveSelector)) return;
  e.preventDefault();
  const ratio = e.deltaY > 0 ? 1 / 1.14 : 1.14;
  zoomTo(view.s * ratio, e.clientX, e.clientY);
}, { passive:false });

main.addEventListener('contextmenu', e => {
  if (isInteractiveTarget(e.target)) return;
  e.preventDefault();
  if (!editMode) return;
  pendingNewPos = screenToWorld(e.clientX, e.clientY);
  selected = null;
  openSheet(null);
});

function distance(a,b){ return Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY); }
function midpoint(a,b){ return {x:(a.clientX+b.clientX)/2, y:(a.clientY+b.clientY)/2}; }

main.addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    clearTimeout(longPressTimer);
    touchLong = null;
    drag = null;
    pan = null;
    const a = e.touches[0], b = e.touches[1];
    pinch = {
      d: distance(a,b),
      s: view.s,
      x: view.x,
      y: view.y,
      mid: midpoint(a,b)
    };
  }
}, { passive:true });

main.addEventListener('touchmove', e => {
  if (!pinch || e.touches.length !== 2) return;
  e.preventDefault();
  const a = e.touches[0], b = e.touches[1];
  const mid = midpoint(a,b);
  const ns = Math.max(minZoom, Math.min(maxZoom, pinch.s * distance(a,b) / Math.max(1, pinch.d)));
  view.x = mid.x - (pinch.mid.x - pinch.x) * (ns / pinch.s);
  view.y = mid.y - (pinch.mid.y - pinch.y) * (ns / pinch.s);
  view.s = ns;
  applyView();
}, { passive:false });

main.addEventListener('touchend', e => {
  if (e.touches.length < 2) pinch = null;
}, { passive:true });

// -- Zoom and fit helpers ---------------------------------------------
function zoomTo(ns, cx = null, cy = null) {
  const rect = main.getBoundingClientRect();
  if (cx === null) cx = rect.left + rect.width / 2;
  if (cy === null) cy = rect.top + rect.height / 2;
  const old = view.s;
  const worldPoint = screenToWorld(cx, cy);
  view.s = Math.max(minZoom, Math.min(maxZoom, ns));
  view.x = cx - (rect.left + rect.width / 2) - worldPoint.x * view.s;
  view.y = cy - (rect.top + rect.height / 2) - worldPoint.y * view.s;
  applyView();
}

function fit() {
  updateWorldBounds();
  const ids = visibleIds();
  const visible = data.people.filter(p=>ids.has(p.id));
  if (!visible.length) return;
  const xs = visible.map(p => p.x);
  const ys = visible.map(p => p.y);
  const minX = Math.min(...xs) - 190, maxX = Math.max(...xs) + 190;
  const minY = Math.min(...ys) - 150, maxY = Math.max(...ys) + 150;
  const w = main.clientWidth, h = main.clientHeight;
  const fitScale = Math.min(w / (maxX - minX), h / (maxY - minY));
  const readableMin = visible.length > 12 ? minFitZoom : 0.22;
  view.s = Math.max(readableMin, Math.min(1.3, fitScale));
  view.x = -((minX + maxX) / 2) * view.s;
  view.y = -((minY + maxY) / 2) * view.s;
  applyView();
}

// -- Birthdate parsing and sorting -------------------------------------
function parseBirthValue(value){
  const s = String(value || '').trim();
  if(!s) return null;

  let m = s.match(/^(\d{4})$/);
  if(m) return {year:+m[1], month:6, day:15, precision:'year', sort:+m[1]*10000+615};

  m = s.match(/^(\d{1,2})[.\-/](\d{4})$/);
  if(m){
    const month = Math.max(1, Math.min(12, +m[1]));
    const year = +m[2];
    return {year, month, day:15, precision:'month', sort:year*10000+month*100+15};
  }

  m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if(m){
    const day = Math.max(1, Math.min(31, +m[1]));
    const month = Math.max(1, Math.min(12, +m[2]));
    const year = +m[3];
    return {year, month, day, precision:'day', sort:year*10000+month*100+day};
  }

  m = s.match(/^(\d{1,2})[.\-/](\d{1,2})\.?$/);
  if(m){
    const day = Math.max(1, Math.min(31, +m[1]));
    const month = Math.max(1, Math.min(12, +m[2]));
    return {year:null, month, day, precision:'birthday', sort:99990000+month*100+day};
  }

  m = s.match(/^(\d{4})[.\-/](\d{1,2})(?:[.\-/](\d{1,2}))?$/);
  if(m){
    const year = +m[1];
    const month = Math.max(1, Math.min(12, +m[2]));
    const day = m[3] ? Math.max(1, Math.min(31, +m[3])) : 15;
    return {year, month, day, precision:m[3]?'day':'month', sort:year*10000+month*100+day};
  }

  return null;
}
function birthSortValue(p){
  const parsed = parseBirthValue(p?.born);
  return parsed ? parsed.sort : null;
}
function birthdayInfo(p) {
  const parsed = parseBirthValue(p?.born);
  if (!parsed || !parsed.month || !parsed.day) return null;
  return parsed;
}
function formatBirthDate(value) {
  const parsed = parseBirthValue(value);
  if (!parsed) return value || '';
  const dd = String(parsed.day).padStart(2, '0');
  const mm = String(parsed.month).padStart(2, '0');
  if (parsed.precision === 'birthday') return `${dd}.${mm}.`;
  if (parsed.precision === 'month') return `${mm}.${parsed.year}`;
  if (parsed.precision === 'year') return String(parsed.year);
  return `${dd}.${mm}.${parsed.year}`;
}
function estimatedGenerationYear(p, depth, siblingIndex){
  const b = birthSortValue(p);
  if(b !== null) return Math.floor(b / 10000);
  return 1850 + depth * 30 + siblingIndex * 2;
}

// -- Automatic layout algorithm ----------------------------------------
function autoLayout(saveResult = true) {
  if (!data.people.length) return;

  const byId = new Map(data.people.map(p => [p.id, p]));
  const childrenOf = new Map(data.people.map(p => [p.id, []]));
  for (const p of data.people) {
    for (const pid of p.parents || []) {
      if (childrenOf.has(pid)) childrenOf.get(pid).push(p);
    }
  }

  const pairGap = 170;
  const nodeGap = 34;
  const parentGroupGap = 78;
  const rootY = 130;
  const startX = 110;
  const minSingle = 156;
  const minPair = 318;
  const fallbackRowGap = 185;
  const memo = new Map();
  const depthMemo = new Map();

  const hasParents = p => (p.parents || []).length > 0;
  const partnerOf = p => partnerIds(p).map(id => byId.get(id)).find(Boolean) || null;
  const unitIds = p => {
    const q = partnerOf(p);
    return q ? [p.id, q.id] : [p.id];
  };
  const belongsToUnit = (child, ids) => {
    const parents = child.parents || [];
    if (!parents.some(pid => ids.includes(pid))) return false;
    if (ids.length === 1) return true;
    return parents.length <= 1 || parents.every(pid => ids.includes(pid));
  };

  function depthOf(p, seen = new Set()){
    if(depthMemo.has(p.id)) return depthMemo.get(p.id);
    if(seen.has(p.id)) return 0;
    seen.add(p.id);
    const parents = (p.parents || []).map(id => byId.get(id)).filter(Boolean);
    const d = parents.length ? Math.max(...parents.map(pp => depthOf(pp, new Set(seen)))) + 1 : 0;
    depthMemo.set(p.id, d);
    return d;
  }

  function childList(ids) {
    const out = [], seen = new Set();
    for (const id of ids) {
      for (const c of childrenOf.get(id) || []) {
        if (!seen.has(c.id) && belongsToUnit(c, ids)) {
          seen.add(c.id);
          out.push(c);
        }
      }
    }

    out.sort((a,b) => {
      const ba = birthSortValue(a);
      const bb = birthSortValue(b);
      if(ba !== null && bb !== null) return ba - bb;
      if(ba !== null) return -1;
      if(bb !== null) return 1;
      return (a.x - b.x) || String(a.name).localeCompare(String(b.name));
    });

    return out;
  }

  function reachableIds(ids) {
    const reached = new Set();
    const stack = [...ids];
    while (stack.length) {
      const id = stack.pop();
      if (!id || reached.has(id)) continue;
      reached.add(id);
      const p = byId.get(id);
      partnerIds(p).forEach(partnerId => { if (!reached.has(partnerId)) stack.push(partnerId); });
      for (const child of childrenOf.get(id) || []) {
        if (!reached.has(child.id)) stack.push(child.id);
      }
    }
    ids.forEach(id => reached.delete(id));
    return reached;
  }

  function subtreeWidth(id, seen = new Set()) {
    if (memo.has(id)) return memo.get(id);
    if (seen.has(id)) return minPair;

    const p = byId.get(id);
    if (!p) return minSingle;
    seen.add(id);

    const ids = unitIds(p);
    const own = ids.length > 1 ? minPair : minSingle;

    if (collapsed.has(id)) {
      memo.set(id, own);
      return own;
    }

    const kids = childList(ids);
    const kidsW = kids.length
      ? kids.reduce((s,k,idx) => {
          const extra = idx > 0 && parentGroupKey(k.parents || []) !== parentGroupKey(kids[idx - 1].parents || []) ? parentGroupGap : 0;
          return s + subtreeWidth(k.id, new Set(seen)) + (idx ? nodeGap + extra : 0);
        }, 0)
      : 0;

    const w = Math.max(own, kidsW);
    memo.set(id, w);
    return w;
  }

  const rootCandidates = [];
  const used = new Set();

  for (const p of data.people) {
    if (hasParents(p) || used.has(p.id)) continue;
    const q = partnerOf(p);
    if (q && hasParents(q)) continue;

    rootCandidates.push(p);
    used.add(p.id);
    if (q && !hasParents(q)) used.add(q.id);
  }

  rootCandidates.sort((a,b) => {
    const au = unitIds(a).filter(id => byId.has(id));
    const bu = unitIds(b).filter(id => byId.has(id));
    const ar = reachableIds(au).size;
    const br = reachableIds(bu).size;
    return br - ar || subtreeWidth(b.id) - subtreeWidth(a.id);
  });

  function yForPerson(p, fallbackDepth, siblingIndex = 0){
    const depth = Number.isFinite(fallbackDepth) ? fallbackDepth : depthOf(p);
    return Math.round(rootY + depth * fallbackRowGap);
  }

  const placed = new Set();

  function place(id, left, fallbackDepth = 0, siblingIndex = 0) {
    const p = byId.get(id);
    if (!p || placed.has(p.id)) return;

    const ids = unitIds(p).filter(x => byId.has(x));
    const width = subtreeWidth(id);
    const center = left + width / 2;

    const partner = ids.length > 1 ? byId.get(ids[1]) : null;
    let y = yForPerson(p, fallbackDepth, siblingIndex);

    if(partner){
      const py = yForPerson(partner, fallbackDepth, siblingIndex);
      if(birthSortValue(p) !== null && birthSortValue(partner) !== null){
        y = Math.round((y + py) / 2);
      }
    }

    if (ids.length > 1) {
      const a = byId.get(ids[0]), b = byId.get(ids[1]);
      a.x = Math.round(center - pairGap / 2); a.y = y;
      b.x = Math.round(center + pairGap / 2); b.y = y;
      placed.add(a.id); placed.add(b.id);
    } else {
      p.x = Math.round(center); p.y = y;
      placed.add(p.id);
    }

    if (collapsed.has(id)) return;

    const kids = childList(ids);
    const total = kids.length
      ? kids.reduce((s,k,idx) => {
          const extra = idx > 0 && parentGroupKey(k.parents || []) !== parentGroupKey(kids[idx - 1].parents || []) ? parentGroupGap : 0;
          return s + subtreeWidth(k.id) + (idx ? nodeGap + extra : 0);
        }, 0)
      : 0;

    let x = left + (width - total) / 2;
    kids.forEach((k, idx) => {
      if (idx > 0 && parentGroupKey(k.parents || []) !== parentGroupKey(kids[idx - 1].parents || [])) x += parentGroupGap;
      const cw = subtreeWidth(k.id);
      place(k.id, x, fallbackDepth + 1, idx);
      x += cw + nodeGap;
    });
  }

  let left = startX;
  rootCandidates.forEach((r, idx) => {
    const w = subtreeWidth(r.id);
    place(r.id, left, 0, idx);
    left += w + 44;
  });

  data.people.forEach((p, idx) => {
    if (placed.has(p.id)) return;
    const w = subtreeWidth(p.id);
    place(p.id, left, depthOf(p), idx);
    left += w + 44;
  });

  if (saveResult) {
    clearGeneratedLayoutState();
    save();
  }
  render();
  fit();
}

// -- Form / editor helpers --------------------------------------------
function suggestParentOrder(currentId, alreadyParentId = '') {
  const cur = person(currentId);
  const curSurname = surnameOf(cur?.name);
  const already = alreadyParentId ? person(alreadyParentId) : null;
  const partner = primaryPartner(already);
  const descendants = currentId ? descendantsOf(currentId) : new Set();

  return data.people
    .filter(p => p.id !== currentId && !descendants.has(p.id))
    .map(p => {
      let score = 0;
      if (partner && p.id === partner.id) score += 1000;
      if (curSurname && surnameOf(p.name) === curSurname) score += 120;
      if (cur?.parents?.includes(p.id)) score += 500;
      if (partnerIds(cur).includes(p.id)) score -= 150;
      return { p, score };
    })
    .sort((a,b) => b.score - a.score || String(a.p.name).localeCompare(String(b.p.name)))
    .map(x => x.p);
}

function fillSelects(
  current,
  selectedParent1 = $('parent1')?.value || '',
  selectedParent2 = $('parent2')?.value || '',
  selectedPartner = $('partner')?.value || ''
) {
  const opt = arr => '<option value="">—</option>' + arr.map(p => `<option value="${esc(p.id)}">${esc(selectPersonLabel(p))}</option>`).join('');
  const partnerOpt = arr => '<option value="">— Partner/in hinzufügen —</option>' + arr.map(p => `<option value="${esc(p.id)}">${esc(selectPersonLabel(p, 'partner'))}</option>`).join('');
  $('parent1').innerHTML = opt(suggestParentOrder(current, ''));
  $('parent1').value = selectedParent1;
  $('parent2').innerHTML = opt(suggestParentOrder(current, selectedParent1));
  $('parent2').value = selectedParent2;
  const existingPartners = new Set(partnerIds(person(current)));
  $('partner').innerHTML = partnerOpt(data.people.filter(p => p.id !== current && !existingPartners.has(p.id)).sort((a,b) => fullName(a).localeCompare(fullName(b))));
  $('partner').value = selectedPartner;
}

function isValidDateInput(value) {
  return !String(value || '').trim() || parseBirthValue(value) !== null;
}

function validatePersonForm(currentId, parents, partnerId, born, died) {
  const errors = [];
  const descendants = currentId ? descendantsOf(currentId) : new Set();

  if (parents.length !== new Set(parents).size) {
    errors.push('Bitte zwei unterschiedliche Elternteile auswählen.');
  }
  if (currentId && parents.includes(currentId)) {
    errors.push('Eine Person kann nicht ihr eigener Elternteil sein.');
  }
  if (currentId && partnerId === currentId) {
    errors.push('Eine Person kann nicht ihr eigener Partner sein.');
  }
  if (partnerId && parents.includes(partnerId)) {
    errors.push('Partner/in und Elternteil dürfen nicht dieselbe Person sein.');
  }
  if (currentId && partnerId && descendants.has(partnerId)) {
    errors.push('Nachkommen können nicht als Partner/in eingetragen werden.');
  }
  if (currentId && parents.some(id => descendants.has(id))) {
    errors.push('Nachkommen können nicht als Elternteil eingetragen werden.');
  }
  if (!isValidDateInput(born)) {
    errors.push('Geburtsdatum bitte als Jahr, MM.JJJJ, TT.MM. oder TT.MM.JJJJ eingeben.');
  }
  if (!isValidDateInput(died)) {
    errors.push('Sterbedatum bitte als Jahr, MM.JJJJ oder TT.MM.JJJJ eingeben.');
  }

  if (errors.length) {
    alert(errors.join('\n'));
    return false;
  }
  return true;
}

function unlinkPartner(id) {
  const p = person(id);
  if (!p) return;
  for (const partnerId of partnerIds(p)) removePartnerLink(p, partnerId, true);
}

function linkPartners(p, q, reciprocal = true) {
  if (!p || !q || p.id === q.id) return;
  addPartnerLink(p, q, reciprocal);
}

function formSnapshot() {
  return JSON.stringify({
    selected: selected || '',
    firstName: $('firstName')?.value || '',
    lastName: $('lastName')?.value || '',
    nickname: $('nickname')?.value || '',
    born: $('born')?.value || '',
    died: $('died')?.value || '',
    birthName: $('birthName')?.value || '',
    note: $('note')?.value || '',
    parent1: $('parent1')?.value || '',
    parent2: $('parent2')?.value || '',
    partner: $('partner')?.value || ''
  });
}

function hasUnsavedSheetChanges() {
  return editMode && $('sheet').classList.contains('open') && formSnapshot() !== sheetSnapshot;
}

function confirmDiscardSheetChanges() {
  if (!hasUnsavedSheetChanges()) return true;
  if (confirm('Änderungen speichern?')) {
    saveSheet();
    return false;
  }
  return confirm('Ohne Speichern schließen?');
}

function relationButtons(people) {
  if (!people.length) return '<span class="detailValue">Offen</span>';
  return `<div class="detailLinks">${people.map(p => `<button type="button" class="detailLink" data-id="${esc(p.id)}">${esc(fullName(p) || p.name)}</button>`).join('')}</div>`;
}

function renderPersonDetails(p) {
  const details = $('personDetails');
  if (!details) return;
  details.classList.toggle('hidden', editMode || !p);
  if (editMode || !p) {
    details.innerHTML = '';
    return;
  }

  const parents = (p.parents || []).map(person).filter(Boolean);
  const partners = partnerIds(p).map(person).filter(Boolean);
  const children = data.people
    .filter(child => (child.parents || []).includes(p.id))
    .sort((a,b) => (birthSortValue(a) ?? Infinity) - (birthSortValue(b) ?? Infinity) || fullName(a).localeCompare(fullName(b)));
  const dates = [
    p.born ? `geb. ${formatBirthDate(p.born)}` : '',
    p.died ? `gest. ${p.died}` : ''
  ].filter(Boolean).join(' · ') || 'Lebensdaten offen';

  details.innerHTML = `
    <div class="detailHero" style="--family-color:${esc(familyColor(familyKey(p)))}">
      <div class="detailAvatar">${esc(initials(fullName(p) || p.name))}</div>
      <div>
        <div class="detailName">${esc(displayName(p))}</div>
        <div class="detailMeta">${esc(dates)}</div>
      </div>
    </div>
    <div class="detailGrid">
      <div class="detailBox"><span class="detailLabel">Partner/in</span>${relationButtons(partners)}</div>
      <div class="detailBox"><span class="detailLabel">Eltern</span>${relationButtons(parents)}</div>
      <div class="detailBox full"><span class="detailLabel">Kinder</span>${relationButtons(children)}</div>
      ${p.note ? `<div class="detailBox full"><span class="detailLabel">Notiz</span><div class="detailValue">${esc(p.note)}</div></div>` : ''}
    </div>
  `;

  details.querySelectorAll('[data-id]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const targetId = btn.dataset.id;
      jumpToPerson(targetId);
      openSheet(targetId);
    });
  });
}

function openSheet(id) {
  selected = id;
  const p = person(id);
  $('sheetTitle').textContent = p ? (editMode ? 'Person bearbeiten' : 'Person ansehen') : 'Neue Person';
  $('quickFocus').style.display = p ? '' : 'none';
  $('quickChild').style.display = p && editMode ? '' : 'none';
  $('quickPartner').style.display = p && editMode ? '' : 'none';
  $('quickParents').style.display = p && editMode ? '' : 'none';

  $('firstName').value = p?.firstName || '';
  $('lastName').value = p?.lastName || '';
  $('nickname').value = p?.nickname || '';
  $('born').value = p?.born || '';
  $('died').value = p?.died || '';
  $('birthName').value = p?.birthName || '';
  $('note').value = p?.note || '';
  fillSelects(id, p?.parents?.[0] || '', p?.parents?.[1] || '');
  sheetSnapshot = formSnapshot();
  renderPersonDetails(p);

  const editable = editMode || !p;
  ['firstName','lastName','nickname','born','died','birthName','note','parent1','parent2','partner'].forEach(id => {
    const el = $(id);
    if (el) el.disabled = !editable;
  });
  $('deleteBtn').style.display = p && editMode ? 'block' : 'none';
  $('saveBtn').style.display = editable ? 'block' : 'none';
  setDialogVisibility($('sheet'), true);
  showBackdrop(true);
}

function closeSheet(force = false) {
  if (!force && !confirmDiscardSheetChanges()) return false;
  selected = null;
  sheetSnapshot = '';
  setDialogVisibility($('sheet'), false);
  showBackdrop(false);
  render();
  return true;
}

function clearGeneratedLayoutState() {
  layoutMode = 'classic';
  savedClassicPositions = null;
  updateLayoutButton();
}
function resetGeneratedLayout() {
  if (layoutMode !== 'classic') restoreClassicPositions();
  clearGeneratedLayoutState();
}

function saveSheet() {
  let p = person(selected);
  const firstName = $('firstName').value.trim();
  const birthName = $('birthName').value.trim();
  const lastName = $('lastName').value.trim() || birthName;
  const nickname = $('nickname').value.trim();
  const born = $('born').value.trim();
  const died = $('died').value.trim();
  const parents = [$('parent1').value, $('parent2').value].filter(Boolean);
  const newPartner = $('partner').value;

  if (!validatePersonForm(selected, parents, newPartner, born, died)) return false;

  if (!p) {
    const pos = pendingNewPos || screenToWorld(main.getBoundingClientRect().left + main.clientWidth / 2, main.getBoundingClientRect().top + main.clientHeight / 2);
    p = { id: nextId(), name: '', born: '', died: '', birthName: '', note: '', x: pos.x, y: pos.y, parents: [], partner: '', partners: [] };
    data.people.push(p);
    pendingNewPos = null;
  }

  p.firstName = firstName;
  p.lastName = lastName;
  p.nickname = nickname;
  p.name = (firstName || lastName) ? `${firstName} ${lastName}`.trim() : p.name || 'Ohne Name';
  p.born = born;
  p.died = died;
  p.birthName = birthName;
  p.note = $('note').value.trim();
  p.parents = parents;

  if (newPartner) {
    const q = person(newPartner);
    if (q && !partnerIds(p).includes(q.id)) {
      const reciprocal = !partnerIds(p).length || confirm('Partner/in auch bei der anderen Person eintragen?\n\nOK = gegenseitig verknüpfen\nAbbrechen = nur bei dieser Person eintragen');
      linkPartners(p, q, reciprocal);
    }
  }

  resetGeneratedLayout();
  save();
  render();
  if($('sideNav')?.classList.contains('open')) renderNavigator();
  if($('listSheet')?.classList.contains('open')) renderListEditor();
  sheetSnapshot = formSnapshot();
  closeSheet(true);
  return true;
}

function newPersonNear(base, dx, dy) {
  return { id: nextId(), name: 'Neue Person', born: '', died: '', birthName: '', note: '', x: Math.round((base?.x ?? 400) + dx), y: Math.round((base?.y ?? 300) + dy), parents: [], partner: '', partners: [] };
}
function addChildFor(id) {
  const p = person(id); if (!p) return;
  const child = newPersonNear(p, 0, 260);
  child.name = 'Kind von ' + p.name;
  child.parents = [p.id];
  const partner = primaryPartner(p);
  if (partner) child.parents.push(partner.id);
  data.people.push(child);
  resetGeneratedLayout(); save(); render(); if($('sideNav')?.classList.contains('open')) renderNavigator(); openSheet(child.id);
}
function addPartnerFor(id) {
  const p = person(id); if (!p) return;
  const q = newPersonNear(p, 230, 0);
  q.name = 'Partner/in von ' + p.name;
  linkPartners(p, q);
  data.people.push(q);
  resetGeneratedLayout(); save(); render(); if($('sideNav')?.classList.contains('open')) renderNavigator(); openSheet(q.id);
}
function addParentsFor(id) {
  const p = person(id); if (!p) return;
  const a = newPersonNear(p, -120, -260);
  const b = newPersonNear(p, 120, -260);
  a.name = 'Elternteil 1 von ' + p.name;
  b.name = 'Elternteil 2 von ' + p.name;
  linkPartners(a, b);
  p.parents = [a.id, b.id];
  data.people.push(a, b);
  resetGeneratedLayout(); save(); render(); if($('sideNav')?.classList.contains('open')) renderNavigator(); openSheet(a.id);
}

let listSortMode = 'family';

function setDialogVisibility(el, visible){
  el.classList.toggle('open', visible);
  el.setAttribute('aria-hidden', visible ? 'false' : 'true');
}
function showBackdrop(visible){
  const back = $('backdrop');
  back.classList.toggle('show', visible);
  back.setAttribute('aria-hidden', visible ? 'false' : 'true');
}
function openListEditor(){
  setDialogVisibility($('listSheet'), true);
  showBackdrop(true);
  renderListEditor();
  setTimeout(()=>$('listSearch').focus(), 80);
}
function closeListEditor(){
  setDialogVisibility($('listSheet'), false);
  showBackdrop(false);
}
function openNavigator(){
  setDialogVisibility($('sideNav'), true);
  showBackdrop(true);
  renderNavigator();
  setTimeout(()=>$('navSearch').focus(), 80);
}
function closeNavigator(){
  setDialogVisibility($('sideNav'), false);
  showBackdrop(false);
}
function openSearch(){
  setDialogVisibility($('searchSheet'), true);
  showBackdrop(true);
  renderSearchResults();
  setTimeout(()=>$('personSearch').focus(), 80);
}
function closeSearch(){
  setDialogVisibility($('searchSheet'), false);
  showBackdrop(false);
}
function openBirthdays(){
  setDialogVisibility($('birthdaySheet'), true);
  showBackdrop(true);
  renderBirthdays();
}
function closeBirthdays(){
  setDialogVisibility($('birthdaySheet'), false);
  showBackdrop(false);
}
function openScrollView(){
  setDialogVisibility($('scrollSheet'), true);
  showBackdrop(true);
  scrollExpanded = new Set(data.people.filter(p => !(p.parents || []).length).map(p => p.id));
  renderScrollView();
}
function closeScrollView(){
  setDialogVisibility($('scrollSheet'), false);
  showBackdrop(false);
}
function renderScrollView(){
  const ids = visibleIds();
  const childrenOf = new Map(data.people.map(p => [p.id, []]));
  for (const p of data.people) for (const pid of p.parents || []) childrenOf.get(pid)?.push(p);
  const byBirth = (a,b) => (birthSortValue(a) ?? Infinity) - (birthSortValue(b) ?? Infinity) || fullName(a).localeCompare(fullName(b));
  const shouldAttachPartner = p => {
    const q = mutualPartnerIds(p).map(person).find(partner => partner && ids.has(partner.id) && !(partner.parents || []).length);
    if (!q) return false;
    if ((p.parents || []).length) return true;
    return p.id < q.id;
  };
  const attachedPartnerFor = p => mutualPartnerIds(p).map(person).find(q => q && ids.has(q.id) && !(q.parents || []).length && shouldAttachPartner(p)) || null;
  const attachedPartnerIds = new Set(data.people.filter(p => ids.has(p.id)).map(attachedPartnerFor).filter(Boolean).map(p => p.id));
  const roots = data.people
    .filter(p => ids.has(p.id) && !attachedPartnerIds.has(p.id) && !(p.parents || []).some(pid => ids.has(pid)))
    .sort(byBirth);

  const row = (p, level, path = new Set()) => {
    if (!ids.has(p.id) || path.has(p.id)) return '';
    const attachedPartner = attachedPartnerFor(p);
    const linkedPartners = partnerIds(p).map(person).filter(q => q && ids.has(q.id) && q.id !== attachedPartner?.id);
    const parentIds = attachedPartner ? [p.id, attachedPartner.id] : [p.id];
    const branchPath = new Set(path);
    branchPath.add(p.id);
    if (attachedPartner) branchPath.add(attachedPartner.id);
    const allChildren = parentIds
      .flatMap(id => childrenOf.get(id) || [])
      .filter((c, idx, arr) => ids.has(c.id) && arr.findIndex(x => x.id === c.id) === idx)
      .sort(byBirth);
    const children = allChildren;
    const isOpen = scrollExpanded.has(p.id);
    const inlinePartnerNames = linkedPartners.filter(q => !(q.parents || []).length).map(q => fullName(q) || q.name).join(', ');
    const dates = [p.born && formatBirthDate(p.born), p.died && '- ' + p.died].filter(Boolean).join(' ');
    const meta = [dates, birthNameDiffers(p) && 'geb. ' + p.birthName, inlinePartnerNames && 'Partner/in: ' + inlinePartnerNames].filter(Boolean).join(' · ');
    const attachedMeta = attachedPartner ? [attachedPartner.born && formatBirthDate(attachedPartner.born), birthNameDiffers(attachedPartner) && 'geb. ' + attachedPartner.birthName].filter(Boolean).join(' · ') : '';
    const canExpand = children.length;
    const partnerChip = linkedPartners
      .filter(q => (q.parents || []).length)
      .map(q => `<button type="button" class="scrollPartnerChip" data-partner-id="${esc(q.id)}">Partner/in: ${esc(fullName(q) || q.name)} ↗</button>`)
      .join('');
    return `
      <div class="scrollNode ${level === 0 ? 'root' : ''} ${isOpen ? 'open' : ''}" style="--level:${level};--family-color:${esc(familyColor(familyKey(p)))}">
        <div class="scrollPerson" role="button" tabindex="0" data-id="${esc(p.id)}" data-expandable="${canExpand ? '1' : '0'}">
          <span class="scrollToggle">${canExpand ? (isOpen ? '−' : '+') : ''}</span>
          <span class="scrollAvatar">${esc(initials(fullName(p) || p.name))}</span>
          <span><strong>${esc(fullName(p) || p.name)}</strong>${meta ? `<small>${esc(meta)}</small>` : ''}${partnerChip}${attachedPartner ? `<span class="scrollPartner"><span class="scrollAvatar mini" style="--family-color:${esc(familyColor(familyKey(attachedPartner)))}">${esc(initials(fullName(attachedPartner) || attachedPartner.name))}</span><span><strong>${esc(fullName(attachedPartner) || attachedPartner.name)}</strong>${attachedMeta ? `<small>${esc(attachedMeta)}</small>` : ''}</span></span>` : ''}</span>
          <span class="scrollJump" data-jump="1">↗</span>
        </div>
        ${isOpen && children.length ? `<div class="scrollChildren">${children.map(child => row(child, level + 1, branchPath)).join('')}</div>` : ''}
      </div>
    `;
  };

  const html = roots.map(root => row(root, 0)).join('');
  $('scrollRows').innerHTML = html || '<p class="emptyState">Keine sichtbaren Personen.</p>';
  $('scrollRows').querySelectorAll('.scrollPerson').forEach(rowEl => {
    const activate = e => {
      const id = rowEl.dataset.id;
      if (e.target.closest('[data-jump]')) {
        closeScrollView();
        jumpToPerson(id);
        return;
      }
      const partner = e.target.closest('[data-partner-id]');
      if (partner) {
        e.stopPropagation();
        closeScrollView();
        jumpToPerson(partner.dataset.partnerId);
        return;
      }
      if (rowEl.dataset.expandable !== '1') return;
      if (scrollExpanded.has(id)) scrollExpanded.delete(id);
      else scrollExpanded.add(id);
      renderScrollView();
    };
    rowEl.addEventListener('click', activate);
    rowEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate(e);
      }
    });
  });
}
function birthdayRows() {
  const today = new Date();
  const todayKey = (today.getMonth() + 1) * 100 + today.getDate();
  return data.people
    .map(p => ({ p, b: birthdayInfo(p) }))
    .filter(item => item.b && (item.b.precision === 'day' || item.b.precision === 'birthday'))
    .map(item => {
      const key = item.b.month * 100 + item.b.day;
      return { ...item, key, upcoming: key < todayKey ? key + 1300 : key };
    })
    .sort((a,b) => a.upcoming - b.upcoming || fullName(a.p).localeCompare(fullName(b.p)));
}
function renderBirthdays(){
  const rows = birthdayRows();
  $('birthdayRows').innerHTML = rows.length ? rows.map(({p,b}) => {
    const date = `${String(b.day).padStart(2, '0')}.${String(b.month).padStart(2, '0')}.`;
    const year = b.year ? String(b.year) : 'Jahr offen';
    return `
      <button type="button" class="birthdayRow" data-id="${esc(p.id)}">
        <span class="birthdayDate">${esc(date)}</span>
        <span><strong>${esc(fullName(p) || p.name)}</strong><small>${esc([familyLabel(p), year].filter(Boolean).join(' · '))}</small></span>
      </button>
    `;
  }).join('') : '<p class="emptyState">Noch keine Geburtstage mit Tag und Monat eingetragen.</p>';
  $('birthdayRows').querySelectorAll('.birthdayRow').forEach(row => {
    row.addEventListener('click', () => {
      closeBirthdays();
      jumpToPerson(row.dataset.id);
    });
  });
}
function showSpotlight(id) {
  spotlightId = id;
  clearTimeout(spotlightTimer);
  render();
  spotlightTimer = setTimeout(() => {
    spotlightId = null;
    render();
  }, 1800);
}
function jumpToPerson(id) {
  const p = person(id);
  if (!p) return;
  selected = id;
  view.s = Math.max(view.s, 0.72);
  view.x = -p.x * view.s;
  view.y = -p.y * view.s;
  applyView();
  showSpotlight(id);
}
function renderSearchResults(){
  const q = ($('personSearch')?.value || '').trim().toLowerCase();
  const rows = [...data.people]
    .filter(p => !q || personSearchText(p).includes(q))
    .sort((a,b) => fullName(a).localeCompare(fullName(b)))
    .slice(0, 80);

  $('searchRows').innerHTML = rows.map(p => {
    const dates = [p.born, p.died && '- '+p.died].filter(Boolean).join(' ');
    return `
      <button type="button" class="searchRow" data-id="${esc(p.id)}">
        <span class="swatch" style="background:${esc(familyColor(familyKey(p)))}"></span>
        <span><strong>${esc(fullName(p) || p.name)}</strong><small>${esc([dates, birthNameDiffers(p) && 'geb. '+p.birthName].filter(Boolean).join(' · ')) || 'Lebensdaten offen'}</small></span>
      </button>
    `;
  }).join('');
  $('searchRows').querySelectorAll('.searchRow').forEach(row => {
    row.addEventListener('click', () => {
      closeSearch();
      jumpToPerson(row.dataset.id);
    });
  });
}
function dataIssues(){
  const issues = [];
  const ids = new Set(data.people.map(p => p.id));
  const nameCount = new Map();
  data.people.forEach(p => nameCount.set(fullName(p) || p.name, (nameCount.get(fullName(p) || p.name) || 0) + 1));

  for (const p of data.people) {
    const name = fullName(p) || p.name;
    if (!p.lastName || p.lastName === '?') issues.push({ id:p.id, text:`${name}: Nachname fehlt/unklar.` });
    if (!p.born) issues.push({ id:p.id, text:`${name}: Geburtsdatum fehlt.` });
    if (nameCount.get(name) > 1) issues.push({ id:p.id, text:`${name}: Name kommt mehrfach vor.` });
    for (const partnerId of uniqueIds([...(p.partners || []), p.partner])) {
      if (!ids.has(partnerId)) issues.push({ id:p.id, text:`${name}: Partner-Referenz ${partnerId} fehlt.` });
    }
    for (const pid of p.parents || []) {
      if (!ids.has(pid)) issues.push({ id:p.id, text:`${name}: Eltern-Referenz ${pid} fehlt.` });
    }
    if ((p.parents || []).length === 1) issues.push({ id:p.id, text:`${name}: nur ein Elternteil eingetragen.` });
  }
  return issues;
}
function openCheck(){
  setDialogVisibility($('checkSheet'), true);
  showBackdrop(true);
  renderCheck();
}
function closeCheck(){
  setDialogVisibility($('checkSheet'), false);
  showBackdrop(false);
}
function renderCheck(){
  const issues = dataIssues();
  $('checkRows').innerHTML = issues.length ? issues.map(issue => `
    <button type="button" class="checkRow" data-id="${esc(issue.id)}">${esc(issue.text)}</button>
  `).join('') : '<p class="emptyState">Keine offensichtlichen Datenprobleme gefunden.</p>';
  $('checkRows').querySelectorAll('.checkRow').forEach(row => {
    row.addEventListener('click', () => {
      closeCheck();
      jumpToPerson(row.dataset.id);
    });
  });
}
function renderNavigator(){
  const q = ($('navSearch')?.value || '').trim().toLowerCase();
  const rows = familyStats().filter(item => !q || item.label.toLowerCase().includes(q));
  $('familyRows').innerHTML = rows.map(item => {
    const color = familyColor(item.key);
    const active = item.key === activeFamily ? ' active' : '';
    return `
      <button type="button" class="familyRow${active}" data-family="${esc(item.key)}">
        <span class="swatch" style="background:${esc(color)}"></span>
        <span class="familyName">${esc(item.label)}</span>
        <span class="familyCount">${item.count}</span>
      </button>
    `;
  }).join('');

  $('familyRows').querySelectorAll('.familyRow').forEach(row => {
    row.addEventListener('click', () => jumpToFamily(row.dataset.family || ''));
  });
}
function personSearchText(p){
  const parentNames = (p.parents||[]).map(id=>person(id)?.name||'').join(' ');
  const partnerName = partnerIds(p).map(id => person(id)?.name || '').join(' ');
  return [p.name,p.birthName,p.born,p.died,p.note,parentNames,partnerName].join(' ').toLowerCase();
}
function comparePeopleForList(a,b){
  if(listSortMode === 'name'){
    return String(a.name).localeCompare(String(b.name));
  }
  if(listSortMode === 'birth'){
    const ba = birthSortValue(a), bb = birthSortValue(b);
    if(ba !== null && bb !== null) return ba - bb;
    if(ba !== null) return -1;
    if(bb !== null) return 1;
    return String(a.name).localeCompare(String(b.name));
  }
  const af = (a.parents||[]).join('|') || '0';
  const bf = (b.parents||[]).join('|') || '0';
  return af.localeCompare(bf) || String(a.name).localeCompare(String(b.name));
}
function renderListEditor(){
  const q = ($('listSearch')?.value || '').trim().toLowerCase();
  const rows = [...data.people]
    .filter(p => !q || personSearchText(p).includes(q))
    .sort(comparePeopleForList);

  $('listRows').innerHTML = rows.map(p => {
    const parents = (p.parents||[]).map(id=>person(id)?.name||id).filter(Boolean).join(' + ');
    const partner = partnerIds(p).map(id => person(id)?.name || id).join(', ');
    const birth = birthNameDiffers(p) ? ` · geb. ${esc(p.birthName)}` : '';
    const dates = [p.born, p.died && '– '+p.died].filter(Boolean).join(' ');
    return `
      <div class="listRow" tabindex="0" data-id="${esc(p.id)}">
        <div>
          <div class="listName">${esc(p.name)}</div>
          <div class="listMeta">${esc([dates, birth].filter(Boolean).join('')) || 'Lebensdaten offen'}</div>
          <div class="listMeta">${partner ? 'Partner/in: '+esc(partner) : ''}${parents ? (partner ? ' · ' : '') + 'Eltern: '+esc(parents) : ''}</div>
        </div>
        <div class="listActions">
          <button type="button" class="miniBtn" data-act="edit" data-id="${esc(p.id)}">Edit</button>
          <button type="button" class="miniBtn" data-act="child" data-id="${esc(p.id)}">+Kind</button>
          <button type="button" class="miniBtn" data-act="partner" data-id="${esc(p.id)}">+Partner</button>
        </div>
      </div>
    `;
  }).join('');

  $('listRows').querySelectorAll('.listRow').forEach(row => {
    row.addEventListener('click', e => {
      if(e.target.closest('button')) return;
      const id = row.dataset.id;
      closeListEditor();
      openSheet(id);
    });
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        row.click();
      }
    });
  });
  $('listRows').querySelectorAll('button[data-act]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      closeListEditor();
      if(act === 'edit') openSheet(id);
      if(act === 'child') addChildFor(id);
      if(act === 'partner') addPartnerFor(id);
    });
  });
}
// -- UI event wiring ----------------------------------------------------
$('parent1').addEventListener('change', () => {
  const old = $('parent2').value;
  const arr = suggestParentOrder(selected, $('parent1').value);
  $('parent2').innerHTML = '<option value="">—</option>' + arr.map(p => `<option value="${esc(p.id)}">${esc(selectPersonLabel(p))}</option>`).join('');
  $('parent2').value = old;
});

$('saveBtn').addEventListener('click', saveSheet);
$('closeBtn').addEventListener('click', closeSheet);
$('backdrop').addEventListener('click', () => {
  if($('sideNav').classList.contains('open')) closeNavigator();
  else if($('searchSheet').classList.contains('open')) closeSearch();
  else if($('birthdaySheet').classList.contains('open')) closeBirthdays();
  else if($('scrollSheet').classList.contains('open')) closeScrollView();
  else if($('checkSheet').classList.contains('open')) closeCheck();
  else if($('listSheet').classList.contains('open')) closeListEditor();
  else closeSheet();
});
window.addEventListener('keydown', e => {
  const active = document.activeElement;
  const isTyping = active && ['INPUT','TEXTAREA','SELECT'].includes(active.tagName);
  if (e.key === 'Escape') {
    if ($('sheet').classList.contains('open')) { closeSheet(); e.preventDefault(); }
    else if ($('sideNav').classList.contains('open')) { closeNavigator(); e.preventDefault(); }
    else if ($('searchSheet').classList.contains('open')) { closeSearch(); e.preventDefault(); }
    else if ($('birthdaySheet').classList.contains('open')) { closeBirthdays(); e.preventDefault(); }
    else if ($('scrollSheet').classList.contains('open')) { closeScrollView(); e.preventDefault(); }
    else if ($('checkSheet').classList.contains('open')) { closeCheck(); e.preventDefault(); }
    else if ($('listSheet').classList.contains('open')) { closeListEditor(); e.preventDefault(); }
    return;
  }
  if (isTyping) return;
  if (e.key === '+' || e.key === '=') { zoomTo(view.s * 1.18); e.preventDefault(); }
  if (e.key === '-') { zoomTo(view.s / 1.18); e.preventDefault(); }
  if (e.key === '0' || e.key === 'Home') { fit(); e.preventDefault(); }
  if (editMode && e.key === 'Delete' && $('sheet').classList.contains('open') && selected) { $('deleteBtn').click(); e.preventDefault(); }
});
$('modeBtn').addEventListener('click', () => {
  if (!confirmDiscardSheetChanges()) return;
  editMode = !editMode;
  updateModeUI();
  render();
  if ($('sheet').classList.contains('open')) {
    if (selected && person(selected)) openSheet(selected);
    else closeSheet(true);
  }
});
$('addBtn').addEventListener('click', () => { selected = null; pendingNewPos = null; openSheet(null); });
$('quickFocus').addEventListener('click', () => selected && setFocusMode(true, selected));
$('quickChild').addEventListener('click', () => selected && addChildFor(selected));
$('quickPartner').addEventListener('click', () => selected && addPartnerFor(selected));
$('quickParents').addEventListener('click', () => selected && addParentsFor(selected));

$('deleteBtn').addEventListener('click', () => {
  if (!editMode) return;
  if (!selected) return;
  if (focusId === selected) {
    focusMode = false;
    focusId = null;
    updateFocusButton();
  }
  if (rootId === selected) {
    rootId = '';
    localStorage.removeItem(storeKey + '-root');
    updateRootButton();
  }
  data.people = data.people
    .filter(p => p.id !== selected)
    .map(p => {
      const partners = partnerIds(p).filter(id => id !== selected);
      return { ...p, parents: (p.parents || []).filter(x => x !== selected), partner: partners[0] || '', partners };
    });
  if (activeFamily && !data.people.some(p => matchesFamily(p, activeFamily))) activeFamily = '';
  save();
  if($('sideNav')?.classList.contains('open')) renderNavigator();
  closeSheet(true);
});

$('zin').addEventListener('click', () => zoomTo(view.s * 1.18));
$('zout').addEventListener('click', () => zoomTo(view.s / 1.18));
$('home').addEventListener('click', fit);
$('fitBtn').addEventListener('click', fit);
$('autoBtn').addEventListener('click', () => { if (confirm('Automatische kompakte Anordnung anwenden? Aktuelle Positionen werden überschrieben.')) autoLayout(); });
$('collapseAllBtn').addEventListener('click', () => {
  const anyOpen = data.people.some(p=>hasChildren(p.id) && !collapsed.has(p.id));
  if(anyOpen){ data.people.forEach(p=>{ if(hasChildren(p.id)) collapsed.add(p.id); }); $('collapseAllBtn').textContent='Ausklappen'; }
  else { collapsed.clear(); $('collapseAllBtn').textContent='Einklappen'; }
  saveCollapsed(); autoLayout();
});

$('resetBtn').addEventListener('click', () => {
  if (confirm('Beispiel wirklich zurücksetzen?')) {
    data = normalize(structuredClone(sample));
    focusMode = false;
    focusId = null;
    activeFamily = '';
    rootId = '';
    localStorage.removeItem(storeKey + '-root');
    updateFocusButton();
    updateRootButton();
    save();
    render();
    fit();
  }
});

$('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'stammbaum.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('listBtn').addEventListener('click', openListEditor);
$('searchBtn').addEventListener('click', openSearch);
$('searchCloseBtn').addEventListener('click', closeSearch);
$('personSearch').addEventListener('input', renderSearchResults);
$('scrollBtn').addEventListener('click', openScrollView);
$('scrollCloseBtn').addEventListener('click', closeScrollView);
$('birthdayBtn').addEventListener('click', openBirthdays);
$('birthdayCloseBtn').addEventListener('click', closeBirthdays);
$('navBtn').addEventListener('click', openNavigator);
$('navCloseBtn').addEventListener('click', closeNavigator);
$('navClearBtn').addEventListener('click', () => jumpToFamily(''));
$('navSearch').addEventListener('input', renderNavigator);
$('layoutBtn').addEventListener('click', cycleLayoutMode);
$('nameModeBtn').addEventListener('click', () => {
  cycleViewPreset();
});
$('compactBtn')?.addEventListener('click', () => cycleViewPreset());
$('checkBtn').addEventListener('click', openCheck);
$('checkCloseBtn').addEventListener('click', closeCheck);
$('imageBtn').addEventListener('click', exportImageView);
$('listCloseBtn').addEventListener('click', closeListEditor);
$('listAddBtn').addEventListener('click', () => { closeListEditor(); selected = null; pendingNewPos = null; openSheet(null); });
$('listSearch').addEventListener('input', renderListEditor);
$('listSortNameBtn').addEventListener('click', () => { listSortMode='name'; renderListEditor(); });
$('listSortBirthBtn').addEventListener('click', () => { listSortMode='birth'; renderListEditor(); });
$('listSortFamilyBtn').addEventListener('click', () => { listSortMode='family'; renderListEditor(); });
$('importBtn').addEventListener('click', () => $('fileInput').click());
if (minimap) {
  minimap.addEventListener('click', e => {
    if (!minimapState) return;
    const rect = minimapInner.getBoundingClientRect();
    const mapX = Math.max(0, Math.min(minimapState.mapW, e.clientX - rect.left));
    const mapY = Math.max(0, Math.min(minimapState.mapH, e.clientY - rect.top));
    const x = Math.max(0, Math.min(minimapState.maxX, (mapX - minimapState.offsetX) / minimapState.scale));
    const y = Math.max(0, Math.min(minimapState.maxY, (mapY - minimapState.offsetY) / minimapState.scale));
    view.x = -x * view.s;
    view.y = -y * view.s;
    applyView();
  });
}
$('fileInput').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const imported = normalize(JSON.parse(r.result));
      data = imported;
      focusMode = false;
      focusId = null;
      activeFamily = '';
      rootId = '';
      localStorage.removeItem(storeKey + '-root');
      updateFocusButton();
      updateRootButton();
      save();
      render();
      fit();
    } catch {
      alert('Import nicht erkannt. Erwartet wird ein JSON-Export dieser App.');
    }
  };
  r.readAsText(f);
  e.target.value = '';
});

window.addEventListener('resize', fit);

render();
updateModeUI();
updateNameModeButton();
updateLayoutButton();
updateRootButton();
updateFocusButton();
loadDefaultDataIfAvailable();
setTimeout(fit, 50);
setTimeout(() => $('hint').classList.add('hidden'), 8000);

})();
