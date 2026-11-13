/* Rejestr ofert obligacji — widok Kalkulator zamiany (formularz, wynik, wykres); obliczenia w js/zamiana.js. Ładowany przez index.html (bez kroku budowania). */
/* ===================== Kalkulator zamiany ===================== */
const CALC_ACC=[["std","Zwykły (podatek Belki)"],["ike","IKE"],["ikze","IKZE"]];
const CALC_ACC_NOTE={std:"Podatek 19% od zysku przy zerwaniu, wykupie i od odsetek.",
  ike:"W IKE bez podatku Belki (przy wypłacie po 60. roku życia). Opłata za zerwanie w ramach konta zostaje.",
  ikze:"W IKZE bez podatku Belki; przy wypłacie po 65. roku życia 10% ryczałtu od całej kwoty — wartości są po tym podatku. Opłata za zerwanie w ramach konta zostaje."};
const calcTaxTxt=c=>({std:"po podatku Belki",ike:"bez podatku (IKE)",ikze:"w IKZE: bez podatku Belki, po 10% ryczałcie przy wypłacie"})[c.acc||"std"];
const calcLiqTxt=c=>c.ike?`(wypłata z ${c.acc==="ikze"?"IKZE — bez opłaty za wykup, po 10% ryczałcie":"IKE — bez opłaty za wykup i bez podatku"})`:"(po opłacie i podatku)";
const CALC_TYPES=["EDO","COI","TOS","ROS","ROD","DOR","ROR","OTS"];
// cena zamiany przy wykupie w terminie zależy od kupowanej serii (OTS 100,00 zł, pozostałe 99,90 zł)
const calcSwapPrice=t=>Zamiana.TYPES[t]?.swapPrice||99.9;
const calcSwapTxt=t=>fmt(calcSwapPrice(t))+" zł";
const calcUsesOts=c=>c.pos.some(o=>o.type==="OTS")||c.tt==="OTS";
const calcIsNbp=t=>!!Zamiana.TYPES[t]?.nbp;
const calcR1Label=t=>t==="OTS"?"Oprocentowanie":calcIsNbp(t)?"1. miesiąc":"1. rok";
const calcNbpNow=()=>state.months[state.months.length-1].nbpRef??0;
// czy w wyliczeniu jest ROR/DOR (pokazujemy wtedy scenariusz stopy NBP)
const calcUsesNbp=c=>c.pos.some(o=>calcIsNbp(o.type))||calcIsNbp(c.tt);
const CPI_PRESETS={base:{label:"Bazowy 2,5%",v:2.5},high:{label:"Wysoka inflacja 5%",v:5},low:{label:"Niska inflacja 1,5%",v:1.5}};
const zl0=v=>v==null||isNaN(v)?"–":Math.round(v).toLocaleString("pl-PL")+" zł";
const zl2=v=>v==null||isNaN(v)?"–":Number(v).toLocaleString("pl-PL",{minimumFractionDigits:2,maximumFractionDigits:2})+" zł";
const sgn=(v,f=zl0)=>(v>0?"+":v<0?"−":"")+f(Math.abs(v));
// „dziś” kalkulatora = miesiąc zerwania (domyślnie ostatni miesiąc archiwum; można wybrać przeszły lub przyszły)
const calcArchiveNow=()=>state.months[state.months.length-1].id;
const calcNow=()=>state.calc?.dm||calcArchiveNow();
const calcIsToday=()=>calcNow()===calcArchiveNow();
// słowa zależne od daty zerwania: „dziś” tylko wtedy, gdy zerwanie jest w bieżącym miesiącu archiwum
const calcD=()=>calcIsToday()?"dziś":"w dniu zerwania";
const calcDo=()=>calcIsToday()?"do dziś":"do dnia zerwania";
const calcRealTxt=()=>calcIsToday()?"w dzisiejszych złotych":"w złotych z dnia zerwania";
// oferta z miesiąca zerwania; dla miesiąca spoza archiwum (przyszłość) — ostatnia znana oferta
const calcOfferRec=ym=>state.raw[ym]?Object.assign({id:ym},state.raw[ym]):state.months[state.months.length-1];
const calcPre=()=>state.pre||{cpi:{values:{}},series:{}};
// historia CPI: odczyty sprzed 2019 r. (data/przed-2019.json) + archiwum miesięcy (ma pierwszeństwo)
function calcCpiHist(){return Object.assign({},calcPre().cpi?.values||{},Zamiana.cpiHistoryFromMonths(state.raw))}
// najwcześniejszy miesiąc zakupu, dla którego mamy CPI do wszystkich okresów (odczyt za P−2 od 2. roku)
function calcMinPurchase(){const k=Object.keys(calcCpiHist()).sort()[0]||"2018-12";return k<"2019-01"?Zamiana.addMonths(k,-10):"2019-01"}
function calcOptions(now=calcNow()){
  const out={};
  const pre=Object.entries(calcPre().series||{}).sort((a,b)=>a[1].purchase<b[1].purchase?-1:1);
  const rows=pre.map(([code,s])=>({id:s.purchase,series:{[s.type]:Object.assign({code},s)}})).concat(state.months);
  for(const m of rows)for(const t of CALC_TYPES){const s=m.series?.[t];if(!s||!s.code)continue;
    const info=Zamiana.parseCode(s.code);if(!info)continue;const age=Zamiana.monthsBetween(info.purchase,now);
    if(age<1||age>=Zamiana.TYPES[t].term)continue;(out[t]=out[t]||[]).push(s.code)}
  for(const t in out)out[t].reverse();
  return out;
}
function calcTargetFromOffer(t,ym){const s=calcOfferRec(ym||calcNow()).series?.[t];return s?{tt:t,tr1:s.rate1,tm:s.margin??0,tf:typeof s.fee==="number"?s.fee:0,tcode:s.code}:null}
function calcFromCode(code){const a=Zamiana.seriesFromArchive(state.raw,code);
  if(a&&a.found)return {code,type:a.type,p:a.purchase,r1:a.rate1,m:a.margin,f:a.fee};
  const s=(calcPre().series||{})[String(code||"").toUpperCase()];
  return s?{code:String(code).toUpperCase(),type:s.type,p:s.purchase,r1:s.rate1,m:s.margin,f:s.fee}:null}
