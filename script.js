const launcher=document.getElementById('kateLauncher');
const panel=document.getElementById('katePanel');
const closeBtn=document.getElementById('kateClose');
const body=document.getElementById('kateBody');
const form=document.getElementById('kateForm');
const input=document.getElementById('kateInput');

// Public URL for the secure Supabase Edge Function. D.A.R.T. credentials remain server-side.
const DART_STATUS_API='https://yvppsjgyedqcvfbhrhrm.supabase.co/functions/v1/dart-bdo-lookup';

let kateFlow=null;

function setOpen(open){
  panel.classList.toggle('open',open);
  panel.setAttribute('aria-hidden',String(!open));
  launcher.setAttribute('aria-expanded',String(open));
  if(open)setTimeout(()=>input.focus(),100);
}

launcher.addEventListener('click',()=>setOpen(!panel.classList.contains('open')));
closeBtn.addEventListener('click',()=>setOpen(false));

const replies={
  problem:'I’m here to help with a delivery problem. Please tell me what happened and I’ll help you with the next step.',
  quote:'I can help you request a K&E Delivery service quote. Tell me about the airport, delivery area, expected volume, and service you need.',
  areas:'K&E provides airport luggage and last-mile delivery services. I can help with service-area and partnership questions.',
  drivers:'Interested in driving with K&E? I can help with independent driver opportunity questions.',
  other:'I’m the K&E Delivery Assistant. I can help with delivery questions, attempted deliveries, service information, quotes, delivery areas, and driver opportunities.'
};

function addMessage(text,type='bot'){
  const msg=document.createElement('div');
  msg.className='kate-message '+(type==='user'?'kate-user':'kate-bot');
  msg.textContent=text;
  body.appendChild(msg);
  body.scrollTop=body.scrollHeight;
}

function startDeliveryLookup(mode='status'){
  kateFlow={mode,step:'order',orderNumber:'',lastName:''};
  addMessage(mode==='attempted'
    ? 'I can check whether an attempted delivery was recorded. First, please enter your K&E delivery/order number.'
    : 'I can check your delivery status. First, please enter your K&E delivery/order number.');
  input.placeholder='Enter delivery/order number…';
}

function resetFlow(){
  kateFlow=null;
  input.placeholder='Type a message to KatE…';
}

function friendlyStatus(data){
  const raw=(data.status||'').trim();
  const status=raw.toLowerCase();
  const when=data.lastUpdate?` The latest update was ${data.lastUpdate}.`:'';
  if(status.includes('delivered'))return `Good news! Your K&E delivery has been marked Delivered.${data.deliveredAt?` It was completed ${data.deliveredAt}.`:when}`;
  if(status.includes('attempt'))return `A delivery attempt was recorded.${when}`;
  if(status.includes('out for delivery'))return `Your K&E delivery is currently Out for Delivery.${when}`;
  if(status.includes('assigned to driver')||status==='assigned')return `Your delivery has been assigned to a driver and is being prepared for delivery.${when}`;
  if(status.includes('picked up')||status.includes('pickup'))return `Your baggage has been picked up and is moving through the delivery process.${when}`;
  return `I found your delivery.${raw?` Its current status is ${raw}.`:''}${when}`;
}

async function lookupDelivery(orderNumber,lastName,mode){
  addMessage('One moment while I securely check your K&E delivery…');
  try{
    const response=await fetch(DART_STATUS_API,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({orderNumber,lastName,requestType:mode})
    });
    if(response.status===404){addMessage('I couldn’t find a delivery matching those details. Please check the order number and last name and try again.');resetFlow();return;}
    if(response.status===401||response.status===403){addMessage('I couldn’t verify that delivery with the information provided. Please double-check the order number and last name.');resetFlow();return;}
    if(!response.ok)throw new Error('lookup_failed');
    const data=await response.json();
    addMessage(friendlyStatus(data));
  }catch(e){
    addMessage('I’m having trouble reaching the live delivery system right now. Your information was not displayed. Please try again shortly or contact K&E Delivery for help.');
  }
  resetFlow();
}

async function handleFlowInput(text){
  if(!kateFlow)return false;
  if(kateFlow.step==='order'){
    kateFlow.orderNumber=text.trim();
    kateFlow.step='lastName';
    addMessage('Thank you. Now enter the passenger/customer last name so I can verify the delivery.');
    input.placeholder='Enter last name…';
    return true;
  }
  if(kateFlow.step==='lastName'){
    kateFlow.lastName=text.trim();
    const {orderNumber,lastName,mode}=kateFlow;
    input.placeholder='Type a message to KatE…';
    await lookupDelivery(orderNumber,lastName,mode);
    return true;
  }
  return false;
}

function answerText(text){
  const q=text.toLowerCase();
  if(q.includes('attempt')||q.includes('nobody home')||q.includes('missed delivery')){startDeliveryLookup('attempted');return null;}
  if(q.includes('status')||q.includes('where')||q.includes('track')||q.includes('bag')){startDeliveryLookup('status');return null;}
  if(q.includes('problem')||q.includes('damage')||q.includes('wrong')||q.includes('issue'))return replies.problem;
  if(q.includes('quote')||q.includes('price')||q.includes('cost')||q.includes('rate'))return replies.quote;
  if(q.includes('area')||q.includes('city')||q.includes('serve')||q.includes('service'))return replies.areas;
  if(q.includes('driver')||q.includes('job')||q.includes('work')||q.includes('apply'))return replies.drivers;
  if(/^(hi|hello|hey|hola)\b/.test(q))return 'Hi! I’m KatE. I’m here to help with K&E Delivery. What can I help you with today?';
  return 'I can help with K&E Delivery questions. You can ask me about delivery status, attempted deliveries, delivery problems, quotes, service areas, or driver opportunities.';
}

document.querySelectorAll('#kateOptions button').forEach(btn=>btn.addEventListener('click',()=>{
  const topic=btn.dataset.topic;
  if(topic==='status'||topic==='attempted'){startDeliveryLookup(topic);return;}
  addMessage(replies[topic]);
}));

form.addEventListener('submit',async e=>{
  e.preventDefault();
  const text=input.value.trim();
  if(!text)return;
  addMessage(text,'user');
  input.value='';
  if(await handleFlowInput(text))return;
  const reply=answerText(text);
  if(reply)setTimeout(()=>addMessage(reply),180);
});