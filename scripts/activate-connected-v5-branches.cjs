const fs = require('node:fs');

const obsoleteNoteFragments = [
  'Nur der Anschluss bis zur ersten US-Nachkommengeneration ist aktiv',
  'unmittelbar verknüpfte Eltern aktiver Personen aus dem Vorrat aktiviert',
  'nachgelagerte US-Nachkommen bleiben im Vorrat',
];

function normalizedIds(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function buildAdjacency(people) {
  const knownIds = new Set(people.map(person => String(person.id)));
  const adjacency = new Map([...knownIds].map(id => [id, new Set()]));
  const connect = (left, right) => {
    const leftId = String(left || '');
    const rightId = String(right || '');
    if (!leftId || !rightId || leftId === rightId || !knownIds.has(rightId)) return;
    adjacency.get(leftId).add(rightId);
    adjacency.get(rightId).add(leftId);
  };

  for (const person of people) {
    const id = String(person.id);
    for (const parentId of normalizedIds(person.parents)) connect(id, parentId);
    for (const partnerId of normalizedIds(person.partners)) connect(id, partnerId);
  }
  return adjacency;
}

function reachableFromActive(people, adjacency) {
  const queue = people.filter(person => !person.pool).map(person => String(person.id));
  const reachable = new Set(queue);
  for (let index = 0; index < queue.length; index += 1) {
    for (const neighborId of adjacency.get(queue[index]) || []) {
      if (reachable.has(neighborId)) continue;
      reachable.add(neighborId);
      queue.push(neighborId);
    }
  }
  return reachable;
}

function connectedPoolPeople(data) {
  const people = Array.isArray(data.people) ? data.people : [];
  const reachable = reachableFromActive(people, buildAdjacency(people));
  return people.filter(person => person.pool && reachable.has(String(person.id)));
}

function updateMetadata(data, remainingPoolCount) {
  data.metadata ||= {};
  const existing = Array.isArray(data.metadata.notes) ? data.metadata.notes : [];
  data.metadata.notes = existing.filter(note =>
    !obsoleteNoteFragments.some(fragment => String(note).includes(fragment))
  );
  const note = `V5: Alle über Eltern-, Kind- oder Partnerbeziehungen an den aktiven Stammbaum angeschlossenen Personen sind aktiv. Im Vorrat bleiben ${remainingPoolCount} derzeit nicht angeschlossene Arbeitszweig-Personen; confidence kennzeichnet die Qualität beziehungsweise Vollständigkeit der Nachweise.`;
  if (!data.metadata.notes.includes(note)) data.metadata.notes.push(note);
}

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const files = args.filter(argument => argument !== '--check');
if (files.length !== 1) {
  console.error('Usage: node scripts/activate-connected-v5-branches.cjs [--check] <v5-tree.json>');
  process.exit(2);
}

const file = files[0];
const source = fs.readFileSync(file, 'utf8');
const newline = source.includes('\r\n') ? '\r\n' : '\n';
const data = JSON.parse(source);
const candidates = connectedPoolPeople(data);

console.log(`${file}: ${candidates.length} verknüpfte Vorratsperson(en) ${checkOnly ? 'gefunden' : 'aktiviert'}`);
if (checkOnly) process.exit(candidates.length ? 1 : 0);

for (const person of candidates) person.pool = false;
const remainingPoolCount = data.people.filter(person => person.pool).length;
updateMetadata(data, remainingPoolCount);

let output = `${JSON.stringify(data, null, 2)}\n`;
if (newline === '\r\n') output = output.replace(/\n/g, '\r\n');
fs.writeFileSync(file, output, 'utf8');
console.log(`${data.people.length - remainingPoolCount} aktiv, ${remainingPoolCount} im Vorrat`);
