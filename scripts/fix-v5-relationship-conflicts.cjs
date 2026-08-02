const fs = require('node:fs');
const path = require('node:path');

const datasetPath = path.resolve(
  process.cwd(),
  process.argv[2] || 'stammbaum_mit_familienbuch_full_v5_bereinigt.json'
);

if (!fs.existsSync(datasetPath)) {
  throw new Error(`V5-Datensatz nicht gefunden: ${datasetPath}`);
}

const data = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
const people = data.people || [];
const byId = new Map(people.map(person => [String(person.id), person]));

function requirePerson(id) {
  const person = byId.get(id);
  if (!person) throw new Error(`Erwartete Person fehlt: ${id}`);
  return person;
}

function setParents(id, parents) {
  requirePerson(id).parents = [...new Set(parents.map(String))];
}

function setPartners(person, partnerIds, partnerDetails = {}) {
  person.partners = [...new Set(partnerIds.map(String))];
  person.partner = person.partners[0] || '';
  person.partnerDetails = partnerDetails;
}

function upsertPerson(person) {
  const existing = byId.get(person.id);
  if (existing) {
    const existingPosition = {
      x: Number.isFinite(Number(existing.x)) ? Number(existing.x) : person.x,
      y: Number.isFinite(Number(existing.y)) ? Number(existing.y) : person.y
    };
    Object.assign(existing, person, existingPosition);
  }
  else {
    people.push(person);
    byId.set(person.id, person);
  }
}

const unknownEichenbergerId = 'fbx11610';
const albinMassmanSeniorId = 'fbx11611';
const maryClaraTersehrId = 'fbx11612';
const josephJohnVollmeckeJuniorId = 'fbx11613';
const familybookSource = 'https://www.yumpu.com/en/document/view/6240944/margarethe-balk-ossian-festina-st-lucas-families';
const vernaObituarySource = 'https://graufuneralhomes.com/lab/2021/04/verna-k-massman-ossian-iowa-april-19-2021/';
const vollmeckeSource = 'https://ossianfestinastlucasfamilies.weebly.com/uploads/4/3/4/0/4340066/descendants_of_fred_vollmecke.pdf';

const debra = requirePerson('fb0893');
const thomas = requirePerson('fbx10149');
const adam = requirePerson('fbx11122');

upsertPerson({
  id: unknownEichenbergerId,
  name: '(Unknown) Eichenberger',
  firstName: '(Unknown)',
  lastName: 'Eichenberger',
  nickname: '',
  born: '',
  died: '',
  birthName: '',
  occupation: '',
  religion: '',
  location: '',
  link: '',
  image: '',
  mentions: [{
    title: 'Margarethe Balk – Ossian Festina St. Lucas Families',
    date: '',
    link: familybookSource
  }],
  pool: false,
  note: 'Ehemann von Debra Elizabeth Lensing; der Familienname folgt den Kindern. Der Vorname ist in den zugänglichen Quellen nicht verlässlich belegt.',
  confidence: 'low',
  x: Number(debra.x || 0) + 232,
  y: Number(debra.y || 0),
  parents: [],
  partner: debra.id,
  partners: [debra.id],
  partnerDetails: {
    [debra.id]: { married: '23.10.1976' }
  }
});
setPartners(debra, [unknownEichenbergerId], {
  [unknownEichenbergerId]: { married: '23.10.1976' }
});
debra.note = 'Familienbuch-Person Nr. 893\n[V5-Beziehungsbereinigung] Der fälschlich als Partner geführte Sohn Thomas wurde als Kind eingeordnet; der namentlich nicht belegte Ehemann ist getrennt modelliert.';
setParents(thomas.id, [debra.id, unknownEichenbergerId]);
setPartners(thomas, []);
thomas.note = 'Kind von Debra Elizabeth Lensing und einem namentlich nicht belegten Eichenberger.\n[V5-Beziehungsbereinigung] Im Extrakt fälschlich zugleich als Ehepartner der Mutter geführt.';
setParents(adam.id, [debra.id, unknownEichenbergerId]);

const verna = requirePerson('fb0446');
const albinJunior = requirePerson('fbx9622');
const massmanChildren = people
  .filter(person => (person.parents || []).map(String).includes(verna.id))
  .map(person => String(person.id));