const CALC_MAXPOS=8;
// dzień zerwania domyślnie: dziś, jeśli archiwum ma rekord bieżącego miesiąca; inaczej ostatni dzień miesiąca „dziś”
function calcDefaultBreakDay(){const d=new Date(),ym=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"),now=calcArchiveNow();return ym===now?d.getDate():calcDaysIn(now)}
const calcDaysIn=ym=>{const [y,m]=ym.split("-").map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate()};
const calcDayOk=v=>Number.isInteger(+v)&&+v>=1&&+v<=31;
function calcPosDefault(code){return Object.assign({n:100,pd:1},calcFromCode(code)||{code:"",type:"EDO",p:Zamiana.addMonths(calcNow(),-24),r1:6,m:1.5,f:2})}
function calcDefaults(){
  const opts=calcOptions();const now=calcNow();
  const pick=(opts.EDO||[]).find(c=>Zamiana.monthsBetween(Zamiana.parseCode(c).purchase,now)>=24)||(opts.EDO||[])[0]||Object.values(opts).flat()[0];
  return Object.assign({pos:[calcPosDefault(pick)],h:"m",val:"hold",sc:"base",tc:false,cpi:Array(12).fill(2.5),sv:4,acc:"std",ike:false,nbp:calcNbpNow(),bd:calcDefaultBreakDay()},calcTargetFromOffer("EDO")||{tt:"EDO",tr1:5,tm:2,tf:3});
}
// propozycja kolejnej serii do portfela: najpierw typ, którego jeszcze nie ma, co najmniej rok po zakupie
function calcNextCode(c){
  const opts=calcOptions(),now=calcNow(),used=new Set(c.pos.map(o=>o.code)),types=new Set(c.pos.map(o=>o.type));
  const all=CALC_TYPES.flatMap(t=>opts[t]||[]).filter(x=>!used.has(x));
  const age=x=>Zamiana.monthsBetween(Zamiana.parseCode(x).purchase,now);
  return all.find(x=>!types.has(Zamiana.parseCode(x).type)&&age(x)>=12)||all.find(x=>age(x)>=12)||all[0]||"";
}
function calcFromHash(){
  const parts=(location.hash||"").slice(1).split("&");if(parts[0]!=="zamiana"||parts.length<2)return null;
  const q=Object.fromEntries(parts.slice(1).map(x=>x.split("=").map(decodeURIComponent)));const c=calcDefaults();
  const num=(k,d)=>q[k]!=null&&q[k]!==""&&!isNaN(+q[k])?+q[k]:d;
  if(q.pf){
    // portfel: pozycje po przecinku; KOD~sztuki albo TYP~RRRR-MM~1.rok~marża~opłata~sztuki
    const pos=[];
    for(const it of q.pf.split(",")){if(pos.length>=CALC_MAXPOS)break;const f=it.split("~"),n=+f[f.length-1];if(!(n>=1))continue;
      const pd=f.length===3||f.length===7?+f[f.length-1]:1,n2=f.length===3||f.length===7?+f[f.length-2]:n;
      if(f.length===3||f.length===7){if(!(n2>=1)||!calcDayOk(pd))continue;f.pop();}
      if(f.length===2){const a=calcFromCode(f[0]);if(a)pos.push(Object.assign({n:n2,pd},a));}
      else if(f.length===6&&CALC_TYPES.includes(f[0])&&/^\d{4}-\d{2}$/.test(f[1])&&f.slice(2,5).every(v=>v!==""&&!isNaN(+v)))pos.push({code:"",type:f[0],p:f[1],r1:+f[2],m:+f[3],f:+f[4],n:n2,pd});}
    if(pos.length)c.pos=pos;
  }else{
    const o=c.pos[0];
    if(q.k){const a=calcFromCode(q.k);if(a)Object.assign(o,a);else o.code="";}else o.code="";
    if(!o.code){if(q.t&&CALC_TYPES.includes(q.t))o.type=q.t;if(q.p&&/^\d{4}-\d{2}$/.test(q.p))o.p=q.p;
      o.r1=num("r1",o.r1);o.m=num("m",o.m);o.f=num("f",o.f);}
    o.n=num("n",o.n);if(calcDayOk(q.pd))o.pd=+q.pd;
  }
  if(q.dm&&/^\d{4}-(0[1-9]|1[0-2])$/.test(q.dm)&&q.dm!==calcArchiveNow()){c.dm=q.dm;if(!c.tc)Object.assign(c,calcTargetFromOffer(c.tt,c.dm)||{})}
  c.cm=q.cm==="s"?"s":"a";
  c.tc=q.tc==="1";
  if(q.tt&&CALC_TYPES.includes(q.tt)){const o=calcTargetFromOffer(q.tt,c.dm);if(o&&!c.tc)Object.assign(c,o);else c.tt=q.tt;}
  if(c.tc){c.tr1=num("tr1",c.tr1);c.tm=num("tm",c.tm);c.tf=num("tf",c.tf);}
  if(q.rr1!=null&&q.rr1!==""&&!isNaN(+q.rr1))c.rr1=+q.rr1;
  c.h=q.h==="m"?"m":num("h",c.h);c.val=q.val==="l"?"liquidate":"hold";c.sv=num("sv",c.sv);c.acc=q.ike==="1"?"ike":q.ike==="2"?"ikze":"std";c.ike=c.acc!=="std";c.nbp=num("nbp",c.nbp);if(calcDayOk(q.bd))c.bd=Math.min(+q.bd,calcDaysIn(calcNow()));
  if(q.sc&&(CPI_PRESETS[q.sc]||q.sc==="custom"))c.sc=q.sc;
  if(q.cpi){const a=q.cpi.split(",").map(Number).filter(v=>!isNaN(v));if(a.length)c.cpi=Array.from({length:12},(_,i)=>a[Math.min(i,a.length-1)]);}
  return c;
}
function calcHash(c){
  const q={};
  if(c.pos.length>1)q.pf=c.pos.map(o=>(o.code?[o.code,o.n]:[o.type,o.p,o.r1,o.m,o.f,o.n]).concat(+o.pd!==1?[o.pd]:[]).join("~")).join(",");
  else{const o=c.pos[0];Object.assign(q,o.code?{k:o.code}:{t:o.type,p:o.p,r1:o.r1,m:o.m,f:o.f},{n:o.n});if(+o.pd!==1)q.pd=o.pd;}
  q.tt=c.tt;q.bd=c.bd;if(c.dm&&c.dm!==calcArchiveNow()){q.dm=c.dm;if(c.cm==="s"&&c.dm<calcArchiveNow())q.cm="s"}
  if(c.tc)Object.assign(q,{tc:1,tr1:c.tr1,tm:c.tm,tf:c.tf});if(calcRollR1Set(c))q.rr1=c.rr1;Object.assign(q,{h:c.h,sv:c.sv,sc:c.sc,ike:{std:0,ike:1,ikze:2}[c.acc]});if(c.val==="liquidate")q.val="l";
  if(c.sc==="custom")q.cpi=c.cpi.join(",");
  if(calcUsesNbp(c))q.nbp=c.nbp;
  return "zamiana&"+Object.entries(q).map(([k,v])=>k+"="+encodeURIComponent(v).replace(/%2C/g,",")).join("&");
}
function calcCpiPath(c){return c.sc==="custom"?c.cpi.slice():[CPI_PRESETS[c.sc].v]}
// tryb „tylko scenariusz” dla zerwania w przeszłości: odczyty znane w dniu decyzji (CPI do M−1, stopa NBP do M)
function calcHistKnown(h,c,lag){if(c.cm!=="s"||calcIsToday())return h;const lim=Zamiana.addMonths(calcNow(),lag);return Object.fromEntries(Object.entries(h).filter(([k])=>k<=lim))}
const calcSpec=o=>({type:o.type,rate1:+o.r1,margin:+o.m,fee:+o.f,purchase:o.p,count:Math.floor(+o.n),purchaseDay:+o.pd||1});
// oprocentowanie 1. okresu obligacji kupowanych w przyszłości (przy wykupie w terminie); puste = jak seria docelowa
const calcRollR1Set=c=>c.tt!=="OTS"&&c.rr1!=null&&c.rr1!==""&&!isNaN(+c.rr1);
const calcRollR1=c=>calcRollR1Set(c)?+c.rr1:+c.tr1;
function calcParams(c,o){
  return {now:calcNow(),horizonMonths:c.h==="m"?undefined:Math.round(c.h*12),valuation:c.val,
    old:o?calcSpec(o):undefined,positions:o?undefined:c.pos.map(calcSpec),
    target:{type:c.tt,rate1:+c.tr1,margin:+c.tm,fee:+c.tf},
    rollover:{type:c.tt,rate1:calcRollR1(c),margin:+c.tm,fee:+c.tf},
    cpiHistory:calcHistKnown(calcCpiHist(),c,-1),cpiFuture:calcCpiPath(c),savingsRate:+c.sv,tax:!c.ike,withdrawalTax:c.acc==="ikze"?0.1:0,
    nbpHistory:calcHistKnown(Zamiana.nbpHistoryFromMonths(state.raw),c,0),nbpFuture:+c.nbp,breakDay:+c.bd};
}
const calcMaturity=o=>/^\d{4}-\d{2}$/.test(o.p||"")?Zamiana.addMonths(o.p,Zamiana.TYPES[o.type].term):null;
const calcPosCode=o=>o.code||o.type+" z "+mShort(o.p);
function calcValidate(c){
  const now=calcNow();const errs=[];const multi=c.pos.length>1;
  c.pos.forEach((o,i)=>{const pre=multi?`Seria ${i+1}${o.code?" ("+o.code+")":""}: `:"";const e=[];
    if(!(Math.floor(+o.n)>=1))e.push("Podaj liczbę obligacji (co najmniej 1).");
    if(!calcDayOk(o.pd))e.push("Dzień zakupu: liczba od 1 do 31.");
    if(!/^\d{4}-\d{2}$/.test(o.p||""))e.push("Podaj miesiąc zakupu.");
    else{const age=Zamiana.monthsBetween(o.p,now);if(age<1)e.push("Miesiąc zakupu musi być wcześniejszy niż "+mLabel(now)+".");
      else if(age>=Zamiana.TYPES[o.type].term)e.push("Te obligacje są już po terminie wykupu — nie ma czego zrywać.");
      else if(o.p<calcMinPurchase())e.push("Historia inflacji GUS w kalkulatorze pozwala liczyć obligacje kupione od "+mLabel(calcMinPurchase())+".");}
    for(const [k,l] of [["r1","oprocentowanie "+(calcIsNbp(o.type)?"1. miesiąca":"1. roku")],["f","opłatę za wykup"]])if(o[k]===""||isNaN(+o[k]))e.push("Uzupełnij "+l+".");
    e.forEach(x=>errs.push(pre+x));});
  for(const [k,l] of [["tr1","oprocentowanie nowej serii"],["tf","opłatę nowej serii"],["sv","oprocentowanie konta"]])if(c[k]===""||isNaN(+c[k]))errs.push("Uzupełnij "+l+".");
  if(c.h!=="m"&&!(+c.h>=1&&+c.h<=30))errs.push("Horyzont: od 1 do 30 lat.");
  if(c.dm&&c.dm<"2019-02")errs.push("Miesiąc zerwania: najwcześniej luty 2019.");
  if(!(calcDayOk(c.bd)&&+c.bd<=calcDaysIn(now)))errs.push("Dzień zerwania: od 1 do "+calcDaysIn(now)+".");
  if(calcUsesNbp(c)&&(c.nbp===""||isNaN(+c.nbp)))errs.push("Uzupełnij przyszłą stopę NBP.");
  return errs;
}
function selOpts(list,cur){return list.map(([v,l])=>`<option value="${esc(v)}"${String(v)===String(cur)?" selected":""}>${esc(l)}</option>`).join("")}
function renderCalc(main){
  if(!state.calc)state.calc=calcFromHash()||calcDefaults();
  const c=state.calc,now=calcNow(),opts=calcOptions(),offer=calcOfferRec(now),multi=c.pos.length>1,today=calcIsToday(),past=now<calcArchiveNow();
  const codeOpts=cur=>CALC_TYPES.filter(t=>opts[t]).map(t=>`<optgroup label="${t}">${selOpts(opts[t].map(x=>[x,x+" · zakup "+mShort(Zamiana.parseCode(x).purchase)]),cur)}</optgroup>`).join("");
  const targets=CALC_TYPES.filter(t=>offer.series?.[t]).map(t=>[t,offer.series[t].code+" · "+Zamiana.TYPES[t].label]);
  const mats=c.pos.map(calcMaturity).filter(Boolean).sort(),matYm=mats[mats.length-1]||null;
  const hMonths=c.h==="m"?(matYm?Math.max(1,Zamiana.monthsBetween(now,matYm)):120):+c.h*12;
  const yrs=Math.min(12,Math.max(1,Math.ceil((hMonths||12)/12)));
  const posHtml=(o,i)=>{
    const lock=o.code?" disabled":"",a=`data-pi="${i}"`;
    const sel=`<label class="field"><span class="flabel">Seria z archiwum${calcTip("code")}</span><span class="sel"><select ${a} data-pk="code"><option value=""${o.code?"":" selected"}>— inna, wpiszę ręcznie —</option>${codeOpts(o.code)}</select></span>${multi?"":'<span class="fnote" id="z-code-note"></span>'}</label>`;
    const nF=`<label class="field"><span class="flabel">Liczba sztuk${calcTip("n")}</span><input ${a} data-pk="n" type="number" min="1" step="1" inputmode="numeric" value="${esc(o.n)}"></label>`;
    const dF=`<label class="field"><span class="flabel">Dzień zakupu${calcTip("pd")}</span><input ${a} data-pk="pd" type="number" min="1" max="31" step="1" inputmode="numeric" value="${esc(o.pd)}"></label>`;
    const typeF=`<label class="field"><span class="flabel">Typ${calcTip("type")}</span><span class="sel"><select ${a} data-pk="type"${lock}>${selOpts(CALC_TYPES.map(t=>[t,t]),o.type)}</select></span></label>`;
    const pF=`<label class="field wide"><span class="flabel">Miesiąc zakupu${calcTip("p")}</span><input ${a} data-pk="p"${lock} type="month" min="${calcMinPurchase()}" max="${Zamiana.addMonths(now,-1)}" value="${esc(o.p)}"></label>`;
    const parF=`<div class="frow"><label class="field"><span class="flabel">${calcR1Label(o.type)}, %${calcTip("r1")}</span><input ${a} data-pk="r1"${lock} type="number" step="0.01" inputmode="decimal" value="${esc(o.r1)}"></label>
          <label class="field"><span class="flabel">Marża, p.p.${calcTip("m")}</span><input ${a} data-pk="m"${lock} type="number" step="0.01" inputmode="decimal" value="${esc(o.m)}"></label>
          <label class="field"><span class="flabel">Opłata, zł/szt.${calcTip("f")}</span><input ${a} data-pk="f"${lock} type="number" step="0.1" inputmode="decimal" value="${esc(o.f)}"></label></div>`;
    if(!multi)return `${sel}<div class="frow">${nF}${typeF}${pF}${dF}</div>${parF}`;
    const mat=calcMaturity(o);
    return `<div class="pos"><div class="pos-head"><b>${i+1}. ${esc(o.code||"seria wpisana ręcznie")}</b><button type="button" class="pos-del" data-del="${i}" aria-label="Usuń serię ${i+1} z portfela">usuń</button></div>
      <div class="pos-row">${sel}${nF.replace("Liczba sztuk","Szt.")}${dF.replace("Dzień zakupu","Dzień")}</div>
      ${o.code?`<span class="fnote">zakup ${mShort(o.p)} · wykup ${mat?mShort(mat):"–"} · ${calcR1Label(o.type)} ${fmt(o.r1)}% · marża ${fmt(o.m)} p.p. · ${o.type==="OTS"?"przy zerwaniu bez odsetek":`opłata ${fmt(o.f)} zł/szt.`} (z listu emisyjnego)</span>`:`<div class="frow">${typeF}${pF}</div>${parF}`}</div>`;
  };
  main.innerHTML=`<div class="vlist">
    <div class="sec-head"><div><p class="kicker">§ 4 · kalkulator zamiany</p><h2>Zerwać i kupić nowe, czy <span class="acc">trzymać</span>?</h2><p class="desc">Porównuje dwa scenariusze na ten sam okres: <b>trzymasz</b> obecne obligacje albo <b>zrywasz je${today?" dziś":""}</b> (<span id="z-bdate">${esc(calcBreakDate(c))}</span>) i za uzyskane pieniądze kupujesz nowe z bieżącej oferty. Oprocentowanie Twojej serii ${calcDo()} liczymy z prawdziwych odczytów CPI (a dla ROR i DOR — stóp NBP) z archiwum, a dalej z Twoich założeń. Możesz dodać kilka serii naraz — kalkulator wskaże, które z nich warto zamienić.</p></div></div>
    <div class="calc-grid">
      <div class="card">
        <h3>Twoje obligacje${multi?` <small>portfel · ${c.pos.length} serii</small>`:""}</h3>
        ${c.pos.map(posHtml).join("")}
        <div class="row"><button type="button" class="btn" id="z-add"${c.pos.length>=CALC_MAXPOS?" disabled":""}>+ ${multi?"dodaj kolejną serię":"dodaj serię (portfel)"}</button>${multi?`<span class="small">do ${CALC_MAXPOS} serii; każda liczona osobno</span>`:""}</div>
      </div>
      <div class="card">
        <h3>Na co zamieniasz <small>oferta ${esc(mLabel(offer.id))}${offer.id!==now?" (ostatnia znana — założenie)":""}</small></h3>
        <label class="field"><span class="flabel">Nowa seria${calcTip("tt")}</span><span class="sel"><select id="z-tt">${selOpts(targets.concat([["custom","własne parametry (np. przyszła oferta)"]]),c.tc?"custom":c.tt)}</select></span><span class="fnote">Po zerwaniu nowe obligacje kupujesz po 100 zł (cena zamiany na ${esc(c.tt)}, ${calcSwapTxt(c.tt)}, obowiązuje tylko przy wykupie w terminie).</span></label>
        <div class="frow">
          ${c.tc?`<label class="field"><span class="flabel">Typ${calcTip("type")}</span><span class="sel"><select id="z-ttype">${selOpts(CALC_TYPES.map(t=>[t,t]),c.tt)}</select></span></label>`:""}
          <label class="field"><span class="flabel">${calcR1Label(c.tt)}, %${calcTip("r1")}</span><input id="z-tr1"${c.tc?"":" disabled"} type="number" step="0.01" inputmode="decimal" value="${esc(c.tr1)}"></label>
          <label class="field"><span class="flabel">Marża, p.p.${calcTip("m")}</span><input id="z-tm"${c.tc?"":" disabled"} type="number" step="0.01" inputmode="decimal" value="${esc(c.tm)}"></label>
          <label class="field"><span class="flabel">Opłata, zł/szt.${calcTip("f")}</span><input id="z-tf"${c.tc?"":" disabled"} type="number" step="0.1" inputmode="decimal" value="${esc(c.tf)}"></label>
        </div>
        ${c.tt==="OTS"?"":`<label class="field"><span class="flabel">${calcR1Label(c.tt)} przy przyszłych zakupach, %${calcTip("rr1")}</span><input id="z-rr1" type="number" step="0.01" inputmode="decimal" placeholder="jak wyżej: ${esc(fmt(+c.tr1))}" value="${esc(c.rr1??"")}"><span class="fnote">Dotyczy obligacji kupowanych później, przy wykupie w terminie (w obu wariantach). Puste = jak nowa seria; oferta za kilka lat może być inna.</span></label>`}
      </div>
      <div class="card">
        <h3>Założenia na przyszłość</h3>
        <div class="frow">
          <label class="field wide"><span class="flabel">Porównaj${calcTip("h")}</span><span class="sel"><select id="z-h">${selOpts([["m",(multi?"do wykupu ostatniej serii":"do wykupu starej serii")+(matYm?" ("+mShort(matYm)+")":"")]].concat([1,2,3,4,5,6,7,8,9,10,12,15,20].map(y=>[y,"po "+y+(y===1?" roku":" latach")])),c.h)}</select></span></label>
          <label class="field wide"><span class="flabel">Miesiąc zerwania${today?" (dziś)":""}${calcTip("dm")}</span><input id="z-dm" type="month" min="2019-02" max="${Zamiana.addMonths(calcArchiveNow(),60)}" value="${esc(now)}"></label>
          <label class="field"><span class="flabel">Dzień zerwania${calcTip("bd")}</span><input id="z-bd" type="number" min="1" max="${calcDaysIn(now)}" step="1" inputmode="numeric" value="${esc(c.bd)}"></label>
          <label class="field"><span class="flabel">Konto na resztę, %${calcTip("sv")}</span><input id="z-sv" type="number" step="0.1" inputmode="decimal" value="${esc(c.sv)}"></label>
          ${calcUsesNbp(c)?`<label class="field"><span class="flabel">Stopa NBP dalej, %${calcTip("nbp")}</span><input id="z-nbp" type="number" step="0.25" min="0" inputmode="decimal" value="${esc(c.nbp)}"></label>`:""}
        </div>
        <div class="field"><span class="flabel">Inflacja (CPI r/r)${calcTip("cpi")}</span>
          <div class="chips" role="group" aria-label="Scenariusz inflacji">${Object.entries(CPI_PRESETS).map(([k,v])=>`<button type="button" class="chip" data-sc="${k}" aria-pressed="${c.sc===k}">${v.label}</button>`).join("")}<button type="button" class="chip" data-sc="custom" aria-pressed="${c.sc==="custom"}">Własna, rok po roku</button></div>
        </div>
        ${past?`<div class="field"><span class="flabel">Inflacja i stopa NBP po ${mShort(now)}${calcTip("cm")}</span><div class="chips" role="group" aria-label="Dane po dacie zerwania"><button type="button" class="chip" data-cm="a" aria-pressed="${c.cm!=="s"}">rzeczywiste z archiwum, dalej scenariusz</button><button type="button" class="chip" data-cm="s" aria-pressed="${c.cm==="s"}">tylko scenariusz (stan wiedzy z ${mShort(now)})</button></div></div>`:""}
        ${c.sc==="custom"?`<div class="cpi-years">${Array.from({length:yrs},(_,i)=>`<label>rok ${i+1}<input type="number" step="0.1" data-cpi="${i}" value="${esc(c.cpi[i])}"></label>`).join("")}</div>`:""}
        <div class="field"><span class="flabel">Rachunek${calcTip("acc")}</span>
          <div class="chips" role="group" aria-label="Rachunek">${CALC_ACC.map(([k,l])=>`<button type="button" class="chip" data-acc="${k}" aria-pressed="${c.acc===k}">${l}</button>`).join("")}</div>
          <span class="fnote">${CALC_ACC_NOTE[c.acc]}</span>
        </div>
        <label class="check"><input id="z-val" type="checkbox"${c.val==="liquidate"?" checked":""}> Wyceniaj jak przy wypłacie wszystkiego${c.ike?"":", z opłatą za wykup"}${calcTip("val")}</label>
      </div>
    </div>
    <div id="z-out"></div>
  </div>`;
  main.querySelectorAll("[data-pk]").forEach(el=>{const o=c.pos[+el.dataset.pi],k=el.dataset.pk;
    if(k==="code")el.addEventListener("change",()=>{o.code=el.value;if(o.code)Object.assign(o,calcFromCode(o.code));renderCalc(main)});
    else el.addEventListener(el.tagName==="SELECT"?"change":"input",()=>{o[k]=el.value;if(k==="type"){renderCalc(main);return}if(k==="p")calcHorizonLabel(c);calcRecompute()});});
  main.querySelectorAll("button[data-del]").forEach(b=>b.addEventListener("click",()=>{c.pos.splice(+b.dataset.del,1);renderCalc(main)}));
  $("#z-add").addEventListener("click",()=>{if(c.pos.length<CALC_MAXPOS){c.pos.push(calcPosDefault(calcNextCode(c)));renderCalc(main)}});
  const bind=(id,key)=>{const el=$("#"+id);el.addEventListener(el.type==="checkbox"?"change":"input",()=>{c[key]=el.type==="checkbox"?el.checked:el.value;calcRecompute()})};
  if($("#z-rr1"))$("#z-rr1").addEventListener("input",e=>{c.rr1=e.target.value;calcRecompute()});
  [["z-bd","bd"],["z-tr1","tr1"],["z-tm","tm"],["z-tf","tf"],["z-h","h"],["z-sv","sv"]].forEach(([i,k])=>bind(i,k));
  $("#z-tt").addEventListener("change",e=>{const v=e.target.value;if(v==="custom")c.tc=true;else{c.tc=false;Object.assign(c,calcTargetFromOffer(v))}renderCalc(main)});
  if($("#z-ttype"))$("#z-ttype").addEventListener("change",e=>{c.tt=e.target.value;renderCalc(main)});
  if($("#z-nbp"))$("#z-nbp").addEventListener("input",e=>{c.nbp=e.target.value;calcRecompute()});
  $("#z-h").addEventListener("change",()=>{if(c.sc==="custom")renderCalc(main)});
  $("#z-val").addEventListener("change",e=>{c.val=e.target.checked?"liquidate":"hold";calcRecompute()});
  $("#z-dm").addEventListener("change",e=>{const v=e.target.value;if(!/^\d{4}-\d{2}$/.test(v))return;c.dm=v===calcArchiveNow()?undefined:v;
    if(!c.tc){const o=calcTargetFromOffer(c.tt,v)||CALC_TYPES.map(t=>calcTargetFromOffer(t,v)).find(Boolean);if(o)Object.assign(c,o)}
    c.bd=Math.min(+c.bd||1,calcDaysIn(v));renderCalc(main)});
  main.querySelectorAll("button.chip[data-cm]").forEach(b=>b.addEventListener("click",()=>{c.cm=b.dataset.cm;renderCalc(main)}));
  main.querySelectorAll("button.chip[data-acc]").forEach(b=>b.addEventListener("click",()=>{c.acc=b.dataset.acc;c.ike=c.acc!=="std";renderCalc(main)}));
  main.querySelectorAll("button.chip[data-sc]").forEach(b=>b.addEventListener("click",()=>{if(b.dataset.sc==="custom"&&c.sc!=="custom"){const v=CPI_PRESETS[c.sc]?.v??2.5;c.cpi=Array(12).fill(v)}c.sc=b.dataset.sc;renderCalc(main)}));
  main.querySelectorAll("input[data-cpi]").forEach(el=>el.addEventListener("input",()=>{const i=+el.dataset.cpi,v=parseFloat(el.value);if(!isNaN(v)){c.cpi[i]=v;for(let j=i+1;j<12;j++)if(j>=yrs)c.cpi[j]=v;}calcRecompute()}));
  calcBindTips(main.querySelector(".calc-grid"));
  calcRecompute();
}
// etykieta „do wykupu … (MM.RRRR)” po zmianie miesiąca zakupu lub typu ręcznej serii (bez przerysowania formularza)
function calcHorizonLabel(c){const el=$("#z-h");if(!el)return;const mats=c.pos.map(calcMaturity).filter(Boolean).sort(),m=mats[mats.length-1];
  el.options[0].textContent=(c.pos.length>1?"do wykupu ostatniej serii":"do wykupu starej serii")+(m?" ("+mShort(m)+")":"")}
const calcAfter=t=>t===0?(calcIsToday()?"dziś":"zerwanie"):(t%12?fmt(t/12,1)+" roku":t/12+(t===12?" rok":[2,3,4].includes((t/12)%10)&&!(t/12>=12&&t/12<=14)?" lata":" lat"));
function calcYearTable(ms,H,events,lab){
  const rows=[];for(let t=0;t<=H;t+=12)rows.push(t);if(rows[rows.length-1]!==H)rows.push(H);
  for(const e of events)if(!rows.includes(e.t))rows.push(e.t);rows.sort((a,b)=>a-b);
  return `<div class="card table-card"><div class="frame"><table><thead><tr><th>Po</th><th>Miesiąc</th><th class="r">${esc(lab.keep)}</th><th class="r">${esc(lab.swap)}</th><th class="r">Różnica</th><th class="r">Różnica realnie${calcTip("real",1)}</th></tr></thead><tbody>
      ${rows.map(t=>{const m=ms[t];const evs=events.filter(e=>e.t===t);return `<tr${evs.length?' class="ev"':""}><td>${calcAfter(t)}${evs.map(e=>`<span class="evt"><b style="color:${e.color||"inherit"}">↻</b> ${esc(e.text)}</span>`).join("")}</td><td>${mShort(m.ym)}</td><td class="r num">${zl0(m.keep)}</td><td class="r num">${zl0(m.swap)}</td><td class="r num"><span class="${m.diff>0?"d-up":m.diff<0?"d-down":"d-0"}">${sgn(m.diff)}</span></td><td class="r num">${sgn(m.diffReal)}</td></tr>`}).join("")}
    </tbody></table></div></div>`;
}
function calcRateTxt(rates,purchase,type){
  if(type==="OTS")return `3 mies. (od ${mShort(purchase)}): <b>${fmt(rates[0]*100)}%</b>, odsetki przy wykupie`;
  if(!calcIsNbp(type))return rates.map((x,i)=>`${i+1}. rok (od ${mShort(Zamiana.addMonths(purchase,i*12))}): <b>${fmt(x*100)}%</b>`).slice(0,Math.ceil(Zamiana.TYPES[type].term/12)).join(" · ");
  // ROR/DOR: miesiące o tej samej stopie łączone w przedziały
  const g=[];rates.forEach((x,i)=>{const last=g[g.length-1];if(last&&Math.abs(last.r-x)<1e-12)last.to=i;else g.push({r:x,from:i,to:i})});
  return g.map(z=>{const a=Zamiana.addMonths(purchase,z.from),b=Zamiana.addMonths(purchase,z.to);return `${a===b?mShort(a):mShort(a)+"–"+mShort(b)}: <b>${fmt(z.r*100)}%</b>`}).join(" · ");
}
// próg (inflacja albo stopa NBP): wartość i kierunek — czy zamiana wygrywa poniżej, czy powyżej progu
function calcBe(p,kind){
  const be=kind==="nbp"?Zamiana.breakEvenNbp(p):Zamiana.breakEvenInflation(p);
  if(typeof be!=="number")return be;
  const lo=kind==="nbp"?0:-2,dLo=Zamiana.compare(Object.assign({},p,kind==="nbp"?{nbpFuture:lo}:{cpiFuture:[lo]})).atHorizon.diff;
  return {value:be,below:dLo>0};
}
const calcBeShort=b=>b.independent?"—":b.none?(b.sign>0?"zawsze":"nigdy"):(b.below?"poniżej ":"powyżej ")+fmt(b.value,1)+"%";
function calcBeLong(b,kind){
  const what=kind==="nbp"?"stopie referencyjnej NBP":"inflacji",rng=kind==="nbp"?"od 0% do 15%":"od −2% do 25%";
  if(b.independent)return "";
  if(b.none)return `${b.sign>0?"Zamiana":"Trzymanie"} wygrywa przy każdej stałej ${what} ${rng}.`;
  return `Zamiana opłaca się przy stałej ${what} ${b.below?"poniżej":"powyżej"} ${fmt(b.value,1)}%.`;
}
// założenie o przyszłych zakupach (przy wykupie w terminie): dzisiejsze warunki serii docelowej
function calcFutureBuysHtml(c,events){
  const terms=c.tc?`na parametrach, które podałeś dla ${esc(c.tt)}`:`na ${calcIsToday()?"dzisiejszych ":""}warunkach ${esc(calcTgtCode(c))} z oferty ${mShort(calcOfferRec(calcNow()).id)}`;
  const det=`${calcR1Label(c.tt).toLowerCase()} ${fmt(calcRollR1(c))}%${calcRollR1Set(c)?" (Twoje założenie)":""}${c.tt==="OTS"?"":`, marża ${fmt(+c.tm)} p.p.`}, ${c.tt==="OTS"?"przy zerwaniu bez odsetek":`opłata ${fmt(+c.tf)} zł`}`;
  const fut=events.filter(e=>e.t>0&&e.to).sort((a,b)=>a.t-b.t);
  const list=fut.length?` W tym wyliczeniu: ${fut.map(e=>`${mShort(e.ym)} — ${e.newCount} szt. ${esc(e.to)} (${e.leg==="keep"?(e.text.startsWith("oba")?"oba warianty":"trzymam"):"zamieniam"})`).join("; ")}${c.tt==="OTS"?"; do tego odnawianie OTS co 3 miesiące":""}.`:" W tym okresie nie ma takich zakupów — liczą się tylko obecne obligacje i zakup "+calcD()+".";
  return `<li><b>Założenie o przyszłych zakupach:</b> obligacje kupowane w przyszłości (po wykupie w terminie, w obu wariantach, po ${calcSwapTxt(c.tt)}) liczymy ${terms}: ${det}${c.tt==="OTS"?"":`, dalej Twój scenariusz ${calcIsNbp(c.tt)?"stopy NBP":"inflacji"}`}.${list} Prawdziwa oferta w tych miesiącach może być inna — inne warunki sprawdzisz, wybierając w „Na co zamieniasz” opcję „własne parametry”.</li>`;
}
// dymki z objaśnieniem pól (najechanie, fokus z klawiatury albo dotknięcie)
const CALC_TIPS={
  code:"Seria, którą masz. Parametry (oprocentowanie 1. roku, marża, opłata) uzupełnią się z jej listu emisyjnego. „Inna” — wpiszesz je ręcznie.",
  n:"Ile sztuk tej serii masz. Jedna obligacja to 100 zł nominału.",
  type:"Rodzaj obligacji: EDO, COI, ROS, ROD — indeksowane inflacją; TOS i OTS — stałe; ROR i DOR — zmienne wg stopy NBP.",
  p:"Miesiąc, w którym kupiłeś tę serię. Od niego liczą się roczne (miesięczne) okresy odsetkowe i termin wykupu.",
  pd:"Dzień miesiąca zakupu. Okresy odsetkowe zaczynają się tego dnia, więc wpływa na odsetki narosłe w dniu zerwania.",
  r1:"Oprocentowanie w 1. okresie z listu emisyjnego (dla ROR i DOR — w 1. miesiącu, dla OTS — przez cały okres).",
  m:"Marża dodawana do inflacji (EDO, COI, ROS, ROD) albo do stopy referencyjnej NBP (ROR, DOR) od 2. okresu.",
  f:"Opłata za przedterminowy wykup, za każdą sztukę. Zwykle nie wyższa niż narosłe odsetki (ROR i DOR od 2. miesiąca — stała).",
  tt:"Na co zamieniasz: seria z oferty w miesiącu zerwania. Po zerwaniu kupujesz ją po 100 zł. „Własne parametry” — np. przyszła oferta.",
  rr1:"Oprocentowanie 1. okresu obligacji kupowanych później, gdy jakaś seria wykupi się w terminie (w obu wariantach). Puste = jak nowa seria.",
  h:"Do kiedy porównujemy oba warianty. Domyślnie do wykupu Twojej serii (w portfelu — ostatniej), albo po wybranej liczbie lat.",
  dm:"Miesiąc zerwania. Może być w przeszłości (sprawdzisz decyzję sprzed lat) albo w przyszłości. Oferta docelowa — z tego miesiąca.",
  bd:"Dzień zerwania, czyli dzień wykupu (odsetki biegną ok. 5 dni roboczych po złożeniu dyspozycji). Narosłe odsetki częściowo pokrywają opłatę.",
  sv:"Oprocentowanie konta, na które trafia reszta poniżej 100 zł i kupony (przed podatkiem Belki).",
  nbp:"Stała stopa referencyjna NBP w przyszłości — od niej zależy oprocentowanie ROR i DOR. Dla miesięcy z archiwum — rzeczywiste stopy NBP.",
  cpi:"Scenariusz inflacji (CPI r/r) w kolejnych latach. Od niego zależy oprocentowanie EDO, COI, ROS, ROD od 2. roku. Dla miesięcy z archiwum — rzeczywiste odczyty GUS.",
  cm:"Rzeczywiste: inflacja i stopa NBP po dacie zerwania z archiwum (jak to się naprawdę potoczyło). Tylko scenariusz: stan wiedzy z dnia decyzji.",
  acc:"Zwykły rachunek — podatek 19% od zysku. IKE — bez podatku. IKZE — bez podatku Belki, ale 10% ryczałtu przy wypłacie.",
  val:"Domyślnie wartość w czasie jest bez opłaty (nikt dalej nie zrywa). Ta opcja wycenia każdy miesiąc tak, jakbyś wypłacał wszystko, z opłatą.",
  real:"Kwota w dzisiejszych złotych (przy zerwaniu w przeszłości — w złotych z dnia zerwania): wartość nominalna podzielona przez skumulowaną inflację z Twojego scenariusza. Pokazuje siłę nabywczą, a nie to, co zobaczysz na koncie — np. 11 877 zł po 5 latach przy inflacji 2,5% to realnie ok. 10 498 zł.",
  range:"Od zakupu — cała historia. Od zerwania — oś tylko dla prognozy, linie są bardziej rozsunięte."
};
// objaśnienia: pola kalkulatorów (CALC_TIPS, uzupełniane w kupno.js i portfel.js) i pozostałych widoków (VIEW_TIPS w app.js)
const calcTip=(k,down)=>{const t=CALC_TIPS[k]||VIEW_TIPS[k];return t?`<span class="qtip${down?" down":""}" tabindex="0" role="button" aria-label="Wyjaśnienie: ${esc(t)}">?<span class="qtip-b" role="tooltip">${esc(t)}</span></span>`:""};
// dotknięcie na telefonie: pokaż/ukryj dymek; nie aktywuj pola, do którego należy etykieta; dymek nie wychodzi poza ekran
function calcBindTips(root){root.querySelectorAll(".qtip").forEach(q=>{
  const fit=()=>{const b=q.querySelector(".qtip-b");
    // w tabelach (ramka z przewijaniem przycina) dymek pozycjonujemy względem okna
    if(q.closest(".frame")){const r=q.getBoundingClientRect(),W=document.documentElement.clientWidth;b.style.position="fixed";b.style.transform="none";b.style.bottom="auto";
      const bw=Math.min(270,W*0.8);b.style.left=Math.max(8,Math.min(W-8-bw,r.left+r.width/2-bw/2))+"px";b.style.top=(r.bottom+8)+"px";return}
    b.style.setProperty("--dx","0px");const r=b.getBoundingClientRect(),W=document.documentElement.clientWidth;
    let dx=0;if(r.right>W-8)dx=W-8-r.right;if(r.left+dx<8)dx=8-r.left;b.style.setProperty("--dx",dx+"px")};
  q.addEventListener("mouseenter",fit);q.addEventListener("focus",fit);
  q.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();const open=!q.classList.contains("open");document.querySelectorAll(".qtip.open").forEach(x=>x.classList.remove("open"));if(open){calcTipY=scrollY;q.classList.add("open");fit()}});
  q.addEventListener("keydown",e=>{if(e.key==="Escape"){q.classList.remove("open");q.blur()}});
})}
document.addEventListener("click",()=>document.querySelectorAll(".qtip.open").forEach(x=>x.classList.remove("open")));
// przy przewijaniu chowamy otwarte dymki (dymki w tabelach mają pozycję względem okna)
let calcTipY=0;document.addEventListener("focusin",e=>{if(e.target.classList&&e.target.classList.contains("qtip"))calcTipY=scrollY});
window.addEventListener("scroll",()=>{if(Math.abs(scrollY-calcTipY)<40)return;document.querySelectorAll(".qtip.open").forEach(x=>x.classList.remove("open"));const a=document.activeElement;if(a&&a.classList&&a.classList.contains("qtip"))a.blur()},{passive:true});
const calcBreakDate=c=>{const n=calcNow();return `${+c.bd}.${n.slice(5)}.${n.slice(0,4)}`};
const calcAgeTxt=a=>a%1>1e-9?`${Math.floor(a)} mies. i ${Math.round((a%1)*30)} dni`:`${a} mies.`;
const calcRulesHtml=c=>`<li>Zerwanie ${calcBreakDate(c)}: wiek obligacji liczymy od dnia zakupu co do dnia, a do wartości w dniu zerwania wchodzą odsetki narosłe od ostatniej miesięcznicy (ROR, DOR) albo rocznicy zakupu (pozostałe), więc opłata za wykup jest częściowo pokryta. Według listów emisyjnych odsetki biegną do dnia wykupu, ok. 5 dni roboczych po złożeniu dyspozycji — jako dzień zerwania wpisz dzień wykupu. Dalsze kroki w tabeli to kolejne miesiące od dnia zerwania.</li>
      <li>Od 2. roku: inflacja ogłoszona w miesiącu przed okresem (odczyt za miesiąc P−2) + marża; ujemna inflacja = 0. ${c.cm==="s"&&calcNow()<calcArchiveNow()?`Odczyty do ${mShort(Zamiana.addMonths(calcNow(),-1))} (stan wiedzy w dniu zerwania), dalej Twój scenariusz — także dla miesięcy, które już minęły.`:`Odczyty do ${mShort(state.months[state.months.length-1].cpiRefMonth||calcArchiveNow())} z archiwum GUS, dalej Twój scenariusz.`}</li>
      ${calcUsesOts(c)?`<li><b>OTS:</b> stałe oprocentowanie przez 3 miesiące, odsetki (100 zł × stopa × 3/12) wypłacane przy wykupie. Przy zerwaniu dostajesz 100 zł za sztukę, a odsetki przepadają. Zamiana na OTS kosztuje 100,00 zł (nie 99,90 zł)${c.tt==="OTS"?"; OTS w obliczeniach odnawia się co 3 miesiące na warunkach z oferty (tych odnowień nie wyróżniamy w tabeli ani na wykresie)":""}.</li>`:""}
      ${calcUsesNbp(c)?`<li><b>ROR i DOR:</b> odsetki za każdy miesiąc (100 zł × stopa / 12, do grosza) trafiają na konto. Od 2. miesiąca stopa = stopa referencyjna NBP z 10. dnia roboczego przed miesiącem okresu + marża; do ${mShort(calcNow())} z archiwum NBP, dalej ${fmt(+c.nbp)}% (Twoje założenie). Przy zerwaniu od 2. miesiąca opłata jest stała (0,50 zł ROR, 0,70 zł DOR), także gdy przekracza narosłe odsetki — wtedy dostajesz mniej niż 100 zł za sztukę.</li>`:""}
      <li>Przedterminowy wykup: wartość minus opłata, ale nie mniej niż 100 zł za sztukę${calcUsesNbp(c)?" (poza ROR i DOR od 2. miesiąca)":""}${calcUsesOts(c)?"; OTS — 100 zł bez odsetek":""}. Podatek 19% od zysku${c.acc==="ike"?" — tu pominięty (IKE)":c.acc==="ikze"?" — tu pominięty (IKZE); zamiast niego przy wypłacie po 65. roku życia 10% ryczałtu od całej kwoty, uwzględniony w wartościach w czasie i w różnicy (nie w koszcie zerwania)":""}. Wypłata z IKE/IKZE jest bez opłaty za wykup, ale zerwanie w ramach konta, żeby kupić nowe obligacje — z opłatą. Reszta poniżej 100 zł trafia na konto (${fmt(+c.sv,1)}%${c.ike?"":" przed podatkiem"}).</li>`;
