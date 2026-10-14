const TYPES = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' };
export async function storeImage(file, env, prefix) {
  const extension=TYPES[file.type];
  const limit=env.MEDIA ? 8*1024*1024 : 1024*1024;
  if (!extension || file.size>limit) throw new Error(`Choose a JPG, PNG or WebP image smaller than ${env.MEDIA ? 8 : 1} MB.`);
  const bytes=await file.arrayBuffer();
  const b=new Uint8Array(bytes);
  const valid=extension==='jpg' ? b[0]===255 && b[1]===216 && b[2]===255 : extension==='png' ? b[0]===137 && b[1]===80 && b[2]===78 && b[3]===71 : new TextDecoder().decode(b.slice(0,4))==='RIFF' && new TextDecoder().decode(b.slice(8,12))==='WEBP';
  if(!valid)throw new Error('The selected file is not a valid image.');
  const key=`${prefix}/${crypto.randomUUID()}.${extension}`;
  if(env.MEDIA) await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:file.type,cacheControl:'public, max-age=31536000, immutable'}});
  else await env.DB.prepare('INSERT INTO cms_media (media_key,content_type,data) VALUES (?,?,?)').bind(key,file.type,bytes).run();
  return `/media/${key}`;
}
export async function mediaResponse(request,env,key) {
  if(!key || key.includes('..')) return new Response('Not found',{status:404});
  if(env.MEDIA) {
    const object=await env.MEDIA.get(key);
    if(object) {const headers=new Headers();object.writeHttpMetadata(headers);headers.set('etag',object.httpEtag);return new Response(request.method==='HEAD' ? null : object.body,{headers});}
  }
  const row=await env.DB.prepare('SELECT content_type,data FROM cms_media WHERE media_key=? LIMIT 1').bind(key).first();
  if(!row)return new Response('Not found',{status:404});
  const data=Array.isArray(row.data) ? new Uint8Array(row.data) : row.data;
  return new Response(request.method==='HEAD' ? null : data,{headers:{'content-type':row.content_type,'cache-control':'public, max-age=31536000, immutable','x-content-type-options':'nosniff'}});
}
export async function deleteStoredImage(path,env) {
  const key=path.startsWith('/media/') ? path.slice(7) : '';
  if(!key)return;
  if(env.MEDIA)await env.MEDIA.delete(key);
  await env.DB.prepare('DELETE FROM cms_media WHERE media_key=?').bind(key).run();
}
