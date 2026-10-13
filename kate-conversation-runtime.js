// Session-only conversation memory; delivery facts are reverified by the server.
const kateConversationHistory=[{role:'assistant',text:KATE_WELCOME}];
const conversationAddMessage=addMessage;
addMessage=function(text,type='bot'){
 conversationAddMessage(text,type);
 kateConversationHistory.push({role:type==='user'?'user':'assistant',text:String(text).slice(0,1200)});
 if(kateConversationHistory.length>24)kateConversationHistory.splice(0,kateConversationHistory.length-24);
};
const conversationAddImage=addKateImage;
addKateImage=function(src,alt){conversationAddImage(src,alt);kateConversationHistory.push({role:'assistant',text:`[Photo displayed: ${alt||'delivery photo'}]`});if(kateConversationHistory.length>24)kateConversationHistory.shift()};
function needsConversationalAnswer(text){
 const step=kateFlow?.step||'';
 if(['order','lastName','review','review_edit'].includes(step))return false;
 if(['address','phone','instructions','gate'].includes(step))return /\?|^(what|which|where|when|why|how|who|can you|could you|do you|does|did|are you|is it|will you)\b|\b(worried|upset|frustrated|angry|scared|disappointed|thank|thanks|funny|joke|hello|hi)\b/i.test(text);
 return true;
}
function beginConversationCorrection(field){
 if(!['address','phone','instructions','gate'].includes(field)){kateFlow.step='review_edit';addMessage('Which detail would you like to change: the address, phone number, delivery instructions, or gate/access code?');input.placeholder='Which detail would you like to change?';return}
 const target=field;
 kateFlow.step=target;kateFlow.reviewReady=false;kateFlow.awaitingAddressConfirmation=false;
 const prompts={address:'What is the correct full delivery address, including any apartment or unit number?',phone:'What is the best phone number for the driver, including the country code?',instructions:'What delivery instructions would you like the K&E team to have?',gate:'What gate or access code should the driver use? If there isn’t one, say “none.”'};
 addMessage(prompts[target]);input.placeholder='Enter delivery information…';
}
let kateContactFlow=null;
const kateContactTranslations={"I can save an email follow-up request for the K&E team. Email keeps a record of the conversation. What’s your full name?": "Puedo guardar una solicitud para que el equipo de K&E le responda por correo y quede un registro de la conversación. ¿Cuál es su nombre completo?", "I can save a callback request for the K&E team. What’s your full name?": "Puedo guardar una solicitud para que el equipo de K&E le llame. ¿Cuál es su nombre completo?", "What email address should K&E reply to?": "¿A qué correo electrónico debe responder K&E?", "What phone number should K&E call, including the country code?": "¿A qué número debe llamar K&E, incluyendo el código de país?", "What would you like the K&E team to help you with?": "¿Con qué necesita ayuda del equipo de K&E?", "Do you have a BDO/order number for this request? If not, say “none.”": "¿Tiene un número de BDO/pedido para esta solicitud? Si no, escriba “ninguno”.", "Okay, I haven’t saved a follow-up request. I’m still here if you need help.": "De acuerdo, no he guardado ninguna solicitud de seguimiento. Estoy aquí si necesita ayuda.", "Email lets you and K&E keep a record of your correspondence. I’ll save your contact details, concern and this chat only after you confirm. The K&E team can then follow up; I haven’t sent an email or placed a call.": "El correo permite mantener un registro de la comunicación. Guardaré sus datos, su consulta y este chat solo después de su confirmación. El equipo de K&E podrá darle seguimiento; todavía no se ha enviado un correo ni realizado una llamada.", "Of course. What email address should K&E use?": "Claro. ¿Qué correo electrónico debe usar K&E?", "Of course. What phone number should K&E use, including the country code?": "Claro. ¿Qué número debe usar K&E, incluyendo el código de país?", "Please enter your full name so K&E knows who to contact.": "Por favor, escriba su nombre completo para que K&E sepa a quién contactar.", "That email address doesn’t look complete. Please check it and send it again.": "Ese correo no parece completo. Por favor, revíselo y envíelo nuevamente.", "Please send the best callback number, including the country code.": "Por favor, envíe el mejor número para devolverle la llamada, incluyendo el código de país.", "Please send the BDO/order number, or say “none” if you don’t have it.": "Envíe el número de BDO/pedido, o escriba “ninguno” si no lo tiene.", "Please share a little more about what you need help with.": "Cuénteme un poco más sobre lo que necesita.", "I couldn’t confirm that the request was saved. Please say “yes” to retry, or contact support@kedelivery.com directly.": "No pude confirmar que la solicitud se guardó. Escriba “sí” para intentarlo nuevamente, o contacte directamente a support@kedelivery.com.", "What is the correct email address?": "¿Cuál es el correo electrónico correcto?", "What is the correct callback number?": "¿Cuál es el número correcto para devolverle la llamada?", "What is your correct full name?": "¿Cuál es su nombre completo correcto?", "Please say “yes” to save this request and chat, tell me which item to change, or say “cancel.”": "Escriba “sí” para guardar esta solicitud y el chat, indique qué dato desea cambiar, o escriba “cancelar”."};
function sayKateContact(text,language=kateContactFlow?.language){addMessage(language==='es'?(kateContactTranslations[text]||text):text)}
function startKateContact(text='',preferredMethod='',language='en'){
 const method=['email','phone'].includes(preferredMethod)?preferredMethod:(/call|callback|phone|llam(?:ar|en|ada)|tel[eé]fono/i.test(text)&&!/email|correo/i.test(text)?'phone':'email');
 const delivery=kateFlow?.lastData?kateFlow:null;
 const suppliedEmail=text.match(/[^\s@,;]+@[^\s@,;]+\.[^\s@,;.]+/i)?.[0]||'';
 const suppliedName=text.match(/(?:my name is|name:)\s*([\p{L} '-]{2,80})(?:[,.;]|$)/iu)?.[1]?.trim()||'';
 kateContactFlow={step:'name',method,language,fullName:suppliedName,email:suppliedEmail,phone:'',reason:'',orderNumber:delivery?.orderNumber||'',lastName:delivery?.lastName||'',reference:crypto.randomUUID()};
 if(suppliedName){if(method==='email'&&suppliedEmail){afterContactValue();return}kateContactFlow.step='contact';sayKateContact(method==='email'?'What email address should K&E reply to?':'What phone number should K&E call, including the country code?');return}
 sayKateContact(method==='email'?'I can save an email follow-up request for the K&E team. Email keeps a record of the conversation. What’s your full name?':'I can save a callback request for the K&E team. What’s your full name?');input.placeholder='Enter your full name…';
}
function reviewKateContact(){
 const f=kateContactFlow;f.step='review';
 sayKateContact(f.language==='es'?`Antes de guardar la solicitud, confirme:\n\nNombre: ${f.fullName}\nContacto preferido: ${f.method==='email'?`Correo — ${f.email}`:`Llamada — ${f.phone}`}\nBDO: ${f.orderNumber||'No proporcionado'}\nConsulta: ${f.reason}\n\n¿Me autoriza a guardar estos datos y este chat para que K&E le dé seguimiento? Todavía no se ha enviado un correo ni realizado una llamada.`:`Before I save your request, please confirm:\n\nName: ${f.fullName}\nPreferred contact: ${f.method==='email'?`Email — ${f.email}`:`Callback — ${f.phone}`}\nBDO: ${f.orderNumber||'Not provided'}\nReason: ${f.reason}\n\nMay I save these details and this chat for K&E to follow up? No email or call has been sent yet.`);input.placeholder='Yes to save, change an item, or cancel…';
}
function askContactReason(){kateContactFlow.step='reason';sayKateContact('What would you like the K&E team to help you with?');input.placeholder='Briefly describe your concern…'}
function afterContactValue(){if(kateContactFlow.reason)return reviewKateContact();if(!kateContactFlow.orderNumber){kateContactFlow.step='order';sayKateContact('Do you have a BDO/order number for this request? If not, say “none.”');input.placeholder='BDO/order number or none…';return}askContactReason()}
async function handleKateContact(text){
 const f=kateContactFlow;if(!f)return false;const t=String(text||'').trim(),q=t.toLowerCase().replace(/[’]/g,"'");
 if(/^(cancel|stop|never mind|nevermind|don't save|do not save|cancelar|cancela|no guardar)[.! ]*$/.test(q)){kateContactFlow=null;input.placeholder='Type a message to KatE…';sayKateContact('Okay, I haven’t saved a follow-up request. I’m still here if you need help.',f.language);return true}
 if(/why.*email|why.*chat|what.*save|what.*happen|por qu[eé].*(?:correo|chat)|qu[eé].*guardar/.test(q)){sayKateContact('Email lets you and K&E keep a record of your correspondence. I’ll save your contact details, concern and this chat only after you confirm. The K&E team can then follow up; I haven’t sent an email or placed a call.');return true}
 if(/email instead|prefer.*email|prefiero.*correo|correo en vez/.test(q)){f.method='email';f.step='contact';sayKateContact('Of course. What email address should K&E use?');return true}
 if(/call instead|prefer.*call|callback instead|prefiero.*llamada/.test(q)){f.method='phone';f.step='contact';sayKateContact('Of course. What phone number should K&E use, including the country code?');return true}
 if(f.step==='name'){if(t.length<2||t.length>100){sayKateContact('Please enter your full name so K&E knows who to contact.');return true}f.fullName=t;if((f.method==='email'&&f.email)||(f.method==='phone'&&f.phone)){afterContactValue();return true}f.step='contact';sayKateContact(f.method==='email'?'What email address should K&E reply to?':'What phone number should K&E call, including the country code?');input.placeholder=f.method==='email'?'Enter your email address…':'Enter your phone number…';return true}
 if(f.step==='contact'){
  if(f.method==='email'){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)||t.length>254){sayKateContact('That email address doesn’t look complete. Please check it and send it again.');return true}f.email=t.toLowerCase()}
  else{if(!/^[+()\d\s.-]{7,40}$/.test(t)){sayKateContact('Please send the best callback number, including the country code.');return true}f.phone=t}
  afterContactValue();return true;
 }
 if(f.step==='order'){if(!/^(none|no|don't have it|do not have it|not available|skip|ninguno|no tengo|no lo tengo)$/i.test(t)){if(!/^[A-Z0-9]{6,30}$/i.test(t)){sayKateContact('Please send the BDO/order number, or say “none” if you don’t have it.');return true}f.orderNumber=t.toUpperCase()}askContactReason();return true}
 if(f.step==='reason'){if(t.length<3){sayKateContact('Please share a little more about what you need help with.');return true}f.reason=t.slice(0,1000);reviewKateContact();return true}
 if(f.step==='review'){
  if(isKateApproval(t)){
   try{const response=await fetch(CUSTOMER_UPDATE_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'contact_request',...f,consent:true,history:kateConversationHistory.slice(-24)}),signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('save_failed');const result=await response.json();if(!result.ok)throw new Error('save_failed');kateContactFlow=null;input.placeholder='Type a message to KatE…';sayKateContact(f.language==='es'?`Su solicitud de ${f.method==='email'?'seguimiento por correo':'llamada'} quedó guardada para el equipo de K&E, junto con sus datos, consulta y registro del chat. Todavía no se ha enviado un correo ni realizado una llamada. Referencia: ${result.reference}.`:`Your ${f.method==='email'?'email follow-up':'callback'} request is saved for the K&E team. They have your ${f.method==='email'?'email address':'phone number'}, concern and chat record. No ${f.method==='email'?'email has':'call has'} been sent yet. Reference: ${result.reference}.`,f.language);return true}
   catch{sayKateContact('I couldn’t confirm that the request was saved. Please say “yes” to retry, or contact support@kedelivery.com directly.');return true}
  }
  if(/email|phone|contact|correo|tel[eé]fono/.test(q)){f.step='contact';sayKateContact(f.method==='email'?'What is the correct email address?':'What is the correct callback number?');return true}
  if(/name|nombre/.test(q)){f.step='name';sayKateContact('What is your correct full name?');return true}
  if(/reason|concern|message|consulta|motivo|mensaje/.test(q)){f.step='reason';sayKateContact('What would you like the K&E team to help you with?');return true}
  sayKateContact('Please say “yes” to save this request and chat, tell me which item to change, or say “cancel.”');return true;
 }
 return true;
}
const conversationBaseHandle=handleFlowInput;
handleFlowInput=async function(text){
 const q=String(text||'').trim();
 if(await handleKateContact(q))return true;
 if(/\b(?:different|another|new)\s+(?:delivery|order|bag)\b/i.test(q)){
  window.kateVerifiedDelivery=null;kateFlow=null;kateConversationHistory.length=0;startDeliveryLookup('status');return true;
 }
 if(!needsConversationalAnswer(q))return await conversationBaseHandle(text);
 ensureVerifiedContext();
 // Natural-language intent selects actions; evidence retrieval itself stays deterministic.
 const current=kateFlow;
 try{
  const response=await fetch(KATE_INTENT_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'conversation',text:q,history:kateConversationHistory.slice(-16),step:current?.step||'',orderNumber:current?.lastData?current.orderNumber:'',lastName:current?.lastData?current.lastName:''}),signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error('conversation_failed');
  const result=await response.json();
  if(current?.lastData&&result.verification==='required'){
   window.kateVerifiedDelivery=null;resetFlow();
   if(['status','photos','attempt','update'].includes(result.action)){startDeliveryLookup('status');return true}
  }
  if(result.verification==='verified'&&result.delivery&&current){current.lastData=result.delivery;rememberVerifiedDelivery(current.orderNumber,current.lastName,result.delivery)}
  const verified=result.verification==='verified'&&kateFlow?.lastData;
  if(['status','photos','attempt','update'].includes(result.action)&&!verified){
   // The lookup flow supplies the next question; avoid a second overlapping introduction.
   if(result.verification==='unavailable')addMessage('I’m having trouble checking D.A.R.T. right now. Please try again shortly or contact support@kedelivery.com.');
   else startDeliveryLookup('status');
   return true;
  }
  if(result.reply)addMessage(result.reply);
  if(result.action==='photos')return await showPodPhoto();
  if(result.action==='attempt')return await showAttemptEvidence();
  if(result.action==='update'){beginConversationCorrection(result.updateField);return true}
  if(result.action==='human'){startKateContact(q,result.contactMethod,result.language);return true}
  return true;
 }catch{
  if(isPhotoAcknowledgement(q)){addMessage('I’m glad the photos helped you recognize the location. I’m here if you need anything else about your delivery.');return true}
  if(/\b(status|track|bag|baggage|luggage|deliver|photo|picture)\b/i.test(q))return await conversationBaseHandle(text);
  addMessage('I’m having trouble answering that right now, but I’m still here to help with your delivery. You can ask me to check its status or photos, or contact support@kedelivery.com.');return true;
 }
};
