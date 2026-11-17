/* Rejestr ofert obligacji — start: zakładka z adresu, wczytanie danych, przełącznik motywu. Ładowany przez index.html (bez kroku budowania). */
const VIEWS=["oferta","wykres","seria","zamiana","kupno","portfel"];
(function(){const h=(location.hash||"").slice(1).split("&")[0];if(VIEWS.includes(h)){state.view=h;document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.view===h)))}})();
// link wklejony do już otwartej karty: zmienia się tylko część po „#”, więc przeglądarka nie przeładowuje strony — czytamy adres
// od nowa (stan widoków z adresu kasujemy, każdy widok odczyta go jak przy starcie). Strona sama zmienia adres przez
// history.replaceState, które nie wywołuje hashchange — bez ryzyka zapętlenia; zapamiętany portfel w przeglądarce zostaje.
window.addEventListener("hashchange",()=>{const h=(location.hash||"").slice(1).split("&")[0];
  state.calc=null;state.buy=null;state.pf=null;state.pfLink=false;state.pfImport=null;state.linkWarn=null;
  state.ofHashRead=false;state.month=null;state.serHashRead=false;state.serie="EDO";state.serTab=null;
  state.view=VIEWS.includes(h)?h:"oferta";render();scrollTo(0,0)});
let rt;window.addEventListener("resize",()=>{clearTimeout(rt);rt=setTimeout(()=>{if(state.view==="wykres")drawChart();if(state.view==="zamiana")calcRecompute();if(state.view==="kupno")buyRecompute()},150)});

(async()=>{
  try{
    const r=await fetch("data/months.json",{cache:"no-cache"});
    if(!r.ok)throw new Error(r.status);
    const data=await r.json();
    state.raw=data;
    // serie i inflacja sprzed 2019 r. — tylko dla kalkulatora zamiany (brak pliku nie blokuje strony)
    try{const r2=await fetch("data/przed-2019.json",{cache:"no-cache"});if(r2.ok)state.pre=await r2.json()}catch(e){}
    state.months=Object.entries(data).map(([id,v])=>({id,...v})).sort((a,b)=>a.id<b.id?-1:1);
    state.loaded=true;
    const last=state.months[state.months.length-1];
    $("#stamp").innerHTML=last?`<dt>rekordów</dt><dd>${state.months.length} mies.</dd><dt>zakres</dt><dd>${mShort(state.months[0].id)} – ${mShort(last.id)}</dd><dt>ostatni</dt><dd>${mLabel(last.id)}</dd>`:"<dt>stan</dt><dd>brak rekordów</dd>";
  }catch(e){state.dbOk=false;$("#stamp").innerHTML="<dt>stan</dt><dd>błąd wczytywania</dd>"}
  render();
})();
render();

(function(){
  const root=document.documentElement,btn=$("#theme-btn");
  const mq=window.matchMedia?matchMedia("(prefers-color-scheme: dark)"):null;
  const isDark=()=>root.dataset.theme?root.dataset.theme==="dark":!!(mq&&mq.matches);
  const sync=()=>btn.classList.toggle("is-dark",isDark());
  btn.addEventListener("click",()=>{root.dataset.theme=isDark()?"light":"dark";try{localStorage.setItem("theme",root.dataset.theme)}catch(e){}sync();render()});
  if(mq&&mq.addEventListener)mq.addEventListener("change",()=>{if(!root.dataset.theme){sync();render()}});
  sync();
})();

// wersja strony (bez kroku budowania): wydanie z CHANGELOG.md (ten sam serwer, pierwsza sekcja „## vX.Y.Z”) i liczba punktów
// w „Nieopublikowane”; liczba commitów na main po wydaniu i skrót ostatniego commita z API GitHuba (pamięć 15 min w localStorage).
// Bez odpowiedzi API — samo wydanie (z „+”, gdy są nieopublikowane zmiany). Pasek górny (komputer) i stopka.
(async function showVersion(){
  const REPO="patrykw-labs/rejestr-obligacji",KEY="rejestr-obligacji:wersja";
  let rel=null,unrel=0;
  try{const t=await (await fetch("CHANGELOG.md",{cache:"no-cache"})).text();const m=t.match(/^## (v\d+\.\d+\.\d+)/m);if(m)rel=m[1];
    const sec=(t.split(/^## Nieopublikowane[ \t]*$/m)[1]||"").split(/^## v/m)[0];unrel=(sec.match(/^- /gm)||[]).length}catch(e){}
  if(!rel)return;
  let gh=null;
  try{const c=JSON.parse(localStorage.getItem(KEY)||"null");if(c&&c.rel===rel&&Date.now()-c.t<15*60e3)gh=c}catch(e){}
  if(!gh){try{const j=u=>fetch(u).then(r=>r.ok?r.json():Promise.reject(new Error(r.status)));
      const [cmp,ref]=await Promise.all([j(`https://api.github.com/repos/${REPO}/compare/${rel}...main?per_page=1`),j(`https://api.github.com/repos/${REPO}/git/ref/heads/main`)]);
      gh={rel,t:Date.now(),ahead:+cmp.ahead_by||0,sha:String(ref.object.sha).slice(0,7)};try{localStorage.setItem(KEY,JSON.stringify(gh))}catch(e){}}catch(e){gh=null}}
  const relUrl=`https://github.com/${REPO}/releases/tag/${rel}`;
  let text=rel,url=relUrl,title=`Wydanie ${rel}`;
  if(gh&&gh.ahead>0){text=`${rel} +${gh.ahead} · ${gh.sha}`;url=`https://github.com/${REPO}/compare/${rel}...${gh.sha}`;
    title=`Strona z gałęzi main: ${gh.ahead} ${gh.ahead===1?"commit":[2,3,4].includes(gh.ahead%10)&&!(gh.ahead>=12&&gh.ahead<=14)?"commity":"commitów"} po wydaniu ${rel} (ostatni: ${gh.sha}) — kliknij, aby zobaczyć zmiany`}
  else if(gh)title=`Strona odpowiada wydaniu ${rel} (commit ${gh.sha})`;
  else if(unrel){text=rel+"+";url=`https://github.com/${REPO}/blob/main/CHANGELOG.md`;title=`Wydanie ${rel} i zmiany opisane w CHANGELOG jako nieopublikowane`}
  const top=$("#ver");if(top){top.textContent=text;top.href=url;top.title=title;top.setAttribute("aria-label","Wersja strony: "+title);top.hidden=false}
  const foot=$("#ver-foot");if(foot){const a=foot.querySelector("a");a.textContent="wersja "+text;a.href=url;a.title=title;foot.hidden=false}
})();