upsertPerson({
  id: albinMassmanSeniorId,
  name: 'Albin Sr. Massman',
  firstName: 'Albin Sr.',
  lastName: 'Massman',
  nickname: '',
  born: '',
  died: '',
  birthName: '',
  occupation: '',
  religion: '',
  location: 'Lansing, Allamakee County, Iowa',
  link: vernaObituarySource,
  image: '',
  mentions: [{
    title: 'Nachruf Verna K. Massman, Grau Funeral Homes',
    date: '19.04.2021',
    link: vernaObituarySource
  }],
  pool: false,
  note: 'Ehemann von Verna Catherine Schmitt und Vater ihrer 14 Kinder. Als eigene Person von dem Sohn Albin Massman Jr. getrennt.',
  confidence: 'high',
  x: Number(verna.x || 0) + 232,
  y: Number(verna.y || 0),
  parents: [],
  partner: verna.id,
  partners: [verna.id],
  partnerDetails: {
    [verna.id]: { married: '21.01.1952' }
  }
});
setPartners(verna, [albinMassmanSeniorId], {
  [albinMassmanSeniorId]: { married: '21.01.1952' }
});
verna.note = 'Familienbuch-Person Nr. 446\n[V5-Beziehungsbereinigung] Ehemann Albin Massman Sr. und Sohn Albin Massman Jr. anhand des Nachrufs als getrennte Personen modelliert.';
verna.mentions = [
  ...(verna.mentions || []).filter(mention => mention.link !== vernaObituarySource),
  {
    title: 'Nachruf Verna K. Massman, Grau Funeral Homes',
    date: '19.04.2021',
    link: vernaObituarySource
  }
];
for (const childId of massmanChildren) setParents(childId, [verna.id, albinMassmanSeniorId]);
albinJunior.name = 'Albin Jr. Massman';
albinJunior.firstName = 'Albin Jr.';
albinJunior.lastName = 'Massman';
setPartners(albinJunior, []);
albinJunior.note = 'Kind von Verna Catherine Schmitt und Albin Massman Sr.\n[Datumsnormalisierung] Geburtsdatum ursprünglich: „About 1968“.\n[V5-Beziehungsbereinigung] Im Extrakt fälschlich zugleich als Ehepartner der Mutter geführt; der Nachruf nennt ihn als Albin Massman Jr.';
albinJunior.mentions = [
  ...(albinJunior.mentions || []).filter(mention => mention.link !== vernaObituarySource),
  {
    title: 'Nachruf Verna K. Massman, Grau Funeral Homes',
    date: '19.04.2021',
    link: vernaObituarySource
  }
];

// A third conflict lived only in the disconnected pool and therefore did not
// appear in the active-layout metric: Marilyn Rae Weiler had been duplicated,
// her birth date was stored as a marriage date, and her son was merged into
// his father. The published Vollmecke descendants list makes all identities
// and dates explicit, so this branch can be repaired without assumptions.
const leoVollmecke = requirePerson('fb0134');
const josephVollmeckeSenior = requirePerson('fb0497');
const marilynWeiler = requirePerson('fbx9677');
const chadVollmecke = requirePerson('fbx10741');
const duplicateMarilyn = byId.get('fbx10740');
if (duplicateMarilyn) {
  const duplicateIndex = people.indexOf(duplicateMarilyn);
  if (duplicateIndex >= 0) people.splice(duplicateIndex, 1);
  byId.delete(duplicateMarilyn.id);
}

upsertPerson({
  id: maryClaraTersehrId,
  name: 'Mary Clara Tersehr',
  firstName: 'Mary Clara',
  lastName: 'Tersehr',
  nickname: '',
  born: '01.07.1912',
  died: '',
  birthName: '',
  occupation: '',
  religion: '',
  location: 'Kent, Wilkin County, Minnesota',
  link: vollmeckeSource,
  image: '',
  mentions: [{
    title: 'Descendants of Fred Vollmecke',
    date: '',
    link: vollmeckeSource
  }],
  pool: false,
  note: 'Ehefrau von Leo Joseph Vollmecke und Mutter von Joseph John Vollmecke Sr.; aus der veröffentlichten Vollmecke-Nachfahrenliste ergänzt.',
  confidence: 'high',
  x: Number(leoVollmecke.x || 0) + 232,
  y: Number(leoVollmecke.y || 0),
  parents: [],
  partner: leoVollmecke.id,
  partners: [leoVollmecke.id],
  partnerDetails: {}
});
setPartners(leoVollmecke, [maryClaraTersehrId]);

