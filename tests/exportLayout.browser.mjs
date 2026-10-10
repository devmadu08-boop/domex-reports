import {chromium} from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=path.resolve('tmp/export-layout-artifacts');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const context=await browser.newContext({viewport:{width:1500,height:1100},acceptDownloads:true});let colorPayload;
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();
  let data={ok:true};if(u.pathname.endsWith('/queue'))data={counts:{},jobs:[]};if(u.pathname.endsWith('/status'))data={connected:true,status:'connected',defaultGroupJids:['mock']};
  if(u.pathname.includes('/send-report-to-recipient')||u.pathname.includes('/send-convert-report')){colorPayload=route.request().postDataJSON();data={ok:true,queued:true};}
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await context.addInitScript(()=>{
  window.__prints=0;window.print=()=>{window.top.__prints++;};
  localStorage.setItem('daily-courier-report-system-session-v1',JSON.stringify({branchName:'capture-test',userId:'capture-test',role:'branch'}));
  localStorage.setItem('daily-courier-report-system-settings-v1::capture-test',JSON.stringify({branchName:'Middeniya',uiTheme:'default',autoWeeklyBackup:false,deliveredExportAutoWhatsApp:true,deliveredRiderWhatsAppNumbers:{'LONG RIDER NAME FOR ALIGNMENT TEST':'94770000000'},convertDefaultGroupJids:['mock']}));
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Colombo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));const today=`${v.year}-${v.month}-${v.day}`;
  const entries=Array.from({length:21},(_,i)=>({trackingNo:i===0?'CS401234567':'DX'+String(i+1).padStart(9,'0'),value:'100.50'}));
  const rs=Array.from({length:9},(_,i)=>'RS'+i);
  const rec={checkedAt:new Date().toISOString(),outForDeliveryCount:30,deliveredCount:21,rescheduledCount:9,outForDeliveryTracking:[...entries.map(e=>e.trackingNo),...rs],deliveredTracking:entries.map(e=>e.trackingNo),rescheduledTracking:rs,rescheduledParcels:rs.map(trackingNo=>({trackingNo,confirmed:true})),missingParcels:[],extraDelivered:[],extraRescheduled:[],deliveredAndRescheduled:[]};
  const petty=Array.from({length:20},(_,i)=>({id:'v'+i,referenceNo:'TEST-VOUCHER-'+i,paymentDate:today,paymentType:'Fuel',employeeName:'EMPLOYEE ALIGNMENT TEST '+i,vehicleNo:'TEST 123',fromKms:'100',toKms:'120',totalKms:'20',ofdReportNo:'OFD123',memo:'Test memo',note:'Test note',value:100.25,status:'Pending'}));
  const dates=Array.from({length:31},(_,i)=>new Date(Date.UTC(2026,5,1+i)).toISOString().slice(0,10));
  const source={dates,start:dates[0],end:dates.at(-1),warnings:[],riders:Array.from({length:4},(_,i)=>({key:'r'+i,name:'RIDER ALIGNMENT NAME '+i,branch:'Middeniya',counts:Object.fromEntries(dates.map((d,j)=>[d,j%7===0?0:10+i]))}))};
  const reports={[today]:{delivered:{'LONG RIDER NAME FOR ALIGNMENT TEST':{riderName:'LONG RIDER NAME FOR ALIGNMENT TEST',branchName:'Middeniya',entries,pickupCount:'0',reconciliation:rec}},courierRows:[],pettyCash:{branchName:'Middeniya',entries:petty,preparedBy:'PREPARED NAME',authorizedBy:'AUTHORIZED NAME'}},'2026-07-01':{riderDeliveryPerformance:{fixture:{source,start:source.start,end:source.end,branch:'Middeniya',savedAt:new Date().toISOString()}}}};
  localStorage.setItem('daily-courier-report-system-v1::capture-test',JSON.stringify(reports));
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function capture(selector,name,options={}){
  const node=page.locator(selector).first();await node.waitFor();
  await page.locator('.domex-header').evaluate(e=>e.style.visibility='hidden');
  const geometry = await node.evaluate(e => {const root=e.getBoundingClientRect();return [...e.querySelectorAll(".rpp-rank,.dc-row-number")].slice(0,20).map(n=>{const r=n.getBoundingClientRect();return {x:r.x-root.x,y:r.y-root.y,w:r.width,h:r.height};});});
  fs.writeFileSync(out+"/"+name+"-boxes.json",JSON.stringify(geometry));
  const screen = await node.screenshot({path:out+'/'+name+'-screen.png'});
  const data=await page.evaluate(async({selector,options})=>{const mod=await import('/src/utils/exportReports.js');return mod.captureElementAsPngDataUrl(document.querySelector(selector),{scale:1,...options});},{selector,options});
  fs.writeFileSync(out+'/'+name+'-export.png',Buffer.from(data.split(',')[1],'base64'));
  const deltas = await page.evaluate(async({screen,data,geometry}) => {
    async function load(src) { const image=new Image(); image.src=src; await image.decode(); const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height); }
    const pixels=await Promise.all([load(screen),load(data)]);
    return geometry.map(box => {
      const centers=pixels.map(im => {let total=0,count=0;for(let y=Math.max(0,Math.floor(box.y)+2);y<Math.min(im.height,Math.floor(box.y+box.h)-2);y++)for(let x=Math.max(0,Math.floor(box.x)+3);x<Math.min(im.width,Math.floor(box.x+box.w)-3);x++){const i=(y*im.width+x)*4;if(Math.min(im.data[i],im.data[i+1],im.data[i+2])>235){total+=y-box.y;count++;}}return count?total/count:null;});
      return centers.every(c=>c!==null)?Math.abs(centers[0]-centers[1]):0;
    });
  },{screen:'data:image/png;base64,'+screen.toString('base64'),data,geometry});
  assert(deltas.every(delta=>delta<3),'Exported number labels align with preview badges');
  await page.locator('.domex-header').evaluate(e=>e.style.visibility='');
 }
 await page.goto('http://127.0.0.1:5173/rider-delivery-performance/',{waitUntil:'networkidle'});await page.locator('.rider-performance-paper').waitFor();
 await page.evaluate(()=>window.scrollTo(0,700));assert(Math.abs(await page.locator('.domex-header').evaluate(e=>e.getBoundingClientRect().top))<1,'Toolbar stays sticky');
 await capture('.rider-performance-paper','rider-native');
 await page.goto('http://127.0.0.1:5173/petty-cash/',{waitUntil:'networkidle'});await capture('.petty-cash-a4-report','petty-native');
 await page.goto('http://127.0.0.1:5173/delivered-report/',{waitUntil:'networkidle'});await page.getByLabel('Rider Name',{exact:true}).selectOption('LONG RIDER NAME FOR ALIGNMENT TEST');
 await page.locator('.delivered-document').first().waitFor();assert.equal(await page.locator('.delivered-document').count(),2);assert.equal(await page.locator('.dc-table tbody tr').count(),40);
 assert.equal(await page.locator('.dc-table tbody tr[data-empty="false"]').count(),21);
 await capture('.delivered-document','delivered-color-native');
 await page.getByRole('button',{name:'B&W · Download / Print',exact:true}).click();await capture('.delivered-document','delivered-bw-native',{variant:'monochrome'});
 const downloadP=page.waitForEvent('download');await page.getByRole('button',{name:/Export A4 PDF/}).click();await page.getByRole('button',{name:'Export PDF & Print',exact:true}).click();
 const download=await downloadP;await download.saveAs(out+'/delivered-format-test.pdf');await page.waitForFunction(()=>window.__prints>0);
 await page.getByText('Report exported. WhatsApp messages are in your Outbox and will send in the background.',{exact:true}).waitFor();
 assert.equal(colorPayload.imageDataUrls.length,2);fs.writeFileSync(out+'/delivered-whatsapp-color.png',Buffer.from(colorPayload.imageDataUrls[0].split(',')[1],'base64'));
 const dims=await page.locator('.delivered-document').evaluateAll(nodes=>nodes.map(n=>({height:n.getBoundingClientRect().height,scroll:n.scrollHeight,client:n.clientHeight})));
 assert(dims.every(d=>d.height===1123&&d.scroll<=d.client+1),'A4 pages must not clip content');
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,500));assert(Math.abs(await page.locator('.domex-header').evaluate(e=>e.getBoundingClientRect().top))<1);
 
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Mobile overflow');
 assert((await page.locator('.delivered-document').first().boundingBox()).width < 390,'Mobile preview shows the complete A4 page');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks:['native rider/petty/delivered capture','sticky toolbar desktop/mobile','20 rows and 21 records on 2 pages','B&W PDF and color WhatsApp payload','same-tab print','A4 no clipping','no runtime errors']}));
}finally{await browser.close();}
