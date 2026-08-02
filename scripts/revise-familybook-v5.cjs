const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INPUT = path.join(ROOT, 'stammbaum_mit_familienbuch_full_v4.json');
const OUTPUT = path.join(ROOT, 'stammbaum_mit_familienbuch_full_v5_bereinigt.json');
const REPORT = path.join(ROOT, 'docs', 'familienbuch-v5-bereinigung.md');
const SOURCE_URL = 'https://www.yumpu.com/en/document/view/18057625/joseph-bodensteiner-kuennen-hollerbach-family-history';
const SOURCE_TITLE = 'Joseph Bodensteiner - Kuennen - Hollerbach Family History';

const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const originalCount = data.people.length;
const changes = {
  splits: [],
  merges: [],
  removedParentRefs: [],
  removedPartnerPairs: [],
  completedParentRefs: [],
  headerCleanups: 0,
  activated: [],
};

const unique = values => [...new Set((values || []).filter(Boolean))];
const year = value => {
  const match = String(value || '').match(/(?:15|16|17|18|19|20)\d{2}/);
  return match ? Number(match[0]) : null;
};
const normalizedName = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/Descendants of\s*:\s*Page\s*\d+\s*of\s*\d+\s*Joseph Bodensteiner/gi, ' ')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const cleanHeader = value => String(value || '')
  .replace(/Descendants of\s*:\s*Page\s*\d+\s*of\s*\d+\s*Joseph Bodensteiner/gi, ' ')
  .replace(/\s{2,}/g, ' ')
  .replace(/\s+([,.;:])/g, '$1')
  .trim();
const byId = () => new Map(data.people.map(person => [person.id, person]));
const person = id => byId().get(id);
const appendNote = (target, note) => {
  if (!note || String(target.note || '').includes(note)) return;
  target.note = [target.note, note].filter(Boolean).join(' | ');
};
const sourceMention = extra => ({ source: SOURCE_TITLE, url: SOURCE_URL, ...extra });

function personTemplate(id, name, fields = {}) {
  const parts = name.trim().split(/\s+/);
  return {
    id,
    name,
    firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : name,
    lastName: parts.length > 1 ? parts.at(-1) : '',
    nickname: '', born: '', died: '', birthName: '', occupation: '', religion: '',
    location: '', link: SOURCE_URL, image: '', mentions: [sourceMention({ correction: 'v5' })],
    pool: true, note: '', confidence: 'medium', x: 50000, y: 1000,
    parents: [], partner: '', partners: [], partnerDetails: {},
    ...fields,
  };
}

function addSplit(id, name, fields, reason) {
  if (person(id)) throw new Error(`Neue ID ist bereits vergeben: ${id}`);
  const created = personTemplate(id, name, fields);
  appendNote(created, `V5-Aufspaltung: ${reason}`);
  data.people.push(created);
  changes.splits.push({ id, name, reason });
  return created;
}

function setIdentity(target, fields) {
  Object.assign(target, fields);
  if (fields.name) {
    const parts = fields.name.trim().split(/\s+/);
    target.firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : fields.name;
    target.lastName = parts.length > 1 ? parts.at(-1) : '';
  }
}

function setPartners(id, partnerIds, details = {}) {
  const target = person(id);
  target.partners = unique(partnerIds);
  target.partner = target.partners[0] || '';
  target.partnerDetails = Object.fromEntries(
    Object.entries(details).filter(([partnerId]) => target.partners.includes(partnerId))
  );
}

// --- Belegte Kollisionsaufspaltungen aus dem Familienbuch ------------------

const barbara1955 = addSplit('fbxv50001', 'Barbara Bodensteiner', {
  born: 'November 12, 1955',
  location: 'New Hampton, Chickasaw County, Iowa',
  parents: ['fb0266', 'fbx9402'],
  note: 'Unnummeriertes Kind von Kilian Peter Bodensteiner und Elaine Mary Pechota',
}, 'war in Familienbuch-Person Nr. 14 (Barbara, 1881) hineingemischt');

