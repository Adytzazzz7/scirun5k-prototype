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
      try { storage.removeItem(KEY); } catch {}
      return null;
    }
  }

  function save(session, storage = localStorage) {
    try {
      storage.setItem(KEY, JSON.stringify(session));
      return true;
    } catch {
      return false;
    }
  }

  function clear(storage = localStorage) {
    try {
      storage.removeItem(KEY);
      return true;
    } catch {
      return false;
    }
  }

  globalThis.SciRunPendingSessionStore = { load, save, clear };
})();
