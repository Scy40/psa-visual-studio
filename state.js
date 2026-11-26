import {blankApproval,validate} from './protocol.js';

export const stateKey='psa-visual-studio-v01';
export const initialState=()=>({format:1,active:null,history:[],feedback:[],caps:{'0.1.0':{}},latest:'0.1.0'});
export const rulesAt=(data,base,version)=>Object.hasOwn(data.caps,version)
  ? {...base,version,densityCaps:Object.assign(Object.create(null),data.caps[version])} : null;
export function draft(task) {return {task:{...structuredClone(task),approval:blankApproval()},track:[],mode:'JSON 指令',variant:'A'};}

export function review(project, action, comment, quality) {
  const {approval}=project.task;
  const {brief_approved:brief,concept_approved:concept,final_approved:final}=approval;
  if (action==='brief' && !brief) approval.brief_approved=true;
  else if (action==='concept' && brief && !concept && quality) approval.concept_approved=true;
  else if (action==='final' && brief && concept && !final && quality) approval.final_approved=true;
  else if (action==='return' && comment.trim()) Object.assign(approval,final ? {final_approved:false,concept_approved:false} : concept ? {concept_approved:false} : blankApproval());
  else throw new Error('当前阶段不允许此操作。审核退回需要填写意见，方案和最终确认需要全部媒介通过程序检测。');
  project.track.push({action,comment:comment.trim(),at:new Date().toISOString()});
}
export function propose(data, project, category, cap, comment, base) {
  if (!/^[a-z][a-z0-9_]{0,39}$/.test(category) || !Number.isFinite(cap) || cap<base.density[0] || cap>base.density[1] || !comment.trim()) throw new Error('请填写适用类别、有效密度上限和修改依据。');
  data.feedback.push({id:crypto.randomUUID(),status:'pending',category,cap,comment:comment.trim(),task:project?.task.task_id??null,from:null,to:null,at:new Date().toISOString()});
}
export function decide(data,id,approve) {
  const suggestion=data.feedback.find(f=>f.id===id && f.status==='pending');
  if (!suggestion) throw new Error('建议已处理或不存在。');
  suggestion.status=approve?'approved':'rejected';
  suggestion.reviewedAt=new Date().toISOString();
  if (!approve) return;
  const before=data.latest, next='0.1.'+(Number(before.split('.').at(-1))+1);
  suggestion.from=before;suggestion.to=next;
  data.caps[next]={...data.caps[before],[suggestion.category]:suggestion.cap};
  data.latest=next;
}

export function checkBackup(data,base,schema) {
  const bad=()=>{throw new Error('历史备份格式、规则版本或任务无效。');};
  if (!data || data.format!==1 || !data.caps || !Array.isArray(data.history) || !Array.isArray(data.feedback) || !Object.hasOwn(data.caps,data.latest)) bad();
  for (const [v,caps] of Object.entries(data.caps)) {
    if (!/^0\.1\.\d+$/.test(v) || !caps || typeof caps!=='object' || Array.isArray(caps)) bad();
    for (const [category,cap] of Object.entries(caps)) if (!/^[a-z][a-z0-9_]{0,39}$/.test(category) || !Number.isFinite(cap) || cap<base.density[0] || cap>base.density[1]) bad();
  }
  if (!data.caps[base.version] || Object.keys(data.caps[base.version]).length || !/^0\.1\.\d+$/.test(data.latest)) bad();
  for (const item of [...data.history,...(data.active?[data.active]:[])]) {
    if (!item || !Array.isArray(item.track) || !item.track.every(x=>x && typeof x.action==='string' && typeof x.comment==='string' && typeof x.at==='string') || !item.task || validate(item.task,schema,rulesAt(data,base,item.task.rule_version)).length) bad();
    const a=item.task.approval;
    if ((a.final_approved&&!a.concept_approved)||(a.concept_approved&&!a.brief_approved)) bad();
  }
  for (const f of data.feedback) if (!f || typeof f.id!=='string' || !['pending','approved','rejected'].includes(f.status) || typeof f.category!=='string' || !/^[a-z][a-z0-9_]{0,39}$/.test(f.category) || !Number.isFinite(f.cap) || f.cap<base.density[0] || f.cap>base.density[1] || typeof f.comment!=='string') bad();
  return data;
}

