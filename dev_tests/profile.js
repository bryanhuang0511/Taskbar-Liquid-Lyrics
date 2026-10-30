const fs=require('fs');let simT=0;global.performance={now:()=>simT*1000};
const ctxStub=new Proxy({}, {get:(t,k)=>(k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{}),set:()=>true});
global.document={getElementById:()=>({getContext:()=>ctxStub,clientWidth:640,clientHeight:44,width:0,height:0})};
global.window={devicePixelRatio:1,addEventListener(){}};
eval(fs.readFileSync(process.argv[2],'utf8')+'\nglobal.WaveEngine=WaveEngine;');
const rows=JSON.parse(fs.readFileSync(process.argv[3],'utf8'))[process.argv[4]];
const eng=new WaveEngine('x');eng.setGain(2.2);let ai=0;const dt=1/144;const H=44,c=eng.halfSize-1;
const t0=+process.argv[5], t1=+process.argv[6], every=+process.argv[7]||0.04; let nextP=t0;
for(;simT<t1;simT+=dt){while(ai<rows.length&&rows[ai][0]<=simT){const r=rows[ai++];eng.updateAudio(r[1],r[2],true,r[3],r[4]);}
 eng.render(dt);
 if(simT>=nextP){nextP+=every;let line='';for(let i=c;i<eng.totalPoints;i++){const hh=(H-eng.ys[i])/H;line+=' ▁▂▃▄▅▆▇█'[Math.min(8,Math.round(hh*8/0.92))];}
  console.log(simT.toFixed(3)+'s |'+line+'|  pulses='+eng.pOn.reduce((a,b)=>a+b,0));}}
