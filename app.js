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
let nameMode = 'full';
let layoutMode = 'classic';
let savedClassicPositions = null;
let rootIds = [...(data.rootIds || [])];
let spotlightId = null;
let spotlightTimer = null;
let sheetSnapshot = '';
let imageDraft = '';
let mentionsDraft = [];
let removedPartnerDraft = new Set();
let marriageDraft = {};
let scrollExpanded = new Set();
let checkCollapsed = new Set();
let workingFileHandle = null;
let workingFileWriteTimer = null;
let workingFileWriteChain = Promise.resolve();
let personById = new Map();
let nonPoolPeople = [];
rebuildDataIndexes();

const familyPalette = [
  '#6b8f71', '#c9895e', '#6f88b6', '#b86b77', '#8f7ab8',
  '#5d9a9a', '#b39a4d', '#7b8d57', '#b0709b', '#8a765f'
];
const personFieldSettingsKey = storeKey + '-person-fields';
const optionalPersonFields = [
  { key: 'occupation', label: 'Beruf' },
  { key: 'religion', label: 'Glaubensrichtung' },
  { key: 'location', label: 'Ort' },
  { key: 'link', label: 'Link' },
  { key: 'image', label: 'Bild' },
  { key: 'mentions', label: 'Erwähnungen' }
];
let personFieldSettings = loadPersonFieldSettings();

function loadPersonFieldSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(personFieldSettingsKey) || '{}');
    return Object.fromEntries(optionalPersonFields.map(field => [field.key, parsed[field.key] !== false]));
  } catch {
    return Object.fromEntries(optionalPersonFields.map(field => [field.key, true]));
  }
}
function savePersonFieldSettings() {
  localStorage.setItem(personFieldSettingsKey, JSON.stringify(personFieldSettings));
}
function applyPersonFieldSettings() {
  for (const field of optionalPersonFields) {
    const visible = personFieldSettings[field.key] !== false;
    document.querySelectorAll(`[data-person-field="${field.key}"]`).forEach(el => el.classList.toggle('hidden', !visible));
    document.querySelectorAll(`[data-field-toggle="${field.key}"]`).forEach(el => { el.checked = visible; });
  }
}

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
    const partnerDetails = Object.fromEntries(
      Object.entries(p.partnerDetails || p.partner_details || {}).map(([id, details]) => [
        String(id),
        { married: String(details?.married || details?.marriageDate || details?.heiratsdatum || '') }
      ])
    );
    const confidence = ['high', 'medium', 'low'].includes(String(p.confidence || '').toLowerCase())
      ? String(p.confidence).toLowerCase()
      : 'high';
    const mentions = (Array.isArray(p.mentions) ? p.mentions : Array.isArray(p.sources) ? p.sources : [])
      .map(item => ({
        title: String(item?.title || item?.name || ''),
        date: String(item?.date || item?.datum || ''),
        link: String(item?.link || item?.url || '')
      }))
      .filter(item => item.title || item.date || item.link);
    return {
      id: String(p.id || 'p' + (i + 1)),
      name: explicitName || name,
      firstName: firstName || (name.split(/\s+/).slice(0, -1).join(' ') || name),
      lastName: lastName || (name.split(/\s+/).slice(-1).join(' ') || ''),
      nickname,
      born: String(p.born || ''),
      died: String(p.died || ''),
      birthName: rawBirthName,
      occupation: String(p.occupation || p.beruf || ''),
      religion: String(p.religion || p.faith || p.glaubensrichtung || ''),
      location: String(p.location || p.ort || ''),
      link: String(p.link || p.url || ''),
      image: String(p.image || p.photo || p.picture || ''),
      mentions,
      pool: p.pool === true || p.inPool === true || p.status === 'pool',
      note: String(p.note || ''),
      confidence,
      x: Number.isFinite(+p.x) ? +p.x : 200 + i * 40,
      y: Number.isFinite(+p.y) ? +p.y : 200 + i * 40,
      parents: Array.isArray(p.parents) ? p.parents.map(String).filter(Boolean) : [],
      partner: partners[0] || '',
      partners,
      partnerDetails
    };
  });
  const requestedRootIds = uniqueIds([
    ...(Array.isArray(d.rootIds) ? d.rootIds : []),
    d.rootId,
    d.mainRootId,
    d.hauptwurzel
  ]).filter(id => d.people.some(p => p.id === id)).slice(0, 2);
  d.rootIds = requestedRootIds;
  delete d.rootId;
  return d;
}

