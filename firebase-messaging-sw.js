/* RA Polymers — Service Worker V13.65 */

importScripts(
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js',
  './firebase-config.js'
);

firebase.initializeApp(RA_POLYMERS_FIREBASE_CONFIG);
const messaging = firebase.messaging();

const URL_APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbyyczQIADyS9tG7G9WiR_tFiWubW4mcteLurFO_GOlrlSs9f9CWkcojnjsuG5Jgvt/exec';
const DB_NAME = 'RAPolymersMonitoramentoVideo';
const DB_VERSION = 4;
const STORE_JOBS = 'jobs';
const STORE_CHUNKS = 'chunks';
const BG_SYNC_TAG = 'ra-polymers-upload';
const MAX_CHUNKS_POR_EXECUCAO = 3;

self.addEventListener('message', function(event) {
  const dados = event && event.data ? event.data : {};
  if (dados.tipo === 'ALARME_BLOQUEIO_TELA') {
    event.waitUntil(mostrarAlarmeLocal_(dados));
    return;
  }
  if (dados.tipo === 'PROCESSAR_UPLOADS_AGORA') {
    event.waitUntil(processarUploadsEmSegundoPlano_());
  }
});

self.addEventListener('sync', function(event) {
  if (event.tag === BG_SYNC_TAG) {
    event.waitUntil(processarUploadsEmSegundoPlano_());
  }
});

async function mostrarAlarmeLocal_(dados) {
  const maquina = String(dados.maquina || '').trim();
  const corpo = maquina
    ? 'Máquina ' + maquina + ': inspeção pendente. Toque para atender.'
    : 'Existe uma inspeção pendente. Toque para atender.';
  return self.registration.showNotification('🚨 INSPEÇÃO ATRASADA', {
    body: corpo,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: 'ra-polymers-bloqueio-' + (maquina || 'geral'),
    renotify: true,
    requireInteraction: true,
    silent: false,
    timestamp: Date.now(),
    vibrate: [700,300,700,300,1200,700,1200],
    data: { url: dados.url || './', maquina: maquina, tipo: 'INSPECAO' }
  });
}

messaging.onBackgroundMessage(function(payload) {
  const notification = (payload && payload.notification) || {};
  const data = (payload && payload.data) || {};
  const titulo = notification.title || data.title || '🚨 INSPEÇÃO HORÁRIA';
  const texto = notification.body || data.body || 'É hora de realizar a inspeção da máquina.';
  const maquina = String(data.maquina || '').trim();
  const corpo = maquina ? 'Máquina ' + maquina + ': ' + texto : texto;
  self.registration.showNotification(titulo, {
    body: corpo,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: 'ra-polymers-inspecao-' + (maquina || 'geral'),
    renotify: true,
    requireInteraction: true,
    silent: false,
    timestamp: Date.now(),
    vibrate: [700,300,700,300,1200,700,1200],
    data: { url: data.url || './', maquina: maquina, tipo: data.tipo || 'INSPECAO' }
  });
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const destino = event.notification && event.notification.data && event.notification.data.url
    ? event.notification.data.url : './';
  event.waitUntil(clients.matchAll({type:'window', includeUncontrolled:true}).then(function(clientes) {
    for (const cliente of clientes) {
      if ('navigate' in cliente && destino) {
        return cliente.navigate(destino).then(function(navegado){ return navegado.focus(); });
      }
      if ('focus' in cliente) return cliente.focus();
    }
    if (clients.openWindow) return clients.openWindow(destino);
  }));
});

