import {StrictMode,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from './app/dashboard';
import AssistantPanel from './app/assistant-panel';
import FieldHeader from './app/field-header';
import {API_ORIGIN,clearCredential,setCredential} from './lib/api';
import 'leaflet/dist/leaflet.css';
import './app/globals.css';

type Identity={email:string;name:string;expiresAt:number;nonce?:string};
type GoogleIdentity={initialize:(options:{client_id:string;callback:(result:{credential:string})=>void;nonce:string;auto_select:boolean})=>void;renderButton:(element:HTMLElement,options:object)=>void;disableAutoSelect:()=>void};
declare global {interface Window {google?:{accounts:{id:GoogleIdentity}}}}
let googleScript:Promise<void>|undefined;
function loadGoogle(){
  return googleScript??=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
    script.onload=()=>resolve();script.onerror=()=>{googleScript=undefined;script.remove();reject(Error('Google sign-in could not load. Please try again.'));};document.head.append(script);
  });
}
function App(){
  const [identity,setIdentity]=useState<Identity|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  const [sales,setSales]=useState(location.hash==='#/sales'||/^\/sales\/?$/.test(location.pathname));
  const button=useRef<HTMLDivElement>(null);
  useEffect(()=>{const listener=()=>setSales(location.hash==='#/sales');window.addEventListener('hashchange',listener);return()=>window.removeEventListener('hashchange',listener);},[]);
  useEffect(()=>{document.title=sales?'Sales Assistant · Sneaky Clean Field':'Sneaky Clean — Field Desk';},[sales]);
  useEffect(()=>{
    const signOut=()=>{clearCredential();setIdentity(null);window.google?.accounts.id.disableAutoSelect();};
    window.addEventListener('field-signout',signOut);
    const timer=identity?setTimeout(signOut,Math.max(0,identity.expiresAt-Date.now())):undefined;
    return()=>{window.removeEventListener('field-signout',signOut);clearTimeout(timer);};
  },[identity]);
  useEffect(()=>{
    if(identity)return;let cancelled=false;setError('');
    const nonce=crypto.randomUUID()+crypto.randomUUID();
    void Promise.all([loadGoogle(),fetch(API_ORIGIN+'/auth/config',{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)}).then(async r=>{if(!r.ok)throw Error('Sign-in is temporarily unavailable. Please try again.');return r.json() as Promise<{clientId:string}>;})]).then(([,config])=>{
      if(cancelled||!button.current||!window.google)return;
      window.google.accounts.id.initialize({client_id:config.clientId,nonce,auto_select:false,callback:result=>{
        setBusy(true);setError('');
        void fetch(API_ORIGIN+'/auth/session',{method:'POST',headers:{Authorization:'Bearer '+result.credential},credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)}).then(async r=>{
          const data=await r.json() as Identity&{error?:string};if(!r.ok)throw Error(data.error||'This Google account cannot access Field.');
          if(data.nonce!==nonce)throw Error('Sign-in could not be verified. Please try again.');
          if(cancelled)return;setCredential(result.credential,data.expiresAt);setBusy(false);setIdentity(data);
        }).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Could not sign in.');}).finally(()=>{if(!cancelled)setBusy(false);});
      }});
      window.google.accounts.id.renderButton(button.current,{theme:'filled_blue',size:'large',text:'signin_with',shape:'rectangular',width:280});
    }).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Could not load sign-in.');});
    return()=>{cancelled=true;};
  },[identity,retry]);
  if(!identity)return <main className="signin"><span className="brand-mark">SC</span><p className="eyebrow">SNEAKY CLEAN · FIELD DESK</p><h1>Your team, in view.</h1><p>Sign in with your approved Google account to open Field.</p><div ref={button} className="google-signin" aria-label="Google sign-in"/>{busy&&<p role="status">Verifying your account…</p>}{error&&<div className="error-box" role="alert">{error} <button type="button" onClick={()=>setRetry(n=>n+1)}>Try again</button></div>}</main>;
  return sales?<div className="desk-shell"><FieldHeader sales/><main className="workspace sales-workspace"><div className="heading-row"><div><p className="eyebrow">MURFREESBORO & RUTHERFORD COUNTY</p><h1>Sales assistant</h1><p className="subhead">Local opportunities, conversations, and the next step.</p></div></div><AssistantPanel/></main></div>:<Dashboard/>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