setIdentity(person('fb0014'), {
  name: 'Barbara Bodensteiner', born: 'September 1, 1881', died: '1971',
  location: 'Oberlind, Bavaria, Germany', parents: ['fb0005', 'fbx9015'],
});
const augustGapp = addSplit('fbxv50002', 'August Gapp', {
  born: 'About 1879', died: 'Between 1917 and 1979',
  partners: ['fb0014'], partner: 'fb0014',
  partnerDetails: { fb0014: {} },
  note: 'Ehepartner von Barbara Bodensteiner, Familienbuch-Person Nr. 14',
}, 'fehlender Ehepartner der wiederhergestellten Familienbuch-Person Nr. 14');
setPartners('fb0014', [augustGapp.id], { [augustGapp.id]: {} });

addSplit('fbxv50003', 'Theresia Bodensteiner', {
  born: 'July 25, 1861', died: 'August 30, 1862',
  location: 'St. Lucas, Fayette County, Iowa', parents: ['fb0006', 'fbx9018'],
  note: 'Unnummeriertes, früh verstorbenes Kind von Johann Karl Bodensteiner und Margarethe Balk',
}, 'war mit Familienbuch-Person Nr. 16 (Theresia, 1862–1927) vermischt');
setIdentity(person('fb0016'), {
  name: 'Theresia Bodensteiner', born: 'December 4, 1862', died: 'December 8, 1927',
  location: 'St. Lucas, Fayette County, Iowa', parents: ['fb0006', 'fbx9018'],
});
setPartners('fb0016', ['fbx9034'], {
  fbx9034: { married: 'January 30, 1882', marriedLocation: 'St. Lucas, Fayette County, Iowa' },
});

addSplit('fbxv50004', 'Christopher Bodensteiner', {
  born: 'February 20, 1969', location: 'Des Moines, Polk County, Iowa',
  parents: ['fb0292', 'fbx9442'],
  note: 'Unnummeriertes Kind von James Richard Bodensteiner und Jacqulyn Howard',
}, 'war mit Familienbuch-Person Nr. 172 (Christopher, 1915) vermischt');
setIdentity(person('fb0172'), {
  name: 'Christopher Bodensteiner', born: 'May 7, 1915', died: '',
  location: 'Ossian, Winneshiek County, Iowa', parents: ['fb0033', 'fbx9066'],
});
setPartners('fb0172', ['fbx9252'], { fbx9252: { married: 'September 1941' } });

addSplit('fbxv50005', 'Henry Bernard Bodensteiner II', {
  born: 'September 29, 1988', location: 'Harris County, Texas',
  parents: ['fb0268', 'fbx9405'],
  note: 'Unnummeriertes Kind von Henry Bernard Bodensteiner und Janet Leigh Williams-McKenzie',
}, 'war mit Familienbuch-Person Nr. 268 (Henry Bernard, 1938) vermischt');
setIdentity(person('fb0268'), {
  name: 'Henry Bernard Bodensteiner', born: 'April 21, 1938', died: '',
  location: 'St. Lucas, Fayette County, Iowa', parents: ['fb0070', 'fbx9107'],
});
setIdentity(person('fbx9404'), { born: '1940' });
setIdentity(person('fbx9405'), { born: 'September 19, 1948' });
setPartners('fb0268', ['fbx9404', 'fbx9405'], {
  fbx9404: { married: 'August 11, 1958', divorced: 'March 4, 1984' },
  fbx9405: { married: 'October 6, 1985', marriedLocation: 'Stateline, Douglas County, Nevada' },
});

