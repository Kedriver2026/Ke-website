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
  const q=text.toLowerCase();
  return /(photo|picture|image|proof of delivery|pod|where.*left|where.*leave)/.test(q);
}

async function showPodPhoto(){
  if(!kateFlow?.orderNumber||!kateFlow?.lastName){
    addMessage('I need to verify the delivery first before I can show any delivery photo.');
    return true;
  }
  addMessage(pick([`Yes—let me check the D.A.R.T. delivery images for you. 📸`,`Let me pull up the proof-of-delivery image from D.A.R.T. 📸` ]));
  try{
    const r=await fetch(KATE_POD_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderNumber:kateFlow.orderNumber,lastName:kateFlow.lastName})});
    if(r.status===404){addMessage('I couldn’t find that verified delivery in the image lookup.');return true}
    if(r.status===403){addMessage('I couldn’t verify the delivery details for the photo lookup.');return true}
    if(!r.ok)throw new Error('pod_failed');
    const d=await r.json();
    if(!d.photoAvailable){addMessage('I checked the delivered event in D.A.R.T., but there isn’t a delivery photo available for this order.');return true}
    if(d.imageTooLarge){addMessage('I found the delivery photo, but it’s too large for me to display here right now. I’ve confirmed that a POD image exists.');return true}
    if(!d.imageData){addMessage('I found the delivery-photo record, but I couldn’t load the image itself.');return true}
    addMessage(`I found it. 📸 This is the photo attached to the delivered event${d.photoId?` (photo ${d.photoId})`:''}.`);
    addKateImage(d.imageData,'D.A.R.T. proof of delivery photo');
    addMessage('Does this location look familiar?');
    return true;
  }catch(e){
    addMessage('I’m having trouble opening the D.A.R.T. delivery photo right now. I don’t want to pretend I can see something I can’t, so please try again shortly.');
    return true;
  }
}

const podBaseHandle=handleFlowInput;
handleFlowInput=async function(text){
  if(kateFlow?.lastData&&kateStatusKind(kateFlow.lastData)==='delivered'&&isPodQuestion(text))return await showPodPhoto();
  return podBaseHandle(text);
};
