export function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

export function reconcileKeyedChildren(parent, desiredChildren) {
  const desired = new Set(desiredChildren);
  let cursor = parent.firstElementChild;
  desiredChildren.forEach(child => {
    if (child === cursor) {
      cursor = cursor.nextElementSibling;
      return;
    }
    parent.insertBefore(child, cursor);
  });
  [...parent.children].forEach(child => {
    if (!desired.has(child)) child.remove();
  });
}
