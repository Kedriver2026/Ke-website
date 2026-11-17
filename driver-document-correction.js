(() => {
 'use strict';
 const route=window.keCorrectionRoute;
 if(!route?.onCanonical())return;
 const issue=route.parse(location.search), targeted=route.requested(location.search);
 const fields = {
  license: "Driver’s license",
  insurance: "Auto insurance",
  registration: "Vehicle registration"
 };
 const typeNames = issue?[issue]:Object.keys(fields);
 const fileTypes = type => type==='license'?'image/*':'image/*,application/pdf';
 const selectFields = typeNames.flatMap(t => [t + '_review_status', t + '_document_path']).join(',');
 const unavailable = 'We couldn’t verify your document status. Refresh before continuing.';
 const changed = 'Your signed-in account changed. Refresh this page before continuing.';
 const stale = 'This document’s review changed. Refresh to check what is still needed.';
 const url = window.keOnboardingConfig.url, key = window.keOnboardingConfig.key;
 const authClient = supabase.createClient(url,key);
 const ordinary = document.getElementById('ordinary-onboarding');
 const correction = document.getElementById('document-corrections');
 const status = document.getElementById('onboarding-status');
 const list = document.getElementById('document-correction-list');
 let identity, blocked = false, busy = false;
 const paths = {};
 const cards = {};
 function setStatus(text){status.hidden=!text;status.textContent=text;}
 function clear(){
  for(const c of Object.values(cards)) {c.input.value='';c.input.disabled=true;c.save.disabled=true;c.stage=null;}
 }
 function invalidate(){
  if(blocked)return;
  blocked=true;clear();document.getElementById('correction-account-link')?.remove();ordinary.hidden=true;correction.hidden=true;setStatus(changed);
 }
 function observe(id){
  if(identity!==undefined&&id!==identity)invalidate();
 }
 function guard(){if(blocked)throw new Error(changed);}
 authClient.auth.onAuthStateChange((event,session)=>{
  // Handle account changes without making an auth call under the SDK lock.
  if(event==='INITIAL_SESSION'&&identity===undefined)return;
  observe(session?.user?.id??null);
 });
 async function verified({allowMissing=false}={}){
  guard();
  const session=await authClient.auth.getSession();guard();
  if(session.error)throw session.error;
  const initial=session.data?.session;
  if(!initial?.access_token||!initial.user?.id){
   if(allowMissing&&identity===undefined)return null;
   invalidate();guard();
  }
  if(identity===undefined)identity=initial.user.id;
  observe(initial.user.id);guard();
  const token=initial.access_token;
  const result=await authClient.auth.getUser(token);guard();
  if(result.error)throw result.error;
  observe(result.data?.user?.id??null);guard();
  const current=await authClient.auth.getSession();guard();
  if(current.error)throw current.error;
  observe(current.data?.session?.user?.id??null);guard();
  return supabase.createClient(url,key,{accessToken:async()=>{guard();return token;}});
 }
 async function currentDocs(bound){
  const {data,error}=await bound.from('drivers').select(selectFields).eq('user_id',identity).maybeSingle();guard();
  if(error||!data)throw new Error(unavailable);
  return data;
 }
 const elem=(tag, content)=>{const el=document.createElement(tag);el.textContent=content;return el;};
 function saved(c){
  c.stage=null;c.input.value='';c.form.hidden=true;c.complete=true;
  c.msg.textContent='Replacement submitted for K&E review. No other steps are required for this document.';
  setStatus(Object.values(cards).every(item=>item.complete)?'Your requested replacements were submitted. K&E will review them.':'');
 }
 async function replace(type,c,event){
  event.preventDefault();
  if(blocked||busy||c.form.hidden)return;
  const file=c.input.files?.[0];
  if(!c.correctable)return;
  if(!file){c.msg.textContent=type==='license'?'Choose a clear, current image.':'Choose a clear, current image or PDF.';return;}
  if(file.type&&!file.type.startsWith('image/')&&(type==='license'||file.type!=='application/pdf')){
   c.msg.textContent=type==='license'?'Upload an image of your driver’s license.':'Upload an image or PDF for this document.';return;
  }
  busy=true;for(const item of Object.values(cards)){item.input.disabled=true;item.save.disabled=true;}
  c.msg.textContent='Checking your current document…';
  try{
   let client=await verified();guard();
   let docs=await currentDocs(client);guard();
   if(c.stage&&docs[type+'_document_path']===c.stage.path&&['pending','approved'].includes(docs[type+'_review_status'])){
    await verified();guard();saved(c);return;
   }
   if(docs[type+'_review_status']!=='attention'||(docs[type+'_document_path']??null)!==paths[type])throw new Error(stale);
   if(!c.stage||c.stage.file!==file){
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    c.stage={file,path:`${identity}/${type}-${crypto.randomUUID()}.${/^[a-z0-9]{1,8}$/.test(ext)?ext:'bin'}`,prior:paths[type],uploaded:false};
   }
   const staged=c.stage;
   if(!staged.uploaded){
    client=await verified();guard();
    const up=await client.storage.from('driver-documents').upload(staged.path,file,{contentType:file.type||'application/octet-stream',upsert:false});guard();
    if(up.error&&!['409','Duplicate'].includes(String(up.error.statusCode||up.error.code)))throw up.error;
    staged.uploaded=true;
   }
   client=await verified();guard();
   docs=await currentDocs(client);guard();
   if(docs[type+'_review_status']!=='attention'||(docs[type+'_document_path']??null)!==staged.prior)throw new Error(stale);
   client=await verified();guard();

   // The server checks Attention plus this exact path and verifies the new owned object.
   let result;
   try{result=await client.rpc('submit_driver_document_correction',{p_document_type:type,p_object_path:staged.path,p_expected_path:staged.prior});}
   catch(error){result={error};}
   guard();
   client=await verified();guard();
   docs=await currentDocs(client);guard();
   await verified();guard();
   if(docs[type+'_document_path']===staged.path&&['pending','approved'].includes(docs[type+'_review_status'])){saved(c);return;}
   if(result?.error?.code==='40001'||docs[type+'_document_path']===staged.path)throw new Error(stale);
   throw new Error('We couldn’t confirm the replacement. Keep the same file selected and try again.');
  }catch(error){
   if(!blocked)c.msg.textContent=[changed,stale,unavailable].includes(error?.message)?error.message:'The replacement could not be verified. Keep the same file selected and try again.';
  }finally{
   busy=false;
   if(!blocked)for(const item of Object.values(cards))if(item.correctable&&!item.form.hidden){item.input.disabled=false;item.save.disabled=false;}
  }
 }
 function showCorrections(docs,wanted){
  for(const type of wanted){
   paths[type]=docs[type+'_document_path']??null;
   const card=elem('section','');card.className='correction-card';
   const title=elem('h3',fields[type]);card.append(title);
   const form=elem('form',''), label=elem('label','Choose replacement'),input=elem('input','');
   input.type='file';input.accept=fileTypes(type);input.required=true;input.id='correction-'+type;label.htmlFor=input.id;
   const save=elem('button','Submit replacement');save.type='submit';
   const msg=elem('p','');msg.className='muted';msg.setAttribute('role','status');
   form.append(label,input,save);card.append(form,msg);list.append(card);
   const correctable=typeof paths[type]==='string'&&paths[type].length>0;
   const c={form,input,save,msg,stage:null,correctable,complete:false};cards[type]=c;
   if(!correctable){
    form.hidden=true;input.disabled=true;save.disabled=true;
    msg.textContent='K&E needs to verify the original document version before it can be replaced here. Contact support@kedelivery.com for help.';
   }
   form.addEventListener('submit',event=>{void replace(type,c,event);});
  }
  correction.hidden=false;setStatus('');
 }
 function ordinaryOnboarding(){
  ordinary.hidden=false;document.documentElement.classList.remove('correction-route-check');setStatus('');
 }
 async function open(){
  if(targeted&&!issue){
   setStatus('We couldn’t identify which document needs attention. Use the link in your original email or contact K&E support.');
   return;
  }
  try{
   const client=await verified({allowMissing:true});guard();
   if(!client){location.replace(targeted?route.signIn(issue):'/driver-application.html');return;}
   const docs=await currentDocs(client);guard();
   await verified();guard();
   const wanted=typeNames.filter(t=>docs[t+'_review_status']==='attention');
   if(wanted.length){showCorrections(docs,wanted);return;}
   if(!targeted){ordinaryOnboarding();return;}
   setStatus('This document doesn’t need a replacement for the account you’re signed in with. No changes were made.');
   const other=elem('a','Verify using the email address you applied with');
   other.href=route.signIn(issue);other.id='correction-account-link';
   status.insertAdjacentElement('afterend',other);
  }catch{
   if(blocked)return;
   if(!targeted){
    try{
     const current=await authClient.auth.getSession();guard();
     if(!current.error&&current.data?.session){ordinaryOnboarding();return;}
    }catch{}
   }
   setStatus(unavailable);
  }
 }
 void open();
})();
