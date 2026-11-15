/** Only safe error/request metadata: never credentials, headers or document bodies. */
const secretKey=/authorization|cookie|token|secret|password|private.?key|credential|client.?email|(?:^|_)writes$|stringValue|documentContents|requestBody|responseBody/iu;
export function sanitizeReleaseValue(value,depth=0){
 if(depth>8)return '[truncated]';
 if(typeof value==='string')return value.replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/gu,'[redacted key]').replace(/Bearer\s+[^\s"',]+/giu,'Bearer [redacted]').replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu,'[redacted JWT]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu,'[redacted email]').replace(/<(?:p|div|span|html|!doctype)\b[\s\S]*/giu,'[redacted document markup]').slice(0,8192);
 if(Array.isArray(value))return value.slice(0,50).map(v=>sanitizeReleaseValue(v,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!secretKey.test(key)).slice(0,100).map(([key,v])=>[key,sanitizeReleaseValue(v,depth+1)]));
 return value;
}
export function captureFirestoreFailure(response,payload,request){
 const headers={};for(const[k,v]of response.headers.entries())if(/^(?:retry-after|date|x-(?:goog-)?(?:quota|ratelimit|rate-limit|request-id))/iu.test(k))headers[k]=sanitizeReleaseValue(v);
 const error=payload?.error||{};
 return {httpStatus:response.status,googleCode:error.code??null,status:error.status??null,message:sanitizeReleaseValue(error.message||'Non-JSON API response; body omitted'),details:sanitizeReleaseValue(error.details||[]),headers,request:sanitizeReleaseValue(request)};
}
export function classifyFirestoreFailure(failure){
 const text=JSON.stringify([failure.status,failure.message,failure.details]).toLowerCase();
 if(/per.?day|daily|allocation|billing.?disabled|billing account|insufficient.?quota|free.?tier/u.test(text))return 'quota-exhausted';
 if(/rate.?limit|per.?minute|per.?second|capacity|temporar|try again|server overload/u.test(text))return 'temporary-throttling';
 if(failure.status==='RESOURCE_EXHAUSTED'||failure.httpStatus===429)return 'unknown-resource-exhaustion';
 return [500,502,503,504].includes(failure.httpStatus)?'ambiguous-server-failure':'non-retryable';
}
export function retryDelayMs(failure,attempt,{random=Math.random,now=Date.now}={}){
 const retry=failure.headers?.['retry-after'];const server=retry?(Number.isFinite(Number(retry))?Number(retry)*1000:Math.max(0,Date.parse(retry)-now())):0;
 const detailDelay=(failure.details||[]).find(d=>String(d['@type']).endsWith('/google.rpc.RetryInfo'))?.retryDelay;
 const detail=detailDelay&&/^\d+(?:\.\d+)?s$/u.test(detailDelay)?parseFloat(detailDelay)*1000:0;
 return Math.min(120000,Math.max(server,detail,10000*2**(attempt-1))*(1+random()*0.2));
}
