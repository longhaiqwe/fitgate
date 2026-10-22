import {app,BrowserWindow,nativeImage} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
app.commandLine.appendSwitch('force-device-scale-factor','2');
const out=path.resolve('artifacts/clarity-review');fs.mkdirSync(out,{recursive:true});
const oldPoster='data:image/png;base64,'+fs.readFileSync(path.join(out,'previous/panda-poster.png')).toString('base64');
app.whenReady().then(async()=>{
 const w=new BrowserWindow({width:1024,height:576,useContentSize:true,frame:false,show:false,transparent:true,webPreferences:{backgroundThrottling:false}});
 try{
  await w.loadURL('http://127.0.0.1:5188/dev/reminder-preview.html');
  const result=await w.webContents.executeJavaScript(`(async()=>{
   const {createPandaBreathing}=await import('/src/content/panda-breathing.js');
   const source=new Image();source.src='/assets/panda-poster.png';await source.decode();
   const previous=new Image();previous.src=${JSON.stringify(oldPoster)};await previous.decode();
   window.__scene.destroy();const motion=createPandaBreathing(source,{width:1024,height:576});
   if(!motion)throw new Error('WebGL unavailable');document.body.replaceChildren(motion.canvas);
   Object.assign(motion.canvas.style,{visibility:'visible',width:'1024px',height:'576px',maxWidth:'none',left:'0',bottom:'0',transform:'none'});
   motion.renderAt(0);
   const W=motion.canvas.width,H=motion.canvas.height;
   function raster(im){const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(im,0,0,W,H);return {c,ctx,p:ctx.getImageData(0,0,W,H).data};}
   const original=raster(source),current=raster(motion.canvas),old=raster(previous);
   const rois=[{name:'面部毛发',x:1410,y:260,width:220,height:220},{name:'胸腹毛发',x:1210,y:720,width:220,height:140}];
   function measurement(roi){
    const x0=Math.round(roi.x*W/2048),y0=Math.round(roi.y*H/1152),rw=Math.round(roi.width*W/2048),rh=Math.round(roi.height*H/1152);
    function gray(a,i){return a[i]*0.2126+a[i+1]*0.7152+a[i+2]*0.0722;}
    let n=0,oldError=0,currentError=0,sourceGradient=0,currentGradient=0,oldGradient=0;
    for(let y=y0;y<y0+rh-1;y++)for(let x=x0;x<x0+rw-1;x++){
      const i=(y*W+x)*4,j=i+4,k=i+W*4;if(original.p[i+3]<250||original.p[j+3]<250||original.p[k+3]<250)continue;n++;
      for(let c=0;c<3;c++){oldError+=Math.abs(original.p[i+c]-old.p[i+c]);currentError+=Math.abs(original.p[i+c]-current.p[i+c]);}
      for(const [a,key] of [[original.p,0],[current.p,1],[old.p,2]]){const d=(Math.abs(gray(a,i)-gray(a,j))+Math.abs(gray(a,i)-gray(a,k)))/2;if(key===0)sourceGradient+=d;if(key===1)currentGradient+=d;if(key===2)oldGradient+=d;}
    }
    return {...roi,opaqueSamples:n,currentMeanAbsoluteError:currentError/(n*3),oldMeanAbsoluteError:oldError/(n*3),sourceGradient:sourceGradient/n,currentGradient:currentGradient/n,oldGradient:oldGradient/n,retainedGradient:currentGradient/sourceGradient,oldRetainedGradient:oldGradient/sourceGradient};
   }
   // Crops have identical physical scale; only their labels and margins differ.
   const c=document.createElement('canvas');c.width=3*480;c.height=2*530;
   const ctx=c.getContext('2d');ctx.fillStyle='#eeeae3';ctx.fillRect(0,0,c.width,c.height);ctx.font='24px sans-serif';ctx.fillStyle='#18211d';
   const panels=[{r:old,label:'修改前：1024 海报放大'},{r:current,label:'修改后：Retina 呼吸画布'},{r:original,label:'原图制作的高清海报'}];
   for(let row=0;row<rois.length;row++)for(let col=0;col<3;col++){
    const roi=rois[row],p=panels[col],x=col*480,y=row*530;
    ctx.fillStyle='#18211d';ctx.fillText(p.label,x+14,y+35);ctx.fillText(roi.name+' / 2 倍局部放大',x+14,y+70);
    ctx.imageSmoothingEnabled=false;ctx.drawImage(p.r.c,roi.x*W/2048,roi.y*H/1152,roi.width*W/2048,roi.height*H/1152,x+14,y+90,roi.width*2,roi.height*2);
   }
   motion.destroy();
   return {width:W,height:H,dpr:devicePixelRatio,sourceWidth:source.naturalWidth,sourceHeight:source.naturalHeight,previousWidth:previous.naturalWidth,previousHeight:previous.naturalHeight,regions:rois.map(measurement),comparison:c.toDataURL('image/png'),note:'Source detail preservation is tested only for the resting source pose. These metrics do not establish the quality of the generated walking video or the naturalness of motion.'};
  })()`);
  const {comparison,...metrics}=result;
  assert.equal(metrics.dpr,2);assert.equal(metrics.width,2048);assert.equal(metrics.height,1152);
  for(const region of metrics.regions){assert.ok(region.opaqueSamples>1000);assert.ok(region.currentMeanAbsoluteError<1);assert.ok(region.retainedGradient>0.95);assert.ok(region.currentMeanAbsoluteError<region.oldMeanAbsoluteError,'original detail is better preserved');}
  fs.writeFileSync(path.join(out,'fur-detail-comparison.png'),nativeImage.createFromDataURL(comparison).toPNG());
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,...metrics},null,2));console.log(metrics);w.destroy();app.quit();
 }catch(error){console.error(error);app.exit(1);}
});
