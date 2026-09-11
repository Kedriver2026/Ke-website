const KATE_INTENT_API='https://yvppsjgyedqcvfbhrhrm.supabase.co/functions/v1/kate-intent';

async function classifyKateIntent(text,step){try{const r=await fetch(KATE_INTENT_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,step})});if(!r.ok)return{intent:'unknown',confidence:0};return await r.json()}catch{return{intent:'unknown',confidence:0}}}
function kateSocialReply(){return pick([`😂 I try! Somebody has to keep things interesting around here.`,`🤣 See? This is why I’m the fun one in the K&E family. Don’t tell the others I said that.`,`😂😎 I knew we were going to get along.`,`Aww, you’re making my circuits blush. 😂`])}
function sameText(a,b){return String(a||'').trim().replace(/\s+/g,' ').toLowerCase()===String(b||'').trim().replace(/\s+/g,' ').toLowerCase()}

function buildReviewMessage(){
  const d=kateFlow.lastData||{};
  const lines=[];
  if(kateFlow.confirmedAddress){
    if(d.deliveryAddress&&!sameText(kateFlow.confirmedAddress,d.deliveryAddress)) lines.push(`Address change: ${d.deliveryAddress} → ${kateFlow.confirmedAddress}`);
    else lines.push(`Address confirmed: ${kateFlow.confirmedAddress}`);
  }
  if(kateFlow.confirmedPhone){
    if(d.contactPhone&&!sameText(kateFlow.confirmedPhone,d.contactPhone)) lines.push(`Phone update: ${d.contactPhone} → ${kateFlow.confirmedPhone}`);
    else lines.push(`Phone confirmed: ${kateFlow.confirmedPhone}`);
  }
  if(kateFlow.deliveryInstructions){
    if(d.specialInstructions&&!sameText(kateFlow.deliveryInstructions,d.specialInstructions)) lines.push(`Delivery instructions: ${kateFlow.deliveryInstructions}`);
    else if(!d.specialInstructions) lines.push(`New delivery instructions: ${kateFlow.deliveryInstructions}`);
    else lines.push(`Delivery instructions confirmed: ${kateFlow.deliveryInstructions}`);
  } else lines.push('Delivery instructions: none');
  lines.push(kateFlow.gateCode?`Gate/access code: ${kateFlow.gateCode}`:'Gate/access code: none');
  return `Before I save anything, let me make sure I have this right:\n\n${lines.join('\n')}\n\nIs all of that correct?`;
}

function prepareUpdateReview(){
  kateFlow.step='review';
  kateFlow.reviewReady=true;
  addMessage(buildReviewMessage());
  input.placeholder='Yes, or tell me what to change…';
  return true;
}

function acceptIntentAnswer(text){
  if(kateFlow.step==='address'){
    kateFlow.confirmedAddress=text.trim();
    kateFlow.step='phone';
    addMessage('Got it. 👍 What’s the best phone number for the driver to use if they need to reach you?');
    input.placeholder='Confirm contact number…';
    return true;
  }
  if(kateFlow.step==='phone'){
    kateFlow.confirmedPhone=text.trim();
    kateFlow.step='instructions';
    addMessage('Perfect. Any delivery instructions that would help the driver—where to leave the baggage, how to find the residence, anything like that? If not, just type “none.”');
    input.placeholder='Delivery instructions or none…';
    return true;
  }
  if(kateFlow.step==='instructions'){
    kateFlow.deliveryInstructions=/^(none|nope|n\/a)$/i.test(text.trim())?'':text.trim();
    kateFlow.step='gate';
    addMessage('Last one, I promise. 😄 Is there a community gate code, building access code, or anything else the driver needs to get in? If not, type “none.”');
    input.placeholder='Gate/access code or none…';
    return true;
  }
  if(kateFlow.step==='gate'){
    kateFlow.gateCode=/^(none|nope|no|n\/a)$/i.test(text.trim())?'':text.trim();
    return prepareUpdateReview();
  }
  return false;
}

