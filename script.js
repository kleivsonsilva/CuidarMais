
const K = 'cuidar_v2';
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const hm = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const nowM = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const cl = m => Math.max(0, Math.min(1439, m));

/* Estado Inicial Default */
function seed() {
  const n = nowM();
  return {
    elder: { name: 'Maria da Silva', age: 74, avatar: '👵' },
    fam: { name: 'Ana da Silva', rel: 'Filha', perm: { view: true, alerts: true, edit: false } },
    tol: 30,
    fs: 16,
    hc: false,
    easy: false,
    meds: [
      { id: 1, name: 'Losartana', dose: '50 mg', per: 1, stock: 8, min: 7, times: [hm(cl(n - 180))], icon: '💊', desc: 'Pressão Arterial' },
      { id: 2, name: 'Metformina', dose: '850 mg', per: 1, stock: 32, min: 7, times: [hm(cl(n - 10))], icon: '🩸', desc: 'Glicemia / Diabetes' },
      { id: 3, name: 'Sinvastatina', dose: '20 mg', per: 1, stock: 20, min: 7, times: [hm(cl(n + 120))], icon: '🫀', desc: 'Colesterol' }
    ],
    logs: [{ med: 1, time: hm(cl(n - 180)), date: today(), status: 'ok', at: hm(cl(n - 176)) }],
    alerts: [],
    audit: []
  }
}

// Os dados legados são usados apenas após autenticação e confirmação de migração.
let legacyState = null;
try { legacyState = JSON.parse(localStorage.getItem(K) || 'null'); } catch (_) {}
let S = seed();
S.meds=[];S.logs=[];S.alerts=[];
let cloudSaveHandler = null;
let cloudApplying = false;
let cloudBooted = false;
let user = null;
let authReady = true;
let authMode = 'login';
let demo = false;
let role = null;
let authSession = null;
const isFamily = () => role === 'fam';
const isElder = () => role === 'elder';
let tab = 'home';

const save = () => {
  if(Array.isArray(S.elders) && S.activeElderId){
    const a=S.elders.find(e=>e.id===S.activeElderId);
    if(a){ a.name=S.elder.name; a.age=S.elder.age; a.avatar=S.elder.avatar; a.meds=S.meds; a.logs=S.logs; a.alerts=S.alerts; a.tol=S.tol; }
  }
  if (!cloudApplying && !demo && user && cloudSaveHandler) cloudSaveHandler(S);
};

/* Escutar sincronização entre abas */
// A sincronização entre aparelhos e abas é feita pelo Firestore.


/* Checagem periódica de Alertas */
setInterval(() => {
  checkAlerts();
  if ((user || demo) && tab !== 'account' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
    render();
  }
}, 30000);

/* Helper Functions */
const slots = () => S.meds.flatMap(m => m.times.map(t => ({ m, t }))).sort((a, b) => a.t.localeCompare(b.t));
const logOf = (m, t) => S.logs.find(l => l.med === m.id && l.time === t && l.date === today());

function status(s) {
  const l = logOf(s.m, s.t);
  if (l) return l.status;
  const [h, mi] = s.t.split(':').map(Number);
  const d = nowM() - (h * 60 + mi);
  return d < 0 ? 'sched' : d <= S.tol ? 'wait' : 'miss';
}

