/* Rejestr ofert obligacji — stan, narzędzia i widoki: Oferta miesiąca, Wykres w czasie, Historia serii. Ładowany przez index.html (bez kroku budowania). */
const SERIES=["OTS","ROR","DOR","TOS","COI","EDO","ROS","ROD"];
const LEGACY={DOS:"#8f7b5a",TOZ:"#5e8f8a"};
const state={months:[],view:"oferta",month:null,serie:"EDO",chartMode:"rate1",chartOn:new Set(["TOS","COI","EDO","ROD","CPI","NBP"]),loaded:false,dbOk:true};
const $=s=>document.querySelector(s);
// objaśnienia „?” w zakładkach Oferta, Wykres i Historia serii (wyświetla calcTip z js/kalkulator.js)
const VIEW_TIPS={
  o_rate1:"Oprocentowanie w 1. okresie odsetkowym z listu emisyjnego: przez rok (ROR i DOR — przez miesiąc, OTS — przez 3 miesiące).",
  o_delta:"Zmiana oprocentowania 1. okresu względem oferty z poprzedniego miesiąca, w punktach procentowych.",
  o_next:"Jak liczone jest oprocentowanie od 2. okresu: stałe przez cały czas, inflacja (CPI) + marża albo stopa referencyjna NBP + marża.",
  o_cap:"Roczna — odsetki co rok dopisywane do kapitału (procent składany), wypłata przy wykupie. Brak — odsetki liczone zawsze od 100 zł.",
  o_pay:"Kiedy dostajesz odsetki: przy wykupie, co rok (kupon) albo co miesiąc.",
  o_fee:"Opłata za przedterminowy wykup, za każdą sztukę. Zwykle nie wyższa niż narosłe odsetki, więc nie stracisz z wpłaconych 100 zł (wyjątek: ROR i DOR od 2. miesiąca).",
  o_swap:"Cena nowej obligacji przy zamianie w dniu wykupu starej — zwykle 99,90 zł zamiast 100 zł (OTS: 100,00 zł). ROS i ROD nie mają ceny zamiany.",
  o_avail:"Kto może kupić serię: wszyscy albo tylko beneficjenci programu 800+ (obligacje rodzinne ROS i ROD).",
  mode:"Co pokazuje wykres: oprocentowanie 1. okresu z listów emisyjnych, samą marżę ponad wskaźnik albo orientacyjne oprocentowanie kolejnych okresów (CPI lub stopa NBP z rekordu miesiąca + marża).",
  s_cpi:"Inflacja CPI r/r z GUS za miesiąc poprzedzający ofertę (ostatni odczyt znany w chwili emisji).",
  s_nbp:"Stopa referencyjna NBP obowiązująca 1. dnia miesiąca oferty.",
  s_real:"Oprocentowanie 1. okresu minus ostatni odczyt CPI z rekordu miesiąca, przed podatkiem Belki — orientacyjnie, czy start był ponad inflacją.",
  so_val:"Ile jest warta obligacja kupiona za 100 zł w miesiącu emisji: przy wykupie w terminie albo dziś (seria w trakcie), z kuponami wypłaconymi po drodze (bez ich oprocentowania).",
  so_ann:"Średnia roczna stopa zwrotu w tym czasie (procent składany).",
  so_infl:"Skumulowana inflacja od zakupu do wykupu albo do dziś — orientacyjnie, z miesięcznych odczytów CPI r/r z GUS (najnowsze brakujące = ostatni znany).",
  so_real:"Wynik po uwzględnieniu inflacji: powyżej zera — obligacja pobiła inflację, poniżej — straciła siłę nabywczą."
};
const fmt=(v,d=2)=>v==null||v===""||isNaN(v)?"–":Number(v).toFixed(d).replace(".",",");
const pct=v=>v==null?"–":fmt(v)+"%";
const zl=v=>v==null?"–":(typeof v==="number"?fmt(v)+" zł":String(v));
const MONTHS=["styczeń","luty","marzec","kwiecień","maj","czerwiec","lipiec","sierpień","wrzesień","październik","listopad","grudzień"];
const mLabel=id=>{const [y,m]=id.split("-");return MONTHS[+m-1]+" "+y};
const mShort=id=>{const [y,m]=id.split("-");return m+"."+y};
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const cssVar=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const colorOf=k=>cssVar("--s-"+k)||LEGACY[k]||"#888";
function seriesKeys(rec){const s=rec?.series||{};const ks=Object.keys(s);return [...SERIES.filter(k=>ks.includes(k)),...ks.filter(k=>!SERIES.includes(k)).sort()]}
function statusPill(st){if(st==="zweryfikowany")return '<span class="pill p-ok">zweryfikowany</span>';if(st==="częściowo")return '<span class="pill p-part">częściowo</span>';return '<span class="pill p-warn">do weryfikacji</span>'}
function ruleText(s){if(!s)return"–";const r=s.rule||"";if(r==="stałe")return"stałe";const m=s.margin==null?"?":fmt(s.margin);if(r==="NBP+marża")return"stopa ref. NBP + "+m+" p.p.";if(r==="CPI+marża")return"inflacja + "+m+" p.p.";return esc(r)}
function prevOf(id){const i=state.months.findIndex(m=>m.id===id);return i>0?state.months[i-1]:null}
function delta(a,b){if(a==null||b==null)return'<span class="d-0">–</span>';const d=Math.round((a-b)*100)/100;if(d===0)return'<span class="d-0">0,00</span>';return d>0?'<span class="d-up">+'+fmt(d)+'</span>':'<span class="d-down">−'+fmt(-d)+'</span>'}

