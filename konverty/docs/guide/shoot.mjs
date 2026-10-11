// Скриншоты для инструкции из демо-версии приложения (demo/app.html, вымышленные люди). Демо-версию отдаёт локальный сервер:
//   python3 -m http.server 8767 --bind 127.0.0.1 --directory docs/guide/demo
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const {chromium}=(await import(process.env.PW_PATH||'playwright')).default;
const G=path.dirname(fileURLToPath(import.meta.url)), APP=process.env.APP_URL||'http://127.0.0.1:8767/app.html', KEY=fs.readFileSync(G+'/demo/demo.key','utf8');
const MARKS=JSON.parse(fs.readFileSync(G+'/marks.json','utf8'));
const env=n=>'data:image/jpeg;base64,'+fs.readFileSync(G+'/env/'+n+'.jpg').toString('base64');
const META={};const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});const errs=[];
async function mk(extraInit){
  const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2,acceptDownloads:true,timezoneId:'Europe/Moscow',locale:'ru-RU'});
  await ctx.clock.install({time:new Date('2026-10-12T07:00:00Z')});
  await ctx.route('**/*',r=>(/^(file|blob|data):/.test(r.request().url())||r.request().url().startsWith('http://127.0.0.1:8767/'))?r.continue():r.abort());
  await ctx.addInitScript(([k,extra])=>{
    const dir=()=>navigator.storage.getDirectory();
    const KN='key.key', PN='progress.json';
    window.__flashIn=async()=>{const d=await dir();const h=await d.getFileHandle(KN,{create:true});const w=await h.createWritable();await w.write(window.__key||k);await w.close();return h};
    window.__flashOut=async()=>{const d=await dir();await d.removeEntry(KN)};
    window.__progH=async c=>(await dir()).getFileHandle(PN,{create:!!c});
    window.showOpenFilePicker=async o=>o&&o.id==='konv-prog'?[await window.__progH(false)]:[await window.__flashIn()];
    window.showSaveFilePicker=async()=>window.__progH(true);
    const W=1280,H=720;let c2=null,img=null;
    window.__setScene=u=>new Promise(res=>{if(!u){img=null;res();return}const i=new Image();i.onload=()=>{img=i;res()};i.src=u});
    const draw=()=>{if(!c2)return;if(img)c2.drawImage(img,0,0,W,H);else{c2.fillStyle='#3a342f';c2.fillRect(0,0,W,H)}};
    navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=W;c.height=H;c2=c.getContext('2d');draw();setInterval(draw,50);window.__stream=c.captureStream(20);return window.__stream};
    // голоса как на компьютере с Windows (в браузере для съёмки системных голосов нет); сама озвучка не нужна
    try{const V=[{name:'Microsoft Pavel - Russian (Russia)',lang:'ru-RU',localService:true,default:false,voiceURI:'Pavel'},{name:'Microsoft Irina - Russian (Russia)',lang:'ru-RU',localService:true,default:true,voiceURI:'Irina'}];
      speechSynthesis.getVoices=()=>V;speechSynthesis.speak=()=>{}}catch(e){}
    navigator.mediaDevices.enumerateDevices=async()=>[{kind:'videoinput',deviceId:'cam',label:'Веб-камера',groupId:'g'}];
    if(extra==='noperm'){const q=FileSystemHandle.prototype.queryPermission;FileSystemHandle.prototype.queryPermission=async function(o){return this.name.endsWith('.json')?'prompt':q.call(this,o)}}
  },[KEY,extraInit||'']);
  const p=await ctx.newPage();p.on('pageerror',e=>errs.push(e.message));return {ctx,p}}
async function box(p,sel){const sels=Array.isArray(sel)?sel:[sel];let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const s of sels){const bb=await p.locator(s).first().boundingBox();if(!bb)throw new Error('нет элемента '+s);x0=Math.min(x0,bb.x);y0=Math.min(y0,bb.y);x1=Math.max(x1,bb.x+bb.width);y1=Math.max(y1,bb.y+bb.height)}
  return {x:x0,y:y0,width:x1-x0,height:y1-y0}}
async function shot(p,name,clipSel,callouts=[],pad=14){
  await p.evaluate(()=>{const t=document.getElementById('toast');if(t)t.hidden=true;
    // имитация флешки хранит файлы под латинскими именами — на снимке показываем обычные имена файлов
    const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode()))if(n.nodeValue.includes('progress.json'))n.nodeValue=n.nodeValue.replace(/progress\.json/g,'Прогресс раскладки.json')});
  const vb=p.viewportSize();let c=await box(p,clipSel);
  c={x:Math.max(0,c.x-pad),y:Math.max(0,c.y-pad),width:Math.min(vb.width,c.x+c.width+pad)-Math.max(0,c.x-pad),height:Math.min(vb.height,c.y+c.height+pad)-Math.max(0,c.y-pad)};
  await p.screenshot({path:G+'/shots/'+name+'.png',clip:c});
  const cs=[];for(const s of callouts){const bb=await box(p,s);cs.push({x:+((bb.x-c.x)/c.width*100).toFixed(2),y:+((bb.y-c.y)/c.height*100).toFixed(2),w:+(bb.width/c.width*100).toFixed(2),h:+(bb.height/c.height*100).toFixed(2)})}
  META[name]={w:Math.round(c.width),h:Math.round(c.height),callouts:cs};console.log('снято',name,Math.round(c.width)+'×'+Math.round(c.height),cs.length?'выносок '+cs.length:'')}
