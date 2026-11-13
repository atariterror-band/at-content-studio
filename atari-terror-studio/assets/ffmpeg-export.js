import { FFmpeg } from './ffmpeg/classes.js';

const CORE_VERSION = '0.12.9';
const CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core`;
let ffmpegInstance;
let ffmpegLoadPromise;
let coreObjectUrls = [];

async function loadAsBlobUrl(url, mimeType, onProgress, progressStart, progressSpan) {
  const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
  if (!response.ok) throw new Error(`Nepodařilo se načíst část exportního jádra (${response.status}).`);
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body?.getReader();
  let parts = [];
  let loaded = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      loaded += value.byteLength;
      if (total) onProgress('NAČÍTÁM EXPORTNÍ JÁDRO', Math.min(98, progressStart + (loaded / total) * progressSpan));
    }
  } else {
    const buffer = await response.arrayBuffer();
    parts = [new Uint8Array(buffer)];
    loaded = buffer.byteLength;
  }
  if (!loaded) throw new Error('Exportní jádro se stáhlo prázdné.');
  return URL.createObjectURL(new Blob(parts, { type: mimeType }));
}

export async function loadFFmpeg(onProgress = () => {}) {
  if (ffmpegInstance?.loaded) return ffmpegInstance;
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const ffmpeg = new FFmpeg();
      onProgress('NAČÍTÁM EXPORTNÍ JÁDRO', 3);
      const coreURL = await loadAsBlobUrl(`${CORE_BASE}.js`, 'text/javascript', onProgress, 5, 4);
      coreObjectUrls.push(coreURL);
      const wasmURL = await loadAsBlobUrl(`${CORE_BASE}.wasm`, 'application/wasm', onProgress, 10, 23);
      coreObjectUrls.push(wasmURL);
      onProgress('SPUŠTÍM EXPORTNÍ JÁDRO', 34);
      await ffmpeg.load({ coreURL, wasmURL });
      ffmpegInstance = ffmpeg;
      onProgress('EXPORTNÍ JÁDRO JE PŘIPRAVENÉ', 38);
      return ffmpeg;
    })().catch(error => {
      ffmpegLoadPromise = null;
      for (const url of coreObjectUrls) URL.revokeObjectURL(url);
      coreObjectUrls = [];
      throw error;
    });
  }
  return ffmpegLoadPromise;
}

async function readRemoteVideo(url, onProgress) {
  const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
  if (!response.ok) throw new Error(`Zdrojové video se nepodařilo načíst (${response.status}).`);
  const length = Number(response.headers.get('content-length')) || 0;
  if (length > 200 * 1024 * 1024) throw new Error('Video má přes 200 MB. Prohlížečový export by mohl vyčerpat paměť; zkus kratší nebo menší soubor.');
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(await response.arrayBuffer());
  const chunks = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    if (loaded > 200 * 1024 * 1024) throw new Error('Video má přes 200 MB. Prohlížečový export by mohl vyčerpat paměť; zkus kratší nebo menší soubor.');
    if (length) onProgress(40 + Math.min(1, loaded / length) * 17);
  }
  const result = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

function safeExtension(name) {
  const extension = String(name || '').split('.').pop().toLowerCase();
  return ['mp4', 'mov', 'm4v', 'webm', 'mkv'].includes(extension) ? extension : 'mp4';
}

export async function muxExactClip({ visualBlob, sourceUrl, sourceName, startSeconds, endSeconds, frameCount, prerollFrames = 0, onProgress = () => {} }) {
  const ffmpeg = await loadFFmpeg((label, percent) => onProgress(label, percent));
  const sourceExtension = safeExtension(sourceName);
  const sourcePath = `source.${sourceExtension}`;
  const visualPath = visualBlob.type.includes('mp4') ? 'visual.mp4' : 'visual.webm';
  const outputPath = 'atari-terror-final.mp4';
  const audioInfoPath = 'atari-terror-audio-info.txt';
  const progressHandler = ({ progress }) => onProgress('SPOJUJI OBRAZ A ZVUK', 58 + Math.round(Math.max(0, Math.min(1, progress || 0)) * 39));
  ffmpeg.on('progress', progressHandler);
  try {
    onProgress('NAČÍTÁM ZDROJOVÉ VIDEO', 40);
    const sourceBytes = await readRemoteVideo(sourceUrl, percent => onProgress('NAČÍTÁM ZDROJOVÉ VIDEO', percent));
    await ffmpeg.writeFile(sourcePath, sourceBytes);
    await ffmpeg.writeFile(visualPath, new Uint8Array(await visualBlob.arrayBuffer()));
    onProgress('KONTROLUJI ZVUKOVOU STOPU', 58);
    await ffmpeg.ffprobe(['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'default=noprint_wrappers=1:nokey=1', sourcePath, '-o', audioInfoPath]);
    const audioBytes = await ffmpeg.readFile(audioInfoPath);
    const hasAudio = audioBytes instanceof Uint8Array ? new TextDecoder().decode(audioBytes).trim().includes('audio') : String(audioBytes).trim().includes('audio');
    const fps = 25;
    const duration = (endSeconds - startSeconds).toFixed(3);
    // The browser recorder starts a little before the user's selected in-point.
    // Discard that guard band and keep exactly the selected number of frames.
    const videoFilter = `[0:v:0]fps=${fps},tpad=stop_mode=clone:stop_duration=1,trim=start_frame=${prerollFrames}:end_frame=${prerollFrames + frameCount},setpts=N/(${fps}*TB)[v]`;
    const args = ['-i', visualPath, '-i', sourcePath, '-filter_complex', hasAudio ? `${videoFilter};[1:a:0]atrim=start=${startSeconds.toFixed(3)}:end=${endSeconds.toFixed(3)},asetpts=PTS-STARTPTS[a]` : videoFilter, '-map', '[v]'];
    if (hasAudio) args.push('-map', '[a]');
    args.push('-frames:v', String(frameCount), '-t', duration, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '21', '-pix_fmt', 'yuv420p');
    if (hasAudio) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
    args.push('-movflags', '+faststart', outputPath);
    onProgress('RENDERUJI PŘESNÝ ÚSEK', 60);
    const result = await ffmpeg.exec(args);
    if (result !== 0) throw new Error('FFmpeg nedokázal sestavit zvolený úsek. Zkus export zopakovat nebo vybrat menší zdrojové video.');
    const output = await ffmpeg.readFile(outputPath);
    if (!(output instanceof Uint8Array) || !output.length) throw new Error('Export nevytvořil výsledný videosoubor.');
    onProgress('HOTOVO', 100);
    return new Blob([output], { type: 'video/mp4' });
  } finally {
    ffmpeg.off('progress', progressHandler);
    for (const path of [sourcePath, visualPath, outputPath, audioInfoPath]) {
      try { await ffmpeg.deleteFile(path); } catch {}
    }
  }
}

export async function encodePhotoAnimation({ visualBlob, durationSeconds, onProgress = () => {} }) {
  const ffmpeg = await loadFFmpeg((label, percent) => onProgress(label, percent));
  const inputPath = visualBlob.type.includes('mp4') ? 'photo-animation-input.mp4' : 'photo-animation-input.webm';
  const outputPath = 'photo-animation-output.mp4';
  const fps = 25;
  const frameCount = Math.max(1, Math.round(durationSeconds * fps));
  const duration = (frameCount / fps).toFixed(3);
  const progressHandler = ({ progress }) => onProgress('PŘIPRAVUJI VIDEO MP4', 45 + Math.round(Math.max(0, Math.min(1, progress || 0)) * 50));
  ffmpeg.on('progress', progressHandler);
  try {
    onProgress('PŘIPRAVUJI MP4', 40);
    await ffmpeg.writeFile(inputPath, new Uint8Array(await visualBlob.arrayBuffer()));
    const result = await ffmpeg.exec([
      '-i', inputPath,
      '-vf', `fps=${fps},tpad=stop_mode=clone:stop_duration=${duration},format=yuv420p`,
      '-an',
      '-frames:v', String(frameCount),
      '-t', duration,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '21',
      '-movflags', '+faststart', outputPath,
    ]);
    if (result !== 0) throw new Error('FFmpeg nedokázal vytvořit video MP4.');
    const output = await ffmpeg.readFile(outputPath);
    if (!(output instanceof Uint8Array) || !output.length) throw new Error('Export nevytvořil výsledné MP4.');
    onProgress('VIDEO JE PŘIPRAVENÉ', 100);
    return new Blob([output], { type: 'video/mp4' });
  } finally {
    ffmpeg.off('progress', progressHandler);
    for (const path of [inputPath, outputPath]) {
      try { await ffmpeg.deleteFile(path); } catch {}
    }
  }
}
