import {generate,toPng,artworkMarkup} from './engine.js';
import {validate,sample,samples,blankApproval} from './protocol.js';
import {initialState,rulesAt,draft,review,propose,decide,checkBackup,stateKey} from './state.js';
const $=id=>document.getElementById(id);
const pages=document.documentElement.dataset.edition==='pages';
const folder=new URL('./',import.meta.url);
const storageKey=pages?stateKey+':pages:'+folder.pathname:stateKey;
const configUrl=pages?new URL('config.json',folder):'/api/config';
const {rules:base,designSchema:schema,knowledge,skills}=await fetch(configUrl).then(response=>{
  if(!response.ok)throw new Error('无法读取工作台配置');
  return response.json();
});
let storageError;
let data=initialState();
try {const saved=localStorage.getItem(storageKey);if(saved)data=checkBackup(JSON.parse(saved),base,schema);}
catch(e) {storageError=e.message;}
const copy=value=>structuredClone(value);
const active=()=>data.active;
const rules=()=>rulesAt(data,base,active().task.rule_version);
const current=()=>active().task;
let medium='poster', tests=[], busy=false;
const scratch=document.createElement('div');scratch.className='measurement';document.body.append(scratch);
const scoreWeights=[['品牌一致性',25],['视觉审美',25],['规范准确性',20],['需求匹配度',15],['跨媒介延展性',10],['设计多样性',5]];
const stageLabels={brief:'通过方向审核',concept:'通过方案审核',final:'确认最终成果',return:'退回修改'};