function abrirBanco_() {
  return new Promise(function(resolve,reject){
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = function(e){ resolve(e.target.result); };
    req.onerror = function(){ reject(req.error || new Error('IDB_OPEN_ERRO')); };
  });
}
function chaveChunk_(uploadId, chunkIndex){ return uploadId + '|' + String(chunkIndex); }
function idbGetAll_(storeName){
  return abrirBanco_().then(function(db){
    return new Promise(function(resolve,reject){
      const tx=db.transaction(storeName,'readonly'); const req=tx.objectStore(storeName).getAll();
      req.onsuccess=function(){ db.close(); resolve(req.result||[]); };
      req.onerror=function(){ db.close(); reject(req.error || new Error('IDB_GETALL_ERRO')); };
    });
  });
}
function idbGet_(storeName,key){
  return abrirBanco_().then(function(db){
    return new Promise(function(resolve,reject){
      const tx=db.transaction(storeName,'readonly'); const req=tx.objectStore(storeName).get(key);
      req.onsuccess=function(){ db.close(); resolve(req.result||null); };
      req.onerror=function(){ db.close(); reject(req.error || new Error('IDB_GET_ERRO')); };
    });
  });
}
function idbPut_(storeName,value){
  return abrirBanco_().then(function(db){
    return new Promise(function(resolve,reject){
      const tx=db.transaction(storeName,'readwrite'); tx.objectStore(storeName).put(value);
      tx.oncomplete=function(){ db.close(); resolve(); };
      tx.onerror=function(){ db.close(); reject(tx.error || new Error('IDB_PUT_ERRO')); };
    });
  });
}
async function blobParaBase64_(blob){
  const bytes=new Uint8Array(await blob.arrayBuffer());
  let binario='';
  const tamanho=0x8000;
  for(let i=0;i<bytes.length;i+=tamanho){
    binario += String.fromCharCode.apply(null, bytes.subarray(i,Math.min(i+tamanho,bytes.length)));
  }
  return btoa(binario);
}
async function postar_(params){
  await fetch(URL_APPS_SCRIPT,{method:'POST',mode:'no-cors',cache:'no-store',credentials:'omit',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:params.toString()});
}
function consultarJsonp_(url){
  return new Promise(function(resolve,reject){
    const cb='__raSwCb_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
    let dados=null;
    self[cb]=function(res){ dados=res || null; };
    try { importScripts(url + (url.indexOf('?')>=0?'&':'?') + 'callback=' + encodeURIComponent(cb)); }
    catch(e){ delete self[cb]; reject(e); return; }
    delete self[cb];
    resolve(dados);
  });
}
async function confirmarChunk_(uploadId,indice){
  const dados=await consultarJsonp_(URL_APPS_SCRIPT+'?status=chunk&uploadId='+encodeURIComponent(uploadId)+'&chunkIndex='+encodeURIComponent(indice)+'&_='+Date.now());
  if(!(dados && dados.sucesso && dados.recebido)) throw new Error('CHUNK_BACKGROUND_NAO_CONFIRMADO');
  return dados;
}
async function processarJobBackground_(job){
  const total=Number(job.totalChunks||0);
  let next=Number(job.nextChunk||0);
  if(!total) return;
  const limite=Math.min(total,next+MAX_CHUNKS_POR_EXECUCAO);
  job.status='uploading'; job.updatedAt=Date.now(); await idbPut_(STORE_JOBS,job);
  for(let i=next;i<limite;i++){
    const chunk=await idbGet_(STORE_CHUNKS,chaveChunk_(job.uploadId,i));
    if(!chunk || !chunk.blob) throw new Error('CHUNK_LOCAL_AUSENTE_'+i);
    const b64=await blobParaBase64_(chunk.blob);
    const p=new URLSearchParams();
    const audio=(job.mediaType||'VIDEO')==='AUDIO';
    p.set('tipo',audio?'AUDIO_CHUNK':'VIDEO_CHUNK');
    p.set('uploadId',job.uploadId||''); p.set('chunkIndex',String(i)); p.set('totalChunks',String(total));
    p.set('chunkBase64',b64); p.set('mimeType',job.mimeType||'video/webm'); p.set('maquina',job.maquina||'');
    p.set('operador',job.operador||''); p.set('produto',job.produto||''); p.set('conforme',job.conforme||''); p.set('ciclo',job.ciclo||'');
    if(!audio){p.set('duracaoReal',String(job.duracaoReal||0));p.set('inicioVideo',job.inicioVideo||'');p.set('fimVideo',job.fimVideo||'');}
    await postar_(p);
    /* A confirmação JSONP é apenas diagnóstico.
     * O transporte já foi enviado; se o navegador bloquear importScripts
     * cross-origin, não podemos deixar o upload inteiro parado por isso.
     */
    if(!audio){
      try { await confirmarChunk_(job.uploadId,i); }
      catch (erroConfirmacao) {}
    }
    job.nextChunk=i+1; job.status=job.nextChunk>=total?'finalizing':'uploading'; job.updatedAt=Date.now(); await idbPut_(STORE_JOBS,job);
  }
  if(Number(job.nextChunk||0)>=total && !job.backgroundFinalizeRequestedAt){
    const p=new URLSearchParams(); const audio=(job.mediaType||'VIDEO')==='AUDIO';
    p.set('tipo',audio?'AUDIO_FINALIZE':'VIDEO_FINALIZE'); p.set('uploadId',job.uploadId||''); p.set('totalChunks',String(total)); p.set('mimeType',job.mimeType||'video/webm');
    if(audio){p.set('parentUploadId',job.parentUploadId||'');p.set('inicioAudio',job.inicioAudio||'');}
    else {p.set('duracaoReal',String(job.duracaoReal||0));p.set('inicioVideo',job.inicioVideo||'');p.set('fimVideo',job.fimVideo||'');}
    await postar_(p);
    job.backgroundFinalizeRequestedAt=Date.now(); job.status='finalizing'; job.updatedAt=Date.now(); await idbPut_(STORE_JOBS,job);
  }
  if(Number(job.nextChunk||0)<total){
    try{ await self.registration.sync.register(BG_SYNC_TAG); }catch(e){}
  }
}
async function processarUploadsEmSegundoPlano_(){
  const jobs=(await idbGetAll_(STORE_JOBS)).filter(function(j){return j&&j.status!=='completed'&&j.status!=='recording';}).sort(function(a,b){return Number(a.createdAt||0)-Number(b.createdAt||0);});
  for(const job of jobs){ await processarJobBackground_(job); }
}
