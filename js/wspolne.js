/* Rejestr ofert obligacji — wspólne elementy widoków: dymki „?” z objaśnieniami (calcTip, calcBindTips) i przycisk
   „Wyczyść ustawienia” z cofnięciem. Ładowany po app.js, przed widokami (bez kroku budowania). Nazwy calcTip/calcBindTips
   zostały z czasów, gdy dymki były tylko w kalkulatorze; CALC_TIPS (pola kalkulatorów) definiuje kalkulator.js. */

// objaśnienia „?” w zakładkach Oferta, Wykres i Historia serii (pola kalkulatorów: CALC_TIPS w kalkulator.js, kupno.js, portfel.js)
const VIEW_TIPS={
  o_rate1:"Oprocentowanie w 1. okresie odsetkowym z listu emisyjnego: przez rok (ROR i DOR — przez miesiąc, OTS — przez 3 miesiące).",
  o_delta:"Zmiana oprocentowania 1. okresu względem oferty z poprzedniego miesiąca, w punktach procentowych.",
  o_next:"Jak liczone jest oprocentowanie od 2. okresu: stałe przez cały czas, inflacja (CPI) + marża albo stopa referencyjna NBP + marża.",
  o_cap:"Roczna — odsetki co rok dopisywane do kapitału (procent składany), wypłata przy wykupie. Brak — odsetki liczone zawsze od 100 zł.",
  o_pay:"Kiedy dostajesz odsetki: przy wykupie, co rok (kupon) albo co miesiąc.",
  o_fee:"Opłata za przedterminowy wykup, za każdą sztukę. Zwykle nie wyższa niż narosłe odsetki, więc nie stracisz z wpłaconych 100 zł. Wyjątki: COI od 2. roku oraz ROR i DOR od 2. miesiąca — tam opłata jest stała, także gdy przekracza narosłe odsetki (wypłata może być niższa niż 100 zł za sztukę).",
  o_swap:"Cena nowej obligacji przy zamianie w dniu wykupu starej — zwykle 99,90 zł zamiast 100 zł (OTS: 100,00 zł). ROS i ROD nie mają ceny zamiany.",
  o_avail:"Kto może kupić serię: wszyscy albo tylko beneficjenci programu 800+ (obligacje rodzinne ROS i ROD).",
  mode:"Co pokazuje wykres: oprocentowanie 1. okresu z listów emisyjnych, samą marżę ponad wskaźnik albo faktyczne oprocentowanie 2. roku z późniejszych odczytów CPI i stóp NBP.",
  s_cpi:"Inflacja CPI r/r z GUS za miesiąc poprzedzający ofertę (ostatni odczyt znany w chwili emisji).",
  s_nbp:"Stopa referencyjna NBP obowiązująca 1. dnia miesiąca oferty.",
  s_real:"Oprocentowanie 1. okresu minus ostatni odczyt CPI z rekordu miesiąca, przed podatkiem Belki — orientacyjnie, czy start był ponad inflacją.",
  so_val:"Ile jest warta obligacja kupiona za 100 zł w miesiącu emisji: przy wykupie w terminie albo dziś (seria w trakcie), z kuponami wypłaconymi po drodze (bez ich oprocentowania).",
  so_ann:"Średnia roczna stopa zwrotu w tym czasie (procent składany).",
  so_infl:"Zmiana cen od miesiąca zakupu do wykupu albo do dziś — z poziomu cen GUS (łańcuch wskaźników „grudzień poprzedniego roku = 100”; dla roku od grudnia do grudnia to dokładnie oficjalna inflacja). Najnowsze miesiące bez odczytu GUS — z ostatniego wskaźnika r/r. Gdy okres nie kończy się w grudniu, wynik może się różnić od wskaźnika r/r o kilka dziesiątych punktu (najbardziej na początku roku), bo GUS co roku zmienia wagi koszyka.",
  so_real:"Wynik po uwzględnieniu inflacji: powyżej zera — obligacja pobiła inflację, poniżej — straciła siłę nabywczą."
};
// objaśnienia: pola kalkulatorów (CALC_TIPS, uzupełniane w kupno.js i portfel.js) i pozostałych widoków (VIEW_TIPS w app.js)
const calcTip=(k,down)=>{const t=CALC_TIPS[k]||VIEW_TIPS[k];return t?`<span class="qtip${down?" down":""}" tabindex="0" role="button" aria-label="Wyjaśnienie: ${esc(t)}">?<span class="qtip-b" role="tooltip">${esc(t)}</span></span>`:""};
// dotknięcie na telefonie: pokaż/ukryj dymek; nie aktywuj pola, do którego należy etykieta; dymek nie wychodzi poza ekran
function calcBindTips(root){root.querySelectorAll(".qtip").forEach(q=>{
  const fit=()=>{const b=q.querySelector(".qtip-b");
    // w tabelach i kafelkach (kontenery z przycinaniem treści) dymek pozycjonujemy względem okna, pod ikoną
    if(q.closest(".frame,.stats")){const r=q.getBoundingClientRect(),W=document.documentElement.clientWidth;b.style.position="fixed";b.style.transform="none";b.style.bottom="auto";
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
// ustawienia z adresu, których nie dało się wczytać (nieznana seria, okres, typ…): state.linkWarn[widok] = [teksty];
// komunikat pokazujemy raz, przy pierwszym wyświetleniu widoku, zamiast cicho przechodzić na ustawienia domyślne
// okno przedterminowego wykupu (Zamiana.redeemWindow): krótki opis, gdy w danym dniu nie można zerwać serii
const isoDmy=s=>s.split("-").reverse().join(".");
const redeemTxt=w=>w.reason==="early"?`dyspozycję przedterminowego wykupu można złożyć od ${isoDmy(w.from)} (po 7 dniach od zakupu)`
  :`do wykupu w terminie (${isoDmy(w.maturity)}) zostało mniej niż 20 dni — przedterminowego wykupu nie można już zlecić`;
function linkWarnSet(view,list){if(list&&list.length){state.linkWarn=state.linkWarn||{};state.linkWarn[view]=list}}
function linkWarnHtml(view){const l=state.linkWarn&&state.linkWarn[view];if(!l)return "";delete state.linkWarn[view];
  return `<div class="insight warn" role="status"><span class="t">nie wszystko z linku dało się wczytać</span>${l.map(esc).join("<br>")}</div>`}
// skrót do wyniku (kalkulator zamiany, „Co kupić?”): przyklejony pasek z werdyktem, widoczny, dopóki werdykt jest poniżej
// widocznej części ekranu; kliknięcie przewija do wyniku. Wywołanie po każdym przeliczeniu; bez werdyktu — pasek znika.
let peekObs=null;
function resultPeekClear(){if(peekObs){peekObs.disconnect();peekObs=null}const b=document.getElementById("peek");if(b)b.remove()}
function resultPeekBind(outSel){
  const v=document.querySelector(outSel+" .verdict");
  if(peekObs){peekObs.disconnect();peekObs=null}
  let bar=document.getElementById("peek");
  if(!v||!("IntersectionObserver" in window)){if(bar)bar.remove();return}
  if(!bar){bar=document.createElement("button");bar.id="peek";bar.type="button";bar.className="peek";bar.hidden=true;document.body.appendChild(bar)}
  const vt=v.querySelector(".vt"),txt=vt?[...vt.childNodes].filter(n=>!(n.classList&&n.classList.contains("was"))).map(n=>n.textContent).join("").trim():"";
  bar.innerHTML=`<span class="peek-t">${esc(txt)}</span><span class="peek-go">wynik ↓</span>`;
  bar.setAttribute("aria-label","Przejdź do wyniku: "+txt);
  bar.classList.toggle("good",v.classList.contains("good"));bar.classList.toggle("bad",v.classList.contains("bad"));
  bar.onclick=()=>v.scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
  peekObs=new IntersectionObserver(([e])=>{bar.hidden=e.isIntersecting||e.boundingClientRect.top<0},{threshold:0});
  peekObs.observe(v);
}
// „Wyczyść ustawienia” z cofnięciem (kalkulator zamiany, Co kupić?, Mój portfel): id `${p}-reset` i `${p}-undo`
const resetRowHtml=(p,isDef,undo,what)=>`<div class="row"><button type="button" class="btn" id="${p}-reset"${isDef?" disabled":""} title="${isDef?"Ustawienia są domyślne":"Przywróć ustawienia jak przy pierwszym wejściu: "+what}">↺ Wyczyść ustawienia</button>${undo?`<span class="small" role="status">Wyczyszczono. <button type="button" class="linkbtn" id="${p}-undo">Cofnij</button></span>`:""}</div>`;
// stan widoku w state[key] (+ legenda wykresu state[visKey]); fresh() — stan domyślny; render() — przerysowanie
function viewReset(key,visKey,fresh,render){state[key+"Undo"]={v:JSON.parse(JSON.stringify(state[key])),vis:visKey?Object.assign({},state[visKey]||{}):null};state[key+"UndoFresh"]=true;
  state[key]=fresh();if(visKey)state[visKey]={};render()}
function viewUndo(key,visKey,render){const u=state[key+"Undo"];if(!u)return;state[key]=u.v;if(visKey)state[visKey]=u.vis;state[key+"Undo"]=null;render()}
// cofnięcie pokazujemy tylko w widoku tuż po wyczyszczeniu
function viewUndoShown(key){const u=state[key+"UndoFresh"]?state[key+"Undo"]:null;state[key+"UndoFresh"]=false;return u}
function viewResetBind(p,key,visKey,fresh,render){const r=$("#"+p+"-reset");if(r)r.addEventListener("click",()=>viewReset(key,visKey,fresh,render));const u=$("#"+p+"-undo");if(u)u.addEventListener("click",()=>viewUndo(key,visKey,render))}

// ---------- wspólne założenia zakładek ----------
// Rachunek i scenariusz inflacji wybrane w jednej zakładce (kalkulator, „Co kupić?”, „Mój portfel”) przechodzą do pozostałych
// do końca wizyty. Zakładka otwarta z linku z parametrami bierze wartości z linku (state.shared ich nie nadpisuje).
// Portfel ma tylko „zwykły” i „IKE / IKZE” oraz scenariusze bez „własnej” inflacji — wartości są tłumaczone w obie strony.
function sharedPull(view,o){const s=state.shared;if(!s||!o)return o;
  if(s.acc){if(view==="pf")o.acc=s.acc==="std"?"std":"ike";else{o.acc=s.acc;if(view==="calc")o.ike=s.acc!=="std"}}
  if(s.sc){if(view==="pf"){if(CPI_PRESETS[s.sc])o.sc=s.sc}else{o.sc=s.sc;if(s.sc==="custom"&&s.cpi)o.cpi=s.cpi.slice()}}
  return o}
function sharedSet(view,patch){const s=state.shared=state.shared||{};
  if(patch.acc)s.acc=view==="pf"&&patch.acc==="ike"&&(s.acc==="ike"||s.acc==="ikze")?s.acc:patch.acc;
  if(patch.sc){s.sc=patch.sc;if(patch.cpi)s.cpi=patch.cpi.slice()}
  sharedPull("calc",state.calc);sharedPull("buy",state.buy);sharedPull("pf",state.pf)}

// ---------- plakietka „było …” ----------
// Elementy z data-m (klucz) i data-v (liczba; data-x — np. kod zwycięskiej serii) to najważniejsze wyniki widoku.
// wasSnap() przed zmianą założenia, wasShow() po przeliczeniu: przy zmianie wartości mignięcie i plakietka z poprzednią.
function wasSnap(){const m={};document.querySelectorAll("#main [data-m]").forEach(e=>{const k=e.dataset.m;if(!(k in m))m[k]={v:+e.dataset.v,t:e.textContent.trim(),x:e.dataset.x||""}});return m}
function wasShow(snap){if(!snap)return;
  document.querySelectorAll("#main [data-m]").forEach(e=>{const o=snap[e.dataset.m];if(!o||isNaN(o.v))return;const x=e.dataset.x||"";
    if(Math.abs(o.v-(+e.dataset.v))<0.5&&o.x===x)return;
    e.classList.add("flash");e.insertAdjacentHTML("afterend",`<span class="was">było ${esc(o.x&&o.x!==x?o.x+": ":"")}${esc(o.t)}</span>`)});
  clearTimeout(wasShow.t);wasShow.t=setTimeout(()=>{document.querySelectorAll("#main .was").forEach(w=>{w.classList.add("gone");setTimeout(()=>w.remove(),600)});document.querySelectorAll("#main .flash").forEach(e=>e.classList.remove("flash"))},6000)}
const withWas=fn=>{const s=wasSnap();fn();wasShow(s)};

// ---------- pasek założeń ----------
// Przyklejony pod nagłówkiem pasek z ustawieniami, które zmieniają cały wynik (rachunek, inflacja, okres…), i ze skrótem
// wyniku. Pojawia się, gdy z formularza (.calc-grid) zostanie na ekranie mniej, niż zasłoniłby sam pasek. Na wąskim ekranie: jedna linijka
// podsumowania i przycisk „Zmień”, który otwiera panel od dołu z tymi samymi ustawieniami (Esc / „Gotowe” / tło zamyka).
// items: [{k, label, type:"seg"|"sel"|"num", opts:[[v,etykieta]], cur, step, min, sync:"#id pola w formularzu"}]
// onPick(k,v) — zmiana przełącznika/listy (widok przerysowuje się sam); onNum(k,v) — wpisywanie liczby (tylko przeliczenie).
const abarKeep={};
function abarItemHtml(p,it,where){
  const lid=`${p}-ab-${it.k}-${where}`;
  if(it.type==="seg")return `<div class="ab-g"><span class="ab-l" id="${lid}">${esc(it.label)}</span><div class="seg" role="group" aria-labelledby="${lid}">${it.opts.map(([v,l])=>`<button type="button" data-ab="${esc(it.k)}" data-v="${esc(v)}" aria-pressed="${String(v)===String(it.cur)}">${esc(l)}</button>`).join("")}</div></div>`;
  if(it.type==="sel")return `<label class="ab-g"><span class="ab-l">${esc(it.label)}</span><span class="sel"><select data-ab="${esc(it.k)}">${selOpts(it.opts,it.cur)}</select></span></label>`;
  return `<label class="ab-g"><span class="ab-l">${esc(it.label)}</span><input type="number" data-ab="${esc(it.k)}" data-num="1" inputmode="decimal" step="${it.step||1}"${it.min!=null?` min="${it.min}"`:""} value="${esc(it.cur)}"></label>`;
}
function abarHtml(p,items,summary){
  return `<div class="abar" id="${p}-abar" role="region" aria-label="Założenia (widoczne podczas przewijania)" inert>
    <div class="abar-in"><div class="ab-full">${items.map(it=>abarItemHtml(p,it,"b")).join("")}</div>
      <button type="button" class="ab-sum" aria-haspopup="dialog" aria-expanded="false" aria-controls="${p}-asheet"><span class="ab-sum-t">${esc(summary)}</span><span class="ab-sum-go">Zmień</span></button>
      <div class="ab-res" aria-live="polite"></div></div></div>
    <div class="asheet" id="${p}-asheet" hidden><div class="asheet-bg" data-ab-close></div>
      <div class="asheet-in" role="dialog" aria-modal="true" aria-labelledby="${p}-asheet-t"><div class="asheet-grip" aria-hidden="true"></div>
        <h3 id="${p}-asheet-t">Założenia</h3>${items.map(it=>abarItemHtml(p,it,"s")).join("")}
        <div class="ab-res" aria-hidden="true"></div>
        <button type="button" class="btn solid ab-done" data-ab-close>Gotowe</button></div></div>`;
}
// wynik w pasku i w panelu (po każdym przeliczeniu)
function abarResult(p,html){document.querySelectorAll(`#${p}-abar .ab-res, #${p}-asheet .ab-res`).forEach(e=>e.innerHTML=html)}
let abarScroll=null;
function abarBind(p,main,{onPick,onNum,summary}){
  const bar=$("#"+p+"-abar"),sheet=$("#"+p+"-asheet"),form=main.querySelector(".calc-grid");if(!bar||!form)return;
  const sumBtn=bar.querySelector(".ab-sum");
  const show=()=>{if(!bar.isConnected){removeEventListener("scroll",abarScroll);removeEventListener("resize",abarScroll);return}
    // pasek pojawia się, zanim dół formularza schowa się pod nagłówkiem: gdy to, co zostało z formularza, i tak zasłoniłby pasek
    const top=(document.querySelector(".topbar")?.getBoundingClientRect().height||58)+(bar.firstElementChild?.offsetHeight||70)+30,on=form.getBoundingClientRect().bottom<top;
    bar.classList.toggle("on",on);bar.inert=!on;if(!on&&!sheet.hidden)close(false)};
  if(abarScroll){removeEventListener("scroll",abarScroll);removeEventListener("resize",abarScroll)}
  abarScroll=show;addEventListener("scroll",show,{passive:true});addEventListener("resize",show);
  show();requestAnimationFrame(()=>bar.classList.add("ready"));
  const open=(anim=true)=>{sheet.hidden=false;sheet.classList.toggle("anim",anim);sumBtn.setAttribute("aria-expanded","true")};
  function close(focus=true){sheet.hidden=true;sumBtn.setAttribute("aria-expanded","false");if(focus)sumBtn.focus()}
  sumBtn.addEventListener("click",()=>{open();(sheet.querySelector("[aria-pressed=true],select,input")||sheet.querySelector("button")).focus()});
  sheet.querySelectorAll("[data-ab-close]").forEach(b=>b.addEventListener("click",()=>close()));
  sheet.addEventListener("keydown",e=>{if(e.key==="Escape"){e.preventDefault();close();return}
    if(e.key!=="Tab")return;const f=[...sheet.querySelectorAll("button,select,input")].filter(x=>!x.disabled&&x.offsetParent);if(!f.length)return;
    if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&document.activeElement===f[f.length-1]){e.preventDefault();f[0].focus()}});
  // po przerysowaniu widoku: panel otwarty dalej, fokus na tej samej kontrolce
  if(abarKeep[p]?.open)open(false);
  // przerysowanie widoku może na chwilę skrócić stronę — przywracamy przewinięcie, widoczność paska i fokus na tej samej kontrolce
  const pick=(el,k,v)=>{const keep=abarKeep[p]={open:!sheet.hidden,sel:`[data-ab="${k}"]`+(el.tagName==="BUTTON"?`[data-v="${v}"]`:"")},y=scrollY;
    withWas(()=>onPick(k,v));delete abarKeep[p];if(Math.abs(scrollY-y)>1)scrollTo(0,y);if(abarScroll)abarScroll();
    const host=$(keep.open?`#${p}-asheet`:`#${p}-abar`),f=host&&host.querySelector(keep.sel);if(f)f.focus({preventScroll:true})};
  [bar,sheet].forEach(host=>host.querySelectorAll("[data-ab]").forEach(el=>{const k=el.dataset.ab;
    if(el.tagName==="BUTTON")el.addEventListener("click",()=>pick(el,k,el.dataset.v));
    else if(el.dataset.num)el.addEventListener("input",()=>{document.querySelectorAll(`#${p}-abar [data-ab="${k}"], #${p}-asheet [data-ab="${k}"]`).forEach(o=>{if(o!==el)o.value=el.value});onNum(k,el.value);bar.querySelector(".ab-sum-t").textContent=summary()});
    else el.addEventListener("change",()=>pick(el,k,el.value))}));
}
// pole formularza → pasek (przy wpisywaniu w formularzu pasek nie jest przerysowywany)
function abarMirror(p,k,val,summary){document.querySelectorAll(`#${p}-abar [data-ab="${k}"], #${p}-asheet [data-ab="${k}"]`).forEach(o=>o.value=val);const t=document.querySelector(`#${p}-abar .ab-sum-t`);if(t&&summary)t.textContent=summary()}
