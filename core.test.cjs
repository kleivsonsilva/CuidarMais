const test=require('node:test'),assert=require('node:assert/strict');
const {issueSecret,checkPin,projection,applyAction,validAccess}=require('./core.cjs');
function state(){return {activeElderId:'a',account:{owner:{name:'Ana',email:'private@example.com'}},fam:{name:'Ana',perm:{edit:true}},elders:[
 {id:'a',name:'Maria',accessPin:'123456',pinAccessId:'private',meds:[{id:1,name:'A',per:1,stock:10,times:['08:00'],days:[0,1,2,3,4,5,6]}],logs:[],alerts:[]},
 {id:'b',name:'Outro perfil',meds:[{id:99,name:'B',stock:20}],logs:[],alerts:[]}],documents:[{name:'secreto'}],audit:['segredo']};}
test('PIN é aleatório, armazenado como hash salgado e validado sem texto simples',()=>{
 const secret=issueSecret();assert.match(secret.pin,/^\d{6}$/);assert.equal(secret.hash.length,64);
 assert.equal(checkPin(secret.pin,secret),true);assert.equal(checkPin(secret.pin==='123456'?'654321':'123456',secret),false);assert.equal(checkPin('',secret),false);
});
test('projeção da pessoa cuidada não inclui conta, email, PIN, documentos ou outros perfis',()=>{
 const view=projection(state(),'a'),json=JSON.stringify(view);
 assert.equal(view.elders.length,1);assert.equal(view.elder.name,'Maria');
 for(const value of ['private@example.com','123456','private','Outro perfil','secreto','segredo'])assert.equal(json.includes(value),false,value);
 assert.equal(view.fam.perm.edit,false);assert.equal(projection(state(),'ausente'),null);
});
test('reconfirmar dose não desconta estoque duas vezes e alterar para não tomado devolve estoque',()=>{
 const s=state(),now=new Date('2026-10-30T12:00:00Z');
 applyAction(s,'a',{medId:1,time:'08:00',status:'ok'},now);applyAction(s,'a',{medId:1,time:'08:00',status:'ok'},now);
 assert.equal(s.elders[0].meds[0].stock,9);assert.equal(s.elders[0].logs.length,1);
 applyAction(s,'a',{medId:1,time:'08:00',status:'no'},now);assert.equal(s.elders[0].meds[0].stock,10);
});
test('não permite editar remédio de outro perfil, horário inexistente ou status administrativo',()=>{
 for(const input of [{medId:99,time:'08:00',status:'ok'},{medId:1,time:'09:00',status:'ok'},{medId:1,time:'08:00',status:'delete'}])
  assert.throws(()=>applyAction(state(),'a',input));
});
test('dia fora da prescrição é recusado',()=>{
 const s=state();s.elders[0].meds[0].days=[0];assert.throws(()=>applyAction(s,'a',{medId:1,time:'08:00',status:'ok'},new Date('2026-10-30T12:00:00Z')));
});
test('token expirado, revogado, de outra pessoa ou versão antiga é recusado',()=>{
 const r={active:true,ownerUid:'u',elderId:'a',version:2,expiresAt:2000};
 const claims={ownerUid:'u',elderId:'a',pinVersion:2};assert.equal(validAccess(r,claims,1000),true);
 for(const x of [{...r,active:false},{...r,version:3},{...r,elderId:'b'},{...r,ownerUid:'v'},{...r,expiresAt:999}])assert.equal(validAccess(x,claims,1000),false);
});
