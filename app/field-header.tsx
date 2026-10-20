import {ShieldCheck} from "lucide-react";

export default function FieldHeader({sales=false}:{sales?:boolean}){
  return <header className="topbar field-topbar"><a className="brand" href="#/"><span className="brand-mark">SC</span><span>SNEAKY CLEAN<small>FIELD DESK</small></span></a><nav className="field-workspaces" aria-label="Field workspaces"><a href="#/" aria-current={!sales?'page':undefined}>Field operations</a><a href="#/sales" aria-current={sales?'page':undefined}>Sales assistant</a></nav><div className="manager-label"><ShieldCheck size={17}/><span>Manager</span><button type="button" onClick={()=>window.dispatchEvent(new Event('field-signout'))}>Sign out</button></div></header>;
}
