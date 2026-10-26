(() => {
 if(!window.supabase)return;
 const client=window.SiteAuth=window.supabase.createClient('https://arqpsglptzkhmugxgabe.supabase.co','sb_publishable_xPbUU4HiTJq2NJ9LjdFLew_LYoy_tb9');
 let revision=0;
 async function update(){const ticket=++revision;try{const {data,error}=await client.auth.getUser();if(ticket===revision)window.setHeaderUser(error?null:data.user);}catch{if(ticket===revision)window.setHeaderUser(null);}}
 client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){++revision;window.setHeaderUser(null);}else setTimeout(update,0);});
 update();
 document.getElementById('signout').onclick=async()=>{
  if(window.contributionDirty?.()&&!confirm('Discard your unsent draft and sign out?'))return;
  const {error}=await client.auth.signOut();if(error){alert(error.message);return;}location.reload();
 };
})();
