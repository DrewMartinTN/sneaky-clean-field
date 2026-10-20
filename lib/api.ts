// Google credentials stay in memory and are sent only to this gateway.
export const API_ORIGIN='https://sneaky-clean-field-web-api.sneaky-clean-tn.workers.dev';
let credential='';
let expiresAt=0;
export function setCredential(token:string,expiration:number){credential=token;expiresAt=expiration;}
export function clearCredential(){credential='';expiresAt=0;}
export async function apiFetch(path:string,init:RequestInit={}){
  if(!path.startsWith('/api/field/'))throw Error('Invalid Field API path.');
  if(!credential||expiresAt<=Date.now()){
    clearCredential();window.dispatchEvent(new Event('field-signout'));
    throw Error('Your sign-in expired. Please sign in again.');
  }
  const headers=new Headers(init.headers);headers.set('Authorization','Bearer '+credential);
  const response=await fetch(API_ORIGIN+path,{...init,headers,cache:'no-store',credentials:'omit',redirect:'error'});
  if(response.status===401||response.status===403){clearCredential();window.dispatchEvent(new Event('field-signout'));}
  return response;
}
