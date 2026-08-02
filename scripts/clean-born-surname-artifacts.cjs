const fs = require('node:fs');
const path = require('node:path');

const defaultFiles = [
  'familienbuch_bodensteiner_full_extension_v4.json',
  'stammbaum_mit_familienbuch_full_v4.json',
  'stammbaum_mit_familienbuch_full_v5_bereinigt.json'
];
const bornSentence = /\s*\.\s*(?:He|She) was(?:\s+Descendants of\s*:\s*Page\s+\d+\s+of\s+\d+\s+Joseph Bodensteiner)?\s+born\s*$/i;
const pageHeader = /\s*Descendants of\s*:\s*Page\s+\d+\s+of\s+\d+\s+Joseph Bodensteiner\s*/gi;
const locationSuffix = /^(.*?)\s+in\s+([^,]+,\s*[^,]+,\s*.+)$/i;
const dateSuffix = /^(.*?)\s+((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4})$/i;

function cleanWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function splitPersonName(name) {
  const words = cleanWhitespace(name).split(' ').filter(Boolean);
  return {
    firstName: words.slice(0, -1).join(' '),
    lastName: words.at(-1) || ''
  };
}

function appendAuditNote(person, message) {
  const note = String(person.note || '').trim();
  if (note.includes(message)) return;
  person.note = [note, `[Namensbereinigung] ${message}`].filter(Boolean).join('\n');
}

function cleanBornSurnameArtifact(person) {
  if (String(person.lastName || '').trim().toLowerCase() !== 'born' || !bornSentence.test(String(person.name || ''))) {
    return null;
  }

  const before = {
    name: person.name,
    firstName: person.firstName,
    lastName: person.lastName,
    location: person.location,
    note: person.note
  };
  let cleanName = cleanWhitespace(String(person.name).replace(bornSentence, '').replace(pageHeader, ' '));
  let extractedLocation = '';
  let unassignedDate = '';

  const locationMatch = cleanName.match(locationSuffix);
  if (locationMatch) {
    cleanName = cleanWhitespace(locationMatch[1]);
    extractedLocation = cleanWhitespace(locationMatch[2]);
    if (!String(person.location || '').trim()) person.location = extractedLocation;
    else if (cleanWhitespace(person.location) !== extractedLocation) {
      appendAuditNote(person, `Ortsfragment aus Namensfeld: „${extractedLocation}“.`);
    }
  }

  const dateMatch = cleanName.match(dateSuffix);
  if (dateMatch) {
    cleanName = cleanWhitespace(dateMatch[1]);
    unassignedDate = cleanWhitespace(dateMatch[2]);
    appendAuditNote(person, `Nicht eindeutig zugeordnetes Datum aus Namensfeld: „${unassignedDate}“.`);
  }

  const parsed = splitPersonName(cleanName);
  person.name = cleanName;
  person.firstName = parsed.firstName;
  person.lastName = parsed.lastName;

  return {
    id: String(person.id || ''),
    before,
    after: {
      name: person.name,
      firstName: person.firstName,
      lastName: person.lastName,
      location: person.location,
      note: person.note
    },
    extractedLocation,
    unassignedDate
  };
}

function analyzeTree(data) {
  const people = Array.isArray(data?.people) ? data.people : [];
  return {
    artifacts: people.filter(person => bornSentence.test(String(person.name || ''))),
    invalidBornSurnames: people.filter(person =>
      String(person.lastName || '').trim().toLowerCase() === 'born'
      && !/\bBorn$/i.test(cleanWhitespace(person.name))
    ),
    genuineBornSurnames: people.filter(person =>
      String(person.lastName || '').trim().toLowerCase() === 'born'
      && /\bBorn$/i.test(cleanWhitespace(person.name))
    )
  };
}

function processFile(file, { check }) {
  const absolute = path.resolve(file);
  const data = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  const changes = [];
  for (const person of data.people || []) {
    const change = cleanBornSurnameArtifact(person);
    if (change) changes.push(change);
  }
  const analysis = analyzeTree(data);
  if (!check && changes.length) fs.writeFileSync(absolute, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return {
    file: path.basename(file),
    changed: changes.length,
    locationsRecovered: changes.filter(change => change.extractedLocation).length,
    ambiguousDatesPreserved: changes.filter(change => change.unassignedDate).length,
    remainingArtifacts: analysis.artifacts.length,
    invalidBornSurnames: analysis.invalidBornSurnames.length,
    genuineBornSurnames: analysis.genuineBornSurnames.map(person => ({ id: person.id, name: person.name }))
  };
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const files = args.filter(arg => arg !== '--check');
  const targets = files.length ? files : defaultFiles.filter(file => fs.existsSync(file));
  if (!targets.length) throw new Error('Keine Familienbuch-JSON-Datei gefunden.');
  const report = targets.map(file => processFile(file, { check }));
  console.log(JSON.stringify({ mode: check ? 'check' : 'write', files: report }, null, 2));
  if (check && report.some(item => item.changed || item.remainingArtifacts || item.invalidBornSurnames)) {
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  analyzeTree,
  cleanBornSurnameArtifact,
  splitPersonName
};
