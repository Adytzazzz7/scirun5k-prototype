(() => {
  const KEY = 'scirun.pendingSession';

  function load(storage = localStorage) {
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session || !Number.isInteger(session.level) || !Number.isFinite(session.completion)
        || !Number.isFinite(session.elapsed) || typeof session.completedNaturally !== 'boolean') {
        storage.removeItem(KEY);
        return null;
      }
      return session;
    } catch {
      storage.removeItem(KEY);
      return null;
    }
  }

  function save(session, storage = localStorage) {
    storage.setItem(KEY, JSON.stringify(session));
  }

  function clear(storage = localStorage) {
    storage.removeItem(KEY);
  }

  globalThis.SciRunPendingSessionStore = { load, save, clear };
})();
