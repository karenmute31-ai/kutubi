(function(root, factory){
  var api = factory();
  if(typeof module === "object" && module.exports) module.exports = api;
  if(root) root.PdfText = api;
})(typeof self !== "undefined" ? self : (typeof globalThis !== "undefined" ? globalThis : this), function(){
  "use strict";

  /* حركات وتشكيل عربي: عنصر كله حركات بيلزق في اللي قبله من غير مسافة (وإلا بتدخل مسافة جوه الكلمة) */
  var MARKS_ONLY = /^[\u064B-\u065F\u0670\u06D6-\u06ED]+$/;
  var ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
  var ARABIC_GLOBAL = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  var LATIN = /[A-Za-z]/;
  var LATIN_GLOBAL = /[A-Za-z]/g;
  var DIGITS = /[0-9\u0660-\u0669\u06F0-\u06F9]/;
  var DIGITS_ONLY = /^[0-9\u0660-\u0669\u06F0-\u06F9]+$/;

  function classify(str){
    var s = String(str == null ? "" : str);
    if(ARABIC.test(s)) return "A";
    if(/[A-Za-z0-9]/.test(s)) return "L";
    return "N";
  }

  function numberOr(value, fallback){
    return typeof value === "number" && isFinite(value) ? value : fallback;
  }

  function prepareItems(items){
    return (Array.isArray(items) ? items : []).filter(function(item){
      return item && item.str !== "";
    }).map(function(item, index){
      var t = Array.isArray(item.transform) ? item.transform : [];
      var a = numberOr(t[0], 0);
      var b = numberOr(t[1], 0);
      var h = numberOr(item.height, 0) || Math.abs(numberOr(t[3], 0)) || 10;
      var x = numberOr(t[4], 0);
      var y = numberOr(t[5], 0);
      var width = numberOr(item.width, 0);
      var str = String(item.str);
      var trimmed = str.trim();
      if(trimmed && MARKS_ONLY.test(trimmed)) str = trimmed; /* حركات بمسافات حواليها: تتلزق من غير مسافة */
      return { item: item, str: str, x: x, y: y, width: width, h: h, rotated: Math.abs(b) > 0.2 * Math.abs(a), index: index };
    });
  }

  function trimLines(lines){
    return lines.map(function(line){ return line.trim(); }).filter(Boolean);
  }

  function legacyLines(items){
    var lines = [], current = [];
    items.forEach(function(entry){
      current.push(entry.str);
      if(entry.item.hasEOL){
        lines.push(current.join(" "));
        current = [];
      }
    });
    if(current.length) lines.push(current.join(" "));
    return trimLines(lines);
  }

  function nonIncreasingStream(items){
    if(items.length < 2) return true;
    var good = 0;
    for(var i = 1; i < items.length; i++){
      var tolerance = 0.5 * Math.max(items[i - 1].h, items[i].h);
      if(items[i].y <= items[i - 1].y + tolerance) good++;
    }
    return good / (items.length - 1) >= 0.9;
  }

  function sameLine(item, first){
    return Math.abs(item.y - first.y) <= 0.45 * Math.max(item.h, first.h);
  }

  function makeLines(items){
    if(!items.length) return [];
    if(nonIncreasingStream(items)){
      var sorted = items.slice().sort(function(a, b){
        if(b.y !== a.y) return b.y - a.y;
        return a.index - b.index;
      });
      var lines = [];
      sorted.forEach(function(entry){
        var last = lines[lines.length - 1];
        if(!last || !sameLine(entry, last[0])) lines.push([entry]);
        else last.push(entry);
      });
      return lines;
    }

    var streamLines = [], current = [], first = null;
    items.forEach(function(entry){
      if(!first || !sameLine(entry, first)){
        if(current.length) streamLines.push(current);
        current = [entry];
        first = entry;
      }else{
        current.push(entry);
      }
    });
    if(current.length) streamLines.push(current);
    return streamLines;
  }

  function directionOf(items){
    var arabicCount = 0, latinCount = 0;
    var hasArabicBeforeLatin = false, hasArabicAfterLatin = false;
    var sawLatin = false;
    items.forEach(function(entry){
      var a = entry.str.match(ARABIC_GLOBAL);
      var l = entry.str.match(LATIN_GLOBAL);
      var arabic = a ? a.length : 0;
      var latin = l ? l.length : 0;
      arabicCount += arabic;
      latinCount += latin;
      if(arabic && sawLatin) hasArabicAfterLatin = true;
      if(arabic && !sawLatin && latinCount === 0) hasArabicBeforeLatin = true;
      if(latin) sawLatin = true;
    });
    if(arabicCount > latinCount) return "rtl";
    /* A Latin phrase bracketed by Arabic items is an embedded RTL run. */
    if(arabicCount && latinCount && hasArabicBeforeLatin && hasArabicAfterLatin) return "rtl";
    return "ltr";
  }

  function visualOrder(items, direction){
    return items.slice().sort(function(a, b){
      if(a.x !== b.x) return direction === "rtl" ? b.x - a.x : a.x - b.x;
      return a.index - b.index;
    });
  }

  function spacingFlags(items, direction){
    var flags = [];
    for(var i = 0; i + 1 < items.length; i++){
      var previous = items[i], current = items[i + 1];
      var gap = direction === "rtl"
        ? previous.x - (current.x + current.width)
        : current.x - (previous.x + previous.width);
      var explicitSpace = /\s$/.test(previous.str) || /^\s/.test(current.str);
      flags.push(!explicitSpace && !MARKS_ONLY.test(current.str) && gap > 0.15 * Math.max(previous.h, current.h));
    }
    return flags;
  }

  function reverseLatinRuns(items, flags){
    var outItems = items.slice();
    var outFlags = flags.slice();
    var classes = items.map(function(entry){ return classify(entry.str); });
    var cursor = 0;
    while(cursor < items.length){
      var start = cursor;
      while(start < items.length && classes[start] !== "L") start++;
      if(start >= items.length) break;
      var lastLatin = start;
      var end = start + 1;
      while(end < items.length && (classes[end] === "L" || classes[end] === "N")){
        if(classes[end] === "L") lastLatin = end;
        end++;
      }
      if(lastLatin > start){
        var runEnd = lastLatin;
        outItems.splice(start, runEnd - start + 1, ...items.slice(start, runEnd + 1).reverse());
        outFlags.splice(start, runEnd - start, ...flags.slice(start, runEnd).reverse());
      }
      cursor = Math.max(end, start + 1);
    }
    return {items: outItems, flags: outFlags};
  }

  function renderLine(lineItems){
    var direction = directionOf(lineItems);
    var ordered = visualOrder(lineItems, direction);
    var flags = spacingFlags(ordered, direction);
    if(direction === "rtl"){
      var reversed = reverseLatinRuns(ordered, flags);
      ordered = reversed.items;
      flags = reversed.flags;
    }
    var out = "";
    ordered.forEach(function(entry, index){
      if(index > 0 && flags[index - 1]) out += " ";
      out += entry.str;
    });
    return out.trim();
  }

  function itemsToLines(items){
    var prepared = prepareItems(items);
    if(!prepared.length) return [];
    var rotated = prepared.filter(function(entry){ return entry.rotated; }).length;
    if(rotated / prepared.length > 0.2) return legacyLines(prepared);
    return trimLines(makeLines(prepared).map(renderLine));
  }


  /* رباطات الشدة مع الحركات (U+FC5E–FC63, U+FCF2–FCF4): تفكيك NFKC بتاعها بيحط مسافة/تطويل غلط
     جوه الكلمة («تُقد ِّم»)، فبنفكها بالترتيب الصح: شدة ثم حركة */
  var SHADDA_LIGS = {"\uFC5E":"\u0651\u064C","\uFC5F":"\u0651\u064D","\uFC60":"\u0651\u064E","\uFC61":"\u0651\u064F","\uFC62":"\u0651\u0650","\uFC63":"\u0651\u0670","\uFCF2":"\u0651\u064E","\uFCF3":"\u0651\u064F","\uFCF4":"\u0651\u0650"};
  /* فك أشكال العرض + إرجاع الحركات المنفصلة لكلمتها: بعض الملفات بتحط الحركة بعد مسافة
     («بلغة ٍجزلة») والصح إنها على آخر حرف في الكلمة اللي قبلها («بلغةٍ جزلة») */
  function expandText(t){
    t = String(t == null ? "" : t);
    t = t.replace(/[\uFC5E-\uFC63\uFCF2-\uFCF4]/g, function(c){ return SHADDA_LIGS[c] || c; });
    if(/[\uFB50-\uFDFF\uFE70-\uFEFF]/.test(t)) t = t.normalize("NFKC");
    t = t.replace(/(\S) +([\u064B-\u0652\u0670\u06D6-\u06ED]+)/g, "$1$2 ");
    return t;
  }

  function normLine(line){
    return String(line == null ? "" : line)
      .replace(/[0-9\u0660-\u0669\u06F0-\u06F9]/g, "#")
      .replace(/\u0640/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function nonEmptyIndices(lines){
    var result = [];
    lines.forEach(function(line, index){
      if(String(line == null ? "" : line).trim()) result.push(index);
    });
    return result;
  }

  function stripRunningHeaders(pagesLines){
    var pages = Array.isArray(pagesLines) ? pagesLines : [];
    var zero = {headers: 0, footers: 0, pageNums: 0};
    if(pages.length < 4) return {pages: pages, stats: zero};

    var candidateInfo = pages.map(function(page){
      var lines = Array.isArray(page) ? page : [];
      var nonEmpty = nonEmptyIndices(lines);
      var top = new Set(nonEmpty.slice(0, 2));
      var bottom = new Set(nonEmpty.slice(-2));
      var candidates = new Set(Array.from(top).concat(Array.from(bottom)));
      return {lines: lines, top: top, bottom: bottom, candidates: candidates};
    });
    var threshold = Math.max(3, Math.ceil(0.3 * pages.length));
    var seenOnPages = Object.create(null);
    candidateInfo.forEach(function(info){
      var onPage = Object.create(null);
      info.candidates.forEach(function(index){
        var key = normLine(info.lines[index]);
        if(!key || onPage[key]) return;
        onPage[key] = true;
        if(!seenOnPages[key]) seenOnPages[key] = new Set();
        seenOnPages[key].add(candidateInfo.indexOf(info));
      });
    });
    var repeated = Object.create(null);
    Object.keys(seenOnPages).forEach(function(key){
      if(seenOnPages[key].size >= threshold) repeated[key] = true;
    });

    var stats = {headers: 0, footers: 0, pageNums: 0};
    var result = candidateInfo.map(function(info, pageIndex){
      return info.lines.filter(function(line, lineIndex){
        if(!info.candidates.has(lineIndex)) return true;
        var raw = String(line == null ? "" : line).trim();
        var key = normLine(raw);
        var isPageNum = DIGITS_ONLY.test(raw);
        var remove = !!repeated[key] || isPageNum;
        if(!remove) return true;
        if(info.top.has(lineIndex)) stats.headers++;
        if(info.bottom.has(lineIndex)) stats.footers++;
        if(isPageNum) stats.pageNums++;
        return false;
      });
    });
    return {pages: result, stats: stats};
  }

  function markPage(n){
    var digits = String(n);
    var encoded = "";
    for(var i = 0; i < digits.length; i++){
      if(/[0-9]/.test(digits[i])) encoded += String.fromCharCode(0xE100 + Number(digits[i]));
    }
    return "\uE000" + encoded + "\uE001";
  }

  function stripMarkers(s){
    return String(s == null ? "" : s).replace(/[\uE000-\uE1FF]/g, "");
  }

  function readMarkers(s){
    var text = String(s == null ? "" : s);
    var re = /\uE000([\uE100-\uE109]+)\uE001/g;
    var first = null, last = null, match;
    while((match = re.exec(text))){
      var digits = "";
      for(var i = 0; i < match[1].length; i++) digits += String(match[1].charCodeAt(i) - 0xE100);
      var page = Number(digits);
      if(!isFinite(page)) continue;
      if(first === null) first = page;
      last = page;
    }
    return {first: first, last: last};
  }

  return {
    classify: classify,
    itemsToLines: itemsToLines,
    expandText: expandText,
    normLine: normLine,
    stripRunningHeaders: stripRunningHeaders,
    markPage: markPage,
    stripMarkers: stripMarkers,
    readMarkers: readMarkers
  };
});