function node(tag,text,cls) {
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=text;
  if(cls)el.className=cls;
  return el;
}
function say(message='',error=false) {
  $('message').textContent=message;$('message').hidden=!message;$('message').classList.toggle('error',error);
}
function persist() {localStorage.setItem(storageKey,JSON.stringify(data));}
function guard(fn) {return async event=>{try{await fn(event);}catch(e){say(e.message,true);}};}
function wire(id,event,fn){$(id).addEventListener(event,guard(fn));}
function option(select,items) {select.replaceChildren(...items.map(([key,name])=>{const o=node('option',name);o.value=key;return o;}));}
function check(task){
  const errors=validate(task,schema,rulesAt(data,base,task?.rule_version));
  if(errors.length)throw new Error(errors.join('；'));
}
function fitDensity(task) {const r=rulesAt(data,base,task.rule_version);task.design.graphic_density=Math.min(task.design.graphic_density,r.densityCaps[task.brief.category]??r.density[1]);}
function use(project,message=''){
  check(project.task);data.active=project;medium=project.task.outputs[0];persist();show('studio');say(message);
}
function edit(task,variant='A') {
  check(task);
  task.approval=blankApproval();
  active().task=task;active().variant=variant;active().scores=null;delete active().savedId;
  active().track.push({action:'edit',comment:'更新设计参数或文案，重新审核',at:new Date().toISOString()});
  persist();render();say();
}
function show(page) {
  for(const p of document.querySelectorAll('.page'))p.hidden=p.id!==page;
  for(const b of $('nav').querySelectorAll('button')) {
    if(b.dataset.page===page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  }
  if(page==='studio')render();
  if(page==='history')history();
  if(page==='experience')experience();
  if(page==='rules')renderRules();
}
function render() {
  const task=current(), r=rules(), d=task.design, a=task.approval;
  if(!task.outputs.includes(medium))medium=task.outputs[0];
  $('mode').textContent=active().mode+' · 规则 '+r.version;
  $('taskTitle').textContent=task.content.title_zh;
  $('concept').textContent=d.concept+' · '+r.layouts[d.layout]+' / '+r.strategies[d.graphic_strategy]+' / '+r.palettes[d.palette_id].label;
  $('artState').textContent=a.final_approved?'最终成果':'草稿';
  $('artSpec').textContent=r.media[medium].width+' × '+r.media[medium].height+' px';
  $('layout').value=d.layout;$('graphic').value=d.graphic_strategy;$('palette').value=d.palette_id;
  $('density').max=r.densityCaps[task.brief.category]??r.density[1];$('density').value=d.graphic_density;
  $('titleRatio').value=d.title_size_ratio;$('seed').value=d.seed;
  for(const [k,v] of Object.entries({...task.brief,...task.content,task_id:task.task_id,concept:d.concept}))$('textForm').elements[k].value=v??'';
  $('variantA').setAttribute('aria-pressed',active().variant!=='B');
  $('variantB').setAttribute('aria-pressed',active().variant==='B');
  const buttons=task.outputs.map(key=>{
    const b=node('button',r.media[key].label);b.type='button';b.dataset.media=key;
    b.setAttribute('aria-pressed',key===medium);
    b.addEventListener('click',()=>{medium=key;render();});return b;
  });
  $('media').replaceChildren(...buttons);
  const stage=$('artState').textContent;
  tests=task.outputs.map(key=>({medium:key,...generate(task,r,key,scratch,{stage})}));
  const artwork=$('grid').checked?generate(task,r,medium,scratch,{stage,grid:true}).svg:tests.find(test=>test.medium===medium).svg;
  $('canvas').replaceChildren(artwork);
  scratch.replaceChildren();
  renderChecks();renderReview();
}
function quality(){return tests.every(test=>test.checks.every(result=>result.pass));}
function renderChecks(){
  const {checks}=tests.find(t=>t.medium===medium);
  const list=node('ul',undefined,'checks');
  for(const {name,pass,detail} of checks) {
    const li=node('li');li.append(node('span',pass?'通过':'未通过',pass?'pass':'fail'),node('span',name+' · '+detail));list.append(li);
  }
  $('checks').replaceChildren(node('p',tests.filter(t=>t.checks.every(c=>c.pass)).length+' / '+tests.length+' 个媒介通过全部规则检测','muted'),list);
}
function renderReview(){
  const a=current().approval;
  const steps=[['方向审核',a.brief_approved],['方案审核',a.concept_approved],['最终审核',a.final_approved]];
  $('reviewStatus').replaceChildren(...steps.map(([label,approved])=>node('span',label+(approved?' · 已通过':' · 待确认'),approved?'pass':undefined)));
  const step=!a.brief_approved?'brief':!a.concept_approved?'concept':'final';
  $('approve').dataset.action=step;$('approve').textContent=a.final_approved?'已最终确认':stageLabels[step];
  $('approve').disabled=a.final_approved||(step!=='brief'&&!quality());
  $('reviewLog').replaceChildren(...active().track.map(event=>node('p',(stageLabels[event.action]??'修改')+(event.comment?' · '+event.comment:'')+' · '+new Date(event.at).toLocaleString('zh-CN'),'muted')));
  for(const [i,input] of [...$('scores').querySelectorAll('input')].entries())input.value=active().scores?.[i]??'';
  updateScore();
}
function updateScore(){
  const values=active().scores??[];
  const total=values.length===6&&values.every(v=>Number.isFinite(v))?values.reduce((s,v,i)=>s+v*scoreWeights[i][1]/100,0):undefined;
  $('scoreResult').textContent=total===undefined?'六项人工评分填写完毕后计算加权分。':'加权分 '+total.toFixed(1)+' / 100 · 实验目标 80';
}
function saveSnapshot(){
  const snapshot=copy(active());
  snapshot.savedId=active().savedId??crypto.randomUUID();
  snapshot.savedAt=new Date().toISOString();
  active().savedId=snapshot.savedId;
  const index=data.history.findIndex(h=>h.savedId===snapshot.savedId);
  if(index<0)data.history.unshift(snapshot);else data.history[index]=snapshot;
  persist();
}
function history(){
  const list=data.history.map(item=>{
    const entry=node('article');
    entry.append(node('h3',item.task.content.title_zh),node('p',item.task.task_id+' · '+item.task.rule_version+' · '+(item.task.approval.final_approved?'最终成果':'草稿')));
    const b=node('button','打开记录');b.type='button';b.addEventListener('click',guard(()=>use(copy(item),'已恢复保存的历史作品。')));entry.append(b);return entry;
  });
  $('historyList').replaceChildren(...(list.length?list:[node('p','还没有保存的作品。')]));
}
function experience(){
  $('latestVersion').textContent='当前版本 '+data.latest+' · 只对新任务应用。';
  const list=data.feedback.map(f=>{
    const entry=node('article');
    entry.append(node('h3',f.category+' · 密度上限 '+f.cap),node('p',f.comment),node('p',({pending:'待审核',approved:'已批准',rejected:'已退回'})[f.status]+(f.task?' · 任务 '+f.task:'')+(f.to?' · '+f.from+' → '+f.to:''),'muted'));
    if(f.status==='pending')for(const approved of [true,false]){
      const b=node('button',approved?'批准并发布规则':'退回');b.type='button';
      b.addEventListener('click',guard(()=>{decide(data,f.id,approved);persist();experience();say(approved?'已发布 '+data.latest:'已退回长期建议。');}));entry.append(b);
    }
    return entry;
  });
  $('feedbackList').replaceChildren(...list);
}
function renderRules(){
  const box=$('rulesList');box.replaceChildren(node('p','基础规则 '+base.version+' · 当前版本 '+data.latest+' · 实验参数 E'));
  const g=base.grid;
  box.append(node('p',g.columns+' 列网格 · 安全边距 '+g.marginRatio*100+'% · 栏距 '+g.gutterRatio*100+'% · 以画布短边计算'));
  for(const [id,p] of Object.entries(base.palettes))box.append(node('article',id+' · '+p.label+' · '+p.colors.join(' / ')));
  for(const [kind,cap] of Object.entries(data.caps[data.latest]))box.append(node('article','类别 '+kind+' · 图形密度上限 '+cap));
}
async function saveFile(task,med,stage,ext,contents){
  if(pages) {
    const types={svg:'image/svg+xml;charset=utf-8',png:'image/png',json:'application/json;charset=utf-8'};
    return {name:task+'-'+med+'-'+stage+'.'+ext,url:URL.createObjectURL(new Blob([contents],{type:types[ext]}))};
  }
  const response=await fetch('/api/export/'+task+'/'+med+'/'+stage+'.'+ext,{method:'POST',body:contents});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error);
  return result;
}
function linkResult(id,file) {
  const a=node('a',file.name);a.href=file.url;
  if(pages) {
    const previous=$(id).querySelector('a[download]');
    if(previous)URL.revokeObjectURL(previous.href);
    a.download=file.name;
    $(id).replaceChildren(node('span','导出文件已生成。 '),a);
    a.click();
  } else {
    a.target='_blank';a.rel='noopener';
    $(id).replaceChildren(node('span','已写入 D 盘项目成果目录。 '),a);
  }
}
function chooseSample(i) {
  const p=draft(sample(i,rulesAt(data,base,data.latest)));p.mode='本地规则生成';use(p);
}

