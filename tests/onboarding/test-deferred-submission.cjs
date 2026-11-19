const fs=require('node:fs'),vm=require('node:vm'),a=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
(async()=>{
const src=read('driver-submit.html'),script=[...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');
let failed=false,invoked=0;const elements={submit:{disabled:false},status:{textContent:''}},location={href:''};
vm.runInNewContext(script,{document:{getElementById:id=>elements[id]},location,supabase:{createClient:()=>({functions:{invoke:async(name,args)=>{a.equal(name,'submit-driver-application');a.equal(args.body.defer_paperwork,true);invoked++;return {error:failed?new Error('incomplete'):null};}}})}});
failed=true;await elements.submit.onclick();a.equal(location.href,'');a.equal(elements.submit.disabled,false);a.match(elements.status.textContent,/Could not confirm/);
failed=false;await elements.submit.onclick();a.equal(location.href,'/driver-application-submitted.html');a.equal(invoked,2);
a.match(read('driver-background-check.html'),/location.href='\/driver-submit.html'/);
a.match(read('driver-onboarding.html'),/href="driver-submit.html"/);a.doesNotMatch(read('driver-onboarding.html'),/href="driver-w9.html"/);
a.match(read('driver-vehicle.html'),/if\(!vehiclePhoto&&!savedVehiclePhoto\)/);a.match(read('driver-personal.html'),/license/);
for(const name of ['driver-w9.html','driver-contract.html'])a.match(read(name),/<form/);
for(const name of ['driver-application.html','driver-onboarding.html','driver-background-check.html','driver-submit.html'])for(const m of read(name).matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
console.log('PASS explicit submit success/failure, deferred marker, next-step navigation, required saved vehicle photo, retained legacy forms and inline syntax.');
})().catch(e=>{console.error(e);process.exitCode=1});
