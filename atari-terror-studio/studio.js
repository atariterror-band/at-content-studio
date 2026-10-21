const assets = [];
const knownOfficialFiles = [
  'ATARI TERROR - SOBRIETY (Official tutorial).mp4',
  'ATARI TERROR - Motofoko.mp4',
  'ATARI TERROR - OH MY GOD! (HD).mp4',
  'ATARI TERROR .mp4',
  'ATARI TERROR - Stuck To The Tit (Official).mp4'
];
const libraryDirectories = ['design','official-photos','official-videos','photos','texts','videos'];
const websiteLibraryRoot = new URL('../', window.location.href);
let remoteLibrary = libraryDirectories.map(name=>({name,path:`GitHub / ${name}`,files:name==='official-videos'?knownOfficialFiles.map(file=>({name:file,url:new URL(`${name}/${encodeURIComponent(file)}`,websiteLibraryRoot).href,type:'video'})):[]}));
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
video.preload='auto';video.muted=true;video.playsInline=true;
const previewLoading=document.getElementById('preview-loading');
let previewProgressSequence=0,activePreviewProgress=0,previewProgressTimer,previewProgressStartedAt=0;
let currentFormat = 'story';
let selected = 0;
let selectedVideoSegment = 0;
const PREVIEW_FPS=25;
let selectedStartFrame=0;
let previewPlaying=false;
let modalFrameRequest=0;
let toastTimer;
let modalAction = null;
const draftData = {
  bright:{title:'Světlo proráží kouř',track:'Bright Sun',format:'story',status:'KE KONTROLE',thumb:'thumb-one',caption:'Světlo proráží kouř. ⚡\n\nAtari Terror — Bright Sun\nPoslechni si nás na Spotify ↗'},
  mother:{title:'Hlas, který tě zná',track:'Mother',format:'feed',status:'KE KONTROLE',thumb:'thumb-two',caption:'Hlas, který tě zná. ⚡\n\nAtari Terror — Mother\nPoslechni si nás na Spotify ↗'},
  eve:{title:'Ráj s cenovkou',track:'Eve',format:'story',status:'SCHVÁLENO',thumb:'thumb-three',caption:'Některé věci se nedají vysvětlit. ⚡\n\nAtari Terror — Eve\nPoslechni si nás na Spotify ↗'}
};

