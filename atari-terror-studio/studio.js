const assets = [];
const libraryDirectories = ['design','official-photos','official-videos','photos','texts','videos'];
const githubRepository='atariterror-band/at-content-studio';
const githubApiRoot=`https://api.github.com/repos/${githubRepository}/contents`;
const githubTokenStorageKey='at-content-studio:github-token:session';
const studioAccessStorageKey='at-content-studio:access:session';
const studioApiBase=(window.AT_CONTENT_STUDIO_API||'').replace(/\/+$/,'');
const studioApiTokenStorageKey='at-content-studio:server-session';
let studioApiToken='';
try{studioApiToken=localStorage.getItem(studioApiTokenStorageKey)||''}catch{}
function rememberStudioApiToken(value){studioApiToken=value;try{if(value)localStorage.setItem(studioApiTokenStorageKey,value);else localStorage.removeItem(studioApiTokenStorageKey)}catch{}}
try{if(studioApiToken&&localStorage.getItem(studioAccessStorageKey)==='unlocked')document.documentElement.classList.add('studio-authenticated')}catch{}
async function studioApiRequest(path,options={}){if(!studioApiBase)throw new Error('Ukládací služba není nakonfigurovaná.');const headers={...(options.headers||{}),...(studioApiToken?{Authorization:'Bearer '+studioApiToken}:{})};const response=await fetch(studioApiBase+path,{...options,headers});const result=await response.json().catch(()=>({}));if(response.status===401){rememberStudioApiToken('');try{localStorage.removeItem(studioAccessStorageKey)}catch{}document.documentElement.classList.remove('studio-authenticated')}if(!response.ok)throw new Error(result.error||'Požadavek se nepodařilo dokončit.');return result}
document.getElementById('studio-login-form').addEventListener('submit',async event=>{event.preventDefault();const input=document.getElementById('studio-login-password'),error=document.getElementById('studio-login-error'),submit=event.currentTarget.querySelector('button[type="submit"]');error.hidden=true;input.removeAttribute('aria-invalid');submit.disabled=true;try{const response=await fetch(studioApiBase+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:input.value})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'Přihlášení se nepodařilo.');rememberStudioApiToken(result.token);document.documentElement.classList.add('studio-authenticated');try{localStorage.setItem(studioAccessStorageKey,'unlocked')}catch{}input.value='';if(legacyDrafts.length)await migrateLegacyDrafts();await loadRemoteLibrary()}catch(e){error.textContent=e.message||'Přihlášení se nepodařilo.';error.hidden=false;input.setAttribute('aria-invalid','true');input.focus()}finally{submit.disabled=false}});
let githubToken='';
try{githubToken=sessionStorage.getItem(githubTokenStorageKey)||''}catch{}
function rememberGithubToken(value){githubToken=value;try{if(value)sessionStorage.setItem(githubTokenStorageKey,value);else sessionStorage.removeItem(githubTokenStorageKey)}catch{}}
if(githubToken)document.getElementById('github-connect').textContent='ODPOJIT GITHUB';
let pendingGithubAction=null;
let remoteLibrary = libraryDirectories.map(name=>({name,path:`GitHub / ${githubRepository}/${name}`,files:[]}));
const formatMap = {
  story:{width:540,height:960,title:'Instagram Story',ratio:'9 / 16'},
  feed:{width:540,height:675,title:'Instagram Feed',ratio:'4 / 5'},
  square:{width:700,height:700,title:'Čtvercový příspěvek',ratio:'1 / 1'},
  landscape:{width:960,height:503,title:'Facebook příspěvek',ratio:'1.91 / 1'},
  'fb-story':{width:540,height:960,title:'Facebook Stories',ratio:'9 / 16'}
};
const songSearch = name => `https://open.spotify.com/search/${encodeURIComponent('Atari Terror '+name)}`;
const canvas = document.getElementById('preview-canvas');
const ctx = canvas.getContext('2d');
const video = document.getElementById('source-video');
video.preload='auto';video.muted=true;video.playsInline=true;video.crossOrigin='anonymous';
const previewLoading=document.getElementById('preview-loading');
let previewProgressSequence=0,activePreviewProgress=0,previewProgressTimer,previewProgressStartedAt=0;
let currentFormat = 'story';
let selected = 0;
const PREVIEW_FPS=25;
// Capture a short guard band outside the selected interval. The MP4 mux step
// removes these frames, so recorder/seek startup jitter cannot shorten the clip.
const EXPORT_GUARD_FRAMES=3;
const CAPTION_FONT_RATIO=.068;
let selectedStartFrame=0;
let selectedEndFrame=5*PREVIEW_FPS;
let clipSelectionLoaded=false;
let pendingSeekTimer=0;
let lastRangeSeekAt=0;
let pendingSeekEndpoint='start';
let timelineDragging=false;
let videoEditorReady=false,videoEditorLoadToken=0,videoSeekStatusTimer=0;
let exportRecording=false,exportInProgress=false;
let preparedShareBlob=null,preparedShareFilename='',preparedShareFormat='';
let videoAudioContext=null,videoAudioSource=null,videoAudioDestination=null;
const clipSelectionKey=asset=>`at-content-studio:clip:v2:${asset?.relativePath||asset?.src||asset?.name||'default'}`;
function saveClipSelection(){const asset=selectedAsset();if(asset?.type!=='video')return;try{localStorage.setItem(clipSelectionKey(asset),JSON.stringify({start:selectedStartFrame,end:selectedEndFrame}))}catch{}}
function restoreClipSelection(asset=selectedAsset()){if(asset?.type!=='video')return;try{const saved=JSON.parse(localStorage.getItem(clipSelectionKey(asset))||'null');clipSelectionLoaded=Number.isFinite(saved?.start)&&Number.isFinite(saved?.end)&&saved.end>saved.start;if(clipSelectionLoaded){selectedStartFrame=Math.max(0,Number(saved.start));selectedEndFrame=Math.max(selectedStartFrame+5*PREVIEW_FPS,Number(saved.end))}else{selectedStartFrame=0;selectedEndFrame=0}}catch{clipSelectionLoaded=false;selectedStartFrame=0;selectedEndFrame=0}}
let previewPlaying=false;
let modalFrameRequest=0;
let textMotionRequest=0,textMotionStartedAt=performance.now(),previewStartedAt=0,liveRenderBusy=false;
const textLayerCache=new Map();
document.fonts?.ready.then(()=>textLayerCache.clear());
let toastTimer;
let modalAction = null;
const draftStorageKey='at-content-studio:drafts:v1';
const draftData=Object.create(null);
let currentDraftKey=null;
let legacyDrafts=[];
let cloudDraftsLoaded=false;
try{const stored=JSON.parse(localStorage.getItem(draftStorageKey)||'[]');if(Array.isArray(stored))legacyDrafts=stored.filter(draft=>draft&&typeof draft.id==='string'&&draft.id.startsWith('draft-')&&draft.fields&&typeof draft.fields==='object')}catch{}

