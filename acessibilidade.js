/* CUIDAR+ — Acessibilidade
   Carregado depois de script.js e melhorias.js. Tudo fica dentro de uma função.
   Preferências ficam NESTE aparelho (localStorage), por isso valem também para quem entra com PIN. */
(function(){
'use strict';

/* ================= utilidades ================= */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const raf=window.requestAnimationFrame?f=>window.requestAnimationFrame(f):f=>setTimeout(f,16);
const hasS=()=>typeof S!=='undefined'&&!!S;
const curRole=()=>typeof role!=='undefined'?role:null;
const curTab=()=>typeof tab!=='undefined'?tab:'home';
const mq=q=>window.matchMedia?window.matchMedia(q):{matches:false,addEventListener(){}};
const medById=id=>hasS()?(S.meds||[]).find(m=>String(m.id)===String(id)):null;
const safePhoto=p=>(typeof p==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p))?p:'';

/* ================= preferências ================= */
const KEY='cuidar_a11y_v1';
const DEF={fs:null,hc:null,theme:'light',motion:'system',spacing:false,simple:true,sound:true,vibrate:true,voiceReminders:true,slowVoice:false,help:true};
const P=Object.assign({},DEF);
try{Object.assign(P,JSON.parse(localStorage.getItem(KEY)||'{}'));}catch(_){}
const saveP=()=>{try{localStorage.setItem(KEY,JSON.stringify(P));}catch(_){}};
const FS_STEPS=[16,18,20,22,24,26,28];
const FS_NAMES={16:'Normal',18:'Médio',20:'Grande',22:'Maior',24:'Muito grande',26:'Enorme',28:'Máximo'};
const fsEff=()=>Math.min(28,Math.max(16,Number(P.fs)||16));
const hcEff=()=>!!P.hc;
const simple=()=>curRole()==='elder'&&P.simple!==false;
const reduceMotion=()=>P.motion==='reduce'||(P.motion==='system'&&mq('(prefers-reduced-motion: reduce)').matches);

function applyPrefs(){
  const root=document.documentElement,fs=fsEff();
  root.style.setProperty('--app-fs',fs+'px');
  root.dataset.fs=fs>=26?'xl':fs>=22?'large':'normal';
  const dark=P.theme==='dark'||(P.theme==='system'&&mq('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark',dark);
  root.classList.toggle('a11y-spacing',!!P.spacing);
  root.classList.toggle('reduce-motion',P.motion==='reduce');
  root.classList.toggle('motion-ok',P.motion==='normal');
  const hc=hcEff();
  if(document.body){document.body.classList.toggle('hc',hc);document.body.classList.toggle('simple-mode',simple());}
  const meta=$('meta[name=theme-color]');if(meta)meta.setAttribute('content',dark?'#0f172a':'#0f766e');
  if(hasS()){S.fs=fs;S.hc=hc;}
}
mq('(prefers-color-scheme: dark)').addEventListener&&mq('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(P.theme==='system')applyPrefs();});

/* ================= anúncios para leitores de tela ================= */
function ensureLive(){
  if(!$('#a11y-live-polite')){
    const a=document.createElement('div');a.id='a11y-live-polite';a.className='a11y-sr';a.setAttribute('aria-live','polite');a.setAttribute('aria-atomic','true');document.body.appendChild(a);
    const b=document.createElement('div');b.id='a11y-live-assertive';b.className='a11y-sr';b.setAttribute('role','alert');b.setAttribute('aria-live','assertive');b.setAttribute('aria-atomic','true');document.body.appendChild(b);
  }
  if(!$('#toast-box')){const t=document.createElement('div');t.id='toast-box';t.setAttribute('aria-live','polite');document.body.appendChild(t);}
  if(!$('.skip-link')){const s=document.createElement('a');s.className='skip-link';s.href='#conteudo';s.textContent='Pular para o conteúdo';
    s.addEventListener('click',e=>{const t=$('#conteudo');if(t){e.preventDefault();t.focus({preventScroll:false});}});document.body.insertBefore(s,document.body.firstChild);}
}
function announce(msg,assertive){
  const el=$('#a11y-live-'+(assertive?'assertive':'polite'));if(!el)return;
  el.textContent='';setTimeout(()=>{el.textContent=msg;},60);
}

/* ================= leitura por voz ================= */
function say(text){
  return new Promise(res=>{
    if(!('speechSynthesis' in window)||!window.SpeechSynthesisUtterance){window.toast&&window.toast('Este aparelho não consegue ler em voz alta.','warn');return res();}
    try{speechSynthesis.cancel();}catch(_){}
    const u=new SpeechSynthesisUtterance(String(text));u.lang='pt-BR';u.rate=P.slowVoice?0.75:0.95;
    let vs=[];try{vs=speechSynthesis.getVoices()||[];}catch(_){}
    const v=vs.find(x=>/^pt[-_]BR/i.test(x.lang))||vs.find(x=>/^pt/i.test(x.lang));if(v)u.voice=v;
    let done=false;const fin=()=>{if(!done){done=true;res();}};
    u.onend=fin;u.onerror=fin;setTimeout(fin,Math.min(60000,2000+String(text).length*110));
    try{speechSynthesis.speak(u);}catch(_){fin();}
  });
}
function spokenTime(t){
  const m=/^(\d{1,2}):(\d{2})$/.exec(t||'');if(!m)return t||'';
  const h=+m[1],mi=+m[2];
  const hs=h===0?'meia-noite':h===12?'meio-dia':h+(h===1?' hora':' horas');
  return mi?hs+' e '+mi+(mi===1?' minuto':' minutos'):hs;
}
const UNITS={mg:'miligramas',mcg:'microgramas','µg':'microgramas',ml:'mililitros',g:'gramas',ui:'unidades internacionais'};
const spokenDose=d=>String(d||'').replace(/(\d+(?:[.,]\d+)?)\s*(mg|mcg|µg|ml|g|ui)\b/gi,(_,n,u)=>n+' '+UNITS[u.toLowerCase()]);
const unitFor=(m,n)=>{const u=String(m.stockUnit||'comprimidos');return n>1?u:u.replace(/s$/,'');};
function spokenMed(m,t){
  const n=Number(m.per)||1;
  let s=`${m.name}. ${spokenDose(m.dose)}. Tomar ${n} ${unitFor(m,n)}.`;
  if(t)s+=` Horário: ${spokenTime(t)}.`;
  if(m.instructions)s+=' '+m.instructions+(/[.!?]$/.test(m.instructions)?'':'.');
  return s;
}
window.speakMed=function(id,t){const m=medById(id);if(m)say(spokenMed(m,t));};
window.readScreen=function(){
  const main=$('main')||$('#app');if(!main)return;
  const txt=(main.innerText||main.textContent||'').replace(/\p{Extended_Pictographic}/gu,' ').replace(/\s+/g,' ').trim().slice(0,1200);
  say(txt||'Não há nada para ler nesta tela.');
};
window.stopSpeaking=()=>{try{speechSynthesis.cancel();}catch(_){}};
const listenBtn=(label,attrs,cls)=>`<button type="button" class="${cls||'sx-btn sx-listen'}" ${attrs}><span aria-hidden="true">🔊</span> ${label}</button>`;

/* ================= Modo Simples (tela do idoso) ================= */
const GREET=()=>{const h=new Date().getHours();return h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';};
const firstName=()=>String((hasS()&&S.elder&&S.elder.name)||'').trim().split(/\s+/)[0]||'';
const ST={
  sched:['ph-calendar-blank','Ainda não é a hora'],
  wait:['ph-bell-ringing','Está na hora'],
  miss:['ph-warning-circle','Atrasado'],
  ok:['ph-check-circle','Já tomou'],
  no:['ph-x-circle','Marcado como não tomado'],
  later:['ph-clock','Vou lembrar mais tarde']
};
const stateBadge=st=>{const x=ST[st]||ST.sched;return `<span class="sx-state ${esc(st)}"><i class="ph-bold ${x[0]}" aria-hidden="true"></i>${x[1]}</span>`;};
const medPic=m=>{const p=safePhoto(m.photo);return p?`<img src="${p}" alt="Foto da caixa de ${esc(m.name)}" class="sx-pic">`:`<div class="sx-pic sx-emoji" aria-hidden="true">${esc(m.icon||'💊')}</div>`;};
const todaySlots=()=>(window.slots?window.slots():[]);
const slotStatus=s=>window.status(s);

function simpleHome(){
  const sl=todaySlots();
  const pending=sl.find(s=>['wait','miss','later'].includes(slotStatus(s)))||sl.find(s=>slotStatus(s)==='sched');
  const done=sl.filter(s=>slotStatus(s)==='ok').length;
  let card;
  if(pending){
    const m=pending.m,t=pending.t,st=slotStatus(pending),n=Number(m.per)||1,id=esc(m.id);
    card=`<section class="simple-card" aria-labelledby="sx-next">
      <h2 id="sx-next">Próximo remédio</h2>
      <div class="sx-head">${medPic(m)}<div class="min-w-0"><p class="sx-name">${esc(m.name)}</p><p class="sx-dose">${esc(m.dose||'')} · ${n} ${esc(unitFor(m,n))}</p></div></div>
      <p class="sx-time"><span class="a11y-sr">Horário: </span>${esc(t)}</p>
      ${stateBadge(st)}
      ${m.instructions?`<p class="sx-dose">${esc(m.instructions)}</p>`:''}
      ${listenBtn('OUVIR',`data-med="${id}" data-t="${esc(t)}" aria-label="Ouvir o nome, a dose e o horário de ${esc(m.name)}"`)}
      <div class="grid gap-3">
        <button type="button" class="sx-btn sx-ok" onclick="confirmDose('ok','${id}','${esc(t)}')"><span aria-hidden="true">✅</span> JÁ TOMEI</button>
        <button type="button" class="sx-btn sx-later" onclick="confirmDose('later','${id}','${esc(t)}')"><span aria-hidden="true">⏳</span> DEPOIS</button>
        <button type="button" class="sx-btn sx-no" onclick="confirmDose('no','${id}','${esc(t)}')"><span aria-hidden="true">❌</span> NÃO TOMEI</button>
      </div></section>`;
  }else{
    card=`<section class="simple-card sx-done" aria-labelledby="sx-next"><div class="em" aria-hidden="true">${sl.length?'🎉':'🌿'}</div><h2 id="sx-next">${sl.length?'Tudo certo por hoje!':'Hoje não há remédios marcados'}</h2><p class="sx-dose">${sl.length?'Você já cuidou de todos os remédios de hoje.':'Aproveite o dia. Se precisar de algo, use os botões abaixo.'}</p></section>`;
  }
  const summary=sl.length?`<p class="sx-summary">Hoje: ${done} de ${sl.length} ${sl.length===1?'remédio tomado':'remédios tomados'}.</p>`:'';
  return `<div class="simple-wrap">
    <h1 tabindex="-1">${GREET()}${firstName()?', '+esc(firstName()):''}!</h1>
    ${summary}${card}
    <div class="sx-tiles">
      <button type="button" class="sx-tile" onclick="go('meds')"><span class="em" aria-hidden="true">💊</span>Meus remédios de hoje</button>
      <button type="button" id="voice-btn" class="sx-tile" onclick="voice()"><span class="em" aria-hidden="true">🎙️</span>Falar com o aplicativo</button>
      <button type="button" class="sx-tile help" onclick="go('help')"><span class="em" aria-hidden="true">🆘</span>Preciso de ajuda</button>
    </div></div>`;
}

function simpleMeds(){
  const sl=todaySlots();
  const rows=sl.map(s=>{
    const m=s.m,st=slotStatus(s),n=Number(m.per)||1,id=esc(m.id),t=esc(s.t);
    const pend=['wait','miss','later'].includes(st);
    return `<li class="sx-row"><div class="sx-head">${medPic(m)}<div class="min-w-0"><p class="sx-time">${t}</p><p class="sx-name">${esc(m.name)}</p><p class="sx-dose">${esc(m.dose||'')} · ${n} ${esc(unitFor(m,n))}</p></div></div>
      ${stateBadge(st)}
      <div class="sx-actions">${listenBtn('OUVIR',`data-med="${id}" data-t="${t}" aria-label="Ouvir ${esc(m.name)} das ${t}"`)}
      ${pend?`<button type="button" class="sx-btn sx-ok" onclick="confirmDose('ok','${id}','${t}')" aria-label="Já tomei ${esc(m.name)} das ${t}"><span aria-hidden="true">✅</span> JÁ TOMEI</button>`:''}</div></li>`;
  }).join('');
  return `<div class="simple-wrap"><h1 tabindex="-1">Meus remédios de hoje</h1>
    ${rows?`<ul class="sx-list">${rows}</ul>`:`<section class="simple-card sx-done"><div class="em" aria-hidden="true">🌿</div><p class="sx-dose">Hoje não há remédios marcados.</p></section>`}
    <button type="button" class="sx-btn sx-listen" onclick="go('home')"><span aria-hidden="true">🏠</span> VOLTAR AO INÍCIO</button></div>`;
}

const isPinSession=()=>!!(window.CuidarCloud&&window.CuidarCloud.isPinSession&&window.CuidarCloud.isPinSession());
function simpleHelp(pin){
  pin=pin||isPinSession();
  const contacts=(hasS()&&S.elder&&S.elder.health&&Array.isArray(S.elder.health.contacts)?S.elder.health.contacts:[]).slice(0,4)
    .map(c=>`<a class="sx-btn sx-listen" href="tel:${esc(String(c.phone||'').replace(/[^\d+]/g,''))}"><span aria-hidden="true">📞</span> Ligar para ${esc(c.name)}${c.rel?' ('+esc(c.rel)+')':''}</a>`).join('');
  return `<div class="simple-wrap"><h1 tabindex="-1">Preciso de ajuda</h1>
    <a class="sx-btn sx-no" href="tel:192"><span aria-hidden="true">📞</span> LIGAR PARA O SAMU — 192</a>
    <button type="button" class="sx-btn sx-later" onclick="${pin?'sendPinHelp()':'simpleHelpLocal()'}"><span aria-hidden="true">🔔</span> AVISAR MEU FAMILIAR</button>
    ${contacts}
    <p class="sx-dose">O aviso aparece no aplicativo do seu familiar. Se for uma emergência, ligue 192.</p>
    <button type="button" class="sx-btn sx-listen" onclick="go('home')"><span aria-hidden="true">🏠</span> VOLTAR AO INÍCIO</button></div>`;
}
window.simpleHelpLocal=function(){
  if(!hasS())return;
  const d=new Date(),hm=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  S.alerts=S.alerts||[];
  S.alerts.unshift({id:'help-'+Date.now(),txt:`${S.elder&&S.elder.name||'A pessoa'} solicitou ajuda pelo CUIDAR+.`,at:hm,type:'help',severity:'high'});
  if(S.audit)S.audit.unshift(d.toLocaleString('pt-BR')+' — pedido de ajuda');
  save();render();
  window.toast&&window.toast('Aviso registrado. Seu familiar verá o pedido.');
};
window.viewHelpPin=()=>simple()?simpleHelp(true):null;

/* ---- envolve as telas existentes ---- */
const prev={
  elderHome:window.viewElderHome,meds:window.viewMeds,hist:window.viewHist,share:window.viewShare,help:window.viewHelp,
  header:window.renderHeader,side:window.renderSidebar,nav:window.renderBottomNav
};
window.viewElderHome=function(){return simple()?simpleHome():prev.elderHome.apply(this,arguments);};
window.viewHist=function(){return simple()?simpleHome():prev.hist.apply(this,arguments);};
window.viewShare=function(){return simple()?simpleHome():prev.share.apply(this,arguments);};
window.viewHelp=function(){return simple()?simpleHelp(false):prev.help.apply(this,arguments);};
window.viewMeds=function(){
  if(simple())return simpleMeds();
  const html=prev.meds.apply(this,arguments);
  return String(html).replace(/<button onclick="removeMed\((\d+)\)"/g,(m,id)=>{
    const med=medById(id);
    return `<button type="button" data-med="${id}" class="p-2 text-teal-700 font-bold" aria-label="Ouvir ${esc(med?med.name:'o medicamento')}" title="Ouvir">🔊</button>`+m;
  });
};
window.renderSidebar=function(){return simple()?'':prev.side.apply(this,arguments);};
window.renderBottomNav=function(){
  if(!simple())return prev.nav.apply(this,arguments);
  const items=[['home','Início','ph-house'],['meds','Remédios','ph-pill'],['help','Ajuda','ph-warning-octagon']];
  return `<nav class="cuidar-mobile-nav simple-nav fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 border-t p-1" aria-label="Menu principal"><div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${items.map(x=>`<button type="button" onclick="go('${x[0]}')" class="py-2 text-center ${curTab()===x[0]?'text-teal-600 font-bold':'text-slate-600'}"><i class="ph-bold ${x[2]}" aria-hidden="true"></i><span class="block">${x[1]}</span></button>`).join('')}</div></nav>`;
};
window.renderHeader=function(){
  const fam=typeof isFamily==='function'&&isFamily();
  const asFam=typeof authSession!=='undefined'&&authSession==='fam';
  const r=curRole(),sm=simple();
  const a11y=`<button type="button" class="hdr-btn teal" onclick="openA11y()" aria-haspopup="dialog"><i class="ph-bold ph-eye" aria-hidden="true"></i><span class="hdr-lbl hdr-keep">Acessibilidade</span></button>`;
  let mid='';
  if(fam)mid=`<button type="button" class="hdr-btn" onclick="go('account')" aria-label="Conta e segurança"><i class="ph-bold ph-shield-check" aria-hidden="true"></i><span class="hdr-lbl">Conta</span></button><button type="button" class="hdr-btn teal" onclick="openElderMode()" aria-label="Abrir Modo Simples"><i class="ph-bold ph-user-circle" aria-hidden="true"></i><span class="hdr-lbl">Modo Simples</span></button>`;
  else if(asFam)mid=`<button type="button" class="hdr-btn teal" onclick="backToFamily()" aria-label="Voltar à família"><i class="ph-bold ph-arrow-u-up-left" aria-hidden="true"></i><span class="hdr-lbl ${sm?'hdr-keep':''}">Voltar à família</span></button>`;
  return `<header class="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800"><div class="hdr-in max-w-7xl mx-auto px-3 sm:px-4 flex items-center justify-between gap-2">
    <button type="button" class="hdr-logo" onclick="go('home')" aria-label="CUIDAR+, ir para o início"><span class="hdr-mark" aria-hidden="true"><i class="ph-bold ph-first-aid-kit"></i></span><span class="hdr-name"><b>CUIDAR+</b><small>${r==='elder'?'Modo simples':'Familiar'}</small></span></button>
    <div class="hdr-actions">${a11y}${mid}<button type="button" class="hdr-btn rose" onclick="exitSession()" aria-label="Sair"><i class="ph-bold ph-sign-out" aria-hidden="true"></i><span class="hdr-lbl ${sm?'hdr-keep':''}">Sair</span></button></div></div></header>`;
};

/* ================= alertas com texto + ícone ================= */
window.alertBadge=function(a){
  const sev=a&&a.severity,type=a&&a.type;
  if(sev==='high'||type==='help'||type==='no')return '<strong class="alert-tag high"><span aria-hidden="true">🚨</span>Urgente:</strong>';
  if(sev==='info'||type==='medication'&&sev!=='warning')return '<strong class="alert-tag info"><span aria-hidden="true">🔔</span>Lembrete:</strong>';
  return '<strong class="alert-tag warn"><span aria-hidden="true">⚠️</span>Atenção:</strong>';
};
function decorateToast(n){
  if(n.dataset.a11y)return;n.dataset.a11y='1';
  const warn=n.classList.contains('warn'),hasBtn=!!n.querySelector('button');
  const ico=document.createElement('span');ico.className='toast-ico';ico.setAttribute('aria-hidden','true');ico.textContent=warn?'⚠️':hasBtn?'✅':'ℹ️';
  n.insertBefore(ico,n.firstChild);
  if(warn){n.setAttribute('role','alert');const sr=document.createElement('span');sr.className='a11y-sr';sr.textContent='Atenção: ';n.insertBefore(sr,ico.nextSibling);}
}
/* som, vibração e voz respeitam as preferências deste aparelho */
const baseAlarm=window.playAlarm;
if(typeof baseAlarm==='function')window.playAlarm=function(){return P.sound===false?0:baseAlarm.apply(this,arguments);};
if(navigator.vibrate){const v=navigator.vibrate.bind(navigator);navigator.vibrate=p=>P.vibrate===false?false:v(p);}
const baseFire=window.fireDoseAlarm;
if(typeof baseFire==='function')window.fireDoseAlarm=function(){
  const st=(hasS()&&(S.settings=S.settings||{}))||{},bak=st.voiceReminders;
  if(P.voiceReminders===false)st.voiceReminders=false;
  try{return baseFire.apply(this,arguments);}finally{st.voiceReminders=bak;}
};
/* rolagem sem animação quando o movimento está reduzido */
const baseScroll=window.scrollTo.bind(window);
window.scrollTo=function(a,b){
  if(a&&typeof a==='object'){return baseScroll(reduceMotion()&&a.behavior==='smooth'?Object.assign({},a,{behavior:'auto'}):a);}
  return baseScroll(a,b);
};

/* ================= ajuda contextual ================= */
const HELP=[
  [/^pr[óo]xim[oa] (dose|rem[ée]dio)$/i,'Aqui aparece o remédio da vez. Depois de tomar, toque em JÁ TOMEI. Se não puder agora, toque em DEPOIS e o aviso volta em 30 minutos. Se não tomou, toque em NÃO TOMEI e seu familiar será avisado.'],
  [/^meus rem[ée]dios de hoje$/i,'Lista de todos os remédios de hoje, com o horário e se já foram tomados. Toque em OUVIR para escutar o nome e a dose.'],
  [/^medicamentos$/i,'Cadastre cada remédio com nome, dose, horários e quantidade em estoque. O aplicativo avisa na hora de tomar e quando o estoque estiver acabando.'],
  [/^adicionar medicamento$/i,'Preencha o nome, a dose e os horários. Se quiser, tire uma foto da caixa para a pessoa reconhecer o remédio. Depois toque em Salvar medicamento.'],
  [/^hor[áa]rios de tomar$/i,'Digite só os números: 2030 vira 20:30. Use os atalhos manhã, almoço, tarde e noite, ou "A cada X horas" para criar vários horários de uma vez.'],
  [/^dias da semana$/i,'Marque os dias em que o remédio deve ser tomado. Se for todos os dias, deixe tudo marcado.'],
  [/^foto da caixa/i,'A foto ajuda a pessoa a reconhecer a caixa. Ela aparece no aviso da hora de tomar e na lista de remédios.'],
  [/^toler[âa]ncia para atraso/i,'É o tempo que o aplicativo espera antes de avisar a família que uma dose atrasou.'],
  [/^acesso por pin$/i,'O PIN tem 10 números e permite que a pessoa cuidada entre sozinha, em qualquer aparelho, sem senha. Se achar que alguém descobriu o PIN, gere um novo.'],
  [/^estoque/i,'Mostra quantos comprimidos restam e em quantos dias o remédio acaba, para você comprar com antecedência.'],
  [/^ficha de sa[úu]de$/i,'Guarda alergias, contatos de emergência, consultas, receitas e exames. O botão "Levar à consulta" gera um resumo para imprimir ou salvar em PDF.'],
  [/^ades[ãa]o/i,'Adesão é a porcentagem de doses confirmadas como tomadas. Serve para conversar com o médico sobre como o tratamento está indo.'],
  [/^backup e portabilidade$/i,'Exportar salva uma cópia dos seus dados em um arquivo. Importar restaura uma cópia salva antes.'],
  [/^pessoas (acompanhadas|cuidadas)$/i,'Cada pessoa tem seus próprios remédios e histórico. Toque em uma pessoa para ver os dados dela.'],
  [/^notifica[çc][õo]es e voz$/i,'Escolha se o aplicativo avisa com notificação, som e voz na hora de tomar o remédio.'],
  [/^seguran[çc]a da conta$/i,'Aqui você troca a senha da conta da família. A pessoa cuidada não tem acesso a esta área.'],
  [/^auditoria$/i,'Lista das ações recentes: o que foi confirmado, adiado ou alterado, e quando.'],
  [/^(central de ajuda|preciso de ajuda)$/i,'Use AVISAR para mandar um alerta ao seu familiar. Em uma emergência, ligue 192 (SAMU).'],
  [/^alertas ativos$/i,'Avisos que precisam da sua atenção, como dose atrasada, dose não tomada ou pedido de ajuda.']
];
const openHelp=new Set();
function helpPopHTML(text){return `<p>${esc(text)}</p><button type="button" data-say="${esc(text)}"><span aria-hidden="true">🔊</span> Ouvir</button>`;}
function enhanceHelp(app){
  if(P.help===false){$$('.help-btn,.help-pop',app).forEach(n=>n.remove());return;}
  const seen=new Set();
  $$('.help-btn',app).forEach(b=>seen.add(Number(b.dataset.help)));
  $$('h1,h2,h3,label,legend',app).forEach(h=>{
    if(h.dataset.helpDone)return;
    const label=(h.textContent||'').replace(/\s+/g,' ').trim();
    const idx=HELP.findIndex(x=>x[0].test(label));
    if(idx<0||seen.has(idx)||h.closest('.help-pop'))return;
    seen.add(idx);h.dataset.helpDone='1';
    const id='help-'+idx;
    const btn=document.createElement('button');btn.type='button';btn.className='help-btn';btn.textContent='?';
    btn.setAttribute('aria-expanded',openHelp.has(idx)?'true':'false');btn.setAttribute('aria-controls',id);btn.setAttribute('aria-label','Ajuda sobre: '+label);btn.dataset.help=String(idx);
    const pop=document.createElement('div');pop.id=id;pop.className='help-pop';pop.setAttribute('role','note');pop.innerHTML=helpPopHTML(HELP[idx][1]);pop.hidden=!openHelp.has(idx);
    let anchor=h;
    if(/^H/.test(h.tagName)){h.setAttribute('aria-label',label);h.appendChild(btn);const par=h.parentElement;if(par&&/flex/.test(getComputedStyle(par).display||'')&&par!==app)anchor=par;}
    else{h.classList.add('a11y-inline');h.insertAdjacentElement('afterend',btn);anchor=btn;}
    anchor.insertAdjacentElement('afterend',pop);
  });
}
function toggleHelp(btn){
  const idx=Number(btn.dataset.help),pop=document.getElementById(btn.getAttribute('aria-controls'));if(!pop)return;
  const open=btn.getAttribute('aria-expanded')!=='true';
  btn.setAttribute('aria-expanded',open?'true':'false');pop.hidden=!open;
  open?openHelp.add(idx):openHelp.delete(idx);
}

/* ================= foco, janelas e teclado ================= */
const MODALS=['a11y-panel','confirm-dose','health-modal','person-modal','dose-alarm','photo-view'];
const topModal=()=>Array.from(document.body.children).filter(n=>MODALS.includes(n.id)).pop()||null;
const FOCUSABLE='a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const focusables=root=>$$(FOCUSABLE,root).filter(el=>el.getClientRects().length>0);
function syncInert(){
  const any=!!topModal();
  ['#app','#a11y-fab'].forEach(sel=>{const el=$(sel);if(el){any?el.setAttribute('inert',''):el.removeAttribute('inert');}});
}
function focusSig(){
  const app=$('#app'),a=document.activeElement;
  if(!app||!a||a===document.body||!app.contains(a))return null;
  const key=x=>[x.tagName,x.getAttribute('onclick')||'',x.getAttribute('aria-label')||'',(x.textContent||'').trim().slice(0,60)].join('|');
  const same=$$(a.tagName.toLowerCase(),app).filter(x=>key(x)===key(a));
  return {id:a.id||'',key:key(a),idx:Math.max(0,same.indexOf(a)),tag:a.tagName.toLowerCase()};
}
function restoreFocus(sig){
  const app=$('#app');if(!sig||!app)return false;
  const a=document.activeElement;if(a&&a!==document.body&&app.contains(a))return true;
  let el=sig.id?document.getElementById(sig.id):null;
  if(!el){
    const key=x=>[x.tagName,x.getAttribute('onclick')||'',x.getAttribute('aria-label')||'',(x.textContent||'').trim().slice(0,60)].join('|');
    const c=$$(sig.tag,app).filter(x=>key(x)===sig.key);el=c[sig.idx]||c[0]||null;
  }
  if(el){el.focus({preventScroll:true});return true;}
  return false;
}
const openers=new Map();
const LABELS={'confirm-dose':'Confirmar dose','health-modal':'Ficha de saúde','person-modal':'Adicionar pessoa','dose-alarm':'Hora do remédio','photo-view':'Foto do documento','a11y-panel':'Acessibilidade'};
function onModalOpen(n){
  const a=document.activeElement;
  if(!openers.has(n.id))openers.set(n.id,{el:a&&a!==document.body?a:null,sig:focusSig()});
  if(!n.getAttribute('role'))n.setAttribute('role','dialog');
  n.setAttribute('aria-modal','true');
  if(!n.getAttribute('aria-label')&&!n.getAttribute('aria-labelledby')){
    const h=$('h1,h2',n),q=$('.font-display',n);
    if(h){if(!h.id)h.id=n.id+'-titulo';n.setAttribute('aria-labelledby',h.id);}
    else n.setAttribute('aria-label',(q&&q.textContent.trim())||LABELS[n.id]||'Janela');
  }
  n.tabIndex=-1;
  syncInert();
  raf(()=>{if(!n.isConnected||n.contains(document.activeElement))return;const f=focusables(n)[0];(f||n).focus();});
}
function onModalClose(n){
  const o=openers.get(n.id);openers.delete(n.id);
  syncInert();
  raf(()=>{
    const t=topModal();
    if(t){if(!t.contains(document.activeElement)){const f=focusables(t)[0];(f||t).focus();}return;}
    if(o&&o.el&&o.el.isConnected){o.el.focus({preventScroll:true});return;}
    if(o&&restoreFocus(o.sig))return;
    const h=$('main h1')||$('#conteudo');if(h){h.tabIndex=-1;h.focus({preventScroll:true});}
  });
}
function decorateDoseRow(n){
  const m=/^dr-(.+)-(\d{2})(\d{2})$/.exec(n.id);if(!m||n.dataset.a11y)return;
  const med=medById(m[1]);if(!med)return;n.dataset.a11y='1';
  const b=document.createElement('button');b.type='button';b.dataset.med=String(med.id);b.dataset.t=m[2]+':'+m[3];
  b.className='mb-3 w-full py-3 rounded-2xl border-2 border-teal-700 text-teal-800 font-bold text-lg';
  b.innerHTML='<span aria-hidden="true">🔊</span> OUVIR';b.setAttribute('aria-label','Ouvir '+med.name+' das '+m[2]+':'+m[3]);
  const g=$('.grid',n);g?n.insertBefore(b,g):n.appendChild(b);
}
function decorateConfirm(n){
  if(n.dataset.a11y)return;n.dataset.a11y='1';
  const q=$('.font-display',n);if(!q)return;
  const b=document.createElement('button');b.type='button';b.dataset.say=q.textContent.replace(/\s+/g,' ').trim();
  b.className='w-full h-12 rounded-2xl border-2 border-teal-700 text-teal-800 dark:text-teal-200 font-bold';
  b.innerHTML='<span aria-hidden="true">🔊</span> OUVIR A PERGUNTA';
  q.insertAdjacentElement('afterend',b);
}

/* ================= ajustes automáticos da tela (idempotente) ================= */
let lastKey=null,labelSeq=0,seenAlerts=null,seenFor='';
const TITLES={home:{elder:'Início',fam:'Painel'},meds:'Medicamentos',hist:'Acompanhamento',share:'Família',account:'Conta e segurança',help:'Ajuda'};
function pageTitle(){
  const r=curRole(),t=curTab();
  if(!r)return 'Entrar';
  const x=TITLES[t];return typeof x==='object'?(r==='elder'?x.elder:x.fam):(x||'');
}
function enhance(){
  const app=$('#app');if(!app)return;
  /* pontos de referência */
  const main=$('main',app);
  if(main){main.id='conteudo';main.tabIndex=-1;}
  else{const t=$('.auth-panel',app)||app.firstElementChild;if(t){t.id='conteudo';t.tabIndex=-1;if(t.classList.contains('auth-panel'))t.setAttribute('role','main');}}
  $$('.cuidar-mobile-nav',app).forEach(n=>{if(n.tagName!=='NAV'){n.setAttribute('role','navigation');}n.setAttribute('aria-label','Menu principal');});
  $$('aside nav',app).forEach(n=>n.setAttribute('aria-label','Menu lateral'));
  $$('i[class*="ph-"]:not([aria-hidden])',app).forEach(i=>i.setAttribute('aria-hidden','true'));
  /* menu: página atual */
  $$('.cuidar-mobile-nav button,aside nav button',app).forEach(b=>{
    const m=/go\('(\w+)'\)/.exec(b.getAttribute('onclick')||'');
    if(m&&m[1]===curTab())b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
  const scopes=[app].concat($$('#health-modal,#person-modal'));
  scopes.forEach(scope=>{
    /* itens clicáveis que não são botões */
    $$('[onclick]',scope).forEach(el=>{
      if(/^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL|SUMMARY)$/.test(el.tagName)||el.getAttribute('role'))return;
      el.setAttribute('role','button');if(!el.hasAttribute('tabindex'))el.tabIndex=0;
    });
    /* rótulos dos campos */
    $$('input,select,textarea',scope).forEach(el=>{
      if(el.type==='hidden'||el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||el.closest('label'))return;
      if(el.id&&scope.querySelector('label[for="'+el.id.replace(/"/g,'')+'"]'))return;
      const lb=el.previousElementSibling;
      if(lb&&lb.tagName==='LABEL'&&!lb.htmlFor&&!lb.querySelector('input,select,textarea')){
        if(!el.id)el.id='a11y-f'+(++labelSeq);lb.htmlFor=el.id;return;
      }
      const t=el.getAttribute('placeholder')||el.getAttribute('title');if(t)el.setAttribute('aria-label',t);
    });
    /* botões sem nome (só ícone ou símbolo) */
    $$('button,a',scope).forEach(b=>{
      if(b.getAttribute('aria-label')||b.getAttribute('aria-labelledby'))return;
      const txt=(b.textContent||'').replace(/\s+/g,' ').trim();
      const oc=b.getAttribute('onclick')||'';
      let m=/removeMed\((\d+)\)/.exec(oc);
      if(m){const med=medById(m[1]);b.setAttribute('aria-label','Remover '+(med?med.name:'medicamento'));return;}
      m=/updateStock\((\d+),(-?\d+)\)/.exec(oc);
      if(m){const med=medById(m[1]);b.setAttribute('aria-label',(+m[2]>0?'Aumentar':'Diminuir')+' o estoque de '+(med?med.name:'medicamento'));return;}
      if(!txt||/^[✕×＋+\-−]$/.test(txt)){const t=b.getAttribute('title');if(t)b.setAttribute('aria-label',t);}
    });
    /* barras de adesão */
    $$('div.rounded-full',scope).forEach(track=>{
      const fill=track.firstElementChild;if(track.getAttribute('role')||!fill)return;
      const w=/width:\s*([\d.]+)%/.exec(fill.getAttribute('style')||'');if(!w)return;
      track.setAttribute('role','progressbar');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');track.setAttribute('aria-valuenow',String(Math.round(+w[1])));
      const lab=track.previousElementSibling;if(lab){if(!lab.id)lab.id='a11y-pb'+(++labelSeq);track.setAttribute('aria-labelledby',lab.id);}
    });
  });
  syncPressed();
  enhanceHelp(app);
  /* botão flutuante nas telas sem cabeçalho (entrada, demonstração) */
  const hasHeader=!!$('header',app);let fab=$('#a11y-fab');
  if(!hasHeader&&!fab){
    fab=document.createElement('button');fab.type='button';fab.id='a11y-fab';fab.setAttribute('aria-haspopup','dialog');
    fab.innerHTML='<i class="ph-bold ph-eye" aria-hidden="true"></i><span>Acessibilidade</span>';fab.addEventListener('click',()=>window.openA11y());document.body.appendChild(fab);
  }else if(hasHeader&&fab)fab.remove();
  /* título da página + foco no título quando a tela muda */
  const key=(curRole()||'')+':'+curTab();
  if(key!==lastKey){
    const first=lastKey===null;lastKey=key;
    const t=pageTitle();document.title=t?'CUIDAR+ — '+t:'CUIDAR+ | Saúde e Medicamentos';
    if(!first&&!topModal()){const h=$('main h1',app)||$('h1',app);if(h){h.tabIndex=-1;h.focus({preventScroll:true});}}
  }
  /* avisa novos alertas (responsável) */
  if(hasS()&&curRole()==='fam'){
    const scope=(S.activeElderId||'')+':'+curRole(),ids=(S.alerts||[]).map(a=>a.id);
    if(seenAlerts===null||seenFor!==scope){seenAlerts=new Set(ids);seenFor=scope;}
    else{
      (S.alerts||[]).forEach(a=>{if(!seenAlerts.has(a.id)){seenAlerts.add(a.id);announce((a.severity==='high'?'Urgente: ':'Atenção: ')+a.txt,a.severity==='high');}});
    }
  }else{seenAlerts=null;}
}
function syncPressed(){$$('.reason-chip,.qt-chip').forEach(b=>b.setAttribute('aria-pressed',b.classList.contains('on')?'true':'false'));}

/* ================= painel de acessibilidade ================= */
function sw(key,title,desc,checked){
  return `<label class="a11y-row"><span>${title}${desc?`<small>${desc}</small>`:''}</span><input type="checkbox" role="switch" class="a11y-switch" data-pref="${key}" ${checked?'checked':''}><span class="a11y-state" aria-hidden="true"></span></label>`;
}
function panelHTML(){
  const fs=fsEff(),rm=reduceMotion();
  const seg=(name,val,label)=>`<label><input type="radio" name="a11y-theme" value="${val}" ${P.theme===val?'checked':''}><span>${label}</span></label>`;
  return `<div class="a11y-sheet">
    <div class="a11y-head"><h2 id="a11y-title">Acessibilidade</h2><button type="button" class="a11y-x" id="a11y-close">Fechar</button></div>
    <p class="a11y-intro">Estes ajustes ficam salvos neste aparelho.</p>
    <button type="button" class="a11y-big" onclick="readScreen()"><span aria-hidden="true">🔊</span> Ouvir esta tela</button>
    <fieldset><legend>Tamanho das letras</legend>
      <div class="a11y-fs"><button type="button" class="a11y-mini" id="fs-minus" aria-label="Diminuir as letras">A−</button>
      <input type="range" id="a11y-fs" min="16" max="28" step="2" value="${fs}" aria-label="Tamanho das letras" aria-valuetext="${FS_NAMES[fs]}">
      <button type="button" class="a11y-mini" id="fs-plus" aria-label="Aumentar as letras">A+</button></div>
      <p class="a11y-preview" id="fs-preview" aria-live="polite">${FS_NAMES[fs]}: tomar Losartana 50 mg às 08:00.</p></fieldset>
    <fieldset><legend>Cores</legend><div class="a11y-seg" role="radiogroup" aria-label="Tema">${seg('theme','light','Claro')}${seg('theme','dark','Escuro')}${seg('theme','system','Automático')}</div>
      ${sw('hc','Alto contraste','Preto e branco, com bordas fortes.',hcEff())}</fieldset>
    <fieldset><legend>Leitura</legend>
      ${sw('spacing','Mais espaço entre as letras e linhas','Ajuda a ler textos longos.',!!P.spacing)}
      ${sw('slowVoice','Voz mais devagar','Vale para o botão Ouvir.',!!P.slowVoice)}
      ${sw('help','Botões de ajuda (?)','Explicações curtas ao lado de cada função.',P.help!==false)}</fieldset>
    <fieldset><legend>Movimento</legend>
      ${sw('motion','Reduzir animações',rm&&P.motion==='system'?'Seu aparelho já pede menos movimento.':'Menos movimento na tela.',rm)}</fieldset>
    <fieldset><legend>Avisos</legend>
      ${sw('sound','Som nos avisos','Toque na hora de tomar o remédio.',P.sound!==false)}
      ${sw('vibrate','Vibração','Quando o aparelho permitir.',P.vibrate!==false)}
      ${sw('voiceReminders','Voz nos lembretes','Fala o nome do remédio na hora de tomar.',P.voiceReminders!==false)}</fieldset>
    <fieldset><legend>Telas</legend>
      ${sw('simple','Telas simplificadas no Modo Simples','Botões grandes e poucas informações para quem toma o remédio.',P.simple!==false)}</fieldset>
    <div class="a11y-foot"><button type="button" class="a11y-big" id="a11y-reset">Restaurar ajustes padrão</button></div>
  </div>`;
}
let rerenderTimer=null;
function rerenderSoon(){clearTimeout(rerenderTimer);rerenderTimer=setTimeout(()=>{if(typeof render==='function')render();},200);}
function setFs(v){
  const fs=Math.min(28,Math.max(16,Math.round(v/2)*2));
  P.fs=fs;saveP();applyPrefs();
  const r=$('#a11y-fs'),p=$('#fs-preview');
  if(r){r.value=String(fs);r.setAttribute('aria-valuetext',FS_NAMES[fs]);}
  if(p)p.textContent=FS_NAMES[fs]+': tomar Losartana 50 mg às 08:00.';
  rerenderSoon();
}
function wirePanel(o){
  $('#a11y-close',o).addEventListener('click',()=>window.closeA11y());
  o.addEventListener('click',e=>{if(e.target===o)window.closeA11y();});
  $('#fs-minus',o).addEventListener('click',()=>setFs(fsEff()-2));
  $('#fs-plus',o).addEventListener('click',()=>setFs(fsEff()+2));
  $('#a11y-fs',o).addEventListener('input',e=>setFs(Number(e.target.value)));
  $$('input[name="a11y-theme"]',o).forEach(r=>r.addEventListener('change',()=>{P.theme=r.value;saveP();applyPrefs();}));
  $$('[data-pref]',o).forEach(inp=>inp.addEventListener('change',()=>{
    const k=inp.dataset.pref;
    P[k]=k==='motion'?(inp.checked?'reduce':'normal'):inp.checked;
    saveP();applyPrefs();rerenderSoon();
    announce(inp.closest('label').firstElementChild.firstChild.textContent+(inp.checked?': ligado':': desligado'));
  }));
  $('#a11y-reset',o).addEventListener('click',()=>{
    Object.keys(P).forEach(k=>delete P[k]);Object.assign(P,DEF);saveP();applyPrefs();
    o.innerHTML=panelHTML();wirePanel(o);rerenderSoon();announce('Ajustes restaurados.');
  });
}
window.openA11y=function(){
  if($('#a11y-panel'))return;
  const o=document.createElement('div');o.id='a11y-panel';o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');o.setAttribute('aria-labelledby','a11y-title');
  o.innerHTML=panelHTML();document.body.appendChild(o);wirePanel(o);
};
window.closeA11y=function(){const o=$('#a11y-panel');if(o)o.remove();};
window.CuidarAcessibilidade={prefs:P,apply:applyPrefs,say,spokenMed,spokenTime,spokenDose,announce};

/* ================= eventos globais ================= */
document.addEventListener('click',e=>{
  const t=e.target.closest&&e.target.closest('[data-say],[data-med],.help-btn,.reason-chip,.qt-chip');
  if(!t)return;
  if(t.dataset.say!=null){say(t.dataset.say);return;}
  if(t.dataset.med!=null){window.speakMed(t.dataset.med,t.dataset.t);return;}
  if(t.classList.contains('help-btn')){toggleHelp(t);return;}
  setTimeout(syncPressed,0);
});
document.addEventListener('click',e=>{
  const y=e.target.closest&&e.target.closest('#cd-yes');
  if(y&&/LEMBRAR/i.test(y.textContent))announce('Certo. Vou lembrar de novo em 30 minutos.');
},true);
document.addEventListener('keydown',e=>{
  if(e.key==='Tab'){
    const m=topModal();if(!m)return;
    const f=focusables(m),a=document.activeElement;
    if(!f.length){e.preventDefault();m.focus();return;}
    if(!m.contains(a)){e.preventDefault();f[0].focus();return;}
    if(e.shiftKey&&a===f[0]){e.preventDefault();f[f.length-1].focus();}
    else if(!e.shiftKey&&a===f[f.length-1]){e.preventDefault();f[0].focus();}
  }else if(e.key==='Escape'){
    const m=topModal();if(!m)return;
    if(m.id==='a11y-panel')window.closeA11y();
    else if(m.id==='person-modal')m.remove();
    else if(m.id==='dose-alarm'&&typeof window.closeDoseAlarm==='function')window.closeDoseAlarm();
  }else if(e.key==='Enter'||e.key===' '){
    const t=e.target;
    if(t&&t.getAttribute&&t.getAttribute('role')==='button'&&!/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(t.tagName)){e.preventDefault();t.click();}
  }
});

/* ================= observador do DOM ================= */
let scheduled=false;
function schedule(){if(scheduled)return;scheduled=true;raf(()=>{scheduled=false;try{enhance();}catch(err){console.warn('a11y',err);}});}
new MutationObserver(muts=>{
  let need=false;
  for(const m of muts){
    m.addedNodes.forEach(n=>{
      if(n.nodeType!==1)return;need=true;
      if(MODALS.includes(n.id)){onModalOpen(n);if(n.id==='confirm-dose')decorateConfirm(n);}
      if(n.classList&&n.classList.contains('toast'))decorateToast(n);
      if(n.id&&n.id.indexOf('dr-')===0)decorateDoseRow(n);
    });
    m.removedNodes.forEach(n=>{if(n.nodeType===1&&MODALS.includes(n.id))onModalClose(n);});
  }
  if(need)schedule();
}).observe(document.body,{childList:true,subtree:true});

/* ================= integração com a renderização ================= */
const baseRender=window.render;
window.render=function(){applyPrefs();const r=baseRender.apply(this,arguments);schedule();return r;};
const baseSoft=window.softRender;
if(typeof baseSoft==='function')window.softRender=function(){const sig=focusSig();const r=baseSoft.apply(this,arguments);restoreFocus(sig);return r;};
const baseAfter=window.afterRender;
window.afterRender=function(){if(typeof baseAfter==='function')baseAfter.apply(this,arguments);schedule();};

ensureLive();
applyPrefs();
if(typeof render==='function')render();
})();
