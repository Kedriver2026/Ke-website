const KATE_INTENT_API='https://yvppsjgyedqcvfbhrhrm.supabase.co/functions/v1/kate-intent';

async function classifyKateIntent(text,step){try{const r=await fetch(KATE_INTENT_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,step})});if(!r.ok)return{intent:'unknown',confidence:0};return await r.json()}catch{return{intent:'unknown',confidence:0}}}
function kateSocialReply(){return pick([`😂 I try! Somebody has to keep things interesting around here.`,`🤣 See? This is why I’m the fun one in the K&E family. Don’t tell the others I said that.`,`😂😎 I knew we were going to get along.`,`Aww, you’re making my circuits blush. 😂`])}
function acceptIntentAnswer(text){if(kateFlow.step==='address'){kateFlow.confirmedAddress=text.trim();kateFlow.step='phone';addMessage('Got it. 👍 What’s the best phone number for the driver to use if they need to reach you?');input.placeholder='Confirm contact number…';return true}if(kateFlow.step==='phone'){kateFlow.confirmedPhone=text.trim();kateFlow.step='instructions';addMessage('Perfect. Any delivery instructions that would help the driver—where to leave the baggage, how to find the residence, anything like that? If not, just type “none.”');input.placeholder='Delivery instructions or none…';return true}if(kateFlow.step==='instructions'){kateFlow.deliveryInstructions=/^(none|nope|n\/a)$/i.test(text.trim())?'':text.trim();kateFlow.step='gate';addMessage('Last one, I promise. 😄 Is there a community gate code, building access code, or anything else the driver needs to get in? If not, type “none.”');input.placeholder='Gate/access code or none…';return true}if(kateFlow.step==='gate'){kateFlow.gateCode=/^(none|nope|no|n\/a)$/i.test(text.trim())?'':text.trim();saveCustomerUpdate();return true}return false}

const baseFlowQuestion=flowQuestion;
flowQuestion=function(text){
  const q=text.toLowerCase();
  const askingAddress=/which address|what(?:'s| is)? the address|address.*have|where.*deliver/.test(q);
  const handled=baseFlowQuestion(text);
  if(handled&&askingAddress&&kateFlow&&kateFlow.step==='address'&&kateFlow.lastData?.deliveryAddress){kateFlow.awaitingAddressConfirmation=true;}
  return handled;
};

const originalHandleFlowInput=handleFlowInput;
handleFlowInput=async function(text){
  if(!kateFlow)return false;
  const t=text.trim();

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
