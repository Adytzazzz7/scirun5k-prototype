(() => {
  const AUTO_ACCOUNT_KEY = 'scirun.googleBackup.accountId';
  const LAST_DIGEST_KEY = 'scirun.googleBackup.lastDigest';
  const MAX_VISIBLE_BACKUPS = 10;
  let provider = null;
  let account = null;
  let backups = [];
  let autoEnabled = false;
  let busy = false;
  let pendingUpload = false;
  let uploadTimer = null;
  let visibleCount = 10;

  const el = id => document.getElementById(id);
  const label = (ro, en) => lang === 'en' ? en : ro;
  const accountId = value => typeof value === 'string' && value.length > 0 ? value : null;

  function status(message) {
    const target = el('googleBackupStatus');
    if (target) target.textContent = message;
  }

  function error(message) {
    const target = el('googleBackupError');
    if (target) target.textContent = message || '';
    if (message && el('onboarding')?.classList.contains('active')) toast(message);
  }

  function isReadyForBackup() {
    return Boolean(state?.profile) && !stateStorageReadFailed && !stateStorageCorrupt
      && !currentTimer && !pendingSession;
  }

  function updateControls() {
    const connected = Boolean(account);
    const nativeAvailable = Boolean(provider);
    const buttons = {
      googleConnect: nativeAvailable && !busy,
      googleSave: connected && !busy && isReadyForBackup(),
      googleRefresh: connected && !busy,
      googleDisconnect: connected && !busy
    };
    for (const [id, enabled] of Object.entries(buttons)) {
      const button = el(id);
      if (!button) continue;
      button.disabled = !enabled;
      if (id !== 'googleConnect') button.classList.toggle('hidden', !connected);
    }
    const connectButton = el('googleConnect');
    if (connectButton) connectButton.textContent = connected
      ? label('Reconectează Google', 'Reconnect Google')
      : label('Conectează contul Google', 'Connect Google account');
    const setupButton = el('googleSetupRestore');
    if (setupButton) {
      setupButton.disabled = !nativeAvailable || busy;
      setupButton.textContent = connected
        ? label('Vezi copiile Google', 'View Google backups')
        : label('Restaurează din Google', 'Restore from Google');
    }
  }

  function formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return label('Dată necunoscută', 'Unknown date');
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ro-RO', {
      dateStyle: 'medium', timeStyle: 'short'
    }).format(date);
  }

  function renderBackups() {
    for (const target of [el('googleBackupList'), el('googleSetupBackups')].filter(Boolean)) {
      target.replaceChildren();
      if (!account) continue;
      if (backups.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'small muted';
        empty.textContent = label('Încă nu ai copii în Google Drive.', 'No Google Drive backups yet.');
        target.append(empty);
        continue;
      }
      const heading = document.createElement('p');
      heading.className = 'small muted';
      heading.textContent = label('Copii salvate · cele mai recente primele', 'Saved copies · newest first');
      target.append(heading);
      for (const item of backups.slice(0, visibleCount)) {
        const row = document.createElement('div');
        row.className = 'google-backup-row';
        const info = document.createElement('span');
        info.textContent = formatDate(item.modifiedTime);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn ghost';
        button.textContent = label('Restaurează', 'Restore');
        button.setAttribute('aria-label', label(
          `Restaurează copia din ${formatDate(item.modifiedTime)}`,
          `Restore backup from ${formatDate(item.modifiedTime)}`
        ));
        button.disabled = busy;
        button.addEventListener('click', () => restore(item.id));
        row.append(info, button);
        target.append(row);
      }
      if (backups.length > visibleCount) {
        const older = document.createElement('button');
        older.type = 'button';
        older.className = 'text-button';
        older.textContent = label('Arată copii mai vechi', 'Show older backups');
        older.addEventListener('click', () => {
          visibleCount = Math.min(backups.length, visibleCount + MAX_VISIBLE_BACKUPS);
          renderBackups();
        });
        target.append(older);
      }
    }
  }

  function render() {
    updateControls();
    renderBackups();
    if (!provider) {
      status(label('Salvarea Google este disponibilă în aplicația Android sau iOS.',
        'Google backup is available in the Android or iOS app.'));
    } else if (account) {
      const identity = account.email || account.displayName || label('contul Google', 'Google account');
      const mode = autoEnabled
        ? label('Copiile se actualizează automat când ești online.', 'Backups update automatically when you are online.')
        : label('Alege o copie de restaurat sau salvează datele de pe acest dispozitiv.',
          'Restore a copy or save the data from this device.');
      status(`${identity} · ${mode}`);
    } else {
      status(label('Conectează contul Google pentru copii private în Drive. Datele rămân disponibile offline.',
        'Connect your Google account for private Drive backups. Your data remains available offline.'));
    }
    const setupStatus = el('googleSetupStatus');
    if (setupStatus) setupStatus.textContent = !provider
      ? label('Disponibil în aplicația mobilă după configurarea Google.',
        'Available in the mobile app after Google setup.')
      : account
        ? label('Alege copia pe care vrei să o restaurezi.', 'Choose a backup to restore.')
        : label('Conectează contul Google pentru a vedea copiile tale.',
          'Connect your Google account to see your backups.');
  }

  async function digest(text) {
    const bytes = new TextEncoder().encode(text);
    if (!globalThis.crypto?.subtle) return null;
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function createLocalSnapshot() {
    if (!isReadyForBackup()) throw new Error('LOCAL_NOT_READY');
    const json = JSON.stringify(SciRunStateBackup.createBundle(
      state, backupPreferences(), null, null, Date.now()
    ));
    SciRunStateBackup.parseBundle(json, STAGES.length);
    return json;
  }

  function autoAccountMatches() {
    return accountId(account?.accountId) !== null
      && storageGet(AUTO_ACCOUNT_KEY) === account.accountId;
  }

  async function refresh() {
    if (!provider || !account || busy) return;
    busy = true;
    error('');
    updateControls();
    try {
      const result = await provider.listBackups();
      const list = Array.isArray(result?.backups) ? result.backups : [];
      backups = list.filter(item => item && typeof item.id === 'string' && item.id.length > 0)
        .sort((left, right) => Date.parse(right.modifiedTime || 0) - Date.parse(left.modifiedTime || 0));
      renderBackups();
    } catch {
      error(label('Nu am putut citi copiile din Google Drive. Încearcă din nou sau reconectează contul.',
        'Could not read Google Drive backups. Try again or reconnect your account.'));
    } finally {
      busy = false;
      render();
      if (pendingUpload && autoEnabled) scheduleUpload();
    }
  }

  async function save({ automatic = false } = {}) {
    if (!provider || !account || busy) {
      if (automatic && account) pendingUpload = true;
      return false;
    }
    if (!isReadyForBackup()) {
      if (!automatic) error(label('Încheie sesiunea și feedbackul înainte de salvarea în Google.',
        'Finish the workout and feedback before saving to Google.'));
      return false;
    }
    if (navigator.onLine === false) {
      if (automatic) pendingUpload = true;
      else error(label('Ești offline. Datele rămân pe telefon; salvează în Google când revii online.',
        'You are offline. Data remains on this device; save to Google when online.'));
      return false;
    }
    let json;
    try { json = createLocalSnapshot(); }
    catch {
      error(label('Datele locale nu pot fi validate. Exportă o copie brută înainte de orice restaurare.',
        'Local data could not be validated. Export a raw copy before restoring anything.'));
      return false;
    }
    const fingerprint = await digest(json);
    if (automatic && fingerprint && fingerprint === storageGet(LAST_DIGEST_KEY) && autoAccountMatches()) return true;
    busy = true;
    pendingUpload = false;
    let uploaded = false;
    error('');
    updateControls();
    try {
      await provider.uploadBackup({ json });
      uploaded = true;
      storageSet(AUTO_ACCOUNT_KEY, account.accountId || '');
      if (fingerprint) storageSet(LAST_DIGEST_KEY, fingerprint);
      autoEnabled = autoAccountMatches();
      if (!automatic) toast(label('Copia a fost salvată în Google Drive.', 'Backup saved to Google Drive.'), 'success');
      await refreshAfterUpload();
      return true;
    } catch {
      pendingUpload = automatic;
      error(label('Salvarea în Google a eșuat. Datele locale sunt păstrate; poți încerca din nou.',
        'Google backup failed. Local data is safe; you can try again.'));
      return false;
    } finally {
      busy = false;
      render();
      if (uploaded && pendingUpload) scheduleUpload();
    }
  }

  async function refreshAfterUpload() {
    try {
      const result = await provider.listBackups();
      backups = Array.isArray(result?.backups) ? result.backups
        .filter(item => item && typeof item.id === 'string')
        .sort((left, right) => Date.parse(right.modifiedTime || 0) - Date.parse(left.modifiedTime || 0)) : backups;
    } catch { /* Upload succeeded; listing can be retried separately. */ }
  }

  async function connect() {
    if (!provider || busy) return;
    busy = true;
    error('');
    updateControls();
    try {
      const serverClientId = window.SciRunGoogleConfig?.androidServerClientId || '';
      const result = await provider.signIn({ serverClientId });
      if (!accountId(result?.accountId)) throw new Error('INVALID_ACCOUNT');
      account = result;
      backups = [];
      visibleCount = MAX_VISIBLE_BACKUPS;
      autoEnabled = autoAccountMatches();
      busy = false;
      render();
      await refresh();
      if (autoEnabled) scheduleUpload();
    } catch {
      error(label('Conectarea Google nu a reușit. Verifică setarea contului și conexiunea.',
        'Google connection failed. Check account setup and connectivity.'));
    } finally {
      busy = false;
      render();
    }
  }

  async function disconnect() {
    if (!provider || !account || busy) return;
    busy = true;
    updateControls();
    try {
      await provider.signOut();
      account = null;
      backups = [];
      autoEnabled = false;
      pendingUpload = false;
      storageRemove(AUTO_ACCOUNT_KEY);
      storageRemove(LAST_DIGEST_KEY);
      error('');
    } catch {
      error(label('Deconectarea nu a reușit. Încearcă din nou.', 'Could not disconnect. Try again.'));
    } finally {
      busy = false;
      render();
    }
  }

  async function restore(id) {
    if (!provider || !account || busy) return false;
    if (currentTimer || pendingSession) {
      error(t('importActiveSession'));
      return false;
    }
    busy = true;
    let applied = false;
    error('');
    updateControls();
    renderBackups();
    try {
      const response = await provider.downloadBackup({ id });
      const json = response?.json;
      const imported = SciRunStateBackup.parseBundle(json, STAGES.length);
      const fingerprint = await digest(json);
      const localCount = state?.history?.length || 0;
      const remoteCount = imported.state.history.length;
      const prompt = label(
        `Restaurezi copia cu ${remoteCount} antrenamente? Pe acest dispozitiv sunt ${localCount}. Datele locale actuale vor fi păstrate într-o copie de revenire.`,
        `Restore the copy with ${remoteCount} workouts? This device has ${localCount}. Current local data will be saved for rollback.`
      );
      if (!confirm(prompt)) return false;
      if (currentTimer || pendingSession) {
        error(t('importActiveSession'));
        return false;
      }
      if (!restoreImportedBackup(imported)) throw new Error('RESTORE_FAILED');
      applied = true;
      if (accountId(account.accountId)) storageSet(AUTO_ACCOUNT_KEY, account.accountId);
      if (fingerprint) storageSet(LAST_DIGEST_KEY, fingerprint);
      try { sessionStorage.setItem('scirun.importNotice', '1'); } catch {}
      window.location.reload();
      return true;
    } catch {
      error(applied
        ? label('Copia a fost restaurată, dar ecranul nu s-a reîncărcat. Repornește aplicația.',
          'Backup was restored, but the screen did not reload. Restart the app.')
        : label('Copia Google este invalidă sau restaurarea a eșuat. Istoricul local a fost păstrat.',
          'Google backup is invalid or restore failed. Local history was preserved.'));
      return false;
    } finally {
      busy = false;
      updateControls();
      renderBackups();
    }
  }

  function scheduleUpload() {
    if (!autoEnabled || !account || !provider) return;
    if (uploadTimer) clearTimeout(uploadTimer);
    uploadTimer = setTimeout(() => { uploadTimer = null; save({ automatic: true }); }, 1500);
  }

  async function init() {
    provider = window.SciRunNative?.googleBackup || null;
    for (const [id, handler] of [
      ['googleConnect', connect], ['googleSave', () => save()],
      ['googleRefresh', refresh], ['googleDisconnect', disconnect],
      ['googleSetupRestore', async () => { await connect(); }]
    ]) el(id)?.addEventListener('click', handler);
    window.addEventListener('scirun:state-saved', scheduleUpload);
    window.addEventListener('online', () => { if (autoEnabled) scheduleUpload(); });
    for (const id of ['themeToggle', 'contrastToggle', 'soundPreference',
      'vibrationPreference', 'lang-ro', 'lang-en']) {
      el(id)?.addEventListener('click', scheduleUpload);
    }
    for (const id of ['lang-ro', 'lang-en']) el(id)?.addEventListener('click', () => setTimeout(render, 0));
    render();
    if (!provider) return;
    try {
      const result = await provider.getStatus();
      if (result?.signedIn && accountId(result.accountId)) {
        account = result;
        autoEnabled = autoAccountMatches();
        render();
        await refresh();
        if (autoEnabled) scheduleUpload();
      }
    } catch {
      error(label('Starea contului Google nu poate fi verificată momentan.',
        'Google account status cannot be checked right now.'));
    }
  }

  window.SciRunGoogleBackup = Object.freeze({ init, connect, save, refresh, restore, disconnect, render });
  window.addEventListener('load', init, { once: true });
})();
