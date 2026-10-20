"use client";
import {useEffect,useRef} from "react";
import type {Snapshot} from "./types";
type Context={registerTool:(tool:{name:string;description:string;inputSchema:object;annotations:object;execute:(input:unknown)=>unknown},options:{signal:AbortSignal})=>void|Promise<void>};
export function useProgressTool(snapshot:Snapshot|null){
  const current=useRef(snapshot);current.current=snapshot;
  useEffect(()=>{
    const context=(document as Document&{modelContext?:Context}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    try{void Promise.resolve(context.registerTool({name:"read_field_progress",description:"Read the currently displayed Sneaky Clean canvassing totals and each rep's last sync. Does not create, edit, or disable accounts.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){
      if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).length)throw Error("Pass an empty object.");
      const data=current.current;if(!data)throw Error("Team progress has not loaded yet.");
      return {asOf:data.generatedAt,rangeStart:data.rangeStart,timeZone:"America/Chicago",summary:data.summary,reps:data.reps.map(r=>({name:r.name,lastSync:r.lastSync,disabled:!!r.disabled,doors:r.doors??0,visits:r.visits??0,interested:r.interested??0,bookings:r.bookings}))};
    }},{signal:lifecycle.signal})).catch(()=>{});}catch{/* Ordinary browser UI remains available. */}
    return()=>lifecycle.abort();
  },[]);
}
