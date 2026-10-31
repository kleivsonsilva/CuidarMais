import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut as firebaseSignOut, updateProfile, sendPasswordResetEmail, EmailAuthProvider,
  reauthenticateWithCredential, updatePassword, GoogleAuthProvider, signInWithPopup}
  from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore, doc, getDocFromServer, runTransaction, serverTimestamp, onSnapshot}
  from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
import {createCloudStore} from './cloud-store.mjs';

const bridge = window.CuidarCloud;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let store = null, unsubscribe = null, ownerUid = null, managedAuth = false, activation = 0;
let busy = false;
const value = id => document.getElementById(id)?.value?.trim() || '';
const password = id => document.getElementById(id)?.value || '';
const draftKey = uid => 'cuidar_firebase_draft_' + uid;
const pinLockKey = uid => 'cuidar_pinlock_' + uid;
const unlockDevice = uid => { try {localStorage.removeItem(pinLockKey(uid));} catch (_) {} };

function message(error) {
  return ({
    'auth/invalid-credential':'E-mail ou senha incorretos. As contas antigas eram locais: se ainda não criou a conta no Firebase, use Criar conta.',
    'auth/email-already-in-use':'Este e-mail já tem uma conta. Use Entrar ou Esqueci minha senha.',
    'auth/invalid-email':'Digite um e-mail válido.',
    'auth/weak-password':'Use uma senha com pelo menos 6 caracteres.',
    'auth/operation-not-allowed':'Ative este método de login em Firebase → Authentication → Método de login.',
    'auth/unauthorized-domain':'Adicione kleivsonfreitas.github.io aos domínios autorizados do Firebase Authentication.',
    'auth/popup-blocked':'O navegador bloqueou a janela do Google. Permita o popup e tente novamente.',
    'auth/popup-closed-by-user':'A janela do Google foi fechada antes do login.',
    'auth/network-request-failed':'Sem conexão com o Firebase. Verifique sua internet.',
    'auth/too-many-requests':'Muitas tentativas. Aguarde e tente novamente.',
    'permission-denied':'O Firestore recusou o acesso. Publique as regras do arquivo firestore.rules no projeto appmais-5b2e4.',
    'failed-precondition':'Confira se o banco Firestore (default) foi criado no projeto appmais-5b2e4.',
    'unavailable':'Não foi possível acessar o Firestore. Confira sua conexão e se o banco foi criado.',
    'cloud/conflict':'Os dados mudaram em outro aparelho. Exporte suas alterações antes de recarregar os dados da nuvem.',
    'cloud/size':'Os dados ultrapassaram o limite desta versão. Exporte um backup e reduza o histórico antes de tentar novamente.'
  })[error?.code] || 'Não foi possível concluir. Código: ' + (error?.code || error?.message || 'erro desconhecido');
}

function status(kind, error) {
  const text = {pending:'Alterações aguardando envio ao Firebase', saving:'Salvando no Firebase…',
    saved:'Salvo no Firebase', loading:'Carregando dados do Firebase…', signedout:'Entre para acessar seus dados no Firebase',
    error:'Alterações ainda não salvas na nuvem. ' + message(error), conflict:message(error)}[kind] || kind;
  bridge.status(kind, text);
}

function detach() {
  activation++;
  unsubscribe?.(); unsubscribe = null;
  store?.stop(); store = null; ownerUid = null;
  bridge.setSaveHandler(null);
}

