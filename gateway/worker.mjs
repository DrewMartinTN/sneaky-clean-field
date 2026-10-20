import {createRemoteJWKSet,jwtVerify} from 'jose';

const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const issuers=['https://accounts.google.com','accounts.google.com'];
const origins={FIELD:'https://sneaky-clean-field-sync.sneaky-clean-tn.workers.dev',SALES:'https://sneaky-clean-sales-assistant.sneaky-clean-tn.workers.dev'};
const split=value=>String(value??'').split(',').map(s=>s.trim()).filter(Boolean);

export async function verifyGoogleCredential(token,env,keys=googleKeys){
  const {payload}=await jwtVerify(token,keys,{audience:env.GOOGLE_CLIENT_ID,issuer:issuers,algorithms:['RS256'],maxTokenAge:'1 hour',clockTolerance:5});
  const email=typeof payload.email==='string'?payload.email.toLowerCase():'';
  if(!payload.sub||payload.email_verified!==true||!payload.exp||!payload.iat||payload.exp<=Date.now()/1000||payload.iat>Date.now()/1000+5||
    (payload.azp&&payload.azp!==env.GOOGLE_CLIENT_ID)||(!email.endsWith('@gmail.com')&&!payload.hd))throw Error('Invalid Google identity.');
  return {id:payload.sub,email,name:typeof payload.name==='string'?payload.name:email,expiresAt:payload.exp*1000,nonce:payload.nonce};
}

function route(path,method,search){
  const assistant=/^assistant\/(state|settings|test|run|leads\/[a-zA-Z0-9-]{1,100}\/draft|outbox\/[a-zA-Z0-9-]{1,150}\/(approve|reject)|threads\/[a-zA-Z0-9-]{1,100}\/(takeover|stop))$/.exec(path);
  if(assistant){
    const allowed=assistant[1]==='state'?['GET']:['POST'];
    return {service:'SALES',path:'/api/'+assistant[1],method,allowed};
  }
  const quoteAction=/^quotes\/([a-f0-9-]{36})\/(trash|restore)$/.exec(path);
  if(quoteAction)return {service:'FIELD',path:'/estimates/team/'+quoteAction[2],method:'POST',allowed:['POST'],body:JSON.stringify({id:quoteAction[1]})};
  const quote=/^quotes(?:\/([a-f0-9-]{36})(?:\/photos\/([a-zA-Z0-9-]{1,100}))?)?$/.exec(path);
  if(quote){
    const [,id,photoId]=quote;
    return {service:'FIELD',path:'/estimates/team/'+(photoId?'photo':id?'detail':'list'),method:'POST',allowed:['GET'],body:JSON.stringify({...id?{id}:{view:new URLSearchParams(search).get('view')??'active'},...photoId?{photoId}:{}}),photo:!!photoId};
  }
  if(/^(dashboard|reps|reps\/[a-zA-Z0-9-]{1,80}|sales|sales\/[a-f0-9]{64}\/(activate|refresh|cancel)|assignments|territories|followups)$/.test(path)){
    const allowed=path==='dashboard'||path==='sales'?['GET']:path.startsWith('reps/')?['PATCH']:path.startsWith('sales/')?['POST']:['GET','POST'];
    return {service:'FIELD',path:'/manager/'+path+search,method,allowed};
  }
  return null;
}

async function readBody(request){
  if(Number(request.headers.get('content-length'))>24000)throw Object.assign(Error('Request is too large.'),{status:413});
  if(!request.body)return undefined;
  const reader=request.body.getReader();let total=0;const chunks=[];
  try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>24000){await reader.cancel();throw Object.assign(Error('Request is too large.'),{status:413});}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return total?new TextDecoder().decode(bytes):undefined;
}

export function createGateway({verify=verifyGoogleCredential}={}){
  return {async fetch(request,env){
    const url=new URL(request.url),origin=request.headers.get('origin');
    const cors={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};
    const json=(data,status=200,extra={})=>Response.json(data,{status,headers:{...cors,...extra}});
    if(url.pathname==='/health'&&request.method==='GET')return json({ok:true,service:'Sneaky Clean Field web API'});
    if(!origin||!split(env.ALLOWED_ORIGINS).includes(origin))return json({error:'Invalid request origin.'},403);
    Object.assign(cors,{'Access-Control-Allow-Origin':origin});
    if(request.method==='OPTIONS'){
      const requested=request.headers.get('access-control-request-method');
      const headers=split(request.headers.get('access-control-request-headers')).map(h=>h.toLowerCase());
      if(!['GET','POST','PATCH'].includes(requested)||headers.some(h=>!['authorization','content-type'].includes(h)))return json({error:'Invalid preflight.'},403);
      return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'GET, POST, PATCH','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}});
    }
    if(!env.GOOGLE_CLIENT_ID)return json({error:'Google sign-in needs configuration.'},503);
    if(url.pathname==='/auth/config'&&request.method==='GET')return json({clientId:env.GOOGLE_CLIENT_ID});
    const selected=url.pathname.startsWith('/api/field/')?route(url.pathname.slice('/api/field/'.length),request.method,url.search):null;
    const session=url.pathname==='/auth/session'&&request.method==='POST';
    if(!session&&!selected)return json({error:'Not found.'},404);
    if(selected&&!selected.allowed.includes(request.method))return json({error:'Method not allowed.'},405,{Allow:selected.allowed.join(', ')});
    const authorization=request.headers.get('authorization')??'';
    if(!/^Bearer [A-Za-z0-9_.-]{100,8192}$/.test(authorization))return json({error:'Sign in with Google to continue.'},401);
    let identity;
    try{identity=await verify(authorization.slice(7),env);}catch(error){
      if(error instanceof TypeError||error.code==='ERR_JWKS_TIMEOUT')return json({error:'Google verification is temporarily unavailable. Try again.'},503);
      return json({error:'Your sign-in expired or could not be verified. Please sign in again.'},401);
    }
    if(!split(env.MANAGER_EMAILS).map(e=>e.toLowerCase()).includes(identity.email))return json({error:'This Google account is not approved for Field.'},403);
    if(session)return json(identity);
    if(!env.FIELD_MANAGER_KEY||!env[selected.service])return json({error:'The Field server connection needs configuration.'},503);
    try{
      const incoming=['GET','HEAD'].includes(request.method)?undefined:await readBody(request);
      const upstream=await env[selected.service].fetch(origins[selected.service]+selected.path,{method:selected.method,headers:{Authorization:'Bearer '+env.FIELD_MANAGER_KEY,'Content-Type':'application/json'},body:selected.body??incoming,redirect:'manual',signal:AbortSignal.timeout(25000)});
      if(upstream.status>=300&&upstream.status<400){await upstream.body?.cancel();return json({error:'Unexpected server response. Try Refresh.'},502);}
      if(upstream.status===401){await upstream.body?.cancel();return json({error:'The Field server connection needs attention.'},503);}
      return new Response(upstream.body,{status:upstream.status,headers:{...cors,'Content-Type':selected.photo&&upstream.ok?'image/jpeg':'application/json'}});
    }catch(error){return json({error:error.status===413?error.message:'Could not reach the Field server. Refresh to check its status.'},error.status===413?413:503);}
  }};
}
export default createGateway();
