import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SignJWT,generateKeyPair,exportJWK,createLocalJWKSet} from 'jose';
import {createGateway,verifyGoogleCredential} from '../gateway/worker.mjs';

const origin='https://field.sneakycleantn.com';
const client='field-test.apps.googleusercontent.com';
const {publicKey,privateKey}=await generateKeyPair('RS256');
const jwk=await exportJWK(publicKey);jwk.kid='test-key';
const keys=createLocalJWKSet({keys:[jwk]});
const gateway=createGateway({verify:(token,env)=>verifyGoogleCredential(token,env,keys)});
async function token(claims={},options={}){
  return new SignJWT({email:'manager@gmail.com',email_verified:true,name:'Manager',nonce:'browser-nonce',...claims})
    .setProtectedHeader({alg:'RS256',kid:'test-key'}).setSubject('google-user-1')
    .setIssuer(options.issuer??'https://accounts.google.com').setAudience(options.audience??client)
    .setIssuedAt(options.iat??Math.floor(Date.now()/1000)).setExpirationTime(options.exp??'1h').sign(privateKey);
}
function fixture(){
  const calls=[];
  const upstream={fetch:async(url,init)=>{calls.push({url,init});return Response.json({ok:true});}};
  const env={GOOGLE_CLIENT_ID:client,MANAGER_EMAILS:'manager@gmail.com',ALLOWED_ORIGINS:origin,FIELD_MANAGER_KEY:'server-only-manager-key',FIELD:upstream,SALES:upstream};
  return {env,calls};
}
function request(path,{credential,method='GET',body,headers={},...rest}={}){
  return new Request('https://gateway.test'+path,{method,headers:{Origin:origin,...credential?{Authorization:'Bearer '+credential}:{},...headers},...body!==undefined?{body}:{},...rest});
}
async function run(path,options={},f=fixture()){return {response:await gateway.fetch(request(path,options),f.env),...f};}

test('missing or invalid Google tokens never reach private services',async()=>{
  for(const credential of [undefined,'x'.repeat(200)]){
    const {response,calls}=await run('/api/field/dashboard',{credential});assert.equal(response.status,401);assert.equal(calls.length,0);
  }
});
test('valid Google identity returns only verified identity and expiry',async()=>{
  const {response,calls}=await run('/auth/session',{method:'POST',credential:await token()});
  assert.equal(response.status,200);assert.equal(calls.length,0);const data=await response.json();assert.equal(data.email,'manager@gmail.com');assert.equal(data.id,'google-user-1');assert.equal(data.nonce,'browser-nonce');assert.ok(data.expiresAt>Date.now());assert.equal(data.token,undefined);
});
test('wrong audience, issuer, expired, future and unverified tokens are rejected',async()=>{
  for(const credential of [await token({}, {audience:'another-client'}),await token({}, {issuer:'https://attacker.test'}),await token({}, {exp:Math.floor(Date.now()/1000)-60}),await token({}, {iat:Math.floor(Date.now()/1000)+120}),await token({email_verified:false}),await token({azp:'another-client'})]){
    const {response,calls}=await run('/api/field/dashboard',{credential});assert.equal(response.status,401);assert.equal(calls.length,0);
  }
});
test('a valid Google login does not grant manager access to unapproved email',async()=>{
  const {response,calls}=await run('/api/field/dashboard',{credential:await token({email:'other@gmail.com'})});assert.equal(response.status,403);assert.equal(calls.length,0);
});
test('non-Gmail identities require an authoritative hosted-domain claim',async()=>{
  const f=fixture();f.env.MANAGER_EMAILS='manager@example.com';
  const denied=await run('/auth/session',{method:'POST',credential:await token({email:'manager@example.com'})},f);assert.equal(denied.response.status,401);
  const allowed=await run('/auth/session',{method:'POST',credential:await token({email:'manager@example.com',hd:'example.com'})},f);assert.equal(allowed.response.status,200);
});
test('CORS permits only configured origins and never enables cookies',async()=>{
  const {response}=await run('/auth/config');assert.equal(response.headers.get('access-control-allow-origin'),origin);assert.equal(response.headers.get('access-control-allow-credentials'),null);assert.equal(response.headers.get('cache-control'),'no-store');
  for(const bad of ['https://evil.test','null',origin+'.evil.test']){
    const denied=await run('/auth/config',{headers:{Origin:bad}});assert.equal(denied.response.status,403);assert.equal(denied.response.headers.get('access-control-allow-origin'),null);
  }
});
test('preflight validates method and headers without accessing services',async()=>{
  const allowed=await run('/api/field/dashboard',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization,content-type'}});assert.equal(allowed.response.status,204);assert.equal(allowed.calls.length,0);
  const denied=await run('/api/field/dashboard',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'DELETE'}});assert.equal(denied.response.status,403);
});
test('verified dashboard access uses the server manager key and preserves filters',async()=>{
  const credential=await token();const {response,calls}=await run('/api/field/dashboard?range=7&rep=rep-1',{credential});assert.equal(response.status,200);assert.equal(calls.length,1);assert.equal(calls[0].url,'https://sneaky-clean-field-sync.sneaky-clean-tn.workers.dev/manager/dashboard?range=7&rep=rep-1');assert.equal(calls[0].init.headers.Authorization,'Bearer server-only-manager-key');assert.ok(!JSON.stringify(calls).includes(credential));
});
test('private quote photos are read through the authenticated service only',async()=>{
  const f=fixture();f.env.FIELD={fetch:async(url,init)=>{f.calls.push({url,init});return new Response(new Uint8Array([255,216,255]),{headers:{'content-type':'image/jpeg'}});}};
  const id='12345678-1234-1234-1234-123456789012';const {response,calls}=await run('/api/field/quotes/'+id+'/photos/photo-1',{credential:await token()},f);
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/jpeg');assert.equal(calls[0].url,'https://sneaky-clean-field-sync.sneaky-clean-tn.workers.dev/estimates/team/photo');assert.deepEqual(JSON.parse(calls[0].init.body),{id,photoId:'photo-1'});
});
test('sales controls preserve their existing service and method boundary',async()=>{
  const {response,calls}=await run('/api/field/assistant/settings',{credential:await token(),method:'POST',body:JSON.stringify({mode:'review'})});assert.equal(response.status,200);assert.equal(calls[0].url,'https://sneaky-clean-sales-assistant.sneaky-clean-tn.workers.dev/api/settings');assert.equal(calls[0].init.method,'POST');assert.deepEqual(JSON.parse(calls[0].init.body),{mode:'review'});
});
test('unknown routes, unsupported methods and oversized writes never reach services',async()=>{
  const credential=await token();
  const missing=await run('/api/field/arbitrary-secret',{credential});assert.equal(missing.response.status,404);assert.equal(missing.calls.length,0);
  const method=await run('/api/field/assistant/run',{credential});assert.equal(method.response.status,405);assert.equal(method.calls.length,0);
  const large=await run('/api/field/territories',{credential,method:'POST',body:'x'.repeat(24001)});assert.equal(large.response.status,413);assert.equal(large.calls.length,0);
});
test('upstream redirects and revoked manager keys do not leak credentials',async()=>{
  for(const status of [302,401]){
    const f=fixture();f.env.FIELD={fetch:async()=>new Response(null,{status,headers:{Location:'https://evil.test'}})};
    const {response}=await run('/api/field/dashboard',{credential:await token()},f);assert.equal(response.status,status===302?502:503);assert.equal(response.headers.get('location'),null);assert.ok(!(await response.text()).includes(f.env.FIELD_MANAGER_KEY));
  }
});
