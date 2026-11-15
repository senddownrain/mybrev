import { editorialHash } from './editorial-responsories.mjs';
import { captureFirestoreFailure,classifyFirestoreFailure,retryDelayMs,sanitizeReleaseValue } from './firestore-release-errors.mjs';
/** Retry only a definite rejected rate/capacity error. Never retry unknown
 * RESOURCE_EXHAUSTED, daily quota, transport failure or an ambiguous 5xx. */
export function createReleaseCommit(credential,{fetchImpl=fetch,onEvent=async()=>{},wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),maxAttempts=3,maxTotalRetries=4,random=Math.random}={}){
 let totalRetries=0,requestNumber=0;
 return async writes=>{
  const body=JSON.stringify({writes});
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   const request={operation:'documents:commit',project:'ibreviaryby',writeCount:writes.length,bytes:Buffer.byteLength(body),sha256:editorialHash(body),documents:writes.map(w=>w.update.name.split('/documents/')[1]),fieldMasks:writes.map(w=>w.updateMask.fieldPaths),preconditions:writes.map(w=>w.currentDocument),attempt,requestNumber:++requestNumber};
   await onEvent({event:'attempt',at:new Date().toISOString(),request});
   let response,result;
   try{const token=await credential.getAccessToken();response=await fetchImpl('https://firestore.googleapis.com/v1/projects/ibreviaryby/databases/(default)/documents:commit',{method:'POST',headers:{authorization:'Bearer '+token.access_token,'content-type':'application/json'},body,signal:globalThis.AbortSignal.timeout(90000)});try{result=await response.json();}catch{result=null;}}
   catch(error){const failure={httpStatus:null,status:'TRANSPORT_OR_CREDENTIAL_ERROR',message:sanitizeReleaseValue(error.message),details:[],headers:{},request};await onEvent({event:'failed-write',at:new Date().toISOString(),failure,classification:'ambiguous-transport-failure'});const e=Error('Commit transport failed; inspect receipt/readback before resuming');e.releaseFailure=failure;throw e;}
   if(response.ok){if(!Array.isArray(result?.writeResults)||result.writeResults.length!==writes.length){const e=Error('Commit response incomplete; do not retry blindly');e.ambiguous=true;throw e;}await onEvent({event:'acknowledged',at:new Date().toISOString(),requestNumber,writeResults:result.writeResults.map(r=>({updateTime:r.updateTime}))});return result;}
   const failure=captureFirestoreFailure(response,result,request),classification=classifyFirestoreFailure(failure);
   await onEvent({event:'failed-write',at:new Date().toISOString(),failure,classification});
   if(classification==='temporary-throttling'&&attempt<maxAttempts&&totalRetries<maxTotalRetries){const delayMs=retryDelayMs(failure,attempt,{random});totalRetries++;await onEvent({event:'backoff',at:new Date().toISOString(),delayMs,classification,requestNumber});await wait(delayMs);continue;}
   const error=Error(`Firestore commit rejected: HTTP ${response.status}, ${failure.status||'unknown'}, ${failure.message}`);error.releaseFailure=failure;error.classification=classification;throw error;
  }
 };
}
