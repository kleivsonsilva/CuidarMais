// Lógica pura do PIN (sem Firebase): geração, hash, projeção do perfil e aplicação de ações.
// Versão gratuita: roda no navegador, sem Cloud Functions.
const clean = x => JSON.parse(JSON.stringify(x));
const bytes = s => new TextEncoder().encode(s).length;

export async function hashPin(pin) {
  const data = new TextEncoder().encode('cuidar-pin-v1|' + pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomBelow(n) {
  const max = Math.floor(4294967296 / n) * n, a = new Uint32Array(1);
  do { crypto.getRandomValues(a); } while (a[0] >= max);
  return a[0] % n;
}

// 10 dígitos, primeiro dígito de 1 a 9, sorteio criptográfico sem viés.
export function randomPin() {
  return String(1 + randomBelow(9)) + String(randomBelow(1e9)).padStart(9, '0');
}

export function localClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map(p => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, time: `${parts.hour}:${parts.minute}`, day: new Date(date + 'T12:00:00Z').getUTCDay() };
}

export function elderOf(state, id) { return state.elders?.find(e => e.id === id); }

// Publica somente o perfil escolhido: sem e-mail, conta, PIN ou outros familiares.
export function projection(state, id, days = 30) {
  const e = elderOf(state, id); if (!e) return null;
  const cutoff = localClock(new Date(Date.now() - days * 86400000)).date;
  const profile = {
    id: e.id, name: e.name, age: e.age || 0, sex: e.sex || 'n', avatar: e.avatar || '🧑',
    meds: clean(e.meds || []),
    logs: clean((e.logs || []).filter(l => !l.date || l.date >= cutoff)),
    alerts: clean((e.alerts || []).slice(0, 50)),
    tol: e.tol ?? 30
  };
  return {
    version: 3, activeElderId: e.id, elder: profile, elders: [profile], meds: profile.meds, logs: profile.logs,
    alerts: profile.alerts, tol: profile.tol,
    fam: { name: state.account?.owner?.name || state.fam?.name || 'Familiar', rel: state.fam?.rel || 'Responsável', perm: { view: true, alerts: true, edit: false } },
    account: { owner: { name: state.account?.owner?.name || 'Familiar' }, elderAccess: { enabled: true, label: e.name } },
    fs: state.fs || 16, hc: !!state.hc, easy: true,
    settings: { notifications: false, sound: true, voice: true, voiceReminders: true },
    audit: [], documents: [], caregivers: [], deferred: clean(e.deferred || {})
  };
}

// Texto JSON da visão do idoso, sempre abaixo do limite de 1 MiB do Firestore.
export function viewJSON(state, id) {
  for (const days of [30, 14, 7, 2]) {
    const view = projection(state, id, days);
    if (!view) throw Error('profile-missing');
    const json = JSON.stringify(view);
    if (bytes(json) <= 800000) return json;
  }
  throw Error('view-too-large');
}

export function applyAction(state, elderId, input, now = new Date()) {
  const e = elderOf(state, elderId); if (!e) throw Error('profile-missing');
  const clock = localClock(now);
  state.audit = state.audit || []; e.alerts = e.alerts || [];
  if (input.kind === 'help') {
    e.alerts.unshift({ id: 'help-' + now.getTime(), txt: `${e.name} solicitou ajuda.`, at: clock.time, type: 'help', severity: 'high' });
    state.audit.unshift(`${clock.date} ${clock.time} — ${e.name} solicitou ajuda pelo Modo Simples.`);
  } else {
    if (!['ok', 'no', 'later', 'undo'].includes(input.status)) throw Error('invalid-status');
    const m = e.meds?.find(m => m.id === input.medId);
    if (!m || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time) || !m.times?.includes(input.time)) throw Error('invalid-dose');
    if ((m.days?.length && !m.days.includes(clock.day)) || (m.startDate && m.startDate > clock.date) || (m.endDate && m.endDate < clock.date)) throw Error('unscheduled-dose');
    e.logs = e.logs || [];
    const previous = e.logs.find(l => l.med === m.id && l.time === input.time && l.date === clock.date);
    const per = Number(m.per) || 1;
    if (input.status === 'ok' && previous?.status !== 'ok') m.stock = Math.max(0, (Number(m.stock) || 0) - per);
    if (previous?.status === 'ok' && input.status !== 'ok') m.stock = (Number(m.stock) || 0) + per;
    const noId = `no-${m.id}-${input.time}-${clock.date}`;
    e.logs = e.logs.filter(l => !(l.med === m.id && l.time === input.time && l.date === clock.date));
    e.alerts = e.alerts.filter(a => a.id !== noId);
    if (input.status === 'undo') {
      if (e.deferred) delete e.deferred[`defer-${m.id}-${input.time}`];
      state.audit.unshift(`${clock.date} ${clock.time} — ${e.name}: ${m.name} ${input.time}, registro desfeito`);
    } else {
      const reason = String(input.reason || '').slice(0, 200);
      e.logs.push({ med: m.id, time: input.time, date: clock.date, status: input.status, at: clock.time, reason });
      if (input.status === 'later') { e.deferred = e.deferred || {}; e.deferred[`defer-${m.id}-${input.time}`] = now.getTime() + 30 * 60000; }
      if (input.status === 'ok') e.alerts = e.alerts.filter(a => a.id !== `${m.id}-${input.time}-${clock.date}`);
      if (input.status === 'no') e.alerts.unshift({ id: noId, txt: `${e.name} marcou que NÃO tomou ${m.name} das ${input.time}${reason && reason !== 'não informado' ? ` (${reason})` : ''}.`, at: clock.time, type: 'no', severity: 'high' });
      state.audit.unshift(`${clock.date} ${clock.time} — ${e.name}: ${m.name} ${input.time}, ${input.status}`);
    }
  }
  if (state.activeElderId === elderId) { state.elder = e; state.meds = e.meds; state.logs = e.logs; state.alerts = e.alerts; state.tol = e.tol ?? 30; state.deferred = e.deferred || {}; }
  return state;
}