// na wąskim ekranie pasek zakładek się przewija — aktywna zakładka zawsze widoczna
function tabIntoView(){const b=document.querySelector('nav.tabs button[aria-selected="true"]'),n=b&&b.parentElement;if(!n||n.scrollWidth<=n.clientWidth)return;
  const l=b.offsetLeft-n.offsetLeft,r=l+b.offsetWidth;if(l<n.scrollLeft)n.scrollLeft=l-8;else if(r>n.scrollLeft+n.clientWidth)n.scrollLeft=r-n.clientWidth+8}
function setView(v){state.view=v;document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.view===v)));tabIntoView();try{history.replaceState(null,"","#"+(v==="zamiana"&&state.calc?calcHash(state.calc):v==="kupno"&&state.buy?buyHash(state.buy):v==="portfel"&&state.pf?pfHash(state.pf):v==="seria"?seriaHash():v))}catch(e){}render()}
document.querySelectorAll("nav.tabs button").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));

function render(){
  const main=$("#main");
  if(!state.dbOk){main.innerHTML='<div class="empty"><strong>Nie udało się wczytać pliku data/months.json</strong>Sprawdź, czy plik istnieje w repozytorium i jest poprawnym JSON-em (python3 scripts/validate.py).</div>';return}
  if(!state.loaded)return;
  tabIntoView();
  if(!state.months.length){main.innerHTML='<div class="empty"><strong>Archiwum jest puste</strong>Dodaj pierwszy miesiąc do data/months.json.</div>';return}
  if(!state.month||!state.months.find(m=>m.id===state.month))state.month=state.months[state.months.length-1].id;
  const reload='<button type="button" class="btn" onclick="location.reload()">Odśwież stronę</button>';
  try{({oferta:renderOffer,wykres:renderChart,seria:renderSeries,zamiana:renderCalc,kupno:renderBuy,portfel:renderPortfolio}[state.view]||renderOffer)(main)}
  catch(e){console.error(e);main.innerHTML=`<div class="empty"><strong>Nie udało się wyświetlić tego widoku</strong>Spróbuj odświeżyć stronę (Ctrl+F5). Jeśli błąd się powtarza, zgłoś go na GitHubie i podaj adres strony. <span class="small">(${esc(e.message)})</span><div class="row" style="margin-top:12px">${reload}</div></div>`}
}

function monthSelect(id){return `<label class="field"><span class="flabel">Miesiąc oferty</span><span class="sel"><select id="sel-month">${[...state.months].reverse().map(m=>`<option value="${m.id}"${m.id===id?" selected":""}>${mLabel(m.id)}</option>`).join("")}</select></span></label>`}

