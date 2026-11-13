/* Rejestr ofert obligacji — eksport wyników: CSV (średnik, przecinek dziesiętny, BOM) i PNG wykresu (z tytułem, legendą,
   znakiem wodnym i źródłem). Używany przez kalkulator zamiany, „Co kupić?” i „Mój portfel”. Ładowany po app.js (bez kroku budowania). */

// ===== eksport: CSV (średnik, przecinek dziesiętny, BOM — poprawnie otwiera się w polskim Excelu) i PNG wykresu =====
const csvNum=(v,d=2)=>v==null||v===""||isNaN(v)?"":Number(v).toFixed(d).replace(".",",");
function downloadBlob(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.rel="noopener";document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000)}
function downloadCsv(name,header,rows,meta){
  const q=v=>{const t=String(v??"");return /[;"\r\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t};
  const lines=[header,...rows].concat(meta&&meta.length?[[],...meta]:[]).map(r=>r.map(q).join(";"));
  downloadBlob(new Blob(["﻿"+lines.join("\r\n")+"\r\n"],{type:"text/csv;charset=utf-8"}),name);
}
// PNG wykresu: kopia SVG z wpisanymi stylami (zmienne CSS i style arkusza nie działają w obrazku), nad nią tytuł i legenda (widoczne linie), pod nią źródło
const PNG_PROPS=["fill","fill-opacity","stroke","stroke-width","stroke-dasharray","stroke-opacity","stroke-linejoin","stroke-linecap","opacity","visibility","font-family","font-size","font-weight","paint-order","text-anchor","dominant-baseline"];
function chartPngBlob(chartEl,title,subtitle){
  return new Promise((ok,fail)=>{
    const svg=chartEl.querySelector("svg");if(!svg)return fail(new Error("Brak wykresu"));
    const vb=svg.viewBox.baseVal,W=vb.width,H=vb.height,clone=svg.cloneNode(true);
    const src=[svg,...svg.querySelectorAll("*")],dst=[clone,...clone.querySelectorAll("*")];
    src.forEach((el,i)=>{const cs=getComputedStyle(el),d=dst[i];for(const k of PNG_PROPS){const v=cs.getPropertyValue(k);if(v)d.setAttribute(k,v)}d.removeAttribute("style");d.removeAttribute("class")});
    // elementy podglądu pod kursorem (linia, kropki) pomijamy
    src.forEach((el,i)=>{if(el.matches&&el.matches(".zhov,.zpts,.bhov,.bpts,#hov,#hovpts"))dst[i].remove()});
    clone.setAttribute("xmlns","http://www.w3.org/2000/svg");clone.setAttribute("width",W);clone.setAttribute("height",H);
    const root=getComputedStyle(document.documentElement),col=n=>root.getPropertyValue(n).trim();
    const font=getComputedStyle(document.body).fontFamily,S=2,pad=20;
    const items=[...chartEl.querySelectorAll('.lgnd button[aria-pressed="true"]')].map(b=>{const i=b.querySelector("i"),cs=getComputedStyle(i);
      const dashed=cs.borderTopStyle==="dashed";return {label:b.textContent.trim(),color:dashed?cs.borderTopColor:cs.backgroundColor,dashed}});
    const cv=document.createElement("canvas"),ctx=cv.getContext("2d");
    // układ legendy (zawijanie wierszy)
    ctx.font=`600 13px ${font}`;const rows=[[]];let x=pad;
    for(const it of items){const w=26+ctx.measureText(it.label).width+18;if(x+w>W-pad&&rows[rows.length-1].length){rows.push([]);x=pad}rows[rows.length-1].push(Object.assign(it,{x}));x+=w}
    const head=pad+24+(subtitle?20:0)+(items.length?rows.length*22+6:0)+8,foot=30;
    cv.width=W*S;cv.height=(head+H+foot)*S;ctx.scale(S,S);
    ctx.fillStyle=col("--surface")||"#fff";ctx.fillRect(0,0,W,head+H+foot);
    ctx.fillStyle=col("--ink")||"#111";ctx.font=`800 18px ${font}`;ctx.textBaseline="alphabetic";ctx.fillText(title,pad,pad+16);
    let y=pad+24;if(subtitle){ctx.fillStyle=col("--muted")||"#666";ctx.font=`500 13px ${font}`;ctx.fillText(subtitle,pad,y+12);y+=20}
    ctx.font=`600 13px ${font}`;rows.forEach(r=>{for(const it of r){ctx.strokeStyle=it.color;ctx.lineWidth=3;ctx.setLineDash(it.dashed?[5,3]:[]);ctx.beginPath();ctx.moveTo(it.x,y+9);ctx.lineTo(it.x+18,y+9);ctx.stroke();
      ctx.setLineDash([]);ctx.fillStyle=col("--ink-2")||"#333";ctx.fillText(it.label,it.x+26,y+13)}y+=22});
    const img=new Image();
    img.onload=()=>{pngWatermark(ctx,W/2,head+H*0.42,Math.min(W,H*2.2),col,font);ctx.drawImage(img,0,head,W,H);ctx.fillStyle=col("--muted")||"#666";ctx.font=`500 11.5px ${font}`;
      ctx.fillText(`Rejestr ofert obligacji · patrykw-labs.github.io/rejestr-obligacji · symulacja, nie rekomendacja inwestycyjna`,pad,head+H+19);
      cv.toBlob(b=>b?ok(b):fail(new Error("Nie udało się utworzyć obrazu")),"image/png")};
    img.onerror=()=>fail(new Error("Nie udało się narysować wykresu"));
    img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(new XMLSerializer().serializeToString(clone));
  });
}
// znak wodny eksportu PNG: logo (kwadrat z linią wykresu) i napis „RejestrObligacji” ukośnie na środku wykresu, z adresem strony;
// rysowany przed wykresem, więc linie są nad nim
function pngWatermark(ctx,cx,cy,span,col,font){
  const dark=document.documentElement.dataset.theme==="dark"||(!document.documentElement.dataset.theme&&matchMedia("(prefers-color-scheme: dark)").matches);
  const fs=Math.max(28,Math.min(64,span/13)),ink=col("--ink")||"#111",acc=col("--accent")||"#2454d6";
  ctx.save();ctx.translate(cx,cy);ctx.rotate(-Math.PI/14);ctx.globalAlpha=dark?0.13:0.09;ctx.textBaseline="middle";
  ctx.font=`800 ${fs}px ${font}`;const w1=ctx.measureText("Rejestr").width,w2=ctx.measureText("Obligacji").width,box=fs*1.05,gap=fs*0.35,tw=box+gap+w1+w2;
  let x=-tw/2;
  // logo: zaokrąglony kwadrat w kolorze akcentu z linią wykresu
  const r=box*0.24,y0=-box/2;ctx.fillStyle=acc;ctx.beginPath();ctx.moveTo(x+r,y0);ctx.arcTo(x+box,y0,x+box,y0+box,r);ctx.arcTo(x+box,y0+box,x,y0+box,r);ctx.arcTo(x,y0+box,x,y0,r);ctx.arcTo(x,y0,x+box,y0,r);ctx.closePath();ctx.fill();
  ctx.strokeStyle="#fff";ctx.lineWidth=box*0.09;ctx.lineJoin="round";ctx.lineCap="round";ctx.beginPath();
  [[0.2,0.68],[0.42,0.46],[0.58,0.58],[0.8,0.3]].forEach(([px,py],i)=>ctx[i?"lineTo":"moveTo"](x+box*px,y0+box*py));ctx.stroke();
  x+=box+gap;ctx.fillStyle=ink;ctx.fillText("Rejestr",x,0);ctx.fillStyle=acc;ctx.fillText("Obligacji",x+w1,0);
  ctx.font=`600 ${Math.round(fs*0.32)}px ${font}`;ctx.fillStyle=ink;ctx.textAlign="center";ctx.fillText("patrykw-labs.github.io/rejestr-obligacji",0,fs*0.95);
  ctx.restore();
}
async function downloadChartPng(chartEl,name,title,subtitle){try{downloadBlob(await chartPngBlob(chartEl,title,subtitle),name)}catch(e){alert(e.message)}}
// przyciski eksportu (prefix id: z, b, p); png=false — tylko CSV
const exportRowHtml=(p,png=true,csvLabel="tabela CSV")=>`<div class="row"><span class="small">Pobierz:</span>${png?`<button type="button" class="btn" id="${p}-png" data-goatcounter-click="eksport-png-${p}">wykres PNG</button>`:""}<button type="button" class="btn" id="${p}-csv" data-goatcounter-click="eksport-csv-${p}">${csvLabel}</button></div>`;
const fileSafe=t=>String(t).normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/ł/g,"l").replace(/Ł/g,"L").replace(/[^A-Za-z0-9.-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
