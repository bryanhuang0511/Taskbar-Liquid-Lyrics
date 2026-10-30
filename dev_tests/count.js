const fs=require('fs');let simT=0;global.performance={now:()=>simT*1000};
const ctxStub=new Proxy({}, {get:(t,k)=>(k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{}),set:()=>true});
global.document={getElementById:()=>({getContext:()=>ctxStub,clientWidth:640,clientHeight:44,width:0,height:0})};
global.window={devicePixelRatio:1,addEventListener(){}};
eval(fs.readFileSync(process.argv[2],'utf8')+'\nglobal.WaveEngine=WaveEngine;');
const S=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
for(const k of ['kicks','full','rapid','vocal']){simT=0;const e=new WaveEngine('x');let spawn=0;const o=e._spawnPulse.bind(e);e._spawnPulse=(a,b)=>{spawn++;return o(a,b)};
 const rows=S[k];let ai=0;let maxAct=0;const dt=1/144;for(;simT<8;simT+=dt){while(ai<rows.length&&rows[ai][0]<=simT){const r=rows[ai++];e.updateAudio(r[1],r[2],true,r[3],r[4]);}e.render(dt);maxAct=Math.max(maxAct,e.pOn.reduce((a,b)=>a+b,0));}
 console.log(k.padEnd(8),'發射',spawn,'顆 /8s  (預期 kicks/full≈16, rapid 受 170ms 不應期限制≈ 47)',' 同時最多',maxAct,'顆');}