const johnBaumler = addSplit('fbxv50006', 'John Baumler', {
  partners: ['fbx9040'], partner: 'fbx9040',
  note: 'Vater von Martin Baumler (geb. 1856)', confidence: 'low',
}, 'gleichnamiger Sohn John Baumler (geb. 1896) war fälschlich als Vater verwendet');
addSplit('fbxv50007', 'Martin Baumler', {
  born: 'August 22, 1886', died: 'Before 1892', parents: ['fb0018', 'fbx9039'],
  note: 'Unnummeriertes Kind von Barbara Bodensteiner und Martin Baumler',
}, 'war mit seinem gleichnamigen Vater Martin Baumler (geb. 1856) vermischt');
setIdentity(person('fbx9039'), {
  name: 'Martin Baumler', born: 'August 22, 1856', died: 'August 24, 1919',
  location: 'Trauschendorf, Bavaria, Germany', parents: [johnBaumler.id, 'fbx9040'],
});
setPartners('fbx9039', ['fb0018'], {
  fb0018: { married: 'April 7, 1885', marriedLocation: 'St. Lucas, Fayette County, Iowa' },
});
setPartners('fbx9040', [johnBaumler.id]);

// Ein vom Parser aus "26. Theresia" erzeugter Scheindatensatz.
const forcedAliases = new Map([['fb2007', 'fb0026']]);
setPartners('fb0026', ['fbx10620'], {
  fbx10620: { married: '1893', marriedLocation: 'Bavaria, Germany' },
});
setPartners('fbx10620', ['fb0026'], {
  fb0026: { married: '1893', marriedLocation: 'Bavaria, Germany' },
});

// --- Kernlinie 1–35: Eltern aus den Children-of-Blöcken -------------------

const setParents = (ids, parents) => ids.forEach(id => { if (person(id)) person(id).parents = [...parents]; });
setParents(['fb0002'], ['fb0001', 'fbx9001']);
setParents(['fb0003', 'fb0004'], ['fb0002', 'fbx9004']);
setParents(['fb0005'], ['fb0003', 'fbx9007']);
setParents(['fb0006', 'fb0007', 'fb0008', 'fb0009'], ['fb0004', 'fbx9008']);
setParents(['fb0010', 'fb0011', 'fb0012', 'fb0013', 'fb0014', 'fb0015'], ['fb0005', 'fbx9015']);
setParents(Array.from({ length: 9 }, (_, i) => `fb${String(i + 16).padStart(4, '0')}`), ['fb0006', 'fbx9018']);
setParents(['fb0025', 'fb0026'], ['fb0007', 'fbx9023']);
setParents(Array.from({ length: 9 }, (_, i) => `fb${String(i + 27).padStart(4, '0')}`), ['fb0008', 'fbx9024']);
setParents(['fb0053', 'fb0054', 'fb0055'], ['fb0013', 'fbx9032']);

for (const id of Array.from({ length: 9 }, (_, i) => `fb${String(i + 16).padStart(4, '0')}`)) {
  if (person(id)?.location === 'St') person(id).location = 'St. Lucas, Fayette County, Iowa';
}
for (const id of Array.from({ length: 9 }, (_, i) => `fb${String(i + 27).padStart(4, '0')}`)) {
  if (person(id)?.location === 'St') person(id).location = 'St. Lucas, Fayette County, Iowa';
}

// --- Seitenkopf-Artefakte entfernen ---------------------------------------

for (const target of data.people) {
  for (const key of ['name', 'firstName', 'lastName', 'location', 'note']) {
    const before = target[key] || '';
    const after = cleanHeader(before);
    if (before !== after) changes.headerCleanups += 1;
    target[key] = after;
  }
  if (target.name && (!target.firstName || /Descendants of/i.test(target.firstName))) {
    const parts = target.name.split(/\s+/);
    target.firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : target.name;
    target.lastName = parts.length > 1 ? parts.at(-1) : '';
  }
}

// --- Hochsichere Duplikate: bereinigter Name + identisches Geburtsdatum ---

function richness(target) {
  return (target.id.startsWith('fbx') ? 0 : 10)
    + (target.parents?.length || 0) * 4
    + (target.partners?.length || 0) * 2
    + Object.keys(target.partnerDetails || {}).length * 3
    + (target.died ? 3 : 0) + (target.location ? 2 : 0)
    + Math.min(String(target.note || '').length / 100, 2);
}

