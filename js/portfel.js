/* Rejestr ofert obligacji — widok „Mój portfel”: ile są warte posiadane obligacje dziś, bez zamiany (wartość, wypłata po
   zerwaniu, terminy wykupu, najbliższe kupony i zmiany oprocentowania). Obliczenia w js/zamiana.js (holdings);
   wspólne elementy formularza z js/kalkulator.js. Stan w adresie #portfel&pf=KOD~szt~dzień,…&bd=…&ike=0|1&sc=… */
const PF_MAX=20;
const PF_ACC=[["std","Zwykły (podatek Belki)"],["ike","IKE / IKZE"]];
Object.assign(CALC_TIPS,{
  pcode:"Seria, którą masz. Oprocentowanie, marża i opłata uzupełnią się z jej listu emisyjnego.",
  ppd:"Dzień miesiąca zakupu. Od niego biegną okresy odsetkowe: rocznice (miesięcznice dla ROR i DOR), kupony i wykup.",
  pbd:"Dzień, na który liczymy wartość. Domyślnie dziś. Przy zerwaniu odsetki biegną do dnia wykupu — ok. 5 dni roboczych po dyspozycji.",
  pacc:"Zwykły rachunek — podatek 19% od zysku przy zerwaniu, wykupie i od kuponów. IKE / IKZE — bez podatku Belki (opłata za zerwanie w ramach konta zostaje).",
  pcpi:"Inflacja w kolejnych latach — tylko do prognoz: oprocentowania okresów, dla których GUS nie opublikował jeszcze odczytu, i wartości przy wykupie.",
  pgross:"Wartość obligacji z odsetkami narosłymi do dnia wyceny, przed opłatą za przedterminowy wykup i podatkiem.",
  ppay:"Ile dostaniesz na konto, gdy zerwiesz obligacje w dniu wyceny: wartość minus opłata (nie mniej niż 100 zł za sztukę; ROR i DOR — stała opłata, OTS — bez odsetek) minus podatek od zysku.",
  pmat:"Ile dostaniesz przy wykupie w terminie (po podatku), jeśli trzymasz do końca. Okresy, dla których nie ma jeszcze odczytu inflacji lub stopy NBP, liczymy ze scenariusza — to prognoza.",
  prate:"Oprocentowanie bieżącego okresu odsetkowego (roku; dla ROR i DOR — miesiąca) i dzień, w którym się kończy."
});
const pfNow=()=>calcArchiveNow();
const pfDate=(ym,pd)=>`${String(Math.min(+pd||1,calcDaysIn(ym))).padStart(2,"0")}.${ym.slice(5)}.${ym.slice(0,4)}`;
const pfIn=m=>{m=Math.max(0,Math.round(m));const y=Math.floor(m/12),r=m%12;if(!y)return `${r} mies.`;const yt=y===1?"rok":[2,3,4].includes(y%10)&&!(y>=12&&y<=14)?"lata":"lat";return r?`${y} ${yt} i ${r} mies.`:`${y} ${yt}`};
const pfPct=r=>fmt(r*100)+"%";
function pfDefaults(){
  const opts=calcOptions(pfNow()),now=pfNow();
  const pick=(opts.EDO||[]).find(c=>Zamiana.monthsBetween(Zamiana.parseCode(c).purchase,now)>=24)||(opts.EDO||[])[0]||Object.values(opts).flat()[0]||"";
  return {pos:pick?[{code:pick,n:100,pd:1}]:[],bd:calcDefaultBreakDay(),acc:"std",sc:"base"};
}
function pfFromHash(){
  const parts=(location.hash||"").slice(1).split("&");if(parts[0]!=="portfel"||parts.length<2)return null;
  const q=Object.fromEntries(parts.slice(1).map(x=>x.split("=").map(decodeURIComponent)));const s=pfDefaults();
  if(q.pf){const pos=[];for(const it of q.pf.split(",")){if(pos.length>=PF_MAX)break;const [code,n,pd]=it.split("~");const a=calcFromCode(code);
      if(a&&CALC_TYPES.includes(a.type)&&+n>=1)pos.push({code:a.code,n:Math.floor(+n),pd:calcDayOk(pd)?+pd:1});}
    s.pos=pos;}
  if(calcDayOk(q.bd))s.bd=Math.min(+q.bd,calcDaysIn(pfNow()));
  s.acc=q.ike==="1"?"ike":"std";if(CPI_PRESETS[q.sc])s.sc=q.sc;
  return s;
}
function pfHash(s){
  const q={pf:s.pos.map(o=>[o.code,o.n].concat(+o.pd!==1?[o.pd]:[]).join("~")).join(","),bd:s.bd,ike:s.acc==="ike"?1:0};if(s.sc!=="base")q.sc=s.sc;
  return "portfel&"+Object.entries(q).map(([k,v])=>k+"="+encodeURIComponent(v).replace(/%2C/g,",").replace(/%7E/gi,"~")).join("&");
}
// adres kalkulatora zamiany z tymi samymi seriami (do 8 serii)
function pfCalcHash(s){
  const pos=s.pos.slice(0,CALC_MAXPOS),tail=`&tt=EDO&bd=${s.bd}&ike=${s.acc==="ike"?1:0}`;
  if(pos.length===1){const o=pos[0];return `zamiana&k=${o.code}&n=${o.n}${+o.pd!==1?"&pd="+o.pd:""}${tail}`}
  return "zamiana&pf="+pos.map(o=>[o.code,o.n].concat(+o.pd!==1?[o.pd]:[]).join("~")).join(",")+tail;
}
function pfNext(s){
  const opts=calcOptions(pfNow()),used=new Set(s.pos.map(o=>o.code)),types=new Set(s.pos.map(o=>Zamiana.parseCode(o.code)?.type));
  const all=CALC_TYPES.flatMap(t=>opts[t]||[]).filter(x=>!used.has(x));
  return all.find(x=>!types.has(Zamiana.parseCode(x).type))||all[0]||"";
}
function pfParams(s){
  return {now:pfNow(),breakDay:+s.bd,positions:s.pos.map(o=>{const a=calcFromCode(o.code);return {code:o.code,type:a.type,rate1:+a.r1,margin:+a.m,fee:+a.f,purchase:a.p,purchaseDay:+o.pd||1,count:Math.floor(+o.n)}}),
    cpiHistory:calcCpiHist(),cpiFuture:[CPI_PRESETS[s.sc].v],nbpHistory:Zamiana.nbpHistoryFromMonths(state.raw),nbpFuture:calcNbpNow(),tax:s.acc==="std"};
}
function renderPortfolio(main){
  if(!state.pf)state.pf=pfFromHash()||pfDefaults();
  const s=state.pf,now=pfNow(),opts=calcOptions(now);
  const codeOpts=cur=>CALC_TYPES.filter(t=>opts[t]).map(t=>`<optgroup label="${t}">${selOpts(opts[t].map(x=>[x,x+" · zakup "+mShort(Zamiana.parseCode(x).purchase)]),cur)}</optgroup>`).join("");
  const posHtml=(o,i)=>{const a=calcFromCode(o.code),mat=a?Zamiana.addMonths(a.p,Zamiana.TYPES[a.type].term):null;
    return `<div class="pos"><div class="pos-head"><b>${i+1}. ${esc(o.code)}</b>${s.pos.length>1?`<button type="button" class="pos-del" data-pdel="${i}" aria-label="Usuń serię ${i+1}">usuń</button>`:""}</div>
      <div class="pos-row"><label class="field"><span class="flabel">Seria${calcTip("pcode")}</span><span class="sel"><select data-pi="${i}" data-pk="code">${opts[a?.type]?.includes(o.code)?"":`<option value="${esc(o.code)}" selected>${esc(o.code)}</option>`}${codeOpts(o.code)}</select></span></label>
        <label class="field"><span class="flabel">Szt.${calcTip("n")}</span><input data-pi="${i}" data-pk="n" type="number" min="1" step="1" inputmode="numeric" value="${esc(o.n)}"></label>
        <label class="field"><span class="flabel">Dzień${calcTip("ppd")}</span><input data-pi="${i}" data-pk="pd" type="number" min="1" max="31" step="1" inputmode="numeric" value="${esc(o.pd)}"></label></div>
      ${a?`<span class="fnote">zakup ${mShort(a.p)} · wykup ${mShort(mat)} · ${calcR1Label(a.type)} ${fmt(a.r1)}%${a.type==="OTS"||a.type==="TOS"?"":` · marża ${fmt(a.m)} p.p.`} · ${a.type==="OTS"?"przy zerwaniu bez odsetek":`opłata ${fmt(a.f)} zł/szt.`}</span>`:""}</div>`};
  main.innerHTML=`<div class="vlist">
    <div class="sec-head"><div><p class="kicker">§ 6 · mój portfel</p><h2>Ile są warte <span class="acc">moje obligacje</span>?</h2><p class="desc">Wpisz serie, które masz: zobaczysz ich wartość na ${esc(pfDate(now,s.bd))}, ile dostaniesz na rękę po zerwaniu, terminy wykupu, najbliższe kupony i zmiany oprocentowania. Bez zamiany — czy opłaca się zamienić je na nowe, sprawdzisz w kalkulatorze zamiany.</p></div></div>
    <div class="calc-grid">
      <div class="card"><h3>Moje obligacje <small>${s.pos.length} ${s.pos.length===1?"seria":[2,3,4].includes(s.pos.length%10)&&!(s.pos.length>=12&&s.pos.length<=14)?"serie":"serii"}</small></h3>
        ${s.pos.map(posHtml).join("")}
        <div class="row"><button type="button" class="btn" id="p-add"${s.pos.length>=PF_MAX?" disabled":""}>+ dodaj serię</button><span class="small">do ${PF_MAX} serii</span></div></div>
      <div class="card"><h3>Wycena</h3>
        <div class="frow"><label class="field"><span class="flabel">Dzień wyceny${calcTip("pbd")}</span><input id="p-bd" type="number" min="1" max="${calcDaysIn(now)}" step="1" inputmode="numeric" value="${esc(s.bd)}"><span class="fnote">${esc(mLabel(now))}</span></label></div>
        <div class="field"><span class="flabel">Rachunek${calcTip("pacc")}</span><div class="chips" role="group" aria-label="Rachunek">${PF_ACC.map(([k,l])=>`<button type="button" class="chip" data-pacc="${k}" aria-pressed="${s.acc===k}">${l}</button>`).join("")}</div></div>
        <div class="field"><span class="flabel">Inflacja dalej (do prognoz)${calcTip("pcpi")}</span><div class="chips" role="group" aria-label="Scenariusz inflacji">${Object.entries(CPI_PRESETS).map(([k,v])=>`<button type="button" class="chip" data-psc="${k}" aria-pressed="${s.sc===k}">${v.label}</button>`).join("")}</div></div>
      </div>
    </div>
    <div id="p-out"></div>
  </div>`;
  main.querySelectorAll("[data-pk]").forEach(el=>{const o=s.pos[+el.dataset.pi],k=el.dataset.pk;
    if(k==="code")el.addEventListener("change",()=>{o.code=el.value;renderPortfolio(main)});
    else el.addEventListener("input",()=>{o[k]=el.value;pfRecompute()})});
  main.querySelectorAll("button[data-pdel]").forEach(b=>b.addEventListener("click",()=>{s.pos.splice(+b.dataset.pdel,1);renderPortfolio(main)}));
  $("#p-add").addEventListener("click",()=>{const c=pfNext(s);if(c&&s.pos.length<PF_MAX){s.pos.push({code:c,n:10,pd:1});renderPortfolio(main)}});
  $("#p-bd").addEventListener("input",e=>{s.bd=e.target.value;pfRecompute()});
  main.querySelectorAll("button.chip[data-pacc]").forEach(b=>b.addEventListener("click",()=>{s.acc=b.dataset.pacc;renderPortfolio(main)}));
  main.querySelectorAll("button.chip[data-psc]").forEach(b=>b.addEventListener("click",()=>{s.sc=b.dataset.psc;renderPortfolio(main)}));
  calcBindTips(main.querySelector(".calc-grid"));
  pfRecompute();
}
function pfRecompute(){
  const out=$("#p-out");if(!out)return;const s=state.pf,now=pfNow();
  try{history.replaceState(null,"","#"+pfHash(s))}catch(e){}
  const errs=[];
  if(!s.pos.length)errs.push("Dodaj co najmniej jedną serię.");
  s.pos.forEach((o,i)=>{if(!(Math.floor(+o.n)>=1))errs.push(`Seria ${i+1}: podaj liczbę sztuk.`);if(!calcDayOk(o.pd))errs.push(`Seria ${i+1}: dzień zakupu od 1 do 31.`)});
  if(!(calcDayOk(s.bd)&&+s.bd<=calcDaysIn(now)))errs.push(`Dzień wyceny: od 1 do ${calcDaysIn(now)}.`);
  if(errs.length){out.innerHTML=`<div class="insight warn"><span class="t">uzupełnij dane</span>${errs.map(esc).join("<br>")}</div>`;return}
  let r;try{r=Zamiana.holdings(pfParams(s))}catch(e){out.innerHTML=`<div class="insight warn"><span class="t">błąd</span>${esc(e.message)}</div>`;return}
  const pd=i=>+s.pos[i].pd||1,live=r.items.map((x,i)=>Object.assign(x,{i,code:s.pos[i].code})).filter(x=>!x.matured&&!x.error);
  const done=r.items.filter(x=>x.matured);
  const sum=k=>live.reduce((a,x)=>a+x[k],0),gross=sum("gross"),pay=sum("payout"),fee=sum("fee"),tx=sum("breakTax"),mat=sum("atMaturity"),paid=sum("couponsPaid");
  const tax=s.acc==="std",lastMat=live.map(x=>x.maturity).sort().pop(),anyGuess=live.some(x=>!x.maturityKnown);
  // najbliższe zdarzenia (12 miesięcy): kupony, nowe oprocentowanie, wykupy
  const ev=[];const within=ym=>Zamiana.monthsBetween(now,ym)<=12;
  for(const x of live){const t=x.spec.type,nbp=calcIsNbp(t);
    if(within(x.maturity))ev.push({ym:x.maturity,d:pd(x.i),code:x.code,kind:"wykup",text:`wykup w terminie: ok. ${zl0(x.atMaturity)}${tax?" na rękę (po podatku)":""}`});
    if(x.coupon&&x.coupon.ym!==x.maturity&&within(x.coupon.ym))ev.push({ym:x.coupon.ym,d:pd(x.i),code:x.code,kind:"kupon",text:`${nbp?"odsetki za miesiąc":"kupon"}: ${zl2(x.coupon.net)}${tax?" na rękę":""} (${pfPct(x.rateNow)})${nbp?" — dalej co miesiąc":""}`});
    if(x.next&&within(x.next.start)){const n=x.next;const why=nbp?`stopa NBP ${fmt(n.basis)}% + marża ${fmt(x.spec.margin)} p.p.${n.known?"":" — jeśli stopa się nie zmieni"}`:
        t==="TOS"||t==="OTS"?"stałe":(n.known?`inflacja za ${mShort(n.basisMonth)}: ${fmt(Math.max(n.basis,0),1)}% + marża ${fmt(x.spec.margin)} p.p.`:`prognoza: inflacja ${fmt(CPI_PRESETS[s.sc].v,1)}% + marża ${fmt(x.spec.margin)} p.p. (GUS poda odczyt za ${mShort(n.basisMonth)})`);
      if(Math.abs(n.rate-x.rateNow)>1e-9||!nbp)ev.push({ym:n.start,d:pd(x.i),code:x.code,kind:"stopa",text:`od tego dnia ${pfPct(n.rate)} zamiast ${pfPct(x.rateNow)} (${why})`});}}
  ev.sort((a,b)=>a.ym===b.ym?a.d-b.d:a.ym<b.ym?-1:1);
  const evHtml=ev.length?`<ul class="evlist">${ev.map(e=>`<li><span class="num"><b>${pfDate(e.ym,e.d)}</b></span> <b>${esc(e.code)}</b> — ${esc(e.text)}</li>`).join("")}</ul>`:`<p class="small">W ciągu 12 miesięcy nie ma kuponów, wykupów ani zmian oprocentowania.</p>`;
  const first=ev[0],calcH=pfCalcHash(s);
  out.innerHTML=`<div class="vlist">
    <div class="stats">
      <div class="stat t-acc"><span class="k">Wartość ${s.bd==calcDefaultBreakDay()?"dziś":"na "+pfDate(now,s.bd)}${calcTip("pgross")}</span><span class="v">${zl0(gross)}</span><span class="s">z narosłymi odsetkami, przed opłatą i podatkiem${paid>0.005?`; do tego odsetki wypłacone dotąd: <b>${zl0(paid)}</b>`:""}</span></div>
      <div class="stat t-green"><span class="k">Na rękę po zerwaniu${calcTip("ppay")}</span><span class="v v-green">${zl0(pay)}</span><span class="s">opłaty ${zl0(fee)}${tax?`, podatek ${zl0(tx)}`:" (bez podatku)"} — koszt zerwania <b>${zl0(gross-pay)}</b></span></div>
      <div class="stat t-gold"><span class="k">Przy wykupie w terminie${calcTip("pmat")}</span><span class="v">${zl0(mat)}</span><span class="s">${live.length>1?`ostatni wykup ${mShort(lastMat)}`:`wykup ${lastMat?mShort(lastMat):"–"}`}${anyGuess?` · prognoza przy inflacji ${fmt(CPI_PRESETS[s.sc].v,1)}%`:""}${tax?" · po podatku":""}</span></div>
      <div class="stat t-red"><span class="k">Najbliższe zdarzenie</span><span class="v sm">${first?pfDate(first.ym,first.d):"–"}</span><span class="s">${first?`<b>${esc(first.code)}</b> — ${esc({wykup:"wykup w terminie",kupon:"wypłata odsetek",stopa:"nowe oprocentowanie"}[first.kind])}`:"brak w ciągu roku"}</span></div>
    </div>
    ${done.length?`<div class="insight warn"><span class="t">po terminie wykupu</span>${done.map(x=>esc(s.pos[r.items.indexOf(x)].code)).join(", ")} — wykupione ${done.length===1?"w":"przed"} ${esc(mLabel(now))}; nie liczymy ${done.length===1?"jej":"ich"} do sumy.</div>`:""}
    <div class="card table-card"><div class="tc-head"><h3>Serie</h3><p class="desc">${tax?"Kwoty po podatku Belki tam, gdzie wypłata jest opodatkowana.":"Bez podatku Belki (IKE / IKZE)."} Wiersz „wykup w terminie” to prognoza tam, gdzie oprocentowanie kolejnych okresów nie jest jeszcze znane.</p></div>
      <div class="frame"><table><thead><tr><th>Seria</th><th class="r">Szt.</th><th>Zakup</th><th>Wykup</th><th>Oprocentowanie${calcTip("prate",1)}</th><th class="r">Wartość${calcTip("pgross",1)}</th><th class="r">Na rękę po zerwaniu${calcTip("ppay",1)}</th><th class="r">Wykup w terminie${calcTip("pmat",1)}</th></tr></thead><tbody>
      ${live.map(x=>`<tr><td><span class="dot" style="background:var(--s-${x.spec.type})"></span><span class="code">${esc(x.code)}</span></td><td class="r num">${x.spec.count}</td><td>${pfDate(x.spec.purchase,pd(x.i))}</td><td>${pfDate(x.maturity,pd(x.i))}<br><span class="small">za ${pfIn(x.monthsToMaturity)}</span></td>
        <td><b>${pfPct(x.rateNow)}</b><br><span class="small">${Zamiana.TYPES[x.spec.type].term>(calcIsNbp(x.spec.type)?1:12)&&x.next?`do ${pfDate(x.periodEnd,pd(x.i))}`:"do wykupu"}</span></td>
        <td class="r num">${zl2(x.gross)}${x.couponsPaid>0.005?`<br><span class="small">+ wypłacone ${zl0(x.couponsPaid)}</span>`:""}</td><td class="r num"><b>${zl2(x.payout)}</b><br><span class="small">${x.fee>0?`opłata ${zl2(x.fee)}`:"bez opłaty"}${x.breakTax>0?`, podatek ${zl2(x.breakTax)}`:""}</span></td>
        <td class="r num">${zl0(x.atMaturity)}${x.maturityKnown?"":`<br><span class="small">prognoza</span>`}</td></tr>`).join("")}
      ${live.length>1?`<tr class="sum"><td><b>Razem</b></td><td class="r num">${live.reduce((a,x)=>a+x.spec.count,0)}</td><td></td><td></td><td></td><td class="r num"><b>${zl2(gross)}</b></td><td class="r num"><b>${zl2(pay)}</b></td><td class="r num"><b>${zl0(mat)}</b></td></tr>`:""}
      </tbody></table></div></div>
    <div class="card"><h3>Najbliższe 12 miesięcy <small>kupony, nowe oprocentowanie, wykupy</small></h3>${evHtml}</div>
    <div class="row"><a class="btn" id="p-calc" href="#${esc(calcH)}">Czy opłaca się zamienić te serie na nowe? → kalkulator zamiany</a>${s.pos.length>CALC_MAXPOS?`<span class="small">(pierwsze ${CALC_MAXPOS} serii)</span>`:""}</div>
    <details class="how"><summary>Jak to policzono</summary><ul>
      <li>Wartość na ${esc(pfDate(now,s.bd))}: 100 zł × kolejne okresy odsetkowe (kapitalizacja roczna w EDO, ROS, ROD, TOS) plus odsetki narosłe w bieżącym okresie, liczone od dnia zakupu co do dnia. W COI, ROR i DOR odsetki z zakończonych okresów zostały już wypłacone („wypłacone dotąd” — po podatku, bez oprocentowania).</li>
      <li>Na rękę po zerwaniu: wartość minus opłata za przedterminowy wykup (nie wyższa niż narosłe odsetki — wypłata nie mniej niż 100 zł za sztukę; ROR i DOR od 2. miesiąca: stała opłata; OTS: 100 zł bez odsetek)${tax?", minus 19% podatku od zysku":"; w IKE / IKZE bez podatku (przy wypłacie z konta opłata za wykup nie jest pobierana — tu pokazujemy zerwanie w ramach konta)"}.</li>
      <li>Oprocentowanie z listów emisyjnych. Od 2. okresu: inflacja ogłoszona w miesiącu przed okresem (odczyt GUS za P−2) + marża; ROR i DOR — stopa referencyjna NBP + marża. Odczyty do ${mShort(state.months[state.months.length-1].cpiRefMonth||now)} z archiwum, dalej scenariusz: inflacja ${fmt(CPI_PRESETS[s.sc].v,1)}%, stopa NBP ${fmt(calcNbpNow())}% (bez zmian).</li>
      <li>Wykup w terminie: wartość końcowa (COI, ROR, DOR: 100 zł + ostatnie odsetki)${tax?" po podatku":""}; bez zamiany na nowe obligacje i bez odsetek wypłaconych wcześniej.</li>
      <li>To wycena orientacyjna, nie wyciąg z rachunku. Wiążące są listy emisyjne i dane w serwisie, w którym kupiłeś obligacje.</li>
    </ul></details>
    ${calcShareHtml}
  </div>`;
  $("#p-calc").addEventListener("click",e=>{e.preventDefault();state.calc=null;try{history.replaceState(null,"","#"+calcH)}catch(_){}state.view="zamiana";
    document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.view==="zamiana")));render();scrollTo(0,0)});
  calcBindShare();calcBindTips(out);
}