function load() {
  try {
    const raw = localStorage.getItem(storeKey);
    if (raw) return normalize(JSON.parse(raw));
  } catch {}
  return normalize(structuredClone(sample));
}
function rebuildDataIndexes() {
  personById = new Map(data.people.map(p => [p.id, p]));
  nonPoolPeople = data.people.filter(p => !p.pool);
}
async function loadDefaultDataIfAvailable() {
  if (localStorage.getItem(storeKey)) return;
  await loadDefaultData({ saveResult: true, fitResult: true });
}
async function loadDefaultData({ saveResult = true, fitResult = true } = {}) {
  try {
    const response = await fetch(defaultDataUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('Default JSON not reachable');
    data = normalize(await response.json());
  } catch {
    data = normalize(structuredClone(sample));
  }
  rebuildDataIndexes();
  rootIds = [...(data.rootIds || [])];
  updateRootButton();
  if (saveResult) save();
  render();
  if (fitResult) fit();
  if ($('sideNav')?.classList.contains('open')) renderNavigator();
  if ($('scrollSheet')?.classList.contains('open')) renderScrollView();
}
function save() {
  try {
    rebuildDataIndexes();
    data.rootIds = rootIds.filter(id => person(id)).slice(0, 2);
    localStorage.setItem(storeKey, JSON.stringify(data, null, 2));
    scheduleWorkingFileWrite();
    return true;
  } catch {
    alert('Speichern fehlgeschlagen. Das Bild ist vermutlich zu groß für den Browser-Speicher. Bitte ein kleineres Bild wählen oder das Bild entfernen.');
    return false;
  }
}
function updateWorkingFileButton() {
  const btn = $('workingFileBtn');
  if (!btn) return;
  btn.textContent = workingFileHandle ? `Arbeitsdatei: ${workingFileHandle.name}` : 'Arbeitsdatei öffnen';
  btn.title = workingFileHandle
    ? 'Änderungen werden automatisch in diese Datei geschrieben'
    : 'JSON-Datei öffnen und künftig direkt aktualisieren';
}
function scheduleWorkingFileWrite() {
  if (!workingFileHandle) return;
  clearTimeout(workingFileWriteTimer);
  workingFileWriteTimer = setTimeout(() => {
    const json = JSON.stringify(data, null, 2);
    workingFileWriteChain = workingFileWriteChain
      .then(async () => {
        const writable = await workingFileHandle.createWritable();
        await writable.write(json);
        await writable.close();
      })
      .catch(() => {
        workingFileHandle = null;
        updateWorkingFileButton();
        alert('Die Arbeitsdatei konnte nicht aktualisiert werden. Bitte erneut öffnen.');
      });
  }, 180);
}
async function openWorkingFile() {
  if (!window.showOpenFilePicker) {
    alert('Direktes Bearbeiten lokaler Dateien wird von diesem Browser nicht unterstützt. Nutze bitte „JSON kopieren“.');
    return;
  }
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [{
        description: 'Stammbaum JSON',
        accept: { 'application/json': ['.json'] }
      }]
    });
    const file = await handle.getFile();
    const imported = normalize(JSON.parse(await file.text()));
    workingFileHandle = handle;
    data = imported;
    rebuildDataIndexes();
    focusMode = false;
    focusId = null;
    activeFamily = '';
    rootIds = [...(imported.rootIds || [])];
    updateFocusButton();
    updateRootButton();
    updateWorkingFileButton();
    save();
    render();
    fit();
  } catch (err) {
    if (err?.name !== 'AbortError') alert('Arbeitsdatei konnte nicht geöffnet werden.');
  }
}
async function copyTreeJson() {
  const json = JSON.stringify(exportData(true), null, 2);
  try {
    await navigator.clipboard.writeText(json);
    alert('Aktuelle JSON-Daten wurden in die Zwischenablage kopiert.');
  } catch {
    const area = document.createElement('textarea');
    area.value = json;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    alert(copied ? 'Aktuelle JSON-Daten wurden in die Zwischenablage kopiert.' : 'JSON konnte nicht kopiert werden.');
  }
}
function person(id) { return personById.get(id); }
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
  if (p.partnerDetails) delete p.partnerDetails[otherId];
  if (reciprocal) {
    const q = person(otherId);
    if (q) {
      setPartnerIds(q, partnerIds(q).filter(id => id !== p.id));
      if (q.partnerDetails) delete q.partnerDetails[p.id];
    }
  }
}
function marriageDateFor(p, partnerId) {
  return String(p?.partnerDetails?.[partnerId]?.married || person(partnerId)?.partnerDetails?.[p?.id]?.married || '');
}
function setMarriageDate(p, q, value, reciprocal = true) {
  if (!p || !q) return;
  const married = String(value || '').trim();
  p.partnerDetails ||= {};
  if (married) p.partnerDetails[q.id] = { ...(p.partnerDetails[q.id] || {}), married };
  else delete p.partnerDetails[q.id];
  if (reciprocal) {
    q.partnerDetails ||= {};
    if (married) q.partnerDetails[p.id] = { ...(q.partnerDetails[p.id] || {}), married };
    else delete q.partnerDetails[p.id];
  }
}
function esc(s) { return String(s || '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function safeUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
  if (/^[\w.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(url)) return `https://${url}`;
  return '';
}
function initials(n) { return (n || '?').split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase(); }
function avatarHtml(p, label = '') {
  const name = label || fullName(p) || p?.name || '';
  return p?.image
    ? `<img src="${esc(p.image)}" alt="${esc(name)}" loading="lazy" />`
    : esc(initials(name));
}
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
  const parts = [p.pool ? 'Vorrat' : '', dates, birth, mode === 'partner' ? relation : ''].filter(Boolean);
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
function confidenceLabel(value) {
  return ({ high: 'hoch', medium: 'mittel', low: 'niedrig' })[value || 'high'] || 'hoch';
}
function confidenceText(p) {
  const value = p?.confidence || 'high';
  return value === 'high' ? '' : `Sicherheit: ${confidenceLabel(value)}`;
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
function contentBounds() {
  const ids = visibleIds();
  const visible = data.people.filter(p => ids.has(p.id));
  if (!visible.length) return null;
  const xs = visible.map(p => p.x);
  const ys = visible.map(p => p.y);
  return {
    minX: Math.min(...xs) - 260,
    maxX: Math.max(...xs) + 260,
    minY: Math.min(...ys) - 220,
    maxY: Math.max(...ys) + 220
  };
}
function clampView() {
  const bounds = contentBounds();
  if (!bounds || !main.clientWidth || !main.clientHeight) return;
  const guard = Math.min(140, Math.max(72, Math.min(main.clientWidth, main.clientHeight) * 0.18));
  const centerX = main.clientWidth / 2;
  const centerY = main.clientHeight / 2;
  const minViewX = guard - bounds.maxX * view.s - centerX;
  const maxViewX = main.clientWidth - guard - bounds.minX * view.s - centerX;
  const minViewY = guard - bounds.maxY * view.s - centerY;
  const maxViewY = main.clientHeight - guard - bounds.minY * view.s - centerY;

  view.x = Math.min(maxViewX, Math.max(minViewX, view.x));
  view.y = Math.min(maxViewY, Math.max(minViewY, view.y));
}
function applyView() {
  clampView();
  world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
  updateZoomClass();
  updateMinimapViewport();
}
function withPreservedView(fn) {
  const previous = { ...view };
  const result = fn();
  view = previous;
  applyView();
  return result;
}
function updateWorldBounds() {
  const margin = 600;
  const maxX = Math.max(1600, ...nonPoolPeople.map(p => p.x)) + margin;
  const maxY = Math.max(1100, ...nonPoolPeople.map(p => p.y)) + margin;
  world.style.width = maxX + 'px';
  world.style.height = maxY + 'px';
  lines.setAttribute('width', maxX);
  lines.setAttribute('height', maxY);
  lines.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
  updateMinimap(maxX, maxY);
}
function updateMinimap(maxX, maxY, visiblePeople = null) {
  if (!minimap || !minimapInner || !minimapViewport || !minimapSvg) return;
  
  const visible = visiblePeople ? new Set(visiblePeople.map(p => p.id)) : visibleIds();
  const sourcePeople = visiblePeople || data.people.filter(p => visible.has(p.id));
  const mapW = minimapInner.clientWidth || 150;
  const mapH = minimapInner.clientHeight || 90;
  const scale = Math.min(mapW / maxX, mapH / maxY);
  const offsetX = (mapW - maxX * scale) / 2;
  const offsetY = (mapH - maxY * scale) / 2;
  
  minimapSvg.setAttribute('viewBox', `0 0 ${mapW} ${mapH}`);
  minimapSvg.innerHTML = '';
  minimapState = { maxX, maxY, mapW, mapH, scale, offsetX, offsetY };
  
  for (const p of sourcePeople) {
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
  
  for (const p of sourcePeople) {
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
function renderFamilyLines(visible, visiblePeople = null) {
  const groups = new Map();
  const singleParentGroups = new Map();
  const sourcePeople = visiblePeople || data.people.filter(p => visible.has(p.id));

  for (const child of sourcePeople) {
    const parents = (child.parents || []).map(person).filter(p => p && visible.has(p.id));
    if (!parents.length) continue;

    if (parents.length === 1) {
      const parent = parents[0];
      const group = singleParentGroups.get(parent.id) || { parent, children: [] };
      group.children.push(child);
      singleParentGroups.set(parent.id, group);
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

  for (const group of singleParentGroups.values()) {
    const hub = parentGroupPoint([group.parent], group.children);
    hub.x = group.children.reduce((sum, child) => sum + child.x, 0) / group.children.length;
    const color = lineageColorFor([group.parent, ...group.children]);
    addLine(group.parent.x, group.parent.y + 28, hub.x, hub.y, 'line familyStem lineageLine singleParentLine', color);
    addDot(hub.x, hub.y, 'familyHub singleParentHub', color);
    for (const child of group.children) {
      const bridge = isStemBridge(child, [group.parent]) ? ' stemBridge' : '';
      addLine(hub.x, hub.y, child.x, child.y - 46, `line childLine lineageLine singleParentLine${bridge}`, color);
    }
  }
}

function familyStats() {
  const stats = new Map();
  for (const p of data.people.filter(p => !p.pool)) {
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
async function saveBlobAs(blob, filename, types = []) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      if (err?.name !== 'AbortError') alert('Speichern am gewählten Zielort ist fehlgeschlagen. Es wird ein Download gestartet.');
      if (err?.name === 'AbortError') return false;
    }
  }
  downloadBlob(blob, filename);
  return true;
}
function exportSvgView() {
  const output = buildExportSvg();
  if (!output) return;
  saveBlobAs(new Blob([output.svg], { type:'image/svg+xml' }), 'stammbaum-ansicht.svg', [{
    description: 'SVG-Bild',
    accept: { 'image/svg+xml': ['.svg'] }
  }]);
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
      if (png) saveBlobAs(png, 'stammbaum-ansicht.png', [{
        description: 'PNG-Bild',
        accept: { 'image/png': ['.png'] }
      }]);
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
function poolBranchIds(id) {
  const ids = new Set();
  const queue = [id];
  while (queue.length) {
    const currentId = queue.shift();
    if (!currentId || ids.has(currentId)) continue;
    ids.add(currentId);
    const current = person(currentId);
    partnerIds(current).forEach(partnerId => {
      if (!ids.has(partnerId)) queue.push(partnerId);
    });
    data.people
      .filter(child => (child.parents || []).includes(currentId))
      .forEach(child => {
        if (!ids.has(child.id)) queue.push(child.id);
      });
  }
  return ids;
}
function movableBranchIds(id) {
  const source = person(id);
  if (!source) return new Set();
  return new Set([...poolBranchIds(id)].filter(branchId => person(branchId)?.pool === source.pool));
}
function setPoolBranch(id, pooled) {
  const ids = poolBranchIds(id);
  data.people.forEach(p => {
    if (ids.has(p.id)) p.pool = pooled;
  });
  return ids;
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
    .filter(p => !p.pool && !hidden.has(p.id) && (!focused || focused.has(p.id)))
    .map(p => p.id));
}
function directLineIds(id) {
  const ids = new Set();
  const root = person(id);
  if (!root) return ids;

  const ancestorIds = new Set();
  const walkAncestors = pid => {
    if (!pid || ancestorIds.has(pid)) return;
    ancestorIds.add(pid);
    ids.add(pid);
    const p = person(pid);
    (p?.parents || []).forEach(walkAncestors);
  };
  const descendantIds = new Set();
  const walkDescendants = pid => {
    if (!pid || descendantIds.has(pid)) return;
    descendantIds.add(pid);
    ids.add(pid);
    data.people
      .filter(p => (p.parents || []).includes(pid))
      .forEach(child => walkDescendants(child.id));
  };

  walkAncestors(id);
  walkDescendants(id);
  return ids;
}
function mainLineIds() {
  const ids = new Set();
  rootIds.forEach(rootId => directLineIds(rootId).forEach(id => ids.add(id)));
  return ids;
}
function isMainRoot(id) {
  return rootIds.includes(id);
}
function connectedIds(id) {
  const ids = new Set();
  if (!person(id) || person(id).pool) return ids;
  const queue = [id];
  while (queue.length) {
    const currentId = queue.shift();
    if (ids.has(currentId)) continue;
    ids.add(currentId);
    const current = person(currentId);
    partnerIds(current).forEach(partnerId => { if (!ids.has(partnerId) && !person(partnerId)?.pool) queue.push(partnerId); });
    (current?.parents || []).forEach(parentId => { if (!ids.has(parentId) && !person(parentId)?.pool) queue.push(parentId); });
    data.people
      .filter(child => !child.pool && (child.parents || []).includes(currentId))
      .forEach(child => { if (!ids.has(child.id)) queue.push(child.id); });
  }
  return ids;
}
function updateModeUI() {
  document.body.classList.toggle('editMode', editMode);
  document.body.classList.toggle('viewMode', !editMode);
  const btn = $('modeBtn');
  if (btn) {
    const label = editMode ? 'Ansehen' : 'Bearbeiten';
    btn.textContent = editMode ? '👁' : '✎';
    btn.title = label;
    btn.setAttribute('aria-label', label);
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
function updatePoolButton() {
  const btn = $('poolBtn');
  if (!btn) return;
  const count = data.people.filter(p => p.pool).length;
  btn.dataset.count = String(count);
  btn.title = `Vorrat (${count})`;
  btn.setAttribute('aria-label', `Personenvorrat öffnen, ${count} Personen`);
}
function closeSettingsMenu() {
  const menu = $('settingsMenu');
  const btn = $('settingsBtn');
  if (!menu) return;
  menu.classList.remove('open');
  menu.setAttribute('aria-hidden', 'true');
  btn?.setAttribute('aria-expanded', 'false');
}
function toggleSettingsMenu() {
  const menu = $('settingsMenu');
  const btn = $('settingsBtn');
  if (!menu) return;
  const open = !menu.classList.contains('open');
  if (open && btn) {
    const rect = btn.getBoundingClientRect();
    const menuWidth = Math.min(248, window.innerWidth - 28);
    const left = Math.min(Math.max(10, rect.left), window.innerWidth - menuWidth - 10);
    const bottom = Math.max(58, window.innerHeight - rect.top + 10);
    menu.style.left = `${left}px`;
    menu.style.bottom = `${bottom}px`;
  }
  menu.classList.toggle('open', open);
  menu.setAttribute('aria-hidden', open ? 'false' : 'true');
  btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeFileMenu() {
  const menu = $('fileMenu');
  const btn = $('fileBtn');
  if (!menu) return;
  menu.classList.remove('open');
  menu.setAttribute('aria-hidden', 'true');
  btn?.setAttribute('aria-expanded', 'false');
}
function toggleFileMenu() {
  const menu = $('fileMenu');
  const btn = $('fileBtn');
  if (!menu) return;
  const open = !menu.classList.contains('open');
  if (open && btn) {
    const rect = btn.getBoundingClientRect();
    const menuWidth = Math.min(220, window.innerWidth - 28);
    const left = Math.min(Math.max(10, rect.right - menuWidth), window.innerWidth - menuWidth - 10);
    menu.style.left = `${left}px`;
    menu.style.right = 'auto';
    menu.style.top = `${rect.bottom + 8}px`;
  }
  menu.classList.toggle('open', open);
  menu.setAttribute('aria-hidden', open ? 'false' : 'true');
  btn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) closeSettingsMenu();
}
function updateRootButton() {
  const btn = $('rootBtn');
  if (!btn) return;
  btn.textContent = rootIds.length ? `Start* ${rootIds.length}` : 'Start';
  btn.classList.toggle('primary', !!rootIds.length);
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
  const activePeople = data.people.filter(p => !p.pool);
  const ids = activePeople.map(p => p.id);
  const byId = new Map(activePeople.map(p => [p.id, p]));
  const links = new Map(ids.map(id => [id, new Set()]));

  const link = (a, b) => {
    if (!byId.has(a) || !byId.has(b)) return;
    links.get(a).add(b);
    links.get(b).add(a);
  };

  for (const p of activePeople) {
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
  const activePeople = data.people.filter(p => !p.pool);
  if (!activePeople.length) return;

  const top = 130;
  const ys = activePeople.map(p => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  for (const p of activePeople) {
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
  const tileTags = [p.occupation && p.occupation.slice(0,22), p.religion && p.religion.slice(0,22), p.location && p.location.slice(0,22), p.note && p.note.slice(0,22), confidenceText(p)].filter(Boolean).slice(0, 3);
  const tags = tileTags.length ? `<div class="tags">${tileTags.map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}</div>` : '';
  const display = visibleName(p);
  const title = fullName(p) !== display ? ` title="${esc(fullName(p))}"` : '';
  const cls = className ? ` class="${className}"` : '';
  return `<div${cls} data-member-id="${esc(p.id)}"><div class="avatar">${avatarHtml(p, display)}</div><h3${title}>${esc(display)}</h3>${meta}${tags}</div>`;
}

// -- Rendering ---------------------------------------------------------
function render() {
  updatePoolButton();
  updateWorldBounds();
  updateZoomClass();
  const visible = visibleIds();
  const visiblePeople = nonPoolPeople.filter(p => visible.has(p.id));
  const directIds = mainLineIds();
  const affiliateIds = new Set();
  const affiliateQueue = [...directIds];
  const affiliateSeen = new Set(directIds);
  while (affiliateQueue.length) {
    const id = affiliateQueue.shift();
    mutualPartnerIds(person(id)).forEach(partnerId => {
      if (affiliateSeen.has(partnerId)) return;
      affiliateSeen.add(partnerId);
      affiliateQueue.push(partnerId);
      if (!directIds.has(partnerId)) affiliateIds.add(partnerId);
    });
  }
  const zClass = zoomClass();
  nodes.innerHTML = '';
  lines.innerHTML = '';
  if (generationBands) generationBands.innerHTML = '';

  for (const p of visiblePeople) {
    if (!editMode) continue;
    for (const partnerId of partnerIds(p)) {
      if (!(p.id < partnerId) || !visible.has(partnerId)) continue;
      const q = person(partnerId);
      if (q && visible.has(q.id)) addLine(p.x, p.y, q.x, q.y, 'line partner');
    }
  }

  renderFamilyLines(visible, visiblePeople);

  const renderedCoupleMembers = new Set();
  const partnerCluster = start => {
    const members = [];
    const seen = new Set();
    const queue = [start.id];
    while (queue.length) {
      const id = queue.shift();
      if (!id || seen.has(id) || !visible.has(id)) continue;
      seen.add(id);
      const member = person(id);
      if (!member) continue;
      members.push(member);
      mutualPartnerIds(member).forEach(partnerId => {
        if (!seen.has(partnerId) && visible.has(partnerId)) queue.push(partnerId);
      });
    }
    return members;
  };
  for (const p of visiblePeople) {
    if (renderedCoupleMembers.has(p.id)) continue;
    const cluster = !editMode ? partnerCluster(p) : [p];
    const isCouple = !editMode && cluster.length > 1;
    if (isCouple) {
      cluster.forEach(member => renderedCoupleMembers.add(member.id));
      const members = [...cluster].sort((a,b) =>
        Number(directIds.has(b.id)) - Number(directIds.has(a.id)) ||
        (a.x - b.x) ||
        a.id.localeCompare(b.id)
      );
      const anchor = members.find(member => directIds.has(member.id)) || members[0];
      const el = document.createElement('div');
      const collapseId = members.find(member => hasChildren(member.id))?.id || '';
      const key = familyKey(anchor);
      const familyMuted = activeFamily && !members.some(member => matchesFamily(member, activeFamily));
      const sideLine = rootIds.length && !members.some(member => directIds.has(member.id) || affiliateIds.has(member.id));
      el.className = 'person couplePerson' + (members.length > 2 ? ' multiPartnerCard' : '') + zClass + (compactMode ? ' compact' : '') + (members.some(member => selected === member.id) ? ' selected' : '') + (members.some(member => focusMode && focusId === member.id) ? ' focusRoot' : '') + (members.some(member => isMainRoot(member.id)) ? ' rootPerson' : '') + (members.some(member => directIds.has(member.id)) ? ' directPerson' : '') + (sideLine ? ' sidePerson' : '') + (members.some(member => spotlightId === member.id) ? ' spotlight' : '') + (familyMuted ? ' familyMuted' : '') + (collapseId && collapsed.has(collapseId) ? ' collapsed' : '');
      const primaryPartner = person(anchor.partner) || members.find(member => member.id !== anchor.id);
      const positionMembers = members.length > 2 && primaryPartner
        ? [anchor, primaryPartner]
        : members;
      el.style.left = Math.round(positionMembers.reduce((sum, member) => sum + member.x, 0) / positionMembers.length) + 'px';
      el.style.top = Math.round(positionMembers.reduce((sum, member) => sum + member.y, 0) / positionMembers.length) + 'px';
      el.style.setProperty('--family-color', familyColor(key));
      el.style.setProperty('--partner-color', familyColor(familyKey(members[1])));
      el.dataset.id = anchor.id;
      const memberClass = member => `coupleMember${affiliateIds.has(member.id) ? ' affiliateMember' : ''}`;
      const memberHtml = members.length > 2
        ? `${personTileContent(anchor, memberClass(anchor))}<div class="partnerStack">${members.filter(member => member.id !== anchor.id).map(member => personTileContent(member, memberClass(member))).join('')}</div>`
        : members.map(member => personTileContent(member, memberClass(member))).join('');
      el.innerHTML = `<div class="coupleMembers">${memberHtml}</div>${collapseId ? `<button class="collapseBtn" title="Ast ein-/ausklappen">${collapsed.has(collapseId)?'+' : '−'}</button>` : ''}`;
      el.addEventListener('click', e => {
        e.stopPropagation();
        if (Date.now() < suppressOpenUntil) return;
        const member = e.target.closest('[data-member-id]');
        selected = member?.dataset.memberId || anchor.id;
        openSheet(selected);
      });
      el.addEventListener('touchend', e => {
        if (Date.now() < suppressOpenUntil) return;
        e.preventDefault();
        e.stopPropagation();
        const member = e.target.closest('[data-member-id]');
        selected = member?.dataset.memberId || anchor.id;
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
    const sideLine = rootIds.length && !directIds.has(p.id) && !affiliateIds.has(p.id);
    el.className = 'person' + zClass + (compactMode ? ' compact' : '') + (selected === p.id ? ' selected' : '') + (focusMode && focusId === p.id ? ' focusRoot' : '') + (isMainRoot(p.id) ? ' rootPerson' : '') + (directIds.has(p.id) ? ' directPerson' : '') + (affiliateIds.has(p.id) ? ' affiliatePerson' : '') + (sideLine ? ' sidePerson' : '') + (spotlightId === p.id ? ' spotlight' : '') + (familyMuted ? ' familyMuted' : '') + (drag?.branch && drag.positions?.has(p.id) ? ' branchDragging' : '') + (collapsed.has(p.id) ? ' collapsed' : '');
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.style.setProperty('--family-color', familyColor(key));
    el.dataset.id = p.id;
    if (editMode) el.title = 'Ziehen: Person bewegen · Shift + Ziehen: gesamten Ast bewegen';

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
function renderGenerationBands(visiblePeople) {
  const ys = visiblePeople
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
  const branchIds = e.shiftKey ? movableBranchIds(id) : new Set([id]);
  const positions = new Map([...branchIds].map(branchId => {
    const member = person(branchId);
    return [branchId, { x: member.x, y: member.y }];
  }));
  drag = { id, sx: e.clientX, sy: e.clientY, positions, branch: e.shiftKey, moved: false };
  if (drag.branch) {
    nodes.querySelectorAll('.person').forEach(el => el.classList.toggle('branchDragging', branchIds.has(el.dataset.id)));
  }
}

window.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = (e.clientX - drag.sx) / view.s;
  const dy = (e.clientY - drag.sy) / view.s;
  if (Math.abs(dx) + Math.abs(dy) > 7) drag.moved = true;
  if (drag.moved) {
    drag.positions.forEach((position, id) => {
      const member = person(id);
      if (!member) return;
      member.x = position.x + dx;
      member.y = position.y + dy;
    });
    scheduleRender();
  }
});

window.addEventListener('pointerup', e => {
  if (!drag) return;
  const id = drag.id;
  const moved = drag.moved;
  drag = null;
  nodes.querySelectorAll('.branchDragging').forEach(el => el.classList.remove('branchDragging'));
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
window.addEventListener('pointercancel', e => {
  clearTimeout(longPressTimer);
  main.releasePointerCapture?.(e.pointerId);
  pan = null;
  drag = null;
  selection = null;
  selectionRect.classList.add('hidden');
  nodes.querySelectorAll('.branchDragging').forEach(el => el.classList.remove('branchDragging'));
});

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
function ageInfo(p) {
  const born = parseBirthValue(p?.born);
  if (!born?.year) return '';
  const died = parseBirthValue(p?.died);
  const end = died?.year ? died : (() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), precision: 'day' };
  })();
  let age = end.year - born.year;
  if ((end.month || 12) < (born.month || 1) || ((end.month || 12) === (born.month || 1) && (end.day || 31) < (born.day || 1))) {
    age--;
  }
  if (age < 0 || age > 130) return '';
  const approximate = born.precision !== 'day' || (died && died.precision !== 'day');
  return `${approximate ? 'ca. ' : ''}${age} Jahre`;
}
function estimatedGenerationYear(p, depth, siblingIndex){
  const b = birthSortValue(p);
  if(b !== null) return Math.floor(b / 10000);
  return 1850 + depth * 30 + siblingIndex * 2;
}

// -- Automatic layout algorithm ----------------------------------------
function autoLayout(saveResult = true) {
  const activePeople = nonPoolPeople;
  if (!activePeople.length) return;

  const byId = new Map(activePeople.map(p => [p.id, p]));
  const childrenOf = new Map(activePeople.map(p => [p.id, []]));
  for (const p of activePeople) {
    for (const pid of p.parents || []) {
      if (childrenOf.has(pid)) childrenOf.get(pid).push(p);
    }
  }

  const pairGap = 186;
  const nodeGap = 36;
  const parentGroupGap = 86;
  const rootY = 130;
  const startX = 110;
  const singleCardWidth = 196;
  const coupleCardWidth = 322;
  const minSingle = 196;
  const minPair = 352;
  const fallbackRowGap = 185;
  const memo = new Map();
  const depthMemo = new Map();
  const childListMemo = new Map();
  const reachableMemo = new Map();
  const subtreeBranchMemo = new Map();
  const localPartnerIds = new Map(activePeople.map(p => [p.id, partnerIds(p).filter(id => byId.has(id))]));

  const hasParents = p => (p.parents || []).length > 0;
  const partnerIdsOf = p => localPartnerIds.get(p.id) || [];
  const partnerOf = p => partnerIdsOf(p).map(id => byId.get(id)).find(Boolean) || null;
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
    const key = [...ids].sort().join('|');
    if (childListMemo.has(key)) return childListMemo.get(key);
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

    childListMemo.set(key, out);
    return out;
  }

  function reachableIds(ids) {
    const key = [...ids].sort().join('|');
    if (reachableMemo.has(key)) return new Set(reachableMemo.get(key));
    const reached = new Set();
    const stack = [...ids];
    while (stack.length) {
      const id = stack.pop();
      if (!id || reached.has(id)) continue;
      reached.add(id);
      const p = byId.get(id);
      partnerIdsOf(p).forEach(partnerId => { if (!reached.has(partnerId)) stack.push(partnerId); });
      for (const child of childrenOf.get(id) || []) {
        if (!reached.has(child.id)) stack.push(child.id);
      }
    }
    ids.forEach(id => reached.delete(id));
    reachableMemo.set(key, [...reached]);
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

  for (const p of activePeople) {
    if (p.pool) continue;
    if (hasParents(p) || used.has(p.id)) continue;
    if (partnerIdsOf(p).some(pid => hasParents(byId.get(pid)))) {
      used.add(p.id);
      continue;
    }
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

  function rootGenerationDistances() {
    const distances = new Map();
    for (const root of rootCandidates) {
      const queue = unitIds(root)
        .filter(id => byId.has(id))
        .map(id => ({ id, depth: 0 }));
      const seen = new Set();

      while (queue.length) {
        const item = queue.shift();
        if (!item.id || seen.has(item.id)) continue;
        seen.add(item.id);

        if (!distances.has(item.id)) distances.set(item.id, new Map());
        const roots = distances.get(item.id);
        if (!roots.has(root.id) || item.depth < roots.get(root.id)) {
          roots.set(root.id, item.depth);
        }

        for (const child of childrenOf.get(item.id) || []) {
          queue.push({ id: child.id, depth: item.depth + 1 });
        }
      }
    }
    return distances;
  }

  function generationOffsetsForBridgePairs() {
    const distances = rootGenerationDistances();
    const graph = new Map(rootCandidates.map(root => [root.id, []]));
    const seenPairs = new Set();
    const bestConstraints = new Map();

    const addConstraint = (fromRoot, toRoot, delta) => {
      if (fromRoot === toRoot || !graph.has(fromRoot) || !graph.has(toRoot)) return;
      graph.get(fromRoot).push({ id: toRoot, delta });
      graph.get(toRoot).push({ id: fromRoot, delta: -delta });
    };

    for (const p of activePeople) {
      if (!hasParents(p)) continue;
      for (const partnerId of partnerIdsOf(p)) {
        const q = byId.get(partnerId);
        if (!q || !hasParents(q)) continue;
        const pairKey = [p.id, q.id].sort().join('|');
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        const pRoots = distances.get(p.id);
        const qRoots = distances.get(q.id);
        if (!pRoots || !qRoots) continue;

        for (const [pRoot, pDepth] of pRoots.entries()) {
          for (const [qRoot, qDepth] of qRoots.entries()) {
            if (pRoot === qRoot) continue;
            const rootsKey = [pRoot, qRoot].sort().join('|');
            const score = Math.max(pDepth, qDepth);
            const current = bestConstraints.get(rootsKey);
            if (!current || score < current.score) {
              bestConstraints.set(rootsKey, {
                fromRoot: pRoot,
                toRoot: qRoot,
                delta: pDepth - qDepth,
                score
              });
            }
          }
        }
      }
    }

    for (const constraint of bestConstraints.values()) {
      addConstraint(constraint.fromRoot, constraint.toRoot, constraint.delta);
    }

    const offsets = new Map(rootCandidates.map(root => [root.id, 0]));
    const visited = new Set();
    for (const root of rootCandidates) {
      if (visited.has(root.id)) continue;
      const queue = [root.id];
      visited.add(root.id);

      while (queue.length) {
        const rootId = queue.shift();
        const current = offsets.get(rootId) || 0;
        for (const edge of graph.get(rootId) || []) {
          if (visited.has(edge.id)) continue;
          offsets.set(edge.id, current + edge.delta);
          visited.add(edge.id);
          queue.push(edge.id);
        }
      }
    }

    const minOffset = Math.min(0, ...offsets.values());
    if (minOffset < 0) {
      for (const [rootId, offset] of offsets.entries()) offsets.set(rootId, offset - minOffset);
    }

    return { offsets, graph };
  }

  const bridgeLayout = generationOffsetsForBridgePairs();
  const rootGenerationOffsets = bridgeLayout.offsets;

  function orderRootsByBridgeAffinity() {
    const originalIndex = new Map(rootCandidates.map((root, index) => [root.id, index]));
    const directIds = mainLineIds();
    const mainRoots = rootCandidates
      .filter(root => directIds.has(root.id) || unitIds(root).some(id => directIds.has(id)))
      .sort((a, b) => originalIndex.get(a.id) - originalIndex.get(b.id));
    const ordered = [];
    const visited = new Set();
    const queue = [];

    // Direct roots must claim the shared descendants before roots from
    // partner-side ancestry get a chance to reserve that same subtree.
    for (const root of mainRoots) {
      if (visited.has(root.id)) continue;
      visited.add(root.id);
      ordered.push(root);
      queue.push(root.id);
    }

    const appendBridgeNeighbors = () => {
      while (queue.length) {
        const id = queue.shift();
        const neighbors = (bridgeLayout.graph.get(id) || [])
          .map(edge => byId.get(edge.id))
          .filter(root => root && !visited.has(root.id))
          .sort((a, b) => subtreeWidth(b.id) - subtreeWidth(a.id) || originalIndex.get(a.id) - originalIndex.get(b.id));
        for (const root of neighbors) {
          visited.add(root.id);
          ordered.push(root);
          queue.push(root.id);
        }
      }
    };
    appendBridgeNeighbors();

    for (const seed of rootCandidates) {
      if (visited.has(seed.id)) continue;
      visited.add(seed.id);
      ordered.push(seed);
      queue.push(seed.id);
      appendBridgeNeighbors();
    }
    rootCandidates.splice(0, rootCandidates.length, ...ordered);
  }
  orderRootsByBridgeAffinity();

  function yForPerson(p, fallbackDepth, siblingIndex = 0){
    const depth = Number.isFinite(fallbackDepth) ? fallbackDepth : depthOf(p);
    return Math.round(rootY + depth * fallbackRowGap);
  }

  const placed = new Set();
  const rootBranchIds = [];

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

  function compactThinSiblingUnits() {
    const groups = new Map();
    for (const child of activePeople) {
      const key = parentGroupKey(child.parents || []);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(child);
    }

    for (const siblings of groups.values()) {
      if (siblings.length < 2) continue;
      const siblingIds = new Set(siblings.map(child => child.id));
      const thinUnits = [];
      const thinIds = new Set();
      const seenUnits = new Set();

      for (const child of siblings) {
        if ((childrenOf.get(child.id) || []).length || collapsed.has(child.id)) continue;
        const members = [child];
        for (const partnerId of partnerIds(child)) {
          const partner = byId.get(partnerId);
          if (!partner) continue;
          if ((childrenOf.get(partner.id) || []).length) continue;
          members.push(partner);
        }
        const unitKey = members.map(member => member.id).sort().join('|');
        if (seenUnits.has(unitKey)) continue;
        seenUnits.add(unitKey);
        const xs = members.map(member => member.x);
        thinUnits.push({
          child,
          members,
          center: xs.reduce((sum, x) => sum + x, 0) / xs.length,
          width: Math.max(minSingle, Math.max(...xs) - Math.min(...xs) + minSingle)
        });
        members.forEach(member => {
          if (siblingIds.has(member.id)) thinIds.add(member.id);
        });
      }

      const anchors = siblings.filter(child => !thinIds.has(child.id));
      if (!thinUnits.length) continue;

      const parentIds = siblings[0].parents || [];
      const parentCenter = parentIds
        .map(id => byId.get(id))
        .filter(Boolean)
        .reduce((sum, parent, idx, arr) => sum + parent.x / arr.length, 0);
      const occupied = anchors.map(child => ({
        center: child.x,
        width: partnerIds(child).some(id => byId.has(id)) ? coupleCardWidth : singleCardWidth
      }));
      const anchorCenter = occupied.length
        ? occupied.reduce((sum, item) => sum + item.center, 0) / occupied.length
        : parentCenter || siblings.reduce((sum, child) => sum + child.x, 0) / siblings.length;
      const y = Math.round(siblings.reduce((sum, child) => sum + child.y, 0) / siblings.length);
      const fits = (center, width) => occupied.every(item =>
        Math.abs(item.center - center) >= (item.width + width) / 2 + 24
      );

      thinUnits
        .sort((a,b) => (birthSortValue(a.child) ?? Infinity) - (birthSortValue(b.child) ?? Infinity) || a.center - b.center)
        .forEach(unit => {
          const candidates = [anchorCenter];
          for (const item of occupied) {
            const distance = (item.width + unit.width) / 2 + 24;
            candidates.push(item.center - distance, item.center + distance);
          }
          const target = Math.round(candidates
            .filter(candidate => fits(candidate, unit.width))
            .sort((a, b) => Math.abs(a - parentCenter) - Math.abs(b - parentCenter) || a - b)[0] ?? anchorCenter);
          const delta = target - unit.center;
          unit.members.forEach(member => {
            member.x = Math.round(member.x + delta);
            member.y = y;
          });
          occupied.push({ center: target, width: unit.width });
        });
    }
  }

  function compactSiblingSubtrees() {
    const groups = new Map();
    for (const child of activePeople) {
      const key = parentGroupKey(child.parents || []);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(child);
    }

    const branchIdsFor = (startId, blockedRootIds) => {
      const ids = new Set();
      const queue = [startId];
      while (queue.length) {
        const id = queue.shift();
        if (!id || ids.has(id) || !byId.has(id) || (id !== startId && blockedRootIds.has(id))) continue;
        ids.add(id);
        partnerIds(byId.get(id)).forEach(partnerId => queue.push(partnerId));
        (childrenOf.get(id) || []).forEach(child => queue.push(child.id));
      }
      return ids;
    };
    const boundsFor = ids => {
      const people = [...ids].map(id => byId.get(id)).filter(Boolean);
      return {
        min: Math.min(...people.map(p => p.x)) - singleCardWidth / 2,
        max: Math.max(...people.map(p => p.x)) + singleCardWidth / 2
      };
    };

    [...groups.values()]
      .filter(siblings => siblings.length > 1)
      .sort((a, b) => Math.max(...b.map(person => depthOf(person))) - Math.max(...a.map(person => depthOf(person))))
      .forEach(siblings => {
        const units = [];
        const claimed = new Set();
        const siblingIds = new Set(siblings.map(sibling => sibling.id));
        siblings
          .sort((a,b) => a.x - b.x)
          .forEach(child => {
            const ids = branchIdsFor(child.id, siblingIds);
            const exclusiveIds = new Set([...ids].filter(id => !claimed.has(id)));
            exclusiveIds.forEach(id => claimed.add(id));
            if (!exclusiveIds.size) return;
            const bounds = boundsFor(exclusiveIds);
            units.push({ ids: exclusiveIds, min: bounds.min, max: bounds.max, width: bounds.max - bounds.min });
          });
        if (units.length < 2) return;

        const parents = (siblings[0].parents || [])
          .map(id => byId.get(id))
          .filter(Boolean);
        const parentCenter = parents.length
          ? parents.reduce((sum, parent) => sum + parent.x, 0) / parents.length
          : null;
        const totalWidth = units.reduce((sum, unit) => sum + unit.width, 0) + (units.length - 1) * 54;
        const groupCenter = parentCenter !== null
          ? parentCenter
          : (units[0].min + units[units.length - 1].max) / 2;
        let cursor = Math.round(groupCenter - totalWidth / 2);
        units.forEach(unit => {
          const delta = Math.round(cursor - unit.min);
          unit.ids.forEach(id => {
            const member = byId.get(id);
            if (member) member.x = Math.round(member.x + delta);
          });
          cursor += unit.width + 54;
        });
      });
  }

  function alignPartnerClusters() {
    const handled = new Set();
    for (const p of activePeople) {
      const partners = partnerIdsOf(p).map(id => byId.get(id)).filter(Boolean);
      if (partners.length < 2) continue;

      const clusterKey = [p.id, ...partners.map(q => q.id)].sort().join('|');
      if (handled.has(clusterKey)) continue;
      handled.add(clusterKey);

      const primary = byId.get(p.partner) || partners[0];
      const secondary = partners
        .filter(q => q.id !== primary?.id)
        .sort((a,b) => (birthSortValue(a) ?? Infinity) - (birthSortValue(b) ?? Infinity) || fullName(a).localeCompare(fullName(b)));
      if (!secondary.length) continue;

      const primaryOnRight = !primary || primary.x >= p.x;
      const direction = primaryOnRight ? -1 : 1;
      secondary.forEach((partner, idx) => {
        partner.x = Math.round(p.x + direction * pairGap * (idx + 1));
        partner.y = p.y;
      });
    }
  }

  function anchorInLawAncestorBranches() {
    const directIds = mainLineIds();
    if (!directIds.size) return;
    const shifted = new Set();

    const ancestorBranchIds = partner => {
      const ids = new Set([partner.id]);
      const queue = [...(partner.parents || []), ...partnerIdsOf(partner).filter(id => !directIds.has(id))];
      while (queue.length) {
        const id = queue.shift();
        if (!id || ids.has(id) || directIds.has(id)) continue;
        const current = byId.get(id);
        if (!current) continue;
        ids.add(id);
        (current.parents || []).forEach(parentId => queue.push(parentId));
        partnerIdsOf(current).forEach(partnerId => {
          if (!directIds.has(partnerId)) queue.push(partnerId);
        });
      }
      const branchQueue = [...ids];
      while (branchQueue.length) {
        const id = branchQueue.shift();
        for (const child of childrenOf.get(id) || []) {
          if (directIds.has(child.id) || ids.has(child.id) || !byId.has(child.id)) continue;
          ids.add(child.id);
          branchQueue.push(child.id);
          partnerIdsOf(child).forEach(partnerId => {
            if (directIds.has(partnerId) || ids.has(partnerId) || !byId.has(partnerId)) return;
            ids.add(partnerId);
            branchQueue.push(partnerId);
          });
        }
      }
      return ids;
    };
    const sideDescendantIds = startId => {
      if (subtreeBranchMemo.has(startId)) return new Set(subtreeBranchMemo.get(startId));
      const ids = new Set();
      const queue = [startId];
      while (queue.length) {
        const id = queue.shift();
        if (!id || ids.has(id) || directIds.has(id) || !byId.has(id)) continue;
        ids.add(id);
        partnerIdsOf(byId.get(id)).forEach(partnerId => {
          if (!directIds.has(partnerId)) queue.push(partnerId);
        });
        (childrenOf.get(id) || []).forEach(child => {
          if (!directIds.has(child.id)) queue.push(child.id);
        });
      }
      subtreeBranchMemo.set(startId, [...ids]);
      return ids;
    };

    for (const mainPerson of activePeople.filter(p => directIds.has(p.id))) {
      for (const partnerId of partnerIdsOf(mainPerson)) {
        const partner = byId.get(partnerId);
        if (!partner || directIds.has(partner.id) || shifted.has(partner.id)) continue;
        const branchIds = ancestorBranchIds(partner);
        const direction = partner.x >= mainPerson.x ? 1 : -1;
        const targetX = Math.round(mainPerson.x + direction * pairGap);
        const delta = targetX - partner.x;
        branchIds.forEach(id => {
          const member = byId.get(id);
          if (!member) return;
          member.x = Math.round(member.x + delta);
          shifted.add(id);
        });
        partner.y = mainPerson.y;

        const sideChildren = (childrenOf.get(partner.id) || [])
          .filter(child => !directIds.has(child.id) && !(child.parents || []).some(parentId => directIds.has(parentId)))
          .sort((a,b) => (birthSortValue(a) ?? Infinity) - (birthSortValue(b) ?? Infinity) || a.x - b.x);
        const step = 224;
        const sideCenterX = Math.round(partner.x + direction * pairGap * .72);
        sideChildren.forEach((child, index) => {
          const centeredIndex = index - (sideChildren.length - 1) / 2;
          const targetChildX = Math.round(sideCenterX + centeredIndex * step);
          const childDelta = targetChildX - child.x;
          sideDescendantIds(child.id).forEach(id => {
            const member = byId.get(id);
            if (member) member.x = Math.round(member.x + childDelta);
          });
        });
      }
    }
  }

  function resolveRowOverlaps() {
    const rowTolerance = 92;
    const minGap = 18;
    const usedInUnit = new Set();
    const units = [];

    const sameRow = (a, b) => Math.abs(a.y - b.y) <= 8;
    for (const p of activePeople) {
      if (p.pool) continue;
      if (usedInUnit.has(p.id)) continue;
      const partner = partnerIdsOf(p)
        .map(id => byId.get(id))
        .find(q => q && !usedInUnit.has(q.id) && sameRow(p, q));
      if (partner) {
        const members = [p, partner].sort((a,b) => a.x - b.x || a.id.localeCompare(b.id));
        members.forEach(member => usedInUnit.add(member.id));
        const minX = Math.min(...members.map(member => member.x));
        const maxX = Math.max(...members.map(member => member.x));
        const center = (minX + maxX) / 2;
        units.push({
          members,
          center,
          y: Math.round(members.reduce((sum, member) => sum + member.y, 0) / members.length),
          width: Math.max(coupleCardWidth, maxX - minX + singleCardWidth)
        });
      } else {
        usedInUnit.add(p.id);
        units.push({ members: [p], center: p.x, y: p.y, width: singleCardWidth });
      }
    }

    const rows = [];
    for (const unit of units.sort((a,b) => a.y - b.y || a.center - b.center)) {
      const row = rows.find(item => Math.abs(item.y - unit.y) <= rowTolerance);
      if (row) {
        row.units.push(unit);
        row.y = row.units.reduce((sum, item) => sum + item.y, 0) / row.units.length;
      } else {
        rows.push({ y: unit.y, units: [unit] });
      }
    }

    for (const row of rows) {
      const rowUnits = row.units.sort((a,b) => a.center - b.center);
      let rightEdge = -Infinity;
      for (const unit of rowUnits) {
        const half = unit.width / 2;
        const minCenter = rightEdge + minGap + half;
        const target = Math.max(unit.center, minCenter);
        const delta = Math.round(target - unit.center);
        if (delta) {
          unit.members.forEach(member => {
            member.x = Math.round(member.x + delta);
          });
          unit.center += delta;
        }
        rightEdge = unit.center + half;
      }
    }
  }

  function packRelationComponents() {
    const componentGap = 96;
    let nextLeft = startX;

    const boxes = relationComponents()
      .map(ids => {
        const people = ids.map(id => byId.get(id)).filter(Boolean);
        if (!people.length) return null;
        return {
          people,
          minX: Math.min(...people.map(p => p.x)),
          maxX: Math.max(...people.map(p => p.x)),
          minY: Math.min(...people.map(p => p.y)),
          count: people.length
        };
      })
      .filter(Boolean)
      .sort((a,b) => a.minX - b.minX || b.count - a.count || a.minY - b.minY);

    for (const box of boxes) {
      const targetLeft = Math.max(startX, nextLeft);
      const delta = Math.round(targetLeft - box.minX);
      if (delta) {
        box.people.forEach(p => { p.x = Math.round(p.x + delta); });
        box.maxX += delta;
      }
      nextLeft = box.maxX + componentGap;
    }
  }

  let left = startX;
  rootCandidates.forEach((r, idx) => {
    const before = new Set(placed);
    const w = subtreeWidth(r.id);
    place(r.id, left, rootGenerationOffsets.get(r.id) || 0, idx);
    const ids = new Set([...placed].filter(id => !before.has(id)));
    if (ids.size) rootBranchIds.push(ids);
    left += w + 18;
  });

  activePeople.forEach((p, idx) => {
    if (placed.has(p.id) || used.has(p.id)) return;
    const before = new Set(placed);
    const w = subtreeWidth(p.id);
    place(p.id, left, depthOf(p), idx);
    const ids = new Set([...placed].filter(id => !before.has(id)));
    if (ids.size) rootBranchIds.push(ids);
    left += w + 18;
  });

  function packRootBranches() {
    const branchGap = 96;
    let cursor = startX;
    for (const ids of rootBranchIds) {
      const people = [...ids].map(id => byId.get(id)).filter(Boolean);
      if (!people.length) continue;
      const minX = Math.min(...people.map(person => person.x - singleCardWidth / 2));
      const maxX = Math.max(...people.map(person => person.x + singleCardWidth / 2));
      const delta = Math.round(cursor - minX);
      people.forEach(person => { person.x = Math.round(person.x + delta); });
      cursor += maxX - minX + branchGap;
    }
  }

  function compressEmptyHorizontalSpace() {
    const maxEmptyGap = 620;
    const columns = new Map();
    for (const person of activePeople) {
      const x = Math.round(person.x);
      if (!columns.has(x)) columns.set(x, []);
      columns.get(x).push(person);
    }

    let offset = 0;
    let previousX = null;
    for (const [originalX, people] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
      let targetX = originalX - offset;
      if (previousX !== null && targetX - previousX > maxEmptyGap) {
        offset += targetX - previousX - maxEmptyGap;
        targetX = originalX - offset;
      }
      people.forEach(person => { person.x = targetX; });
      previousX = targetX;
    }
  }

  function interlockRootBranches() {
    const cardGap = singleCardWidth + 28;
    const rowTolerance = 96;
    const branches = rootBranchIds
      .map(ids => ({
        ids,
        people: [...ids].map(id => byId.get(id)).filter(Boolean)
      }))
      .filter(branch => branch.people.length)
      .sort((a, b) =>
        Math.min(...a.people.map(person => person.x)) - Math.min(...b.people.map(person => person.x))
      );
    const occupied = [];

    for (const branch of branches) {
      const minX = Math.min(...branch.people.map(person => person.x));
      let minimumDelta = startX - minX;
      for (const person of branch.people) {
        for (const fixed of occupied) {
          if (Math.abs(person.y - fixed.y) > rowTolerance) continue;
          minimumDelta = Math.max(minimumDelta, fixed.x + cardGap - person.x);
        }
      }
      const delta = Math.min(0, Math.round(minimumDelta));
      if (delta) branch.people.forEach(person => { person.x = Math.round(person.x + delta); });
      occupied.push(...branch.people);
    }
  }

  resolveRowOverlaps();
  packRelationComponents();
  compactSiblingSubtrees();
  compactThinSiblingUnits();
  packRootBranches();
  alignPartnerClusters();
  anchorInLawAncestorBranches();
  interlockRootBranches();
  compressEmptyHorizontalSpace();

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
  const existingPartners = new Set(partnerIds(person(current)).filter(id => !removedPartnerDraft.has(id)));
  $('partner').innerHTML = partnerOpt(data.people.filter(p => p.id !== current && !existingPartners.has(p.id)).sort((a,b) => fullName(a).localeCompare(fullName(b))));
  $('partner').value = selectedPartner;
}

function renderCurrentPartners(p) {
  const container = $('currentPartners');
  if (!container) return;
  const partners = partnerIds(p).filter(id => !removedPartnerDraft.has(id)).map(person).filter(Boolean);
  container.innerHTML = partners.length
    ? partners.map(partner => `
      <span class="partnerChip">
        <span class="partnerChipAvatar" style="--family-color:${esc(familyColor(familyKey(partner)))}">${avatarHtml(partner)}</span>
        <span class="partnerChipName">${esc(fullName(partner) || partner.name)}</span>
        ${editMode
          ? `<input class="partnerMarriageDate" data-marriage-partner="${esc(partner.id)}" value="${esc(marriageDraft[partner.id] || '')}" placeholder="Heiratsdatum" aria-label="Heiratsdatum mit ${esc(fullName(partner) || partner.name)}" />`
          : marriageDraft[partner.id] ? `<small>verh. ${esc(formatBirthDate(marriageDraft[partner.id]))}</small>` : ''}
        ${editMode ? `<button type="button" class="partnerRemove" data-remove-partner="${esc(partner.id)}" aria-label="Beziehung zu ${esc(fullName(partner) || partner.name)} entfernen">×</button>` : ''}
      </span>
    `).join('')
    : '<span class="partnerEmpty">Noch keine Partner/in verknüpft</span>';
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

function updateImagePreview() {
  const preview = $('imagePreview');
  if (!preview) return;
  preview.innerHTML = imageDraft ? `<img src="${esc(imageDraft)}" alt="" />` : '';
  const editable = editMode || !person(selected);
  if ($('clearImageBtn')) $('clearImageBtn').disabled = !editable || !imageDraft;
}

function cleanMentions(items = mentionsDraft) {
  return items
    .map(item => ({
      title: String(item?.title || '').trim(),
      date: String(item?.date || '').trim(),
      link: String(item?.link || '').trim()
    }))
    .filter(item => item.title || item.date || item.link);
}
function renderMentionEditor() {
  const container = $('mentionRows');
  if (!container) return;
  container.innerHTML = mentionsDraft.map((item, index) => `
    <div class="mentionRow" data-mention-index="${index}">
      <input data-mention-key="title" value="${esc(item.title)}" placeholder="Titel / Quelle" aria-label="Titel der Erwähnung" />
      <input class="mentionDate" data-mention-key="date" value="${esc(item.date)}" placeholder="Datum" aria-label="Datum der Erwähnung" />
      <input class="mentionLink" data-mention-key="link" value="${esc(item.link)}" type="url" inputmode="url" placeholder="Link, optional" aria-label="Link der Erwähnung" />
      <button type="button" class="mentionRemove" data-remove-mention="${index}" aria-label="Erwähnung entfernen">×</button>
    </div>
  `).join('');
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
    occupation: $('occupation')?.value || '',
    religion: $('religion')?.value || '',
    location: $('location')?.value || '',
    link: $('personLink')?.value || '',
    image: imageDraft || '',
    mentions: cleanMentions(),
    pool: $('inPool')?.checked || false,
    mainRoot: $('mainRoot')?.checked || false,
    note: $('note')?.value || '',
    confidence: $('confidence')?.value || 'high',
    parent1: $('parent1')?.value || '',
    parent2: $('parent2')?.value || '',
    partner: $('partner')?.value || '',
    newMarriageDate: $('partnerMarriageDate')?.value || '',
    marriages: marriageDraft,
    removedPartners: [...removedPartnerDraft].sort()
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
function siblingList(p) {
  const parents = new Set(p?.parents || []);
  if (!parents.size) return [];
  return data.people
    .filter(other => other.id !== p.id && (other.parents || []).some(pid => parents.has(pid)))
    .sort((a,b) => (birthSortValue(a) ?? Infinity) - (birthSortValue(b) ?? Infinity) || fullName(a).localeCompare(fullName(b)));
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
  const partnerDetails = partners.length
    ? `<div class="detailLinks">${partners.map(partner => {
        const married = marriageDateFor(p, partner.id);
        return `<button type="button" class="detailLink" data-id="${esc(partner.id)}">${esc(fullName(partner) || partner.name)}${married ? ` · verh. ${esc(formatBirthDate(married))}` : ''}</button>`;
      }).join('')}</div>`
    : '<span class="detailValue">Offen</span>';
  const siblings = siblingList(p);
  const children = data.people
    .filter(child => (child.parents || []).includes(p.id))
    .sort((a,b) => (birthSortValue(a) ?? Infinity) - (birthSortValue(b) ?? Infinity) || fullName(a).localeCompare(fullName(b)));
  const dates = [
    p.born ? `geb. ${formatBirthDate(p.born)}` : '',
    p.died ? `gest. ${p.died}` : '',
    ageInfo(p)
  ].filter(Boolean).join(' · ') || 'Lebensdaten offen';
  const confidence = confidenceText(p);
  const link = safeUrl(p.link);
  const mentions = cleanMentions(p.mentions);
  const mentionHtml = mentions.map(item => {
    const url = safeUrl(item.link);
    const title = url
      ? `<a class="detailValue" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(item.title || item.link)}</a>`
      : `<div class="detailValue">${esc(item.title || item.link || 'Erwähnung')}</div>`;
    return `<div class="mentionItem">${title}${item.date ? `<small>${esc(item.date)}</small>` : ''}</div>`;
  }).join('');

  details.innerHTML = `
    <div class="detailHero" style="--family-color:${esc(familyColor(familyKey(p)))}">
      <div class="detailAvatar">${avatarHtml(p)}</div>
      <div>
        <div class="detailName">${esc(displayName(p))}</div>
        <div class="detailMeta">${esc(dates)}</div>
      </div>
    </div>
    <div class="detailGrid">
      ${isMainRoot(p.id) ? '<div class="detailBox full"><span class="detailLabel">Hauptwurzel</span><div class="detailValue">Ausgangspunkt des Stammbaums</div></div>' : ''}
      <div class="detailBox"><span class="detailLabel">Partner/in</span>${partnerDetails}</div>
      <div class="detailBox"><span class="detailLabel">Eltern</span>${relationButtons(parents)}</div>
      <div class="detailBox full"><span class="detailLabel">Geschwister</span>${siblings.length ? relationButtons(siblings) : '<span class="detailValue">Keine eingetragen</span>'}</div>
      <div class="detailBox full"><span class="detailLabel">Kinder</span>${relationButtons(children)}</div>
      ${p.occupation ? `<div class="detailBox"><span class="detailLabel">Beruf</span><div class="detailValue">${esc(p.occupation)}</div></div>` : ''}
      ${p.religion ? `<div class="detailBox"><span class="detailLabel">Glaubensrichtung</span><div class="detailValue">${esc(p.religion)}</div></div>` : ''}
      ${p.location ? `<div class="detailBox"><span class="detailLabel">Ort</span><div class="detailValue">${esc(p.location)}</div></div>` : ''}
      ${link ? `<div class="detailBox full"><span class="detailLabel">Link</span><a class="detailValue" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(p.link)}</a></div>` : ''}
      ${mentionHtml ? `<div class="detailBox full"><span class="detailLabel">Erwähnungen / Quellen</span><div class="mentionList">${mentionHtml}</div></div>` : ''}
      ${confidence ? `<div class="detailBox full"><span class="detailLabel">Sicherheit</span><div class="detailValue">${esc(confidenceLabel(p.confidence))}</div></div>` : ''}
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
  $('occupation').value = p?.occupation || '';
  $('religion').value = p?.religion || '';
  $('location').value = p?.location || '';
  $('personLink').value = p?.link || '';
  imageDraft = p?.image || '';
  updateImagePreview();
  mentionsDraft = (p?.mentions || []).map(item => ({ ...item }));
  removedPartnerDraft = new Set();
  marriageDraft = Object.fromEntries(partnerIds(p).map(partnerId => [partnerId, marriageDateFor(p, partnerId)]));
  renderMentionEditor();
  $('note').value = p?.note || '';
  $('confidence').value = p?.confidence || 'high';
  $('inPool').checked = !!p?.pool;
  $('mainRoot').checked = !!p && isMainRoot(p.id);
  fillSelects(id, p?.parents?.[0] || '', p?.parents?.[1] || '');
  $('partnerMarriageDate').value = '';
  renderCurrentPartners(p);
  applyPersonFieldSettings();
  sheetSnapshot = formSnapshot();
  renderPersonDetails(p);

  const editable = editMode || !p;
  ['firstName','lastName','nickname','born','died','birthName','occupation','religion','location','personLink','note','confidence','inPool','mainRoot','parent1','parent2','partner','partnerMarriageDate'].forEach(id => {
    const el = $(id);
    if (el) el.disabled = !editable;
  });
  $('partnerMarriageDate').disabled = !editable || !$('partner').value;
  $('chooseImageBtn').disabled = !editable;
  $('clearImageBtn').disabled = !editable || !imageDraft;
  $('addMentionBtn').disabled = !editable;
  $('mentionRows').querySelectorAll('input,button').forEach(el => { el.disabled = !editable; });
  $('inPool').disabled = !editable;
  $('mainRoot').disabled = !editable;
  $('inPool').title = p ? `${poolBranchIds(p.id).size} Person(en) in diesem Zweig` : '';
  $('deleteBtn').style.display = p && editMode ? 'block' : 'none';
  $('saveBtn').style.display = editable ? 'block' : 'none';
  setDialogVisibility($('sheet'), true);
  showBackdrop(true);
}

function closeSheet(force = false) {
  if (!force && !confirmDiscardSheetChanges()) return false;
  const returnMode = listReturnMode;
  listReturnMode = '';
  selected = null;
  sheetSnapshot = '';
  imageDraft = '';
  mentionsDraft = [];
  removedPartnerDraft = new Set();
  marriageDraft = {};
  setDialogVisibility($('sheet'), false);
  showBackdrop(false);
  render();
  if (returnMode) setTimeout(() => openListEditor(returnMode), 0);
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
  const link = $('personLink').value.trim();
  const confidence = $('confidence').value || 'high';
  const parents = [$('parent1').value, $('parent2').value].filter(Boolean);
  const newPartner = $('partner').value;
  const newMarriageDate = $('partnerMarriageDate').value.trim();
  const keepBranchInPool = $('inPool').checked;
  const makeMainRoot = $('mainRoot').checked;

  if (!validatePersonForm(selected, parents, newPartner, born, died)) return false;
  if (makeMainRoot && keepBranchInPool) {
    alert('Die Hauptwurzel kann nicht gleichzeitig im Vorrat liegen.');
    return false;
  }
  if (makeMainRoot && !isMainRoot(selected) && rootIds.length >= 2) {
    alert('Es können höchstens zwei Hauptwurzeln festgelegt werden.');
    return false;
  }
  const invalidMarriageDate = [...Object.values(marriageDraft), newPartner ? newMarriageDate : ''].find(value => !isValidDateInput(value));
  if (invalidMarriageDate) {
    alert('Heiratsdatum bitte als Jahr, MM.JJJJ oder TT.MM.JJJJ eingeben.');
    return false;
  }
  if (p && keepBranchInPool && !p.pool) {
    const branchSize = poolBranchIds(p.id).size;
    if (!confirm(`${branchSize} Person(en) dieses Zweigs in den Vorrat verschieben?\n\nDie Verknüpfungen bleiben erhalten, der Zweig verschwindet aber aus der normalen Anzeige.`)) return false;
  }

  if (!p) {
    const pos = pendingNewPos || screenToWorld(main.getBoundingClientRect().left + main.clientWidth / 2, main.getBoundingClientRect().top + main.clientHeight / 2);
    p = { id: nextId(), name: '', born: '', died: '', birthName: '', occupation: '', religion: '', location: '', link: '', image: '', mentions: [], pool: false, note: '', confidence: 'high', x: pos.x, y: pos.y, parents: [], partner: '', partners: [] };
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
  p.occupation = $('occupation').value.trim();
  p.religion = $('religion').value.trim();
  p.location = $('location').value.trim();
  p.link = link;
  p.image = imageDraft;
  p.mentions = cleanMentions();
  p.note = $('note').value.trim();
  p.confidence = confidence;
  p.parents = parents;
  if (makeMainRoot && !isMainRoot(p.id)) {
    rootIds.push(p.id);
  } else if (!makeMainRoot) {
    rootIds = rootIds.filter(id => id !== p.id);
  }
  for (const partnerId of removedPartnerDraft) removePartnerLink(p, partnerId, true);
  for (const [partnerId, married] of Object.entries(marriageDraft)) {
    const q = person(partnerId);
    if (q && !removedPartnerDraft.has(partnerId)) setMarriageDate(p, q, married, true);
  }
  parents.map(person).filter(Boolean).forEach((parent, index) => {
    if (parent.pool && !keepBranchInPool) {
      parent.x = Math.round(p.x + (index === 0 ? -120 : 120));
      parent.y = Math.round(p.y - 260);
      setPoolBranch(parent.id, false);
    }
  });

  if (newPartner) {
    const q = person(newPartner);
    if (q && !partnerIds(p).includes(q.id)) {
      if (q.pool && !keepBranchInPool) {
        q.x = Math.round(p.x + 230);
        q.y = Math.round(p.y);
        setPoolBranch(q.id, false);
      }
      const reciprocal = !partnerIds(p).length || confirm('Partner/in auch bei der anderen Person eintragen?\n\nOK = gegenseitig verknüpfen\nAbbrechen = nur bei dieser Person eintragen');
      linkPartners(p, q, reciprocal);
      setMarriageDate(p, q, newMarriageDate, reciprocal);
    }
  }
  setPoolBranch(p.id, keepBranchInPool);

  withPreservedView(() => {
    resetGeneratedLayout();
    if (!save()) return;
    render();
    if($('sideNav')?.classList.contains('open')) renderNavigator();
    if($('listSheet')?.classList.contains('open')) renderListEditor();
    updatePoolButton();
    updateRootButton();
    sheetSnapshot = formSnapshot();
    closeSheet(true);
  });
  return true;
}

function newPersonNear(base, dx, dy) {
  return { id: nextId(), name: 'Neue Person', born: '', died: '', birthName: '', occupation: '', religion: '', location: '', link: '', image: '', mentions: [], pool: false, note: '', confidence: 'high', x: Math.round((base?.x ?? 400) + dx), y: Math.round((base?.y ?? 300) + dy), parents: [], partner: '', partners: [] };
}
function addChildFor(id) {
  const p = person(id); if (!p) return;
  const child = newPersonNear(p, 0, 260);
  child.pool = !!p.pool;
  const inheritedName = String(p.lastName || p.birthName || fullName(p).trim().split(/\s+/).slice(-1)[0] || '').trim();
  child.firstName = '';
  child.lastName = inheritedName;
  child.birthName = child.lastName;
  child.name = child.lastName || 'Kind von ' + p.name;
  child.parents = [p.id];
  const partner = primaryPartner(p);
  if (partner) child.parents.push(partner.id);
  data.people.push(child);
  resetGeneratedLayout(); save(); render(); if($('sideNav')?.classList.contains('open')) renderNavigator(); openSheet(child.id);
}
function addPartnerFor(id) {
  const p = person(id); if (!p) return;
  const q = newPersonNear(p, 230, 0);
  q.pool = !!p.pool;
  q.name = 'Partner/in von ' + p.name;
  linkPartners(p, q);
  data.people.push(q);
  resetGeneratedLayout(); save(); render(); if($('sideNav')?.classList.contains('open')) renderNavigator(); openSheet(q.id);
}
function addParentsFor(id) {
  const p = person(id); if (!p) return;
  const a = newPersonNear(p, -120, -260);
  const b = newPersonNear(p, 120, -260);
  a.pool = !!p.pool;
  b.pool = !!p.pool;
  a.name = 'Elternteil 1 von ' + p.name;
  b.name = 'Elternteil 2 von ' + p.name;
  linkPartners(a, b);
  p.parents = [a.id, b.id];
  data.people.push(a, b);
  resetGeneratedLayout(); save(); render(); if($('sideNav')?.classList.contains('open')) renderNavigator(); openSheet(a.id);
}

let listSortMode = 'family';
let listViewMode = 'tree';
let listReturnMode = '';

function setDialogVisibility(el, visible){
  el.classList.toggle('open', visible);
  el.setAttribute('aria-hidden', visible ? 'false' : 'true');
}
function showBackdrop(visible){
  const back = $('backdrop');
  back.classList.toggle('show', visible);
  back.setAttribute('aria-hidden', visible ? 'false' : 'true');
}
function openListEditor(mode = 'tree'){
  listViewMode = mode;
  $('listTitle').textContent = mode === 'pool' ? 'Personenvorrat' : 'Listeneditor';
  $('listAddBtn').textContent = mode === 'pool' ? '+ Vorratsperson' : '+ Person';
  $('listSheet').classList.remove('hidden');
  setDialogVisibility($('listSheet'), true);
  showBackdrop(true);
  renderListEditor();
  setTimeout(()=>$('listSearch').focus(), 80);
}
function closeListEditor(suspend = false){
  setDialogVisibility($('listSheet'), false);
  $('listSheet').classList.toggle('hidden', suspend);
  if (!suspend) listReturnMode = '';
  showBackdrop(false);
}
function openSheetFromList(id) {
  listReturnMode = listViewMode;
  closeListEditor(true);
  openSheet(id);
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
          <span class="scrollAvatar">${avatarHtml(p)}</span>
          <span><strong>${esc(fullName(p) || p.name)}</strong>${meta ? `<small>${esc(meta)}</small>` : ''}${partnerChip}${attachedPartner ? `<span class="scrollPartner"><span class="scrollAvatar mini" style="--family-color:${esc(familyColor(familyKey(attachedPartner)))}">${avatarHtml(attachedPartner)}</span><span><strong>${esc(fullName(attachedPartner) || attachedPartner.name)}</strong>${attachedMeta ? `<small>${esc(attachedMeta)}</small>` : ''}</span></span>` : ''}</span>
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
    .filter(p => !p.pool)
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
    .filter(p => !p.pool && (!q || personSearchText(p).includes(q)))
    .sort((a,b) => fullName(a).localeCompare(fullName(b)))
    .slice(0, 80);

  $('searchRows').innerHTML = rows.map(p => {
    const dates = [p.born, p.died && '- '+p.died].filter(Boolean).join(' ');
    const extra = [birthNameDiffers(p) && 'geb. '+p.birthName, p.occupation, p.religion, p.location].filter(Boolean).join(' · ');
    return `
      <button type="button" class="searchRow" data-id="${esc(p.id)}">
        <span class="swatch" style="background:${esc(familyColor(familyKey(p)))}"></span>
        <span><strong>${esc(fullName(p) || p.name)}</strong><small>${esc([dates, extra].filter(Boolean).join(' · ')) || 'Lebensdaten offen'}</small></span>
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
  const activePeople = data.people.filter(p => !p.pool);
  activePeople.forEach(p => nameCount.set(fullName(p) || p.name, (nameCount.get(fullName(p) || p.name) || 0) + 1));

  if (!rootIds.length && activePeople.length) {
    issues.push({ id:activePeople[0].id, group:'root', text:'Noch keine Hauptwurzel festgelegt.' });
  } else if (rootIds.length) {
    const mainIds = new Set();
    rootIds.forEach(rootId => connectedIds(rootId).forEach(id => mainIds.add(id)));
    for (const component of relationComponents()) {
      if (component.some(id => mainIds.has(id))) continue;
      const representative = person(component[0]);
      if (representative) {
        issues.push({
          id: representative.id,
          group: 'branches',
          text: `Nebenzweig ohne Verbindung zur Hauptwurzel: ${fullName(representative) || representative.name} (${component.length} Person(en)).`
        });
      }
    }
  }

  for (const p of activePeople) {
    const name = fullName(p) || p.name;
    if (!p.lastName || p.lastName === '?') issues.push({ id:p.id, group:'name', text:`${name}: Nachname fehlt/unklar.` });
    if (!p.born) issues.push({ id:p.id, group:'dates', text:`${name}: Geburtsdatum fehlt.` });
    if (nameCount.get(name) > 1) issues.push({ id:p.id, group:'duplicates', text:`${name}: Name kommt mehrfach vor.` });
    for (const partnerId of uniqueIds([...(p.partners || []), p.partner])) {
      if (!ids.has(partnerId)) issues.push({ id:p.id, group:'references', text:`${name}: Partner-Referenz ${partnerId} fehlt.` });
    }
    for (const pid of p.parents || []) {
      if (!ids.has(pid)) issues.push({ id:p.id, group:'references', text:`${name}: Eltern-Referenz ${pid} fehlt.` });
    }
    if ((p.parents || []).length === 1) issues.push({ id:p.id, group:'relations', text:`${name}: nur ein Elternteil eingetragen.` });
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
  const groups = [
    ['root', 'Hauptwurzel'],
    ['branches', 'Nicht verbundene Nebenzweige'],
    ['references', 'Fehlende Verknüpfungen'],
    ['relations', 'Unvollständige Beziehungen'],
    ['duplicates', 'Mögliche Dubletten'],
    ['name', 'Namen'],
    ['dates', 'Lebensdaten']
  ];
  const grouped = new Map(groups.map(([key]) => [key, []]));
  for (const issue of issues) {
    const key = grouped.has(issue.group) ? issue.group : 'other';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(issue);
  }
  const html = groups
    .map(([key, label]) => {
      const rows = grouped.get(key) || [];
      if (!rows.length) return '';
      const closed = checkCollapsed.has(key);
      return `
        <section class="checkGroup${closed ? ' collapsed' : ''}" data-group="${esc(key)}">
          <button type="button" class="checkGroupTitle" data-check-group="${esc(key)}" aria-expanded="${closed ? 'false' : 'true'}">
            <span class="checkGroupToggle">${closed ? '+' : '−'}</span>
            <span>${esc(label)}</span>
            <span class="checkGroupCount">${rows.length}</span>
          </button>
          <div class="checkGroupRows">
            ${rows.map(issue => `<button type="button" class="checkRow" data-id="${esc(issue.id)}">${esc(issue.text)}</button>`).join('')}
          </div>
        </section>
      `;
    })
    .join('');
  $('checkRows').innerHTML = issues.length ? html : '<p class="emptyState">Keine offensichtlichen Datenprobleme gefunden.</p>';
  $('checkRows').querySelectorAll('[data-check-group]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.checkGroup;
      if (checkCollapsed.has(key)) checkCollapsed.delete(key);
      else checkCollapsed.add(key);
      renderCheck();
    });
  });
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
  const mentions = cleanMentions(p.mentions).map(item => [item.title, item.date, item.link].join(' ')).join(' ');
  return [p.name,p.birthName,p.born,p.died,p.occupation,p.religion,p.location,p.link,mentions,p.note,confidenceText(p),parentNames,partnerName].join(' ').toLowerCase();
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
    .filter(p => listViewMode === 'pool' ? p.pool : !p.pool)
    .filter(p => !q || personSearchText(p).includes(q))
    .sort(comparePeopleForList);

  $('listRows').innerHTML = rows.map(p => {
    const parents = (p.parents||[]).map(id=>person(id)?.name||id).filter(Boolean).join(' + ');
    const partner = partnerIds(p).map(id => person(id)?.name || id).join(', ');
    const birth = birthNameDiffers(p) ? ` · geb. ${esc(p.birthName)}` : '';
    const dates = [p.born, p.died && '– '+p.died].filter(Boolean).join(' ');
    const confidence = confidenceText(p);
    const extra = [p.occupation, p.religion, p.location].filter(Boolean).join(' · ');
    return `
      <div class="listRow${p.pool ? ' poolRow' : ''}" tabindex="0" data-id="${esc(p.id)}">
        <div>
          <div class="listName">${esc(p.name)}</div>
          <div class="listMeta">${esc([dates, birth.trim(), confidence].filter(Boolean).join(' · ')) || 'Lebensdaten offen'}</div>
          ${extra ? `<div class="listMeta">${esc(extra)}</div>` : ''}
          <div class="listMeta">${partner ? 'Partner/in: '+esc(partner) : ''}${parents ? (partner ? ' · ' : '') + 'Eltern: '+esc(parents) : ''}</div>
        </div>
        <div class="listActions">
          <button type="button" class="miniBtn" data-act="edit" data-id="${esc(p.id)}">Edit</button>
          ${p.pool ? `<button type="button" class="miniBtn" data-act="activate" data-id="${esc(p.id)}">Zweig eingliedern</button>` : ''}
          <button type="button" class="miniBtn" data-act="child" data-id="${esc(p.id)}">+Kind</button>
          <button type="button" class="miniBtn" data-act="partner" data-id="${esc(p.id)}">+Partner</button>
        </div>
      </div>
    `;
  }).join('');

  $('listRows').querySelectorAll('.listRow').forEach(row => {
    row.addEventListener('click', e => {
      if(e.target.closest('button')) return;
      openSheetFromList(row.dataset.id);
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
      if(act === 'edit') {
        openSheetFromList(id);
        return;
      }
      if(act === 'child' || act === 'partner') {
        listReturnMode = listViewMode;
        closeListEditor(true);
        if(act === 'child') addChildFor(id);
        else addPartnerFor(id);
        return;
      }
      closeListEditor();
      if(act === 'activate') {
        const p = person(id);
        if (p) { setPoolBranch(p.id, false); save(); updatePoolButton(); render(); }
      }
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
$('chooseImageBtn')?.addEventListener('click', () => {
  if (!(editMode || !person(selected))) return;
  $('personImageInput').click();
});
$('clearImageBtn')?.addEventListener('click', () => {
  if (!(editMode || !person(selected))) return;
  imageDraft = '';
  updateImagePreview();
});
$('addMentionBtn')?.addEventListener('click', () => {
  if (!(editMode || !person(selected))) return;
  mentionsDraft.push({ title: '', date: '', link: '' });
  renderMentionEditor();
  $('mentionRows').querySelector('input')?.focus();
});
$('mentionRows')?.addEventListener('input', e => {
  const row = e.target.closest('[data-mention-index]');
  const key = e.target.dataset.mentionKey;
  if (!row || !key) return;
  const index = Number(row.dataset.mentionIndex);
  if (mentionsDraft[index]) mentionsDraft[index][key] = e.target.value;
});
$('mentionRows')?.addEventListener('click', e => {
  const button = e.target.closest('[data-remove-mention]');
  if (!button || !(editMode || !person(selected))) return;
  mentionsDraft.splice(Number(button.dataset.removeMention), 1);
  renderMentionEditor();
});
$('currentPartners')?.addEventListener('click', e => {
  const button = e.target.closest('[data-remove-partner]');
  if (!button || !editMode || !selected) return;
  removedPartnerDraft.add(button.dataset.removePartner);
  const parent1 = $('parent1').value;
  const parent2 = $('parent2').value;
  fillSelects(selected, parent1, parent2);
  renderCurrentPartners(person(selected));
});
$('currentPartners')?.addEventListener('input', e => {
  const partnerId = e.target.dataset.marriagePartner;
  if (!partnerId || !editMode) return;
  marriageDraft[partnerId] = e.target.value;
});
$('partner')?.addEventListener('change', () => {
  $('partnerMarriageDate').disabled = !(editMode || !person(selected)) || !$('partner').value;
  if (!$('partner').value) $('partnerMarriageDate').value = '';
});
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
  const dialogOpen = ['fileMenu','settingsMenu','sheet','sideNav','searchSheet','birthdaySheet','scrollSheet','checkSheet','listSheet']
    .some(id => $(id)?.classList.contains('open'));
  if (e.key === 'Escape') {
    if ($('fileMenu')?.classList.contains('open')) { closeFileMenu(); e.preventDefault(); }
    else if ($('settingsMenu')?.classList.contains('open')) { closeSettingsMenu(); e.preventDefault(); }
    else if ($('sheet').classList.contains('open')) { closeSheet(); e.preventDefault(); }
    else if ($('sideNav').classList.contains('open')) { closeNavigator(); e.preventDefault(); }
    else if ($('searchSheet').classList.contains('open')) { closeSearch(); e.preventDefault(); }
    else if ($('birthdaySheet').classList.contains('open')) { closeBirthdays(); e.preventDefault(); }
    else if ($('scrollSheet').classList.contains('open')) { closeScrollView(); e.preventDefault(); }
    else if ($('checkSheet').classList.contains('open')) { closeCheck(); e.preventDefault(); }
    else if ($('listSheet').classList.contains('open')) { closeListEditor(); e.preventDefault(); }
    return;
  }
  if (isTyping) return;
  if (!dialogOpen && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.startsWith('Arrow')) {
    const step = e.shiftKey ? 180 : 64;
    if (e.key === 'ArrowLeft') view.x += step;
    if (e.key === 'ArrowRight') view.x -= step;
    if (e.key === 'ArrowUp') view.y += step;
    if (e.key === 'ArrowDown') view.y -= step;
    applyView();
    e.preventDefault();
    return;
  }
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
  if (isMainRoot(selected)) {
    rootIds = rootIds.filter(id => id !== selected);
    updateRootButton();
  }
  data.people = data.people
    .filter(p => p.id !== selected)
    .map(p => {
      const partners = partnerIds(p).filter(id => id !== selected);
      const partnerDetails = { ...(p.partnerDetails || {}) };
      delete partnerDetails[selected];
      return { ...p, parents: (p.parents || []).filter(x => x !== selected), partner: partners[0] || '', partners, partnerDetails };
    });
  if (activeFamily && !data.people.some(p => matchesFamily(p, activeFamily))) activeFamily = '';
  save();
  if($('sideNav')?.classList.contains('open')) renderNavigator();
  closeSheet(true);
});

$('zin').addEventListener('click', () => zoomTo(view.s * 1.18));
$('zout').addEventListener('click', () => zoomTo(view.s / 1.18));
$('home').addEventListener('click', fit);
$('fileBtn')?.addEventListener('click', e => {
  e.stopPropagation();
  toggleFileMenu();
});
$('fileMenu')?.addEventListener('click', e => e.stopPropagation());
$('settingsBtn')?.addEventListener('click', e => {
  e.stopPropagation();
  toggleSettingsMenu();
});
$('settingsMenu')?.addEventListener('click', e => e.stopPropagation());
$('settingsMenu')?.addEventListener('change', e => {
  const key = e.target?.dataset?.fieldToggle;
  if (!key) return;
  personFieldSettings[key] = !!e.target.checked;
  savePersonFieldSettings();
  applyPersonFieldSettings();
});
document.addEventListener('click', e => {
  if ($('fileMenu')?.classList.contains('open') && !e.target.closest('.fileWrap')) closeFileMenu();
  if (!$('settingsMenu')?.classList.contains('open')) return;
  if (e.target.closest('.settingsWrap')) return;
  closeSettingsMenu();
});
$('fitBtn').addEventListener('click', () => {
  fit();
  closeSettingsMenu();
});
$('autoBtn').addEventListener('click', () => { if (confirm('Automatische kompakte Anordnung anwenden? Aktuelle Positionen werden überschrieben.')) autoLayout(); });
$('collapseAllBtn').addEventListener('click', () => {
  const anyOpen = data.people.some(p=>hasChildren(p.id) && !collapsed.has(p.id));
  if(anyOpen){ data.people.forEach(p=>{ if(hasChildren(p.id)) collapsed.add(p.id); }); $('collapseAllBtn').textContent='Alle ausklappen'; }
  else { collapsed.clear(); $('collapseAllBtn').textContent='Alle einklappen'; }
  saveCollapsed(); autoLayout();
  closeSettingsMenu();
});
$('poolBtn')?.addEventListener('click', () => {
  closeSettingsMenu();
  openListEditor('pool');
});

$('resetBtn').addEventListener('click', async () => {
  if (confirm('Beispiel wirklich zurücksetzen?')) {
    localStorage.removeItem(storeKey);
    localStorage.removeItem(storeKey + '-collapsed');
    collapsed = new Set();
    focusMode = false;
    focusId = null;
    activeFamily = '';
    rootIds = [];
    selected = null;
    closeSheet(true);
    closeListEditor();
    closeNavigator();
    closeSearch();
    closeBirthdays();
    closeCheck();
    closeScrollView();
    updateFocusButton();
    updateRootButton();
    await loadDefaultData({ saveResult: true, fitResult: true });
  }
});

function exportData(includeImages = true) {
  if (includeImages) return data;
  return {
    ...data,
    people: data.people.map(p => ({ ...p, image: '' }))
  };
}
async function exportTreeJson() {
  const hasImages = data.people.some(p => p.image);
  const includeImages = hasImages
    ? confirm('Bilder in den JSON-Export aufnehmen?\n\nOK = Export inklusive Bilder\nAbbrechen = Export ohne Bilder')
    : false;
  const filename = includeImages ? 'stammbaum-mit-bildern.json' : 'stammbaum.json';
  const blob = new Blob([JSON.stringify(exportData(includeImages), null, 2)], { type: 'application/json' });
  await saveBlobAs(blob, filename, [{
    description: 'Stammbaum JSON',
    accept: { 'application/json': ['.json'] }
  }]);
}

$('exportBtn').addEventListener('click', async () => {
  closeFileMenu();
  await exportTreeJson();
});
$('workingFileBtn')?.addEventListener('click', async () => {
  closeFileMenu();
  await openWorkingFile();
});
$('copyJsonBtn')?.addEventListener('click', async () => {
  closeFileMenu();
  await copyTreeJson();
});

$('listBtn').addEventListener('click', () => openListEditor('tree'));
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
$('layoutBtn').addEventListener('click', () => {
  cycleLayoutMode();
  closeSettingsMenu();
});
$('nameModeBtn').addEventListener('click', () => {
  cycleViewPreset();
  closeSettingsMenu();
});
$('compactBtn')?.addEventListener('click', () => {
  cycleViewPreset();
  closeSettingsMenu();
});
$('checkBtn').addEventListener('click', openCheck);
$('checkCloseBtn').addEventListener('click', closeCheck);
$('imageBtn').addEventListener('click', exportImageView);
$('listCloseBtn').addEventListener('click', () => closeListEditor());
$('listAddBtn').addEventListener('click', () => {
  const returnMode = listViewMode;
  const addToPool = returnMode === 'pool';
  listReturnMode = returnMode;
  closeListEditor(true);
  selected = null;
  pendingNewPos = null;
  openSheet(null);
  $('inPool').checked = addToPool;
});
$('listSearch').addEventListener('input', renderListEditor);
$('listSortNameBtn').addEventListener('click', () => { listSortMode='name'; renderListEditor(); });
$('listSortBirthBtn').addEventListener('click', () => { listSortMode='birth'; renderListEditor(); });
$('listSortFamilyBtn').addEventListener('click', () => { listSortMode='family'; renderListEditor(); });
$('importBtn').addEventListener('click', () => {
  closeFileMenu();
  $('fileInput').click();
});
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
      workingFileHandle = null;
      data = imported;
      focusMode = false;
      focusId = null;
      activeFamily = '';
      rootIds = [...(imported.rootIds || [])];
      updateFocusButton();
      updateRootButton();
      updateWorkingFileButton();
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
$('personImageInput')?.addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  if (!/^image\/(jpeg|png|svg\+xml)$/.test(f.type)) {
    alert('Bitte JPG, PNG oder SVG auswählen.');
    e.target.value = '';
    return;
  }
  const r = new FileReader();
  r.onload = () => {
    imageDraft = String(r.result || '');
    updateImagePreview();
  };
  r.readAsDataURL(f);
  e.target.value = '';
});

window.addEventListener('resize', fit);

render();
applyPersonFieldSettings();
updateModeUI();
updateNameModeButton();
updateLayoutButton();
updatePoolButton();
updateWorkingFileButton();
updateRootButton();
updateFocusButton();
loadDefaultDataIfAvailable();
setTimeout(fit, 50);
setTimeout(() => $('hint').classList.add('hidden'), 8000);

})();
