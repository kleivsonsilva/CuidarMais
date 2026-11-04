/* CUIDAR+ — melhorias: confirmação de dose, horários, fotos, estoque, ficha de saúde e telas estáveis.
   Carregado depois do script.js. Tudo fica dentro de uma função para não colidir com o resto do app. */
(function(){
'use strict';

/* ---------- utilidades ---------- */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const todayStr=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const nowHM=()=>{const d=new Date();return pad(d.getHours())+':'+pad(d.getMinutes());};
const cloud=()=>window.CuidarCloud||{};
const isPin=()=>!!(cloud().isPinSession&&cloud().isPinSession());
const isFam=()=>!!(cloud().isFamily&&cloud().isFamily());
const meds=()=>(typeof S!=='undefined'&&S&&S.meds)||[];
const medById=id=>meds().find(m=>String(m.id)===String(id));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const dateBR=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?s.split('-').reverse().join('/'):'';
const daysUntil=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?Math.round((new Date(s+'T12:00:00')-new Date(todayStr()+'T12:00:00'))/86400000):null;
const whenLabel=d=>d===null?'':d===0?'hoje':d===1?'amanhã':d>1?`em ${d} dias`:d===-1?'ontem':`há ${-d} dias`;
const safePhoto=p=>(typeof p==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p))?p:'';

/* ---------- avisos na tela ---------- */
window.toast=function(msg,kind){
  let box=$('#toast-box');
  if(!box){box=document.createElement('div');box.id='toast-box';document.body.appendChild(box);}
  const t=document.createElement('div');t.className='toast '+(kind||'');t.setAttribute('role','status');t.textContent=msg;
  box.appendChild(t);setTimeout(()=>t.remove(),6000);
};
function undoToast(msg,onUndo){
  let box=$('#toast-box');
  if(!box){box=document.createElement('div');box.id='toast-box';document.body.appendChild(box);}
  const t=document.createElement('div');t.className='toast';t.setAttribute('role','status');
  const span=document.createElement('span');span.textContent=msg;
  const b=document.createElement('button');b.type='button';b.textContent='DESFAZER';
  b.onclick=()=>{t.remove();onUndo();};
  t.append(span,b);box.appendChild(t);setTimeout(()=>t.remove(),10000);
}

/* ---------- telas que não apagam o que você digita ---------- */
function formsDirty(){
  for(const el of document.querySelectorAll('#app input,#app textarea')){
    if(['file','checkbox','radio','button','submit'].includes(el.type))continue;
    if(el.value!==el.defaultValue)return true;
  }
  return false;
}
window.softRender=function(){
  const tag=(document.activeElement&&document.activeElement.tagName)||'';
  if(/INPUT|SELECT|TEXTAREA/.test(tag)||formsDirty())return;
  const y=window.scrollY;render();window.scrollTo(0,y);
};
window.renderKeep=function(){
  const keep=[...document.querySelectorAll('#app input[id],#app textarea[id]')]
    .filter(el=>!['file','checkbox','radio','button','submit'].includes(el.type)&&el.value!==el.defaultValue)
    .map(el=>[el.id,el.value]);
  const a=document.activeElement,aid=a&&a.id,pos=a&&a.selectionStart,y=window.scrollY;
  render();
  for(const [id,v] of keep){const el=document.getElementById(id);if(el&&el.value!==v)el.value=v;}
  if(aid){const el=document.getElementById(aid);if(el){try{el.focus();el.setSelectionRange(pos,pos);}catch(_){}}}
  window.scrollTo(0,y);
  window.afterRender();
};
window.afterRender=function(){refreshTimeChips();refreshPhotoPreview();};

/* ---------- 1 e 2: confirmar antes de registrar ---------- */
const REASONS=['Esqueci','Passei mal','Acabou o remédio','Não estava em casa','Outro motivo'];
function closeConfirm(){$('#confirm-dose')?.remove();}
window.confirmDose=function(kind,mid,t,opts){
  const m=medById(mid);
  if(!m){opts&&opts.onDone&&opts.onDone();return;}
  closeConfirm();
  const photo=safePhoto(m.photo);
  const cfg={
    ok:{q:`Você tomou <b>${esc(m.name)}</b> às ${esc(t)}?`,yes:'SIM, JÁ TOMEI ✅',cls:'bg-emerald-600'},
    no:{q:`Você <b>NÃO tomou</b> <b>${esc(m.name)}</b> às ${esc(t)}?`,yes:'SIM, NÃO TOMEI',cls:'bg-rose-600'},
    later:{q:`Lembrar de <b>${esc(m.name)}</b> daqui a 30 minutos?`,yes:'SIM, LEMBRAR DEPOIS ⏳',cls:'bg-amber-500 !text-slate-900'}
  }[kind];
  if(!cfg)return;
  const o=document.createElement('div');
  o.id='confirm-dose';o.setAttribute('role','alertdialog');o.setAttribute('aria-modal','true');
  o.className='fixed inset-0 z-[130] bg-slate-900/85 flex items-end sm:items-center justify-center p-4';
  o.innerHTML=`<div class="w-full max-w-md rounded-3xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white p-6 shadow-2xl space-y-4">
    <p class="text-sm font-bold text-teal-700 dark:text-teal-300">Confirme para evitar toque sem querer</p>
    ${photo?`<img src="${photo}" alt="Foto de ${esc(m.name)}" class="w-24 h-24 rounded-2xl object-cover border mx-auto">`:''}
    <p class="font-display text-2xl leading-snug text-center">${cfg.q}</p>
    ${kind==='no'?`<div><p class="text-sm font-semibold mb-2">Motivo (opcional):</p><div id="cd-reasons" class="flex flex-wrap gap-2">${REASONS.map(r=>`<button type="button" data-r="${esc(r)}" class="reason-chip">${esc(r)}</button>`).join('')}</div></div>`:''}
    <div class="grid gap-3">
      <button type="button" id="cd-yes" class="h-16 rounded-2xl ${cfg.cls} text-white font-bold text-lg">${cfg.yes}</button>
      <button type="button" id="cd-back" class="h-14 rounded-2xl border-2 border-slate-300 dark:border-slate-600 font-bold text-lg">VOLTAR</button>
    </div></div>`;
  document.body.appendChild(o);
  let reason='';
  o.querySelectorAll('.reason-chip').forEach(b=>b.onclick=()=>{
    const on=b.classList.contains('on');
    o.querySelectorAll('.reason-chip').forEach(x=>x.classList.remove('on'));
    if(!on){b.classList.add('on');reason=b.dataset.r;}else reason='';
  });
  $('#cd-back',o).onclick=closeConfirm;
  $('#cd-yes',o).onclick=()=>{closeConfirm();perform(kind,m.id,t,reason,opts);};
  $('#cd-back',o).focus();
};
function perform(kind,mid,t,reason,opts){
  const m=medById(mid);if(!m)return;
  if(kind==='ok'){act(m.id,t,'ok');}
  else if(kind==='no'){act(m.id,t,'no',reason||'não informado');if(!isPin())missedAlert(m,t,reason);toast('Registrado. Não tome dose dupla e siga a orientação do médico.','warn');}
  else{deferDose(m.id,t);}
  opts&&opts.onDone&&opts.onDone();
  if(kind!=='later'){
    const label=kind==='ok'?'tomado':'não tomado';
    undoToast(`${m.name} ${t}: ${label}.`,()=>undoDose(m.id,t));
  }
}
function missedAlert(m,t,reason){
  try{
    const id=`no-${m.id}-${t}-${todayStr()}`;
    S.alerts=(S.alerts||[]).filter(a=>a.id!==id);
    S.alerts.unshift({id,txt:`${S.elder?.name||'A pessoa'} marcou que NÃO tomou ${m.name} das ${t}${reason?` (${reason})`:''}.`,at:nowHM(),type:'no',severity:'high'});
    save();
  }catch(_){}
}
window.undoDose=function(mid,t){
  if(isPin()){act(mid,t,'undo');toast('Registro desfeito.');return;}
  const m=medById(mid);if(!m)return;
  const old=(S.logs||[]).find(l=>String(l.med)===String(mid)&&l.time===t&&l.date===todayStr());
  S.logs=(S.logs||[]).filter(l=>!(String(l.med)===String(mid)&&l.time===t&&l.date===todayStr()));
  if(old&&old.status==='ok')m.stock=(Number(m.stock)||0)+(Number(m.per)||1);
  if(S.deferred)delete S.deferred[`defer-${mid}-${t}`];
  S.alerts=(S.alerts||[]).filter(a=>a.id!==`no-${mid}-${t}-${todayStr()}`);
  S.audit&&S.audit.unshift(`${new Date().toLocaleString('pt-BR')} — ${m.name} ${t}: registro desfeito`);
  save();render();toast('Registro desfeito.');
};

/* ---------- 4: horários com ":" automático ---------- */
function normTime(v){
  const d=String(v||'').replace(/\D/g,'');
  if(!d)return null;
  let h,m;
  if(d.length<=2){h=+d;m=0;}
  else if(d.length===3){h=+d[0];m=+d.slice(1);}
  else{h=+d.slice(0,2);m=+d.slice(2,4);}
  if(h>23||m>59)return null;
  return pad(h)+':'+pad(m);
}
window.timeMask=function(el){
  let d=el.value.replace(/\D/g,'').slice(0,4);
  if(d.length>=3){
    if(+d.slice(0,2)>23)d='0'+d.slice(0,3);
    el.value=d.slice(0,2)+':'+d.slice(2,4);
  }else el.value=d;
};
const getTimes=()=>String($('#times')?.value||'').split(',').map(x=>x.trim()).filter(Boolean);
function setTimes(arr){
  const u=[...new Set(arr)].filter(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)).sort();
  const h=$('#times');if(h)h.value=u.join(',');
  refreshTimeChips();
}
function refreshTimeChips(){
  const box=$('#time-chips');if(!box)return;
  const list=getTimes();
  box.innerHTML=list.length?list.map(t=>`<span class="chip">${esc(t)}<button type="button" onclick="removeTime('${esc(t)}')" aria-label="Remover ${esc(t)}">×</button></span>`).join(''):'<span class="text-xs text-slate-500">Nenhum horário ainda.</span>';
  document.querySelectorAll('[data-qt]').forEach(b=>b.classList.toggle('on',list.includes(b.dataset.qt)));
}
window.timeFieldHTML=function(){
  const quick=[['☀️ Manhã','08:00'],['🍽️ Almoço','12:00'],['🌤️ Tarde','16:00'],['🌙 Noite','20:00']];
  return `<div class="space-y-2"><label class="text-xs font-bold">Horários de tomar</label>
    <input type="hidden" id="times" value="08:00">
    <div id="time-chips" class="flex flex-wrap gap-2 min-h-[2rem]"></div>
    <div class="flex gap-2"><input id="timeInput" class="field" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="Digite Horário" oninput="timeMask(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();addTimeFromInput();}"><button type="button" onclick="addTimeFromInput()" class="px-4 rounded-xl bg-teal-600 text-white font-bold shrink-0">Adicionar</button></div>
    <div class="flex flex-wrap gap-2">${quick.map(q=>`<button type="button" data-qt="${q[1]}" onclick="toggleTime('${q[1]}')" class="qt-chip">${q[0]} ${q[1]}</button>`).join('')}</div>
    <div class="flex flex-wrap items-center gap-2 text-xs"><span>A cada</span><select id="everyH" class="field !w-auto !min-h-0 !py-2"><option>4</option><option>6</option><option selected>8</option><option>12</option></select><span>horas, a partir de</span><input id="everyFrom" class="field !w-24 !min-h-0 !py-2 text-center" inputmode="numeric" maxlength="5" value="08:00" oninput="timeMask(this)"><button type="button" onclick="everyHours()" class="px-3 py-2 rounded-xl border font-bold">Gerar</button></div></div>`;
};
window.addTimeFromInput=function(){
  const i=$('#timeInput');if(!i)return;
  const t=normTime(i.value);
  if(!t){toast('Horário inválido. Use de 00:00 a 23:59.','warn');return;}
  setTimes([...getTimes(),t]);i.value='';i.focus();
};
window.toggleTime=t=>{const l=getTimes();setTimes(l.includes(t)?l.filter(x=>x!==t):[...l,t]);};
window.removeTime=t=>setTimes(getTimes().filter(x=>x!==t));
window.everyHours=function(){
  const from=normTime($('#everyFrom')?.value);
  const h=+($('#everyH')?.value||8);
  if(!from){toast('Informe o horário inicial, por exemplo 06:00.','warn');return;}
  const [fh,fm]=from.split(':').map(Number),out=[];
  for(let k=0;k<24;k+=h)out.push(pad((fh+k)%24)+':'+pad(fm));
  setTimes(out);
};

