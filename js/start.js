/* Rejestr ofert obligacji — start: zakładka z adresu, wczytanie danych, przełącznik motywu. Ładowany przez index.html (bez kroku budowania). */
(function(){const h=(location.hash||"").slice(1).split("&")[0];if(["oferta","wykres","seria","zamiana","kupno","portfel"].includes(h)){state.view=h;document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.view===h)))}})();
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
