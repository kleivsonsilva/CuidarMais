// Fila de gravação com controle de versão: duas abas não sobrescrevem dados silenciosamente.
export function createCloudStore({read, commit, notify, backup, clearBackup, delay = 500}) {
  let revision = 0, pending = null, running = null, timer = null, stopped = false, conflict = false;
  async function load() {
    const record = await read();
    revision = record?.revision || 0;
    return record?.state || null;
  }
  function enqueue(state) {
    if (stopped) return;
    pending = JSON.parse(JSON.stringify(state));
    backup(pending);
    notify('pending');
    clearTimeout(timer);
    timer = setTimeout(() => flush().catch(() => {}), delay);
  }
  async function flush() {
    clearTimeout(timer);
    if (running) { await running; if (pending) return flush(); return; }
    if (stopped || !pending) return;
    if (conflict) throw Object.assign(new Error('Dados alterados em outro aparelho.'), {code:'cloud/conflict'});
    const batch = pending;
    pending = null;
    notify('saving');
    running = (async () => {
      try {
        revision = await commit(batch, revision);
        if (!pending) clearBackup();
        notify(pending ? 'pending' : 'saved');
      } catch (error) {
        pending = pending || batch;
        backup(pending);
        conflict = error.code === 'cloud/conflict';
        notify(conflict ? 'conflict' : 'error', error);
        throw error;
      }
    })();
    try { await running; } finally { running = null; }
    if (pending) return flush();
  }
  function accept(record) {
    if (stopped || pending || running || !record || record.revision <= revision) return null;
    revision = record.revision;
    return record.state;
  }
  function stop() { stopped = true; clearTimeout(timer); }
  return {load, enqueue, flush, accept, stop, isDirty:() => !!(pending || running), isConflicted:() => conflict};
}
