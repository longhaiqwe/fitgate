import {app,BrowserWindow,nativeImage} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Pin the display density so this regression cannot silently pass at 1x.
app.commandLine.appendSwitch('force-device-scale-factor','2');
const out=path.resolve('artifacts/breathing-review');
fs.mkdirSync(path.join(out,'frames'),{recursive:true});
app.whenReady().then(async()=>{
 const w=new BrowserWindow({width:1024,height:576,useContentSize:true,show:false,frame:false,transparent:true,backgroundColor:'#00000000',webPreferences:{backgroundThrottling:false}});
 try {
  await w.loadURL('http://127.0.0.1:5188/dev/reminder-preview.html');
  const dimensions=await w.webContents.executeJavaScript(`(async()=>{
    const {createPandaBreathing}=await import('/src/content/panda-breathing.js');
    const im=new Image();im.src='/assets/panda-poster.png';await im.decode();
    window.reviewMotion=createPandaBreathing(im,{width:1024,height:576,period:4.8});
    if(!reviewMotion)throw new Error('WebGL unavailable in review');
    window.__scene.destroy();document.body.replaceChildren(reviewMotion.canvas);
    Object.assign(reviewMotion.canvas.style,{position:'fixed',visibility:'visible',width:'1024px',height:'576px',maxWidth:'none',left:'0',bottom:'0',transform:'none'});
    reviewMotion.resize();
    window.reviewFrame=t=>{reviewMotion.renderAt(t);return reviewMotion.canvas.toDataURL('image/png')};
    const c=document.createElement('canvas');c.width=reviewMotion.canvas.width;c.height=reviewMotion.canvas.height;
    c.getContext('2d').drawImage(im,0,0,c.width,c.height);window.reviewReference=c.toDataURL('image/png');
    const r=reviewMotion.canvas.getBoundingClientRect();
    return {width:c.width,height:c.height,cssWidth:r.width,cssHeight:r.height,dpr:devicePixelRatio,sourceWidth:im.naturalWidth,sourceHeight:im.naturalHeight};
  })()`);
  assert.equal(dimensions.dpr,2,'exercise Retina display density');
  assert.equal(dimensions.width,Math.round(dimensions.cssWidth*dimensions.dpr));
  assert.equal(dimensions.height,Math.round(dimensions.cssHeight*dimensions.dpr));
  assert.ok(dimensions.sourceWidth>=2048&&dimensions.sourceHeight>=1152,'source contains original high resolution pixels');
  async function frame(t){return nativeImage.createFromDataURL(await w.webContents.executeJavaScript(`reviewFrame(${t})`));}
  const zero=await frame(0),max=await frame(2.4),end=await frame(4.8);
  assert.deepEqual(zero.getSize(),{width:dimensions.width,height:dimensions.height});
  assert.deepEqual(zero.toBitmap(),end.toBitmap(),'loop returns exactly to its starting pose');
  const base=zero.toBitmap(),peak=max.toBitmap();let motion=0,ground=0,changed=0;
  const {width,height}=dimensions,groundY=Math.ceil(height*475/576);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;
    for(let c=0;c<4;c++){const d=Math.abs(base[i+c]-peak[i+c]);motion+=d;if(y>=groundY)ground+=d;if(d>2)changed++;}
  }
  assert.ok(motion/(width*height)>0.1&&changed>width*height*0.01,'chest deformation produces measurable pixel motion');
  assert.equal(ground,0,'grounded paws remain pixel-identical');
  assert.equal(base[3],0,'transparent background');
  const reference=nativeImage.createFromDataURL(await w.webContents.executeJavaScript('reviewReference')).toBitmap();
  let identityError=0;for(let i=0;i<base.length;i++)identityError+=Math.abs(base[i]-reference[i]);identityError/=base.length;
  assert.ok(identityError<1,'breathing begins on the same registered source image');
  fs.writeFileSync(path.join(out,'exhale.png'),zero.toPNG());fs.writeFileSync(path.join(out,'inhale.png'),max.toPNG());
  fs.writeFileSync(path.join(out,'cycle-end.png'),end.toPNG());
  for(let i=0;i<144;i++)fs.writeFileSync(path.join(out,'frames',`${String(i).padStart(4,'0')}.png`),(await frame(i/30)).toPNG());
  const contextLost=await w.webContents.executeJavaScript(`new Promise(resolve=>{reviewMotion.canvas.addEventListener('webglcontextlost',()=>resolve(true),{once:true});reviewMotion.canvas.getContext('webgl').getExtension('WEBGL_lose_context').loseContext()})`);
  assert.ok(contextLost);
  const result={passed:true,...dimensions,period:4.8,fps:30,exportedFrames:144,cycleSeamIdentical:true,groundedPawsIdentical:true,initialReferenceMeanError:identityError,changedChannels:changed,contextLossDelivered:true,visualReviewRequired:'Pixel tests establish motion, registration, density and lifecycle; they do not establish natural breathing.'};
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2));console.log(result);
  w.destroy();app.quit();
 }catch(e){console.error(e);app.exit(1);}
});
