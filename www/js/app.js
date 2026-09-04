/*  Recalbox OS Web — frontend
 *  ------------------------------------------------------------------
 *  RetroBat-inspired frontend on top of EmulatorJS:
 *   - persistent game library (IndexedDB) with favorites / recents / play-count
 *   - full keyboard + gamepad navigation (system view / game view / menus)
 *   - RetroBat-style hotkeys in game (save/load state, slots, rewind, FF, screenshot…)
 *   - Game Control Center overlay (Hotkey + B  /  Ctrl+F12)
 *   - per-system BIOS manager, quick search, sorting, collections
 *   - global settings (shader set, rewind, FPS, integer scale…) injected to the emulator
 */
(function(){
  "use strict";

  /* ================= helpers ================= */
  function byId(id){ return document.getElementById(id); }
  function $(sel,root){ return (root||document).querySelector(sel); }
  function $$(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function esc(s){ return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
  function fmtBytes(n){ if(!n&&n!==0)return ""; if(n<1024)return n+" B"; if(n<1048576)return (n/1024).toFixed(0)+" KB"; if(n<1073741824)return (n/1048576).toFixed(1)+" MB"; return (n/1073741824).toFixed(2)+" GB"; }
  function fmtAgo(ts){ if(!ts)return "never"; var d=Date.now()-ts; var m=Math.floor(d/60000); if(m<1)return "just now"; if(m<60)return m+" min ago"; var h=Math.floor(m/60); if(h<24)return h+" h ago"; var dd=Math.floor(h/24); if(dd<30)return dd+" d ago"; return new Date(ts).toLocaleDateString(); }
  function fmtDur(s){ s=Math.round(s||0); if(s<60)return s+"s"; var m=Math.floor(s/60); if(m<60)return m+" min"; var h=Math.floor(m/60); return h+" h "+(m%60)+" min"; }
  function cleanName(fn){ return fn.replace(/\.[^.]+$/,"").replace(/\s*[\(\[][^\)\]]*[\)\]]/g,"").replace(/[_]+/g," ").trim()||fn; }
  function extOf(fn){ var m=/\.([^.]+)$/.exec(fn.toLowerCase()); return m?m[1]:""; }
  function debounce(fn,ms){ var t; return function(){ var a=arguments,c=this; clearTimeout(t); t=setTimeout(function(){fn.apply(c,a);},ms); }; }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }

  var TRACE=[]; function trace(){ var a=Array.prototype.slice.call(arguments); TRACE.push(new Date().toISOString().slice(11,23)+" "+a.join(" ")); if(TRACE.length>400) TRACE.shift(); }
  /* Mouse vs. keyboard/gamepad: hover only moves the focus after a *real* pointer movement.
     (Browsers fire synthetic mouseenter events when the DOM changes under a stationary cursor —
      e.g. when a dialog opens or a grid scrolls — which would steal the focus from the controller.) */
  var mouse={x:-1,y:-1,active:false};
  document.addEventListener("mousemove",function(e){ if(e.clientX!==mouse.x||e.clientY!==mouse.y){ mouse.x=e.clientX; mouse.y=e.clientY; mouse.active=true; } },true);
  document.addEventListener("keydown",function(){ mouse.active=false; },true);
  function hoverOK(){ return mouse.active; }
  var toastTimer=null;
  function toast(msg,ms){ var t=byId("toast"); t.innerHTML=msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(function(){t.classList.remove("show")},ms||3000); }

  /* ---------- tiny navigation "click" sound (Web Audio, no assets) ---------- */
  var audioCtx=null;
  function blip(kind){
    if(!settings.navSounds)return;
    try{
      if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state==="suspended") audioCtx.resume();
      var o=audioCtx.createOscillator(), g=audioCtx.createGain();
      o.type="square";
      var f = kind==="select"?880: kind==="back"?330: 520;
      o.frequency.setValueAtTime(f,audioCtx.currentTime);
      if(kind==="select") o.frequency.exponentialRampToValueAtTime(f*1.5,audioCtx.currentTime+.06);
      g.gain.setValueAtTime(.0001,audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(.05,audioCtx.currentTime+.005);
      g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+(kind==="select"?.12:.05));
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime+.14);
    }catch(e){}
  }

  /* ================= persistent storage (IndexedDB) =================
     roms  : {id, sysId, name, fileName, size, added, lastPlayed, playCount, playTime, fav, blob(File)}
     bios  : {key: sysId+"/"+fileName, sysId, fileName, blob}
     shots : {id: romId, blob}   — last screenshot, used as box art           */
  var DB=(function(){
    var dbp=null;
    function open(){
      if(dbp)return dbp;
      dbp=new Promise(function(res,rej){
        var r=indexedDB.open("recalbox-web",2);
        r.onupgradeneeded=function(){
          var db=r.result;
          if(!db.objectStoreNames.contains("roms")) db.createObjectStore("roms",{keyPath:"id"});
          if(!db.objectStoreNames.contains("bios")) db.createObjectStore("bios",{keyPath:"key"});
          if(!db.objectStoreNames.contains("shots")) db.createObjectStore("shots",{keyPath:"id"});
        };
        r.onsuccess=function(){res(r.result)}; r.onerror=function(){rej(r.error)};
      });
      return dbp;
    }
    function tx(store,mode,fn){
      return open().then(function(db){
        return new Promise(function(res,rej){
          var t=db.transaction(store,mode); var s=t.objectStore(store); var out=fn(s);
          t.oncomplete=function(){res(out&&out.result!==undefined?out.result:out)}; t.onerror=function(){rej(t.error)};
        });
      });
    }
    return {
      all:function(store){ return tx(store,"readonly",function(s){return s.getAll();}); },
      get:function(store,key){ return tx(store,"readonly",function(s){return s.get(key);}); },
      put:function(store,val){ return tx(store,"readwrite",function(s){return s.put(val);}); },
      del:function(store,key){ return tx(store,"readwrite",function(s){return s.delete(key);}); },
      clear:function(store){ return tx(store,"readwrite",function(s){return s.clear();}); }
    };
  })();

  /* ================= settings (localStorage) ================= */
  var DEFAULTS={
    shader:"disabled",        // disabled | crt-easymode.glslp | crt-geom.glslp | crt-aperture.glslp | crt-mattias.glslp | 2xScaleHQ.glslp | 4xScaleHQ.glslp
    rewind:false,
    showFps:false,
    integerScale:false,
    smooth:false,
    volume:0.7,
    ffRatio:"3.0",
    autoLoadState:false,      // "Auto Save/Load" like RetroBat
    autoSaveState:true,
    navSounds:true,
    bezel:false,
    theme:"carbon",           // carbon | recalbox | ocean
    hideEmptySystems:false,
    kidMode:false,
    controlsShown:{},         // sysId -> true after first "tattoo" is shown
    hotkeyBtn:8               // gamepad button used as HOTKEY (8 = SELECT)
  };
  var settings={};
  function loadSettings(){ try{ settings=Object.assign({},DEFAULTS,JSON.parse(localStorage.getItem("rbw-settings")||"{}")); }catch(e){ settings=Object.assign({},DEFAULTS);} }
  function saveSettings(){ localStorage.setItem("rbw-settings",JSON.stringify(settings)); }
  loadSettings();

  /* ================= bundled emulator cores (offline) =================
     Every core is shipped inside the app (www/data/cores/, see scripts/download-cores.js)
     exactly like RetroArch/RetroPie ship theirs — nothing is downloaded at runtime.
     CORE_FILES lists the files each core needs; the runtime picks one of them
     (WebGL2 build, -legacy WebGL1 build, -thread pthread build). */
  var CORE_FILES={
    fceumm:["fceumm-wasm.data","fceumm-legacy-wasm.data"], nestopia:["nestopia-wasm.data","nestopia-legacy-wasm.data"],
    snes9x:["snes9x-wasm.data","snes9x-legacy-wasm.data"], mupen64plus_next:["mupen64plus_next-wasm.data","mupen64plus_next-legacy-wasm.data"],
    gambatte:["gambatte-wasm.data","gambatte-legacy-wasm.data"], mgba:["mgba-wasm.data","mgba-legacy-wasm.data"],
    melonds:["melonds-wasm.data","melonds-legacy-wasm.data"], pcsx_rearmed:["pcsx_rearmed-wasm.data","pcsx_rearmed-legacy-wasm.data"],
    ppsspp:["ppsspp-thread-wasm.data","ppsspp-assets.zip"], genesis_plus_gx:["genesis_plus_gx-wasm.data","genesis_plus_gx-legacy-wasm.data"],
    smsplus:["smsplus-wasm.data","smsplus-legacy-wasm.data"], yabause:["yabause-wasm.data","yabause-legacy-wasm.data"],
    stella2014:["stella2014-wasm.data","stella2014-legacy-wasm.data"], a5200:["a5200-wasm.data","a5200-legacy-wasm.data"],
    prosystem:["prosystem-wasm.data","prosystem-legacy-wasm.data"], handy:["handy-wasm.data","handy-legacy-wasm.data"],
    virtualjaguar:["virtualjaguar-wasm.data","virtualjaguar-legacy-wasm.data"], mednafen_pce:["mednafen_pce-wasm.data","mednafen_pce-legacy-wasm.data"],
    mednafen_wswan:["mednafen_wswan-wasm.data","mednafen_wswan-legacy-wasm.data"], mednafen_ngp:["mednafen_ngp-wasm.data","mednafen_ngp-legacy-wasm.data"],
    vice_x64sc:["vice_x64sc-wasm.data","vice_x64sc-legacy-wasm.data"], puae:["puae-wasm.data","puae-legacy-wasm.data"],
    fbneo:["fbneo-wasm.data","fbneo-legacy-wasm.data"], mame2003_plus:["mame2003_plus-wasm.data","mame2003_plus-legacy-wasm.data"],
    dosbox_pure:["dosbox_pure-thread-wasm.data","dosbox_pure-thread-legacy-wasm.data"]
  };
  var CORE_ALT={nestopia:"nes"};   // alternative cores selectable in the in-game menu (Core → requires restart)
  var CORES={ready:false,files:{},missing:[],bytes:0,version:""};   // files[name]=size|false
  function coreFileName(sys){ return coreLabel(sys).replace(/-/g,"_"); }
  function coreInstalled(sys){ if(!CORES.ready||sys.collection)return true; var fs=CORE_FILES[coreFileName(sys)]||[]; return fs.every(function(f){ return !!CORES.files[f]; }); }
  function coreStatus(sys){
    var name=coreFileName(sys), fs=CORE_FILES[name]||[], miss=fs.filter(function(f){ return !CORES.files[f]; });
    return {core:name,files:fs,missing:miss,ok:miss.length===0,size:fs.reduce(function(a,f){ return a+(CORES.files[f]||0); },0)};
  }
  // HEAD every core file once at boot (local files, no network) → precise inventory even without a manifest
  var coresReady=(function(){
    var names=[]; Object.keys(CORE_FILES).forEach(function(c){ CORE_FILES[c].forEach(function(f){ if(names.indexOf(f)<0) names.push(f); }); });
    var probe=function(f){ return fetch("data/cores/"+f,{method:"HEAD",cache:"no-store"}).then(function(r){ var len=parseInt(r.headers.get("content-length")||"0",10); return r.ok?(len||1):false; }).catch(function(){ return false; }); };
    return fetch("data/cores/manifest.json",{cache:"no-store"}).then(function(r){ return r.ok?r.json():null; }).catch(function(){ return null; }).then(function(m){
      if(m&&m.ejsVersion) CORES.version=m.ejsVersion;
      return Promise.all(names.map(probe)).then(function(res){
        names.forEach(function(f,i){ CORES.files[f]=res[i]; if(res[i]) CORES.bytes+=res[i]; else CORES.missing.push(f); });
        CORES.ready=true; return CORES;
      });
    });
  })();

  /* ---- offline guard: the app must never reach the network. EmulatorJS 4.2.3 has two places
     where it would (an update check against its CDN and a "failsafe" that downloads a core
     from the CDN when the local file is missing). Both are neutralised here, at fetch/XHR level,
     so a missing core is reported as such instead of being silently fetched (Electron blocks
     these requests as well — this is the belt to main.js's braces). */
  (function offlineGuard(){
    var isRemote=function(u){ try{ var x=new URL(String(u),location.href); return /^https?:$/.test(x.protocol) && x.origin!==location.origin; }catch(e){ return false; } };
    var _fetch=window.fetch;
    window.fetch=function(input,init){ var u=(input&&input.url)||input; if(isRemote(u)){ trace("blocked fetch",String(u)); console.warn("[offline] blocked network request:",String(u)); return Promise.resolve(new Response(null,{status:503,statusText:"offline"})); } return _fetch.apply(this,arguments); };
    var _open=XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open=function(m,u){ if(isRemote(u)){ trace("blocked xhr",String(u)); console.warn("[offline] blocked network request:",String(u)); this.__rbwBlocked=true; } return _open.apply(this,arguments); };
    var _send=XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send=function(){ if(this.__rbwBlocked){ var x=this; setTimeout(function(){ try{ x.dispatchEvent(new Event("error")); }catch(e){} },0); return; } return _send.apply(this,arguments); };
  })();

  /* ================= icons ================= */
  function consoleIcon(color,label){
    return '<svg viewBox="0 0 24 24"><rect x="2.4" y="6" width="19.2" height="12" rx="2.5" fill="'+color+'"/><rect x="4.2" y="7.8" width="15.6" height="6.6" rx="1.2" fill="#0b0b10"/><text x="12" y="12.6" text-anchor="middle" font-size="4.2" font-family="monospace" font-weight="bold" fill="#fff">'+label+'</text></svg>';
  }
  function handheldIcon(color,label){
    return '<svg viewBox="0 0 24 24"><rect x="6.5" y="2" width="11" height="20" rx="2.5" fill="'+color+'"/><rect x="7.6" y="3.4" width="8.8" height="9.6" rx="1.2" fill="#0b0b10"/><text x="12" y="9.4" text-anchor="middle" font-size="3.2" font-family="monospace" font-weight="bold" fill="#fff">'+label+'</text><circle cx="11.3" cy="15.8" r="1.5" fill="#e8e8ee"/><circle cx="15" cy="15.8" r="1.5" fill="#e8e8ee"/><rect x="9" y="18.6" width="6" height="1.4" rx="0.7" fill="#e8e8ee"/></svg>';
  }
  function arcadeIcon(color,label){
    return '<svg viewBox="0 0 24 24"><path d="M5 22V9a7 7 0 0 1 14 0v13z" fill="'+color+'"/><rect x="7" y="9" width="10" height="6" rx="1" fill="#0b0b10"/><text x="12" y="13.3" text-anchor="middle" font-size="3.6" font-family="monospace" font-weight="bold" fill="#fff">'+label+'</text><circle cx="9.5" cy="18" r="1.3" fill="#e8e8ee"/><circle cx="14.5" cy="18" r="1.3" fill="#e8e8ee"/></svg>';
  }
  function computerIcon(color,label){
    return '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="11" rx="1.5" fill="'+color+'"/><rect x="4.6" y="5.6" width="14.8" height="7.8" rx=".8" fill="#0b0b10"/><text x="12" y="10.6" text-anchor="middle" font-size="3.8" font-family="monospace" font-weight="bold" fill="#fff">'+label+'</text><rect x="2" y="17" width="20" height="3.5" rx="1" fill="'+color+'"/></svg>';
  }
  var ICON={
    heart:'<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 5 6.4 5c2 0 3.3 1.1 4.1 2.3L12 9l1.5-1.7C14.3 6.1 15.6 5 17.6 5 21 5 23.1 8.4 21.6 11.8 19.5 16.4 12 21 12 21z"/></svg>',
    clock:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    all:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
    gear:'<svg viewBox="0 0 24 24"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.5 7.5 0 0 0-1.7-1L15 3H9l-.4 2.7a7.5 7.5 0 0 0-1.7 1l-2.5-1-2 3.5L4.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.5 7.5 0 0 0 1.7 1L9 21h6l.4-2.7a7.5 7.5 0 0 0 1.7-1l2.5 1 2-3.5zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>',
    search:'<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    play:'<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z"/></svg>',
    chip:'<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M12 2v3M15 2v3M9 19v3M12 19v3M15 19v3M2 9h3M2 12h3M2 15h3M19 9h3M19 12h3M19 15h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    pad:'<svg viewBox="0 0 24 24"><path d="M6.5 7h11a5 5 0 0 1 4.9 6l-1 5.2a2.4 2.4 0 0 1-4.2 1L15 16.5H9L6.8 19.2a2.4 2.4 0 0 1-4.2-1l-1-5.2A5 5 0 0 1 6.5 7zM7 10v4M5 12h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="11" r="1.1"/><circle cx="18.3" cy="13" r="1.1"/></svg>',
    trash:'<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    dice:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.6" fill="#0b0b10"/><circle cx="16" cy="8" r="1.6" fill="#0b0b10"/><circle cx="12" cy="12" r="1.6" fill="#0b0b10"/><circle cx="8" cy="16" r="1.6" fill="#0b0b10"/><circle cx="16" cy="16" r="1.6" fill="#0b0b10"/></svg>',
    info:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.5" r="1.3"/></svg>',
    close:'<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    save:'<svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v15H5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><rect x="8" y="3" width="7" height="5" rx=".8"/><rect x="8" y="13" width="8" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    load:'<svg viewBox="0 0 24 24"><path d="M3 7h6l2 2h10v11H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 11v6M9.5 14.5 12 17l2.5-2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    camera:'<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    exit:'<svg viewBox="0 0 24 24"><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    reset:'<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ff:'<svg viewBox="0 0 24 24"><path d="M3 5v14l9-7zM12 5v14l9-7z"/></svg>',
    rew:'<svg viewBox="0 0 24 24"><path d="M21 5v14l-9-7zM12 5v14l-9-7z"/></svg>',
    pause:'<svg viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/></svg>',
    star:'<svg viewBox="0 0 24 24"><path d="m12 2.8 2.9 6 6.6.9-4.8 4.6 1.2 6.6L12 17.8l-5.9 3.1 1.2-6.6L2.5 9.7l6.6-.9z"/></svg>',
    file:'<svg viewBox="0 0 24 24"><path d="M6 2h8l5 5v15H6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 2v5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    check:'<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    fullscreen:'<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    keyboard:'<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 10h1M10 10h1M14 10h1M18 10h1M6 14h1M9 14h6M18 14h1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  /* ================= systems =================
     core   = EmulatorJS generic system name (EJS_core)
     exts   = accepted file extensions when adding a ROM
     bios   = BIOS files (name → required?) the core looks for in /  (RetroBat "Missing BIOS check")
     controls = short "tattoo" describing the default keyboard layout           */
  var KB_STD="ARROWS = D-PAD · Z = B/1 · X = A/2 · A = Y/3 · S = X/4 · ENTER = START · V = SELECT · Q/E = L/R";
  var SYSTEMS=[
    {id:"nes",name:"Nintendo (NES)",short:"NES",maker:"Nintendo",year:1983,core:"nes",color:"#e04040",note:"8-bit home console",exts:["nes","fds","unf","unif"],kind:"console",controls:"ARROWS = D-PAD · Z = B · X = A · ENTER = START · V = SELECT",bios:[{name:"disksys.rom",req:false,desc:"Famicom Disk System (only for .fds)"}]},
    {id:"snes",name:"Super Nintendo",short:"SNES",maker:"Nintendo",year:1990,core:"snes",color:"#8d8dff",note:"16-bit home console",exts:["sfc","smc","fig","swc","bs"],kind:"console",controls:KB_STD},
    {id:"n64",name:"Nintendo 64",short:"N64",maker:"Nintendo",year:1996,core:"n64",color:"#5ec18a",note:"3D era · 64-bit",exts:["n64","z64","v64","ndd"],kind:"console",controls:"ARROWS = D-PAD · T/G/F/H = ANALOG STICK · Z = A · X = B · S = Z-TRIGGER · Q/E = L/R · I/J/K/L = C-BUTTONS · ENTER = START"},
    {id:"gb",name:"Game Boy / Color",short:"GB",maker:"Nintendo",year:1989,core:"gb",color:"#9ad07a",note:"8-bit handheld",exts:["gb","gbc","sgb"],kind:"handheld",controls:"ARROWS = D-PAD · Z = B · X = A · ENTER = START · V = SELECT"},
    {id:"gba",name:"Game Boy Advance",short:"GBA",maker:"Nintendo",year:2001,core:"gba",color:"#b862c0",note:"32-bit handheld",exts:["gba"],kind:"handheld",controls:"ARROWS = D-PAD · Z = B · X = A · Q/E = L/R · ENTER = START · V = SELECT",bios:[{name:"gba_bios.bin",req:false,desc:"Optional, improves compatibility"}]},
    {id:"nds",name:"Nintendo DS",short:"NDS",maker:"Nintendo",year:2004,core:"nds",color:"#d9a066",note:"dual-screen handheld",exts:["nds"],kind:"handheld",controls:KB_STD+" · MOUSE = TOUCH SCREEN",bios:[{name:"bios7.bin",req:false},{name:"bios9.bin",req:false},{name:"firmware.bin",req:false}]},
    {id:"psx",name:"Sony PlayStation",short:"PSX",maker:"Sony",year:1994,core:"psx",color:"#b8b8c8",note:"32-bit CD console",exts:["cue","bin","img","iso","pbp","chd","m3u","ecm","exe","zip","7z"],kind:"console",multi:true,controls:"ARROWS = D-PAD · Z = CROSS · X = CIRCLE · A = SQUARE · S = TRIANGLE · Q/E = L1/R1 · TAB/R = L2/R2 · ENTER = START · V = SELECT",bios:[{name:"scph5501.bin",req:true,desc:"US BIOS (recommended)"},{name:"scph5500.bin",req:false,desc:"JP BIOS"},{name:"scph5502.bin",req:false,desc:"EU BIOS"},{name:"scph1001.bin",req:false,desc:"US BIOS (alt)"}]},
    {id:"psp",name:"PlayStation Portable",short:"PSP",maker:"Sony",year:2004,core:"psp",threads:true,color:"#6b6bb0",note:"handheld · needs a fast PC",exts:["iso","cso","pbp","chd","elf","prx","zip","7z"],kind:"handheld",controls:"ARROWS = D-PAD · T/G/F/H = ANALOG · Z = CROSS · X = CIRCLE · A = SQUARE · S = TRIANGLE · Q/E = L/R · ENTER = START · V = SELECT"},
    {id:"segaMD",name:"Sega Genesis / Mega Drive",short:"GEN",maker:"Sega",year:1988,core:"segaMD",color:"#5a6bff",note:"16-bit home console",exts:["md","gen","bin","smd","sg","zip","7z"],kind:"console",controls:"ARROWS = D-PAD · Z = A · X = B · A = C · ENTER = START · V = MODE"},
    {id:"segaMS",name:"Sega Master System",short:"SMS",maker:"Sega",year:1985,core:"segaMS",color:"#7ab0ff",note:"8-bit home console",exts:["sms","zip","7z"],kind:"console",controls:"ARROWS = D-PAD · Z = 1 · X = 2 · ENTER = PAUSE"},
    {id:"segaGG",name:"Sega Game Gear",short:"GG",maker:"Sega",year:1990,core:"segaGG",color:"#b07898",note:"8-bit handheld",exts:["gg","zip","7z"],kind:"handheld",controls:"ARROWS = D-PAD · Z = 1 · X = 2 · ENTER = START"},
    {id:"segaCD",name:"Sega CD",short:"SCD",maker:"Sega",year:1991,core:"segaCD",color:"#4a55b8",note:"CD add-on",exts:["cue","bin","iso","chd","m3u","zip","7z"],kind:"console",multi:true,controls:"ARROWS = D-PAD · Z = A · X = B · A = C · ENTER = START",bios:[{name:"bios_CD_U.bin",req:true,desc:"US BIOS"},{name:"bios_CD_E.bin",req:false,desc:"EU BIOS"},{name:"bios_CD_J.bin",req:false,desc:"JP BIOS"}]},
    {id:"segaSaturn",name:"Sega Saturn",short:"SAT",maker:"Sega",year:1994,core:"segaSaturn",color:"#f08050",note:"32-bit CD console",exts:["cue","bin","iso","chd","zip","7z"],kind:"console",multi:true,controls:KB_STD,bios:[{name:"saturn_bios.bin",req:true,desc:"Saturn BIOS"},{name:"sega_101.bin",req:false},{name:"mpr-17933.bin",req:false}]},
    {id:"atari2600",name:"Atari 2600",short:"2600",maker:"Atari",year:1977,core:"atari2600",color:"#f5a040",note:"first-gen console",exts:["a26","bin","zip","7z"],kind:"console",controls:"ARROWS = JOYSTICK · Z = FIRE · ENTER = RESET · V = SELECT"},
    {id:"atari5200",name:"Atari 5200",short:"5200",maker:"Atari",year:1982,core:"atari5200",color:"#f28a40",note:"home console",exts:["a52","bin","zip","7z"],kind:"console",controls:"ARROWS = JOYSTICK · Z/X = FIRE · ENTER = START · V = PAUSE",bios:[{name:"5200.rom",req:false,desc:"Atari 5200 BIOS"}]},
    {id:"atari7800",name:"Atari 7800",short:"7800",maker:"Atari",year:1986,core:"atari7800",color:"#e87040",note:"home console",exts:["a78","bin","zip","7z"],kind:"console",controls:"ARROWS = JOYSTICK · Z/X = FIRE 1/2 · ENTER = RESET · V = SELECT",bios:[{name:"7800 BIOS (U).rom",req:false}]},
    {id:"lynx",name:"Atari Lynx",short:"LYNX",maker:"Atari",year:1989,core:"lynx",color:"#e05a5a",note:"16-bit handheld",exts:["lnx","zip","7z"],kind:"handheld",controls:"ARROWS = D-PAD · Z/X = A/B · Q/E = OPTION 1/2 · ENTER = PAUSE",bios:[{name:"lynxboot.img",req:true,desc:"Lynx boot ROM"}]},
    {id:"jaguar",name:"Atari Jaguar",short:"JAG",maker:"Atari",year:1993,core:"jaguar",color:"#c06a40",note:"64-bit console",coreOptions:{"virtualjaguar_bios":"enabled"},exts:["j64","jag","rom","abs","cof","bin","prg","zip","7z"],kind:"console",controls:"ARROWS = D-PAD · Z/X/A = A/B/C · ENTER = PAUSE · V = OPTION"},
    {id:"pce",name:"PC Engine / TurboGrafx-16",short:"PCE",maker:"NEC",year:1987,core:"pce",color:"#4ab0c0",note:"16-bit console",exts:["pce","sgx","cue","chd","zip","7z"],kind:"console",controls:"ARROWS = D-PAD · Z = II · X = I · ENTER = RUN · V = SELECT",bios:[{name:"syscard3.pce",req:false,desc:"Only for CD games"}]},
    {id:"ws",name:"WonderSwan / Color",short:"WS",maker:"Bandai",year:1999,core:"ws",color:"#c07ac0",note:"handheld",exts:["ws","wsc","pc2","zip","7z"],kind:"handheld",controls:"ARROWS = X-PAD · I/J/K/L = Y-PAD · Z = B · X = A · ENTER = START"},
    {id:"ngp",name:"Neo Geo Pocket / Color",short:"NGP",maker:"SNK",year:1998,core:"ngp",color:"#5ab090",note:"handheld",exts:["ngp","ngc","npc","zip","7z"],kind:"handheld",controls:"ARROWS = D-PAD · Z = A · X = B · ENTER = OPTION"},
    {id:"c64",name:"Commodore 64",short:"C64",maker:"Commodore",year:1982,core:"c64",color:"#6a9cd0",note:"home computer",exts:["d64","t64","prg","crt","g64","x64","tap","zip","7z"],kind:"computer",controls:"ARROWS = JOYSTICK · Z = FIRE · ENTER = RETURN · EMULATOR MENU → KEYBOARD"},
    {id:"amiga",name:"Commodore Amiga",short:"AMIGA",maker:"Commodore",year:1985,core:"amiga",color:"#c0507a",note:"home computer · needs Kickstart",exts:["adf","adz","hdf","lha","ipf","dms","m3u","zip","7z"],kind:"computer",multi:true,controls:"ARROWS = JOYSTICK · Z = FIRE · MOUSE = MOUSE",bios:[{name:"kick34005.A500",req:true,desc:"Kickstart 1.3 (A500)"},{name:"kick40068.A1200",req:false,desc:"Kickstart 3.1 (A1200)"}]},
    {id:"arcade",name:"Arcade (FinalBurn Neo)",short:"ARC",maker:"Various",year:1985,core:"arcade",color:"#6a5ad8",note:"coin-op · CPS / Neo Geo / more",exts:["zip","7z"],kind:"arcade",arcade:true,controls:"ARROWS = JOYSTICK · Z/X/A/S/Q/E = BUTTONS 1-6 · V = INSERT COIN · ENTER = START",bios:[{name:"neogeo.zip",req:false,desc:"Required for Neo Geo games"},{name:"pgm.zip",req:false,desc:"PGM games"}]},
    {id:"mame",name:"MAME 2003 Plus",short:"MAME",maker:"Various",year:1980,core:"mame",color:"#8ab040",note:"classic arcade (0.78 romset)",coreOptions:{"mame2003-plus_skip_disclaimer":"enabled","mame2003-plus_skip_warnings":"enabled"},exts:["zip","7z"],kind:"arcade",arcade:true,controls:"ARROWS = JOYSTICK · Z/X/A/S/Q/E = BUTTONS 1-6 · V = INSERT COIN · ENTER = START · TAB = MAME MENU",bios:[{name:"neogeo.zip",req:false,desc:"Required for Neo Geo games"}]},
    {id:"dos",name:"MS-DOS (DOSBox Pure)",short:"DOS",maker:"IBM PC",year:1981,core:"dos",threads:true,color:"#3a7cc8",note:"PC games 1980s-90s",exts:["zip","exe","com","bat","iso","cue","img","dosz"],kind:"computer",controls:"KEYBOARD = KEYBOARD (settings → Direct Keyboard Input) · MOUSE = MOUSE · GAMEPAD = MAPPED VIA DOSBox MENU"}
  ];
  SYSTEMS.forEach(function(s){
    s.icon = s.kind==="handheld"?handheldIcon(s.color,s.short): s.kind==="arcade"?arcadeIcon(s.color,s.short): s.kind==="computer"?computerIcon(s.color,s.short): consoleIcon(s.color,s.short);
  });
  var COLLECTIONS=[
    {id:"recent",name:"Recently played",short:"RECENT",icon:ICON.clock,color:"#ffb347",collection:true},
    {id:"fav",name:"Favorites",short:"FAVS",icon:ICON.heart,color:"#ff5a7a",collection:true},
    {id:"all",name:"All games",short:"ALL",icon:ICON.all,color:"#8b8b9a",collection:true}
  ];
  function findSys(id){ for(var i=0;i<SYSTEMS.length;i++) if(SYSTEMS[i].id===id) return SYSTEMS[i]; for(i=0;i<COLLECTIONS.length;i++) if(COLLECTIONS[i].id===id) return COLLECTIONS[i]; return null; }
  function sysAcceptsExt(sys,ext){ return sys.exts.indexOf(ext)>=0; }
  function guessSystem(fileName){
    var ext=extOf(fileName);
    var cands=SYSTEMS.filter(function(s){ return sysAcceptsExt(s,ext); });
    // prefer systems where the extension is unambiguous (not zip/bin/iso/cue)
    if(cands.length>1 && ["zip","7z","bin","iso","cue","img","chd","m3u"].indexOf(ext)>=0) return null;
    return cands.length===1?cands[0]:(cands[0]||null);
  }

  /* ================= state ================= */
  var ROMS=[];               // loaded from DB (blob kept in memory: File objects are cheap handles)
  var BIOS={};               // key -> record
  var SHOTS={};              // romId -> objectURL
  var view="boot";           // boot | systems | library | player
  var currentSys=null;
  var libSort=localStorage.getItem("rbw-sort")||"name";
  var libFilter="";
  var focus={systems:0, lib:0, cons:0, zone:"games"};
  var gameFocus=null;

  /* ================= boot ================= */
  var booted=false;
  function bootNow(){
    var b=byId("boot"); b.classList.add("out");
    setTimeout(function(){ b.classList.remove("active"); b.classList.remove("out"); showSystems(); },380);
  }
  function triggerBoot(e){ if(booted)return; if(e&&e.type==="keydown"&&(e.key==="Meta"||e.key==="Control"||e.key==="Alt"||e.key==="Shift"))return; booted=true; bootNow(); }
  byId("boot").addEventListener("click",triggerBoot);
  document.addEventListener("keydown",triggerBoot);
  // load library while boot screen is displayed
  /* Bundled free library (roms/library.json): homebrew, open-source, freeware and rights-holder-released
     titles for (almost) every system, so each core can be tried without adding anything. Stats for
     these games (favorite, play count, time, custom name) live in localStorage "rbw-embedded". */
  var bundledReady=fetch("roms/library.json",{cache:"no-store"}).then(function(r){ return r.ok?r.json():{games:[]}; }).catch(function(){ return {games:[]}; })
    .then(function(lib){
      /* games flagged restricted (mamedev.org arcade titles) are fetched at build time by scripts/download-roms.js and
         are not part of the repository — list them only when the file is really there. */
      var probes=(lib.games||[]).filter(function(g){ return g.restricted; }).map(function(g){
        return fetch("roms/"+g.file,{method:"HEAD",cache:"no-store"}).then(function(x){ return [g.file,x.ok]; }).catch(function(){ return [g.file,false]; });
      });
      return Promise.all(probes).then(function(res){ lib.present={}; res.forEach(function(p){ lib.present[p[0]]=p[1]; }); return lib; });
    });
  var EMB_STATS={}; try{ EMB_STATS=JSON.parse(localStorage.getItem("rbw-embedded")||"{}")||{}; if(EMB_STATS.fav!==undefined&&!EMB_STATS["embedded-2048"]){ EMB_STATS={"embedded-2048":EMB_STATS}; } }catch(e){ EMB_STATS={}; }
  var libReady=Promise.all([DB.all("roms"),DB.all("bios"),DB.all("shots"),coresReady.catch(function(){}),bundledReady]).then(function(r){
    ROMS=(r[0]||[]).map(function(x){ x.fav=!!x.fav; x.playCount=x.playCount||0; x.playTime=x.playTime||0; return x; });
    (r[1]||[]).forEach(function(b){ BIOS[b.key]=b; });
    (r[2]||[]).forEach(function(s){ try{ SHOTS[s.id]=URL.createObjectURL(s.blob); }catch(e){} });
    // bundled free games (never stored in the DB — they come from the app package)
    var bundled=((r[4]&&r[4].games)||[]).filter(function(g){ return findSys(g.sys) && !(g.restricted && r[4].present && r[4].present[g.file]===false); }).map(function(g){
      var st=EMB_STATS[g.id]||{};
      return {id:g.id,sysId:g.sys,name:st.name||g.name,fileName:g.file,url:"roms/"+g.file,embedded:true,size:g.size||0,added:0,
        playCount:st.playCount||0,playTime:st.playTime||0,lastPlayed:st.lastPlayed||0,fav:!!st.fav,
        meta:{author:g.author,year:g.year,license:g.license,desc:g.desc,players:g.players,genre:g.genre,source:g.source,origName:g.name}};
    });
    ROMS=bundled.concat(ROMS);
    // sizes of bundled files (HEAD, local) — shown in the library
    bundled.forEach(function(g){ fetch(g.url,{method:"HEAD"}).then(function(x){ var n=parseInt(x.headers.get("content-length")||"0",10); if(n){ g.size=n; } }).catch(function(){}); });
    var nCores=Object.keys(CORE_FILES).length, okCores=Object.keys(CORE_FILES).filter(function(c){ return CORE_FILES[c].every(function(f){ return !!CORES.files[f]; }); }).length;
    byId("bootLog").innerHTML="loading kernel ........ ok<br>mounting library ...... "+(ROMS.length)+" game"+(ROMS.length===1?"":"s")+(bundled.length?" · "+bundled.length+" free":"")+"<br>loading emulators ..... "+okCores+"/"+nCores+" cores"+(CORES.bytes?" · "+fmtBytes(CORES.bytes):"")+(okCores===nCores?" · offline ready":' · <span class="warn">'+(nCores-okCores)+" missing</span>");
    if(okCores<nCores) console.warn("Missing emulator cores:",CORES.missing.join(", "),"— run `npm run cores` to bundle them.");
    byId("boot").classList.add("ready");
    if(view==="systems") renderSystems();
  }).catch(function(e){ console.warn("DB load failed",e); byId("boot").classList.add("ready"); });
  setTimeout(function(){ if(!booted && settings.autoBoot!==false){ /* auto-boot after 4 s of inactivity */ triggerBoot(); } },4200);

  /* ================= screens ================= */
  function setScreen(id){
    $$(".screen").forEach(function(s){ s.classList.toggle("active",s.id===id); });
    view=id;
    document.body.setAttribute("data-view",id);
    updateFooter();
  }
  function updateFooter(){
    var f=byId("footHints");
    if(view==="systems") f.innerHTML=hint("←→","MOVE")+hint("ENTER / A","OPEN")+hint("F / Y","SEARCH")+hint("S / START","SETTINGS")+hint("H","HELP");
    else if(view==="library") f.innerHTML=hint("↑↓←→","MOVE")+hint("ENTER / A","PLAY")+hint("SPACE / X","OPTIONS")+hint("I","INFO")+hint("F / Y","FILTER")+hint("ESC / B","BACK");
    else if(view==="player") f.innerHTML="";
    var c=byId("footCount"); c.textContent="SYSTEMS: "+SYSTEMS.length+" · GAMES: "+ROMS.length+(Object.keys(BIOS).length?" · BIOS: "+Object.keys(BIOS).length:"");
  }
  function hint(k,l){ return '<span><i class="kbd">'+k+'</i>'+l+'</span>'; }

  /* ================= systems screen ================= */
  function countGames(id){
    if(id==="all") return ROMS.length;
    if(id==="fav") return ROMS.filter(function(r){return r.fav;}).length;
    if(id==="recent") return ROMS.filter(function(r){return r.lastPlayed;}).length;
    return ROMS.filter(function(r){return r.sysId===id;}).length;
  }
  function visibleSystems(){
    var list=[];
    COLLECTIONS.forEach(function(c){ if(countGames(c.id)>0 || c.id==="all") list.push(c); });
    SYSTEMS.forEach(function(s){ if(!settings.hideEmptySystems || countGames(s.id)>0) list.push(s); });
    return list;
  }
  var sysList=[];
  function showSystems(){
    setScreen("systems");
    renderSystems();
    focusSystem(focus.systems,false);
  }
  function renderSystems(){
    var g=byId("sysGrid"); g.innerHTML="";
    sysList=visibleSystems();
    var lastGroup=null;
    sysList.forEach(function(s,i){
      var group = s.collection?"COLLECTIONS":(s.maker||"OTHER");
      if(group!==lastGroup && (s.collection || lastGroup==="COLLECTIONS" || lastGroup===null)){
        if(s.collection || lastGroup==="COLLECTIONS"){
          var h=document.createElement("div"); h.className="grid-group"; h.textContent=s.collection?"COLLECTIONS":"SYSTEMS"; g.appendChild(h);
        }
        lastGroup=group;
      }
      var n=countGames(s.id);
      var card=document.createElement("div");
      var noCore=!s.collection&&!coreInstalled(s);
      card.className="card"+(s.collection?" coll":"")+(n===0&&!s.collection?" empty":"")+(noCore?" nocore":"");
      card.setAttribute("data-idx",i);
      card.style.setProperty("--c",s.color);
      card.innerHTML='<span class="badge">'+esc(s.short)+'</span>'+(noCore?'<span class="nocore-tag">CORE MISSING</span>':'')+'<div class="icon">'+s.icon+'</div><h3>'+esc(s.name)+'</h3><p>'+(s.collection?"":esc(s.note)+"<br>")+'<b>'+n+'</b> game'+(n===1?"":"s")+'</p>';
      card.addEventListener("click",function(){ focus.systems=i; blip("select"); openLibrary(s.id); });
      card.addEventListener("mouseenter",function(){ if(hoverOK()) focusSystem(i,false,true); });
      g.appendChild(card);
    });
    byId("sysCount").textContent=ROMS.length+" GAME"+(ROMS.length===1?"":"S")+" · "+SYSTEMS.length+" SYSTEMS";
    updateFooter();
  }
  function focusSystem(i,scroll,silent){
    if(!sysList.length)return;
    i=clamp(i,0,sysList.length-1);
    if(i!==focus.systems && !silent) blip("move");
    focus.systems=i;
    $$("#sysGrid .card").forEach(function(c){ c.classList.toggle("focus",parseInt(c.getAttribute("data-idx"))===i); });
    var el=$('#sysGrid .card[data-idx="'+i+'"]');
    if(el&&scroll!==false) el.scrollIntoView({block:"nearest",behavior:"smooth"});
    var s=sysList[i];
    byId("sysInfo").innerHTML = s.collection ? '<b>'+esc(s.name.toUpperCase())+'</b>' : '<b>'+esc(s.name.toUpperCase())+'</b> · '+esc(s.maker||"")+' · '+(s.year||"")+' · core: <i>'+esc(coreLabel(s))+'</i>'+(coreInstalled(s)?'':' <span class="warn">NOT BUNDLED</span>')+(s.bios?' · <span class="'+(biosStatus(s).missingReq?'warn':'ok')+'">BIOS '+(biosStatus(s).missingReq?'MISSING':'OK')+'</span>':'');
  }
  function coreLabel(s){ var map={nes:"fceumm",snes:"snes9x",n64:"mupen64plus-next",gb:"gambatte",gba:"mgba",nds:"melonds",psx:"pcsx-rearmed",psp:"ppsspp",segaMD:"genesis-plus-gx",segaMS:"smsplus",segaGG:"genesis-plus-gx",segaCD:"genesis-plus-gx",segaSaturn:"yabause",atari2600:"stella2014",atari5200:"a5200",atari7800:"prosystem",lynx:"handy",jaguar:"virtualjaguar",pce:"mednafen-pce",ws:"mednafen-wswan",ngp:"mednafen-ngp",c64:"vice-x64sc",amiga:"puae",arcade:"fbneo",mame:"mame2003-plus",dos:"dosbox-pure"}; return map[s.id]||s.core; }
  function gridColumns(gridEl){
    var cards=$$(".card",gridEl); if(cards.length<2)return 1;
    var top=cards[0].offsetTop, n=0; for(var i=0;i<cards.length;i++){ if(cards[i].offsetTop!==top)break; n++; } return n||1;
  }

  /* ================= library (game view) ================= */
  function gamesFor(id){
    var list;
    if(id==="all") list=ROMS.slice();
    else if(id==="fav") list=ROMS.filter(function(r){return r.fav;});
    else if(id==="recent") list=ROMS.filter(function(r){return r.lastPlayed;}).sort(function(a,b){return (b.lastPlayed||0)-(a.lastPlayed||0);});
    else list=ROMS.filter(function(r){return r.sysId===id;});
    if(libFilter){ var q=libFilter.toLowerCase(); list=list.filter(function(r){ return r.name.toLowerCase().indexOf(q)>=0 || r.fileName.toLowerCase().indexOf(q)>=0 || (findSys(r.sysId)||{}).name.toLowerCase().indexOf(q)>=0; }); }
    if(id!=="recent"){
      if(libSort==="name") list.sort(function(a,b){ return a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:"base"}); });
      else if(libSort==="recent") list.sort(function(a,b){return (b.lastPlayed||0)-(a.lastPlayed||0);});
      else if(libSort==="added") list.sort(function(a,b){return (b.added||0)-(a.added||0);});
      else if(libSort==="played") list.sort(function(a,b){return (b.playCount||0)-(a.playCount||0);});
      else if(libSort==="system") list.sort(function(a,b){ return (a.sysId+a.name).localeCompare(b.sysId+b.name,undefined,{numeric:true}); });
      if(libSort!=="recent") list=list.filter(function(r){return r.fav;}).concat(list.filter(function(r){return !r.fav;})); // favorites on top (RetroBat option)
    }
    return list;
  }
  var libList=[];
  function openLibrary(sysId,keepFocus){
    var sys=findSys(sysId); if(!sys)return;
    currentSys=sysId;
    if(!keepFocus){ focus.lib=0; libFilter=""; byId("libSearch").value=""; }
    byId("libCrumb").innerHTML='<span class="crumb-sys" style="--c:'+sys.color+'">'+sys.icon+'</span><span>'+esc(sys.name.toUpperCase())+'</span>';
    // side list of systems
    var cons=byId("libCons"); cons.innerHTML="";
    var side=visibleSystems();
    side.forEach(function(s){
      var c=document.createElement("div");
      c.className="lc"+(s.id===sysId?" active":"");
      c.style.setProperty("--c",s.color);
      c.innerHTML=s.icon+'<span>'+esc(s.short)+'</span><em>'+countGames(s.id)+'</em>';
      c.addEventListener("click",function(){ if(s.id!==sysId){ blip("select"); openLibrary(s.id);} });
      cons.appendChild(c);
    });
    var act=$("#libCons .lc.active"); if(act) act.scrollIntoView({block:"nearest"});
    // system header (BIOS status, core)
    var hb=byId("libSysBar");
    if(sys.collection){ hb.innerHTML=''; hb.style.display="none"; }
    else{
      var bs=biosStatus(sys);
      hb.style.display="";
      var cs=coreStatus(sys);
      hb.innerHTML='<button class="chip '+(cs.ok?'':'warn')+'" id="coreBtn" title="Emulator core details">'+ICON.gear+' CORE '+esc(coreLabel(sys))+(cs.ok?'':' · MISSING')+'</button>'+
        (sys.bios?'<button class="chip '+(bs.missingReq?'warn':'ok')+'" id="biosBtn">'+ICON.chip+' BIOS '+(bs.missingReq?'MISSING':(bs.have+'/'+sys.bios.length))+'</button>':'')+
        '<button class="chip" id="ctlBtn">'+ICON.keyboard+' CONTROLS</button>'+
        '<span class="exts">'+esc(sys.exts.map(function(e){return "."+e;}).join(" "))+'</span>';
      var bb=byId("biosBtn"); if(bb) bb.addEventListener("click",function(){ openBios(sys); });
      var cbn=byId("coreBtn"); if(cbn) cbn.addEventListener("click",function(){ openCoreInfo(sys); });
      var cb=byId("ctlBtn"); if(cb) cb.addEventListener("click",function(){ showControls(sys); });
    }
    renderGames();
    setScreen("library");
    focus.zone="games";
    focusGame(focus.lib,false);
  }
  function renderGames(){
    var sys=findSys(currentSys);
    var g=byId("libGames"); g.innerHTML="";
    // keep the focus on the same *game* when the list is re-sorted (rename, favorite, play count…)
    var keepId=libList[focus.lib]?libList[focus.lib].id:null;
    libList=gamesFor(currentSys);
    if(keepId){ var ni=libList.findIndex(function(x){ return x.id===keepId; }); if(ni>=0) focus.lib=ni; }
    var vm=settings.viewMode||"grid";
    g.className="games "+vm;
    libList.forEach(function(game,idx){
      var gs=findSys(game.sysId)||sys;
      var el=document.createElement("div"); el.className="game"+(game.fav?" fav":"");
      el.setAttribute("data-idx",idx);
      el.style.setProperty("--c",gs.color);
      var art = SHOTS[game.id] ? '<img class="shot" src="'+SHOTS[game.id]+'" alt="">' : '<div class="ph">'+gs.icon+'</div>';
      el.innerHTML='<div class="box">'+art+(game.fav?'<span class="favmark">'+ICON.heart+'</span>':'')+(game.embedded?'<span class="demo">FREE</span>':'')+'</div>'+
        '<div class="meta"><div class="t" title="'+esc(game.name)+'">'+esc(game.name)+'</div><div class="s"><span class="sys" style="--c:'+gs.color+'">'+esc(gs.short)+'</span>'+(game.lastPlayed?'<span>'+fmtAgo(game.lastPlayed)+'</span>':'<span>'+fmtBytes(game.size)+'</span>')+(game.meta&&game.meta.genre?'<span class="genre">'+esc(game.meta.genre)+'</span>':'')+'</div></div>';
      el.addEventListener("click",function(){ focusGame(idx,false,true); blip("select"); startGame(game); });
      el.addEventListener("contextmenu",function(ev){ ev.preventDefault(); focusGame(idx,false,true); openGameMenu(game); });
      el.addEventListener("mouseenter",function(){ if(hoverOK()) focusGame(idx,false,true); });
      var more=document.createElement("button"); more.className="more"; more.innerHTML="&#8942;"; more.title="Game options";
      more.addEventListener("click",function(ev){ ev.stopPropagation(); focusGame(idx,false,true); openGameMenu(game); });
      el.appendChild(more);
      g.appendChild(el);
    });
    // add tile
    var add=document.createElement("div"); add.className="game add"; add.setAttribute("data-idx",libList.length);
    add.innerHTML='<div class="plus">+</div><div>ADD <br>GAME'+(sys.collection?"":"S")+'</div>';
    add.addEventListener("click",function(){ pickRoms(); });
    add.addEventListener("mouseenter",function(){ if(hoverOK()) focusGame(libList.length,false,true); });
    g.appendChild(add);
    var emptyMsg=byId("libEmpty");
    if(!libList.length){
      emptyMsg.style.display="";
      emptyMsg.innerHTML = libFilter ? 'NO GAME MATCHES "<b>'+esc(libFilter)+'</b>"' :
        sys.id==="fav" ? 'NO FAVORITES YET — OPEN A GAME\'S OPTIONS (<i class="kbd">SPACE</i>) AND PRESS <b>ADD TO FAVORITES</b>' :
        sys.id==="recent" ? 'NOTHING PLAYED YET — LAUNCH A GAME AND IT WILL SHOW UP HERE' :
        'NO GAMES YET FOR <b>'+esc(sys.name.toUpperCase())+'</b><br><small>DROP FILES ANYWHERE IN THIS WINDOW OR CLICK <b>ADD GAMES</b> · ACCEPTED: '+esc((sys.exts||[]).map(function(e){return "."+e;}).join(" "))+'</small>';
    } else emptyMsg.style.display="none";
    byId("libStats").innerHTML='<b>'+libList.length+'</b> GAME'+(libList.length===1?"":"S")+(libFilter?' · FILTER: <b>'+esc(libFilter)+'</b>':'')+' · SORT: <b>'+({name:"A-Z",recent:"LAST PLAYED",added:"DATE ADDED",played:"MOST PLAYED",system:"SYSTEM"})[libSort]+'</b>';
    updateFooter();
  }
  function focusGame(i,scroll,silent){
    var max=libList.length; // add tile at index libList.length
    i=clamp(i,0,max);
    if(i!==focus.lib && !silent) blip("move");
    focus.lib=i; focus.zone="games";
    $$("#libGames .game").forEach(function(c){ c.classList.toggle("focus",parseInt(c.getAttribute("data-idx"))===i); });
    var el=$('#libGames .game[data-idx="'+i+'"]');
    if(el&&scroll!==false) el.scrollIntoView({block:"nearest",behavior:"smooth"});
    var game=libList[i]; gameFocus=game||null;
    var d=byId("libDetail");
    if(game){
      var gs=findSys(game.sysId);
      var m=game.meta;
      d.innerHTML='<div class="dt">'+esc(game.name)+(m?' <span class="dyear">'+(m.year||"")+'</span>':'')+'</div>'+
        (m?'<div class="dm">'+esc(m.author||"")+(m.genre?' · '+esc(m.genre):'')+(m.players?' · '+m.players+' PLAYER'+(m.players>1?'S':''):'')+' · <span class="lic">'+esc(m.license||"")+'</span></div>':'')+
        (m&&m.desc?'<div class="dd">'+esc(m.desc)+'</div>':'')+
        '<div class="dm">'+esc(gs.name)+' · '+esc(game.fileName)+' · '+fmtBytes(game.size)+' · PLAYED <b>'+(game.playCount||0)+'</b>× · TIME <b>'+fmtDur(game.playTime)+'</b> · LAST <b>'+fmtAgo(game.lastPlayed)+'</b>'+(game.fav?' · <span class="favtxt">'+ICON.heart+' FAVORITE</span>':'')+(m?' · <i class="kbd">I</i> INFO':'')+'</div>';
    } else d.innerHTML='<div class="dt">ADD GAMES</div><div class="dm">Pick one or more ROM files — you can also drop files anywhere in this window. Files are stored inside the app, so they stay in your library.</div>';
  }
  function focusCons(i){
    var items=$$("#libCons .lc"); if(!items.length)return;
    i=clamp(i,0,items.length-1);
    if(i!==focus.cons) blip("move");
    focus.cons=i; focus.zone="cons";
    items.forEach(function(c,k){ c.classList.toggle("focus",k===i); });
    items[i].scrollIntoView({block:"nearest"});
    $$("#libGames .game.focus").forEach(function(c){c.classList.remove("focus");});
  }
  function leaveCons(){ $$("#libCons .lc.focus").forEach(function(c){c.classList.remove("focus");}); focus.zone="games"; focusGame(focus.lib,true,true); }
  byId("libSearch").addEventListener("input",debounce(function(){ libFilter=byId("libSearch").value.trim(); focus.lib=0; renderGames(); focusGame(0,false,true); },120));
  byId("libSearch").addEventListener("keydown",function(e){ if(e.key==="Escape"||e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); byId("libSearch").blur(); if(e.key==="Escape"&&libFilter){ libFilter=""; byId("libSearch").value=""; renderGames(); } focusGame(focus.lib,true,true);} if(e.key==="ArrowDown"){ e.preventDefault(); byId("libSearch").blur(); focusGame(0,true,true);} e.stopPropagation(); });
  byId("libSort").addEventListener("click",function(){ cycleSort(); });
  byId("libRandom").addEventListener("click",function(){ randomGame(); });
  byId("libView").addEventListener("click",function(){ settings.viewMode=(settings.viewMode==="list")?"grid":"list"; saveSettings(); renderGames(); focusGame(focus.lib,true,true); });
  byId("libBack").addEventListener("click",function(){ blip("back"); showSystems(); });
  byId("libAdd").addEventListener("click",function(){ pickRoms(); });
  function cycleSort(){ var order=["name","recent","added","played","system"]; libSort=order[(order.indexOf(libSort)+1)%order.length]; localStorage.setItem("rbw-sort",libSort); renderGames(); focusGame(0,true,true); toast("SORT: <b>"+({name:"A-Z",recent:"LAST PLAYED",added:"DATE ADDED",played:"MOST PLAYED",system:"SYSTEM"})[libSort]+"</b>",1500); }
  function randomGame(){ if(!libList.length){ toast("NO GAMES TO PICK FROM"); return; } var i=Math.floor(Math.random()*libList.length); focusGame(i,true); blip("select"); setTimeout(function(){ startGame(libList[i]); },250); }

  /* ================= adding ROMs ================= */
  var romInput=document.createElement("input");
  romInput.type="file"; romInput.multiple=true; romInput.style.display="none"; document.body.appendChild(romInput);
  romInput.addEventListener("change",function(){ if(romInput.files.length) addFiles(Array.prototype.slice.call(romInput.files)); romInput.value=""; });
  function pickRoms(){ if(settings.kidMode){ toast("KID MODE IS ON — TURN IT OFF IN SETTINGS (S) TO ADD GAMES"); return; } var sys=findSys(currentSys); romInput.accept = (sys&&!sys.collection)? sys.exts.map(function(e){return "."+e;}).join(","):""; romInput.click(); }

  function addFiles(files,forcedSys){
    var sys=forcedSys||findSys(currentSys);
    if(sys&&sys.collection) sys=null;
    var added=0, skipped=[], needChoice=[], jobs=[], addedTo=[];
    // group multi-file CD games (cue + bin(s)) : when a .cue is present with same-base .bin files, pack them as one game
    var byBase={}; files.forEach(function(f){ var b=f.name.replace(/\.[^.]+$/,"").replace(/\s*\((track|disc)[^)]*\)/i,"").toLowerCase(); (byBase[b]=byBase[b]||[]).push(f); });
    files.forEach(function(f){
      var ext=extOf(f.name);
      var target=sys;
      if(!target || !sysAcceptsExt(target,ext)){
        var g=guessSystem(f.name);
        if(g && (!target || !sysAcceptsExt(target,ext))) target=g;
      }
      if(!target){ needChoice.push(f); return; }
      if(!sysAcceptsExt(target,ext)){ skipped.push(f.name); return; }
      // companion .bin for a .cue in the same batch → attach instead of separate game
      if(ext==="bin"||ext==="img"){
        var base=f.name.replace(/\.[^.]+$/,"").replace(/\s*\((track|disc)[^)]*\)/i,"").toLowerCase();
        var group=byBase[base]||[];
        if(group.some(function(o){ return /\.cue$/i.test(o.name); })) return; // will be handled by the .cue
      }
      var extra=[];
      if(ext==="cue"||ext==="m3u"){
        var base2=f.name.replace(/\.[^.]+$/,"").toLowerCase();
        extra=files.filter(function(o){ var ob=o.name.replace(/\.[^.]+$/,"").replace(/\s*\((track|disc)[^)]*\)/i,"").toLowerCase(); return o!==f && (ob===base2 || ob.indexOf(base2)===0) && /\.(bin|img|iso|wav|ape|cue|chd)$/i.test(o.name); });
      }
      jobs.push(saveRom(f,target,extra));
      added++; addedTo.push(target.id);
    });
    Promise.all(jobs).then(function(){
      if(added){
        var targets=addedTo.filter(function(v,i,a){return a.indexOf(v)===i;});
        if(view==="library" && targets.length===1 && targets[0]!==currentSys && !(findSys(currentSys)||{}).collection){ openLibrary(targets[0]); }
        else if(view==="library") renderIfLibrary();
        var t=findSys(targets[0]);
        toast("ADDED <b>"+added+"</b> GAME"+(added===1?"":"S")+(targets.length===1&&t?" TO <b>"+esc(t.short)+"</b>":"")+(skipped.length?" · SKIPPED "+skipped.length:""),3200); blip("select");
      }
      else if(skipped.length) toast("&#9888; FILE TYPE NOT ACCEPTED HERE: <b>"+esc(skipped[0])+"</b>",4000);
      if(needChoice.length) askSystemFor(needChoice);
      renderSystems();
    });
  }
  function saveRom(file,sys,extraFiles){
    var rec={id:uid(),sysId:sys.id,name:cleanName(file.name),fileName:file.name,size:file.size,added:Date.now(),lastPlayed:0,playCount:0,playTime:0,fav:false,blob:file};
    if(extraFiles&&extraFiles.length){ rec.extra=extraFiles.map(function(f){return {name:f.name,blob:f};}); rec.size+=extraFiles.reduce(function(a,f){return a+f.size;},0); }
    ROMS.push(rec);
    return DB.put("roms",rec).catch(function(e){ console.warn("store rom failed",e); toast("&#9888; COULD NOT STORE FILE (STORAGE FULL?) — IT WILL WORK UNTIL RESTART"); });
  }
  function askSystemFor(files){
    var f=files[0]; var rest=files.slice(1);
    var ext=extOf(f.name);
    var cands=SYSTEMS.filter(function(s){return sysAcceptsExt(s,ext);});
    if(!cands.length){ toast("&#9888; UNKNOWN FILE TYPE: <b>"+esc(f.name)+"</b>",4000); if(rest.length) askSystemFor(rest); return; }
    openModal({
      title:"WHICH SYSTEM?", sub:esc(f.name)+" can belong to several systems",
      items:cands.map(function(s){ return {label:s.name,icon:s.icon,color:s.color,action:function(){ closeModal(); addFiles([f],s); if(rest.length) setTimeout(function(){askSystemFor(rest);},50); }}; }).concat([{label:"Skip this file",icon:ICON.close,action:function(){ closeModal(); if(rest.length) askSystemFor(rest); }}])
    });
  }
  function renderIfLibrary(){ if(view==="library"){ openLibrary(currentSys,true); } }

  // global drag & drop — anywhere in the window
  var dragDepth=0;
  document.addEventListener("dragenter",function(e){ e.preventDefault(); dragDepth++; if(view==="library"||view==="systems") byId("dropOverlay").classList.add("on"); });
  document.addEventListener("dragover",function(e){ e.preventDefault(); });
  document.addEventListener("dragleave",function(e){ e.preventDefault(); dragDepth=Math.max(0,dragDepth-1); if(!dragDepth) byId("dropOverlay").classList.remove("on"); });
  document.addEventListener("drop",function(e){
    e.preventDefault(); dragDepth=0; byId("dropOverlay").classList.remove("on");
    if(view==="player") return;
    var files=Array.prototype.slice.call(e.dataTransfer.files||[]); if(!files.length)return;
    if(view==="systems"){ currentSys=null; }
    addFiles(files, view==="systems"?null:undefined);
  });

  /* ================= BIOS manager ================= */
  function biosStatus(sys){
    var have=0, missingReq=false;
    (sys.bios||[]).forEach(function(b){ if(BIOS[sys.id+"/"+b.name]) have++; else if(b.req) missingReq=true; });
    return {have:have,missingReq:missingReq};
  }
  function openBios(sys){
    var items=(sys.bios||[]).map(function(b){
      var have=BIOS[sys.id+"/"+b.name];
      return {label:b.name+(have?"":"  —  "+(b.req?"REQUIRED":"optional")), sub:(b.desc||"")+(have?" · "+fmtBytes(have.size)+" · installed":""), icon:have?ICON.check:ICON.file, color:have?"#7ed957":(b.req?"#ff6a6a":"#8b8b9a"),
        action:function(){ pickBios(sys,b.name); }, secondary: have?{label:"REMOVE",action:function(){ DB.del("bios",sys.id+"/"+b.name).then(function(){ delete BIOS[sys.id+"/"+b.name]; openBios(sys); openLibrary(sys.id,true); }); }}:null };
    });
    items.push({label:"Add any other BIOS file…",sub:"For files not listed above (name is kept as-is)",icon:ICON.file,action:function(){ pickBios(sys,null); }});
    openModal({title:"BIOS · "+sys.name.toUpperCase(),sub:"BIOS files are stored inside the app and mounted for the emulator at start. Names must match exactly.",items:items});
  }
  var biosInput=document.createElement("input"); biosInput.type="file"; biosInput.multiple=true; biosInput.style.display="none"; document.body.appendChild(biosInput);
  function pickBios(sys,expectName){
    biosInput.onchange=function(){
      var files=Array.prototype.slice.call(biosInput.files); biosInput.value="";
      var jobs=files.map(function(f){
        var name=(expectName&&files.length===1)?expectName:f.name;
        var rec={key:sys.id+"/"+name,sysId:sys.id,fileName:name,size:f.size,blob:f};
        BIOS[rec.key]=rec; return DB.put("bios",rec);
      });
      Promise.all(jobs).then(function(){ toast("BIOS INSTALLED: <b>"+files.length+"</b> FILE"+(files.length===1?"":"S")); openBios(sys); openLibrary(sys.id,true); });
    };
    biosInput.click();
  }

  /* ================= modal (generic list popup, keyboard/gamepad navigable) ================= */
  var modal=byId("modal"), modalItems=[], modalFocus=0, modalOnClose=null;
  function openPrompt(title,sub,value,cb){
    openModal({title:title,sub:sub,html:'<input class="pin" id="promptInput" type="text" spellcheck="false" autocomplete="off" maxlength="80">',items:[
      {label:"OK",icon:ICON.check,color:"#7ed957",action:function(){ var v=byId("promptInput").value; closeModal(); cb(v); }},
      {label:"Cancel",icon:ICON.close,action:closeModal}]});
    var inp=byId("promptInput"); inp.value=value||"";
    inp.addEventListener("keydown",function(e){ e.stopPropagation(); if(e.key==="Enter"){ e.preventDefault(); var v=inp.value; closeModal(); cb(v); } else if(e.key==="Escape"){ e.preventDefault(); closeModal(); } });
    setTimeout(function(){ inp.focus(); inp.select(); },30);
  }
  function openModal(opts){
    modalItems=(opts.items||[]).filter(function(it){ return !it.hide; }); modalFocus=0; modalOnClose=opts.onClose||null;
    byId("modalTitle").textContent=opts.title||""; byId("modalSub").innerHTML=opts.sub||"";
    var body=byId("modalBody"); body.innerHTML="";
    if(opts.html){ var h=document.createElement("div"); h.className="modal-html"; h.innerHTML=opts.html; body.appendChild(h); }
    modalItems.forEach(function(it,i){
      var el=document.createElement("div"); el.className="mi"+(it.toggle!==undefined?" tg":"")+(it.disabled?" dis":""); el.setAttribute("data-idx",i);
      if(it.color) el.style.setProperty("--c",it.color);
      el.innerHTML=(it.icon?'<span class="mi-ic">'+it.icon+'</span>':'')+'<span class="mi-tx"><span class="mi-l">'+esc(it.label)+'</span>'+(it.sub?'<span class="mi-s">'+esc(it.sub)+'</span>':'')+'</span>'+
        (it.toggle!==undefined?'<span class="sw '+(it.toggle?"on":"")+'"><i></i></span>':(it.value!==undefined?'<span class="mi-v">&#9664; '+esc(it.value)+' &#9654;</span>':''))+
        (it.secondary?'<button class="mi-2nd">'+esc(it.secondary.label)+'</button>':'');
      el.addEventListener("click",function(ev){ if(ev.target.closest(".mi-2nd")){ it.secondary.action(); return; } modalActivate(i,0); });
      el.addEventListener("mouseenter",function(){ if(hoverOK()) modalSetFocus(i,true); });
      body.appendChild(el);
    });
    mouse.active=false;
    modal.classList.add("open");
    modalSetFocus(0,true);
  }
  function closeModal(){ modal.classList.remove("open"); var f=modalOnClose; modalOnClose=null; if(f) f(); }
  function modalSetFocus(i,silent){ if(!modalItems.length)return; i=(i+modalItems.length)%modalItems.length; if(i!==modalFocus&&!silent) blip("move"); modalFocus=i; $$("#modalBody .mi").forEach(function(e,k){ e.classList.toggle("focus",k===i); }); var el=$('#modalBody .mi[data-idx="'+i+'"]'); if(el) el.scrollIntoView({block:"nearest"}); }
  function modalActivate(i,dir){ var it=modalItems[i]; if(!it||it.disabled)return; blip("select"); if(it.value!==undefined && it.cycle){ it.cycle(dir||1); return; } if(it.action) it.action(); }
  byId("modalClose").addEventListener("click",closeModal);
  modal.addEventListener("click",function(e){ if(e.target===modal) closeModal(); });

  /* ================= game options (long-press / SPACE / right-click) ================= */
  function openGameMenu(game){
    var gs=findSys(game.sysId);
    openModal({
      title:game.name.toUpperCase(), sub:esc(gs.name)+" · "+esc(game.fileName)+" · "+fmtBytes(game.size)+" · played "+(game.playCount||0)+"× · "+fmtDur(game.playTime),
      items:[
        {label:"Play",icon:ICON.play,color:"#7ed957",action:function(){ closeModal(); startGame(game); }},
        {label:game.fav?"Remove from favorites":"Add to favorites",icon:ICON.heart,color:"#ff5a7a",action:function(){ game.fav=!game.fav; persistRom(game); closeModal(); renderIfLibrary(); renderSystems(); toast(game.fav?"ADDED TO <b>FAVORITES</b>":"REMOVED FROM FAVORITES",1500); }},
        {label:"Game info",sub:game.meta?(game.meta.author||"")+(game.meta.year?" · "+game.meta.year:"")+" · "+(game.meta.license||""):"File details",icon:ICON.info,action:function(){ closeModal(); openGameInfo(game); }},
        {label:"Controls for "+gs.short,sub:"Show the keyboard / pad layout (tattoo)",icon:ICON.keyboard,action:function(){ closeModal(); showControls(gs); }},
        {label:"Rename",icon:ICON.info,hide:settings.kidMode,action:function(){ closeModal(); openPrompt("RENAME GAME",esc(game.fileName),game.name,function(n){ if(n&&n.trim()){ game.name=n.trim(); persistRom(game); renderIfLibrary(); toast("RENAMED"); } }); }},
        {label:"Move to another system",sub:"Current: "+gs.name,icon:ICON.all,disabled:!!game.embedded,hide:settings.kidMode,action:function(){ closeModal(); moveGame(game); }},
        {label:"Clear saved states & box art",sub:"Deletes save states stored for this game",icon:ICON.trash,hide:settings.kidMode,action:function(){ clearGameData(game); closeModal(); }},
        {label:"Delete game",sub:game.embedded?"Bundled free games cannot be deleted (hide the system instead)":"Removes the file from the library",icon:ICON.trash,color:"#ff6a6a",disabled:!!game.embedded,hide:settings.kidMode,action:function(){ closeModal(); deleteGame(game); }}
      ]
    });
  }
  function persistRom(game){ trace("persistRom",game.id); if(game.embedded){ EMB_STATS[game.id]={fav:game.fav,lastPlayed:game.lastPlayed,playCount:game.playCount,playTime:game.playTime,name:game.name}; localStorage.setItem("rbw-embedded",JSON.stringify(EMB_STATS)); return Promise.resolve(); } return DB.put("roms",game).catch(function(e){console.warn(e);}); }
  function deleteGame(game){
    if(game.embedded){ toast("BUNDLED FREE GAMES CANNOT BE DELETED"); return; }
    openModal({title:"DELETE "+game.name.toUpperCase()+"?",sub:"This removes the game (and its saved states) from the library.",items:[
      {label:"Yes, delete",icon:ICON.trash,color:"#ff6a6a",action:function(){ trace("delete",game.id,game.name); ROMS=ROMS.filter(function(r){return r!==game;}); DB.del("roms",game.id).then(function(){ trace("deleted from db",game.id); }).catch(function(e){ console.warn("delete failed",e); toast("&#9888; COULD NOT DELETE FROM STORAGE"); }); clearGameData(game,true); closeModal(); focus.lib=Math.max(0,focus.lib-1); renderIfLibrary(); renderSystems(); toast("DELETED"); }},
      {label:"Cancel",icon:ICON.close,action:closeModal}
    ]});
  }
  function moveGame(game){
    openModal({title:"MOVE TO SYSTEM",sub:esc(game.fileName),items:SYSTEMS.map(function(s){ return {label:s.name,icon:s.icon,color:s.color,sub:sysAcceptsExt(s,extOf(game.fileName))?"":"(extension not typical for this system)",action:function(){ game.sysId=s.id; persistRom(game); closeModal(); renderIfLibrary(); renderSystems(); toast("MOVED TO <b>"+esc(s.short)+"</b>"); }}; })});
  }
  function clearGameData(game,silent){
    // EmulatorJS stores states in IndexedDB "EmulatorJS-states" keyed by "<name>.state"; and our slot states by our own key
    try{
      var keys=[stateKey(game), stateKey(game,"auto"), game.name.replace(/[#<$+%>!`&*'|{}/\\?"=@:^\r\n]/ig,"").trim()+".state"];
      for(var i=1;i<=9;i++) keys.push(stateKey(game,i));
      var r=indexedDB.open("EmulatorJS-states"); r.onsuccess=function(){ try{ var db=r.result; var t=db.transaction("states","readwrite"); keys.forEach(function(k){ t.objectStore("states").delete(k); }); }catch(e){} };
    }catch(e){}
    DB.del("shots",game.id); if(SHOTS[game.id]){ URL.revokeObjectURL(SHOTS[game.id]); delete SHOTS[game.id]; }
    if(!silent){ renderIfLibrary(); toast("SAVED STATES & BOX ART CLEARED"); }
  }

  /* ================= game info (attributes) ================= */
  function openGameInfo(game){
    var gs=findSys(game.sysId), m=game.meta||{};
    var row=function(k,v){ return v?'<div class="irow"><span>'+k+'</span><b>'+v+'</b></div>':''; };
    var html='<div class="ginfo">'+(SHOTS[game.id]?'<img class="gshot" src="'+SHOTS[game.id]+'" alt="">':'')+
      (m.desc?'<p class="gdesc">'+esc(m.desc)+'</p>':'')+
      row("SYSTEM",esc(gs.name)+' <i>('+esc(coreLabel(gs))+' core)</i>')+row("AUTHOR",esc(m.author))+row("YEAR",m.year)+row("GENRE",esc(m.genre))+row("PLAYERS",m.players)+
      row("LICENSE",esc(m.license))+row("FILE",esc(game.fileName)+' · '+fmtBytes(game.size)+(game.extra&&game.extra.length?' (+'+game.extra.length+' track file'+(game.extra.length>1?'s':'')+')':''))+
      row("ADDED",game.embedded?'bundled with the app':fmtAgo(game.added))+row("STATS",'played '+(game.playCount||0)+'× · '+fmtDur(game.playTime)+' · last '+fmtAgo(game.lastPlayed))+
      (m.source?row("SOURCE",'<span class="src">'+esc(m.source)+'</span>'):'')+'</div>';
    openModal({title:game.name.toUpperCase(),sub:game.embedded?"Free game bundled with Recalbox OS Web — see LICENSE for the terms of its author.":"Game in your library",html:html,items:[
      {label:"Play",icon:ICON.play,color:"#7ed957",action:function(){ closeModal(); startGame(game); }},
      {label:game.fav?"Remove from favorites":"Add to favorites",icon:ICON.heart,color:"#ff5a7a",action:function(){ game.fav=!game.fav; persistRom(game); closeModal(); renderIfLibrary(); renderSystems(); }},
      {label:"Close",icon:ICON.close,action:closeModal}]});
  }

  /* ================= controls "tattoo" ================= */
  function showControls(sys,auto){
    var hk=hotkeyName();
    openModal({title:"CONTROLS · "+sys.short,sub:auto?"First launch on this system — here is the default layout. Change it any time from the in-game menu (Control Settings).":"Default keyboard layout. Any gamepad works out of the box (standard mapping). Remap in the in-game menu.",
      html:'<div class="tattoo"><div class="tt-h">GAME</div><div class="tt-b">'+esc(sys.controls||KB_STD)+'</div>'+
           '<div class="tt-h">HOTKEYS (KEYBOARD)</div><div class="tt-b">F1 MENU · F2 SAVE STATE · F4 LOAD STATE · F6/F7 SLOT −/+ · F8 SCREENSHOT · F9 REWIND (HOLD) · '+(sys.kind==="computer"?"F10 FAST-FORWARD (HOLD)":"SPACE FAST-FORWARD (HOLD) · P PAUSE")+' · F11 FULLSCREEN · CTRL+F12 CONTROL CENTER · ESC QUIT'+(sys.kind==="computer"?"<br><small>(computer system: SPACE and letters go to the emulated keyboard)</small>":"")+'</div>'+
           '<div class="tt-h">HOTKEYS (GAMEPAD · HOLD '+hk+')</div><div class="tt-b">'+hk+' + START = QUIT · '+hk+' + B = CONTROL CENTER · '+hk+' + A = PAUSE · '+hk+' + Y = SAVE STATE · '+hk+' + X = LOAD STATE · '+hk+' + ↑/↓ = SLOT +/− · '+hk+' + ← = REWIND · '+hk+' + → = FAST-FORWARD · '+hk+' + R3 = SCREENSHOT</div></div>',
      items:[{label:"OK",icon:ICON.check,action:closeModal}]});
  }
  function hotkeyName(){ return ({8:"SELECT",6:"L2",7:"R2",10:"L3",16:"HOME"})[settings.hotkeyBtn]||("BTN"+settings.hotkeyBtn); }

  /* ================= settings menu (RetroBat "Main menu") ================= */
  function openSettings(){
    var SHADERS=[["disabled","Disabled"],["crt-easymode.glslp","CRT easymode"],["crt-geom.glslp","CRT geom"],["crt-aperture.glslp","CRT aperture"],["crt-mattias.glslp","CRT mattias"],["crt-lottes","CRT lottes"],["crt-zfast","CRT zfast (light)"],["crt-beam","CRT beam"],["crt-caligari","CRT caligari"],["crt-yeetron","CRT yeetron"],["2xScaleHQ.glslp","2x ScaleHQ"],["4xScaleHQ.glslp","4x ScaleHQ"],["sabr","SABR"],["bicubic","Bicubic"],["mix-frames","Mix frames"]];
    var THEMES=[["carbon","Carbon (dark)"],["recalbox","Recalbox orange"],["ocean","Ocean blue"]];
    var FF=[["2.0","2×"],["3.0","3×"],["5.0","5×"],["unlimited","Unlimited"]];
    var HK=[[8,"SELECT"],[6,"L2"],[7,"R2"],[10,"L3"]];
    function cyc(list,cur,dir){ var i=list.findIndex(function(x){return String(x[0])===String(cur);}); return list[(i+dir+list.length)%list.length][0]; }
    function lbl(list,cur){ var f=list.find(function(x){return String(x[0])===String(cur);}); return f?f[1]:String(cur); }
    function rebuild(){ var f=modalFocus; openSettings(); modalSetFocus(f,true); }
    openModal({title:"SETTINGS",sub:"Global options applied to every game (like RetroBat's Game Settings). Per-game options live in the in-game menu.",items:[
      {label:"Shader set",sub:"CRT filters give the authentic scanline look",icon:ICON.gear,value:lbl(SHADERS,settings.shader),cycle:function(d){ settings.shader=cyc(SHADERS,settings.shader,d); saveSettings(); rebuild(); }},
      {label:"Rewind",sub:"Hold F9 / HOTKEY+← to rewind time (costs some CPU)",icon:ICON.rew,toggle:settings.rewind,action:function(){ settings.rewind=!settings.rewind; saveSettings(); rebuild(); }},
      {label:"Auto save / load state",sub:"Save a state on exit and resume it on next launch",icon:ICON.save,toggle:settings.autoLoadState,action:function(){ settings.autoLoadState=!settings.autoLoadState; settings.autoSaveState=true; saveSettings(); rebuild(); }},
      {label:"Fast-forward ratio",icon:ICON.ff,value:lbl(FF,settings.ffRatio),cycle:function(d){ settings.ffRatio=cyc(FF,settings.ffRatio,d); saveSettings(); rebuild(); }},
      {label:"Show FPS",icon:ICON.info,toggle:settings.showFps,action:function(){ settings.showFps=!settings.showFps; saveSettings(); rebuild(); }},
      {label:"Smooth games (bilinear)",sub:"Off = crisp pixels",icon:ICON.gear,toggle:settings.smooth,action:function(){ settings.smooth=!settings.smooth; saveSettings(); rebuild(); }},
      {label:"Volume",icon:ICON.info,value:Math.round(settings.volume*100)+"%",cycle:function(d){ settings.volume=clamp(Math.round((settings.volume+d*0.1)*10)/10,0,1); saveSettings(); rebuild(); }},
      {label:"Gamepad HOTKEY button",sub:"Hold it with another button for shortcuts",icon:ICON.pad,value:lbl(HK,settings.hotkeyBtn),cycle:function(d){ settings.hotkeyBtn=cyc(HK,settings.hotkeyBtn,d); saveSettings(); rebuild(); }},
      {label:"Navigation sounds",icon:ICON.info,toggle:settings.navSounds,action:function(){ settings.navSounds=!settings.navSounds; saveSettings(); rebuild(); }},
      {label:"Theme",icon:ICON.star,value:lbl(THEMES,settings.theme),cycle:function(d){ settings.theme=cyc(THEMES,settings.theme,d); saveSettings(); applyTheme(); rebuild(); }},
      {label:"Hide systems without games",sub:"Like RetroBat: only systems with ROMs appear",icon:ICON.all,toggle:settings.hideEmptySystems,action:function(){ settings.hideEmptySystems=!settings.hideEmptySystems; saveSettings(); renderSystems(); rebuild(); }},
      {label:"Kid mode",sub:"Hides add / delete / rename and the Settings button — press S or START to come back here",icon:ICON.star,toggle:settings.kidMode,action:function(){ settings.kidMode=!settings.kidMode; saveSettings(); document.body.classList.toggle("kid",settings.kidMode); rebuild(); }},
      {label:"Emulators",sub:"Bundled cores (offline) — "+Object.keys(CORE_FILES).filter(function(c){ return CORE_FILES[c].every(function(f){ return !!CORES.files[f]; }); }).length+"/"+Object.keys(CORE_FILES).length+" installed",icon:ICON.gear,action:function(){ closeModal(); emulatorInventory(); }},
      {label:"Missing BIOS check",sub:"List every BIOS file that is still missing",icon:ICON.chip,action:function(){ closeModal(); missingBiosReport(); }},
      {label:"Storage",sub:"See what the library uses",icon:ICON.info,action:function(){ closeModal(); storageReport(); }},
      {label:"Export library list",sub:"Download a JSON with your game list & stats",icon:ICON.file,action:function(){ var data=ROMS.map(function(r){return {name:r.name,file:r.fileName,system:r.sysId,fav:r.fav,playCount:r.playCount,playTime:r.playTime,lastPlayed:r.lastPlayed};}); var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"})); a.download="recalbox-web-library.json"; a.click(); }},
      {label:"Reset all settings",icon:ICON.reset,color:"#ff6a6a",action:function(){ settings=Object.assign({},DEFAULTS); saveSettings(); applyTheme(); rebuild(); toast("SETTINGS RESET"); }},
      {label:"Help & shortcuts",icon:ICON.keyboard,action:function(){ closeModal(); showHelp(); }},
      {label:"About",sub:"Recalbox OS Web 2.2.0 · EmulatorJS 4.2.3 (GPL-3.0) · offline",icon:ICON.info,action:function(){ closeModal(); openModal({title:"ABOUT",html:'<div class="about"><b>RECALBOX OS WEB 2.2</b> — a multi-system retro gaming frontend that runs as a normal desktop app.<br><br>Emulation by <b>EmulatorJS</b> (RetroArch cores compiled to WebAssembly, GPL-3.0). Frontend inspired by Recalbox, RetroBat &amp; EmulationStation.<br><br>Ships with a free library of homebrew, open-source and freeware games for every system (see roms/LICENSES.md for the authors and their terms) — no commercial ROMs. Add your own ROMs and BIOS files.<br><br><b>OFFLINE BY DESIGN</b> — all 25 emulator cores are bundled inside the application (like RetroArch / RetroPie); the app never opens a network connection.</div>',items:[{label:"OK",icon:ICON.check,action:closeModal}]}); }}
    ]});
  }
  /* ================= emulator cores (bundled, offline) ================= */
  function openCoreInfo(sys,game){
    var cs=coreStatus(sys);
    var rows=cs.files.map(function(f){ var sz=CORES.files[f]; return '<div class="crow '+(sz?'ok':'bad')+'"><span>'+esc(f)+'</span><b>'+(sz?fmtBytes(sz):'MISSING')+'</b></div>'; }).join("");
    var items=[];
    if(!cs.ok){
      items.push({label:"How to add the core",sub:"Run  npm run cores  in the project folder (needs internet once), then restart the app. Installers built with npm run dist always include every core.",icon:ICON.info,action:function(){}});
    } else if(game){ items.push({label:"Play",icon:ICON.play,color:"#7ed957",action:function(){ closeModal(); startGame(game); }}); }
    if(cs.ok) items.push({label:"Clear this core's cache",sub:"The runtime caches decompressed cores in IndexedDB; clearing forces a re-read from the bundled file",icon:ICON.trash,action:function(){ clearCoreCache(); closeModal(); }});
    items.push({label:"OK",icon:ICON.check,action:closeModal});
    openModal({title:"EMULATOR CORE · "+sys.short,sub:cs.ok?"Bundled with the app — runs offline, nothing is downloaded.":"This core is NOT bundled in this build, so "+sys.name+" games cannot start.",
      html:'<div class="coreinfo"><div class="ci-h"><span>'+esc(cs.core)+'</span><i>libretro core · WebAssembly · EmulatorJS '+esc(CORES.version||"4.2.3")+'</i></div>'+rows+'<div class="ci-f">'+(cs.ok?'<span class="ok">READY</span> · '+fmtBytes(cs.size)+' · location: app/data/cores/':'<span class="warn">'+cs.missing.length+' FILE'+(cs.missing.length===1?'':'S')+' MISSING</span>')+'</div></div>',
      items:items});
  }
  function clearCoreCache(){ try{ indexedDB.deleteDatabase("EmulatorJS-core"); }catch(e){} toast("CORE CACHE CLEARED"); }
  function emulatorInventory(){
    var cores=Object.keys(CORE_FILES), ok=0, total=0;
    var items=cores.map(function(c){
      var fs=CORE_FILES[c], miss=fs.filter(function(f){ return !CORES.files[f]; }), size=fs.reduce(function(a,f){ return a+(CORES.files[f]||0); },0);
      total+=size; if(!miss.length) ok++;
      var systems=SYSTEMS.filter(function(s){ return coreFileName(s)===c; });
      var alt=CORE_ALT[c]?findSys(CORE_ALT[c]):null; if(alt&&!systems.length) systems=[alt];
      return {label:c+(alt?" (alternative)":""),sub:systems.map(function(s){return s.short;}).join(" · ")+(alt?" · selectable in the in-game menu":"")+(miss.length?"  —  missing: "+miss.join(", "):"  —  "+fmtBytes(size)),icon:miss.length?ICON.close:ICON.check,color:miss.length?"#ff6a6a":"#7ed957",action:function(){ if(systems[0]) openCoreInfo(systems[0]); }};
    });
    openModal({title:"EMULATORS",sub:ok+"/"+cores.length+" cores bundled · "+fmtBytes(total)+" · EmulatorJS "+(CORES.version||"4.2.3")+" · 100% offline — the app never connects to the internet",items:items.concat([{label:"OK",icon:ICON.check,action:closeModal}])});
  }
  function missingBiosReport(){
    var rows=[];
    SYSTEMS.forEach(function(s){ (s.bios||[]).forEach(function(b){ if(!BIOS[s.id+"/"+b.name]) rows.push({s:s,b:b}); }); });
    if(!rows.length){ openModal({title:"MISSING BIOS CHECK",sub:"All known BIOS files are installed.",items:[{label:"OK",icon:ICON.check,action:closeModal}]}); return; }
    openModal({title:"MISSING BIOS CHECK",sub:rows.filter(function(r){return r.b.req;}).length+" required · "+rows.filter(function(r){return !r.b.req;}).length+" optional — click a line to install it",items:rows.map(function(r){ return {label:r.b.name,sub:r.s.name+(r.b.desc?" · "+r.b.desc:""),icon:r.b.req?ICON.chip:ICON.file,color:r.b.req?"#ff6a6a":"#8b8b9a",action:function(){ pickBios(r.s,r.b.name); }}; })});
  }
  function storageReport(){
    var total=ROMS.reduce(function(a,r){return a+(r.size||0);},0), bios=Object.keys(BIOS).reduce(function(a,k){return a+(BIOS[k].size||0);},0);
    var est=navigator.storage&&navigator.storage.estimate?navigator.storage.estimate():Promise.resolve(null);
    est.then(function(q){
      openModal({title:"STORAGE",html:'<div class="about">GAMES: <b>'+ROMS.length+'</b> · '+fmtBytes(total)+'<br>BIOS: <b>'+Object.keys(BIOS).length+'</b> · '+fmtBytes(bios)+'<br>BOX ART (screenshots): <b>'+Object.keys(SHOTS).length+'</b>'+(q?'<br><br>APP STORAGE USED: <b>'+fmtBytes(q.usage)+'</b> of '+fmtBytes(q.quota)+' available':'')+'</div>',
        items:[{label:"Clear emulator core cache",sub:"Cores are re-read from disk on next launch (frees space)",icon:ICON.trash,action:function(){ try{ indexedDB.deleteDatabase("EmulatorJS-cache"); indexedDB.deleteDatabase("EmulatorJS-core"); }catch(e){} toast("CORE CACHE CLEARED"); closeModal(); }},{label:"OK",icon:ICON.check,action:closeModal}]});
    });
  }
  function showHelp(){
    openModal({title:"HELP & SHORTCUTS",html:'<div class="tattoo">'+
      '<div class="tt-h">SYSTEM VIEW</div><div class="tt-b">← → ↑ ↓ MOVE · ENTER OPEN · F SEARCH ALL GAMES · S SETTINGS · B BIOS MANAGER · H THIS HELP</div>'+
      '<div class="tt-h">GAME VIEW</div><div class="tt-b">← → ↑ ↓ MOVE · ENTER PLAY · SPACE GAME OPTIONS · I GAME INFO · F FILTER · R RANDOM GAME · O CHANGE SORT · V GRID/LIST · TAB SYSTEM LIST · ESC BACK · DROP FILES ANYWHERE TO ADD</div>'+
      '<div class="tt-h">GAMEPAD (MENUS)</div><div class="tt-b">D-PAD / LEFT STICK MOVE · A OPEN · B BACK · X GAME OPTIONS · Y SEARCH · START SETTINGS · L1/R1 CHANGE SYSTEM</div>'+
      '<div class="tt-h">IN GAME</div><div class="tt-b">F1 EMULATOR MENU · F2 SAVE · F4 LOAD · F6/F7 SLOT · F8 SCREENSHOT · F9 REWIND · SPACE FAST-FORWARD (F10 on computer systems) · P PAUSE · F11 FULLSCREEN · CTRL+F12 CONTROL CENTER · ESC QUIT — GAMEPAD: HOLD '+hotkeyName()+' + BUTTON</div></div>',
      items:[{label:"OK",icon:ICON.check,action:closeModal}]});
  }
  function applyTheme(){ document.body.setAttribute("data-theme",settings.theme||"carbon"); document.body.classList.toggle("kid",!!settings.kidMode); }
  applyTheme();
  byId("sysSettings").addEventListener("click",openSettings);
  byId("sysSearch").addEventListener("click",function(){ openLibrary("all"); setTimeout(function(){ byId("libSearch").focus(); },50); });
  byId("sysHelp").addEventListener("click",showHelp);

  /* ================= quick search (system view) ================= */

  /* ================= PLAYER (EmulatorJS) ================= */
  var current=null, playStart=0, hudTimer=null, ccOpen=false, playTimeTimer=null;
  function stateKey(game,slot){ return "rbw-"+game.id+(slot?"-slot"+slot:"")+".state"; }

  function startGame(game){
    var sys=findSys(game.sysId); if(!sys)return;
    if(!coreInstalled(sys)){ openCoreInfo(sys,game); return; }
    if(sys.bios && biosStatus(sys).missingReq && !game._biosWarned){
      game._biosWarned=true;
      openModal({title:"BIOS MISSING",sub:sys.name+" needs a BIOS file to run games. Without it the game will most likely fail to start.",items:[
        {label:"Install BIOS now",icon:ICON.chip,color:"#ffb347",action:function(){ closeModal(); openBios(sys); }},
        {label:"Try anyway",icon:ICON.play,action:function(){ closeModal(); startGame(game); }},
        {label:"Cancel",icon:ICON.close,action:closeModal}]});
      return;
    }
    if(!settings.controlsShown[sys.id] && !sys.collection){
      settings.controlsShown[sys.id]=true; saveSettings();
      showControls(sys,true); modalOnClose=function(){ startGame(game); };
      return;
    }
    current=game; playStart=Date.now(); quitting=false; lastShot=null;
    installHotkeys();
    byId("plTitle").innerHTML=esc(game.name)+' <b>&middot; '+esc(sys.short)+'</b>';
    var ffHint=$("#plFF"); if(ffHint) ffHint.textContent = sys.kind==="computer" ? "F10" : "SPACE";
    byId("plSys").innerHTML=sys.icon;
    setScreen("player");
    var host=byId("ejsHost"); host.innerHTML="";
    var ld=byId("plLoading"); ld.style.display="flex"; ld.classList.remove("err"); setLoad("LOADING CORE…"); byId("plLoadingSys").innerHTML=sys.icon; byId("plLoadingName").textContent=game.name; byId("plLoadingSub").textContent=sys.name+" · "+coreLabel(sys);
    byId("plLoadingTip").textContent=tipFor(sys);
    byId("plHud").classList.remove("show");

    // --- ROM source: File object (kept in DB) or bundled URL. Multi-file (cue+bin) games are packed
    //     into an uncompressed zip in memory so EmulatorJS extracts all tracks together.
    var romReady;
    if(game.url) romReady=Promise.resolve(new URL(game.url,location.href).href); // app://recalbox/... in Electron
    else if(game.extra&&game.extra.length) romReady=makeZip([{name:game.fileName,blob:game.blob}].concat(game.extra.map(function(x){return {name:x.name,blob:x.blob};})),game.name+".zip");
    else romReady=Promise.resolve(game.blob instanceof File ? game.blob : new File([game.blob],game.fileName));

    // --- BIOS: every BIOS file installed for this system is packed into one (stored) zip and handed to
    //     EmulatorJS as biosUrl; it extracts the files next to the ROM, names preserved (arcade BIOS zips stay zipped).
    var biosList=Object.keys(BIOS).map(function(k){return BIOS[k];}).filter(function(b){return b.sysId===sys.id;});
    var biosReady=biosList.length ? makeZip(biosList.map(function(b){return {name:b.fileName,blob:b.blob};}),"bios-"+sys.id+".zip").then(function(f){ return URL.createObjectURL(f); }) : Promise.resolve(undefined);
    window.EJS_defaultOptions={
      "shader":settings.shader||"disabled",
      "fps":settings.showFps?"show":"hide",
      "save-state-location":"browser",
      "save-state-slot":"1",
      "ff-ratio":settings.ffRatio||"3.0",
      "rewindEnabled":settings.rewind?"enabled":"disabled",
      "menubarBehavior":"anywhere"
    };
    // per-system libretro core options (written to retroarch-core-options.cfg before the core boots)
    if(sys.coreOptions){ Object.keys(sys.coreOptions).forEach(function(k){ window.EJS_defaultOptions[k]=sys.coreOptions[k]; }); }
    window.EJS_Buttons={playPause:true,restart:true,mute:true,settings:true,fullscreen:true,saveState:true,loadState:true,quickSave:true,quickLoad:true,screenshot:true,screenRecord:false,gamepad:true,cheat:true,volumeSlider:true,saveSavFiles:true,loadSavFiles:true,cacheManager:false,exitEmulation:true,netplay:false,contextMenu:true,diskButton:true};

    started=false;
    game.playCount=(game.playCount||0)+1; game.lastPlayed=Date.now(); persistRom(game);
    Promise.all([romReady,biosReady]).then(function(r){
      if(current!==game) return;   // user backed out while packing
      window.EJS_gameUrl=r[0];
      launchEmulator(sys,game,r[1]);
    }).catch(function(e){ console.error(e); loadError("COULD NOT READ THE GAME FILE"); });
  }
  /* Load the EmulatorJS runtime once (emulator.min.js + css), then create an instance per game.
     This mirrors data/loader.js but avoids re-injecting the runtime on every launch. */
  var runtimeReady=null;
  function loadRuntime(){
    if(runtimeReady) return runtimeReady;
    runtimeReady=new Promise(function(res,rej){
      var css=document.createElement("link"); css.rel="stylesheet"; css.href="data/emulator.min.css"; document.head.appendChild(css);
      var sc=document.createElement("script"); sc.src="data/emulator.min.js";
      sc.onload=function(){
        if(typeof window.EmulatorJS!=="function"){ rej(new Error("EmulatorJS runtime missing")); return; }
        // Offline: the runtime's update check (CDN version.json) and netplay are never used.
        try{ window.EmulatorJS.prototype.checkForUpdates=function(){}; }catch(e){}
        res();
      };
      sc.onerror=function(){ runtimeReady=null; rej(new Error("failed to load data/emulator.min.js")); };
      document.head.appendChild(sc);
    });
    return runtimeReady;
  }
  function langFor(){ var l=(navigator.language||"en-US"); var map={en:"en-US",es:"es-ES",el:"el-GR",it:"it-IT",pt:"pt-BR",ja:"ja-JA",ru:"ru-RU",zh:"zh-CN",ar:"ar-AR",hi:"hi-HI",ko:"ko-KO",tr:"tr-TR",vi:"vi-VN",fa:"fa-AF"}; return map[l.split("-")[0]]||"en-US"; }
  function launchEmulator(sys,game,biosUrl){
    loadRuntime().then(function(){
      if(current!==game) return;
      var config={
        gameUrl:window.EJS_gameUrl, biosUrl:biosUrl, dataPath:"data/", system:sys.core, gameName:game.name, gameId:hashCode(game.id),
        color:"#ff8a00", backgroundColor:"#050508", buttonOpts:window.EJS_Buttons, volume:settings.volume,
        defaultControllers:defaultControls(sys), startOnLoad:true, defaultOptions:window.EJS_defaultOptions,
        controlScheme:sys.arcade?"arcade":undefined, threads:!!sys.threads,
        cacheLimit:1073741824, shaders:Object.assign({},window.EJS_SHADERS||{}), noAutoFocus:false
      };
      var lang=langFor();
      var start=function(){
        window.EJS_emulator=new window.EmulatorJS("#ejsHost",config);
        var em=window.EJS_emulator;
        // EmulatorJS 4.2.3 quirk: when localStorage is available but this game has no saved
        // settings yet, getCoreSettings() returns "" and ignores config.defaultOptions, so the
        // per-system core options (Jaguar BIOS boot, MAME disclaimer skip…) would never reach
        // the core on a first launch. Append them to whatever the runtime produces.
        if(sys.coreOptions){
          var gcs=em.getCoreSettings.bind(em);
          em.getCoreSettings=function(){ var out=gcs()||""; Object.keys(sys.coreOptions).forEach(function(k){ if(out.indexOf(k+" ")===-1) out+=k+' = "'+sys.coreOptions[k]+'"\n'; }); return out; };
        }
        installPadHotkeys(em);
        em.on("ready",function(){ setLoad("STARTING…"); });
        em.on("start",onGameStart);
        em.on("saveState",function(e){ saveStateToDB(e.state,e.screenshot||e.blob); });
        em.on("loadState",function(){ loadStateFromDB(); });
        em.on("exit",onEmulatorExit);
        // watchdog: if nothing happened in 90 s show an error with hints
        clearTimeout(watchdog); watchdog=setTimeout(function(){ if(current===game && byId("plLoading").style.display!=="none" && !started) loadError("THE CORE TOOK TOO LONG TO START"); },90000);
      };
      if(lang!=="en-US"){ fetch("data/localization/"+lang+".json").then(function(r){return r.json();}).then(function(j){ config.language=lang; config.langJson=j; }).catch(function(){}).then(start); }
      else start();
    }).catch(function(e){ console.error(e); loadError("EMULATOR FILES COULD NOT LOAD"); });
  }
  var watchdog=null, started=false;
  function defaultControls(sys){
    var kb = sys && sys.kind==="computer";   // computers need SPACE etc. as real keys → hotkeys only on F-keys
    var p0={0:{value:"x",value2:"BUTTON_2"},1:{value:"s",value2:"BUTTON_4"},2:{value:"v",value2:"SELECT"},3:{value:"enter",value2:"START"},
      4:{value:"up arrow",value2:"DPAD_UP"},5:{value:"down arrow",value2:"DPAD_DOWN"},6:{value:"left arrow",value2:"DPAD_LEFT"},7:{value:"right arrow",value2:"DPAD_RIGHT"},
      8:{value:"z",value2:"BUTTON_1"},9:{value:"a",value2:"BUTTON_3"},10:{value:"q",value2:"LEFT_TOP_SHOULDER"},11:{value:"e",value2:"RIGHT_TOP_SHOULDER"},
      12:{value:"tab",value2:"LEFT_BOTTOM_SHOULDER"},13:{value:"r",value2:"RIGHT_BOTTOM_SHOULDER"},14:{value:"",value2:"LEFT_STICK"},15:{value:"",value2:"RIGHT_STICK"},
      16:{value:"h",value2:"LEFT_STICK_X:+1"},17:{value:"f",value2:"LEFT_STICK_X:-1"},18:{value:"g",value2:"LEFT_STICK_Y:+1"},19:{value:"t",value2:"LEFT_STICK_Y:-1"},
      20:{value:"l",value2:"RIGHT_STICK_X:+1"},21:{value:"j",value2:"RIGHT_STICK_X:-1"},22:{value:"k",value2:"RIGHT_STICK_Y:+1"},23:{value:"i",value2:"RIGHT_STICK_Y:-1"},
      24:{value:"f2"},25:{value:"f4"},26:{value:"f7"},27:{value:kb?"f10":"space"},28:{value:"f9"},29:{value:""}};
    var pad=function(){ return {0:{value2:"BUTTON_2"},1:{value2:"BUTTON_4"},2:{value2:"SELECT"},3:{value2:"START"},4:{value2:"DPAD_UP"},5:{value2:"DPAD_DOWN"},6:{value2:"DPAD_LEFT"},7:{value2:"DPAD_RIGHT"},8:{value2:"BUTTON_1"},9:{value2:"BUTTON_3"},10:{value2:"LEFT_TOP_SHOULDER"},11:{value2:"RIGHT_TOP_SHOULDER"},12:{value2:"LEFT_BOTTOM_SHOULDER"},13:{value2:"RIGHT_BOTTOM_SHOULDER"},14:{value2:"LEFT_STICK"},15:{value2:"RIGHT_STICK"},16:{value2:"LEFT_STICK_X:+1"},17:{value2:"LEFT_STICK_X:-1"},18:{value2:"LEFT_STICK_Y:+1"},19:{value2:"LEFT_STICK_Y:-1"},20:{value2:"RIGHT_STICK_X:+1"},21:{value2:"RIGHT_STICK_X:-1"},22:{value2:"RIGHT_STICK_Y:+1"},23:{value2:"RIGHT_STICK_Y:-1"}}; };
    return {0:p0,1:pad(),2:pad(),3:pad()};
  }
  function hashCode(s){ var h=0; for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return Math.abs(h)||1; }
  function tipFor(sys){
    var tips=["Hold "+hotkeyName()+" on your gamepad and press START to quit a game.","Press F2 to save a state and F4 to load it back — 9 slots available (F6/F7).","Hold SPACE to fast-forward, F9 to rewind (enable Rewind in settings).","Press CTRL+F12 or "+hotkeyName()+" + B in game to open the Control Center.","Save states are kept inside the app — turn on Auto save/load in settings to resume where you left.","Press F8 to take a screenshot; it becomes the game's box art in the library.","Use the in-game Settings (F1) to pick a shader, remap controls or change the core options."];
    if(sys.bios) tips.unshift("BIOS files for "+sys.short+" are managed from the BIOS button in the library.");
    return tips[Math.floor(Math.random()*tips.length)];
  }
  function setLoad(t){ byId("plLoadingTxt").textContent=t; }
  function loadError(msg){
    var ld=byId("plLoading"); ld.style.display="flex"; ld.classList.add("err"); ld.classList.remove("done");
    clearTimeout(watchdog);
    setLoad(msg);
    byId("plLoadingTip").innerHTML="Possible causes: missing BIOS · wrong system for this file · unsupported ROM format · core needs WebGL2/threads.<br>Everything runs locally — no download is attempted. Press <b>ESC</b> to go back.";
  }
  function onGameStart(){
    started=true; clearTimeout(watchdog);
    document.body.classList.toggle("smooth",!!settings.smooth);
    var ld=byId("plLoading");
    ld.classList.add("done"); setTimeout(function(){ ld.style.display="none"; ld.classList.remove("done"); },350);
    installHotkeys();
    // Apply "Auto load state" (RetroBat auto save/load)
    if(settings.autoLoadState){ setTimeout(function(){ loadStateFromDB(true,"auto"); },400); }
    // playtime tracking
    clearInterval(playTimeTimer); playTimeTimer=setInterval(function(){ if(current){ current.playTime=(current.playTime||0)+10; } },10000);
    showHud("<b>"+esc(current.name)+"</b> · "+hotkeyName()+"+START or ESC to quit · CTRL+F12 control center",3800);
    try{ window.EJS_emulator.elements.parent.focus(); }catch(e){}
  }
  function showHud(html,ms){ var h=byId("plHud"); h.innerHTML=html; h.classList.add("show"); clearTimeout(hudTimer); hudTimer=setTimeout(function(){ h.classList.remove("show"); },ms||2200); }

  /* ---- state persistence (EmulatorJS-states DB, keyed per game + slot) ---- */
  function ejsStates(){ try{ return window.EJS_emulator && window.EJS_emulator.storage && window.EJS_emulator.storage.states; }catch(e){ return null; } }
  function currentSlot(){ try{ return window.EJS_emulator.getSettingValue("save-state-slot")||"1"; }catch(e){ return "1"; } }
  function saveStateToDB(state,screenshot,slot,quiet){
    if(!current||!state)return;
    slot=slot||currentSlot();
    var st=ejsStates(); if(!st){ return; }
    st.put(stateKey(current,slot),state).then(function(){ if(!quiet) showHud(ICON.save+" STATE SAVED · SLOT "+slot,1800); });
    if(screenshot){ var blob = screenshot instanceof Blob ? screenshot : new Blob([screenshot],{type:"image/png"}); if(blob.size) setBoxArt(current,blob); }
  }
  function loadStateFromDB(auto,slot){
    if(!current)return;
    slot=slot||currentSlot();
    var st=ejsStates(); if(!st)return;
    st.get(stateKey(current,slot)).then(function(data){
      if(!data){ if(!auto) showHud("NO SAVED STATE IN SLOT "+slot,1800); return; }
      try{ window.EJS_emulator.gameManager.loadState(new Uint8Array(data)); showHud(ICON.load+(auto?" RESUMED FROM LAST SESSION · use RESET GAME in the control center to start over":" STATE LOADED · SLOT "+slot),auto?3200:1800); }catch(e){ showHud("LOAD FAILED",1500); }
    });
  }
  function setBoxArt(game,blob){
    DB.put("shots",{id:game.id,blob:blob}).then(function(){ if(SHOTS[game.id]) URL.revokeObjectURL(SHOTS[game.id]); SHOTS[game.id]=URL.createObjectURL(blob); });
  }
  function takeShot(cb){
    // Native-resolution frame straight from RetroArch (fast, crisp). Falls back to a canvas capture.
    var done=false, fin=function(b){ if(done)return; done=true; cb(b||null); };
    try{
      var em=window.EJS_emulator;
      em.gameManager.screenshot().then(function(u8){ fin(u8&&u8.length?new Blob([u8],{type:"image/png"}):null); }).catch(function(){ fin(null); });
      setTimeout(function(){ if(done)return; try{ em.screenshot(function(blob){ fin(blob instanceof Blob?blob:null); },"canvas","png",1); }catch(e){} setTimeout(function(){ fin(null); },500); },400);
    }catch(e){ fin(null); }
  }
  function grabState(){ try{ return window.EJS_emulator.gameManager.getState(); }catch(e){ return null; } }

  /* ---- hotkeys (keyboard + gamepad), RetroBat mapping ---- */
  var hkInstalled=false;
  function emu(){ return window.EJS_emulator; }
  function installHotkeys(){ if(hkInstalled)return; hkInstalled=true; document.addEventListener("keydown",playerKeys,true); document.addEventListener("keyup",playerKeysUp,true); }
  function playerKeys(e){
    if(view!=="player")return;
    if(modal.classList.contains("open")) return;   // dialogs (controls tattoo…) are handled by the menu key handler
    if(!started){ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); abortLoad(); } return; }
    if(ccOpen){ ccKeys(e); return; }
    var k=e.key;
    var kbGame = (function(){ try{ var sys=findSys(current.sysId); return sys.kind==="computer" || emu().getSettingValue("keyboardInput")==="enabled"; }catch(x){ return false; } })();
    var menuOpen = (function(){ try{ return emu().settingsMenu.style.display!=="none" || emu().isPopupOpen(); }catch(x){ return false; } })();
    if(e.ctrlKey && k==="F12"){ e.preventDefault(); openControlCenter(); return; }
    if(k==="F1"){ e.preventDefault(); e.stopPropagation(); toggleEjsMenu(); return; }
    if(menuOpen && k!=="Escape") return;   // let EmulatorJS's own menus handle keys
    if(k==="Escape"){ e.preventDefault(); e.stopPropagation(); if(menuOpen){ try{ if(emu().settingsMenu.style.display!=="none") toggleEjsMenu(); }catch(x){} return; } confirmQuit(); return; }
    if(k==="F2"){ e.preventDefault(); e.stopPropagation(); doSave(); return; }
    if(k==="F4"){ e.preventDefault(); e.stopPropagation(); doLoad(); return; }
    if(k==="F6"||k==="F7"){ e.preventDefault(); e.stopPropagation(); changeSlot(k==="F7"?1:-1); return; }
    if(k==="F8"){ e.preventDefault(); e.stopPropagation(); doScreenshot(); return; }
    if(k==="F11"){ e.preventDefault(); e.stopPropagation(); toggleFs(); return; }
    if((k==="p"||k==="P") && !kbGame){ if(e.target&&e.target.tagName==="INPUT")return; e.preventDefault(); e.stopPropagation(); togglePause(); return; }
    if(k==="F9"){ e.preventDefault(); e.stopPropagation(); setRewind(true); return; }
    if(((k===" " && !kbGame) || k==="F10") && !e.repeat){ /* fast-forward hold handled by EJS special button 27 */ ffOn=true; showHud(ICON.ff+" FAST-FORWARD",600); return; }
  }
  var ffOn=false;
  function playerKeysUp(e){ if(view!=="player")return; if(e.key==="F9"){ setRewind(false); } if(e.key===" "){ ffOn=false; } }
  function toggleEjsMenu(){
    try{
      var em=emu(), btn=em.elements.bottomBar.settings[0][0];
      if(em.settingsMenu.style.display!=="none"){ btn.click(); em.menu.close(); }     // close
      else { em.menu.open(true); btn.click(); }                                        // open bar + settings
    }catch(x){}
  }
  function doSave(){ var s=grabState(); if(!s){ showHud("SAVE FAILED",1500); return; } takeShot(function(blob){ saveStateToDB(s, null); if(blob) setBoxArt(current,blob); }); }
  function doLoad(){ loadStateFromDB(false); }
  function changeSlot(d){ try{ var cur=parseInt(currentSlot())||1; var n=cur+d; if(n>9)n=1; if(n<1)n=9; emu().changeSettingOption("save-state-slot",String(n)); emu().saveSettings(); ejsStates().get(stateKey(current,String(n))).then(function(has){ showHud("SLOT <b>"+n+"</b>"+(has?" · has a save":" · empty"),1400); }); }catch(e){} }
  function doScreenshot(){ takeShot(function(blob){ if(!blob){showHud("SCREENSHOT FAILED",1400);return;} setBoxArt(current,blob); var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=(current.name.replace(/[^\w\- ]+/g,"")||"screenshot")+"-"+new Date().toISOString().replace(/[:.]/g,"-")+".png"; a.click(); showHud(ICON.camera+" SCREENSHOT SAVED (ALSO USED AS BOX ART)",1800); }); }
  function toggleFs(){ try{ if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }catch(e){} }
  function togglePause(){ try{ emu().togglePlaying(); showHud(emu().paused?ICON.pause+" PAUSED":ICON.play+" RESUMED",1200); }catch(e){} }
  var rewinding=false;
  function setRewind(on){ if(on===rewinding)return; rewinding=on; try{ if(!emu().rewindEnabled){ if(on) showHud("REWIND IS OFF — ENABLE IT IN SETTINGS",1600); return; } emu().gameManager.functions.toggleRewind(on?1:0); if(on) showHud(ICON.rew+" REWIND",800); }catch(e){} }
  function setFF(on){ try{ emu().gameManager.simulateInput(0,27,on?1:0); if(on) showHud(ICON.ff+" FAST-FORWARD",700); }catch(e){} }
  function confirmQuit(){
    if(ccOpen)return;
    if(!started){ abortLoad(); return; }
    openControlCenter(true);
  }
  function abortLoad(){ if(quitting)return; quitting=true; try{ if(window.EJS_emulator) window.EJS_emulator.callEvent("exit"); }catch(e){} setTimeout(teardownPlayer,60); }

  /* ---- gamepad ----
     Menus: our own poller (navigator.getGamepads) drives system view / game view / dialogs.
     In game: we wrap EmulatorJS's gamepad listeners so HOTKEY combos are consumed *before* they reach the
     core (a RetroBat/RetroArch-style hotkey-enable button); a plain tap of the HOTKEY button still passes
     through as a short press, so SELECT keeps working for coins / menus. */
  var padPrev={}, padRepeat={}, padMuteUntil=0;
  /* When the player closes, buttons that are still held (e.g. the A that confirmed QUIT) must not be
     re-interpreted as fresh presses in the menu: snapshot the pad state and mute the menu for a moment. */
  function padSync(ms){
    var pads=navigator.getGamepads?navigator.getGamepads():[];
    for(var p=0;p<pads.length;p++){ var gp=pads[p]; if(!gp)continue; var st=padPrev[gp.index]||(padPrev[gp.index]={}); gp.buttons.forEach(function(b,i){ st[i]=b.pressed||b.value>0.6; }); }
    padMuteUntil=Date.now()+(ms||350);
  }
  var BTN={A:0,B:1,X:2,Y:3,L1:4,R1:5,L2:6,R2:7,SELECT:8,START:9,L3:10,R3:11,UP:12,DOWN:13,LEFT:14,RIGHT:15,HOME:16};
  var hk={held:false,combo:false,downAt:0,ev:null}, ffHeld=false;
  function installPadHotkeys(em){
    var gp=em.gamepad; if(!gp||!gp.listeners) return;
    var origDown=gp.listeners.buttondown, origUp=gp.listeners.buttonup, origAxis=gp.listeners.axischanged;
    gp.listeners.buttondown=function(e){
      if(window.EJS_emulator!==em||!started){ if(origDown) origDown(e); return; }
      if(modal.classList.contains("open")){ modalPad(e.index); return; }
      if(ccOpen){ ccPad(e.index); return; }
      if(e.index===settings.hotkeyBtn){ hk.held=true; hk.combo=false; hk.downAt=Date.now(); hk.ev=e; return; }
      if(hk.held){ hk.combo=true; padHotkey(e.index,true); return; }
      if(origDown) origDown(e);
    };
    gp.listeners.buttonup=function(e){
      if(window.EJS_emulator!==em||!started){ if(origUp) origUp(e); return; }
      if(e.index===settings.hotkeyBtn){
        var wasHeld=hk.held; hk.held=false;
        if(wasHeld&&!hk.combo&&Date.now()-hk.downAt<450&&!ccOpen&&!modal.classList.contains("open")){ // plain tap → short press
          if(origDown) origDown(hk.ev); setTimeout(function(){ if(origUp) origUp(e); },60);
        }
        hk.combo=false; return;
      }
      if(padHotkey(e.index,false)) return;
      if(ccOpen||modal.classList.contains("open")) return;
      if(origUp) origUp(e);
    };
    gp.listeners.axischanged=function(e){ if(ccOpen||modal.classList.contains("open")) return; if(origAxis) origAxis(e); };
  }
  function padHotkey(b,down){
    if(down){
      switch(b){
        case BTN.START: confirmQuit(); break;
        case BTN.B: openControlCenter(); break;
        case BTN.A: togglePause(); break;
        case BTN.Y: doSave(); break;
        case BTN.X: doLoad(); break;
        case BTN.UP: changeSlot(1); break;
        case BTN.DOWN: changeSlot(-1); break;
        case BTN.LEFT: setRewind(true); break;
        case BTN.RIGHT: ffHeld=true; setFF(true); break;
        case BTN.R3: doScreenshot(); break;
        case BTN.L1: toggleEjsMenu(); break;
        case BTN.R1: toggleFs(); break;
      }
      return true;   // anything pressed together with HOTKEY never reaches the game
    }
    if(b===BTN.LEFT&&rewinding){ setRewind(false); return true; }
    if(b===BTN.RIGHT&&ffHeld){ ffHeld=false; setFF(false); return true; }
    return false;
  }
  function modalPad(b){
    if(b===BTN.UP) modalSetFocus(modalFocus-1); else if(b===BTN.DOWN) modalSetFocus(modalFocus+1);
    else if(b===BTN.A) modalActivate(modalFocus,1); else if(b===BTN.B){ blip("back"); closeModal(); }
    else if(b===BTN.LEFT) modalActivate(modalFocus,-1); else if(b===BTN.RIGHT) modalActivate(modalFocus,1);
  }
  function pollPads(){
    var pads=navigator.getGamepads?navigator.getGamepads():[];
    var now=Date.now();
    for(var p=0;p<pads.length;p++){
      var gp=pads[p]; if(!gp)continue;
      var st=padPrev[gp.index]||(padPrev[gp.index]={});
      var pressed={};
      gp.buttons.forEach(function(b,i){ pressed[i]=b.pressed||b.value>0.6; });
      // sticks → dpad
      if(gp.axes.length>=2){ if(gp.axes[0]<-0.6)pressed[BTN.LEFT]=true; if(gp.axes[0]>0.6)pressed[BTN.RIGHT]=true; if(gp.axes[1]<-0.6)pressed[BTN.UP]=true; if(gp.axes[1]>0.6)pressed[BTN.DOWN]=true; }
      for(var i=0;i<17;i++){
        var down=!!pressed[i], was=!!st[i];
        if(down&&!was){ padRepeat[i]=now+420; onPadButton(i,true,gp.index); }
        else if(down&&was&&[12,13,14,15].indexOf(i)>=0 && now>padRepeat[i] && view!=="player"){ padRepeat[i]=now+110; onPadButton(i,true,gp.index,true); }
        else if(!down&&was){ onPadButton(i,false,gp.index); }
        st[i]=down;
      }
    }
    requestAnimationFrame(pollPads);
  }
  requestAnimationFrame(pollPads);
  function onPadButton(b,down,idx,repeat){
    if(down) mouse.active=false;
    if(down && view!=="player" && Date.now()<padMuteUntil) return;
    if(view==="player"){
      // while a game runs, EmulatorJS's gamepad handler (wrapped by installPadHotkeys) owns the pad
      if(!started && down && (b===BTN.B||b===BTN.START)) abortLoad();
      return;
    }
    if(!down)return;
    if(!booted){ triggerBoot(); return; }
    if(modal.classList.contains("open")){ modalPad(b); return; }
    if(view==="systems"){
      var cols=gridColumns(byId("sysGrid"));
      if(b===BTN.LEFT) focusSystem(focus.systems-1); else if(b===BTN.RIGHT) focusSystem(focus.systems+1);
      else if(b===BTN.UP) focusSystem(focus.systems-cols); else if(b===BTN.DOWN) focusSystem(focus.systems+cols);
      else if(b===BTN.A){ blip("select"); openLibrary(sysList[focus.systems].id); }
      else if(b===BTN.START) openSettings(); else if(b===BTN.Y){ openLibrary("all"); setTimeout(function(){byId("libSearch").focus();},50); }
      else if(b===BTN.L1) focusSystem(focus.systems-1); else if(b===BTN.R1) focusSystem(focus.systems+1);
      return;
    }
    if(view==="library"){
      if(document.activeElement===byId("libSearch")) byId("libSearch").blur();
      var side=visibleSystems(); var ci=side.findIndex(function(s){return s.id===currentSys;});
      if(b===BTN.L1){ blip("select"); openLibrary(side[(ci-1+side.length)%side.length].id); return; }
      if(b===BTN.R1){ blip("select"); openLibrary(side[(ci+1)%side.length].id); return; }
      if(b===BTN.B){ blip("back"); showSystems(); return; }
      if(b===BTN.START){ openSettings(); return; }
      if(b===BTN.Y){ byId("libSearch").focus(); return; }
      if(b===BTN.SELECT){ openViewOptions(); return; }
      if(focus.zone==="cons"){
        if(b===BTN.UP) focusCons(focus.cons-1); else if(b===BTN.DOWN) focusCons(focus.cons+1);
        else if(b===BTN.RIGHT||b===BTN.A){ if(b===BTN.A){ blip("select"); openLibrary(side[focus.cons].id);} else leaveCons(); }
        return;
      }
      var gcols=gridColumns(byId("libGames"));
      if(b===BTN.LEFT){ if(focus.lib%gcols===0){ focus.cons=Math.max(0,ci); focusCons(focus.cons); } else focusGame(focus.lib-1); }
      else if(b===BTN.RIGHT) focusGame(focus.lib+1);
      else if(b===BTN.UP) focusGame(focus.lib-gcols); else if(b===BTN.DOWN) focusGame(focus.lib+gcols);
      else if(b===BTN.A){ blip("select"); if(libList[focus.lib]) startGame(libList[focus.lib]); else pickRoms(); }
      else if(b===BTN.X){ if(libList[focus.lib]) openGameMenu(libList[focus.lib]); }
    }
  }

  /* ---- keyboard navigation for menus (system view / library / modal) ---- */
  document.addEventListener("keydown",function(e){
    if(e.key==="F11"&&view!=="player"){ e.preventDefault(); toggleFs(); return; }
    if(!booted)return;
    var tag=(e.target&&e.target.tagName)||"";
    if(tag==="INPUT"||tag==="TEXTAREA")return;
    if(modal.classList.contains("open")){
      if(e.key==="ArrowUp"){ e.preventDefault(); modalSetFocus(modalFocus-1); }
      else if(e.key==="ArrowDown"){ e.preventDefault(); modalSetFocus(modalFocus+1); }
      else if(e.key==="ArrowLeft"){ e.preventDefault(); modalActivate(modalFocus,-1); }
      else if(e.key==="ArrowRight"){ e.preventDefault(); modalActivate(modalFocus,1); }
      else if(e.key==="Enter"){ e.preventDefault(); modalActivate(modalFocus,1); }
      else if(e.key==="Escape"||e.key==="Backspace"){ e.preventDefault(); blip("back"); closeModal(); }
      e.stopPropagation();
      return;
    }
    if(view==="systems"){
      var cols=gridColumns(byId("sysGrid"));
      switch(e.key){
        case "ArrowLeft": e.preventDefault(); focusSystem(focus.systems-1); break;
        case "ArrowRight": e.preventDefault(); focusSystem(focus.systems+1); break;
        case "ArrowUp": e.preventDefault(); focusSystem(focus.systems-cols); break;
        case "ArrowDown": e.preventDefault(); focusSystem(focus.systems+cols); break;
        case "Enter": case " ": e.preventDefault(); blip("select"); openLibrary(sysList[focus.systems].id); break;
        case "f": case "F": case "/": e.preventDefault(); openLibrary("all"); setTimeout(function(){byId("libSearch").focus();},50); break;
        case "s": case "S": e.preventDefault(); openSettings(); break;
        case "h": case "H": case "?": e.preventDefault(); showHelp(); break;
        case "b": case "B": e.preventDefault(); missingBiosReport(); break;
        case "Home": e.preventDefault(); focusSystem(0); break;
        case "End": e.preventDefault(); focusSystem(sysList.length-1); break;
      }
      return;
    }
    if(view==="library"){
      var side=visibleSystems(); var ci=side.findIndex(function(s){return s.id===currentSys;});
      if(e.key==="Escape"||e.key==="Backspace"){ e.preventDefault(); blip("back"); showSystems(); return; }
      if(e.key==="f"||e.key==="F"||e.key==="/"){ e.preventDefault(); byId("libSearch").focus(); byId("libSearch").select(); return; }
      if(e.key==="r"||e.key==="R"){ e.preventDefault(); randomGame(); return; }
      if((e.key==="i"||e.key==="I")&&gameFocus){ e.preventDefault(); openGameInfo(gameFocus); return; }
      if(e.key==="o"||e.key==="O"){ e.preventDefault(); cycleSort(); return; }
      if(e.key==="v"||e.key==="V"){ e.preventDefault(); byId("libView").click(); return; }
      if(e.key==="s"||e.key==="S"){ e.preventDefault(); openSettings(); return; }
      if(e.key==="a"||e.key==="A"||e.key==="Insert"){ e.preventDefault(); pickRoms(); return; }
      if(e.key==="PageUp"){ e.preventDefault(); blip("select"); openLibrary(side[(ci-1+side.length)%side.length].id); return; }
      if(e.key==="PageDown"){ e.preventDefault(); blip("select"); openLibrary(side[(ci+1)%side.length].id); return; }
      if(e.key==="Tab"){ e.preventDefault(); if(focus.zone==="cons") leaveCons(); else { focus.cons=Math.max(0,ci); focusCons(focus.cons);} return; }
      if(e.key==="Delete"){ if(libList[focus.lib]&&!settings.kidMode) deleteGame(libList[focus.lib]); return; }
      if(focus.zone==="cons"){
        if(e.key==="ArrowUp"){ e.preventDefault(); focusCons(focus.cons-1); }
        else if(e.key==="ArrowDown"){ e.preventDefault(); focusCons(focus.cons+1); }
        else if(e.key==="ArrowRight"){ e.preventDefault(); leaveCons(); }
        else if(e.key==="Enter"||e.key===" "){ e.preventDefault(); blip("select"); openLibrary(side[focus.cons].id); }
        return;
      }
      var gcols=gridColumns(byId("libGames"));
      switch(e.key){
        case "ArrowLeft": e.preventDefault(); if(focus.lib%gcols===0){ focus.cons=Math.max(0,ci); focusCons(focus.cons); } else focusGame(focus.lib-1); break;
        case "ArrowRight": e.preventDefault(); focusGame(focus.lib+1); break;
        case "ArrowUp": e.preventDefault(); focusGame(focus.lib-gcols); break;
        case "ArrowDown": e.preventDefault(); focusGame(focus.lib+gcols); break;
        case "Home": e.preventDefault(); focusGame(0); break;
        case "End": e.preventDefault(); focusGame(libList.length); break;
        case "Enter": e.preventDefault(); blip("select"); if(libList[focus.lib]) startGame(libList[focus.lib]); else pickRoms(); break;
        case " ": case "ContextMenu": e.preventDefault(); if(libList[focus.lib]) openGameMenu(libList[focus.lib]); break;
        default:
          // jump to letter
          if(e.key.length===1 && /[a-z0-9]/i.test(e.key) && !e.ctrlKey && !e.metaKey){ var L=e.key.toLowerCase(); var i=libList.findIndex(function(g,k){ return k>focus.lib && g.name.toLowerCase().charAt(0)===L; }); if(i<0) i=libList.findIndex(function(g){ return g.name.toLowerCase().charAt(0)===L; }); if(i>=0) focusGame(i); }
      }
    }
  });

  function openViewOptions(){
    openModal({title:"VIEW OPTIONS",items:[
      {label:"Sort",value:({name:"A-Z",recent:"LAST PLAYED",added:"DATE ADDED",played:"MOST PLAYED",system:"SYSTEM"})[libSort],icon:ICON.all,cycle:function(){ cycleSort(); openViewOptions(); }},
      {label:"View style",value:(settings.viewMode||"grid").toUpperCase(),icon:ICON.all,cycle:function(){ byId("libView").click(); openViewOptions(); }},
      {label:"Random game",icon:ICON.dice,action:function(){ closeModal(); randomGame(); }},
      {label:"Add games",icon:ICON.file,action:function(){ closeModal(); pickRoms(); }},
      {label:"Settings",icon:ICON.gear,action:function(){ closeModal(); openSettings(); }}
    ]});
  }

  /* ================= Game Control Center (RetroBat overlay) ================= */
  var ccItems=[], ccFocus=0, ccWasPaused=false;
  var lastShot=null, lastShotAt=0;
  function openControlCenter(quitFocus){
    trace("openControlCenter quitFocus=",!!quitFocus,"ccOpen=",ccOpen,"started=",started);
    if(ccOpen||!started)return;
    ccOpen=true;
    // grab a frame for the box art while the game is still rendering (a paused canvas never produces a new frame)
    takeShot(function(blob){ if(blob){ lastShot=blob; lastShotAt=Date.now(); } });
    try{ ccWasPaused=emu().paused; if(!ccWasPaused) setTimeout(function(){ if(ccOpen) emu().pause(); },60); }catch(e){}
    var sys=findSys(current.sysId);
    var slot=currentSlot();
    ccItems=[
      {id:"resume",label:"RESUME",icon:ICON.play,action:function(){ closeControlCenter(); }},
      {id:"save",label:"SAVE STATE",sub:"slot "+slot,icon:ICON.save,action:function(){ closeControlCenter(); setTimeout(doSave,60); }},
      {id:"load",label:"LOAD STATE",sub:"slot "+slot,icon:ICON.load,action:function(){ closeControlCenter(); setTimeout(doLoad,60); }},
      {id:"slot",label:"STATE SLOT",sub:"◄ "+slot+" ►",icon:ICON.all,cycle:function(d){ changeSlot(d); rebuildCC(); }},
      {id:"shot",label:"SCREENSHOT",sub:"also sets box art",icon:ICON.camera,action:function(){ closeControlCenter(); setTimeout(doScreenshot,120); }},
      {id:"tattoo",label:"CONTROLS",sub:"tattoo for "+sys.short,icon:ICON.keyboard,action:function(){ closeControlCenter(); showControls(sys); try{ emu().pause(); }catch(e){} modalOnClose=function(){ try{ emu().play(); }catch(e){} }; }},
      {id:"menu",label:"EMULATOR MENU",sub:"shaders · core options · remap",icon:ICON.gear,action:function(){ closeControlCenter(); setTimeout(toggleEjsMenu,60); }},
      {id:"fs",label:document.fullscreenElement?"EXIT FULLSCREEN":"FULLSCREEN",icon:ICON.fullscreen,action:function(){ toggleFs(); closeControlCenter(); }},
      {id:"fav",label:current.fav?"REMOVE FAVORITE":"ADD TO FAVORITES",icon:ICON.heart,action:function(){ current.fav=!current.fav; persistRom(current); rebuildCC(); }},
      {id:"reset",label:"RESET GAME",icon:ICON.reset,action:function(){ try{ emu().gameManager.restart(); }catch(e){} closeControlCenter(); }},
      {id:"quit",label:"QUIT GAME",sub:settings.autoSaveState&&settings.autoLoadState?"progress is auto-saved":"return to library",icon:ICON.exit,color:"#ff6a6a",action:function(){ quitGame(); }}
    ];
    ccFocus=quitFocus?ccItems.length-1:0;
    mouse.active=false;
    renderCC();
    byId("cc").classList.add("open");
  }
  function rebuildCC(){ var f=ccFocus; ccOpen=false; try{ emu().pause(); }catch(e){} byId("cc").classList.remove("open"); openControlCenter(); ccFocus=f; renderCC(); }
  function renderCC(){
    var sys=findSys(current.sysId);
    byId("ccTitle").innerHTML=esc(current.name)+' <b>· '+esc(sys.short)+'</b>';
    byId("ccMeta").innerHTML='played '+(current.playCount||0)+'× · this session '+fmtDur((Date.now()-playStart)/1000)+' · total '+fmtDur((current.playTime||0))+' · '+(emu().rewindEnabled?'rewind on':'rewind off')+' · shader '+(settings.shader==="disabled"?"off":settings.shader.replace(".glslp",""));
    var g=byId("ccGrid"); g.innerHTML="";
    ccItems.forEach(function(it,i){
      var el=document.createElement("div"); el.className="cci"+(i===ccFocus?" focus":""); if(it.color) el.style.setProperty("--c",it.color);
      el.innerHTML='<span class="ic">'+it.icon+'</span><span class="l">'+it.label+'</span>'+(it.sub?'<span class="s">'+esc(it.sub)+'</span>':'');
      el.addEventListener("click",function(){ ccFocus=i; ccActivate(1); });
      el.addEventListener("mouseenter",function(){ if(!hoverOK())return; ccFocus=i; $$("#ccGrid .cci").forEach(function(x,k){x.classList.toggle("focus",k===i);}); });
      g.appendChild(el);
    });
    var tat=byId("ccTattoo"); tat.textContent=sys.controls||KB_STD;
  }
  function ccActivate(dir){ var it=ccItems[ccFocus]; trace("ccActivate",ccFocus,it&&it.id); if(!it)return; blip("select"); if(it.cycle){ it.cycle(dir); return; } it.action(); }
  function ccMove(d){ var n=(ccFocus+d+ccItems.length)%ccItems.length; if(n!==ccFocus) blip("move"); ccFocus=n; $$("#ccGrid .cci").forEach(function(x,k){x.classList.toggle("focus",k===ccFocus);}); }
  function ccKeys(e){
    e.preventDefault(); e.stopPropagation();
    var cols=gridColumns2(byId("ccGrid"));
    switch(e.key){
      case "ArrowLeft": if(ccItems[ccFocus].cycle){ ccActivate(-1); } else ccMove(-1); break;
      case "ArrowRight": if(ccItems[ccFocus].cycle){ ccActivate(1); } else ccMove(1); break;
      case "ArrowUp": ccMove(-cols); break;
      case "ArrowDown": ccMove(cols); break;
      case "Enter": case " ": ccActivate(1); break;
      case "Escape": case "Backspace": closeControlCenter(); break;
      case "F12": if(e.ctrlKey) closeControlCenter(); break;
      case "q": case "Q": quitGame(); break;
    }
  }
  function gridColumns2(el){ var it=$$(".cci",el); if(it.length<2)return 1; var top=it[0].offsetTop,n=0; for(var i=0;i<it.length;i++){ if(it[i].offsetTop!==top)break; n++; } return n||1; }
  function ccPad(b){
    var cols=gridColumns2(byId("ccGrid"));
    if(b===BTN.LEFT){ if(ccItems[ccFocus].cycle) ccActivate(-1); else ccMove(-1); }
    else if(b===BTN.RIGHT){ if(ccItems[ccFocus].cycle) ccActivate(1); else ccMove(1); }
    else if(b===BTN.UP) ccMove(-cols); else if(b===BTN.DOWN) ccMove(cols);
    else if(b===BTN.A) ccActivate(1); else if(b===BTN.B||b===BTN.START) closeControlCenter();
  }
  function closeControlCenter(){
    if(!ccOpen)return; ccOpen=false;
    byId("cc").classList.remove("open");
    try{ if(!ccWasPaused) emu().play(); emu().elements.parent.focus(); }catch(e){}
  }
  byId("ccClose").addEventListener("click",closeControlCenter);
  byId("plMenu").addEventListener("click",function(){ openControlCenter(); });
  byId("plBack").addEventListener("click",function(){ confirmQuit(); });

  /* ---- quitting ---- */
  var quitting=false;
  function quitGame(){
    trace("quitGame quitting=",quitting,"started=",started,"ccOpen=",ccOpen);
    if(quitting)return; quitting=true;
    byId("cc").classList.remove("open"); ccOpen=false;
    var game=current;
    var finish=function(){
      trace("quit finish");
      try{ if(game) game.playTime=(game.playTime||0)+Math.round((Date.now()-playStart)/1000)%10; }catch(e){}
      try{ if(window.EJS_emulator) window.EJS_emulator.callEvent("exit"); }catch(e){}
      setTimeout(function(){ teardownPlayer(); },80);
    };
    // Auto save state + fresh box art on quit
    if(started && game){
      var s=settings.autoSaveState&&settings.autoLoadState?grabState():null;
      var withShot=function(blob){
        if(blob) setBoxArt(game,blob);
        if(s){ var st=ejsStates(); if(st){ st.put(stateKey(game,"auto"),s).then(finish,finish); return; } }
        finish();
      };
      if(lastShot && Date.now()-lastShotAt<60000) withShot(lastShot);
      else { try{ if(emu().paused) emu().play(); }catch(e){} takeShot(withShot); }
    } else finish();
  }
  function onEmulatorExit(){ /* fired by EJS (our quit, the emulator's own Exit button, or a start failure) */
    trace("onEmulatorExit quitting=",quitting,"started=",started);
    if(quitting) return;
    if(!started){ // start failure → show the error instead of bouncing back silently
      quitting=true; loadError("THE GAME FAILED TO START"); setTimeout(function(){ quitting=false; },50); return;
    }
    quitting=true; setTimeout(function(){ teardownPlayer(); },80);
  }
  function teardownPlayer(){
    trace("teardownPlayer");
    clearTimeout(watchdog); clearInterval(playTimeTimer);
    // EmulatorJS aborts the WASM module ~1 s after "exit"; swallow that expected RuntimeError so it never surfaces as an app error
    var until=Date.now()+2500;
    var swallow=function(ev){ var m=String((ev.reason&&ev.reason.message)||(ev.error&&ev.error.message)||ev.message||ev.reason||""); if(/Aborted|abort\(|RuntimeError|Wake Lock/i.test(m)){ ev.preventDefault(); if(ev.stopImmediatePropagation) ev.stopImmediatePropagation(); } if(Date.now()>until){ window.removeEventListener("error",swallow,true); window.removeEventListener("unhandledrejection",swallow,true); } };
    window.addEventListener("error",swallow,true); window.addEventListener("unhandledrejection",swallow,true);
    setTimeout(function(){ window.removeEventListener("error",swallow,true); window.removeEventListener("unhandledrejection",swallow,true); },3000);
    try{ if(window.EJS_emulator&&window.EJS_emulator.gamepad) window.EJS_emulator.gamepad.terminate(); }catch(e){}
    try{ var em=window.EJS_emulator; if(em){
      em.started=false;
      // if the load was aborted mid-way, make sure the pipeline can never reach startGame() on a detached node
      ["downloadGameCore","initGameCore","initModule","downloadFiles","startGame","startButtonClicked"].forEach(function(m){ em[m]=function(){}; });
      em.callEvent=function(){ return 0; };
      if(em.saveSaveInterval) clearInterval(em.saveSaveInterval);
      try{ var al=em.Module&&em.Module.AL; if(al&&al.currentCtx&&al.currentCtx.audioCtx&&al.currentCtx.audioCtx.state!=="closed") al.currentCtx.audioCtx.close(); }catch(e){}
      if(em.elements&&em.elements.parent){ em.elements.parent.classList.remove("ejs_parent"); em.elements.parent.removeAttribute("tabindex"); }
    } }catch(e){}
    window.EJS_emulator=null;
    $$('script[src^="blob:"]').forEach(function(s){ s.parentNode.removeChild(s); });
    // replace the host node entirely: EmulatorJS attached keyboard/mouse listeners to it
    var oldHost=byId("ejsHost"); var host=oldHost.cloneNode(false); host.innerHTML=""; host.removeAttribute("style"); oldHost.parentNode.replaceChild(host,oldHost);
    byId("plLoading").style.display="none";
    if(document.fullscreenElement){ try{ document.exitFullscreen(); }catch(e){} }
    var g=current; current=null; started=false; quitting=false; rewinding=false; ffHeld=false; hk.held=false; hk.combo=false;
    padSync(400);
    if(g) persistRom(g);
    // some cores leave the WASM running until Module.abort(); EmulatorJS handles it with a 1 s timer.
    // If a threaded core (PSP/DOS) was used, a full reload is the only reliable way to release memory.
    var sys=g?findSys(g.sysId):null;
    if(sys&&sys.threads){ sessionStorage.setItem("rbw-resume",JSON.stringify({sys:g.sysId,focus:focus.lib})); location.reload(); return; }
    openLibrary(g?g.sysId:(currentSys||"all"),true);
    focusGame(focus.lib,true,true);
    blip("back");
  }
  // resume after a forced reload (threaded cores)
  try{ var rs=JSON.parse(sessionStorage.getItem("rbw-resume")||"null"); if(rs){ sessionStorage.removeItem("rbw-resume"); booted=true; libReady.then(function(){ byId("boot").classList.remove("active"); showSystems(); openLibrary(rs.sys,true); focus.lib=rs.focus||0; focusGame(focus.lib,true,true); }); } }catch(e){}

  /* ---- build an uncompressed (stored) ZIP in memory for multi-file games → Promise<File> ---- */
  var crcTable=(function(){ var t=[],c; for(var n=0;n<256;n++){ c=n; for(var k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[n]=c>>>0; } return t; })();
  function crc32(u8){ var c=0^(-1); for(var i=0;i<u8.length;i++) c=(c>>>8)^crcTable[(c^u8[i])&0xFF]; return (c^(-1))>>>0; }
  function makeZip(entries,zipName){
    var parts=[], central=[], offset=0;
    return Promise.all(entries.map(function(e){ return e.blob.arrayBuffer().then(function(ab){ return {name:e.name,data:new Uint8Array(ab)}; }); })).then(function(items){
      items.forEach(function(it){
        var nameBytes=new TextEncoder().encode(it.name), crc=crc32(it.data), size=it.data.length;
        var lh=new DataView(new ArrayBuffer(30));
        lh.setUint32(0,0x04034b50,true); lh.setUint16(4,20,true); lh.setUint16(6,0x0800,true); lh.setUint16(8,0,true); lh.setUint16(10,0,true); lh.setUint16(12,0x21,true);
        lh.setUint32(14,crc,true); lh.setUint32(18,size,true); lh.setUint32(22,size,true); lh.setUint16(26,nameBytes.length,true); lh.setUint16(28,0,true);
        parts.push(lh.buffer,nameBytes,it.data);
        var ch=new DataView(new ArrayBuffer(46));
        ch.setUint32(0,0x02014b50,true); ch.setUint16(4,20,true); ch.setUint16(6,20,true); ch.setUint16(8,0x0800,true); ch.setUint16(10,0,true); ch.setUint16(12,0,true); ch.setUint16(14,0x21,true);
        ch.setUint32(16,crc,true); ch.setUint32(20,size,true); ch.setUint32(24,size,true); ch.setUint16(28,nameBytes.length,true); ch.setUint16(30,0,true); ch.setUint16(32,0,true); ch.setUint16(34,0,true); ch.setUint16(36,0,true); ch.setUint32(38,0,true); ch.setUint32(42,offset,true);
        central.push(ch.buffer,nameBytes);
        offset+=30+nameBytes.length+size;
      });
      var cdSize=central.reduce(function(a,b){return a+b.byteLength;},0);
      var eocd=new DataView(new ArrayBuffer(22));
      eocd.setUint32(0,0x06054b50,true); eocd.setUint16(4,0,true); eocd.setUint16(6,0,true); eocd.setUint16(8,items.length,true); eocd.setUint16(10,items.length,true); eocd.setUint32(12,cdSize,true); eocd.setUint32(16,offset,true); eocd.setUint16(20,0,true);
      return new File(parts.concat(central,[eocd.buffer]),zipName,{type:"application/zip"});
    });
  }

  window.addEventListener("unhandledrejection",function(ev){ var m=String((ev.reason&&ev.reason.message)||ev.reason||""); if(/Wake Lock|wakeLock/i.test(m)) ev.preventDefault(); });
  window.RBW={version:"2.2.0",trace:TRACE,db:DB,cores:CORES,coreFiles:CORE_FILES,
    roms:function(){ return ROMS; }, systems:function(){ return SYSTEMS; },
    play:function(id){ var g=ROMS.find(function(r){return r.id===id;}); if(g){ if(view!=="library"||currentSys!==g.sysId) openLibrary(g.sysId); startGame(g); } return !!g; },
    open:function(sysId){ openLibrary(sysId); }, home:function(){ showSystems(); },
    state:function(){ return {view:view,currentSys:currentSys,game:current&&current.name,started:started,quitting:quitting,ccOpen:ccOpen,roms:ROMS.length,bios:Object.keys(BIOS).length,settings:settings}; }};
  console.log("RECALBOX OS WEB READY");
})();
