const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
function reply(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
const contactLimits=new Map<string,{start:number,count:number}>();
async function saveContactRequest(p:any,req:Request){
 const fullName=String(p.fullName||'').trim().slice(0,100),method=p.method==='phone'?'phone':'email',email=String(p.email||'').trim().toLowerCase().slice(0,254),phone=String(p.phone||'').trim().slice(0,40),reason=String(p.reason||'').trim().slice(0,1000),order=String(p.orderNumber||'').trim().toUpperCase(),last=String(p.lastName||'').trim().toUpperCase(),reference=String(p.reference||'');
 if(p.consent!==true||fullName.length<2||!reason||!/^[a-f0-9-]{36}$/i.test(reference)||(method==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||(method==='phone'&&!/^[+()\d\s.-]{7,40}$/.test(phone))||(order&&!/^[A-Z0-9]{6,30}$/.test(order)))return reply({error:'invalid_contact_request'},400);
 const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown',now=Date.now();for(const [key,val] of contactLimits)if(now-val.start>60000)contactLimits.delete(key);const rate=contactLimits.get(ip)||{start:now,count:0};if(++rate.count>5)return reply({error:'too_many_requests'},429);contactLimits.set(ip,rate);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return reply({error:'service_unavailable'},503);
 let verified=false;if(order&&last){const check=await fetch(`${url}/functions/v1/kate-dart-status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderNumber:order,lastName:last,requestType:'status'}),signal:AbortSignal.timeout(15000)});verified=check.ok}
 const transcript=Array.isArray(p.history)?p.history.slice(-24).filter((m:any)=>m&&['user','assistant'].includes(m.role)).map((m:any)=>`${m.role==='user'?'Passenger':'KatE'}: ${String(m.text||'').slice(0,600)}`).join('\n'):'';
 const instructions=[`KATE FOLLOW-UP REQUEST · ${method==='email'?'EMAIL (preferred)':'CALLBACK'}`,`Reference: ${reference}`,`Passenger name: ${fullName}`,method==='email'?`Reply-to email: ${email}`:`Callback phone: ${phone}`,`BDO verification: ${verified?'Verified in D.A.R.T.':'Passenger-provided / not verified'}`,`Reason: ${reason}`,'Passenger consent: confirmed to save this request and chat for K&E follow-up.','Status: awaiting K&E follow-up; no email or call has been sent.','', 'CHAT RECORD',transcript].join('\n');
 const headers={'apikey':key,'Authorization':`Bearer ${key}`,'Content-Type':'application/json'};
 const existing=await fetch(`${url}/rest/v1/kate_customer_delivery_updates?select=id&delivery_instructions=like.${encodeURIComponent(`*Reference: ${reference}*`)}&limit=1`,{headers});if(!existing.ok)throw new Error('contact_lookup_failed');const found=await existing.json();if(found[0])return reply({ok:true,reference,requestId:found[0].id});
 const response=await fetch(`${url}/rest/v1/kate_customer_delivery_updates`,{method:'POST',headers:{...headers,'Prefer':'return=representation'},body:JSON.stringify({order_number:order||'BDO NOT PROVIDED',last_name:fullName,confirmed_address:null,confirmed_phone:method==='phone'?phone:null,delivery_instructions:instructions,gate_code:null,status:'submitted'})});if(!response.ok)throw new Error(`contact_save_failed_${response.status}`);const saved=await response.json();return reply({ok:true,reference,requestId:saved[0]?.id});
}
async function saveDeliveryCorrection(p:any){
 const orderNumber=String(p.orderNumber||'').trim().toUpperCase(),lastName=String(p.lastName||'').trim().toUpperCase();
 const columns:Record<string,string>={address:'confirmed_address',phone:'confirmed_phone',instructions:'delivery_instructions',gate:'gate_code'};
 const entries=Object.entries(p.changes||{});
 if(p.consent!==true||!/^[A-Z0-9]{6,30}$/.test(orderNumber)||!/^[A-Z' -]{2,60}$/.test(lastName)||!entries.length||entries.some(([field,value])=>!columns[field]||typeof value!=='string'||value.length>500||(['address','phone'].includes(field)&&!value.trim())))return reply({error:'invalid_correction'},400);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return reply({error:'service_unavailable'},503);
 const check=await fetch(`${url}/functions/v1/kate-dart-status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderNumber,lastName,requestType:'status'}),signal:AbortSignal.timeout(15000)});
 if(!check.ok)return reply({error:'verification_required'},[401,403,404].includes(check.status)?403:503);
 // A submitted request for staff review, not a claim that the delivery record changed.
 const record:any={order_number:orderNumber,last_name:lastName,status:'submitted'};
 for(const [field,value] of entries)record[columns[field]]=String(value).trim();
 const r=await fetch(`${url}/rest/v1/kate_customer_delivery_updates`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(record)});
 if(!r.ok)throw new Error('correction_save_failed');return reply({ok:true});
}
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
 try{
  const p=await req.json();
  if(p?.mode==='contact_request')return await saveContactRequest(p,req);
  if(p?.mode==='delivery_correction')return await saveDeliveryCorrection(p);
  const orderNumber=String(p?.orderNumber||'').trim().toUpperCase();
  const lastName=String(p?.lastName||'').trim().toUpperCase();
  const confirmedAddress=String(p?.confirmedAddress||'').trim().slice(0,300);
  const confirmedPhone=String(p?.confirmedPhone||'').trim().slice(0,50);
  const deliveryInstructions=String(p?.deliveryInstructions||'').trim().slice(0,500);
  const gateCode=String(p?.gateCode||'').trim().slice(0,100);
  if(!/^[A-Z0-9]{6,30}$/.test(orderNumber)||!/^[A-Z' -]{2,60}$/.test(lastName)||!confirmedAddress||!confirmedPhone)return reply({error:'invalid_request'},400);
  return await saveDeliveryCorrection({orderNumber,lastName,consent:p.consent,changes:{address:confirmedAddress,phone:confirmedPhone,instructions:deliveryInstructions,gate:gateCode}});
 }catch(e){console.error('kate-customer-update error',e);return reply({error:'service_unavailable'},502)}
});
