/* داخل تطبيق أندرويد (Capacitor): لو نطق النظام في الـ WebView فاضي، استخدم إضافة النطق الأصلية */
(function(){
  try{
    if(!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) return;
    var nativeSynth = window.speechSynthesis, hasNative = false;
    try{ hasNative = !!(nativeSynth && nativeSynth.getVoices && nativeSynth.getVoices().length); }catch(e){}
    if(hasNative) return;
    var T = window.Capacitor.Plugins && window.Capacitor.Plugins.TextToSpeech;
    if(!T || !T.speak) return;
    // The native bridge voices are plain records, not SpeechSynthesisVoice.
    // Always use a bridge utterance to avoid browser voice-setter TypeErrors.
    {
      window.SpeechSynthesisUtterance = function(text){ this.text = text != null ? String(text) : ""; this.lang = ""; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; };
    }
    // Notify listeners on real browser utterances, or property handlers on the
    // lightweight fallback. read-aloud uses listeners, the player uses onend.
    function emit(u, type, extra) {
      var data = Object.assign({utterance:u, charIndex:0, elapsedTime:0}, extra || {});
      if(typeof u.dispatchEvent === "function") {
        var event;
        try { event = type === "error" ? new SpeechSynthesisErrorEvent(type, data) : new SpeechSynthesisEvent(type, data); }
        catch(e) { event = new Event(type); Object.keys(data).forEach(function(k){ Object.defineProperty(event,k,{value:data[k]}); }); }
        u.dispatchEvent(event);
      } else if(typeof u["on"+type] === "function") u["on"+type](Object.assign({target:u,type:type},data));
    }
    var voicesCache = [], token = null, activeUtterance = null;
    function cancelNative(){ token = null; activeUtterance = null; shim.speaking = false; shim.paused = false; try{ var p = T.stop(); if(p && p.catch) p.catch(function(){}); }catch(e){} }
    var shim = {
      paused:false, speaking:false, pending:false, onvoiceschanged:null,
      getVoices:function(){ return voicesCache; },
      speak:function(u){
        if(!u) return;
        cancelNative();
        activeUtterance = u;
        var mine = token = {};
        shim.speaking = true;
        var opts = { text:String(u.text||"").slice(0,3900), lang:(u.lang || (u.voice && u.voice.lang) || "ar-EG"), rate:u.rate || 1, pitch:u.pitch || 1, volume:(u.volume == null ? 1 : u.volume), category:"playback" };
        if(u.voice){ for(var i=0;i<voicesCache.length;i++){ if(voicesCache[i].voiceURI === u.voice.voiceURI){ opts.voice = i; break; } } }
        T.speak(opts).then(function(){
          if(token !== mine) return; shim.speaking = false; activeUtterance = null;
          try{ emit(u,"end"); }catch(e){}
        }).catch(function(err){
          if(token !== mine) return; shim.speaking = false; activeUtterance = null;
          try{ emit(u,"error",{error:(err && err.message) || "synthesis-failed"}); }catch(e){}
        });
        try{ emit(u,"start"); }catch(e){}
      },
      cancel:cancelNative,
      pause:function(){
        if(!activeUtterance || shim.paused) return;
        token = null; shim.paused = true; shim.speaking = true;
        try{ var p = T.stop(); if(p && p.catch) p.catch(function(){}); }catch(e){}
        try{ emit(activeUtterance,"pause"); }catch(e){}
      },
      /* Android's engine has no exact pause position. Resume replays the current utterance, never silently no-ops. */
      resume:function(){ if(!shim.paused || !activeUtterance) return; var u = activeUtterance; shim.paused = false; shim.speak(u); },
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