/* ---------- 3: foto do remédio ---------- */
async function loadBitmap(file){
  if(window.createImageBitmap){try{return await createImageBitmap(file);}catch(_){}}
  const img=new Image();const url=URL.createObjectURL(file);
  try{img.src=url;await img.decode();return img;}finally{setTimeout(()=>URL.revokeObjectURL(url),3000);}
}
async function compressImage(file,maxSide,maxChars){
  const bmp=await loadBitmap(file);
  const base=Math.max(bmp.width,bmp.height);
  for(const side of [maxSide,maxSide*.8,maxSide*.65,maxSide*.5]){
    const sc=Math.min(1,side/base),w=Math.max(1,Math.round(bmp.width*sc)),h=Math.max(1,Math.round(bmp.height*sc));
    const c=document.createElement('canvas');c.width=w;c.height=h;
    const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,h);g.drawImage(bmp,0,0,w,h);
    for(const q of [.75,.6,.5,.4]){const url=c.toDataURL('image/jpeg',q);if(url.length<=maxChars)return url;}
  }
  throw Error('imagem-grande');
}
function canStore(extra){try{return JSON.stringify(S).length+extra<780000;}catch(_){return true;}}
window.medPhotoField=function(){
  return `<div class="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/40 text-xs space-y-2"><b>Foto da caixa (opcional)</b>
    <p class="text-slate-600 dark:text-slate-300">A foto aparece no aviso da hora de tomar e na lista de remédios, para a pessoa reconhecer a caixa.</p>
    <div class="flex items-center gap-3"><div id="photoPreview" class="w-20 h-20 shrink-0 rounded-2xl bg-white dark:bg-slate-800 border flex items-center justify-center text-3xl overflow-hidden">📷</div>
    <div class="flex flex-wrap gap-2"><label class="px-3 py-2 rounded-xl bg-teal-600 text-white text-sm font-bold cursor-pointer">📷 Tirar foto<input type="file" accept="image/*" capture="environment" onchange="photo(this)" class="hidden"></label>
    <label class="px-3 py-2 rounded-xl border text-sm font-bold cursor-pointer">🖼️ Galeria<input type="file" accept="image/*" onchange="photo(this)" class="hidden"></label>
    <button type="button" onclick="clearMedPhoto()" class="px-3 py-2 rounded-xl text-rose-600 text-sm font-bold">Remover</button></div></div>
    <input type="hidden" id="medPhoto" value=""><p id="ocr" class="font-semibold"></p></div>`;
};
function refreshPhotoPreview(){
  const box=$('#photoPreview'),v=safePhoto($('#medPhoto')?.value);
  if(box)box.innerHTML=v?`<img src="${v}" alt="Foto do remédio" class="w-full h-full object-cover">`:'📷';
}
window.photo=async function(input){
  const f=input.files&&input.files[0];if(!f)return;
  const out=$('#ocr');
  try{
    const url=await compressImage(f,256,28000);
    if(!canStore(url.length)){alert('Limite de dados da conta quase atingido. Remova fotos antigas antes de adicionar outra.');return;}
    $('#medPhoto').value=url;refreshPhotoPreview();
    if(out)out.textContent='Foto pronta. Ela será salva junto com o remédio.';
  }catch(e){if(out)out.textContent='Não foi possível usar essa imagem. Tente outra foto.';}
  input.value='';
};
window.clearMedPhoto=()=>{const h=$('#medPhoto');if(h)h.value='';refreshPhotoPreview();const o=$('#ocr');if(o)o.textContent='';};
window.medThumb=function(m){
  const p=safePhoto(m.photo);
  return p?`<img src="${p}" alt="Foto de ${esc(m.name)}" class="w-12 h-12 rounded-2xl object-cover border">`
    :`<div class="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950 flex items-center justify-center text-2xl">${esc(m.icon||'💊')}</div>`;
};
window.medPhotoBig=function(m){
  const p=safePhoto(m.photo);
  return p?`<img src="${p}" alt="Foto de ${esc(m.name)}" class="w-28 h-28 rounded-3xl object-cover border-2 border-teal-200 mb-3">`:'';
};
window.medPhotoButtons=function(m){
  if(!isFam())return '';
  return `<div class="flex gap-2 text-xs"><label class="flex-1 py-2 rounded-xl border font-bold text-center cursor-pointer">📷 ${safePhoto(m.photo)?'Trocar foto':'Adicionar foto'}<input type="file" accept="image/*" class="hidden" onchange="setMedPhoto('${esc(m.id)}',this)"></label>${safePhoto(m.photo)?`<button type="button" onclick="removeMedPhoto('${esc(m.id)}')" class="px-3 py-2 rounded-xl border border-rose-200 text-rose-600 font-bold">Remover foto</button>`:''}</div>`;
};
window.setMedPhoto=async function(id,input){
  const f=input.files&&input.files[0],m=medById(id);if(!f||!m)return;
  try{
    const url=await compressImage(f,256,28000);
    if(!canStore(url.length)){alert('Limite de dados da conta quase atingido. Remova fotos antigas antes.');return;}
    m.photo=url;save();render();toast('Foto salva no remédio.');
  }catch(_){toast('Não foi possível usar essa imagem.','warn');}
};
window.removeMedPhoto=function(id){const m=medById(id);if(!m)return;delete m.photo;save();render();};

