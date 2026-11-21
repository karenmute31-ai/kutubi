#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function usage() {
  console.error('Usage: node tools/anchor-edit.js <file> <mode> <anchorFile> [replacementFile]');
  console.error('Modes: replace, after, before, cut');
  process.exit(1);
}

function detectEol(buf) {
  // buf is Buffer
  let crlf = 0;
  let loneLf = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0d && i + 1 < buf.length && buf[i + 1] === 0x0a) {
      crlf++;
      i++;
    } else if (buf[i] === 0x0a) {
      loneLf++;
    }
  }
  return crlf >= loneLf ? '\r\n' : '\n';
}

function normalizeToEol(s, eol) {
  // convert all line endings in s to eol
  return s.replace(/\r\n|\r|\n/g, eol);
}

function countOccurrences(haystack, needle) {
  if (needle.length === 0) return 0;
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    count++;
    pos = idx + needle.length;
  }
  return count;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) usage();
  const filePath = args[0];
  const mode = args[1];
  const anchorFile = args[2];
  const replacementFile = args[3];

  if (!['replace', 'after', 'before', 'cut'].includes(mode)) {
    console.error('Unknown mode: ' + mode);
    process.exit(1);
  }

  const absFile = path.resolve(filePath);
  if (!fs.existsSync(absFile)) {
    console.error('File not found: ' + absFile);
    process.exit(1);
  }

  const origBuf = fs.readFileSync(absFile);
  const eol = detectEol(origBuf);
  const content = origBuf.toString('utf8');

  const anchorRaw = fs.readFileSync(path.resolve(anchorFile), 'utf8');

  let newContent;
  const beforeBytes = origBuf.length;

  if (mode === 'cut') {
    const sepRe = /\r?\n-----8<-----\r?\n/;
    const m = anchorRaw.match(sepRe);
    if (!m) {
      console.error('CUT mode: separator line "-----8<-----" not found in anchorFile');
      process.exit(1);
    }
    const sepIdx = m.index;
    const part1Raw = anchorRaw.slice(0, sepIdx);
    const part2Raw = anchorRaw.slice(sepIdx + m[0].length);
    const part1 = normalizeToEol(part1Raw, eol);
    const part2 = normalizeToEol(part2Raw, eol);

    const c1 = countOccurrences(content, part1);
    const c2 = countOccurrences(content, part2);
    if (c1 !== 1) {
      console.error('CUT part1 match count: ' + c1 + ' (expected 1)');
      process.exit(1);
    }
    if (c2 !== 1) {
      console.error('CUT part2 match count: ' + c2 + ' (expected 1)');
      process.exit(1);
    }
    const start = content.indexOf(part1);
    const endStart = content.indexOf(part2);
    if (endStart < start) {
      console.error('CUT: part1 occurs after part2');
      process.exit(1);
    }
    const end = endStart + part2.length;
    newContent = content.slice(0, start) + content.slice(end);
  } else {
    if (!replacementFile) {
      console.error('Mode ' + mode + ' requires replacementFile');
      process.exit(1);
    }
    const replacementRaw = fs.readFileSync(path.resolve(replacementFile), 'utf8');
    const anchor = normalizeToEol(anchorRaw, eol);
    const replacement = normalizeToEol(replacementRaw, eol);
    const count = countOccurrences(content, anchor);
    if (count !== 1) {
      console.error('Anchor match count: ' + count + ' (expected 1)');
      process.exit(1);
    }
    const idx = content.indexOf(anchor);
    if (mode === 'replace') {
      newContent = content.slice(0, idx) + replacement + content.slice(idx + anchor.length);
    } else if (mode === 'after') {
      newContent = content.slice(0, idx + anchor.length) + replacement + content.slice(idx + anchor.length);
    } else if (mode === 'before') {
      newContent = content.slice(0, idx) + replacement + content.slice(idx);
    }
  }

  const newBuf = Buffer.from(newContent, 'utf8');
  fs.writeFileSync(absFile, newBuf);
  const delta = newBuf.length - beforeBytes;
  console.log('OK delta=' + delta);
}

main();