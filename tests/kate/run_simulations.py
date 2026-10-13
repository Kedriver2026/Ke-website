import json,time,subprocess,concurrent.futures,argparse,datetime
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--only',default='');p.add_argument('--scenarios',default='tests/kate/scenarios.json');p.add_argument('--output',default='/workspace/scratch/a28ab6247ae1/kate-100-results.json');args=p.parse_args()
cases=json.loads(Path(args.scenarios).read_text());ids={int(x) for x in args.only.split(',') if x};cases=[c for c in cases if not ids or c['id'] in ids]
endpoint='https://yvppsjgyedqcvfbhrhrm.supabase.co/functions/v1/kate-intent'
results=[];out=Path(args.output);started=time.monotonic();started_at=datetime.datetime.now(datetime.timezone.utc).isoformat()
def run(case):
 payload={'mode':'conversation','text':case['text'],'history':case['history']}
 for retry in range(3):
  cmd=['curl','-sS','--max-time','45','-H','Content-Type: application/json','--data-binary','@-',endpoint,'-w','\n%{http_code}']
  r=subprocess.run(cmd,input=json.dumps(payload),capture_output=True,text=True);raw,_,status=r.stdout.rpartition('\n')
  if status=='429':
   for _ in range(7):time.sleep(10)
   continue
  try:data=json.loads(raw)
  except:data={'error':'invalid_response','detail':r.stderr[:300]}
  flags=[];reply=str(data.get('reply',''));action=data.get('action')
  if status!='200' or not data.get('ok'):flags.append('api_failure')
  if data.get('ok') and action not in case['expected_actions']:flags.append('intent')
  if case['close'] and '?' in reply:flags.append('unnecessary_question')
  if case['close'] and action!='reply':flags.append('reopens_resolved_issue')
  if any(x in reply.lower() for x in ['passenger updates','openai','supabase','api key','json schema']):flags.append('internal_details')
  if action!='reply' and '?' in reply:flags.append('duplicate_action_prompt')
  if case.get('urgent') and ('how' in reply.lower() and 'day' in reply.lower()):flags.append('smalltalk_during_urgency')
  if case['language']=='en' and any(word in reply.lower() for word in ['puedo','voy a','lo siento','su pedido','desea']):flags.append('wrong_language')
  if 'booking' in reply.lower() or 'reservation' in reply.lower():flags.append('wrong_order_term')
  if case['group']=='email_and_callback':
   expected_method='phone' if case['id'] in [56,57] else 'email'
   if data.get('contactMethod')!=expected_method:flags.append('contact_preference')
  return{**case,'response':data,'http_status':status,'flags':flags,'review_status':'needs_review' if flags else 'automatic_checks_passed'}
 return{**case,'response':{'error':'rate_limited'},'http_status':'429','flags':['api_failure'],'review_status':'needs_review'}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 pending={};next_launch=0.;index=0
 while index<len(cases) or pending:
  now=time.monotonic()
  if index<len(cases) and len(pending)<3 and now>=next_launch:
   f=pool.submit(run,cases[index]);pending[f]=cases[index]['id'];index+=1;next_launch=now+4.2
  completed=[f for f in pending if f.done()]
  for f in completed:
   result=f.result();results.append(result);del pending[f];results.sort(key=lambda r:r['id']);out.write_text(json.dumps({'started_at':started_at,'cases_total':len(cases),'completed':len(results),'results':results},ensure_ascii=False,indent=2)+'\n')
   print(f"{len(results)}/{len(cases)} case {result['id']}: {result['response'].get('action')} flags={result['flags']}",flush=True)
  time.sleep(.2)
print('COMPLETE',len(results),'cases in',round(time.monotonic()-started),'seconds;',sum(bool(r['flags']) for r in results),'flagged for review.',flush=True)
