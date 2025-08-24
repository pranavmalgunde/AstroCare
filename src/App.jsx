
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Activity,
  Camera,
  Mic,
  Bell,
  CheckCircle2,
  Loader2,
  BarChart3,
  MessageSquare,
  ShieldCheck,
  Cpu,
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

// Inline logo: cat over heart with medical plus (white on blue)
const LogoMark = ({ className = "h-6 w-6" }) => (
  <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path d="M32 58C12 44 4 28 16 18c8-6 16-2 16 4 0-6 8-10 16-4 12 10 4 26-16 40Z" fill="white"/>
    <rect x="28" y="29" width="8" height="2" fill="white"/>
    <rect x="31" y="26" width="2" height="8" fill="white"/>
    <path d="M22 16l6-6v8z" fill="white"/>
    <path d="M42 16l-6-6v8z" fill="white"/>
  </svg>
);

// UI primitives
const Button = ({ className = "", disabled, onClick, children, type = "button" }) => (
  <button type={type} disabled={disabled} onClick={onClick} className={`px-4 py-2 rounded-2xl shadow hover:shadow-md transition font-medium border border-zinc-200 disabled:opacity-50 ${className}`}>{children}</button>
);
const Card = ({ children, className = "" }) => (<div className={`bg-white rounded-2xl shadow-sm border border-zinc-200 p-4 ${className}`}>{children}</div>);
const Badge = ({ children, className = "" }) => (<span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${className}`}>{children}</span>);

function useClock(){ const [now,setNow]=useState(Date.now()); useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000); return()=>clearInterval(t);},[]); return now; }
function fmt(ts){ return new Date(ts).toLocaleString(); }

const tips = {
  fall: "Detected a potential fall. If unresponsive, call emergency services. If conscious, assess for head injury and avoid sudden movements.",
  breathing: "Irregular breathing detected. Sit upright, monitor airway, follow any rescue plan, and seek medical advice if it persists.",
  speech: "Slurred speech detected. Do a FAST check (Face droop, Arm weakness, Speech difficulty, Time to call 911)."
};

export default function App(){
  const [monitoring,setMonitoring]=useState(false);
  const [cameraOn,setCameraOn]=useState(false);
  const [micOn,setMicOn]=useState(false);
  const [micLevel,setMicLevel]=useState(0);
  const [events,setEvents]=useState([]); // {id,type,label,ts,resolved}
  const [notes,setNotes]=useState("");
  const [chatInput,setChatInput]=useState("");
  const [chat,setChat]=useState([]);

  const videoRef=useRef(null);
  const audioStreamRef=useRef(null);
  const audioCtxRef=useRef(null);
  const analyserRef=useRef(null);
  const rafRef=useRef(null);

  const now=useClock();

  // Camera
  async function toggleCamera(){
    if(cameraOn){ const s=videoRef.current?.srcObject; s?.getTracks()?.forEach(t=>t.stop()); if(videoRef.current) videoRef.current.srcObject=null; setCameraOn(false); return; }
    try{ const stream=await navigator.mediaDevices.getUserMedia({video:true}); if(videoRef.current) videoRef.current.srcObject=stream; setCameraOn(true);}catch(e){ alert("Could not access camera: "+e.message); }
  }

  // Microphone loudness heuristic
  async function toggleMic(){
    if(micOn){ stopMic(); setMicOn(false); return; }
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      audioStreamRef.current=stream; const ctx=new (window.AudioContext||window.webkitAudioContext)(); audioCtxRef.current=ctx;
      const src=ctx.createMediaStreamSource(stream); const an=ctx.createAnalyser(); an.fftSize=2048; analyserRef.current=an; src.connect(an);
      const data=new Uint8Array(an.frequencyBinCount);
      const loop=()=>{ an.getByteTimeDomainData(data); let sum=0; for(let i=0;i<data.length;i++){ const v=(data[i]-128)/128; sum+=v*v; } const rms=Math.sqrt(sum/data.length); const lvl=Math.min(1,rms*4); setMicLevel(lvl); if(monitoring && lvl>0.5 && Math.random()<0.02) triggerEvent("breathing"); rafRef.current=requestAnimationFrame(loop); };
      rafRef.current=requestAnimationFrame(loop); setMicOn(true);
    }catch(e){ alert("Could not access microphone: "+e.message); }
  }
  function stopMic(){ if(rafRef.current) cancelAnimationFrame(rafRef.current); const s=audioStreamRef.current; s?.getTracks()?.forEach(t=>t.stop()); audioStreamRef.current=null; audioCtxRef.current?.close(); audioCtxRef_current=null; }

  useEffect(()=>()=>{ if(rafRef.current) cancelAnimationFrame(rafRef.current); const s=audioStreamRef.current; s?.getTracks()?.forEach(t=>t.stop()); audioCtxRef?.current?.close?.(); },[]);

  function triggerEvent(type){ const labels={fall:"Possible fall detected",breathing:"Irregular breathing pattern detected",speech:"Slurred speech detected"}; const id=Math.random().toString(36).slice(2); setEvents(prev=>[{id,type,label:labels[type],ts:Date.now(),resolved:false},...prev]); }
  const risk=useMemo(()=>{ const cutoff=Date.now()-24*3600*1000; const w={fall:5,breathing:3,speech:4}; const s=events.filter(e=>e.ts>=cutoff && !e.resolved).reduce((a,e)=>a+(w[e.type]||1),0); return Math.min(100,Math.round(s*8)); },[events]);
  const trend=useMemo(()=>{ const bins=[]; for(let i=11;i>=0;i--){ const t=Date.now()-i*3600*1000; const h=new Date(t).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}); bins.push({hour:h,count:0}); } events.forEach(e=>{ const h=new Date(e.ts).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}); const b=bins.find(x=>x.hour===h); if(b) b.count+=1;}); return bins; },[events,now]);

  function resolveEvent(id){ setEvents(prev=>prev.map(e=>e.id===id?{...e,resolved:true}:e)); }
  function sendChat(){ if(!chatInput.trim()) return; const txt=chatInput.trim(); setChat(c=>[...c,{role:"user",text:txt}]); setChatInput(""); let reply="I am here to help. If this is an emergency, call local emergency services."; const lower=txt.toLowerCase(); if(lower.includes("fall")) reply=tips.fall; else if(lower.includes("breath")) reply=tips.breathing; else if(lower.includes("speech")||lower.includes("slur")) reply=tips.speech; setTimeout(()=>setChat(c=>[...c,{role:"assistant",text:reply}]),400); }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 text-zinc-800 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-blue-600 grid place-items-center shadow overflow-hidden"><LogoMark className="h-6 w-6"/></div>
            <div>
              <h1 className="text-2xl font-bold">AstroCare - Real-Time AI Health Companion</h1>
              <p className="text-sm text-zinc-600">Detect - Connect - Personalize</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="border-zinc-300 bg-white">Demo Only - Not Medical Advice</Badge>
          </div>
        </div>

        {/* Controls */}
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={()=>setMonitoring(m=>!m)}>{monitoring? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin"/> Stop Monitoring</span> : <span className="inline-flex items-center gap-2"><Activity className="h-4 w-4"/> Start Monitoring</span>}</Button>
            <Button className={`${cameraOn?"bg-zinc-900 text-white":"bg-white"}`} onClick={toggleCamera}><span className="inline-flex items-center gap-2"><Camera className="h-4 w-4"/> {cameraOn?"Camera On":"Enable Camera"}</span></Button>
            <Button className={`${micOn?"bg-zinc-900 text-white":"bg-white"}`} onClick={toggleMic}><span className="inline-flex items-center gap-2"><Mic className="h-4 w-4"/> {micOn?"Mic On":"Enable Mic"}</span></Button>
            <div className="flex-1"/>
            <Button className="bg-white" onClick={()=>triggerEvent("fall")}><span className="inline-flex items-center gap-2"><AlertTriangle className="h-4 w-4"/> Simulate Fall</span></Button>
            <Button className="bg-white" onClick={()=>triggerEvent("speech")}><span className="inline-flex items-center gap-2"><MessageSquare className="h-4 w-4"/> Simulate Slurred Speech</span></Button>
            <Button className="bg-white" onClick={()=>triggerEvent("breathing")}><span className="inline-flex items-center gap-2"><Activity className="h-4 w-4"/> Simulate Irregular Breathing</span></Button>
          </div>
        </Card>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live monitor & risk */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-lg flex items-center gap-2"><Cpu className="h-5 w-5"/> Live Monitor</h2>
                <div className="flex items-center gap-3"><Badge className="border-zinc-300 bg-white"><Mic className="h-4 w-4"/> Mic level</Badge><div className="w-48 h-3 bg-zinc-200 rounded-full overflow-hidden"><div className="h-full bg-blue-600" style={{width:`${Math.round(micLevel*100)}%`}}/></div></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="aspect-video bg-black/5 rounded-xl border border-zinc-200 grid place-items-center overflow-hidden relative">
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"/>
                    {!cameraOn && <div className="absolute text-sm text-zinc-600 p-4 text-center">Camera preview will appear here</div>}
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">Webcam used locally for demo. No video or audio leaves your device in this prototype.</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between"><h3 className="font-medium">Personalized Risk (last 24h)</h3><Badge className={`border-zinc-300 ${/* dynamic colors handled inline */""}`}>{risk}/100</Badge></div>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{top:10,right:10,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="hour" tick={{fontSize:12}}/><YAxis allowDecimals={false} tick={{fontSize:12}}/><Tooltip/><Line type="monotone" dataKey="count" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Care Plan Notes</label>
                    <textarea className="w-full mt-1 rounded-xl border border-zinc-300 p-3 outline-none focus:ring-2 focus:ring-blue-300" rows={4} placeholder="Allergies, rescue meds, provider contact, preferred hospital, etc." value={notes} onChange={e=>setNotes(e.target.value)}/>
                  </div>
                </div>
              </div>
            </Card>

            {/* Alerts */}
            <Card>
              <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-lg flex items-center gap-2"><Bell className="h-5 w-5"/> Alerts</h2><Badge className="border-zinc-300 bg-white">{events.filter(e=>!e.resolved).length} active</Badge></div>
              <div className="space-y-3">
                {events.length===0 && <div className="text-sm text-zinc-500">No alerts yet. Simulate an event or enable mic/camera and start monitoring.</div>}
                {events.map(e=> (
                  <div key={e.id} className={`flex items-start gap-3 p-3 rounded-xl border ${e.resolved?"bg-green-50 border-green-200":"bg-amber-50 border-amber-200"}`}>
                    {e.resolved? <CheckCircle2 className="h-5 w-5 text-green-700"/> : <AlertTriangle className="h-5 w-5 text-amber-700"/>}
                    <div className="flex-1"><div className="font-medium">{e.label}</div><div className="text-xs text-zinc-600">{fmt(e.ts)}</div><div className="text-sm mt-2 text-zinc-700">{tips[e.type]}</div></div>
                    <div className="flex items-center gap-2">{!e.resolved && <Button className="bg-white" onClick={()=>setEvents(prev=>prev.map(x=>x.id===e.id?{...x,resolved:true}:x))}><span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4"/> Resolve</span></Button>}<Button className="bg-white" onClick={()=>alert("(Demo) Notifying caregiver and provider...")}>Notify</Button></div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Assistant */}
          <div className="space-y-6">
            <Card>
              <div className="flex items-center justify-between"><h2 className="font-semibold text-lg flex items-center gap-2"><MessageSquare className="h-5 w-5"/> Assistant</h2></div>
              <div className="mt-3 h-72 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2">
                {chat.length===0 && <p className="text-sm text-zinc-500">Ask about an alert (example: irregular breathing help, what do I do after a fall?).</p>}
                {chat.map((m,i)=> (<div key={i} className={`max-w-[85%] p-2 rounded-xl ${m.role==="user"?"bg-blue-600 text-white ml-auto":"bg-white border"}`}><div className="text-sm whitespace-pre-wrap">{m.text}</div></div>))}
              </div>
              <div className="mt-3 flex items-center gap-2"><input className="flex-1 rounded-xl border border-zinc-300 p-3 outline-none focus:ring-2 focus:ring-blue-300" placeholder="Type a message..." value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter" && sendChat()}/><Button className="bg-blue-600 text-white" onClick={sendChat}>Send</Button></div>
            </Card>

            <Card>
              <h2 className="font-semibold text-lg flex items-center gap-2"><BarChart3 className="h-5 w-5"/> Judge Notes</h2>
              <div className="mt-2 text-sm text-zinc-700 space-y-1">
                <p><strong>Detect:</strong> mic loudness heuristic plus simulated events to demonstrate the pipeline.</p>
                <p><strong>Connect:</strong> alerts with notify action and an assistant for immediate guidance.</p>
                <p><strong>Personalize:</strong> risk score, 12 hour trends, and editable care plan notes.</p>
                <p><strong>Privacy:</strong> demo runs locally; no media leaves the device.</p>
              </div>
            </Card>
          </div>
        </div>

        <div className="text-xs text-zinc-500 text-center pt-4">Built for NeuraVia Hacks. This demo is for educational purposes only and not a medical device.</div>
      </div>
    </div>
  );
}
