const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const helper=fs.readFileSync('driver-document-upload.js','utf8');
const context=vm.createContext({crypto:require('node:crypto').webcrypto,Map,Error});vm.runInContext(helper,context);
const create=context.createDriverDocumentUploader;
(async()=>{
 let uploads=[],calls=[],failCommit=true,current=null,status='pending';
 const client={storage:{from:()=>({upload:async(path,file,opts)=>{uploads.push({path,file,opts});return{error:null}}})},rpc:async(name,args)=>{calls.push({name,args});if(failCommit)return{error:new Error('temporary failure')};current=args.p_object_path;return{data:{document_path:current,review_status:status},error:null}}};
 const file={name:'license.png',type:'image/png'},expected={license:null},submit=create(client,'user-123',expected);
 await assert.rejects(submit('license',file),/temporary failure/);const staged=uploads[0].path;
 failCommit=false;await submit('license',file);assert.equal(uploads.length,1);assert.equal(calls[0].args.p_object_path,calls[1].args.p_object_path);assert.equal(calls[1].args.p_expected_path,null);assert.equal(expected.license,staged);assert.equal(uploads[0].opts.upsert,false);
 await submit('license',file);assert.equal(calls.length,2,'completed item not resubmitted after later form failure');
 const replacement={name:'new.png',type:'image/png'};await submit('license',replacement);assert.notEqual(current,staged);assert.equal(calls.at(-1).args.p_expected_path,staged);
 await assert.rejects(submit('unsupported',file),/Unsupported/);
 // A committed write whose response was lost retries the same path and accepts
 // the server's already-approved state without issuing an approval/reset write.
 let responseLost=true,remotePath=null;const lostClient={storage:client.storage,rpc:async(name,args)=>{remotePath=args.p_object_path;if(responseLost){responseLost=false;throw Error('response lost')}return{data:{document_path:remotePath,review_status:'approved'}}}};
 const lost=create(lostClient,'user-123',{license:null});const before=uploads.length;await assert.rejects(lost('license',file),/response lost/);const first=remotePath;await lost('license',file);assert.equal(remotePath,first);assert.equal(uploads.length,before+1);
 // Failed optimistic concurrency never advances the expected version or uploads
 // again when retrying the same selection.
 let conflictCalls=[];const conflict=create({storage:client.storage,rpc:async(n,a)=>{conflictCalls.push(a);return{error:new Error('Document changed; reload')}}},'user-123',{insurance:'previous'});const beforeConflict=uploads.length;await assert.rejects(conflict('insurance',file),/reload/);await assert.rejects(conflict('insurance',file),/reload/);assert.equal(uploads.length,beforeConflict+1);assert.equal(conflictCalls[1].p_expected_path,'previous');assert.equal(conflictCalls[0].p_object_path,conflictCalls[1].p_object_path);
 assert.match(context.driverDocumentLabel(null,'approved'),/Legacy record/);assert.match(context.driverDocumentLabel(null,'approved'),/No specific uploaded file/);assert.match(context.driverDocumentLabel('path','approved'),/Current document: approved/);
 for(const page of ['driver-personal.html','driver-vehicle.html']){const html=fs.readFileSync(page,'utf8');assert.ok(html.includes('driver-document-upload.js'));assert.ok(html.includes('_document_path'));assert.ok(!/updates\.[a-z_]*review_status\s*=/.test(html));assert.ok(html.includes('documentUserId!==user.id'));for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);}
 console.log('PASS: staged retry, lost save response, already approved retry, changed-file version, conflicts, legacy labels, page contracts and syntax');
})().catch(e=>{console.error(e);process.exitCode=1});
