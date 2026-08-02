const fs = require('node:fs');

const months = new Map([
  ['january', 1], ['february', 2], ['march', 3], ['april', 4],
  ['may', 5], ['june', 6], ['july', 7], ['august', 8],
  ['september', 9], ['october', 10], ['november', 11], ['december', 12]
]);

const metadataNote = 'Datumsfelder für die Anwendung normalisiert; unsichere Originalangaben wurden, soweit vorhanden, im Personenhinweis erhalten.';

function pad(value) {
  return String(value).padStart(2, '0');
}

function validMonth(value) {
  return Number.isInteger(value) && value >= 1 && value <= 12;
}

function validDay(value) {
  return Number.isInteger(value) && value >= 1 && value <= 31;
}

function normalizedNumericDate(text) {
  let match = text.match(/^(\d{4})$/);
  if (match) return match[1];

  match = text.match(/^(\d{1,2})[.\/-](\d{4})$/);
  if (match && validMonth(Number(match[1]))) return `${pad(match[1])}.${match[2]}`;

  match = text.match(/^(\d{1,2})[.\/-](\d{1,2})\.?$/);
  if (match && validDay(Number(match[1])) && validMonth(Number(match[2]))) {
    return `${pad(match[1])}.${pad(match[2])}.`;
  }

  match = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (match && validDay(Number(match[1])) && validMonth(Number(match[2]))) {
    return `${pad(match[1])}.${pad(match[2])}.${match[3]}`;
  }

  match = text.match(/^(\d{4})[.\/-](\d{1,2})(?:[.\/-](\d{1,2}))?$/);
  if (match && validMonth(Number(match[2])) && (!match[3] || validDay(Number(match[3])))) {
    return match[3]
      ? `${pad(match[3])}.${pad(match[2])}.${match[1]}`
      : `${pad(match[2])}.${match[1]}`;
  }
  return null;
}

function normalizedEnglishDate(text) {
  let match = text.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (match) {
    const month = months.get(match[1].toLowerCase());
    const day = Number(match[2]);
    if (month && validDay(day)) return `${pad(day)}.${pad(month)}.${match[3]}`;
  }

  match = text.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (match) {
    const month = months.get(match[1].toLowerCase());
    if (month) return `${pad(month)}.${match[2]}`;
  }
  return null;
}

function normalizeDate(rawValue) {
  const original = String(rawValue || '').trim();
  if (!original) return { value: '', changed: false, uncertain: false };

  const numeric = normalizedNumericDate(original);
  if (numeric) return { value: numeric, changed: numeric !== original, uncertain: false };

  const exactEnglish = normalizedEnglishDate(original);
  if (exactEnglish) return { value: exactEnglish, changed: true, uncertain: false };

  let match = original.match(/^About\s+(.+)$/i);
  if (match) {
    const value = normalizedEnglishDate(match[1]) || normalizedNumericDate(match[1]);
    if (value) return { value, changed: true, uncertain: true };
  }

  match = original.match(/^Before\s+(.+)$/i);
  if (match) {
    const value = normalizedEnglishDate(match[1]) || normalizedNumericDate(match[1]);
    if (value) return { value, changed: true, uncertain: true };
  }

  match = original.match(/^Between\s+(\d{4})\s+and\s+(\d{4})$/i);
  if (match) return { value: match[1], changed: true, uncertain: true };

  return { value: original, changed: false, uncertain: false, unresolved: true };
}

function appendNormalizationNote(person, label, original) {
  const addition = `[Datumsnormalisierung] ${label} ursprünglich: „${original}“.`;
  const existing = String(person.note || '').trim();
  if (existing.includes(addition)) return false;
  person.note = existing ? `${existing}\n${addition}` : addition;
  return true;
}

function normalizePerson(person, summary) {
  for (const [field, label] of [['born', 'Geburtsdatum'], ['died', 'Sterbedatum']]) {
    const original = String(person[field] || '').trim();
    if (!original) continue;

    if (field === 'died' && original === 'Voit' && !String(person.birthName || '').trim()) {
      person.died = '';
      person.birthName = 'Voit';
      appendNormalizationNote(person, 'Feldwert im Sterbedatum', original);
      summary.movedFieldValues += 1;
      summary.changed += 1;
      continue;
    }

    const result = normalizeDate(original);
    if (result.unresolved) {
      summary.unresolved.push({ personId: String(person.id || ''), field, value: original });
      continue;
    }
    if (!result.changed) continue;
    person[field] = result.value;
    summary.changed += 1;
    if (result.uncertain) {
      appendNormalizationNote(person, label, original);
      summary.uncertain += 1;
    }
  }

  for (const [partnerId, details] of Object.entries(person.partnerDetails || {})) {
    if (!details || typeof details !== 'object') continue;
    const original = String(details.married || '').trim();
    if (!original) continue;
    const result = normalizeDate(original);
    if (result.unresolved) {
      summary.unresolved.push({ personId: String(person.id || ''), field: `partnerDetails.${partnerId}.married`, value: original });
      continue;
    }
    if (!result.changed) continue;
    details.married = result.value;
    summary.changed += 1;
    if (result.uncertain) {
      appendNormalizationNote(person, `Heiratsdatum mit ${partnerId}`, original);
      summary.uncertain += 1;
    }
  }
}

function normalizeFile(file, { checkOnly }) {
  const source = fs.readFileSync(file, 'utf8');
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const data = JSON.parse(source);
  const summary = { file, changed: 0, uncertain: 0, movedFieldValues: 0, unresolved: [] };

  for (const person of data.people || []) normalizePerson(person, summary);

  if (summary.changed > 0) {
    data.metadata ||= {};
    data.metadata.notes = Array.isArray(data.metadata.notes) ? data.metadata.notes : [];
    if (!data.metadata.notes.includes(metadataNote)) data.metadata.notes.push(metadataNote);
  }

  if (!checkOnly && summary.changed > 0) {
    let output = `${JSON.stringify(data, null, 2)}\n`;
    if (newline === '\r\n') output = output.replace(/\n/g, '\r\n');
    fs.writeFileSync(file, output, 'utf8');
  }
  return summary;
}

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const files = args.filter(arg => arg !== '--check');
if (!files.length) {
  console.error('Usage: node scripts/normalize-genealogy-dates.cjs [--check] <tree.json> [...]');
  process.exit(2);
}

const summaries = files.map(file => normalizeFile(file, { checkOnly }));
for (const summary of summaries) {
  console.log(`${summary.file}: ${summary.changed} geändert, ${summary.uncertain} unsichere Originalangaben erhalten, ${summary.movedFieldValues} Feldwert verschoben, ${summary.unresolved.length} ungeklärt`);
  for (const issue of summary.unresolved) console.log(`  UNGEKLÄRT ${issue.personId} ${issue.field}: ${JSON.stringify(issue.value)}`);
}

if (summaries.some(summary => summary.unresolved.length > 0 || (checkOnly && summary.changed > 0))) process.exit(1);
