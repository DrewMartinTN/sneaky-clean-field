import {apiFetch} from "@/lib/api";
"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from "@/components/ui/table";
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from "@/components/ui/sheet";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs";
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogCancel,AlertDialogAction} from "@/components/ui/alert-dialog";
import {dateLabel} from "./types";

type QuoteRow={id:string;name:string;phone:string;state:string;createdAt:string;deletedAt?:string;totalCents:number|null;needsPhotoReview:boolean;hasPendingRevision:boolean;needsScheduleReview:boolean};
type Vehicle={year:number;make:string;model:string;service:string;extras:Record<string,string>;notes:string;sizeNeedsReview?:boolean};
type Price={totalCents:number;subtotalCents:number;taxCents:number;vehicles:{index:number;totalCents:number;services:{name:string}[]}[]};
type Detail={id:string;state:string;createdAt:string;needsPhotoReview:boolean;needsScheduleReview:boolean;error:string|null;reviewNote:string|null;quote:Price|null;pendingQuote:Price|null;input:{name:string;phone:string;email:string;address:string;contactMethod:string;notes:string;vehicles:Vehicle[]};photos:{id:string;vehicle:number;angle:string}[];deposits:{id:string;vehicle:number;state:string;amountCents:number}[];bookings:{vehicle:number;requestedStartAt:string;booking:{startAt?:string;start_at?:string;status?:string}|null}[]};
const money=(cents:number)=>(cents/100).toLocaleString("en-US",{style:"currency",currency:"USD"});
const words=(value:string)=>value.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/[_-]/g," ");
const statuses:Record<string,string>={draft:"Started",processing:"Processing",review:"Needs review",quoted:"Quote ready",accepted:"Accepted",booked:"Booked"};
function Progress({item}:{item:{state:string;needsPhotoReview:boolean;needsScheduleReview:boolean;hasPendingRevision?:boolean;pendingQuote?:Price|null}}){return <div className="quote-progress"><span className="count-pill">{statuses[item.state]??words(item.state)}</span>{item.needsPhotoReview&&<small>Photo review needed</small>}{(item.hasPendingRevision||item.pendingQuote)&&<small>Updated quote awaiting acceptance</small>}{item.needsScheduleReview&&<small>Schedule review needed</small>}</div>}

