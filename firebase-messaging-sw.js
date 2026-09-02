/* RA Polymers — Service Worker V13.76 — FCM BACKGROUND + UPLOAD RESILIENTE */
const URL_APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbyyczQIADys9S5tG7G9WiR_tFiWubW4mcteLurFO_GOlrlSs9f9CWkcojnjsuG5Jgvt/exec';
const DB_NAME = 'RAPolymersMonitoramentoVideo';
const DB_VERSION = 4;
const STORE_JOBS = 'jobs';
const STORE_CHUNKS = 'chunks';
const BG_SYNC_TAG = 'ra-polymers-upload';
const MAX_CHUNKS_POR_EXECUCAO = 2;
const FINALIZE_TIMEOUT_MS = 8 * 60 * 1000;
const FIREBASE_SDK = '10.14.1';
const ICON_192 = '/monitoramento-injecao/icons/icon-192.png';
const BADGE_72 = '/monitoramento-injecao/icons/badge-72.png';
let firebaseReadyPromise = null;
let fcmHandledKeys = new Map();

function getNotificationKey_(data) {
  const d = data || {};
  return String(d.maquina || 'geral') + '|' + String(d.ciclo || d.timestamp || Date.now());
}

async function carregarFirebaseConfig_() {
  const resposta = await fetch('./firebase-config.js?v=' + Date.now(), {cache:'no-store'});
  if (!resposta.ok) throw new Error('firebase-config HTTP ' + resposta.status);
  const codigo = await resposta.text();
  const get = (name) => {
    const m = codigo.match(new RegExp('(?:globalThis\\.|window\\.|const\\s+|let\\s+|var\\s+)' + name + '\\s*=\\s*[\\\"\\\']([^\\\"\\\']+)\\\"?'));
    return m ? m[1] : '';
  };
  const pick = (name) => {
    const q = codigo.match(new RegExp(name + '\\s*[:=]\\s*[\\\"\\\']([^\\\"\\\']+)'));
    return q ? q[1] : '';
  };
  const apiKey = pick('apiKey');
  const authDomain = pick('authDomain');
  const projectId = pick('projectId');
  const storageBucket = pick('storageBucket');
  const messagingSenderId = pick('messagingSenderId');
  const appId = pick('appId');
  if (!apiKey || !projectId || !messagingSenderId || !appId) throw new Error('CONFIG_FIREBASE_INCOMPLETA');
  return {apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId};
}

async function iniciarFirebaseMessaging_() {
  if (firebaseReadyPromise) return firebaseReadyPromise;
  firebaseReadyPromise = (async function(){
    try {
      importScripts('https://www.gstatic.com/firebasejs/' + FIREBASE_SDK + '/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK + '/firebase-messaging-compat.js');
      const config = await carregarFirebaseConfig_();
      if (!firebase.apps.length) firebase.initializeApp(config);
      const messaging = firebase.messaging();
      messaging.onBackgroundMessage(function(payload){
        return mostrarAlarmePush_(payload);
      });
      return messaging;
    } catch (e) {
      console.error('FCM_SW_INIT_ERRO', e);
      return null;
    }
  })();
  return firebaseReadyPromise;
}

async function mostrarAlarmePush_(payload) {
  const bruto = payload || {};
  const data = bruto.data || {};
  const notif = bruto.notification || {};
  const chave = getNotificationKey_(data);
  const agora = Date.now();
  for (const [k,t] of fcmHandledKeys) if (agora-t > 120000) fcmHandledKeys.delete(k);
  if (fcmHandledKeys.has(chave)) return;
  fcmHandledKeys.set(chave, agora);

  const maquina = String(data.maquina || '').trim();
  const titulo = String(notif.title || data.title || '🚨 INSPEÇÃO ATRASADA');
  const corpo = String(notif.body || data.body || (maquina ? 'Máquina ' + maquina + ': inspeção pendente.' : 'Existe uma inspeção pendente.'));
  const destino = String(data.url || ('https://pcprapolymers-boop.github.io/monitoramento-injecao/?m=' + encodeURIComponent(maquina)));
  await self.registration.showNotification(titulo, {
    body: corpo, icon: ICON_192, badge: BADGE_72,
    tag: 'ra-polymers-inspecao-' + (maquina || 'geral') + '-' + String(data.ciclo || agora),
    renotify: true, requireInteraction: true, silent: false, timestamp: agora,
    vibrate: [0,1200,300,1200,300,1200,500],
    data: {url: destino, maquina, tipo: data.tipo || 'INSPECAO', ciclo: String(data.ciclo || '')}
  });
}

// Fallback nativo para mensagens Push que cheguem antes do SDK terminar de inicializar.
self.addEventListener('push', function(event){
  event.waitUntil((async function(){
    let payload = null;
    if (event.data) {
      try { payload = event.data.json() || {}; } catch (e) { payload = null; }
    }
    if (payload && (payload.data || payload.notification)) {
      try { await mostrarAlarmePush_(payload); } catch (e) { console.error('PUSH_FALLBACK_ERRO', e); }
    }
    await iniciarFirebaseMessaging_();
  })());
});

self.addEventListener('install', function(event){ self.skipWaiting(); });
self.addEventListener('activate', function(event){ event.waitUntil(self.clients.claim()); });

self.addEventListener('message', function(event) {
  const dados = event && event.data ? event.data : {};
  if (dados.tipo === 'ALARME_BLOQUEIO_TELA') { event.waitUntil(mostrarAlarmeLocal_(dados)); return; }
  if (dados.tipo === 'PROCESSAR_UPLOADS_AGORA') event.waitUntil(processarUploadsEmSegundoPlano_());
});

self.addEventListener('sync', function(event) {
  if (event.tag === BG_SYNC_TAG) event.waitUntil(processarUploadsEmSegundoPlano_());
});

async function mostrarAlarmeLocal_(dados) {
  const maquina = String(dados.maquina || '').trim();
  const destino = dados.url || '/monitoramento-injecao/';
  return self.registration.showNotification('🚨 INSPEÇÃO ATRASADA', {
    body: maquina ? 'Máquina ' + maquina + ': inspeção pendente. Toque para atender.' : 'Existe uma inspeção pendente. Toque para atender.',
    icon: ICON_192, badge: BADGE_72,
    tag: 'ra-polymers-inspecao-' + (maquina || 'geral') + '-' + String(dados.ciclo || Date.now()),
    renotify: true, requireInteraction: true, silent: false, timestamp: Date.now(),
    vibrate: [0,1200,300,1200,300,1200,500],
    data: {url: destino, maquina, tipo:'INSPECAO', ciclo:String(dados.ciclo || '')}
  });
}

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  const destino = event.notification && event.notification.data && event.notification.data.url ? event.notification.data.url : '/monitoramento-injecao/';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){
    for(const c of list){ if('navigate' in c) return c.navigate(destino).then(x=>x.focus()); if('focus' in c) return c.focus(); }
    if(clients.openWindow) return clients.openWindow(destino);
  }));
});

