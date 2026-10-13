const fs=require('fs'),vm=require('vm'),assert=require('assert'),{stripTypeScriptTypes}=require('node:module');
let handler,status=200;const calls=[];
const context=vm.createContext({console,Response,AbortSignal,Map,Date,Deno:{env:{get:n=>n==='SUPABASE_URL'?'https://test.supabase.co':'test-secret'},serve:f=>handler=f},fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response(JSON.stringify({status:'Delivered'}),{status:url.includes('kate-dart-status')?status:201})}});
vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/kate-customer-update/index.ts','utf8'),{mode:'transform'}),context);
const payload={mode:'delivery_correction',orderNumber:'TEST12345',lastName:'Test',changes:{gate:'NEW123',instructions:'Reception closes at 6'},consent:true};
const send=async p=>{const r=await handler(new Request('https://test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}));return{status:r.status,body:await r.json()}};
(async()=>{
 let r=await send({...payload,consent:false});assert.equal(r.status,400);assert.equal(calls.length,0);
 r=await send({...payload,changes:{status:'Delivered'}});assert.equal(r.status,400);assert.equal(calls.length,0);
 r=await send({...payload,changes:{phone:'Did you send email?'}});assert.equal(r.status,400);assert.equal(calls.length,0);
 status=403;r=await send(payload);assert.equal(r.status,403);assert.equal(calls.length,1);assert.ok(!calls.some(c=>c.url.includes('/rest/')));
 status=200;r=await send(payload);assert.equal(r.status,200);assert.equal(r.body.ok,true);assert.deepEqual(calls.at(-1).body,{order_number:'TEST12345',last_name:'TEST',status:'submitted',gate_code:'NEW123',delivery_instructions:'Reception closes at 6'});assert.ok(!('confirmed_address' in calls.at(-1).body));assert.ok(!('confirmed_phone' in calls.at(-1).body));
 r=await send({...payload,changes:{gate:''}});assert.equal(r.status,200);assert.equal(calls.at(-1).body.gate_code,'');
 r=await send({orderNumber:'TEST12345',lastName:'Test',confirmedAddress:'123 Test Street',confirmedPhone:'+1 512 555 0100',consent:false});assert.equal(r.status,400);
 console.log('PASS: correction consent required, field allowlist, server verification before write, only requested fields saved for review, explicit empty gate supported.');
})().catch(e=>{console.error(e);process.exitCode=1});
