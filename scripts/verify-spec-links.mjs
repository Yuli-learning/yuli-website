#!/usr/bin/env node
/**
 * verify-spec-links.mjs — Validate and enrich data/spec-links.json
 * - Follows redirects
 * - Checks HTTP status
 * - Validates domain matches board
 * - Checks page title contains subject/level keywords
 * - Writes back health metadata per link: { lastChecked, status, finalUrl }
 *
 * Usage:
 *   node scripts/verify-spec-links.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'spec-links.json');

const BOARD_DOMAIN = {
  'AQA': ['aqa.org.uk'],
  'Pearson Edexcel': ['qualifications.pearson.com'],
  'OCR': ['ocr.org.uk'],
  'WJEC/Eduqas': ['eduqas.co.uk', 'wjec.co.uk'],
  'CCEA': ['ccea.org.uk'],
  'CIE': ['cambridgeinternational.org', 'cie.org.uk'],
};

const SLEEP_MS = 150; // small delay to be polite
const TIMEOUT_MS = 15000;

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function normalizeLevelToken(level) {
  if (!level) return '';
  const s = String(level).toLowerCase();
  if (s.includes('a')) return 'a level';
  if (s.includes('gcse')) return 'gcse';
  return s;
}

function buildTitleChecks(subject, level) {
  const subj = String(subject || '').toLowerCase();
  const lvl = normalizeLevelToken(level);
  const alts = new Set([subj]);
  // very light aliasing
  if (subj === 'math' || subj === 'maths') { alts.add('math'); alts.add('maths'); alts.add('mathematics'); }
  if (subj === 'english') { alts.add('english language'); alts.add('english literature'); }
  return { subjectAlts: Array.from(alts), level: lvl };
}

function allowedDomainFor(board){ return BOARD_DOMAIN[board] || []; }

function getHostname(u) { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return ''; } }

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(()=>ctrl.abort(), opts.timeout || TIMEOUT_MS);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': 'YuliLinkVerifier/1.0' }, ...opts });
    return res;
  } finally { clearTimeout(id); }
}

async function getPageTitle(url) {
  try {
    const res = await fetchWithTimeout(url, { method: 'GET' });
    if (!res.ok) return { ok: false, status: res.status, finalUrl: res.url, title: '' };
    const html = await res.text();
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = m ? m[1].trim() : '';
    return { ok: true, status: res.status, finalUrl: res.url, title };
  } catch (e) {
    return { ok: false, status: 0, finalUrl: url, title: '' };
  }
}

function titleLooksRight(title, subject, level, board) {
  const t = String(title || '').toLowerCase();
  const { subjectAlts, level: lvl } = buildTitleChecks(subject, level);
  const subjOk = subjectAlts.some(s => t.includes(s));
  let lvlOk = !lvl || t.includes(lvl.replace('-', ' '));
  // Accept IGCSE for CIE when level is GCSE
  if (!lvlOk && lvl === 'gcse' && board === 'CIE') {
    if (t.includes('igcse')) lvlOk = true;
  }
  return subjOk && lvlOk;
}

function ensureObjectEntry(val, boardKey) {
  if (val && typeof val === 'object') return { obj: val, changed: false };
  return { obj: { url: String(val || '') }, changed: true };
}

async function verifyLink(board, subject, level, linkVal) {
  const { obj, changed } = ensureObjectEntry(linkVal, board);
  const url = obj.url || '';
  const result = { ...obj };
  if (!url) {
    result.status = 'broken';
    result.lastChecked = new Date().toISOString();
    return { result, changed: changed || true };
  }

  // Status + title fetch
  const page = await getPageTitle(url);
  const finalHost = getHostname(page.finalUrl || url);
  const allowed = allowedDomainFor(board);
  const domainOk = allowed.length === 0 || allowed.includes(finalHost);
  const looksOk = page.ok && domainOk && titleLooksRight(page.title, subject, level, board);

  result.status = looksOk ? 'ok' : 'broken';
  result.lastChecked = new Date().toISOString();
  if (page.finalUrl && page.finalUrl !== url) result.finalUrl = page.finalUrl;
  return { result, changed: true };
}

async function main() {
  const raw = await fs.readFile(DATA_PATH, 'utf8');
  /** @type {Record<string, any>} */
  const data = JSON.parse(raw);

  let total = 0, ok = 0, broken = 0, mutated = false;

  const subjects = Object.keys(data);
  for (const subject of subjects) {
    if (subject === '_comment') continue;
    const levels = data[subject] || {};
    for (const level of Object.keys(levels)) {
      const boards = levels[level];
      if (Array.isArray(boards)) {
        // Array form: [{ board, url }]
        const updatedArr = [];
        for (const item of boards) {
          const boardName = item && typeof item === 'object' ? item.board : '';
          total++;
          await sleep(SLEEP_MS);
          try {
            const { result } = await verifyLink(boardName, subject, level, item);
            // Preserve original item shape and add health fields
            const merged = { ...item, status: result.status, lastChecked: result.lastChecked };
            if (result.finalUrl) merged.finalUrl = result.finalUrl;
            updatedArr.push(merged);
            if (result.status === 'ok') ok++; else broken++;
          } catch (e) {
            const fallback = { ...item, status: 'broken', lastChecked: new Date().toISOString() };
            updatedArr.push(fallback);
            broken++;
          }
        }
        data[subject][level] = updatedArr;
        mutated = true;
      } else if (boards && typeof boards === 'object') {
        // Object map form: { AQA: {url}, ... }
        const updated = {};
        for (const [board, val] of Object.entries(boards)) {
          total++;
          await sleep(SLEEP_MS);
          try {
            const { result } = await verifyLink(board, subject, level, val);
            updated[board] = result;
            if (result.status === 'ok') ok++; else broken++;
          } catch (e) {
            const { obj } = ensureObjectEntry(val, board);
            obj.status = 'broken';
            obj.lastChecked = new Date().toISOString();
            updated[board] = obj;
            broken++;
          }
        }
        data[subject][level] = updated;
        mutated = true;
      }
    }
  }

  if (mutated) {
    await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
  }

  console.log(`Checked ${total} links → OK: ${ok}, Broken: ${broken}`);
  if (broken > 0) {
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('Verifier failed:', err);
  process.exit(1);
});