const SL = {
  ok: { label: 'Confirmado', bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300', icon: 'ph-check-circle' },
  wait: { label: 'Aguardando', bg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300', icon: 'ph-clock' },
  miss: { label: 'Não Confirmado', bg: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300', icon: 'ph-warning-circle' },
  sched: { label: 'Programado', bg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300', icon: 'ph-calendar-blank' },
  no: { label: 'Não Tomado', bg: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300', icon: 'ph-x-circle' },
  later: { label: 'Lembrar Depois', bg: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300', icon: 'ph-bell-ringing' }
};

function checkAlerts() {
  slots().forEach(s => {
    if (status(s) === 'miss') {
      const id = s.m.id + s.t + today();
      if (!S.alerts.find(a => a.id === id)) {
        S.alerts.unshift({ id, txt: `A dose de ${s.m.name} das ${s.t} ainda não foi confirmada.`, at: hm(nowM()) });
        save();
      }
    }
  });
}

function act(mid, t, st, reason) {
  const m = S.meds.find(x => x.id === mid);
  S.logs = S.logs.filter(l => !(l.med === mid && l.time === t && l.date === today()));
  S.logs.push({ med: mid, time: t, date: today(), status: st, at: hm(nowM()), reason });
  if (st === 'ok') m.stock = Math.max(0, m.stock - m.per);
  S.audit.push(`${new Date().toLocaleString('pt-BR')} — ${m.name} ${t}: ${st}`);
  S.alerts = S.alerts.filter(a => a.id !== mid + t + today() || st !== 'ok');
  save();
  render();
}

function speak(t) {
  return new Promise(res => {
    if (!('speechSynthesis' in window)) return res();
    try { speechSynthesis.cancel(); } catch (_) {}
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'pt-BR'; u.rate = 0.95;
    const vs = speechSynthesis.getVoices();
    const v = vs.find(x => /^pt[-_]BR/i.test(x.lang)) || vs.find(x => /^pt/i.test(x.lang));
    if (v) u.voice = v;
    let done = false;
    const fin = () => { if (!done) { done = true; res(); } };
    u.onend = fin; u.onerror = fin;
    setTimeout(fin, Math.min(30000, 1500 + String(t).length * 90));
    speechSynthesis.speak(u);
  });
}

const daysLeft = m => Math.floor(m.stock / (m.per * (m.times.length || 1)));
const endDate = m => {
  const d = new Date();
  d.setDate(d.getDate() + daysLeft(m));
  return d.toLocaleDateString('pt-BR');
};
const nextSlot = () => slots().find(s => ['wait', 'miss', 'later'].includes(status(s))) || slots().find(s => status(s) === 'sched');

/* ---- Comando por Voz ---- */
function listen(ms = 9000) {
  return new Promise(res => {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) {
      res((prompt('Seu navegador não suporta voz ativada. Digite seu comando:') || ''));
      return;
    }
    const r = new R();
    r.lang = 'pt-BR'; r.interimResults = false; r.maxAlternatives = 1; r.continuous = false;
    let done = false;
    const fin = v => { if (done) return; done = true; clearTimeout(tm); try { r.stop(); } catch (_) {} res(v || ''); };
    const tm = setTimeout(() => fin(''), ms);
    r.onresult = e => fin(e.results[0][0].transcript);
    r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') window.__micDenied = true; fin(''); };
    r.onend = () => fin('');
    try { r.start(); } catch (_) { fin(''); }
  });
}

async function voice() {
  speak('Estou ouvindo.');
  const btn = $('#voice-btn');
  if (btn) btn.classList.add('animate-bounce');
  const q = (await listen()).toLowerCase();
  if (btn) btn.classList.remove('animate-bounce');
  
  if (!q) return speak('Não entendi.');

  const sl = slots();
  if (/já tomei|tomei|tomado/.test(q)) {
    const s = sl.find(s => ['wait', 'miss'].includes(status(s)));
    if (!s) return speak('Não há nenhuma dose pendente para confirmação no momento.');
    speak(`Você confirma que tomou ${s.m.name} das ${s.t}?`);
    await new Promise(r => setTimeout(r, 2500));
    const a = (await listen()).toLowerCase();
    if (/sim|com certeza|tomar|tomei/.test(a)) {
      act(s.m.id, s.t, 'ok');
      speak(`Perfeito! Registrei que você tomou ${s.m.name}.`);
    } else speak('Certo, mantive o registro inalterado.');
  } else if (/agora|próximo|qual/.test(q)) {
    const s = nextSlot();
    speak(s ? `Seu próximo remédio é ${s.m.name} ${s.m.dose}, marcado para às ${s.t}.` : 'Parabéns, você não tem mais medicamentos por hoje.');
  } else if (/hoje|lista/.test(q)) {
    speak(`Você possui ${sl.length} doses programadas para hoje: ` + sl.map(s => `${s.m.name} às ${s.t}`).join(', '));
  } else if (/acab|estoque|falta/.test(q)) {
    speak(S.meds.map(m => `${m.name} dura aproximadamente mais ${daysLeft(m)} dias.`).join(' '));
  } else {
    speak('Não entendi o comando. Tente perguntar: "Qual o próximo remédio?" ou diga "Já tomei".');
  }
}

/* Navegação e Ações */
const esc = t => String(t || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const go = t => { tab = t; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
const setRole = r => {
  if (authSession === 'elder' && r !== 'elder') return;
  role = r;
  if (user) localStorage.setItem('cuidar_role_' + user.uid, r);
  else sessionStorage.setItem('role', r);
  tab = 'home';
  render();
};
const goDemo = () => { demo = true; sessionStorage.setItem('demo', '1'); render(); };
const exitDemo = () => { demo = false; sessionStorage.removeItem('demo'); sessionStorage.removeItem('role'); role = null; render(); };


/* Componente: Header Principal */
function renderHeader() {
  return `
  <header class="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-all">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center space-x-3 cursor-pointer" onclick="go('home')">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-teal-500/30">
          <i class="ph-bold ph-first-aid-kit text-2xl"></i>
        </div>
        <div>
          <span class="font-display text-xl font-bold bg-gradient-to-r from-teal-700 to-teal-500 bg-clip-text text-transparent">CUIDAR+</span>
          <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 ml-1.5">${role === 'elder' ? 'Modo simples' : 'Familiar'}</span>
        </div>
      </div>

      <!-- Controls & Accessibility -->
      <div class="flex items-center space-x-1 sm:space-x-2">
        <button onclick="S.fs = S.fs >= 22 ? 16 : S.fs + 2; save(); render();" title="Aumentar Fonte" class="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all flex items-center gap-1 font-bold">
          <i class="ph-bold ph-text-a-underline text-lg"></i>
          <span class="text-xs hidden sm:inline">${S.fs}px</span>
        </button>

        <button onclick="S.hc = !S.hc; save(); render();" title="Alto Contraste" class="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all">
          <i class="ph-bold ph-circle-half text-lg"></i>
        </button>

        ${user ? `
        <button onclick="go('account')" class="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all flex items-center gap-2">
          <i class="ph-bold ph-user-circle text-xl"></i>
        </button>
        ` : ''}

        <button onclick="${demo ? 'exitDemo()' : 'signOut()'}" class="p-2.5 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all" title="Trocar Perfil / Sair">
          <i class="ph-bold ph-sign-out text-xl"></i>
        </button>
      </div>
    </div>
  </header>
  `;
}

/* Componente: Bottom Nav (Mobile Only) */
function renderBottomNav() {
  const isElder = role === 'elder';
  const items = isElder ? [
    { id: 'home', label: 'Início', icon: 'ph-house' },
    { id: 'meds', label: 'Remédios', icon: 'ph-pill' },
    { id: 'hist', label: 'Histórico', icon: 'ph-chart-line-up' },
    { id: 'help', label: 'Ajuda', icon: 'ph-warning-octagon', bad: true },
  ] : [
    { id: 'home', label: 'Painel', icon: 'ph-squares-four' },
    { id: 'meds', label: 'Remédios', icon: 'ph-pill' },
    { id: 'hist', label: 'Relatórios', icon: 'ph-chart-bar' },
    { id: 'share', label: 'Permissões', icon: 'ph-users' },
  ];

  return `
  <div class="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 pb-safe">
    <div class="grid grid-cols-${items.length} h-16">
      ${items.map(item => `
        <button onclick="go('${item.id}')" class="flex flex-col items-center justify-center space-y-1 ${tab === item.id ? 'text-teal-600 dark:text-teal-400 font-bold' : 'text-slate-500 dark:text-slate-400'} ${item.bad ? 'text-rose-600 dark:text-rose-400' : ''}">
          <i class="ph-bold ${item.icon} text-2xl ${tab === item.id ? 'scale-110' : ''} transition-transform"></i>
          <span class="text-[11px]">${item.label}</span>
        </button>
      `).join('')}
    </div>
  </div>
  `;
}

/* Componente: Sidebar Nav (Desktop Only) */
function renderSidebar() {
  const isElder = role === 'elder';
  const navs = isElder ? [
    { id: 'home', label: 'Início', icon: 'ph-house' },
    { id: 'meds', label: 'Meus Medicamentos', icon: 'ph-pill' },
    { id: 'hist', label: 'Acompanhamento', icon: 'ph-chart-line-up' },
    { id: 'share', label: 'Familiares', icon: 'ph-users' },
    { id: 'help', label: 'Pedir Ajuda', icon: 'ph-warning-octagon', bad: true },
  ] : [
    { id: 'home', label: 'Visão Geral', icon: 'ph-squares-four' },
    { id: 'meds', label: 'Medicamentos', icon: 'ph-pill' },
    { id: 'hist', label: 'Adesão & Relatórios', icon: 'ph-chart-bar' },
    { id: 'share', label: 'Acessos & Configurações', icon: 'ph-gear' },
  ];

  return `
  <aside class="hidden md:flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4 shrink-0 min-h-[calc(100vh-4rem)]">
    <div class="mb-6 p-3 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900/50 flex items-center space-x-3">
      <div class="text-3xl">${S.elder.avatar || '👵'}</div>
      <div class="overflow-hidden">
        <div class="font-bold text-sm truncate">${S.elder.name}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400">${S.elder.age} anos</div>
      </div>
    </div>

    <nav class="space-y-1.5 flex-1">
      ${navs.map(n => `
        <button onclick="go('${n.id}')" class="w-full flex items-center space-x-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${tab === n.id ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'} ${n.bad && tab !== n.id ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30' : ''}">
          <i class="ph-bold ${n.icon} text-xl"></i>
          <span>${n.label}</span>
        </button>
      `).join('')}
    </nav>

    <!-- Botão Modo Fácil / Card Auxiliar -->
    ${isElder ? `
    <div class="mt-auto pt-4 border-t border-slate-200 dark:border-slate-800">
      <label class="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 cursor-pointer">
        <span class="text-xs font-semibold">Modo Simplificado</span>
        <input type="checkbox" ${S.easy ? 'checked' : ''} onchange="S.easy=this.checked;save();render();" class="w-4 h-4 accent-teal-600 rounded">
      </label>
    </div>
    ` : ''}
  </aside>
  `;
}


/* Autenticação CUIDAR+: a família é a única conta. O acesso do idoso fica DENTRO dela. */
async function hashText(value){
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function hasFamilyAccount(){ return !!(user && S.account?.owner?.uid === user.uid); }
function signIn(roleName='fam'){ if(!user) return alert('Entre na conta Firebase da família.'); authMode='login'; role=roleName; sessionStorage.setItem('role',roleName); authSession='fam'; sessionStorage.setItem('cuidar_auth','fam'); tab='home'; render(); }
function signOut(){ alert('Aguarde a conexão com o Firebase.'); }
window.openAuth=function(mode){authMode=mode;render();};
window.createFamilyAccount=window.loginFamily=function(){alert('Aguarde a conexão com o Firebase.');};
window.openElderMode=function(){
  if(!hasFamilyAccount() || authSession!=='fam') return alert('Entre primeiro na conta da família.');
  S.audit.unshift(`${new Date().toLocaleString('pt-BR')} — Modo Simples aberto pelo familiar.`); save(); signIn('elder');
};
window.backToFamily=function(){
  if(authSession!=='fam') return signOut();
  S.audit.unshift(`${new Date().toLocaleString('pt-BR')} — Familiar retomou o painel administrativo.`); save(); signIn('fam');
};

/* ===== PIN de acesso de quem você cuida ===== */
const PIN_LEN = 10;
function genUniquePin(){
  const used = new Set((S.elders||[]).map(e=>e.accessPin).filter(Boolean));
  let pin;
  do {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000;
    pin = String(n);
  } while (used.has(pin));
  return pin;
}
window.pinVisible = window.pinVisible || {};
window.togglePin = function(id){ window.pinVisible[id] = !window.pinVisible[id]; render(); };
window.regenPin = function(id){
  if(authSession!=='fam' || role!=='fam') return alert('Somente o familiar responsável pode gerar o PIN.');
  const e=S.elders.find(x=>x.id===id); if(!e) return;
  if(e.accessPin && !confirm(`Gerar um novo PIN para ${e.name}? O PIN atual deixará de funcionar.`)) return;
  e.accessPin = genUniquePin();
  S.audit.unshift(`${new Date().toLocaleString('pt-BR')} — Novo PIN de acesso gerado para ${e.name}.`);
  save(); window.pinVisible[id]=true; render();
};
window.pinCard = function(){
  if(role!=='fam')return '';
  return '<section class="pin-settings bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200 dark:border-slate-700"><h2 class="font-display font-bold text-lg mb-3">Acesso por PIN</h2><p class="text-sm text-slate-500 mb-4">O PIN é gerado automaticamente ao cadastrar a pessoa cuidada. Ele funciona em qualquer celular ou computador, sem link e sem login do responsável.</p><div class="space-y-3">'+S.elders.map(e=>{
    const enabled=!!e.pinGlobal,shown=!!window.pinVisible[e.id];
    return '<div class="pin-person p-4 rounded-2xl bg-slate-50 dark:bg-slate-900"><b>'+esc(e.name)+'</b><p class="text-sm mt-2">'+(enabled?'PIN: <strong class="text-2xl tracking-widest">'+(shown?esc(e.accessPin):'••••••••••')+'</strong>':'Gerando o PIN no servidor. Aguarde alguns segundos.')+'</p><div class="pin-actions mt-3">'+
    (enabled?'<button onclick="togglePin(\''+e.id+'\',this)" class="border rounded-xl px-3 py-2">'+(shown?'Ocultar':'Mostrar')+'</button><button onclick="copyPin(\''+e.id+'\')" class="border rounded-xl px-3 py-2">Copiar PIN</button>':'')+
    '<button onclick="enablePinAccess(\''+e.id+'\')" class="bg-teal-600 text-white rounded-xl px-3 py-2 font-bold">'+(enabled?'Gerar novo PIN':'Gerar PIN agora')+'</button>'+
    (enabled?'<button onclick="revokePinAccess(\''+e.id+'\')" class="border rounded-xl px-3 py-2 text-rose-600">Desativar acesso</button>':'')+'</div></div>';
  }).join('')+'</div></section>';
};

function signInElder(){ role='elder'; authSession='elder'; sessionStorage.setItem('role','elder'); sessionStorage.setItem('cuidar_auth','elder'); tab='home'; render(); }
window.loginElderPin=()=>alert('Aguarde o carregamento do acesso por PIN.');

/* ===== Utilidades: aviso na tela, saudação de saída, alarme de remédio ===== */
window.toast=function(msg){
  let t=document.getElementById('cuidar-toast');
  if(!t){ t=document.createElement('div'); t.id='cuidar-toast'; t.setAttribute('role','status'); t.className='fixed left-1/2 -translate-x-1/2 bottom-24 z-[90] max-w-[90vw] px-5 py-3 rounded-2xl bg-slate-900 text-white text-sm font-semibold shadow-2xl text-center'; document.body.appendChild(t); }
  t.textContent=msg; t.style.display='block'; clearTimeout(t._h); t._h=setTimeout(()=>{t.style.display='none';},3500);
};
window.avatarFor=function(sex,age){ const old=Number(age)>=60; if(sex==='m')return old?'👴':'👨'; if(sex==='f')return old?'👵':'👩'; return old?'🧓':'🧑'; };

let __ac=null, __unlocked=false;
function audioCtx(){ const C=window.AudioContext||window.webkitAudioContext; if(!C) return null; if(!__ac) __ac=new C(); return __ac; }
function unlockAudio(){
  if(__unlocked) return; __unlocked=true; window.__audioReady=true;
  const ac=audioCtx(); if(ac&&ac.state==='suspended') ac.resume();
  try{ const u=new SpeechSynthesisUtterance(' '); u.volume=0; speechSynthesis.speak(u); }catch(_){}
}
['pointerdown','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,unlockAudio,{passive:true}));

window.playAlarm=function(pairs=3){
  const ac=audioCtx(); if(!ac) return 0;
  if(ac.state==='suspended') ac.resume();
  const t0=ac.currentTime+0.05, step=0.32;
  for(let i=0;i<pairs*2;i++){
    const o=ac.createOscillator(), g=ac.createGain(); o.type='sine'; o.frequency.value=i%2?660:880;
    o.connect(g); g.connect(ac.destination); const s=t0+i*step;
    g.gain.setValueAtTime(0.0001,s); g.gain.exponentialRampToValueAtTime(0.5,s+0.03); g.gain.exponentialRampToValueAtTime(0.0001,s+step-0.04);
    o.start(s); o.stop(s+step-0.02);
  }
  return Math.round(pairs*2*step*1000);
};
window.systemNotify=function(title,body,tag){
  if(!('Notification' in window)||Notification.permission!=='granted') return;
  const opts={body,tag,renotify:true,requireInteraction:true,vibrate:[400,200,400,200,400],icon:'icons/icon-192.png',badge:'icons/icon-192.png'};
  const direct=()=>{ try{ new Notification(title,opts); }catch(_){} };
  try{
    if(navigator.serviceWorker&&navigator.serviceWorker.getRegistration){
      navigator.serviceWorker.getRegistration().then(r=>r?r.showNotification(title,opts):direct()).catch(direct);
    } else direct();
  }catch(_){ direct(); }
};
window.fireDoseAlarm=function(s,text){
  const wantSound=S.settings.sound!==false;
  let wait=0;
  if(wantSound) wait=playAlarm(3);
  try{ if(navigator.vibrate) navigator.vibrate([500,250,500,250,500]); }catch(_){}
  systemNotify('CUIDAR+ — hora do medicamento',text,'dose-'+s.m.id+'-'+s.t);
  if(S.settings.voiceReminders!==false) setTimeout(()=>speak(text),wait?wait+150:0);
  showDoseOverlay(s,text);
};
function showDoseOverlay(s,text){
  let o=document.getElementById('dose-alarm');
  if(!o){
    o=document.createElement('div'); o.id='dose-alarm'; o.setAttribute('role','alertdialog'); o.setAttribute('aria-live','assertive');
    o.className='fixed inset-0 z-[100] bg-teal-900/95 text-white flex flex-col items-center justify-center p-5 overflow-y-auto';
    o.innerHTML='<div class="text-6xl mb-2">⏰💊</div><h2 class="font-display text-3xl font-bold text-center">Hora do remédio!</h2><p id="dose-alarm-hint" class="text-sm text-teal-100 mt-1 mb-4 text-center"></p><div id="dose-alarm-rows" class="w-full max-w-md space-y-3"></div><button onclick="closeDoseAlarm()" class="mt-5 px-5 py-3 rounded-2xl border border-white/40 text-sm font-semibold">Fechar aviso</button>';
    document.body.appendChild(o);
    window.__alarmStart=Date.now();
    window.__alarmTimer=setInterval(()=>{
      if(!document.getElementById('dose-alarm')||Date.now()-window.__alarmStart>10*60000){ closeDoseAlarm(); return; }
      if(S.settings.sound!==false) playAlarm(2);
      try{ if(navigator.vibrate) navigator.vibrate([400,200,400]); }catch(_){}
    },60000);
  }
  o.querySelector('#dose-alarm-hint').textContent=window.__audioReady?'Toque em “JÁ TOMEI” depois de tomar.':'🔔 Toque na tela para ativar o som.';
  const rows=o.querySelector('#dose-alarm-rows');
  const rid='dr-'+s.m.id+'-'+s.t.replace(':','');
  if(rows.querySelector('#'+rid)) return;
  const d=document.createElement('div'); d.id=rid; d.className='rounded-3xl bg-white text-slate-900 p-4 shadow-xl';
  d.innerHTML=`<p class="text-sm font-bold text-teal-700">${esc(s.t)} · ${esc(S.elder?.name||'')}</p><p class="font-display text-2xl font-bold">${esc(s.m.name)}</p><p class="text-base text-slate-600 mb-3">${esc(s.m.dose||'')} · ${esc(s.m.per)} comprimido${s.m.per>1?'s':''}</p><div class="grid grid-cols-2 gap-2"><button onclick="doseAlarmAct('ok','${s.m.id}','${s.t}')" class="py-4 rounded-2xl bg-emerald-600 text-white font-bold text-lg">JÁ TOMEI ✅</button><button onclick="doseAlarmAct('later','${s.m.id}','${s.t}')" class="py-4 rounded-2xl bg-amber-500 text-slate-900 font-bold text-lg">DEPOIS ⏳</button></div>`;
  rows.appendChild(d);
}
window.doseAlarmAct=function(kind,mid,t){
  const m=S.meds.find(x=>String(x.id)===String(mid));
  if(!m){ document.getElementById('dr-'+mid+'-'+t.replace(':',''))?.remove(); if(!document.getElementById('dose-alarm-rows')?.children.length) closeDoseAlarm(); return; }
  if(kind==='ok') act(m.id,t,'ok'); else deferDose(m.id,t);
  const r=document.getElementById('dr-'+mid+'-'+t.replace(':',''));
  if(r) r.remove();
  const rows=document.getElementById('dose-alarm-rows');
  if(!rows||!rows.children.length) closeDoseAlarm();
};
window.closeDoseAlarm=function(){ clearInterval(window.__alarmTimer); const o=document.getElementById('dose-alarm'); if(o) o.remove(); try{speechSynthesis.cancel();}catch(_){} };

window.exitSession=function(){
  if(document.getElementById('bye-screen')) return;
  closeDoseAlarm();
  const who=(authSession==='elder'?S.elder?.name:(S.account?.owner?.name||S.fam?.name))||'';
  const first=String(who).trim().split(/\s+/)[0];
  const o=document.createElement('div'); o.id='bye-screen'; o.setAttribute('role','status');
  o.className='fixed inset-0 z-[120] bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-500 text-white flex flex-col items-center justify-center p-6 text-center';
  o.innerHTML=`<div class="text-6xl mb-4 animate-bounce">💚👋😊</div><h2 class="font-display text-3xl font-bold">Obrigado por usar o CUIDAR+!</h2><p class="text-lg mt-3 text-teal-50">${first?esc(first)+', c':'C'}uide-se bem e até a próxima! 🌟🙏</p><p class="text-sm mt-6 text-teal-100">Saindo com segurança... 🔒</p>`;
  document.body.appendChild(o);
  try{ speak('Obrigado por usar o Cuidar mais. Até logo!'); }catch(_){}
  setTimeout(()=>{ o.remove(); demo=false; sessionStorage.removeItem('demo'); signOut(); },2800);
};

window.copyPin=async function(id){
  const e=S.elders.find(x=>x.id===id); if(!e||!e.accessPin) return;
  let ok=false;
  try{ await navigator.clipboard.writeText(e.accessPin); ok=true; }catch(_){
    try{ const t=document.createElement('textarea'); t.value=e.accessPin; t.style.position='fixed'; t.style.opacity='0'; document.body.appendChild(t); t.select(); ok=document.execCommand('copy'); t.remove(); }catch(__){}
  }
  toast(ok?'PIN copiado ✅':'Não consegui copiar. PIN: '+e.accessPin);
};
window.googleLogin=window.changePassword=function(){alert('Aguarde a conexão com o Firebase.');};
window.togglePw=function(id,btn){
  const i=document.getElementById(id); if(!i)return;
  const show=i.type==='password'; i.type=show?'text':'password';
  btn.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');
  btn.innerHTML=`<i class="ph-bold ${show?'ph-eye-slash':'ph-eye'}"></i>`;
};
function authField(id,label,icon,type,ph,ac,onEnter,extra=''){
  const isPw=type==='password';
  return `<div>
    <label for="${id}" class="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">${label}</label>
    <div class="relative">
      <i class="ph-bold ${icon} auth-ico"></i>
      <input id="${id}" type="${type}" class="auth-input ${isPw?'pr-14':''}" placeholder="${ph}" autocomplete="${ac}" ${onEnter?`onkeydown="if(event.key==='Enter'){${onEnter}}"`:''}>
      ${isPw?`<button type="button" onclick="togglePw('${id}',this)" aria-label="Mostrar senha" class="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl text-slate-500 hover:text-teal-700 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-xl"><i class="ph-bold ph-eye"></i></button>`:''}
    </div>${extra}
  </div>`;
}
function viewAuth(){
  const register=authMode==='register';
  const features=[
    ['ph-pill','Lembretes de medicamentos','Horários, doses e estoque sempre em dia.'],
    ['ph-bell-ringing','Alertas para a família','Saiba na hora se uma dose foi esquecida.'],
    ['ph-heart','Modo Simples','Telas grandes, fáceis e com leitura por voz.']
  ];
  const google=`<button type="button" onclick="googleLogin()" class="w-full h-14 rounded-2xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-white font-semibold flex items-center justify-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-600 transition-all active:scale-[.99]">
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
    Continuar com Google</button>`;
  const divider=`<div class="flex items-center gap-3 my-5"><div class="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div><span class="text-xs font-medium text-slate-400 uppercase tracking-wider">ou</span><div class="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div></div>`;
  const tab=(mode,txt)=>`<button type="button" onclick="openAuth('${mode}')" class="flex-1 h-11 rounded-xl text-sm font-bold transition-all ${authMode===mode?'bg-white dark:bg-slate-600 text-teal-700 dark:text-white shadow':'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'}">${txt}</button>`;

  return `<div class="auth-shell min-h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-slate-900">

    <!-- Painel da marca -->
    <section class="auth-brand relative overflow-hidden lg:w-[46%] xl:w-1/2 bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-600 text-white px-5 pt-7 pb-12 lg:p-14 flex flex-col justify-between">
      <div class="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-white/10 blur-2xl"></div>
      <div class="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-emerald-300/20 blur-3xl"></div>
      <div class="relative flex items-center gap-3">
        <div class="w-12 h-12 rounded-2xl bg-white text-teal-700 flex items-center justify-center shadow-lg"><i class="ph-bold ph-first-aid-kit text-3xl"></i></div>
        <span class="font-display text-2xl font-bold tracking-tight">CUIDAR+</span>
      </div>
      <div class="relative mt-8 lg:mt-0 max-w-lg">
        <h1 class="font-display text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">Cuidado mais simples, todos os dias.</h1>
        <p class="mt-3 text-teal-50/90 text-base lg:text-lg">Organize remédios e acompanhe quem você ama, com tranquilidade.</p>
        <ul class="hidden lg:block mt-10 space-y-5">
          ${features.map(f=>`<li class="flex items-start gap-4"><div class="w-11 h-11 shrink-0 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center text-2xl"><i class="ph-bold ${f[0]}"></i></div><div><b class="block font-semibold">${f[1]}</b><span class="text-sm text-teal-50/80">${f[2]}</span></div></li>`).join('')}
        </ul>
      </div>
      <p class="relative hidden lg:flex items-center gap-2 text-sm text-teal-50/80"><i class="ph-bold ph-shield-check text-lg"></i> Conta e dados da família no Firebase.</p>
    </section>

    <!-- Formulário -->
    <section class="auth-panel flex-1 flex items-start lg:items-center justify-center px-5 sm:px-8 -mt-8 lg:mt-0 pb-10 lg:py-10">
      <div class="w-full max-w-md">
        <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-900/10 border border-slate-100 dark:border-slate-700">
          <div class="flex p-1 rounded-2xl bg-slate-100 dark:bg-slate-700/60 mb-7" role="tablist">${tab('login','Entrar')}${tab('register','Criar conta')}</div>

          <h2 class="font-display text-2xl font-bold text-slate-900 dark:text-white">${register?'Vamos começar':'Que bom ver você'}</h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-6">${register?'Crie a conta da família em menos de um minuto.':'Entre para acompanhar o cuidado da sua família.'}</p>

          ${register?`
          <div class="space-y-4">
            ${authField('regName','Seu nome','ph-user','text','Nome do familiar responsável','name')}
            ${authField('regEmail','E-mail','ph-envelope-simple','email','voce@exemplo.com','email')}
            ${authField('regPassword','Senha','ph-lock-simple','password','Mínimo de 6 caracteres','new-password')}
            ${authField('regElder','Quem você vai cuidar?','ph-heart','text','Nome de quem você cuida (ex.: Maria)','off')}
            ${authField('regAge','Idade (opcional)','ph-cake','number','Ex.: 74','off')}
            <fieldset><legend class="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Essa pessoa é...</legend><div class="grid grid-cols-3 gap-2">${[['f','Mulher','👩'],['m','Homem','👨'],['n','Prefiro não dizer','🧑']].map(x=>`<label class="cursor-pointer"><input type="radio" name="regSex" value="${x[0]}" class="peer sr-only"><div class="h-[4.5rem] rounded-2xl border-2 border-slate-300 dark:border-slate-600 peer-checked:border-teal-600 peer-checked:bg-teal-50 dark:peer-checked:bg-teal-950/40 flex flex-col items-center justify-center text-xs font-bold text-center leading-tight px-1"><span class="text-2xl">${x[2]}</span>${x[1]}</div></label>`).join('')}</div></fieldset>
            <button type="button" onclick="createFamilyAccount()" class="w-full h-14 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-base shadow-lg shadow-teal-600/25 flex items-center justify-center gap-2 transition-all active:scale-[.99]">Criar minha conta <i class="ph-bold ph-arrow-right"></i></button>
          </div>
          ${divider}${google}`:`
          <div class="space-y-4">
            ${authField('loginEmail','E-mail','ph-envelope-simple','email','voce@exemplo.com','email')}
            ${authField('loginPassword','Senha','ph-lock-simple','password','Digite sua senha','current-password','loginFamily()',`<div class="flex justify-end mt-2"><button type="button" onclick="resetCloudPassword()" class="text-sm text-teal-700 dark:text-teal-300 font-semibold hover:underline">Esqueci minha senha</button></div>`)}
            <button type="button" onclick="loginFamily()" class="w-full h-14 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-base shadow-lg shadow-teal-600/25 flex items-center justify-center gap-2 transition-all active:scale-[.99]">Entrar <i class="ph-bold ph-arrow-right"></i></button>
          </div>
          ${divider}${google}`}
        </div>

        ${register?'':`<div class="mt-5 bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-xl shadow-slate-900/10 border border-slate-100 dark:border-slate-700">
          <div class="flex items-center gap-3 mb-3"><div class="w-11 h-11 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center text-2xl"><i class="ph-bold ph-key"></i></div><div><h2 class="font-display text-xl font-bold text-slate-900 dark:text-white">Tenho um PIN</h2><p class="text-sm text-slate-500 dark:text-slate-400">Entre com seu PIN. Você não precisa estar na conta do responsável.</p></div></div>
          ${window.pinDeviceOptions?window.pinDeviceOptions():''}<input id="elderPin" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="10" autocomplete="off" placeholder="0000000000" onkeydown="if(event.key==='Enter')loginElderPin()" oninput="this.value=this.value.replace(/\D/g,'')" class="w-full h-16 text-center text-3xl font-bold tracking-[.5em] rounded-2xl border-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-teal-600">
          <button type="button" onclick="loginElderPin()" class="mt-3 w-full h-14 rounded-2xl bg-slate-900 dark:bg-white hover:opacity-90 text-white dark:text-slate-900 font-bold text-lg flex items-center justify-center gap-2 transition-all active:scale-[.99]">ENTRAR COM PIN <i class="ph-bold ph-arrow-right"></i></button>
        </div>`}

        <button type="button" onclick="goDemo()" class="mt-5 w-full h-12 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:border-teal-500 hover:text-teal-700 dark:hover:text-teal-300 flex items-center justify-center gap-2 transition-colors"><i class="ph-bold ph-play-circle text-lg"></i> Só quero conhecer o app (demonstração)</button>
      </div>
    </section>
  </div>`;
}

/* Tela de Seleção de Perfil / Início Demo */
function viewWelcome() {
  if(!demo && !authSession) return viewAuth();

  return `
  <div class="min-h-screen bg-slate-900 text-white flex flex-col justify-center items-center p-4 sm:p-6">
    <div class="w-full max-w-md bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
      
      <div class="mx-auto w-16 h-16 bg-gradient-to-tr from-teal-500 to-teal-300 rounded-2xl flex items-center justify-center text-slate-900 shadow-lg shadow-teal-500/30">
        <i class="ph-bold ph-first-aid-kit text-4xl"></i>
      </div>

      <div>
        <h1 class="font-display text-3xl font-bold tracking-tight">CUIDAR+</h1>
        <p class="text-slate-400 text-sm mt-1">Sua saúde organizada em família</p>
      </div>

      <div class="space-y-3 pt-2">
        <div class="p-4 rounded-2xl bg-teal-950/60 border border-teal-800 text-left">
          <p class="text-sm font-bold text-teal-200">Conta da família</p>
          <p class="text-xs text-slate-300 mt-1">O familiar administra todas as pessoas cuidadas dentro de uma única conta. Quem você cuida pode entrar com um PIN ou pelo Modo Simples aberto por você.</p>
        </div>
        <button onclick="setRole('fam')" class="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 font-bold text-white shadow-lg flex items-center justify-center space-x-3 transition-all active:scale-95">
          <span class="text-2xl">👩</span><span class="text-lg">ENTRAR COMO FAMILIAR</span>
        </button>
      </div>

      <div class="pt-4 border-t border-slate-700/60 text-xs text-slate-400 space-y-2">
        <p>💡 Você poderá cadastrar sua mãe, pai, avó, avô ou qualquer pessoa que dependa de remédios na mesma conta.</p>
        <button onclick="if(confirm('Restaurar dados iniciais do aplicativo?')){S=seed();save();render()}" class="text-teal-400 underline hover:text-teal-300">Restaurar dados da demonstração</button>
      </div>

    </div>
  </div>
  `;
}

/* Home Idoso */
function viewElderHome() {
  const s = nextSlot();
  const h = new Date().getHours();
  const g = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  return `
  <div class="space-y-6">
    
    <!-- Saudação -->
    <div class="bg-gradient-to-r from-teal-700 to-teal-600 dark:from-teal-900 dark:to-teal-800 rounded-3xl p-6 text-white shadow-xl shadow-teal-900/10 relative overflow-hidden">
      <div class="relative z-10">
        <h1 class="font-display text-2xl sm:text-3xl font-bold">👋 ${g}, ${S.elder.name.split(' ')[0]}!</h1>
        <p class="text-teal-100 text-sm mt-1">Que bom ver você por aqui. Mantenha seus remédios em dia.</p>
      </div>
      <i class="ph-duotone ph-heartbeat absolute right-[-20px] bottom-[-20px] text-9xl text-white/10 pointer-events-none"></i>
    </div>

    <!-- Card Próximo Medicamento -->
    <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="font-display font-bold text-lg text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <i class="ph-bold ph-bell-ringing text-teal-600"></i> Próxima Dose
        </h2>
        <span class="text-xs font-semibold px-3 py-1 rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">Hoje</span>
      </div>

      ${s ? (() => {
        const st = status(s);
        const meta = SL[st] || SL.sched;
        return `
        <div class="bg-slate-50 dark:bg-slate-900/60 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-700/80 space-y-3">
          <div class="flex items-start justify-between">
            <div>
              <div class="text-2xl font-bold text-teal-700 dark:text-teal-400 font-display">${s.m.name} ${s.m.dose}</div>
              <div class="text-slate-600 dark:text-slate-300 text-sm mt-0.5">Tomar ${s.m.per} comprimido(s)</div>
            </div>
            <div class="text-right">
              <span class="text-3xl font-bold font-display text-slate-800 dark:text-slate-100">${s.t}</span>
            </div>
          </div>

          <div class="pt-2 flex items-center">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${meta.bg}">
              <i class="ph-bold ${meta.icon}"></i> ${meta.label}
            </span>
          </div>
        </div>

        <!-- Botões de Ação Grandes (Acessibilidade) -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button onclick="act(${s.m.id},'${s.t}','ok')" class="py-4 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-base shadow-lg shadow-emerald-600/20 flex items-center justify-center space-x-2 transition-all transform active:scale-95">
            <i class="ph-bold ph-check-circle text-2xl"></i>
            <span>JÁ TOMEI</span>
          </button>

          <button onclick="notTaken(${s.m.id},'${s.t}')" class="py-4 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-bold text-base shadow-lg shadow-rose-600/20 flex items-center justify-center space-x-2 transition-all transform active:scale-95">
            <i class="ph-bold ph-x-circle text-2xl"></i>
            <span>NÃO TOMEI</span>
          </button>

          <button onclick="act(${s.m.id},'${s.t}','later')" class="py-4 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-900 font-bold text-base shadow-lg shadow-amber-500/20 flex items-center justify-center space-x-2 transition-all transform active:scale-95">
            <i class="ph-bold ph-clock text-2xl"></i>
            <span>LEMBRAR DEPOIS</span>
          </button>
        </div>
        `;
      })() : `
      <div class="text-center py-8 space-y-3">
        <div class="text-5xl">🎉</div>
        <div class="text-lg font-bold text-slate-700 dark:text-slate-200">Tudo limpo por hoje!</div>
        <p class="text-sm text-slate-500 dark:text-slate-400">Você já tomou todas as doses agendadas para hoje.</p>
      </div>
      `}
    </div>

    <!-- Botão de Comando de Voz -->
    <button id="voice-btn" onclick="voice()" class="w-full p-5 rounded-3xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-xl shadow-teal-600/20 flex items-center justify-center space-x-4 border border-teal-400/30 transition-all hover:opacity-95 active:scale-95">
      <div class="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl">
        🎙️
      </div>
      <div class="text-left">
        <div class="font-bold text-lg">Falar com o Aplicativo</div>
        <div class="text-xs text-teal-100">Toque, espere o aviso e fale. Ex.: "Qual é o próximo remédio?", "Já tomei", "Lembrar depois", "Estoque", "Ajuda"</div>
      </div>
    </button>

    <!-- Botão de Urgência -->
    <div class="pt-2">
      <button onclick="go('help')" class="w-full py-4 rounded-2xl border-2 border-rose-500 text-rose-600 dark:text-rose-400 font-bold flex items-center justify-center space-x-2 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all">
        <i class="ph-bold ph-warning-octagon text-2xl"></i>
        <span>PRECISO DE AJUDA DE EMERGÊNCIA</span>
      </button>
    </div>

  </div>
  `;
}

function notTaken(id, t) {
  const r = prompt('Motivo (opcional): esqueci / não estava em casa / passei mal / outro');
  act(id, t, 'no', r || 'não informado');
  alert('Registrado. Atenção: Não tome dose dupla. Siga sempre a recomendação do seu médico.');
}


/* Home Familiar */
function viewFamHome() {
  checkAlerts();
  const sl = slots();
  const c = { ok: 0, wait: 0, miss: 0 };
  sl.forEach(s => { const k = status(s); if (c[k] !== undefined) c[k]++; });

  if (!S.fam.perm.view) {
    return `
    <div class="bg-rose-50 border border-rose-200 rounded-3xl p-6 text-center space-y-3">
      <i class="ph-bold ph-lock text-4xl text-rose-600"></i>
      <h2 class="text-xl font-bold text-rose-800">Acesso Restrito</h2>
      <p class="text-sm text-rose-600">A pessoa desativou a permissão de visualização dos medicamentos.</p>
    </div>`;
  }

  return `
  <div class="space-y-6">
    <div class="bg-gradient-to-br from-slate-900 via-teal-950 to-teal-800 rounded-3xl p-5 text-white shadow-xl">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div><p class="text-teal-200 text-xs font-bold uppercase tracking-wider">Minha família</p><h2 class="font-display text-2xl font-bold mt-1">Pessoas acompanhadas</h2><p class="text-slate-300 text-xs mt-1">Todos os perfis ficam dentro da mesma conta familiar.</p></div>
        <button onclick="addElder()" class="px-4 py-3 rounded-2xl bg-white text-teal-800 font-bold text-sm shadow-lg"><i class="ph-bold ph-user-plus mr-1"></i> ADICIONAR PESSOA</button>
      </div>
      <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">${S.elders.map(e=>`<button onclick="selectElder('${e.id}')" class="text-left p-4 rounded-2xl border ${e.id===S.activeElderId?'bg-white text-slate-900 border-white':'bg-white/10 text-white border-white/20 hover:bg-white/15'}"><div class="flex items-center gap-3"><span class="text-3xl">${e.avatar||'👵'}</span><span><b>${esc(e.name)}</b><span class="block text-xs opacity-75">${e.age?e.age+' anos':'Idade não informada'} ${e.id===S.activeElderId?'· selecionado':''}</span></span></div></button>`).join('')}</div>
    </div>

    <!-- Perfil do Idoso Acompanhado -->
    <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-between">
      <div class="flex items-center space-x-4">
        <div class="text-4xl p-3 bg-teal-50 dark:bg-teal-950 rounded-2xl border border-teal-100 dark:border-teal-900">${S.elder.avatar || '👵'}</div>
        <div>
          <h1 class="font-display text-xl font-bold text-slate-800 dark:text-slate-100">${S.elder.name}</h1>
          <p class="text-xs text-slate-500 dark:text-slate-400">${S.elder.age} anos · Monitoramento Ativo</p>
        </div>
      </div>
      <button onclick="simMiss()" class="hidden sm:inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 hover:bg-amber-200">
        <i class="ph-bold ph-bug"></i> Simular Atraso
      </button>
    </div>

    <!-- Indicadores Rápidos -->
    <div class="grid grid-cols-3 gap-3">
      <div class="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-4 rounded-2xl text-center">
        <div class="text-2xl font-bold text-emerald-700 dark:text-emerald-400 font-display">${c.ok}</div>
        <div class="text-xs font-medium text-emerald-800 dark:text-emerald-300">Confirmadas</div>
      </div>
      <div class="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-4 rounded-2xl text-center">
        <div class="text-2xl font-bold text-amber-700 dark:text-amber-400 font-display">${c.wait}</div>
        <div class="text-xs font-medium text-amber-800 dark:text-amber-300">Aguardando</div>
      </div>
      <div class="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 p-4 rounded-2xl text-center">
        <div class="text-2xl font-bold text-rose-700 dark:text-rose-400 font-display">${c.miss}</div>
        <div class="text-xs font-medium text-rose-800 dark:text-rose-300">Atrasadas</div>
      </div>
    </div>

    <!-- Alertas Recentes -->
    ${S.alerts.length && S.fam.perm.alerts ? `
    <div class="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-3xl p-5 space-y-3">
      <h2 class="font-bold text-rose-800 dark:text-rose-300 text-sm flex items-center gap-2">
        <i class="ph-bold ph-bell-ringing text-lg"></i> Alertas Ativos
      </h2>
      <div class="space-y-2">
        ${S.alerts.slice(0, 3).map(a => `
          <div class="bg-white dark:bg-slate-800 p-3 rounded-xl border border-rose-100 dark:border-rose-900/40 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
            <span>⚠️️ ${a.txt}</span>
            <span class="font-mono text-[10px] text-slate-400">${a.at}</span>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <!-- Lista de Medicamentos do Dia -->
    <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
      <h2 class="font-display font-bold text-lg text-slate-800 dark:text-slate-100">Programação de Hoje</h2>
      
      <div class="divide-y divide-slate-100 dark:divide-slate-700">
        ${sl.map(s => {
          const meta = SL[status(s)] || SL.sched;
          return `
          <div class="py-3 flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <span class="font-mono font-bold text-sm text-slate-500">${s.t}</span>
              <div>
                <div class="font-bold text-sm text-slate-800 dark:text-slate-200">${s.m.name}</div>
                <div class="text-xs text-slate-400">${s.m.dose} · ${s.m.per} comprimido(s)</div>
              </div>
            </div>
            <span class="px-2.5 py-1 rounded-full text-xs font-bold border ${meta.bg}">
              ${meta.label}
            </span>
          </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Níveis de Estoque -->
    <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
      <h2 class="font-display font-bold text-lg text-slate-800 dark:text-slate-100">Estoque de Medicamentos</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${S.meds.map(m => `
          <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div>
              <div class="font-bold text-sm text-slate-800 dark:text-slate-200">${m.name}</div>
              <div class="text-xs text-slate-400">Dura até ${endDate(m)}</div>
            </div>
            <div class="text-right">
              <div class="font-bold text-base ${m.stock <= m.min ? 'text-amber-600' : 'text-slate-700 dark:text-slate-300'}">${m.stock} un</div>
              ${m.stock <= m.min ? '<span class="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">Repor</span>' : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>

  </div>
  `;
}

function simMiss() {
  const m = S.meds[2];
  m.times = [hm(cl(nowM() - S.tol - 15))];
  S.logs = S.logs.filter(l => l.med !== m.id);
  save();
  checkAlerts();
  render();
}

/* Tela de Medicamentos */
function viewMeds() {
  return `
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="font-display text-2xl font-bold text-slate-800 dark:text-slate-100">Medicamentos Cadastrados</h1>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${S.meds.map(m => `
        <div class="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
          <div class="flex items-start justify-between">
            <div class="flex items-center space-x-3">
              <div class="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950 text-2xl flex items-center justify-center border border-teal-100 dark:border-teal-900">
                ${m.icon || '💊'}
              </div>
              <div>
                <h3 class="font-bold text-base text-slate-800 dark:text-slate-100">${m.name} ${m.dose}</h3>
                <p class="text-xs text-slate-400">${m.desc || 'Uso contínuo'}</p>
              </div>
            </div>
            <span class="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-lg">${m.times.join(', ')}</span>
          </div>

          <div class="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Estoque: <strong class="${m.stock <= m.min ? 'text-rose-500' : 'text-slate-700 dark:text-slate-200'}">${m.stock} comprimidos</strong></span>
            <span>Previsão: <strong>${endDate(m)}</strong></span>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Formulário Adicionar Remédio -->
    <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
      <h2 class="font-display font-bold text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
        <i class="ph-bold ph-plus-circle text-teal-600"></i> Adicionar Novo Medicamento
      </h2>

      <!-- OCR Simbólico -->
      <div class="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900/60 text-xs text-teal-800 dark:text-teal-300 space-y-2">
        <div class="flex items-center space-x-2 font-bold">
          <i class="ph-bold ph-camera text-base"></i>
          <span>Cadastrar por Foto da Caixa</span>
        </div>
        <p class="text-teal-600 dark:text-teal-400">Tire uma foto para preenchimento prévio das informações do remédio.</p>
        <input type="file" accept="image/*" capture="environment" id="ph" onchange="photo(this)" class="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-teal-600 file:text-white hover:file:bg-teal-700">
        <p id="ocr" class="font-semibold text-slate-600 dark:text-slate-300"></p>
      </div>

      <div class="space-y-3">
        <div>
          <label class="text-xs font-bold text-slate-600 dark:text-slate-300">Nome do Medicamento</label>
          <input id="n" type="text" placeholder="Ex.: Dipirona" class="w-full mt-1 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-bold text-slate-600 dark:text-slate-300">Dosagem</label>
            <input id="d" type="text" placeholder="Ex.: 500 mg" class="w-full mt-1 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
          </div>
          <div>
            <label class="text-xs font-bold text-slate-600 dark:text-slate-300">Horário Inicial</label>
            <input id="t" type="time" value="08:00" class="w-full mt-1 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-bold text-slate-600 dark:text-slate-300">Comprimidos por Tomada</label>
            <input id="p" type="number" min="1" value="1" class="w-full mt-1 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
          </div>
          <div>
            <label class="text-xs font-bold text-slate-600 dark:text-slate-300">Total na Caixa</label>
            <input id="q" type="number" min="1" value="30" class="w-full mt-1 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500">
          </div>
        </div>

        <button onclick="addMed()" class="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm shadow-lg shadow-teal-600/20 transition-all">
          Salvar Medicamento
        </button>
      </div>
    </div>
  </div>
  `;
}

function photo(i) {
  const f = i.files[0];
  if (!f) return;
  $('#ocr').textContent = 'Analisando imagem... Medicamento identificado (Simulação OCR): Losartana Potássica 50mg.';
  $('#n').value = 'Losartana Potássica';
  $('#d').value = '50 mg';
}

function addMed() {
  const n = $('#n').value.trim();
  if (!n) return alert('Informe o nome do medicamento.');
  S.meds.push({
    id: Date.now(),
    name: n,
    dose: $('#d').value || '1 dose',
    per: +$('#p').value || 1,
    stock: +$('#q').value || 30,
    min: 7,
    times: [$('#t').value || '08:00'],
    icon: '💊'
  });
  S.audit.push('Medicamento adicionado: ' + n);
  save();
  render();
}


/* Histórico & Relatórios */
function viewHist() {
  const rows = [...S.logs].reverse().map(l => {
    const m = S.meds.find(x => x.id === l.med);
    const meta = SL[l.status] || SL.sched;
    return `
    <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between border border-slate-100 dark:border-slate-800">
      <div>
        <div class="font-bold text-xs text-slate-800 dark:text-slate-200">${m ? m.name : 'Remédio'} — ${l.time}</div>
        <div class="text-[10px] text-slate-400">${l.date} ${l.reason ? '· Motivo: ' + l.reason : ''}</div>
      </div>
      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.bg}">${meta.label}</span>
    </div>
    `;
  }).join('') || '<p class="text-xs text-slate-400 text-center py-4">Sem registros ainda.</p>';

  const ad = S.meds.map(m => {
    const L = S.logs.filter(l => l.med === m.id);
    const p = L.length ? Math.round(L.filter(l => l.status === 'ok').length / L.length * 100) : 100;
    return `
    <div class="space-y-1">
      <div class="flex justify-between text-xs font-bold">
        <span>${m.name}</span>
        <span class="text-teal-600">${p}% de Adesão</span>
      </div>
      <div class="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div class="h-full bg-teal-500 rounded-full" style="width: ${p}%"></div>
      </div>
    </div>
    `;
  }).join('');

  return `
  <div class="space-y-6">
    <h1 class="font-display text-2xl font-bold text-slate-800 dark:text-slate-100">Histórico & Adesão</h1>

    <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
      <h2 class="font-display font-bold text-base text-slate-800 dark:text-slate-100">Taxa de Adesão Geral</h2>
      <div class="space-y-3">
        ${ad}
      </div>
      <button onclick="window.print()" class="w-full mt-2 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700">
        <i class="ph-bold ph-printer text-base"></i> Imprimir Relatório Médico (PDF)
      </button>
    </div>

    <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
      <h2 class="font-display font-bold text-base text-slate-800 dark:text-slate-100">Logs de Confirmações</h2>
      <div class="space-y-2 max-h-80 overflow-y-auto no-scrollbar">
        ${rows}
      </div>
    </div>
  </div>
  `;
}

/* Pedido de Ajuda */
function viewHelp() {
  return `
  <div class="space-y-6 max-w-lg mx-auto">
    <div class="text-center space-y-2">
      <div class="w-20 h-20 mx-auto rounded-3xl bg-rose-100 text-rose-600 flex items-center justify-center text-4xl shadow-xl shadow-rose-500/20">
        <i class="ph-bold ph-warning-circle"></i>
      </div>
      <h1 class="font-display text-2xl font-bold text-slate-800 dark:text-slate-100">Central de Ajuda</h1>
      <p class="text-xs text-slate-500 dark:text-slate-400">Entre em contato rápido com seu familiar responsável.</p>
    </div>

    <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4 text-center">
      <div class="text-lg font-bold">${S.fam.name} (${S.fam.rel})</div>

      <div class="grid grid-cols-1 gap-3">
        <a href="tel:192" class="py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-base flex items-center justify-center space-x-2 shadow-lg shadow-rose-600/30">
          <i class="ph-bold ph-phone-call text-2xl"></i>
          <span>LIGAR PARA EMERGÊNCIA (192)</span>
        </a>

        <button onclick="S.alerts.unshift({id:'h'+Date.now(),txt:'${S.elder.name.split(' ')[0]} solicitou ajuda via aplicativo!',at:hm(nowM())});save();alert('Notificação de alerta enviada para ${S.fam.name}!');" class="py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold text-base flex items-center justify-center space-x-2">
          <i class="ph-bold ph-bell-ringing text-2xl"></i>
          <span>ENVIAR ALERTA AO FAMILIAR</span>
        </button>
      </div>
    </div>
  </div>
  `;
}

/* Configurações Familiares & Compartilhamento */
function viewShare() {
  const p = S.fam.perm;
  return `
  <div class="space-y-6">
    <h1 class="font-display text-2xl font-bold text-slate-800 dark:text-slate-100">Gerenciar Permissões</h1>

    <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
      <h2 class="font-display font-bold text-lg text-slate-800 dark:text-slate-100">${S.fam.name} (${S.fam.rel})</h2>

      <div class="space-y-3">
        <label class="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50">
          <span class="text-sm font-medium">Permitir visualizar medicamentos</span>
          <input type="checkbox" ${p.view ? 'checked' : ''} onchange="S.fam.perm.view=this.checked;save();" class="w-5 h-5 accent-teal-600">
        </label>

        <label class="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50">
          <span class="text-sm font-medium">Receber notificações de atraso</span>
          <input type="checkbox" ${p.alerts ? 'checked' : ''} onchange="S.fam.perm.alerts=this.checked;save();" class="w-5 h-5 accent-teal-600">
        </label>
      </div>

      <div class="pt-2">
        <label class="text-xs font-bold text-slate-600 dark:text-slate-300">Tolerância para Atraso (Minutos)</label>
        <input type="number" value="${S.tol}" onchange="S.tol=+this.value;save();" class="w-full mt-1 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm">
      </div>
    </div>
  </div>
  `;
}

function render() {
  // Aplicar variáveis dinâmicas de acessibilidade
  document.body.classList.toggle('hc', S.hc);
  document.documentElement.style.setProperty('--app-fs', S.fs + 'px');

  const container = $('#app');
  if (!container) return;

  // Renderizar Welcome Screen se não houver papel selecionado
  if (!role) {
    container.innerHTML = viewWelcome();
    return;
  }

  // Layout Principal com Header, Sidebar e Bottom Navigation
  let content = '';

  if (role === 'elder') {
    switch (tab) {
      case 'meds': content = viewMeds(); break;
      case 'hist': content = viewHist(); break;
      case 'help': content = viewHelp(); break;
      case 'share': content = viewShare(); break;
      default: content = viewElderHome(); break;
    }
  } else {
    switch (tab) {
      case 'meds': content = viewMeds(); break;
      case 'hist': content = viewHist(); break;
      case 'share': content = viewShare(); break;
      default: content = viewFamHome(); break;
    }
  }

  container.innerHTML = `
    ${renderHeader()}
    
    <div class="flex-1 max-w-7xl w-full mx-auto flex">
      ${renderSidebar()}
      
      <main class="flex-1 p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 overflow-x-hidden">
        ${content}
      </main>
    </div>

    ${renderBottomNav()}
  `;
}

// CUIDAR+ 2.0 — camada de evolução do protótipo
(function(){
  const originalRender = render;
  const originalPhoto = photo;

  // Datas locais: evita mudança de dia causada por UTC.
  window.today = function(){ const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };

  function upgradeState(){
    S.version = 3;
    S.account = S.account || { createdAt:new Date().toISOString(), pinHash:null, locked:false };
    S.account.owner = S.account.owner || null;
    S.account.elderAccess = S.account.elderAccess || { enabled:true, code:'CUIDAR123', label:S.elder?.name || 'Modo simples' };
    S.account.loggedIn = !!authSession;
    S.settings = S.settings || { notifications:false, sound:true, voice:true, voiceReminders:true, quietStart:'22:00', quietEnd:'07:00' };
    if(typeof S.settings.voiceReminders==='undefined') S.settings.voiceReminders=true;
    // Migração: transforma o antigo único idoso em uma lista de idosos dentro da conta da família.
    if(!Array.isArray(S.elders) || !S.elders.length){
      S.elders=[{ id:'elder-1', name:S.elder?.name||'Maria da Silva', age:S.elder?.age||74, avatar:S.elder?.avatar||'👵', meds:S.meds||[], logs:S.logs||[], alerts:S.alerts||[], tol:S.tol||30, fam:{...S.fam} }];
      S.activeElderId='elder-1';
    }
    S.activeElderId=S.activeElderId || S.elders[0].id;
    const active=S.elders.find(e=>e.id===S.activeElderId)||S.elders[0];
    S.elder=active; S.meds=active.meds||[]; S.logs=active.logs||[]; S.alerts=active.alerts||[]; S.tol=active.tol??30;
    S.elders.forEach(e=>{if(!e.sex)e.sex=(e.avatar==='👴'||e.avatar==='👨')?'m':(e.avatar==='👵'||e.avatar==='👩')?'f':'n';e.meds=e.meds||[];e.logs=e.logs||[];e.alerts=e.alerts||[];e.tol=e.tol??30;if(!e.accessPin)e.accessPin=genUniquePin();});
    S.documents = Array.isArray(S.documents) ? S.documents : [];
    S.caregivers = Array.isArray(S.caregivers) ? S.caregivers : [{...S.fam, id:'fam-1', status:'ativo'}];
    S.audit = Array.isArray(S.audit) ? S.audit : [];
    S.meds = (S.meds||[]).map(m=>({
      ...m,
      days:Array.isArray(m.days)&&m.days.length?m.days:[0,1,2,3,4,5,6],
      startDate:m.startDate||today(), endDate:m.endDate||'', instructions:m.instructions||'',
      stockUnit:m.stockUnit||'comprimidos', min:m.min||7
    }));
    S.fam.perm = {...{view:true,alerts:true,edit:false}, ...(S.fam.perm||{})};
    save();
  }
  window.upgradeFirebaseState = upgradeState;
  upgradeState();

  window.selectElder = function(id){
    if(!isFamily()) return alert('Somente o familiar responsável pode trocar o perfil acompanhado.');
    const current=S.elders.find(e=>e.id===S.activeElderId);
    if(current){current.name=S.elder.name;current.age=S.elder.age;current.avatar=S.elder.avatar;current.meds=S.meds;current.logs=S.logs;current.alerts=S.alerts;current.tol=S.tol;}
    const next=S.elders.find(e=>e.id===id); if(!next) return;
    S.activeElderId=id; S.elder=next; S.meds=next.meds; S.logs=next.logs; S.alerts=next.alerts; S.tol=next.tol??30;
    S.account.elderAccess={enabled:true,code:next.code||('CUIDAR-'+Math.random().toString(36).slice(2,8)).toUpperCase(),label:next.name};
    save(); render();
  };
  window.addElder = function(){
    if(!isFamily()) return alert('Somente o familiar responsável pode cadastrar pessoas.');
    if(document.getElementById('person-modal')) return;
    const o=document.createElement('div'); o.id='person-modal'; o.className='fixed inset-0 z-[80] bg-slate-900/70 flex items-end sm:items-center justify-center p-3';
    o.innerHTML=`<div class="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-2xl max-h-[90vh] overflow-y-auto"><h2 class="font-display text-xl font-bold mb-3">Adicionar pessoa</h2><div class="space-y-3"><input id="pmName" class="field" placeholder="Nome (ex.: João)" autocomplete="off"><input id="pmAge" class="field" type="number" inputmode="numeric" placeholder="Idade (opcional)"><fieldset><legend class="text-sm font-semibold mb-2">Essa pessoa é...</legend><div class="grid grid-cols-3 gap-2">${[['f','Mulher','👩'],['m','Homem','👨'],['n','Prefiro não dizer','🧑']].map(x=>`<label class="cursor-pointer"><input type="radio" name="pmSex" value="${x[0]}" class="peer sr-only"><div class="h-[4.5rem] rounded-2xl border-2 border-slate-300 dark:border-slate-600 peer-checked:border-teal-600 peer-checked:bg-teal-50 dark:peer-checked:bg-teal-950/40 flex flex-col items-center justify-center text-xs font-bold text-center leading-tight px-1"><span class="text-2xl">${x[2]}</span>${x[1]}</div></label>`).join('')}</div></fieldset></div><div class="grid grid-cols-2 gap-2 mt-4"><button onclick="document.getElementById('person-modal').remove()" class="py-3 rounded-xl border font-bold">Cancelar</button><button onclick="confirmAddPerson()" class="py-3 rounded-xl bg-teal-600 text-white font-bold">Adicionar</button></div></div>`;
    document.body.appendChild(o); setTimeout(()=>document.getElementById('pmName')?.focus(),50);
  };
  window.confirmAddPerson = function(){
    const name=(document.getElementById('pmName')?.value||'').trim(), age=Number(document.getElementById('pmAge')?.value)||0, sex=document.querySelector('input[name=pmSex]:checked')?.value;
    if(!name) return alert('Digite o nome da pessoa.');
    if(!sex) return alert('Escolha se a pessoa é mulher, homem ou prefere não dizer.');
    document.getElementById('person-modal')?.remove();
    const id='elder-'+Date.now();
    const code=('CUIDAR-'+Math.random().toString(36).slice(2,8)).toUpperCase();
    const e={id,name,age,sex,avatar:avatarFor(sex,age),meds:[],logs:[],alerts:[],tol:30,code,accessPin:genUniquePin()};
    S.elders.push(e); save();
    S.activeElderId=id; S.elder=e; S.meds=e.meds; S.logs=e.logs; S.alerts=e.alerts; S.tol=e.tol;
    S.audit.unshift(`${new Date().toLocaleString('pt-BR')} — Novo perfil criado: ${e.name}.`); save(); window.pinVisible[e.id]=true; render();
    alert(`Perfil de ${e.name} criado.\n\nPIN para ${e.name} entrar: ${e.accessPin}\n\nVocê pode copiar e rever o PIN em Conta & Segurança.`);
  };
  window.saveProfile = function(){
    S.elder.name=$('#elderName').value.trim()||S.elder.name; S.elder.age=+$('#elderAge').value||S.elder.age;
    const sx=$('#elderSex')?.value; if(sx){ S.elder.sex=sx; S.elder.avatar=avatarFor(sx,S.elder.age); }
    save(); render();
  };
  window.removeElder = function(id){
    if(!isFamily() || S.elders.length<=1) return alert('Mantenha pelo menos um perfil.');
    const e=S.elders.find(x=>x.id===id); if(!e) return;
    if(!confirm(`Remover o perfil de ${e.name}? O histórico deste perfil será removido deste dispositivo.`)) return;
    S.elders=S.elders.filter(x=>x.id!==id);
    const next=S.elders[0]; S.activeElderId=next.id; S.elder=next; S.meds=next.meds; S.logs=next.logs; S.alerts=next.alerts; S.tol=next.tol;
    S.audit.unshift(`${new Date().toLocaleString('pt-BR')} — Perfil removido: ${e.name}.`); save(); render();
  };

  function dateObj(s){ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
  function activeDay(m){
    const d=new Date(), dow=d.getDay(), ds=today();
    return (!m.startDate || ds>=m.startDate) && (!m.endDate || ds<=m.endDate) && (m.days||[0,1,2,3,4,5,6]).includes(dow);
  }
  function expectedSlots(){ return S.meds.flatMap(m=>activeDay(m)?m.times.map(t=>({m,t})):[]).sort((a,b)=>a.t.localeCompare(b.t)); }
  window.slots = expectedSlots;
  window.logOf = function(m,t){ return S.logs.find(l=>l.med===m.id&&l.time===t&&l.date===today()); };
  window.status = function(s){
    const l=logOf(s.m,s.t); if(l) return l.status;
    const [h,mi]=s.t.split(':').map(Number), d=nowM()-(h*60+mi);
    return d<0?'sched':d<=Number(S.tol||30)?'wait':'miss';
  };

  function notify(title, body){
    if(!S.settings.notifications) return;
    if('Notification' in window && Notification.permission==='granted'){
      systemNotify(title,body,'cuidar-'+Date.now());
    }
    if(S.settings.sound && 'speechSynthesis' in window) speak(body);
  }

  window.requestNotifications = async function(){
    if(!('Notification' in window)){ alert('Este navegador não oferece notificações.'); return; }
    const p=await Notification.requestPermission(); S.settings.notifications=p==='granted'; save(); render();
    alert(p==='granted'?'Notificações ativadas neste dispositivo.':'As notificações não foram autorizadas.');
  };

  window.checkMedicationReminders = function(){
    if(!role && !demo) return; // sem sessão aberta, não dispara aviso
    S.reminded=S.reminded||{};
    const nm=nowM();
    expectedSlots().filter(s=>{ const [hh,mm]=s.t.split(':').map(Number); const d=nm-(hh*60+mm); return d>=0&&d<=10&&!logOf(s.m,s.t); }).forEach(s=>{
      const id=`${s.m.id}-${s.t}-${today()}`;
      if(S.reminded[id]) return;
      S.reminded[id]=Date.now();
      const text=`Está na hora de tomar ${s.m.name}, ${s.m.dose}. Tome ${s.m.per} comprimido${s.m.per>1?'s':''}.`;
      S.alerts.unshift({id:'rem-'+id,txt:text,at:hm(nowM()),type:'medication',severity:'info'});
      S.audit.unshift(`${new Date().toLocaleString('pt-BR')} — Lembrete sonoro: ${text}`);
      save();
      fireDoseAlarm(s,text);
    });
  };


  window.checkAlerts = function(){
    checkMedicationReminders();
    const sl=expectedSlots();
    sl.forEach(s=>{
      if(status(s)==='miss'){
        const id=`${s.m.id}-${s.t}-${today()}`;
        if(!S.alerts.find(a=>a.id===id)){
          const txt=`A dose de ${s.m.name} das ${s.t} ainda não foi confirmada.`;
          S.alerts.unshift({id,txt,at:hm(nowM()),type:'medication',severity:'warning'});
          notify('CUIDAR+ — dose pendente',txt);
          S.audit.push(`${new Date().toLocaleString('pt-BR')} — alerta: ${txt}`);
        }
      }
    });
    save();
  };

  window.act = function(mid,t,st,reason){
    const m=S.meds.find(x=>x.id===mid); if(!m) return;
    const old=logOf(m,t);
    S.logs=S.logs.filter(l=>!(l.med===mid&&l.time===t&&l.date===today()));
    S.logs.push({med:mid,time:t,date:today(),status:st,at:hm(nowM()),reason});
    // Evita descontar estoque duas vezes ao editar/reconfirmar a mesma dose.
    if(st==='ok' && (!old || old.status!=='ok')) m.stock=Math.max(0,m.stock-m.per);
    if(old && old.status==='ok' && st!=='ok') m.stock+=m.per;
    const msg=`${m.name} ${t}: ${SL[st]?.label||st}`;
    S.audit.unshift(`${new Date().toLocaleString('pt-BR')} — ${msg}`);
    S.alerts=S.alerts.filter(a=>!(a.id===`${mid}-${t}-${today()}`&&st==='ok'));
    save(); render();
  };

  window.deferDose = function(mid,t){
    act(mid,t,'later','Lembrar novamente em 30 minutos');
    const id=`defer-${mid}-${t}`;
    S.deferred=S.deferred||{};
    S.deferred[id]=Date.now()+30*60000;
    save();
    notify('CUIDAR+ — lembrete adiado',`Vou lembrar novamente em 30 minutos sobre ${S.meds.find(m=>m.id===mid)?.name||'o medicamento'}.`);
  };

  window.simMiss = function(){ const s=expectedSlots().find(x=>status(x)!=='ok'); if(s) act(s.m.id,s.t,'no','Simulação de atraso'); };

  // Adiciona uma medicação com múltiplos horários, dias, período e instruções.
  window.addMed = function(){
    if(isElder()) return alert('Somente o familiar responsável pode cadastrar medicamentos.');
    const n=$('#n')?.value.trim(); if(!n) return alert('Informe o nome do medicamento.');
    const times=($('#times')?.value||$('#t')?.value||'08:00').split(',').map(x=>x.trim()).filter(Boolean).filter(x=>/^([01]?\d|2[0-3]):[0-5]\d$/.test(x));
    if(!times.length) return alert('Informe pelo menos um horário válido.');
    const days=[...document.querySelectorAll('input[name="days"]:checked')].map(x=>+x.value);
    const med={id:Date.now(),name:n,dose:$('#d')?.value||'1 dose',per:+($('#p')?.value||1),stock:+($('#q')?.value||30),min:+($('#minStock')?.value||7),times,days:days.length?days:[0,1,2,3,4,5,6],startDate:$('#startDate')?.value||today(),endDate:$('#endDate')?.value||'',instructions:$('#instructions')?.value||'',icon:'💊'};
    S.meds.push(med); S.audit.unshift(`${new Date().toLocaleString('pt-BR')} — Medicamento adicionado: ${n}`); save(); render();
  };

  window.photo = function(i){
    const f=i.files?.[0]; if(!f) return;
    const out=$('#ocr'); if(out) out.textContent='Imagem recebida. Para OCR farmacêutico real, conecte um serviço de visão/OCR seguro; os campos não serão preenchidos com dados inventados.';
  };

  window.removeMed = function(id){
    if(isElder()) return alert('Somente o familiar responsável pode remover medicamentos.');
    const m=S.meds.find(x=>x.id===id); if(!m) return;
    if(!confirm(`Remover ${m.name}? O histórico existente será preservado.`)) return;
    S.meds=S.meds.filter(x=>x.id!==id); S.audit.unshift(`${new Date().toLocaleString('pt-BR')} — Medicamento removido: ${m.name}`); save(); render();
  };

  window.updateStock = function(id,delta){ if(isElder()) return alert('Somente o familiar responsável pode alterar o estoque.'); const m=S.meds.find(x=>x.id===id); if(!m)return; m.stock=Math.max(0,m.stock+delta); save(); render(); };

  window.exportData = function(){ if(isElder()) return alert('O backup da conta é gerenciado pelo familiar responsável.');
    const blob=new Blob([JSON.stringify({...S, exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`cuidar-mais-backup-${today()}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  window.importData = function(input){
    const f=input.files?.[0]; if(!f)return;
    const r=new FileReader(); r.onload=()=>{ try{const d=JSON.parse(r.result); if(!d.elder||!Array.isArray(d.meds)||!Array.isArray(d.logs)) throw Error(); S=d; upgradeState(); alert('Backup restaurado com sucesso.'); render();}catch(e){alert('Arquivo de backup inválido.');} }; r.readAsText(f);
  };

  window.setPin = async function(){ if(isElder()) return alert('Somente o familiar responsável pode alterar a proteção da conta.');
    const pin=prompt('Crie um PIN de 4 a 8 números:'); if(!/^\d{4,8}$/.test(pin||'')) return alert('PIN inválido.');
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pin));
    S.account.pinHash=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join(''); S.account.locked=true; save(); alert('PIN configurado. Ele será usado como proteção local deste dispositivo.'); render();
  };
  window.unlockLocal = async function(){
    if(!S.account.pinHash){role='elder';return render();}
    const pin=prompt('Digite seu PIN:'); if(!pin)return;
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pin));
    const h=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(h===S.account.pinHash){S.account.locked=false;sessionStorage.setItem('cuidar_unlocked','1');render();} else alert('PIN incorreto.');
  };

  function adherence(m,days=30){
    let expected=0,ok=0; const base=new Date();
    for(let i=0;i<days;i++){
      const d=new Date(base); d.setDate(base.getDate()-i); const ds=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
      if(m.startDate&&ds<m.startDate)continue; if(m.endDate&&ds>m.endDate)continue;
      if(!(m.days||[0,1,2,3,4,5,6]).includes(d.getDay()))continue;
      for(const t of m.times){ expected++; const l=S.logs.find(x=>x.med===m.id&&x.date===ds&&x.time===t); if(l?.status==='ok')ok++; }
    }
    return {expected,ok,pct:expected?Math.round(ok/expected*100):100};
  }

  function card(title,body,cls='') { return `<section class="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm ${cls}"><h2 class="font-display font-bold text-lg mb-4">${title}</h2>${body}</section>`; }
  const dayLabels=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  window.viewMeds = function(){
    const admin=isFamily();
    return `<div class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3"><div><h1 class="font-display text-2xl font-bold">Medicamentos</h1><p class="text-xs text-slate-500">Cadastro completo, estoque e horários recorrentes.</p></div><button onclick="go('account')" class="px-4 py-2 rounded-xl border font-bold text-sm">Privacidade & Backup</button></div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">${S.meds.map(m=>{const a=adherence(m);return `<div class="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-4"><div class="flex justify-between gap-3"><div class="flex gap-3"><div class="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950 flex items-center justify-center text-2xl">${m.icon||'💊'}</div><div><h3 class="font-bold">${esc(m.name)} ${esc(m.dose)}</h3><p class="text-xs text-slate-500">${esc(m.instructions||'Uso conforme orientação profissional')}</p></div></div><button onclick="removeMed(${m.id})" class="text-rose-500 p-2" title="Remover"><i class="ph-bold ph-trash"></i></button></div><div class="grid grid-cols-2 gap-2 text-xs"><div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900">Horários<strong class="block text-sm">${m.times.join(', ')}</strong></div><div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900">Adesão 30d<strong class="block text-sm text-teal-600">${a.pct}%</strong></div><div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900">Estoque<strong class="block text-sm ${m.stock<=m.min?'text-rose-600':''}">${m.stock} ${m.stockUnit}</strong></div><div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900">Previsão<strong class="block text-sm">${endDate(m)}</strong></div></div><div class="flex gap-2"><button onclick="updateStock(${m.id},1)" class="flex-1 py-2 rounded-xl border font-bold">+ estoque</button><button onclick="updateStock(${m.id},-1)" class="flex-1 py-2 rounded-xl border font-bold">- estoque</button></div></div>`}).join('')}</div>
      ${admin?card('Adicionar medicamento',`<div class="space-y-3"><div class="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-xs"><b>Cadastro por foto</b><input type="file" accept="image/*" capture="environment" onchange="photo(this)" class="block mt-2 w-full text-xs"><p id="ocr" class="mt-2"></p></div><input id="n" class="field" placeholder="Nome do medicamento"><input id="d" class="field" placeholder="Dosagem (ex.: 50 mg)"><div class="grid grid-cols-2 gap-3"><input id="times" class="field" placeholder="Horários: 08:00, 20:00"><input id="p" type="number" min="1" value="1" class="field" placeholder="Qtd. por tomada"></div><div class="grid grid-cols-2 gap-3"><input id="q" type="number" min="0" value="30" class="field" placeholder="Estoque"><input id="minStock" type="number" min="0" value="7" class="field" placeholder="Estoque mínimo"></div><div><label class="text-xs font-bold">Dias da semana</label><div class="grid grid-cols-7 gap-1 mt-2">${dayLabels.map((d,i)=>`<label class="text-center text-[10px] p-2 rounded-lg bg-slate-50 dark:bg-slate-900"><input type="checkbox" name="days" value="${i}" checked><span class="block">${d}</span></label>`).join('')}</div></div><div class="grid grid-cols-2 gap-3"><input id="startDate" type="date" value="${today()}" class="field"><input id="endDate" type="date" class="field"></div><textarea id="instructions" class="field" rows="2" placeholder="Orientações: após refeição, em jejum, etc."></textarea><button onclick="addMed()" class="w-full py-3.5 rounded-xl bg-teal-600 text-white font-bold">Salvar medicamento</button></div>`):''}
    </div>`;
  };

  window.viewHist = function(){
    const ads=S.meds.map(m=>{const a=adherence(m);return `<div><div class="flex justify-between text-xs font-bold"><span>${esc(m.name)}</span><span>${a.pct}% · ${a.ok}/${a.expected} doses</span></div><div class="h-2 bg-slate-100 rounded-full mt-1"><div class="h-full bg-teal-500 rounded-full" style="width:${a.pct}%"></div></div></div>`}).join('');
    const rows=[...S.logs].sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time)).slice(0,80).map(l=>{const m=S.meds.find(x=>x.id===l.med);const meta=SL[l.status]||SL.sched;return `<div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 flex justify-between text-xs"><span><b>${esc(m?.name||'Medicamento')}</b> · ${l.date} ${l.time}<br><span class="text-slate-400">${esc(l.reason||'')}</span></span><span class="px-2 py-1 rounded-full border ${meta.bg} h-fit">${meta.label}</span></div>`}).join('');
    return `<div class="space-y-6"><div class="flex justify-between items-center"><div><h1 class="font-display text-2xl font-bold">Acompanhamento</h1><p class="text-xs text-slate-500">Adesão calculada sobre todas as doses esperadas no período.</p></div><button onclick="printReport()" class="px-4 py-2 rounded-xl bg-teal-600 text-white font-bold text-sm">Gerar relatório</button></div>` + card('Adesão dos últimos 30 dias','<div class="space-y-4">'+ads+'</div>') + card('Histórico de registros','<div class="space-y-2 max-h-96 overflow-auto">'+(rows||'<p class="text-xs text-slate-400">Sem registros.</p>')+'</div>') + `</div>`;
  };

  window.printReport = function(){
    const a=S.meds.map(m=>{const x=adherence(m);return `${m.name}: ${x.pct}% (${x.ok}/${x.expected})`;}).join('\n');
    const w=window.open('','_blank','width=800,height=900'); if(!w)return alert('Permita pop-ups para gerar o relatório.');
    w.document.write(`<html><head><title>CUIDAR+ — Relatório</title><style>body{font-family:Arial;padding:32px;line-height:1.5}h1{color:#0f766e}pre{white-space:pre-wrap}</style></head><body><h1>CUIDAR+</h1><h2>Relatório de acompanhamento</h2><p>Paciente: ${esc(S.elder.name)} — ${S.elder.age} anos</p><p>Gerado em: ${new Date().toLocaleString('pt-BR')}</p><pre>${esc(a)}</pre><hr><p>Este relatório é um resumo de registros do aplicativo e não substitui avaliação ou prescrição profissional.</p></body></html>`);w.document.close();w.focus();setTimeout(()=>w.print(),300);
  };

  window.viewShare = function(){
    if(isElder()) return `<div class="space-y-6 max-w-lg mx-auto"><h1 class="font-display text-2xl font-bold">Minha família</h1>${card('Familiar responsável',`<div class="flex items-center gap-3"><div class="w-12 h-12 rounded-2xl bg-teal-100 flex items-center justify-center text-2xl">👩</div><div><b>${esc(S.account.owner?.name||S.fam.name)}</b><p class="text-xs text-slate-500">${esc(S.fam.rel||'Familiar responsável')}</p></div></div>`)}${card('O que posso fazer?',`<div class="space-y-2 text-sm"><div class="p-3 rounded-xl bg-emerald-50 text-emerald-800">✓ Consultar meus medicamentos</div><div class="p-3 rounded-xl bg-emerald-50 text-emerald-800">✓ Confirmar que tomei a dose</div><div class="p-3 rounded-xl bg-rose-50 text-rose-800">✕ Não posso cadastrar ou editar medicamentos</div><div class="p-3 rounded-xl bg-rose-50 text-rose-800">✕ Não posso alterar estoque ou conta</div></div>`)}<p class="text-xs text-slate-500">Para alterar qualquer informação, fale com o familiar responsável.</p></div>`;
    return `<div class="space-y-6"><h1 class="font-display text-2xl font-bold">Cuidado compartilhado</h1>${card('Familiar responsável',`<div class="flex items-center justify-between"><div><b>${esc(S.fam.name)}</b><p class="text-xs text-slate-500">${esc(S.fam.rel)} · ${S.fam.status||'ativo'}</p></div><span class="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">${S.fam.status||'ativo'}</span></div>`)}${card('Permissões',`<div class="space-y-3">${[['view','Visualizar medicamentos'],['alerts','Receber alertas de atraso'],['edit','Editar medicamentos']].map(([k,l])=>`<label class="flex justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/50"><span class="text-sm">${l}</span><input type="checkbox" ${S.fam.perm[k]?'checked':''} onchange="S.fam.perm.${k}=this.checked;save();render()" class="w-5 h-5 accent-teal-600"></label>`).join('')}</div><div class="mt-4"><label class="text-xs font-bold">Tolerância para atraso (min)</label><input type="number" min="0" value="${S.tol}" onchange="S.tol=Math.max(0,+this.value||0);save();render()" class="field mt-1"></div>`)}<button onclick="requestNotifications()" class="w-full py-3 rounded-xl bg-teal-600 text-white font-bold">${S.settings.notifications?'Notificações ativadas':'Ativar notificações deste dispositivo'}</button></div>`;
  };

  window.viewAccount = function(){
    const notif=('Notification' in window)?Notification.permission:'unsupported';
    return `<div class="space-y-6"><h1 class="font-display text-2xl font-bold">Conta da família</h1>${card('Responsável',`<p class="text-sm"><b>${esc(S.account.owner?.name||S.fam.name)}</b><br><span class="text-xs text-slate-500">${esc(S.account.owner?.email||'')}</span></p>`)}${card('Pessoas cuidadas',`<div class="space-y-2">${S.elders.map(e=>`<div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 flex items-center justify-between gap-3"><div><b>${esc(e.name)}</b><p class="text-xs text-slate-500">${e.age?e.age+' anos':'Idade não informada'} ${e.id===S.activeElderId?'· ativo':''}</p></div><div class="flex gap-2"><button onclick="selectElder('${e.id}')" class="px-3 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold">Selecionar</button>${S.elders.length>1?`<button onclick="removeElder('${e.id}')" class="px-3 py-2 rounded-xl border border-rose-200 text-rose-600 text-xs font-bold">Remover</button>`:''}</div></div>`).join('')}</div><button onclick="addElder()" class="mt-3 w-full py-3 rounded-xl border-2 border-dashed border-teal-300 text-teal-700 font-bold">+ ADICIONAR OUTRA PESSOA</button>`)}${pinCard()}${card('Permissões da pessoa cuidada',`<div class="space-y-2 text-sm"><div class="flex justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900"><span>Ver medicamentos</span><b>Permitido</b></div><div class="flex justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900"><span>Confirmar dose</span><b>Permitido</b></div><div class="flex justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900"><span>Cadastrar/editar medicamento</span><b class="text-rose-600">Bloqueado</b></div><div class="flex justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900"><span>Alterar estoque</span><b class="text-rose-600">Bloqueado</b></div><div class="flex justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900"><span>Alterar conta</span><b class="text-rose-600">Bloqueado</b></div></div>`)}${card('Perfil da pessoa cuidada',`<div class="grid grid-cols-1 md:grid-cols-2 gap-3"><input id="elderName" class="field" value="${esc(S.elder.name)}" placeholder="Nome"><input id="elderAge" class="field" type="number" value="${S.elder.age}" placeholder="Idade"><select id="elderSex" class="field"><option value="f" ${S.elder.sex==='f'?'selected':''}>Mulher</option><option value="m" ${S.elder.sex==='m'?'selected':''}>Homem</option><option value="n" ${S.elder.sex==='n'?'selected':''}>Prefiro não dizer</option></select></div><button onclick="saveProfile()" class="mt-3 px-4 py-2 rounded-xl bg-teal-600 text-white font-bold">Salvar perfil</button>`)}${card('Segurança da conta',`<p class="text-xs text-slate-500 mb-3">A senha pertence à conta do familiar. A pessoa cuidada não altera senha, conta, medicamentos ou configurações administrativas.</p><div class="space-y-2"><input id="currentPassword" type="password" class="field" placeholder="Senha atual"><input id="newPassword" type="password" class="field" placeholder="Nova senha (mínimo 6 caracteres)"><input id="confirmPassword" type="password" class="field" placeholder="Confirmar nova senha"><button onclick="changePassword()" class="w-full py-3 rounded-xl bg-teal-600 text-white font-bold">ALTERAR SENHA</button></div>`)}${card('Notificações e voz',`<div class="space-y-3"><div class="text-xs">Permissão do navegador: <b>${notif}</b></div><button onclick="requestNotifications()" class="w-full py-3 rounded-xl bg-teal-600 text-white font-bold">Testar/ativar notificações</button><label class="flex justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900"><span>Resposta por voz</span><input type="checkbox" ${S.settings.voice?'checked':''} onchange="S.settings.voice=this.checked;save()"></label><label class="flex justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900"><span>Som nos lembretes</span><input type="checkbox" ${S.settings.sound?'checked':''} onchange="S.settings.sound=this.checked;save()"></label><label class="flex justify-between p-3 rounded-xl bg-teal-50 dark:bg-teal-950/40"><span><b>Lembrete falado na hora</b><small class="block text-xs text-slate-500">“Está na hora de tomar...”</small></span><input type="checkbox" ${S.settings.voiceReminders?'checked':''} onchange="S.settings.voiceReminders=this.checked;save()"></label></div>`)}${card('Backup e portabilidade',`<p class="text-xs text-slate-500 mb-3">Exporte um backup dos dados da sua conta Firebase em formato JSON. As alterações são sincronizadas com o Firestore.</p><div class="grid grid-cols-2 gap-3"><button onclick="exportData()" class="py-3 rounded-xl border font-bold">Exportar</button><label class="py-3 rounded-xl border font-bold text-center cursor-pointer">Importar<input type="file" accept="application/json" onchange="importData(this)" class="hidden"></label></div>`)}${card('Documentos de saúde',`<div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 text-xs">${S.documents.length?S.documents.map(d=>`<div>${esc(d.name)}</div>`).join(''):'Nenhum documento cadastrado.'}</div><p class="text-[11px] text-slate-400 mt-2">A estrutura está preparada para receitas, prescrições e documentos; o armazenamento seguro de arquivos ainda requer backend/serviço de documentos.</p>`)}${card('Auditoria',`<div class="max-h-48 overflow-auto text-[11px] space-y-1">${S.audit.slice(0,50).map(x=>`<div class="p-2 rounded bg-slate-50 dark:bg-slate-900">${esc(x)}</div>`).join('')}</div>`)}</div>`;
  };

  window.viewHelp = function(){ return `<div class="space-y-6 max-w-lg mx-auto"><div class="text-center"><div class="w-20 h-20 mx-auto rounded-3xl bg-rose-100 text-rose-600 flex items-center justify-center text-4xl"><i class="ph-bold ph-warning-circle"></i></div><h1 class="font-display text-2xl font-bold mt-3">Central de Ajuda</h1><p class="text-xs text-slate-500">Use os contatos cadastrados e os serviços de emergência da sua região.</p></div>${card('Ações rápidas',`<div class="grid gap-3"><a href="tel:192" class="py-4 rounded-2xl bg-rose-600 text-white font-bold text-center">LIGAR PARA O SAMU — 192</a><button onclick="S.alerts.unshift({id:'help-'+Date.now(),txt:'${esc(S.elder.name)} solicitou ajuda pelo CUIDAR+.',at:hm(nowM()),type:'help',severity:'high'});S.audit.unshift(new Date().toLocaleString('pt-BR')+' — pedido de ajuda');save();notify('CUIDAR+ — pedido de ajuda','${esc(S.elder.name)} solicitou ajuda.');alert('Pedido registrado neste dispositivo.');render()" class="py-4 rounded-2xl bg-amber-500 font-bold">ALERTAR FAMILIAR</button></div>`)}${card('Informação importante',`<p class="text-xs text-slate-600 dark:text-slate-300">O botão de emergência telefona pelo dispositivo. O alerta familiar deste protótipo é local; para avisar outro celular é necessário backend/push ou integração com um serviço de mensagens.</p>`)}</div>`; };

  window.voice = async function(){
    if(window.__voiceBusy) return; window.__voiceBusy=true;
    const btn=$('#voice-btn'), delay=ms=>new Promise(r=>setTimeout(r,ms));
    const ask=async(q)=>{ await speak(q); await delay(400); toast('🎤 Ouvindo... diga SIM ou NÃO'); const a=(await listen(6000)).toLowerCase(); return /\b(sim|isso|confirmo|tomei|foi|claro|pode)\b/.test(a); };
    try{
      toast('🎤 Ouça o aviso e depois fale');
      await speak('Pode falar.');
      await delay(400);
      if(btn) btn.classList.add('animate-bounce');
      toast('🎤 Ouvindo...');
      const q=(await listen()).toLowerCase().trim();
      if(btn) btn.classList.remove('animate-bounce');
      if(window.__micDenied){ window.__micDenied=false; toast('Microfone bloqueado'); return speak('Não consegui usar o microfone. Libere o microfone nas configurações do navegador.'); }
      if(!q) return speak('Não entendi. Toque no botão e tente de novo.');
      if(/pode falar|estou ouvindo/.test(q)) return speak('Não entendi. Tente de novo.');
      toast('Você disse: “'+q+'”');
      const sl=expectedSlots();
      if(/já tomei|ja tomei|tomei|tomado/.test(q)){
        const s=sl.find(x=>['wait','miss','later'].includes(status(x)));
        if(!s) return speak('Não há dose pendente.');
        if(await ask(`Você tomou ${s.m.name} das ${s.t}? Diga sim ou não.`)){ act(s.m.id,s.t,'ok'); return speak(`Registrei ${s.m.name}.`); }
        return speak('Tudo bem, não registrei.');
      }
      else if(/lembrar|depois|trinta/.test(q)){const s=sl.find(x=>['wait','miss'].includes(status(x)));if(!s)return speak('Não encontrei dose pendente.');deferDose(s.m.id,s.t);return speak('Tudo bem. Vou lembrar de novo em trinta minutos.');}
      else if(/ajuda|emergência|emergencia|socorro/.test(q)){go('help');return speak('Abrindo a central de ajuda.');}
      else if(/estoque|acab|quanto tenho|quantos/.test(q)){return speak(S.meds.map(m=>`${m.name}: ${m.stock} ${m.stockUnit||'comprimidos'}.`).join(' ')||'Nenhum medicamento cadastrado.');}
      else if(/hoje|lista|medicamentos|remédios|remedios/.test(q)&&!/próximo|proximo/.test(q)){return speak(sl.map(s=>`${s.m.name} às ${s.t}`).join(', ')||'Nenhum medicamento programado hoje.');}
      else {const s=nextSlot();return speak(s?`O próximo é ${s.m.name}, ${s.dose}, às ${s.t}.`:'Não há mais doses programadas hoje.');}
    } finally { window.__voiceBusy=false; if(btn) btn.classList.remove('animate-bounce'); }
  };


  window.renderHeader = function(){
    const b='h-11 min-w-[44px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1 font-bold text-sm active:scale-95 transition';
    return `<header class="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800"><div class="max-w-7xl mx-auto px-3 sm:px-4 h-16 flex items-center justify-between gap-2"><div onclick="go('home')" class="flex items-center gap-2 cursor-pointer min-w-0"><div class="w-10 h-10 shrink-0 rounded-xl bg-teal-600 flex items-center justify-center text-white"><i class="ph-bold ph-first-aid-kit text-2xl"></i></div><div class="hidden min-[400px]:block leading-tight"><b class="font-display text-lg sm:text-xl text-teal-700 block">CUIDAR+</b><span class="text-[11px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">${role==='elder'?'Modo simples':'Familiar'}</span></div></div><div class="flex gap-1.5 shrink-0"><button aria-label="Tamanho da letra" onclick="S.fs=S.fs>=22?16:S.fs+2;save();render()" class="${b}">A<span class="text-xs">${S.fs}</span></button><button aria-label="Alto contraste" onclick="S.hc=!S.hc;save();render()" class="${b}"><i class="ph-bold ph-circle-half text-lg"></i></button>${isFamily()?`<button aria-label="Conta e segurança" onclick="go('account')" class="${b}"><i class="ph-bold ph-shield-check text-lg"></i></button><button aria-label="Abrir Modo Simples" onclick="openElderMode()" class="${b} text-teal-700"><i class="ph-bold ph-user-circle text-lg"></i><span class="hidden sm:inline text-xs">MODO SIMPLES</span></button>`:(authSession==='fam'?`<button aria-label="Voltar à família" onclick="backToFamily()" class="${b} text-teal-700"><i class="ph-bold ph-arrow-u-up-left text-lg"></i><span class="hidden sm:inline text-xs">VOLTAR À FAMÍLIA</span></button>`:'')}<button aria-label="Sair" onclick="exitSession()" class="${b} text-rose-600 border-rose-200"><i class="ph-bold ph-sign-out text-lg"></i></button></div></div></header>`; };

  window.renderSidebar = function(){ const isE=role==='elder'; const nav=isE?[['home','Início','ph-house'],['meds','Medicamentos','ph-pill'],['hist','Acompanhamento','ph-chart-line-up'],['share','Família','ph-users'],['help','Ajuda','ph-warning-octagon']]:[['home','Painel','ph-squares-four'],['meds','Medicamentos','ph-pill'],['hist','Relatórios','ph-chart-bar'],['share','Família','ph-users'],['account','Conta & Segurança','ph-shield-check']]; return `<aside class="hidden md:flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-4 min-h-[calc(100vh-4rem)]"><div class="mb-5 p-3 rounded-2xl bg-teal-50 dark:bg-teal-950/40"><div class="text-3xl">${S.elder.avatar||'👵'}</div><b>${esc(S.elder.name)}</b><div class="text-xs text-slate-500">${S.elder.age} anos</div></div><nav class="space-y-1 flex-1">${nav.map(n=>`<button onclick="go('${n[0]}')" class="w-full flex gap-3 items-center px-4 py-3 rounded-xl text-sm ${tab===n[0]?'bg-teal-600 text-white':'hover:bg-slate-100 dark:hover:bg-slate-800'}"><i class="ph-bold ${n[2]} text-xl"></i>${n[1]}</button>`).join('')}</nav>${isE?`<div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs font-bold">Modo simplificado ativo</div>`:''}</aside>`; };
  window.renderBottomNav = function(){const isE=role==='elder', items=isE?[['home','Início','ph-house'],['meds','Remédios','ph-pill'],['hist','Histórico','ph-chart-line-up'],['help','Ajuda','ph-warning-octagon']]:[['home','Painel','ph-squares-four'],['meds','Remédios','ph-pill'],['hist','Relatórios','ph-chart-bar'],['share','Família','ph-users'],['account','Conta','ph-shield-check']];return `<div class="cuidar-mobile-nav md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 border-t p-1"><div class="grid" style="grid-template-columns:repeat(${items.length},minmax(0,1fr))">${items.map(x=>`<button onclick="go('${x[0]}')" class="py-2 text-center ${tab===x[0]?'text-teal-600 font-bold':'text-slate-500'}"><i class="ph-bold ${x[2]} text-2xl"></i><span class="block text-[10px]">${x[1]}</span></button>`).join('')}</div></div>`; };

  window.render = function(){
    document.body.classList.toggle('hc',S.hc); document.documentElement.style.setProperty('--app-fs',S.fs+'px'); const c=$('#app'); if(!c)return;
    if(!role){c.innerHTML=viewWelcome();return;}
    let content='';
    if(role==='elder'){switch(tab){case'meds':content=viewMeds();break;case'hist':content=viewHist();break;case'help':content=viewHelp();break;case'share':content=viewShare();break;case'account':content=viewElderHome();break;default:content=viewElderHome();}}
    else {switch(tab){case'meds':content=viewMeds();break;case'hist':content=viewHist();break;case'share':content=viewShare();break;case'account':content=viewAccount();break;default:content=viewFamHome();}}
    c.innerHTML=`${renderHeader()}<div class="flex-1 max-w-7xl w-full mx-auto flex">${renderSidebar()}<main class="flex-1 p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 overflow-x-hidden">${content}</main></div>${renderBottomNav()}`;
    if(role==='elder'){ c.querySelectorAll('[data-admin-only]').forEach(x=>x.remove()); }
  };

  // Melhor experiência no modo simplificado.
  const oldElder=viewElderHome;
  window.viewElderHome=function(){ const html=oldElder(); return S.easy?html.replace(/text-xs/g,'text-sm').replace(/text-sm/g,'text-base'):html; };

  // Rechecagem frequente: funciona enquanto o app estiver aberto; não promete execução em segundo plano.
  setInterval(()=>{checkAlerts(); const d=S.deferred||{}; Object.entries(d).forEach(([id,when])=>{if(Date.now()>=when){const [_,mid,t]=id.split('-'); const m=S.meds.find(x=>x.id==mid); if(m){notify('CUIDAR+ — lembrete',`É hora de lembrar do ${m.name} das ${t}.`);} delete d[id]; save();}}); if(role)render();},60000);

  // Recalcula alertas quando a aba volta a ficar ativa.
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkAlerts();render();}});
  window.addEventListener('online',()=>{S.audit.unshift(new Date().toLocaleString('pt-BR')+' — dispositivo online');save();});
  window.addEventListener('offline',()=>{S.audit.unshift(new Date().toLocaleString('pt-BR')+' — modo offline');save();});

  // Pequena classe utilitária para os novos campos.
  // Os estilos dos campos ficam em style.css.
})();


// Inicialização da Aplicação
window.addEventListener('load', function() {
  checkAlerts();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
});

// Ponte entre a interface existente e os serviços Firebase.
(function(){
  const baseRender=window.render;
  let currentKind='loading', currentText='Conectando ao Firebase…';
  function copy(data){return JSON.parse(JSON.stringify(data));}
  function sanitize(data){
    return JSON.parse(JSON.stringify(data,(key,value)=>
      ['password','passwordHash','pinHash','token','accessToken','refreshToken'].includes(key)?undefined:value));
  }
  function emptyState(){
    const state=seed();
    state.meds=[];state.logs=[];state.alerts=[];state.audit=[];
    state.elder={name:'Pessoa cuidada',age:0,avatar:'🧑',sex:'n'};
    state.fam.name='Familiar';state.account={owner:null};
    return state;
  }
  function installState(state){
    cloudApplying=true;
    try{S=sanitize(state);window.upgradeFirebaseState();}
    finally{cloudApplying=false;}
  }
  function paintStatus(){
    let el=document.getElementById('firebase-status');
    if(!el){el=document.createElement('aside');el.id='firebase-status';el.setAttribute('role','status');document.body.appendChild(el);}
    el.dataset.state=currentKind;
    el.hidden=!['error','conflict'].includes(currentKind);
    el.replaceChildren();
    const text=document.createElement('span');text.textContent=currentText;el.appendChild(text);
    if(['error','conflict'].includes(currentKind)){
      for(const [label,handler] of [['Tentar novamente',()=>window.retryCloudSave?.()],['Exportar rascunho',()=>window.exportCloudDraft?.()]]){
        const button=document.createElement('button');button.textContent=label;button.onclick=handler;el.appendChild(button);
      }
    }
  }
  window.render=function(){
    if(!cloudBooted){
      document.getElementById('app').innerHTML='<main class="cloud-start"><h1>CUIDAR+</h1><p>Conectando ao Firebase…</p></main>';
    }else{baseRender();}
    paintStatus();
  };
  window.CuidarCloud={
    sanitize,
    legacy:()=>legacyState?copy(legacyState):null,
    getState:()=>S,
    isSignedIn:()=>!!user,
    escape:esc,
    isPinSession:()=>authSession==='elder',
    openAccount:()=>{tab='account';render();},
    setPinState:(state,u,preserve=false)=>{
      user=u;demo=false;authSession='elder';role='elder';if(!preserve)tab='home';
      installState(state);cloudBooted=true;
      sessionStorage.setItem('role','elder');sessionStorage.setItem('cuidar_auth','elder');render();
    },
    isFamily:()=>role==='fam',
    setSaveHandler:handler=>{cloudSaveHandler=handler;},
    status:(kind,text)=>{currentKind=kind;currentText=text;paintStatus();},
    lock:()=>{
      cloudBooted=true;user=null;role=null;authSession=null;demo=false;tab='home';
      sessionStorage.removeItem('role');sessionStorage.removeItem('cuidar_auth');sessionStorage.removeItem('demo');
      installState(emptyState());render();
    },
    fresh:(u,profile)=>{
      const state=emptyState();
      state.elder={name:profile?.elderName||'Pessoa cuidada',age:profile?.age||0,
        sex:profile?.sex||'n',avatar:avatarFor(profile?.sex||'n',profile?.age||0)};
      state.fam.name=profile?.name||u.displayName||'Familiar';
      state.account.owner={uid:u.uid,email:u.email,name:state.fam.name,provider:'firebase'};
      // A normalização da interface é aplicada sem efetuar gravações.
      const previous=S;installState(state);const result=copy(S);S=previous;
      return result;
    },
    setState:(state,u,preserveRole=false)=>{
      const previousRole=role;
      user=u;demo=false;authSession='fam';role=preserveRole&&previousRole?previousRole:'fam';tab=preserveRole?tab:'home';
      installState(state);cloudBooted=true;
      sessionStorage.setItem('role',role);sessionStorage.setItem('cuidar_auth','fam');render();
    }
  };
  window.goDemo=()=>{user=null;demo=true;authSession=null;role=null;cloudBooted=true;installState(seed());render();};
  window.exitDemo=()=>{window.CuidarCloud.lock();};
  window.resetCloudPassword=()=>alert('Aguarde a conexão com o Firebase.');
  render();
  import('./firebase-service.js').catch(error=>{
    cloudBooted=false;
    const app=document.getElementById('app');
    app.innerHTML='<main class="cloud-start"><h1>Não foi possível conectar ao Firebase</h1><p>Confira a internet e se todos os arquivos novos foram enviados ao GitHub.</p><button onclick="location.reload()">Tentar novamente</button></main>';
    window.CuidarCloud.status('error','Firebase indisponível. O login local está desativado.');
    console.error('Firebase initialization failed',error);
  });
})();
