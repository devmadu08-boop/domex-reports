import { useEffect, useState } from "react";
import { Gauge, Plus, RefreshCw, Download, LogOut, Save, Search } from "lucide-react";
import { todayIso } from "../utils/date.js";
import { meterMetrics, fuelEfficiency, validateMeterChanges } from "../../shared/meterSheet.js";
import "./SpeedMeterWorkspace.css";

const blank = { status: "WORKING", in_time: "08:00", out_time: "17:00", in_meter: "", out_meter: "", manual_km: "", meter_broken: false, route: "", description: "", add_km: "" };
function newMonth(month,price) {
  const count=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate(),days={};
  for(let i=1;i<=count;i++){const day=String(i).padStart(2,"0"),date=month+"-"+day;if(new Date(date+"T12:00:00Z").getUTCDay()===0)days[day]={...blank,date,status:"SUNDAY"};}
  return {petrol_price:price||"300",days};
}
export default function SpeedMeterWorkspace() {
  const [auth,setAuth]=useState(()=>{try{return JSON.parse(sessionStorage.getItem("domex-meter-session"));}catch{return null;}});
  const [rows,setRows]=useState([]),[selected,setSelected]=useState(null),[date,setDate]=useState(todayIso());
  const [draft,setDraft]=useState(blank),[dirty,setDirty]=useState(false),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[query,setQuery]=useState("");
  const [credentials,setCredentials]=useState({username:"",password:""}),[account,setAccount]=useState(null);
  async function api(route, body, method="POST") {
    const response=await fetch("/api/meter-workspace"+route,{method:body?method:"GET",headers:{"Content-Type":"application/json",...(auth?{Authorization:"Bearer "+auth.token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    const value=await response.json();
    if(!response.ok){if(response.status===401&&route!=="/login"){setAuth(null);sessionStorage.removeItem("domex-meter-session");}throw new Error(value.error||"Meter request failed.");}
    return value;
  }
  async function refresh(){const data=await api("/riders");setRows(data.rows.filter(r=>!r.deleted));}
  useEffect(()=>{
    if(!auth)return;
    let active=true;
    const load=()=>api("/riders").then(v=>{if(active)setRows(v.rows.filter(r=>!r.deleted));}).catch(e=>{if(active)setMessage(e.message);});
    load();const timer=setInterval(load,10000);window.addEventListener("online",load);
    return()=>{active=false;clearInterval(timer);window.removeEventListener("online",load);};
  },[auth?.token]);
  useEffect(()=>{if(auth&&selected&&dirty)localStorage.setItem("domex-meter-draft:"+auth.user.username,JSON.stringify({selected,date,draft}));},[draft,dirty,selected,date,auth?.user.username]);
  async function run(action){setBusy(true);setMessage("");try{await action();}catch(e){setMessage(e.message+(dirty?" Unsaved form data is kept on this device.":""));}finally{setBusy(false);}}
  function choose(record,nextDate=date) {
    if(dirty&&!confirm("Leave the unsaved entry? A recovery draft is kept on this device."))return;
    setSelected(structuredClone(record));setDate(nextDate);
    const selectedSheet=record.rider.months?.[nextDate.slice(0,7)]||newMonth(nextDate.slice(0,7),record.rider.petrol_price);
    setDraft({...blank,...selectedSheet.days?.[nextDate.slice(8)]});
    setDirty(false);
  }
  function change(field,value){setDraft(v=>({...v,[field]:value}));setDirty(true);}
  const month=date.slice(0,7), rider=selected?.rider, sheet=rider?.months?.[month]||newMonth(month,rider?.petrol_price);
  let live={km:0,liters:0,cost:0},validation="";
  try{if(rider)live=meterMetrics(draft,rider,sheet.petrol_price);}catch(e){validation=e.message;}
  const dayCount=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
  const days=Array.from({length:dayCount},(_,i)=>{const key=String(i+1).padStart(2,"0");const entry=sheet.days?.[key];let metrics={km:0,cost:0,liters:0};try{metrics=meterMetrics(entry,rider,sheet.petrol_price);}catch{}return{key,date:month+"-"+key,entry,metrics};});
  const totals=days.reduce((s,d)=>({km:s.km+d.metrics.km,cost:s.cost+d.metrics.cost,liters:s.liters+d.metrics.liters}),{km:0,cost:0,liters:0});
  const format=n=>Number(n||0).toLocaleString("en-LK",{maximumFractionDigits:2});
  function download(value,name,type="application/json") {const url=URL.createObjectURL(new Blob([value],{type}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  function exportSheet(){
    const escape=v=>'"'+String(v??"").replace(/^[=+@-]/,"'"+String(v??"").slice(0,1)).replaceAll('"','""')+'"';
    const lines=[["DOMEX Vehicle Running Chart",rider.user_name,rider.vehicle_no,rider.branch,month],["Date","Status","IN time","OUT time","IN meter","OUT meter","KM","Liters","Fuel cost LKR","Route","Notes"],
      ...days.map(d=>[d.date,d.entry?.status||"",d.entry?.in_time,d.entry?.out_time,d.entry?.in_meter,d.entry?.out_meter,d.metrics.km,d.metrics.liters.toFixed(3),d.metrics.cost,d.entry?.route,d.entry?.description]),
      ["TOTAL","","","","","",totals.km,totals.liters.toFixed(3),totals.cost]];
    if(window.pywebview?.api?.export_sheet)window.pywebview.api.export_sheet(lines,"DOMEX_Meter_"+month+".xlsx").then(v=>setMessage(v.message)).catch(e=>setMessage(e.message));
    else download("\uFEFF"+lines.map(l=>l.map(escape).join(",")).join("\r\n"),"DOMEX_Meter_"+month+".csv","text/csv;charset=utf-8");
  }
  async function saveDay(){
    const next=structuredClone(rider);next.months[month]={...sheet,days:{...sheet.days,[date.slice(8)]:{...draft,date,petrol:live.cost.toFixed(2)}}};
    validateMeterChanges(rider,next);
    const result=await api("/riders/"+selected.id,{rider:next,version:selected.version},"PUT");
    setSelected(result);setDirty(false);localStorage.removeItem("domex-meter-draft:"+auth.user.username);await refresh();setMessage("Entry saved to VPS. Other devices refresh automatically.");
  }
  async function addRider(event){
    event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));const id="rider_"+crypto.randomUUID();
    await run(async()=>{const created=await api("/riders/"+id,{version:0,rider:{...data,branch:auth.user.role==="ADMIN"?data.branch:auth.user.branch,month,km_per_liter:String(fuelEfficiency(data.vehicle_type)),months:{[month]:{petrol_price:data.petrol_price,days:{}}}}},"PUT");await refresh();setSelected(created);setDraft(blank);setDirty(false);setAccount(null);});
  }
  async function saveVehicle(event) {
    event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));
    await run(async()=>{const next={...structuredClone(rider),...data,months:{...rider.months,[month]:{...sheet,petrol_price:data.petrol_price}}};const value=await api("/riders/"+selected.id,{rider:next,version:selected.version},"PUT");setSelected(value);await refresh();setAccount(null);setMessage("Vehicle settings and monthly fuel price saved.");});
  }
  async function deleteRider() {
    if(!confirm("Archive this rider and all monthly sheets? A server history copy is kept."))return;
    await run(async()=>{await api("/riders/"+selected.id,{rider,version:selected.version,deleted:true},"PUT");setSelected(null);setDirty(false);await refresh();});
  }
  useEffect(()=>{
    if(!auth||!selected)return;
    const key=(event)=>{
      if(event.repeat)return;
      const statuses={F2:"LEAVE",F3:"HOLIDAY",F4:"SUNDAY"};
      if(statuses[event.key]){event.preventDefault();change("status",statuses[event.key]);}
      else if(event.key==="F6"){event.preventDefault();change("meter_broken",!draft.meter_broken);}
      else if(event.ctrlKey&&event.key.toLowerCase()==="s"){event.preventDefault();if(!busy)run(saveDay);}
    };
    window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
  },[auth,selected,draft,date,busy]);
  if(!auth)return <section className="meter-login glass-panel"><Gauge size={42}/><h2>DOMEX Meter & Fuel</h2><p>Your vehicle running charts, securely synced through the VPS.</p><form onSubmit={e=>{e.preventDefault();run(async()=>{const value=await api("/login",credentials);sessionStorage.setItem("domex-meter-session",JSON.stringify(value));setAuth(value);setCredentials({username:"",password:""});});}}><label>Meter username<input autoComplete="username" required value={credentials.username} onChange={e=>setCredentials({...credentials,username:e.target.value})}/></label><label>Password<input type="password" autoComplete="current-password" required value={credentials.password} onChange={e=>setCredentials({...credentials,password:e.target.value})}/></label><button disabled={busy}>Sign in to meter workspace</button></form>{message&&<p role="status">{message}</p>}<small>Use your meter account. Access is limited to your assigned branch.</small></section>;
  return <section className="meter-workspace">
    <header className="meter-hero"><div><span className="meter-eyebrow">DOMEX · VEHICLE OPERATIONS</span><h2><Gauge/>Meter & Fuel Workspace</h2><p>Monthly running charts · Fuel estimates · Live VPS sync</p></div><div><strong>{auth.user.branch}</strong><p>{auth.user.username} · {auth.user.role}</p><button onClick={()=>run(async()=>{await api("/logout",{});setAuth(null);setSelected(null);setRows([]);sessionStorage.removeItem("domex-meter-session");})}><LogOut size={16}/>Sign out</button></div></header>
    <div className="meter-tools"><label className="meter-search"><Search size={18}/><input aria-label="Search riders" placeholder="Search rider, vehicle or branch" value={query} onChange={e=>setQuery(e.target.value)}/></label><button onClick={()=>run(refresh)} disabled={busy}><RefreshCw size={16}/>Refresh</button><button onClick={()=>setAccount("rider")}><Plus size={16}/>Add rider</button>{auth.user.role==="ADMIN"&&<><button onClick={()=>setAccount("login")}>Manage login</button><button onClick={()=>run(async()=>download(JSON.stringify(await api("/backup"),null,2),"DOMEX_Meter_Backup_"+todayIso()+".json"))}>Backup JSON</button></>}</div>
    {message&&<p className="meter-message" role="status">{message}</p>}
    {auth.user.role==="ADMIN"&&<details className="glass-panel" style={{padding:14}}><summary>Import a meter backup</summary><p style={{fontSize:13,margin:"10px 0"}}>Imports riders and monthly sheets. Existing matching rider IDs are replaced; other riders and login accounts are preserved. A private VPS database backup is taken first.</p><input aria-label="Import meter JSON backup" type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];if(!file)return;run(async()=>{const value=JSON.parse(await file.text());const count=Object.keys(value.users||{}).length;if(!count)throw new Error("No riders were found in this backup.");if(!confirm("Import "+count+" riders? Matching IDs will be restored from this backup."))return;const result=await api("/import",{users:value.users});setSelected(null);setDirty(false);await refresh();setMessage(result.imported+" riders imported. Login accounts were preserved.");});e.target.value="";}}/></details>}
    {auth&&localStorage.getItem("domex-meter-draft:"+auth.user.username)&&!dirty&&<button onClick={()=>{try{const saved=JSON.parse(localStorage.getItem("domex-meter-draft:"+auth.user.username));setSelected(saved.selected);setDate(saved.date);setDraft(saved.draft);setDirty(true);setMessage("Recovered an unsaved local draft. Saving will check for changes made by other devices.");}catch{setMessage("The recovery draft could not be read.");}}}>Restore unsaved draft</button>}
    {account==="rider"&&<form className="meter-dialog glass-panel" onSubmit={addRider}><h3>Add rider & vehicle</h3>{["user_name","vehicle_no","branch","petrol_price"].map(field=><label key={field}>{field.replaceAll("_"," ")}<input name={field} required defaultValue={field==="branch"?auth.user.branch:field==="petrol_price"?"300":""} readOnly={field==="branch"&&auth.user.role!=="ADMIN"}/></label>)}<label>Vehicle type<select name="vehicle_type"><option>Bike</option><option>Threewheel</option><option>Lorry</option></select></label><button disabled={busy}>Save rider</button><button type="button" onClick={()=>setAccount(null)}>Cancel</button></form>}
    {account==="vehicle"&&rider&&<form className="meter-dialog glass-panel" onSubmit={saveVehicle}><h3>Vehicle & monthly fuel settings</h3>{["user_name","vehicle_no","km_per_liter","petrol_price"].map(field=><label key={field}>{field.replaceAll("_"," ")}<input name={field} required type={field==="km_per_liter"||field==="petrol_price"?"number":"text"} min={field==="km_per_liter"?"0.01":"0"} step="0.001" defaultValue={field==="petrol_price"?sheet.petrol_price:rider[field]}/></label>)}<button disabled={busy}>Save vehicle settings</button><button type="button" onClick={()=>setAccount(null)}>Cancel</button></form>}
    {account==="login"&&<form className="meter-dialog glass-panel" onSubmit={e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));run(async()=>{await api("/accounts",data);setMessage("Meter login saved. Existing sessions for this user were revoked.");setAccount(null);});}}><h3>Create / reset meter login</h3><label>Username<input name="username" required/></label><label>New password<input name="password" type="password" required minLength={10} autoComplete="new-password"/></label><label>Branch<input name="branch" required/></label><label>Role<select name="role"><option>BRANCH</option><option>ADMIN</option></select></label><button disabled={busy}>Save login</button><button type="button" onClick={()=>setAccount(null)}>Cancel</button></form>}
    <div className="meter-layout"><aside className="glass-panel meter-riders"><h3>Riders & vehicles <small>{rows.length}</small></h3>{rows.filter(r=>[r.rider.user_name,r.rider.vehicle_no,r.rider.branch].join(" ").toLowerCase().includes(query.toLowerCase())).map(r=><button className={selected?.id===r.id?"selected":""} key={r.id} onClick={()=>choose(r)}><strong>{r.rider.user_name}</strong><span>{r.rider.vehicle_no} · {r.rider.vehicle_type}</span><small>{r.rider.branch}</small></button>)}{!rows.length&&<p>Add your first rider to start a running chart.</p>}</aside>
    <main className="meter-main">{!selected?<div className="glass-panel meter-empty"><Gauge size={60}/><h3>Select a rider</h3><p>Browse saved monthly sheets or add a new vehicle.</p></div>:<>
      <div className="meter-sheet-heading"><div><h3>{rider.user_name}</h3><span>{rider.vehicle_no} · {rider.vehicle_type} · {rider.branch}</span></div><label>Sheet date<input type="date" required value={date} onChange={e=>{if(e.target.value)choose(rows.find(r=>r.id===selected.id)||selected,e.target.value);}}/></label><button onClick={exportSheet}><Download size={16}/>Excel CSV</button><button onClick={()=>window.print()}>Print</button></div>
      <div className="meter-stats">{[["Monthly distance",format(totals.km)+" km"],["Estimated fuel",format(totals.liters)+" L"],["Fuel allowance","LKR "+format(totals.cost)]].map(([label,value])=><div className="glass-panel" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
      <div className="meter-tools"><button onClick={()=>setAccount("vehicle")}>Vehicle & fuel settings</button><button onClick={deleteRider} disabled={busy}>Archive rider</button><small>F2 Leave · F3 Holiday · F4 Sunday · F6 Broken meter · Ctrl+S Save</small></div>
      <form className="glass-panel meter-entry" onSubmit={e=>{e.preventDefault();run(saveDay);}}><div className="meter-entry-heading"><h3>Entry · {date}</h3><span>{dirty?"Unsaved draft":"Saved record"} · revision {selected.version}</span></div>
        <label>Day status<select value={draft.status} onChange={e=>change("status",e.target.value)}>{["WORKING","SUNDAY","HOLIDAY","LEAVE"].map(v=><option key={v}>{v}</option>)}</select></label>
        <label className="meter-check"><input type="checkbox" checked={Boolean(draft.meter_broken)} onChange={e=>change("meter_broken",e.target.checked)}/>Meter broken / manual KM</label>
        {!["SUNDAY","HOLIDAY","LEAVE"].includes(draft.status)&&<>{["in_time","out_time",...(draft.meter_broken?["manual_km"]:["in_meter","out_meter"]),"add_km"].map(field=><label key={field}>{field.replaceAll("_"," ")}<input type={field.includes("time")?"time":"number"} min="0" step={field.includes("time")?undefined:"0.01"} value={draft[field]??""} onChange={e=>change(field,e.target.value)}/></label>)}<label>Route<input value={draft.route} onChange={e=>change("route",e.target.value)}/></label></>}
        <label>Notes / holiday name<input value={draft.description} onChange={e=>change("description",e.target.value)}/></label>
        <div className="meter-live">{validation||("Distance "+format(live.km)+" km · Estimated fuel "+format(live.liters)+" L · LKR "+format(live.cost))}</div><button disabled={busy||Boolean(validation)}><Save size={16}/>Save & sync entry</button>
      </form>
      <div className="glass-panel meter-table"><h3>Running chart · {month}</h3><table><thead><tr>{["Date","Status / route","IN","OUT","KM","Fuel LKR",""].map((v,i)=><th key={i}>{v}</th>)}</tr></thead><tbody>{days.map(d=><tr key={d.key} className={d.date===date?"active":""}><td>{d.date}</td><td>{d.entry?.status||"—"}<small>{d.entry?.route||d.entry?.description||""}</small></td><td>{d.entry?.in_meter||"—"}</td><td>{d.entry?.out_meter||"—"}</td><td>{d.entry?format(d.metrics.km):"—"}</td><td>{d.entry?format(d.metrics.cost):"—"}</td><td><button onClick={()=>choose(rows.find(r=>r.id===selected.id)||selected,d.date)}>Edit</button></td></tr>)}</tbody></table></div>
    </>}</main></div>
  </section>;
}