const calcCouponTxt=v=>v>0.005?`; w tym odsetki wypłacone ${calcDo()}: ${zl0(v)}`:"";
const calcCouponDesc=v=>v>0.005?` Wartość obejmuje odsetki wypłacone ${calcDo()} (kupony COI, odsetki ROR/DOR: ${zl0(v)}, bez oprocentowania) — dostajesz je w obu wariantach, więc nie zmieniają różnicy.`:"";
const calcShareHtml=`<div class="row"><button type="button" class="btn" id="z-share" data-goatcounter-click="kalkulator-link">Kopiuj link do tego wyliczenia</button><span class="small" id="z-share-msg"></span></div>`;
function calcBindShare(){$("#z-share").addEventListener("click",async()=>{const url=location.href;try{await navigator.clipboard.writeText(url);$("#z-share-msg").textContent="Skopiowano."}catch(e){$("#z-share-msg").textContent=url}})}
const calcTgtCode=c=>c.tc?c.tt+" (własne parametry)":(calcTargetFromOffer(c.tt)?.tcode||c.tt);
const calcHorizonTxt=(c,H,mat,multi)=>c.h==="m"?(multi?`do wykupu ostatniej serii (${mShort(mat)})`:null):"po "+(H%12?fmt(H/12,1):String(H/12))+(H===12?" roku":" latach");
function calcRecompute(){
  const out=$("#z-out");if(!out)return;const c=state.calc,now=calcNow();
  const note=$("#z-code-note");if(note)note.textContent=c.pos[0].code?`Parametry z listu emisyjnego ${c.pos[0].code}. Aby je zmienić, wybierz „inna, wpiszę ręcznie”.`:"Uzupełnij parametry ręcznie (z listu emisyjnego swojej serii).";
  try{history.replaceState(null,"","#"+calcHash(c))}catch(e){}
  const bdEl=$("#z-bdate");if(bdEl&&calcDayOk(c.bd))bdEl.textContent=calcBreakDate(c);
  const errs=calcValidate(c);
  if(errs.length){out.innerHTML=`<div class="insight warn"><span class="t">uzupełnij dane</span>${errs.map(esc).join("<br>")}</div>`;return}
  if(c.pos.length>1)return calcRecomputePortfolio(out,c,now);
  const o=c.pos[0];
  let r,p;
  try{p=calcParams(c,o);r=Zamiana.compare(p)}catch(e){out.innerHTML=`<div class="insight warn"><span class="t">błąd</span>${esc(e.message)}</div>`;return}
  const beC=calcBe(p,"cpi"),beN=calcUsesNbp(c)?calcBe(p,"nbp"):{independent:true};
  const H=r.horizonMonths,a=r.atHorizon,good=a.diff>=0,yrsTxt=calcHorizonTxt(c,H,r.maturity,false)||`do wykupu ${o.code||o.type} (${mShort(r.maturity)})`;
  const liq=c.val==="liquidate";
  const sn=r.switchNow;
  const beMonth=r.breakEvenMonth==null?"nie w tym horyzoncie":r.breakEvenMonth===0?"od razu":`po ${r.breakEvenMonth} mies. (${mShort(r.months[r.breakEvenMonth].ym)})`;
  const beInflTxt=[calcBeLong(beC,"cpi"),calcBeLong(beN,"nbp")].filter(Boolean).join(" ")||"Wynik nie zależy od inflacji ani od stopy NBP.";
  const oldCode=o.code||o.type, tgtCode=calcTgtCode(c);
  const events=calcColorEvents(calcEvents(r,o,c.tt,oldCode,tgtCode));
  out.innerHTML=`<div class="vlist">
    <div class="verdict ${good?"good":"bad"}"><div class="vt">${good?`Zamiana się opłaca: ${sgn(a.diff)} ${yrsTxt}`:`Lepiej trzymać: zamiana to ${sgn(a.diff)} ${yrsTxt}`}</div>
      <div class="vs">${Math.floor(+o.n)} szt. ${esc(oldCode)} warte ${calcIsToday()?"dziś":"w dniu zerwania"} ${zl2(sn.valueBeforeFee)}; po opłacie${c.ike?"":" i podatku"} zostaje ${zl2(sn.proceeds)} → ${sn.newCount} szt. ${esc(tgtCode)} po 100 zł + ${zl2(sn.cashRest)} na konto. Realnie (${calcRealTxt()}): ${sgn(a.diffReal)}. ${liq?"Wycena jak przy wypłacie wszystkiego na koniec okresu (z opłatą za wykup)":`Jedyne zerwanie to zamiana ${calcD()}; dalej oba warianty trzymają obligacje do wykupu`}, ${calcTaxTxt(c)}.</div></div>
    <div class="stats">
      <div class="stat t-acc"><span class="k">Trzymam</span><span class="v">${zl0(a.keep)}</span><span class="s">na koniec okresu (${mShort(r.months[H].ym)}); realnie ${zl0(a.keepReal)}${calcCouponTxt(r.paidCoupons)}</span></div>
      <div class="stat t-green"><span class="k">Zamieniam</span><span class="v">${zl0(a.swap)}</span><span class="s">na koniec okresu; realnie ${zl0(a.swapReal)}${calcCouponTxt(r.paidCoupons)}</span></div>
      <div class="stat t-red"><span class="k">Koszt zerwania${calcIsToday()?" dziś":""}</span><span class="v">${zl0(sn.cost)}</span><span class="s">opłata ${zl2(sn.fee)}${c.ike?"":` + podatek ${zl2(sn.tax)}`}; z ${zl2(sn.valueBeforeFee)} zostaje ${zl2(sn.proceeds)} → ${sn.newCount} szt. + ${zl2(sn.cashRest)} na konto</span></div>
      <div class="stat t-gold"><span class="k">Kiedy zamiana zaczyna się opłacać</span><span class="v sm">${beMonth}</span><span class="s">${beInflTxt}</span></div>
    </div>
    <div class="card"><div class="sec-head"><div><h3>Wartość w czasie</h3><p class="desc">${liq?`Ile dostałbyś, wypłacając wszystko z końcem danego miesiąca ${calcLiqTxt(c)}, z resztą na koncie.${c.ike?"":" Schodki na wykresie to skutek tej metody: w miesiącu wykupu w terminie znika opłata (linia podskakuje), a przez pierwsze miesiące nowo kupionych obligacji opłata zjada narosłe odsetki (linia stoi w miejscu)."}`:`Wartość obligacji${c.acc==="ikze"?" po 10% ryczałcie przy wypłacie z IKZE":c.ike?"":" po podatku od narosłych odsetek"}, bez opłaty za wykup (nikt dalej nie zrywa), z resztą na koncie. W miesiącu wykupu ${esc(oldCode)} kwota na rękę przechodzi przez zamianę po ${calcSwapTxt(c.tt)}.`}${calcCouponDesc(r.paidCoupons)}</p></div></div>
      <div class="chart" id="z-chart"></div></div>
    ${calcYearTable(r.months,H,events,{keep:"Trzymam",swap:"Zamieniam"})}
    <details class="how"><summary>Jak to policzono</summary><ul>
      <li><b>${esc(oldCode)}</b> (zakup ${mShort(o.p)}, ${calcIsToday()?"dziś":"w dniu zerwania"} ${calcAgeTxt(r.ageNow)}): ${calcRateTxt(r.oldRates,o.p,o.type)}</li>
      <li><b>${esc(tgtCode)}</b> (zakup ${mShort(now)}): ${calcRateTxt(r.targetRates,now,c.tt)}</li>
      <li>Linie odniesienia na wykresie: <b>wpłata + inflacja</b> — wpłacona kwota od miesiąca zakupu rośnie co miesiąc o (1 + CPI r/r)<sup>1/12</sup> (do dziś z archiwum GUS, dalej scenariusz); wartość obligacji nad tą linią to zysk realny, pod nią — utrata siły nabywczej. <b>Wpłata na stopie NBP</b> rośnie tak samo o stopę referencyjną NBP${c.ike?"":" (zysk po 19% podatku)"}.</li>
      ${calcRulesHtml(c)}
      <li><b>Trzymam:</b> ${esc(oldCode)} dochodzi do wykupu w terminie (${mShort(r.maturity)}) bez opłaty; całą kwotę na rękę zamieniasz po ${calcSwapTxt(c.tt)} na nową serię ${esc(tgtCode)} na warunkach z oferty ${mShort(calcOfferRec(calcNow()).id)}. <b>Zamieniam:</b> zrywasz ${calcD()} (opłata${c.ike?"":" i podatek"}) i kupujesz nowe po 100 zł. To jedyne zerwanie w obliczeniach${liq?" — ale wycena na każdy miesiąc zakłada wypłatę wszystkiego, z opłatą (zaznaczona opcja)":""}. Miesiące wykupu są wyróżnione w tabeli.</li>
      ${calcFutureBuysHtml(c,events)}
      <li>Obliczenia w pełnych miesiącach; to symulacja, nie rekomendacja inwestycyjna. Wiążące są listy emisyjne.</li>
    </ul></details>
    ${calcShareHtml}
  </div>`;
  drawCalcChart(r,oldCode,tgtCode,events,null,[{ym:o.p,amount:Math.floor(+o.n)*100,text:`zakup ${Math.floor(+o.n)} szt. ${oldCode} (${zl0(Math.floor(+o.n)*100)})`}],calcMacro(c,p));
  calcBindShare();calcBindTips(out);
}
function calcRecomputePortfolio(out,c,now){
  let r,p;
  try{p=calcParams(c);r=Zamiana.comparePortfolio(p)}catch(e){out.innerHTML=`<div class="insight warn"><span class="t">błąd</span>${esc(e.message)}</div>`;return}
  const H=r.horizonMonths,a=r.atHorizon,pick=r.anyPick,liq=c.val==="liquidate",tgtCode=calcTgtCode(c);
  const yrsTxt=calcHorizonTxt(c,H,r.latestMaturity,true);
  const rowsP=r.positions.map((x,i)=>{const o=c.pos[i];return {x,o,i,code:calcPosCode(o),pp:Object.assign({},p,{old:p.positions[i],positions:undefined,horizonMonths:H})}}).map(z=>Object.assign(z,{beC:calcBe(z.pp,"cpi"),beN:calcUsesNbp(c)?calcBe(z.pp,"nbp"):null}));
  const sel=rowsP.filter(z=>z.x.swap),kept=rowsP.filter(z=>!z.x.swap);
  const swapSet=new Set((pick?sel:rowsP).map(z=>z.i));
  const key=pick?"best":"swapAll",sn=pick?r.switchBest:r.switchAll,beM=pick?r.breakEvenMonthBest:r.breakEvenMonthAll;
  const ms=r.months.map(m=>({t:m.t,ym:m.ym,keep:m.keep,swap:m[key],diff:m[key]-m.keep,swapReal:m[key+"Real"],diffReal:m[key+"Real"]-m.keepReal}));
  const codes=list=>list.map(z=>z.code).join(", ");
  const lab={keep:"Trzymam wszystko",swap:pick?(kept.length?"Zamieniam wybrane":"Zamieniam wszystko"):"Zamieniam wszystko"};
  // zdarzenia: jedno zerwanie dziś (suma pozycji) i wykupy w terminie poszczególnych serii
  let events=[];
  rowsP.forEach(z=>{for(const e of calcEvents(z.x.result,z.o,c.tt,z.code,tgtCode)){
    if(e.t===0)continue;if(e.leg==="swap"&&!swapSet.has(z.i))continue;
    if(e.leg==="keep"&&!swapSet.has(z.i))e.text=e.text.replace(/^trzymam:/,"oba warianty:");
    events.push(e);}});
  events.push({t:0,leg:"swap",short:"zerwanie i zakup",text:`zamieniam: zerwanie ${codes(pick?sel:rowsP)}, zakup ${sn.newCount} szt. ${tgtCode} po 100 zł`});
  events.sort((a,b)=>a.t-b.t);calcColorEvents(events);
  const beMonth=beM==null?"nie w tym horyzoncie":beM===0?"od razu":`po ${beM} mies. (${mShort(r.months[beM].ym)})`;
  const nbpCol=calcUsesNbp(c);
  const tot=k=>rowsP.reduce((s,z)=>s+z.x.result.switchNow[k],0);
  const paidC=rowsP.reduce((t,z)=>t+z.x.result.paidCoupons,0);
  const detailHref=z=>"#"+calcHash(Object.assign({},c,{pos:[z.o]}));
  out.innerHTML=`<div class="vlist">
    <div class="verdict ${pick?"good":"bad"}"><div class="vt">${pick?(kept.length?`Zamień ${sel.length} z ${rowsP.length} serii (${esc(codes(sel))}): ${sgn(a.diffBest)} ${yrsTxt}`:`Zamień cały portfel: ${sgn(a.diffBest)} ${yrsTxt}`):`Lepiej trzymać cały portfel: zamiana wszystkiego to ${sgn(a.diffAll)} ${yrsTxt}`}</div>
      <div class="vs">${pick?`${kept.length?`Trzymaj: ${esc(codes(kept))}. `:""}Zerwane serie warte ${calcIsToday()?"dziś":"w dniu zerwania"} ${zl2(sn.valueBeforeFee)}; po opłacie${c.ike?"":" i podatku"} zostaje ${zl2(sn.proceeds)} → ${sn.newCount} szt. ${esc(tgtCode)} po 100 zł${sn.pooledExtra?` (w tym ${sn.pooledExtra} szt. z połączonych reszt)`:""} + ${zl2(sn.cashRest)} na konto. ${kept.length?`Gdybyś zamienił wszystko: ${sgn(a.diffAll)}. `:""}Realnie (${calcRealTxt()}): ${sgn(a.diffBestReal)}.`:`Żadna seria nie zyskuje na zamianie na ${esc(tgtCode)}. Zerwanie wszystkiego kosztowałoby ${calcD()} ${zl2(r.switchAll.cost)} (opłata${c.ike?"":" i podatek"}).`} Każda seria liczona osobno, z tymi samymi założeniami i wspólnym okresem; ${liq?"wycena jak przy wypłacie wszystkiego (z opłatą)":`jedyne zerwanie to zamiana ${calcD()}`}, ${calcTaxTxt(c)}.</div></div>
    <div class="stats">
      <div class="stat t-acc"><span class="k">Trzymam wszystko</span><span class="v">${zl0(a.keep)}</span><span class="s">na koniec okresu (${mShort(r.months[H].ym)}); realnie ${zl0(a.keepReal)}${calcCouponTxt(paidC)}</span></div>
      <div class="stat t-green"><span class="k">${esc(lab.swap)}</span><span class="v">${zl0(ms[H].swap)}</span><span class="s">na koniec okresu; realnie ${zl0(ms[H].swapReal)}${calcCouponTxt(paidC)}</span></div>
      <div class="stat t-red"><span class="k">Koszt zerwania${calcIsToday()?" dziś":""}</span><span class="v">${zl0(sn.cost)}</span><span class="s">${pick&&kept.length?"zrywane serie: ":""}opłata ${zl2(sn.fee)}${c.ike?"":` + podatek ${zl2(sn.tax)}`}; z ${zl2(sn.valueBeforeFee)} zostaje ${zl2(sn.proceeds)}</span></div>
      <div class="stat t-gold"><span class="k">Kiedy zamiana zaczyna się opłacać</span><span class="v sm">${beMonth}</span><span class="s">${pick?"dla wybranych serii łącznie":"dla zamiany wszystkich serii"}</span></div>
    </div>
    <div class="card table-card"><div class="tc-head"><h3>Serie w portfelu</h3><p class="desc">Różnica = zamiana minus trzymanie ${esc(yrsTxt)}. Kolumny „zamiana, gdy…”: przy jakiej stałej przyszłej inflacji${nbpCol?" albo stopie referencyjnej NBP (ROR, DOR)":""} zamiana tej serii się opłaca (próg, przy którym oba warianty dają tyle samo).</p></div>
      <div class="frame"><table><thead><tr><th>Seria</th><th class="r">Szt.</th><th>Wykup</th><th class="r">Wartość ${calcIsToday()?"dziś":"przy zerwaniu"}</th><th class="r">Koszt zerwania</th><th class="r">Różnica</th><th class="r">Zamiana, gdy inflacja</th>${nbpCol?'<th class="r">Zamiana, gdy stopa NBP</th>':""}<th>Decyzja</th></tr></thead><tbody>
      ${rowsP.map(z=>{const s=z.x.result.switchNow;return `<tr><td><b>${esc(z.code)}</b> <a class="small" href="${esc(detailHref(z))}" target="_blank" rel="noopener" title="Otwórz wyliczenie tylko dla tej serii w nowej karcie">szczegóły ↗</a></td><td class="r num">${Math.floor(+z.o.n)}</td><td>${mShort(z.x.result.maturity)}</td><td class="r num">${zl0(s.valueBeforeFee)}</td><td class="r num">${zl0(s.cost)}</td><td class="r num"><span class="${z.x.diff>0?"d-up":z.x.diff<0?"d-down":"d-0"}">${sgn(z.x.diff)}</span></td><td class="r num">${calcBeShort(z.beC)}</td>${nbpCol?`<td class="r num">${calcBeShort(z.beN)}</td>`:""}<td>${z.x.swap?'<span class="pill p-ok">zamień</span>':'<span class="pill p-part">trzymaj</span>'}</td></tr>`}).join("")}
      <tr class="sum"><td><b>Razem</b></td><td class="r num">${rowsP.reduce((s,z)=>s+Math.floor(+z.o.n),0)}</td><td>${mShort(r.latestMaturity)}</td><td class="r num">${zl0(tot("valueBeforeFee"))}</td><td class="r num">${zl0(tot("cost"))}</td><td class="r num"><span class="${a.diffAll>0?"d-up":a.diffAll<0?"d-down":"d-0"}">${sgn(a.diffAll)}</span></td><td></td>${nbpCol?"<td></td>":""}<td>${pick?`<span class="small">wybrane: ${sgn(a.diffBest)}</span>`:""}</td></tr>
      </tbody></table></div></div>
    <div class="card"><div class="sec-head"><div><h3>Wartość portfela w czasie</h3><p class="desc">${liq?`Ile dostałbyś, wypłacając wszystko z końcem danego miesiąca ${calcLiqTxt(c)}, z resztą na koncie.${c.ike?"":" Schodki na wykresie to skutek tej metody: w miesiącu wykupu w terminie znika opłata (linia podskakuje), a przez pierwsze miesiące nowo kupionych obligacji opłata zjada narosłe odsetki (linia stoi w miejscu)."}`:`Suma wartości obligacji${c.acc==="ikze"?" po 10% ryczałcie przy wypłacie z IKZE":c.ike?"":" po podatku od narosłych odsetek"}, bez opłaty za wykup, z resztą na koncie. Serie kupione później dochodzą do historii w miesiącu zakupu; w miesiącach wykupu kwota na rękę przechodzi przez zamianę po ${calcSwapTxt(c.tt)}.`}${calcCouponDesc(paidC)}</p></div></div>
      <div class="chart" id="z-chart"></div></div>
    ${calcYearTable(ms,H,events,lab)}
    <details class="how"><summary>Jak to policzono</summary><ul>
      ${rowsP.map(z=>`<li><b>${esc(z.code)}</b> (zakup ${mShort(z.o.p)}, ${calcIsToday()?"dziś":"w dniu zerwania"} ${calcAgeTxt(z.x.result.ageNow)}): ${calcRateTxt(z.x.result.oldRates,z.o.p,z.o.type)}</li>`).join("")}
      <li><b>${esc(tgtCode)}</b> (zakup ${mShort(now)}): ${calcRateTxt(r.positions[0].result.targetRates,now,c.tt)}</li>
      <li>Linie odniesienia na wykresie: <b>wpłata + inflacja</b> — wpłacona kwota od miesiąca zakupu rośnie co miesiąc o (1 + CPI r/r)<sup>1/12</sup> (do dziś z archiwum GUS, dalej scenariusz); wartość obligacji nad tą linią to zysk realny, pod nią — utrata siły nabywczej. <b>Wpłata na stopie NBP</b> rośnie tak samo o stopę referencyjną NBP${c.ike?"":" (zysk po 19% podatku)"}.</li>
      ${calcRulesHtml(c)}
      <li><b>Portfel:</b> każda seria liczona osobno: trzymasz ją do wykupu w terminie (i zamieniasz po ${calcSwapTxt(c.tt)} na ${esc(tgtCode)}) albo zrywasz ${calcD()} i kupujesz nowe po 100 zł. Seria dostaje „zamień”, jeśli zamiana daje więcej na koniec wspólnego okresu (${esc(yrsTxt)}). Reszty poniżej 100 zł z serii zrywanych ${calcD()} łączymy przy zakupie${(pick?r.switchBest:r.switchAll).pooledExtra?` — tu daje to ${(pick?r.switchBest:r.switchAll).pooledExtra} szt. więcej`:" (tu nie dają dodatkowej obligacji)"}; przy późniejszych wykupach w terminie reszta zostaje przy każdej serii osobno. Decyzja „zamień/trzymaj” dla serii jest liczona bez tego łączenia.</li>
      ${calcFutureBuysHtml(c,events)}
      <li>Obliczenia w pełnych miesiącach; to symulacja, nie rekomendacja inwestycyjna. Wiążące są listy emisyjne.</li>
    </ul></details>
    ${calcShareHtml}
  </div>`;
  drawCalcChart({past:r.past,months:ms},"Portfel",tgtCode,events,lab,rowsP.map(z=>({ym:z.o.p,amount:Math.floor(+z.o.n)*100,text:`zakup ${Math.floor(+z.o.n)} szt. ${z.code} (${zl0(Math.floor(+z.o.n)*100)})`})),calcMacro(c,p));
  calcBindShare();calcBindTips(out);
}
// kod serii kupionej w danym miesiącu: typ + MMRR terminu wykupu (np. EDO z 04.2034 → EDO0444)
function calcCodeFor(type,purchase){const m=Zamiana.addMonths(purchase,Zamiana.TYPES[type].term);return type+m.slice(5)+m.slice(2,4)}
function calcEvents(r,o,tt,oldCode,tgtCode){
  const now=calcNow(),out=[],sn=r.switchNow;
  out.push({t:0,leg:"swap",short:"zerwanie i zakup",text:`zamieniam: zerwanie ${oldCode}, zakup ${sn.newCount} szt. ${tgtCode} po 100 zł`});
  for(const [leg,list] of [["keep",r.keepEvents],["swap",r.swapEvents]])for(const e of list){if(e.kind!=="wykup")continue;
    const own=leg==="keep"&&e.spec.purchase===o.p,from=e.t===0||own?oldCode:calcCodeFor(e.spec.type,e.spec.purchase);
    // miesiąc wykupu: dla posiadanej serii faktyczny (zakup + okres), dla kolejnych — krok osi czasu
    const ym=own?Zamiana.addMonths(o.p,Zamiana.TYPES[o.type].term):Zamiana.addMonths(now,e.t);
    const to=calcCodeFor(tt,ym);
    // odnawianie OTS co 3 miesiące pomijamy w tabeli i na wykresie (opisane w „Jak to policzono”)
    if(e.spec.type==="OTS"&&!own&&e.t>0)continue;
    out.push({t:e.t,leg,src:from,ym,to,newCount:e.newCount,short:`wykup ${from}`,priceTxt:fmt(calcSwapPrice(tt)),text:`${leg==="keep"?"trzymam":"zamieniam"}: wykup ${from} w terminie (${zl2(e.proceeds)} na rękę) → zamiana po ${calcSwapTxt(tt)} na ${e.newCount} szt. ${to}`});}
  return out;
}
// kolory zdarzeń wykupu: każda wykupowana seria ma własny kolor (linia, etykieta, dymek, tabela)
function calcColorEvents(events){const map=new Map();for(const e of events.slice().sort((a,b)=>a.t-b.t)){if(e.t===0){e.color="var(--accent)";continue}
  if(!map.has(e.src))map.set(e.src,`var(--e${map.size%6+1})`);e.color=map.get(e.src)}return events}
