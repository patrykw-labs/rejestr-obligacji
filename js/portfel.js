/* Rejestr ofert obligacji — widok „Mój portfel”: ile są warte posiadane obligacje dziś, bez zamiany (wartość, wypłata po
   zerwaniu, terminy wykupu, najbliższe kupony i zmiany oprocentowania). Obliczenia w js/zamiana.js (holdings);
   wspólne elementy formularza z js/kalkulator.js. Stan w adresie #portfel&pf=KOD~szt~dzień,…&bd=…&ike=0|1&sc=… */
const PF_MAX=20;
const PF_ACC=[["std","Zwykły (podatek Belki)"],["ike","IKE / IKZE"]];
Object.assign(CALC_TIPS,{
  pcode:"Seria, którą masz. Oprocentowanie, marża i opłata uzupełnią się z jej listu emisyjnego.",
  ppaste_btn:"Szybkie uzupełnienie portfela z rachunku obligacji skarbowych. Zaloguj się na stronie zakupu obligacji, otwórz zakładkę „Stan rachunku rejestrowego”, zaznacz tabelę z seriami i skopiuj ją (Ctrl+C) — albo wyeksportuj ją do XLS, otwórz plik w arkuszu i skopiuj wiersze. Wklej tutaj: zobaczysz podgląd serii, liczby sztuk i dnia zakupu (bierzemy go z daty wykupu). Wczytanie zastępuje wpisane serie i można je cofnąć. Tekst nie opuszcza przeglądarki.",
  pfile_btn:"Wczytuje portfel zapisany wcześniej przyciskiem „portfel (.json)” na dole wyniku — np. żeby przenieść go z komputera na telefon albo odtworzyć po wyczyszczeniu przeglądarki. Przyjmuje też tabelę z rachunku zapisaną jako tekst lub CSV. Pliku Excela (.xls, .xlsx) przeglądarka nie odczyta — otwórz go w arkuszu, skopiuj tabelę i użyj „Wklej z rachunku”.",
  ppaste:"Tabela posiadanych obligacji skopiowana z rachunku: w każdym wierszu kod serii (np. EDO1036), liczba sztuk i data wykupu. Sztuki zablokowane doliczamy do dostępnych. Kolumny mogą być rozdzielone tabulatorami, średnikami albo spacjami; kwoty nie są potrzebne.",
  ppd:"Dzień miesiąca zakupu. Od niego biegną okresy odsetkowe: rocznice (miesięcznice dla ROR i DOR), kupony i wykup.",
  pbd:"Dzień, na który liczymy wartość. Domyślnie dziś. Przy zerwaniu odsetki biegną do dnia wykupu — ok. 5 dni roboczych po dyspozycji.",
  pacc:"Zwykły rachunek — podatek 19% od zysku przy zerwaniu, wykupie i od kuponów. IKE / IKZE — bez podatku Belki (opłata za zerwanie w ramach konta zostaje).",
  pcpi:"Inflacja w kolejnych latach — tylko do prognoz: oprocentowania okresów, dla których GUS nie opublikował jeszcze odczytu, i wartości przy wykupie.",
  pgross:"Wartość obligacji z odsetkami narosłymi do dnia wyceny, przed opłatą za przedterminowy wykup i podatkiem.",
  ppay:"Ile dostaniesz na konto, gdy zerwiesz obligacje w dniu wyceny: wartość minus opłata (nie mniej niż 100 zł za sztukę; ROR i DOR — stała opłata, OTS — bez odsetek) minus podatek od zysku.",
  pmat:"Ile dostaniesz, trzymając do wykupu w terminie: wykup (po podatku) plus kupony COI i odsetki ROR/DOR należne do tego czasu (po podatku, bez ich oprocentowania). Okresy bez odczytu inflacji lub stopy NBP liczymy ze scenariusza — to prognoza; stopy z szybkiego szacunku GUS oznaczamy jako wstępne.",
  prate:"Oprocentowanie bieżącego okresu odsetkowego (roku; dla ROR i DOR — miesiąca) i dzień, w którym się kończy."
});
const pfNow=()=>calcArchiveNow();
const pfDate=(ym,pd)=>`${String(Math.min(+pd||1,calcDaysIn(ym))).padStart(2,"0")}.${ym.slice(5)}.${ym.slice(0,4)}`;
const pfIn=m=>{m=Math.max(0,Math.round(m));const y=Math.floor(m/12),r=m%12;if(!y)return `${r} mies.`;const yt=y===1?"rok":[2,3,4].includes(y%10)&&!(y>=12&&y<=14)?"lata":"lat";return r?`${y} ${yt} i ${r} mies.`:`${y} ${yt}`};
const pfPct=r=>fmt(r*100)+"%";
function pfDefaults(){
  const opts=calcOptions(pfNow(),true,true),now=pfNow();
  const pick=(opts.EDO||[]).find(c=>Zamiana.monthsBetween(Zamiana.parseCode(c).purchase,now)>=24)||(opts.EDO||[])[0]||Object.values(opts).flat()[0]||"";
  return {pos:pick?[{code:pick,n:100,pd:1}]:[],bd:calcDefaultBreakDay(),acc:"std",sc:"base"};
}
// zapamiętanie portfela w tej przeglądarce (localStorage, tylko na tym urządzeniu): serie, rachunek, scenariusz;
// bez dnia wyceny (zawsze dziś). Adres z parametrami ma pierwszeństwo; brak dostępu do pamięci nie psuje strony.
const PF_KEY="rejestr-obligacji:portfel";
// plik portfela (JSON, ten sam format co zapis w przeglądarce): {app, v, savedAt, pos:[{code,n,pd}], acc, sc}
function pfFileText(s){return JSON.stringify({app:"rejestr-obligacji",v:1,savedAt:new Date().toISOString().slice(0,10),pos:s.pos.map(o=>({code:o.code,n:Math.floor(+o.n),pd:+o.pd||1})),acc:s.acc,sc:s.sc},null,1)+"\n"}
// odczyt pliku: znane serie, liczba sztuk ≥ 1, dzień 1–31; nierozpoznane pozycje pominięte (skipped); error — plik nie do odczytu
function pfParseFile(text){
  let j;try{j=JSON.parse(text)}catch(e){return {error:"To nie jest plik portfela (zły format JSON)."}}
  if(!j||!Array.isArray(j.pos))return {error:"W pliku nie ma listy serii (pole „pos”)."};
  const s=pfDefaults(),pos=[],skipped=[];
  for(const o of j.pos){const a=o&&calcFromCode(o.code);const n=Math.floor(+(o&&o.n));
    if(!a||!CALC_TYPES.includes(a.type)||!(n>=1)){skipped.push(o&&o.code?String(o.code):"?");continue}
    if(pos.length>=PF_MAX){skipped.push(a.code+" (ponad "+PF_MAX+" serii)");continue}
    pos.push({code:a.code,n,pd:calcDayOk(o.pd)?+o.pd:1})}
  if(!pos.length)return {error:"Plik nie zawiera żadnej rozpoznanej serii"+(skipped.length?` (pominięto: ${skipped.join(", ")})`:"")+"."};
  s.pos=pos;s.acc=j.acc==="ike"?"ike":"std";if(CPI_PRESETS[j.sc])s.sc=j.sc;
  return {state:s,skipped};
}
// tabela z rachunku (wklejona albo plik arkusza zapisany jako tekst, CSV lub HTML) → serie portfela; parser w silniku
// (Zamiana.parseRegister); serie spoza archiwum i ponad PF_MAX pominięte; brak daty → dzień 1 (noDay)
function pfFromRegister(text){
  const r=Zamiana.parseRegister(text),pos=[],skipped=r.skipped.map(x=>x.reason),noDay=[],warns=[];let blocked=0;
  for(const o of r.rows){const a=calcFromCode(o.code);
    if(!a||!CALC_TYPES.includes(a.type)){skipped.push(o.code+": brak w archiwum");continue}
    if(pos.length>=PF_MAX){skipped.push(o.code+` (ponad ${PF_MAX} serii)`);continue}
    if(o.day==null)noDay.push(o.code);if(o.warn)warns.push(o.warn);blocked+=o.blocked;
    pos.push({code:a.code,n:o.n,pd:o.day||1})}
  return {pos,skipped,noDay,blocked,warns};
}
// tabela HTML (np. plik .xls zapisany przez serwis jako strona) → wiersze rozdzielone tabulatorami
const pfHtmlToText=h=>h.replace(/<\/t[dh]>/gi,"\t").replace(/<\/tr>|<br\s*\/?>/gi,"\n").replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").replace(/&amp;/g,"&");
const pfSeriesWord=n=>n===1?"seria":[2,3,4].includes(n%10)&&!(n>=12&&n<=14)?"serie":"serii";
// podgląd wklejonej tabeli (przed wczytaniem)
function pfPastePreview(t){
  if(!t||!t.trim())return `<p class="small">Wklej tabelę — tu pojawi się podgląd rozpoznanych serii.</p>`;
  const r=pfFromRegister(t);
  const list=r.pos.map(o=>{const a=calcFromCode(o.code);return `<li><b>${esc(o.code)}</b> × ${o.n} szt. · zakup ${esc(pfDate(a.p,o.pd))}${r.noDay.includes(o.code)?" (dnia nie rozpoznano — przyjęto 1.)":""}</li>`}).join("");
  return (r.pos.length?`<p class="small"><b>Rozpoznano ${r.pos.length} ${pfSeriesWord(r.pos.length)}:</b></p><ul class="small evlist">${list}</ul>`:`<p class="small"><b>Nie rozpoznano żadnej serii.</b> Potrzebny jest kod serii (np. EDO1036) i liczba sztuk w tym samym wierszu.</p>`)
    +(r.warns.length?`<div class="insight warn" role="status"><span class="t">sprawdź przed wczytaniem</span>${r.warns.map(esc).join("<br>")}</div>`:"")
    +(r.blocked?`<p class="small">W tym ${r.blocked} szt. zablokowanych (np. zlecenie wykupu albo zamiany w toku) — liczone razem z dostępnymi.</p>`:"")
    +(r.skipped.length?`<p class="small">Pominięto: ${esc(r.skipped.join("; "))}.</p>`:"");
}
function pfPasteHtml(){if(!state.pfPaste)return "";const t=state.pfPasteText||"";
  return `<div class="paste" id="p-paste-box"><label class="field"><span class="flabel">Tabela z rachunku${calcTip("ppaste")}</span><textarea id="p-paste" rows="6" spellcheck="false" autocomplete="off" placeholder="EMISJA  DOSTĘPNA LICZBA OBLIGACJI  …  DATA WYKUPU&#10;EDO1036  200  0  …  2036-10-16">${esc(t)}</textarea></label>
    <p class="small">Na stronie zakupu obligacji skarbowych otwórz „Stan rachunku rejestrowego” i skopiuj tabelę (albo wyeksportuj ją do XLS, otwórz plik w arkuszu i skopiuj wiersze). Wystarczą kod serii, liczba sztuk i data wykupu — z niej bierzemy dzień zakupu. 🔒 Tekst zostaje w tej przeglądarce, nie wysyłamy go nigdzie.</p>
    <div id="p-paste-prev">${pfPastePreview(t)}</div>
    <div class="row"><button type="button" class="btn solid" id="p-paste-ok"${t.trim()&&pfFromRegister(t).pos.length?"":" disabled"}>Wczytaj do portfela</button><button type="button" class="btn" id="p-paste-cancel">Anuluj</button><span class="small">zastąpi obecne serie (można cofnąć)</span></div></div>`}