const baseFlowQuestion=flowQuestion;
flowQuestion=function(text){
  const q=text.toLowerCase();
  const askingAddress=/which address|what(?:'s| is)? the address|address.*have|where.*deliver/.test(q);
  const handled=baseFlowQuestion(text);
  if(handled&&askingAddress&&kateFlow&&kateFlow.step==='address'&&kateFlow.lastData?.deliveryAddress){
    kateFlow.awaitingAddressConfirmation=true;
    kateFlow.originalAddress=kateFlow.lastData.deliveryAddress;
  }
  return handled;
};

const originalHandleFlowInput=handleFlowInput;
handleFlowInput=async function(text){
  if(!kateFlow)return false;
  const t=text.trim();

  if(kateFlow.step==='review'){
    if(/^(yes|yes correct|yes that's correct|yes that is correct|correct|that's correct|that is correct|looks good|confirm|confirmed|yep|yeah)\.?$/i.test(t)){
      kateFlow.reviewReady=false;
      addMessage('Perfect 👍 You confirmed the changes. I’m saving them for the K&E team now.');
      await saveCustomerUpdate();
      return true;
    }
    if(/^(no|nope|not correct|something is wrong|change it)\.?$/i.test(t)){
      kateFlow.step='review_edit';
      addMessage('No problem. Tell me what you want to change: address, phone number, delivery instructions, or gate/access code.');
      input.placeholder='What do you want to change?';
      return true;
    }
    addMessage('I want to make sure nothing gets changed by mistake. Please say “yes” if everything is correct, or tell me which item you want to change.');
    return true;
  }

  if(kateFlow.step==='review_edit'){
    const q=t.toLowerCase();
    if(q.includes('address')){kateFlow.step='address';kateFlow.awaitingAddressConfirmation=false;addMessage('Got it. What’s the correct full delivery address?');input.placeholder='Enter correct delivery address…';return true}
    if(q.includes('phone')||q.includes('number')){kateFlow.step='phone';addMessage('Got it. What’s the best phone number for the driver?');input.placeholder='Enter phone number…';return true}
    if(q.includes('instruction')){kateFlow.step='instructions';addMessage('Got it. What delivery instructions should I use?');input.placeholder='Enter delivery instructions…';return true}
    if(q.includes('gate')||q.includes('access')||q.includes('code')){kateFlow.step='gate';addMessage('Got it. What’s the gate or access code? If there isn’t one, say “none.”');input.placeholder='Enter gate/access code…';return true}
    addMessage('Tell me which one you want to change: address, phone number, delivery instructions, or gate/access code.');
    return true;
  }

  if(kateFlow.awaitingAddressConfirmation&&kateFlow.step==='address'){
    if(/^(yes|yes it is|yes that's correct|yes that is correct|correct|that's correct|that is correct|i confirm|i confirm it is correct|looks good|yep|yeah)\.?$/i.test(t)){
      kateFlow.confirmedAddress=kateFlow.lastData?.deliveryAddress||'';
      kateFlow.awaitingAddressConfirmation=false;
      kateFlow.step='phone';
      addMessage('Perfect 👍 I’ve confirmed the address we already have on file. What’s the best phone number for the driver to use if they need to reach you?');
      input.placeholder='Confirm contact number…';
      return true;
    }
    if(/^(no|nope|no it isn't|no it is not|incorrect|that's wrong|that is wrong)\.?$/i.test(t)){
      kateFlow.awaitingAddressConfirmation=false;
      addMessage('Got it. What’s the correct full delivery address?');
      input.placeholder='Enter correct delivery address…';
      return true;
    }
  }

  if(flowQuestion(text))return true;
  if(['address','phone','instructions','gate'].includes(kateFlow.step)){
    const result=await classifyKateIntent(text,kateFlow.step);
    if(result.intent==='social'){const resume=resumePrompt();addMessage(`${kateSocialReply()}${resume?` ${resume}`:''}`);return true}
    if(result.intent==='needs_value'&&kateFlow.step==='gate'){addMessage('Got it 👍 What’s the gate or access code?');input.placeholder='Enter gate/access code…';return true}
    if(result.intent==='question'){addMessage(`Absolutely—ask me anything about this delivery. I’ll answer first, then we can come right back to the confirmation.`);return true}
    if(result.intent==='correction'){addMessage(`Got it—let’s correct it instead of saving the wrong information. ${resumePrompt()}`);return true}
    if(result.intent==='answer')return acceptIntentAnswer(text);
    if(result.intent==='unknown'&&Number(result.confidence||0)<0.65){addMessage(`I’m not totally sure that was your answer, and I don’t want to save the wrong information. ${resumePrompt()}`);return true}
  }
  return originalHandleFlowInput(text);
};