// legenda wykresu z przełącznikami: items=[{k,label,color,dash}], vis(k) → bool; kliknięcie wywołuje onToggle(k)
function chartLegendHtml(items,vis){return `<div class="lgnd" role="group" aria-label="Pokaż lub ukryj linie">${items.map(it=>`<button type="button" data-lg="${esc(it.k)}" aria-pressed="${vis(it.k)}" title="Kliknij, aby ${vis(it.k)?"ukryć":"pokazać"} linię"><i style="${it.dash?`height:0;border-top:3px dashed ${it.color}`:`background:${it.color}`}"></i>${esc(it.label)}</button>`).join("")}</div>`}
function chartLegendBind(el,onToggle){el.querySelectorAll(".lgnd button[data-lg]").forEach(b=>b.addEventListener("click",()=>onToggle(b.dataset.lg)))}
// linie odniesienia w zł: wpłaty od miesiąca zakupu rosnące co miesiąc o inflację CPI r/r albo o stopę NBP,
// (1+r/100)^(1/12); yms = kolejne miesiące wykresu, buys = [{ym,amount}] (zakup przed początkiem osi liczy się od pierwszego punktu);
// tax — podatek od zysku (linia stopy NBP po podatku Belki jak obligacje; inflacja bez podatku)
function benchLine(yms,buys,at,tax){let v=0,paid=0;return yms.map((ym,i)=>{if(i)v*=Math.pow(1+Math.max(-50,at(ym))/100,1/12);
  for(const b of buys)if(b.amount&&(b.ym===ym||(i===0&&b.ym<ym))){v+=b.amount;paid+=b.amount}return v-Math.max(0,v-paid)*(tax||0)})}
