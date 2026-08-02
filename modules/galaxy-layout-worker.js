import { buildGalaxyLayout } from './galaxy-layout.js';

self.addEventListener('message', event => {
  const { requestId, people, options } = event.data || {};
  try {
    const layout = buildGalaxyLayout(people, options);
    self.postMessage({ requestId, layout });
  } catch (error) {
    self.postMessage({
      requestId,
      error: error?.message || 'Familienübersicht konnte nicht berechnet werden.'
    });
  }
});
