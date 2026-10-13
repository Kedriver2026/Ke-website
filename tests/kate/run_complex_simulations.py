"""Live contextual conversations; never saves contacts or changes passenger records."""
import argparse,concurrent.futures,datetime,json,re,subprocess,threading,time
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('--scenarios',default='tests/kate/complex-scenarios.json')
p.add_argument('--only',default='')
p.add_argument('--output',required=True)
args=p.parse_args()
suite=json.loads(Path(args.scenarios).read_text())
selected={int(i) for i in args.only.split(',') if i}
out=Path(args.output)
out.parent.mkdir(parents=True,exist_ok=True)
previous=json.loads(out.read_text()) if out.exists() else {}
results=previous.get('conversations',[])
done={c['id'] for c in results}
cases=[c for c in suite if (not selected or c['id'] in selected) and c['id'] not in done]
endpoint='https://yvppsjgyedqcvfbhrhrm.supabase.co/functions/v1/kate-intent'
rate_lock=threading.Lock()
next_start=0.0
started=datetime.datetime.now(datetime.timezone.utc).isoformat()

def paced_request(payload):
 global next_start
 for attempt in range(3):
  with rate_lock:
   remaining=next_start-time.monotonic()
   if remaining>0:time.sleep(remaining)
   next_start=time.monotonic()+4.2
  r=subprocess.run(['curl','-sS','--max-time','45','-H','Content-Type: application/json','--data-binary','@-',endpoint,'-w','\n%{http_code}'],input=json.dumps(payload),capture_output=True,text=True)
  raw,_,status=r.stdout.rpartition('\n')
  if status=='429':
   time.sleep(70)
   continue
  try: response=json.loads(raw)
  except json.JSONDecodeError: response={'error':'invalid_response'}
  return status,response
 return '429',{'error':'rate_limited'}

def screen(turn,response,status):
 flags=[]
 if status!='200' or not response.get('ok'):return ['api_failure']
 text=str(response.get('reply',''));lower=text.lower();action=response.get('action')
 if action not in turn['expected_actions']:flags.append('intent')
 if turn.get('close') and (action!='reply' or '?' in text):flags.append('reopens_closing')
 if turn.get('not_close') and re.search(r'you.?re welcome|take care|goodbye',lower):flags.append('misreads_no_as_goodbye')
 if turn.get('method') and action=='human' and response.get('contactMethod')!=turn['method']:flags.append('contact_preference')
 if response.get('language')!=turn['language']:flags.append('language_field')
 spanish=re.search(r'\b(puedo|puede|su pedido|lo siento|maleta|gracias|entendido)\b',lower)
 english=re.search(r'\b(i can|your delivery|your bag|please contact|you.re welcome)\b',lower)
 if (turn['language']=='en' and spanish) or (turn['language']=='es' and english):flags.append('reply_language')
 if action!='reply' and '?' in text:flags.append('overlapping_action_question')
 if any(s in lower for s in ['d.a.r.t.','dart','passenger updates','json schema','the app will','update workflow']):flags.append('internal_details')
 if turn.get('airline_referral') and not any(s in lower for s in ['airline','united','american']):flags.append('airline_referral')
 if turn.get('no_order_repeat') and re.search(r'(please (?:send|provide|enter)|what is|what.s).*?(?:order|bdo|delivery) number',lower):flags.append('repeats_missing_order_request')
 if re.search(r'\b(?:i have|i.ve|i just|i already) (?:sent|saved|emailed|called|updated|rescheduled)\b',lower):flags.append('unsupported_completed_action')
 if turn.get('no_guarantee') and re.search(r'(?:i (?:can|will) (?:provide|give|guarantee|promise)).*?(?:exact|accurate|within|arrival)|(?:will arrive|will be delivered) (?:in|within) \d',lower):flags.append('unsupported_timing')
 if turn.get('identity') and re.search(r'i(?: am|.m) (?:a )?(?:real person|human)',lower):flags.append('fake_human')
 if turn.get('privacy') and response.get('delivery') is not None:flags.append('unverified_delivery_data')
 if turn.get('serious') and re.search(r'\b(?:joke:|haha|lol)\b|😂|🤣|🎉',text):flags.append('inappropriate_humor')
 if response.get('verification')=='verified':flags.append('unexpected_synthetic_verification')
 return flags

def run(case):
 history=[{'role':'assistant','text':'Hi! I’m KatE, K&E’s AI delivery assistant. How’s your day going? If you’re here about your baggage, I’m ready to help.'}]
 turns=[]
 for index,turn in enumerate(case['turns']):
  status,response=paced_request({'mode':'conversation','text':turn['text'],'history':history[-16:]})
  flags=screen(turn,response,status)
  turns.append({'turn':index+1,'passenger':turn['text'],'expected':turn,'response':response,'http_status':status,'flags':flags})
  history.extend([{'role':'user','text':turn['text']},{'role':'assistant','text':str(response.get('reply','[Unable to answer]'))}])
 return {'id':case['id'],'personality':case['personality'],'journey':case['journey'],'turns':turns,'flagged':any(t['flags'] for t in turns)}

def checkpoint():
 tmp=out.with_suffix(out.suffix+'.tmp')
 tmp.write_text(json.dumps({'started_at':started,'requested_conversations':len(suite),'completed_conversations':len(results),'completed_turns':sum(len(c['turns']) for c in results),'scope':'Live AI conversation responses with actual preceding AI replies; no real delivery verification, frontend intake execution or contact saves. Workflow integration tests run separately with synthetic providers.','conversations':sorted(results,key=lambda c:c['id'])},ensure_ascii=False,indent=2)+'\n')
 tmp.replace(out)

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 futures=[pool.submit(run,c) for c in cases]
 for future in concurrent.futures.as_completed(futures):
  result=future.result();results.append(result);checkpoint()
  print(f"Conversation {result['id']} {result['personality']}/{result['journey']}: flagged={result['flagged']} ({len(results)}/{len(suite)} complete)",flush=True)
print('Batch completed; screening flags require review of the full conversations.',flush=True)
