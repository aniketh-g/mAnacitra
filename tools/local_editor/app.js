'use strict';
const $=id=>document.getElementById(id), copy=v=>structuredClone(v);
let options,token,catalog=[],record=null,identifier='',dataset='countries',revision='',dirty=false,conflict=false,serial=0,saving=false;
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const button=(text,fn,cls='')=>{const b=el('button',text);b.type='button';b.className=cls;b.onclick=fn;return b;};
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function changed(){dirty=true;$('save').disabled=conflict||saving;status(conflict?'File changed on disk. Download draft and reload before saving.':'Unsaved changes · Public website is unchanged.',conflict);}
async function api(path,body){const response=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Editor-Token':token},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw Error(result.error||response.status);return result;}
function inputField(parent,label,value,onChange,type='text',choices=null,track=true){const wrap=el('label'),caption=el('span',label);let input;
 if(choices){input=el('select');for(const row of choices){const opt=el('option',typeof row==='string'?row:row.label);opt.value=typeof row==='string'?row:row.value;input.append(opt);}if(value!==undefined&&!choices.some(r=>(typeof r==='string'?r:r.value)===String(value))){const opt=el('option',String(value)+' (existing value)');opt.value=value;input.append(opt);}input.value=value??'';}
 else{input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;if(type==='checkbox')input.checked=Boolean(value);else input.value=value??'';}
 input.addEventListener(choices||type==='checkbox'?'change':'input',()=>{onChange(type==='checkbox'?input.checked:type==='number'?(input.value===''?null:Number(input.value)):input.value);if(track)changed();});
 wrap.append(caption,input);parent.append(wrap);return input;
}
const line=p=>{const d=el('div');d.className='g-row';p.append(d);return d;};
const small=(p,v,fn,choices=null,hint='')=>{const i=inputField(p,'',v,fn,'text',choices);i.placeholder=hint;i.title=hint;i.setAttribute('aria-label',hint||'Value');return i;};
const labels={name_en:'Reference name (English)',name_native:'Native name',description:'Place description · Markdown',names:'Sanskrit names',name_families:'Foreign name families',name:'Name',label:'Representative name',primary:'Preferred Sanskrit name',confidence:'Confidence',pronunciation:'Pronunciation',language:'Language',attestation_status:'Attestation status',etymologies:'Etymologies',vyutpatti:'व्युत्पत्तिः · One-line explanation',notes:'Notes · Markdown',citations:'Source references',attestations:'Attestations',quote:'Quotation · Markdown',date:'Display date',sort_year:'Year for chronological sorting',title:'Source title',source_id:'Bibliography ID',locator:'Page / verse / section',url:'Source link',note:'Source note',comment:'Personal comment',descendants:'अपभ्रंशाः · Descendants',prakriyA:'प्रक्रिया',form:'Form',parts:'Components',text:'Text',meaning:'Meaning',highlight:'Highlight this component',rules:'Rule IDs',branch:'Branch',from:'Parent node IDs',id:'Identifier',kind:'Transformation kind',status:'Attested / reconstructed status',nodes:'Nodes',edges:'Edges',to:'Target node'};
const fields={place:['name_en','name_native','description','names','name_families'],sanskrit:['name','primary','confidence','attestation_status','notes','descendants','etymologies','attestations','citations'],foreign:['label','language','pronunciation','descendants','etymologies','attestations','attestation_status'],etymology:['vyutpatti','notes','citations','prakriyA'],attestation:['language','date','sort_year','quote','notes','citations'],citation:['title','source_id','locator','url','note'],node:['id','form','language','pronunciation','meaning','parts','rules','branch','from','kind','status'],part:['text','meaning','highlight']};
const types={names:'sanskrit',name_families:'foreign',etymologies:'etymology',attestations:'attestation',citations:'citation',descendants:'node',nodes:'node',parts:'part'};
function initial(kind){return kind==='sanskrit'?{name:'',primary:false,descendants:[],etymologies:[],attestations:[]}:kind==='foreign'?{label:'',language:'',pronunciation:'',descendants:[],etymologies:[],attestations:[]}:kind==='etymology'?{vyutpatti:'',notes:'',prakriyA:null,citations:[]}:kind==='attestation'?{language:'',date:'',quote:'',notes:'',citations:[]}:kind==='citation'?{title:'',url:'',locator:''}:kind==='node'?{form:'',pronunciation:'',language:'',rules:[]}:kind==='part'?{text:'',meaning:'',highlight:false}:'';}
function defaultValue(key){if(types[key]||['rules','from','edges'].includes(key))return [];if(key==='prakriyA')return null;if(key==='primary'||key==='highlight')return false;if(key==='confidence')return 1;return '';}
function renderObject(parent,obj,kind,scope){
 const order={name:0,attestation_status:1,notes:2,descendants:3,etymologies:4};
 const keys=Object.keys(obj).sort((a,b)=>Number(['names','name_families'].includes(a))-Number(['names','name_families'].includes(b)));
 for(const key of keys)if(!(kind==='sanskrit'&&key==='primary'))field(parent,obj,key,kind,scope);
 const missing=(fields[kind]||[]).filter(key=>!Object.hasOwn(obj,key));
 if(missing.length){
  const r=el('div');r.className='add-row';const s=el('select');
  for(const key of missing){const o=el('option',labels[key]||key);o.value=key;s.append(o);}
  r.append(s,button('Add field',()=>{obj[s.value]=defaultValue(s.value);changed();redraw();}));parent.append(r);
 }
}
function field(parent,obj,key,kind,scope){
 const value=obj[key],wrap=el('div');wrap.className='field';parent.append(wrap);
 const remove=button('Remove',()=>{if(confirm('Remove this field?')){delete obj[key];changed();redraw();}},'danger');
 const multiline=['notes','note','description','quote'].includes(key);

 if(value!==null&&!Array.isArray(value)&&typeof value!=='object'&&!multiline){
  wrap.classList.add('one-line');
  const i=inputField(wrap,labels[key]||key,value,v=>obj[key]=v,typeof value==='boolean'?'checkbox':typeof value==='number'?'number':'text');
  i.setAttribute('aria-label',labels[key]||key);wrap.append(remove);return;
 }
 const heading=el('div');heading.className='field-head';
 heading.append(el('strong',labels[key]||key),remove);wrap.append(heading);
 if (key === 'descendants') {
  if (value === null) {
    wrap.append(button('Add descendants tree', () => {
      obj[key] = [];
      changed();
      redraw();
    }));
  } else if (Array.isArray(value) || (value && Array.isArray(value.nodes))) {
    foreignTree(wrap, value, { descendants: true });
  } else {
    wrap.append(el('p', 'Unsupported descendants format'));
  }
  return;
}
 if(key==='prakriyA'&&scope==='sanskrit'){requestForm(wrap,obj,key);return;}
 if(key==='prakriyA'&&scope==='foreign'&&value){
  foreignTree(wrap,value);
  const advanced=el('details');advanced.append(el('summary','Connections, components and advanced fields'));wrap.append(advanced);
  field(advanced,obj,key,kind,'foreign-raw');return;
 }
 if(key==='prakriyA'&&value===null){wrap.append(button('Add steps',()=>{obj[key]=[];changed();redraw();}));return;}
 if(value===null&&types[key]){wrap.append(button('Add entry',()=>{const item=initial(types[key]);if(key==='names')item.primary=true;obj[key]=[item];changed();redraw();}));return;}
 if(Array.isArray(value)){const itemKind=key==='prakriyA'?'node':types[key]||'generic';value.forEach((item,index)=>{const details=el('details');details.className='array-item';const summary=el('summary',`${index+1}. ${item?.name||item?.label||item?.vyutpatti||item?.title||item?.form||labels[key]||key}`);details.append(summary);
 if(key==='names'){
 const label=el('label');label.className='preferred-toggle';
 const cb=el('input');cb.type='checkbox';cb.checked=!!item.primary;
 cb.onchange=()=>{item.primary=cb.checked;changed();};
 label.append(cb,el('span','Preferred'));
 summary.append(label);
}
const bar=el('div');bar.className='item-tools';bar.append(button('↑',()=>{if(index){[value[index-1],value[index]]=[value[index],value[index-1]];changed();redraw();}}),button('↓',()=>{if(index<value.length-1){[value[index+1],value[index]]=[value[index],value[index+1]];changed();redraw();}}),button('Remove entry',()=>{if(confirm('Remove this entry?')){value.splice(index,1);changed();redraw();}},'danger'));details.append(bar);
 if(item&&typeof item==='object'&&!Array.isArray(item))renderObject(details,item,itemKind,key==='names'?'sanskrit':key==='name_families'?'foreign':scope);else inputField(details,'Value',typeof item==='object'?JSON.stringify(item):item,v=>{value[index]=v;});wrap.append(details);});wrap.append(button('Add entry',()=>{const next=initial(itemKind);if(key==='names'&&!value.length)next.primary=true;value.push(next);changed();redraw();}));return;}
 if(value&&typeof value==='object'){const details=el('details');details.append(el('summary','Edit '+(labels[key]||key)));renderObject(details,value,kind==='node'?'generic':kind,scope);wrap.append(details);return;}
 const control=inputField(wrap,'',value,v=>obj[key]=v,typeof value==='boolean'?'checkbox':typeof value==='number'?'number':['notes','note','description','quote','vyutpatti'].includes(key)?'textarea':'text');control.setAttribute('aria-label',labels[key]||key);}
const treeObservers=[];
function foreignTree(parent, value, { descendants = false } = {}) {
 const shell=el('div');shell.className='fe-tree';parent.append(shell);
 let graph,model;
 try{graph=Array.isArray(value)?InspectorGraph.prakriyaToGraph(value):value;model=InspectorGraph.layout(graph);}
 catch(error){shell.append(el('p',error.message));return;}
 const source=id=>Array.isArray(value)?value.find((n,i)=>(n.id||`step-${i}`)===id):value.nodes.find(n=>n.id===id);
 const diagram=el('div');diagram.className='fe-diagram';shell.append(diagram);
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');diagram.append(svg);
 const slots=new Map(),links=[];
 const incoming = new Map(graph.nodes.map(n => [n.id, []]));
 const outgoing = new Map(graph.nodes.map(n => [n.id, []]));
 
 for (const edge of graph.edges || []) {
    incoming.get(edge.to)?.push(edge.from);
    outgoing.get(edge.from)?.push(edge.to);
 }
 
 const commonNodes = new Set();
 
 let current = graph.nodes.find(n =>
    !incoming.get(n.id)?.length &&
    (!n.branch || n.branch === 'common')
 );
 
 while (current) {
    commonNodes.add(current.id);
    
    const children = outgoing.get(current.id) || [];
    if (children.length !== 1) break;
    
    const next = graph.nodes.find(n => n.id === children[0]);
    if (!next || (next.branch && next.branch !== 'common')) break;
    
    current = next;
 }
 const control=(host,label,value,set,cls='')=>{const i=inputField(host,label,value,set);i.placeholder=label;i.setAttribute('aria-label',label);i.className=cls;return i;};
 function add(after) {
  if (!Array.isArray(value)) return;

  // Preserve all existing connections explicitly before adding a node.
  graph.nodes.forEach(n => {
    const original = source(n.id);
    original.id = n.id;
    original.from = graph.edges
      .filter(e => e.to === n.id)
      .map(e => e.from);
  });

  let id = 'node-1', i = 1;
  while (graph.nodes.some(n => n.id === id)) {
    id = 'node-' + (++i);
  }

  value.push({
    id,
    from: after ? [after] : [],
    form: '',
    pronunciation: '',
    language: '',
    rules: []
  });

  changed();
  redraw();
}
 model.rows.forEach((row,r)=>{
  const line=el('div');line.className='fe-row';line.style.gridTemplateColumns=`repeat(${model.columns},minmax(180px,1fr))`;diagram.append(line);
  row.forEach(item=>{
   const node=el('div');node.className='fe-node';node.style.gridRow=1;node.style.gridColumn=String(item.column+1);
   if (item.node && commonNodes.has(item.node.id) && model.columns > 1) {
    node.style.gridColumn = `1 / ${model.columns + 1}`;
    node.style.justifySelf = 'center';
    node.style.width = `${100 / model.columns}%`;
    }
   line.append(node);slots.set(item.key,node);if(!item.node)return;
   const data=source(item.node.id),form=el('div');form.className='fe-form';node.append(form);
   if(data.parts?.length)data.parts.forEach((part,i)=>{if(i)form.append(el('span','+'));const component=el('div');component.className='fe-component';form.append(component);control(component,'Form',part.text,v=>part.text=v,part.highlight?'fe-highlight':'');control(component,'Meaning',part.meaning??(data.parts.length===1?data.meaning:'')??'',v=>{part.meaning=v;},'fe-muted');});
   else control(form,'Form',data.form??data.label??'',v=>{if(Object.hasOwn(data,'label')&&!Object.hasOwn(data,'form'))data.label=v;else data.form=v;});
   if(!data.parts?.length)control(form,'Meaning',data.meaning||'',v=>data.meaning=v,'fe-muted');
   const pronunciation = el('div');
   pronunciation.className = 'fe-pronunciation';
   node.append(pronunciation);
   
   control(
    pronunciation,
    'Pronunciation',
    data.pronunciation || '',
    v => data.pronunciation = v,
    'fe-pronunciation-input'
   );
   
   const meta = el('div');
   meta.className = 'fe-meta';
   node.append(meta);
   
   control(meta,'Language',data.language||'',v=>data.language=v,'fe-muted');
   if(Array.isArray(value))node.append(button('+ Next / branch',()=>add(item.node.id)));
    if (Array.isArray(value) && descendants) {
        const tools = el('div');
        tools.className = 'fe-node-tools';
        node.append(tools);

        const parents = graph.edges
            .filter(edge => edge.to === item.node.id)
            .map(edge => edge.from);

        const choices = [
            { value: '', label: '— Root node —' },
            ...graph.nodes
            .filter(n => n.id !== item.node.id)
            .map(n => ({
                value: n.id,
                label: `${n.form || n.label || n.id} (${n.id})`
            }))
        ];

        inputField(
            tools,
            'Parent',
            parents[0] || '',
            parentId => {
            // Explicit connections, replacing the implicit sequence.
            graph.nodes.forEach(n => {
                const original = source(n.id);
                original.id = n.id;
                original.from = graph.edges
                .filter(e => e.to === n.id)
                .map(e => e.from);
            });

            data.from = parentId ? [parentId] : [];
            changed();
            redraw();
            },
            'text',
            choices
        );

        tools.append(button('Delete node', () => {
            if (!confirm('Delete this node? Its children will become roots.')) return;

            graph.nodes.forEach(n => {
            const original = source(n.id);
            original.id = n.id;
            original.from = graph.edges
                .filter(e => e.to === n.id)
                .map(e => e.from)
                .filter(id => id !== item.node.id);
            });

            value.splice(value.indexOf(data), 1);
            changed();
            redraw();
        }, 'danger'));
    }
  });
  const band=model.bands[r];if(!band?.length)return;
  const line2=el('div');line2.className='fe-band';diagram.append(line2);
  const groups=[];for(const segment of band){let group=segment.join&&groups.find(g=>g[0].join===segment.join);if(!group){group=[];groups.push(group);}group.push(segment);}
  line2.style.gridTemplateColumns=`repeat(${model.columns},minmax(180px,1fr))`;
  groups.forEach(segments=>{
   const segment=segments[0],pill=el('div');pill.className='fe-rule';pill.style.gridColumn=String(segment.column+1);line2.append(pill);
   if(segment.label){const target=Array.isArray(value)?source(segment.edge.to):segment.edge;
    control(pill,'Rule IDs · comma separated',Array.isArray(target.rules)?target.rules.join(', '):target.rules||'',v=>target.rules=v.split(',').map(s=>s.trim()).filter(Boolean));
    if(target.rule||target.sutra)control(pill,'Rule',target.rule||target.sutra,v=>{if(target.sutra&&!target.rule)target.sutra=v;else target.rule=v;});
   }else pill.className='fe-route';
   links.push({segments,pill,label:segment.label,to:segment.to});
  });
 });
 function draw(){
  svg.replaceChildren();const base=diagram.getBoundingClientRect();if(!base.width)return;
  const port=(element,bottom)=>{const r=element.getBoundingClientRect();return [r.left+r.width/2-base.left,(bottom?r.bottom:r.top)-base.top];};
  const path=(a,b,arrow)=>{const p=document.createElementNS(ns,'path'),m=(a[1]+b[1])/2;p.setAttribute('d',`M${a} C${a[0]},${m} ${b[0]},${m} ${b}`);svg.append(p);if(arrow){const tip=document.createElementNS(ns,'path');tip.setAttribute('d',`M${b[0]-4},${b[1]-6} L${b} L${b[0]+4},${b[1]-6}`);svg.append(tip);}};
  links.forEach(link=>{const end=port(slots.get(link.to),false);if(link.label){link.segments.forEach(s=>path(port(slots.get(s.from),true),port(link.pill,false),false));path(port(link.pill,true),end,true);}else link.segments.forEach(s=>path(port(slots.get(s.from),true),end,true));});
 }
 const observer=new ResizeObserver(draw);observer.observe(diagram);treeObservers.push(observer);requestAnimationFrame(draw);
 if(Array.isArray(value))shell.append(button('+ Starting form',()=>add(null)));
 shell.append(button('Refresh tree after connection changes',()=>redraw()));
//  value.push({id, from: after ? [after] : [], form: '', pronunciation: '', language: '', rules: []});
}

const choice=(vals,names)=>vals.map((value,i)=>({value,label:names[i]}));
const gender=choice(['masculine','feminine','neuter'],['पुं','स्त्री','नपुं']);
const cases=choice(['nominative','accusative','instrumental','dative','ablative','genitive','locative','vocative'],['प्रथमा','द्वितीया','तृतीया','चतुर्थी','पञ्चमी','षष्ठी','सप्तमी','सम्बोधनम्']);
const numbers=choice(['singular','dual','plural'],['एक','द्वि','बहु']);
const operations=choice(['basic','krdanta','taddhitanta','samasa','subanta'],['प्रातिपदिकम्','कृदन्तम्','तद्धितान्तम्','समासः','सुबन्तम्']);
function newInput(type){return type==='basic'?{type,text:''}:type==='krdanta'?{type,dhatu:{aupadeshika:'',gana:'Bhvadi'},pratyaya:{type:'krt',id:''}}:type==='samasa'?{type,samasa_type:'tatpurusha',members:[newMember(),newMember()]}:type==='subanta'?{type,stem:newInput('basic'),gender:'neuter',case:'nominative',number:'singular'}:{type,stem:newInput('basic'),pratyaya:''};}
function newMember(){return {stem:newInput('basic'),gender:'masculine',case:'nominative',number:'singular'};}
function enums(name){return [{value:'',label:'— Select —'},...options[name]];}
function optional(parent,obj,key,label,values=null,type='text'){if(!Object.hasOwn(obj,key)){parent.append(button('+ '+label,()=>{obj[key]=type==='checkbox'?false:type==='array'?[]:'';changed();redraw();}));return;}
 const row=el('div');row.className='field';inputField(row,label,obj[key],v=>obj[key]=type==='array'?v.split(',').map(s=>s.trim()).filter(Boolean):v,type==='array'?'text':type,values);row.append(button('Omit '+label,()=>{delete obj[key];changed();redraw();}));parent.append(row);}
function grammar(parent,input,replace,stemOnly=false,depth=0,owner=null){
 if(depth>24){parent.append(el('p','Nesting exceeds supported depth.'));return;}
 const box=el('div');box.className='grammar';parent.append(box);const h=line(box);
 small(h,input.type,t=>{if(confirm('Change operation? This replaces the fields for this component.')){replace(newInput(t));changed();redraw();}else redraw();},operations.filter(o=>!stemOnly||o.value!=='subanta'),'Operation');
 if(input.type==='basic')small(h,input.text,v=>input.text=v,null,'प्रातिपदिकम्');
 if(input.type==='samasa')small(h,input.samasa_type,v=>input.samasa_type=v,choice(['avyayibhava','tatpurusha','karmadharaya','dvigu','ekadeshin','bahuvrihi','dvandva','samahara_dvandva'],['अव्ययीभावः','तत्पुरुषः','कर्मधारयः','द्विगुः','एकदेशी','बहुव्रीहिः','द्वन्द्वः','समाहारद्वन्द्वः']),'समासभेदः');
 if(input.type==='krdanta'){
  const root=input.dhatu;
  small(h,(root.prefixes||[]).join(', '),v=>{const a=v.split(',').map(s=>s.trim()).filter(Boolean);if(a.length)root.prefixes=a;else delete root.prefixes;},null,'उपसर्गः');
  small(h,root.aupadeshika,v=>root.aupadeshika=v,null,'धातुः');
  const g=options.Gana.find(x=>x.value===root.gana);const badge=el('span',g?.label||root.gana);badge.className='gana';badge.title='गणः';h.append(badge);
  small(h,input.pratyaya.type,v=>{input.pratyaya={type:v,id:''};changed();redraw();},choice(['krt','unadi'],['कृत्','उणादिः']),'प्रत्ययवर्गः');
  small(h,input.pratyaya.id,v=>input.pratyaya.id=v,enums(input.pratyaya.type==='unadi'?'Unadi':'BaseKrt'),'प्रत्ययः');
 }
 if(input.type==='taddhitanta')small(h,input.pratyaya,v=>input.pratyaya=v,enums('Taddhita'),'तद्धितप्रत्ययः');
 if(owner)inflection(h,owner);else if(input.type==='subanta')inflection(h,input);
 if(input.type==='basic'){const d=el('details');d.className='extra';d.append(el('summary','अन्यविकल्पाः'));box.append(d);optional(d,input,'meaning','Meaning');optional(d,input,'avyaya','अव्ययम्',null,'checkbox');optional(d,input,'nyap','ङ्याप्',null,'checkbox');}
 if(input.type==='krdanta'){
  const root=input.dhatu,d=el('details');d.className='extra';d.append(el('summary','धातुपाठः / अन्यविकल्पाः'));box.append(d);
  const search=inputField(d,'Find a धातुः','',()=>{},'search',null,false),select=el('select');d.append(select);
  function roots(){select.replaceChildren();const blank=el('option','Choose a root');blank.value='';select.append(blank);const q=search.value.trim();for(const item of options.roots.filter(r=>!q||`${r.text} ${r.meaning} ${r.value}`.includes(q))){const o=el('option',`${item.text} — ${item.meaning} (${item.value})`);o.value=item.value;select.append(o);}}
  search.addEventListener('input',roots);roots();select.onchange=()=>{const selected=options.roots.find(r=>r.value===select.value);if(selected){root.aupadeshika=selected.text;root.gana=selected.gana;delete root.antargana;changed();redraw();}};
  optional(d,root,'artha','Meaning override');
  const antargana={Bhvadi:['Ghatadi'],Tudadi:['Kutadi'],Curadi:['Asvadiya','Adhrshiya','Akusmiya']}[root.gana]||[];
  if(antargana.length)optional(d,root,'antargana','अन्तर्गणः',[{value:'',label:'— Select —'},...options.Antargana.filter(v=>antargana.includes(v.value))]);
  const san=el('details');san.append(el('summary','सनादिप्रत्ययाः'));(root.sanadi||[]).forEach((v,i)=>{inputField(san,'Modifier '+(i+1),v,n=>root.sanadi[i]=n,'text',enums('Sanadi'));san.append(button('Remove modifier',()=>{root.sanadi.splice(i,1);changed();redraw();}));});san.append(button('Add modifier',()=>{(root.sanadi??=[]).push('Ric');changed();redraw();}));d.append(san);
  optional(d,input,'artha','अर्थः',enums('KrtArtha'));optional(d,input,'lakara','लकारः',enums('Lakara'));optional(d,input,'prayoga','प्रयोगः',enums('Prayoga'));
 }
 if(['taddhitanta','subanta'].includes(input.type)){const c=el('div');c.className='children';box.append(c);grammar(c,input.stem,v=>input.stem=v,true,depth+1);}
 if(input.type==='taddhitanta'){const d=el('details');d.className='extra';d.append(el('summary','अन्यविकल्पाः'));box.append(d);optional(d,input,'artha','अर्थः',enums('TaddhitaArtha'));}
 if(input.type==='samasa'){
  const c=el('div');c.className='children';box.append(c);
  input.members.forEach((member,i)=>{const part=el('details');part.open=true;part.append(el('summary','Member '+(i+1)));grammar(part,member.stem,v=>member.stem=v,true,depth+1,member);part.append(button('Remove member',()=>{if(input.members.length<=2){alert('A compound needs at least two members.');return;}input.members.splice(i,1);changed();redraw();}));c.append(part);});
  c.append(button('Add member',()=>{input.members.push(newMember());changed();redraw();}));
  const d=el('details');d.className='extra';d.append(el('summary','अन्यविकल्पाः'));box.append(d);optional(d,input,'stri','स्त्रीप्रत्ययः',null,'checkbox');
 }
}
function inflection(parent,obj){const r=el('span');r.className='infl';parent.append(r);small(r,obj.gender,v=>obj.gender=v,gender,'लिङ्गम्');small(r,obj.case,v=>obj.case=v,cases,'विभक्तिः');small(r,obj.number,v=>obj.number=v,numbers,'वचनम्');
}
function requestForm(parent,obj,key){if(!obj[key]){parent.append(button('Add प्रक्रिया',()=>{obj[key]={input:newInput('basic')};changed();redraw();}));return;}if(!obj[key].input){parent.append(el('p','This is a legacy/manual tree. It is preserved. Use the generic fields below to edit it.'));renderObject(parent,obj[key],'generic','foreign');return;}
 const details=el('details');details.append(el('summary','Edit प्रक्रिया'));parent.append(details);const request=obj[key];grammar(details,request.input,v=>request.input=v);optional(details,request,'expected','Expected final form');optional(details,request,'chandasi','वैदिकप्रक्रिया',null,'checkbox');optional(details,request,'variant','Selected result index',null,'number');
 const preview=el('div');preview.className='preview';details.append(button('Preview with Vidyut',async()=>{const snapshot=JSON.stringify(request);preview.replaceChildren(el('p','Deriving…'));try{const result=await api('/api/preview',{request});if(JSON.stringify(request)!==snapshot){preview.replaceChildren(el('p','Input changed. Preview again.'));return;}preview.replaceChildren();for(const variant of result.variants){const row=el('details');row.append(el('summary',`${variant.form} · Variant ${variant.variant}`));row.append(button('Use this result',()=>{if(JSON.stringify(request)!==snapshot){preview.replaceChildren(el('p','Input changed. Preview again.'));return;}request.variant=variant.variant;changed();redraw();}));const steps=el('ol');for(const step of variant.history){steps.append(el('li',`${step.parts.join(' + ')} · ${step.source} ${step.rule}`));}row.append(steps);preview.append(row);}}catch(error){preview.replaceChildren(el('p',error.message));}}),preview);}
function redraw(){treeObservers.splice(0).forEach(o=>o.disconnect());const open=[...$('form').querySelectorAll('details')].map(d=>d.open);$('form').replaceChildren();if(record)renderObject($('form'),record,'place','');[...$('form').querySelectorAll('details')].forEach((d,i)=>{if(open[i]!==undefined)d.open=open[i];});}
function drawCatalog(){const q=$('filter').value.toLocaleLowerCase();$('records').replaceChildren();for(const row of catalog.filter(r=>`${r.label} ${r.reference} ${r.id}`.toLocaleLowerCase().includes(q)).slice(0,100)){const b=button(row.label,()=>load(row.id));b.classList.toggle('selected',row.id===identifier);b.append(el('small',`${row.reference} · ${row.id}`));$('records').append(b);}}
async function load(id,force=false){if(saving)return;if(dirty&&!force&&!confirm('Discard unsaved changes? Download your draft first if needed.'))return;const ticket=++serial;try{const data=await api(`/api/record?dataset=${dataset}&id=${encodeURIComponent(id)}`);if(ticket!==serial)return;identifier=id;record=data.record||{name_en:'',name_native:'',description:'',names:[],name_families:[]};revision=data.revision;dirty=false;conflict=false;$('title').textContent=record.name_en||id;$('save').disabled=true;$('reload').disabled=false;$('download').disabled=false;redraw();drawCatalog();status('Loaded from disk. Save updates the source JSON; rebuild the website separately.');}catch(e){status(e.message,true);}}
$('filter').oninput=drawCatalog;
$('dataset').onchange=async()=>{if(saving){$('dataset').value=dataset;return;}if(dirty&&!confirm('Discard unsaved changes?')){$('dataset').value=dataset;return;}++serial;dataset=$('dataset').value;identifier='';record=null;dirty=false;conflict=false;$('form').replaceChildren();$('title').textContent='Choose a place';$('save').disabled=true;try{catalog=await api('/api/catalog?dataset='+dataset);drawCatalog();}catch(e){status(e.message,true);}};
$('reload').onclick=()=>load(identifier);
$('new-record').onclick=()=>{const id=prompt('Existing geographic place ID, or mapped record ID. New places also need geography/mappings.');if(id)load(id.trim());};
$('download').onclick=()=>{const a=el('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}));a.download='manacitra-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
$('save').onclick=async()=>{if(saving)return;saving=true;const text=JSON.stringify(record),id=identifier,kind=dataset;$('save').disabled=true;try{const result=await api('/api/save',{dataset:kind,id,record:JSON.parse(text),revision});if(id!==identifier||kind!==dataset)return;revision=result.revision;conflict=false;dirty=JSON.stringify(record)!==text;status(`Saved. Backup: ${result.backup}. Run make ${kind} to update the website.`);catalog=await api('/api/catalog?dataset='+dataset);drawCatalog();}catch(e){status(e.message,true);}finally{saving=false;$('save').disabled=!dirty||conflict;}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
setInterval(async()=>{if(!identifier||!record||document.hidden||saving)return;const id=identifier,kind=dataset,ticket=serial;try{const fresh=await api(`/api/record?dataset=${kind}&id=${encodeURIComponent(id)}`);if(id!==identifier||kind!==dataset||ticket!==serial)return;if(fresh.revision!==revision){if(dirty){conflict=true;$('save').disabled=true;status('Record changed on disk. Download your draft, then reload to reconcile changes.',true);}else{await load(id,true);}}}catch(e){status('Disk check: '+e.message,true);}},3000);
(async()=>{try{const session=await api('/api/session');token=session.token;options=await(await fetch('/options.json')).json();catalog=await api('/api/catalog?dataset='+dataset);drawCatalog();}catch(e){status(e.message,true);}})();
