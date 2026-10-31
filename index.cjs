const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {onDocumentWritten}=require('firebase-functions/v2/firestore');
const {createHash}=require('node:crypto');
const {checkPin,issueSecret,projection,applyAction,validAccess,elderOf}=require('./core.cjs');
initializeApp();const db=getFirestore();
const options={region:'southamerica-east1',maxInstances:5};
function owner(req){if(!req.auth||req.auth.token.pinAccess)throw new HttpsError('permission-denied','Entre como responsável.');return req.auth.uid;}
function refFor(id){if(typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id))throw new HttpsError('unauthenticated','Acesso ou PIN inválido.');return db.doc('pinAccess/'+id);}
function encoded(state){const value=JSON.stringify(state);if(Buffer.byteLength(value)>840000)throw new HttpsError('resource-exhausted','Histórico muito grande.');return value;}
function familyUpdate(tx,ref,record,state){tx.update(ref,{state:encoded(state),revision:record.revision+1,updatedAt:FieldValue.serverTimestamp()});}

function digest(value){return createHash('sha256').update(value).digest('hex');}
async function issueFor(uid,elderId,onlyIfMissing=false){
  const familyRef=db.doc('families/'+uid);
  const initial=await familyRef.get();if(!initial.exists)throw new HttpsError('not-found','Família não encontrada.');
  const previous=elderOf(JSON.parse(initial.data().state),elderId)?.pinAccessId;
  const id=previous&&/^[a-f0-9]{32}$/.test(previous)?previous:digest(uid+'|'+elderId).slice(0,32);
  const accessRef=refFor(id);
  for(let attempt=0;attempt<5;attempt++){
    const secret=issueSecret(),lookupKey=digest(secret.pin),lookupRef=db.doc('pinLookup/'+lookupKey);
    try{return await db.runTransaction(async tx=>{
      const [snapshot,old,collision]=await Promise.all([tx.get(familyRef),tx.get(accessRef),tx.get(lookupRef)]);
      const record=snapshot.data(),state=JSON.parse(record.state),e=elderOf(state,elderId);
      if(!e)throw new HttpsError('not-found','Perfil não encontrado.');
      if(old.exists&&old.data().ownerUid!==uid)throw new HttpsError('permission-denied','Acesso inválido.');
      if(onlyIfMissing&&e.pinGlobal)return {accessId:e.pinAccessId,pin:e.accessPin,label:e.name};
      if(collision.exists)throw new HttpsError('already-exists','Tente outro PIN.');
      const version=(old.data()?.version||0)+1;
      if(old.data()?.lookupKey)tx.set(db.doc('pinLookup/'+old.data().lookupKey),{active:false});
      tx.set(lookupRef,{accessId:id,active:true});
      tx.set(accessRef,{ownerUid:uid,elderId,salt:secret.salt,hash:secret.hash,lookupKey,version,active:true,attempts:0,lockedUntil:0,
        expiresAt:Date.now()+90*86400000,updatedAt:FieldValue.serverTimestamp()});
      e.accessPin=secret.pin;e.pinAccessId=id;e.pinGlobal=true;
      if(state.activeElderId===elderId)state.elder=e;
      familyUpdate(tx,familyRef,record,state);
      tx.set(db.doc('elderViews/'+id),{state:encoded(projection(state,elderId)),updatedAt:FieldValue.serverTimestamp()});
      return {accessId:id,pin:secret.pin,label:e.name};
    });}catch(error){if(error.code!=='already-exists'||attempt===4)throw error;}
  }
}
exports.issuePinAccess=onCall(options,async req=>{
  const uid=owner(req),elderId=req.data?.elderId;
  if(typeof elderId!=='string'||elderId.length>100)throw new HttpsError('invalid-argument','Perfil inválido.');
  return issueFor(uid,elderId,req.data?.onlyIfMissing===true);
});

exports.revokePinAccess=onCall(options,async req=>{
  const uid=owner(req),ref=refFor(req.data?.accessId);
  await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);if(!snap.exists||snap.data().ownerUid!==uid)throw new HttpsError('permission-denied','Acesso inválido.');
    tx.update(ref,{active:false,version:snap.data().version+1,updatedAt:FieldValue.serverTimestamp()});
    if(snap.data().lookupKey)tx.set(db.doc('pinLookup/'+snap.data().lookupKey),{active:false});
  });return {ok:true};
});

