const fs=require('fs'),vm=require('vm'),assert=require('assert'),{stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync('supabase/functions/dart-pod/index.ts','utf8');let handler;let available='TEST123';let wrongName=false;let photo=true;let imageSize=12000;const seen=[];
const c=vm.createContext({console,Response,URL,URLSearchParams,Uint8Array,btoa,fetch:()=>{throw Error('Unexpected live request')},Deno:{env:{get:()=> 'test'},serve:fn=>handler=fn}});
vm.runInContext(stripTypeScriptTypes(source,{mode:'transform'}),c);
// Search tables can contain prefix collisions. Never verify against a different BDO.
assert.equal(vm.runInContext(`row('<tr><td>TEST1234</td><td>TEST</td></tr>','TEST123')`,c),null);
assert.equal(vm.runInContext(`row('<tr><td>TEST1234</td><td>OTHER</td></tr><tr><td><a>TEST123</a></td><td>TEST</td></tr>','TEST123').lastName`,c),'TEST');

c.mockSearch=async order=>{seen.push(order);return{initial:'',result:'',row:order===available?{lastName:wrongName?'OTHER':'TEST'}:null}};
c.mockImages=()=>photo?'<table><tr><td>AT Attempted Delivery INV</td><td><img src="https://test.s3.us-east-2.amazonaws.com/attempt.png?sig=test"></td></tr><tr><td>ON Delivery on the way</td><td><img src="https://test.s3.amazonaws.com/earlier.jpg?sig=test"></td></tr><tr><td>OD Delivered INV</td><td><img src="https://test.s3.amazonaws.com/proof.jpg?sig=test"></td></tr></table>':'';
c.testSize=()=>imageSize;
vm.runInContext("dartLogin=async()=> 'session';searchOrder=mockSearch;openDetail=async()=> '<p>AT Attempted Delivery INV - No gate code - 123 Staff - Updated by Staff Original BDO information: private</p>';cancelDetail=async()=> '';text=async()=>mockImages();bytes=async()=>({type:'image/jpeg',buf:new Uint8Array(testSize())})",c);
const request=(order,kind='delivered')=>handler(new Request('https://test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderNumber:order,lastName:'Test',kind})}));
(async()=>{
 let r=await request('TEST123'),d=await r.json();assert.equal(r.status,200);assert.equal(d.lookupOrder,'TEST123');assert.equal(d.photoAvailable,true);assert.equal(d.photos.length,1);assert.deepEqual(seen,['TEST123D2','TEST123-D2','TEST123']);
 r=await request('TEST123','delivery_photos');d=await r.json();assert.equal(d.photos.length,3);assert.equal(d.photos[0].eventStatus,'AT Attempted Delivery INV');assert.equal(d.photos[1].eventStatus,'ON Delivery on the way');assert.equal(d.photos[2].eventStatus,'OD Delivered INV');imageSize=9000;r=await request('TEST123','delivery_photos');d=await r.json();assert.equal(d.photoCount,3);imageSize=2600000;r=await request('TEST123','delivery_photos');d=await r.json();assert.equal(d.photoCount,3);assert.ok(d.photos.every(p=>p.imageData));imageSize=12000;
 available='TEST123D2';seen.length=0;r=await request('TEST123');d=await r.json();assert.equal(d.lookupOrder,'TEST123D2');assert.equal(seen.length,1);
 available='TEST123-D2';r=await request('TEST123-D2');d=await r.json();assert.equal(d.lookupOrder,'TEST123-D2');
 available='TEST123';wrongName=true;r=await request('TEST123');assert.equal(r.status,403);wrongName=false;
 photo=false;r=await request('TEST123','attempted');d=await r.json();assert.equal(d.reason,'No gate code');assert.ok(!d.reason.includes('Staff'));assert.ok(!d.reason.includes('private'));r=await request('TEST123');d=await r.json();assert.equal(d.photoAvailable,false);
 available='NO-MATCH';r=await request('TEST123');assert.equal(r.status,404);
 console.log('PASS: original BDO photo fallback, redelivery priority, hyphenated D2, last-name verification, no-photo response, missing order.');
})().catch(e=>{console.error(e);process.exitCode=1});

