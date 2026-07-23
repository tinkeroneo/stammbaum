(() => {
'use strict';

// -- Data / persistence ----------------------------------------------------
const startupStateSignals = {
  localStorageAvailable: false,
  localStorageSnapshotAvailable: false,
  indexedDbAvailable: false,
  indexedDbSnapshotAvailable: false,
  defaultDataLoaded: false,
  storageFailure: false
};
let startupState = 'first-visit';
const storeKey = 'mobile-family-tree-v5-clean';
const helpSeenKey = storeKey + '-help-seen-v1';
const helpTips = [
  {
    id: 'pan-zoom',
    title: 'Baum bewegen und zoomen',
    text: 'Ziehe eine freie Fläche, um den Baum zu verschieben. Zoome mit zwei Fingern, dem Mausrad oder den Plus-/Minus-Tasten.'
  },
  {
    id: 'search',
    title: 'Person schnell finden',
    text: 'Öffne „Suchen“ in der Hauptnavigation. Ein Treffer wird ausgewählt, lesbar zentriert und mit seinen Details geöffnet.'
  },
  {
    id: 'edit',
    title: 'Ansehen und Bearbeiten',
    text: 'Wechsle oben bewusst von „Ansehen“ zu „Bearbeiten“, bevor du Personen oder Beziehungen änderst.'
  }
];
const startupStateMetaKey = storeKey + '-meta';
const persistenceDbName = storeKey + '-db';
const persistenceStoreName = 'treeState';
const persistenceRecordKey = 'current';
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
let hasPersistedTreeData = false;
let startupStateMeta = null;
let data = load();
startupStateMeta = loadStartupStateMeta();
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
const overviewButton = $('overviewBtn');
const overviewSheet = $('overviewSheet');
const overviewMap = $('overviewMap');
const overviewViewport = $('overviewViewport');
const overviewSvg = $('overviewSvg');
const offscreenIndicators = $('offscreenIndicators');
let compactMode = false;
let minimapState = null;
let overviewState = null;
let overviewFocusReturnTarget = null;
let renderFrame = null;
let focusMode = false;
let focusId = null;
let activeFamily = '';
let editMode = false;
let nameMode = 'full';
let layoutMode = 'classic';
let savedClassicPositions = null;
let rootIds = [...(data.rootIds || [])];
let temporaryRootId = '';
let rootSelectionDeferredForDataset = false;
let rootSelectionRequired = false;
let rootSelectionFocusReturnTarget = null;
let spotlightId = null;
let spotlightTimer = null;
let sheetSnapshot = '';
let personSheetMode = 'closed';
let imageDraft = '';
let mentionsDraft = [];
let removedPartnerDraft = new Set();
let marriageDraft = {};
let scrollExpanded = new Set();
let checkCollapsed = new Set();
let workingFileHandle = null;
let personById = new Map();
let nonPoolPeople = [];
let childrenByParentId = new Map();
let activeChildrenByParentId = new Map();
let partnerIdsByPersonId = new Map();
let mutualPartnerIdsByPersonId = new Map();
let birthSortValueByPersonId = new Map();
let familyKeyByPersonId = new Map();
let relationComponentIds = [];
let pooledPeopleCount = 0;
let persistenceMode = 'local';
let persistenceState = 'clean';
let persistenceRevision = 0;
let persistenceCompletedRevision = 0;
let persistenceLastError = '';
let persistenceSaveChain = Promise.resolve();
let persistenceNoticeShown = false;
let persistenceDbPromise = null;
let persistenceWriteChain = Promise.resolve();
const commandHistoryLimit = 50;
const commandHistoryByteLimit = 8 * 1024 * 1024;
let commandHistory = [];
let commandHistoryIndex = 0;
let commandHistoryBytes = 0;
let commandHistoryAction = '';
let renderVirtualizationActive = false;
let busyDepth = 0;
let focusLayoutRestore = null;
let mainNavFocusReturnTarget = null;
let helpQueue = [];
let helpFocusReturnTarget = null;
let helpWasExplicitlyOpened = false;
let decisionResolver = null;
let decisionFocusReturnTarget = null;
let exportFocusReturnTarget = null;
let exportFilenameTouched = false;
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

function computeStartupStateFromSignals({
  hasLocalSnapshot = false,
  hasIndexedDbSnapshot = false,
  hasWorkingFile = false,
  hasDemoData = false,
  hasStorageFailure = false
} = {}) {
  const resolved = {
    hasLocalSnapshot: !!hasLocalSnapshot,
    hasIndexedDbSnapshot: !!hasIndexedDbSnapshot,
    hasWorkingFile: !!hasWorkingFile,
    hasDemoData: !!hasDemoData,
    hasStorageFailure: !!hasStorageFailure
  };

  if (resolved.hasWorkingFile) return 'working-file';
  if (resolved.hasIndexedDbSnapshot || resolved.hasLocalSnapshot) return 'returning-local';
  if (resolved.hasStorageFailure) return 'memory-only';
  if (resolved.hasDemoData) return 'demo';
  return 'first-visit';
}

function resolveStartupState({
  hasLocalSnapshot = false,
  hasIndexedDbSnapshot = false,
  hasWorkingFile = false,
  hasDemoData = false,
  hasStorageFailure = false
} = {}) {
  return computeStartupStateFromSignals({
    hasLocalSnapshot,
    hasIndexedDbSnapshot,
    hasWorkingFile,
    hasDemoData,
    hasStorageFailure
  });
}

function getStartupState() {
  return startupState;
}
function getStartupSignals() {
  return {
    hasLocalSnapshot: startupStateSignals.localStorageSnapshotAvailable,
    hasIndexedDbSnapshot: startupStateSignals.indexedDbSnapshotAvailable,
    hasWorkingFile: !!workingFileHandle,
    hasDemoData: startupStateSignals.defaultDataLoaded,
    hasStorageFailure: startupStateSignals.storageFailure
  };
}

function guessTreeName(dataset = data) {
  const people = Array.isArray(dataset?.people) ? dataset.people : [];
  const familyCounts = new Map();
  for (const person of people) {
    const lastName = String(person?.lastName || person?.birthName || '').trim();
    if (!lastName) continue;
    const normalized = lastName.toLowerCase();
    familyCounts.set(normalized, (familyCounts.get(normalized) || 0) + 1);
  }

  const topFamily = [...familyCounts.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  if (topFamily) return topFamily.split(' ').map(part => part ? part[0].toUpperCase() + part.slice(1) : '').join(' ');

  const firstName = String(people[0]?.lastName || people[0]?.birthName || '').trim();
  if (firstName) return firstName;
  return 'Mein Stammbaum';
}
function loadStartupStateMeta() {
  try {
    const raw = localStorage.getItem(startupStateMetaKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
function writeStartupStateMeta(patch = {}) {
  if (!patch || typeof patch !== 'object') return;
  try {
    const currentMeta = (startupStateMeta && typeof startupStateMeta === 'object') ? startupStateMeta : {};
    const next = {
      ...currentMeta,
      ...patch,
      personCount: Number.isFinite(patch.personCount) ? patch.personCount : (currentMeta?.personCount ?? 0),
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
      treeName: patch.treeName || currentMeta?.treeName
    };
    localStorage.setItem(startupStateMetaKey, JSON.stringify(next));
    startupStateMeta = next;
  } catch {
    startupStateMeta = null;
  }
}
function getWelcomeStorageModeLabel() {
  if (workingFileHandle) return `Arbeitsdatei (${workingFileHandle.name || 'unbekannt'})`;
  if (startupStateSignals.localStorageSnapshotAvailable) return 'Lokaler Browser-Speicher';
  if (startupStateSignals.indexedDbSnapshotAvailable) return 'IndexedDB';
  if (startupStateSignals.storageFailure) return 'Sitzungsspeicher';
  return 'Nicht dauerhaft gespeichert';
}
function formatStartupTimestamp(iso) {
  if (!iso) return 'unbekannt';
  const ms = Number.isFinite(Number(iso)) ? Number(iso) : Date.parse(iso);
  if (!Number.isFinite(ms)) return 'unbekannt';
  try {
    return new Date(ms).toLocaleString('de-DE', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
  } catch {
    return String(new Date(ms).toLocaleString());
  }
}
function getWelcomeMetadata() {
  const count = Number.isFinite(data?.people?.length) ? data.people.length : 0;
  return {
    treeName: guessTreeName(),
    personCount: count,
    storageMode: getWelcomeStorageModeLabel(),
    lastSavedAt: startupStateMeta?.updatedAt || null
  };
}
function refreshWelcomeMeta() {
  const meta = getWelcomeMetadata();
  writeStartupStateMeta({
    treeName: meta.treeName,
    personCount: meta.personCount,
    storageMode: meta.storageMode,
    updatedAt: startupStateMeta?.updatedAt || new Date().toISOString(),
    workingFileName: workingFileHandle?.name || startupStateMeta?.workingFileName || ''
  });
}
function getPersistenceStatusLabel() {
  const labels = {
    clean: 'Bereit',
    dirty: 'Ungespeicherte Änderungen',
    saving: 'Speichert …',
    'saved-local': 'Lokal gespeichert',
    'saved-file': 'In Arbeitsdatei gespeichert',
    'degraded-indexeddb': 'Im Ersatzspeicher gesichert',
    'memory-only': 'Nur im Arbeitsspeicher',
    error: 'Speicherfehler'
  };
  return labels[persistenceState] || 'Sichern erforderlich';
}
function updateHeaderMeta() {
  const titleEl = $('app-title');
  const statusEl = $('app-storage-status');
  if (titleEl) titleEl.textContent = guessTreeName();
  if (statusEl) statusEl.textContent = getPersistenceStatusLabel();
}
const surfaceStateKeys = ['sheet','sideNav','searchSheet','rootSelectionSheet','overviewSheet','birthdaySheet','scrollSheet','checkSheet','listSheet','fileMenu','settingsMenu'];

const uiState = {
  get data() {
    return {
      isLoaded: !!data,
      personCount: data?.people?.length || 0,
      visiblePersonCount: nonPoolPeople?.length || 0,
      rootCount: rootIds?.length || 0,
      activeFamily: activeFamily || ''
    };
  },
  get viewport() {
    return {
      viewX: view.x,
      viewY: view.y,
      zoom: view.s,
      dragging: !!(drag || pan || pinch),
      selectionActive: !!selection,
      compactMode,
      nameMode,
      layoutMode,
      hasMinimapState: !!minimapState,
      focusAreaMode: focusMode,
      focusPersonId: focusId || ''
    };
  },
  get mode() {
    return {
      editMode,
      compactMode,
      nameMode,
      layoutMode,
      focusMode,
      focusId: focusId || ''
    };
  },
  get selection() {
    return {
      selectedId: selected || '',
      hasSelection: !!selected,
      activeSheetPersonId: selected || '',
      selectedPerson: person(selected)?.id || '',
      listViewMode,
      listReturnMode,
      focusMode,
      pendingNewPerson: pendingNewPos ? true : false
    };
  },
  get surfaces() {
    const result = Object.fromEntries(surfaceStateKeys.map(id => [id, isUiSurfaceOpen(id)]));
    const active = Object.entries(result).find(([, open]) => open)?.[0] || '';
    const countOpen = Object.values(result).filter(Boolean).length;
    return {
      states: result,
      activeDialog: active,
      openSurfaceCount: countOpen
    };
  },
  get persistence() {
    return {
      persistenceMode,
      persistenceState,
      persistenceRevision,
      persistenceCompletedRevision,
      persistenceLastError,
      hasPersistedTreeData,
      workingFile: workingFileHandle?.name || '',
      hasBusyState: busyDepth > 0,
      persistenceNoticeShown
    };
  },
  get commands() {
    return getCommandHistoryState();
  }
};

function isUiSurfaceOpen(id) {
  const el = $(id);
  return !!(el && el.classList.contains('open'));
}

function uiInvariants() {
  const surfaces = uiState.surfaces;
  return {
    singleOverlayOpen: surfaces.openSurfaceCount <= 1,
    sheetSelectionInvariant: !isUiSurfaceOpen('sheet') || !!selected,
    selectedInData: !selected || !!person(selected),
    dataPersistenceInvariant: persistenceMode === 'memory' || hasPersistedTreeData || !!workingFileHandle || localStorage.getItem(storeKey),
    rootLimitInvariant: rootIds.length <= 2
  };
}

function cloneCommandValue(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}
function captureCommandState() {
  return {
    people: new Map(data.people.map((entry, index) => [
      entry.id,
      { index, json: JSON.stringify(entry) }
    ])),
    order: data.people.map(entry => entry.id),
    rootIds: [...rootIds],
    layoutMode,
    savedClassicPositions: savedClassicPositions
      ? [...savedClassicPositions.entries()].map(([id, position]) => [id, { ...position }])
      : null
  };
}
function sameCommandValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function createDataCommand(label, before, after) {
  const ids = new Set([...before.people.keys(), ...after.people.keys()]);
  const people = [...ids].sort().flatMap(id => {
    const previous = before.people.get(id)?.json;
    const next = after.people.get(id)?.json;
    if (previous === next) return [];
    return [{
      id,
      before: previous ? JSON.parse(previous) : null,
      after: next ? JSON.parse(next) : null
    }];
  });
  const order = sameCommandValue(before.order, after.order)
    ? null
    : { before: before.order, after: after.order };
  const roots = sameCommandValue(before.rootIds, after.rootIds)
    ? null
    : { before: before.rootIds, after: after.rootIds };
  const layout = before.layoutMode === after.layoutMode
    && sameCommandValue(before.savedClassicPositions, after.savedClassicPositions)
    ? null
    : {
      before: {
        mode: before.layoutMode,
        classicPositions: before.savedClassicPositions
      },
      after: {
        mode: after.layoutMode,
        classicPositions: after.savedClassicPositions
      }
    };
  if (!people.length && !order && !roots && !layout) return null;
  const command = { label, people, order, roots, layout };
  command.bytes = JSON.stringify(command).length * 2;
  command.do = () => applyDataCommand(command, 'after');
  command.undo = () => applyDataCommand(command, 'before');
  return command;
}
function getCommandHistoryState() {
  return {
    canUndo: commandHistoryIndex > 0,
    canRedo: commandHistoryIndex < commandHistory.length,
    undoLabel: commandHistoryIndex > 0 ? commandHistory[commandHistoryIndex - 1].label : '',
    redoLabel: commandHistoryIndex < commandHistory.length ? commandHistory[commandHistoryIndex].label : '',
    length: commandHistory.length,
    index: commandHistoryIndex,
    bytes: commandHistoryBytes,
    lastAction: commandHistoryAction
  };
}
function notifyCommandHistoryChanged(action = '') {
  commandHistoryAction = action;
  window.dispatchEvent(new CustomEvent('commandhistorychange', {
    detail: getCommandHistoryState()
  }));
}
function clearCommandHistory() {
  commandHistory = [];
  commandHistoryIndex = 0;
  commandHistoryBytes = 0;
  notifyCommandHistoryChanged('');
}
function recordDataCommand(label, before) {
  const command = createDataCommand(label, before, captureCommandState());
  if (!command) return null;
  if (commandHistoryIndex < commandHistory.length) {
    commandHistory
      .splice(commandHistoryIndex)
      .forEach(entry => { commandHistoryBytes -= entry.bytes || 0; });
  }
  commandHistory.push(command);
  commandHistoryIndex = commandHistory.length;
  commandHistoryBytes += command.bytes || 0;
  while (commandHistory.length > 1 && (
    commandHistory.length > commandHistoryLimit
    || commandHistoryBytes > commandHistoryByteLimit
  )) {
    const removed = commandHistory.shift();
    commandHistoryBytes -= removed.bytes || 0;
    commandHistoryIndex = Math.max(0, commandHistoryIndex - 1);
  }
  notifyCommandHistoryChanged(`Ausgeführt: ${label}`);
  return command;
}
function commitDataCommand(label, before) {
  const command = recordDataCommand(label, before);
  save();
  return command;
}
function applyDataCommand(command, direction) {
  const current = new Map(data.people.map(entry => [entry.id, entry]));
  for (const change of command.people) {
    const target = change[direction];
    if (target === null) current.delete(change.id);
    else current.set(change.id, cloneCommandValue(target));
  }
  const targetOrder = command.order?.[direction] || data.people.map(entry => entry.id);
  const orderedPeople = targetOrder.map(id => current.get(id)).filter(Boolean);
  const orderedIds = new Set(targetOrder);
  data.people = [...orderedPeople, ...[...current.values()].filter(entry => !orderedIds.has(entry.id))];
  if (command.roots) rootIds = [...command.roots[direction]];
  if (command.layout) {
    layoutMode = command.layout[direction].mode;
    const classicPositions = command.layout[direction].classicPositions;
    savedClassicPositions = classicPositions
      ? new Map(classicPositions.map(([id, position]) => [id, { ...position }]))
      : null;
  }
  data.rootIds = rootIds.filter(id => current.has(id)).slice(0, 2);
  rootIds = [...data.rootIds];
  if (selected && !current.has(selected)) selected = null;
  if (focusId && !current.has(focusId)) {
    focusId = null;
    focusMode = false;
  }
  rebuildDataIndexes();
  save();
  updateLayoutButton();
  updatePoolButton();
  updateRootButton();
  updateFocusButton();
  render();
  if ($('sideNav')?.classList.contains('open')) renderNavigator();
  if ($('listSheet')?.classList.contains('open')) renderListEditor();
  if ($('scrollSheet')?.classList.contains('open')) renderScrollView();
  if ($('checkSheet')?.classList.contains('open')) runChecks();
  if ($('sheet')?.classList.contains('open')) {
    if (selected && person(selected)) openSheet(selected, { mode: 'detail' });
    else {
      personSheetMode = 'closed';
      clearPersonSheetDraft();
      setDialogVisibility($('sheet'), false);
      showBackdrop(false);
    }
  }
  return true;
}
function undoCommand() {
  if (commandHistoryIndex <= 0) return false;
  const command = commandHistory[commandHistoryIndex - 1];
  commandHistoryIndex -= 1;
  command.undo();
  notifyCommandHistoryChanged(`Rückgängig: ${command.label}`);
  return command.label;
}
function redoCommand() {
  if (commandHistoryIndex >= commandHistory.length) return false;
  const command = commandHistory[commandHistoryIndex];
  command.do();
  commandHistoryIndex += 1;
  notifyCommandHistoryChanged(`Wiederholt: ${command.label}`);
  return command.label;
}

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
function normalizeImportedPositions(people) {
  const positioned = people.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (positioned.length < 20) return;
  const xs = positioned.map(p => p.x);
  const ys = positioned.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const looksFlattened = spanX > 30000 && spanX / spanY > 18;
  if (!looksFlattened) return;

  const targetWidth = Math.max(9000, Math.min(24000, Math.round(Math.sqrt(positioned.length) * 420)));
  const targetHeight = Math.max(2200, Math.min(9000, Math.round(targetWidth * 0.42)));
  for (const p of positioned) {
    p.x = Math.round(220 + ((p.x - minX) / spanX) * targetWidth);
    p.y = Math.round(180 + ((p.y - minY) / spanY) * targetHeight);
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
      parents: uniqueIds(Array.isArray(p.parents) ? p.parents.map(String).filter(Boolean) : []),
      partner: partners[0] || '',
      partners,
      partnerDetails
    };
  });
  normalizeImportedPositions(d.people);
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
    startupStateSignals.localStorageAvailable = true;
    const raw = localStorage.getItem(storeKey);
    if (!raw) {
      startupStateSignals.localStorageSnapshotAvailable = false;
      return normalize(structuredClone(sample));
    }
    try {
      hasPersistedTreeData = true;
      startupStateSignals.localStorageSnapshotAvailable = true;
      const parsed = normalize(JSON.parse(raw));
      const existingMeta = (startupStateMeta && typeof startupStateMeta === 'object') ? startupStateMeta : {};
      const normalizedName = guessTreeName(parsed);
      startupStateMeta = {
        ...existingMeta,
        personCount: parsed?.people?.length || 0,
        storageMode: 'local',
        updatedAt: existingMeta?.updatedAt || new Date().toISOString(),
        treeName: normalizedName || existingMeta?.treeName || 'Mein Stammbaum'
      };
      writeStartupStateMeta(startupStateMeta);
      return parsed;
    } catch {
      startupStateSignals.storageFailure = true;
      startupStateSignals.localStorageSnapshotAvailable = false;
      return normalize(structuredClone(sample));
    }
  } catch {
    startupStateSignals.localStorageAvailable = false;
    startupStateSignals.localStorageSnapshotAvailable = false;
    startupStateSignals.storageFailure = true;
    return normalize(structuredClone(sample));
  }
}
function openPersistenceDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (persistenceDbPromise) return persistenceDbPromise;
  persistenceDbPromise = new Promise(resolve => {
    try {
      const request = indexedDB.open(persistenceDbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(persistenceStoreName)) {
          db.createObjectStore(persistenceStoreName, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return persistenceDbPromise;
}
async function readPersistedJson() {
  const db = await openPersistenceDb();
  if (!db) return '';
  return await new Promise(resolve => {
    try {
      const tx = db.transaction(persistenceStoreName, 'readonly');
      const store = tx.objectStore(persistenceStoreName);
      const request = store.get(persistenceRecordKey);
      request.onsuccess = () => resolve(String(request.result?.json || ''));
      request.onerror = () => resolve('');
    } catch {
      resolve('');
    }
  });
}
async function writePersistedJson(json) {
  const db = await openPersistenceDb();
  if (!db) return false;
  return await new Promise(resolve => {
    try {
      const tx = db.transaction(persistenceStoreName, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.objectStore(persistenceStoreName).put({ key: persistenceRecordKey, json });
    } catch {
      resolve(false);
    }
  });
}
async function clearPersistedJson() {
  const db = await openPersistenceDb();
  if (!db) return false;
  return await new Promise(resolve => {
    try {
      const tx = db.transaction(persistenceStoreName, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.objectStore(persistenceStoreName).delete(persistenceRecordKey);
    } catch {
      resolve(false);
    }
  });
}
function rebuildDataIndexes() {
  personById = new Map(data.people.map(p => [p.id, p]));
  nonPoolPeople = data.people.filter(p => !p.pool);
  pooledPeopleCount = data.people.length - nonPoolPeople.length;
  childrenByParentId = new Map(data.people.map(p => [p.id, []]));
  activeChildrenByParentId = new Map(data.people.map(p => [p.id, []]));
  partnerIdsByPersonId = new Map();
  mutualPartnerIdsByPersonId = new Map();
  birthSortValueByPersonId = new Map();
  familyKeyByPersonId = new Map();
  for (const p of data.people) {
    const partnerIds = uniqueIds([...(Array.isArray(p.partners) ? p.partners : []), p.partner])
      .filter(id => id !== p.id && personById.has(id));
    partnerIdsByPersonId.set(p.id, partnerIds);
    birthSortValueByPersonId.set(p.id, parseBirthValue(p?.born)?.sort ?? null);
    familyKeyByPersonId.set(p.id, familyLabel(p).toLowerCase());
    for (const parentId of p.parents || []) {
      if (childrenByParentId.has(parentId)) childrenByParentId.get(parentId).push(p);
      if (!p.pool && activeChildrenByParentId.has(parentId)) activeChildrenByParentId.get(parentId).push(p);
    }
  }
  for (const p of data.people) {
    mutualPartnerIdsByPersonId.set(
      p.id,
      (partnerIdsByPersonId.get(p.id) || []).filter(id => (partnerIdsByPersonId.get(id) || []).includes(p.id))
    );
  }
  relationComponentIds = buildRelationComponentIds();
}
function buildRelationComponentIds() {
  const ids = nonPoolPeople.map(p => p.id);
  const activeIdSet = new Set(ids);
  const links = new Map(ids.map(id => [id, new Set()]));
  const link = (a, b) => {
    if (!activeIdSet.has(a) || !activeIdSet.has(b)) return;
    links.get(a).add(b);
    links.get(b).add(a);
  };

  for (const p of nonPoolPeople) {
    (partnerIdsByPersonId.get(p.id) || []).forEach(partnerId => link(p.id, partnerId));
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
  return components;
}
function notifyMemoryOnlyPersistence() {
  if (persistenceNoticeShown) return;
  persistenceNoticeShown = true;
  alert('Der Stammbaum ist fuer diese Browsersitzung geladen, passt aber nicht mehr sicher in den Browser-Speicher.\n\nBitte arbeite ueber "Arbeitsdatei oeffnen" oder exportiere den JSON-Stand regelmaessig. Ohne Datei-Verknuepfung gehen die Daten nach einem Neuladen verloren.');
}
function setBusyState(active, label = 'Verarbeitung läuft …') {
  const indicator = $('busyIndicator');
  const busyLabel = $('busyLabel');
  if (!indicator || !busyLabel) return;
  if (active) {
    busyLabel.textContent = label;
    indicator.classList.remove('hidden');
    indicator.setAttribute('aria-hidden', 'false');
  } else {
    indicator.classList.add('hidden');
    indicator.setAttribute('aria-hidden', 'true');
  }
}
function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => resolve()));
}
async function runBusy(label, task) {
  busyDepth++;
  setBusyState(true, label);
  await nextFrame();
  await new Promise(resolve => setTimeout(resolve, 20));
  try {
    return await task();
  } finally {
    busyDepth = Math.max(0, busyDepth - 1);
    if (!busyDepth) {
      setBusyState(false);
      updateHeaderMeta();
    }
  }
}
function applyLoadedData(imported, { fitResult = true } = {}) {
  clearCommandHistory();
  data = imported;
  rebuildDataIndexes();
  const preferFocus = nonPoolPeople.length > 1200;
  focusMode = preferFocus;
  focusId = null;
  activeFamily = '';
  rootIds = [...(imported.rootIds || [])];
  temporaryRootId = '';
  rootSelectionDeferredForDataset = false;
  updateFocusButton();
  updateRootButton();
  if (fitResult) {
    focusPreferredPerson({ preferFocus });
  } else {
    render();
  }
  if ($('sideNav')?.classList.contains('open')) renderNavigator();
  if ($('scrollSheet')?.classList.contains('open')) renderScrollView();
  updateHeaderMeta();
  setTimeout(maybeOpenRequiredRootSelection, 0);
}
function setPersistenceState(nextState, { revision = persistenceRevision, error = '' } = {}) {
  if (revision < persistenceRevision && ['saved-local', 'saved-file', 'degraded-indexeddb', 'memory-only', 'error'].includes(nextState)) return;
  persistenceState = nextState;
  persistenceLastError = error;
  updateHeaderMeta();
}
function schedulePersistedJsonWrite(json) {
  if (typeof indexedDB === 'undefined') return Promise.resolve(false);
  persistenceWriteChain = persistenceWriteChain
    .then(() => writePersistedJson(json))
    .catch(() => false);
  return persistenceWriteChain;
}
async function persistSaveRevision(job) {
  const { revision, json, metadata, fileHandle } = job;
  if (revision === persistenceRevision) setPersistenceState('saving', { revision });

  let localOk = false;
  try {
    localStorage.setItem(storeKey, json);
    localOk = true;
  } catch {
    try { localStorage.removeItem(storeKey); } catch {}
  }

  const indexedDbAvailable = typeof indexedDB !== 'undefined';
  const indexedDbOk = indexedDbAvailable ? await writePersistedJson(json).catch(() => false) : false;

  let fileOk = false;
  let fileError = '';
  if (fileHandle) {
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      fileOk = true;
    } catch (error) {
      fileError = error?.message || 'Arbeitsdatei konnte nicht geschrieben werden.';
      if (revision === persistenceRevision && workingFileHandle === fileHandle) {
        workingFileHandle = null;
        updateWorkingFileButton();
      }
    }
  }

  let nextState = 'memory-only';
  let storageMode = 'memory';
  if (fileError) {
    nextState = 'error';
    storageMode = localOk ? 'local' : (indexedDbOk ? 'indexeddb' : 'memory');
  } else if (fileOk) {
    nextState = 'saved-file';
    storageMode = 'file';
  } else if (localOk) {
    nextState = 'saved-local';
    storageMode = 'local';
  } else if (indexedDbOk) {
    nextState = 'degraded-indexeddb';
    storageMode = 'indexeddb';
  }

  const hasDurableResult = localOk || indexedDbOk || fileOk;
  if (hasDurableResult) {
    writeStartupStateMeta({
      ...metadata,
      storageMode,
      workingFileName: fileOk ? (fileHandle?.name || '') : ''
    });
  }
  persistenceCompletedRevision = Math.max(persistenceCompletedRevision, revision);
  if (revision === persistenceRevision) {
    persistenceMode = storageMode;
    startupStateSignals.localStorageAvailable = localOk;
    startupStateSignals.localStorageSnapshotAvailable = localOk;
    startupStateSignals.indexedDbAvailable = indexedDbAvailable;
    startupStateSignals.indexedDbSnapshotAvailable = indexedDbOk;
    startupStateSignals.storageFailure = nextState === 'memory-only'
      || (nextState === 'error' && !localOk && !indexedDbOk);
    hasPersistedTreeData = hasDurableResult;
    setPersistenceState(nextState, { revision, error: fileError });
    computeStartupStateNow();
    if (nextState === 'memory-only') notifyMemoryOnlyPersistence();
    if (nextState === 'error') {
      alert('Die Arbeitsdatei konnte nicht aktualisiert werden. Die Änderung wurde, soweit möglich, zusätzlich im Browser gesichert.');
    }
  }
  return { revision, state: nextState, localOk, indexedDbOk, fileOk, fileError };
}
async function loadPersistedDataIfAvailable() {
  startupStateSignals.indexedDbAvailable = typeof indexedDB !== 'undefined';
  let persistedJson = '';
  try {
    persistedJson = await readPersistedJson();
  } catch {
    startupStateSignals.storageFailure = true;
  }
  startupStateSignals.indexedDbSnapshotAvailable = !!persistedJson;
  if (persistedJson) {
    try {
      applyLoadedData(normalize(JSON.parse(persistedJson)));
      hasPersistedTreeData = true;
      persistenceMode = 'indexeddb';
      startupStateSignals.storageFailure = false;
      return true;
    } catch {}
  }
  if (hasPersistedTreeData) {
    schedulePersistedJsonWrite(JSON.stringify(data, null, 2));
    return true;
  }
  return false;
}
async function loadDefaultDataIfAvailable() {
  const hadSnapshotAtStartup = startupStateSignals.localStorageSnapshotAvailable || startupStateSignals.indexedDbSnapshotAvailable;
  const hadStorageFailureAtStartup = startupStateSignals.storageFailure;
  if (startupStateSignals.localStorageSnapshotAvailable) {
    computeStartupStateNow();
    return startupState;
  }
  if (startupStateSignals.storageFailure) {
    computeStartupStateNow();
    return startupState;
  }
  if (await loadPersistedDataIfAvailable()) {
    computeStartupStateNow();
    return startupState;
  }
  const loaded = await runBusy('Beispieldaten werden geladen …', () => loadDefaultData({ saveResult: true, fitResult: true }));
  if (!hadSnapshotAtStartup && !hadStorageFailureAtStartup) {
    startupState = startupStateSignals.storageFailure ? 'memory-only' : 'demo';
    return startupState;
  }
  computeStartupStateNow();
  return loaded ? 'demo' : startupState;
}
async function loadDefaultData({ saveResult = true, fitResult = true } = {}) {
  let loadedDefaultData = false;
  try {
    const response = await fetch(defaultDataUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('Default JSON not reachable');
    data = normalize(await response.json());
    loadedDefaultData = true;
  } catch {
    data = normalize(structuredClone(sample));
    loadedDefaultData = true;
  }
  startupStateSignals.defaultDataLoaded = loadedDefaultData;
  applyLoadedData(data, { fitResult: false });
  refreshWelcomeMeta();
  updateHeaderMeta();
  if (saveResult) save();
  if (fitResult) focusPreferredPerson({ preferFocus: focusMode || nonPoolPeople.length > 1200 });
  return loadedDefaultData;
}
function computeStartupStateNow() {
  startupState = resolveStartupState(getStartupSignals());
  updateHeaderMeta();
  return startupState;
}
function save() {
  rebuildDataIndexes();
  data.rootIds = rootIds.filter(id => person(id)).slice(0, 2);
  const json = JSON.stringify(data, null, 2);
  const revision = ++persistenceRevision;
  const metadata = {
    treeName: guessTreeName(),
    personCount: data?.people?.length || 0,
    workingFileName: workingFileHandle?.name || '',
    updatedAt: new Date().toISOString()
  };
  setPersistenceState('dirty', { revision });
  const job = { revision, json, metadata, fileHandle: workingFileHandle };
  persistenceSaveChain = persistenceSaveChain
    .then(() => persistSaveRevision(job))
    .catch(error => {
      if (revision === persistenceRevision) {
        persistenceCompletedRevision = Math.max(persistenceCompletedRevision, revision);
        setPersistenceState('error', { revision, error: error?.message || 'Unbekannter Speicherfehler' });
      }
      return { revision, state: 'error' };
    });
  return true;
}
function updateWorkingFileButton() {
  const btn = $('workingFileBtn');
  if (!btn) return;
  btn.textContent = workingFileHandle ? `Arbeitsdatei: ${workingFileHandle.name}` : 'Arbeitsdatei öffnen';
  btn.title = workingFileHandle
    ? 'Änderungen werden automatisch in diese Datei geschrieben'
    : 'JSON-Datei öffnen und künftig direkt aktualisieren';
  updateHeaderMeta();
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
    const imported = await runBusy('Arbeitsdatei wird geladen …', async () => normalize(JSON.parse(await file.text())));
    workingFileHandle = handle;
    applyLoadedData(imported, { fitResult: false });
    updateWorkingFileButton();
    save();
    await persistenceSaveChain;
    startupStateSignals.defaultDataLoaded = false;
    computeStartupStateNow();
    updateHeaderMeta();
    focusPreferredPerson({ preferFocus: focusMode || nonPoolPeople.length > 1200 });
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
function showWelcomeSurface() {
  const welcomeSurface = $('welcomeSurface');
  if (!welcomeSurface) return;
  const title = $('welcomeTitle');
  const description = $('welcomeDescription');
  const returnDetails = $('welcomeReturningDetails');
  const treeName = $('welcomeReturningTreeName');
  const personCount = $('welcomeReturningPersonCount');
  const lastSaved = $('welcomeReturningLastSaved');
  const storageMode = $('welcomeReturningStorageMode');
  const continueButton = $('welcomeContinue');
  const returnNotice = $('welcomeReturningNotice');
  const firstVisitActions = $('welcomeFirstVisitActions');
  const returnActions = $('welcomeReturningActions');

  if (startupState === 'first-visit') {
    if (title) title.textContent = 'Deine Familiengeschichte auf einen Blick';
    if (description) description.textContent = 'Du startest direkt mit einem klaren Startpunkt:'
      + ' entweder öffnest du einen bestehenden Stammbaum, legst einen neuen an oder schaust dir die Demo an.';
    returnDetails?.classList.add('hidden');
    returnNotice?.classList.add('hidden');
    firstVisitActions?.classList.remove('hidden');
    returnActions?.classList.add('hidden');
    continueButton?.classList.add('hidden');
    if ($('welcomeOpenExistingFirstVisit')) {
      $('welcomeOpenExistingFirstVisit').textContent = 'Bestehenden Stammbaum öffnen';
    }
  } else {
    const meta = getWelcomeMetadata();
    if (title) title.textContent = 'Willkommen zurück';
    if (description) description.textContent = 'Wir sind zu einem gespeicherten Stammbaum bereit.';
    if (treeName) treeName.textContent = `Baumname: ${meta.treeName}`;
    if (personCount) personCount.textContent = `Personen: ${meta.personCount.toLocaleString('de-DE')}`;
    if (lastSaved) {
      const savedLabel = startupState === 'memory-only' || !startupStateMeta?.updatedAt ? 'unbekannt' : formatStartupTimestamp(meta.lastSavedAt || startupStateMeta.updatedAt);
      lastSaved.textContent = `Zuletzt gespeichert: ${savedLabel}`;
    }
    if (storageMode) storageMode.textContent = `Speicherort: ${meta.storageMode}`;
    returnDetails?.classList.remove('hidden');
    firstVisitActions?.classList.add('hidden');
    returnActions?.classList.remove('hidden');
    if (continueButton) {
      continueButton.classList.remove('hidden');
      continueButton.textContent = 'Weiterarbeiten';
      if (startupState === 'memory-only') {
        returnNotice?.classList.remove('hidden');
        if (returnNotice) returnNotice.textContent = 'Achtung: Keine dauerhafte Speicherung im Browser erkannt. Bitte exportiere oder öffne eine Arbeitsdatei.';
      } else {
        returnNotice?.classList.add('hidden');
      }
    }
    if ($('welcomeOpenExistingReturning')) {
      $('welcomeOpenExistingReturning').textContent = 'Andere Datei öffnen';
    }
  }
  welcomeSurface.classList.remove('hidden');
  welcomeSurface.setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    const initialFocus = startupState === 'first-visit'
      ? $('welcomeOpenExistingFirstVisit') || $('welcomeOpenExistingReturning') || $('welcomeOpenExisting')
      : $('welcomeContinue');
    (initialFocus || document.querySelector('[data-testid=\"welcome-open-existing\"]'))?.focus();
  }, 40);
}
function hideWelcomeSurface() {
  const welcomeSurface = $('welcomeSurface');
  if (!welcomeSurface) return;
  welcomeSurface.classList.add('hidden');
  welcomeSurface.setAttribute('aria-hidden', 'true');
  setTimeout(maybeOpenRequiredRootSelection, 0);
  setTimeout(() => showHelpHints(), 120);
}

function readSeenHelpHints() {
  try {
    const stored = JSON.parse(localStorage.getItem(helpSeenKey) || '[]');
    return new Set(Array.isArray(stored) ? stored.filter(id => helpTips.some(tip => tip.id === id)) : []);
  } catch {
    return new Set();
  }
}

function writeSeenHelpHints(seen) {
  try {
    localStorage.setItem(helpSeenKey, JSON.stringify([...seen]));
  } catch {
    // Die Hilfe bleibt nutzbar, auch wenn der Browser lokale Speicherung blockiert.
  }
}

function hideHelpHints({ returnFocus = false } = {}) {
  const hint = $('helpHint');
  if (!hint) return;
  hint.classList.add('hidden');
  hint.removeAttribute('data-help-tip');
  helpQueue = [];
  if (returnFocus) helpFocusReturnTarget?.focus({ preventScroll: true });
  helpFocusReturnTarget = null;
  helpWasExplicitlyOpened = false;
}

function renderCurrentHelpHint({ focusClose = false } = {}) {
  const hint = $('helpHint');
  const tip = helpQueue[0];
  if (!hint || !tip) {
    hideHelpHints({ returnFocus: helpWasExplicitlyOpened });
    return;
  }
  const tipIndex = helpTips.findIndex(item => item.id === tip.id);
  $('helpHintCount').textContent = `Hinweis ${tipIndex + 1} von ${helpTips.length}`;
  $('helpHintTitle').textContent = tip.title;
  $('helpHintText').textContent = tip.text;
  $('helpHintClose').setAttribute('aria-label', `Hinweis „${tip.title}“ schließen`);
  hint.dataset.helpTip = tip.id;
  hint.classList.remove('hidden');
  if (focusClose) setTimeout(() => $('helpHintClose')?.focus(), 0);
}

function showHelpHints({ force = false, trigger = null } = {}) {
  if (!force && helpWasExplicitlyOpened) return;
  const seen = readSeenHelpHints();
  helpQueue = helpTips.filter(tip => force || !seen.has(tip.id));
  helpWasExplicitlyOpened = force;
  helpFocusReturnTarget = force && trigger instanceof HTMLElement ? trigger : null;
  renderCurrentHelpHint({ focusClose: force });
}

function dismissCurrentHelpHint() {
  const tip = helpQueue[0];
  if (!tip) return;
  const seen = readSeenHelpHints();
  seen.add(tip.id);
  writeSeenHelpHints(seen);
  helpQueue.shift();
  renderCurrentHelpHint({ focusClose: true });
}
function initializeEmptyTreeModel() {
  clearCommandHistory();
  data = normalize({ people: [] });
  rebuildDataIndexes();
  workingFileHandle = null;
  hasPersistedTreeData = false;
  persistenceMode = 'memory';
  updateWorkingFileButton();
  startupStateSignals.localStorageSnapshotAvailable = false;
  startupStateSignals.indexedDbSnapshotAvailable = false;
  startupStateSignals.defaultDataLoaded = false;
  startupStateSignals.storageFailure = false;
  startupStateSignals.localStorageAvailable = false;
  startupStateSignals.indexedDbAvailable = typeof indexedDB !== 'undefined';
  computeStartupStateNow();
  writeStartupStateMeta({
    storageMode: 'memory',
    workingFileName: '',
    treeName: guessTreeName(),
    personCount: 0,
    updatedAt: new Date().toISOString()
  });
  selected = null;
  pendingNewPos = null;
  rootIds = [];
  temporaryRootId = '';
  rootSelectionDeferredForDataset = false;
  render();
  fit();
  updateHeaderMeta();
}
function openWelcomeDemoData() {
  return loadDefaultData({ saveResult: true, fitResult: true });
}
function person(id) { return personById.get(id); }
function childrenOfPerson(id) { return childrenByParentId.get(id) || []; }
function activeChildrenOfPerson(id) { return activeChildrenByParentId.get(id) || []; }
function uniqueIds(ids) { return [...new Set((ids || []).map(String).filter(Boolean))]; }
function setPartnerIds(p, ids) {
  if (!p) return;
  p.partners = uniqueIds(ids).filter(id => id !== p.id);
  p.partner = p.partners[0] || '';
}
function partnerIds(p) {
  if (!p) return [];
  return partnerIdsByPersonId.get(p.id) || [];
}
function primaryPartner(p) { return person(partnerIds(p)[0]); }
function mutualPartnerIds(p) {
  return p ? (mutualPartnerIdsByPersonId.get(p.id) || []) : [];
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
  if (p?.id && familyKeyByPersonId.has(p.id)) return familyKeyByPersonId.get(p.id);
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
  updateOffscreenIndicators();
  if (renderVirtualizationActive) scheduleRender();
}
function personScreenPoint(p, rect = main.getBoundingClientRect()) {
  return {
    x: rect.left + rect.width / 2 + view.x + p.x * view.s,
    y: rect.top + rect.height / 2 + view.y + p.y * view.s
  };
}
function directRelationCandidates(id) {
  const source = person(id);
  if (!source) return [];
  const visible = visibleIds();
  const candidates = [];
  for (const parentId of source.parents || []) {
    if (visible.has(parentId) && person(parentId)) candidates.push({ id: parentId, kind: 'parents' });
  }
  for (const partnerId of partnerIds(source)) {
    if (visible.has(partnerId) && person(partnerId)) candidates.push({ id: partnerId, kind: 'partners' });
  }
  for (const child of activeChildrenOfPerson(id)) {
    if (visible.has(child.id)) candidates.push({ id: child.id, kind: 'children' });
  }
  return [...new Map(candidates.map(candidate => [candidate.id, candidate])).values()];
}
function offscreenDirection(point, bounds) {
  const overflows = [
    { direction: 'left', amount: bounds.left - point.x },
    { direction: 'right', amount: point.x - bounds.right },
    { direction: 'top', amount: bounds.top - point.y },
    { direction: 'bottom', amount: point.y - bounds.bottom }
  ].filter(entry => entry.amount > 0);
  if (!overflows.length) return '';
  return overflows.sort((a, b) => b.amount - a.amount)[0].direction;
}
function offscreenIndicatorLabel(group) {
  const directionLabels = { top: 'oben', right: 'rechts', bottom: 'unten', left: 'links' };
  const kindLabels = { parents: 'Eltern', partners: 'Partner', children: 'Kinder' };
  const kinds = new Set(group.map(entry => entry.kind));
  const subject = kinds.size === 1 ? kindLabels[[...kinds][0]] : 'Beziehungen';
  return `${group.length} ${subject} ${directionLabels[group[0].direction]}`;
}
function updateOffscreenIndicators() {
  if (!offscreenIndicators) return;
  if (!selected || !person(selected) || !main.clientWidth || !main.clientHeight) {
    offscreenIndicators.innerHTML = '';
    return;
  }
  const rect = main.getBoundingClientRect();
  const bounds = {
    left: rect.left + 34,
    right: rect.right - 78,
    top: rect.top + 30,
    bottom: rect.bottom - 96
  };
  const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const grouped = new Map();
  for (const candidate of directRelationCandidates(selected)) {
    const target = person(candidate.id);
    const point = personScreenPoint(target, rect);
    const direction = offscreenDirection(point, bounds);
    if (!direction) continue;
    const distance = Math.hypot(point.x - center.x, point.y - center.y);
    if (!grouped.has(direction)) grouped.set(direction, []);
    grouped.get(direction).push({ ...candidate, direction, distance });
  }
  const arrows = { top: '↑', right: '→', bottom: '↓', left: '←' };
  const order = ['top', 'right', 'bottom', 'left'];
  offscreenIndicators.innerHTML = order
    .filter(direction => grouped.has(direction))
    .map(direction => {
      const group = grouped.get(direction).sort((a, b) => a.distance - b.distance);
      const label = offscreenIndicatorLabel(group);
      return `<button type="button" class="offscreenIndicator" data-direction="${direction}" data-target-id="${esc(group[0].id)}" data-testid="offscreen-${direction}" aria-label="${esc(label)}"><span class="offscreenArrow" aria-hidden="true">${arrows[direction]}</span><span>${esc(label)}</span></button>`;
    }).join('');
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
  return { maxX, maxY };
}
function updateMinimap(maxX, maxY, visiblePeople = null) {
  if ((!minimapInner || !minimapSvg) && (!overviewMap || !overviewSvg)) return;
  const visible = visiblePeople ? new Set(visiblePeople.map(p => p.id)) : visibleIds();
  const sourcePeople = visiblePeople || data.people.filter(p => visible.has(p.id));
  const compactMinimap = sourcePeople.length > 1200;

  if (minimapInner && minimapSvg) {
    minimapState = renderMinimapSurface({
      inner: minimapInner,
      svg: minimapSvg,
      maxX,
      maxY,
      visible,
      sourcePeople,
      compactMinimap,
      fallbackWidth: 150,
      fallbackHeight: 90
    });
  }
  if (overviewMap && overviewSvg) {
    overviewState = renderMinimapSurface({
      inner: overviewMap,
      svg: overviewSvg,
      maxX,
      maxY,
      visible,
      sourcePeople,
      compactMinimap,
      fallbackWidth: 340,
      fallbackHeight: 260
    });
  }
  updateMinimapViewport();
}
function renderMinimapSurface({
  inner,
  svg,
  maxX,
  maxY,
  visible,
  sourcePeople,
  compactMinimap,
  fallbackWidth,
  fallbackHeight
}) {
  const mapW = inner.clientWidth || fallbackWidth;
  const mapH = inner.clientHeight || fallbackHeight;
  const scale = Math.min(mapW / maxX, mapH / maxY);
  const offsetX = (mapW - maxX * scale) / 2;
  const offsetY = (mapH - maxY * scale) / 2;

  svg.setAttribute('viewBox', `0 0 ${mapW} ${mapH}`);
  svg.innerHTML = '';
  if (!compactMinimap) {
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
          svg.appendChild(line);
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
          svg.appendChild(line);
        }
      }
    }
  }
  
  for (const p of sourcePeople) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', offsetX + p.x * scale);
    circle.setAttribute('cy', offsetY + p.y * scale);
    circle.setAttribute('r', compactMinimap ? Math.max(1.1, 2.4 * scale) : Math.max(1.5, 4 * scale));
    circle.setAttribute('class', 'node');
    svg.appendChild(circle);
  }

  return { maxX, maxY, mapW, mapH, scale, offsetX, offsetY };
}
function updateMinimapViewport() {
  positionMinimapViewport(minimapState, minimapViewport);
  positionMinimapViewport(overviewState, overviewViewport);
}
function positionMinimapViewport(state, viewport) {
  if (!state || !viewport) return;
  const { maxX, maxY, scale, offsetX, offsetY } = state;
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
  viewport.style.left = `${left}px`;
  viewport.style.top = `${top}px`;
  viewport.style.width = `${width}px`;
  viewport.style.height = `${height}px`;
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
function fitFocusNeighborhood(id) {
  const ids = focusNeighborhood(id);
  const people = nonPoolPeople.filter(p => ids.has(p.id));
  if (!people.length) {
    fitAll();
    return;
  }
  fitPeople(people, nonPoolPeople.length > 1200 ? 0.82 : 0.72);
}
function fitReadablePerson() {
  const id = focusMode && focusId ? focusId : (selected || preferredLandingPersonId());
  if (!id || !person(id)) return fitAll();
  jumpToPerson(id);
}
function fitAll() {
  const ids = visibleIds();
  const visible = data.people.filter(p => ids.has(p.id));
  if (!visible.length) return;
  const xs = visible.map(p => p.x);
  const ys = visible.map(p => p.y);
  const minX = Math.min(...xs) - 190;
  const maxX = Math.max(...xs) + 190;
  const minY = Math.min(...ys) - 150;
  const maxY = Math.max(...ys) + 150;
  const fitScale = Math.min(
    main.clientWidth / (maxX - minX),
    main.clientHeight / (maxY - minY)
  );
  view.s = Math.max(minZoom, Math.min(1.3, fitScale));
  view.x = -((minX + maxX) / 2) * view.s;
  view.y = -((minY + maxY) / 2) * view.s;
  applyView();
}
function restoreFocusLayoutPositions() {
  if (!focusLayoutRestore) return;
  for (const [id, pos] of focusLayoutRestore.entries()) {
    const p = person(id);
    if (p) {
      p.x = pos.x;
      p.y = pos.y;
    }
  }
  focusLayoutRestore = null;
}
function applyFocusLayout(id) {
  const ids = focusNeighborhood(id);
  const people = nonPoolPeople.filter(p => ids.has(p.id));
  if (!people.length) return;

  restoreFocusLayoutPositions();
  focusLayoutRestore = new Map(people.map(p => [p.id, { x: p.x, y: p.y }]));

  const generation = new Map([[id, 0]]);
  let frontier = [id];
  for (let depth = 1; depth <= 2; depth++) {
    const next = [];
    for (const currentId of frontier) {
      const current = person(currentId);
      for (const parentId of current?.parents || []) {
        if (!ids.has(parentId) || generation.has(parentId)) continue;
        generation.set(parentId, -depth);
        next.push(parentId);
      }
    }
    frontier = next;
  }

  frontier = [id];
  for (let depth = 1; depth <= 2; depth++) {
    const next = [];
    for (const currentId of frontier) {
      for (const child of activeChildrenOfPerson(currentId)) {
        if (!ids.has(child.id) || generation.has(child.id)) continue;
        generation.set(child.id, depth);
        next.push(child.id);
      }
    }
    frontier = next;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const p of people) {
      const ownGen = generation.get(p.id);
      if (ownGen === undefined) continue;
      partnerIds(p).forEach(partnerId => {
        if (ids.has(partnerId) && !generation.has(partnerId)) {
          generation.set(partnerId, ownGen);
          changed = true;
        }
      });
      const parentSet = new Set(p.parents || []);
      if (!parentSet.size) continue;
      for (const other of people) {
        if (other.id === p.id || generation.has(other.id)) continue;
        if ((other.parents || []).some(parentId => parentSet.has(parentId))) {
          generation.set(other.id, ownGen);
          changed = true;
        }
      }
    }
  }

  people.forEach(p => {
    if (!generation.has(p.id)) generation.set(p.id, 0);
  });

  const rows = new Map();
  for (const p of people) {
    const gen = generation.get(p.id) || 0;
    if (!rows.has(gen)) rows.set(gen, []);
    rows.get(gen).push(p);
  }

  const rowGap = 230;
  const centerY = 560;
  const pairGap = 186;
  const singleWidth = 210;
  const coupleWidth = 352;
  const gens = [...rows.keys()].sort((a,b) => a - b);
  for (const gen of gens) {
    const rowPeople = rows.get(gen)
      .sort((a,b) => (birthSortValue(a) ?? Infinity) - (birthSortValue(b) ?? Infinity) || fullName(a).localeCompare(fullName(b)));
    const units = [];
    const used = new Set();
    for (const p of rowPeople) {
      if (used.has(p.id)) continue;
      const primary = mutualPartnerIds(p)
        .map(partnerId => person(partnerId))
        .find(q => q && ids.has(q.id) && (generation.get(q.id) || 0) === gen && !used.has(q.id));
      if (primary) {
        used.add(p.id);
        used.add(primary.id);
        units.push({ members: [p, primary].sort((a,b) => fullName(a).localeCompare(fullName(b))), width: coupleWidth });
      } else {
        used.add(p.id);
        units.push({ members: [p], width: singleWidth });
      }
    }
    const gap = 28;
    const totalWidth = units.reduce((sum, unit) => sum + unit.width, 0) + Math.max(0, units.length - 1) * gap;
    let cursor = -totalWidth / 2;
    const rowY = centerY + gen * rowGap;
    for (const unit of units) {
      const centerX = cursor + unit.width / 2;
      if (unit.members.length > 1) {
        unit.members[0].x = Math.round(centerX - pairGap / 2);
        unit.members[1].x = Math.round(centerX + pairGap / 2);
        unit.members[0].y = rowY;
        unit.members[1].y = rowY;
      } else {
        unit.members[0].x = Math.round(centerX);
        unit.members[0].y = rowY;
      }
      cursor += unit.width + gap;
    }
  }
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
function buildExportSvg({ includeImages = true } = {}) {
  const ids = visibleIds();
  const people = data.people.filter(p => ids.has(p.id));
  if (!people.length) return null;
  const xs = people.map(p => p.x);
  const ys = people.map(p => p.y);
  const minX = Math.min(...xs) - 260, minY = Math.min(...ys) - 220;
  const maxX = Math.max(...xs) + 260, maxY = Math.max(...ys) + 220;
  const w = maxX - minX, h = maxY - minY;
  const node = (p, index) => {
    const x = p.x - minX, y = p.y - minY;
    const color = familyColor(familyKey(p));
    const avatar = includeImages && p.image
      ? `<defs><clipPath id="export-avatar-${index}"><circle cx="27" cy="28" r="17"/></clipPath></defs><circle cx="27" cy="28" r="17" fill="${color}"/><image x="10" y="11" width="34" height="34" preserveAspectRatio="xMidYMid slice" clip-path="url(#export-avatar-${index})" href="${esc(p.image)}"/>`
      : `<circle cx="27" cy="28" r="17" fill="${color}"/><text x="27" y="33" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${esc(initials(fullName(p)||p.name))}</text>`;
    return `<g transform="translate(${x-85},${y-42})"><rect width="170" height="84" rx="18" fill="#fffaf0" stroke="${color}" stroke-width="2"/>${avatar}<text x="52" y="28" font-size="14" font-weight="700" fill="#2f2a24">${esc(visibleName(p)).slice(0,24)}</text><text x="52" y="46" font-size="11" fill="#7b7166">${esc(p.born || '')}</text></g>`;
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
async function exportSvgView({ filename = 'stammbaum-ansicht.svg', includeImages = true } = {}) {
  const output = buildExportSvg({ includeImages });
  if (!output) return false;
  return saveBlobAs(new Blob([output.svg], { type:'image/svg+xml' }), filename, [{
    description: 'SVG-Bild',
    accept: { 'image/svg+xml': ['.svg'] }
  }]);
}
function exportPngView(scaleChoice = '', { filename = 'stammbaum-ansicht.png', includeImages = true } = {}) {
  const output = buildExportSvg({ includeImages });
  if (!output) return Promise.resolve(false);
  const blob = new Blob([output.svg], { type:'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  return new Promise(resolve => {
    img.onload = () => {
      const scale = boundedExportScale(output, scaleChoice);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(output.w * scale);
      canvas.height = Math.round(output.h * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(async png => {
        if (!png) {
          resolve(false);
          return;
        }
        resolve(await saveBlobAs(png, filename, [{
          description: 'PNG-Bild',
          accept: { 'image/png': ['.png'] }
        }]));
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alert('PNG-Export konnte nicht erstellt werden. SVG-Export bleibt verfügbar.');
      resolve(false);
    };
    img.src = url;
  });
}
function exportImageView() {
  openExportDialog('image', $('settingsBtn'));
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
  return childrenOfPerson(id).length > 0;
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
    activeChildrenOfPerson(currentId).forEach(child => {
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
  const ancestorCore = new Set([id]);
  const descendantCore = new Set([id]);
  const centerIds = new Set([id]);

  let frontier = [id];
  for (let depth = 0; depth < 2; depth++) {
    const next = [];
    for (const currentId of frontier) {
      const current = person(currentId);
      for (const parentId of current?.parents || []) {
        if (!person(parentId) || ancestorCore.has(parentId)) continue;
        ancestorCore.add(parentId);
        ids.add(parentId);
        next.push(parentId);
      }
    }
    frontier = next;
  }

  frontier = [id];
  for (let depth = 0; depth < 2; depth++) {
    const next = [];
    for (const currentId of frontier) {
      for (const child of activeChildrenOfPerson(currentId)) {
        if (descendantCore.has(child.id)) continue;
        descendantCore.add(child.id);
        ids.add(child.id);
        next.push(child.id);
      }
    }
    frontier = next;
  }

  for (const currentId of [...ancestorCore, ...descendantCore]) {
    centerIds.add(currentId);
    partnerIds(person(currentId)).forEach(partnerId => {
      if (!person(partnerId)?.pool) ids.add(partnerId);
    });
  }

  const siblingAnchorIds = new Set([id, ...ancestorCore, ...descendantCore]);
  for (const anchorId of siblingAnchorIds) {
    const anchor = person(anchorId);
    const parentIds = new Set(anchor?.parents || []);
    if (!parentIds.size) continue;
    for (const other of nonPoolPeople) {
      if (other.id === anchorId) continue;
      if (!(other.parents || []).some(pid => parentIds.has(pid))) continue;
      ids.add(other.id);
      partnerIds(other).forEach(partnerId => {
        if (!person(partnerId)?.pool) ids.add(partnerId);
      });
    }
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
    childrenOfPerson(pid).forEach(child => walkDescendants(child.id));
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
    activeChildrenOfPerson(currentId).forEach(child => { if (!ids.has(child.id)) queue.push(child.id); });
  }
  return ids;
}
function updateModeUI() {
  document.body.classList.toggle('editMode', editMode);
  document.body.classList.toggle('viewMode', !editMode);
  const btn = $('modeBtn');
  if (btn) {
    const isEdit = !!editMode;
    const activeLabel = isEdit ? 'Bearbeiten' : 'Ansehen';
    btn.title = `Modus umschalten (aktiv: ${activeLabel})`;
    btn.setAttribute('aria-label', `Modus umschalten. Aktueller Modus: ${activeLabel}.`);
    btn.setAttribute('aria-pressed', isEdit ? 'true' : 'false');
    const viewSegment = btn.querySelector('[data-mode="view"]');
    const editSegment = btn.querySelector('[data-mode="edit"]');
    if (viewSegment) viewSegment.classList.toggle('is-active', !isEdit);
    if (editSegment) editSegment.classList.toggle('is-active', isEdit);
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
  if (btn) {
    const title = btn.querySelector('.settingsItemTitle');
    const text = `Ansicht: ${labels[currentViewPreset()]}`;
    if (title) title.textContent = text;
    else btn.textContent = text;
  }
}
function updateLayoutButton() {
  const labels = { classic: 'Klassisch', tree: 'Baum', radial: 'Radial' };
  const btn = $('layoutBtn');
  if (btn) {
    const title = btn.querySelector('.settingsItemTitle');
    const text = `Layout: ${labels[layoutMode]}`;
    if (title) title.textContent = text;
    else btn.textContent = text;
  }
}
function updatePoolButton() {
  const btn = $('poolBtn');
  if (!btn) return;
  const count = pooledPeopleCount;
  const badge = btn.querySelector('.settingsBadge');
  if (badge) {
    const text = String(count);
    badge.textContent = text;
    badge.style.display = count > 0 ? 'grid' : 'none';
  }
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
function markMainNavTarget(btnId) {
  const btn = typeof btnId === 'string' ? $(btnId) : btnId;
  mainNavFocusReturnTarget = btn?.classList?.contains('mainNavBtn') ? btn : null;
}
function returnFocusToMainNavTarget() {
  if (!mainNavFocusReturnTarget) return;
  mainNavFocusReturnTarget.focus({ preventScroll: true });
  mainNavFocusReturnTarget = null;
}
function updateMainNavCurrent(targetId) {
  document.querySelectorAll('.mainNavBtn').forEach(btn => {
    if (!(btn instanceof HTMLElement)) return;
    if (btn.id === targetId) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });
}
function closeSecondaryPanelsForNavigation() {
  closeRootSelection();
  closeSearch();
  closeListEditor();
  closeNavigator();
  closeBirthdays();
  closeCheck();
  closeScrollView();
  closeSheet(true);
  closeSettingsMenu();
  closeFileMenu();
  showBackdrop(false);
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
  const quickBtn = $('quickFocus');
  const text = focusMode ? 'Gesamten Baum zeigen' : 'Nahbereich zeigen';
  if (btn) {
    const title = btn.querySelector('.settingsItemTitle');
    const description = btn.querySelector('.settingsItemDescription');
    if (title) title.textContent = text;
    else btn.textContent = text;
    if (description) {
      description.textContent = focusMode
        ? 'Kehrt zur vollständigen Baumansicht zurück.'
        : 'Zeigt zwei Generationen davor und danach.';
    }
    btn.classList.toggle('primary', focusMode);
    btn.setAttribute('aria-label', text);
    btn.setAttribute('aria-pressed', String(focusMode));
  }
  if (quickBtn) {
    quickBtn.textContent = text;
    quickBtn.classList.toggle('primary', focusMode);
    quickBtn.setAttribute('aria-label', focusMode ? text : 'Nahbereich für diese Person zeigen');
    quickBtn.setAttribute('aria-pressed', String(focusMode));
  }
}
function preferredLandingPersonId() {
  const activePeople = nonPoolPeople;
  if (!activePeople.length) return '';
  if (focusId && person(focusId) && !person(focusId).pool) return focusId;
  const rooted = rootIds.map(id => person(id)).filter(p => p && !p.pool);
  if (rooted.length) {
    const withChildren = rooted.find(p => hasChildren(p.id));
    if (withChildren) return withChildren.id;
    return rooted[0].id;
  }
  if (temporaryRootId && person(temporaryRootId) && !person(temporaryRootId).pool) return temporaryRootId;
  if (selected && person(selected) && !person(selected).pool) return selected;
  const withChildren = activePeople.find(p => hasChildren(p.id));
  return (withChildren || activePeople[0]).id;
}
function focusPreferredPerson({ preferFocus = false } = {}) {
  const id = preferredLandingPersonId();
  if (!id) return;
  selected = id;
  if (preferFocus) {
    setFocusMode(true, id);
    return;
  }
  render();
  fit();
  jumpToPerson(id);
}
function setFocusMode(enabled, id = selected || focusId) {
  if (!enabled) restoreFocusLayoutPositions();
  focusMode = !!enabled && !!id && !!person(id);
  focusId = focusMode ? id : null;
  if (focusMode) selected = focusId;
  updateFocusButton();
  if (focusMode) applyFocusLayout(focusId);
  render();
  if (focusMode) fitFocusNeighborhood(focusId);
  else fit();
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
  return [...relationComponentIds].sort((a,b) => {
    const ax = Math.min(...a.map(id => person(id)?.x ?? 0));
    const bx = Math.min(...b.map(id => person(id)?.x ?? 0));
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
  const commandBefore = captureCommandState();
  if (next !== 'classic') {
    captureClassicPositions();
    restoreClassicPositions();
  }
  layoutMode = next;
  if (layoutMode === 'classic') restoreClassicPositions();
  if (layoutMode === 'tree') applyTreeLayout();
  if (layoutMode === 'radial') applyRadialLayout();
  updateLayoutButton();
  commitDataCommand(`Layout ${next === 'classic' ? 'Klassisch' : next === 'tree' ? 'Baum' : 'Radial'}`, commandBefore);
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
  const tileTags = [
    !rootIds.length && temporaryRootId === p.id && 'Temporärer Start',
    p.occupation && p.occupation.slice(0,22),
    p.religion && p.religion.slice(0,22),
    p.location && p.location.slice(0,22),
    p.note && p.note.slice(0,22),
    confidenceText(p)
  ].filter(Boolean).slice(0, 3);
  const tags = tileTags.length ? `<div class="tags">${tileTags.map(tag => `<span class="tag">${esc(tag)}</span>`).join('')}</div>` : '';
  const display = visibleName(p);
  const title = fullName(p) !== display ? ` title="${esc(fullName(p))}"` : '';
  const cls = className ? ` class="${className}"` : '';
  return `<div${cls} tabindex="-1" data-member-id="${esc(p.id)}" data-testid="person-card-${esc(p.id)}"><div class="avatar">${avatarHtml(p, display)}</div><h3${title}>${esc(display)}</h3>${meta}${tags}</div>`;
}

// -- Rendering ---------------------------------------------------------
function render() {
  updatePoolButton();
  const worldBounds = updateWorldBounds();
  updateZoomClass();
  const visible = visibleIds();
  const visiblePeople = nonPoolPeople.filter(p => visible.has(p.id));
  renderVirtualizationActive = shouldVirtualizePeople(visiblePeople);
  const renderedPeople = renderVirtualizationActive ? viewportPeopleSlice(visiblePeople) : visiblePeople;
  const renderedIds = new Set(renderedPeople.map(p => p.id));
  const showGenerationBands = !renderVirtualizationActive && visiblePeople.length <= 600;
  updateMinimap(worldBounds.maxX, worldBounds.maxY, minimapSamplePeople(visiblePeople));
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
      if (!(p.id < partnerId) || !renderedIds.has(partnerId) || !renderedIds.has(p.id)) continue;
      const q = person(partnerId);
      if (q && renderedIds.has(q.id)) addLine(p.x, p.y, q.x, q.y, 'line partner');
    }
  }

  renderFamilyLines(renderedIds, renderedPeople);

  const renderedCoupleMembers = new Set();
  const partnerCluster = start => {
    const members = [];
    const seen = new Set();
    const queue = [start.id];
    while (queue.length) {
      const id = queue.shift();
      if (!id || seen.has(id) || !renderedIds.has(id)) continue;
      seen.add(id);
      const member = person(id);
      if (!member) continue;
      members.push(member);
      mutualPartnerIds(member).forEach(partnerId => {
        if (!seen.has(partnerId) && renderedIds.has(partnerId)) queue.push(partnerId);
      });
    }
    return members;
  };
  for (const p of renderedPeople) {
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
  if (generationBands && showGenerationBands) renderGenerationBands(visiblePeople);
  updateOffscreenIndicators();
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
  drag = {
    id,
    sx: e.clientX,
    sy: e.clientY,
    positions,
    branch: e.shiftKey,
    moved: false,
    commandBefore: captureCommandState()
  };
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
  const dragState = drag;
  const id = dragState.id;
  const moved = dragState.moved;
  drag = null;
  nodes.querySelectorAll('.branchDragging').forEach(el => el.classList.remove('branchDragging'));
  if (moved) {
    if (renderFrame) {
      cancelAnimationFrame(renderFrame);
      renderFrame = null;
    }
    commitDataCommand(dragState.branch ? 'Zweig verschieben' : 'Person verschieben', dragState.commandBefore);
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
  const dragState = drag;
  const id = dragState.id;
  const moved = dragState.moved;
  drag = null;
  if (moved) {
    if (renderFrame) {
      cancelAnimationFrame(renderFrame);
      renderFrame = null;
    }
    commitDataCommand(dragState.branch ? 'Zweig verschieben' : 'Person verschieben', dragState.commandBefore);
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
function viewportWorldBounds(marginX = 380, marginY = 260) {
  const rect = main.getBoundingClientRect();
  const topLeft = screenToWorld(rect.left - marginX, rect.top - marginY);
  const bottomRight = screenToWorld(rect.right + marginX, rect.bottom + marginY);
  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    maxX: Math.max(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxY: Math.max(topLeft.y, bottomRight.y)
  };
}
function shouldVirtualizePeople(people) {
  return people.length > 900 && view.s > 0.09;
}
function viewportPeopleSlice(people) {
  const bounds = viewportWorldBounds();
  const kept = people.filter(p =>
    p.x >= bounds.minX &&
    p.x <= bounds.maxX &&
    p.y >= bounds.minY &&
    p.y <= bounds.maxY
  );
  if (!kept.length) {
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    return [...people]
      .sort((a, b) =>
        (Math.abs(a.x - centerX) + Math.abs(a.y - centerY)) -
        (Math.abs(b.x - centerX) + Math.abs(b.y - centerY))
      )
      .slice(0, Math.min(240, people.length));
  }
  const extraIds = new Set();
  kept.forEach(p => {
    extraIds.add(p.id);
    mutualPartnerIds(p).forEach(id => extraIds.add(id));
  });
  const sliced = people.filter(p => extraIds.has(p.id));
  if (sliced.length < Math.min(80, people.length)) return people;
  return sliced;
}
function minimapSamplePeople(people) {
  if (people.length <= 1200) return people;
  const stride = Math.max(1, Math.ceil(people.length / 1200));
  return people.filter((_, index) => index % stride === 0);
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
  if (p?.id && birthSortValueByPersonId.has(p.id)) return birthSortValueByPersonId.get(p.id);
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
  const commandBefore = saveResult ? captureCommandState() : null;
  const largeDataset = activePeople.length > 1200;

  const byId = new Map(activePeople.map(p => [p.id, p]));
  const layoutParentsOf = p => uniqueIds(p?.parents || []).filter(id => byId.has(id)).slice(0, 2);
  const childrenOf = new Map(activePeople.map(p => [p.id, []]));
  for (const p of activePeople) {
    for (const pid of layoutParentsOf(p)) {
      if (childrenOf.has(pid)) childrenOf.get(pid).push(p);
    }
  }

  const pairGap = 186;
  const nodeGap = 36;
  const parentGroupGap = largeDataset ? 112 : 86;
  const rootY = 130;
  const startX = 110;
  const singleCardWidth = 196;
  const coupleCardWidth = 322;
  const minSingle = 196;
  const minPair = 352;
  const fallbackRowGap = largeDataset ? 215 : 185;
  const memo = new Map();
  const depthMemo = new Map();
  const childListMemo = new Map();
  const reachableMemo = new Map();
  const subtreeBranchMemo = new Map();
  const localPartnerIds = new Map(activePeople.map(p => [p.id, partnerIds(p).filter(id => byId.has(id))]));

  const hasParents = p => layoutParentsOf(p).length > 0;
  const hasChildrenLocal = p => (childrenOf.get(p?.id) || []).length > 0;
  const partnerIdsOf = p => localPartnerIds.get(p.id) || [];
  const partnerOf = p => partnerIdsOf(p).map(id => byId.get(id)).find(Boolean) || null;
  const unitIds = p => {
    const q = partnerOf(p);
    return q ? [p.id, q.id] : [p.id];
  };
  const belongsToUnit = (child, ids) => {
    const parents = layoutParentsOf(child);
    if (!parents.some(pid => ids.includes(pid))) return false;
    if (ids.length === 1) return true;
    return parents.length <= 1 || parents.every(pid => ids.includes(pid));
  };

  function depthOf(p, seen = new Set()){
    if(depthMemo.has(p.id)) return depthMemo.get(p.id);
    if(seen.has(p.id)) return 0;
    seen.add(p.id);
    const parents = layoutParentsOf(p).map(id => byId.get(id)).filter(Boolean);
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
          const extra = idx > 0 && parentGroupKey(layoutParentsOf(k)) !== parentGroupKey(layoutParentsOf(kids[idx - 1])) ? parentGroupGap : 0;
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
    if (!hasChildrenLocal(p)) continue;
    if (partnerIdsOf(p).some(pid => hasParents(byId.get(pid)) && hasChildrenLocal(byId.get(pid)))) {
      used.add(p.id);
      continue;
    }
    const q = partnerOf(p);
    if (q && hasParents(q) && hasChildrenLocal(q)) continue;

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
          const extra = idx > 0 && parentGroupKey(layoutParentsOf(k)) !== parentGroupKey(layoutParentsOf(kids[idx - 1])) ? parentGroupGap : 0;
          return s + subtreeWidth(k.id) + (idx ? nodeGap + extra : 0);
        }, 0)
      : 0;

    let x = left + (width - total) / 2;
    kids.forEach((k, idx) => {
      if (idx > 0 && parentGroupKey(layoutParentsOf(k)) !== parentGroupKey(layoutParentsOf(kids[idx - 1]))) x += parentGroupGap;
      const cw = subtreeWidth(k.id);
      place(k.id, x, fallbackDepth + 1, idx);
      x += cw + nodeGap;
    });
  }

  function compactThinSiblingUnits() {
    const groups = new Map();
    for (const child of activePeople) {
      const key = parentGroupKey(layoutParentsOf(child));
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

      const parentIds = layoutParentsOf(siblings[0]);
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
      const key = parentGroupKey(layoutParentsOf(child));
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

        const parents = layoutParentsOf(siblings[0])
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
      const queue = [...layoutParentsOf(partner), ...partnerIdsOf(partner).filter(id => !directIds.has(id))];
      while (queue.length) {
        const id = queue.shift();
        if (!id || ids.has(id) || directIds.has(id)) continue;
        const current = byId.get(id);
        if (!current) continue;
        ids.add(id);
        layoutParentsOf(current).forEach(parentId => queue.push(parentId));
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
          .filter(child => !directIds.has(child.id) && !layoutParentsOf(child).some(parentId => directIds.has(parentId)))
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

  function spreadCrowdedRows() {
    if (!largeDataset) return;
    const rowTolerance = 96;
    const laneGap = 118;
    const maxLaneWidth = 11800;
    const usedInUnit = new Set();
    const units = [];
    const sameRow = (a, b) => Math.abs(a.y - b.y) <= 8;

    for (const p of activePeople) {
      if (usedInUnit.has(p.id)) continue;
      const partner = partnerIdsOf(p)
        .map(id => byId.get(id))
        .find(q => q && !usedInUnit.has(q.id) && sameRow(p, q));
      if (partner) {
        const members = [p, partner].sort((a,b) => a.x - b.x || a.id.localeCompare(b.id));
        members.forEach(member => usedInUnit.add(member.id));
        const minX = Math.min(...members.map(member => member.x));
        const maxX = Math.max(...members.map(member => member.x));
        units.push({
          members,
          center: (minX + maxX) / 2,
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
      const totalWidth = rowUnits.reduce((sum, unit) => sum + unit.width, 0) + Math.max(0, rowUnits.length - 1) * 22;
      if (rowUnits.length < 9 || totalWidth <= maxLaneWidth) continue;

      const laneCount = Math.min(4, Math.max(2, Math.ceil(totalWidth / maxLaneWidth)));
      const lanes = Array.from({ length: laneCount }, () => ({ width: 0, units: [] }));
      rowUnits.forEach(unit => {
        const lane = lanes.reduce((best, current) => current.width < best.width ? current : best, lanes[0]);
        lane.units.push(unit);
        lane.width += unit.width + 22;
      });

      const sortedLanes = lanes.filter(lane => lane.units.length).sort((a,b) => a.width - b.width);
      const laneOffsets = sortedLanes.map((_, index, arr) => (index - (arr.length - 1) / 2) * laneGap);
      sortedLanes.forEach((lane, laneIndex) => {
        const offsetY = laneOffsets[laneIndex];
        lane.units.forEach(unit => {
          unit.members.forEach(member => {
            member.y = Math.round(row.y + offsetY);
          });
        });
      });
    }
  }

  function packRelationComponents() {
    const componentGap = largeDataset ? 168 : 96;
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
    const branchGap = largeDataset ? 168 : 96;
    const rowGap = largeDataset ? 280 : 180;
    const maxRowWidth = largeDataset
      ? (rootBranchIds.length > 220 ? 22000 : rootBranchIds.length > 120 ? 18000 : 15000)
      : rootBranchIds.length > 160
        ? 14000
        : rootBranchIds.length > 72
          ? 11000
          : 8200;
    const minBranchWidth = largeDataset ? 480 : 0;
    let cursorX = startX;
    let cursorY = rootY;
    let rowHeight = 0;
    for (const ids of rootBranchIds) {
      const people = [...ids].map(id => byId.get(id)).filter(Boolean);
      if (!people.length) continue;
      const minX = Math.min(...people.map(person => person.x - singleCardWidth / 2));
      const maxX = Math.max(...people.map(person => person.x + singleCardWidth / 2));
      const minY = Math.min(...people.map(person => person.y - 82));
      const maxY = Math.max(...people.map(person => person.y + 82));
      const width = Math.max(minBranchWidth, maxX - minX);
      const height = maxY - minY;
      if (cursorX > startX && cursorX + width > startX + maxRowWidth) {
        cursorX = startX;
        cursorY += rowHeight + rowGap;
        rowHeight = 0;
      }
      const deltaX = Math.round(cursorX - minX);
      const deltaY = Math.round(cursorY - minY);
      people.forEach(person => {
        person.x = Math.round(person.x + deltaX);
        person.y = Math.round(person.y + deltaY);
      });
      cursorX += width + branchGap;
      rowHeight = Math.max(rowHeight, height);
    }
  }

  function compressEmptyHorizontalSpace() {
    if (largeDataset) return;
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
    if (largeDataset) return;
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
  spreadCrowdedRows();
  packRelationComponents();
  if (!largeDataset) {
    compactSiblingSubtrees();
    compactThinSiblingUnits();
  }
  packRootBranches();
  alignPartnerClusters();
  anchorInLawAncestorBranches();
  interlockRootBranches();
  compressEmptyHorizontalSpace();

  if (saveResult) {
    clearGeneratedLayoutState();
    commitDataCommand('Auto-Layout anwenden', commandBefore);
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
    errors.push({ fields: ['parent1', 'parent2'], message: 'Bitte zwei unterschiedliche Elternteile auswählen.' });
  }
  if (currentId && parents.includes(currentId)) {
    errors.push({ fields: ['parent1', 'parent2'], message: 'Eine Person kann nicht ihr eigener Elternteil sein.' });
  }
  if (currentId && partnerId === currentId) {
    errors.push({ fields: ['partner'], message: 'Eine Person kann nicht ihr eigener Partner sein.' });
  }
  if (partnerId && parents.includes(partnerId)) {
    errors.push({ fields: ['partner', 'parent1', 'parent2'], message: 'Partner/in und Elternteil dürfen nicht dieselbe Person sein.' });
  }
  if (currentId && partnerId && descendants.has(partnerId)) {
    errors.push({ fields: ['partner'], message: 'Nachkommen können nicht als Partner/in eingetragen werden.' });
  }
  if (currentId && parents.some(id => descendants.has(id))) {
    errors.push({ fields: ['parent1', 'parent2'], message: 'Nachkommen können nicht als Elternteil eingetragen werden.' });
  }
  if (!isValidDateInput(born)) {
    errors.push({ fields: ['born'], message: 'Geburtsdatum bitte als Jahr, MM.JJJJ, TT.MM. oder TT.MM.JJJJ eingeben.' });
  }
  if (!isValidDateInput(died)) {
    errors.push({ fields: ['died'], message: 'Sterbedatum bitte als Jahr, MM.JJJJ oder TT.MM.JJJJ eingeben.' });
  }
  return errors;
}

function clearFormValidationErrors() {
  const form = $('personEditView');
  if (!form) return;
  form.querySelectorAll('[data-form-error]').forEach(error => error.remove());
  form.querySelectorAll('[aria-invalid="true"]').forEach(element => element.removeAttribute('aria-invalid'));
  form.querySelectorAll('[aria-describedby]').forEach(element => {
    const remaining = element.getAttribute('aria-describedby')
      .split(/\s+/)
      .filter(id => id && !id.startsWith('form-error-'));
    if (remaining.length) element.setAttribute('aria-describedby', remaining.join(' '));
    else element.removeAttribute('aria-describedby');
  });
  $('formErrorList').innerHTML = '';
  $('formErrorSummary').classList.add('hidden');
}

function revealFormSectionFor(element) {
  const body = element?.closest('.formSectionBody');
  if (!body?.hidden) return;
  body.hidden = false;
  const toggle = document.querySelector(`.formSectionToggle[aria-controls="${body.id}"]`);
  toggle?.setAttribute('aria-expanded', 'true');
}

function showFormValidationErrors(errors) {
  clearFormValidationErrors();
  if (!errors.length) return true;
  const summary = $('formErrorSummary');
  const list = $('formErrorList');
  let firstInvalid = null;
  errors.forEach((error, errorIndex) => {
    const item = document.createElement('li');
    item.textContent = error.message;
    list.appendChild(item);
    const elements = [
      ...(error.fields || []).map(id => $(id)),
      ...(error.elements || [])
    ].filter((element, index, all) => element && all.indexOf(element) === index);
    elements.forEach((element, elementIndex) => {
      revealFormSectionFor(element);
      element.setAttribute('aria-invalid', 'true');
      const key = String(element.id || element.dataset.marriagePartner || `${errorIndex}-${elementIndex}`)
        .replace(/[^a-zA-Z0-9_-]/g, '-');
      const errorId = `form-error-${key}-${errorIndex}`;
      const message = document.createElement('p');
      message.className = 'fieldError';
      message.id = errorId;
      message.dataset.formError = 'true';
      message.textContent = error.message;
      const host = element.closest('.field, .partnerChip') || element.parentElement;
      host?.appendChild(message);
      const describedBy = new Set((element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
      describedBy.add(errorId);
      element.setAttribute('aria-describedby', [...describedBy].join(' '));
      if (!firstInvalid) firstInvalid = element;
    });
  });
  summary.classList.remove('hidden');
  if (firstInvalid) {
    firstInvalid.scrollIntoView({ block: 'center', behavior: 'auto' });
    firstInvalid.focus({ preventScroll: true });
  } else {
    summary.focus({ preventScroll: true });
  }
  return false;
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
  return ['edit', 'create'].includes(personSheetMode)
    && $('sheet').classList.contains('open')
    && formSnapshot() !== sheetSnapshot;
}

async function confirmDiscardSheetChanges(trigger = document.activeElement) {
  if (!hasUnsavedSheetChanges()) return true;
  const decision = await openDecisionDialog({
    title: 'Änderungen verwerfen?',
    message: 'Deine nicht gespeicherten Änderungen an dieser Person gehen beim Verwerfen verloren.',
    confirmLabel: 'Änderungen verwerfen',
    cancelLabel: 'Weiter bearbeiten',
    secondaryLabel: 'Änderungen speichern',
    confirmClass: 'danger',
    secondaryClass: 'primary',
    trigger
  });
  if (decision === 'secondary') {
    await saveSheet();
    return false;
  }
  return decision === 'confirm';
}

function relationButtons(items, relationKey, relationLabel) {
  if (!items.length) return '';
  return `<div class="detailLinks">${items.map(item => {
    const related = item.person || item;
    const suffix = item.suffix || '';
    const name = fullName(related) || related.name;
    return `<button type="button" class="detailLink detailRelationLink" data-person-relation="${esc(relationKey)}"
      data-person-id="${esc(related.id)}" data-testid="person-relation-${esc(relationKey)}-${esc(related.id)}"
      aria-label="${esc(`${name} als ${relationLabel} öffnen`)}">${esc(name)}${suffix ? ` · ${esc(suffix)}` : ''}</button>`;
  }).join('')}</div>`;
}

function detailSection(title, content, modifier = '') {
  return `<section class="detailSection ${modifier ? `detailSection${modifier}` : ''}">${title ? `<span class="detailLabel">${esc(title)}</span>` : ''}${content}</section>`;
}

function buildPersonDetailModel(p) {
  if (!p) return null;
  const parents = (p.parents || []).map(person).filter(Boolean);
  const partners = partnerIds(p).map(person).filter(Boolean).map(partner => {
    const married = marriageDateFor(p, partner.id);
    return { person: partner, suffix: married ? `verh. ${formatBirthDate(married)}` : '' };
  });
  const children = data.people
    .filter(child => (child.parents || []).includes(p.id))
    .sort((a,b) => (birthSortValue(a) ?? Infinity) - (birthSortValue(b) ?? Infinity) || fullName(a).localeCompare(fullName(b)));
  const life = [
    p.born ? `geb. ${formatBirthDate(p.born)}` : '',
    p.died ? `gest. ${formatBirthDate(p.died)}` : '',
    ageInfo(p)
  ].filter(Boolean).join(' · ') || 'Lebensdaten nicht eingetragen';
  return {
    person: p,
    name: displayName(p),
    life,
    parents,
    partners,
    children,
    sources: cleanMentions(p.mentions),
    link: safeUrl(p.link),
    confidence: confidenceText(p),
    isRoot: isMainRoot(p.id),
    isTemporaryRoot: !rootIds.length && temporaryRootId === p.id
  };
}

function renderPersonDetails(p) {
  const details = $('personDetails');
  const model = buildPersonDetailModel(p);
  if (!details || !model) {
    if (details) details.innerHTML = '';
    return;
  }
  const sourceHtml = model.sources.map(item => {
    const url = safeUrl(item.link);
    const title = url
      ? `<a class="detailValue" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(item.title || item.link)}</a>`
      : `<div class="detailValue">${esc(item.title || item.link || 'Quelle')}</div>`;
    return `<div class="mentionItem">${title}${item.date ? `<small>${esc(item.date)}</small>` : ''}</div>`;
  }).join('');

  details.innerHTML = `
    <div class="detailHero" style="--family-color:${esc(familyColor(familyKey(p)))}">
      <div class="detailAvatar">${avatarHtml(p)}</div>
      <div>
        <div class="detailName">${esc(model.name)}</div>
        <div class="detailMeta">${esc(model.life)}</div>
      </div>
    </div>
    <div class="detailGrid">
      ${model.isRoot ? detailSection('Hauptwurzel', '<div class="detailValue">Ausgangspunkt des Stammbaums</div>', '--identity') : ''}
      ${model.isTemporaryRoot ? detailSection('Temporärer Start', '<div class="detailValue">Nur der aktuelle Einstieg; Beziehungen bleiben unverändert.</div>', '--identity') : ''}
      ${model.parents.length ? detailSection('Eltern', relationButtons(model.parents, 'parent', 'Elternteil'), '--relations') : ''}
      ${model.partners.length ? detailSection('Partner/in', relationButtons(model.partners, 'partner', 'Partnerperson'), '--relations') : ''}
      ${model.children.length ? detailSection('Kinder', relationButtons(model.children, 'child', 'Kind'), '--relations') : ''}
      ${p.occupation ? detailSection('Beruf', `<div class="detailValue">${esc(p.occupation)}</div>`) : ''}
      ${p.religion ? detailSection('Glaubensrichtung', `<div class="detailValue">${esc(p.religion)}</div>`) : ''}
      ${p.location ? detailSection('Ort', `<div class="detailValue">${esc(p.location)}</div>`) : ''}
      ${model.link ? detailSection('Link', `<a class="detailValue" href="${esc(model.link)}" target="_blank" rel="noopener noreferrer">${esc(p.link)}</a>`, '--full') : ''}
      ${sourceHtml ? detailSection('Quellen', `<div class="mentionList">${sourceHtml}</div>`, '--full') : ''}
      ${model.confidence ? detailSection('Sicherheit', `<div class="detailValue">${esc(confidenceLabel(p.confidence))}</div>`, '--full') : ''}
      ${p.note ? detailSection('Notiz', `<div class="detailValue">${esc(p.note)}</div>`, '--full') : ''}
    </div>
  `;

  details.querySelectorAll('[data-person-id]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const targetId = btn.dataset.personId;
      jumpToPerson(targetId);
      openSheet(targetId, { mode: 'detail', focus: 'heading' });
    });
  });
}

function clearPersonSheetDraft() {
  sheetSnapshot = '';
  imageDraft = '';
  mentionsDraft = [];
  removedPartnerDraft = new Set();
  marriageDraft = {};
}

function populatePersonForm(p, id) {
  clearFormValidationErrors();
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
  $('partnerMarriageDate').disabled = !$('partner').value;
  $('clearImageBtn').disabled = !imageDraft;
  $('inPool').title = p ? `${poolBranchIds(p.id).size} Person(en) in diesem Zweig` : '';
  sheetSnapshot = formSnapshot();
}

function setPersonSheetView(mode, p) {
  personSheetMode = mode;
  $('sheet').dataset.view = mode;
  $('personDetailView').hidden = mode !== 'detail';
  $('personEditView').hidden = mode === 'detail';
  $('personEditBack').classList.toggle('hidden', mode !== 'edit');
  $('sheetTitle').textContent = mode === 'detail'
    ? 'Person ansehen'
    : (mode === 'edit' ? 'Person bearbeiten' : 'Neue Person');
  $('quickFocus').style.display = p ? '' : 'none';
  updateFocusButton();
  $('personEditBtn').style.display = p ? '' : 'none';
  $('quickChild').style.display = p && mode === 'edit' ? '' : 'none';
  $('quickPartner').style.display = p && mode === 'edit' ? '' : 'none';
  $('quickParents').style.display = p && mode === 'edit' ? '' : 'none';
  $('deleteBtn').style.display = p && mode === 'edit' ? '' : 'none';
}

function focusPersonSheet(mode, focusTarget = '') {
  setTimeout(() => {
    if (!$('sheet').classList.contains('open') || personSheetMode !== mode) return;
    if (focusTarget === 'editButton') $('personEditBtn')?.focus();
    else if (mode === 'edit' || mode === 'create') {
      const active = document.activeElement;
      if (!active || active === document.body || !$('sheet').contains(active)) $('firstName')?.focus();
    }
    else $('sheetTitle')?.focus();
  }, 80);
}

function openSheet(id, { mode = '', focus = '' } = {}) {
  selected = id;
  const p = person(id);
  const nextMode = p ? (mode === 'edit' ? 'edit' : 'detail') : 'create';
  if (nextMode === 'detail') {
    clearPersonSheetDraft();
    renderPersonDetails(p);
  } else {
    populatePersonForm(p, id);
  }
  setPersonSheetView(nextMode, p);
  setDialogVisibility($('sheet'), true);
  showBackdrop(true);
  render();
  focusPersonSheet(nextMode, focus);
}

function openPersonEdit(id) {
  const p = person(id);
  if (!p) return false;
  if (!editMode) {
    editMode = true;
    updateModeUI();
  }
  openSheet(id, { mode: 'edit' });
  return true;
}

async function returnToPersonDetail(force = false, trigger = document.activeElement) {
  const id = selected;
  if (!person(id)) return false;
  if (!force && hasUnsavedSheetChanges() && !(await confirmDiscardSheetChanges(trigger))) return false;
  clearPersonSheetDraft();
  openSheet(id, { mode: 'detail', focus: 'editButton' });
  return true;
}

function focusSelectedPersonCard(id) {
  if (!id) {
    returnFocusToMainNavTarget();
    return;
  }
  const selector = `[data-member-id="${CSS.escape(id)}"]`;
  const card = document.querySelector(selector);
  if (card instanceof HTMLElement) card.focus({ preventScroll: true });
  else returnFocusToMainNavTarget();
}

async function closeSheet(force = false, trigger = document.activeElement) {
  if (!force && hasUnsavedSheetChanges() && !(await confirmDiscardSheetChanges(trigger))) return false;
  const returnMode = listReturnMode;
  const reopenSearch = searchReturnMode;
  const reopenQuery = searchReturnQuery;
  const reopenScrollTop = searchReturnScrollTop;
  const closingPersonId = person(selected)?.id || '';
  listReturnMode = '';
  searchReturnMode = false;
  searchReturnQuery = '';
  searchReturnScrollTop = 0;
  selected = closingPersonId || null;
  personSheetMode = 'closed';
  clearPersonSheetDraft();
  setDialogVisibility($('sheet'), false);
  showBackdrop(false);
  render();
  if (returnMode) {
    setTimeout(() => openListEditor(returnMode), 0);
  } else if (reopenSearch) {
    setTimeout(() => {
      openSearch();
      const queryInput = $('personSearch');
      if (queryInput) queryInput.value = reopenQuery;
      renderSearchResults();
      if ($('searchRows')) $('searchRows').scrollTop = reopenScrollTop || 0;
    }, 0);
  } else {
    setTimeout(() => focusSelectedPersonCard(closingPersonId), 0);
  }
  setTimeout(maybeOpenRequiredRootSelection, 0);
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

async function saveSheet() {
  const saveTrigger = document.activeElement;
  let p = person(selected);
  const wasExistingPerson = !!p;
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

  const validationErrors = validatePersonForm(selected, parents, newPartner, born, died);
  if (makeMainRoot && keepBranchInPool) {
    validationErrors.push({
      fields: ['inPool', 'mainRoot'],
      message: 'Die Hauptwurzel kann nicht gleichzeitig im Vorrat liegen.'
    });
  }
  if (makeMainRoot && !isMainRoot(selected) && rootIds.length >= 2) {
    validationErrors.push({
      fields: ['mainRoot'],
      message: 'Es können höchstens zwei Hauptwurzeln festgelegt werden.'
    });
  }
  Object.entries(marriageDraft).forEach(([partnerId, value]) => {
    if (isValidDateInput(value)) return;
    const marriageInput = [...document.querySelectorAll('[data-marriage-partner]')]
      .find(input => input.dataset.marriagePartner === partnerId);
    validationErrors.push({
      elements: [marriageInput].filter(Boolean),
      message: 'Heiratsdatum bitte als Jahr, MM.JJJJ oder TT.MM.JJJJ eingeben.'
    });
  });
  if (newPartner && !isValidDateInput(newMarriageDate)) {
    validationErrors.push({
      fields: ['partnerMarriageDate'],
      message: 'Heiratsdatum bitte als Jahr, MM.JJJJ oder TT.MM.JJJJ eingeben.'
    });
  }
  if (!showFormValidationErrors(validationErrors)) return false;
  if (p && keepBranchInPool && !p.pool) {
    const branchSize = poolBranchIds(p.id).size;
    const decision = await openDecisionDialog({
      title: 'Zweig in den Vorrat verschieben?',
      message: `${branchSize} Person(en) dieses Zweigs werden aus der normalen Baumansicht ausgeblendet. Die Personen und ihre Verknüpfungen bleiben erhalten.`,
      confirmLabel: 'In Vorrat verschieben',
      cancelLabel: 'Im Stammbaum lassen',
      trigger: saveTrigger
    });
    if (decision !== 'confirm') return false;
  }
  const commandBefore = captureCommandState();

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
    commitDataCommand(wasExistingPerson ? 'Person speichern' : 'Person anlegen', commandBefore);
    render();
    if($('sideNav')?.classList.contains('open')) renderNavigator();
    if($('listSheet')?.classList.contains('open')) renderListEditor();
    updatePoolButton();
    updateRootButton();
    sheetSnapshot = formSnapshot();
    openSheet(p.id, { mode: 'detail', focus: 'editButton' });
    setTimeout(maybeOpenRequiredRootSelection, 0);
  });
  return true;
}

function newPersonNear(base, dx, dy) {
  return { id: nextId(), name: 'Neue Person', born: '', died: '', birthName: '', occupation: '', religion: '', location: '', link: '', image: '', mentions: [], pool: false, note: '', confidence: 'high', x: Math.round((base?.x ?? 400) + dx), y: Math.round((base?.y ?? 300) + dy), parents: [], partner: '', partners: [] };
}
function addChildFor(id) {
  const p = person(id); if (!p) return;
  const commandBefore = captureCommandState();
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
  resetGeneratedLayout();
  commitDataCommand('Kind anlegen', commandBefore);
  render();
  if($('sideNav')?.classList.contains('open')) renderNavigator();
  openSheet(child.id, { mode: 'edit' });
}
function addPartnerFor(id) {
  const p = person(id); if (!p) return;
  const commandBefore = captureCommandState();
  const q = newPersonNear(p, 230, 0);
  q.pool = !!p.pool;
  q.name = 'Partner/in von ' + p.name;
  linkPartners(p, q);
  data.people.push(q);
  resetGeneratedLayout();
  commitDataCommand('Partnerperson anlegen', commandBefore);
  render();
  if($('sideNav')?.classList.contains('open')) renderNavigator();
  openSheet(q.id, { mode: 'edit' });
}
function addParentsFor(id) {
  const p = person(id); if (!p) return;
  const commandBefore = captureCommandState();
  const a = newPersonNear(p, -120, -260);
  data.people.push(a);
  const b = newPersonNear(p, 120, -260);
  a.pool = !!p.pool;
  b.pool = !!p.pool;
  a.name = 'Elternteil 1 von ' + p.name;
  b.name = 'Elternteil 2 von ' + p.name;
  linkPartners(a, b);
  p.parents = [a.id, b.id];
  data.people.push(b);
  resetGeneratedLayout();
  commitDataCommand('Eltern anlegen', commandBefore);
  render();
  if($('sideNav')?.classList.contains('open')) renderNavigator();
  openSheet(a.id, { mode: 'edit' });
}
function deletePersonWithCommand(id) {
  const target = person(id);
  if (!target) return false;
  const commandBefore = captureCommandState();
  if (focusId === id) {
    focusMode = false;
    focusId = null;
    updateFocusButton();
  }
  if (isMainRoot(id)) {
    rootIds = rootIds.filter(rootId => rootId !== id);
    updateRootButton();
  }
  data.people = data.people
    .filter(entry => entry.id !== id)
    .map(entry => {
      const partners = partnerIds(entry).filter(partnerId => partnerId !== id);
      const partnerDetails = { ...(entry.partnerDetails || {}) };
      delete partnerDetails[id];
      return {
        ...entry,
        parents: (entry.parents || []).filter(parentId => parentId !== id),
        partner: partners[0] || '',
        partners,
        partnerDetails
      };
    });
  if (activeFamily && !data.people.some(entry => matchesFamily(entry, activeFamily))) activeFamily = '';
  commitDataCommand('Person löschen', commandBefore);
  return true;
}

let listSortMode = 'family';
let listViewMode = 'tree';
let listReturnMode = '';
let searchReturnMode = false;
let searchReturnScrollTop = 0;
let searchReturnQuery = '';

function setDialogVisibility(el, visible){
  el.classList.toggle('open', visible);
  el.setAttribute('aria-hidden', visible ? 'false' : 'true');
}
function showBackdrop(visible){
  const back = $('backdrop');
  back.classList.toggle('show', visible);
  back.setAttribute('aria-hidden', visible ? 'false' : 'true');
}
function settleDecisionDialog(result) {
  const layer = $('decisionLayer');
  const dialog = $('decisionDialog');
  if (!decisionResolver || !layer || !dialog) return;
  layer.classList.add('hidden');
  dialog.setAttribute('aria-hidden', 'true');
  const resolve = decisionResolver;
  const focusTarget = decisionFocusReturnTarget;
  decisionResolver = null;
  decisionFocusReturnTarget = null;
  focusTarget?.focus({ preventScroll: true });
  resolve(result);
}
function openDecisionDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  secondaryLabel = '',
  confirmClass = 'primary',
  secondaryClass = '',
  trigger = document.activeElement
}) {
  if (decisionResolver) settleDecisionDialog('cancel');
  const layer = $('decisionLayer');
  const dialog = $('decisionDialog');
  const cancelButton = $('decisionCancel');
  const secondaryButton = $('decisionSecondary');
  const confirmButton = $('decisionConfirm');
  $('decisionTitle').textContent = title;
  $('decisionMessage').textContent = message;
  cancelButton.textContent = cancelLabel;
  secondaryButton.textContent = secondaryLabel;
  secondaryButton.className = `pill${secondaryClass ? ` ${secondaryClass}` : ''}${secondaryLabel ? '' : ' hidden'}`;
  confirmButton.textContent = confirmLabel;
  confirmButton.className = `pill${confirmClass ? ` ${confirmClass}` : ''}`;
  decisionFocusReturnTarget = trigger instanceof HTMLElement ? trigger : null;
  layer.classList.remove('hidden');
  dialog.setAttribute('aria-hidden', 'false');
  setTimeout(() => cancelButton.focus(), 0);
  return new Promise(resolve => {
    decisionResolver = resolve;
  });
}
function formatExportSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'unter 1 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
function boundedExportScale(output, scaleChoice) {
  const requestedScale = Number.parseFloat(String(scaleChoice).replace(',', '.'));
  const baseScale = Number.isFinite(requestedScale) && requestedScale > 0 ? requestedScale : 3;
  const maxEdgeScale = 8192 / Math.max(output.w, output.h);
  const maxPixelScale = Math.sqrt(36000000 / Math.max(1, output.w * output.h));
  return Math.max(0.5, Math.min(baseScale, maxEdgeScale, maxPixelScale));
}
function selectedExportKind() {
  return document.querySelector('input[name="exportKind"]:checked')?.value || 'json';
}
function selectedExportExtension() {
  if (selectedExportKind() === 'json') return 'json';
  return $('exportImageFormat').value === 'svg' ? 'svg' : 'png';
}
function normalizeExportFilename(value, extension) {
  const clean = String(value || '').trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-');
  const base = clean.replace(/\.(json|png|svg)$/i, '') || (extension === 'json' ? 'stammbaum' : 'stammbaum-ansicht');
  return `${base}.${extension}`;
}
function updateExportDialog() {
  const kind = selectedExportKind();
  const format = $('exportImageFormat').value;
  const includeImagesControl = kind === 'json' ? $('exportIncludeImages') : $('exportImageIncludeImages');
  const imageCount = data.people.filter(p => p.image).length;
  const noteCount = data.people.filter(p => String(p.note || '').trim()).length;
  const sourceCount = data.people.reduce((sum, p) => sum + cleanMentions(p.mentions).length, 0);
  const includeImages = imageCount > 0 && includeImagesControl.checked;
  $('exportIncludeImages').disabled = imageCount === 0;
  $('exportImageIncludeImages').disabled = imageCount === 0;
  $('exportJsonOptions').classList.toggle('hidden', kind !== 'json');
  $('exportImageOptions').classList.toggle('hidden', kind !== 'image');
  $('exportScaleField').classList.toggle('hidden', kind !== 'image' || format !== 'png');
  $('exportPersonCount').textContent = String(data.people.length);
  $('exportImageCount').textContent = imageCount ? `${imageCount}${includeImages ? ' enthalten' : ' ausgelassen'}` : 'keine';
  $('exportContentCount').textContent = `${noteCount} / ${sourceCount}`;
  const extension = selectedExportExtension();
  if (!exportFilenameTouched) {
    $('exportFilename').value = extension === 'json' ? 'stammbaum.json' : `stammbaum-ansicht.${extension}`;
  } else {
    $('exportFilename').value = normalizeExportFilename($('exportFilename').value, extension);
  }
  let estimatedBytes = 0;
  if (kind === 'json') {
    estimatedBytes = new Blob([JSON.stringify(exportData(includeImages), null, 2)]).size;
  } else {
    const output = buildExportSvg({ includeImages });
    if (format === 'svg') estimatedBytes = output ? new Blob([output.svg]).size : 0;
    else if (output) {
      const scale = boundedExportScale(output, $('exportImageScale').value);
      estimatedBytes = output.w * output.h * scale * scale * 0.45;
    }
  }
  $('exportEstimatedSize').textContent = formatExportSize(estimatedBytes);
}
function openExportDialog(kind = 'json', trigger = document.activeElement) {
  exportFocusReturnTarget = trigger instanceof HTMLElement ? trigger : null;
  exportFilenameTouched = false;
  const radio = document.querySelector(`input[name="exportKind"][value="${kind === 'image' ? 'image' : 'json'}"]`);
  if (radio) radio.checked = true;
  $('exportLayer').classList.remove('hidden');
  $('exportDialog').setAttribute('aria-hidden', 'false');
  updateExportDialog();
  setTimeout(() => $('exportTitle')?.focus(), 0);
}
function closeExportDialog({ returnFocus = true } = {}) {
  $('exportLayer').classList.add('hidden');
  $('exportDialog').setAttribute('aria-hidden', 'true');
  if (returnFocus) exportFocusReturnTarget?.focus({ preventScroll: true });
  exportFocusReturnTarget = null;
}
async function submitExportDialog() {
  const button = $('exportSubmit');
  const kind = selectedExportKind();
  const format = $('exportImageFormat').value;
  const extension = selectedExportExtension();
  const filename = normalizeExportFilename($('exportFilename').value, extension);
  const includeImages = kind === 'json'
    ? $('exportIncludeImages').checked && !$('exportIncludeImages').disabled
    : $('exportImageIncludeImages').checked && !$('exportImageIncludeImages').disabled;
  button.disabled = true;
  button.textContent = 'Export wird erstellt …';
  try {
    let saved = false;
    if (kind === 'json') {
      saved = await exportTreeJson({ includeImages, filename });
    } else if (format === 'svg') {
      saved = await exportSvgView({ includeImages, filename });
    } else {
      saved = await exportPngView($('exportImageScale').value, { includeImages, filename });
    }
    if (saved) closeExportDialog();
  } finally {
    button.disabled = false;
    button.textContent = 'Exportieren';
  }
}
function openOverview(trigger = overviewButton) {
  if (!overviewSheet || !overviewMap) return false;
  overviewFocusReturnTarget = trigger instanceof HTMLElement ? trigger : overviewButton;
  setDialogVisibility(overviewSheet, true);
  overviewButton?.setAttribute('aria-expanded', 'true');
  showBackdrop(true);
  setTimeout(() => {
    render();
    $('overviewCloseBtn')?.focus();
  }, 0);
  return true;
}
function closeOverview({ returnFocus = true } = {}) {
  if (!overviewSheet?.classList.contains('open')) return false;
  setDialogVisibility(overviewSheet, false);
  overviewButton?.setAttribute('aria-expanded', 'false');
  showBackdrop(false);
  if (returnFocus) overviewFocusReturnTarget?.focus({ preventScroll: true });
  overviewFocusReturnTarget = null;
  return true;
}
function panFromMinimapEvent(event, inner, state) {
  if (!inner || !state) return false;
  const rect = inner.getBoundingClientRect();
  const mapX = Math.max(0, Math.min(state.mapW, event.clientX - rect.left));
  const mapY = Math.max(0, Math.min(state.mapH, event.clientY - rect.top));
  const x = Math.max(0, Math.min(state.maxX, (mapX - state.offsetX) / state.scale));
  const y = Math.max(0, Math.min(state.maxY, (mapY - state.offsetY) / state.scale));
  view.x = -x * view.s;
  view.y = -y * view.s;
  applyView();
  return true;
}
function technicalRootCandidateId() {
  const activePeople = nonPoolPeople.filter(p => p && !p.pool);
  if (!activePeople.length) return '';
  const withChildren = activePeople.find(p => hasChildren(p.id));
  return (withChildren || activePeople[0]).id;
}
function welcomeSurfaceIsOpen() {
  const welcome = $('welcomeSurface');
  return !!welcome && !welcome.classList.contains('hidden') && welcome.getAttribute('aria-hidden') !== 'true';
}
function renderRootSelectionResults() {
  const rowsEl = $('rootSelectionRows');
  const searchEl = $('rootSelectionSearch');
  if (!rowsEl || !searchEl) return;
  const q = searchEl.value.trim().toLowerCase();
  const rows = [...nonPoolPeople]
    .filter(p => !q || personSearchText(p).includes(q))
    .sort((a, b) => fullName(a).localeCompare(fullName(b)))
    .slice(0, 80);

  if (!nonPoolPeople.length) {
    rowsEl.innerHTML = '<p class="small" role="status">Dieser Stammbaum enthält noch keine Person. Lege zuerst eine Person an.</p>';
    return;
  }
  if (!rows.length) {
    rowsEl.innerHTML = '<p class="small" role="status">Keine passende Person gefunden.</p>';
    return;
  }

  rowsEl.innerHTML = rows.map(p => {
    const dates = [p.born, p.died && '– ' + p.died].filter(Boolean).join(' ');
    const current = rootIds.includes(p.id);
    const extra = [dates, p.location, current && 'Aktueller Start'].filter(Boolean).join(' · ');
    return `
      <button type="button" class="searchRow" data-root-person-id="${esc(p.id)}"
        data-testid="root-selection-result-${esc(p.id)}" aria-pressed="${current ? 'true' : 'false'}">
        <span class="swatch" style="background:${esc(familyColor(familyKey(p)))}"></span>
        <span><strong>${esc(fullName(p) || p.name)}</strong><small>${esc(extra) || 'Lebensdaten offen'}</small></span>
      </button>
    `;
  }).join('');

  rowsEl.querySelectorAll('[data-root-person-id]').forEach(row => {
    row.addEventListener('click', () => chooseStartRoot(row.dataset.rootPersonId));
  });
}
function openRootSelection({ trigger = null, required = false } = {}) {
  const sheet = $('rootSelectionSheet');
  if (!sheet) return false;
  rootSelectionRequired = required;
  rootSelectionFocusReturnTarget = trigger instanceof HTMLElement
    ? trigger
    : (document.activeElement instanceof HTMLElement ? document.activeElement : $('startNavBtn'));
  const laterButton = $('rootSelectionLaterBtn');
  if (laterButton) laterButton.textContent = required ? 'Später' : 'Schließen';
  if ($('rootSelectionSearch')) {
    $('rootSelectionSearch').value = '';
    $('rootSelectionSearch').disabled = !nonPoolPeople.length;
  }
  setDialogVisibility(sheet, true);
  showBackdrop(true);
  renderRootSelectionResults();
  setTimeout(() => {
    const initialFocus = nonPoolPeople.length ? $('rootSelectionSearch') : laterButton;
    initialFocus?.focus();
  }, 40);
  return true;
}
function closeRootSelection({ returnFocus = true } = {}) {
  const sheet = $('rootSelectionSheet');
  if (!sheet?.classList.contains('open')) return;
  setDialogVisibility(sheet, false);
  showBackdrop(false);
  rootSelectionRequired = false;
  if (returnFocus) rootSelectionFocusReturnTarget?.focus({ preventScroll: true });
  rootSelectionFocusReturnTarget = null;
}
function deferRootSelection() {
  if (!rootIds.length) {
    rootSelectionDeferredForDataset = true;
    temporaryRootId = technicalRootCandidateId();
  }
  closeRootSelection();
  if (!temporaryRootId) return;
  selected = temporaryRootId;
  render();
  jumpToPerson(temporaryRootId);
}
function dismissRootSelection() {
  if (rootSelectionRequired) deferRootSelection();
  else closeRootSelection();
}
function chooseStartRoot(id) {
  const chosen = person(id);
  if (!chosen || chosen.pool) return false;
  const commandBefore = captureCommandState();
  const retainedRoots = rootIds
    .filter(existingId => existingId !== chosen.id && person(existingId) && !person(existingId).pool);
  rootIds = [chosen.id, ...retainedRoots].slice(0, 2);
  temporaryRootId = '';
  rootSelectionDeferredForDataset = false;
  commitDataCommand('Startperson festlegen', commandBefore);
  closeRootSelection();
  selected = chosen.id;
  render();
  jumpToPerson(chosen.id);
  updateRootButton();
  return true;
}
function maybeOpenRequiredRootSelection() {
  if (rootIds.length || !nonPoolPeople.length || rootSelectionDeferredForDataset) return false;
  if (welcomeSurfaceIsOpen() || isUiSurfaceOpen('rootSelectionSheet')) return false;
  const anotherSurfaceOpen = surfaceStateKeys
    .filter(id => id !== 'rootSelectionSheet')
    .some(id => isUiSurfaceOpen(id));
  if (anotherSurfaceOpen) return false;
  return openRootSelection({ trigger: $('startNavBtn'), required: true });
}
function openStartFromNavigation() {
  closeSecondaryPanelsForNavigation();
  updateMainNavCurrent('startNavBtn');
  const id = preferredLandingPersonId();
  if (!id) {
    fit();
    return;
  }
  if (focusMode && focusId && person(focusId)) {
    setFocusMode(true, focusId);
    return;
  }
  selected = id;
  render();
  jumpToPerson(id);
  fit();
}
function openSearchFromNavigation(button) {
  markMainNavTarget(button);
  updateMainNavCurrent(button.id);
  closeSecondaryPanelsForNavigation();
  openSearch();
  setTimeout(() => $('personSearch')?.focus(), 80);
}
function openPeopleFromNavigation(button) {
  markMainNavTarget(button);
  updateMainNavCurrent(button.id);
  closeSecondaryPanelsForNavigation();
  openListEditor('tree');
}
function openMoreFromNavigation(button) {
  markMainNavTarget(button);
  updateMainNavCurrent(button.id);
  closeSecondaryPanelsForNavigation();
  if (!$('settingsMenu')?.classList.contains('open')) {
    toggleSettingsMenu();
  }
}
function openListEditor(mode = 'tree'){
  listViewMode = mode;
  $('listTitle').textContent = 'Personenverzeichnis';
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
  if (!suspend) returnFocusToMainNavTarget();
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
  returnFocusToMainNavTarget();
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
  returnFocusToMainNavTarget();
}
function openSearchResultList() {
  closeSearch();
  openListEditor('tree');
}
function openBirthdays(){
  setDialogVisibility($('birthdaySheet'), true);
  showBackdrop(true);
  renderBirthdays();
}
function closeBirthdays(){
  setDialogVisibility($('birthdaySheet'), false);
  showBackdrop(false);
  returnFocusToMainNavTarget();
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
  returnFocusToMainNavTarget();
}
function renderScrollView(){
  const ids = visibleIds();
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
      .flatMap(id => childrenOfPerson(id))
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
  return nonPoolPeople
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
  if (focusMode && focusId !== id) {
    focusId = id;
    applyFocusLayout(id);
    render();
    fitFocusNeighborhood(id);
    showSpotlight(id);
    return;
  }
  view.s = Math.max(view.s, 0.72);
  view.x = -p.x * view.s;
  view.y = -p.y * view.s;
  applyView();
  showSpotlight(id);
}
function escapeSearchText(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function highlightSearchMatch(value, query) {
  const text = String(value || '');
  const normalized = String(query || '').trim();
  if (!normalized) return esc(text);
  return esc(text).replace(
    new RegExp(escapeSearchText(normalized), 'gi'),
    match => `<mark class="searchMatch">${match}</mark>`
  );
}
function renderSearchResults(){
  const query = ($('personSearch')?.value || '').trim();
  const q = query.toLowerCase();
  const rows = [...nonPoolPeople]
    .filter(p => !q || personSearchText(p).includes(q))
    .sort((a,b) => fullName(a).localeCompare(fullName(b)))
    .slice(0, 80);

  const hasQuery = !!q;
  const emptyState = hasQuery && rows.length === 0;
  if ($('searchSummary')) {
    $('searchSummary').textContent = hasQuery
      ? (rows.length ? `${rows.length} Treffer für „${query}“` : `Keine Treffer für „${query}“`)
      : '';
  }
  $('searchEmptyState')?.classList.toggle('hidden', !emptyState);
  const searchRows = $('searchRows');
  if (!searchRows) return;
  searchRows.innerHTML = rows.map(p => {
    const dates = [p.born, p.died && '- '+p.died].filter(Boolean).join(' ');
    const extra = [birthNameDiffers(p) && 'geb. '+p.birthName, p.occupation, p.religion, p.location].filter(Boolean).join(' · ');
    return `
      <button type="button" class="searchRow" data-id="${esc(p.id)}" data-testid="person-search-result-${esc(p.id)}">
        <span class="swatch" style="background:${esc(familyColor(familyKey(p)))}"></span>
        <span><strong>${highlightSearchMatch(fullName(p) || p.name, query)}</strong><small>${highlightSearchMatch([dates, extra].filter(Boolean).join(' · ') || 'Lebensdaten offen', query)}</small></span>
      </button>
    `;
  }).join('');
  searchRows.querySelectorAll('.searchRow').forEach(row => {
    row.addEventListener('click', () => {
      searchReturnMode = true;
      searchReturnQuery = query;
      searchReturnScrollTop = searchRows.scrollTop;
      closeSearch();
      jumpToPerson(row.dataset.id);
      openSheet(row.dataset.id);
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
  returnFocusToMainNavTarget();
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
  const treePeople = data.people.filter(p => !p.pool);
  const poolPeople = data.people.filter(p => p.pool);
  const scopedPeople = listViewMode === 'pool' ? poolPeople : treePeople;
  const rows = [...scopedPeople]
    .filter(p => !q || personSearchText(p).includes(q))
    .sort(comparePeopleForList);

  $('listAddBtn').textContent = listViewMode === 'pool' ? '+ Vorratsperson' : '+ Person';
  $('listTreeCount').textContent = `(${treePeople.length})`;
  $('listPoolCount').textContent = `(${poolPeople.length})`;
  document.querySelectorAll('[data-list-view]').forEach(tab => {
    const active = tab.dataset.listView === listViewMode;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('[data-sort]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.sort === listSortMode));
  });
  $('listSummary').textContent = q
    ? `${rows.length} Treffer von ${scopedPeople.length} · ${data.people.length} gesamt`
    : `${scopedPeople.length} ${scopedPeople.length === 1 ? 'Person' : 'Personen'} · ${data.people.length} gesamt`;

  $('listRows').innerHTML = rows.map(p => {
    const parents = (p.parents||[]).map(id=>person(id)?.name||id).filter(Boolean).join(' + ');
    const partner = partnerIds(p).map(id => person(id)?.name || id).join(', ');
    const birth = birthNameDiffers(p) ? ` · geb. ${esc(p.birthName)}` : '';
    const dates = [p.born, p.died && '– '+p.died].filter(Boolean).join(' ');
    const confidence = confidenceText(p);
    const extra = [p.occupation, p.religion, p.location].filter(Boolean).join(' · ');
    return `
      <div class="listRow${p.pool ? ' poolRow' : ''}" data-id="${esc(p.id)}" data-testid="directory-row-${esc(p.id)}">
        <div class="listIdentity">
          <div class="listName">${esc(p.name)}${p.pool ? '<span class="listPoolBadge">Vorrat</span>' : ''}</div>
          <div class="listMeta">${esc([dates, birth.trim(), confidence].filter(Boolean).join(' · ')) || 'Lebensdaten offen'}</div>
          ${extra ? `<div class="listMeta">${esc(extra)}</div>` : ''}
          <div class="listMeta">${partner ? 'Partner/in: '+esc(partner) : ''}${parents ? (partner ? ' · ' : '') + 'Eltern: '+esc(parents) : ''}</div>
        </div>
        <div class="listActions">
          <button type="button" class="pill primary listOpenBtn" data-act="open" data-id="${esc(p.id)}"
            data-testid="directory-open-${esc(p.id)}">Öffnen</button>
          <details class="listRowMenu">
            <summary aria-label="Weitere Aktionen für ${esc(p.name)}">Weitere</summary>
            <div class="listRowMenuItems">
              ${p.pool ? `<button type="button" data-act="activate" data-id="${esc(p.id)}">In den Stammbaum eingliedern</button>` : ''}
              <button type="button" data-act="child" data-id="${esc(p.id)}">Kind hinzufügen</button>
              <button type="button" data-act="partner" data-id="${esc(p.id)}">Partner hinzufügen</button>
            </div>
          </details>
        </div>
      </div>
    `;
  }).join('');

  $('listRows').querySelectorAll('button[data-act]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if(act === 'open') {
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
        if (p) {
          const commandBefore = captureCommandState();
          setPoolBranch(p.id, false);
          commitDataCommand('Aus Vorrat eingliedern', commandBefore);
          updatePoolButton();
          render();
        }
      }
    });
  });
}
// -- UI event wiring ----------------------------------------------------
$('decisionCancel')?.addEventListener('click', () => settleDecisionDialog('cancel'));
$('decisionSecondary')?.addEventListener('click', () => settleDecisionDialog('secondary'));
$('decisionConfirm')?.addEventListener('click', () => settleDecisionDialog('confirm'));
$('decisionLayer')?.addEventListener('click', event => {
  event.stopPropagation();
  if (event.target === $('decisionLayer')) settleDecisionDialog('cancel');
});
$('decisionLayer')?.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  settleDecisionDialog('cancel');
});
$('exportDialogClose')?.addEventListener('click', () => closeExportDialog());
$('exportSubmit')?.addEventListener('click', () => { submitExportDialog(); });
$('exportLayer')?.addEventListener('click', event => {
  event.stopPropagation();
  if (event.target === $('exportLayer')) closeExportDialog();
});
$('exportLayer')?.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  closeExportDialog();
});
$('exportDialog')?.addEventListener('change', updateExportDialog);
$('exportFilename')?.addEventListener('input', () => {
  exportFilenameTouched = true;
});
document.querySelectorAll('.formSectionToggle').forEach(button => {
  const body = $(button.getAttribute('aria-controls'));
  if (!body) return;
  body.hidden = button.getAttribute('aria-expanded') !== 'true';
  button.addEventListener('click', () => {
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    body.hidden = expanded;
  });
});
$('parent1').addEventListener('change', () => {
  const old = $('parent2').value;
  const arr = suggestParentOrder(selected, $('parent1').value);
  $('parent2').innerHTML = '<option value="">—</option>' + arr.map(p => `<option value="${esc(p.id)}">${esc(selectPersonLabel(p))}</option>`).join('');
  $('parent2').value = old;
});

$('saveBtn').addEventListener('click', () => { saveSheet(); });
$('personEditView')?.addEventListener('submit', e => {
  e.preventDefault();
  saveSheet();
});
$('closeBtn').addEventListener('click', event => { closeSheet(false, event.currentTarget); });
$('personEditBtn')?.addEventListener('click', () => selected && openPersonEdit(selected));
$('personEditBack')?.addEventListener('click', event => { returnToPersonDetail(false, event.currentTarget); });
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
overviewButton?.addEventListener('click', () => openOverview(overviewButton));
$('overviewCloseBtn')?.addEventListener('click', () => closeOverview());
overviewSheet?.addEventListener('pointerdown', event => event.stopPropagation());
overviewMap?.addEventListener('click', event => {
  panFromMinimapEvent(event, overviewMap, overviewState);
});
offscreenIndicators?.addEventListener('pointerdown', event => event.stopPropagation());
offscreenIndicators?.addEventListener('click', event => {
  const button = event.target.closest('[data-target-id]');
  if (!button) return;
  event.stopPropagation();
  jumpToPerson(button.dataset.targetId);
});
$('backdrop').addEventListener('click', () => {
  if($('overviewSheet')?.classList.contains('open')) closeOverview();
  else if($('rootSelectionSheet')?.classList.contains('open')) dismissRootSelection();
  else if($('sideNav').classList.contains('open')) closeNavigator();
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
  const dialogOpen = ['fileMenu','settingsMenu','sheet','sideNav','searchSheet','rootSelectionSheet','overviewSheet','birthdaySheet','scrollSheet','checkSheet','listSheet']
    .some(id => $(id)?.classList.contains('open'));
  if (e.key === 'Escape') {
    if ($('fileMenu')?.classList.contains('open')) { closeFileMenu(); e.preventDefault(); }
    else if ($('settingsMenu')?.classList.contains('open')) { closeSettingsMenu(); e.preventDefault(); }
    else if ($('overviewSheet')?.classList.contains('open')) { closeOverview(); e.preventDefault(); }
    else if ($('rootSelectionSheet')?.classList.contains('open')) { dismissRootSelection(); e.preventDefault(); }
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
  if (e.key === '0' || e.key === 'Home') { fitAll(); e.preventDefault(); }
  if (editMode && e.key === 'Delete' && $('sheet').classList.contains('open') && selected) { $('deleteBtn').click(); e.preventDefault(); }
});
$('modeBtn').addEventListener('click', async event => {
  if (hasUnsavedSheetChanges() && !(await confirmDiscardSheetChanges(event.currentTarget))) return;
  editMode = !editMode;
  updateModeUI();
  render();
  if ($('sheet').classList.contains('open')) {
    if (selected && person(selected)) {
      openSheet(selected, { mode: editMode ? 'edit' : 'detail' });
    } else if (personSheetMode !== 'create') {
      closeSheet(true);
    }
  }
});
$('addBtn').addEventListener('click', () => { selected = null; pendingNewPos = null; openSheet(null); });
$('focusBtn')?.addEventListener('click', () => {
  closeSettingsMenu();
  if (focusMode) {
    setFocusMode(false);
    return;
  }
  const id = selected || preferredLandingPersonId();
  if (id) setFocusMode(true, id);
});
$('quickFocus').addEventListener('click', () => {
  if (focusMode) setFocusMode(false);
  else if (selected) setFocusMode(true, selected);
});
$('quickChild').addEventListener('click', () => selected && addChildFor(selected));
$('quickPartner').addEventListener('click', () => selected && addPartnerFor(selected));
$('quickParents').addEventListener('click', () => selected && addParentsFor(selected));

$('deleteBtn').addEventListener('click', () => {
  if (!editMode) return;
  if (!selected) return;
  deletePersonWithCommand(selected);
  if($('sideNav')?.classList.contains('open')) renderNavigator();
  closeSheet(true);
});

$('zin').addEventListener('click', () => zoomTo(view.s * 1.18));
$('zout').addEventListener('click', () => zoomTo(view.s / 1.18));
$('home').addEventListener('click', fitReadablePerson);
$('fileBtn')?.addEventListener('click', e => {
  e.stopPropagation();
  toggleFileMenu();
});
$('fileMenu')?.addEventListener('click', e => e.stopPropagation());
// Hauptnavigation (Desktop/Mobil): konsistente Steuerung über neue Hauptbuttons
$('startNavBtn').addEventListener('click', () => {
  openStartFromNavigation();
});
$('searchBtn').addEventListener('click', e => {
  openSearchFromNavigation(e.currentTarget);
});
$('listBtn').addEventListener('click', e => {
  openPeopleFromNavigation(e.currentTarget);
});
$('settingsBtn').addEventListener('click', e => {
  e.stopPropagation();
  openMoreFromNavigation(e.currentTarget);
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
  fitAll();
  closeSettingsMenu();
});
$('rootSelectionBtn')?.addEventListener('click', () => {
  closeSettingsMenu();
  openRootSelection({ trigger: $('settingsBtn'), required: false });
});
$('autoBtn').addEventListener('click', async event => {
  const decision = await openDecisionDialog({
    title: 'Stammbaum automatisch neu anordnen?',
    message: 'Die aktuellen Kartenpositionen werden durch eine kompakte automatische Anordnung ersetzt. Personendaten und Beziehungen bleiben unverändert.',
    confirmLabel: 'Neu anordnen',
    cancelLabel: 'Positionen behalten',
    trigger: event.currentTarget
  });
  if (decision !== 'confirm') return;
  closeSettingsMenu();
  await runBusy('Auto-Anordnung läuft …', async () => { autoLayout(); });
});
$('collapseAllBtn').addEventListener('click', () => {
  const anyOpen = data.people.some(p=>hasChildren(p.id) && !collapsed.has(p.id));
  if(anyOpen){ data.people.forEach(p=>{ if(hasChildren(p.id)) collapsed.add(p.id); });
    const title = $('collapseAllBtn')?.querySelector('.settingsItemTitle');
    if (title) title.textContent='Alle ausklappen';
  }
  else {
    collapsed.clear();
    const title = $('collapseAllBtn')?.querySelector('.settingsItemTitle');
    if (title) title.textContent='Alle einklappen';
  }
  saveCollapsed(); autoLayout();
  closeSettingsMenu();
});
$('poolBtn')?.addEventListener('click', () => {
  closeSettingsMenu();
  openListEditor('pool');
});
$('helpBtn')?.addEventListener('click', event => {
  closeSettingsMenu();
  showHelpHints({ force: true, trigger: $('settingsBtn') || event.currentTarget });
});
$('helpHintClose')?.addEventListener('click', dismissCurrentHelpHint);

$('resetBtn').addEventListener('click', async event => {
  const decision = await openDecisionDialog({
    title: 'Beispieldaten zurücksetzen?',
    message: 'Der aktuelle lokale Datenstand wird durch die ursprünglichen Beispieldaten ersetzt. Nicht exportierte Änderungen gehen verloren.',
    confirmLabel: 'Beispiel zurücksetzen',
    cancelLabel: 'Aktuelle Daten behalten',
    confirmClass: 'danger',
    trigger: event.currentTarget
  });
  if (decision !== 'confirm') return;
  closeSettingsMenu();
  await runBusy('Beispiel wird zurückgesetzt …', async () => {
      localStorage.removeItem(storeKey);
      localStorage.removeItem(storeKey + '-collapsed');
      await clearPersistedJson();
      hasPersistedTreeData = false;
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
  });
});

function exportData(includeImages = true) {
  if (includeImages) return data;
  return {
    ...data,
    people: data.people.map(p => ({ ...p, image: '' }))
  };
}
async function exportTreeJson({ includeImages = false, filename = 'stammbaum.json' } = {}) {
  const blob = new Blob([JSON.stringify(exportData(includeImages), null, 2)], { type: 'application/json' });
  return saveBlobAs(blob, filename, [{
    description: 'Stammbaum JSON',
    accept: { 'application/json': ['.json'] }
  }]);
}

$('exportBtn').addEventListener('click', () => {
  closeFileMenu();
  openExportDialog('json', $('fileBtn'));
});
$('workingFileBtn')?.addEventListener('click', async () => {
  closeFileMenu();
  await openWorkingFile();
});
$('copyJsonBtn')?.addEventListener('click', async () => {
  closeFileMenu();
  await copyTreeJson();
});

$('listCloseBtn').addEventListener('click', () => closeListEditor());
$('searchCloseBtn').addEventListener('click', closeSearch);
$('searchOpenListBtn')?.addEventListener('click', openSearchResultList);
$('personSearch').addEventListener('input', renderSearchResults);
$('rootSelectionLaterBtn')?.addEventListener('click', dismissRootSelection);
$('rootSelectionSearch')?.addEventListener('input', renderRootSelectionResults);
$('scrollBtn').addEventListener('click', () => { closeSettingsMenu(); openScrollView(); });
$('scrollCloseBtn').addEventListener('click', closeScrollView);
$('birthdayBtn').addEventListener('click', () => { closeSettingsMenu(); openBirthdays(); });
$('birthdayCloseBtn').addEventListener('click', closeBirthdays);
$('navBtn').addEventListener('click', () => { closeSettingsMenu(); openNavigator(); });
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
$('checkBtn').addEventListener('click', () => { closeSettingsMenu(); openCheck(); });
$('checkCloseBtn').addEventListener('click', closeCheck);
$('imageBtn').addEventListener('click', () => { closeSettingsMenu(); exportImageView(); });
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
document.querySelectorAll('[data-list-view]').forEach(tab => {
  tab.addEventListener('click', () => {
    listViewMode = tab.dataset.listView;
    renderListEditor();
    tab.focus();
  });
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const nextMode = listViewMode === 'tree' ? 'pool' : 'tree';
    const nextTab = document.querySelector(`[data-list-view="${nextMode}"]`);
    listViewMode = nextMode;
    renderListEditor();
    nextTab?.focus();
  });
});
document.querySelectorAll('[data-sort]').forEach(button => {
  button.addEventListener('click', () => {
    listSortMode = button.dataset.sort;
    renderListEditor();
  });
});
$('listRows').addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const menu = event.target.closest('details[open]');
  if (!menu) return;
  event.preventDefault();
  event.stopPropagation();
  menu.open = false;
  menu.querySelector('summary')?.focus();
});
$('importBtn').addEventListener('click', () => {
  closeFileMenu();
  $('fileInput').click();
});
function openWelcomeImport() {
  $('fileInput').value = '';
  $('fileInput').click();
}
document.getElementById('welcomeOpenExistingFirstVisit')?.addEventListener('click', openWelcomeImport);
document.getElementById('welcomeOpenExistingReturning')?.addEventListener('click', openWelcomeImport);
document.querySelector('[data-testid=\"welcome-new-tree\"]')?.addEventListener('click', () => {
  if (startupState !== 'first-visit') return;
  hideWelcomeSurface();
  initializeEmptyTreeModel();
  openSheet(null);
});
document.querySelector('[data-testid=\"welcome-demo\"]')?.addEventListener('click', async () => {
  if (startupState !== 'first-visit') return;
  await openWelcomeDemoData();
  hideWelcomeSurface();
});
document.querySelector('[data-testid=\"welcome-continue\"]')?.addEventListener('click', () => {
  hideWelcomeSurface();
});
if (minimap) {
  minimap.addEventListener('click', e => {
    panFromMinimapEvent(e, minimapInner, minimapState);
  });
}
$('fileInput').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = async () => {
    try {
      const imported = await runBusy('JSON wird importiert …', async () => normalize(JSON.parse(r.result)));
      workingFileHandle = null;
      applyLoadedData(imported, { fitResult: false });
      updateWorkingFileButton();
      save();
      hideWelcomeSurface();
      refreshWelcomeMeta();
      focusPreferredPerson({ preferFocus: focusMode || nonPoolPeople.length > 1200 });
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
if (window.location?.search?.includes('ux-debug=1')) {
  window.__uxStartupDebug = {
    computeStartupStateFromSignals,
    getStartupState,
    getStartupSignals,
    computeStartupStateNow,
    getUiState: () => ({
      data: uiState.data,
      viewport: uiState.viewport,
      mode: uiState.mode,
      selection: uiState.selection,
      surfaces: uiState.surfaces,
      persistence: uiState.persistence
    }),
    getUiInvariants: uiInvariants
  };
  window.__uxDebug = {
    getView: () => ({ ...view }),
    getPerson: id => {
      const target = person(id);
      if (!target) return null;
      return {
        id: target.id,
        name: target.name,
        x: target.x,
        y: target.y,
        selected: target.id === selected
      };
    },
    getSelectedPersonId: () => selected,
    getPersistenceState: () => ({
      ...uiState.persistence,
      statusLabel: getPersistenceStatusLabel()
    }),
    waitForPersistence: () => persistenceSaveChain,
    savePersonNoteForTest: (id, note) => {
      const target = person(id);
      if (!target) return null;
      target.note = String(note);
      save();
      return persistenceRevision;
    },
    setWorkingFileHandleForTest: handle => {
      workingFileHandle = handle || null;
      updateWorkingFileButton();
    },
    getCommandHistoryState,
    undoCommand,
    redoCommand,
    clearCommandHistory,
    getDataSnapshot: () => cloneCommandValue({
      people: data.people,
      rootIds,
      layoutMode
    }),
    updatePersonForTest: (id, patch, label = 'Person testen') => {
      const target = person(id);
      if (!target || !patch || typeof patch !== 'object') return false;
      const commandBefore = captureCommandState();
      Object.assign(target, cloneCommandValue(patch));
      commitDataCommand(label, commandBefore);
      render();
      return true;
    },
    addChildForTest: id => addChildFor(id),
    addPartnerForTest: id => addPartnerFor(id),
    addParentsForTest: id => addParentsFor(id),
    setPoolForTest: (id, pooled) => {
      if (!person(id)) return false;
      const commandBefore = captureCommandState();
      setPoolBranch(id, !!pooled);
      commitDataCommand(pooled ? 'In Vorrat verschieben' : 'Aus Vorrat eingliedern', commandBefore);
      render();
      return true;
    },
    deletePersonForTest: id => {
      const deleted = deletePersonWithCommand(id);
      if (deleted) render();
      return deleted;
    },
    setLayoutModeForTest: mode => setLayoutMode(mode)
  };
}
computeStartupStateNow();
updateHeaderMeta();
if (startupState === 'first-visit') {
  showWelcomeSurface();
} else {
  Promise.resolve(loadDefaultDataIfAvailable())
    .then(() => {
      setTimeout(fit, 50);
    })
    .catch(() => {})
    .finally(() => {
      showWelcomeSurface();
    });
}
})();