// wczytanie serii (z pliku albo z wklejonej tabeli): zastępuje bieżące serie, rachunek i scenariusz zostają; „Cofnij” przywraca
function pfApplyImport(main,pos,info){
  state.pfImportUndo={pf:JSON.parse(JSON.stringify(state.pf)),link:!!state.pfLink};
  const s=JSON.parse(JSON.stringify(state.pf));s.pos=pos;if(info.acc)s.acc=info.acc;if(info.sc)s.sc=info.sc;
  state.pf=s;state.pfLink=false;state.pfImport=Object.assign({count:pos.length},info);renderPortfolio(main)}
// komunikat po wczytaniu pliku (z „Cofnij” — przywraca portfel sprzed wczytania)
function pfImportHtml(){const m=state.pfImport;if(!m)return "";state.pfImport=null;
  if(m.error)return `<div class="insight warn" role="status"><span class="t">nie udało się wczytać</span>${esc(m.error)}</div>`;
  return `<div class="insight${m.skipped.length||(m.warns&&m.warns.length)?" warn":""}" role="status"><span class="t">wczytano portfel</span>${m.count} ${pfSeriesWord(m.count)} ${m.name?"z pliku "+esc(m.name):"z wklejonej tabeli"}${m.skipped.length?`; pominięto: ${esc(m.skipped.join("; "))}`:""}.${m.warns&&m.warns.length?` Sprawdź: ${esc(m.warns.join("; "))}.`:""}${m.noDay&&m.noDay.length?` Bez daty (przyjęto dzień 1. — popraw w polu „Dzień”): ${esc(m.noDay.join(", "))}.`:""} Portfel jest zapamiętany w tej przeglądarce. <button type="button" class="linkbtn" id="p-import-undo">Cofnij</button></div>`}
