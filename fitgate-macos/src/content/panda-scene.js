import { createPandaBreathing } from './panda-breathing.js';
import sceneCss from './panda-scene.css?inline';
export { sceneCss };

// Play a continuous authored clip. Reference sequences start with an empty
// canvas and end on a registered copy of the user-approved reference image.
export function createPandaScene(assetUrl) {
  const root=document.createElement('div');root.className='pd-scene';root.setAttribute('aria-hidden','true');
  root.innerHTML='<img class="pd-media pd-poster" alt="" draggable="false"><video class="pd-media pd-video" muted playsinline preload="auto"></video>';
  const poster=root.querySelector('img'),video=root.querySelector('video');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let running=false,destroyed=false,generation=0,frameId,config,showingVideo=false,breathing;
  const ready=fetch(assetUrl('assets/panda-media.json')).then(r=>{if(!r.ok)throw new Error('Panda media unavailable');return r.json();}).then(async media=>{
    config=media;poster.src=assetUrl(media.poster);await poster.decode();
    if(destroyed)return false;
    video.src=assetUrl(media.video);video.muted=true;
    root.style.setProperty('--panda-ratio',`${media.width}/${media.height}`);
    root.dataset.layout=media.layout||'subject';root.dataset.end=media.endBehavior||'hold-last-frame';
    if(media.restMotion?.type==='breathing'){
      breathing=createPandaBreathing(poster,{width:media.width,height:media.height,period:media.restMotion.period},()=>{root.dataset.breathing='false';});
      if(breathing){root.append(breathing.canvas);breathing.resize();root.dataset.breathing='true';}
    }
    root.dataset.ready='true';root.dataset.mode=media.layout==='viewport'&&!reduced.matches?'loading':'photo';return true;
  }).catch(error=>{root.dataset.error='assets';console.warn('Panda scene:',error);return false;});
  function cancelFrame(){if(frameId!==undefined)video.cancelVideoFrameCallback?.(frameId);frameId=undefined;}
  async function play(run){
    try{
      await video.play();
      if(run!==generation||!running)return;
      const reveal=()=>{frameId=undefined;if(run!==generation||!running||reduced.matches||document.hidden)return;showingVideo=true;root.dataset.mode='video';};
      cancelFrame();if(video.requestVideoFrameCallback)frameId=video.requestVideoFrameCallback(reveal);else reveal();
    }catch{if(run===generation)failed();}
  }
  function sync(){
    if(!running)return;
    if(reduced.matches){video.pause();breathing?.pause();cancelFrame();root.dataset.mode='photo';return;}
    if(document.hidden){video.pause();breathing?.pause();cancelFrame();return;}
    if(video.ended){rest();return;}
    void play(generation);
  }
  function rest(){
    root.dataset.mode=showingVideo?'rest':'photo';
    if(showingVideo&&!document.hidden&&root.dataset.breathing==='true')breathing?.start();
  }
  function ended(){showingVideo=true;if(running)sync();}
  function failed(){video.pause();breathing?.pause();cancelFrame();root.dataset.mode='photo';root.dataset.fallback='true';}
  async function start(){
    stop();if(destroyed)return;running=true;const run=++generation;
    if(!await ready||run!==generation||!running)return;
    showingVideo=false;breathing?.reset();root.dataset.mode=config.layout==='viewport'&&!reduced.matches?'loading':'photo';delete root.dataset.fallback;video.currentTime=0;
    document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
    video.addEventListener('ended',ended);video.addEventListener('error',failed);sync();
  }
  function stop(){
    running=false;generation++;cancelFrame();video.pause();breathing?.pause();
    document.removeEventListener('visibilitychange',sync);reduced.removeEventListener('change',sync);
    video.removeEventListener('ended',ended);video.removeEventListener('error',failed);
  }
  function destroy(){destroyed=true;stop();breathing?.destroy();breathing?.canvas.remove();video.removeAttribute('src');video.load();}
  return {element:root,start,stop,destroy,ready};
}
