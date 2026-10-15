// Pure aggregation. Current inventory and allowance are deliberately not monthly metrics.
export function aggregate(rows, directory, search='', month='') {
 const members=new Map(rows.filter(r=>r.pk.startsWith('USER#')&&r.sk==='ACCESS').map(r=>[r.pk.slice(5),r.org||'']));
 const people=new Map();
 const get=(id,org='')=>{if(!people.has(id))people.set(id,{id,email:directory.get(id)||'',org:org||members.get(id)||'',jobs:0,failed:0,uncertain:0,scenes:0,projects:0});const p=people.get(id);if(!p.org&&org)p.org=org;return p;};
 for(const [id,org] of members)get(id,org);
 for(const r of rows){if(!r.pk.startsWith('USER#'))continue;const p=get(r.pk.slice(5),r.org);if(r.sk.startsWith('JOB#')){if(month){const date=Number(r.created_at)*1000;if(!Number.isFinite(date)||date<=0||new Date(date).toISOString().slice(0,7)!==month)continue;}p.jobs++;p.failed+=Number(r.state==='failed');p.uncertain+=Number(r.state==='uncertain');}else if(r.sk.startsWith('LIB#')&&!r.deleting){p.scenes+=Number(r.kind==='scene');p.projects+=Number(r.kind==='project');}}
 for(const [id,email] of directory){const p=get(id);p.email=email;}
 const q=search.trim().toLowerCase();const visible=[...people.values()].filter(p=>!q||`${p.id} ${p.email} ${p.org}`.toLowerCase().includes(q)).sort((a,b)=>b.jobs-a.jobs||a.email.localeCompare(b.email));
 const companies=rows.filter(r=>r.pk.startsWith('ORG#')&&r.sk==='ACCESS'&&(!q||`${r.pk} ${r.name}`.toLowerCase().includes(q)));
 return {people:visible,companies,jobs:visible.reduce((a,p)=>a+p.jobs,0),active:visible.filter(p=>p.jobs>0).length,failed:visible.reduce((a,p)=>a+p.failed,0),library:visible.reduce((a,p)=>a+p.scenes+p.projects,0)};
}