// Подсветка стопки, куда только что ушёл конверт: анимацию останавливаем в момент подсветки, после снимка — снимаем.
// (остановленную анимацию нужно отменить через cancel(), иначе Chromium оставит ячейку подсвеченной навсегда)
const holdHit=p=>p.evaluate(()=>{const d=document.getElementById('vDistrict').textContent.trim();const c=[...document.querySelectorAll('#cabinet .cell')].find(x=>x.dataset.d===d);document.getAnimations().forEach(a=>{if(/^hit/.test(a.animationName))a.cancel()});document.querySelectorAll('#cabinet .cell.hit').forEach(x=>x.classList.remove('hit','dup'));void c.offsetWidth;c.classList.add('hit');document.getAnimations().forEach(a=>{if(a.animationName==='hit'){a.pause();a.currentTime=250}});return d});
const dropHit=p=>p.evaluate(()=>{document.getAnimations().forEach(a=>{if(/^hit/.test(a.animationName))a.cancel()});document.querySelectorAll('#cabinet .cell.hit').forEach(x=>x.classList.remove('hit','dup'))});
const mark=async(p,q)=>{await p.fill('#q',q);await p.waitForTimeout(150);await p.press('#q','Enter');await p.waitForTimeout(120)};
const waitS=(p,s,t=12000)=>p.waitForFunction(s=>verdict.dataset.s===s,s,{timeout:t}).catch(()=>{});

// ===== Основной сеанс =====
let {ctx,p}=await mk();await p.goto(APP);await p.waitForTimeout(700);
await shot(p,'lock-key','.lock-card',['#keyZone','#lockGo']);
await p.click('#lockGo');await p.waitForFunction(()=>!document.getElementById('step2').hidden);await p.waitForTimeout(400);
await shot(p,'lock-prog-first','.lock-card',['#progNew','#progPick','#progSkip']);
await p.click('#progNew');await p.waitForFunction(()=>document.getElementById('lock').hidden);await p.waitForTimeout(1500);
await shot(p,'cam-off',['#finder','.cam-bar'],['#btnCamOn']);
await p.evaluate(u=>__setScene(u),env('e1'));await p.click('#btnCamOn');
await p.waitForFunction(()=>document.getElementById('fState').dataset.s==='ready',null,{timeout:60000});await p.waitForTimeout(600);
await shot(p,'scan-ready',['#finder','.cam-bar'],['#fState','#btnScan']);
await shot(p,'modes','.cam-bar',['.cam-bar .seg button[data-mode="space"]','.cam-bar .seg button[data-mode="auto"]','#btnPhoto'],10);
await p.evaluate(()=>document.activeElement.blur());await p.keyboard.press('Space');await waitS(p,'ok');await p.waitForTimeout(800);
await shot(p,'verdict-ok','#verdict',['#vDistrict','#vName','#vMark']);
let hitD=await holdHit(p);
await shot(p,'cabinet','#cabinet',['#cabinet .cell[data-d="'+hitD+'"]'],8);
await dropHit(p);
await p.evaluate(()=>__setScene(null));
for(const q of MARKS) await mark(p,q);
await p.evaluate(u=>__setScene(u),env('e4'));await p.waitForTimeout(500);await p.evaluate(()=>document.activeElement.blur());
await p.keyboard.press('Space');await waitS(p,'ok');await p.waitForTimeout(1500);
hitD=await holdHit(p);
await shot(p,'main','.app',['#finder','#btnScan','.cam-bar .seg','#verdict','.q-wrap','.ledger','#cabinet',['#saveState','#btnSave'],'#btnReport','#btnSettings','#btnLock'],0);
await shot(p,'save-ok',['#saveState','#btnLock'],['#saveState','#btnSave'],10);
await shot(p,'header',['#saveState','#btnLock'],[['#saveState','#btnSave'],'#btnReport','#btnSettings','#btnLock'],10);
await dropHit(p);
// Не уверен — список похожих
await p.evaluate(u=>__setScene(u),env('e2'));await p.waitForTimeout(500);await p.evaluate(()=>document.activeElement.blur());
await p.keyboard.press('Space');await waitS(p,'miss',15000);await p.waitForTimeout(500);
await shot(p,'candidates','.vcol',['#verdict','#list li[data-i]:first-child'],10);
// Поиск вручную
await p.fill('#q','кузнецова антонина');await p.waitForTimeout(400);
await shot(p,'search','.vcol',['.q-wrap','#list li.sel'],10);
await p.press('#q','Enter');await p.waitForTimeout(800);await p.evaluate(()=>__setScene(null));
// Повтор
await p.evaluate(u=>__setScene(u),env('e1'));await p.waitForTimeout(500);await p.evaluate(()=>document.activeElement.blur());
await p.keyboard.press('Space');await waitS(p,'dup');await p.waitForTimeout(800);
await shot(p,'dup','#verdict',['#vState','#vMark']);
await p.evaluate(()=>__setScene(null));
// Журнал и отмена
await p.hover('#ledger li[data-i]:nth-child(2)');await p.waitForTimeout(300);
await shot(p,'ledger','.ledger',['#ledger li[data-i]:nth-child(2) .lg-undo','#btnUndo'],8);
// Отчёт и выгрузка
await p.mouse.move(5,5);await p.click('#btnReport');await p.waitForTimeout(500);
await shot(p,'report','.modal-box',['#repD','#report .seg','#repBase','#repXls'],0);
await p.click('#repBase');await p.waitForTimeout(300);
await shot(p,'report-confirm',['.modal-head','#fullConfirm'],['#fullYes'],0);
const [dl]=await Promise.all([p.waitForEvent('download',{timeout:30000}),p.click('#fullYes')]);fs.copyFileSync(await dl.path(),G+'/demo/export.xlsx');
await p.keyboard.press('Escape');await p.waitForTimeout(300);
// Настройки — защита данных
await p.click('#btnSettings');await p.waitForTimeout(500);
await shot(p,'settings',['#settings .sheet-head','#wipeOpen'],['#optFull','#lockSel','#keyNew','#wipeOpen'],0);
// Другие разделы настроек: голос и прогресс
for(const [n,sec,cs] of [['set-voice','#voiceSel',['#voiceSel','#vVol','#vTest']],['set-progress','#progSave',['#progSave','#progLoadBtn','#progReset']]]){
  await p.locator(cs[cs.length-1]).scrollIntoViewIfNeeded();await p.waitForTimeout(250);
  await shot(p,n,'#settings section:has('+sec+')',cs,6)}