function pfLoad(){try{const j=JSON.parse(localStorage.getItem(PF_KEY)||"null");if(!j||!Array.isArray(j.pos))return null;const s=pfDefaults();
    const pos=j.pos.slice(0,PF_MAX).map(o=>{const a=calcFromCode(o.code);return a&&CALC_TYPES.includes(a.type)&&+o.n>=1?{code:a.code,n:Math.floor(+o.n),pd:calcDayOk(o.pd)?+o.pd:1}:null}).filter(Boolean);
    if(!pos.length)return null;s.pos=pos;s.acc=j.acc==="ike"?"ike":"std";if(CPI_PRESETS[j.sc])s.sc=j.sc;return s}catch(e){return null}}
const pfSaved=()=>{try{return !!localStorage.getItem(PF_KEY)}catch(e){return false}};
// zapis po każdej zmianie; portfel przykładowy (domyślny) nie jest zapisywany — wtedy zapis jest usuwany
// portfel otwarty z linku (state.pfLink) nie nadpisuje zapamiętanego — dopiero „Zapamiętaj ten portfel”
// zwraca true, gdy zapis faktycznie się zmienił (wtedy pokazujemy mignięcie „✓ Zapisano”)
function pfSave(s){if(state.pfLink)return false;try{const d=pfDefaults(),same=JSON.stringify([s.pos,s.acc,s.sc])===JSON.stringify([d.pos,d.acc,d.sc]);
    const prev=localStorage.getItem(PF_KEY);
    if(same){localStorage.removeItem(PF_KEY);return false}
    const v=JSON.stringify({v:1,pos:s.pos.map(o=>({code:o.code,n:o.n,pd:o.pd})),acc:s.acc,sc:s.sc});localStorage.setItem(PF_KEY,v);return v!==prev}catch(e){return false}}