function mergeRecords(target, duplicate) {
  for (const key of ['nickname', 'died', 'birthName', 'occupation', 'religion', 'location', 'link', 'image']) {
    if (!target[key] && duplicate[key]) target[key] = duplicate[key];
  }
  target.parents = unique([...(target.parents || []), ...(duplicate.parents || [])]);
  target.partners = unique([...(target.partners || []), ...(duplicate.partners || [])]);
  target.partnerDetails = { ...(duplicate.partnerDetails || {}), ...(target.partnerDetails || {}) };
  target.mentions = unique([...(target.mentions || []), ...(duplicate.mentions || [])].map(JSON.stringify)).map(JSON.parse);
  appendNote(target, `V5-Duplikat zusammengeführt: ${duplicate.id}`);
  changes.merges.push({ from: duplicate.id, into: target.id, name: target.name, born: target.born });
}

const aliases = new Map(forcedAliases);
for (const [from, into] of forcedAliases) {
  const source = person(from);
  const target = person(into);
  if (source && target) mergeRecords(target, source);
}

const duplicateGroups = new Map();
for (const target of data.people) {
  if (!/^fbx?/.test(target.id) || !target.born || !normalizedName(target.name)) continue;
  const key = `${normalizedName(target.name)}|${normalizedName(target.born)}`;
  if (!duplicateGroups.has(key)) duplicateGroups.set(key, []);
  duplicateGroups.get(key).push(target);
}
for (const group of duplicateGroups.values()) {
  const available = group.filter(target => !aliases.has(target.id));
  if (available.length < 2) continue;
  available.sort((a, b) => richness(b) - richness(a) || a.id.localeCompare(b.id));
  const target = available[0];
  for (const duplicate of available.slice(1)) {
    aliases.set(duplicate.id, target.id);
    mergeRecords(target, duplicate);
  }
}

const resolveAlias = id => {
  let current = id;
  const visited = new Set();
  while (aliases.has(current) && !visited.has(current)) {
    visited.add(current);
    current = aliases.get(current);
  }
  return current;
};

for (const target of data.people) {
  target.parents = unique((target.parents || []).map(resolveAlias).filter(id => id !== target.id));
  target.partners = unique((target.partners || []).map(resolveAlias).filter(id => id !== target.id));
  target.partner = target.partner ? resolveAlias(target.partner) : '';
  const details = {};
  for (const [id, value] of Object.entries(target.partnerDetails || {})) details[resolveAlias(id)] = value;
  target.partnerDetails = details;
}
data.rootIds = unique((data.rootIds || []).map(resolveAlias));
data.people = data.people.filter(target => !aliases.has(target.id));

// --- Partnerbeziehungen plausibilisieren und symmetrisch machen ------------

let map = byId();
const pairMap = new Map();
for (const target of data.people) {
  for (const partnerId of target.partners || []) {
    if (!map.has(partnerId)) continue;
    const key = [target.id, partnerId].sort().join('|');
    pairMap.set(key, [map.get(key.split('|')[0]), map.get(key.split('|')[1])]);
  }
}
const retainedPairs = new Set();
for (const [key, [a, b]] of pairMap) {
  const ay = year(a.born), by = year(b.born), ad = year(a.died), bd = year(b.died);
  const evidence = a.partner === b.id || b.partner === a.id || a.partnerDetails?.[b.id] || b.partnerDetails?.[a.id];
  const impossible = (ay && by && Math.abs(ay - by) > 65)
    || (ad && by && by > ad + 5) || (bd && ay && ay > bd + 5);
  if (evidence && !impossible) retainedPairs.add(key);
  else changes.removedPartnerPairs.push({ a: a.id, b: b.id, reason: impossible ? 'chronologisch unmöglich' : 'ohne Beleg/Primärzuordnung' });
}
for (const target of data.people) {
  target.partners = unique((target.partners || []).filter(partnerId => retainedPairs.has([target.id, partnerId].sort().join('|'))));
}
for (const key of retainedPairs) {
  const [aId, bId] = key.split('|');
  const a = map.get(aId), b = map.get(bId);
  if (!a || !b) continue;
  a.partners = unique([...a.partners, bId]);
  b.partners = unique([...b.partners, aId]);
}
for (const target of data.people) {
  if (!target.partners.includes(target.partner)) target.partner = target.partners[0] || '';
  target.partnerDetails = Object.fromEntries(Object.entries(target.partnerDetails || {}).filter(([id]) => target.partners.includes(id)));
}