await p.keyboard.press('Escape');await p.waitForTimeout(300);
// Камера отключилась
await p.evaluate(()=>__stream.getVideoTracks()[0].dispatchEvent(new Event('ended')));await p.waitForTimeout(500);
await shot(p,'cam-lost',['#finder','.cam-bar'],['#fOffText','#btnCamOn']);
// Второе окно
const p2=await ctx.newPage();await p2.goto(APP);await p2.waitForTimeout(500);await p2.click('#lockGo');await p2.waitForTimeout(1500);
await shot(p2,'err-othertab','.lock-card',['#lockErr']);await p2.close();
// Флешку вынули
await p.evaluate(()=>__flashOut());await p.waitForTimeout(3500);
await shot(p,'lock-removed','.lock-card',['#lockErr','#lockGo']);
await ctx.close();

// ===== Повторный вход: «Продолжить с файлом» и «Нужно разрешить запись» =====
({ctx,p}=await mk('noperm'));await p.goto(APP);await p.click('#lockGo');await p.waitForFunction(()=>!document.getElementById('step2').hidden);
await p.click('#progNew');await p.waitForFunction(()=>document.getElementById('lock').hidden);await p.waitForTimeout(1500);
await p.keyboard.press('Control+l');await p.waitForTimeout(2500);await p.click('#lockGo');await p.waitForFunction(()=>!document.getElementById('step2').hidden);await p.waitForTimeout(500);
await shot(p,'lock-prog-next','.lock-card',['#progGo','#progPick']);
await ctx.close();
// ===== Без файла прогресса: предупреждение в шапке =====
({ctx,p}=await mk());await p.goto(APP);await p.click('#lockGo');await p.waitForFunction(()=>!document.getElementById('step2').hidden);
await p.click('#progSkip');await p.waitForFunction(()=>document.getElementById('lock').hidden);
for(const q of MARKS.slice(0,2)) await mark(p,q);await p.waitForTimeout(400);
await shot(p,'save-warn',['#saveState','#btnLock'],['#saveState','#btnSave'],10);
await ctx.close();
// ===== Чужой ключ =====
({ctx,p}=await mk());await p.goto(APP);
await p.evaluate(()=>{window.__key='KONVERTY-KEY-1\n'+btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))+'\n'});
await p.click('#lockGo');await p.waitForTimeout(1200);
await shot(p,'err-wrongkey','.lock-card',['#lockErr']);await ctx.close();
fs.writeFileSync(G+'/shots/meta.json',JSON.stringify(META,null,1));
console.log('ошибки страницы:',errs.length?errs:'нет');await b.close();
