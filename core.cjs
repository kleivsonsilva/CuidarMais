const {randomBytes,scryptSync,timingSafeEqual,randomInt}=require('node:crypto');
const clean=x=>JSON.parse(JSON.stringify(x));
function hashPin(pin,salt){return scryptSync(pin,salt,32).toString('hex');}
function checkPin(pin,record){
  if(!/^\d{6}$/.test(pin)||!/^[a-f0-9]{64}$/.test(record.hash||''))return false;
  return timingSafeEqual(Buffer.from(hashPin(pin,record.salt),'hex'),Buffer.from(record.hash,'hex'));
}
function issueSecret(){const pin=String(randomInt(100000,1000000)),salt=randomBytes(16).toString('hex');return {pin,salt,hash:hashPin(pin,salt)};}
function elderOf(state,id){return state.elders?.find(e=>e.id===id);}
function projection(state,id){
  const e=elderOf(state,id);if(!e)return null;
  const profile={id:e.id,name:e.name,age:e.age||0,sex:e.sex||'n',avatar:e.avatar||'🧑',
    meds:clean(e.meds||[]),logs:clean(e.logs||[]),alerts:clean(e.alerts||[]),tol:e.tol??30};
  return {version:3,activeElderId:e.id,elder:profile,elders:[profile],meds:profile.meds,logs:profile.logs,
    alerts:profile.alerts,tol:profile.tol,fam:{name:state.account?.owner?.name||state.fam?.name||'Familiar',rel:state.fam?.rel||'Responsável',perm:{view:true,alerts:true,edit:false}},
    account:{owner:{name:state.account?.owner?.name||'Familiar'},elderAccess:{enabled:true,label:e.name}},
    fs:state.fs||16,hc:!!state.hc,easy:true,settings:{notifications:false,sound:true,voice:true,voiceReminders:true},
    audit:[],documents:[],caregivers:[],deferred:clean(e.deferred||{})};
}
function localClock(now=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const date=`${parts.year}-${parts.month}-${parts.day}`;
  return {date,time:`${parts.hour}:${parts.minute}`,day:new Date(date+'T12:00:00Z').getUTCDay()};
}
function applyAction(state,elderId,input,now=new Date()){
  const e=elderOf(state,elderId);if(!e)throw Error('profile-missing');
  const clock=localClock(now);
  state.audit=state.audit||[];e.alerts=e.alerts||[];
  if(input.kind==='help'){
    e.alerts.unshift({id:'help-'+now.getTime(),txt:`${e.name} solicitou ajuda.`,at:clock.time,type:'help',severity:'high'});
    state.audit.unshift(`${clock.date} ${clock.time} — ${e.name} solicitou ajuda pelo Modo Simples.`);
  }else{
    if(!['ok','no','later'].includes(input.status))throw Error('invalid-status');
    const m=e.meds?.find(m=>m.id===input.medId);
    if(!m||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)||!m.times?.includes(input.time))throw Error('invalid-dose');
    if((m.days?.length&&!m.days.includes(clock.day))||(m.startDate&&m.startDate>clock.date)||(m.endDate&&m.endDate<clock.date))throw Error('unscheduled-dose');
    e.logs=e.logs||[];
    const previous=e.logs.find(l=>l.med===m.id&&l.time===input.time&&l.date===clock.date);
    const per=Number(m.per)||1;
    if(input.status==='ok'&&previous?.status!=='ok')m.stock=Math.max(0,(Number(m.stock)||0)-per);
    if(previous?.status==='ok'&&input.status!=='ok')m.stock=(Number(m.stock)||0)+per;
    e.logs=e.logs.filter(l=>!(l.med===m.id&&l.time===input.time&&l.date===clock.date));
    e.logs.push({med:m.id,time:input.time,date:clock.date,status:input.status,at:clock.time,reason:String(input.reason||'').slice(0,200)});
    if(input.status==='later') {e.deferred=e.deferred||{};e.deferred[`defer-${m.id}-${input.time}`]=now.getTime()+30*60000;}
    if(input.status==='ok') e.alerts=e.alerts.filter(a=>a.id!==`${m.id}-${input.time}-${clock.date}`);
    state.audit.unshift(`${clock.date} ${clock.time} — ${e.name}: ${m.name} ${input.time}, ${input.status}`);
  }
  if(state.activeElderId===elderId){state.elder=e;state.meds=e.meds;state.logs=e.logs;state.alerts=e.alerts;state.tol=e.tol??30;state.deferred=e.deferred||{};}
  return state;
}
function validAccess(record,claims,now=Date.now()){
  return !!(record?.active&&record.ownerUid===claims.ownerUid&&record.elderId===claims.elderId&&record.version===claims.pinVersion&&record.expiresAt>now);
}
module.exports={checkPin,issueSecret,projection,applyAction,validAccess,elderOf,localClock};