async function activate(u, profile) {
  detach();
  const generation = activation;
  bridge.lock();
  status('loading');
  const ref = doc(db, 'families', u.uid);
  const next = createCloudStore({
    read:async () => {
      const snap = await getDocFromServer(ref);
      if (!snap.exists()) return null;
      const data = snap.data();
      return {revision:data.revision, state:JSON.parse(data.state)};
    },
    commit:async (state, expected) => {
      if (auth.currentUser?.uid !== u.uid || generation !== activation) throw Error('Sessão encerrada');
      const data = bridge.sanitize(state);
      const serialized = JSON.stringify(data);
      if (new TextEncoder().encode(serialized).length >= 850000) throw Object.assign(Error(),{code:'cloud/size'});
      return runTransaction(db, async tx => {
        const snap = await tx.get(ref);
        const current = snap.exists() ? snap.data().revision : 0;
        if (current !== expected) throw Object.assign(Error(),{code:'cloud/conflict'});
        tx.set(ref, {schemaVersion:1,revision:current+1,state:serialized,updatedAt:serverTimestamp()});
        return current+1;
      });
    },
    notify:status,
    backup:state => { try {localStorage.setItem(draftKey(u.uid),JSON.stringify(bridge.sanitize(state)));} catch (_) {} },
    clearBackup:() => localStorage.removeItem(draftKey(u.uid))
  });
  let state;
  try { state = await next.load(); }
  catch (e) { next.stop(); if(generation===activation) {bridge.lock(); status('error',e);} throw e; }
  if (generation !== activation || auth.currentUser?.uid !== u.uid) {next.stop(); return;}
  store = next; ownerUid = u.uid;
  let draft = null;
  try { draft = JSON.parse(localStorage.getItem(draftKey(u.uid)) || 'null'); } catch (_) {}
  const recoverDraft = draft && confirm('Há alterações deste aparelho que não foram salvas na nuvem. Deseja recuperá-las e enviá-las agora?');
  if (draft && !recoverDraft) {
    try {localStorage.setItem(draftKey(u.uid)+'_not_recovered',JSON.stringify(draft));} catch (_) {}
  }
  if (!state) {
    const legacy = bridge.legacy();
    if (recoverDraft) {
      state = bridge.sanitize(draft);
      draft = null;
    } else if (legacy?.account?.owner?.email?.toLowerCase() === u.email?.toLowerCase()
      && confirm('Encontramos os dados da sua conta antiga neste navegador. Deseja migrar esses perfis, medicamentos e históricos para sua conta no Firebase?')) {
      state = bridge.sanitize(legacy);
    } else {
      state = bridge.fresh(u, profile);
    }
    state.account.owner = {name:profile?.name || u.displayName || state.account?.owner?.name || u.email,
      email:u.email,uid:u.uid,provider:'firebase'};
    next.enqueue(state);
    try {await next.flush();}
    catch (e) {next.stop(); store=null; ownerUid=null; bridge.lock(); throw e;}
  }
  const identity = {name:u.displayName || state.account?.owner?.name || u.email,email:u.email,uid:u.uid,provider:'firebase'};
  state.account = {...state.account, owner:identity};
  if (draft && recoverDraft) {
    draft.account = {...draft.account, owner:identity};
    next.enqueue(draft);
    await next.flush();
    state = draft;
  } else if (draft) {
    // Conserva o rascunho até uma gravação confirmada, para recuperação por exportação.
    bridge.status('saved', 'Dados da nuvem carregados; existe um rascunho local não recuperado.');
  }
  let pinLocked = false;
  try {pinLocked = localStorage.getItem(pinLockKey(u.uid)) === '1';} catch (_) {}
  bridge.setState(bridge.sanitize(state),u,false,pinLocked);
  bridge.setSaveHandler(state => {
    if (auth.currentUser?.uid === ownerUid) next.enqueue(bridge.sanitize(state));
  });
  status('saved');
  unsubscribe = onSnapshot(ref, {includeMetadataChanges:true}, snap => {
    if (generation !== activation || snap.metadata.fromCache || snap.metadata.hasPendingWrites || !snap.exists()) return;
    try {
      const record = snap.data();
      const updated = next.accept({revision:record.revision,state:JSON.parse(record.state)});
      if (updated) bridge.setState(updated,u,true);
    } catch (e) {status('error',e);}
  },e => status('error',e));
}

async function action(work) {
  if (busy) return;
  busy = true; managedAuth = true;
  try {await work();}
  catch (e) {alert(message(e));}
  finally {busy = false; managedAuth = false;}
}

