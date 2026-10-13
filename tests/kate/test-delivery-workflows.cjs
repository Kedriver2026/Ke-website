const fs=require('fs'),vm=require('vm'),assert=require('assert');
const elements={};const messages=[];let reply={status:'Assigned'};let responseStatus=200;let failed=false;const requests=[];
function element(){return{value:'',placeholder:'',classList:{toggle(){},contains(){return false}},setAttribute(){},addEventListener(){},appendChild(m){messages.push(m.textContent)},focus(){}}}
const context=vm.createContext({console,AbortSignal,setTimeout:f=>f(),window:{},document:{getElementById:id=>elements[id]??=element(),querySelectorAll:()=>[],createElement:element},fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});if(failed)throw Error('offline');return{ok:responseStatus===200,status:responseStatus,json:async()=>reply}}});
for(const file of ['script.js','kate-intent-runtime.js','kate-status-runtime.js','kate-pod-runtime.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const run=code=>vm.runInContext(code,context);
(async()=>{
 run("kateFlow={mode:'status',step:'review',orderNumber:'TEST-BDO',lastName:'Test',lastData:{status:'Assigned'},confirmedAddress:'Test address'};rememberVerifiedDelivery(kateFlow.orderNumber,kateFlow.lastName,kateFlow.lastData)");
 await run('saveCustomerUpdate()');assert.equal(run('kateFlow'),null);
 assert.equal(await run("handleFlowInput(\"No,thats it,thank you!\")"),false);assert.ok(run('answerText("No,thats it,thank you!")'));
 assert.equal(run('kateFlow.step'),'verified_followup');
 await run('handleFlowInput("Oh,when is my delivery going to be delivered?")');assert.ok(messages.at(-1).includes('don’t see a confirmed'));assert.equal(requests.at(-1).body.requestType,'status');
 reply={status:'Delivered',deliveredAt:'8:20 PM',deliveryAddress:'123 Test Street'};const before=requests.length;await run('handleFlowInput("Where is my bag?")');assert.equal(requests.length,before+1);assert.ok(requests.at(-1).url.includes('kate-dart-status'));assert.ok(messages.some(m=>m?.includes('123 Test Street')));assert.ok(messages.at(-1).includes('investigate'));assert.equal(run('isPodQuestion("Show me the delivery photo")'),true);assert.equal(run('isPodQuestion("Where was it delivered?")'),true);
 run('window.testImages=[];addKateImage=(src)=>window.testImages.push(src)');reply={photoAvailable:true,imageRecordCount:3,photos:[{available:true,eventStatus:'ON Delivery on the way',imageData:'data:image/jpeg;base64,first'},{available:true,eventStatus:'OD Delivered INV',imageData:'data:image/jpeg;base64,second'},{available:true,eventStatus:'AT Attempted Delivery INV',imageData:'data:image/jpeg;base64,third'}]};await run('handleFlowInput("Show me proof of delivery")');assert.equal(run('window.testImages.length'),3);await run('handleFlowInput("Do you have another picture?")');assert.equal(run('window.testImages.length'),6);assert.equal(requests.at(-1).body.kind,'delivery_photos');assert.ok(messages.some(m=>m?.includes('Attempted delivery')));await run('handleFlowInput("Show proof of delivery again")');assert.equal(run('window.testImages.length'),9);console.log('PASS: every POD request shows all three event photos, including repeated requests.');
 responseStatus=404;await run('handleFlowInput("Show me the photo")');assert.ok(messages.at(-1).includes('investigate'));assert.ok(messages.at(-3).includes('8:20 PM'));responseStatus=200;
 reply={status:'Out for delivery',scheduledFor:'today at 9 pm'};await run('handleFlowInput("What time will my bags arrive?")');assert.ok(messages.at(-1).includes('9 pm'));
 reply={status:'Delivered',deliveredAt:'today at 8 pm'};await run('handleFlowInput("When was my delivery delivered?")');assert.ok(messages.at(-1).includes('8 pm'));
 reply={status:'Attempted',nextAttempt:'tomorrow at noon'};await run('handleFlowInput("When is the next delivery attempt?")');assert.ok(messages.at(-1).includes('noon'));
 failed=true;await run('handleFlowInput("When will my bag arrive?")');assert.ok(messages.at(-1).includes('trouble'));failed=false;
 run('startDeliveryLookup("status")');await run('handleFlowInput("NEW-BDO")');assert.equal(run('kateFlow.orderNumber'),'NEW-BDO');assert.equal(run('kateFlow.lastName'),'');
 run('resetFlow()');responseStatus=403;await run('handleFlowInput("When will my bag arrive?")');assert.equal(run('window.kateVerifiedDelivery'),null);assert.equal(run('kateFlow.step'),'order');
 run('resetFlow()');assert.equal(await run('handleFlowInput("Thanks")'),false);
 console.log('PASS: save → thank-you → timing; live schedule; delivered; attempted; offline; new-order isolation; failed re-verification; unverified chat.');
})().catch(e=>{console.error(e);process.exitCode=1});
