export function startApp(root = document.documentElement) {
  root.dataset.appStartup = 'ready';
  return true;
}