/* ---------- estoque: "acaba em N dias" ---------- */
function dosesPerDay(m){const d=(m.days&&m.days.length)||7;return (m.times?.length||1)*(d/7);}
window.daysLeft=function(m){
  const per=Number(m.per)||1,dpd=dosesPerDay(m);
  if(!dpd)return Infinity;
  return Math.floor((Number(m.stock)||0)/(per*dpd));
};
const activeMed=m=>!m.endDate||m.endDate>=todayStr();
function lowStock(){
  return meds().filter(activeMed).map(m=>({m,left:window.daysLeft(m)}))
    .filter(x=>x.left<=5||(Number(x.m.stock)||0)<=(Number(x.m.min)||0)&&x.left<=7)
    .sort((a,b)=>a.left-b.left);
}
const stockPhrase=(m,left)=>left<=0?`${m.name} está acabando (resta${(m.stock|0)===1?'':'m'} ${m.stock|0})`:left===1?`${m.name} acaba em 1 dia`:`${m.name} acaba em ${left} dias`;
window.stockNote=function(m){
  const left=window.daysLeft(m);
  if(!isFinite(left))return '';
  return `<span class="block text-[11px] font-normal ${left<=5?'text-rose-600':'text-slate-500'}">${left<=0?'acabando':'≈ '+left+' dia'+(left===1?'':'s')+' de remédio'}</span>`;
};

