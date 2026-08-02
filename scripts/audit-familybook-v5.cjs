const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(__dirname, '..', 'stammbaum_mit_familienbuch_full_v5_bereinigt.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map(data.people.map(person => [person.id, person]));
const year = value => {
  const match = String(value || '').match(/(?:15|16|17|18|19|20)\d{2}/);
  return match ? Number(match[0]) : null;
};

const missing = [];
const asymmetricPartners = [];
const implausibleParents = [];
const selfReferences = [];
for (const person of data.people) {
  for (const parentId of person.parents || []) {
    if (!byId.has(parentId)) missing.push([person.id, parentId]);
    if (parentId === person.id) selfReferences.push([person.id, 'parent']);
    const parent = byId.get(parentId);
    const childYear = year(person.born);
    const parentYear = year(parent?.born);
    if (/^fb/.test(person.id) && childYear && parentYear && (childYear - parentYear < 12 || childYear - parentYear > 75)) {
      implausibleParents.push([person.id, parentId, childYear - parentYear]);
    }
  }
  for (const partnerId of person.partners || []) {
    if (!byId.has(partnerId)) missing.push([person.id, partnerId]);
    if (partnerId === person.id) selfReferences.push([person.id, 'partner']);
    if (partnerId !== person.id && !byId.get(partnerId)?.partners?.includes(person.id)) {
      asymmetricPartners.push([person.id, partnerId]);
    }
  }
}

const state = new Map();
const cycles = [];
function visit(id) {
  if (state.get(id) === 1) {
    cycles.push(id);
    return;
  }
  if (state.get(id) === 2) return;
  state.set(id, 1);
  for (const parentId of byId.get(id)?.parents || []) visit(parentId);
  state.set(id, 2);
}
for (const person of data.people) visit(person.id);

const active = data.people.filter(person => !person.pool);
const importedActive = active.filter(person => /^fb/.test(person.id));
const coordinates = new Map();
const overlaps = [];
for (const person of active) {
  const key = `${Math.round(person.x)}|${Math.round(person.y)}`;
  if (coordinates.has(key)) overlaps.push([coordinates.get(key), person.id, key]);
  else coordinates.set(key, person.id);
}

const normalized = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const identities = new Map();
for (const person of data.people.filter(person => /^fb/.test(person.id) && person.born)) {
  const key = `${normalized(person.name)}|${normalized(person.born)}`;
  if (!identities.has(key)) identities.set(key, []);
  identities.get(key).push(person.id);
}
const exactDuplicates = [...identities.values()].filter(ids => ids.length > 1);

const summary = {
  people: data.people.length,
  metadataPeople: data.metadata?.peopleCount,
  active: active.length,
  importedActive: importedActive.length,
  pool: data.people.filter(person => person.pool).length,
  missing,
  asymmetricPartners,
  implausibleParents,
  selfReferences,
  parentCycles: [...new Set(cycles)],
  exactDuplicates,
  activeCoordinateOverlaps: overlaps,
  importedActiveBounds: {
    minX: Math.min(...importedActive.map(person => person.x)),
    maxX: Math.max(...importedActive.map(person => person.x)),
    minY: Math.min(...importedActive.map(person => person.y)),
    maxY: Math.max(...importedActive.map(person => person.y)),
  },
};

console.log(JSON.stringify(summary, null, 2));
if (missing.length || asymmetricPartners.length || implausibleParents.length || selfReferences.length
  || cycles.length || exactDuplicates.length || overlaps.length || data.people.length !== data.metadata?.peopleCount) {
  process.exitCode = 1;
}
