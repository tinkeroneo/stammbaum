function normalizedFamilyLabel(person) {
  const explicit = String(person?.lastName || person?.birthName || '').trim();
  if (explicit) return explicit;
  const parts = String(person?.name || '').trim().split(/\s+/).filter(Boolean);
  return parts.at(-1) || 'Unbekannt';
}

function normalizedFamilyKey(person) {
  return normalizedFamilyLabel(person).toLocaleLowerCase('de-DE');
}

function uniqueRelationIds(person) {
  return [...new Set([
    ...(person?.parents || []),
    ...(person?.partners || []),
    person?.partner
  ].map(String).filter(Boolean))];
}

function birthYear(person) {
  const match = String(person?.born || '').match(/(?:^|\D)(\d{4})(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

function bucketLabelFor(key) {
  const first = String(key || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase();
  if (first >= 'A' && first <= 'F') return 'Weitere A–F';
  if (first >= 'G' && first <= 'L') return 'Weitere G–L';
  if (first >= 'M' && first <= 'R') return 'Weitere M–R';
  if (first >= 'S' && first <= 'Z') return 'Weitere S–Z';
  return 'Weitere Familien';
}

function clusterPeriod(members) {
  const years = members.map(birthYear).filter(Number.isFinite);
  if (!years.length) return 'Zeitraum offen';
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? String(min) : `${min}–${max}`;
}

function safeId(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'unbekannt';
}

export function buildGalaxyLayout(people, {
  rootIds = [],
  maxNamedClusters = 48,
  centerX = 12000,
  centerY = 12000
} = {}) {
  const activePeople = (people || []).filter(person => !person.pool);
  const byId = new Map(activePeople.map(person => [String(person.id), person]));
  const rawGroups = new Map();
  for (const person of activePeople) {
    const key = normalizedFamilyKey(person);
    if (!rawGroups.has(key)) rawGroups.set(key, { key, label: normalizedFamilyLabel(person), members: [] });
    rawGroups.get(key).members.push(person);
  }

  const rootFamilyKeys = new Set(rootIds.map(id => byId.get(String(id))).filter(Boolean).map(normalizedFamilyKey));
  const ranked = [...rawGroups.values()].sort((a, b) =>
    Number(rootFamilyKeys.has(b.key)) - Number(rootFamilyKeys.has(a.key))
    || b.members.length - a.members.length
    || a.label.localeCompare(b.label, 'de')
  );
  const retainedKeys = new Set(ranked.slice(0, Math.max(1, maxNamedClusters)).map(group => group.key));
  rootFamilyKeys.forEach(key => retainedKeys.add(key));

  const grouped = new Map();
  for (const group of ranked) {
    const retained = retainedKeys.has(group.key);
    const label = retained ? group.label : bucketLabelFor(group.key);
    const id = retained ? `family:${group.key}` : `bucket:${label}`;
    if (!grouped.has(id)) grouped.set(id, {
      id,
      testId: safeId(retained ? group.key : label),
      key: retained ? group.key : id,
      label,
      members: [],
      familyKeys: new Set(),
      aggregated: !retained
    });
    const target = grouped.get(id);
    target.members.push(...group.members);
    target.familyKeys.add(group.key);
  }

  const personToCluster = new Map();
  const clusters = [...grouped.values()].map(cluster => {
    cluster.members.sort((a, b) => (birthYear(a) ?? Infinity) - (birthYear(b) ?? Infinity)
      || normalizedFamilyLabel(a).localeCompare(normalizedFamilyLabel(b), 'de')
      || String(a.name || '').localeCompare(String(b.name || ''), 'de'));
    cluster.members.forEach(person => personToCluster.set(String(person.id), cluster.id));
    return {
      ...cluster,
      familyKeys: [...cluster.familyKeys],
      memberIds: cluster.members.map(person => String(person.id)),
      count: cluster.members.length,
      period: clusterPeriod(cluster.members),
      representativeId: String(cluster.members[0]?.id || ''),
      x: centerX,
      y: centerY,
      radius: Math.min(460, 150 + Math.sqrt(cluster.members.length) * 34)
    };
  });
  const clusterById = new Map(clusters.map(cluster => [cluster.id, cluster]));

  const edgeWeights = new Map();
  for (const source of activePeople) {
    const from = personToCluster.get(String(source.id));
    for (const relationId of uniqueRelationIds(source)) {
      const to = personToCluster.get(relationId);
      if (!from || !to || from === to) continue;
      const pair = [from, to].sort();
      const key = pair.join('|');
      edgeWeights.set(key, (edgeWeights.get(key) || 0) + 1);
    }
  }
  const edges = [...edgeWeights.entries()].map(([key, weight]) => {
    const [from, to] = key.split('|');
    return { from, to, weight: Math.max(1, Math.ceil(weight / 2)) };
  });

  const adjacency = new Map(clusters.map(cluster => [cluster.id, new Set()]));
  edges.forEach(edge => {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  });
  const firstRootId = rootIds.map(id => personToCluster.get(String(id))).find(Boolean)
    || clusters[0]?.id || '';
  const distance = new Map(firstRootId ? [[firstRootId, 0]] : []);
  const queue = firstRootId ? [firstRootId] : [];
  while (queue.length) {
    const current = queue.shift();
    for (const next of adjacency.get(current) || []) {
      if (distance.has(next)) continue;
      distance.set(next, (distance.get(current) || 0) + 1);
      queue.push(next);
    }
  }
  const connectedMax = Math.max(0, ...distance.values());
  clusters.forEach(cluster => {
    if (!distance.has(cluster.id)) distance.set(cluster.id, connectedMax + 1);
  });
  const orderedClusters = [...clusters].sort((a, b) =>
    (distance.get(a.id) || 0) - (distance.get(b.id) || 0)
    || b.count - a.count
    || a.label.localeCompare(b.label, 'de')
  );
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  orderedClusters.forEach((cluster, index) => {
    if (index === 0) {
      cluster.x = centerX;
      cluster.y = centerY;
      return;
    }
    const radius = 1150 * (Math.sqrt(index) + 1.4);
    const angle = index * goldenAngle - Math.PI / 2;
    cluster.x = Math.round(centerX + Math.cos(angle) * radius);
    cluster.y = Math.round(centerY + Math.sin(angle) * radius);
  });

  const xs = clusters.map(cluster => cluster.x);
  const ys = clusters.map(cluster => cluster.y);
  const bounds = clusters.length ? {
    minX: Math.min(...xs) - 900,
    maxX: Math.max(...xs) + 900,
    minY: Math.min(...ys) - 900,
    maxY: Math.max(...ys) + 900
  } : { minX: 0, maxX: 1600, minY: 0, maxY: 1100 };

  return { clusters, clusterById, personToCluster, edges, bounds, rootClusterId: firstRootId };
}

export function buildGalaxyClusterDetail(layout, clusterId, people, { maxPeople = 160, focusPersonId = '' } = {}) {
  const cluster = layout?.clusterById?.get(clusterId);
  const byId = new Map((people || []).map(person => [String(person.id), person]));
  if (!cluster) return { ids: new Set(), positions: new Map(), omitted: 0, bounds: null };
  const members = cluster.memberIds.map(id => byId.get(id)).filter(Boolean);
  const shown = members.slice(0, maxPeople);
  const focusedPerson = byId.get(String(focusPersonId));
  if (focusedPerson && cluster.memberIds.includes(String(focusPersonId)) && !shown.includes(focusedPerson)) {
    shown[Math.max(0, shown.length - 1)] = focusedPerson;
  }
  const rows = new Map();
  for (const person of shown) {
    const year = birthYear(person);
    const bucket = year ? Math.floor(year / 25) * 25 : Infinity;
    if (!rows.has(bucket)) rows.set(bucket, []);
    rows.get(bucket).push(person);
  }
  const positions = new Map();
  const centerX = 4200;
  const topY = 900;
  const columnGap = 280;
  const rowGap = 245;
  let line = 0;
  for (const [, rowPeople] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    rowPeople.sort((a, b) => (birthYear(a) ?? Infinity) - (birthYear(b) ?? Infinity)
      || String(a.name || '').localeCompare(String(b.name || ''), 'de'));
    const maxColumns = Math.min(10, Math.max(1, Math.ceil(Math.sqrt(rowPeople.length * 1.8))));
    for (let offset = 0; offset < rowPeople.length; offset += maxColumns) {
      const slice = rowPeople.slice(offset, offset + maxColumns);
      const startX = centerX - ((slice.length - 1) * columnGap) / 2;
      slice.forEach((person, index) => {
        positions.set(String(person.id), {
          x: Math.round(startX + index * columnGap),
          y: Math.round(topY + line * rowGap)
        });
      });
      line += 1;
    }
  }
  const values = [...positions.values()];
  const bounds = values.length ? {
    minX: Math.min(...values.map(value => value.x)) - 230,
    maxX: Math.max(...values.map(value => value.x)) + 230,
    minY: Math.min(...values.map(value => value.y)) - 180,
    maxY: Math.max(...values.map(value => value.y)) + 180
  } : null;
  return {
    ids: new Set(positions.keys()),
    positions,
    omitted: Math.max(0, members.length - shown.length),
    bounds
  };
}