// --- Elternbeziehungen: Chronologie, max. zwei, fehlenden Partner ergänzen -

map = byId();
const plausibleParent = (child, parent) => {
  if (!parent || child.id === parent.id) return false;
  const cy = year(child.born), py = year(parent.born), pd = year(parent.died);
  if (cy && py && (cy - py < 12 || cy - py > 75)) return false;
  if (cy && pd && cy > pd + 2) return false;
  return true;
};

for (const child of data.people.filter(target => /^fb/.test(target.id))) {
  const before = [...(child.parents || [])];
  let parents = unique(before).filter(id => plausibleParent(child, map.get(id)));
  for (const removed of before.filter(id => !parents.includes(id))) {
    changes.removedParentRefs.push({ child: child.id, parent: removed, reason: 'chronologisch unmöglich oder ungültig' });
  }
  if (parents.length > 2) {
    const pairs = [];
    for (let i = 0; i < parents.length; i += 1) for (let j = i + 1; j < parents.length; j += 1) {
      const a = map.get(parents[i]), b = map.get(parents[j]);
      const partnered = a?.partners?.includes(b?.id) || b?.partners?.includes(a?.id);
      const cy = year(child.born);
      const agePenalty = [a, b].reduce((sum, p) => sum + (cy && year(p?.born) ? Math.abs((cy - year(p.born)) - 30) : 20), 0);
      pairs.push({ ids: [parents[i], parents[j]], score: (partnered ? 100 : 0) - agePenalty });
    }
    pairs.sort((a, b) => b.score - a.score);
    const kept = pairs[0]?.ids || parents.slice(0, 2);
    for (const removed of parents.filter(id => !kept.includes(id))) {
      changes.removedParentRefs.push({ child: child.id, parent: removed, reason: 'mehrdeutige Namenskollision; plausibles Elternpaar bevorzugt' });
    }
    parents = kept;
  }
  child.parents = parents;
}

// Wenn genau ein Elternteil verbleibt und genau ein plausibler Partner existiert,
// wird das in den Children-of-Blöcken implizite zweite Elternteil ergänzt.
for (const child of data.people.filter(target => /^fb/.test(target.id) && target.parents.length === 1)) {
  const parent = map.get(child.parents[0]);
  const candidates = unique(parent?.partners || []).filter(id => plausibleParent(child, map.get(id)));
  if (candidates.length === 1) {
    child.parents.push(candidates[0]);
    changes.completedParentRefs.push({ child: child.id, parent: candidates[0] });
  }
}

// --- Transparenter, ausdrücklich hypothetischer Anschluss ------------------

const bridge = personTemplate('fbbridge0001', 'Ungeklärter Bodensteiner-Anschluss', {
  born: 'About 1705', location: 'Oberpfalz, Bavaria, Germany',
  parents: ['p334', 'p335'], pool: false, confidence: 'low',
  x: 35750, y: 1205,
  note: 'Reiner Brückendatensatz zur visuellen Einordnung des Unterlinder Familienbuch-Zweigs. Die Abstammung von Adam und Barbara Bodensteiner ist nicht belegt und muss durch Kirchenbuch-/Archivquellen bestätigt oder ersetzt werden.',
  mentions: [sourceMention({ relationStatus: 'hypothesis' })],
});
data.people.push(bridge);
person('fb0001').parents = [bridge.id];
appendNote(person('fb0001'), 'V5-Anschluss an den aktiven Bodensteiner-Zweig ist ausdrücklich eine Arbeitshypothese; Elternschaft nicht belegt.');

// --- Aktiver Einstieg bis einschließlich erster US-Nachkommengeneration ----