/* ---------- 5: ficha de saúde ---------- */
const BLOOD=['','A+','A-','B+','B-','AB+','AB-','O+','O-','Não sei'];
function H(){
  const e=S.elder;const h=e.health=e.health||{};
  h.blood=h.blood||'';h.sus=h.sus||'';h.allergies=h.allergies||'';h.conditions=h.conditions||'';h.notes=h.notes||'';
  for(const k of ['contacts','appointments','prescriptions','exams'])if(!Array.isArray(h[k]))h[k]=[];
  return h;
}
const photoCount=()=>{const h=H();return [...h.prescriptions,...h.exams].filter(x=>x.photo).length;};
function healthSummary(){
  if(!S.elder)return '';
  const h=H(),up=h.appointments.filter(a=>(daysUntil(a.date)??-1)>=0).length;
  const rx=h.prescriptions.length,ex=h.exams.length;
  return `${up} consulta${up===1?'':'s'} marcada${up===1?'':'s'} · ${rx} receita${rx===1?'':'s'} · ${ex} exame${ex===1?'':'s'}`;
}
window.healthCard=function(){
  const nm=esc(S.elder?.name||'');
  return `<section class="bg-white dark:bg-slate-800 rounded-3xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm"><h2 class="font-display font-bold text-lg mb-1">Ficha de saúde</h2>
    <p class="text-xs text-slate-500 mb-3">Dados de emergência, consultas, receitas e exames de <b>${nm}</b>.</p>
    <p class="text-sm mb-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900">${esc(healthSummary())}</p>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3"><button type="button" onclick="openHealth('emerg')" class="py-3 rounded-xl bg-teal-600 text-white font-bold">Abrir ficha de saúde</button>
    <button type="button" onclick="printHealth()" class="py-3 rounded-xl border font-bold">🖨️ Levar à consulta (PDF)</button></div></section>`;
};
let htab='emerg';
window.openHealth=function(tabName){if(isPin())return;if(tabName)htab=tabName;drawHealth();};
window.closeHealth=function(){$('#health-modal')?.remove();document.body.style.overflow='';render();};
window.healthTab=function(t){htab=t;drawHealth();};
function inputCls(){return 'field';}
function tabsHTML(){
  const T=[['emerg','🚑 Emergência'],['appt','📅 Consultas'],['rx','📄 Receitas'],['exam','🧪 Exames']];
  return `<div class="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-4">${T.map(t=>`<button type="button" onclick="healthTab('${t[0]}')" class="shrink-0 px-4 py-2 rounded-xl border font-bold text-sm ${htab===t[0]?'bg-teal-600 text-white border-teal-600':'bg-white dark:bg-slate-800'}">${t[1]}</button>`).join('')}</div>`;
}
function emergHTML(){
  const h=H();
  return `<div class="space-y-3">
    <div class="grid grid-cols-2 gap-3"><div><label class="text-xs font-bold">Tipo sanguíneo</label><select id="h-blood" class="field">${BLOOD.map(b=>`<option value="${b}" ${h.blood===b?'selected':''}>${b||'Selecione'}</option>`).join('')}</select></div>
    <div><label class="text-xs font-bold">Cartão SUS</label><input id="h-sus" class="field" inputmode="numeric" maxlength="15" value="${esc(h.sus)}" placeholder="15 números"></div></div>
    <div><label class="text-xs font-bold">Alergias</label><textarea id="h-allergies" rows="2" class="field" placeholder="Ex.: dipirona, penicilina">${esc(h.allergies)}</textarea></div>
    <div><label class="text-xs font-bold">Doenças e condições</label><textarea id="h-conditions" rows="2" class="field" placeholder="Ex.: hipertensão, diabetes">${esc(h.conditions)}</textarea></div>
    <div><label class="text-xs font-bold">Observações importantes</label><textarea id="h-notes" rows="2" class="field" placeholder="Ex.: usa marcapasso, não enxerga bem">${esc(h.notes)}</textarea></div>
    <button type="button" onclick="saveEmergency()" class="w-full py-3 rounded-xl bg-teal-600 text-white font-bold">Salvar dados de emergência</button>
    <div class="pt-3 border-t"><h3 class="font-bold mb-2">Contatos de emergência</h3>
    ${h.contacts.map(c=>`<div class="flex items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 mb-2"><div><b>${esc(c.name)}</b> <span class="text-xs text-slate-500">${esc(c.rel||'')}</span><br><a class="text-teal-700 font-bold" href="tel:${esc(String(c.phone).replace(/[^\d+]/g,''))}">${esc(c.phone)}</a></div><button type="button" onclick="delHealth('contacts','${c.id}')" class="text-rose-600 font-bold px-2" aria-label="Remover contato">✕</button></div>`).join('')||'<p class="text-xs text-slate-500 mb-2">Nenhum contato cadastrado.</p>'}
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2"><input id="hc-name" class="field" placeholder="Nome"><input id="hc-phone" class="field" inputmode="tel" placeholder="Telefone com DDD"><input id="hc-rel" class="field" placeholder="Parentesco"></div>
    <button type="button" onclick="addContact()" class="mt-2 w-full py-3 rounded-xl border font-bold">+ Adicionar contato</button></div></div>`;
}
function apptHTML(){
  const h=H(),list=[...h.appointments].sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));
  return `<div class="space-y-3"><div class="p-4 rounded-2xl bg-white dark:bg-slate-800 border space-y-2"><h3 class="font-bold">Nova consulta</h3>
    <input id="ha-title" class="field" placeholder="Especialidade ou motivo (ex.: Cardiologista)">
    <input id="ha-doctor" class="field" placeholder="Médico ou clínica (opcional)">
    <div class="grid grid-cols-2 gap-2"><div><label class="text-xs font-bold">Data</label><input id="ha-date" type="date" class="field"></div><div><label class="text-xs font-bold">Hora</label><input id="ha-time" class="field" inputmode="numeric" maxlength="5" placeholder="14:30" oninput="timeMask(this)"></div></div>
    <input id="ha-place" class="field" placeholder="Local (opcional)">
    <button type="button" onclick="addAppt()" class="w-full py-3 rounded-xl bg-teal-600 text-white font-bold">Salvar consulta</button></div>
    ${list.map(a=>{const d=daysUntil(a.date);const past=d!==null&&d<0;return `<div class="p-4 rounded-2xl border ${past?'opacity-60 bg-slate-50 dark:bg-slate-900':'bg-white dark:bg-slate-800 border-teal-200'}"><div class="flex justify-between gap-2"><div><b>${esc(a.title)}</b>${a.doctor?`<span class="text-xs text-slate-500"> · ${esc(a.doctor)}</span>`:''}<p class="text-sm">${dateBR(a.date)}${a.time?' às '+esc(a.time):''} <b class="${d!==null&&d>=0&&d<=2?'text-amber-600':'text-slate-500'}">(${whenLabel(d)})</b></p>${a.place?`<p class="text-xs text-slate-500">${esc(a.place)}</p>`:''}</div><button type="button" onclick="delHealth('appointments','${a.id}')" class="text-rose-600 font-bold px-2" aria-label="Remover consulta">✕</button></div></div>`;}).join('')||'<p class="text-sm text-slate-500">Nenhuma consulta cadastrada.</p>'}</div>`;
}
function docForm(kind){
  const rx=kind==='rx';
  return `<div class="p-4 rounded-2xl bg-white dark:bg-slate-800 border space-y-2"><h3 class="font-bold">${rx?'Nova receita':'Novo exame'}</h3>
    <input id="hd-title" class="field" placeholder="${rx?'Remédio ou receita (ex.: Losartana 50 mg)':'Exame (ex.: Hemograma)'}">
    <input id="hd-doctor" class="field" placeholder="${rx?'Médico (opcional)':'Laboratório ou médico (opcional)'}">
    <div class="grid grid-cols-2 gap-2"><div><label class="text-xs font-bold">${rx?'Data da receita':'Data do exame'}</label><input id="hd-date" type="date" class="field"></div>${rx?`<div><label class="text-xs font-bold">Válida até</label><input id="hd-valid" type="date" class="field"></div>`:'<div></div>'}</div>
    <textarea id="hd-notes" rows="2" class="field" placeholder="${rx?'Observações':'Resultado ou observações'}"></textarea>
    <div class="flex items-center gap-3"><div id="hd-prev" class="w-16 h-16 rounded-xl border bg-slate-50 dark:bg-slate-900 flex items-center justify-center overflow-hidden">📎</div>
    <label class="px-3 py-2 rounded-xl border text-sm font-bold cursor-pointer">📷 Foto do documento (opcional)<input type="file" accept="image/*" class="hidden" onchange="pickDocPhoto(this)"></label></div>
    <input type="hidden" id="hd-photo" value="">
    <button type="button" onclick="addDoc('${kind}')" class="w-full py-3 rounded-xl bg-teal-600 text-white font-bold">Salvar</button></div>`;
}
function docList(kind){
  const h=H(),key=kind==='rx'?'prescriptions':'exams';
  const list=[...h[key]].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  return list.map(x=>{
    const d=kind==='rx'?daysUntil(x.valid):null;
    const badge=kind==='rx'&&x.valid?`<b class="${d<0?'text-rose-600':d<=15?'text-amber-600':'text-emerald-600'}">${d<0?'vencida':'válida até '+dateBR(x.valid)} (${whenLabel(d)})</b>`:'';
    return `<div class="p-4 rounded-2xl border bg-white dark:bg-slate-800 flex gap-3">${safePhoto(x.photo)?`<button type="button" onclick="viewDocPhoto('${key}','${x.id}')" aria-label="Ver foto"><img src="${safePhoto(x.photo)}" alt="" class="w-16 h-16 rounded-xl object-cover border"></button>`:''}
      <div class="flex-1 min-w-0"><b>${esc(x.title)}</b>${x.doctor?`<span class="text-xs text-slate-500"> · ${esc(x.doctor)}</span>`:''}<p class="text-xs text-slate-500">${x.date?dateBR(x.date):''}</p>${badge?`<p class="text-sm">${badge}</p>`:''}${x.notes?`<p class="text-sm mt-1">${esc(x.notes)}</p>`:''}</div>
      <button type="button" onclick="delHealth('${key}','${x.id}')" class="text-rose-600 font-bold px-2 self-start" aria-label="Remover">✕</button></div>`;
  }).join('')||`<p class="text-sm text-slate-500">${kind==='rx'?'Nenhuma receita cadastrada.':'Nenhum exame cadastrado.'}</p>`;
}
function drawHealth(){
  if(!S.elder)return;
  let o=$('#health-modal');
  if(!o){o=document.createElement('div');o.id='health-modal';o.setAttribute('role','dialog');o.setAttribute('aria-modal','true');
    o.className='fixed inset-0 z-[120] bg-slate-50 dark:bg-slate-900 overflow-y-auto';document.body.appendChild(o);document.body.style.overflow='hidden';}
  const sc=o.scrollTop;
  const body=htab==='emerg'?emergHTML():htab==='appt'?apptHTML():htab==='rx'?docForm('rx')+'<div class="space-y-3 mt-4">'+docList('rx')+'</div>':docForm('exam')+'<div class="space-y-3 mt-4">'+docList('exam')+'</div>';
  o.innerHTML=`<div class="max-w-2xl mx-auto p-4 pb-28"><div class="flex items-center justify-between gap-3 mb-4"><div><h1 class="font-display text-2xl font-bold">Ficha de saúde</h1><p class="text-sm text-slate-500">${esc(S.elder.name)}</p></div><button type="button" onclick="closeHealth()" class="px-4 py-2 rounded-xl border font-bold">Fechar</button></div>${tabsHTML()}${body}
    <button type="button" onclick="printHealth()" class="mt-6 w-full py-3 rounded-xl border-2 border-teal-600 text-teal-700 dark:text-teal-300 font-bold">🖨️ Levar à consulta (imprimir ou salvar em PDF)</button></div>`;
  o.scrollTop=sc;
}
const val=id=>($('#'+id)?.value||'').trim();
window.saveEmergency=function(){
  const h=H();
  h.blood=val('h-blood');h.sus=val('h-sus').replace(/\D/g,'').slice(0,15);
  h.allergies=val('h-allergies').slice(0,500);h.conditions=val('h-conditions').slice(0,500);h.notes=val('h-notes').slice(0,500);
  save();toast('Dados de emergência salvos.');
};
window.addContact=function(){
  const name=val('hc-name'),phone=val('hc-phone');
  if(!name||phone.replace(/\D/g,'').length<8){toast('Informe o nome e um telefone válido.','warn');return;}
  H().contacts.push({id:uid(),name:name.slice(0,80),phone:phone.slice(0,25),rel:val('hc-rel').slice(0,40)});
  save();drawHealth();
};
window.addAppt=function(){
  const title=val('ha-title'),date=val('ha-date');
  if(!title||!date){toast('Informe o motivo e a data da consulta.','warn');return;}
  const t=val('ha-time')?normTime(val('ha-time')):'';
  if(val('ha-time')&&!t){toast('Hora inválida. Use por exemplo 14:30.','warn');return;}
  H().appointments.push({id:uid(),title:title.slice(0,80),doctor:val('ha-doctor').slice(0,80),date,time:t||'',place:val('ha-place').slice(0,100)});
  save();drawHealth();toast('Consulta salva.');
};
window.pickDocPhoto=async function(input){
  const f=input.files&&input.files[0];if(!f)return;
  if(photoCount()>=6){toast('Limite de 6 fotos de documentos por pessoa.','warn');input.value='';return;}
  try{
    const url=await compressImage(f,900,70000);
    if(!canStore(url.length)){toast('Limite de dados da conta quase atingido.','warn');return;}
    $('#hd-photo').value=url;$('#hd-prev').innerHTML=`<img src="${url}" alt="" class="w-full h-full object-cover">`;
  }catch(_){toast('Não foi possível usar essa imagem.','warn');}
  input.value='';
};
window.addDoc=function(kind){
  const title=val('hd-title');
  if(!title){toast('Informe o nome.','warn');return;}
  const item={id:uid(),title:title.slice(0,100),doctor:val('hd-doctor').slice(0,80),date:val('hd-date'),notes:val('hd-notes').slice(0,500)};
  if(kind==='rx')item.valid=val('hd-valid');
  const p=safePhoto($('#hd-photo')?.value);if(p)item.photo=p;
  H()[kind==='rx'?'prescriptions':'exams'].push(item);
  save();drawHealth();toast('Salvo na ficha de saúde.');
};
window.delHealth=function(key,id){
  if(!confirm('Remover este item da ficha de saúde?'))return;
  const h=H();h[key]=h[key].filter(x=>x.id!==id);save();drawHealth();
};
window.viewDocPhoto=function(key,id){
  const x=H()[key].find(i=>i.id===id);const p=x&&safePhoto(x.photo);if(!p)return;
  const o=document.createElement('div');o.id='photo-view';o.className='fixed inset-0 z-[140] bg-black/90 flex items-center justify-center p-3';
  o.innerHTML=`<img src="${p}" alt="Documento" class="max-w-full max-h-full rounded-xl bg-white"><button type="button" class="absolute top-4 right-4 px-4 py-2 rounded-xl bg-white font-bold">Fechar</button>`;
  o.onclick=()=>o.remove();document.body.appendChild(o);
};

