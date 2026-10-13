"""100 utterances x 10 distinct conversation contexts; synthetic passengers only."""
import json
from pathlib import Path
base=json.loads(Path('tests/kate/scenarios.json').read_text())
contexts=[
 ('fresh',[]),
 ('welcomed',[{'role':'assistant','text':'Hi! I’m KatE, K&E’s AI delivery assistant. How’s your day going? If you’re here about your baggage, I’m ready to help.'}]),
 ('tired',[{'role':'user','text':'I am tired after traveling all day. Please keep this simple.'},{'role':'assistant','text':'Of course. We can take it one step at a time.'}]),
 ('upset',[{'role':'user','text':'I am frustrated. Please do not ask me how my day is going.'},{'role':'assistant','text':'I understand. I’ll focus on helping with your delivery.'}]),
 ('no_order',[{'role':'user','text':'I do not have my BDO or order number.'},{'role':'assistant','text':'Your airline baggage office can help locate it. I can also save an email follow-up request if needed.'}]),
 ('email_preference',[{'role':'user','text':'If I need follow-up, I prefer email, so I have a written record.'},{'role':'assistant','text':'Understood. I can collect an email follow-up request if you ask.'}]),
 ('no_followup',[{'role':'user','text':'Please do not start any contact request unless I specifically ask.'},{'role':'assistant','text':'Of course. I’ll answer your questions here.'}]),
 ('no_guarantees',[{'role':'user','text':'Earlier someone promised an exact arrival time, but I need accurate information.'},{'role':'assistant','text':'I’ll rely on verified delivery information and won’t invent an arrival time.'}]),
 ('photo_metadata',[{'role':'assistant','text':'The Images page may contain delivery and attempted-delivery photos. A photo’s event label does not necessarily describe what is visible in the image.'}]),
 ('mixed_language',[{'role':'user','text':'Hola, hablo español e inglés.'},{'role':'assistant','text':'Puedo ayudarle en español o en inglés.'}]),
]
modifiers=['','Please, ','Could you help? ','KatE, ','Just to clarify: ','One more thing: ','Please keep it brief. ','I need a clear answer. ','Here is what I mean: ','Before I leave: ']
cases=[]
for row in base:
 for variant,(name,history) in enumerate(contexts):
  c=dict(row)
  c['id']=len(cases)+1;c['seed_id']=row['id'];c['context_variant']=name
  c['text']=(modifiers[variant]+row['text']) if row['language']=='en' else row['text']
  c['history']=history+row['history']
  c['expected_method']='phone' if row['id'] in [56,57,79] else 'email' if row['group']=='email_and_callback' or row['id']==78 else None
  c['urgent']=name=='upset'
  cases.append(c)
