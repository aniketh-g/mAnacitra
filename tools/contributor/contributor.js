/* Public client key only. Authorization is enforced by Supabase SQL policies. */
(() => {
 const $=id=>document.getElementById(id);
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const client=window.supabase?.createClient('https://arqpsglptzkhmugxgabe.supabase.co','sb_publishable_xPbUU4HiTJq2NJ9LjdFLew_LYoy_tb9');
 if(!client){$('auth-status').textContent='Sign-in could not load. Check your connection and reload.';return;}
 let user=null, reviewer=false, loaded=false, offset=0, queueTicket=0;
 const datasets=new Map(),bases=new Map();
 const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 const check=result=>{if(result.error)throw result.error;return result.data;};
 async function records(kind){if(!['cities','countries','rivers'].includes(kind))throw Error('Unknown dataset');if(!datasets.has(kind)){const r=await fetch(`data/${kind}.json`,{cache:'no-cache'});if(!r.ok)throw Error('Published authoring data unavailable');datasets.set(kind,await r.json());}return datasets.get(kind);}
 async function requireUser(){const data=check(await client.auth.getUser());if(!data.user)throw Error('Please sign in again.');return data.user;}
 window.Contributor={async api(path,body){
  if(!user)throw Error('Sign in to suggest changes.');const u=new URL(path,location.origin),kind=u.searchParams.get('dataset');
  if(u.pathname==='/api/session')return {token:''};
  if(u.pathname==='/api/catalog'){const d=await records(kind);return Object.entries(d).map(([id,r])=>({id,label:r.names?.find(n=>n.primary)?.name||r.name_en||id,reference:r.name_en||''}));}
  if(u.pathname==='/api/record'){const id=u.searchParams.get('id'),r=(await records(kind))[id];if(!r)throw Error('Record not found');bases.set(`${kind}/${id}`,structuredClone(r));return {record:structuredClone(r),revision:canonical(r)};}
  if(u.pathname==='/api/save'){
   await requireUser();const base=bases.get(`${body.dataset}/${body.id}`),reason=$('suggestion-reason').value.trim();
   if(!reason)throw Error('Please briefly explain your change above the entry.');
   if(!base||body.revision!==canonical(base))throw Error('Reload the entry before submitting.');
   if(canonical(base)===canonical(body.record))throw Error('There are no changes to submit.');
   const names=body.record.names;if(!Array.isArray(names)||names.length&&names.filter(n=>n.primary).length!==1)throw Error('Choose exactly one preferred Sanskrit name.');
   const row=check(await client.from('manacitra_suggestions').insert({dataset:body.dataset,record_id:body.id,title:String(base.name_en||body.id).slice(0,300),reason,base,proposed:body.record}).select('id').single());
   $('suggestion-reason').value='';return {revision:body.revision,suggestion_id:row.id};
  }
  throw Error('This action is available only in the local editor.');
 }};
 function show(view){$('edit-view').hidden=view!=='edit';$('queue-view').hidden=view!=='queue';$('edit-tab').setAttribute('aria-pressed',String(view==='edit'));$('queue-tab').setAttribute('aria-pressed',String(view==='queue'));if(view==='queue')list(true);}
 $('edit-tab').onclick=()=>show('edit');$('queue-tab').onclick=()=>show('queue');
 async function login(signup){
  if(!$('auth-form').reportValidity())return;
  $('auth-status').textContent='Connecting…';
  try{const credentials={email:$('email').value.trim(),password:$('password').value};
   const data=check(await (
    signup
      ? client.auth.signUp({
          ...credentials,
          options:{
            emailRedirectTo:location.origin+location.pathname,
            data:{
              full_name:$('name').value.trim()
            }
          }
        })
      : client.auth.signInWithPassword(credentials)
  ));
   $('password').value='';$('auth-status').textContent=data.session?'':'Check your email to confirm your account, then sign in.';
   if(data.session)await enter(data.session.user);
  }catch(e){$('auth-status').textContent=e.message;}
 }
 $('auth-form').onsubmit=e=>{e.preventDefault();login(false);};$('signup').onclick=()=>login(true);
 $('google-login').onclick=async()=>{
  $('auth-status').textContent='Connecting to Google…';

  try{
    const {error}=await client.auth.signInWithOAuth({
      provider:'google',
      options:{
        redirectTo:location.origin+location.pathname
      }
    });

    if(error)throw error;
  }catch(e){
    $('auth-status').textContent=e.message;
  }
};
 $('signout').onclick=async()=>{if(window.contributionDirty?.()&&!confirm('Discard your unsent draft and sign out?'))return;try{check(await client.auth.signOut());location.reload();}catch(e){$('account-status').textContent=e.message;}};
 async function enter(who){
  user=who;$('auth').hidden=true;$('signed-in').hidden=false;$('signout').hidden=false;
  try{reviewer=Boolean(check(await client.rpc('manacitra_is_reviewer')));$('account-status').textContent=reviewer?'निरीक्षकः · अनुमोदनपर्यन्तं सूचनानि न प्रकाश्यन्ते':'सम्प्रविष्टवान् · प्रकाशनात्प्राक्सर्वाणि सूचनानि निरीक्ष्यानुमोद्यानि';}
  catch(e){$('account-status').textContent='Review service unavailable: '+e.message;}
  if(!loaded){loaded=true;const script=node('script');script.src='app.js';script.onerror=()=>{$('account-status').textContent='Editor failed to load. Reload this page.';};document.body.append(script);}
 }
 function differences(a,b,path='entry',rows=[]){
  if(canonical(a)===canonical(b))return rows;
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
   for(const key of new Set([...Object.keys(a),...Object.keys(b)]))differences(a[key],b[key],path+'.'+key,rows);
  }else if(Array.isArray(a)&&Array.isArray(b)){
   for(let i=0;i<Math.max(a.length,b.length);i++)differences(a[i],b[i],`${path}[${i+1}]`,rows);
  }else rows.push({path,a,b});return rows;
 }
 const readable=x=>x===undefined?'(absent)':typeof x==='string'?x:JSON.stringify(x,null,2);
 function download(row){const a=node('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(row,null,2)],{type:'application/json'}));a.download=`suggestion-${row.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
 function proposal(row){
  const box=node('article');box.className='proposal';box.append(node('h2',row.title));const badge=node('span',row.status);badge.className='badge '+row.status;box.append(badge);
  const meta=node(
    'p',
    `${row.dataset} · ${new Date(row.created_at).toLocaleDateString()}${row.author_id===user.id?' · Your suggestion':''}`
  );
  meta.className='meta';
  box.append(meta,node('p',row.reason));

  if(reviewer){
  client
    .rpc('manacitra_suggestion_author_name',{
      suggestion_id:row.id
    })
    .then(({data,error})=>{
      if(!error&&data){
        meta.textContent += ` · ${data}`;
      }
    });
  }
  const details=node('details');details.append(node('summary','View proposed changes'));box.append(details);
  details.addEventListener('toggle',async()=>{
   if(!details.open||details.dataset.loaded)return;details.dataset.loaded='loading';const message=node('p','Loading comparison…');details.append(message);
   try{const full=check(await client.from('manacitra_suggestions').select('*').eq('id',row.id).single());message.remove();
    for(const d of differences(full.base,full.proposed)){const label=node('p',d.path);label.className='diff-path';const diff=node('div');diff.className='diff';for(const [side,v] of [['before',d.a],['after',d.b]]){const cell=node('section');cell.className=side;cell.append(node('small',side==='before'?'Published baseline':'Proposed'),node('pre',readable(v)));diff.append(cell);}details.append(label,diff);}
    if(full.review_note)details.append(node('p','Review: '+full.review_note));
    if(reviewer){
      const note=node('textarea');
      note.placeholder='Review note (optional)';
      note.setAttribute('aria-label','Review note');
      details.append(note);

      const actions=node('div');
      actions.className='review-actions';
      details.append(actions);

      const setDecision=async decision=>{
        actions.querySelectorAll('button').forEach(x=>x.disabled=true);

        try{
          check(await client.rpc('manacitra_review',{
            suggestion_id:row.id,
            decision,
            note:note.value.trim()
          }));

          await list(true);
        }catch(e){
          $('queue-status').textContent=e.message;
          actions.querySelectorAll('button').forEach(x=>x.disabled=false);
        }
      };

      if(full.status==='pending'){
        const approve=node('button','✓');
        approve.className='review-button approve';
        approve.title='Approve';
        approve.setAttribute('aria-label','Approve suggestion');
        approve.onclick=()=>setDecision('approved');

        const reject=node('button','✕');
        reject.className='review-button reject';
        reject.title='Reject';
        reject.setAttribute('aria-label','Reject suggestion');
        reject.onclick=()=>setDecision('rejected');

        actions.append(approve,reject);
      }

      if(full.status==='approved' || full.status==='rejected'){
        const undo=node('button','↶');
        undo.className='review-button undo';
        undo.title=
          full.status==='approved'
            ? 'Undo approval'
            : 'Undo rejection';

        undo.setAttribute(
          'aria-label',
          full.status==='approved'
            ? 'Undo approval'
            : 'Undo rejection'
        );

        undo.onclick=()=>setDecision('pending');

        actions.append(undo);
      }
      const remove=node('button','🗑');
      remove.className='review-button delete';
      remove.title='Delete suggestion';
      remove.setAttribute('aria-label','Delete suggestion');

      remove.onclick=async()=>{
      if(!confirm('Permanently delete this suggestion?'))return;

      try{
        check(await client.rpc('manacitra_delete_suggestion',{
        suggestion_id:row.id
        }));

        await list(true);
      }catch(e){
        $('queue-status').textContent=e.message;
      }
      };

      actions.append(remove);
    }
    if(reviewer&&full.status==='approved'){const b=node('button','Download for publication');b.onclick=()=>download(full);details.append(b);}
   }catch(e){message.textContent=e.message;delete details.dataset.loaded;}
  });return box;
 }
 async function list(reset){
  const ticket=++queueTicket;if(reset){offset=0;$('suggestions').replaceChildren();}$('more').hidden=true;$('queue-status').textContent='Loading…';
  try{let q=client.from('manacitra_suggestions').select('id,author_id,dataset,title,reason,status,created_at').order('created_at',{ascending:false}).order('id').range(offset,offset+29);if($('status-filter').value!=='all')q=q.eq('status',$('status-filter').value);const rows=check(await q);if(ticket!==queueTicket)return;rows.forEach(r=>$('suggestions').append(proposal(r)));offset+=rows.length;$('more').hidden=rows.length<30;$('queue-status').textContent=offset?'':'सद्यः सूचनानि न लब्धानि';}catch(e){if(ticket===queueTicket)$('queue-status').textContent=e.message;}
 }
 $('refresh').onclick=() => list(true);$('status-filter').onchange=()=>list(true);$('more').onclick=()=>list(false);
 client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){user=null;reviewer=false;$('signed-in').hidden=true;$('auth').hidden=false;$('signout').hidden=true;}else if(event==='SIGNED_IN'&&session&&!user)setTimeout(()=>enter(session.user),0);});
 client.auth.getSession().then(({data,error})=>{if(error)$('auth-status').textContent=error.message;else if(data.session)enter(data.session.user);});
})();
