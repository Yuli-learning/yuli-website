/*
 * Yuli sitewide i18n system.
 *
 * Include this script on any page (after <base href="/"> is set) to get:
 *  - A language switcher ("EN | 中文") auto-inserted into the header
 *  - Translation of any element marked with data-i18n / data-i18n-html /
 *    data-i18n-placeholder / data-i18n-aria-label / data-i18n-title /
 *    data-i18n-alt / data-i18n-value
 *  - Persistence of the chosen language via localStorage
 *  - Re-application of translations to content added later (dynamic
 *    JS-rendered UI) via a MutationObserver
 *
 * Usage in HTML:
 *   <h2 data-i18n="home.subjects.heading">Subjects We Teach</h2>
 *   <input data-i18n-placeholder="contact.emailPlaceholder" placeholder="Email">
 *   <span data-i18n-html="home.hero.line1">Real learning means <span class="highlight">understanding</span>,</span>
 *
 * The text already in the HTML is the English fallback, so the page still
 * reads correctly even before the dictionaries finish loading.
 *
 * Other scripts that render content dynamically (e.g. after a fetch) can
 * call `window.YuliI18n.applyTranslations(containerEl)` once new nodes are
 * in the DOM, though the built-in MutationObserver already covers most cases
 * automatically.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'yuli_lang';
  var DEFAULT_LANG = 'en';
  var SUPPORTED_LANGS = ['en', 'zh-CN'];
  // Absolute (root-relative) paths on purpose: this script is included from
  // pages at different folder depths, some with <base href="/"> (e.g.
  // index.html, about.html) and some without it (e.g. pages/subjects/*.html,
  // which use their own root-relative "/style.css" + relative "../../assets"
  // convention). A bare relative "i18n/en.json" would resolve against the
  // wrong directory on those pages, so this must stay root-relative.
  var DICT_URLS = {
    en: '/i18n/en.json',
    'zh-CN': '/i18n/zh-CN.json'
  };
  var HTML_LANG_ATTR = {
    en: 'en-GB',
    'zh-CN': 'zh-CN'
  };

  var dictionaries = {};
  var loadPromises = {};
  var currentLang = DEFAULT_LANG;
  var observer = null;
  var applyScheduled = false;

  function safeGetStorage(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function safeSetStorage(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignore (private mode, etc.) */ }
  }

  // Only Simplified-Chinese-speaking locales should auto-select zh-CN.
  // zh-TW / zh-HK / zh-MO are Traditional Chinese regions and must not
  // be redirected into the Simplified dictionary.
  function looksLikeSimplifiedChinese(tag) {
    if (!tag) return false;
    tag = tag.toLowerCase();
    if (!/^zh/.test(tag)) return false;
    if (/^zh-(tw|hk|mo|hant)/.test(tag)) return false;
    return true;
  }

  function detectInitialLang() {
    var saved = safeGetStorage(STORAGE_KEY);
    if (saved && SUPPORTED_LANGS.indexOf(saved) !== -1) {
      return saved; // an existing visitor's saved choice always wins
    }
    var candidates = [];
    if (Array.isArray(navigator.languages)) candidates = candidates.concat(navigator.languages);
    if (navigator.language) candidates.push(navigator.language);
    for (var i = 0; i < candidates.length; i++) {
      if (looksLikeSimplifiedChinese(candidates[i])) return 'zh-CN';
    }
    return DEFAULT_LANG;
  }

  function getPath(obj, path) {
    if (!obj) return undefined;
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function loadDictionary(lang) {
    if (dictionaries[lang]) return Promise.resolve(dictionaries[lang]);
    if (loadPromises[lang]) return loadPromises[lang];
    var url = DICT_URLS[lang];
    loadPromises[lang] = fetch(url, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) {
          console.error('[YuliI18n] Failed to load dictionary "' + lang + '" from ' + url + ' (HTTP ' + res.status + '). English fallback text will be used instead.');
          return {};
        }
        return res.json();
      })
      .catch(function (err) {
        // Fetch itself failed (e.g. page opened directly via file:// where
        // fetch() of local files is blocked, or the server couldn't be
        // reached). Fall back to an empty dictionary so t() falls through
        // to the original English text already in the HTML, rather than
        // ever showing a raw key.
        console.error('[YuliI18n] Could not fetch dictionary "' + lang + '" from ' + url + '. If you are opening this file directly (file://) instead of via a local server, translations will not load — the page will still show its original English text. Error:', err);
        return {};
      })
      .then(function (json) {
        dictionaries[lang] = json || {};
        return dictionaries[lang];
      });
    return loadPromises[lang];
  }

  // Returns the translated string for `key`, or `undefined` if it could not
  // be resolved in the current language OR the English fallback dictionary.
  // Callers must treat `undefined` as "leave the existing text alone" —
  // this function must never return the raw key itself, since that would
  // surface keys like "home.hero.line1" directly to visitors.
  function t(key) {
    var val = getPath(dictionaries[currentLang], key);
    if (val === undefined || val === null) {
      val = getPath(dictionaries[DEFAULT_LANG], key);
    }
    return (val === undefined || val === null) ? undefined : val;
  }

  function applyTranslations(root) {
    root = root || document;
    if (observer) observer.disconnect();

    var textNodes = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < textNodes.length; i++) {
      var el = textNodes[i];
      var val = t(el.getAttribute('data-i18n'));
      // Only overwrite when we actually have a resolved translation.
      // If nothing resolves (dictionary missing/failed to load, or the key
      // has a typo), leave the element exactly as authored in the HTML —
      // that markup is always the correct English text — instead of ever
      // writing the raw key into the page.
      if (val !== undefined && el.textContent !== val) el.textContent = val;
    }

    var htmlNodes = root.querySelectorAll('[data-i18n-html]');
    for (i = 0; i < htmlNodes.length; i++) {
      el = htmlNodes[i];
      val = t(el.getAttribute('data-i18n-html'));
      if (val !== undefined && el.innerHTML !== val) el.innerHTML = val;
    }

    var attrMap = {
      'data-i18n-placeholder': 'placeholder',
      'data-i18n-aria-label': 'aria-label',
      'data-i18n-title': 'title',
      'data-i18n-alt': 'alt',
      'data-i18n-value': 'value'
    };
    for (var dataAttr in attrMap) {
      if (!attrMap.hasOwnProperty(dataAttr)) continue;
      var targetAttr = attrMap[dataAttr];
      var nodes = root.querySelectorAll('[' + dataAttr + ']');
      for (i = 0; i < nodes.length; i++) {
        el = nodes[i];
        val = t(el.getAttribute(dataAttr));
        if (val !== undefined && el.getAttribute(targetAttr) !== val) el.setAttribute(targetAttr, val);
      }
    }

    if (observer) observer.observe(document.body, { childList: true, subtree: true });
  }

  function setHtmlLangAttr(lang) {
    var root = document.documentElement;
    root.setAttribute('lang', HTML_LANG_ATTR[lang] || HTML_LANG_ATTR[DEFAULT_LANG]);
    root.setAttribute('data-lang', lang);
  }

  function updateSwitcherUI() {
    var buttons = document.querySelectorAll('.lang-switch [data-lang-option]');
    for (var i = 0; i < buttons.length; i++) {
      var isActive = buttons[i].getAttribute('data-lang-option') === currentLang;
      buttons[i].classList.toggle('active', isActive);
      buttons[i].setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }

  function setLanguage(lang, options) {
    options = options || {};
    if (SUPPORTED_LANGS.indexOf(lang) === -1) lang = DEFAULT_LANG;
    return loadDictionary(lang).then(function () {
      return dictionaries[DEFAULT_LANG] ? null : loadDictionary(DEFAULT_LANG);
    }).then(function () {
      currentLang = lang;
      setHtmlLangAttr(lang);
      applyTranslations(document);
      updateSwitcherUI();
      if (!options.silent) safeSetStorage(STORAGE_KEY, lang);
      try {
        document.dispatchEvent(new CustomEvent('yuli:langchange', { detail: { lang: lang } }));
      } catch (e) { /* older browsers without CustomEvent constructor support */ }
    });
  }

  function findSwitcherMount() {
    return document.querySelector('header .auth-actions')
      || document.querySelector('header .ap-nav-cta')
      || document.querySelector('header .container');
  }

  function buildSwitcher() {
    if (document.querySelector('.lang-switch')) return; // already present on the page
    var mount = findSwitcherMount();
    if (!mount) return;

    var wrap = document.createElement('div');
    wrap.className = 'lang-switch';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Language / 语言');
    wrap.innerHTML =
      '<button type="button" class="lang-btn" data-lang-option="en" aria-pressed="false">EN</button>' +
      '<span class="lang-switch-sep" aria-hidden="true">|</span>' +
      '<button type="button" class="lang-btn" data-lang-option="zh-CN" aria-pressed="false">中文</button>';

    mount.appendChild(wrap);

    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-lang-option]') : null;
      if (!btn) return;
      setLanguage(btn.getAttribute('data-lang-option'));
    });
  }

  function scheduleApply() {
    if (applyScheduled) return;
    applyScheduled = true;
    (window.requestAnimationFrame || window.setTimeout)(function () {
      applyScheduled = false;
      applyTranslations(document);
    });
  }

  function startObserving() {
    if (!('MutationObserver' in window)) return;
    observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
          scheduleApply();
          break;
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    var lang = detectInitialLang();
    Promise.all([
      loadDictionary(DEFAULT_LANG),
      lang !== DEFAULT_LANG ? loadDictionary(lang) : Promise.resolve()
    ]).then(function () {
      currentLang = lang;
      setHtmlLangAttr(lang);
      buildSwitcher();
      applyTranslations(document);
      updateSwitcherUI();
      startObserving();
    });
  }

  window.YuliI18n = {
    t: t,
    setLanguage: setLanguage,
    applyTranslations: applyTranslations,
    getLang: function () { return currentLang; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
