/* Rejestr ofert obligacji — widok „Co kupić?”: porównanie wszystkich serii z bieżącej oferty dla tej samej kwoty
   i okresu. Obliczenia w js/zamiana.js (compareBuy); wspólne elementy formularza z js/kalkulator.js. */
const BUY_TYPES=["EDO","COI","TOS","ROS","ROD","DOR","ROR","OTS"];
const BUY_H=[3,6,12,24,36,48,60,72,84,96,120,144];
const buyHLabel=m=>m<12?`${m} mies.`:(m%12?fmt(m/12,1)+" roku":(m/12===1?"1 rok":`${m/12} ${[2,3,4].includes((m/12)%10)&&!(m/12>=12&&m/12<=14)?"lata":"lat"}`));
// „po 3 miesiącach”, „po roku”, „po 1,5 roku”, „po 5 latach”
const buyAfterTxt=m=>m<12?`po ${m} miesiącach`:m===12?"po roku":(m%12?`po ${fmt(m/12,1)} roku`:`po ${m/12} latach`);
const buyOffer=()=>state.months[state.months.length-1];
Object.assign(CALC_TIPS,{
  kw:"Ile chcesz zainwestować. Kupujesz pełne obligacje po 100 zł, reszta trafia na konto.",
  bh:"Po jakim czasie chcesz wypłacić pieniądze. Seria, która wykupi się wcześniej, zamienia się na taką samą na dzisiejszych warunkach.",
  r8:"ROS i ROD mogą kupić tylko beneficjenci programu 800+ (do wysokości otrzymanych świadczeń).",
  bval:"Domyślnie liczymy, ile dostaniesz, wypłacając wszystko na koniec okresu — z opłatą za przedterminowy wykup i podatkiem. Ta opcja pokazuje wartość bez wypłaty."
});
function buyDefaults(){return {kw:10000,h:60,sc:"base",cpi:Array(12).fill(2.5),sv:4,acc:"std",nbp:calcNbpNow(),r8:false,val:"l"}}
function buyFromHash(){
  const parts=(location.hash||"").slice(1).split("&");if(parts[0]!=="kupno"||parts.length<2)return null;
  const q=Object.fromEntries(parts.slice(1).map(x=>x.split("=").map(decodeURIComponent)));const b=buyDefaults();
  const num=(k,d)=>q[k]!=null&&q[k]!==""&&!isNaN(+q[k])?+q[k]:d;
  b.kw=num("kw",b.kw);if(BUY_H.includes(num("h",0)))b.h=+q.h;b.sv=num("sv",b.sv);b.nbp=num("nbp",b.nbp);
  b.acc=q.ike==="1"?"ike":q.ike==="2"?"ikze":"std";b.r8=q.r8==="1";b.val=q.val==="h"?"h":"l";
  if(q.sc&&(CPI_PRESETS[q.sc]||q.sc==="custom"))b.sc=q.sc;
  if(q.cpi){const a=q.cpi.split(",").map(Number).filter(v=>!isNaN(v));if(a.length)b.cpi=Array.from({length:12},(_,i)=>a[Math.min(i,a.length-1)]);}
  return b;
}
function buyHash(b){
  const q={kw:b.kw,h:b.h,sc:b.sc,sv:b.sv,ike:{std:0,ike:1,ikze:2}[b.acc]};
  if(b.sc==="custom")q.cpi=b.cpi.join(",");if(b.r8)q.r8=1;if(b.val==="h")q.val="h";
  if(+b.nbp!==calcNbpNow())q.nbp=b.nbp;
  return "kupno&"+Object.entries(q).map(([k,v])=>k+"="+encodeURIComponent(v).replace(/%2C/g,",")).join("&");
}
function buyCandidates(b){
  const off=buyOffer().series||{};
  return BUY_TYPES.filter(t=>off[t]&&(b.r8||off[t].availability==="wszyscy")).map(t=>({type:t,code:off[t].code,rate1:off[t].rate1,
    margin:off[t].margin??0,fee:typeof off[t].fee==="number"?off[t].fee:0,swapPrice:off[t].swapPrice,availability:off[t].availability}));
}
function buyParams(b,cands,cpiOverride){
  return {now:calcArchiveNow(),amount:+b.kw,horizonMonths:+b.h,candidates:cands,cpiHistory:calcCpiHist(),
    cpiFuture:cpiOverride!=null?[cpiOverride]:(b.sc==="custom"?b.cpi.slice():[CPI_PRESETS[b.sc].v]),
    nbpHistory:Zamiana.nbpHistoryFromMonths(state.raw),nbpFuture:+b.nbp,savingsRate:+b.sv,
    tax:b.acc==="std",withdrawalTax:b.acc==="ikze"?0.1:0,valuation:b.val==="h"?"hold":"liquidate"};
}
// opis zasady oprocentowania serii z oferty
function buyRuleTxt(c){
  if(c.type==="OTS")return `stałe ${fmt(c.rate1)}% przez 3 mies.`;
  if(c.type==="TOS")return `stałe ${fmt(c.rate1)}% przez 3 lata`;
  if(c.type==="ROR"||c.type==="DOR")return `${fmt(c.rate1)}% w 1. mies., potem stopa NBP + ${fmt(c.margin)} p.p.`;
  return `${fmt(c.rate1)}% w 1. roku, potem inflacja + ${fmt(c.margin)} p.p.`;
}
function renderBuy(main){
  if(!state.buy)state.buy=buyFromHash()||buyDefaults();
  const b=state.buy,off=buyOffer(),yrs=Math.min(12,Math.max(1,Math.ceil(b.h/12)));
  main.innerHTML=`<div class="vlist">
    <div class="sec-head"><div><p class="kicker">§ 5 · co kupić</p><h2>Która seria da najwięcej <span class="acc">na rękę</span>?</h2><p class="desc">Porównuje serie z oferty na ${esc(mLabel(off.id))} dla tej samej kwoty i okresu: ile dostaniesz, wypłacając wszystko na koniec — po opłacie za przedterminowy wykup i podatku. Seria, która w tym czasie wykupi się w terminie, zamienia się na taką samą na dzisiejszych warunkach.</p></div></div>
    <div class="calc-grid">
      <div class="card">
        <h3>Kwota i okres</h3>
        <div class="frow">
          <label class="field wide"><span class="flabel">Kwota, zł${calcTip("kw")}</span><input id="b-kw" type="number" min="100" step="100" inputmode="numeric" value="${esc(b.kw)}"></label>
          <label class="field"><span class="flabel">Okres${calcTip("bh")}</span><span class="sel"><select id="b-h">${selOpts(BUY_H.map(m=>[m,buyHLabel(m)]),b.h)}</select></span></label>
        </div>
        <label class="check"><input id="b-r8" type="checkbox"${b.r8?" checked":""}> Mam prawo do obligacji rodzinnych (800+) — pokaż ROS i ROD${calcTip("r8")}</label>
        <label class="check"><input id="b-val" type="checkbox"${b.val==="h"?" checked":""}> Wyceniaj bez wypłaty (bez opłaty za wykup)${calcTip("bval")}</label>
      </div>
      <div class="card">
        <h3>Założenia na przyszłość</h3>
        <div class="field"><span class="flabel">Inflacja (CPI r/r)${calcTip("cpi")}</span>
          <div class="chips" role="group" aria-label="Scenariusz inflacji">${Object.entries(CPI_PRESETS).map(([k,v])=>`<button type="button" class="chip" data-bsc="${k}" aria-pressed="${b.sc===k}">${v.label}</button>`).join("")}<button type="button" class="chip" data-bsc="custom" aria-pressed="${b.sc==="custom"}">Własna, rok po roku</button></div>
        </div>
        ${b.sc==="custom"?`<div class="cpi-years">${Array.from({length:yrs},(_,i)=>`<label>rok ${i+1}<input type="number" step="0.1" data-bcpi="${i}" value="${esc(b.cpi[i])}"></label>`).join("")}</div>`:""}
        <div class="frow">
          <label class="field"><span class="flabel">Stopa NBP dalej, %${calcTip("nbp")}</span><input id="b-nbp" type="number" step="0.25" min="0" inputmode="decimal" value="${esc(b.nbp)}"></label>
          <label class="field"><span class="flabel">Konto na resztę, %${calcTip("sv")}</span><input id="b-sv" type="number" step="0.1" inputmode="decimal" value="${esc(b.sv)}"></label>
        </div>
        <div class="field"><span class="flabel">Rachunek${calcTip("acc")}</span>
          <div class="chips" role="group" aria-label="Rachunek">${CALC_ACC.map(([k,l])=>`<button type="button" class="chip" data-bacc="${k}" aria-pressed="${b.acc===k}">${l}</button>`).join("")}</div>
        </div>
      </div>
    </div>
    <div id="b-out"></div>
  </div>`;
  const inp=(id,k)=>$(id).addEventListener("input",e=>{b[k]=e.target.value;buyRecompute()});
  inp("#b-kw","kw");inp("#b-sv","sv");inp("#b-nbp","nbp");
  $("#b-h").addEventListener("change",e=>{b.h=+e.target.value;renderBuy(main)});
  $("#b-r8").addEventListener("change",e=>{b.r8=e.target.checked;buyRecompute()});
  $("#b-val").addEventListener("change",e=>{b.val=e.target.checked?"h":"l";buyRecompute()});
  main.querySelectorAll("button.chip[data-bsc]").forEach(x=>x.addEventListener("click",()=>{if(x.dataset.bsc==="custom"&&b.sc!=="custom"){const v=CPI_PRESETS[b.sc]?.v??2.5;b.cpi=Array(12).fill(v)}b.sc=x.dataset.bsc;renderBuy(main)}));
  main.querySelectorAll("button.chip[data-bacc]").forEach(x=>x.addEventListener("click",()=>{b.acc=x.dataset.bacc;renderBuy(main)}));
  main.querySelectorAll("input[data-bcpi]").forEach(el=>el.addEventListener("input",()=>{const i=+el.dataset.bcpi,v=parseFloat(el.value);if(!isNaN(v)){b.cpi[i]=v;for(let j=i+1;j<12;j++)if(j>=yrs)b.cpi[j]=v;}buyRecompute()}));
  calcBindTips(main.querySelector(".calc-grid"));
  buyRecompute();
}
function buyRecompute(){
  const out=$("#b-out");if(!out)return;const b=state.buy,off=buyOffer();
  try{history.replaceState(null,"","#"+buyHash(b))}catch(e){}
  const errs=[];
  if(!(+b.kw>=100))errs.push("Podaj kwotę — co najmniej 100 zł.");
  for(const [k,l] of [["sv","oprocentowanie konta"],["nbp","przyszłą stopę NBP"]])if(b[k]===""||isNaN(+b[k]))errs.push("Uzupełnij "+l+".");
  const cands=buyCandidates(b);if(!cands.length)errs.push("W ofercie nie ma serii do porównania.");
  if(errs.length){out.innerHTML=`<div class="insight warn"><span class="t">uzupełnij dane</span>${errs.map(esc).join("<br>")}</div>`;return}
  let r;
  try{r=Zamiana.compareBuy(buyParams(b,cands))}catch(e){out.innerHTML=`<div class="insight warn"><span class="t">błąd</span>${esc(e.message)}</div>`;return}
  const byType=Object.fromEntries(r.results.map(x=>[x.type,x])),cand=Object.fromEntries(cands.map(c=>[c.type,c]));
  const rank=r.ranking.map(t=>Object.assign({},byType[t],{c:cand[t]})),best=rank[0],second=rank[1];
  const H=r.horizonMonths,hTxt=buyHLabel(H),liq=b.val!=="h";
  const pct=v=>v==null?"–":(v*100).toFixed(2).replace(".",",")+"%";
  // próg inflacji między pierwszym a drugim miejscem (stała inflacja, przy której zamieniają się miejscami)
  let beTxt="";
  if(second){
    const f=c=>{const rr=Zamiana.compareBuy(buyParams(b,[best.c,second.c],c));return rr.results[0].final-rr.results[1].final};
    let lo=-2,hi=15,flo=f(lo),fhi=f(hi);
    if(Math.abs(flo-fhi)<0.5)beTxt=`Kolejność ${esc(best.c.code)} i ${esc(second.c.code)} nie zależy od inflacji.`;
    else if(Math.sign(flo)===Math.sign(fhi))beTxt=`${esc(flo>0?best.c.code:second.c.code)} wygrywa z ${esc(flo>0?second.c.code:best.c.code)} przy każdej stałej inflacji od −2% do 15%.`;
    else{for(let i=0;i<40;i++){const m=(lo+hi)/2,fm=f(m);if(Math.sign(fm)===Math.sign(flo)){lo=m;flo=fm}else{hi=m;fhi=fm}}
      const be=(lo+hi)/2;beTxt=`${esc(best.c.code)} wygrywa z ${esc(second.c.code)}, dopóki stała inflacja jest ${f(-2)>0?"poniżej":"powyżej"} ${fmt(be,1)}%.`}
  }
  const notes=x=>{const n=[];const term=Zamiana.TYPES[x.type].term;const w=x.events.filter(e=>e.kind==="wykup").length;
    if(w)n.push(w===1?"wykup w terminie i zamiana na nową":`${w}× wykup w terminie i zamiana`);
    if(liq&&H%term!==0)n.push(x.type==="OTS"?"na koniec przed wykupem — bez odsetek":`na koniec przed wykupem — opłata ${x.type==="ROR"||x.type==="DOR"?"":"do "}${fmt(x.c.fee)} zł/szt.`);
    if(x.c.availability!=="wszyscy")n.push("tylko 800+");
    if(x.type==="COI")n.push("kupony co rok na konto");if(x.type==="ROR"||x.type==="DOR")n.push("odsetki co miesiąc na konto");
    return n.join("; ")};
  out.innerHTML=`<div class="vlist">
    <div class="verdict good"><div class="vt">${esc(buyAfterTxt(H).replace(/^p/,"P"))} najwięcej da ${esc(best.c.code)}: ${zl0(best.final)} ${liq?"na rękę":""}</div>
      <div class="vs">Zysk ${sgn(best.gain)} (${pct(best.annual)} rocznie${b.acc==="std"?" po podatku":""}), realnie ${zl0(best.finalReal)} w dzisiejszych złotych.${second?` Drugie miejsce: ${esc(second.c.code)} (${sgn(second.final-best.final)}).`:""} ${beTxt}</div></div>
    <div class="card"><div class="sec-head"><div><h3>Wartość w czasie</h3><p class="desc">${liq?"Ile dostałbyś, wypłacając wszystko z końcem danego miesiąca (po opłacie i podatku), z resztą na koncie.":"Wartość obligacji bez wypłaty, z resztą na koncie."}</p></div></div>
      <div class="chart" id="b-chart"></div></div>
    <div class="card table-card"><div class="tc-head"><h3>Wszystkie serie z oferty</h3><p class="desc">Kwota ${zl0(+b.kw)}, okres ${esc(hTxt)}, ${calcTaxTxt({acc:b.acc})}. ${liq?"Wartość na koniec = wypłata wszystkiego (po opłacie i podatku) plus konto.":"Wartość na koniec bez wypłaty: obligacje po podatku od narosłych odsetek, bez opłaty, plus konto."}</p></div>
      <div class="frame"><table><thead><tr><th>#</th><th>Seria</th><th>Oprocentowanie</th><th class="r">Na koniec</th><th class="r">Zysk</th><th class="r">Rocznie</th><th class="r">Realnie${calcTip("real",1)}</th><th>Uwagi</th></tr></thead><tbody>
      ${rank.map((x,i)=>`<tr><td>${i+1}</td><td><b style="color:var(--s-${x.type})">${esc(x.c.code)}</b> <span class="small">${esc(Zamiana.TYPES[x.type].label)}</span></td><td>${esc(buyRuleTxt(x.c))}</td><td class="r num"><b>${zl0(x.final)}</b></td><td class="r num"><span class="${x.gain>0?"d-up":x.gain<0?"d-down":"d-0"}">${sgn(x.gain)}</span></td><td class="r num">${pct(x.annual)}</td><td class="r num">${zl0(x.finalReal)}</td><td class="small">${esc(notes(x))}</td></tr>`).join("")}
      </tbody></table></div></div>
    <details class="how"><summary>Jak to policzono</summary><ul>
      <li>Za ${zl0(+b.kw)} kupujesz pełne obligacje po 100 zł (${Math.floor(+b.kw/100)} szt.), reszta trafia na konto (${fmt(+b.sv,1)}%${b.acc==="std"?" przed podatkiem":""}).</li>
      <li>Oprocentowanie z listów emisyjnych oferty ${esc(mLabel(off.id))}. Od 2. okresu: inflacja ogłoszona w miesiącu przed okresem (odczyt za P−2) + marża (EDO, COI, ROS, ROD) albo stopa referencyjna NBP + marża (ROR, DOR); do ${mShort(off.cpiRefMonth||off.id)} z archiwum GUS i NBP, dalej Twój scenariusz (inflacja ${b.sc==="custom"?"rok po roku":fmt(CPI_PRESETS[b.sc].v,1)+"%"}, stopa NBP ${fmt(+b.nbp)}%).</li>
      <li>Kupony COI i odsetki ROR/DOR trafiają na konto po podatku. Seria, która w tym okresie wykupi się w terminie, zamienia się na taką samą serię na dzisiejszych warunkach po cenie zamiany (99,90 zł; OTS 100,00 zł; ROS i ROD — bez ceny zamiany, po 100 zł).</li>
      <li>${liq?`Na koniec okresu wypłacasz wszystko: przed terminem wykupu z opłatą za przedterminowy wykup (nie wyższą niż narosłe odsetki; ROR i DOR od 2. miesiąca — stałą; OTS — bez odsetek) i z podatkiem 19% od zysku${b.acc!=="std"?" (w IKE/IKZE bez podatku i bez opłaty przy wypłacie z konta)":""}.`:"Wartość bez wypłaty: obligacje po podatku od narosłych odsetek, bez opłaty."}${b.acc==="ikze"?" W IKZE wartości są po 10% ryczałcie przy wypłacie po 65. roku życia.":""}</li>
      <li>Linie odniesienia na wykresie: <b>wpłata + inflacja</b> — wpłacona kwota od dziś rośnie co miesiąc o (1 + CPI r/r)<sup>1/12</sup> (do dziś z archiwum GUS, dalej scenariusz); wartość obligacji nad tą linią to zysk realny, pod nią — utrata siły nabywczej. <b>Wpłata na stopie NBP</b> rośnie tak samo o stopę referencyjną NBP${b.acc==="std"?" (zysk po 19% podatku)":""}.</li>
      <li>To symulacja przy stałych założeniach, nie rekomendacja inwestycyjna. Wiążące są listy emisyjne.</li>
    </ul></details>
    ${exportRowHtml("b")}
    ${calcShareHtml}
  </div>`;
  const pp=buyParams(b,cands);
  buyDrawChart(rank,{amount:+b.kw,tax:pp.tax===false?0:(pp.taxRate||0.19),cpiAt:Zamiana.makeCpiAt(pp.cpiHistory,pp.cpiFuture,pp.now),nbpAt:Zamiana.makeNbpAt(pp.nbpHistory,pp.nbpFuture,pp.now)});
  // eksport: ranking (jak tabela) i wartość każdej serii miesiąc po miesiącu; PNG wykresu
  const base=`co-kupic-${fileSafe(zl0(+b.kw).replace(/ zł$/,"zl"))}-${H}m-${off.id}`;
  $("#b-csv").addEventListener("click",()=>{
    const rows=rank.map((x,i)=>[i+1,x.c.code,buyRuleTxt(x.c),csvNum(x.final),csvNum(x.gain),csvNum(x.annual==null?null:x.annual*100),csvNum(x.finalReal),notes(x)]);
    const monthly=[[],["Miesiąc","Po (mies.)",...rank.map(x=>x.c.code+" (zł)")],...rank[0].series.map((m,t)=>[m.ym,t,...rank.map(x=>csvNum(x.series[t].total))])];
    downloadCsv(base+".csv",["#","Seria","Oprocentowanie","Na koniec (zł)","Zysk (zł)","Rocznie (%)","Realnie (zł)","Uwagi"],rows.concat(monthly),
      [["Kwota",csvNum(+b.kw)],["Okres",hTxt],["Rachunek",calcTaxTxt({acc:b.acc})],["Wycena",liq?"wypłata wszystkiego na koniec":"bez wypłaty"],["Inflacja dalej",b.sc==="custom"?b.cpi.slice(0,Math.ceil(H/12)).map(v=>fmt(v,1)+"%").join(", "):fmt(CPI_PRESETS[b.sc].v,1)+"%"],["Stopa NBP dalej",fmt(+b.nbp)+"%"],["Link",location.href],["Źródło","Rejestr ofert obligacji — symulacja, nie rekomendacja inwestycyjna"]])});
  $("#b-png").addEventListener("click",()=>downloadChartPng($("#b-chart"),base+".png",`Co kupić: ${zl0(+b.kw)} na ${hTxt}`,`oferta ${mLabel(off.id)} · ${calcTaxTxt({acc:b.acc})} · ${liq?"wypłata na koniec okresu":"bez wypłaty"}`));
  calcBindShare();calcBindTips(out);
}
function buyDrawChart(rank,macro){
  const el=$("#b-chart");if(!el)return;macro=macro||{};
  state.buyVis=state.buyVis||{};const vis=k=>state.buyVis[k]??true;
  const shown=rank.filter(r=>vis(r.type));
  const pts=rank[0].series,n=pts.length;const W=Math.max(640,el.clientWidth||900),Hh=300,L=64,R=14,T=16,B=30;
  // linie odniesienia w zł: wpłacona kwota rosnąca o inflację CPI i o stopę NBP (do dziś z archiwum, dalej scenariusz)
  const amt=+macro.amount||0,yms=pts.map(m=>m.ym),buys=[{ym:yms[0],amount:amt}];
  const hasCpi=amt>0&&!!macro.cpiAt,hasNbp=amt>0&&!!macro.nbpAt,showCpi=hasCpi&&vis("cpi"),showNbp=hasNbp&&vis("nbp");
  const mac=yms.map(()=>({}));if(hasCpi)benchLine(yms,buys,macro.cpiAt).forEach((v,i)=>mac[i].cpi=v);if(hasNbp)benchLine(yms,buys,macro.nbpAt,macro.tax).forEach((v,i)=>mac[i].nbp=v);
  const vals=(shown.length?shown:rank).flatMap(x=>x.series.map(s=>s.total)).concat(mac.flatMap(m=>[showCpi?m.cpi:null,showNbp?m.nbp:null]).filter(v=>v!=null));let min=Math.min(...vals),max=Math.max(...vals);
  const span=max-min||max*0.05||1,raw=span/5,mag=Math.pow(10,Math.floor(Math.log10(raw))),step=[1,2,2.5,5,10].map(k=>k*mag).find(s=>s>=raw);
  min=Math.floor(min/step)*step;max=Math.ceil(max/step)*step;if(max===min)max=min+step;
  const x=i=>L+(n<=1?0:(W-L-R)*i/(n-1)),y=v=>T+(Hh-T-B)*(1-(v-min)/(max-min));
  const fk=v=>v>=10000?(Math.round(v/100)/10).toLocaleString("pl-PL")+" tys.":Math.round(v).toLocaleString("pl-PL");
  let g="";for(let v=min;v<=max+1e-9;v+=step)g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--line-strong)"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${fk(v)}</text>`;
  let xt="";const every=n>150?2:1;
  pts.forEach((m,i)=>{if((n<=24&&i%3===0)||(n>24&&m.ym.slice(5)==="01"&&(+m.ym.slice(0,4))%every===0)){const lab=n<=24?mShort(m.ym):m.ym.slice(0,4);xt+=`<line x1="${x(i)}" x2="${x(i)}" y1="${Hh-B}" y2="${Hh-B+4}" style="stroke:var(--muted)"/><text x="${x(i)}" y="${Hh-B+17}" text-anchor="middle">${lab}</text>`}});
  const path=s=>s.map((p,i)=>(i?"L":"M")+x(i).toFixed(1)+" "+y(p.total).toFixed(1)).join(" ");
  let macroPaths="";const pl=k=>mac.map((m,i)=>(i?"L":"M")+x(i).toFixed(1)+" "+y(m[k]).toFixed(1)).join(" ");
  if(showCpi)macroPaths+=`<path d="${pl("cpi")}" fill="none" style="stroke:var(--s-CPI)" stroke-width="1.8" stroke-dasharray="6 4"/>`;
  if(showNbp)macroPaths+=`<path d="${pl("nbp")}" fill="none" style="stroke:var(--s-NBP)" stroke-width="1.8" stroke-dasharray="2 3"/>`;
  const items=rank.map(r=>({k:r.type,label:r.c.code,color:`var(--s-${r.type})`})).concat(hasCpi?[{k:"cpi",label:"wpłata + inflacja",color:"var(--s-CPI)",dash:1}]:[],hasNbp?[{k:"nbp",label:macro.tax?"wpłata na stopie NBP (po podatku)":"wpłata na stopie NBP",color:"var(--s-NBP)",dash:1}]:[]);
  el.innerHTML=chartLegendHtml(items,vis)+`<svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Wartość serii w czasie">${g}<line x1="${L}" x2="${W-R}" y1="${Hh-B}" y2="${Hh-B}" style="stroke:var(--line-strong)"/>${xt}${macroPaths}
    ${shown.slice().reverse().map((r,k)=>`<path d="${path(r.series)}" fill="none" style="stroke:var(--s-${r.type})" stroke-width="${r===rank[0]?3:2}" stroke-linejoin="round"/>`).join("")}
    <line class="bhov" x1="0" x2="0" y1="${T}" y2="${Hh-B}" style="stroke:var(--muted);stroke-dasharray:2 3;visibility:hidden"/><g class="bpts"></g></svg><div class="tip" hidden></div>`;
  chartLegendBind(el,k=>{state.buyVis[k]=!vis(k);buyDrawChart(rank,macro)});
  const svg=el.querySelector("svg"),tip=el.querySelector(".tip"),hov=el.querySelector(".bhov"),dots=el.querySelector(".bpts");
  const docked=!!(window.matchMedia&&matchMedia("(max-width: 720px), (hover: none) and (pointer: coarse)").matches);tip.classList.toggle("docked",docked);
  const show=i=>{hov.setAttribute("x1",x(i));hov.setAttribute("x2",x(i));hov.style.visibility="visible";
    const at=shown.map(r=>({r,v:r.series[i].total})).sort((a,b)=>b.v-a.v);
    dots.innerHTML=at.map(a=>`<circle cx="${x(i)}" cy="${y(a.v)}" r="3.5" style="fill:var(--s-${a.r.type});stroke:var(--surface);stroke-width:1.5"/>`).join("");
    const mRows=(showCpi?`<div class="tr"><span class="dot" style="background:var(--s-CPI)"></span>Wpłata + inflacja <span class="num">${zl0(mac[i].cpi)}</span></div>`:"")+(showNbp?`<div class="tr"><span class="dot" style="background:var(--s-NBP)"></span>Wpłata na stopie NBP <span class="num">${zl0(mac[i].nbp)}</span></div>`:"");
    tip.innerHTML=`<div class="tt">${mLabel(pts[i].ym)} · po ${i} mies.${docked?'<span class="hint">dotknij wykresu, aby zmienić miesiąc</span>':""}</div>${at.map(a=>`<div class="tr"><span class="dot" style="background:var(--s-${a.r.type})"></span><b>${esc(a.r.c.code)}</b> <span class="num">${zl0(a.v)}</span></div>`).join("")}${mRows}`;
    tip.hidden=false;if(docked)return;const rr=svg.getBoundingClientRect(),er=el.getBoundingClientRect();const px=x(i)/W*rr.width+(rr.left-er.left);const tw=tip.offsetWidth;let left=px+14;if(left+tw>er.width-4)left=px-14-tw;if(left<4)left=4;tip.style.left=left+"px";tip.style.top=(rr.top-er.top+10)+"px"};
  const idx=cx=>{const rr=svg.getBoundingClientRect();const sx=(cx-rr.left)*W/rr.width;return Math.max(0,Math.min(n-1,Math.round((sx-L)/((W-L-R)/(n-1)))))};
  svg.addEventListener("mousemove",e=>show(idx(e.clientX)));svg.addEventListener("mouseleave",()=>{if(docked)return;tip.hidden=true;hov.style.visibility="hidden";dots.innerHTML=""});
  svg.addEventListener("touchstart",e=>show(idx(e.touches[0].clientX)),{passive:true});svg.addEventListener("touchmove",e=>show(idx(e.touches[0].clientX)),{passive:true});
  if(docked)show(n-1);
}
