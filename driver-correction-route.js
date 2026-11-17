(() => {
 'use strict';
 const allowed=new Set(['license','insurance','registration']);
 const canonicalOrigin = 'https://keconnectapp.com';
 const onCanonical=()=>location.origin===canonicalOrigin;
 const storageKey='ke-connect-document-correction-intent';
 const ordinary='/driver-onboarding.html', ttl=15*60*1000;
 function requested(search){return onCanonical()&&new URLSearchParams(search).getAll('intent').includes('correction');}
 function parse(search){
  if(!onCanonical())return null;
  const q=new URLSearchParams(search), request=q.getAll('intent'), documents=q.getAll('document');
  return request.length===1&&request[0]==='correction'&&documents.length===1&&allowed.has(documents[0])?documents[0]:null;
 }
 function query(type){return allowed.has(type)?'?intent=correction&document='+type:'';}
 function target(type){return ordinary+query(type);}
 function signIn(type){return '/driver-application.html'+query(type)+'#continueApplication';}
 function clear(){if(!onCanonical())return;try{localStorage.removeItem(storageKey);}catch{}}
 function arm(type){
  if(!onCanonical())return null;
  if(!allowed.has(type)){clear();return null;}
  const value=JSON.stringify({type,expires:Date.now()+ttl});
  try{localStorage.setItem(storageKey,value);return value;}catch{return null;}
 }
 function read(){
  if(!onCanonical())return null;
  try{
   const raw=localStorage.getItem(storageKey), v=JSON.parse(raw);
   const delta=v?.expires-Date.now();
   return allowed.has(v?.type)&&Number.isSafeInteger(v?.expires)&&delta>0&&delta<=ttl?v.type:null;
  }catch{return null;}
 }
 function take(){const type=read();clear();return type;}
 function cancel(marker){if(!onCanonical())return;try{if(marker&&localStorage.getItem(storageKey)===marker)clear();}catch{}}
 async function afterVerify(browser){
  if(!onCanonical())return ordinary;
  // Authorization is a server answer for the exact verified account, not the
  // browser-local desired document. No documents are queried here.
  const issue=take();
  if(!issue)return ordinary;
  try{
   const {data,error}=await browser.auth.getSession(), saved=data?.session;
   if(error||!saved?.access_token||!saved?.user?.id)return ordinary;
   const {data:auth,error:authError}=await browser.auth.getUser(saved.access_token);
   if(authError||auth?.user?.id!==saved.user.id)return ordinary;
   const current=await browser.auth.getSession();
   if(current.error||current.data?.session?.user?.id!==saved.user.id)return ordinary;
   return target(issue);
  }catch{return ordinary;}
 }
 window.keCorrectionRoute=Object.freeze({onCanonical,requested,parse,target,signIn,arm,take,cancel,clear,afterVerify});
})();