// dane do linii odniesienia (inflacja, stopa NBP): historia jak w obliczeniach, dalej scenariusz
const calcMacro=(c,p)=>({cpiAt:Zamiana.makeCpiAt(p.cpiHistory,p.cpiFuture,p.now),nbpAt:Zamiana.makeNbpAt(p.nbpHistory,p.nbpFuture,p.now),nbp:calcUsesNbp(c),tax:p.tax===false?0:(p.taxRate||0.19)});
function drawCalcChart(r,oldCode,tgtCode,events,lab,purchases,macro){
  events=events||[];lab=lab||{keep:"Trzymam",swap:"Zamieniam"};purchases=purchases||[];macro=macro||{};
  const el=$("#z-chart");if(!el)return;
  // widoczność linii: wybór użytkownika (state.calcVis) albo domyślnie (stopa NBP tylko przy ROR/DOR)
  state.calcVis=state.calcVis||{};const vis=k=>state.calcVis[k]??(k==="nbp"?!!macro.nbp:true);
  const range=state.calcRange==="future"?"future":"all";
  // punkty: historia od zakupu (wspólna) + przyszłość (dwa warianty); indeks k = 0..N, dziś = P
  const pastAll=r.past||[],past=range==="future"?pastAll.slice(-1):pastAll,P=Math.max(0,past.length-1),fut=r.months;
  const pts=past.map(p=>({ym:p.ym,t:p.t,keep:p.value,swap:null})).slice(0,P).concat(fut.map(m=>({ym:m.ym,t:m.t,keep:m.keep,swap:m.swap,diff:m.diff})));
  // linie odniesienia liczone na pełnej osi (od zakupu), potem wycinek widocznego zakresu
  const hasBench=purchases.some(z=>z.amount>0),fullYm=pastAll.slice(0,Math.max(0,pastAll.length-1)).map(z=>z.ym).concat(fut.map(m=>m.ym));
  const hasCpi=hasBench&&!!macro.cpiAt,hasNbp=hasBench&&!!macro.nbpAt,showCpi=hasCpi&&vis("cpi"),showNbp=hasNbp&&vis("nbp");
  if(hasCpi){const b=benchLine(fullYm,purchases,macro.cpiAt).slice(-pts.length);pts.forEach((m,i)=>m.cpi=b[i])}
  if(hasNbp){const b=benchLine(fullYm,purchases,macro.nbpAt,macro.tax).slice(-pts.length);pts.forEach((m,i)=>m.nbp=b[i])}
  const n=pts.length;const W=Math.max(640,el.clientWidth||900),L=64,R=14,T=22,M1=270,D0=M1+22,D1=D0+86,H=D1+26;
  let vals=pts.flatMap((m,i)=>[i<P?(vis("hist")?m.keep:null):(vis("keep")?m.keep:null),vis("swap")?m.swap:null,showCpi?m.cpi:null,showNbp?m.nbp:null]).filter(v=>v!=null);
  if(!vals.length)vals=pts.flatMap(m=>[m.keep,m.swap]).filter(v=>v!=null);let min=Math.min(...vals),max=Math.max(...vals);
  const nice=(span)=>{const raw=span/5,mag=Math.pow(10,Math.floor(Math.log10(raw||1)));return [1,2,2.5,5,10].map(k=>k*mag).find(s=>s>=raw)};
  const span=max-min||max*0.1||1,step=nice(span);
  min=Math.floor(min/step)*step;max=Math.ceil(max/step)*step;if(max===min)max=min+step;
  const x=i=>L+(n<=1?0:(W-L-R)*i/(n-1)),y=v=>T+(M1-T)*(1-(v-min)/(max-min));
  const fk=v=>Math.abs(v)>=10000?(Math.round(v/100)/10).toLocaleString("pl-PL")+" tys.":Math.round(v).toLocaleString("pl-PL");
  // pasek różnicy (zamiana − trzymanie)
  const diffs=pts.slice(P).map(m=>m.diff);let lo=Math.min(0,...diffs),hi=Math.max(0,...diffs);if(hi-lo<1){hi+=1;lo-=1}
  const pad=(hi-lo)*0.12;hi+=hi>0?pad:0;lo-=lo<0?pad:0;
  const dy=v=>D0+(D1-D0)*(hi-v)/(hi-lo);
  let g="";for(let v=min;v<=max+1e-9;v+=step)g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--line-strong)"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${fk(v)}</text>`;
  const dlab=v=>(v>0?"+":v<0?"−":"")+fk(Math.abs(v));
  g+=`<line x1="${L}" x2="${W-R}" y1="${dy(0)}" y2="${dy(0)}" style="stroke:var(--ink-2);stroke-width:1"/><text x="${L-6}" y="${dy(0)+4}" text-anchor="end">0</text>`;
  if(hi>pad*1.5)g+=`<text x="${L-6}" y="${dy(hi)+10}" text-anchor="end" style="fill:var(--ok)">${dlab(Math.max(...diffs,0))}</text>`;
  if(lo<-pad*1.5)g+=`<text x="${L-6}" y="${dy(lo)}" text-anchor="end" style="fill:var(--bad)">${dlab(Math.min(...diffs,0))}</text>`;
  let macroPaths="";const bl=k=>pts.map((m,i)=>(i?"L":"M")+x(i).toFixed(1)+" "+y(m[k]).toFixed(1)).join(" ");
  if(showCpi)macroPaths+=`<path d="${bl("cpi")}" fill="none" style="stroke:var(--s-CPI)" stroke-width="1.8" stroke-dasharray="6 4" stroke-linejoin="round"/>`;
  if(showNbp)macroPaths+=`<path d="${bl("nbp")}" fill="none" style="stroke:var(--s-NBP)" stroke-width="1.8" stroke-dasharray="2 3" stroke-linejoin="round"/>`;
  // oś X: styczeń każdego roku (co 2 lata przy długich okresach), podpisy pod paskiem różnicy
  let xt="";const yrs=Math.ceil(n/12),every=yrs>14?2:1;
  pts.forEach((m,i)=>{if(m.ym.slice(5)==="01"&&(+m.ym.slice(0,4))%every===0)xt+=`<line x1="${x(i)}" x2="${x(i)}" y1="${D1}" y2="${D1+4}" style="stroke:var(--muted)"/><text x="${x(i)}" y="${D1+17}" text-anchor="middle">${m.ym.slice(0,4)}</text>`});
  const line=(from,to,k)=>pts.slice(from,to+1).map((m,j)=>(j?"L":"M")+x(from+j).toFixed(1)+" "+y(m[k]).toFixed(1)).join(" ");
  const area=(sign)=>{const seg=pts.slice(P).map((m,j)=>`L${x(P+j).toFixed(1)} ${dy(sign>0?Math.max(m.diff,0):Math.min(m.diff,0)).toFixed(1)}`).join(" ");return `M${x(P).toFixed(1)} ${dy(0).toFixed(1)} ${seg} L${x(n-1).toFixed(1)} ${dy(0).toFixed(1)} Z`};
  const dline=pts.slice(P).map((m,j)=>(j?"L":"M")+x(P+j).toFixed(1)+" "+dy(m.diff).toFixed(1)).join(" ");
  const histPath=P>0?line(0,P,"keep"):"";
  const buys=range==="future"?[]:purchases.map(p=>({p,i:pts.findIndex((m,k)=>k<=P&&m.ym===p.ym)})).filter(z=>z.i>=0);
  const evs=events.filter(e=>e.t>0);
  const todayAnchor=P>n*0.85?"end":P<n*0.08?"start":"middle";
  const lgItems=[...(P>0?[{k:"hist",label:`od zakupu do ${calcIsToday()?"dziś":"zerwania"}`,color:"var(--ink-2)"}]:[]),{k:"keep",label:lab.keep.toLowerCase()==="trzymam"?`trzymam ${oldCode}`:lab.keep.toLowerCase(),color:"var(--muted)"},
    {k:"swap",label:lab.swap.toLowerCase()==="zamieniam"?`zamieniam na ${tgtCode}`:`${lab.swap.toLowerCase()} na ${tgtCode}`,color:"var(--accent)"},
    ...(hasCpi?[{k:"cpi",label:"wpłata + inflacja",color:"var(--s-CPI)",dash:1}]:[]),...(hasNbp?[{k:"nbp",label:macro.tax?"wpłata na stopie NBP (po podatku)":"wpłata na stopie NBP",color:"var(--s-NBP)",dash:1}]:[])];
  el.innerHTML=chartLegendHtml(lgItems,vis)+`<div class="ctools"><span class="small">Oś od:${calcTip("range")}</span><button type="button" class="chip" data-range="all" aria-pressed="${range==="all"}">zakupu</button><button type="button" class="chip" data-range="future" aria-pressed="${range==="future"}" title="Oś Y tylko dla prognozy — linie są bardziej rozsunięte">${calcIsToday()?"dziś":"zerwania"} (przybliżenie)</button></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Wartość: ${esc(lab.keep.toLowerCase())} kontra ${esc(lab.swap.toLowerCase())}, z paskiem różnicy">${g}<line x1="${L}" x2="${W-R}" y1="${M1}" y2="${M1}" style="stroke:var(--line-strong)"/>${xt}
    ${P>0?`<rect x="${L}" y="${T}" width="${x(P)-L}" height="${D1-T}" style="fill:var(--surface-2);opacity:.6"/>`:""}
    <text x="${W-R}" y="${D0-6}" text-anchor="end" style="fill:var(--muted)">różnica: zamiana − trzymanie</text>
    <path d="${area(1)}" style="fill:var(--ok);opacity:.22"/><path d="${area(-1)}" style="fill:var(--bad);opacity:.22"/>
    <path d="${dline}" fill="none" style="stroke:var(--ink-2)" stroke-width="1.6" stroke-linejoin="round"/>
    <line x1="${x(P)}" x2="${x(P)}" y1="${T-8}" y2="${D1}" style="stroke:var(--ink-2);stroke-width:1.2;stroke-dasharray:4 3"/>
    <text x="${x(P)}" y="${T-11}" text-anchor="${todayAnchor}" style="fill:var(--ink);font-weight:700">${calcIsToday()?"dziś · ":""}decyzja ${mShort(calcNow())}</text>
    ${P>0?`<text x="${L+6}" y="${T+14}" style="fill:var(--muted)">zakup ${mShort(pts[0].ym)}</text>`:""}
    ${macroPaths}
    ${histPath&&vis("hist")?`<path d="${histPath}" fill="none" stroke="var(--ink-2)" stroke-width="2.4" stroke-linejoin="round"/>`:""}
    ${vis("keep")?`<path d="${line(P,n-1,"keep")}" fill="none" stroke="var(--muted)" stroke-width="2.4" stroke-linejoin="round"/>`:""}
    ${vis("swap")?`<path d="${line(P,n-1,"swap")}" fill="none" stroke="var(--accent)" stroke-width="2.8" stroke-linejoin="round"/>`:""}
    ${evs.map((e,k)=>{const i=P+e.t,xe=x(i),right=i>n*0.7;return `<line x1="${xe}" x2="${xe}" y1="${T}" y2="${D1}" style="stroke:${e.color};stroke-width:1.6;stroke-dasharray:3 3"/><text x="${right?xe-5:xe+5}" y="${M1-8-k*15}" text-anchor="${right?"end":"start"}" style="fill:${e.color};font-weight:700;paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round">↻ ${esc(e.short)} → zamiana po ${e.priceTxt||"99,90"}</text>`}).join("")}
    ${vis("hist")?buys.map(z=>`<circle cx="${x(z.i)}" cy="${y(pts[z.i].keep)}" r="5" style="fill:var(--surface);stroke:var(--ink-2);stroke-width:2.2"/>`).join(""):""}
    <line class="zhov" x1="0" x2="0" y1="${T}" y2="${D1}" style="stroke:var(--muted);stroke-dasharray:2 3;visibility:hidden"/><g class="zpts"></g></svg><div class="tip" hidden></div>`;
  calcBindTips(el);
  chartLegendBind(el,k=>{state.calcVis[k]=!vis(k);drawCalcChart(r,oldCode,tgtCode,events,lab,purchases,macro)});
  el.querySelectorAll("button[data-range]").forEach(b=>b.addEventListener("click",()=>{state.calcRange=b.dataset.range;drawCalcChart(r,oldCode,tgtCode,events,lab,purchases,macro)}));
  const svg=el.querySelector("svg"),tip=el.querySelector(".tip"),hov=el.querySelector(".zhov"),dots=el.querySelector(".zpts");
  const docked=!!(window.matchMedia&&matchMedia("(max-width: 720px), (hover: none) and (pointer: coarse)").matches);tip.classList.toggle("docked",docked);
  const td=calcIsToday();
  const when=m=>m.t<0?`${Math.round(-m.t)} mies. ${td?"temu":"przed zerwaniem"}`:m.t===0?(td?"dziś":"zerwanie"):`${td?"za ":""}${m.t} mies.${td?"":" po zerwaniu"}`;
  const show=i=>{const m=pts[i];hov.setAttribute("x1",x(i));hov.setAttribute("x2",x(i));hov.style.visibility="visible";
    const hint=docked?'<span class="hint">dotknij wykresu, aby zmienić miesiąc</span>':"";
    const mRows=(showCpi?`<div class="tr"><span class="dot" style="background:var(--s-CPI)"></span>Wpłata + inflacja <span class="num">${zl0(m.cpi)}</span></div>`:"")+(showNbp?`<div class="tr"><span class="dot" style="background:var(--s-NBP)"></span>Wpłata na stopie NBP <span class="num">${zl0(m.nbp)}</span></div>`:"");
    const buyRows=buys.filter(z=>z.i===i).map(z=>`<div class="tr evrow" style="color:var(--ink)">＋ ${esc(z.p.text)}</div>`).join("");
    if(m.swap==null){
      dots.innerHTML=`<circle cx="${x(i)}" cy="${y(m.keep)}" r="4" fill="var(--ink-2)" style="stroke:var(--surface);stroke-width:1.5"/>`;
      tip.innerHTML=`<div class="tt">${mLabel(m.ym)} · ${when(m)}${hint}</div>${buyRows}<div class="tr"><span class="dot" style="background:var(--ink-2)"></span><b>${esc(oldCode)}</b> <span class="num">${zl0(m.keep)}</span></div><div class="tr" style="color:var(--muted)">przed decyzją — wartość posiadanych obligacji</div>${mRows}`;
    }else{
      dots.innerHTML=`<circle cx="${x(i)}" cy="${y(m.keep)}" r="4" fill="var(--muted)" style="stroke:var(--surface);stroke-width:1.5"/><circle cx="${x(i)}" cy="${y(m.swap)}" r="4" fill="var(--accent)" style="stroke:var(--surface);stroke-width:1.5"/><circle cx="${x(i)}" cy="${dy(m.diff)}" r="3.5" fill="${m.diff>=0?"var(--ok)":"var(--bad)"}" style="stroke:var(--surface);stroke-width:1.5"/>`;
      const evRows=events.filter(e=>P+e.t===i).map(e=>`<div class="tr evrow" style="color:${e.color||"var(--accent-ink)"}">↻ ${esc(e.text)}</div>`).join("");
      tip.innerHTML=`<div class="tt">${mLabel(m.ym)} · ${when(m)}${hint}</div>${buyRows}${evRows}<div class="tr"><span class="dot" style="background:var(--muted)"></span><b>${esc(docked?"Trzymam":lab.keep)}</b> <span class="num">${zl0(m.keep)}</span></div><div class="tr"><span class="dot" style="background:var(--accent)"></span><b>${esc(docked?"Zamieniam":lab.swap)}</b> <span class="num">${zl0(m.swap)}</span></div><div class="tr"><b>Różnica</b> <span class="num ${m.diff>=0?"d-up":"d-down"}">${sgn(m.diff)}</span></div>${mRows}`;
    }
    tip.hidden=false;if(docked)return;const rr=svg.getBoundingClientRect(),er=el.getBoundingClientRect();const px=x(i)/W*rr.width+(rr.left-er.left);const tw=tip.offsetWidth;let left=px+14;if(left+tw>er.width-4)left=px-14-tw;if(left<4)left=4;tip.style.left=left+"px";tip.style.top=(rr.top-er.top+10)+"px"};
  const idx=cx=>{const rr=svg.getBoundingClientRect();const sx=(cx-rr.left)*W/rr.width;return Math.max(0,Math.min(n-1,Math.round((sx-L)/((W-L-R)/(n-1)))))};
  svg.addEventListener("mousemove",e=>show(idx(e.clientX)));svg.addEventListener("mouseleave",()=>{if(docked)return;tip.hidden=true;hov.style.visibility="hidden";dots.innerHTML=""});
  svg.addEventListener("touchstart",e=>show(idx(e.touches[0].clientX)),{passive:true});svg.addEventListener("touchmove",e=>show(idx(e.touches[0].clientX)),{passive:true});
  if(docked)show(n-1);
}
