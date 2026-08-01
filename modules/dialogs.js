export const dialogFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export function dialogFocusableElements(dialog, view = window) {
  if (!dialog) return [];
  return [...dialog.querySelectorAll(dialogFocusableSelector)].filter(element => {
    if (!(element instanceof HTMLElement) || element.hidden || element.closest('[hidden], .hidden')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    const style = view.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
  });
}
