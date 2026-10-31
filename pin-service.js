import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js';
import {signInWithCustomToken} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {doc,getDocFromServer,onSnapshot} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

export function installPinAccess({app,auth,db,bridge,activateOwner,flushOwner,runAction,report}){
  const functions=getFunctions(app,'southamerica-east1');
  const call=(name,data)=>httpsCallable(functions,name)(data).then(r=>r.data);
  const key='cuidar_pin_devices_v2';let unsubscribe=null,ownBusy=false;
  function devices(){try{return JSON.parse(localStorage.getItem(key)||'[]').filter(d=>/^[a-f0-9]{32}$/.test(d.accessId));}catch(_){return [];}}
  function remember(entry){const list=devices().filter(d=>d.accessId!==entry.accessId);list.unshift(entry);localStorage.setItem(key,JSON.stringify(list.slice(0,20)));}
  const incoming=new URLSearchParams(location.hash.slice(1)).get('acesso');
  if(incoming&&/^[a-f0-9]{32}$/.test(incoming)){
    remember({accessId:incoming,label:'Acesso recebido'});
    history.replaceState(null,'',location.pathname+location.search);
  }
  function currentDevice(){return document.getElementById('pinProfile')?.value||devices()[0]?.accessId;}
  window.pinDeviceOptions=()=>{
    const list=devices();
    if(!list.length)return '<p class="pin-instructions">Neste aparelho, abra primeiro o link de acesso enviado pelo responsável.</p>';
    return '<label class="pin-instructions" for="pinProfile">Quem vai entrar?</label><select id="pinProfile" class="field pin-profile">'+list.map(d=>`<option value="${d.accessId}">${bridge.escape(d.label||'Pessoa cuidada')}</option>`).join('')+'</select>';
  };
  window.loginElderPin=()=>runAction(async()=>{
    const pin=(document.getElementById('elderPin')?.value||'').replace(/\D/g,'');
    if(pin.length!==6)return alert('Digite os 6 números do PIN.');
    const accessId=currentDevice();
    if(!accessId)return alert('Peça ao responsável o link de acesso. Abra esse link neste aparelho e depois digite seu PIN.');
    const {token}=await call('loginWithPin',{accessId,pin});
    const credential=await signInWithCustomToken(auth,token);
    await activateOwner(credential.user);
  });
  window.enablePinAccess=id=>runAction(async()=>{
    if(!bridge.isFamily())return alert('Entre como responsável.');
    const e=bridge.getState().elders.find(e=>e.id===id);if(!e)return;
    if(!confirm(e.pinAccessId?'Gerar novo PIN? O anterior e as sessões antigas deixarão de funcionar.':'Ativar o PIN independente para '+e.name+'?'))return;
    await flushOwner();
    const result=await call('issuePinAccess',{elderId:id});
    remember({accessId:result.accessId,label:result.label});
    await activateOwner(auth.currentUser);
    bridge.openAccount();
    alert('PIN ativado: '+result.pin+'\n\nJá funciona após sair da conta neste navegador. Para outro celular, use Copiar link de acesso.');
  });
  window.regenPin=window.enablePinAccess;
  window.copyPinLink=async id=>{
    const e=bridge.getState().elders.find(e=>e.id===id);
    if(!e?.pinAccessId)return alert('Primeiro clique em Ativar PIN.');
    const url=new URL(location.href);url.hash='acesso='+e.pinAccessId;
    try{await navigator.clipboard.writeText(url.href);alert('Link copiado. Envie o link e o PIN para a pessoa cuidada.');}
    catch(_){prompt('Copie o link de acesso:',url.href);}
  };
  window.revokePinAccess=id=>runAction(async()=>{
    const e=bridge.getState().elders.find(e=>e.id===id);
    if(!e?.pinAccessId)return;
    if(!confirm('Desativar o acesso por PIN de '+e.name+'?'))return;
    await call('revokePinAccess',{accessId:e.pinAccessId});
    alert('Acesso desativado. Gere um novo PIN para ativá-lo novamente.');
  });
  async function remoteAction(data){
    if(ownBusy)return;
    const uid=auth.currentUser?.uid;
    ownBusy=true;
    try{
      const result=await call('elderAction',data);
      if(auth.currentUser?.uid!==uid)return;
      bridge.setPinState(result.state,auth.currentUser,true);
    }catch(e){alert(e.message||'Não foi possível registrar. Verifique sua conexão.');}
    finally{ownBusy=false;}
  }
  const originalAct=window.act,originalDefer=window.deferDose,originalHelp=window.viewHelp;
  window.act=(id,time,status,reason)=>bridge.isPinSession()?remoteAction({medId:id,time,status,reason:reason||''}):originalAct(id,time,status,reason);
  window.deferDose=(id,time)=>bridge.isPinSession()?remoteAction({medId:id,time,status:'later'}):originalDefer(id,time);
  window.sendPinHelp=()=>remoteAction({kind:'help'});
  window.viewHelp=()=>bridge.isPinSession()?`<div class="space-y-5"><h1 class="font-display text-2xl font-bold">Preciso de ajuda</h1><button onclick="sendPinHelp()" class="w-full p-5 rounded-2xl bg-amber-400 font-bold">Avisar o responsável</button><p>O pedido aparece no aplicativo do responsável. Para uma emergência, use o telefone.</p><a href="tel:192" class="block p-5 rounded-2xl bg-rose-600 text-white text-center font-bold">Ligar para o SAMU — 192</a></div>`:originalHelp();
  return {
    stop:()=>{unsubscribe?.();unsubscribe=null;},
    activate:async(u,claims)=>{
      const ref=doc(db,'elderViews',claims.accessId);
      const snap=await getDocFromServer(ref);
      if(auth.currentUser?.uid!==u.uid)return;
      if(!snap.exists())throw Error('Perfil não encontrado. Peça ao responsável para reativar o PIN.');
      const state=JSON.parse(snap.data().state);
      remember({accessId:claims.accessId,label:state.elder.name});
      bridge.setPinState(state,u);
      bridge.setSaveHandler(null);
      report('saved');
      unsubscribe=onSnapshot(ref,s=>{
        if(auth.currentUser?.uid===u.uid&&s.exists()&&!s.metadata.fromCache)bridge.setPinState(JSON.parse(s.data().state),u,true);
      },()=>{bridge.lock();alert('O acesso por PIN foi encerrado. Peça ao responsável um novo acesso.');});
    }
  };
}