function showToast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400)}
function beginPreviewProgress(label,percent=0){clearTimeout(previewProgressTimer);const token=++previewProgressSequence;activePreviewProgress=token;previewProgressStartedAt=performance.now();previewLoading.hidden=false;document.getElementById('preview-loading-label').textContent=label;setPreviewProgress(percent);return token}
function setPreviewProgress(percent){const value=Math.max(0,Math.min(100,Math.round(percent)));document.getElementById('preview-loading-percent').textContent=`${value} %`;document.getElementById('preview-progress-bar').style.width=`${value}%`}
function finishPreviewProgress(token){if(!token||token!==activePreviewProgress)return;setPreviewProgress(100);const visibleFor=performance.now()-previewProgressStartedAt;previewProgressTimer=setTimeout(()=>{if(token===activePreviewProgress)previewLoading.hidden=true},Math.max(420,650-visibleFor))}
function setVideoEditStatus(state='idle'){
  const active=state!=='idle'&&state!=='ready';
  const heading=state==='error'?'VIDEO SE NEPODAŘILO NAČÍST':state==='seeking'?'NAČÍTÁM VYBRANÝ SNÍMEK':state==='buffering'?'DOČÍTÁM VIDEO':'NAČÍTÁM VIDEO K ÚPRAVÁM';
  const detail=state==='error'?'Zkus znovu vybrat video z knihovny.':state==='seeking'||state==='buffering'?'Počkej na zobrazení snímku.':'Časová osa se zpřístupní, až bude připravený snímek.';
  for(const id of ['preview','modal']){const overlay=document.getElementById(`${id}-video-edit-status`);overlay.hidden=!active;overlay.classList.toggle('is-error',state==='error');overlay.querySelector('strong').textContent=heading;overlay.querySelector('small').textContent=detail;document.getElementById(id==='preview'?'device-frame':'modal-canvas-frame').setAttribute('aria-busy',String(active))}
}
function selectedAsset(){return assets[selected]||null}
function removeAssetFromSelection(index){
  const wasSelected=index===selected;
  const [removed]=assets.splice(index,1);
  if(wasSelected){
    setPreviewPlayback(false);
    video.pause();video.removeAttribute('src');video.load();
    selected=-1;clipSelectionLoaded=false;selectedStartFrame=0;selectedEndFrame=5*PREVIEW_FPS;
  }else if(index<selected)selected--;
  renderAssetGrid();syncFrameScrubbers();
  if(wasSelected)refreshPreview('OBSAH ODEBRÁN',100);
  showToast(`Odebráno z výběru: ${removed.name}.`);
}
function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src})}
function updateCounts(){const n=String(remoteLibrary.reduce((sum,folder)=>sum+folder.files.length,0)).padStart(2,'0');document.getElementById('asset-count').textContent=n}
function showView(name){document.querySelectorAll('[data-view]').forEach(view=>{const active=view.dataset.view===name;view.hidden=!active;view.classList.toggle('is-active',active)});document.querySelectorAll('[data-view-target]').forEach(button=>button.classList.toggle('active',button.dataset.viewTarget===name));window.scrollTo({top:0,behavior:'smooth'});if(name==='drafts')loadRemoteLibrary()}
function closeActionModal(){document.getElementById('action-modal').hidden=true;modalAction=null}
function openActionModal({eyebrow,title,description,meta,artClass,artLabel,buttonLabel,action}){modalAction=action;document.getElementById('action-modal-eyebrow').textContent=eyebrow;document.getElementById('action-modal-title').textContent=title;document.getElementById('action-modal-description').textContent=description;document.getElementById('action-modal-meta').textContent=meta;const art=document.getElementById('action-modal-art');art.className=`action-modal-art ${artClass||''}`;art.querySelector('span').textContent=artLabel||'AT';document.getElementById('action-modal-primary').textContent=buttonLabel;document.getElementById('action-modal').hidden=false;document.getElementById('action-modal-primary').focus()}
function openFormatModal(format){const f=formatMap[format];if(!f)return;openActionModal({eyebrow:'PŘIPRAVENÝ FORMÁT / EXPORT',title:f.title,description:'Tento formát se otevře v editoru s připraveným poměrem stran. Vyber nebo načti médium a pokračuj v tvorbě.',meta:`POMĚR  ·  ${f.ratio.replaceAll(' ','')}     /     ${f.width} × ${f.height} PX`,artClass:`format-art ${format}`,artLabel:f.ratio.replaceAll(' ','').replace('/',':'),buttonLabel:'VYBRAT TENTO FORMÁT',action:{type:'format',format}})}
const draftFieldIds=['main-headline','main-headline-size','main-headline-color','post-headline','headline-size','post-headline-color','content-x','content-y','caption','caption-size','caption-color','text-effect','track-select','track-size','overlay-color','overlay-opacity','monochrome-strength'];
function draftThumbnail(){try{const thumb=document.createElement('canvas');thumb.width=120;thumb.height=120;drawCover(thumb.getContext('2d'),canvas,120,120);return thumb.toDataURL('image/jpeg',.55)}catch{return''}}
function renderDrafts(){
  const merged=new Map(legacyDrafts.map(item=>[item.id,{...item,localOnly:true}]));for(const item of Object.values(draftData))merged.set(item.id,item);
  const drafts=Array.from(merged.values()).sort((a,b)=>(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0));
  const list=document.getElementById('draft-list');document.getElementById('draft-count').textContent=String(drafts.length).padStart(2,'0');list.replaceChildren();
  if(!drafts.length){const empty=document.createElement('p');empty.className='draft-empty';empty.textContent=cloudDraftsLoaded?'Zatím tu nejsou žádné uložené příspěvky.':'Načítám uložené příspěvky z GitHubu…';list.append(empty);return}
  for(const draft of drafts){
    const card=document.createElement('article');card.className='draft-card';card.dataset.draftCard=draft.id;card.tabIndex=0;card.setAttribute('aria-label',`Otevřít návrh ${draft.title||'bez názvu'}`);
    const thumb=document.createElement('span');thumb.className='draft-thumb';if(typeof draft.thumbnail==='string'&&draft.thumbnail.startsWith('data:image/jpeg;base64,'))thumb.style.backgroundImage=`url("${draft.thumbnail}")`;
    const copy=document.createElement('span');copy.className='draft-copy';const title=document.createElement('b');title.textContent=draft.title||'Bez názvu';const detail=document.createElement('small');const song=draft.fields?.['track-select']||'Bez skladby',format=formatMap[draft.format]?.title||'Story';detail.textContent=`${song} · ${format} · ${new Date(draft.updatedAt||Date.now()).toLocaleString('cs-CZ',{dateStyle:'short',timeStyle:'short'})}`;copy.append(title,detail);
    const actions=document.createElement('span');actions.className='draft-actions';const open=document.createElement('button');open.type='button';open.dataset.draftOpen=draft.id;open.textContent='POKRAČOVAT';open.addEventListener('click',event=>{event.stopPropagation();openDraftSafely(draft.id)});const remove=document.createElement('button');remove.type='button';remove.className='delete-action';remove.dataset.draftDelete=draft.id;remove.textContent='SMAZAT';remove.addEventListener('click',event=>{event.stopPropagation();deleteDraft(draft.id)});actions.append(open,remove);
    if(draft.localOnly){const status=document.createElement('span');status.className='draft-status';status.textContent='JEN V TOMTO PROHLÍŽEČI';card.append(thumb,copy,status,actions)}else card.append(thumb,copy,actions);
    card.addEventListener('click',event=>{if(!event.target.closest('button'))openDraftSafely(draft.id)});card.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target===card){event.preventDefault();openDraftSafely(draft.id)}});list.append(card);
  }
}
async function saveDraft(){if(!cloudDraftsLoaded){showToast('Počkej, než se dokončí načítání návrhů.');return}if(!studioApiToken){showToast('Pro ukládání se nejprve přihlas do Content Studia.');return}const id=currentDraftKey||`draft-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;const fields=Object.fromEntries(draftFieldIds.map(field=>[field,document.getElementById(field).value]));const asset=selectedAsset();const draft={id,state:'draft',title:fields['post-headline'].trim()||fields['main-headline'].trim()||asset?.name||'Nový návrh',fields,format:currentFormat,align:document.querySelector('[data-align].selected')?.dataset.align||'left',filters:Array.from(document.querySelectorAll('[data-video-filter]:checked')).map(input=>input.dataset.videoFilter),asset:asset?{name:asset.name,type:asset.type,src:asset.src,relativePath:asset.relativePath||'',source:asset.source||''}:null,startFrame:selectedStartFrame,endFrame:selectedEndFrame,thumbnail:draftThumbnail(),updatedAt:Date.now()};try{const saved=await writeDraftToGitHub(draft);draftData[id]=saved;legacyDrafts=legacyDrafts.filter(item=>item.id!==id);if(legacyDrafts.length)localStorage.setItem(draftStorageKey,JSON.stringify(legacyDrafts));else localStorage.removeItem(draftStorageKey);currentDraftKey=id;renderDrafts();await loadRemoteLibrary();if(!draftData[id])throw new Error('GitHub přijal zápis, ale návrh se zatím neobjevil v seznamu repozitáře. Obnov stránku nebo zkus načíst Obsah studia znovu.');showToast('Návrh uložen do Obsahu studia na GitHubu.')}catch(error){showToast(`Uložení na GitHub selhalo: ${error.message}`)}}
function base64Utf8(value){const bytes=new TextEncoder().encode(value);let binary='';for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));return btoa(binary)}
async function writeDraftToGitHub(draft){const{githubPath,githubSha,...record}=draft;return studioApiRequest('/api/drafts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record)})}
async function migrateLegacyDrafts(){if(!legacyDrafts.length)return true;try{for(const legacy of legacyDrafts){if(draftData[legacy.id]?.githubPath)continue;const saved=await writeDraftToGitHub({...legacy,state:legacy.state==='complete'?'complete':'draft'});draftData[legacy.id]=saved}localStorage.removeItem(draftStorageKey);legacyDrafts=[];renderDrafts();showToast('Starší návrhy byly přesunuty z prohlížeče na GitHub.');return true}catch(error){showToast(`Starší návrhy zatím zůstaly v tomto prohlížeči: ${error.message}`);return false}}
function openDraftSafely(key){try{loadDraft(key)}catch(error){console.error('Návrh se nepodařilo otevřít',error);showToast(`Návrh se nepodařilo otevřít: ${error.message||'zkus obnovit stránku.'}`)}}
function loadDraft(key){const draft=draftData[key]||legacyDrafts.find(item=>item.id===key);if(!draft){showToast('Tento návrh se už nepodařilo najít. Obnov Obsah studia a zkus to znovu.');return}setPreviewPlayback(false);currentDraftKey=key;showView('studio');document.getElementById('post-headline-color').value='#f4f0e5';document.getElementById('caption-color').value='#f4f0e5';document.getElementById('overlay-color').value='#e44132';document.getElementById('overlay-opacity').value='35';for(const field of draftFieldIds){const element=document.getElementById(field);if(element&&typeof draft.fields?.[field]==='string')element.value=draft.fields[field]}for(const id of ['main-headline-size','headline-size','caption-size','track-size']){const range=document.getElementById(id),readout=document.getElementById(`${id}-value`);if(range&&readout)readout.value=`${range.value} %`}const caption=document.getElementById('caption'),trackSelect=document.getElementById('track-select');document.getElementById('char-count').textContent=`${caption.value.length} / 500`;const track=trackSelect.value;document.getElementById('track-hint').textContent=track?`Odkaz: Spotify · Atari Terror — ${track}`:'Výběr skladby je nepovinný.';document.getElementById('copy-track').disabled=!track;document.querySelectorAll('[data-align]').forEach(button=>{const active=button.dataset.align===draft.align;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active))});document.querySelectorAll('[data-video-filter]').forEach(input=>input.checked=Boolean(draft.filters?.includes(input.dataset.videoFilter)));document.getElementById('overlay-opacity-value').value=`${document.getElementById('overlay-opacity').value} %`;document.getElementById('monochrome-strength-value').value=`${document.getElementById('monochrome-strength').value} %`;document.getElementById('monochrome-strength').disabled=!document.querySelector('[data-video-filter="noir"]').checked;const asset=draft.asset;if(asset&&['image','video'].includes(asset.type)){const restored={...asset};if(restored.relativePath&&restored.source==='github'){const encoded=restored.relativePath.split('/').map(encodeURIComponent).join('/');restored.src=`https://raw.githubusercontent.com/${githubRepository}/main/${encoded}`}let index=assets.findIndex(item=>item.relativePath&&item.relativePath===restored.relativePath||item.src===restored.src);if(index<0){assets.push({...restored,tag:restored.type==='video'?'VIDEO':'FOTO'});index=assets.length-1}selected=index}else selected=-1;renderAssetGrid();const formatButton=Array.from(document.querySelectorAll('.format-tab')).find(button=>button.dataset.format===draft.format);formatButton?.click();if(asset?.type==='video'){selectedStartFrame=Number(draft.startFrame)||0;selectedEndFrame=Number(draft.endFrame)||5*PREVIEW_FPS;clipSelectionLoaded=true;saveClipSelection();restartPreviewClip()}else{syncFrameScrubbers();refreshPreview('PŘIPRAVUJI NÁVRH',8)}closeActionModal();showToast(draft.state==='complete'?'Hotový návrh otevřen v editoru.':'Rozpracovaný návrh otevřen v editoru.')}
async function deleteDraft(key){const draft=draftData[key]||legacyDrafts.find(item=>item.id===key);if(!draft)return;if(!draft.githubPath){legacyDrafts=legacyDrafts.filter(item=>item.id!==key);if(legacyDrafts.length)localStorage.setItem(draftStorageKey,JSON.stringify(legacyDrafts));else localStorage.removeItem(draftStorageKey);renderDrafts();showToast('Lokální návrh byl odstraněn z tohoto prohlížeče.');return}if(!studioApiToken){showToast('Pro mazání se nejprve přihlas do Content Studia.');return}try{await studioApiRequest('/api/drafts/'+encodeURIComponent(key),{method:'DELETE'});delete draftData[key];if(currentDraftKey===key)currentDraftKey=null;renderDrafts();showToast(`Návrh „${draft.title}“ byl smazán z GitHubu.`)}catch(error){showToast(`Smazání z GitHubu selhalo: ${error.message}`)}}
let libraryLoadPromise=null;
async function loadRemoteLibrary(){if(libraryLoadPromise)return libraryLoadPromise;libraryLoadPromise=loadRemoteLibraryNow();try{return await libraryLoadPromise}finally{libraryLoadPromise=null}}
async function loadRemoteLibraryNow(){
  const status=document.getElementById('library-source-status');
  const draftStatus=document.getElementById('draft-storage-status');
  if(status)status.textContent='Načítám obsah složek z GitHubu…';
  if(draftStatus)draftStatus.textContent='Načítám uložené návrhy z GitHubu…';
  try{
    const response=await fetch(`https://api.github.com/repos/${githubRepository}/git/trees/main?recursive=1&_=${Date.now()}`,{cache:'no-store',headers:githubToken?githubHeaders():{Accept:'application/vnd.github+json'}});
    if(!response.ok){let detail='';try{detail=(await response.json()).message||''}catch{}throw new Error(detail||`GitHub vrátil chybu ${response.status}.`)}
    const tree=await response.json();if(tree.truncated)throw new Error('Seznam souborů repozitáře je příliš velký; zkus načtení znovu.');
    const folders=libraryDirectories.map(name=>({name,path:`GitHub / ${githubRepository}/${name}`,files:[]}));const draftFiles=[];
    for(const entry of tree.tree||[]){if(entry.type!=='blob'||entry.path.endsWith('/.gitkeep'))continue;const parts=entry.path.split('/');if(parts[0]==='content-studio'&&['drafts','completed'].includes(parts[1])&&entry.path.endsWith('.json')){draftFiles.push(entry);continue}const folder=folders.find(item=>item.name===parts[0]);if(!folder)continue;const name=parts.pop(),encodedPath=entry.path.split('/').map(encodeURIComponent).join('/');folder.files.push({name,path:entry.path,sha:entry.sha,url:`https://raw.githubusercontent.com/${githubRepository}/main/${encodedPath}?_=${Date.now()}`,type:mediaType(name),size:entry.size})}
    const records=await Promise.all(draftFiles.map(async entry=>{try{const encodedPath=entry.path.split('/').map(encodeURIComponent).join('/');const response=await fetch(`https://raw.githubusercontent.com/${githubRepository}/main/${encodedPath}?_=${Date.now()}`,{cache:'no-store'});if(!response.ok)throw new Error(`Nelze načíst ${entry.path}`);const record=await response.json();if(!record||typeof record.id!=='string'||!record.id.startsWith('draft-')||!record.fields||typeof record.fields!=='object')return null;return{...record,state:entry.path.split('/')[1]==='completed'?'complete':'draft',githubPath:entry.path,githubSha:entry.sha}}catch(error){console.warn(error);return null}}));
    for(const key of Object.keys(draftData))delete draftData[key];for(const record of records)if(record)draftData[record.id]=record;cloudDraftsLoaded=true;renderDrafts();if(draftStatus){const legacyNote=legacyDrafts.length?` Nalezeno také ${legacyDrafts.length} starších návrhů v tomto prohlížeči; přihlas se a přesunu je.`:'';draftStatus.textContent=`Návrhy se ukládají do veřejného GitHub repozitáře · ${records.filter(Boolean).length} záznamů.${legacyNote}`}
    remoteLibrary=folders;renderFolderList();renderFolderList('picker-folder-list');if(status){const count=remoteLibrary.reduce((sum,folder)=>sum+folder.files.length,0);status.textContent=`Načteno z GitHubu · ${count} souborů v ${remoteLibrary.length} složkách.`}updateCounts()
  }catch(error){cloudDraftsLoaded=false;if(status)status.textContent=`Knihovnu se nepodařilo načíst: ${error.message}`;if(draftStatus)draftStatus.textContent=`Návrhy se nepodařilo načíst z GitHubu: ${error.message}`;renderDrafts()}
}
function mediaType(name){const extension=name.split('.').pop().toLowerCase();if(['mp4','mov','m4v','webm','mkv'].includes(extension))return'video';if(['jpg','jpeg','png','gif','webp','avif'].includes(extension))return'image';if(['txt','md','srt','vtt','json','csv'].includes(extension))return'text';return'file'}
function safeFilePath(folder,name){return`${folder}/${name.split('/').map(encodeURIComponent).join('/')}`}
function githubHeaders(){return{Accept:'application/vnd.github+json',Authorization:`Bearer ${githubToken}`,'X-GitHub-Api-Version':'2022-11-28'}}
function openGithubConnect(action){pendingGithubAction=action;const modal=document.getElementById('github-connect-modal');modal.hidden=false;modal.setAttribute('aria-hidden','false');document.getElementById('github-token-input').focus()}
function closeGithubConnect(){document.getElementById('github-connect-modal').hidden=true;document.getElementById('github-token-input').value=''}
async function uploadLibraryFile(folder,file){if(!githubToken){openGithubConnect(()=>uploadLibraryFile(folder,file));return}if(file.size>50*1024*1024){showToast('Soubor je větší než 50 MB. Pro takto velká videa je potřeba Git LFS.');return}try{const existing=remoteLibrary.find(item=>item.name===folder)?.files.find(item=>item.name===file.name);if(existing&&!confirm(`„${file.name}“ už existuje v ${folder}. Chceš ho na GitHubu nahradit?`))return;showToast(`Nahrávám ${file.name} do ${folder}…`);const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,offset+0x8000));const content=btoa(binary);const path=safeFilePath(folder,file.name);const payload={message:`Upload ${file.name} to ${folder}`,content};if(existing)payload.sha=existing.sha;const response=await fetch(`${githubApiRoot}/${path}`,{method:'PUT',headers:{...githubHeaders(),'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(result.message||`GitHub vrátil chybu ${response.status}.`);await loadRemoteLibrary();showToast(`Nahráno do GitHubu: ${file.name}`)}catch(error){if(/401|Bad credentials/i.test(error.message)){rememberGithubToken('');document.getElementById('github-connect').textContent='PŘIPOJIT GITHUB ↗'}showToast(`Nahrávání selhalo: ${error.message}`)}}
async function deleteLibraryFile(folder,file){if(!githubToken){openGithubConnect(()=>deleteLibraryFile(folder,file));return}if(!confirm(`Opravdu smazat „${file.name}“ ze složky ${folder} na GitHubu?`))return;try{const response=await fetch(`${githubApiRoot}/${safeFilePath(folder,file.name)}`,{method:'DELETE',headers:{...githubHeaders(),'Content-Type':'application/json'},body:JSON.stringify({message:`Delete ${file.name} from ${folder}`,sha:file.sha})});const result=await response.json();if(!response.ok)throw new Error(result.message||`GitHub vrátil chybu ${response.status}.`);const assetIndex=assets.findIndex(asset=>asset.relativePath===file.path||asset.name===file.name&&asset.source==='github');if(assetIndex>=0){if(selected===assetIndex){setPreviewPlayback(false);video.pause()}assets.splice(assetIndex,1);if(selected>=assets.length)selected=Math.max(0,assets.length-1);renderAssetGrid()}await loadRemoteLibrary();showToast(`Smazáno z GitHubu: ${file.name}`)}catch(error){showToast(`Mazání selhalo: ${error.message}`)}}
function renderFolderList(targetId='folder-list'){
  const container=document.getElementById(targetId);if(!container)return;container.replaceChildren();const canManage=targetId==='folder-list';
  remoteLibrary.forEach(folder=>{const card=document.createElement('section');card.className='folder-card';const head=document.createElement('div');head.className='folder-card-head';const icon=document.createElement('span');icon.className='folder-icon';icon.textContent='▰';const label=document.createElement('div');const title=document.createElement('strong');title.textContent=folder.name;const path=document.createElement('small');path.textContent=folder.path;label.append(title,path);const count=document.createElement('span');count.className='folder-count';count.textContent=`${String(folder.files.length).padStart(2,'0')} SOUBORŮ`;head.append(icon,label,count);if(canManage){const upload=document.createElement('button');upload.type='button';upload.className='button button-outline folder-upload';upload.textContent='＋ NAHRÁT';upload.dataset.folderUpload=folder.name;const input=document.createElement('input');input.type='file';input.hidden=true;input.dataset.folderFile=folder.name;upload.addEventListener('click',()=>input.click());input.addEventListener('change',()=>{const file=input.files?.[0];if(file)uploadLibraryFile(folder.name,file);input.value=''});head.append(upload,input)}card.append(head);const list=document.createElement('div');list.className='folder-files';folder.files.forEach(file=>{if(!canManage&&!['video','image'].includes(file.type))return;const assetIndex=assets.findIndex(asset=>asset.relativePath===file.path||asset.src===file.url);const row=document.createElement('button');row.type='button';row.className='folder-file'+(assetIndex>=0?' loaded':'');row.textContent=file.name;row.title=['video','image'].includes(file.type)?'Načíst tento soubor do editoru':'Soubor není obraz ani video';row.dataset.assetName=file.name;row.dataset.assetPath=file.path;row.dataset.assetUrl=file.url;row.dataset.assetType=file.type;row.dataset.folder=folder.name;row.dataset.assetIndex=String(assetIndex);row.dataset.loaded=String(assetIndex>=0);const line=document.createElement('div');line.className='folder-file-row';line.append(row);if(canManage){const remove=document.createElement('button');remove.type='button';remove.className='folder-delete';remove.textContent='SMAZAT';remove.title=`Smazat ${file.name} z GitHubu`;remove.dataset.deleteFile=file.name;remove.dataset.folder=folder.name;remove.dataset.fileSha=file.sha;line.append(remove)}list.append(line)});if(!list.children.length){const empty=document.createElement('p');empty.className='folder-empty';empty.textContent='Zatím bez souborů';list.append(empty)}card.append(list);container.append(card)});
}
function activeMediaFilter(){const enabled=document.querySelector('[data-video-filter="noir"]')?.checked;if(!enabled)return'none';const strength=Math.max(0,Math.min(100,Number(document.getElementById('monochrome-strength')?.value||50)))/100;const contrast=(1+strength*.65).toFixed(2),brightness=(1-strength*.18).toFixed(2);return`grayscale(1) contrast(${contrast}) brightness(${brightness})`}
function drawColorOverlay(c,asset,w,h){if(asset?.type!=='video'||!document.querySelector('[data-video-filter="color-overlay"]:checked'))return;const color=document.getElementById('overlay-color').value,opacity=Math.max(0,Math.min(1,Number(document.getElementById('overlay-opacity').value)/100));if(!opacity)return;c.save();c.globalAlpha=opacity;c.fillStyle=color;c.fillRect(0,0,w,h);c.restore()}
function selectedStartSeconds(){return selectedStartFrame/PREVIEW_FPS}
function selectedEndSeconds(){return selectedEndFrame/PREVIEW_FPS}
function effectiveVideoDuration(){return Math.max(1,selectedEndSeconds()-selectedStartSeconds())}
function frameLabel(frame){const whole=Math.floor(frame/PREVIEW_FPS);const minutes=Math.floor(whole/60),seconds=whole%60,subframe=frame%PREVIEW_FPS;return`${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}:${String(subframe).padStart(2,'0')}`}
function timelinePosition(track,frame,maximum){const thumbWidth=18;return `${thumbWidth/2+(maximum?Math.max(0,Math.min(1,frame/maximum)):0)*Math.max(0,track.clientWidth-thumbWidth)}px`}
function syncDualRangeTrack(start,maximum){const track=start.closest('.dual-range-track');if(!track)return;const end=track.querySelector('.dual-range-end');track.style.setProperty('--range-start',timelinePosition(track,Number(start.value),maximum));track.style.setProperty('--range-end',timelinePosition(track,Number(end.value),maximum));track.classList.toggle('close-blades',maximum>0&&(Number(end.value)-Number(start.value))/maximum<.12)}
function syncModalTimeline(){for(const id of ['preview','modal']){const track=document.getElementById(`${id}-start-frame`)?.closest('.marked-dual-range-track'),time=document.getElementById(`${id}-playhead-time`);if(!track||!time)continue;const maximum=Number(document.getElementById(`${id}-start-frame`).max)||0,frame=Math.max(0,Math.min(maximum,Math.floor((video.currentTime||0)*PREVIEW_FPS+1e-6)));track.style.setProperty('--playhead',timelinePosition(track,frame,maximum));time.value=time.textContent=frameLabel(frame);for(const endpoint of ['start','end'])document.getElementById(`${id}-set-${endpoint}`).disabled=!maximum||!videoEditorReady}}
if(typeof ResizeObserver!=='undefined'){const timelineResizeObserver=new ResizeObserver(()=>{for(const id of ['preview','modal']){const start=document.getElementById(`${id}-start-frame`);if(start)syncDualRangeTrack(start,Number(start.max)||0)}syncModalTimeline()});for(const track of document.querySelectorAll('.marked-dual-range-track'))timelineResizeObserver.observe(track)}
function syncFrameScrubbers(){
  const asset=selectedAsset();
  if(asset?.type!=='video'){videoEditorReady=false;clearTimeout(videoSeekStatusTimer);setVideoEditStatus('idle')}
  const sourceMatches=asset?.type==='video'&&video.src===new URL(asset.src,document.baseURI).href;
  const hasDuration=sourceMatches&&Number.isFinite(video.duration)&&video.duration>0;
  const enabled=hasDuration&&videoEditorReady;
  const maximum=hasDuration?Math.floor(video.duration*PREVIEW_FPS):0;
  const minGap=Math.min(maximum,5*PREVIEW_FPS);
  if(hasDuration){
    if(!clipSelectionLoaded){selectedStartFrame=0;selectedEndFrame=maximum;clipSelectionLoaded=true}
    selectedStartFrame=Math.max(0,Math.min(Math.max(0,maximum-minGap),selectedStartFrame));
    selectedEndFrame=Math.max(selectedStartFrame+minGap,Math.min(maximum,selectedEndFrame));
    if(videoEditorReady)saveClipSelection();
  }
  for(const id of ['preview','modal']){
    const start=document.getElementById(`${id}-start-frame`),end=document.getElementById(`${id}-end-frame`);
    const startLabel=document.getElementById(`${id}-start-frame-label`),endLabel=document.getElementById(`${id}-end-frame-label`);
    const durationLabel=document.getElementById(`${id}-clip-duration`),controls=document.getElementById(`${id}-video-controls`),play=document.getElementById(`${id}-play-toggle`);
    if(!start||!end)continue;
    controls.hidden=id==='preview'?false:!hasDuration;
    if(id==='modal')document.getElementById('modal-no-video').hidden=hasDuration;
    start.disabled=end.disabled=!enabled;start.min=end.min='0';start.max=end.max=String(maximum);
    start.value=String(selectedStartFrame);end.value=String(selectedEndFrame);
    syncDualRangeTrack(start,maximum);
    syncModalTimeline();
    startLabel.value=startLabel.textContent=frameLabel(selectedStartFrame);endLabel.value=endLabel.textContent=frameLabel(selectedEndFrame);
    for(const endpoint of ['start','end']){const bladeTime=document.getElementById(`${id}-${endpoint}-blade-time`);bladeTime.value=bladeTime.textContent=frameLabel(endpoint==='start'?selectedStartFrame:selectedEndFrame)}
    durationLabel.value=durationLabel.textContent=frameLabel(selectedEndFrame-selectedStartFrame);
    const hint=document.getElementById(`${id}-frame-hint`);
    if(hint)hint.textContent=enabled?`Vybraný úsek z celkové délky ${formatVideoTime(video.duration)}. Bílá čárka označuje aktuální snímek; hranice konce je za posledním zahrnutým snímkem.`:asset?.type==='video'?'Připravuji video a časovou osu k úpravám.':'Nejdřív vyber video v kroku 1.';
    play.disabled=!enabled;play.textContent=previewPlaying?'Ⅱ POZASTAVIT':'▶ PREVIEW';play.setAttribute('aria-label',previewPlaying?'Pozastavit preview':'Preview');
  }
}
function updateFrameScrubberReadout(){
  for(const id of ['preview','modal']){
    const start=document.getElementById(`${id}-start-frame`),end=document.getElementById(`${id}-end-frame`);
    if(!start||!end)continue;
    start.value=String(selectedStartFrame);end.value=String(selectedEndFrame);
    syncDualRangeTrack(start,Number(start.max));
    syncModalTimeline();
    const startLabel=document.getElementById(`${id}-start-frame-label`),endLabel=document.getElementById(`${id}-end-frame-label`),durationLabel=document.getElementById(`${id}-clip-duration`);
    startLabel.value=startLabel.textContent=frameLabel(selectedStartFrame);endLabel.value=endLabel.textContent=frameLabel(selectedEndFrame);
    for(const endpoint of ['start','end']){const bladeTime=document.getElementById(`${id}-${endpoint}-blade-time`);bladeTime.value=bladeTime.textContent=frameLabel(endpoint==='start'?selectedStartFrame:selectedEndFrame)}
    durationLabel.value=durationLabel.textContent=frameLabel(selectedEndFrame-selectedStartFrame);
    const hint=document.getElementById(`${id}-frame-hint`);
    if(hint&&Number.isFinite(video.duration))hint.textContent=`Vybraný úsek z celkové délky ${formatVideoTime(video.duration)}. Bílá čárka označuje aktuální snímek; hranice konce je za posledním zahrnutým snímkem.`;
  }
}
function selectedEndpointSeconds(endpoint='start'){return endpoint==='end'?Math.max(selectedStartSeconds(),selectedEndSeconds()-1/PREVIEW_FPS):selectedStartSeconds()}
function seekSelectedEndpoint(endpoint='start',immediate=false){
  pendingSeekEndpoint=endpoint;clearTimeout(pendingSeekTimer);
  const seek=()=>{pendingSeekTimer=0;if(!videoEditorReady||video.readyState<1)return;if(video.seeking){pendingSeekTimer=setTimeout(seek,60);return}const target=selectedEndpointSeconds(pendingSeekEndpoint);if(Math.abs(video.currentTime-target)<1/(PREVIEW_FPS*2))return;lastRangeSeekAt=performance.now();try{video.currentTime=target}catch{}};
  pendingSeekTimer=setTimeout(seek,immediate?0:Math.max(140,180-(performance.now()-lastRangeSeekAt)));
}
function redrawTextLayout(){if(previewPlaying)setPreviewPlayback(false);drawDesign(canvas);if(!document.getElementById('preview-modal').hidden)drawDesign(document.getElementById('modal-canvas'))}
function setPreviewAudio(enabled){video.muted=!enabled;video.volume=enabled?1:0;if(videoAudioSource&&videoAudioContext){try{if(enabled)videoAudioSource.connect(videoAudioContext.destination);else videoAudioSource.disconnect(videoAudioContext.destination)}catch{}}if(enabled&&videoAudioContext?.state==='suspended')videoAudioContext.resume().catch(()=>{})}
function setPreviewPlayback(playing){previewPlaying=playing;syncFrameScrubbers();if(!playing){video.pause();setPreviewAudio(false);if(modalFrameRequest)cancelAnimationFrame(modalFrameRequest);modalFrameRequest=0;startTextMotionPreview();return}const asset=selectedAsset();if(asset?.type!=='video')return;const play=()=>{if(!previewPlaying)return;const start=selectedStartSeconds();try{if(video.currentTime<start||video.currentTime>=selectedEndSeconds())video.currentTime=start}catch{}setPreviewAudio(true);video.play().catch(()=>setPreviewPlayback(false));previewStartedAt=performance.now();animateModalPreview()};if(video.readyState>=2)play();else video.addEventListener('loadeddata',play,{once:true})}
function renderLiveFrame(time){if(liveRenderBusy)return;liveRenderBusy=true;drawDesign(canvas,currentFormat,time).then(()=>{if(document.getElementById('preview-modal').hidden)return;const modalCanvas=document.getElementById('modal-canvas');if(modalCanvas.width!==canvas.width)modalCanvas.width=canvas.width;if(modalCanvas.height!==canvas.height)modalCanvas.height=canvas.height;modalCanvas.getContext('2d').drawImage(canvas,0,0)}).catch(error=>console.warn('Náhled se nepodařilo vykreslit:',error)).finally(()=>{liveRenderBusy=false})}
function animateModalPreview(){if(!previewPlaying)return;const t=(performance.now()-previewStartedAt)/1000;syncModalTimeline();renderLiveFrame(t);modalFrameRequest=requestAnimationFrame(animateModalPreview)}
function startTextMotionPreview(){if(textMotionRequest)cancelAnimationFrame(textMotionRequest);if(document.getElementById('text-effect').value==='none'||previewPlaying||exportInProgress)return;textMotionStartedAt=performance.now();const frame=now=>{if(previewPlaying||exportInProgress||document.getElementById('text-effect').value==='none'){textMotionRequest=0;return}renderLiveFrame((now-textMotionStartedAt)/1000);textMotionRequest=requestAnimationFrame(frame)};textMotionRequest=requestAnimationFrame(frame)}
function formatVideoTime(seconds){const total=Math.max(0,Math.floor(seconds));return`${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`}
function waitForEditableFrame(){
  if(video.readyState>=2&&!video.seeking)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timeout);for(const event of ['loadeddata','canplay','seeked'])video.removeEventListener(event,ready);video.removeEventListener('error',fail)};
    const ready=()=>{if(video.readyState<2||video.seeking)return;cleanup();resolve()};
    const fail=()=>{cleanup();reject(new Error('Video se nepodařilo načíst do editoru.'))};
    const timeout=setTimeout(()=>{cleanup();reject(new Error('Načítání videa trvá příliš dlouho.'))},20000);
    for(const event of ['loadeddata','canplay','seeked'])video.addEventListener(event,ready);
    video.addEventListener('error',fail,{once:true});ready();
  });
}
function loadVideoSource(src,reportProgress=false){
  const absoluteSrc=new URL(src,document.baseURI).href,changed=video.src!==absoluteSrc;
  const token=reportProgress&&changed?beginPreviewProgress('NAČÍTÁM VIDEO',4):0;
  if(changed){video.pause();video.src=absoluteSrc;video.load()}
  const update=()=>{if(!token)return;let percent=8;if(Number.isFinite(video.duration)&&video.duration>0&&video.buffered.length){const end=video.buffered.end(video.buffered.length-1);percent=Math.max(percent,Math.floor(Math.min(1,end/video.duration)*92))}else if(video.readyState>=1)percent=32;setPreviewProgress(percent)};
  video.addEventListener('progress',update);video.addEventListener('loadedmetadata',update);
  return waitForEditableFrame().finally(()=>{video.removeEventListener('progress',update);video.removeEventListener('loadedmetadata',update);if(token)finishPreviewProgress(token)});
}
function refreshPreview(label='AKTUALIZUJI NÁHLED',percent=12){const token=beginPreviewProgress(label,percent);drawDesign(canvas).then(()=>finishPreviewProgress(token)).catch(()=>finishPreviewProgress(token))}
async function restartPreviewClip(){
  const asset=selectedAsset(),loadToken=++videoEditorLoadToken;
  if(asset?.type!=='video'){videoEditorReady=false;setVideoEditStatus('idle');syncFrameScrubbers();return}
  setPreviewPlayback(false);video.pause();videoEditorReady=false;setVideoEditStatus('loading');syncFrameScrubbers();
  try{
    await loadVideoSource(asset.src,false);
    if(loadToken!==videoEditorLoadToken||selectedAsset()!==asset)return;
    restoreClipSelection(asset);syncFrameScrubbers();
    await seekVideoForExport(selectedStartSeconds());await waitForEditableFrame();
    if(loadToken!==videoEditorLoadToken||selectedAsset()!==asset)return;
    await drawDesign(canvas);
    if(!document.getElementById('preview-modal').hidden)await drawDesign(document.getElementById('modal-canvas'));
    videoEditorReady=true;setVideoEditStatus('ready');syncFrameScrubbers();
  }catch(error){if(loadToken!==videoEditorLoadToken||selectedAsset()!==asset)return;videoEditorReady=false;setVideoEditStatus('error');syncFrameScrubbers();showToast(error.message||'Video se nepodařilo připravit k úpravám.')}
}
video.loop=false;
video.addEventListener('loadedmetadata',syncFrameScrubbers);
function queueVideoBufferStatus(state){if(!videoEditorReady)return;clearTimeout(videoSeekStatusTimer);videoSeekStatusTimer=setTimeout(()=>{if(videoEditorReady&&(video.seeking||video.readyState<2))setVideoEditStatus(state)},180)}
function clearVideoBufferStatus(){clearTimeout(videoSeekStatusTimer);if(videoEditorReady&&video.readyState>=2&&!video.seeking)setVideoEditStatus('ready')}
video.addEventListener('seeking',()=>queueVideoBufferStatus('seeking'));
video.addEventListener('waiting',()=>queueVideoBufferStatus('buffering'));
video.addEventListener('canplay',clearVideoBufferStatus);
video.addEventListener('playing',clearVideoBufferStatus);
video.addEventListener('seeked',()=>{syncModalTimeline();drawDesign(canvas);if(!document.getElementById('preview-modal').hidden)drawDesign(document.getElementById('modal-canvas'))});
video.addEventListener('seeked',clearVideoBufferStatus);
video.addEventListener('timeupdate',()=>{syncModalTimeline();if(exportRecording||!videoEditorReady||timelineDragging||selectedAsset()?.type!=='video'||!Number.isFinite(video.duration))return;const clipStart=selectedStartSeconds();const clipEnd=selectedEndSeconds();if(video.currentTime<clipStart){try{video.currentTime=clipStart}catch{}}else if(video.currentTime>=clipEnd){video.pause();if(previewPlaying)setPreviewPlayback(false)}});
function drawCover(target,source,w,h){const sw=source.videoWidth||source.naturalWidth||source.width;const sh=source.videoHeight||source.naturalHeight||source.height;if(!sw||!sh)return;const scale=Math.max(w/sw,h/sh);const dw=sw*scale,dh=sh*scale;target.drawImage(source,(w-dw)/2,(h-dh)/2,dw,dh)}
function wrappedTextLines(context,text,maxWidth){const lines=[];for(const paragraph of text.split(/\n/)){let line='';for(const word of paragraph.split(/\s+/)){const test=line?`${line} ${word}`:word;if(context.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test}if(line)lines.push(line)}return lines}
function drawWrappedTitle(context,text,x,y,maxWidth,size,color){context.fillStyle=color;context.font=`900 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;const lines=wrappedTextLines(context,text,maxWidth);const lineHeight=size*.86;lines.forEach(line=>{context.fillText(line,x,y,maxWidth);y+=lineHeight});return y}
async function drawDesign(target, format=currentFormat, time=null){const spec=formatMap[format];if(target.width!==spec.width)target.width=spec.width;if(target.height!==spec.height)target.height=spec.height;let c=target.getContext('2d');const w=spec.width,h=spec.height;const asset=selectedAsset();const liveVideo=target===canvas&&asset?.type==='video';c.clearRect(0,0,w,h);
  if(target===canvas)document.getElementById('device-frame').classList.toggle('video-active',liveVideo);
  if(liveVideo){video.style.filter=activeMediaFilter();if(video.src!==new URL(asset.src,document.baseURI).href)await loadVideoSource(asset.src,true)}else{c.fillStyle='#181713';c.fillRect(0,0,w,h)}
  if(asset){try{c.save();c.filter=activeMediaFilter();if(asset.type==='video'){if(!liveVideo&&video.src!==new URL(asset.src,document.baseURI).href)await loadVideoSource(asset.src);if(video.readyState>=2&&video.videoWidth){const scale=Math.max(w/video.videoWidth,h/video.videoHeight);const dw=video.videoWidth*scale,dh=video.videoHeight*scale;const wobble=1+Math.sin(time*.8)*.018;c.save();c.translate(w/2,h/2);c.scale(wobble,wobble);c.drawImage(video,-dw/2,-dh/2,dw,dh);c.restore()}}else{let image=asset.image;if(!image){const token=target===canvas?beginPreviewProgress('PŘIPRAVUJI OBRÁZEK',24):0;image=asset.image=await loadImage(asset.src);if(token)finishPreviewProgress(token)}drawCover(c,image,w,h)}c.restore()}catch(error){c.restore();if(target===canvas){const token=beginPreviewProgress('MÉDIUM SE NEPODAŘILO NAČÍST',100);previewProgressTimer=setTimeout(()=>{if(token===activePreviewProgress)previewLoading.hidden=true},1800)}}}
  drawColorOverlay(c,asset,w,h);
  const shade=c.createLinearGradient(0,0,0,h);shade.addColorStop(0,'rgba(0,0,0,.12)');shade.addColorStop(.38,'rgba(0,0,0,.08)');shade.addColorStop(.7,'rgba(0,0,0,.55)');shade.addColorStop(1,'rgba(0,0,0,.95)');c.fillStyle=shade;c.fillRect(0,0,w,h);
  const tint=c.createLinearGradient(0,0,w,h);tint.addColorStop(0,'rgba(242,210,27,.13)');tint.addColorStop(.55,'rgba(20,18,14,0)');tint.addColorStop(1,'rgba(208,54,43,.2)');c.fillStyle=tint;c.fillRect(0,0,w,h);
  const pad=w*.075;const isWide=w/h>1.5;const isVertical=format==='story'||format==='fb-story';
  const align=document.querySelector('[data-align].selected')?.dataset.align||'left';
  const xPercent=Number(document.getElementById('content-x').value||8), yProgress=Number(document.getElementById('content-y').value)/100, centeredWidth=w*.84;
  const xProgress=(xPercent-8)/84;
  const textX=align==='left'?pad+xProgress*(w-pad*2):align==='right'?w-pad-xProgress*(w-pad*2):pad+centeredWidth/2+xProgress*(w-pad*2-centeredWidth);
  const maxWidth=align==='left'?w-textX-pad:align==='right'?textX-pad:centeredWidth;
  const mainHeadline=(document.getElementById('main-headline').value||'').trim().toUpperCase();
  const headline=(document.getElementById('post-headline').value||'').trim().toUpperCase();
  const caption=(document.getElementById('caption').value||'').trim();
  const footerLineY=h*.92,footerTextY=h*.955;
  const textKey=JSON.stringify([format,align,xPercent,yProgress,mainHeadline,headline,caption,document.getElementById('main-headline-size').value,document.getElementById('main-headline-color').value,document.getElementById('headline-size').value,document.getElementById('post-headline-color').value,document.getElementById('caption-size').value,document.getElementById('caption-color').value,document.getElementById('track-select').value,document.getElementById('track-size').value]);
  let layer=textLayerCache.get(format);
  if(!layer||layer.key!==textKey){
    const outputContext=c,textCanvas=layer?.canvas||document.createElement('canvas');
    if(textCanvas.width!==w*2||textCanvas.height!==h*2){textCanvas.width=w*2;textCanvas.height=h*2}
    c=textCanvas.getContext('2d');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,textCanvas.width,textCanvas.height);c.setTransform(2,0,0,2,0,0);
  let measureY=0,blockTop=Infinity,blockBottom=-Infinity;
  const measureTitle=(text,size)=>{c.font=`900 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;const lines=wrappedTextLines(c,text,maxWidth),lineHeight=size*.86;if(lines.length){blockTop=Math.min(blockTop,measureY-size*.8);blockBottom=Math.max(blockBottom,measureY+(lines.length-1)*lineHeight+size*.2);measureY+=lines.length*lineHeight}};
  if(mainHeadline){const scale=Number(document.getElementById('main-headline-size').value||100)/100;const size=Math.max(8,w*(isWide?.058:.085)*1.5*scale);measureTitle(mainHeadline,size);if(headline)measureY+=Math.max(12,w*.03)}
  if(headline){const scale=Number(document.getElementById('headline-size').value||100)/100;const size=Math.max(8,w*(isWide?.058:.085)*scale);measureTitle(headline,size)}
  if(caption){if(headline)measureY+=Math.max(12,w*.03);const scale=Number(document.getElementById('caption-size').value||100)/100;const fontSize=Math.max(8,w*CAPTION_FONT_RATIO*scale),lineHeight=fontSize*1.42;c.font=`500 ${fontSize}px "DM Sans", Arial, sans-serif`;for(const paragraph of caption.split(/\n/)){if(!paragraph){measureY+=lineHeight*.65;continue}const lines=wrappedTextLines(c,paragraph,maxWidth);if(lines.length){blockTop=Math.min(blockTop,measureY-fontSize*.8);blockBottom=Math.max(blockBottom,measureY+(lines.length-1)*lineHeight+fontSize*.22);measureY+=lines.length*lineHeight}}}
  const selectedTrack=document.getElementById('track-select').value;
  const trackScale=Number(document.getElementById('track-size').value||100)/100;
  if(selectedTrack){measureY+=Math.max(8,w*.018);const size=Math.max(10,w*.02*trackScale);blockTop=Math.min(blockTop,measureY-size*.8);blockBottom=Math.max(blockBottom,measureY+size*.2);measureY+=Math.max(16,size*1.45);const spotifySize=Math.max(9,w*.018*trackScale);blockTop=Math.min(blockTop,measureY-spotifySize*.8);blockBottom=Math.max(blockBottom,measureY+spotifySize*.2)}
  const textHeight=Number.isFinite(blockTop)?blockBottom-blockTop:0,safeTop=h*.055,safeBottom=footerLineY-h*.055,availableTextTravel=Math.max(0,safeBottom-safeTop-textHeight),anchorY=safeTop+yProgress*availableTextTravel-(Number.isFinite(blockTop)?blockTop:0);
  let cursorY=anchorY;
  c.textAlign=align;c.textBaseline='alphabetic';
  if(mainHeadline){const scale=Number(document.getElementById('main-headline-size').value||100)/100;const size=Math.max(8,w*(isWide?.058:.085)*1.5*scale);cursorY=drawWrappedTitle(c,mainHeadline,textX,cursorY,maxWidth,size,document.getElementById('main-headline-color').value||'#f2d21b');cursorY+=headline?Math.max(12,w*.03):0}
  if(headline){
    const titleScale=Number(document.getElementById('headline-size').value||100)/100;const titleSize=Math.max(8,w*(isWide?.058:.085)*titleScale);cursorY=drawWrappedTitle(c,headline,textX,cursorY,maxWidth,titleSize,document.getElementById('post-headline-color').value||'#f4f0e5');
  }
  if(caption){
    cursorY+=headline?Math.max(12,w*.03):0;c.fillStyle=document.getElementById('caption-color').value||'#f4f0e5';const captionScale=Number(document.getElementById('caption-size').value||100)/100;const fontSize=Math.max(10,w*CAPTION_FONT_RATIO*captionScale);c.font=`500 ${fontSize}px "DM Sans", Arial, sans-serif`;
    const lineHeight=fontSize*1.42;const paragraphs=caption.split(/\n/);for(const paragraph of paragraphs){if(!paragraph){cursorY+=lineHeight*.65;continue}let line='';for(const word of paragraph.split(/\s+/)){const test=line?`${line} ${word}`:word;if(c.measureText(test).width>maxWidth&&line){c.fillText(line,textX,cursorY,maxWidth);cursorY+=lineHeight;line=word}else line=test}if(line){c.fillText(line,textX,cursorY,maxWidth);cursorY+=lineHeight}}
  }
  if(selectedTrack){cursorY+=Math.max(8,w*.018);const trackFontSize=Math.max(10,w*.02*trackScale);c.fillStyle='#f2d21b';c.font=`500 ${trackFontSize}px "DM Mono", monospace`;c.fillText(`ATARI TERROR — ${selectedTrack.toUpperCase()}`,textX,cursorY,maxWidth);cursorY+=Math.max(16,trackFontSize*1.45)}
  if(selectedTrack){c.fillStyle='#f2d21b';c.font=`500 ${Math.max(9,w*.018*trackScale)}px "DM Mono", monospace`;c.fillText('POSLOUCHEJ NA SPOTIFY  ↗',textX,cursorY,maxWidth)}
    layer={key:textKey,canvas:textCanvas,centerX:textX+maxWidth/2,centerY:anchorY+textHeight/2,textX,maxWidth};
    textLayerCache.set(format,layer);c=outputContext;
  }
  const motion=document.getElementById('text-effect')?.value||'none';
  const animationTime=time===null?(performance.now()-(previewPlaying?previewStartedAt:textMotionStartedAt))/1000:time;
  const phase=animationTime*2*Math.PI/5.2;
  const transform={scale:1,x:0,y:0,rotate:0,reveal:null};
  if(motion==='zoom')transform.scale=1+.055*Math.sin(phase);
  else if(motion==='horizontal')transform.x=w*.028*Math.sin(phase);
  else if(motion==='vertical')transform.y=h*.018*Math.sin(phase);
  else if(motion==='diagonal'){transform.x=w*.019*Math.sin(phase);transform.y=h*.013*Math.sin(phase-.65)}
  else if(motion==='tilt')transform.rotate=.035*Math.sin(phase);
  else if(motion==='pulse')transform.scale=1+.035*(.5+.5*Math.sin(phase*1.25));
  else if(motion==='reveal')transform.reveal=.5-.5*Math.cos(phase);
  else if(motion==='glitch'){transform.x=w*.006*(.65*Math.sin(phase*1.8)+.35*Math.sin(phase*2.7));transform.y=h*.002*Math.sin(phase*2.2)}
  c.save();c.beginPath();c.rect(0,0,w,footerLineY-h*.015);c.clip();
  c.translate(layer.centerX+transform.x,layer.centerY+transform.y);c.rotate(transform.rotate);c.scale(transform.scale,transform.scale);c.translate(-layer.centerX,-layer.centerY);
  if(transform.reveal!==null){c.beginPath();c.rect(layer.textX-pad*.1,0,Math.max(0,layer.maxWidth+pad*.2)*transform.reveal,h);c.clip()}
  c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(layer.canvas,0,0,w,h);c.restore();c.textAlign='left';
  document.getElementById('preview-website-link').hidden=false;
  c.strokeStyle='rgba(245,240,220,.3)';c.beginPath();c.moveTo(pad,footerLineY);c.lineTo(w-pad,footerLineY);c.stroke();c.fillStyle='rgba(245,240,220,.8)';c.font=`600 ${Math.max(9,w*.017)}px "DM Mono", monospace`;c.fillText('WWW.ATARITERROR.COM',pad,footerTextY)
}
function renderAssetGrid(){
  const grid=document.getElementById('asset-grid');
  const query='';
  grid.replaceChildren();let visible=0;
  assets.forEach((asset,index)=>{
    if(query&&!asset.name.toLowerCase().includes(query))return;
    visible++;
    const card=document.createElement('div');card.className='asset-card-wrap';
    const button=document.createElement('button');
    button.className='asset-card'+(index===selected?' selected':'');button.type='button';
    button.setAttribute('aria-label',`Vybrat ${asset.name}`);
    const fallback=document.createElement('span');fallback.className='thumb-fallback';fallback.textContent='AT';button.append(fallback);
    if(asset.type==='video'){
      const image=document.createElement('img');image.className='video-thumbnail';image.alt='';image.hidden=true;button.append(image);
      const source=document.createElement('video');source.muted=true;source.playsInline=true;source.preload='metadata';
      source.addEventListener('loadedmetadata',()=>{try{source.currentTime=Number.isFinite(source.duration)?Math.min(.7,source.duration*.2):.2}catch{}} ,{once:true});
      source.addEventListener('seeked',()=>{try{const thumb=document.createElement('canvas');thumb.width=360;thumb.height=240;const tctx=thumb.getContext('2d');const sw=source.videoWidth,sh=source.videoHeight,scale=Math.max(thumb.width/sw,thumb.height/sh),dw=sw*scale,dh=sh*scale;tctx.drawImage(source,(thumb.width-dw)/2,(thumb.height-dh)/2,dw,dh);image.src=thumb.toDataURL('image/jpeg',.76);image.hidden=false;fallback.hidden=true}catch{fallback.textContent='VIDEO'}},{once:true});
      source.addEventListener('error',()=>{fallback.textContent='VIDEO'},{once:true});
      source.src=asset.src;source.load();
      const play=document.createElement('span');play.className='play-icon';play.textContent='▶';button.append(play);
    }else{
      const image=document.createElement('img');image.src=asset.src;image.alt='';image.loading='lazy';image.addEventListener('load',()=>fallback.hidden=true,{once:true});image.addEventListener('error',()=>{fallback.textContent='FOTO';image.hidden=true},{once:true});button.append(image);
    }
    const name=document.createElement('span');name.className='asset-name';name.textContent=asset.name;name.title=asset.name;button.append(name);
    button.addEventListener('click',()=>{setPreviewPlayback(false);selected=index;if(asset.type==='video')restoreClipSelection(asset);renderAssetGrid();syncFrameScrubbers();if(asset.type==='video'){restartPreviewClip();return}refreshPreview('PŘIPRAVUJI OBRÁZEK',8)});
    const remove=document.createElement('button');remove.className='asset-remove-button';remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`Odebrat ${asset.name} z výběru`);remove.title='Odebrat z výběru';remove.addEventListener('click',event=>{event.stopPropagation();removeAssetFromSelection(index)});
    card.append(button,remove);grid.append(card);
  });
  if(!visible){const empty=document.createElement('div');empty.className='library-empty';const title=document.createElement('strong');title.textContent='Zatím není vybraný žádný obsah.';const hint=document.createElement('span');hint.textContent='Média vybírej z knihovny.';const button=document.createElement('button');button.className='inline-library-link';button.type='button';button.dataset.openLibraryPicker='';button.textContent='NAČÍST OBSAH Z KNIHOVNY MÉDIÍ ↗';empty.append(title,hint,button);grid.append(empty)}else{const button=document.createElement('button');button.className='asset-card asset-library-trigger';button.type='button';button.dataset.openLibraryPicker='';button.innerHTML='<span aria-hidden="true">＋</span><small>NAČÍST Z KNIHOVNY ↗</small>';grid.append(button)}
  updateCounts();
}
function activeCaption(){return document.getElementById('caption').value}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),10000)}

