export function groupRowsByTolerance(values, tolerance = 96) {
  const rows = [];
  [...values].sort((a, b) => a - b).forEach(value => {
    const last = rows[rows.length - 1];
    if (!last || Math.abs(value - last.center) > tolerance) {
      rows.push({ center: value, values: [value] });
      return;
    }
    last.values.push(value);
    last.center = last.values.reduce((sum, item) => sum + item, 0) / last.values.length;
  });
  return rows;
}