function renderOffer(main){
  const rec=state.months.find(m=>m.id===state.month),prev=prevOf(rec.id);
  const rows=seriesKeys(rec).map(k=>{const s=rec.series[k];const p=prev?.series?.[k];
    const src=s.source?`<a class="ext" href="${esc(s.source)}" target="_blank" rel="noopener" title="List emisyjny">list ↗</a>`:"–";
    return `<tr><td><span class="dot" style="background:${colorOf(k)}"></span><span class="code">${esc(s.code||k)}</span>${s.verify?' <span class="pill p-warn" title="'+esc(s.verifyNote||"")+'">sprawdzić</span>':""}</td>
      <td>${esc(s.term||"–")}</td><td class="r num"><b>${pct(s.rate1)}</b></td><td class="r num">${delta(s.rate1,p?.rate1)}</td>
      <td>${ruleText(s)}</td><td>${s.capitalization==="roczna"?'<span class="pill p-warn">roczna</span>':esc(s.capitalization||"–")}</td><td>${esc(s.payout||"–")}</td>
      <td class="r num">${zl(s.fee)}</td><td class="r num">${zl(s.swapPrice)}</td><td>${s.availability&&s.availability!=="wszyscy"?'<span class="pill p-part">'+esc(s.availability.replace(/^tylko beneficjenci /,"tylko "))+'</span>':"wszyscy"}</td>
      <td>${src}</td></tr>`}).join("");
  const ranked=seriesKeys(rec).map(k=>[k,rec.series[k].rate1]).filter(x=>x[1]!=null).sort((a,b)=>b[1]-a[1]);
  const best=ranked[0];
  const isOpen=k=>{const a=rec.series[k].availability;return !a||a==="wszyscy"};
  const real=r=>{if(rec.cpi==null)return"";const d=Math.round((r-rec.cpi)*100)/100;return `realnie ${fmt(Math.abs(d))} p.p. ${d>=0?"ponad":"poniżej"} CPI`};
  const avail=k=>isOpen(k)?"":' <span class="pill p-part">'+esc(rec.series[k].availability.replace(/^tylko beneficjenci /,"tylko "))+'</span>';
  const bestSub=best?`${esc(rec.series[best[0]].code||best[0])} · ${esc(rec.series[best[0]].term||"")}${avail(best[0])}${rec.cpi!=null?"<br>"+real(best[1]):""}`    +(rec.cpi!=null?`<br><span class="hint">„Realnie” = 1. okres minus ostatni odczyt CPI z rekordu; przed podatkiem Belki, wskaźnik orientacyjny.</span>`:""):"";
  main.innerHTML=`<div class="vlist">
    <div class="sec-head"><div><p class="kicker">§ 1 · oferta miesiąca</p><h2>Oferta na <span class="acc">${mLabel(rec.id)}</span></h2><p class="desc">${seriesKeys(rec).length} serii w ofercie · rekord ${statusPill(rec.status)}</p></div>${monthSelect(rec.id)}</div>
    <div class="stats">
      <div class="stat t-acc"><span class="k">Stopa referencyjna NBP</span><span class="v">${pct(rec.nbpRef)}</span><span class="s">${esc(rec.nbpNote||"obowiązująca 1. dnia miesiąca")}</span></div>
      <div class="stat t-red"><span class="k">Inflacja CPI r/r ${rec.cpiRefMonth?"za "+mShort(rec.cpiRefMonth):""}</span><span class="v v-red">${pct(rec.cpi)}</span><span class="s">${rec.cpiKind?'<span class="pill '+(rec.cpiKind==="finalny"?"p-ok":"p-warn")+'">'+esc(rec.cpiKind)+'</span> ':""}${esc(rec.cpiNote||"")}</span></div>
      <div class="stat t-green"><span class="k">Najwyższe oprocentowanie 1. okresu</span><span class="v v-green">${best?pct(best[1]):"–"}</span><span class="s">${bestSub}</span></div>
      <div class="stat t-gold"><span class="k">Porównanie z</span><span class="v sm">${prev?mLabel(prev.id):"brak rekordu"}</span><span class="s">Kolumna Δ m/m w tabeli: zmiana oprocentowania 1. okresu w p.p.</span></div>
    </div>
    ${rec.changeNote?`<div class="insight"><span class="t">zmiany m/m</span>${esc(rec.changeNote)}</div>`:""}
    ${rec.verifyNote?`<div class="insight warn"><span class="t">do sprawdzenia</span>${esc(rec.verifyNote)}</div>`:""}
    <div class="card table-card"><div class="frame"><table><thead><tr><th>Seria</th><th>Okres</th><th class="r">1. okres${calcTip("o_rate1",1)}</th><th class="r">Δ m/m${calcTip("o_delta",1)}</th><th>Kolejne okresy${calcTip("o_next",1)}</th><th>Kapitalizacja${calcTip("o_cap",1)}</th><th>Wypłata odsetek${calcTip("o_pay",1)}</th><th class="r">Opłata${calcTip("o_fee",1)}</th><th class="r">Zamiana${calcTip("o_swap",1)}</th><th>Dostępność${calcTip("o_avail",1)}</th><th>Źródło</th></tr></thead><tbody>${rows||'<tr><td colspan="11">Brak serii w rekordzie.</td></tr>'}</tbody></table></div></div>
  </div>`;
  $("#sel-month").addEventListener("change",e=>{state.month=e.target.value;render()});
  calcBindTips(main);
}