document.getElementById('char-count').textContent=`${document.getElementById('caption').value.length} / 500`;renderAssetGrid();renderFolderList();renderFolderList('picker-folder-list');drawDesign(canvas);loadRemoteLibrary();
const paneResizer=document.getElementById('pane-resizer');
const studioGrid=document.querySelector('.studio-grid');
function alignPreviewWithAssetPicker(){const preview=document.querySelector('.preview-column'),assetGrid=document.getElementById('asset-grid');if(!preview||!assetGrid||!studioGrid)return;if(window.innerWidth<=720){preview.style.marginTop='0px';return}const offset=assetGrid.getBoundingClientRect().top-studioGrid.getBoundingClientRect().top;preview.style.marginTop=`${Math.max(0,Math.round(offset))}px`;updateSplitterPosition()}
let editorShare=44;
let resizingPanes=false;
function updateSplitterPosition(){if(!studioGrid||!paneResizer||window.innerWidth<=720)return;const gridRect=studioGrid.getBoundingClientRect();const editorRect=document.querySelector('.editor-column').getBoundingClientRect();const mediaHeadRect=document.getElementById('editor-media').getBoundingClientRect();paneResizer.style.left=`${gridRect.left+editorRect.width+13}px`;paneResizer.style.top=`${mediaHeadRect.top+mediaHeadRect.height/2}px`;paneResizer.setAttribute('aria-valuenow',String(Math.round(editorShare)))}
function setEditorShare(value){const available=studioGrid.clientWidth-26;const previewMinimum=window.innerWidth<=820?340:420;const lower=Math.max(30,320/available*100);const upper=Math.min(70,100-previewMinimum/available*100);if(lower>upper)editorShare=50;else editorShare=Math.max(lower,Math.min(upper,value));studioGrid.style.setProperty('--editor-fr',`${editorShare}fr`);studioGrid.style.setProperty('--preview-fr',`${100-editorShare}fr`);updateSplitterPosition()}
paneResizer.addEventListener('pointerdown',event=>{if(window.innerWidth<=720)return;resizingPanes=true;paneResizer.setPointerCapture(event.pointerId);event.preventDefault()});
paneResizer.addEventListener('pointermove',event=>{if(!resizingPanes)return;const rect=studioGrid.getBoundingClientRect();const available=rect.width-26;setEditorShare((event.clientX-rect.left-13)/available*100)});
paneResizer.addEventListener('pointerup',()=>{resizingPanes=false});paneResizer.addEventListener('pointercancel',()=>{resizingPanes=false});
paneResizer.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setEditorShare(editorShare+(event.key==='ArrowRight'?3:-3))}});
window.addEventListener('resize',alignPreviewWithAssetPicker);window.addEventListener('scroll',updateSplitterPosition,{passive:true});
// Re-align after fonts, the library picker, or responsive sizing changes the first editor row.
const editorLayoutObserver=new ResizeObserver(()=>requestAnimationFrame(alignPreviewWithAssetPicker));
for(const node of [studioGrid,document.getElementById('editor-media'),document.getElementById('asset-grid')])if(node)editorLayoutObserver.observe(node);
requestAnimationFrame(alignPreviewWithAssetPicker);document.fonts?.ready.then(alignPreviewWithAssetPicker);

