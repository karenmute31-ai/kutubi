/* Read-aloud sentence tracking. Native speech start/end drive every change.
   Kept separate from the reader and audio engines. No DOM text rewriting. */
(function () {
  "use strict";
  if (!window.speechSynthesis || !window.CSS || !CSS.highlights || typeof Highlight === "undefined") return;
  var synth = window.speechSynthesis;
  var nativeSpeak = synth.speak.bind(synth), nativeCancel = synth.cancel.bind(synth);
  var generation = 0, selected = null, cursor = null, current = null;
  function clear() { current = null; CSS.highlights.delete("read-aloud"); }
  document.addEventListener("selectionchange", function () {
    var s = getSelection(), root = (document.getElementById("readerBody") || document.getElementById("chunks"));
    if (s && s.rangeCount && !s.isCollapsed && root && root.contains(s.getRangeAt(0).commonAncestorContainer)) selected = s.getRangeAt(0).cloneRange();
  });
  function locate(u) {
    var box, item, root = (document.getElementById("readerBody") || document.getElementById("chunks"));
    if (!root || !u.text.trim()) return null;
    try {
      if (typeof playChain !== "undefined" && playChain) {
        item = playChain.items[playChain.idx];
        if (item && item.chunkIdx != null && /^(orig|trans)$/.test(item.kind)) box = document.querySelector("#chunk-" + item.chunkIdx + " [data-role='" + item.kind + "']") || document.querySelector("#chunk-" + item.chunkIdx + " ." + item.kind);
      }
      if (!box && typeof playing !== "undefined" && playing && typeof playIdx !== "undefined" && /^(orig|trans)$/.test(listenKind)) box = root.querySelector('.chunk[data-idx="' + playIdx + '"] .' + listenKind);
    } catch (e) {}
    if (box) {
      var text = box.textContent, from = cursor && cursor.box === box ? cursor.end : 0;
      var at = text.indexOf(u.text, from);
      if (at < 0) at = text.indexOf(u.text);
      return at < 0 ? null : {box: box, start: at};
    }
    if (selected && selected.startContainer.isConnected && selected.toString().trim() === u.text.trim()) {
      box = selected.commonAncestorContainer;
      if (box.nodeType === Node.TEXT_NODE) box = box.parentNode;
      var before = document.createRange(); before.selectNodeContents(box); before.setEnd(selected.startContainer, selected.startOffset);
      var offset = before.toString().length + selected.toString().indexOf(u.text.trim());
      return {box: box, start: offset, trim: u.text.indexOf(u.text.trim())};
    }
    // A selection popup may rebuild its DOM before speech starts. Resolve its
    // cached text against the reader, never against controls or popup results.
    var selectionSpeech = false;
    try { selectionSpeech = typeof playChain !== "undefined" && playChain && playChain.label === "تحديد"; } catch (e) {}
    if (selectionSpeech) {
      var boxes = root.querySelectorAll(".orig,.trans");
      for (var i = 0; i < boxes.length; i++) {
        var at = boxes[i].textContent.indexOf(u.text);
        if (at >= 0) return {box: boxes[i], start: at};
      }
    }
    return null;
  }
  function sentences(text, lang) {
    if (typeof Intl.Segmenter === "function") {
      try { return Array.from(new Intl.Segmenter(lang || undefined, {granularity: "sentence"}).segment(text), function (s) { return {text: s.segment, index: s.index}; }).filter(function (s) { return s.text.trim(); }); } catch (e) {}
    }
    var result = [], re = /[^.!?؟۔\n]+(?:[.!?؟۔]+|\n|$)\s*/g, m;
    while ((m = re.exec(text))) if (m[0].trim()) result.push({text: m[0], index: m.index});
    return result.length ? result : [{text: text, index: 0}];
  }
  function paint(location, unit) {
    var box = location.box;
    if (!box.isConnected) { clear(); return; }
    var start = location.start + unit.index - (location.trim || 0), end = start + unit.text.trimEnd().length;
    while (start < end && /\s/.test(box.textContent.charAt(start))) start++;
    var walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT), node, pos = 0, range = document.createRange(), begun = false;
    while ((node = walker.nextNode())) {
      var len = node.nodeValue.length;
      if (!begun && start < pos + len) { range.setStart(node, Math.max(0, start - pos)); begun = true; }
      if (begun && end <= pos + len) { range.setEnd(node, end - pos); break; }
      pos += len;
    }
    if (!begun || !node) { clear(); return; }
    CSS.highlights.set("read-aloud", new Highlight(range));
    cursor = {box: box, end: end};
    var rect = range.getBoundingClientRect();
    if (rect.width && rect.height && (rect.top < 90 || rect.bottom > innerHeight - 100)) {
      var scroller = box.parentElement;
      while (scroller && !(scroller.scrollHeight > scroller.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
      if (scroller) scroller.scrollBy({top: rect.top - innerHeight * 0.35, behavior: "smooth"});
      else window.scrollBy({top: rect.top - innerHeight * 0.35, behavior: "smooth"});
    }
  }
  var root = document.getElementById("readerBody") || document.getElementById("chunks");
  if (root) new MutationObserver(function () {
    if (!current) return;
    var location = locate(current.utterance);
    if (location) paint(location, current.unit);
  }).observe(root, {childList: true, subtree: true});
  function event(u, type, details) {
    var data = Object.assign({utterance: u}, details || {});
    u.dispatchEvent(type === "error" ? new SpeechSynthesisErrorEvent(type, data) : new SpeechSynthesisEvent(type, data));
  }
  synth.speak = function (u) {
    var location = locate(u);
    if (!location) return nativeSpeak(u);
    // Native selection paints over Custom Highlights. Once the text is mapped,
    // dismiss that selection and its popup so the spoken sentence stays visible.
    var selection = getSelection();
    if (selection && !selection.isCollapsed) selection.removeAllRanges();
    var popup = document.getElementById("hlPop");
    if (popup) popup.style.display = "none";
    var token = ++generation, units = sentences(u.text, u.lang), index = 0, elapsed = 0;
    function next() {
      if (token !== generation) return;
      var unit = units[index], part = new SpeechSynthesisUtterance(unit.text);
      part.lang = u.lang; part.voice = u.voice; part.rate = u.rate; part.pitch = u.pitch; part.volume = u.volume;
      part.addEventListener("start", function () {
        if (token !== generation) return;
        current = {utterance: u, unit: unit};
        paint(location, unit);
        if (!index) event(u, "start", {charIndex: 0});
      });
      part.addEventListener("boundary", function (e) {
        if (token === generation) event(u, "boundary", {charIndex: unit.index + e.charIndex, charLength: e.charLength, name: e.name, elapsedTime: elapsed + e.elapsedTime});
      });
      ["pause", "resume"].forEach(function (type) { part.addEventListener(type, function (e) { if (token === generation) event(u, type, {charIndex: unit.index + e.charIndex, elapsedTime: elapsed + e.elapsedTime}); }); });
      part.addEventListener("end", function (e) {
        if (token !== generation) return;
        elapsed += e.elapsedTime || 0;
        if (++index < units.length) next();
        else { clear(); event(u, "end", {charIndex: u.text.length, elapsedTime: elapsed}); }
      });
      part.addEventListener("error", function (e) {
        if (token !== generation) return;
        clear(); event(u, "error", {error: e.error, charIndex: unit.index + e.charIndex});
      });
      nativeSpeak(part);
    }
    next();
  };
  synth.cancel = function () { generation++; cursor = null; clear(); return nativeCancel(); };
  document.addEventListener("visibilitychange", function () { if (!synth.speaking && !synth.pending) clear(); });
})();