function renderChart(main){
  const keys=[...SERIES,"DOS","TOZ","CPI","NBP"];
  const chips=keys.map(k=>`<label class="chip"><input type="checkbox" id="c-${k}" data-k="${k}"${state.chartOn.has(k)?" checked":""}><span class="dot" style="background:${colorOf(k)}"></span>${k==="CPI"?"CPI r/r":k==="NBP"?"stopa NBP":k}${k==="DOS"||k==="TOZ"?' <span class="sub">(do 2022)</span>':""}</label>`).join("");
  main.innerHTML=`<div class="card">
    <div class="sec-head"><div><p class="kicker">§ 2 · wykres</p><h2>Oprocentowanie w czasie</h2><p class="desc">Wybrane serie miesiąc po miesiącu na tle inflacji (CPI r/r) i stopy referencyjnej NBP. Najedź na wykres, aby zobaczyć wartości.</p></div>
      <label class="field"><span class="flabel">Miara${calcTip("mode")}</span><span class="sel"><select id="sel-mode"><option value="rate1"${state.chartMode==="rate1"?" selected":""}>Oprocentowanie 1. okresu</option><option value="margin"${state.chartMode==="margin"?" selected":""}>Marża (kolejne okresy)</option><option value="next"${state.chartMode==="next"?" selected":""}>Oprocentowanie kolejnych okresów</option></select></span></label></div>
    <div class="chips" style="margin-top:20px">${chips}</div>
    <div class="chart" id="chart"></div>
    <div class="notes">
    <p class="small"><b>Oprocentowanie 1. okresu</b> – stawka z listu emisyjnego. <b>Marża</b> – sama nadwyżka ponad wskaźnik (bez CPI/NBP). <b>Oprocentowanie kolejnych okresów</b> – orientacyjnie: CPI z rekordu miesiąca (ujemne = 0) + marża dla serii inflacyjnych, stopa NBP + marża dla ROR/DOR, stała stawka dla OTS/DOS/TOS; TOZ (WIBOR6M) bez wartości, bo archiwum nie przechowuje WIBOR. Realne oprocentowanie 2. okresu zależy od CPI w chwili jego rozpoczęcia.</p>
    <p class="small">Linie przerywane: CPI r/r (odczyt za miesiąc poprzedzający ofertę) i stopa referencyjna NBP. Przerwy w linii oznaczają brak danych w rekordzie, nie zero.</p></div></div>`;
  $("#sel-mode").addEventListener("change",e=>{state.chartMode=e.target.value;drawChart()});
  main.querySelectorAll(".chips input").forEach(i=>i.addEventListener("change",e=>{const k=e.target.dataset.k;e.target.checked?state.chartOn.add(k):state.chartOn.delete(k);drawChart()}));
  calcBindTips(main);
  drawChart();
}
function chartVal(m,k){const s=m.series?.[k];if(!s)return null;const mode=state.chartMode;
  if(mode==="rate1")return s.rate1??null;
  if(mode==="margin")return s.margin??null;
  const r=s.rule||"";
  if(r==="stałe")return s.rate1??null;
  if(r==="CPI+marża")return(m.cpi!=null&&s.margin!=null)?Math.round((Math.max(m.cpi,0)+s.margin)*100)/100:null;
  if(r==="NBP+marża")return(m.nbpRef!=null&&s.margin!=null)?Math.round((m.nbpRef+s.margin)*100)/100:null;
  return null}