document.querySelectorAll('[data-view-target]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.viewTarget)));
document.querySelector('[data-home-link]').addEventListener('click',e=>{e.preventDefault();closeActionModal();closeLibraryPicker();closePreviewModal();showView('studio')});
document.getElementById('library-add-folder').addEventListener('click',()=>{loadRemoteLibrary();showToast('Obnovuji seznam souborů z webové knihovny.')});
document.getElementById('draft-new').addEventListener('click',()=>{showView('studio');document.getElementById('new-draft').click()});
function handleLibraryFileClick(e){const row=e.target.closest('[data-asset-name]');if(!row)return;const name=row.dataset.assetName;const type=row.dataset.assetType;if(!['video','image'].includes(type)){showToast('Do Content Studia lze načíst obrázky a videa.');return}closeLibraryPicker();if(row.dataset.loaded==='true'){const index=Number(row.dataset.assetIndex);if(Number.isInteger(index)&&index>=0){selected=index;if(selectedAsset()?.type==='video')restoreClipSelection(selectedAsset());showView('studio');renderAssetGrid();if(selectedAsset()?.type==='video')restartPreviewClip();else refreshPreview('PŘIPRAVUJI OBRÁZEK',8);showToast(`Otevřen režim tvorby z klipu ${name}.`)}return}const url=row.dataset.assetUrl;if(!url){showToast('Soubor nemá dostupnou webovou adresu.');return}assets.push({name,relativePath:row.dataset.assetPath||`${row.dataset.folder}/${name}`,type,src:url,tag:type==='video'?'VIDEO':'FOTO',source:'github'});selected=assets.length-1;if(type==='video')restoreClipSelection(selectedAsset());showView('studio');renderAssetGrid();renderFolderList();if(type==='video')restartPreviewClip();else refreshPreview('PŘIPRAVUJI OBRÁZEK',8);showToast(`Načteno z webové knihovny: ${name}.`)}
document.getElementById('folder-list').addEventListener('click',handleLibraryFileClick);document.getElementById('picker-folder-list').addEventListener('click',handleLibraryFileClick);
document.getElementById('folder-list').addEventListener('click',event=>{const remove=event.target.closest('[data-delete-file]');if(!remove)return;const folder=remoteLibrary.find(item=>item.name===remove.dataset.folder);const file=folder?.files.find(item=>item.name===remove.dataset.deleteFile&&item.sha===remove.dataset.fileSha);if(file)deleteLibraryFile(folder.name,file)});
document.getElementById('github-connect').addEventListener('click',()=>{if(githubToken){rememberGithubToken('');document.getElementById('github-connect').textContent='PŘIPOJIT GITHUB ↗';showToast('GitHub byl odpojen.')}else openGithubConnect(null)});
document.getElementById('github-connect-close').addEventListener('click',closeGithubConnect);document.getElementById('github-connect-cancel').addEventListener('click',closeGithubConnect);document.getElementById('github-connect-modal').addEventListener('click',event=>{if(event.target.id==='github-connect-modal')closeGithubConnect()});
document.getElementById('github-connect-submit').addEventListener('click',async()=>{const candidate=document.getElementById('github-token-input').value.trim();if(!candidate){showToast('Vlož GitHub token.');return}const submit=document.getElementById('github-connect-submit');submit.disabled=true;submit.textContent='OVĚŘUJI TOKEN…';try{const response=await fetch(`${githubApiRoot}/official-videos`,{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${candidate}`}});if(!response.ok)throw new Error(response.status===401?'GitHub token není platný.':response.status===403?'Token nemá přístup ke čtení tohoto repozitáře.':`GitHub vrátil chybu ${response.status}.`);rememberGithubToken(candidate);document.getElementById('github-connect').textContent='ODPOJIT GITHUB';const action=pendingGithubAction;pendingGithubAction=null;closeGithubConnect();showToast('GitHub připojen. Token zůstává v této kartě i po obnovení stránky.');if(action)await action();else if(legacyDrafts.length)await migrateLegacyDrafts()}catch(error){showToast(error.message)}finally{submit.disabled=false;submit.textContent='PŘIPOJIT A POKRAČOVAT ↗'}});
document.getElementById('asset-grid').addEventListener('click',event=>{if(!event.target.closest('[data-open-library-picker]'))return;event.preventDefault();event.stopPropagation();openLibraryPicker()});
function openLibraryPicker(){const modal=document.getElementById('library-picker-modal');if(!modal)return;renderFolderList('picker-folder-list');modal.hidden=false;modal.setAttribute('aria-hidden','false');document.getElementById('library-picker-close')?.focus();loadRemoteLibrary()}
function closeLibraryPicker(){const modal=document.getElementById('library-picker-modal');if(!modal)return;modal.hidden=true;modal.setAttribute('aria-hidden','true')}
document.getElementById('library-picker-close').addEventListener('click',closeLibraryPicker);document.getElementById('library-picker-modal').addEventListener('click',e=>{if(e.target.id==='library-picker-modal')closeLibraryPicker()});
function syncSafeZoneGuides(){const visible=document.getElementById('safe-zone-toggle').checked;for(const frame of [document.getElementById('device-frame'),document.getElementById('modal-canvas-frame')]){frame.dataset.format=currentFormat;frame.classList.toggle('safe-zones-on',visible)}document.getElementById('safe-zone-toggle').setAttribute('aria-label',currentFormat==='story'||currentFormat==='fb-story'?'Vodítko pro Stories: horní okraj 14 %, spodní okraj 20 %, boční okraje 6 %. Vodítko nemění poměr stran videa.':'Orientační okraj 6 % pro text; vodítko nemění poměr stran výstupu.')}
document.getElementById('safe-zone-toggle').addEventListener('change',syncSafeZoneGuides);
document.querySelectorAll('.format-tab').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.format-tab').forEach(tab=>{const active=tab.dataset.format===button.dataset.format;tab.classList.toggle('selected',active);tab.setAttribute('aria-selected',String(active))});currentFormat=button.dataset.format;syncSafeZoneGuides();document.getElementById('preview-platform').textContent=formatMap[currentFormat].title;document.getElementById('modal-preview-format').textContent=formatMap[currentFormat].title;document.getElementById('device-frame').style.aspectRatio=formatMap[currentFormat].ratio;document.getElementById('device-frame').style.width=currentFormat==='landscape'?'100%':currentFormat==='square'?'240px':currentFormat==='feed'?'190px':'180px';document.getElementById('export-note').textContent=`Video ${formatMap[currentFormat].width} × ${formatMap[currentFormat].height}px · MP4/H.264 nebo kompatibilní WebM`;syncNativePreviewSize();drawDesign(canvas);if(!document.getElementById('preview-modal').hidden){fitModalCanvas();drawDesign(document.getElementById('modal-canvas'))}}));
for(const id of ['preview','modal']){document.getElementById(`${id}-play-toggle`).addEventListener('click',()=>setPreviewPlayback(!previewPlaying));const start=document.getElementById(`${id}-start-frame`),end=document.getElementById(`${id}-end-frame`);for(const input of [start,end]){input.addEventListener('pointerdown',()=>{timelineDragging=true;if(previewPlaying)setPreviewPlayback(false)});input.addEventListener('input',e=>{if(!videoEditorReady)return;const endpoint=e.target===start?'start':'end';if(endpoint==='start')selectedStartFrame=Math.min(Number(e.target.value),selectedEndFrame-5*PREVIEW_FPS);else selectedEndFrame=Math.max(Number(e.target.value),selectedStartFrame+5*PREVIEW_FPS);updateFrameScrubberReadout();seekSelectedEndpoint(endpoint)});input.addEventListener('change',e=>{timelineDragging=false;const endpoint=e.target===start?'start':'end';seekSelectedEndpoint(endpoint,true);saveClipSelection()})}}
window.addEventListener('pointerup',()=>{timelineDragging=false});window.addEventListener('pointercancel',()=>{timelineDragging=false});
for(const id of ['preview','modal'])for(const endpoint of ['start','end'])document.getElementById(`${id}-set-${endpoint}`).addEventListener('click',()=>{if(selectedAsset()?.type!=='video'||!Number.isFinite(video.duration))return;if(previewPlaying)setPreviewPlayback(false);const maximum=Math.floor(video.duration*PREVIEW_FPS),minGap=Math.min(maximum,5*PREVIEW_FPS),currentFrame=Math.max(0,Math.min(maximum-1,Math.floor(video.currentTime*PREVIEW_FPS+1e-6)));let adjusted=false;if(endpoint==='start'){const requiredEnd=currentFrame+minGap;if(requiredEnd>maximum){showToast('V tomto snímku už nelze zachovat minimální délku úseku 5 sekund.');return}selectedStartFrame=currentFrame;if(selectedEndFrame<requiredEnd){selectedEndFrame=requiredEnd;adjusted=true}}else{const exclusiveEnd=currentFrame+1;if(exclusiveEnd<minGap){showToast('Konec je příliš blízko začátku zdroje; minimální délka úseku je 5 sekund.');return}selectedEndFrame=exclusiveEnd;const requiredStart=exclusiveEnd-minGap;if(selectedStartFrame>requiredStart){selectedStartFrame=requiredStart;adjusted=true}}updateFrameScrubberReadout();saveClipSelection();if(adjusted)showToast(endpoint==='end'?'Konec nastaven na pozastavený snímek; začátek se posunul kvůli minimální délce 5 sekund.':'Začátek nastaven na pozastavený snímek; konec se posunul kvůli minimální délce 5 sekund.')});
document.querySelectorAll('[data-video-filter]').forEach(input=>input.addEventListener('change',()=>{if(input.dataset.videoFilter==='noir')document.getElementById('monochrome-strength').disabled=!input.checked;drawDesign(canvas);if(!document.getElementById('preview-modal').hidden)drawDesign(document.getElementById('modal-canvas'))}));
for(const id of ['overlay-color','overlay-opacity'])document.getElementById(id).addEventListener('input',()=>{if(id==='overlay-opacity')document.getElementById('overlay-opacity-value').value=`${document.getElementById(id).value} %`;drawDesign(canvas);if(!document.getElementById('preview-modal').hidden)drawDesign(document.getElementById('modal-canvas'))});
document.getElementById('monochrome-strength').addEventListener('input',()=>{document.getElementById('monochrome-strength-value').value=`${document.getElementById('monochrome-strength').value} %`;document.getElementById('modal-monochrome-strength-value').value=`${document.getElementById('monochrome-strength').value} %`;drawDesign(canvas);if(!document.getElementById('preview-modal').hidden)drawDesign(document.getElementById('modal-canvas'))});
document.querySelectorAll('[data-modal-video-filter]').forEach(input=>input.addEventListener('change',()=>{const source=document.querySelector(`[data-video-filter="${input.dataset.modalVideoFilter}"]`);if(source){source.checked=input.checked;source.dispatchEvent(new Event('change',{bubbles:true}))}if(input.dataset.modalVideoFilter==='noir')document.getElementById('modal-monochrome-strength').disabled=!input.checked;drawDesign(canvas);drawDesign(document.getElementById('modal-canvas'))}));
document.getElementById('track-select').addEventListener('change',()=>{const track=document.getElementById('track-select').value;document.getElementById('track-hint').textContent=track?`Odkaz: Spotify · Atari Terror — ${track}`:'Výběr skladby je nepovinný.';document.getElementById('copy-track').disabled=!track;redrawTextLayout()});
document.getElementById('main-headline').addEventListener('input',redrawTextLayout);
document.getElementById('text-effect').addEventListener('change',()=>{drawDesign(canvas);if(!document.getElementById('preview-modal').hidden)drawDesign(document.getElementById('modal-canvas'));startTextMotionPreview()});
function syncEffectButtons(value,selector,attribute){document.querySelectorAll(selector).forEach(button=>{const selected=button.getAttribute(attribute)===value;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))})}
document.querySelectorAll('[data-effect]').forEach(button=>button.addEventListener('click',()=>{const select=document.getElementById('text-effect');select.value=button.dataset.effect;syncEffectButtons(select.value,'[data-effect]','data-effect');syncEffectButtons(select.value,'[data-modal-effect]','data-modal-effect');select.dispatchEvent(new Event('change',{bubbles:true}))}));
document.querySelectorAll('[data-modal-effect]').forEach(button=>button.addEventListener('click',()=>{const select=document.getElementById('modal-text-effect');select.value=button.dataset.modalEffect;syncEffectButtons(select.value,'[data-effect]','data-effect');syncEffectButtons(select.value,'[data-modal-effect]','data-modal-effect');select.dispatchEvent(new Event('change',{bubbles:true}))}));
for(const id of ['main-headline-color','post-headline-color','caption-color'])document.getElementById(id).addEventListener('input',redrawTextLayout);
document.getElementById('post-headline').addEventListener('input',redrawTextLayout);
document.querySelectorAll('[data-align]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-align]').forEach(item=>{const selected=item.dataset.align===button.dataset.align;item.classList.toggle('selected',selected);item.setAttribute('aria-pressed',String(selected))});redrawTextLayout()}));
document.querySelectorAll('#content-x,#content-y,#main-headline-size,#headline-size,#caption-size,#track-size').forEach(control=>control.addEventListener('input',()=>{const outputId=control.id==='main-headline-size'?'main-headline-size-value':control.id==='headline-size'?'headline-size-value':control.id==='caption-size'?'caption-size-value':control.id==='track-size'?'track-size-value':null;if(outputId)document.getElementById(outputId).value=`${control.value} %`;redrawTextLayout()}));
async function seekVideoForExport(time){if(!Number.isFinite(video.duration)||video.readyState<1)throw new Error('Zdrojové video ještě není připravené.');if(Math.abs(video.currentTime-time)<.001)return;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(new Error('Nepodařilo se nastavit začátek vybraného úseku.'))},8000);const cleanup=()=>{clearTimeout(timer);video.removeEventListener('seeked',finish);video.removeEventListener('error',fail)};const finish=()=>{cleanup();resolve()};const fail=()=>{cleanup();reject(new Error('Video nelze přesunout na vybraný začátek.'))};video.addEventListener('seeked',finish,{once:true});video.addEventListener('error',fail,{once:true});try{video.currentTime=time}catch{cleanup();reject(new Error('Video nelze přesunout na vybraný začátek.'))}})}
async function captureVideoAudioTrack(){let capture=null;const captureMethod=video.captureStream||video.mozCaptureStream;if(captureMethod){try{capture=captureMethod.call(video);const audio=capture.getAudioTracks().find(track=>track.readyState==='live');if(audio)return{track:audio.clone(),capture}}catch{}}
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)return{track:null,capture};
  try{if(!videoAudioContext){videoAudioContext=new AudioContextClass();videoAudioSource=videoAudioContext.createMediaElementSource(video)}videoAudioDestination=videoAudioContext.createMediaStreamDestination();videoAudioSource.connect(videoAudioDestination);if(videoAudioContext.state==='suspended')await videoAudioContext.resume();const audio=videoAudioDestination.stream.getAudioTracks()[0];return{track:audio?.clone()||null,capture}}
  catch{return{track:null,capture}}
}
async function exportVideo(prepareShare=false){
  if(exportInProgress){showToast('Export právě probíhá. Počkej na jeho dokončení.');return}
  if(!canvas.captureStream||!window.MediaRecorder){showToast('Tento prohlížeč nepodporuje export videa z náhledu.');return}
  const asset=selectedAsset(),hasSourceVideo=asset?.type==='video';
  const clipStart=selectedStartSeconds(),clipEnd=selectedEndSeconds();
  const frameCount=hasSourceVideo?selectedEndFrame-selectedStartFrame:PREVIEW_FPS*5;
  const duration=frameCount/PREVIEW_FPS;
  const maxSourceFrame=hasSourceVideo&&Number.isFinite(video.duration)?Math.floor(video.duration*PREVIEW_FPS):selectedEndFrame;
  const prerollFrames=hasSourceVideo?Math.min(EXPORT_GUARD_FRAMES,selectedStartFrame):0;
  const postrollFrames=hasSourceVideo?Math.min(EXPORT_GUARD_FRAMES,Math.max(0,maxSourceFrame-selectedEndFrame)):0;
  const captureStart=Math.max(0,clipStart-prerollFrames/PREVIEW_FPS);
  const captureEnd=Math.min(video.duration||clipEnd,clipEnd+postrollFrames/PREVIEW_FPS);
  const durationLabel=frameLabel(frameCount);
  exportInProgress=true;setPreviewPlayback(false);let currentExportProgress=0;const updateExportProgress=(label,percent)=>{document.getElementById('preview-loading-label').textContent=label;currentExportProgress=Math.max(currentExportProgress,Math.min(100,percent));setPreviewProgress(currentExportProgress)};
  const format=currentFormat,spec=formatMap[format];
  const recorderCanvas=document.createElement('canvas');recorderCanvas.width=spec.width;recorderCanvas.height=spec.height;
  const stream=recorderCanvas.captureStream(PREVIEW_FPS);
  let recorder=null,running=true,exportSucceeded=false,progressToken=0,ffmpegModulePromise=null;
  const stopTracks=()=>stream.getTracks().forEach(track=>track.stop());
  try{
    if(hasSourceVideo){
      if(!asset.src)throw new Error('Zdrojové video nemá dostupnou adresu pro přesný export.');
      video.pause();video.loop=false;video.muted=true;
      exportRecording=true;
      await seekVideoForExport(captureStart);
      progressToken=beginPreviewProgress('PŘIPRAVUJI PŘESNÝ EXPORT',2);
      ffmpegModulePromise=import('./assets/ffmpeg-export.js').then(async module=>{await module.loadFFmpeg(updateExportProgress);return{module}}).catch(error=>({error}));
    }
    const mime=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    if(!mime)throw new Error('Tento prohlížeč nepodporuje záznam náhledu.');
    const extension=mime.startsWith('video/mp4')?'mp4':'webm';
    recorder=new MediaRecorder(stream,{mimeType:mime});
    const chunks=[];
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data)};
    recorder.onerror=()=>{running=false;exportSucceeded=false;showToast('Při vytváření obrazu videa nastala chyba.')};
    recorder.onstop=async()=>{
      running=false;exportRecording=false;video.pause();video.muted=true;video.loop=false;setPreviewPlayback(false);stopTracks();
      if(!exportSucceeded||!chunks.length){exportInProgress=false;startTextMotionPreview();if(progressToken)finishPreviewProgress(progressToken);showToast('Video se nepodařilo vytvořit.');return}
      try{
        let outputBlob=new Blob(chunks,{type:mime}),outputExtension=extension;
        if(hasSourceVideo){
          updateExportProgress('RENDERUJI PŘESNÝ ÚSEK',40);
          const loaded=await ffmpegModulePromise;if(loaded.error)throw loaded.error;const module=loaded.module;
          outputBlob=await module.muxExactClip({visualBlob:outputBlob,sourceUrl:asset.src,sourceName:asset.name,startSeconds:clipStart,endSeconds:clipEnd,frameCount,prerollFrames,onProgress:updateExportProgress});
          outputExtension='mp4';
        }
        const outputName=`atari-terror-${format}-${duration.toFixed(2)}s-${Date.now()}.${outputExtension}`;
        if(prepareShare){preparedShareBlob=outputBlob;preparedShareFilename=outputName;preparedShareFormat=format;document.getElementById('share-ready-format').textContent=`${spec.title} · ${spec.width} × ${spec.height} PX · ${durationLabel} · ${outputExtension.toUpperCase()}`;document.getElementById('share-ready-modal').hidden=false;showToast('Výstup je připravený ke sdílení.')}
        else{downloadBlob(outputBlob,outputName);showToast(hasSourceVideo?`Přesný úsek se zvukem (${durationLabel}) se stahuje jako MP4.`:`Hotové video (${durationLabel}) se stahuje jako ${outputExtension.toUpperCase()}.`)}
      }catch(error){showToast(error.message||'Přesný export selhal. Zkus ho zopakovat.')}
      finally{exportInProgress=false;startTextMotionPreview();if(progressToken)finishPreviewProgress(progressToken)}
    };
    await drawDesign(recorderCanvas,format,0);
    const startedAt=performance.now();
    recorder.start();
    if(hasSourceVideo)await video.play();
    const frame=async now=>{
      if(!running)return;
      const elapsed=(now-startedAt)/1000;
      if(hasSourceVideo?video.currentTime>=captureEnd:elapsed>=duration){running=false;exportSucceeded=true;video.pause();if(recorder.state!=='inactive')recorder.stop();return}
      await drawDesign(recorderCanvas,format,hasSourceVideo?Math.max(0,elapsed-prerollFrames/PREVIEW_FPS):elapsed);
      if(hasSourceVideo&&progressToken){const progress=Math.min(35,Math.round(4+(video.currentTime-clipStart)/Math.max(.04,duration)*31));currentExportProgress=Math.max(currentExportProgress,progress);setPreviewProgress(currentExportProgress)}
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    showToast(prepareShare?'Připravuji výstup pro sociální sítě…':hasSourceVideo?`Vytvářím přesný úsek se zvukem (${durationLabel})…`:`Vytvářím ${durationLabel} video…`);
  }catch(error){running=false;exportRecording=false;video.pause();video.muted=true;video.loop=false;if(recorder&&recorder.state!=='inactive'){exportSucceeded=false;recorder.stop()}else stopTracks();exportInProgress=false;startTextMotionPreview();if(progressToken)finishPreviewProgress(progressToken);showToast(error.message||'Video se nepodařilo vytvořit.')}
}
document.getElementById('save-draft').addEventListener('click',saveDraft);
document.getElementById('modal-save-draft').addEventListener('click',saveDraft);
document.getElementById('modal-share-result').addEventListener('click',()=>exportVideo(true));
document.getElementById('share-result').addEventListener('click',()=>exportVideo(true));
function closeShareReadyModal(){document.getElementById('share-ready-modal').hidden=true}
document.getElementById('share-ready-close').addEventListener('click',closeShareReadyModal);
document.getElementById('share-ready-modal').addEventListener('click',event=>{if(event.target.id==='share-ready-modal')closeShareReadyModal()});
document.getElementById('share-ready-download').addEventListener('click',()=>{if(!preparedShareBlob)return;downloadBlob(preparedShareBlob,preparedShareFilename);closeShareReadyModal();showToast('Hotový výstup se stahuje.')});
document.getElementById('share-ready-send').addEventListener('click',async()=>{if(!preparedShareBlob)return;if(typeof navigator.share!=='function'){downloadBlob(preparedShareBlob,preparedShareFilename);closeShareReadyModal();showToast('Sdílení souboru není v tomto prohlížeči dostupné. Výstup se stáhl.');return}const file=new File([preparedShareBlob],preparedShareFilename,{type:preparedShareBlob.type});if(typeof navigator.canShare==='function'&&!navigator.canShare({files:[file]})){downloadBlob(preparedShareBlob,preparedShareFilename);closeShareReadyModal();showToast('Tento prohlížeč neumí sdílet video přímo. Výstup se stáhl.');return}try{await navigator.share({files:[file],title:'Atari Terror',text:activeCaption()});closeShareReadyModal();showToast('Výstup byl předán ke sdílení.')}catch(error){if(error.name!=='AbortError')showToast('Sdílení se nepodařilo spustit. Výstup zůstává připravený v okně.')}});
document.getElementById('caption').addEventListener('input',e=>{document.getElementById('char-count').textContent=`${e.target.value.length} / 500`;redrawTextLayout()});
document.getElementById('refresh-caption').addEventListener('click',()=>{const track=document.getElementById('track-select').value;const options=[`Některé věci se nedají vysvětlit. Jen pustit nahlas. ⚡\n\nAtari Terror — ${track}\nPoslechni si nás na Spotify ↗`,`Tenhle zvuk si najde cestu ven. Atari Terror — ${track}. Pusť si nás na Spotify. ↗`,`Nahlas. Bez omluv. Atari Terror — ${track} ⚡\n\nNajdeš nás na Spotify ↗`];const area=document.getElementById('caption');const current=area.value;area.value=options[(options.indexOf(current)+1+options.length)%options.length];area.dispatchEvent(new Event('input'))});
document.getElementById('copy-caption').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(activeCaption());showToast('Text příspěvku zkopírován.')}catch{showToast('Kopírování není dostupné — označ text ručně.')}});
document.getElementById('copy-track').addEventListener('click',async()=>{const track=document.getElementById('track-select').value;if(!track)return;try{await navigator.clipboard.writeText(songSearch(track));showToast('Odkaz na hledání skladby na Spotify zkopírován.')}catch{showToast(songSearch(track))}});
document.getElementById('new-draft').addEventListener('click',()=>{currentDraftKey=null;document.getElementById('caption').value='Nový návrh. Doplň vlastní text nebo si nech vytvořit variantu.\n\nAtari Terror ↗';document.getElementById('caption').dispatchEvent(new Event('input'));for(const id of ['main-headline-size','headline-size','caption-size','monochrome-strength']){const control=document.getElementById(id);control.value='100';document.getElementById(`${id}-value`).value='100 %'}redrawTextLayout();showToast('Nový lokální návrh je připraven.')});
document.querySelectorAll('[data-format-launch]').forEach(button=>button.addEventListener('click',()=>openFormatModal(button.dataset.formatLaunch)));
document.querySelectorAll('[data-format-delete]').forEach(button=>button.addEventListener('click',()=>{const card=button.closest('[data-format-card]');const name=card.querySelector('b').textContent;card.remove();showToast(`Formát „${name}“ byl odebrán ze seznamu.`)}));
document.getElementById('action-modal-primary').addEventListener('click',()=>{if(modalAction?.type==='format'){const format=modalAction.format;closeActionModal();showView('studio');document.querySelector(`[data-format="${format}"]`).click()}});
document.getElementById('action-modal-close').addEventListener('click',closeActionModal);document.getElementById('action-modal-secondary').addEventListener('click',closeActionModal);document.getElementById('action-modal').addEventListener('click',e=>{if(e.target.id==='action-modal')closeActionModal()});
function syncPreviewEditor(){const pairs=[['modal-main-headline','main-headline'],['modal-main-headline-size','main-headline-size'],['modal-main-headline-color','main-headline-color'],['modal-post-headline','post-headline'],['modal-headline-size','headline-size'],['modal-post-headline-color','post-headline-color'],['modal-content-x','content-x'],['modal-content-y','content-y'],['modal-caption','caption'],['modal-caption-size','caption-size'],['modal-caption-color','caption-color'],['modal-track-select','track-select'],['modal-text-effect','text-effect'],['modal-overlay-color','overlay-color'],['modal-overlay-opacity','overlay-opacity'],['modal-monochrome-strength','monochrome-strength'],['modal-monochrome-strength','monochrome-strength']];for(const [modalId,sourceId] of pairs){const target=document.getElementById(modalId),source=document.getElementById(sourceId);if(target&&source)target.value=source.value}for(const id of ['main-headline-size','headline-size','caption-size','monochrome-strength']){const output=document.getElementById(`modal-${id}-value`);if(output)output.value=`${document.getElementById(id).value} %`}document.querySelectorAll('[data-modal-video-filter]').forEach(input=>{const source=document.querySelector(`[data-video-filter="${input.dataset.modalVideoFilter}"]`);input.checked=Boolean(source?.checked)});document.getElementById('modal-overlay-opacity-value').value=`${document.getElementById('overlay-opacity').value} %`;document.getElementById('modal-monochrome-strength-value').value=`${document.getElementById('monochrome-strength').value} %`;document.getElementById('modal-monochrome-strength').disabled=!document.querySelector('[data-video-filter="noir"]').checked;document.getElementById('modal-preview-format').textContent=formatMap[currentFormat].title;syncEffectButtons(document.getElementById('modal-text-effect').value,'[data-modal-effect]','data-modal-effect')}
function fitModalCanvas(){const modal=document.getElementById('preview-modal');if(modal.hidden)return;const panel=modal.querySelector('.modal-preview-panel'),frame=document.getElementById('modal-canvas-frame'),top=panel.querySelector('.modal-preview-topline'),tabs=panel.querySelector('.modal-format-tabs'),note=panel.querySelector('.modal-safe-zone-note'),spec=formatMap[currentFormat];const availableHeight=Math.max(80,panel.clientHeight-top.offsetHeight-tabs.offsetHeight-note.offsetHeight-72),availableWidth=Math.max(80,panel.clientWidth-4),width=Math.max(1,Math.floor(Math.min(availableWidth,availableHeight*spec.width/spec.height)));frame.style.width=`${width}px`;frame.style.height=`${Math.floor(width*spec.height/spec.width)}px`}
for(const [modalId,sourceId] of [['modal-main-headline','main-headline'],['modal-main-headline-size','main-headline-size'],['modal-main-headline-color','main-headline-color'],['modal-post-headline','post-headline'],['modal-headline-size','headline-size'],['modal-post-headline-color','post-headline-color'],['modal-content-x','content-x'],['modal-content-y','content-y'],['modal-caption','caption'],['modal-caption-size','caption-size'],['modal-caption-color','caption-color'],['modal-track-select','track-select'],['modal-text-effect','text-effect'],['modal-overlay-color','overlay-color'],['modal-overlay-opacity','overlay-opacity'],['modal-monochrome-strength','monochrome-strength'],['modal-monochrome-strength','monochrome-strength']]){const modalInput=document.getElementById(modalId),source=document.getElementById(sourceId);modalInput.addEventListener(['modal-track-select','modal-text-effect'].includes(modalId)?'change':'input',()=>{source.value=modalInput.value;source.dispatchEvent(new Event(['modal-track-select','modal-text-effect'].includes(modalId)?'change':'input',{bubbles:true}));if(modalId==='modal-overlay-opacity')document.getElementById('modal-overlay-opacity-value').value=`${modalInput.value} %`;if(modalId==='modal-monochrome-strength'){document.getElementById('modal-monochrome-strength-value').value=`${modalInput.value} %`;document.getElementById('monochrome-strength-value').value=`${modalInput.value} %`}if(modalId==='modal-main-headline-size'||modalId==='modal-headline-size'||modalId==='modal-caption-size'){const output=document.getElementById(`modal-${modalId.replace(/^modal-/,'')}-value`);if(output)output.value=`${modalInput.value} %`}})}
function openPreviewModal(){const modal=document.getElementById('preview-modal');syncPreviewEditor();modal.hidden=false;document.body.classList.add('preview-detail-open');syncFrameScrubbers();requestAnimationFrame(fitModalCanvas);drawDesign(document.getElementById('modal-canvas'))}
window.addEventListener('resize',fitModalCanvas);
function closePreviewModal(){document.getElementById('preview-modal').hidden=true;document.body.classList.remove('preview-detail-open');if(modalFrameRequest)cancelAnimationFrame(modalFrameRequest);modalFrameRequest=0}
function syncNativePreviewSize(){const preview=document.querySelector('.preview-column'),frame=document.getElementById('device-frame'),toggle=document.getElementById('native-size-toggle'),active=preview.classList.contains('native-size-preview'),spec=formatMap[currentFormat];if(active){frame.style.width=`${spec.width}px`;frame.style.height=`${spec.height}px`;frame.style.aspectRatio='auto'}else{frame.style.height='';frame.style.aspectRatio=spec.ratio;frame.style.width=currentFormat==='landscape'?'100%':currentFormat==='square'?'240px':currentFormat==='feed'?'190px':'180px'}toggle.setAttribute('aria-pressed',String(active));toggle.title=active?'Vrátit běžný náhled':'Zobrazit výstup v měřítku 1:1';toggle.setAttribute('aria-label',toggle.title)}
document.getElementById('native-size-toggle').addEventListener('click',()=>{document.querySelector('.preview-column').classList.toggle('native-size-preview');syncNativePreviewSize();if(document.querySelector('.preview-column').classList.contains('native-size-preview'))document.querySelector('.preview-column').scrollTop=0;drawDesign(canvas)});
document.getElementById('fullscreen').addEventListener('click',openPreviewModal);document.getElementById('device-frame').addEventListener('click',e=>{if(e.target.closest('.canvas-website-link'))return;openPreviewModal()});document.getElementById('preview-canvas').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPreviewModal()}});document.getElementById('close-modal').addEventListener('click',closePreviewModal);document.getElementById('preview-modal').addEventListener('click',e=>{if(e.target.id==='preview-modal')closePreviewModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.querySelector('.preview-column').classList.remove('native-size-preview');syncNativePreviewSize();closePreviewModal();closeActionModal();closeLibraryPicker()}});
renderDrafts();
syncSafeZoneGuides();
syncFrameScrubbers();