export default function QuotesPanel(){
  const [quotes,setQuotes]=useState<QuoteRow[]|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false),[selected,setSelected]=useState<string|null>(null);
  const [view,setView]=useState("active"),[deleting,setDeleting]=useState<QuoteRow|null>(null),[saving,setSaving]=useState(false),[actionError,setActionError]=useState(""),[notice,setNotice]=useState(""),[truncated,setTruncated]=useState(false);
  const generation=useRef(0),mutating=useRef(false);
  const refresh=useCallback(async()=>{
    if(mutating.current)return;
    const requestId=++generation.current;setLoading(true);
    try{const r=await apiFetch(`/api/field/quotes?view=${view}`,{cache:"no-store"});const data=await r.json() as {estimates:QuoteRow[];truncated?:boolean;error?:string};if(!r.ok)throw Error(data.error||"Could not load quote requests.");if(requestId===generation.current){setQuotes(data.estimates);setTruncated(data.truncated===true);setError("");}}
    catch(e){if(requestId===generation.current)setError(e instanceof Error?e.message:"Could not load quote requests.");}
    finally{if(requestId===generation.current)setLoading(false);}
  },[view]);
  useEffect(()=>{void refresh();const timer=setInterval(()=>{if(document.visibilityState==="visible")void refresh();},30000);return()=>{clearInterval(timer);generation.current++;};},[refresh]);
  async function changeQuote(quote:QuoteRow,action:"trash"|"restore"){
    if(mutating.current)return;mutating.current=true;generation.current++;setLoading(false);setSaving(true);setActionError("");setNotice("");
    try{const r=await apiFetch(`/api/field/quotes/${encodeURIComponent(quote.id)}/${action}`,{method:"POST"});const result=await r.json() as {error?:string};if(!r.ok)throw Error(result.error||"Could not update this quote.");setQuotes(current=>current?.filter(q=>q.id!==quote.id)??null);setDeleting(null);setNotice(`${quote.name} ${action==="trash"?"moved to Trash. You can restore it from the Trash tab.":"restored to Active."}`);}
    catch(e){setActionError(e instanceof Error?e.message:"Could not update this quote.");}
    finally{mutating.current=false;setSaving(false);void refresh();}
  }
  return <section className="panel quotes-panel" id="quotes" aria-labelledby="quotes-heading">
    <div className="panel-heading"><div><p className="eyebrow">WEBSITE ESTIMATES</p><h2 id="quotes-heading">Quote requests {quotes&&<span className="count-pill">{quotes.length}{truncated?"+":""} {view==="trash"?"in Trash":"active"}</span>}</h2></div><Button variant="outline" disabled={loading||saving} onClick={()=>void refresh()} aria-label="Refresh quote requests">{loading?"Refreshing…":"Refresh"}</Button></div>
    <Tabs value={view} onValueChange={next=>{if(saving)return;generation.current++;setQuotes(null);setError("");setNotice("");setActionError("");setView(next);}}><TabsList className="quote-tabs" aria-label="Quote request lists"><TabsTrigger value="active" disabled={saving}>Active</TabsTrigger><TabsTrigger value="trash" disabled={saving}>Trash</TabsTrigger></TabsList><TabsContent value={view}>
    {error&&<p className="error-box" role="alert">{error}{quotes&&" Showing the last successful update."}</p>}
    {actionError&&!deleting&&<p className="error-box" role="alert">{actionError}</p>}{notice&&<p className="quote-feedback" role="status">{notice}</p>}
    {quotes?.length?<Table><TableHeader><TableRow>{["Customer",view==="trash"?"Deleted":"Received","Progress","Quote total","Actions"].map(label=><TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{quotes.map(q=><TableRow key={q.id}><TableCell><strong>{q.name}</strong><small>{q.phone}</small></TableCell><TableCell>{dateLabel(view==="trash"?q.deletedAt??q.createdAt:q.createdAt)}</TableCell><TableCell><Progress item={q}/></TableCell><TableCell>{q.totalCents==null?"Pending review":money(q.totalCents)}</TableCell><TableCell><div className="quote-actions"><Button variant="outline" onClick={()=>setSelected(q.id)} aria-label={`View quote for ${q.name}`}>View request</Button>{view==="trash"?<Button variant="outline" disabled={saving} onClick={()=>void changeQuote(q,"restore")} aria-label={`Restore quote for ${q.name}`}>Restore</Button>:<Button variant="ghost" className="quote-delete" disabled={saving} onClick={()=>{setActionError("");setDeleting(q);}} aria-label={`Delete quote for ${q.name}`}>Delete</Button>}</div></TableCell></TableRow>)}</TableBody></Table>:<p className="quote-empty" role="status">{quotes===null?(error?"Quote requests are temporarily unavailable.":"Loading saved quote requests…"):view==="trash"?"Trash is empty. Deleted quotes will appear here and can be restored.":"No active quote requests. New website submissions will appear here."}</p>}
    <p className="panel-note">{truncated?"Showing the latest 100 requests in this view. ":""}{view==="trash"?"Deleted quotes stay here until you restore them. Photos and records are kept; deleting does not cancel appointments or payments.":"Independent of the period and salesman filters below. Refreshes every 30 seconds. Totals include tax."}</p>
    </TabsContent></Tabs>
    <Sheet open={selected!==null} onOpenChange={open=>{if(!open)setSelected(null);}}><SheetContent className="quote-sheet"><SheetHeader><SheetTitle>Quote request</SheetTitle><SheetDescription>Customer details, vehicles and submitted photos.</SheetDescription></SheetHeader>{selected&&<QuoteDetail key={selected} id={selected}/>}</SheetContent></Sheet>
    <AlertDialog open={deleting!==null} onOpenChange={open=>{if(!open&&!saving)setDeleting(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this quote?</AlertDialogTitle><AlertDialogDescription>{deleting?.name}’s quote will move to Trash and leave the active list for your team. You can restore it later, including its photos. This does not cancel appointments, refund payments, or revoke the customer’s quote link.</AlertDialogDescription></AlertDialogHeader>{actionError&&<p className="error-box" role="alert">{actionError}</p>}<div className="dialog-actions"><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={saving} onClick={event=>{event.preventDefault();if(deleting)void changeQuote(deleting,"trash");}}>{saving?"Moving…":"Move to Trash"}</AlertDialogAction></div></AlertDialogContent></AlertDialog>
  </section>;
}

function QuoteDetail({id}:{id:string}){
  const [detail,setDetail]=useState<Detail|null>(null),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
  useEffect(()=>{const controller=new AbortController();setError("");void (async()=>{try{const r=await apiFetch(`/api/field/quotes/${encodeURIComponent(id)}`,{cache:"no-store",signal:controller.signal});const data=await r.json() as Detail&{error?:string};if(!r.ok)throw Error(data.error||"Could not load this quote.");if(!controller.signal.aborted)setDetail(data);}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Could not load this quote.");}})();return()=>controller.abort();},[id,attempt]);
  if(error)return <div role="alert" className="error-box">{error}<Button variant="outline" onClick={()=>setAttempt(n=>n+1)}>Retry</Button></div>;
  if(!detail)return <p role="status">Loading request…</p>;
  const input=detail.input;
  return <div className="quote-detail"><Progress item={detail}/><h3>{input.name}</h3><div className="quote-contact"><a href={`tel:${input.phone.replace(/[^+\d]/g,"")}`}>{input.phone}</a><a href={`mailto:${input.email}`}>{input.email}</a><p>{input.address}</p><p>Preferred contact: {words(input.contactMethod)}</p><small>Received {dateLabel(detail.createdAt)} · Central time</small></div>
    {detail.error&&<p className="notice">{detail.error}</p>}
    {input.notes&&<div><h3>Customer notes</h3><p className="notes">{input.notes}</p></div>}
    <div className="quote-price"><span>Quote total, including tax</span><strong>{detail.quote?money(detail.quote.totalCents):"Pending review"}</strong>{detail.quote&&<small>{money(detail.quote.subtotalCents)} + {money(detail.quote.taxCents)} tax</small>}{detail.pendingQuote&&<p>Proposed update: {money(detail.pendingQuote.totalCents)} · awaiting customer acceptance</p>}</div>
    {detail.reviewNote&&<div><h3>Team review note</h3><p className="notes">{detail.reviewNote}</p></div>}
    {input.vehicles.map((v,index)=>{const price=detail.quote?.vehicles.find(p=>p.index===index),photos=detail.photos.filter(p=>p.vehicle===index),extras=Object.entries(v.extras).filter(([,level])=>level!=="none");return <section className="quote-vehicle" key={index}><h3>{v.year} {v.make} {v.model}</h3><p>Requested service: {words(v.service)}</p>{extras.length>0&&<p>Extras: {extras.map(([name,level])=>`${words(name)} (${words(level)})`).join(", ")}</p>}{v.sizeNeedsReview&&<p className="overdue">Vehicle size needs team review.</p>}{v.notes&&<p className="notes">{v.notes}</p>}{price&&<div><strong>{money(price.totalCents)} including tax</strong><p>{price.services.map(s=>s.name).join(" · ")}</p></div>}
      {photos.length?<div className="quote-photos">{photos.map(p=><QuotePhoto key={p.id} estimateId={id} photo={p}/>)}</div>:<p className="quote-muted">No photos submitted for this vehicle.</p>}
      {detail.bookings.filter(b=>b.vehicle===index).map((b,i)=><p key={i}>{b.booking?"Appointment":"Requested appointment"}: {dateLabel(b.booking?.startAt??b.booking?.start_at??b.requestedStartAt)}{b.booking?.status?` · ${words(b.booking.status.toLowerCase())}`:" · confirmation pending"}</p>)}
      {detail.deposits.filter(d=>d.vehicle===index).map(d=><p key={d.id}>Deposit: {money(d.amountCents)} · {words(d.state)}</p>)}
    </section>;})}
    <p className="quote-muted">Review pricing and manage scheduling in the Sneaky Clean app under Estimates.</p>
  </div>;
}

function QuotePhoto({estimateId,photo}:{estimateId:string;photo:{id:string;angle:string}}){
  const [failed,setFailed]=useState(false);
  const [src,setSrc]=useState('');
  useEffect(()=>{const controller=new AbortController();let objectUrl='';void apiFetch(`/api/field/quotes/${encodeURIComponent(estimateId)}/photos/${encodeURIComponent(photo.id)}`,{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error('Photo unavailable.');const blob=await r.blob();if(controller.signal.aborted)return;objectUrl=URL.createObjectURL(blob);setSrc(objectUrl);}).catch(()=>{if(!controller.signal.aborted)setFailed(true);});return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};},[estimateId,photo.id]);
  return <figure>{failed?<p role="status">Photo unavailable. Reopen this request to retry.</p>:src?<a href={src} target="_blank" rel="noreferrer"><img src={src} alt={`${words(photo.angle)} vehicle photo`} loading="lazy" onError={()=>setFailed(true)}/></a>:<p role="status">Loading photo…</p>}<figcaption>{words(photo.angle)}</figcaption></figure>;
}
