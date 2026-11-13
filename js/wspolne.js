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
// „Wyczyść ustawienia” z cofnięciem (kalkulator zamiany, Co kupić?, Mój portfel): id `${p}-reset` i `${p}-undo`
const resetRowHtml=(p,isDef,undo,what)=>`<div class="row"><button type="button" class="btn" id="${p}-reset"${isDef?" disabled":""} title="${isDef?"Ustawienia są domyślne":"Przywróć ustawienia jak przy pierwszym wejściu: "+what}">↺ Wyczyść ustawienia</button>${undo?`<span class="small" role="status">Wyczyszczono. <button type="button" class="linkbtn" id="${p}-undo">Cofnij</button></span>`:""}</div>`;
// stan widoku w state[key] (+ legenda wykresu state[visKey]); fresh() — stan domyślny; render() — przerysowanie
function viewReset(key,visKey,fresh,render){state[key+"Undo"]={v:JSON.parse(JSON.stringify(state[key])),vis:visKey?Object.assign({},state[visKey]||{}):null};state[key+"UndoFresh"]=true;
  state[key]=fresh();if(visKey)state[visKey]={};render()}
function viewUndo(key,visKey,render){const u=state[key+"Undo"];if(!u)return;state[key]=u.v;if(visKey)state[visKey]=u.vis;state[key+"Undo"]=null;render()}
// cofnięcie pokazujemy tylko w widoku tuż po wyczyszczeniu
function viewUndoShown(key){const u=state[key+"UndoFresh"]?state[key+"Undo"]:null;state[key+"UndoFresh"]=false;return u}
function viewResetBind(p,key,visKey,fresh,render){const r=$("#"+p+"-reset");if(r)r.addEventListener("click",()=>viewReset(key,visKey,fresh,render));const u=$("#"+p+"-undo");if(u)u.addEventListener("click",()=>viewUndo(key,visKey,render))}
