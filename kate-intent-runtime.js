const KATE_INTENT_API='https://yvppsjgyedqcvfbhrhrm.supabase.co/functions/v1/kate-intent';

async function classifyKateIntent(text,step){
  try{
    const r=await fetch(KATE_INTENT_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,step})});
    if(!r.ok)return{intent:'unknown',confidence:0};
    return await r.json();
  }catch{return{intent:'unknown',confidence:0}}
}

function kateSocialReply(){
  return pick([
    `😂 I try! Somebody has to keep things interesting around here.`,
    `🤣 See? This is why I’m the fun one in the K&E family. Don’t tell the others I said that.`,
    `😂😎 I knew we were going to get along.`,
    `Aww, you’re making my circuits blush. 😂`
  ]);
}

const originalHandleFlowInput=handleFlowInput;
handleFlowInput=async function(text){
  if(!kateFlow)return false;

  if(flowQuestion(text))return true;

  if(['address','phone','instructions','gate'].includes(kateFlow.step)){
    const result=await classifyKateIntent(text,kateFlow.step);

    if(result.intent==='social'){
      const resume=resumePrompt();
      addMessage(`${kateSocialReply()}${resume?` ${resume}`:''}`);
      return true;
    }

    if(result.intent==='question'){
      addMessage(`Absolutely—ask me anything about this delivery. I’ll answer first, then we can come right back to the confirmation.`);
      return true;
    }

    if(result.intent==='correction'){
      addMessage(`Got it—let’s correct it instead of saving the wrong information. ${resumePrompt()}`);
      return true;
    }

    if(result.intent==='unknown' && Number(result.confidence||0)<0.65){
      addMessage(`I’m not totally sure that was your answer, and I don’t want to save the wrong information. ${resumePrompt()}`);
      return true;
    }
  }

  return originalHandleFlowInput(text);
};