function tipDetail(m,k){
  if(k==="CPI")return m.cpiRefMonth?"odczyt za "+mShort(m.cpiRefMonth)+(m.cpiKind?", "+esc(m.cpiKind):""):"";
  if(k==="NBP")return "stopa referencyjna z 1. dnia miesiąca"+(m.nbpNote&&/od \d/.test(m.nbpNote)?"":"");
  const s=m.series?.[k];if(!s)return"";const mode=state.chartMode;let d=esc(s.code||k)+" · "+esc(s.term||"");
  if(mode==="next"){const r=s.rule;
    if(r==="CPI+marża"&&m.cpi!=null&&s.margin!=null)d+=" · CPI "+fmt(Math.max(m.cpi,0))+" + marża "+fmt(s.margin);
    else if(r==="NBP+marża"&&m.nbpRef!=null&&s.margin!=null)d+=" · NBP "+fmt(m.nbpRef)+" + marża "+fmt(s.margin);
    else if(r==="stałe")d+=" · stałe";
    d+=" · 1. okres "+pct(s.rate1)}
  else if(mode==="margin")d+=" · "+ruleText(s)+" · 1. okres "+pct(s.rate1);
  else d+=" · dalej: "+ruleText(s);
  return d}
function attachHover(el,lines,x,y,W,L,R){
  const svg=el.querySelector("svg"),tip=el.querySelector("#tip"),hov=el.querySelector("#hov"),hp=el.querySelector("#hovpts"),ms=state.months,n=ms.length;
  const unit=state.chartMode==="margin"?" p.p.":"%";
  const docked=!!(window.matchMedia&&matchMedia("(max-width: 720px), (hover: none) and (pointer: coarse)").matches);
  tip.classList.toggle("docked",docked);
  const hide=()=>{if(docked)return;tip.hidden=true;hov.style.visibility="hidden";hp.innerHTML=""};
  const idxAt=cx=>{const r=svg.getBoundingClientRect();const sx=(cx-r.left)*W/r.width;const i=n<=1?0:Math.round((sx-L)/((W-L-R)/(n-1)));return Math.max(0,Math.min(n-1,i))};
  const show=cx=>showIdx(idxAt(cx));
  const showIdx=i=>{const r=svg.getBoundingClientRect();const m=ms[i];
    const items=lines.map(l=>({l,v:l.pts[i]})).filter(o=>o.v!=null).sort((a,b)=>b.v-a.v);
    if(!items.length){hide();return}
    hov.setAttribute("x1",x(i));hov.setAttribute("x2",x(i));hov.style.visibility="visible";
    hp.innerHTML=items.map(o=>`<circle cx="${x(i)}" cy="${y(o.v)}" r="4" fill="${colorOf(o.l.k)}" style="stroke:var(--surface);stroke-width:1.5"/>`).join("");
    tip.innerHTML=`<div class="tt">${mLabel(m.id)}${docked?'<span class="hint">dotknij wykresu, aby zmienić miesiąc</span>':""}</div>`+items.map(o=>{const k=o.l.k,macro=k==="CPI"||k==="NBP";return `<div class="tr"><span class="dot" style="background:${colorOf(k)}"></span><b>${k==="CPI"?"CPI r/r":k==="NBP"?"Stopa NBP":k}</b> <span class="num">${fmt(o.v)}${macro?"%":unit}</span><div class="td">${tipDetail(m,k)}</div></div>`}).join("")+(m.status!=="zweryfikowany"?`<div class="td" style="margin-left:0">status rekordu: ${esc(m.status||"–")}</div>`:"");
    tip.hidden=false;
    if(docked){tip.style.left="";tip.style.top="";return}
    const er=el.getBoundingClientRect();const px=x(i)/W*r.width+(r.left-er.left);const tw=tip.offsetWidth;let left=px+14;if(left+tw>er.width-4)left=px-14-tw;if(left<4)left=4;tip.style.left=left+"px";tip.style.top="10px"};
  svg.addEventListener("mousemove",e=>show(e.clientX));svg.addEventListener("mouseleave",hide);
  svg.addEventListener("touchstart",e=>show(e.touches[0].clientX),{passive:true});svg.addEventListener("touchmove",e=>show(e.touches[0].clientX),{passive:true});
  if(docked){let last=n-1;while(last>0&&!lines.some(l=>l.pts[last]!=null))last--;showIdx(last)}
}
function drawChart(){
  const el=$("#chart");if(!el)return;
  const ms=state.months,n=ms.length;const W=Math.max(640,el.clientWidth||900),H=360,L=44,R=14,T=14,B=34;
  const lines=[];
  for(const k of state.chartOn){
    let pts;
    if(k==="CPI")pts=ms.map(m=>m.cpi);else if(k==="NBP")pts=ms.map(m=>m.nbpRef);
    else pts=ms.map(m=>chartVal(m,k));
    if(pts.some(v=>v!=null))lines.push({k,pts,dash:k==="CPI"||k==="NBP"});
  }
  const vals=lines.flatMap(l=>l.pts).filter(v=>v!=null);
  if(!vals.length){el.innerHTML='<div class="empty" style="border:0;padding:28px 0"><strong>Brak danych dla wybranych linii</strong>Zaznacz inne serie albo poczekaj, aż archiwum zostanie uzupełnione.</div>';return}
  let max=Math.max(...vals),min=Math.min(0,...vals);const step=max-min>12?4:max-min>6?2:max-min>3?1:0.5;max=Math.ceil(max/step)*step;min=Math.floor(min/step)*step;if(max===min)max=min+step;
  const x=i=>L+(n<=1?0:(W-L-R)*i/(n-1)),y=v=>T+(H-T-B)*(1-(v-min)/(max-min));
  let g="";for(let v=min;v<=max+1e-9;v+=step){g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--line-strong);stroke-width:1"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end">${fmt(v,step<1?1:0)}</text>`}
  const every=Math.max(1,Math.ceil(n/(W/70)));let xt="";
  ms.forEach((m,i)=>{const mm=m.id.slice(5);if((mm==="01"&&n>18)||(n<=18&&i%every===0)){xt+=`<line x1="${x(i)}" x2="${x(i)}" y1="${H-B}" y2="${H-B+4}" style="stroke:var(--muted)"/><text x="${x(i)}" y="${H-B+17}" text-anchor="middle">${n>18?m.id.slice(0,4):mShort(m.id)}</text>`}});
  let paths="";for(const l of lines){let d="",on=false;l.pts.forEach((v,i)=>{if(v==null){on=false;return}d+=(on?"L":"M")+x(i).toFixed(1)+" "+y(v).toFixed(1)+" ";on=true});
    const last=l.pts.length-1-[...l.pts].reverse().findIndex(v=>v!=null);
    paths+=`<path d="${d}" fill="none" stroke="${colorOf(l.k)}" stroke-width="${l.dash?1.8:2.6}" ${l.dash?'stroke-dasharray="6 5"':""} stroke-linecap="round" stroke-linejoin="round"/>`;
    paths+=`<circle cx="${x(last)}" cy="${y(l.pts[last])}" r="4" fill="${colorOf(l.k)}" style="stroke:var(--surface);stroke-width:2"/>`;
    if(n===1||l.pts.filter(v=>v!=null).length===1)l.pts.forEach((v,i)=>{if(v!=null)paths+=`<circle cx="${x(i)}" cy="${y(v)}" r="3.2" fill="${colorOf(l.k)}"/>`});}
  el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Wykres oprocentowania w czasie">${g}<line x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}" style="stroke:var(--line-strong)"/>${xt}${paths}<line id="hov" x1="0" x2="0" y1="${T}" y2="${H-B}" style="stroke:var(--muted);stroke-dasharray:2 3;visibility:hidden"/><g id="hovpts"></g><text x="${L}" y="${T-2}" text-anchor="start">%</text></svg><div class="tip" id="tip" hidden></div>`;
  attachHover(el,lines,x,y,W,L,R);
}

