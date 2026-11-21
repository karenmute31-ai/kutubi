'use strict';

const assert = require('assert');
const PdfText = require('../pdftext.js');

let checks = 0;
let failures = 0;
function check(label, actual, expected) {
  checks++;
  try {
    assert.deepStrictEqual(actual, expected);
    console.log('ok   ' + label);
  } catch (e) {
    failures++;
    console.log('FAIL ' + label + ' - actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected));
  }
}
function item(str, x, y, w, extra) {
  return Object.assign({str, transform: [10, 0, 0, 10, x, y], width: w, height: 10}, extra || {});
}

// a) adjacent Arabic fragments with no visual gap
check('a Arabic fragments without gap', PdfText.itemsToLines([
  item('القر', 200, 700, 30), item('اصنة', 170, 700, 30)
]), ['القراصنة']);

// b) the same fragments with a real visual gap
check('b Arabic fragments with gap', PdfText.itemsToLines([
  item('القر', 200, 700, 30), item('اصنة', 166, 700, 30)
]), ['القر اصنة']);

// c) Arabic line containing an embedded Latin run
check('c mixed Arabic and Latin run', PdfText.itemsToLines([
  item('هجمة', 300, 700, 40),
  item('Man', 150, 700, 18), item('in', 172, 700, 8),
  item('the', 184, 700, 12), item('middle', 200, 700, 30),
  item('ويسمي', 60, 700, 50)
]), ['هجمة Man in the middle ويسمي']);

// d) repeated running header + page-number footer; body lines are unique
const sixPages = [];
const bodyWords = ['الفجر', 'الظهر', 'العصر', 'المغرب', 'العشاء', 'السحر'];
for(let n = 11; n <= 16; n++){
  const word = bodyWords[n - 11];
  sixPages.push([
    'أساسيات الأمن السيبراني إعداد أسامة ' + n,
    'جسم الصفحة ' + word + ' السطر الأول الفريد',
    'جسم الصفحة ' + word + ' السطر الثاني الفريد',
    String(n)
  ]);
}
const stripped = PdfText.stripRunningHeaders(sixPages);
check('d repeated headers and digit footers removed', stripped.pages, [
  ['جسم الصفحة الفجر السطر الأول الفريد', 'جسم الصفحة الفجر السطر الثاني الفريد'],
  ['جسم الصفحة الظهر السطر الأول الفريد', 'جسم الصفحة الظهر السطر الثاني الفريد'],
  ['جسم الصفحة العصر السطر الأول الفريد', 'جسم الصفحة العصر السطر الثاني الفريد'],
  ['جسم الصفحة المغرب السطر الأول الفريد', 'جسم الصفحة المغرب السطر الثاني الفريد'],
  ['جسم الصفحة العشاء السطر الأول الفريد', 'جسم الصفحة العشاء السطر الثاني الفريد'],
  ['جسم الصفحة السحر السطر الأول الفريد', 'جسم الصفحة السحر السطر الثاني الفريد']
]);
check('d header footer page-number stats', stripped.stats, {headers: 6, footers: 6, pageNums: 6});
const threePages = sixPages.slice(0, 3);
const threeResult = PdfText.stripRunningHeaders(threePages);
check('d three-page input is returned unchanged', threeResult.pages === threePages && threeResult.stats, {headers: 0, footers: 0, pageNums: 0});

// e) multi-column stream order must not be merged by equal y
check('e multi-column stream order', PdfText.itemsToLines([
  item('عمود1 سطر1', 100, 700, 50), item('عمود1 سطر2', 100, 680, 50),
  item('عمود2 سطر1', 300, 700, 50), item('عمود2 سطر2', 300, 680, 50)
]), ['عمود1 سطر1', 'عمود1 سطر2', 'عمود2 سطر1', 'عمود2 سطر2']);

// f) private-use page markers, including an incomplete marker
check('f markPage/readMarkers round trip', PdfText.readMarkers(PdfText.markPage(12)), {first: 12, last: 12});
check('f first and last marker', PdfText.readMarkers(PdfText.markPage(12) + 'نص' + PdfText.markPage(13)), {first: 12, last: 13});
let halfResult;
let halfThrew = false;
try { halfResult = PdfText.readMarkers('\uE000\uE101'); } catch (e) { halfThrew = true; }
check('f incomplete marker is tolerated', halfThrew ? 'THREW' : halfResult, {first: null, last: null});
const strippedMarkers = PdfText.stripMarkers('قبل' + PdfText.markPage(12) + 'بعد');
check('f stripMarkers removes every marker code point', /[\uE000-\uE1FF]/.test(strippedMarkers), false);

// g) rotated content takes the legacy hasEOL-aware path
check('g rotated legacy path', PdfText.itemsToLines([
  item('أول', 10, 700, 20, {transform: [10, 10, 0, 10, 10, 700]}),
  item('ثاني', 40, 700, 20, {transform: [10, 10, 0, 10, 40, 700], hasEOL: true}),
  item('ثالث', 70, 700, 20, {transform: [10, 10, 0, 10, 70, 700]})
]), ['أول ثاني', 'ثالث']);

// h) normalization and classification
check('h normLine digit normalization', PdfText.normLine('أساسيات الأمن السيبراني إعداد أسامة 11'), PdfText.normLine('أساسيات الأمن السيبراني إعداد أسامة 12'));
check('h classify Latin', PdfText.classify('abc'), 'L');
check('h classify Arabic', PdfText.classify('ابت'), 'A');
check('h classify digits', PdfText.classify('12'), 'L');
check('h classify whitespace', PdfText.classify(' '), 'N');

// i) stray Latin-extended garbage inside otherwise clean Arabic (WinAnsi subset fonts with a bad ToUnicode map)
var cleanAr = 'الضوابط الأساسية للأمن السيبراني تحدد متطلبات حماية المعلومات والأنظمة في الجهات الوطنية. '.repeat(12);
check('i clean Arabic not flagged', PdfText.brokenArabicEncoding(cleanAr), false);
var dirtyAr = cleanAr + ' ǵŴĳŖǔ ĪťŉŁũ őĝŚŻ ŔǺȊȡ ǵŴĳŖǔ ĪťŉŁũ őĝŚŻ ŔǺȊȡ ǵŴĳŖǔ '.repeat(3);
check('i stray Latin-extended flagged', PdfText.brokenArabicEncoding(dirtyAr), true);
check('i a few accented names not flagged', PdfText.brokenArabicEncoding(cleanAr + ' José Müller'), false);

console.log('pdf-text guard: ' + (checks - failures) + '/' + checks + ' passed');
process.exit(failures ? 1 : 0);