function pfForget(main){try{localStorage.removeItem(PF_KEY)}catch(e){}state.pfLink=false;viewReset("pf",null,pfDefaults,()=>renderPortfolio(main))}
function pfFromHash(){
  const parts=(location.hash||"").slice(1).split("&");if(parts[0]!=="portfel"||parts.length<2)return null;
  const q=Object.fromEntries(parts.slice(1).map(x=>x.split("=").map(decodeURIComponent)));const s=pfDefaults();
  const warn=[];
  if(q.pf){const pos=[],bad=[],all=q.pf.split(",");for(const it of all){if(pos.length>=PF_MAX){warn.push(`„Mój portfel” mieści do ${PF_MAX} serii — pominięto ${all.length-all.indexOf(it)} z linku.`);break}
      const [code,n,pd]=it.split("~");const a=calcFromCode(code);
      if(a&&CALC_TYPES.includes(a.type)&&+n>=1)pos.push({code:a.code,n:Math.floor(+n),pd:calcDayOk(pd)?+pd:1});else bad.push(it);}
    if(bad.length)warn.push(`Pominięto serie, których nie rozpoznano: ${bad.join(", ")} (nieznany kod serii albo zła liczba sztuk).`);
    s.pos=pos;}
  if(q.sc&&!CPI_PRESETS[q.sc])warn.push(`Nieznany scenariusz inflacji „${q.sc}” — przyjęto bazowy (2,5%).`);
  linkWarnSet("portfel",warn);
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
  const opts=calcOptions(pfNow(),true,true),used=new Set(s.pos.map(o=>o.code)),types=new Set(s.pos.map(o=>Zamiana.parseCode(o.code)?.type));
  const all=CALC_TYPES.flatMap(t=>opts[t]||[]).filter(x=>!used.has(x));
  return all.find(x=>!types.has(Zamiana.parseCode(x).type))||all[0]||"";
}
function pfParams(s){
  return {now:pfNow(),breakDay:+s.bd,positions:s.pos.map(o=>{const a=calcFromCode(o.code);return {code:o.code,type:a.type,rate1:+a.r1,margin:+a.m,fee:+a.f,purchase:a.p,purchaseDay:+o.pd||1,count:Math.floor(+o.n)}}),
    cpiHistory:calcCpiHist(),cpiFuture:[CPI_PRESETS[s.sc].v],nbpHistory:Zamiana.nbpHistoryFromMonths(state.raw),nbpFuture:calcNbpNow(),tax:s.acc==="std",
    // odczyty CPI z szybkiego szacunku — stopy na ich podstawie są wstępne
    cpiPrelim:Object.fromEntries(state.months.filter(m=>m.cpiKind==="szybki szacunek"&&m.cpiRefMonth).map(m=>[m.cpiRefMonth,true]))};
}
function renderPortfolio(main){
  if(!state.pf){const h=pfFromHash();if(h){state.pf=h;state.pfLink=true}else state.pf=pfLoad()||pfDefaults()}
  const s=state.pf,now=pfNow(),opts=calcOptions(now,true,true);
  const undo=viewUndoShown("pf"),isDef=pfHash(s)===pfHash(pfDefaults());
  const codeOpts=cur=>CALC_TYPES.filter(t=>opts[t]).map(t=>`<optgroup label="${t}">${selOpts(opts[t].map(x=>[x,x+" · zakup "+mShort(Zamiana.parseCode(x).purchase)]),cur)}</optgroup>`).join("");
  const posHtml=(o,i)=>{const a=calcFromCode(o.code),mat=a?Zamiana.addMonths(a.p,Zamiana.TYPES[a.type].term):null;
    return `<div class="pos"><div class="pos-head"><b>${i+1}. ${esc(o.code)}</b>${s.pos.length>1?`<button type="button" class="pos-del" data-pdel="${i}" aria-label="Usuń serię ${i+1}">usuń</button>`:""}</div>
      <div class="pos-row"><label class="field"><span class="flabel">Seria${calcTip("pcode")}</span><span class="sel"><select data-pi="${i}" data-pk="code">${opts[a?.type]?.includes(o.code)?"":`<option value="${esc(o.code)}" selected>${esc(o.code)}</option>`}${codeOpts(o.code)}</select></span></label>
        <label class="field"><span class="flabel">Szt.${calcTip("n")}</span><input data-pi="${i}" data-pk="n" type="number" min="1" step="1" inputmode="numeric" value="${esc(o.n)}"></label>
        <label class="field"><span class="flabel">Dzień${calcTip("ppd")}</span><input data-pi="${i}" data-pk="pd" type="number" min="1" max="31" step="1" inputmode="numeric" value="${esc(o.pd)}"></label></div>
      ${a?`<span class="fnote">zakup ${mShort(a.p)} · wykup ${mShort(mat)} · ${calcR1Label(a.type)} ${fmt(a.r1)}%${a.type==="OTS"||a.type==="TOS"?"":` · marża ${fmt(a.m)} p.p.`} · ${a.type==="OTS"?"przy zerwaniu bez odsetek":`opłata ${fmt(a.f)} zł/szt.`}</span>`:""}</div>`};
  main.innerHTML=`<div class="vlist">
    <div class="sec-head"><div><p class="kicker">§ 6 · mój portfel</p><h2>Ile są warte <span class="acc">moje obligacje</span>?</h2><p class="desc">Wpisz serie, które masz: zobaczysz ich wartość na ${esc(pfDate(now,s.bd))}, ile dostaniesz na rękę po zerwaniu, terminy wykupu, najbliższe kupony i zmiany oprocentowania. Bez zamiany — czy opłaca się zamienić je na nowe, sprawdzisz w kalkulatorze zamiany.</p></div>
      ${resetRowHtml("p",isDef,undo,"przykładowa seria EDO, wycena na dziś, zwykły rachunek")}</div>
    ${linkWarnHtml("portfel")}
    ${pfImportHtml()}
    <div class="calc-grid">
      <div class="card"><h3>Moje obligacje <small>${s.pos.length} ${s.pos.length===1?"seria":[2,3,4].includes(s.pos.length%10)&&!(s.pos.length>=12&&s.pos.length<=14)?"serie":"serii"}</small></h3>
        ${s.pos.map(posHtml).join("")}
        <div class="row"><button type="button" class="btn" id="p-add"${s.pos.length>=PF_MAX?" disabled":""}>+ dodaj serię</button><span class="small">do ${PF_MAX} serii</span><button type="button" class="btn" id="p-paste-open" aria-expanded="${!!state.pfPaste}" aria-controls="p-paste-box" >Wklej z rachunku</button>${calcTip("ppaste_btn")}<button type="button" class="btn" id="p-load-file" >Wczytaj z pliku</button>${calcTip("pfile_btn")}<input type="file" id="p-file" accept=".json,application/json,.csv,.txt,.tsv,.htm,.html,.xls,.xlsx" hidden></div>
        ${pfPasteHtml()}
        <p class="small" id="p-store">${pfStoreNote()}</p></div>
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
  viewResetBind("p","pf",null,pfDefaults,()=>renderPortfolio(main));
  // wczytanie portfela z pliku: zastępuje bieżący (z możliwością cofnięcia), zapis w przeglądarce jak przy zmianie ręcznej
  $("#p-load-file").addEventListener("click",()=>$("#p-file").click());
  // plik portfela (.json) albo tabela z rachunku zapisana jako tekst / CSV / HTML; prawdziwy plik Excela (.xls/.xlsx) — prośba o skopiowanie
  $("#p-file").addEventListener("change",async e=>{const f=e.target.files&&e.target.files[0];if(!f)return;e.target.value="";
    const fail=msg=>{state.pfImport={error:msg};renderPortfolio(main)};
    if(f.size>500000)return fail("Plik jest za duży jak na portfel (ponad 500 KB).");
    let buf;try{buf=new Uint8Array(await f.arrayBuffer())}catch(err){return fail("Nie udało się odczytać pliku.")}
    const hex=Array.from(buf.slice(0,4),b=>b.toString(16).padStart(2,"0")).join("");
    if(hex==="d0cf11e0"||hex==="504b0304")return fail(`${f.name} to plik Excela — tego formatu nie odczytamy w przeglądarce. Otwórz go w arkuszu (Excel, LibreOffice, Arkusze Google), zaznacz tabelę z seriami, skopiuj (Ctrl+C) i wklej w „Wklej z rachunku” powyżej.`);
    let text=new TextDecoder("utf-8").decode(buf);if(text.includes("\ufffd"))text=new TextDecoder("windows-1250").decode(buf);
    if(/^\s*\{/.test(text)){const r=pfParseFile(text);if(r.error)return fail(r.error);return pfApplyImport(main,r.state.pos,{skipped:r.skipped,name:f.name,acc:r.state.acc,sc:r.state.sc})}
    const r=pfFromRegister(/<t[dh][\s>]/i.test(text)?pfHtmlToText(text):text);
    if(!r.pos.length)return fail(`W pliku ${f.name} nie ma portfela ani tabeli z kodami serii${r.skipped.length?` (pominięto: ${r.skipped.slice(0,5).join("; ")})`:""}.`);
    pfApplyImport(main,r.pos,{skipped:r.skipped,noDay:r.noDay,warns:r.warns,name:f.name})});
  // wklejenie tabeli z rachunku: podgląd na żywo (bez przerysowania widoku), wczytanie z „Cofnij”
  $("#p-paste-open").addEventListener("click",()=>{state.pfPaste=!state.pfPaste;renderPortfolio(main);const ta=$("#p-paste");if(ta)ta.focus()});
  const ta=$("#p-paste");
  if(ta){ta.addEventListener("input",()=>{state.pfPasteText=ta.value;$("#p-paste-prev").innerHTML=pfPastePreview(ta.value);$("#p-paste-ok").disabled=!pfFromRegister(ta.value).pos.length});
    $("#p-paste-cancel").addEventListener("click",()=>{state.pfPaste=false;state.pfPasteText="";renderPortfolio(main)});
    $("#p-paste-ok").addEventListener("click",()=>{const r=pfFromRegister(ta.value);if(!r.pos.length)return;state.pfPaste=false;state.pfPasteText="";
      pfApplyImport(main,r.pos,{skipped:r.skipped,noDay:r.noDay,warns:r.warns})})}
  const iu=$("#p-import-undo");if(iu)iu.addEventListener("click",()=>{const u=state.pfImportUndo;if(!u)return;state.pf=u.pf;state.pfLink=u.link;state.pfImportUndo=null;renderPortfolio(main)});
  calcBindTips(main.querySelector(".calc-grid"));
  pfRecompute();
}
// informacja o zapisie w przeglądarce (aktualizowana po każdej zmianie)
function pfStoreNote(flash){
  if(state.pfLink)return `🔗 Ten portfel otwarto z linku — nie zastępuje portfela zapamiętanego w tej przeglądarce. <button type="button" class="linkbtn" id="p-keep">Zapamiętaj ten portfel</button>${pfSaved()?` · <button type="button" class="linkbtn" id="p-load">Wczytaj zapamiętany</button>`:""}`;
  return pfSaved()?`💾 Zapisano automatycznie w tej przeglądarce (tylko na tym urządzeniu, nie wysyłamy go nigdzie).${flash?' <span class="pf-flash">✓ Zapisano</span>':""} <button type="button" class="linkbtn" id="p-forget">Zapomnij portfel</button>`
  :"Po zmianie serii portfel zapamięta się w tej przeglądarce (tylko na tym urządzeniu) i wczyta przy następnej wizycie."}
function pfBindStore(){const main=$("#main"),b=$("#p-forget"),k=$("#p-keep"),l=$("#p-load");
  if(b)b.addEventListener("click",()=>pfForget(main));
  if(k)k.addEventListener("click",()=>{state.pfLink=false;const ch=pfSave(state.pf);const st=$("#p-store");if(st){st.innerHTML=pfStoreNote(ch);pfBindStore()}});
  if(l)l.addEventListener("click",()=>{const v=pfLoad();if(!v)return;state.pf=v;state.pfLink=false;renderPortfolio(main)})}
function pfRecompute(){
  const out=$("#p-out");if(!out)return;const s=state.pf,now=pfNow();
  try{history.replaceState(null,"","#"+pfHash(s))}catch(e){}
  const changed=pfSave(s);const st=$("#p-store");if(st){st.innerHTML=pfStoreNote(changed);pfBindStore()}
  const errs=[];
  if(!s.pos.length)errs.push("Dodaj co najmniej jedną serię.");
  s.pos.forEach((o,i)=>{if(!(Math.floor(+o.n)>=1))errs.push(`Seria ${i+1}: podaj liczbę sztuk.`);if(!calcDayOk(o.pd))errs.push(`Seria ${i+1}: dzień zakupu od 1 do 31.`);else if(calcFromCode(o.code)?.p===now&&+o.pd>+s.bd)errs.push(`Seria ${i+1} (${o.code}): zakup ${o.pd}. dnia jest po dniu wyceny (${s.bd}.) — ustaw dzień wyceny na dziś albo popraw dzień zakupu.`)});
  if(!(calcDayOk(s.bd)&&+s.bd<=calcDaysIn(now)))errs.push(`Dzień wyceny: od 1 do ${calcDaysIn(now)}.`);
  if(errs.length){out.innerHTML=`<div class="insight warn"><span class="t">uzupełnij dane</span>${errs.map(esc).join("<br>")}</div>`;return}
  let r;try{r=Zamiana.holdings(pfParams(s))}catch(e){out.innerHTML=`<div class="insight warn"><span class="t">błąd</span>${esc(e.message)}</div>`;return}
  const pd=i=>+s.pos[i].pd||1,live=r.items.map((x,i)=>Object.assign(x,{i,code:s.pos[i].code})).filter(x=>!x.matured&&!x.error);
  const done=r.items.filter(x=>x.matured);
  const sum=k=>live.reduce((a,x)=>a+x[k],0),gross=sum("gross"),pay=sum("payout"),fee=sum("fee"),tx=sum("breakTax"),mat=sum("toMaturity"),matFin=sum("atMaturity"),futC=sum("futureCoupons"),paid=sum("couponsPaid");
  const tax=s.acc==="std",lastMat=live.map(x=>x.maturity).sort().pop(),anyGuess=live.some(x=>!x.maturityKnown),anyPrelim=live.some(x=>x.maturityPrelim);
  // najbliższe zdarzenia (12 miesięcy): kupony, nowe oprocentowanie, wykupy
  const ev=[];const within=ym=>Zamiana.monthsBetween(now,ym)<=12;
  for(const x of live){const t=x.spec.type,nbp=calcIsNbp(t);
    if(within(x.maturity))ev.push({ym:x.maturity,d:pd(x.i),code:x.code,kind:"wykup",text:`wykup w terminie: ok. ${zl0(x.atMaturity)}${tax?" na rękę (po podatku)":""}`});
    if(x.coupon&&x.coupon.ym!==x.maturity&&within(x.coupon.ym))ev.push({ym:x.coupon.ym,d:pd(x.i),code:x.code,kind:"kupon",text:`${nbp?"odsetki za miesiąc":"kupon"}: ${zl2(x.coupon.net)}${tax?" na rękę":""} (${pfPct(x.rateNow)})${nbp?" — dalej co miesiąc":""}`});
    if(x.next&&within(x.next.start)){const n=x.next;const why=nbp?`stopa NBP ${fmt(n.basis)}% + marża ${fmt(x.spec.margin)} p.p.${n.known?"":" — jeśli stopa się nie zmieni"}`:
        t==="TOS"||t==="OTS"?"stałe":(n.known?`inflacja za ${mShort(n.basisMonth)}: ${fmt(Math.max(n.basis,0),1)}%${n.prelim?" (szybki szacunek GUS — wstępnie)":""} + marża ${fmt(x.spec.margin)} p.p.`:`prognoza: inflacja ${fmt(CPI_PRESETS[s.sc].v,1)}% + marża ${fmt(x.spec.margin)} p.p. (GUS poda odczyt za ${mShort(n.basisMonth)})`);
      if(Math.abs(n.rate-x.rateNow)>1e-9||!nbp)ev.push({ym:n.start,d:pd(x.i),code:x.code,kind:"stopa",text:`od tego dnia ${pfPct(n.rate)} zamiast ${pfPct(x.rateNow)} (${why})`});}}
  ev.sort((a,b)=>a.ym===b.ym?a.d-b.d:a.ym<b.ym?-1:1);
  const evHtml=ev.length?`<ul class="evlist">${ev.map(e=>`<li><span class="num"><b>${pfDate(e.ym,e.d)}</b></span> <b>${esc(e.code)}</b> — ${esc(e.text)}</li>`).join("")}</ul>`:`<p class="small">W ciągu 12 miesięcy nie ma kuponów, wykupów ani zmian oprocentowania.</p>`;
  const first=ev[0],calcH=pfCalcHash(s);
  out.innerHTML=`<div class="vlist">
    <div class="stats">
      <div class="stat t-acc"><span class="k">Wartość ${s.bd==calcDefaultBreakDay()?"dziś":"na "+pfDate(now,s.bd)}${calcTip("pgross")}</span><span class="v">${zl0(gross)}</span><span class="s">z narosłymi odsetkami, przed opłatą i podatkiem${paid>0.005?`; do tego odsetki wypłacone dotąd: <b>${zl0(paid)}</b>`:""}</span></div>
      <div class="stat t-green"><span class="k">Na rękę po zerwaniu${calcTip("ppay")}</span><span class="v v-green">${zl0(pay)}</span><span class="s">opłaty ${zl0(fee)}${tax?`, podatek ${zl0(tx)}`:" (bez podatku)"} — koszt zerwania <b>${zl0(gross-pay)}</b></span></div>
      <div class="stat t-gold"><span class="k">Przy wykupie w terminie${calcTip("pmat")}</span><span class="v">${zl0(mat)}</span><span class="s">${futC>0.005?`wykup <b>${zl0(matFin)}</b> + kupony i odsetki do wykupu <b>${zl0(futC)}</b> · `:""}${live.length>1?`ostatni wykup ${mShort(lastMat)}`:`wykup ${lastMat?mShort(lastMat):"–"}`}${anyGuess?` · prognoza przy inflacji ${fmt(CPI_PRESETS[s.sc].v,1)}%`:anyPrelim?" · stopy częściowo wstępne (szybki szacunek GUS)":""}${tax?" · po podatku":""}</span></div>
      <div class="stat t-red"><span class="k">Najbliższe zdarzenie</span><span class="v sm">${first?pfDate(first.ym,first.d):"–"}</span><span class="s">${first?`<b>${esc(first.code)}</b> — ${esc({wykup:"wykup w terminie",kupon:"wypłata odsetek",stopa:"nowe oprocentowanie"}[first.kind])}`:"brak w ciągu roku"}</span></div>
    </div>
    ${done.length?`<div class="insight warn"><span class="t">po terminie wykupu</span>${done.map(x=>esc(s.pos[r.items.indexOf(x)].code)).join(", ")} — wykupione ${done.length===1?"w":"przed"} ${esc(mLabel(now))}; nie liczymy ${done.length===1?"jej":"ich"} do sumy.</div>`:""}
    <div class="card table-card"><div class="tc-head"><h3>Serie</h3><p class="desc">${tax?"Kwoty po podatku Belki tam, gdzie wypłata jest opodatkowana.":"Bez podatku Belki (IKE / IKZE)."} Wiersz „wykup w terminie” to prognoza tam, gdzie oprocentowanie kolejnych okresów nie jest jeszcze znane.</p></div>
      <div class="frame"><table><thead><tr><th>Seria</th><th class="r">Szt.</th><th>Zakup</th><th>Wykup</th><th>Oprocentowanie${calcTip("prate",1)}</th><th class="r">Wartość${calcTip("pgross",1)}</th><th class="r">Na rękę po zerwaniu${calcTip("ppay",1)}</th><th class="r">Wykup w terminie${calcTip("pmat",1)}</th></tr></thead><tbody>
      ${live.map(x=>`<tr><td><span class="dot" style="background:var(--s-${x.spec.type})"></span><span class="code">${esc(x.code)}</span></td><td class="r num">${x.spec.count}</td><td>${pfDate(x.spec.purchase,pd(x.i))}</td><td>${pfDate(x.maturity,pd(x.i))}<br><span class="small">za ${pfIn(x.monthsToMaturity)}</span></td>
        <td><b>${pfPct(x.rateNow)}</b><br><span class="small">${Zamiana.TYPES[x.spec.type].term>(calcIsNbp(x.spec.type)?1:12)&&x.next?`do ${pfDate(x.periodEnd,pd(x.i))}`:"do wykupu"}</span></td>
        <td class="r num">${zl2(x.gross)}${x.couponsPaid>0.005?`<br><span class="small">+ wypłacone ${zl0(x.couponsPaid)}</span>`:""}</td><td class="r num"><b>${zl2(x.payout)}</b><br><span class="small">${x.fee>0?`opłata ${zl2(x.fee)}`:"bez opłaty"}${x.breakTax>0?`, podatek ${zl2(x.breakTax)}`:""}</span></td>
        <td class="r num">${zl0(x.toMaturity)}${x.futureCoupons>0.005?`<br><span class="small">w tym kupony ${zl0(x.futureCoupons)}</span>`:""}${x.maturityKnown?(x.maturityPrelim?`<br><span class="small">wstępnie</span>`:""):`<br><span class="small">prognoza</span>`}</td></tr>`).join("")}
      ${live.length>1?`<tr class="sum"><td><b>Razem</b></td><td class="r num">${live.reduce((a,x)=>a+x.spec.count,0)}</td><td></td><td></td><td></td><td class="r num"><b>${zl2(gross)}</b></td><td class="r num"><b>${zl2(pay)}</b></td><td class="r num"><b>${zl0(mat)}</b></td></tr>`:""}
      </tbody></table></div></div>
    <div class="card"><h3>Najbliższe 12 miesięcy <small>kupony, nowe oprocentowanie, wykupy</small></h3>${evHtml}</div>
    <div class="row"><a class="btn" id="p-calc" href="#${esc(calcH)}">Czy opłaca się zamienić te serie na nowe? → kalkulator zamiany</a>${s.pos.length>CALC_MAXPOS?`<span class="small">(pierwsze ${CALC_MAXPOS} serii)</span>`:""}</div>
    <details class="how"><summary>Jak to policzono</summary><ul>
      <li>Wartość na ${esc(pfDate(now,s.bd))}: 100 zł × kolejne okresy odsetkowe (kapitalizacja roczna w EDO, ROS, ROD, TOS) plus odsetki narosłe w bieżącym okresie: za pełne miesiące od rocznicy (miesięcznicy) zakupu i część bieżącego miesiąca do dnia wyceny — list emisyjny liczy je za faktyczną liczbę dni, więc wynik może się różnić o 1–2 gr na sztuce. W COI, ROR i DOR odsetki z zakończonych okresów zostały już wypłacone („wypłacone dotąd” — po podatku, bez oprocentowania).</li>
      <li>Na rękę po zerwaniu: wartość minus opłata za przedterminowy wykup (nie wyższa niż narosłe odsetki — wypłata nie mniej niż 100 zł za sztukę; ROR i DOR od 2. miesiąca: stała opłata; OTS: 100 zł bez odsetek)${tax?", minus 19% podatku od zysku":"; w IKE / IKZE bez podatku (przy wypłacie z konta opłata za wykup nie jest pobierana — tu pokazujemy zerwanie w ramach konta)"}.</li>
      <li>Oprocentowanie z listów emisyjnych. Od 2. okresu: inflacja ogłoszona w miesiącu przed okresem (odczyt GUS za P−2) + marża; ROR i DOR — stopa referencyjna NBP + marża. Odczyty do ${mShort(state.months[state.months.length-1].cpiRefMonth||now)} z archiwum, dalej scenariusz: inflacja ${fmt(CPI_PRESETS[s.sc].v,1)}%, stopa NBP ${fmt(calcNbpNow())}% (bez zmian).</li>
      <li>Przy wykupie w terminie: wartość końcowa (COI, ROR, DOR: 100 zł + ostatnie odsetki) plus kupony i odsetki należne od dziś do wykupu${tax?", wszystko po podatku":""}; bez ich oprocentowania na koncie, bez zamiany na nowe obligacje i bez odsetek wypłaconych wcześniej. Stopy liczone z szybkiego szacunku CPI oznaczamy jako wstępne — odczyt finalny GUS może się nieco różnić.</li>
      <li>To wycena orientacyjna, nie wyciąg z rachunku. Wiążące są listy emisyjne i dane w serwisie, w którym kupiłeś obligacje.</li>
    </ul></details>
    <div class="row"><span class="small">Pobierz:</span><button type="button" class="btn" id="p-csv" data-goatcounter-click="eksport-csv-p">serie i zdarzenia CSV</button><button type="button" class="btn" id="p-json" data-goatcounter-click="eksport-json-p" title="Plik z listą serii — do przeniesienia portfela na inne urządzenie albo kopii zapasowej">portfel (.json)</button><button type="button" class="btn" id="p-ics" data-goatcounter-click="eksport-ics-p" title="Kupony, odsetki, nowe oprocentowanie i wykupy do kalendarza w telefonie lub komputerze">kalendarz (.ics)</button></div>
    ${calcShareHtml}
  </div>`;
  $("#p-calc").addEventListener("click",e=>{e.preventDefault();state.calc=null;try{history.replaceState(null,"","#"+calcH)}catch(_){}state.view="zamiana";
    document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.view==="zamiana")));render();scrollTo(0,0)});
  // kalendarz: harmonogram każdej serii do wykupu (od dnia wyceny); kwoty prognozowane i wstępne oznaczone jak w widoku
  $("#p-json").addEventListener("click",()=>downloadBlob(new Blob([pfFileText(s)],{type:"application/json"}),`moj-portfel-${new Date().toISOString().slice(0,10)}.json`));
  $("#p-ics").addEventListener("click",()=>{
    const today=`${now}-${String(s.bd).padStart(2,"0")}`,day=(ym,d)=>`${ym}-${String(Math.min(d,calcDaysIn(ym))).padStart(2,"0")}`;
    const mark=k=>k==="prelim"?" (wstępnie)":k?"":" (prognoza)",src="Szacunek z Rejestru ofert obligacji (patrykw-labs.github.io/rejestr-obligacji) — wiążące są listy emisyjne. Portfel: "+location.href;
    const evs=[];
    for(const x of live){const t=x.spec.type,nbp=calcIsNbp(t),d=pd(x.i);
      for(const e of x.schedule){const date=day(e.ym,d);if(date<today)continue;
        const base={date,uid:`${x.code}-${d}-${e.ym}-${e.kind}@rejestr-obligacji`};
        if(e.kind==="kupon")evs.push(Object.assign(base,{summary:`${x.code}: ${nbp?"odsetki":"kupon"} ${zl2(e.amount)}${tax?" na rękę":""}${mark(e.known)}`,
          description:`${x.spec.count} szt. ${x.code}, ${nbp?"miesiąc":"rok"} ${e.period}: oprocentowanie ${pfPct(e.rate)}, ${nbp?"odsetki":"kupon"} ${zl2(e.amount)}${tax?" po podatku":""}. ${src}`}));
        else if(e.kind==="stopa")evs.push(Object.assign(base,{summary:`${x.code}: nowe oprocentowanie ${pfPct(e.rate)}${mark(e.known)}`,
          description:`${x.code} od tego dnia ${pfPct(e.rate)} zamiast ${pfPct(e.prev)} (${nbp?"miesiąc":"rok"} ${e.period}${nbp?"; stopa NBP + marża":"; inflacja + marża"}${e.known?"":", prognoza przy inflacji "+fmt(CPI_PRESETS[s.sc].v,1)+"%"}). ${src}`}));
        else evs.push(Object.assign(base,{alarm:true,summary:`${x.code}: wykup w terminie — ok. ${zl0(e.amount)}${tax?" na rękę":""}${mark(e.known)}`,
          description:`Wykup ${x.spec.count} szt. ${x.code} w terminie: ok. ${zl2(e.amount)}${tax?" po podatku":""}. Pieniądze możesz zamienić na nowe obligacje po cenie zamiany. ${src}`}));}}
    evs.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
    downloadIcs(`moj-portfel-${now}-${String(s.bd).padStart(2,"0")}.ics`,"Mój portfel obligacji",evs)});
  $("#p-csv").addEventListener("click",()=>{
    const rows=live.map(x=>[x.code,x.spec.count,pfDate(x.spec.purchase,pd(x.i)),pfDate(x.maturity,pd(x.i)),csvNum(x.rateNow*100),pfDate(x.periodEnd,pd(x.i)),csvNum(x.gross),csvNum(x.fee),csvNum(x.breakTax),csvNum(x.payout),csvNum(x.couponsPaid),csvNum(x.atMaturity),csvNum(x.futureCoupons),csvNum(x.toMaturity),x.maturityKnown?(x.maturityPrelim?"wstępna":"znana"):"prognoza"]);
    if(live.length>1)rows.push(["Razem",live.reduce((a,x)=>a+x.spec.count,0),"","","","",csvNum(gross),csvNum(fee),csvNum(tx),csvNum(pay),csvNum(paid),csvNum(matFin),csvNum(futC),csvNum(mat),""]);
    const evs=[[],["Data","Seria","Zdarzenie"],...ev.map(e=>[pfDate(e.ym,e.d),e.code,e.text])];
    downloadCsv(`moj-portfel-${now}-${String(s.bd).padStart(2,"0")}.csv`,["Seria","Szt.","Zakup","Wykup","Oprocentowanie (%)","Koniec okresu","Wartość (zł)","Opłata przy zerwaniu (zł)","Podatek przy zerwaniu (zł)","Na rękę po zerwaniu (zł)","Odsetki wypłacone dotąd (zł)","Wykup w terminie (zł)","Kupony do wykupu (zł)","Łącznie do wykupu (zł)","Wartość przy wykupie"],rows.concat(evs),
      [["Wycena na",pfDate(now,s.bd)],["Rachunek",tax?"zwykły (podatek Belki)":"IKE / IKZE (bez podatku Belki)"],["Inflacja dalej (prognozy)",fmt(CPI_PRESETS[s.sc].v,1)+"%"],["Link",location.href],["Źródło","Rejestr ofert obligacji — wycena orientacyjna"]])});
  calcBindShare();calcBindTips(out);
}
