export function readJsonStorage(storage, key, fallback) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function serializeTree(value, space = 0) {
  return JSON.stringify(value, null, space);
}