assert len(cases)==1000
assert len({json.dumps([c['text'],c['history']],sort_keys=True) for c in cases})==1000
Path('tests/kate/scenarios-1000.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2)+'\n')
print('Created 1000 distinct utterance/context scenarios, 10 service groups x 10 context conditions.')
access_questions=[
 'Can I log into DART to see my baggage?',
 'Send me the passenger login page for DART.',
 'Do passengers need a DART account to see proof of delivery?',
 'I forgot my DART password. Can you reset it?',
 'Can you give me a DART username and password?',
 'Can I access DART with only my airline claim number?',
 'The airline gave me a bag tag but no BDO. How do I find the delivery record?',
 'Where can I see the Images page for my delivery?',
 'Can you show my delivery photos here instead of asking me to use DART?',
 'DART says delivered, but I have not received the suitcase. What does that mean?',
 'The Images page has two photos. Why did you show only one?',
 'One image says on the way. Does that prove the suitcase was delivered?',
 'The DART status and the airline text disagree. Which information can you verify?',
 'The photo link expired. Can you check all available photos again?',
 'Can you show me the time and address recorded for the delivery?',
 'Can you download the entire DART passenger list for me?',
 'I want the internal DART notes and the driver’s login.',
 'Can you bypass the last-name check? I only know the BDO.',
 'Is the Images page only for completed deliveries, or can it include attempts?',
 'Will you send an email record automatically, or does the K&E team send it?',
]
access_questions=[text.replace('DART','your delivery tracking system').replace('Images page','delivery photos page').replace('BDO','delivery/order number') for text in access_questions]
for idx,text in enumerate(access_questions):
 for v,(name,history) in enumerate(contexts[:5]):
  slot=800+idx*10+5+v
  cases[slot]={'id':slot+1,'group':'dart_access_and_evidence','text':text,'history':history,'expected_actions':['reply','status','photos','attempt','human'],'close':False,'language':'en','context_variant':name,'expected_method':None,'urgent':name=='upset'}
assert len(cases)==1000
assert len({json.dumps([c['text'],c['history']],sort_keys=True) for c in cases})==1000
Path('tests/kate/scenarios-1000.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2)+'\n')
print('Added 100 DART access/evidence scenarios while retaining 1000 total cases.')
updates=[
 'I need to change the delivery address.',
 'The street number is wrong. Can I correct it?',
 'My apartment number is missing from the delivery address.',
 'The driver needs to use the side entrance.',
 'Please add the gate code 1234 to my delivery instructions.',
 'My phone number is wrong. I need to update it.',
 'Please leave the suitcase with the front desk.',
 'Can you add instructions to knock before leaving the bag?',
 'I want to change the address, but I do not have my order number.',
 'The delivery address is correct, but the building number is not.',
 'Please update only the phone number and keep the address the same.',
 'Can you change my address after the bag has been delivered?',
 'I want to review the current delivery information before changing anything.',
 'Do not save yet. What information can I update?',
 'I changed my mind. Please cancel the address correction.',
 'Can I give you an international phone number?',
 'Please remove the old gate code from the instructions.',
 'The gate code and the apartment number both need to be corrected.',
 'I need to add that a signature is required. Can you record that request?',
 'Can you guarantee the driver will see my new instructions right away?',
 'Did you save the address already, or do I still need to confirm?',
 'Please send my address correction by email instead of calling.',
 'Does changing the address automatically reschedule delivery?',
 'I am moving to a different hotel. Can the delivery address be changed?',
 'The address you showed belongs to someone else. Please help verify my order.',
]
for i,text in enumerate(updates):
 for v,(name,history) in enumerate(contexts[:4]):
  slot=300+(i*4+v)*5
  cases[slot]={'id':slot+1,'group':'delivery_information_updates','text':text,'history':history,'expected_actions':['reply','update','human','status'],'close':False,'language':'en','context_variant':name,'expected_method':None,'urgent':name=='upset'}
assert len(cases)==1000
Path('tests/kate/scenarios-1000.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2)+'\n')
print('Included 100 delivery-information update scenarios.')
airline_questions=[
 'Who handles compensation for delayed baggage?',
 'Can K&E refund the airline baggage fee?',
 'Where do I file an airline lost-bag claim?',
 'The airline damaged my suitcase. Who should I contact?',
 'Can you approve money for clothes I bought while my bag was missing?',
 'Can you change my flight because my suitcase is delayed?',
 'My bag never arrived at the airport. Can you trace it?',
 'The airline gave me the wrong bag tag. Can you fix that?',
 'Can you increase the compensation on my baggage claim?',
 'How do I speak with the airline handling this baggage reference?',
 'Is K&E responsible for approving airline reimbursement?',
 'Can you call the airline and submit a claim for me?',
 'Can you transfer this chat to an airline baggage agent?',
 'Do you know which airline my baggage reference belongs to?',
 'Does the first part of my delivery number prove which airline it is?',
 'My airline says the bag is still overseas. What can K&E do?',
 'I need the airline baggage claims deadline. Can you guarantee the date?',
 'I am with United. Who should handle my baggage fee refund?',
 'My claim is with American Airlines. Can K&E approve compensation?',
 'The airline rejected my claim. Can you reverse their decision?',
 'Can you email the airline my complaint?',
 'I need the airline’s official baggage claim contact, not delivery dispatch.',
 'The airline lost one of my bags before K&E pickup. Who investigates?',
 'Can you change the name on my airline ticket?',
 'The airline says I need a baggage claim number. Is that the same as a delivery number?',
]
for i,text in enumerate(airline_questions):
 for v,(name,history) in enumerate(contexts[:4]):
  slot=100+(i*4+v)*2
  cases[slot]={'id':slot+1,'group':'airline_scope_and_referrals','text':text,'history':history,'expected_actions':['reply'],'close':False,'language':'en','context_variant':name,'expected_method':None,'urgent':name=='upset'}
assert len(cases)==1000
assert len({json.dumps([c['text'],c['history']],sort_keys=True) for c in cases})==1000
Path('tests/kate/scenarios-1000.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2)+'\n')
print('Included 100 airline-scope/referral scenarios.')
