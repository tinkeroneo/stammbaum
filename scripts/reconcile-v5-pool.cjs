const fs = require('node:fs');
const path = require('node:path');

const datasetPath = path.resolve(
  process.cwd(),
  process.argv[2] || 'stammbaum_mit_familienbuch_full_v5_bereinigt.json'
);

if (!fs.existsSync(datasetPath)) throw new Error(`V5-Datensatz nicht gefunden: ${datasetPath}`);

const data = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
let people = Array.isArray(data.people) ? data.people : [];
let byId = new Map(people.map(person => [String(person.id), person]));
const scalarFields = [
  'name', 'firstName', 'lastName', 'nickname', 'born', 'died', 'birthName',
  'occupation', 'religion', 'location', 'link', 'image'
];

function uniqueIds(values) {
  return [...new Set((values || []).map(String).filter(Boolean))];
}

function requirePerson(id) {
  const person = byId.get(String(id));
  if (!person) throw new Error(`Erwartete Person fehlt: ${id}`);
  return person;
}

function mergeMentions(target, source) {
  const merged = [...(target.mentions || []), ...(source.mentions || [])];
  const seen = new Set();
  target.mentions = merged.filter(mention => {
    const key = JSON.stringify(mention || {});
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function replaceReferences(fromId, toId) {
  for (const person of people) {
    person.parents = uniqueIds((person.parents || []).map(id => String(id) === fromId ? toId : id))
      .filter(id => id !== String(person.id));
    person.partners = uniqueIds([
      ...(person.partners || []).map(id => String(id) === fromId ? toId : id),
      String(person.partner || '') === fromId ? toId : person.partner
    ]).filter(id => id !== String(person.id));
    person.partner = person.partners[0] || '';
    const details = {};
    for (const [id, value] of Object.entries(person.partnerDetails || {})) {
      const replacement = String(id) === fromId ? toId : String(id);
      if (replacement !== String(person.id)) details[replacement] ||= value;
    }
    person.partnerDetails = details;
  }
}

function mergePerson(fromId, toId, reason) {
  const source = requirePerson(fromId);
  const target = requirePerson(toId);
  for (const field of scalarFields) {
    if (!target[field] && source[field]) target[field] = source[field];
  }
  target.parents = uniqueIds([...(target.parents || []), ...(source.parents || [])])
    .filter(id => id !== fromId && id !== toId);
  target.partners = uniqueIds([...(target.partners || []), ...(source.partners || [])])
    .filter(id => id !== fromId && id !== toId);
  target.partner = target.partners[0] || '';
  target.partnerDetails = {
    ...(source.partnerDetails || {}),
    ...(target.partnerDetails || {})
  };
  delete target.partnerDetails[fromId];
  mergeMentions(target, source);
  target.note = [target.note, `[V5-Vorratsabgleich] ${reason}; Dublette ${fromId} in ${toId} zusammengeführt.`]
    .filter(Boolean).join('\n');
  replaceReferences(fromId, toId);
  people = people.filter(person => String(person.id) !== fromId);
  byId = new Map(people.map(person => [String(person.id), person]));
}

const merges = [
  ['k0161', 'k0163', 'identischer Name sowie identisches Geburts- und Sterbedatum'],
  ['fb1233', 'fbx9870', 'identischer vollständiger Name; das präzise Geburtsdatum ergänzt den bereits angeschlossenen Partnereintrag'],
  ['fbx9849', 'fbx9435', 'identischer vollständiger Name; leerer Elternhinweis entspricht dem belegten Stephen-A.-Lensing-Datensatz'],
  ['fbx10558', 'fb0843', 'identischer Name und dieselbe eindeutig passende Carolyn-Partnerschaft'],
  ['fb1290', 'fbx10101', 'identisches Geburtsdatum und dieselbe Kevin-Hemesath-Partnerschaft'],
  ['fb1988', 'fb0936', 'identischer Name und identisches Geburtsdatum; vorangestellte Personennummer war ein PDF-Satzfragment'],
  ['fb1997', 'fb0044', 'identischer Name sowie identisches Geburts- und Sterbeintervall; vorangestellte Personennummer war ein PDF-Satzfragment'],
  ['fb1996', 'fb0046', 'identischer Name sowie identisches Geburts- und Sterbeintervall; vorangestellte Personennummer war ein PDF-Satzfragment'],
  ['fb2004', 'fb0047', 'identischer Name und identisches Geburtsjahr; vorangestellte Personennummer war ein PDF-Satzfragment'],
  ['fb2002', 'fb0048', 'identischer Name sowie identisches Geburts- und Sterbeintervall; vorangestellte Personennummer war ein PDF-Satzfragment']
];

// Der Familienbuch-Import hat einige Ehepartner zweimal erzeugt: einmal direkt
// als Ehepartner und einmal erneut aus dem zugehörigen „Children of“-Block.
// Gleicher vollständiger Name plus derselbe einzige Partner ist hier ein
// belastbares strukturelles Dublettenmerkmal. Gleichnamige Geschwister ohne
// einen solchen Beziehungsanker werden ausdrücklich nicht zusammengeführt.
const poolMerges = [
  ['fbx11508', 'fbx10491', 'gleicher Name und derselbe eindeutige Partner fb1212'],
  ['fbx11583', 'fbx10589', 'gleicher Name und derselbe eindeutige Partner fb1319'],
  ['fbx11578', 'fbx10587', 'gleicher Name und derselbe eindeutige Partner fb1317'],
  ['fbx11589', 'fbx10594', 'gleicher Name und derselbe eindeutige Partner fb1325'],
  ['fbx11587', 'fbx10590', 'gleicher Name und derselbe eindeutige Partner fb1320'],
  ['fbx11359', 'fbx10344', 'gleicher Name und derselbe eindeutige Partner fb1067'],
  ['fbx11501', 'fbx10480', 'gleicher Name und derselbe eindeutige Partner fb1198'],
  ['fbx11601', 'fbx10603', 'gleicher Name und derselbe eindeutige Partner fb1335'],
  ['fbx11532', 'fbx10540', 'gleicher Name und derselbe eindeutige Partner fb1270'],
  ['fbx10471', 'fb1021', 'gleicher Name und derselbe eindeutige Partner fb1187; der Zieldatensatz enthält zusätzlich das Geburtsdatum'],
  ['fbx11451', 'fbx10423', 'gleicher Name und derselbe eindeutige Partner fb1140'],
  ['fbx11514', 'fbx10504', 'gleicher Name und derselbe eindeutige Partner fb1221'],
  ['fbx11389', 'fbx10368', 'gleicher Name und derselbe eindeutige Partner fb1091'],
  ['fbx11580', 'fbx10588', 'gleicher Name und derselbe eindeutige Partner fb1318'],
  ['fbx11591', 'fbx10595', 'gleicher Name und derselbe eindeutige Partner fb1326'],
  ['fbx11469', 'fbx10448', 'gleicher Name und derselbe eindeutige Partner fb1168'],
  ['fbx11471', 'fbx10449', 'gleicher Name und derselbe eindeutige Partner fb1169'],
  ['fbx11276', 'fbx10299', 'gleicher Name und derselbe eindeutige Partner fb1030'],
  ['fbx11496', 'fbx10478', 'gleicher Name und derselbe eindeutige Partner fb1196'],
  ['fbx11529', 'fbx10538', 'gleicher Name und derselbe eindeutige Partner fb1265'],
  ['fbx11284', 'fbx10302', 'gleicher Name und derselbe eindeutige Partner fb1033'],
  ['fbx11328', 'fbx10327', 'gleicher Name und derselbe eindeutige Partner fb1054'],
  ['fbx11597', 'fbx10598', 'gleicher Name und derselbe eindeutige Partner fb1331'],
  ['fbx11398', 'fbx10378', 'gleicher Name und derselbe eindeutige Partner fb1101'],
  ['fbx11248', 'fbx10291', 'gleicher Name und derselbe eindeutige Partner fb1020'],
  ['fbx11280', 'fbx10300', 'gleicher Name und derselbe eindeutige Partner fb1031'],
  ['fbx11459', 'fbx10432', 'gleicher Name und derselbe eindeutige Partner fb1150'],
  ['fbx11486', 'fbx10462', 'gleicher Name und derselbe eindeutige Partner fb1180'],
  ['fbx11308', 'fbx10320', 'gleicher Name und derselbe eindeutige Partner fb1048'],
  ['fbx11380', 'fbx10361', 'gleicher Name und derselbe eindeutige Partner fb1083'],
  ['fbx11445', 'fbx10416', 'gleicher Name und derselbe eindeutige Partner fb1135'],
  ['fbx11558', 'fbx10571', 'gleicher Name und derselbe eindeutige Partner fb1301'],
  ['fbx11384', 'fbx10362', 'gleicher Name und derselbe eindeutige Partner fb1084'],
  ['fbx11352', 'fbx10335', 'gleicher Name und derselbe eindeutige Partner fb1062']
];

let mergedCount = 0;
for (const [fromId, toId, reason] of merges) {
  if (!byId.has(fromId)) continue;
  mergePerson(fromId, toId, reason);
  mergedCount += 1;
}

let mergedPoolCount = 0;
for (const [fromId, toId, reason] of poolMerges) {
  if (!byId.has(fromId)) continue;
  mergePerson(fromId, toId, reason);
  mergedPoolCount += 1;
}

function correctPerson(id, patch, note) {
  const person = requirePerson(id);
  Object.assign(person, patch);
  const noteLine = `[V5-Vorratsabgleich] ${note}`;
  if (!String(person.note || '').split('\n').includes(noteLine)) {
    person.note = [person.note, noteLine].filter(Boolean).join('\n');
  }
}

correctPerson('fbx10101', {
  name: 'Carolyn A. Ott',
  firstName: 'Carolyn A.',
  lastName: 'Ott'
}, 'Aus dem vollständigen nummerierten Eintrag wurde der abgeschnittene Nachname Ott ergänzt.');

correctPerson('fbx10612', {
  born: '12.06.1938',
  partnerDetails: {}
}, '12.06.1938 aus dem falsch zugeordneten Heiratsfeld als Geburtsdatum übernommen.');
correctPerson('fbx10614', {
  died: '1979'
}, 'Sterbeintervall „Between 1979 and 2004“ auf das früheste belegte Jahr normalisiert.');
correctPerson('fbx10615', {
  name: 'Blanche Beauchamp',
  firstName: 'Blanche',
  lastName: 'Beauchamp',
  born: '1898',
  died: '1979',
  partnerDetails: {}
}, 'PDF-Satzrest aus dem Namen entfernt; „About 1898“ und „Between 1979 and 1998“ normalisiert.');
correctPerson('fbx10616', {
  name: 'Bernice Lothspeick',
  firstName: 'Bernice',
  lastName: 'Lothspeick',
  born: '1908',
  died: '1979',
  partnerDetails: {}
}, 'PDF-Satzrest aus dem Namen entfernt; „About 1908“ und „Between 1979 and 2008“ normalisiert.');
correctPerson('fbx10617', {
  died: '1979'
}, 'Sterbeintervall „Between 1979 and 2002“ auf das früheste belegte Jahr normalisiert.');

function clearUnverifiedMarriage(leftId, rightId) {
  const left = requirePerson(leftId);
  const right = requirePerson(rightId);
  delete left.partnerDetails?.[rightId];
  delete right.partnerDetails?.[leftId];
}

clearUnverifiedMarriage('fb0936', 'fbx10612');
clearUnverifiedMarriage('fb0044', 'fbx10615');
clearUnverifiedMarriage('fb0046', 'fbx10614');
clearUnverifiedMarriage('fb0047', 'fbx10617');
clearUnverifiedMarriage('fb0048', 'fbx10616');

// Partnerschaften nach dem Zusammenführen noch einmal vollständig spiegeln.
for (const person of people) {
  for (const partnerId of person.partners || []) {
    const partner = byId.get(String(partnerId));
    if (!partner) continue;
    partner.partners = uniqueIds([...(partner.partners || []), person.id]);
    partner.partner = partner.partners[0] || '';
  }
}

data.people = people;
data.metadata ||= {};
data.metadata.peopleCount = people.length;
data.metadata.notes ||= [];
const note = 'V5: Vorrat geprüft; zehn aktiv-/vorratsübergreifende sowie 34 strukturell eindeutige Dubletten innerhalb des Vorrats zusammengeführt, fünf dadurch eindeutig angeschlossene Angehörige aktiviert und fünf fehlerhaft extrahierte Lebensdaten/Namen korrigiert.';
if (!data.metadata.notes.includes(note)) data.metadata.notes.push(note);

fs.writeFileSync(datasetPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  file: datasetPath,
  people: people.length,
  mergedDuplicates: mergedCount,
  mergedPoolDuplicates: mergedPoolCount,
  connectedCandidates: ['fbx10612', 'fbx10614', 'fbx10615', 'fbx10616', 'fbx10617']
}, null, 2));
