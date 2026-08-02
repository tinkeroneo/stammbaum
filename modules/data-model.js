export function uniqueIds(ids) {
  return [...new Set((ids || []).map(String).filter(Boolean))];
}

export function normalizeImportedPositions(people) {
  const positioned = people.filter(person => Number.isFinite(person.x) && Number.isFinite(person.y));
  if (positioned.length < 20) return;
  const xs = positioned.map(person => person.x);
  const ys = positioned.map(person => person.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  if (!(spanX > 30000 && spanX / spanY > 18)) return;

  const targetWidth = Math.max(9000, Math.min(24000, Math.round(Math.sqrt(positioned.length) * 420)));
  const targetHeight = Math.max(2200, Math.min(9000, Math.round(targetWidth * 0.42)));
  positioned.forEach(person => {
    person.x = Math.round(220 + ((person.x - minX) / spanX) * targetWidth);
    person.y = Math.round(180 + ((person.y - minY) / spanY) * targetHeight);
  });
}

export function normalizeTreeData(input, {
  fallback = { people: [] },
  normalizePositions = true
} = {}) {
  const data = input && Array.isArray(input.people) ? input : structuredClone(fallback);
  data.people = data.people.map((person, index) => {
    const name = String(person.name || 'Ohne Name');
    const firstName = String(person.firstName || person.vorname || '').trim();
    const rawBirthName = String(person.birthName || person.birth_name || '').trim();
    const lastName = String(person.lastName || person.nachname || '').trim() || rawBirthName;
    const nickname = String(person.nickname || person.ruename || '').trim();
    const explicitName = firstName || lastName ? `${firstName} ${lastName}`.trim() : name;
    const partners = uniqueIds([
      ...(Array.isArray(person.partners) ? person.partners : []),
      String(person.partner || '')
    ]);
    const partnerDetails = Object.fromEntries(
      Object.entries(person.partnerDetails || person.partner_details || {}).map(([id, details]) => [
        String(id),
        { married: String(details?.married || details?.marriageDate || details?.heiratsdatum || '') }
      ])
    );
    const confidence = ['high', 'medium', 'low'].includes(String(person.confidence || '').toLowerCase())
      ? String(person.confidence).toLowerCase()
      : 'high';
    const mentions = (Array.isArray(person.mentions) ? person.mentions : Array.isArray(person.sources) ? person.sources : [])
      .map(item => ({
        title: String(item?.title || item?.name || ''),
        date: String(item?.date || item?.datum || ''),
        link: String(item?.link || item?.url || '')
      }))
      .filter(item => item.title || item.date || item.link);
    return {
      id: String(person.id || `p${index + 1}`),
      name: explicitName || name,
      firstName: firstName || (name.split(/\s+/).slice(0, -1).join(' ') || name),
      lastName: lastName || (name.split(/\s+/).slice(-1).join(' ') || ''),
      nickname,
      born: String(person.born || ''),
      died: String(person.died || ''),
      birthName: rawBirthName,
      occupation: String(person.occupation || person.beruf || ''),
      religion: String(person.religion || person.faith || person.glaubensrichtung || ''),
      location: String(person.location || person.ort || ''),
      link: String(person.link || person.url || ''),
      image: String(person.image || person.photo || person.picture || ''),
      mentions,
      pool: person.pool === true || person.inPool === true || person.status === 'pool',
      note: String(person.note || ''),
      confidence,
      x: Number.isFinite(+person.x) ? +person.x : 200 + index * 40,
      y: Number.isFinite(+person.y) ? +person.y : 200 + index * 40,
      parents: uniqueIds(Array.isArray(person.parents) ? person.parents : []),
      partner: partners[0] || '',
      partners,
      partnerDetails
    };
  });
  if (normalizePositions) normalizeImportedPositions(data.people);
  data.rootIds = uniqueIds([
    ...(Array.isArray(data.rootIds) ? data.rootIds : []),
    data.rootId,
    data.mainRootId,
    data.hauptwurzel
  ]).filter(id => data.people.some(person => person.id === id)).slice(0, 2);
  delete data.rootId;
  return data;
}

export const presumedLivingAgeLimit = 110;

function yearFromLifeDate(value) {
  const match = String(value || '').match(/(?:^|\D)(\d{4})(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

export function classifyPresumedLiving(person, { asOfYear = new Date().getUTCFullYear() } = {}) {
  if (String(person?.died || '').trim()) {
    return { presumedLiving: false, reason: 'death-recorded', birthYear: yearFromLifeDate(person?.born) };
  }
  const birthYear = yearFromLifeDate(person?.born);
  if (birthYear && asOfYear - birthYear >= presumedLivingAgeLimit) {
    return { presumedLiving: false, reason: 'age-at-least-110', birthYear };
  }
  return {
    presumedLiving: true,
    reason: birthYear ? 'younger-than-110-no-death' : 'birth-unknown-no-death',
    birthYear
  };
}

export function createPrivacyExport(source, {
  includeImages = true,
  privacyEnabled = false,
  shortenLifeDates = true,
  removeNotesAndSources = true,
  removeImagesForLiving = true,
  asOfYear = new Date().getUTCFullYear()
} = {}) {
  const output = structuredClone(source);
  const preview = {
    asOfYear,
    totalPeople: output.people?.length || 0,
    presumedLiving: 0,
    affectedPeople: 0,
    shortenedDates: 0,
    removedNotes: 0,
    removedSources: 0,
    removedLinks: 0,
    removedImages: 0
  };
  output.people = (output.people || []).map(person => {
    const classification = classifyPresumedLiving(person, { asOfYear });
    if (classification.presumedLiving) preview.presumedLiving += 1;
    let affected = false;
    if (privacyEnabled && classification.presumedLiving) {
      if (shortenLifeDates && person.born && person.born !== String(classification.birthYear || '')) {
        person.born = classification.birthYear ? String(classification.birthYear) : '';
        preview.shortenedDates += 1;
        affected = true;
      }
      if (removeNotesAndSources) {
        if (String(person.note || '').trim()) {
          person.note = '';
          preview.removedNotes += 1;
          affected = true;
        }
        if (Array.isArray(person.mentions) && person.mentions.length) {
          preview.removedSources += person.mentions.length;
          person.mentions = [];
          affected = true;
        }
        if (String(person.link || '').trim()) {
          person.link = '';
          preview.removedLinks += 1;
          affected = true;
        }
      }
      if (removeImagesForLiving && person.image) {
        person.image = '';
        preview.removedImages += 1;
        affected = true;
      }
    }
    if (!includeImages && person.image) {
      person.image = '';
      preview.removedImages += 1;
      affected = true;
    }
    if (affected) preview.affectedPeople += 1;
    return person;
  });
  return { data: output, preview };
}