function abrirBanco_(){ return new Promise((resolve,reject)=>{ const req=indexedDB.open(DB_NAME,DB_VERSION); req.onsuccess=e=>resolve(e.target.result); req.onerror=()=>reject(req.error||new Error('IDB_OPEN_ERRO')); }); }
function chaveChunk_(u,i){ return u+'|'+String(i); }
function idbGetAll_(s){ return abrirBanco_().then(db=>new Promise((resolve,reject)=>{ const tx=db.transaction(s,'readonly'); const rq=tx.objectStore(s).getAll(); rq.onsuccess=()=>{db.close();resolve(rq.result||[])}; rq.onerror=()=>{db.close();reject(rq.error||new Error('IDB_GETALL_ERRO'))}; })); }
function idbGet_(s,k){ return abrirBanco_().then(db=>new Promise((resolve,reject)=>{ const tx=db.transaction(s,'readonly'); const rq=tx.objectStore(s).get(k); rq.onsuccess=()=>{db.close();resolve(rq.result||null)}; rq.onerror=()=>{db.close();reject(rq.error||new Error('IDB_GET_ERRO'))}; })); }
function idbPut_(s,v){ return abrirBanco_().then(db=>new Promise((resolve,reject)=>{ const tx=db.transaction(s,'readwrite'); tx.objectStore(s).put(v); tx.oncomplete=()=>{db.close();resolve()}; tx.onerror=()=>{db.close();reject(tx.error||new Error('IDB_PUT_ERRO'))}; })); }
async function blobParaBase64_(blob){ const bytes=new Uint8Array(await blob.arrayBuffer()); let b=''; for(let i=0;i<bytes.length;i+=0x8000)b+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(i+0x8000,bytes.length))); return btoa(b); }
async function postar_(params){ await fetch(URL_APPS_SCRIPT,{method:'POST',mode:'no-cors',cache:'no-store',credentials:'omit',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:params.toString()}); }
function consultarJsonp_(url){ return new Promise(function(resolve,reject){ const cb='__raSwCb_'+Date.now()+'_'+Math.random().toString(36).slice(2,8); self[cb]=res=>{delete self[cb];resolve(res||null)}; try{ importScripts(url+(url.indexOf('?')>=0?'&':'?')+'callback='+encodeURIComponent(cb)); } catch(e){delete self[cb];reject(e);} }); }
async function confirmarChunk_(u,i){ const d=await consultarJsonp_(URL_APPS_SCRIPT+'?status=chunk&uploadId='+encodeURIComponent(u)+'&chunkIndex='+encodeURIComponent(i)+'&_='+Date.now()); if(!(d&&d.sucesso&&d.recebido))throw new Error('CHUNK_BACKGROUND_NAO_CONFIRMADO'); return d; }
async function consultarFinal_(u){ const d=await consultarJsonp_(URL_APPS_SCRIPT+'?status=final&uploadId='+encodeURIComponent(u)+'&_='+Date.now()); return d||null; }

