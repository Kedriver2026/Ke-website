const KATE_POD_API='https://yvppsjgyedqcvfbhrhrm.supabase.co/functions/v1/dart-pod';

function addKateImage(src,alt='K&E delivery photo'){
  const wrap=document.createElement('div');
  wrap.className='kate-message kate-bot kate-photo-message';
  const img=document.createElement('img');
  img.src=src;
  img.alt=alt;
  img.loading='lazy';
  img.style.cssText='display:block;width:100%;max-width:320px;height:auto;border-radius:14px;margin-top:4px;';
  wrap.appendChild(img);
  body.appendChild(wrap);
  body.scrollTop=body.scrollHeight;
}

function isPodQuestion(text){
  const q=String(text||'').toLowerCase().replace(/[’]/g,"'");
  return /\b(photo|photos|picture|pictures|image|images|pod|proof of delivery)\b/.test(q)
    || /where\s+(?:did\s+)?(?:they|the driver|you)\s+(?:leave|left|deliver|delivered|drop|dropped)/.test(q)
    || /where\s+(?:was|were)\s+(?:my\s+)?(?:bag|bags|baggage|luggage)\s+(?:left|delivered|dropped)/.test(q)
    || /where\s+(?:are|is)\s+(?:my\s+)?(?:bag|bags|baggage|luggage)/.test(q)
    || /(?:need|want|show me|tell me).*where.*(?:bag|bags|baggage|luggage).*(?:delivered|left|dropped)/.test(q)
    || /(?:bag|bags|baggage|luggage).*(?:where|location).*(?:delivered|left|dropped)/.test(q)
    || /delivery\s+location|drop[- ]?off\s+location/.test(q);
}

function isAttemptEvidenceQuestion(text){
  const q=String(text||'').toLowerCase().replace(/[’]/g,"'");
  return /why|reason|what happened|attempt|couldn'?t deliver|could not deliver|photo|picture|image|show me/.test(q);
}

async function showPodPhoto(){
  if(!kateFlow?.orderNumber||!kateFlow?.lastName){addMessage('I need to verify the delivery first before I can show any delivery photos.');return true}
  addMessage(pick([`Yes—let me check the D.A.R.T. delivery photos for you. 📸`,`Let me pull up the proof-of-delivery photos from D.A.R.T. 📸`]));
  try{
    const r=await fetch(KATE_POD_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderNumber:kateFlow.orderNumber,lastName:kateFlow.lastName,kind:'delivered'})});
    if(r.status===404){addMessage('I couldn’t find that verified delivery in the image lookup.');return true}
    if(r.status===403){addMessage('I couldn’t verify the delivery details for the photo lookup.');return true}
    if(!r.ok)throw new Error('pod_failed');
    const d=await r.json();
    const photos=Array.isArray(d.photos)?d.photos.filter(p=>p?.available):[];
    if(!d.photoAvailable||!photos.length){addMessage('I checked D.A.R.T., but there aren’t any delivery photos available for this order.');return true}
    const displayable=photos.filter(p=>p.imageData);
    if(!displayable.length){addMessage(`I found ${photos.length===1?'a delivery-photo record':`${photos.length} delivery-photo records`}, but I can’t display ${photos.length===1?'the image':'the images'} here right now.`);return true}
    addMessage(displayable.length===1?`I found the delivery photo. 📸 Here it is:`:`I found ${displayable.length} photos from the completed delivery. 📸 The photos show the baggage at the drop-off location and the surrounding delivery location.`);
    displayable.forEach((p,i)=>addKateImage(p.imageData,`D.A.R.T. proof of delivery photo ${i+1}`));
    addMessage(displayable.length>1?'Do these photos help you recognize where the driver left the baggage?':'Does this location look familiar?');
    return true;
  }catch(e){addMessage('I’m having trouble opening the D.A.R.T. delivery photos right now. I don’t want to pretend I can see something I can’t, so please try again shortly.');return true}
}

async function showAttemptEvidence(options={}){
  const intro=options.intro!==false;
  if(!kateFlow?.orderNumber||!kateFlow?.lastName)return false;
  if(intro)addMessage('Let me check the D.A.R.T. attempt record so I can show you what happened. 📸');
  try{
    const r=await fetch(KATE_POD_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderNumber:kateFlow.orderNumber,lastName:kateFlow.lastName,kind:'attempted'})});
    if(!r.ok)throw new Error('attempt_evidence_failed');
    const d=await r.json();
    const reason=String(d?.reason||'').trim();
    if(reason){
      const friendly=/wrong info/i.test(reason)?'The attempt record says the delivery information was incorrect.':`The attempt note says: ${reason}.`;
      addMessage(friendly);
    }else{
      addMessage('I found the attempted-delivery event, but D.A.R.T. does not show a specific reason that I can safely explain.');
    }
    const photos=Array.isArray(d.photos)?d.photos.filter(p=>p?.imageData):[];
    if(photos.length){
      addMessage(photos.length===1?'I also found the photo from the delivery attempt. 📸':'I also found the photos from the delivery attempt. 📸');
      photos.forEach((p,i)=>addKateImage(p.imageData,`D.A.R.T. attempted-delivery photo ${i+1}`));
      addMessage('Do you recognize this location? If the driver needs a gate code, building-access instructions, front-desk instructions, or corrected delivery information, I can help you update it for the next attempt.');
    }else{
      addMessage('There isn’t an attempted-delivery photo available for me to show from this event.');
    }
    return true;
  }catch(e){
    addMessage('I’m having trouble opening the D.A.R.T. attempt details right now, so I don’t want to guess about what happened.');
    return true;
  }
}

const podBaseHandle=handleFlowInput;
handleFlowInput=async function(text){
  const kind=kateFlow?.lastData?kateStatusKind(kateFlow.lastData):'';
  if(kind==='delivered'&&isPodQuestion(text))return await showPodPhoto();
  if(kind==='attempted'&&isAttemptEvidenceQuestion(text))return await showAttemptEvidence();
  return podBaseHandle(text);
};