map = byId();
const childrenByParent = new Map();
for (const child of data.people) for (const parentId of child.parents || []) {
  if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
  childrenByParent.get(parentId).push(child.id);
}
const depth = new Map([['fb0001', 0]]);
const queue = ['fb0001'];
while (queue.length) {
  const current = queue.shift();
  const nextDepth = depth.get(current) + 1;
  if (nextDepth > 4) continue;
  for (const childId of childrenByParent.get(current) || []) {
    if (!depth.has(childId) || nextDepth < depth.get(childId)) {
      depth.set(childId, nextDepth);
      queue.push(childId);
    }
  }
}
const gateway = new Set([bridge.id, ...depth.keys()]);
for (const id of [...depth.keys()]) for (const partnerId of map.get(id)?.partners || []) gateway.add(partnerId);
for (const id of gateway) {
  const target = map.get(id);
  if (!target) continue;
  target.pool = false;
  changes.activated.push(id);
}

const birthSort = (a, b) => (year(a.born) || 9999) - (year(b.born) || 9999) || a.name.localeCompare(b.name, 'de');
for (let row = 0; row <= 4; row += 1) {
  const principals = [...depth.entries()].filter(([, d]) => d === row).map(([id]) => map.get(id)).filter(Boolean).sort(birthSort);
  const principalIds = new Set(principals.map(target => target.id));
  const units = principals.map(target => [target, ...target.partners.map(id => map.get(id)).filter(p => p && gateway.has(p.id) && !principalIds.has(p.id))]);
  let x = 36000;
  for (const unit of units) {
    for (const target of unique(unit.map(p => p.id)).map(id => map.get(id))) {
      target.x = x;
      target.y = 1390 + row * 185;
      x += 205;
    }
    x += 75;
  }
}

// --- Schlussvalidierung und Metadaten --------------------------------------

map = byId();
const invalidRefs = [];
for (const target of data.people) {
  target.parents = unique(target.parents);
  target.partners = unique(target.partners);
  for (const id of [...target.parents, ...target.partners]) if (!map.has(id)) invalidRefs.push({ from: target.id, to: id });
}
if (invalidRefs.length) throw new Error(`Ungültige Referenzen: ${JSON.stringify(invalidRefs.slice(0, 10))}`);
if (new Set(data.people.map(target => target.id)).size !== data.people.length) throw new Error('Doppelte IDs im Ergebnis');

data.metadata = data.metadata || {};
data.metadata.title = 'Stammbaum korreliert v5 – Familienbuch bereinigt und eingeordnet';
data.metadata.peopleCount = data.people.length;
data.metadata.notes = unique([
  ...(data.metadata.notes || []),
  'V5: Amerikanischer Familienbuch-Zweig auf hochsichere Duplikate und chronologisch unmögliche Beziehungen bereinigt.',
  'V5: Sieben vermischte Personenidentitäten aufgespalten; frühe Familienbuch-Linie anhand der veröffentlichten Quelle korrigiert.',
  'V5: Der Anschluss vor Joseph Bodensteiner (ca. 1734) ist als niedrig verifizierte Arbeitshypothese über fbbridge0001 modelliert.',
  'V5: Nur der Anschluss bis zur ersten US-Nachkommengeneration ist aktiv; tiefere Nachkommen bleiben zur performanten Darstellung im Vorrat.',
]);

const exactGroupsRemaining = new Map();
for (const target of data.people.filter(p => /^fb/.test(p.id) && p.born)) {
  const key = `${normalizedName(target.name)}|${normalizedName(target.born)}`;
  if (!exactGroupsRemaining.has(key)) exactGroupsRemaining.set(key, []);
  exactGroupsRemaining.get(key).push(target.id);
}
const remainingDuplicates = [...exactGroupsRemaining.values()].filter(ids => ids.length > 1);

fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
fs.writeFileSync(REPORT, `# Familienbuch V5 – Bereinigung und Einordnung\n\n` +
`## Ergebnis\n\n` +
`- Ausgang: \`${path.basename(INPUT)}\` mit ${originalCount} Personen.\n` +
`- Ergebnis: \`${path.basename(OUTPUT)}\` mit ${data.people.length} Personen.\n` +
`- Hochsichere Duplikate zusammengeführt: ${changes.merges.length}.\n` +
`- Vermischte/fehlende Identitäten aufgespalten bzw. ergänzt: ${changes.splits.length}.\n` +
`- Unplausible Elternreferenzen entfernt: ${changes.removedParentRefs.length}.\n` +
`- Eindeutige zweite Elternteile ergänzt: ${changes.completedParentRefs.length}.\n` +
`- Unbelegte oder chronologisch unmögliche Partnerpaare entfernt: ${changes.removedPartnerPairs.length}.\n` +
`- Entfernte Seitenkopf-Artefakte: ${changes.headerCleanups}.\n` +
`- Aktiv eingeordnete Familienbuch-/Brückenpersonen: ${changes.activated.length}.\n` +
`- Verbleibende exakte Name-plus-Geburtsdatum-Gruppen: ${remainingDuplicates.length}.\n\n` +
`## Anschluss an den aktiven Bodensteiner-Zweig\n\n` +
`Der Familienbuch-Zweig beginnt belegt bei Joseph Bodensteiner (ca. 1734, Unterlind). ` +
`Die Quelle nennt seine Eltern nicht. Deshalb wurde keine scheinbar sichere direkte Elternschaft erzeugt. ` +
`Der Datensatz \`fbbridge0001\` verbindet den Zweig sichtbar mit Adam und Barbara Bodensteiner, ist aber mit niedriger Sicherheit und einem deutlichen Hypothesenhinweis versehen. ` +
`Diese Brücke muss später durch Kirchenbuch-/Archivbelege bestätigt, verschoben oder entfernt werden.\n\n` +
`## Aktive Positionierung\n\n` +
`Aktiv sind der Brückeneinstieg, Josephs frühe Unterlinder Linie, die Auswanderer Johann Karl/Joseph sowie deren erste US-Nachkommengeneration. ` +
`Tiefere Nachkommen bleiben im Vorrat. So ist der US-Zweig sichtbar angeschlossen, ohne beim Öffnen rund 4.000 zusätzliche Karten zu rendern. ` +
`Die JSON-Ausgangskoordinaten legen die neuen Ebenen rechts neben dem bisherigen Bodensteiner-Zweig in 185-Pixel-Abständen ab. ` +
`Beim Import berechnet die App den aktiven Zusammenhang anschließend mit ihrem Auto-Layout neu; diese Laufzeitpositionierung wurde im Browser ohne Koordinatenüberlagerung geprüft.\n\n` +
`## Belegte manuelle Aufspaltungen\n\n` + changes.splits.map(item => `- \`${item.id}\` ${item.name}: ${item.reason}.`).join('\n') + `\n\n` +
`## Zusammenführungen\n\n` + (changes.merges.length ? changes.merges.map(item => `- \`${item.from}\` → \`${item.into}\`: ${item.name}, ${item.born}.`).join('\n') : '- Keine.') + `\n\n` +
`## Prüfhintergrund und Grenzen\n\n` +
`Die frühen Korrekturen wurden gegen die veröffentlichte Fassung „${SOURCE_TITLE}“ geprüft. ` +
`Automatisch zusammengeführt wurde nur bei identischem bereinigtem Namen und identischem Geburtsdatum. ` +
`Ähnliche Namen oder bloß gleiche Jahreszahlen bleiben getrennt. Die hypothetische Verbindung vor Joseph 1734 ist keine genealogische Tatsachenbehauptung.\n`, 'utf8');

console.log(JSON.stringify({
  inputPeople: originalCount,
  outputPeople: data.people.length,
  merges: changes.merges.length,
  splits: changes.splits.length,
  removedParentRefs: changes.removedParentRefs.length,
  completedParentRefs: changes.completedParentRefs.length,
  removedPartnerPairs: changes.removedPartnerPairs.length,
  headerCleanups: changes.headerCleanups,
  activated: changes.activated.length,
  remainingDuplicates: remainingDuplicates.length,
  output: path.relative(ROOT, OUTPUT),
  report: path.relative(ROOT, REPORT),
}, null, 2));
