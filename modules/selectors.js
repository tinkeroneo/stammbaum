export function parseBirthValue(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  let match = text.match(/^(\d{4})$/);
  if (match) return { year: +match[1], month: 6, day: 15, precision: 'year', sort: +match[1] * 10000 + 615 };
  match = text.match(/^(\d{1,2})[.\-/](\d{4})$/);
  if (match) {
    const month = Math.max(1, Math.min(12, +match[1]));
    const year = +match[2];
    return { year, month, day: 15, precision: 'month', sort: year * 10000 + month * 100 + 15 };
  }
  match = text.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (match) {
    const day = Math.max(1, Math.min(31, +match[1]));
    const month = Math.max(1, Math.min(12, +match[2]));
    const year = +match[3];
    return { year, month, day, precision: 'day', sort: year * 10000 + month * 100 + day };
  }
  match = text.match(/^(\d{1,2})[.\-/](\d{1,2})\.?$/);
  if (match) {
    const day = Math.max(1, Math.min(31, +match[1]));
    const month = Math.max(1, Math.min(12, +match[2]));
    return { year: null, month, day, precision: 'birthday', sort: 99990000 + month * 100 + day };
  }
  match = text.match(/^(\d{4})[.\-/](\d{1,2})(?:[.\-/](\d{1,2}))?$/);
  if (match) {
    const year = +match[1];
    const month = Math.max(1, Math.min(12, +match[2]));
    const day = match[3] ? Math.max(1, Math.min(31, +match[3])) : 15;
    return { year, month, day, precision: match[3] ? 'day' : 'month', sort: year * 10000 + month * 100 + day };
  }
  return null;
}

export function buildSearchIndex(people, { nameOf, textOf }) {
  const sorted = [...people].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  return {
    sorted,
    textById: new Map(sorted.map(person => [person.id, textOf(person)]))
  };
}