window.createFamilyAccount = () => action(async () => {
  const profile = {name:value('regName'),elderName:value('regElder'),age:Number(value('regAge'))||0,
    sex:document.querySelector('input[name=regSex]:checked')?.value};
  const email=value('regEmail').toLowerCase(), pass=password('regPassword');
  if (!profile.name || !profile.elderName || !profile.sex || !email || pass.length<6)
    return alert('Preencha nome, e-mail, senha de pelo menos 6 caracteres e os dados de quem você cuida.');
  const credential = await createUserWithEmailAndPassword(auth,email,pass);
  await updateProfile(credential.user,{displayName:profile.name});
  unlockDevice(credential.user.uid);
  await activate(credential.user,profile);
  alert('Conta criada no Firebase e dados salvos no Firestore.');
});

window.loginFamily = () => action(async () => {
  const email=value('loginEmail').toLowerCase(), pass=password('loginPassword');
  if(!email || !pass) return alert('Digite e-mail e senha.');
  const credential=await signInWithEmailAndPassword(auth,email,pass);
  unlockDevice(credential.user.uid);
  await activate(credential.user);
});

window.googleLogin = () => action(async () => {
  const credential=await signInWithPopup(auth,new GoogleAuthProvider());
  unlockDevice(credential.user.uid);
  await activate(credential.user);
});

window.resetCloudPassword = () => action(async () => {
  const email=value('loginEmail') || prompt('Qual é o e-mail da sua conta?');
  if (!email) return;
  await sendPasswordResetEmail(auth,email.trim());
  alert('Se houver uma conta para esse e-mail, você receberá as instruções de recuperação.');
});

window.changePassword = () => action(async () => {
  const current=password('currentPassword'), next=password('newPassword'), check=password('confirmPassword');
  if (!auth.currentUser || !bridge.isFamily()) return alert('Entre na conta da família.');
  if (!current || next.length<6 || next!==check) return alert('Preencha a senha atual e duas senhas novas iguais, de pelo menos 6 caracteres.');
  await reauthenticateWithCredential(auth.currentUser,EmailAuthProvider.credential(auth.currentUser.email,current));
  await updatePassword(auth.currentUser,next);
  for(const id of ['currentPassword','newPassword','confirmPassword']) document.getElementById(id).value='';
  alert('Senha alterada no Firebase Authentication.');
});

window.signOut = async () => {
  if(busy) return;
  busy=true;
  try {
    if(store) await store.flush();
    await firebaseSignOut(auth);
    detach(); bridge.lock(); status('signedout');
  } catch(e) {alert('Não foi possível sair com todas as alterações salvas. ' + message(e));}
  finally {busy=false;}
};

window.fullSignOut = async () => {
  if(!confirm('Desconectar este aparelho? O PIN só volta a funcionar depois que o responsável entrar de novo com e-mail e senha.')) return;
  const uid = auth.currentUser?.uid;
  await window.signOut();
  if(uid && !auth.currentUser) unlockDevice(uid);
};

window.retryCloudSave = () => action(async () => {
  if(!auth.currentUser) return alert('Entre na sua conta para acessar o Firebase.');
  if(store && !store.isConflicted()) {
    await store.flush();
    if(!bridge.isSignedIn()) await activate(auth.currentUser);
  }
  else if(confirm('Recarregar os dados da nuvem? Você poderá recuperar o rascunho local na próxima etapa.')) await activate(auth.currentUser);
});

window.exportCloudDraft = () => {
  if(!auth.currentUser) return alert('Entre na sua conta.');
  const draft=localStorage.getItem(draftKey(auth.currentUser.uid)) || localStorage.getItem(draftKey(auth.currentUser.uid)+'_not_recovered');
  const json=draft || JSON.stringify(bridge.sanitize(bridge.getState()),null,2);
  const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
  const link=document.createElement('a'); link.href=url; link.download='cuidar-backup.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};

bridge.setSaveHandler(null);
bridge.lock();
window.addEventListener('online',()=> {if(store) store.flush().catch(()=>{});});
window.addEventListener('beforeunload',e=> {if(store?.isDirty()) {e.preventDefault();e.returnValue='';}});
onAuthStateChanged(auth,u => {
  if(managedAuth) return;
  if(!u) {detach();bridge.lock();status('signedout');return;}
  activate(u).catch(e=>{status('error',e);alert(message(e));});
});