/* resumo para levar ao médico */
function adherence30(m){
  let exp=0,ok=0;const base=new Date(),now=nowHM();
  for(let i=0;i<30;i++){
    const d=new Date(base);d.setDate(base.getDate()-i);
    const ds=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    if(m.startDate&&ds<m.startDate)continue;if(m.endDate&&ds>m.endDate)continue;
    if(!(m.days||[0,1,2,3,4,5,6]).includes(d.getDay()))continue;
    for(const t of (m.times||[])){
      if(i===0&&t>now)continue;
      exp++;if((S.logs||[]).find(l=>String(l.med)===String(m.id)&&l.date===ds&&l.time===t&&l.status==='ok'))ok++;
    }
  }
  return exp?Math.round(ok/exp*100):null;
}
window.printHealth=function(){
  if(!S.elder)return;
  const h=H(),e=S.elder;
  const row=(a,b)=>b?`<tr><th>${a}</th><td>${esc(b)}</td></tr>`:'';
  const medRows=meds().filter(activeMed).map(m=>{const a=adherence30(m);return `<tr><td><b>${esc(m.name)}</b> ${esc(m.dose||'')}</td><td>${esc((m.times||[]).join(', '))}</td><td>${esc(m.instructions||'')}</td><td>${a===null?'—':a+'%'}</td></tr>`;}).join('')||'<tr><td colspan="4">Nenhum medicamento cadastrado.</td></tr>';
  const appts=h.appointments.filter(a=>(daysUntil(a.date)??-1)>=0).sort((a,b)=>a.date.localeCompare(b.date)).map(a=>`<li>${dateBR(a.date)}${a.time?' '+esc(a.time):''} — ${esc(a.title)}${a.doctor?' ('+esc(a.doctor)+')':''}</li>`).join('')||'<li>Nenhuma.</li>';
  const rxs=h.prescriptions.map(r=>`<li>${esc(r.title)}${r.valid?' — válida até '+dateBR(r.valid):''}</li>`).join('')||'<li>Nenhuma.</li>';
  const exs=[...h.exams].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,10).map(x=>`<li>${x.date?dateBR(x.date)+' — ':''}${esc(x.title)}${x.notes?': '+esc(x.notes):''}</li>`).join('')||'<li>Nenhum.</li>';
  const contacts=h.contacts.map(c=>`<li>${esc(c.name)} ${c.rel?'('+esc(c.rel)+')':''} — ${esc(c.phone)}</li>`).join('')||'<li>Nenhum.</li>';
  const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Resumo de saúde — ${esc(e.name)}</title>
  <style>body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:24px;line-height:1.4}h1{margin:0 0 4px}h2{margin:22px 0 6px;border-bottom:2px solid #0d9488;padding-bottom:3px;font-size:16px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f1f5f9;width:30%}ul{margin:4px 0;padding-left:20px;font-size:13px}.muted{color:#64748b;font-size:12px}@media print{button{display:none}}</style></head><body>
  <button onclick="window.print()" style="padding:10px 16px;font-weight:bold;margin-bottom:12px">Imprimir / Salvar em PDF</button>
  <h1>Resumo de saúde</h1><p class="muted">${esc(e.name)}${e.age?', '+esc(e.age)+' anos':''} · gerado em ${new Date().toLocaleDateString('pt-BR')} pelo CUIDAR+</p>
  <h2>Dados de emergência</h2><table>${row('Tipo sanguíneo',h.blood)}${row('Cartão SUS',h.sus)}${row('Alergias',h.allergies)}${row('Doenças e condições',h.conditions)}${row('Observações',h.notes)}</table>
  <h2>Contatos de emergência</h2><ul>${contacts}</ul>
  <h2>Medicamentos em uso (adesão dos últimos 30 dias)</h2><table><tr><th>Medicamento</th><th>Horários</th><th>Orientações</th><th>Adesão</th></tr>${medRows}</table>
  <h2>Próximas consultas</h2><ul>${appts}</ul><h2>Receitas</h2><ul>${rxs}</ul><h2>Exames recentes</h2><ul>${exs}</ul>
  <p class="muted" style="margin-top:24px">Informações registradas pela família no aplicativo. Não substituem a avaliação de um profissional de saúde.</p></body></html>`;
  const w=window.open('','_blank');
  if(!w){alert('O navegador bloqueou a janela. Permita pop-ups para este site e tente de novo.');return;}
  w.document.open();w.document.write(html);w.document.close();
};

/* ---------- avisos na tela inicial do responsável ---------- */
function noticeItems(){
  if(!S.elder)return [];
  const items=[];
  for(const x of lowStock())items.push({icon:'💊',txt:stockPhrase(x.m,x.left),warn:x.left<=2});
  const h=H();
  for(const a of h.appointments){const d=daysUntil(a.date);if(d!==null&&d>=0&&d<=2)items.push({icon:'📅',txt:`Consulta: ${a.title} ${whenLabel(d)}${a.time?' às '+a.time:''}`,warn:d===0});}
  for(const r of h.prescriptions){const d=daysUntil(r.valid);if(d!==null&&d<=15&&d>=-7)items.push({icon:'📄',txt:d<0?`Receita vencida: ${r.title}`:`Receita de ${r.title} vence ${whenLabel(d)}`,warn:d<=3});}
  return items;
}
window.homeNotices=function(){
  if(isPin()||!isFam())return '';
  const items=noticeItems();
  if(!items.length)return '';
  return `<section class="rounded-3xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4 space-y-2" aria-label="Avisos importantes"><h2 class="font-display font-bold text-amber-900 dark:text-amber-200">Atenção</h2>${items.map(i=>`<p class="text-sm ${i.warn?'font-bold text-rose-700 dark:text-rose-300':'text-amber-900 dark:text-amber-100'}">${i.icon} ${esc(i.txt)}</p>`).join('')}<button type="button" onclick="go('account')" class="text-xs font-bold text-teal-700 underline">Abrir conta e ficha de saúde</button></section>`;
};
function notifyOnce(key,title,body){
  try{
    const k='cuidar_notice_'+key,d=todayStr();
    if(localStorage.getItem(k)===d)return;
    localStorage.setItem(k,d);
    if(window.systemNotify)window.systemNotify(title,body,'notice-'+key);
  }catch(_){}
}
function runNotices(){
  if(isPin()||!isFam()||!S.elder)return;
  for(const i of noticeItems())notifyOnce((S.elder.id||'e')+'-'+i.txt.slice(0,40).replace(/\W+/g,'_'),'CUIDAR+ — atenção',i.txt);
}
const prevCheck=window.checkAlerts;
window.checkAlerts=function(){
  if(typeof prevCheck==='function')prevCheck.apply(this,arguments);
  try{runNotices();}catch(_){}
};

/* ---------- teclado ---------- */
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if($('#photo-view'))return $('#photo-view').remove();
  if($('#confirm-dose'))return closeConfirm();
  if($('#health-modal'))return window.closeHealth();
});

window.CuidarMelhorias={normTime,daysLeft:window.daysLeft,stockPhrase,lowStock,adherence30};
})();
