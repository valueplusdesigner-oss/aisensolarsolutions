(() => {
  // Resize selected images before submission so phone photographs fit the upload limit.
  async function optimize(file) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose JPG, PNG or WebP images.');
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width=Math.round(bitmap.width*scale); canvas.height=Math.round(bitmap.height*scale);
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
    let blob;
    for (const quality of [.85,.7,.55,.4]) {
      blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
      if (blob && blob.size <= 1024*1024) break;
    }
    if (!blob || blob.size>1024*1024) throw new Error('This image is too large. Choose a smaller image.');
    return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp'});
  }
  document.querySelectorAll('input[type=file]').forEach(input=>{
    let pending=Promise.resolve();
    const form=input.closest('form');
    let submitAgain=false;
    input.addEventListener('change',()=>{
      const originals=[...input.files]; const status=form.querySelector('[data-upload-status]');
      pending=(async()=>{
        if (status) status.textContent='Preparing photos…';
        const transfer=new DataTransfer();
        for (const file of originals) transfer.items.add(await optimize(file));
        input.files=transfer.files;
        if (status) status.textContent=originals.length ? `${originals.length} photo(s) ready` : '';
        input.setCustomValidity('');
      })().catch(error=>{input.setCustomValidity(error.message);input.reportValidity();if(status)status.textContent=error.message;throw error;});
      pending.catch(()=>{});
    });
    form.addEventListener('submit',async event=>{
      if(submitAgain || !input.files.length)return;
      event.preventDefault();
      try{await pending;submitAgain=true;form.requestSubmit(event.submitter);}catch{input.reportValidity();}
    });
  });
})();
