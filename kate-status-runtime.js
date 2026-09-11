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
function rememberVerifiedDelivery(orderNumber,lastName,data){
  window.kateVerifiedDelivery={orderNumber,lastName,data,verifiedAt:Date.now()};
}
function restoreVerifiedDelivery(){
  const v=window.kateVerifiedDelivery;
  if(!v?.orderNumber||!v?.lastName)return false;
  kateFlow.orderNumber=v.orderNumber;
  kateFlow.lastName=v.lastName;
  if(v.data)kateFlow.lastData=v.data;
  return true;
}
const baseFriendlyStatus=friendlyStatus;
friendlyStatus=function(data){const kind=kateStatusKind(data),when=data?.deliveredAt||data?.lastUpdate||'';if(kind==='delivered')return pick([`Good news! 🎉 Your baggage has been delivered${when?` on ${when}`:''}.`,`Delivery complete! 🙌 Your baggage was delivered${when?` on ${when}`:''}.`]);if(kind==='attempted')return pick([`I found your delivery. A delivery attempt was made${when?` on ${when}`:''}, but the driver wasn’t able to complete the delivery.`,`I found it. The driver attempted the delivery${when?` on ${when}`:''}, but it could not be completed.`]);return baseFriendlyStatus(data)};
const baseLookupDelivery=lookupDelivery;
lookupDelivery=async function(orderNumber,lastName,mode){addMessage(pick(['Give me just a moment while I check the live delivery system…','Let me take a quick look at the live delivery system for you…']));try{const response=await fetch(DART_STATUS_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderNumber,lastName,requestType:mode})});if(response.status===404){addMessage('Hmm, I couldn’t find a delivery matching those details. Double-check the order number and last name for me and we can try again.');resetFlow();return}if(response.status===401||response.status===403){addMessage('I found the lookup, but those details didn’t verify the delivery. Please double-check the order number and passenger/customer last name.');resetFlow();return}if(!response.ok)throw new Error('lookup_failed');const data=await response.json();kateFlow.lastData=data;rememberVerifiedDelivery(orderNumber,lastName,data);const kind=kateStatusKind(data);addMessage(friendlyStatus(data));if(kind==='delivered'){kateFlow.step='delivered_followup';addMessage('Is everything okay with the delivery, or do you need help because you haven’t received your baggage?');input.placeholder='Type a message to KatE…';return}if(kind==='attempted'){kateFlow.step='attempted_followup';addMessage('Let’s make sure the next attempt has everything the driver needs. I can review the delivery address, contact number, delivery instructions, and any gate or access information with you.');addMessage('Would you like to review and update those details now?');input.placeholder='Yes, or ask KatE about the attempt…';return}kateFlow.step='address';addMessage('While I have you here, let’s make sure the driver has everything needed for a smooth delivery. 😊 Can you confirm the full delivery address?');input.placeholder='Confirm delivery address…'}catch(e){addMessage('I’m having trouble reaching the live delivery system right now. I don’t want to guess about your bag, so please try me again shortly or contact K&E Delivery for help.');resetFlow()}};
const deliveredBaseHandle=handleFlowInput;
handleFlowInput=async function(text){
 if(kateFlow?.step==='delivered_followup'){
  const q=String(text||'').toLowerCase().replace(/[’]/g,"'");
  if(/when.*deliver|what time.*deliver|delivery time|what date.*deliver/.test(q)){const when=kateFlow.lastData?.deliveredAt||kateFlow.lastData?.lastUpdate||'';addMessage(when?`D.A.R.T. shows the completed delivery at ${when}.`:'I can confirm D.A.R.T. shows the order as delivered, but I don’t have a reliable completed-delivery time to give you.');return true}
  if(/attempt|attempted|email.*attempt|first attempt|previous attempt/.test(q)){if(typeof showAttemptEvidence==='function')return await showAttemptEvidence();addMessage('Yes, this delivered order may have an earlier attempted-delivery record. Let me check the original BDO history rather than guessing from the completed D2 order.');return true}
  if(/didn'?t|did not|haven'?t|have not|not received|not here|missing|can'?t find|cannot find|where is/.test(q)){kateFlow.step='delivered_problem';addMessage('I’m sorry—you’re right to flag that. D.A.R.T. shows the delivery as completed, so let’s treat this as a delivered-but-not-received issue. I’ll keep the verified order details with us while we work through it.');addMessage('First, please check the front door, porch, side entrance, garage area, leasing office/front desk, and anyone else at the address who may have accepted the baggage. Tell me what you find, and I’ll help with the next step.');input.placeholder='Tell KatE what you found…';return true}
  if(/^(yes|yes it is|correct|all good|got it|received|everything.*fine|everything.*good|okay|ok|thanks|thank you)\b/.test(q)){addMessage(pick([`Perfect! 😊 Glad your baggage made it safely. Is there anything else I can help you with?`,`Awesome 🙌 Glad everything worked out. Anything else you need from your favorite member of the K&E family? 😂`]));kateFlow.step='delivered_followup';return true}
  addMessage('Ask me anything about this delivery—I can check the completed delivery time, proof-of-delivery photos, or whether there was an earlier delivery attempt.');return true
 }
 if(kateFlow?.step==='delivered_problem'){addMessage('Thanks for checking. I’m keeping this marked as a delivered-but-not-received problem for the K&E team. Please provide any detail that may help—such as whether you checked nearby doors, leasing/front desk, or if there’s a delivery photo or location note you want us to review.');return true}
 if(kateFlow?.step==='attempted_followup'){
  const q=String(text||'').toLowerCase().replace(/[’]/g,"'");
  if(/^(yes|yeah|yep|sure|okay|ok|please|let'?s do it|review|update)\b/.test(q)){kateFlow.step='address';if(kateFlow.lastData?.deliveryAddress){kateFlow.awaitingAddressConfirmation=true;kateFlow.originalAddress=kateFlow.lastData.deliveryAddress;addMessage(`Absolutely. 👍 The delivery address I have is ${kateFlow.lastData.deliveryAddress}. Does that look correct?`)}else addMessage('Absolutely. 👍 First, can you confirm the full delivery address?');input.placeholder='Confirm delivery address…';return true}
  if(/why|reason|what happened|couldn'?t deliver|could not deliver|photo|picture/.test(q)){if(typeof showAttemptEvidence==='function')return await showAttemptEvidence();addMessage('Let me check the D.A.R.T. attempt record so I don’t guess about what happened.');return true}
  if(/when|next attempt|redeliver|re-deliver|try again|delivery again/.test(q)){const next=kateFlow.lastData?.nextAttempt||kateFlow.lastData?.scheduledFor||kateFlow.lastData?.deliverBy||'';addMessage(next?`The next delivery timing I can see is ${next}.`:'I don’t see a confirmed next-attempt time in D.A.R.T. yet, so I don’t want to give you a time that may be wrong.');addMessage('We can review your delivery details now so everything is ready when the next attempt is scheduled.');return true}
  if(/address|phone|number|instruction|gate|access|code/.test(q)){kateFlow.step='address';if(kateFlow.lastData?.deliveryAddress){kateFlow.awaitingAddressConfirmation=true;kateFlow.originalAddress=kateFlow.lastData.deliveryAddress;addMessage(`Let’s review it. The delivery address I have is ${kateFlow.lastData.deliveryAddress}. Does that look correct?`)}else addMessage('Let’s review it. What’s the full delivery address?');input.placeholder='Confirm delivery address…';return true}
  if(/^(no|nope|not now|later)\b/.test(q)){addMessage('No problem. I won’t change anything. If you want to review the delivery details later, just ask me.');kateFlow.step='attempted_followup';return true}
  addMessage('I can help with the attempted delivery. You can ask me why it was attempted, when the next attempt may be, or we can review the address, phone number, delivery instructions, and gate/access information.');return true
 }
 return deliveredBaseHandle(text)
};