function showToast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400)}
function beginPreviewProgress(label,percent=0){clearTimeout(previewProgressTimer);const token=++previewProgressSequence;activePreviewProgress=token;previewProgressStartedAt=performance.now();previewLoading.hidden=false;document.getElementById('preview-loading-label').textContent=label;setPreviewProgress(percent);return token}
function setPreviewProgress(percent){const value=Math.max(0,Math.min(100,Math.round(percent)));document.getElementById('preview-loading-percent').textContent=`${value} %`;document.getElementById('preview-progress-bar').style.width=`${value}%`}
function finishPreviewProgress(token){if(!token||token!==activePreviewProgress)return;setPreviewProgress(100);const visibleFor=performance.now()-previewProgressStartedAt;previewProgressTimer=setTimeout(()=>{if(token===activePreviewProgress)previewLoading.hidden=true},Math.max(420,650-visibleFor))}
function selectedAsset(){return assets[selected]||assets[0]}
function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src})}
function updateCounts(){const n=String(remoteLibrary.reduce((sum,folder)=>sum+folder.files.length,0)).padStart(2,'0');document.getElementById('asset-count').textContent=n}
function showView(name){document.querySelectorAll('[data-view]').forEach(view=>{const active=view.dataset.view===name;view.hidden=!active;view.classList.toggle('is-active',active)});document.querySelectorAll('[data-view-target]').forEach(button=>button.classList.toggle('active',button.dataset.viewTarget===name));window.scrollTo({top:0,behavior:'smooth'})}
function closeActionModal(){document.getElementById('action-modal').hidden=true;modalAction=null}
function openActionModal({eyebrow,title,description,meta,artClass,artLabel,buttonLabel,action}){modalAction=action;document.getElementById('action-modal-eyebrow').textContent=eyebrow;document.getElementById('action-modal-title').textContent=title;document.getElementById('action-modal-description').textContent=description;document.getElementById('action-modal-meta').textContent=meta;const art=document.getElementById('action-modal-art');art.className=`action-modal-art ${artClass||''}`;art.querySelector('span').textContent=artLabel||'AT';document.getElementById('action-modal-primary').textContent=buttonLabel;document.getElementById('action-modal').hidden=false;document.getElementById('action-modal-primary').focus()}
function openDraftModal(key){const d=draftData[key];if(!d)return;openActionModal({eyebrow:`ROZPRACOVANÝ NÁVRH / ${d.status}`,title:d.title,description:'Otevři tento konkrétní koncept a pokračuj v úpravě textu, skladby i výstupního formátu.',meta:`SKLADBA  ·  ${d.track.toUpperCase()}     /     FORMÁT  ·  ${d.format.toUpperCase()}`,artClass:d.thumb,artLabel:d.track.toUpperCase(),buttonLabel:'POKRAČOVAT V ÚPRAVÁCH',action:{type:'draft',key}})}
function openFormatModal(format){const f=formatMap[format];if(!f)return;openActionModal({eyebrow:'PŘIPRAVENÝ FORMÁT / EXPORT',title:f.title,description:'Tento formát se otevře v editoru s připraveným poměrem stran. Vyber nebo načti médium a pokračuj v tvorbě.',meta:`POMĚR  ·  ${f.ratio.replaceAll(' ','')}     /     ${f.width} × ${f.height} PX`,artClass:`format-art ${format}`,artLabel:f.ratio.replaceAll(' ','').replace('/',':'),buttonLabel:'VYBRAT TENTO FORMÁT',action:{type:'format',format}})}
function loadDraft(key){const d=draftData[key];if(!d)return;showView('studio');document.getElementById('post-headline').value=d.title;document.getElementById('post-headline').dispatchEvent(new Event('input'));document.getElementById('track-select').value=d.track;document.getElementById('track-select').dispatchEvent(new Event('change'));document.getElementById('caption').value=d.caption;document.getElementById('caption').dispatchEvent(new Event('input'));document.querySelector(`[data-format="${d.format}"]`).click();closeActionModal();showToast('Konkrétní návrh načten do editoru.')}
async function loadRemoteLibrary(){
  const status=document.getElementById('library-source-status');
  remoteLibrary=libraryDirectories.map(name=>({name,path:`GitHub / ${name}`,files:name==='official-videos'?knownOfficialFiles.map(file=>({name:file,url:new URL(`${name}/${encodeURIComponent(file)}`,websiteLibraryRoot).href,type:'video'})):[]}));
  renderFolderList();renderFolderList('picker-folder-list');
  if(status){const count=remoteLibrary.reduce((sum,folder)=>sum+folder.files.length,0);status.textContent=`Načteno z webové knihovny · ${count} souborů v ${remoteLibrary.length} složkách.`}
  updateCounts();
}
function renderFolderList(targetId='folder-list'){
  const container=document.getElementById(targetId);if(!container)return;container.replaceChildren();
  remoteLibrary.forEach(folder=>{const card=document.createElement('section');card.className='folder-card';const head=document.createElement('div');head.className='folder-card-head';const icon=document.createElement('span');icon.className='folder-icon';icon.textContent='▰';const label=document.createElement('div');const title=document.createElement('strong');title.textContent=folder.name;const path=document.createElement('small');path.textContent=folder.path;label.append(title,path);const count=document.createElement('span');count.className='folder-count';count.textContent=`${String(folder.files.length).padStart(2,'0')} SOUBORŮ`;head.append(icon,label,count);card.append(head);const list=document.createElement('div');list.className='folder-files';folder.files.forEach(file=>{const assetIndex=assets.findIndex(asset=>asset.src===file.url);const row=document.createElement('button');row.type='button';row.className='folder-file'+(assetIndex>=0?' loaded':'');row.textContent=file.name;row.title='Načíst tento soubor do editoru';row.dataset.assetName=file.name;row.dataset.assetUrl=file.url;row.dataset.assetType=file.type;row.dataset.folder=folder.name;row.dataset.assetIndex=String(assetIndex);row.dataset.loaded=String(assetIndex>=0);list.append(row)});if(!folder.files.length){const empty=document.createElement('p');empty.className='folder-empty';empty.textContent='Zatím bez souborů';list.append(empty)}card.append(list);container.append(card)});
}
function activeMediaFilter(){const choices={cinematic:'contrast(1.1) saturate(1.12) sepia(.08)',contrast:'contrast(1.35) saturate(1.05)',noir:'grayscale(1) contrast(1.28)',film:'sepia(.2) contrast(1.08) saturate(.82)'};return Array.from(document.querySelectorAll('[data-video-filter]:checked')).map(input=>choices[input.dataset.videoFilter]).filter(Boolean).join(' ')||'none'}
function getVideoDuration(){if(document.querySelector('[data-duration="more"].selected'))return Math.max(25,Math.min(120,Number(document.getElementById('custom-duration').value)||25));return Number(document.querySelector('[data-duration].selected')?.dataset.duration||5)}
function videoSegmentBounds(index=selectedVideoSegment){const duration=Number.isFinite(video.duration)?video.duration:0;const start=Math.max(0,index*20);return{start,end:Math.min(duration,start+20)}}
function effectiveVideoDuration(){const segment=videoSegmentBounds();return Math.max(0,Math.min(getVideoDuration(),segment.end-segment.start))}
function selectedStartSeconds(){return selectedStartFrame/PREVIEW_FPS}
function frameLabel(frame){const whole=Math.floor(frame/PREVIEW_FPS);const minutes=Math.floor(whole/60),seconds=whole%60,subframe=frame%PREVIEW_FPS;return`${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}:${String(subframe).padStart(2,'0')}`}
function syncFrameScrubbers(){const asset=selectedAsset();const enabled=asset?.type==='video'&&Number.isFinite(video.duration)&&video.duration>0;const segment=videoSegmentBounds();const minimum=Math.ceil(segment.start*PREVIEW_FPS);const maximum=Math.max(minimum,Math.floor((segment.end-effectiveVideoDuration())*PREVIEW_FPS));selectedStartFrame=Math.max(minimum,Math.min(maximum,selectedStartFrame));for(const id of ['preview','modal']){const slider=document.getElementById(`${id}-start-frame`);const label=document.getElementById(`${id}-start-frame-label`);const controls=document.getElementById(`${id}-video-controls`);const play=document.getElementById(`${id}-play-toggle`);if(!slider)continue;controls.hidden=!enabled;slider.disabled=!enabled;slider.min=String(minimum);slider.max=String(maximum);slider.value=String(selectedStartFrame);label.value=frameLabel(selectedStartFrame);label.textContent=frameLabel(selectedStartFrame);play.disabled=!enabled;play.textContent=previewPlaying?'Ⅱ POZASTAVIT':'▶ PŘEHRÁT VÝSLEDEK'}}
function seekSelectedStart(){const start=selectedStartSeconds();if(video.readyState>=1){try{video.currentTime=start}catch{}}syncFrameScrubbers();drawDesign(canvas);if(!document.getElementById('preview-modal').hidden)drawDesign(document.getElementById('modal-canvas'))}
function setPreviewPlayback(playing){previewPlaying=playing;syncFrameScrubbers();if(!playing){video.pause();if(modalFrameRequest)cancelAnimationFrame(modalFrameRequest);modalFrameRequest=0;return}const asset=selectedAsset();if(asset?.type!=='video')return;const play=()=>{if(!previewPlaying)return;const start=selectedStartSeconds();try{if(video.currentTime<start||video.currentTime>=Math.min(start+effectiveVideoDuration(),videoSegmentBounds().end))video.currentTime=start}catch{}video.play().catch(()=>setPreviewPlayback(false));animateModalPreview()};if(video.readyState>=2)play();else video.addEventListener('loadeddata',play,{once:true})}
function animateModalPreview(){if(!previewPlaying)return;drawDesign(canvas);if(!document.getElementById('preview-modal').hidden)drawDesign(document.getElementById('modal-canvas'));modalFrameRequest=requestAnimationFrame(animateModalPreview)}
function formatVideoTime(seconds){const total=Math.max(0,Math.floor(seconds));return`${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`}
function renderVideoSegments(){const control=document.getElementById('video-segment-control');const options=document.getElementById('video-segment-options');const hint=document.getElementById('video-segment-hint');if(!control||!options||!hint)return;const asset=selectedAsset();if(asset?.type!=='video'){control.hidden=true;syncFrameScrubbers();return}control.hidden=false;options.replaceChildren();if(video.src!==new URL(asset.src,document.baseURI).href||!Number.isFinite(video.duration)||video.duration<=0){hint.textContent='Načítám délku videa…';syncFrameScrubbers();return}const count=Math.ceil(video.duration/20);selectedVideoSegment=Math.min(selectedVideoSegment,count-1);for(let index=0;index<count;index++){const segment=videoSegmentBounds(index);const button=document.createElement('button');button.type='button';button.className='video-segment-option'+(index===selectedVideoSegment?' selected':'');button.setAttribute('aria-pressed',String(index===selectedVideoSegment));button.textContent=`${formatVideoTime(segment.start)}–${formatVideoTime(segment.end)}`;button.addEventListener('click',()=>{setPreviewPlayback(false);selectedVideoSegment=index;selectedStartFrame=Math.round(videoSegmentBounds().start*PREVIEW_FPS);renderVideoSegments();restartPreviewClip()});options.append(button)}const chosen=videoSegmentBounds();hint.textContent=`Upravuje se úsek ${formatVideoTime(chosen.start)}–${formatVideoTime(chosen.end)}. Náhled i export zůstanou v něm.`;syncFrameScrubbers()}
function loadVideoSource(src,reportProgress=false){
  const changed=video.src!==src;const needsLoad=changed||video.readyState<2;const token=reportProgress&&needsLoad?beginPreviewProgress('NAČÍTÁM VIDEO',4):0;
  if(changed){video.pause();video.src=src;video.load()}
  if(video.readyState>=2){if(token)finishPreviewProgress(token);return Promise.resolve()}
  return new Promise(resolve=>{let settled=false;const update=()=>{if(!token)return;let percent=8;if(Number.isFinite(video.duration)&&video.duration>0&&video.buffered.length){const end=video.buffered.end(video.buffered.length-1);percent=Math.max(percent,Math.floor(Math.min(1,end/video.duration)*92))}else if(video.readyState>=1)percent=32;setPreviewProgress(percent)};const finish=()=>{if(settled)return;settled=true;video.removeEventListener('loadeddata',finish);video.removeEventListener('error',finish);video.removeEventListener('progress',update);video.removeEventListener('loadedmetadata',update);clearTimeout(timeout);if(token)finishPreviewProgress(token);resolve()};const timeout=setTimeout(finish,20000);video.addEventListener('loadeddata',finish,{once:true});video.addEventListener('error',finish,{once:true});video.addEventListener('progress',update);video.addEventListener('loadedmetadata',update);if(video.readyState>=2)finish()});
}
function refreshPreview(label='AKTUALIZUJI NÁHLED',percent=12){const token=beginPreviewProgress(label,percent);drawDesign(canvas).then(()=>finishPreviewProgress(token)).catch(()=>finishPreviewProgress(token))}
function restartPreviewClip(){const asset=selectedAsset();if(asset?.type!=='video'){syncFrameScrubbers();return}setPreviewPlayback(false);renderVideoSegments();video.pause();const sourceUrl=new URL(asset.src,document.baseURI).href;const seekToSegment=()=>{if(video.src!==sourceUrl)return;selectedStartFrame=Math.round(videoSegmentBounds().start*PREVIEW_FPS);try{video.currentTime=selectedStartSeconds()}catch{}syncFrameScrubbers()};if(video.src===sourceUrl&&video.readyState>=1)seekToSegment();else video.addEventListener('loadedmetadata',seekToSegment,{once:true});refreshPreview('PŘIPRAVUJI VIDEO',8)}
video.loop=false;
video.addEventListener('loadedmetadata',()=>{renderVideoSegments();syncFrameScrubbers()});
video.addEventListener('timeupdate',()=>{if(selectedAsset()?.type!=='video'||!Number.isFinite(video.duration))return;const clipStart=selectedStartSeconds();const clipEnd=Math.min(clipStart+effectiveVideoDuration(),videoSegmentBounds().end);if(video.currentTime<clipStart||video.currentTime>=clipEnd){video.pause();try{video.currentTime=clipStart}catch{}if(previewPlaying)video.play().catch(()=>setPreviewPlayback(false))}});
function drawCover(target,source,w,h){const sw=source.videoWidth||source.naturalWidth||source.width;const sh=source.videoHeight||source.naturalHeight||source.height;if(!sw||!sh)return;const scale=Math.max(w/sw,h/sh);const dw=sw*scale,dh=sh*scale;target.drawImage(source,(w-dw)/2,(h-dh)/2,dw,dh)}
async function drawDesign(target, format=currentFormat, time=0){const spec=formatMap[format];target.width=spec.width;target.height=spec.height;const c=target.getContext('2d');const w=spec.width,h=spec.height;const asset=selectedAsset();const liveVideo=target===canvas&&asset?.type==='video';
  if(target===canvas)document.getElementById('device-frame').classList.toggle('video-active',liveVideo);
  if(liveVideo){video.style.filter=activeMediaFilter();await loadVideoSource(asset.src,true)}else{c.fillStyle='#181713';c.fillRect(0,0,w,h)}
  if(asset){try{c.save();c.filter=activeMediaFilter();if(asset.type==='video'){if(!liveVideo)await loadVideoSource(asset.src);if(video.readyState>=2&&video.videoWidth){const scale=Math.max(w/video.videoWidth,h/video.videoHeight);const dw=video.videoWidth*scale,dh=video.videoHeight*scale;const wobble=1+Math.sin(time*.8)*.018;c.save();c.translate(w/2,h/2);c.scale(wobble,wobble);c.drawImage(video,-dw/2,-dh/2,dw,dh);c.restore()}}else{let image=asset.image;if(!image){const token=target===canvas?beginPreviewProgress('PŘIPRAVUJI OBRÁZEK',24):0;image=asset.image=await loadImage(asset.src);if(token)finishPreviewProgress(token)}drawCover(c,image,w,h)}c.restore()}catch(error){c.restore();if(target===canvas){const token=beginPreviewProgress('MÉDIUM SE NEPODAŘILO NAČÍST',100);previewProgressTimer=setTimeout(()=>{if(token===activePreviewProgress)previewLoading.hidden=true},1800)}}}
  const shade=c.createLinearGradient(0,0,0,h);shade.addColorStop(0,'rgba(0,0,0,.12)');shade.addColorStop(.38,'rgba(0,0,0,.08)');shade.addColorStop(.7,'rgba(0,0,0,.55)');shade.addColorStop(1,'rgba(0,0,0,.95)');c.fillStyle=shade;c.fillRect(0,0,w,h);
  const tint=c.createLinearGradient(0,0,w,h);tint.addColorStop(0,'rgba(242,210,27,.13)');tint.addColorStop(.55,'rgba(20,18,14,0)');tint.addColorStop(1,'rgba(208,54,43,.2)');c.fillStyle=tint;c.fillRect(0,0,w,h);
  const pad=w*.075;const isWide=w/h>1.5;
  c.strokeStyle='rgba(242,210,27,.6)';c.lineWidth=Math.max(1,w*.002);c.strokeRect(pad*.56,pad*.56,w-pad*1.12,h-pad*1.12);
  const align=document.querySelector('[data-align].selected')?.dataset.align||'left';
  const xPercent=Number(document.getElementById('content-x').value||8), yPercent=Number(document.getElementById('content-y').value||66);
  const xProgress=(xPercent-8)/84, anchorY=h*yPercent/100, centeredWidth=w*.84;
  const textX=align==='left'?pad+xProgress*(w-pad*2):align==='right'?w-pad-xProgress*(w-pad*2):pad+centeredWidth/2+xProgress*(w-pad*2-centeredWidth);
  const maxWidth=align==='left'?w-textX-pad:align==='right'?textX-pad:centeredWidth;
  const headline=(document.getElementById('post-headline').value||'').trim().toUpperCase();
  const caption=(document.getElementById('caption').value||'').trim();
  let cursorY=anchorY;
  c.textAlign=align;c.textBaseline='alphabetic';
  if(headline){
    const titleScale=Number(document.getElementById('headline-size').value||100)/100;const titleSize=Math.max(16,w*(isWide?.058:.085)*titleScale);c.fillStyle='#f4f0e5';c.font=`800 ${titleSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    const lines=[];for(const paragraph of headline.split(/\n/)){let line='';for(const word of paragraph.split(/\s+/)){const test=line?`${line} ${word}`:word;if(c.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test}if(line)lines.push(line)}
    const lineHeight=titleSize*.86;lines.forEach(text=>{c.fillText(text,textX,cursorY,maxWidth);cursorY+=lineHeight});
  }
  if(caption){
    cursorY+=headline?Math.max(12,w*.03):0;c.fillStyle='rgba(245,240,220,.95)';const captionScale=Number(document.getElementById('caption-size').value||100)/100;const fontSize=Math.max(10,w*.034*captionScale);c.font=`500 ${fontSize}px "DM Sans", Arial, sans-serif`;
    const lineHeight=fontSize*1.42;const paragraphs=caption.split(/\n/);for(const paragraph of paragraphs){if(!paragraph){cursorY+=lineHeight*.65;continue}let line='';for(const word of paragraph.split(/\s+/)){const test=line?`${line} ${word}`:word;if(c.measureText(test).width>maxWidth&&line){c.fillText(line,textX,cursorY,maxWidth);cursorY+=lineHeight;line=word}else line=test}if(line){c.fillText(line,textX,cursorY,maxWidth);cursorY+=lineHeight}}
  }
  const selectedTrack=document.getElementById('track-select').value;
  const trackScale=Number(document.getElementById('track-size').value||100)/100;
  if(selectedTrack){cursorY+=Math.max(8,w*.018);const trackFontSize=Math.max(10,w*.02*trackScale);c.fillStyle='#f2d21b';c.font=`500 ${trackFontSize}px "DM Mono", monospace`;c.fillText(`ATARI TERROR — ${selectedTrack.toUpperCase()}`,textX,cursorY,maxWidth);cursorY+=Math.max(16,trackFontSize*1.45)}
  if(selectedTrack){c.fillStyle='#f2d21b';c.font=`500 ${Math.max(9,w*.018*trackScale)}px "DM Mono", monospace`;c.fillText('POSLOUCHEJ NA SPOTIFY  ↗',textX,cursorY,maxWidth)}
  c.textAlign='left';
  document.getElementById('preview-website-link').hidden=false;document.getElementById('created-website-link').hidden=false;
  c.strokeStyle='rgba(245,240,220,.3)';c.beginPath();c.moveTo(pad,h*.91);c.lineTo(w-pad,h*.91);c.stroke();c.fillStyle='rgba(245,240,220,.8)';c.font=`600 ${Math.max(9,w*.017)}px "DM Mono", monospace`;c.fillText('WWW.ATARITERROR.COM',pad,h*.93)
}
function renderAssetGrid(){
  const grid=document.getElementById('asset-grid');
  const query='';
  grid.replaceChildren();let visible=0;
  assets.forEach((asset,index)=>{
    if(query&&!asset.name.toLowerCase().includes(query))return;
    visible++;
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
    button.addEventListener('click',()=>{if(selected!==index)selectedVideoSegment=0;selected=index;renderAssetGrid();renderVideoSegments();if(asset.type==='video'){restartPreviewClip();return}refreshPreview('PŘIPRAVUJI OBRÁZEK',8)});grid.append(button);
  });
  if(!visible){const empty=document.createElement('div');empty.className='library-empty';empty.textContent='Zatím není vybraný žádný obsah.';grid.append(empty)}
  updateCounts();
}
function activeCaption(){return document.getElementById('caption').value}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),10000)}

document.getElementById('char-count').textContent=`${document.getElementById('caption').value.length} / 500`;renderAssetGrid();renderFolderList();renderFolderList('picker-folder-list');drawDesign(canvas);loadRemoteLibrary();
const paneResizer=document.getElementById('pane-resizer');
const studioGrid=document.querySelector('.studio-grid');
let editorShare=44;
let resizingPanes=false;
function updateSplitterPosition(){if(!studioGrid||!paneResizer||window.innerWidth<=720)return;const gridRect=studioGrid.getBoundingClientRect();const editorRect=document.querySelector('.editor-column').getBoundingClientRect();const mediaHeadRect=document.getElementById('editor-media').getBoundingClientRect();paneResizer.style.left=`${gridRect.left+editorRect.width+13}px`;paneResizer.style.top=`${mediaHeadRect.top+mediaHeadRect.height/2}px`;paneResizer.setAttribute('aria-valuenow',String(Math.round(editorShare)))}
function setEditorShare(value){const available=studioGrid.clientWidth-26;const previewMinimum=window.innerWidth<=820?340:420;const lower=Math.max(30,320/available*100);const upper=Math.min(70,100-previewMinimum/available*100);if(lower>upper)editorShare=50;else editorShare=Math.max(lower,Math.min(upper,value));studioGrid.style.setProperty('--editor-fr',`${editorShare}fr`);studioGrid.style.setProperty('--preview-fr',`${100-editorShare}fr`);updateSplitterPosition()}
paneResizer.addEventListener('pointerdown',event=>{if(window.innerWidth<=720)return;resizingPanes=true;paneResizer.setPointerCapture(event.pointerId);event.preventDefault()});
paneResizer.addEventListener('pointermove',event=>{if(!resizingPanes)return;const rect=studioGrid.getBoundingClientRect();const available=rect.width-26;setEditorShare((event.clientX-rect.left-13)/available*100)});
paneResizer.addEventListener('pointerup',()=>{resizingPanes=false});paneResizer.addEventListener('pointercancel',()=>{resizingPanes=false});
paneResizer.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setEditorShare(editorShare+(event.key==='ArrowRight'?3:-3))}});
window.addEventListener('resize',updateSplitterPosition);window.addEventListener('scroll',updateSplitterPosition,{passive:true});
requestAnimationFrame(updateSplitterPosition);

document.querySelectorAll('[data-view-target]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.viewTarget)));
document.querySelector('[data-home-link]').addEventListener('click',e=>{e.preventDefault();closeActionModal();closeLibraryPicker();document.getElementById('preview-modal').hidden=true;closeCreatedModal();showView('studio')});
document.getElementById('library-add-folder').addEventListener('click',()=>{loadRemoteLibrary();showToast('Obnovuji seznam souborů z webové knihovny.')});
document.getElementById('draft-new').addEventListener('click',()=>{showView('studio');document.getElementById('new-draft').click()});
function handleLibraryFileClick(e){const row=e.target.closest('[data-asset-name]');if(!row)return;const name=row.dataset.assetName;closeLibraryPicker();if(row.dataset.loaded==='true'){const index=Number(row.dataset.assetIndex);if(Number.isInteger(index)&&index>=0){selectedVideoSegment=0;selected=index;showView('studio');renderAssetGrid();if(selectedAsset()?.type==='video')restartPreviewClip();else refreshPreview('PŘIPRAVUJI OBRÁZEK',8);showToast(`Otevřen režim tvorby z klipu ${name}.`)}return}const url=row.dataset.assetUrl;if(!url){showToast('Soubor nemá dostupnou webovou adresu.');return}const type=row.dataset.assetType||'video';assets.push({name,relativePath:`${row.dataset.folder}/${name}`,type,src:url,tag:type==='video'?'VIDEO':'FOTO',source:'github'});selectedVideoSegment=0;selected=assets.length-1;showView('studio');renderAssetGrid();renderFolderList();if(type==='video')restartPreviewClip();else refreshPreview('PŘIPRAVUJI OBRÁZEK',8);showToast(`Načteno z webové knihovny: ${name}.`)}
document.getElementById('folder-list').addEventListener('click',handleLibraryFileClick);document.getElementById('picker-folder-list').addEventListener('click',handleLibraryFileClick);
document.querySelectorAll('[data-open-library-picker]').forEach(button=>button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openLibraryPicker()}));
function openLibraryPicker(){const modal=document.getElementById('library-picker-modal');if(!modal)return;renderFolderList('picker-folder-list');modal.hidden=false;modal.setAttribute('aria-hidden','false');document.getElementById('library-picker-close')?.focus();loadRemoteLibrary()}
function closeLibraryPicker(){const modal=document.getElementById('library-picker-modal');if(!modal)return;modal.hidden=true;modal.setAttribute('aria-hidden','true')}
document.getElementById('library-picker-close').addEventListener('click',closeLibraryPicker);document.getElementById('library-picker-modal').addEventListener('click',e=>{if(e.target.id==='library-picker-modal')closeLibraryPicker()});
document.querySelectorAll('.format-tab').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.format-tab').forEach(tab=>{tab.classList.toggle('selected',tab===button);tab.setAttribute('aria-selected',String(tab===button))});currentFormat=button.dataset.format;document.getElementById('preview-platform').textContent=formatMap[currentFormat].title;document.getElementById('device-frame').style.aspectRatio=formatMap[currentFormat].ratio;document.getElementById('device-frame').style.width=currentFormat==='landscape'?'100%':currentFormat==='square'?'240px':currentFormat==='feed'?'190px':'180px';document.getElementById('export-note').textContent=`PNG ${formatMap[currentFormat].width} × ${formatMap[currentFormat].height}px · video se stáhne jako WebM`;drawDesign(canvas)}));
document.querySelectorAll('[data-duration]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-duration]').forEach(item=>{item.classList.toggle('selected',item===button);item.setAttribute('aria-pressed',String(item===button))});document.getElementById('custom-duration-wrap').hidden=button.dataset.duration!=='more';restartPreviewClip()}));
document.getElementById('custom-duration').addEventListener('change',e=>{e.target.value=Math.max(25,Math.min(120,Number(e.target.value)||25));restartPreviewClip()});
for(const id of ['preview','modal']){document.getElementById(`${id}-play-toggle`).addEventListener('click',()=>setPreviewPlayback(!previewPlaying));document.getElementById(`${id}-start-frame`).addEventListener('input',e=>{selectedStartFrame=Number(e.target.value);setPreviewPlayback(false);seekSelectedStart()})}
document.querySelectorAll('[data-video-filter]').forEach(input=>input.addEventListener('change',()=>drawDesign(canvas)));
function closeCreatedModal(){document.getElementById('created-modal').hidden=true;document.body.classList.remove('created-detail-open')}
document.getElementById('created-close').addEventListener('click',closeCreatedModal);document.getElementById('created-edit').addEventListener('click',()=>{closeCreatedModal();document.getElementById('post-headline').focus()});document.getElementById('created-modal').addEventListener('click',e=>{if(e.target.id==='created-modal')closeCreatedModal()});
document.getElementById('created-download').addEventListener('click',()=>{const out=document.getElementById('created-canvas');out.toBlob(blob=>blob&&downloadBlob(blob,`atari-terror-${currentFormat}-${Date.now()}.png`),'image/png');showToast('Vytvořený příspěvek se stahuje.')});
document.getElementById('track-select').addEventListener('change',()=>{const track=document.getElementById('track-select').value;document.getElementById('track-hint').textContent=track?`Odkaz: Spotify · Atari Terror — ${track}`:'Výběr skladby je nepovinný.';document.getElementById('copy-track').disabled=!track;drawDesign(canvas)});
document.getElementById('post-headline').addEventListener('input',()=>drawDesign(canvas));
document.querySelectorAll('[data-align]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-align]').forEach(item=>{item.classList.toggle('selected',item===button);item.setAttribute('aria-pressed',String(item===button))});drawDesign(canvas)}));
document.querySelectorAll('#content-x,#content-y,#headline-size,#caption-size,#track-size').forEach(control=>control.addEventListener('input',()=>{const outputId=control.id==='headline-size'?'headline-size-value':control.id==='caption-size'?'caption-size-value':control.id==='track-size'?'track-size-value':null;if(outputId)document.getElementById(outputId).value=`${control.value} %`;drawDesign(canvas)}));
document.getElementById('create-content').addEventListener('click',async()=>{await drawDesign(document.getElementById('created-canvas'));document.getElementById('created-modal').hidden=false;document.body.classList.add('created-detail-open');document.getElementById('created-close').focus()});
document.getElementById('download-image').addEventListener('click',async()=>{const out=document.createElement('canvas');await drawDesign(out);out.toBlob(blob=>blob&&downloadBlob(blob,`atari-terror-${currentFormat}-${Date.now()}.png`),'image/png');showToast('Obrázek se stahuje.')});
document.getElementById('download-video').addEventListener('click',async()=>{if(!canvas.captureStream||!window.MediaRecorder){showToast('Tento prohlížeč nepodporuje záznam videa z náhledu.');return}const duration=selectedAsset()?.type==='video'?Math.max(1,effectiveVideoDuration()):getVideoDuration();const recorderCanvas=document.createElement('canvas');const spec=formatMap[currentFormat];recorderCanvas.width=spec.width;recorderCanvas.height=spec.height;const stream=recorderCanvas.captureStream(30);const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));if(!mime){showToast('Prohlížeč nepodporuje export WebM videa.');return}const recorder=new MediaRecorder(stream,{mimeType:mime});const chunks=[];recorder.ondataavailable=e=>e.data.size&&chunks.push(e.data);recorder.onstop=()=>{video.pause();setPreviewPlayback(false);downloadBlob(new Blob(chunks,{type:mime}),`atari-terror-${currentFormat}-${duration}s-${Date.now()}.webm`);showToast(`Hotové ${duration}sekundové video se stahuje jako WebM.`)};if(selectedAsset()?.type==='video'){video.loop=false;try{video.currentTime=selectedStartSeconds()}catch{}video.play().catch(()=>{})}recorder.start();const start=performance.now();let running=true;const frame=async now=>{if(!running)return;const t=(now-start)/1000;await drawDesign(recorderCanvas,currentFormat,t);if(t>=duration){running=false;recorder.stop();stream.getTracks().forEach(track=>track.stop());return}requestAnimationFrame(frame)};requestAnimationFrame(frame);showToast(`Vytvářím ${duration}sekundové video…`)});
document.getElementById('caption').addEventListener('input',e=>{document.getElementById('char-count').textContent=`${e.target.value.length} / 500`;drawDesign(canvas)});
document.getElementById('refresh-caption').addEventListener('click',()=>{const track=document.getElementById('track-select').value;const options=[`Některé věci se nedají vysvětlit. Jen pustit nahlas. ⚡\n\nAtari Terror — ${track}\nPoslechni si nás na Spotify ↗`,`Tenhle zvuk si najde cestu ven. Atari Terror — ${track}. Pusť si nás na Spotify. ↗`,`Nahlas. Bez omluv. Atari Terror — ${track} ⚡\n\nNajdeš nás na Spotify ↗`];const area=document.getElementById('caption');const current=area.value;area.value=options[(options.indexOf(current)+1+options.length)%options.length];area.dispatchEvent(new Event('input'))});
document.getElementById('copy-caption').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(activeCaption());showToast('Text příspěvku zkopírován.')}catch{showToast('Kopírování není dostupné — označ text ručně.')}});
document.getElementById('copy-track').addEventListener('click',async()=>{const track=document.getElementById('track-select').value;if(!track)return;try{await navigator.clipboard.writeText(songSearch(track));showToast('Odkaz na hledání skladby na Spotify zkopírován.')}catch{showToast(songSearch(track))}});
document.getElementById('new-draft').addEventListener('click',()=>{document.getElementById('caption').value='Nový návrh. Doplň vlastní text nebo si nech vytvořit variantu.\n\nAtari Terror ↗';document.getElementById('caption').dispatchEvent(new Event('input'));showToast('Nový lokální návrh je připraven.')});
document.querySelectorAll('[data-draft-open]').forEach(button=>button.addEventListener('click',()=>loadDraft(button.dataset.draftOpen)));
document.querySelectorAll('[data-draft-delete]').forEach(button=>button.addEventListener('click',()=>{const card=button.closest('[data-draft-card]');const name=card.querySelector('.draft-copy b').textContent;card.remove();delete draftData[button.dataset.draftDelete];document.getElementById('draft-count').textContent=String(document.querySelectorAll('[data-draft-card]').length).padStart(2,'0');showToast(`Návrh „${name}“ byl smazán.`)}));
document.querySelectorAll('[data-format-launch]').forEach(button=>button.addEventListener('click',()=>openFormatModal(button.dataset.formatLaunch)));
document.querySelectorAll('[data-format-delete]').forEach(button=>button.addEventListener('click',()=>{const card=button.closest('[data-format-card]');const name=card.querySelector('b').textContent;card.remove();showToast(`Formát „${name}“ byl odebrán ze seznamu.`)}));
document.getElementById('action-modal-primary').addEventListener('click',()=>{if(!modalAction)return;if(modalAction.type==='draft')loadDraft(modalAction.key);else if(modalAction.type==='format'){const format=modalAction.format;closeActionModal();showView('studio');document.querySelector(`[data-format="${format}"]`).click()}});
document.getElementById('action-modal-close').addEventListener('click',closeActionModal);document.getElementById('action-modal-secondary').addEventListener('click',closeActionModal);document.getElementById('action-modal').addEventListener('click',e=>{if(e.target.id==='action-modal')closeActionModal()});
function openPreviewModal(){const modal=document.getElementById('preview-modal');modal.hidden=false;document.body.classList.add('preview-detail-open');syncFrameScrubbers();drawDesign(document.getElementById('modal-canvas'))}
function closePreviewModal(){document.getElementById('preview-modal').hidden=true;document.body.classList.remove('preview-detail-open');if(modalFrameRequest)cancelAnimationFrame(modalFrameRequest);modalFrameRequest=0}
document.getElementById('fullscreen').addEventListener('click',openPreviewModal);document.getElementById('device-frame').addEventListener('click',e=>{if(e.target.closest('.canvas-website-link'))return;openPreviewModal()});document.getElementById('preview-canvas').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPreviewModal()}});document.getElementById('close-modal').addEventListener('click',closePreviewModal);document.getElementById('preview-modal').addEventListener('click',e=>{if(e.target.id==='preview-modal')closePreviewModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePreviewModal();closeActionModal();closeLibraryPicker();closeCreatedModal()}});
syncFrameScrubbers();