option($('sample'),samples.map((s,i)=>[i,s[0]]));
option($('layout'),Object.entries(base.layouts));option($('graphic'),Object.entries(base.strategies));
option($('palette'),Object.entries(base.palettes).map(([k,p])=>[k,k+' '+p.label]));
for(const k of knowledge){
  const item=node('article');item.append(node('h3',k.id+' · '+k.title+' / '+k.source),node('p',k.text));
  for(const u of k.refs){const a=node('a',new URL(u).hostname);a.href=u;a.target='_blank';a.rel='noopener';item.append(a,document.createTextNode('　'));}
  $('knowledgeList').append(item);
}
for(const s of skills){
  const article=node('article');article.append(node('h3',s.id+' · '+s.title),node('p',s.role),node('p',s.steps.join(' → ')));$('skillsList').append(article);
}
for(const [k,v] of Object.entries(base.strategies)){
  const b=node('button',v+' / '+k);b.type='button';
  b.addEventListener('click',guard(()=>{const task=copy(current());task.design.graphic_strategy=k;show('studio');edit(task);}));
  $('assetList').append(b);
}
for(const [i,[label,weight]] of scoreWeights.entries()){
  const wrapper=node('label',label+' '+weight+'%'),input=node('input');
  input.type='number';input.min=0;input.max=100;input.step=1;input.addEventListener('input',guard(()=>{
    active().scores??=Array(6).fill(null);active().scores[i]=input.value&&input.checkValidity()?Number(input.value):null;persist();updateScore();
  }));
  wrapper.append(input);$('scores').append(wrapper);
}
wire('nav','click',e=>{const page=e.target.closest('button')?.dataset.page;if(page){show(page);say();}});
wire('loadSample','click',()=>chooseSample(Number($('sample').value)));
wire('newTask','click',()=>{
  const task=sample(0,rulesAt(data,base,data.latest));task.task_id='PSA-'+Date.now();task.content.title_zh='新建文化设计';task.content.title_en='New Design';task.content.subtitle='文化活动';task.content.description='请填写活动说明';
  const p=draft(task);p.mode='本地规则生成';use(p,'请在文案表单填写任务内容。');$('taskDetails').open=true;
});
wire('grid','change',render);
wire('zoom','click',()=>{
  const cloned=$('canvas').querySelector('svg').cloneNode(true);
  const clip=cloned.querySelector('clipPath');
  const renamed=clip.id+'-zoom';
  cloned.querySelector('[data-layer="graphic"]').setAttribute('clip-path','url(#'+renamed+')');
  clip.id=renamed;
  $('zoomContent').replaceChildren(cloned);$('zoomDialog').showModal();
});
wire('closeZoom','click',()=>$('zoomDialog').close());
wire('params','submit',e=>{
  e.preventDefault();const task=copy(current());
  Object.assign(task.design,{layout:$('layout').value,graphic_strategy:$('graphic').value,palette_id:$('palette').value,graphic_density:Number($('density').value),title_size_ratio:Number($('titleRatio').value),seed:Number($('seed').value)});
  edit(task,active().variant);
});
wire('textForm','submit',e=>{
  e.preventDefault();
  const f=new FormData(e.target),task=copy(current()),val=k=>f.get(k).trim();
  task.task_id=val('task_id');
  for(const k of Object.keys(task.brief))task.brief[k]=val(k);
  for(const k of Object.keys(task.content))task.content[k]=val(k)||null;
  task.design.concept=val('concept');fitDensity(task);edit(task,active().variant);
});
function alternative(which) {
  const project=active();
  if(project.variant===which)return;
  if(!project.variants)project.variants={};
  project.variants[project.variant]=copy(current().design);
  const task=copy(current());
  if(project.variants[which])task.design=copy(project.variants[which]);
  else {
    task.design.layout=task.design.layout==='bilingual_columns'?'graphic_dominant':'bilingual_columns';
    task.design.graphic_strategy=task.design.graphic_strategy==='weave'?'stairs':'weave';
    task.design.seed=(task.design.seed+173)>>>0;
  }
  fitDensity(task);edit(task,which);
}
wire('variantA','click',()=>alternative('A'));wire('variantB','click',()=>alternative('B'));
wire('importFile','change',async e=>{const file=e.target.files[0];if(file)$('jsonInput').value=await file.text();});
wire('importBtn','click',()=>{
  const task=JSON.parse($('jsonInput').value.replace(/^\uFEFF/,''));
  check(task);use(draft(task),'JSON 校验成功，进入人工审核。');
});
wire('approve','click',()=>{
  review(active(),$('approve').dataset.action,$('comment').value,quality());
  $('comment').value='';if(current().approval.final_approved)saveSnapshot();else persist();
  render();say('审核状态已保存。');
});
wire('sendBack','click',()=>{
  review(active(),'return',$('comment').value,quality());$('comment').value='';delete active().savedId;persist();render();say('方案已退回，修改后可重新提交审核。');
});
wire('saveHistory','click',()=>{saveSnapshot();say('作品及审核记录已保存到历史。');});
for(const button of document.querySelectorAll('[data-export]'))button.addEventListener('click',guard(async()=>{
  if(busy)return;
  busy=true;button.disabled=true;
  try {
    const task=copy(current()),r=rules(),med=medium,pass=quality();
    const stage=task.approval.final_approved&&pass?'final':'draft';
    if(stage==='draft')task.approval.final_approved=false;
    const ext=button.dataset.export,art=generate(task,r,med,scratch,{stage:stage==='final'?'最终成果':'草稿'}).svg;
    const contents=ext==='svg'?artworkMarkup(art):ext==='png'?await toPng(art):JSON.stringify(task,null,2);
    linkResult('exportResult',await saveFile(task.task_id,med,stage,ext,contents));
  }finally{busy=false;button.disabled=false;}
}));
wire('saveBackup','click',async()=>linkResult('backupResult',await saveFile('project','backup','backup','json',JSON.stringify(data,null,2))));
wire('backupFile','change',async e=>{
  const file=e.target.files[0];if(!file)return;
  const imported=checkBackup(JSON.parse((await file.text()).replace(/^\uFEFF/,'')),base,schema);
  data=imported;if(!active()) {const p=draft(sample(0,rulesAt(data,base,data.latest)));p.mode='本地规则生成';data.active=p;}
  persist();history();say('历史、反馈与规则版本已恢复。');
});
wire('feedbackForm','submit',e=>{
  e.preventDefault();const f=new FormData(e.target);
  propose(data,active(),f.get('category').trim(),Number(f.get('cap')),f.get('reason'),base);
  e.target.elements.reason.value='';persist();experience();say('长期建议已提交，等待人工批准。');
});
await document.fonts.ready;
if(active())render();else chooseSample(0);
if(storageError)say('历史读取失败 · '+storageError,true);

