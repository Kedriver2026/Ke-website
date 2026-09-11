function kateStatusKind(data){
  const s=String(data?.status||'').trim().toLowerCase();
  if(!s)return 'ready';
  if(/delivered/.test(s))return 'delivered';
  if(/attempt/.test(s))return 'attempted';
  if(/out\s*for\s*delivery|ofd/.test(s))return 'out_for_delivery';
  if(/pick(ed)?\s*up/.test(s))return 'picked_up';
  if(/assign/.test(s)&&!/unassign/.test(s))return 'assigned';
  if(/unassign|unassigned/.test(s))return 'ready';
  return 'other';
}

const baseFriendlyStatus=friendlyStatus;
friendlyStatus=function(data){
  const kind=kateStatusKind(data);
  const when=data?.deliveredAt||data?.lastUpdate||'';
  if(kind==='delivered'){
    return pick([
      `Good news! 🎉 Your baggage has been delivered${when?` on ${when}`:''}.`,
      `Delivery complete! 🙌 Your baggage was delivered${when?` on ${when}`:''}.`
    ]);
  }
  return baseFriendlyStatus(data);
};

const baseLookupDelivery=lookupDelivery;
lookupDelivery=async function(orderNumber,lastName,mode){
  addMessage(pick(['Give me just a moment while I check the live delivery system…','Let me take a quick look at the live delivery system for you…']));
  try{
    const response=await fetch(DART_STATUS_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderNumber,lastName,requestType:mode})});
    if(response.status===404){addMessage('Hmm, I couldn’t find a delivery matching those details. Double-check the order number and last name for me and we can try again.');resetFlow();return}
    if(response.status===401||response.status===403){addMessage('I found the lookup, but those details didn’t verify the delivery. Please double-check the order number and passenger/customer last name.');resetFlow();return}
    if(!response.ok)throw new Error('lookup_failed');
    const data=await response.json();
    kateFlow.lastData=data;
    const kind=kateStatusKind(data);
    addMessage(friendlyStatus(data));
    if(kind==='delivered'){
      kateFlow.step='delivered_followup';
      addMessage('Is everything okay with the delivery, or do you need help because you haven’t received your baggage?');
      input.placeholder='Type a message to KatE…';
      return;
    }
    kateFlow.step='address';
    addMessage('While I have you here, let’s make sure the driver has everything needed for a smooth delivery. 😊 Can you confirm the full delivery address?');
    input.placeholder='Confirm delivery address…';
  }catch(e){
    addMessage('I’m having trouble reaching the live delivery system right now. I don’t want to guess about your bag, so please try me again shortly or contact K&E Delivery for help.');
    resetFlow();
  }
};

const deliveredBaseHandle=handleFlowInput;
handleFlowInput=async function(text){
  if(kateFlow?.step==='delivered_followup'){
    const q=text.toLowerCase();
    if(/didn'?t|did not|haven'?t|have not|not received|not here|missing|can'?t find|cannot find|where is/.test(q)){
      kateFlow.step='delivered_problem';
      addMessage('I’m sorry—you’re right to flag that. D.A.R.T. shows the delivery as completed, so let’s treat this as a delivered-but-not-received issue. I’ll keep the verified order details with us while we work through it.');
      addMessage('First, please check the front door, porch, side entrance, garage area, leasing office/front desk, and anyone else at the address who may have accepted the baggage. Tell me what you find, and I’ll help with the next step.');
      input.placeholder='Tell KatE what you found…';
      return true;
    }
    if(/yes|all good|got it|received|everything.*fine|everything.*good|okay|ok|thanks|thank you/.test(q)){
      addMessage(pick([`Perfect! 😊 Glad your baggage made it safely. Is there anything else I can help you with?`,`Awesome 🙌 Glad everything worked out. Anything else you need from your favorite member of the K&E family? 😂`]));
      resetFlow();
      return true;
    }
    addMessage('I can help. If you received the baggage, just let me know. If you didn’t receive it even though D.A.R.T. shows delivered, tell me that and I’ll switch to the missing-after-delivery flow.');
    return true;
  }
  if(kateFlow?.step==='delivered_problem'){
    addMessage('Thanks for checking. I’m keeping this marked as a delivered-but-not-received problem for the K&E team. Please provide any detail that may help—such as whether you checked nearby doors, leasing/front desk, or if there’s a delivery photo or location note you want us to review.');
    return true;
  }
  return deliveredBaseHandle(text);
};
