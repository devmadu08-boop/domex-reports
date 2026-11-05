const {app,BrowserWindow,Menu,ipcMain,dialog,shell} = require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {makeWorkbook}=require('./workbook.cjs');
const VERSION='1.0.2', PORTAL='https://bot.domex.work.gd';
const interaction=process.argv.includes('--interaction-test'), smoke=process.argv.includes('--smoke-test');
const data=path.join(app.getPath('appData'),'DOMEX Workspace Desktop',interaction?'InteractionTest':smoke?'SmokeTest':'Profile');
fs.mkdirSync(data,{recursive:true});
app.setPath('userData',data);
let window;
function log(message){fs.mkdirSync(data,{recursive:true});fs.appendFileSync(path.join(data,'desktop.log'),new Date().toISOString()+' '+message+'\n');}
function trusted(event){
  if(!window || event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame)throw Error('Invalid desktop request.');
  const url=new URL(event.senderFrame.url);
  if(url.origin!==PORTAL && !(interaction && url.href===pathToFileURL(path.join(__dirname,'interaction.html')).href))throw Error('Desktop features are available only in DOMEX Workspace.');
}
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
  app.whenReady().then(async()=>{
    app.setAppUserModelId('com.domex.workspace');
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Workspace',submenu:[{label:'Reload',role:'reload',accelerator:'Ctrl+R'},{label:'Zoom in',role:'zoomIn'},{label:'Zoom out',role:'zoomOut'},{type:'separator'},{label:'Close',role:'close'}]}]));
    window=new BrowserWindow({title:'DOMEX Workspace '+VERSION,width:1440,height:960,minWidth:1000,minHeight:650,show:!smoke,autoHideMenuBar:true,backgroundColor:'#fbf5ec',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    ipcMain.handle('domex:version',event=>{trusted(event);return VERSION;});
    ipcMain.handle('domex:export-sheet',async(event,rows,filename)=>{
      trusted(event);const workbook=makeWorkbook(rows);
      const name=path.basename(String(filename||'DOMEX_Meter.xlsx')).replace(/[<>:"/\\|?*]/g,'_').replace(/\.xlsx$/i,'')+'.xlsx';
      const selected=await dialog.showSaveDialog(window,{defaultPath:name,filters:[{name:'Excel workbook',extensions:['xlsx']}]});
      if(selected.canceled)return {message:'Export cancelled.'};
      const target=selected.filePath.replace(/\.xlsx$/i,'')+'.xlsx';await workbook.xlsx.writeFile(target);return {message:'Excel workbook saved: '+path.basename(target)};
    });
    window.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//i.test(url))shell.openExternal(url).catch(()=>{});return {action:'deny'};});
    window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==PORTAL){event.preventDefault();if(/^https:\/\//i.test(url))shell.openExternal(url).catch(()=>{});}});
    window.webContents.on('will-attach-webview',event=>event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((contents,permission,callback)=>callback(contents===window?.webContents && contents.getURL().startsWith(PORTAL+'/') && permission==='clipboard-sanitized-write'));
    window.on('unresponsive',()=>log('Native window became unresponsive'));
    window.webContents.on('render-process-gone',(_event,details)=>log('Renderer exited: '+details.reason));
    window.on('closed',()=>{window=null;});
    try {
      if(interaction) await window.loadFile(path.join(__dirname,'interaction.html'));
      else await window.loadURL(PORTAL+(process.argv.includes('--meter')?'/meter-workspace/':'/dashboard/'));
      if(smoke){
        await new Promise(r=>setTimeout(r,15000));
        window.maximize();await new Promise(r=>setTimeout(r,250));const maximized=window.isMaximized();
        window.minimize();await new Promise(r=>setTimeout(r,250));const minimized=window.isMinimized();window.restore();
        const result=await window.webContents.executeJavaScript('({title:document.title,text:document.body.innerText.length,bridge:typeof window.pywebview.api.export_sheet})');
        if(!maximized||!minimized||result.bridge!=='function')throw Error('Native window interaction check failed');
        fs.writeFileSync(path.join(data,'smoke-result.json'),JSON.stringify({...result,maximized,minimized,url:window.webContents.getURL()}));window.close();
      }
    } catch(error){log(error.message);if(smoke){app.exit(1);return;}await dialog.showMessageBox(window,{type:'error',title:'DOMEX Workspace',message:'The DOMEX portal could not load. Check the internet connection and use Ctrl+R to reload.',detail:error.message});}
  }).catch(error=>{log(error.message);app.exit(1);});
  app.on('window-all-closed',()=>app.quit());
}
