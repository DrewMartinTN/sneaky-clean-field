"use client";
import {useEffect,useRef,useState} from "react";
import type {Map as LeafletMap,LayerGroup,LatLngTuple} from "leaflet";
import {Door,statusColors,statusNames} from "./types";
export default function CoverageMap({doors,onSelect}:{doors:Door[];onSelect:(door:Door)=>void}){
  const element=useRef<HTMLDivElement>(null),map=useRef<LeafletMap|null>(null),layer=useRef<LayerGroup|null>(null);
  const fitted=useRef("");
  const select=useRef(onSelect);select.current=onSelect;
  const [ready,setReady]=useState(false),[error,setError]=useState(false);
  useEffect(()=>{let disposed=false;let resize:ResizeObserver|undefined;
    import("leaflet").then(L=>{if(disposed||!element.current)return;
      const m=L.map(element.current,{scrollWheelZoom:false}).setView([35.8456,-86.3903],13);map.current=m;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(m).on("tileerror",()=>setError(true)).on("load",()=>setError(false));
      layer.current=L.layerGroup().addTo(m);resize=new ResizeObserver(()=>m.invalidateSize());resize.observe(element.current);setReady(true);
    }).catch(()=>setError(true));return()=>{disposed=true;resize?.disconnect();map.current?.remove();map.current=null;layer.current=null;};
  },[]);
  useEffect(()=>{if(!ready)return;import("leaflet").then(L=>{if(!map.current||!layer.current)return;layer.current.clearLayers();const coordinates:LatLngTuple[]=[];
    for(const door of doors){const point:[number,number]=[door.latitude,door.longitude];coordinates.push(point);const label=document.createElement("span");label.textContent=`${door.address} · ${statusNames[door.status]??door.status}`;L.circleMarker(point,{radius:8,fillColor:statusColors[door.status]??"#888",color:"#fff",weight:2,fillOpacity:1}).bindTooltip(label).on("click",()=>select.current(door)).addTo(layer.current);}
    const fitKey=JSON.stringify(coordinates);if(coordinates.length&&fitKey!==fitted.current){map.current.fitBounds(L.latLngBounds(coordinates),{padding:[38,38],maxZoom:16});fitted.current=fitKey;}
  });},[doors,ready]);
  return <div className="map-wrap"><div ref={element} className="coverage-map" aria-label="Map of saved doors and their latest outcomes"/>{error&&<p className="map-notice">Map tiles could not load. Door records remain available below.</p>}</div>;
}