// Historia serii w adresie: #seria&s=KOD&w=1 (w=1 — tabela „Jak wypadła seria”)
function seriaHash(){const q=[];if(state.serie!=="EDO")q.push("s="+state.serie);if(state.serTab==="wynik")q.push("w=1");return ["seria"].concat(q).join("&")}
function renderSeries(main){
  if(!state.serHashRead){state.serHashRead=true;const parts=(location.hash||"").slice(1).split("&");
    if(parts[0]==="seria"){const q=Object.fromEntries(parts.slice(1).map(x=>x.split("=")));if(q.s)state.serie=q.s.toUpperCase();if(q.w==="1")state.serTab="wynik"}}
  const all=[...new Set(state.months.flatMap(seriesKeys))];const order=[...SERIES.filter(k=>all.includes(k)),...all.filter(k=>!SERIES.includes(k))];
  if(!order.includes(state.serie))state.serie=order[0];
  const k=state.serie,tab=state.serTab==="wynik"?"wynik":"oferty";
  try{history.replaceState(null,"","#"+seriaHash())}catch(e){}
  const rows=[...state.months].reverse().filter(m=>m.series?.[k]).map(m=>{const s=m.series[k];const p=prevOf(m.id)?.series?.[k];
    const rv=(s.rate1!=null&&m.cpi!=null)?Math.round((s.rate1-m.cpi)*100)/100:null;const real=rv==null?"–":`<span class="${rv>0?"d-up":rv<0?"d-down":"d-0"}">${rv>0?"+":rv<0?"−":""}${fmt(Math.abs(rv))}</span>`;
    return `<tr><td>${mLabel(m.id)}</td><td><span class="code">${esc(s.code||k)}</span>${s.verify?' <span class="pill p-warn">sprawdzić</span>':""}</td><td class="r num"><b>${pct(s.rate1)}</b></td><td class="r num">${delta(s.rate1,p?.rate1)}</td><td>${ruleText(s)}</td><td class="r num">${zl(s.fee)}</td><td class="r num">${zl(s.swapPrice)}</td><td class="r num">${pct(m.cpi)}</td><td class="r num">${pct(m.nbpRef)}</td><td class="r num">${real}</td></tr>`}).join("");
  const cur=state.months[state.months.length-1].series?.[k];const first=state.months.find(m=>m.series?.[k]);
  main.innerHTML=`<div class="vlist">
    <div class="sec-head"><div><p class="kicker">§ 3 · historia serii</p><h2>Seria <span class="acc">${esc(k)}</span>${cur?.term?` <span style="color:var(--muted);font-weight:500;font-size:.75em">· ${esc(cur.term)}</span>`:""}</h2><p class="desc">${tab==="wynik"?"Ile dała obligacja kupiona w każdej emisji tej serii: do wykupu w terminie albo do dziś, na tle inflacji w tym samym czasie.":"Każdy miesiąc oferty tej serii, od najnowszego. Ostatnia kolumna to orientacyjne realne oprocentowanie 1. okresu: stawka minus ostatni odczyt CPI z rekordu miesiąca, przed podatkiem Belki."}${first?" Pierwszy rekord: "+mLabel(first.id)+".":""}</p></div></div>
    <div class="chips" role="group" aria-label="Widok"><button type="button" class="chip" data-stab="oferty" aria-pressed="${tab==="oferty"}">Oferty miesiąc po miesiącu</button><button type="button" class="chip" data-stab="wynik" aria-pressed="${tab==="wynik"}">Jak wypadła seria — 100 zł od zakupu</button></div>
    <div class="chips" role="group" aria-label="Wybór serii">${order.map(s=>`<button type="button" class="chip" data-s="${s}" aria-pressed="${s===k}"><span class="dot" style="background:${colorOf(s)}"></span>${s}${s==="DOS"||s==="TOZ"?' <span class="sub">do 2022</span>':""}</button>`).join("")}</div>
    ${tab==="wynik"?seriesOutcomeHtml(k):`<div class="card table-card"><div class="frame"><table><thead><tr><th>Miesiąc oferty</th><th>Kod</th><th class="r">1. okres</th><th class="r">Δ m/m</th><th>Kolejne okresy</th><th class="r">Opłata</th><th class="r">Zamiana</th><th class="r">CPI r/r${calcTip("s_cpi",1)}</th><th class="r">NBP${calcTip("s_nbp",1)}</th><th class="r">1. okres − CPI${calcTip("s_real",1)}</th></tr></thead><tbody>${rows||'<tr><td colspan="10">Brak rekordów tej serii.</td></tr>'}</tbody></table></div></div>`}</div>`;
  main.querySelectorAll("button.chip[data-s]").forEach(b=>b.addEventListener("click",()=>{state.serie=b.dataset.s;render()}));
  main.querySelectorAll("button.chip[data-stab]").forEach(b=>b.addEventListener("click",()=>{state.serTab=b.dataset.stab;render()}));
  main.querySelectorAll("button.chip[data-sov]").forEach(b=>b.addEventListener("click",()=>{state.serOut.val=b.dataset.sov;render()}));
  main.querySelectorAll("button.chip[data-sot]").forEach(b=>b.addEventListener("click",()=>{state.serOut.tax=b.dataset.sot==="1";render()}));
  calcBindTips(main);
}
// „Jak wypadła seria”: 100 zł w każdej emisji wybranej serii — do wykupu w terminie albo do dziś (Zamiana.seriesOutcome)
function seriesOutcomeHtml(k){
  if(!Zamiana.TYPES[k])return `<div class="insight"><span class="t">jak wypadła seria</span>Wyniku ${esc(k)} nie liczymy: oprocentowanie zależało od WIBOR6M, którego archiwum nie przechowuje.</div>`;
  state.serOut=state.serOut||{val:"hold",tax:true};const o=state.serOut,now=state.months[state.months.length-1].id;
  const cpiHistory=calcCpiHist(),nbpHistory=Zamiana.nbpHistoryFromMonths(state.raw);
  const em=state.months.filter(m=>m.series?.[k]).map(m=>({id:m.id,s:m.series[k]}))
    .concat(Object.entries(calcPre().series||{}).filter(([,s])=>s.type===k).map(([code,s])=>({id:s.purchase,s:Object.assign({code},s),pre:true})));
  const rows=em.map(e=>{const s=e.s,r=Zamiana.seriesOutcome({spec:{type:k,rate1:+s.rate1,margin:+(s.margin??0),fee:typeof s.fee==="number"?s.fee:0,purchase:e.id},
      now,cpiHistory,nbpHistory,tax:o.tax,valuation:o.val==="liq"?"liquidate":"hold"});return r&&Object.assign(r,{id:e.id,code:s.code||k,pre:e.pre})}).filter(Boolean).sort((a,b)=>a.id<b.id?1:-1);
  if(!rows.length)return "";
  const p1=v=>(v>0?"+":v<0?"−":"")+fmt(Math.abs(v*100))+"%",cls=v=>v>0.00005?"d-up":v<-0.00005?"d-down":"d-0";
  const beat=rows.filter(r=>r.real>0).length,best=rows.reduce((a,b)=>b.real>a.real?b:a),worst=rows.reduce((a,b)=>b.real<a.real?b:a);
  const live=rows.some(r=>!r.matured);
  return `<div class="card table-card"><div class="tc-head"><h3>Jak wypadła seria ${esc(k)}</h3><p class="desc">Obligacja za 100 zł kupiona w każdej emisji ${esc(k)}: wynik ${live?`do ${mLabel(now)} (serie w trakcie) albo `:""}do wykupu w terminie, ${o.tax?"po podatku Belki":"bez podatku (IKE / IKZE)"}, na tle inflacji w tym samym czasie. Inflację pobiło <b>${beat} z ${rows.length}</b> emisji; najlepiej realnie ${esc(best.code)} (${p1(best.real)}), najsłabiej ${esc(worst.code)} (${p1(worst.real)}).</p>
      <div class="row" style="margin-top:10px">${live?`<div class="chips" role="group" aria-label="Wycena serii w trakcie"><button type="button" class="chip" data-sov="hold" aria-pressed="${o.val!=="liq"}">w trakcie: wartość bez opłaty</button><button type="button" class="chip" data-sov="liq" aria-pressed="${o.val==="liq"}">w trakcie: wypłata dziś (z opłatą)</button></div>`:""}
        <div class="chips" role="group" aria-label="Podatek"><button type="button" class="chip" data-sot="1" aria-pressed="${o.tax}">po podatku Belki</button><button type="button" class="chip" data-sot="0" aria-pressed="${!o.tax}">IKE / IKZE</button></div></div></div>
    <div class="frame"><table><thead><tr><th>Emisja</th><th>Kod</th><th>Stan</th><th class="r">100 zł →${calcTip("so_val",1)}</th><th class="r">Rocznie${calcTip("so_ann",1)}</th><th class="r">Inflacja w tym czasie${calcTip("so_infl",1)}</th><th class="r">Realnie${calcTip("so_real",1)}</th><th class="r">Realnie rocznie</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td>${mLabel(r.id)}${r.pre?' <span class="small">(sprzed archiwum)</span>':""}</td><td><span class="code">${esc(r.code)}</span></td><td>${r.matured?`wykup ${mShort(r.maturity)}`:`<span class="pill p-part">trwa</span> ${r.age} mies.`}</td>
      <td class="r num"><b>${zl2(r.total)}</b></td><td class="r num">${p1(r.annual)}</td><td class="r num">${p1(r.inflation)}</td><td class="r num"><b class="${cls(r.real)}">${p1(r.real)}</b></td><td class="r num"><span class="${cls(r.realAnnual)}">${p1(r.realAnnual)}</span></td></tr>`).join("")}
    </tbody></table></div></div>`;
}
