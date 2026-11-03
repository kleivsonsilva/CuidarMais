// Acesso por PIN SEM Cloud Functions (funciona no plano gratuito Spark).
//  - Responsável: gera o PIN no navegador e publica uma cópia do perfil em pinViews/{hash do PIN}.
//  - Idoso: digita o PIN, entra com login anônimo e lê somente esse documento.
//  - Ações do idoso viram pequenos documentos em pinActions; o app do responsável as aplica.
import {signInAnonymously} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {doc,collection,setDoc,deleteDoc,getDocFromServer,onSnapshot,serverTimestamp}
  from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {hashPin,randomPin,viewJSON,applyAction} from './pin-core.mjs';

const HASH_KEY='cuidar_pin_hash', DAY=86400000, VIEW_TTL=90*DAY;
const ENDED='O acesso por PIN foi encerrado. Peça um novo PIN ao responsável.';
const invalid=()=>Object.assign(Error('PIN inválido ou expirado.'),{code:'pin/invalid'});
const store={get:k=>{try{return localStorage.getItem(k);}catch(_){return null;}},
  set:(k,v)=>{try{localStorage.setItem(k,v);}catch(_){}},del:k=>{try{localStorage.removeItem(k);}catch(_){}}};

export function installPinAccess({app,auth,db,bridge,activateOwner,flushOwner,runAction,report}){
  let owner=null;   // contexto do responsável
  let elder=null;   // contexto do idoso

  /* ================= Responsável ================= */
  const viewRef=hash=>doc(db,'pinViews',hash);
  const hasPin=e=>e?.pinGlobal&&/^[a-f0-9]{64}$/.test(e.pinKey||'')&&/^\d{10}$/.test(e.accessPin||'');

  function newOwner(uid){
    return {uid,listeners:new Map(),timer:null,last:new Map(),applied:new Map(),seen:new Set(),queue:Promise.resolve()};
  }

  async function writeView(ctx,hash,elderId){
    const applied=(ctx.applied.get(hash)||[]).slice(-100);
    const json=viewJSON(bridge.getState(),elderId);
    await setDoc(viewRef(hash),{ownerUid:ctx.uid,elderId,state:json,applied,
      expiresAt:Date.now()+VIEW_TTL,updatedAt:serverTimestamp()});
    ctx.last.set(hash,{sig:json+'|'+applied.join(','),at:Date.now()});
  }

  async function publishAll(ctx,force){
    for(const e of bridge.getState().elders||[]){
      if(!hasPin(e))continue;
      const applied=(ctx.applied.get(e.pinKey)||[]).slice(-100);
      let sig;try{sig=viewJSON(bridge.getState(),e.id)+'|'+applied.join(',');}catch(_){continue;}
      const prev=ctx.last.get(e.pinKey);
      if(!force&&prev&&prev.sig===sig&&Date.now()-prev.at<DAY)continue;
      await writeView(ctx,e.pinKey,e.id);
    }
  }

  function markApplied(ctx,hash,id){
    const list=ctx.applied.get(hash)||[];list.push(id);ctx.applied.set(hash,list.slice(-100));
  }

  async function processActions(ctx,hash,elderId,docs){
    const items=docs.filter(d=>!ctx.seen.has(d.id)).map(d=>({id:d.id,ref:d.ref,data:d.data()}));
    if(!items.length||owner!==ctx)return;
    items.sort((a,b)=>(a.data.createdAt?.toMillis?.()||0)-(b.data.createdAt?.toMillis?.()||0));
    const state=bridge.getState();let changed=false;
    for(const i of items){
      ctx.seen.add(i.id);
      const d=i.data;
      const input=d.kind==='help'?{kind:'help'}:{medId:d.medId,time:d.time,status:d.status,reason:d.reason||''};
      try{applyAction(state,elderId,input,d.createdAt?.toDate?.()||new Date());changed=true;}
      catch(_){/* ação inválida ou fora da prescrição: descartada */}
      markApplied(ctx,hash,i.id);
    }
    if(changed){bridge.save();bridge.rerender();await flushOwner();}
    if(owner!==ctx)return;
    await writeView(ctx,hash,elderId);
    await Promise.all(items.map(i=>deleteDoc(i.ref).catch(()=>{})));
  }

  function listen(ctx,hash,elderId){
    return onSnapshot(collection(db,'pinActions',hash,'items'),snap=>{
      const added=snap.docChanges().filter(c=>c.type==='added').map(c=>c.doc);
      if(!added.length)return;
      ctx.queue=ctx.queue.then(()=>processActions(ctx,hash,elderId,added)).catch(e=>console.warn('PIN: ação',e));
    },err=>console.warn('PIN: leitura de ações',err));
  }

  function syncListeners(ctx){
    const wanted=new Map();
    for(const e of bridge.getState().elders||[])if(hasPin(e))wanted.set(e.pinKey,e.id);
    for(const [hash,unsub] of ctx.listeners)if(!wanted.has(hash)){unsub();ctx.listeners.delete(hash);}
    for(const [hash,elderId] of wanted)if(!ctx.listeners.has(hash))ctx.listeners.set(hash,listen(ctx,hash,elderId));
  }

  function ownerChanged(){
    const ctx=owner;if(!ctx)return;
    clearTimeout(ctx.timer);
    ctx.timer=setTimeout(async()=>{
      if(owner!==ctx)return;
      try{await publishAll(ctx,false);syncListeners(ctx);}catch(e){console.warn('PIN: publicação',e);}
    },1200);
  }

  async function startOwner(u){
    stop();
    const ctx=owner=newOwner(u.uid);
    try{await publishAll(ctx,true);}catch(e){console.warn('PIN: publicação inicial',e);}
    if(owner===ctx)syncListeners(ctx);
  }

  window.enablePinAccess=(id,silent)=>runAction(async()=>{
    if(!bridge.isFamily())return alert('Entre como responsável.');
    const state=bridge.getState(),e=state.elders.find(x=>x.id===id);if(!e)return;
    if(!silent&&!confirm(hasPin(e)?'Gerar novo PIN? O anterior deixará de funcionar.':'Ativar o PIN para '+e.name+'?'))return;
    await flushOwner();
    const ctx=owner||(owner=newOwner(auth.currentUser.uid));
    let pin,hash,done=false;
    for(let i=0;i<6&&!done;i++){
      pin=randomPin();hash=await hashPin(pin);
      if((await getDocFromServer(viewRef(hash))).exists())continue; // colisão: sorteia outro
      await writeView(ctx,hash,id);done=true;
    }
    if(!done)throw Error('Não foi possível gerar um PIN único. Tente novamente.');
    const oldKey=e.pinKey;
    e.accessPin=pin;e.pinKey=hash;e.pinGlobal=true;
    if(state.activeElderId===id)state.elder=e;
    if(oldKey&&oldKey!==hash)await deleteDoc(viewRef(oldKey)).catch(()=>{});
    bridge.save();await flushOwner();
    syncListeners(ctx);
    bridge.openAccount();
    alert('PIN ativado: '+window.fmtPin(pin)+'\n\nEste PIN funciona em qualquer celular ou computador. Basta abrir o site e digitar o código.');
  });
  window.regenPin=id=>window.enablePinAccess(id,false);

  window.revokePinAccess=id=>runAction(async()=>{
    const state=bridge.getState(),e=state.elders.find(x=>x.id===id);
    if(!e?.pinKey&&!e?.accessPin)return;
    if(!confirm('Desativar o acesso por PIN de '+e.name+'?'))return;
    if(e.pinKey)await deleteDoc(viewRef(e.pinKey)).catch(()=>{});
    delete e.accessPin;delete e.pinKey;e.pinGlobal=false;
    bridge.save();await flushOwner();
    if(owner)syncListeners(owner);
    bridge.rerender();
    alert('Acesso desativado. Gere um novo PIN para ativá-lo novamente.');
  });

  /* ================= Idoso ================= */
  window.pinDeviceOptions=()=>'';

  window.loginElderPin=()=>runAction(async()=>{
    const pin=(document.getElementById('elderPin')?.value||'').replace(/\D/g,'');
    if(pin.length!==10)return alert('Digite os 10 números do PIN.');
    const hash=await hashPin(pin);
    const user=auth.currentUser?.isAnonymous?auth.currentUser:(await signInAnonymously(auth)).user;
    let snap;
    try{snap=await getDocFromServer(viewRef(hash));}
    catch(e){
      if(e.code==='permission-denied'){await auth.signOut().catch(()=>{});throw invalid();}
      throw e;
    }
    if(!snap.exists()){await auth.signOut().catch(()=>{});throw invalid();}
    store.set(HASH_KEY,hash);
    await activateOwner(user);
  });

  function endElder(message){
    store.del(HASH_KEY);
    elder?.unsub?.();elder=null;
    auth.signOut().catch(()=>{});
    bridge.lock();
    if(message)alert(message);
  }

  function showElder(data,preserve){
    const applied=new Set(data.applied||[]);
    elder.last=data;
    elder.pending=elder.pending.filter(p=>!applied.has(p.id));
    let view=JSON.parse(data.state);
    for(const p of elder.pending){try{view=applyAction(view,view.activeElderId,p.input,new Date(p.at));}catch(_){}}
    elder.view=view;
    bridge.setPinState(view,elder.user,preserve);
  }

  async function remoteAction(input){
    if(!elder?.view)return;
    const data=input.kind==='help'?{kind:'help'}
      :{kind:'dose',medId:String(input.medId),time:String(input.time),status:input.status,
        ...(input.reason?{reason:String(input.reason).slice(0,200)}:{})};
    const at=Date.now();
    let next;
    try{next=applyAction(JSON.parse(JSON.stringify(elder.view)),elder.view.activeElderId,input,new Date(at));}
    catch(_){return alert('Dose ou perfil inválido.');}
    const ref=doc(collection(db,'pinActions',elder.hash,'items'));
    const pending={id:ref.id,input,at};
    elder.pending.push(pending);elder.view=next;
    bridge.setPinState(next,elder.user,true);
    try{await setDoc(ref,{...data,createdAt:serverTimestamp()});}
    catch(e){
      elder.pending=elder.pending.filter(p=>p!==pending);
      if(elder.last)showElder(elder.last,true);
      alert(e.code==='permission-denied'?ENDED:'Não foi possível registrar. Verifique sua conexão.');
    }
  }

  const originalAct=window.act,originalDefer=window.deferDose,originalHelp=window.viewHelp;
  window.act=(id,time,status,reason)=>bridge.isPinSession()?remoteAction({medId:id,time,status,reason:reason||''}):originalAct(id,time,status,reason);
  window.deferDose=(id,time)=>bridge.isPinSession()?remoteAction({medId:id,time,status:'later'}):originalDefer(id,time);
  window.sendPinHelp=async()=>{await remoteAction({kind:'help'});alert('Aviso enviado. O responsável verá o pedido no aplicativo dele.');};
  window.viewHelp=()=>bridge.isPinSession()?`<div class="space-y-5"><h1 class="font-display text-2xl font-bold">Preciso de ajuda</h1><button onclick="sendPinHelp()" class="w-full p-5 rounded-2xl bg-amber-400 font-bold">Avisar o responsável</button><p>O pedido aparece no aplicativo do responsável. Para uma emergência, use o telefone.</p><a href="tel:192" class="block p-5 rounded-2xl bg-rose-600 text-white text-center font-bold">Ligar para o SAMU — 192</a></div>`:originalHelp();

  function stop(){
    if(owner){clearTimeout(owner.timer);for(const unsub of owner.listeners.values())unsub();owner=null;}
    if(elder){elder.unsub?.();elder=null;}
  }

  return {
    stop,
    startOwner,
    ownerChanged,
    activate:async u=>{
      const hash=store.get(HASH_KEY);
      if(!hash){auth.signOut().catch(()=>{});bridge.lock();return;}
      let snap;
      try{snap=await getDocFromServer(viewRef(hash));}
      catch(e){if(e.code==='permission-denied')return endElder(ENDED);throw e;}
      if(auth.currentUser?.uid!==u.uid)return;
      if(!snap.exists())return endElder(ENDED);
      const ctx=elder={hash,user:u,pending:[],view:null,last:null,unsub:null};
      showElder(snap.data(),false);
      bridge.setSaveHandler(null);
      report('saved');
      ctx.unsub=onSnapshot(viewRef(hash),s=>{
        if(elder!==ctx||auth.currentUser?.uid!==u.uid)return;
        if(!s.exists())return endElder(ENDED);
        if(s.metadata.fromCache)return;
        showElder(s.data(),true);
      },()=>{if(elder===ctx)endElder(ENDED);});
    }
  };
}