async function processarJobBackground_(job){
  const total=Number(job.totalChunks||0); if(!total)return;
  let next=Number(job.nextChunk||0);
  if(next>=total){ await solicitarFinalizacaoBackground_(job); return; }
  const limite=Math.min(total,next+MAX_CHUNKS_POR_EXECUCAO);
  for(let i=next;i<limite;i++){
    const chunk=await idbGet_(STORE_CHUNKS,chaveChunk_(job.uploadId,i));
    if(!chunk||!chunk.blob) throw new Error('CHUNK_LOCAL_AUSENTE_'+i);
    const b64=await blobParaBase64_(chunk.blob);
    const p=new URLSearchParams(); const audio=(job.mediaType||'VIDEO')==='AUDIO';
    p.set('tipo',audio?'AUDIO_CHUNK':'VIDEO_CHUNK'); p.set('uploadId',job.uploadId||''); p.set('chunkIndex',String(i)); p.set('totalChunks',String(total)); p.set('chunkBase64',b64); p.set('mimeType',job.mimeType||(audio?'audio/webm':'video/webm')); p.set('maquina',job.maquina||''); p.set('operador',job.operador||''); p.set('produto',job.produto||''); p.set('conforme',job.conforme||''); p.set('ciclo',job.ciclo||'');
    if(!audio){ p.set('duracaoReal',String(job.duracaoReal||0)); p.set('inicioVideo',job.inicioVideo||''); p.set('fimVideo',job.fimVideo||''); }
    await postar_(p);
    if(!audio) await confirmarChunk_(job.uploadId,i);
    job.nextChunk=i+1; job.status=job.nextChunk>=total?'finalizing':'uploading'; job.updatedAt=Date.now(); await idbPut_(STORE_JOBS,job);
  }
  if(Number(job.nextChunk||0)>=total) await solicitarFinalizacaoBackground_(job);
  else { try{await self.registration.sync.register(BG_SYNC_TAG);}catch(e){} }
}

async function solicitarFinalizacaoBackground_(job){
  const agora=Date.now();
  if(job.backgroundFinalizeRequestedAt && agora-Number(job.backgroundFinalizeRequestedAt)<FINALIZE_TIMEOUT_MS){
    const status=await consultarFinal_(job.uploadId);
    if(status && status.sucesso && status.idArquivo){ await concluirJobBackground_(job,status); return true; }
    return false;
  }
  const p=new URLSearchParams(); const audio=(job.mediaType||'VIDEO')==='AUDIO'; p.set('tipo',audio?'AUDIO_FINALIZE':'VIDEO_FINALIZE'); p.set('uploadId',job.uploadId||''); p.set('totalChunks',String(job.totalChunks||0)); p.set('mimeType',job.mimeType||(audio?'audio/webm':'video/webm'));
  if(audio){p.set('parentUploadId',job.parentUploadId||'');p.set('inicioAudio',job.inicioAudio||'');} else {p.set('duracaoReal',String(job.duracaoReal||0));p.set('inicioVideo',job.inicioVideo||'');p.set('fimVideo',job.fimVideo||'');}
  await postar_(p); job.backgroundFinalizeRequestedAt=agora; job.status='finalizing'; job.updatedAt=agora; await idbPut_(STORE_JOBS,job);
  try{await self.registration.sync.register(BG_SYNC_TAG);}catch(e){}
}

async function concluirJobBackground_(job,status){
  job.status='completed'; job.completedAt=Date.now(); job.resultadoFinal=status||{}; await idbPut_(STORE_JOBS,job);
  try{ const db=await abrirBanco_(); await new Promise((resolve)=>{const tx=db.transaction(STORE_CHUNKS,'readwrite');const store=tx.objectStore(STORE_CHUNKS);const req=store.index('uploadId').openCursor(IDBKeyRange.only(job.uploadId));req.onsuccess=e=>{const c=e.target.result;if(!c){resolve();return;}c.delete();c.continue();};req.onerror=()=>resolve();}); db.close(); }catch(e){}
}

async function processarUploadsEmSegundoPlano_(){
  const jobs=(await idbGetAll_(STORE_JOBS)).filter(j=>j&&j.status!=='completed'&&j.status!=='recording').sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0));
  for(const job of jobs){ try{ await processarJobBackground_(job); } catch(erro){ try{ job.status='queued'; job.lastBackgroundError=String(erro&&erro.message||erro); job.updatedAt=Date.now(); await idbPut_(STORE_JOBS,job); }catch(e){} } }
}

// Inicializa FCM o mais cedo possível.
iniciarFirebaseMessaging_();