exports.loginWithPin=onCall(options,async req=>{
  const pin=String(req.data?.pin||'');
  if(!/^\d{10}$/.test(pin))throw new HttpsError('unauthenticated','PIN inválido.');
  // O limite por origem também conta PINs inexistentes; não depende de cookies.
  const source=String(req.rawRequest?.ip||'unknown');
  const limiter=db.doc('pinRateLimits/'+digest(source+'|'+Math.floor(Date.now()/86400000)));
  await db.runTransaction(async tx=>{
    const snap=await tx.get(limiter),r=snap.data(),now=Date.now();
    const recent=r&&r.until>now;
    if(recent&&r.attempts>=10)throw new HttpsError('resource-exhausted','Muitas tentativas. Aguarde 15 minutos.');
    tx.set(limiter,{attempts:recent?r.attempts+1:1,until:recent?r.until:now+15*60000});
  });
  const lookup=await db.doc('pinLookup/'+digest(pin)).get();
  if(!lookup.exists||!lookup.data().active)throw new HttpsError('unauthenticated','PIN inválido.');
  const ref=refFor(lookup.data().accessId);
  // Cada tentativa é reservada no servidor ANTES de validar o PIN, inclusive sob concorrência.
  const record=await db.runTransaction(async tx=>{
    const snap=await tx.get(ref),r=snap.data(),now=Date.now();
    if(!r?.active||r.expiresAt<=now)throw new HttpsError('unauthenticated','Acesso ou PIN inválido.');
    if(r.lockedUntil>now)throw new HttpsError('resource-exhausted','Aguarde 15 minutos antes de tentar novamente.');
    const attempts=r.lockedUntil&&r.lockedUntil<=now?1:(r.attempts||0)+1;
    tx.update(ref,{attempts,lockedUntil:attempts>=5?now+15*60000:0});
    return {...r,attempts};
  });
  if(!checkPin(pin,record))throw new HttpsError('unauthenticated','Acesso ou PIN inválido.');
  await db.runTransaction(async tx=>{
    const snap=await tx.get(ref),r=snap.data();
    if(!r?.active||r.version!==record.version)throw new HttpsError('unauthenticated','Acesso ou PIN inválido.');
    tx.update(ref,{attempts:0,lockedUntil:0});
  });
  const token=await getAuth().createCustomToken('elder-'+ref.id,{pinAccess:true,accessId:ref.id,
    ownerUid:record.ownerUid,elderId:record.elderId,pinVersion:record.version});
  return {token};
});

exports.elderAction=onCall(options,async req=>{
  const claims=req.auth?.token;if(!claims?.pinAccess)throw new HttpsError('permission-denied','Entre com seu PIN.');
  const accessRef=refFor(claims.accessId),familyRef=db.doc('families/'+claims.ownerUid);
  return db.runTransaction(async tx=>{
    const [a,f]=await Promise.all([tx.get(accessRef),tx.get(familyRef)]);
    if(!validAccess(a.data(),claims)||!f.exists)throw new HttpsError('permission-denied','Acesso encerrado. Peça um novo PIN ao responsável.');
    const record=f.data();let state=JSON.parse(record.state);
    try{state=applyAction(state,claims.elderId,req.data||{});}catch(_){throw new HttpsError('invalid-argument','Dose ou perfil inválido.');}
    familyUpdate(tx,familyRef,record,state);
    const view=projection(state,claims.elderId);
    tx.set(db.doc('elderViews/'+claims.accessId),{state:encoded(view),updatedAt:FieldValue.serverTimestamp()});
    return {state:view};
  });
});

// Publica somente o perfil autorizado, sem conta, e-mail, PIN ou outros familiares.
exports.syncElderViews=onDocumentWritten({...options,document:'families/{uid}'},async event=>{
  const latest=await db.doc('families/'+event.params.uid).get();
  if(latest.exists){
    const state=JSON.parse(latest.data().state);
    for(const e of state.elders||[]){
      if(!e.pinGlobal)await issueFor(event.params.uid,e.id,true);
    }
  }
  const accesses=await db.collection('pinAccess').where('ownerUid','==',event.params.uid).get();
  for(const entry of accesses.docs){
    await db.runTransaction(async tx=>{
      const [family,access]=await Promise.all([tx.get(db.doc('families/'+event.params.uid)),tx.get(entry.ref)]);
      if(!access.exists||!access.data().active)return;
      const state=family.exists?JSON.parse(family.data().state):null;
      const view=state?projection(state,access.data().elderId):null;
      if(!view){tx.update(entry.ref,{active:false,version:access.data().version+1});return;}
      tx.set(db.doc('elderViews/'+entry.id),{state:encoded(view),updatedAt:FieldValue.serverTimestamp()});
    });
  }
});
