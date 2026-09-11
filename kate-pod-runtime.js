const KATE_POD_API='https://yvppsjgyedqcvfbhrhrm.supabase.co/functions/v1/dart-pod';

function addKateImage(src,alt='K&E proof of delivery photo'){
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

async function showPodPhoto(){
  if(!kateFlow?.orderNumber||!kateFlow?.lastName){addMessage('I need to verify the delivery first before I can show any delivery photos.');return true}
  addMessage(pick([`Yes—let me check the D.A.R.T. delivery photos for you. 📸`,`Let me pull up the proof-of-delivery photos from D.A.R.T. 📸`]));
  try{
    const r=await fetch(KATE_POD_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderNumber:kateFlow.orderNumber,lastName:kateFlow.lastName})});
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

const podBaseHandle=handleFlowInput;
handleFlowInput=async function(text){
  if(kateFlow?.lastData&&kateStatusKind(kateFlow.lastData)==='delivered'&&isPodQuestion(text))return await showPodPhoto();
  return podBaseHandle(text);
};
