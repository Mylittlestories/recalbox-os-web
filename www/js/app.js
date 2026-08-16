(function(){
  "use strict";

  /* ================= helpers ================= */
  function byId(id){ return document.getElementById(id); }
  var toastTimer=null;
  function toast(msg){ var t=byId("toast"); t.innerHTML=msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(function(){t.classList.remove("show")},3200); }
  function esc(s){ return s.replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
  function consoleIcon(color,label){
    return '<svg viewBox="0 0 24 24"><rect x="2.4" y="6" width="19.2" height="12" rx="2.5" fill="'+color+'"/><rect x="4.2" y="7.8" width="15.6" height="6.6" rx="1.2" fill="#0b0b10"/><text x="12" y="12.6" text-anchor="middle" font-size="4.2" font-family="monospace" font-weight="bold" fill="#fff">'+label+'</text></svg>';
  }
  function handheldIcon(color,label){
    return '<svg viewBox="0 0 24 24"><rect x="6.5" y="2" width="11" height="20" rx="2.5" fill="'+color+'"/><rect x="7.6" y="3.4" width="8.8" height="9.6" rx="1.2" fill="#0b0b10"/><circle cx="11.3" cy="15.8" r="1.5" fill="#e8e8ee"/><circle cx="15" cy="15.8" r="1.5" fill="#e8e8ee"/><rect x="9" y="18.6" width="6" height="1.4" rx="0.7" fill="#e8e8ee"/></svg>';
  }

  /* ================= systems =================
     core = EmulatorJS generic system name (EJS_core)
     exts = accepted file extensions when adding a ROM        */
  var SYSTEMS = [
    {id:"nes",name:"Nintendo (NES)",short:"NES",core:"nes",color:"#d33",note:"8-bit home console",exts:["nes","fds"],kind:"console",icon:consoleIcon("#d33","NES")},
    {id:"snes",name:"Super Nintendo",short:"SNES",core:"snes",color:"#88f",note:"16-bit home console",exts:["sfc","smc"],kind:"console",icon:consoleIcon("#88f","SNES")},
    {id:"n64",name:"Nintendo 64",short:"N64",core:"n64",color:"#6b8",note:"3D era",exts:["n64","z64","v64"],kind:"console",icon:consoleIcon("#6b8","N64")},
    {id:"gb",name:"Game Boy",short:"GB",core:"gb",color:"#8c8",note:"8-bit handheld",exts:["gb"],kind:"handheld",icon:handheldIcon("#8c8","GB")},
    {id:"gba",name:"Game Boy Advance",short:"GBA",core:"gba",color:"#a48",note:"32-bit handheld",exts:["gba"],kind:"handheld",icon:handheldIcon("#a48","GBA")},
    {id:"nds",name:"Nintendo DS",short:"NDS",core:"nds",color:"#c96",note:"dual-screen handheld",exts:["nds"],kind:"handheld",icon:handheldIcon("#c96","DS")},
    {id:"psx",name:"Sony PlayStation",short:"PSX",core:"psx",color:"#999",note:"32-bit console",exts:["cue","bin","img","iso","pbp","chd"],kind:"console",icon:consoleIcon("#999","PS1")},
    {id:"psp",name:"PlayStation Portable",short:"PSP",core:"psp",threads:true,color:"#557",note:"handheld",exts:["iso","cso","pbp"],kind:"handheld",icon:handheldIcon("#557","PSP")},
    {id:"segaMD",name:"Sega Genesis",short:"GEN",core:"segaMD",color:"#55f",note:"16-bit home console",exts:["md","gen","bin","smd"],kind:"console",icon:consoleIcon("#55f","GEN")},
    {id:"segaMS",name:"Sega Master System",short:"SMS",core:"segaMS",color:"#7af",note:"8-bit home console",exts:["sms"],kind:"console",icon:consoleIcon("#7af","SMS")},
    {id:"segaGG",name:"Sega Game Gear",short:"GG",core:"segaGG",color:"#a78",note:"8-bit handheld",exts:["gg"],kind:"handheld",icon:handheldIcon("#a78","GG")},
    {id:"segaCD",name:"Sega CD",short:"SCD",core:"segaCD",color:"#45a",note:"CD add-on",exts:["bin","cue","iso","chd"],kind:"console",icon:consoleIcon("#45a","SCD")},
    {id:"segaSaturn",name:"Sega Saturn",short:"SAT",core:"segaSaturn",color:"#e75",note:"CD console",exts:["cue","bin","iso","chd"],kind:"console",icon:consoleIcon("#e75","SAT")},
    {id:"atari2600",name:"Atari 2600",short:"2600",core:"atari2600",color:"#f93",note:"first gen console",exts:["a26"],kind:"console",icon:consoleIcon("#f93","2600")},
    {id:"atari5200",name:"Atari 5200",short:"5200",core:"atari5200",color:"#f73",note:"home console",exts:["a52"],kind:"console",icon:consoleIcon("#f73","5200")},
    {id:"atari7800",name:"Atari 7800",short:"7800",core:"atari7800",color:"#e63",note:"home console",exts:["a78"],kind:"console",icon:consoleIcon("#e63","7800")},
    {id:"lynx",name:"Atari Lynx",short:"LYNX",core:"lynx",color:"#d55",note:"handheld",exts:["lnx"],kind:"handheld",icon:handheldIcon("#d55","LYX")},
    {id:"jaguar",name:"Atari Jaguar",short:"JAG",core:"jaguar",color:"#b63",note:"64-bit console",exts:["j64","jag"],kind:"console",icon:consoleIcon("#b63","JAG")},
    {id:"pce",name:"PC Engine",short:"PCE",core:"pce",color:"#4ab",note:"16-bit console",exts:["pce"],kind:"console",icon:consoleIcon("#4ab","PCE")},
    {id:"ws",name:"WonderSwan",short:"WS",core:"ws",color:"#b7b",note:"handheld",exts:["ws","wsc"],kind:"handheld",icon:handheldIcon("#b7b","WS")},
    {id:"ngp",name:"Neo Geo Pocket",short:"NGP",core:"ngp",color:"#5a8",note:"handheld",exts:["ngp","npc"],kind:"handheld",icon:handheldIcon("#5a8","NGP")},
    {id:"c64",name:"Commodore 64",short:"C64",core:"c64",color:"#59b",note:"home computer",exts:["d64"],kind:"computer",icon:consoleIcon("#59b","C64")},
    {id:"amiga",name:"Commodore Amiga",short:"AMIGA",core:"amiga",color:"#a35",note:"home computer",exts:["adf","hdf","lha"],kind:"computer",icon:consoleIcon("#a35","AMI")},
    {id:"arcade",name:"Arcade (FBNeo)",short:"ARC",core:"arcade",color:"#55c",note:"coin-op arcade",exts:["zip","7z"],kind:"arcade",icon:consoleIcon("#55c","ARC")},
    {id:"mame",name:"MAME 2003+",short:"MAME",core:"mame",color:"#8a4",note:"classic arcade",exts:["zip","7z"],kind:"arcade",icon:consoleIcon("#8a4","MAME")},
    {id:"dos",name:"MS-DOS (DOSBox)",short:"DOS",core:"dos",threads:true,color:"#2a6bb8",note:"PC games 1980s-90s",exts:["zip","exe","com","bat","iso"],kind:"computer",icon:consoleIcon("#2a6bb8","DOS")}
  ];

  var gamesBySystem={};
  var currentSys=null;

  /* ================= boot ================= */
  var booted=false;
  function bootNow(){
    // bundled free game: 2048 (NES homebrew)
    gamesBySystem["nes"]=[{name:"2048",sys:"NES",url:"roms/2048.nes",embedded:true}];
    var b=byId("boot"); b.classList.remove("active");
    setTimeout(function(){ renderSystems(); byId("systems").classList.add("active"); },120);
  }
  function triggerBoot(){ if(booted)return; booted=true; bootNow(); }
  byId("boot").addEventListener("click",triggerBoot);
  document.addEventListener("keydown",triggerBoot);

  /* ================= systems screen ================= */
  function countGames(id){ return (gamesBySystem[id]?gamesBySystem[id].length:0); }
  function renderSystems(){
    var g=byId("sysGrid"); g.innerHTML="";
    SYSTEMS.forEach(function(s){
      var card=document.createElement("div");
      card.className="card avail";
      card.innerHTML='<span class="badge">'+s.short+'</span><div class="icon">'+s.icon+'</div><h3>'+s.name+'</h3><p>'+s.note+'</p>';
      card.addEventListener("click",function(){ openLibrary(s.id); });
      g.appendChild(card);
    });
  }

  /* ================= library ================= */
  function findSys(id){ return SYSTEMS.find(function(s){return s.id===id;}); }
  function openLibrary(sysId){
    currentSys=sysId;
    var sys=findSys(sysId);
    byId("libCrumb").innerHTML='SYSTEM / <span>'+esc(sys.name)+'</span>';
    var cons=byId("libCons"); cons.innerHTML="";
    SYSTEMS.forEach(function(s){
      var c=document.createElement("div");
      c.className="lc"+(s.id===sysId?" active":"");
      c.innerHTML=s.icon+'<span>'+s.short+'</span>';
      c.addEventListener("click",function(){ if(s.id!==sysId) openLibrary(s.id); });
      cons.appendChild(c);
    });
    renderGames();
    byId("systems").classList.remove("active");
    byId("library").classList.add("active");
  }
  function gamesFor(id){ if(!gamesBySystem[id]) gamesBySystem[id]=[]; return gamesBySystem[id]; }

  function coverSVG(sys,game){
    var s=findSys(game.sys)||sys;
    return s.icon;
  }
  function renderGames(){
    var sys=findSys(currentSys);
    var g=byId("libGames"); g.innerHTML="";
    var list=gamesFor(currentSys);
    list.forEach(function(game,idx){
      var el=document.createElement("div"); el.className="game";
      el.innerHTML='<div class="box">'+coverSVG(sys,game)+'</div><div class="meta"><div class="t">'+esc(game.name)+'</div><div class="s">'+sys.short+'</div></div>';
      el.addEventListener("click",function(){ startGame(game); });
      if(!game.embedded){ var del=document.createElement("div"); del.className="del"; del.textContent="\u2715";
        del.addEventListener("click",function(ev){ ev.stopPropagation(); gamesFor(currentSys).splice(idx,1); renderGames(); }); el.appendChild(del); }
      g.appendChild(el);
    });
    var add=document.createElement("div"); add.className="game add";
    add.innerHTML='<div class="plus">+</div><div>ADD<br>ROM</div>';
    add.addEventListener("click",function(){ romInput.click(); });
    g.appendChild(add);
  }

  /* ================= add ROMs ================= */
  var romInput=document.createElement("input");
  romInput.type="file"; romInput.style.display="none"; document.body.appendChild(romInput);
  romInput.addEventListener("change",function(){ if(romInput.files.length) loadFile(romInput.files[0]); romInput.value=""; });

  function loadFile(file){
    var sys=findSys(currentSys);
    var lower=file.name.toLowerCase();
    var ok = sys.exts.some(function(e){ return lower.endsWith("."+e); });
    if(!ok){ toast("&#9888; FILE MUST BE: <b>"+sys.exts.join(" / ").toUpperCase()+"</b>"); return; }
    var url = URL.createObjectURL(file);
    gamesFor(currentSys).push({name:file.name.replace(/\.[^.]+$/,""),sys:currentSys,blobUrl:url,embedded:false});
    renderGames();
    toast("ADDED: <b>"+esc(file.name.replace(/\.[^.]+$/,""))+"</b>");
  }

  var drop=byId("drop");
  ["dragenter","dragover"].forEach(function(ev){ drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.add("on");}); });
  ["dragleave","drop"].forEach(function(ev){ drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.remove("on");}); });
  drop.addEventListener("drop",function(e){ var f=e.dataTransfer.files[0]; if(f) loadFile(f); });
  drop.addEventListener("click",function(){ romInput.click(); });

  /* ================= player (EmulatorJS) ================= */
  function showPlayer(title,hints){
    byId("plTitle").innerHTML=title;
    byId("plHints").innerHTML=hints;
    byId("library").classList.remove("active");
    byId("player").classList.add("active");
  }
  var loadingTxtEl=byId("plLoadingTxt");
  function setLoad(t){ loadingTxtEl.textContent=t; }

  function startGame(game){
    var sys=findSys(game.sys)||findSys(currentSys);
    showPlayer(esc(game.name)+' <b>&middot; '+sys.short+'</b>','<span>CONTROLS: <b>SEE EMULATOR MENU</b></span><span>EXIT: <b>ESC</b></span>');
    var host=byId("ejsHost"); host.innerHTML="";
    byId("plLoading").style.display="flex"; setLoad("LOADING CORE…");

    var romUrl = game.url ? "app://recalbox/"+game.url : game.blobUrl;
    window.EJS_player = "#ejsHost";
    window.EJS_gameName = game.name;
    window.EJS_gameUrl = romUrl;
    window.EJS_core = sys.core;
    window.EJS_pathtodata = "data/";
    window.EJS_startOnLoaded = true;
    window.EJS_threads = !!sys.threads;
    window.EJS_DEBUG_XX = true;
    window.EJS_askBeforeExit = false;
    window.EJS_onExit = function(){ stopGame(true); };
    window.EJS_ready = function(){ setTimeout(function(){ byId("plLoading").style.display="none"; },300); };
    window.EJS_onGameStart = function(){ byId("plLoading").style.display="none"; };

    var s=document.createElement("script");
    s.src="data/loader.js";
    s.onerror=function(){ toast("&#9888; EMULATOR CORE COULD NOT LOAD"); };
    document.head.appendChild(s);
  }

  function stopGame(returnLibrary){
    try{
      if(window.EJS_emulator){ window.EJS_emulator.destroy(); }
    }catch(e){}
    window.EJS_emulator=null;
    // remove previously injected loader scripts so a fresh one is created next time
    document.querySelectorAll('script[src="data/loader.js"]').forEach(function(s){ s.parentNode.removeChild(s); });
    byId("ejsHost").innerHTML="";
    byId("plLoading").style.display="none";
    byId("player").classList.remove("active");
    if(returnLibrary!==false) byId("library").classList.add("active");
  }
  byId("plBack").addEventListener("click",function(){ stopGame(); });
  document.addEventListener("keydown",function(e){
    if(e.key==="Escape" && byId("player").classList.contains("active")) stopGame();
  });

  console.log("RECALBOX OS WEB READY");
})();
