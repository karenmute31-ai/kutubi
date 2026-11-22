/* داخل تطبيق أندرويد (Capacitor): لو نطق النظام في الـ WebView فاضي، استخدم إضافة النطق الأصلية */
(function(){
  try{
    if(!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) return;
    var nativeSynth = window.speechSynthesis, hasNative = false;
    try{ hasNative = !!(nativeSynth && nativeSynth.getVoices && nativeSynth.getVoices().length); }catch(e){}
    if(hasNative) return;
    var T = window.Capacitor.Plugins && window.Capacitor.Plugins.TextToSpeech;
    if(!T || !T.speak) return;
    if(typeof window.SpeechSynthesisUtterance !== "function"){
      window.SpeechSynthesisUtterance = function(text){ this.text = text != null ? String(text) : ""; this.lang = ""; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; };
    }
    var voicesCache = [], token = null;
    var shim = {
      paused:false, speaking:false, pending:false, onvoiceschanged:null,
      getVoices:function(){ return voicesCache; },
      speak:function(u){
        if(!u) return;
        shim.cancel();
        var mine = token = {};
        shim.speaking = true;
        var opts = { text:String(u.text||"").slice(0,3900), lang:(u.lang || (u.voice && u.voice.lang) || "ar-EG"), rate:u.rate || 1, pitch:u.pitch || 1, volume:(u.volume == null ? 1 : u.volume), category:"playback" };
        if(u.voice){ for(var i=0;i<voicesCache.length;i++){ if(voicesCache[i].voiceURI === u.voice.voiceURI){ opts.voice = i; break; } } }
        T.speak(opts).then(function(){
          if(token !== mine) return; shim.speaking = false;
          if(u.onend) try{ u.onend({target:u}); }catch(e){}
        }).catch(function(err){
          if(token !== mine) return; shim.speaking = false;
          if(u.onerror) try{ u.onerror({target:u, error:(err && err.message) || "canceled"}); }catch(e){}
          else if(u.onend) try{ u.onend({target:u}); }catch(e){}
        });
        if(u.onstart) setTimeout(function(){ if(token === mine) try{ u.onstart({target:u}); }catch(e){} }, 60);
      },
      cancel:function(){ token = null; shim.speaking = false; shim.paused = false; try{ var p = T.stop(); if(p && p.catch) p.catch(function(){}); }catch(e){} },
      pause:function(){ shim.cancel(); }, /* الإضافة مافيهاش إيقاف مؤقت حقيقي على أندرويد */
      resume:function(){},
      addEventListener:function(t,f){ if(t === "voiceschanged") shim.onvoiceschanged = f; },
      removeEventListener:function(t){ if(t === "voiceschanged") shim.onvoiceschanged = null; }
    };
    Object.defineProperty(window, "speechSynthesis", { configurable:true, get:function(){ return shim; } });
    function loadVoices(){
      T.getSupportedVoices().then(function(res){
        var list = (res && res.voices) || [];
        voicesCache = list.map(function(v,i){
          return { voiceURI:v.voiceURI || String(i), name:v.name || v.voiceURI || ("صوت "+(i+1)), lang:String(v.lang || "").replace("_","-"), "default":!!v["default"], localService:true };
        });
        try{ if(shim.onvoiceschanged) shim.onvoiceschanged(); }catch(e){}
      }).catch(function(){});
    }
    loadVoices(); setTimeout(loadVoices, 1500);
  }catch(e){}
})();