josephVollmeckeSenior.name = 'Joseph John Vollmecke Sr.';
josephVollmeckeSenior.firstName = 'Joseph John Sr.';
josephVollmeckeSenior.lastName = 'Vollmecke';
josephVollmeckeSenior.born = '21.08.1949';
josephVollmeckeSenior.pool = false;
josephVollmeckeSenior.note = 'Familienbuch-Person Nr. 497\n[V5-Beziehungsbereinigung] Vater und gleichnamiger Sohn wurden getrennt; Geburtsdatum 05.09.1971 gehört zu Joseph John Vollmecke Jr.';
josephVollmeckeSenior.mentions = [{
  title: 'Descendants of Fred Vollmecke',
  date: '',
  link: vollmeckeSource
}];
setParents(josephVollmeckeSenior.id, [leoVollmecke.id, maryClaraTersehrId]);
setPartners(josephVollmeckeSenior, [marilynWeiler.id]);

marilynWeiler.born = '18.02.1949';
marilynWeiler.pool = false;
marilynWeiler.note = 'Ehefrau von Joseph John Vollmecke Sr. und Mutter von Joseph John Vollmecke Jr. sowie Chad Martin Vollmecke.\n[V5-Beziehungsbereinigung] Doppelte Marilyn-Identität zusammengeführt; 18.02.1949 ist das Geburts-, nicht das Heiratsdatum.';
marilynWeiler.mentions = [{
  title: 'Descendants of Fred Vollmecke',
  date: '',
  link: vollmeckeSource
}];
setPartners(marilynWeiler, [josephVollmeckeSenior.id]);

upsertPerson({
  id: josephJohnVollmeckeJuniorId,
  name: 'Joseph John Vollmecke Jr.',
  firstName: 'Joseph John Jr.',
  lastName: 'Vollmecke',
  nickname: '',
  born: '05.09.1971',
  died: '',
  birthName: '',
  occupation: '',
  religion: '',
  location: '',
  link: vollmeckeSource,
  image: '',
  mentions: [{
    title: 'Descendants of Fred Vollmecke',
    date: '',
    link: vollmeckeSource
  }],
  pool: false,
  note: 'Sohn von Joseph John Vollmecke Sr. und Marilyn Rae Weiler; aus der zuvor vermischten Identität der Familienbuch-Person Nr. 497 getrennt.',
  confidence: 'high',
  x: Number(josephVollmeckeSenior.x || 0),
  y: Number(josephVollmeckeSenior.y || 0) + 185,
  parents: [josephVollmeckeSenior.id, marilynWeiler.id],
  partner: '',
  partners: [],
  partnerDetails: {}
});
chadVollmecke.pool = false;
chadVollmecke.note = 'Kind von Joseph John Vollmecke Sr. und Marilyn Rae Weiler.\n[V5-Beziehungsbereinigung] Doppelte Marilyn-Identität zusammengeführt.';
chadVollmecke.mentions = [{
  title: 'Descendants of Fred Vollmecke',
  date: '',
  link: vollmeckeSource
}];
setParents(chadVollmecke.id, [josephVollmeckeSenior.id, marilynWeiler.id]);

data.people = people;
data.metadata ||= {};
data.metadata.peopleCount = people.length;
data.metadata.notes ||= [];
const correctionNote = 'V5: Zwei Kind-Partner-Identitätskonflikte bereinigt (Thomas Eichenberger sowie Albin Massman Jr.); Ehepartner als getrennte Personen modelliert und Elternkanten vervollständigt.';
if (!data.metadata.notes.includes(correctionNote)) data.metadata.notes.push(correctionNote);
const poolCorrectionNote = 'V5: Zusätzlich den nur im Vorrat vorhandenen Vollmecke/Weiler-Identitätskonflikt bereinigt; Vater/Sohn getrennt, Marilyn-Duplikat zusammengeführt und den belegten Zweig aktiviert.';
if (!data.metadata.notes.includes(poolCorrectionNote)) data.metadata.notes.push(poolCorrectionNote);

fs.writeFileSync(datasetPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  file: datasetPath,
  people: people.length,
  eichenbergerChildren: [thomas.id, adam.id],
  massmanChildren: massmanChildren.length,
  addedSpouses: [unknownEichenbergerId, albinMassmanSeniorId, maryClaraTersehrId],
  splitChild: josephJohnVollmeckeJuniorId
}, null, 2));
