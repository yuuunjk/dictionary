/* ==========================================================================
   낱말상자 — app.js
   국어 · 영어 · 한자 통합 검색 / 단어장 / 복습
   모든 기록은 localStorage(이 기기)에만 저장합니다.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------- 데이터 ---------- */
  var HANJA = window.HANJA || [];
  // 데이터 파일은 [값, 값, ...] 형태의 짧은 배열로 두어 읽기 쉽게 했습니다.
  var EN_WORDS = (window.EN_WORDS || []).map(function (a) {
    var ex = a[4] || [];
    if (ex.length && typeof ex[0] === "string") ex = [ex];  // [예문, 해석] 한 쌍도 받아들임
    // 한국어 뜻은 품사별 묶음 [['명사', ['재미', ...]], ...]. 예전 데이터(['뜻', ...])도 받아들입니다.
    var senses = [];
    var rawKo = a[2] || [];
    if (rawKo.length && typeof rawKo[0] !== "string") {
      rawKo.forEach(function (g) {
        if (!g || !g[0] || !g[1] || !g[1].length) return;
        senses.push({ pos: String(g[0]), means: g[1].map(String) });
      });
    } else {
      senses.push({ pos: a[1] || "", means: rawKo.map(String) });
    }
    var flat = [];
    senses.forEach(function (s) {
      s.means.forEach(function (m) { if (flat.indexOf(m) === -1) flat.push(m); });
    });
    return { w: a[0], p: a[1], senses: senses, ko: flat, defs: a[3] || [], ex: ex, ph: a[5] || "" };
  });
  var KO_WORDS = (window.KO_WORDS || []).map(function (a) {
    return { w: a[0], p: a[1], def: a[2], ex: a[3], syn: a[4] || [], ant: a[5] || [], h: a[6] || "", kind: a[7] || "word" };
  });

  var TYPE_LABEL = { ko: "국어", en: "영어", hanja: "한자" };

  /* ---------- 저장소 ---------- */
  var KEY_RECENT = "luka-dict-recent-v1";
  var KEY_BOOK = "luka-dict-book-v1";

  function readStore(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var val = JSON.parse(raw);
      return val == null ? fallback : val;
    } catch (e) {
      return fallback;
    }
  }
  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  var recent = readStore(KEY_RECENT, []);
  var book = readStore(KEY_BOOK, []);
  if (!Array.isArray(recent)) recent = [];
  if (!Array.isArray(book)) book = [];

  /* ---------- 인덱스 ---------- */
  var enByWord = Object.create(null);
  var enByKo = Object.create(null);
  EN_WORDS.forEach(function (entry) {
    enByWord[entry.w.toLowerCase()] = entry;
    (entry.ko || []).forEach(function (m) {
      var key = String(m).trim();
      if (!key) return;
      if (!enByKo[key]) enByKo[key] = [];
      if (enByKo[key].indexOf(entry) === -1) enByKo[key].push(entry);
    });
  });

  var koByWord = Object.create(null);
  KO_WORDS.forEach(function (entry) {
    var key = String(entry.w).replace(/\s+/g, "");
    if (!koByWord[key]) koByWord[key] = [];
    koByWord[key].push(entry);
  });

  var hanjaByChar = Object.create(null);
  var hanjaByWord = Object.create(null);
  HANJA.forEach(function (h) {
    hanjaByChar[h.c] = h;
    (h.w || []).forEach(function (word) {
      var key = String(word).replace(/\s+/g, "");
      if (!hanjaByWord[key]) hanjaByWord[key] = [];
      if (hanjaByWord[key].indexOf(h) === -1) hanjaByWord[key].push(h);
    });
  });

  var GRADE_ORDER = ["8급", "7급Ⅱ", "7급", "6급Ⅱ", "6급", "5급Ⅱ", "5급", "4급Ⅱ", "4급", "3급Ⅱ", "3급"];

  /* ---------- DOM ---------- */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var el = {
    header: $("#appHead"),
    form: $("#searchForm"),
    input: $("#searchInput"),
    clear: $("#searchClear"),
    tabs: $("#tabs"),
    bookCount: $("#bookCount"),
    homeView: $("#homeView"),
    resultView: $("#resultView"),
    bookView: $("#bookView"),
    resultQuery: $("#resultQuery"),
    resultSummary: $("#resultSummary"),
    resultBody: $("#resultBody"),
    bookBody: $("#bookBody"),
    bookSummary: $("#bookSummary"),
    startReview: $("#startReview"),
    todayGrid: $("#todayGrid"),
    todayDate: $("#todayDate"),
    recentBlock: $("#recentBlock"),
    recentChips: $("#recentChips"),
    clearRecent: $("#clearRecent"),
    bookHome: $("#bookHome"),
    modal: $("#reviewModal"),
    flipCard: $("#flipCard"),
    flipFront: $("#flipFront"),
    flipBack: $("#flipBack"),
    flipHint: $("#flipHint"),
    reviewProgress: $("#reviewProgress"),
    reviewPrev: $("#reviewPrev"),
    reviewNext: $("#reviewNext"),
    toast: $("#toast"),
    backHome: $("#backHome"),
    backHome2: $("#backHome2")
  };

  /* ---------- 상태 ---------- */
  var state = {
    tab: "all",
    query: "",
    liveKo: null,
    liveEn: null,
    liveKoState: "idle",
    liveEnState: "idle",
    seq: 0,
    view: "home"
  };

  var liveCache = Object.create(null);

  /* ---------- 유틸 ---------- */
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function renderWikiLines(text, skip) {
    var skipKey = skip ? squash(skip) : "";
    return String(text).split("\n").map(function (line) {
      return line.trim();
    }).filter(function (t) {
      if (!t) return false;
      if (skipKey && squash(t) === skipKey) return false;
      return true;
    }).slice(0, 9).map(function (t) {
      var head = t.match(/^\[(.+)\]$/);
      if (head) return '<p class="wiki-line-head">' + escapeHtml(head[1]) + "</p>";
      return '<p class="wiki-line">' + escapeHtml(t) + "</p>";
    }).join("");
  }

  function isCJK(ch) {
    var code = ch.codePointAt(0);
    return (code >= 0x3400 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0x20000 && code <= 0x2fa1f);
  }

  function isHangul(ch) {
    var code = ch.codePointAt(0);
    return (code >= 0xac00 && code <= 0xd7a3) || (code >= 0x3131 && code <= 0x318e);
  }

  function isLatinQuery(q) {
    return /^[a-zA-Z][a-zA-Z\s'\-.]*$/.test(q);
  }

  function isHangulQuery(q) {
    return /^[가-힣\s]+$/.test(q);
  }

  function squash(str) {
    return String(str).replace(/\s+/g, "").toLowerCase();
  }

  function stripTags(str) {
    return String(str).replace(/<[^>]*>/g, "");
  }

  function firstSentence(text, max) {
    var t = String(text || "").trim();
    var cut = t.split(/(?<=[.!?。])\s/)[0] || t;
    if (cut.length > (max || 70)) cut = cut.slice(0, (max || 70) - 1) + "…";
    return cut;
  }

  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    requestAnimationFrame(function () { el.toast.classList.add("show"); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.remove("show");
      setTimeout(function () { el.toast.hidden = true; }, 220);
    }, 1900);
  }

  function icon(name) {
    var paths = {
      star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8L12 3.6z"/></svg>',
      starFilled: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8L12 3.6z"/></svg>',
      sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h3l4 3.5v-11L7 10H4z"/><path d="M15 9.2a4 4 0 010 5.6"/><path d="M17.6 6.6a7.5 7.5 0 010 10.8"/></svg>',
      wave: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h1.5"/><path d="M9 8.5v7"/><path d="M12 6v12"/><path d="M15 9v6"/><path d="M18 11v2"/></svg>',
      book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5V5.5z"/><path d="M4 20.5A2.5 2.5 0 016.5 18H20"/></svg>',
      trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/></svg>',
      wiki: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16"/><path d="M6 6l3.5 13L12 10l2.5 9L18 6"/></svg>'
    };
    return paths[name] || "";
  }

  /* ---------- 검색: 영어 ---------- */
  function searchEnglish(q) {
    var lq = q.toLowerCase().trim();
    var out = [];
    var exact = enByWord[lq];
    if (exact) out.push(exact);

    if (lq.length >= 2) {
      EN_WORDS.forEach(function (e) {
        if (out.length >= 7) return;
        if (e === exact) return;
        if (e.w.toLowerCase().indexOf(lq) === 0) out.push(e);
      });
    }

    // 한글 → 영어 (역방향)
    if (isHangulQuery(q)) {
      var key = squash(q);
      var rev = [];
      Object.keys(enByKo).forEach(function (k) {
        if (squash(k) === key) rev = rev.concat(enByKo[k]);
      });
      if (!rev.length && key.length >= 2) {
        Object.keys(enByKo).forEach(function (k) {
          if (squash(k).indexOf(key) === 0) rev = rev.concat(enByKo[k]);
        });
      }
      rev.forEach(function (e) { if (out.indexOf(e) === -1) out.push(e); });
    }
    return out.slice(0, 8);
  }

  /* ---------- 검색: 국어 ---------- */
  function searchKorean(q) {
    var key = squash(q);
    if (!key) return [];
    var exact = [];
    var near = [];
    KO_WORDS.forEach(function (e) {
      if (squash(e.w) === key || (e.h && squash(e.h) === key)) exact.push(e);
      else if (key.length >= 1 && (squash(e.w).indexOf(key) === 0 || (e.kind === "idiom" && squash(e.h || "").indexOf(key) === 0))) near.push(e);
    });
    if (near.length < 3) {
      KO_WORDS.forEach(function (e) {
        if (exact.indexOf(e) !== -1 || near.indexOf(e) !== -1) return;
        if (near.length >= 6) return;
        if (squash(e.w).indexOf(key) > 0) near.push(e);
      });
    }
    return exact.concat(near).slice(0, 7);
  }

  /* ---------- 검색: 한자 ---------- */
  function searchHanja(q) {
    var out = [];
    var seen = Object.create(null);
    function push(h) {
      if (!h || seen[h.c]) return;
      seen[h.c] = true;
      out.push(h);
    }

    var chars = [];
    for (var i = 0; i < q.length; i++) {
      var ch = q[i];
      if (isCJK(ch) && chars.indexOf(ch) === -1) chars.push(ch);
    }
    if (chars.length) {
      chars.forEach(function (ch) { push(hanjaByChar[ch]); });
      return out;
    }

    var key = squash(q);
    // 1) 음이 정확히 같은 글자
    HANJA.forEach(function (h) {
      if (h.e === q.trim() || (h.alt && h.alt.some(function (a) { return a[1] === q.trim(); }))) push(h);
    });
    // 2) 훈/훈음으로 찾기 (클, 클대, 클 대 / 큰, 큰대)
    if (out.length < 1) {
      HANJA.forEach(function (h) {
        if (squash(h.h) === key || squash(h.h + h.e) === key) push(h);
        else if (h.alt && h.alt.some(function (a) { return squash(a[0]) === key || squash(a[0] + a[1]) === key; })) push(h);
      });
    }
    // 3) 훈이 검색어로 시작 (클 → 큰, 클)
    if (out.length < 2) {
      HANJA.forEach(function (h) { if (squash(h.h).indexOf(key) === 0) push(h); });
    }
    // 4) 이 글자가 들어간 낱말로 찾기 (대학교 → 大·學·校)
    if (!out.length && hanjaByWord[key]) {
      hanjaByWord[key].forEach(push);
    }
    return out.slice(0, 14);
  }

  function hanjaMatchNote(q, list) {
    if (!list.length) return "";
    if (/[一-鿿]/.test(q)) return "글자 그대로 찾았어요";
    if (/^[가-힣\s]+$/.test(q)) {
      var byEum = list.every(function (h) { return h.e === q.trim(); });
      if (byEum) return "음(소리) ‘" + q.trim() + "’인 한자";
      var byHun = list.some(function (h) { return squash(h.h) === squash(q) || squash(h.h + h.e) === squash(q); });
      if (byHun) return "훈(뜻)으로 찾은 한자";
      return "‘" + q.trim() + "’이 들어간 낱말의 한자";
    }
    return "";
  }

  /* ---------- 실시간: 영어 영영 사전 ---------- */
  function fetchWithTimeout(url, ms) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 7000);
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined).then(function (res) {
      clearTimeout(timer);
      return res;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  function parseDictionaryApi(data) {
    if (!Array.isArray(data) || !data.length) return null;
    var first = data[0] || {};
    var phonetics = [];
    (data || []).forEach(function (d) {
      (d.phonetics || []).forEach(function (p) { if (p.text) phonetics.push(p.text); });
      if (d.phonetic) phonetics.push(d.phonetic);
    });
    var phonetic = (phonetics.length ? phonetics[0] : "") || "";
    var audio = "";
    (data || []).forEach(function (d) {
      (d.phonetics || []).forEach(function (p) { if (!audio && p.audio) audio = p.audio; });
    });

    var defs = [];
    var examples = [];
    (data || []).forEach(function (d) {
      (d.meanings || []).forEach(function (m) {
        (m.definitions || []).forEach(function (def) {
          if (def.definition) defs.push({ pos: m.partOfSpeech || "", text: def.definition });
          if (def.example && examples.length < 3) examples.push({ en: def.example, ko: "" });
        });
      });
    });
    return { word: first.word || "", phonetic: phonetic, audio: audio, defs: defs.slice(0, 4), examples: examples };
  }

  function fetchEnglishLive(word) {
    var key = "en:" + word.toLowerCase();
    if (liveCache[key]) return Promise.resolve(liveCache[key]);
    var url = "https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(word);
    return fetchWithTimeout(url, 7000).then(function (res) {
      if (!res.ok) throw new Error("http " + res.status);
      return res.json();
    }).then(function (data) {
      var parsed = parseDictionaryApi(data);
      if (!parsed) throw new Error("empty");
      liveCache[key] = parsed;
      return parsed;
    }).catch(function () {
      // 대체: Datamuse 영영 뜻
      return fetchWithTimeout("https://api.datamuse.com/words?sp=" + encodeURIComponent(word) + "&md=d&max=1", 7000)
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (list) {
          var item = (list || []).filter(function (x) { return x.word && x.word.toLowerCase() === word.toLowerCase(); })[0];
          if (!item || !item.defs || !item.defs.length) return null;
          var posMap = { n: "noun", v: "verb", adj: "adjective", adv: "adverb", u: "" };
          var defs = item.defs.map(function (d) {
            var parts = d.split("\t");
            if (parts.length > 1) return { pos: posMap[parts[0]] || "", text: parts[1] };
            return { pos: "", text: d };
          });
          var parsed = { word: item.word, phonetic: "", audio: "", defs: defs, examples: [], fallback: true };
          liveCache[key] = parsed;
          return parsed;
        }).catch(function () { return null; });
    });
  }

  /* ---------- 실시간: 국어 위키낱말사전 ---------- */
  function cleanWikiExtract(text) {
    var lines = String(text || "").split("\n");
    var out = [];
    var started = false;
    var skipSection = false;
    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      if (/^==\s*[^=]+\s*==$/.test(line)) {
        if (/^==\s*한국어\s*==$/.test(line)) { started = true; return; }
        if (started) skipSection = true;
        return;
      }
      if (!started) return;
      if (skipSection) return;
      if (/^===\s/.test(line)) {
        var head = line.replace(/=/g, "").trim();
        if (/^(한자|어원|발음|관용구|속담|합성어|파생어|유의어|반의어|번역)/.test(head)) return;
        out.push("[" + head + "]");
        return;
      }
      if (/IPA|발음\s*:/.test(line)) {
        var pron = line.match(/발음\s*:\s*\[([^\]]*)\]/);
        if (pron) out.push("발음 [" + pron[1] + "]");
        return;
      }
      out.push(line);
    });
    // 중복/과도한 길이 정리
    var seen = Object.create(null);
    var cleaned = [];
    out.forEach(function (l) {
      if (seen[l]) return;
      seen[l] = true;
      cleaned.push(l);
    });
    return cleaned.slice(0, 10).join("\n");
  }

  function fetchKoreanLive(word) {
    var key = "ko:" + word;
    if (liveCache[key]) return Promise.resolve(liveCache[key]);
    var url = "https://ko.wiktionary.org/w/api.php?action=query&format=json&prop=extracts&explaintext=1&redirects=1&origin=*&titles=" + encodeURIComponent(word);
    return fetchWithTimeout(url, 7000).then(function (res) {
      if (!res.ok) throw new Error("http " + res.status);
      return res.json();
    }).then(function (data) {
      var pages = data && data.query && data.query.pages ? data.query.pages : {};
      var page = Object.keys(pages).map(function (k) { return pages[k]; })[0];
      if (!page || page.missing !== undefined || !page.extract) return null;
      var cleaned = cleanWikiExtract(page.extract);
      if (!cleaned) return null;
      var payload = { title: page.title, text: cleaned };
      liveCache[key] = payload;
      return payload;
    }).catch(function () { return null; });
  }

  /* ---------- 발음 ---------- */
  var currentAudio = null;
  function speakText(text, lang, audioUrl, btn) {
    if (btn) {
      btn.classList.add("is-on");
      setTimeout(function () { btn.classList.remove("is-on"); }, 900);
    }
    function synth() {
      if (!("speechSynthesis" in window)) { toast("이 브라우저에서는 소리를 들을 수 없어요"); return; }
      try {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.lang = lang === "en" ? "en-US" : "ko-KR";
        u.rate = 0.92;
        window.speechSynthesis.speak(u);
      } catch (e) { toast("소리를 재생하지 못했어요"); }
    }
    if (audioUrl) {
      try {
        if (currentAudio) { currentAudio.pause(); currentAudio = null; }
        var a = new Audio(audioUrl);
        currentAudio = a;
        a.addEventListener("error", function () { synth(); }, { once: true });
        var p = a.play();
        if (p && p.catch) p.catch(function () { synth(); });
        return;
      } catch (e) { /* fall through */ }
    }
    synth();
  }

  /* ---------- 단어장 ---------- */
  function bookId(type, key) { return type + ":" + key; }

  function isSaved(type, key) {
    return book.some(function (b) { return b.id === bookId(type, key); });
  }

  function toggleBook(item) {
    var id = bookId(item.type, item.key);
    var idx = -1;
    for (var i = 0; i < book.length; i++) if (book[i].id === id) { idx = i; break; }
    if (idx >= 0) {
      book.splice(idx, 1);
      writeStore(KEY_BOOK, book);
      toast("단어장에서 뺐어요");
    } else {
      book.unshift({
        id: id, type: item.type, title: item.title, sub: item.sub || "",
        query: item.query || item.title, at: Date.now()
      });
      writeStore(KEY_BOOK, book);
      toast("⭐ 단어장에 담았어요");
    }
    updateBookCount();
  }

  function updateBookCount() {
    var n = book.length;
    el.bookCount.textContent = String(n);
    el.bookCount.hidden = n === 0;
    if (state.view === "book") renderBook();
    if (state.view === "home") renderBookHome();
  }

  /* ---------- 렌더: 공통 조각 ---------- */
  function starButton(type, key, title, sub, query) {
    var on = isSaved(type, key);
    return '<button class="icon-btn star-btn' + (on ? " is-on" : "") + '" type="button" ' +
      'data-star="1" data-type="' + type + '" data-key="' + escapeHtml(key) + '" ' +
      'data-title="' + escapeHtml(title) + '" data-sub="' + escapeHtml(sub || "") + '" ' +
      'data-query="' + escapeHtml(query || title) + '" ' +
      'aria-pressed="' + (on ? "true" : "false") + '" aria-label="' + (on ? "단어장에서 빼기" : "단어장에 담기") + '">' +
      icon(on ? "starFilled" : "star") + "</button>";
  }

  function sectionWrap(type, title, count, note, inner) {
    return '<section class="sec ' + type + '">' +
      '<div class="sec-head"><span class="sec-dot"></span><h3>' + title + "</h3>" +
      '<span class="sec-count">' + count + "</span>" +
      (note ? '<span class="sec-note">' + escapeHtml(note) + "</span>" : "") +
      "</div>" + inner + "</section>";
  }

  /* ---------- 렌더: 영어 카드 ---------- */
  function renderEnglishEntry(entry, live) {
    var word = entry ? entry.w : (live ? live.word : "");
    var koMeanings = entry ? (entry.ko || []) : [];
    var pos = entry ? entry.p : "";
    var liveDefs = live && live.defs ? live.defs : [];
    var defs = [];
    var seenDef = Object.create(null);

    if (entry && entry.defs) {
      entry.defs.forEach(function (d) {
        var key = squash(d).slice(0, 40);
        if (seenDef[key]) return;
        seenDef[key] = true;
        defs.push({ pos: "", text: d });
      });
    }
    // 내장 사전에 있는 낱말은 내장 뜻·예문만 보여 줍니다.
    // 실시간 사전은 내장에 없는 낱말을 찾을 때만 씁니다(어려운 풀이·번역 없는 예문 방지).
    if (!entry || !(entry.defs || []).length) {
      liveDefs.forEach(function (d) {
        var key = squash(d.text).slice(0, 40);
        if (seenDef[key]) return;
        seenDef[key] = true;
        defs.push(d);
      });
    }

    var examples = [];
    if (entry && entry.ex) {
      entry.ex.forEach(function (pair) { examples.push({ en: pair[0], ko: pair[1] || "" }); });
    }
    if (!entry || !(entry.ex || []).length) {
      (live && live.examples ? live.examples : []).forEach(function (ex) {
        var dup = examples.some(function (e2) { return squash(e2.en) === squash(ex.en); });
        if (!dup) examples.push(ex);
      });
    }

    var phonetic = (entry && entry.ph) || (live && live.phonetic) || "";
    var audio = (live && live.audio) || "";

    var senses = (entry && entry.senses && entry.senses.length) ? entry.senses : [{ pos: pos, means: koMeanings }];
    var subMeans = [];
    senses.forEach(function (s) {
      if (!s.means.length) return;
      subMeans.push((s.pos ? s.pos + " " : "") + s.means.slice(0, 3).join(", "));
    });
    var savedSub = subMeans.join(" / ") || firstSentence(defs.length ? defs[0].text : "", 48);

    var html = '<article class="entry">';
    html += '<div class="entry-top"><div class="entry-title-wrap">';
    html += '<div class="entry-word en-word">' + escapeHtml(word) + "</div>";
    if (phonetic) {
      html += '<div class="phonetic"><span>' + escapeHtml(phonetic) + "</span>";
      html += '<button class="icon-btn speak-btn speak-sm" type="button" data-speak="' + escapeHtml(word) + '" data-lang="en" data-audio="' + escapeHtml(audio) + '" aria-label="' + escapeHtml(word) + ' 발음 듣기">' + icon("sound") + "</button>";
      html += "</div>";
    } else {
      html += '<div class="phonetic"><button class="icon-btn speak-btn speak-sm" type="button" data-speak="' + escapeHtml(word) + '" data-lang="en" data-audio="" aria-label="' + escapeHtml(word) + ' 발음 듣기">' + icon("sound") + "</button></div>";
    }
    html += "</div>";
    html += starButton("en", word.toLowerCase(), word, savedSub, word);
    html += "</div>";

    if (koMeanings.length) {
      html += '<div class="field"><div class="field-label">한국어 뜻 <span class="ko-only">Korean</span></div><div class="field-body ko-meanings">';
      senses.forEach(function (s) {
        if (!s.means.length) return;
        html += '<div class="sense">' +
          (s.pos ? '<span class="sense-pos">' + escapeHtml(s.pos) + "</span>" : "") +
          '<span class="sense-means">' + s.means.map(escapeHtml).join('<span class="sense-sep">·</span>') + "</span>" +
          "</div>";
      });
      html += "</div></div>";
    } else if (!entry) {
      html += '<div class="field"><div class="field-label">한국어 뜻</div><div class="field-body" style="color:var(--ink-3)">내장 단어장에 아직 없는 낱말이에요. 영영 뜻으로 확인해 보세요.</div></div>';
    }

    if (defs.length) {
      html += '<div class="field"><div class="field-label">영영 뜻 <span class="ko-only">English definition</span></div><ul class="def-list">';
      defs.slice(0, 4).forEach(function (d, i) {
        html += '<li><span class="num">' + (i + 1) + "</span><span>" + escapeHtml(d.text) + "</span></li>";
      });
      html += "</ul></div>";
    }

    if (examples.length) {
      html += '<div class="field"><div class="field-label">예문 <span class="ko-only">Examples</span></div><div class="examples">';
      examples.slice(0, 4).forEach(function (ex) {
        html += '<div class="example"><div class="ex-en">' + escapeHtml(ex.en) + "</div>" +
          (ex.ko ? '<div class="ex-ko">' + escapeHtml(ex.ko) + "</div>" : "") + "</div>";
      });
      html += "</div></div>";
    }

    html += "</article>";
    return html;
  }

  /* ---------- 렌더: 국어 카드 ---------- */
  function renderKoreanEntry(entry, live, liveState) {
    var word = entry ? entry.w : (live ? live.title : "");
    var pos = entry && entry.p ? entry.p : "";
    var def = entry ? entry.def : "";
    var sub = (pos ? pos + " · " : "") + firstSentence(def || (live ? live.text : ""), 52);

    var html = '<article class="entry">';
    html += '<div class="entry-top"><div class="entry-title-wrap">';
    html += '<div class="entry-word">' + escapeHtml(word) +
      (pos ? '<span class="pos">' + escapeHtml(pos) + "</span>" : "") + "</div>";
    html += '<div class="sub-meta">';
    html += '<button class="icon-btn speak-btn speak-sm ko-speak" type="button" data-speak="' + escapeHtml(word) + '" data-lang="ko" data-audio="" aria-label="' + escapeHtml(word) + ' 발음 듣기">' + icon("wave") + "</button>";
    if (entry && entry.h) {
      html += '<span class="hanja-origin">한자 <span class="hanja-mini">' + escapeHtml(entry.h) + "</span></span>";
    }
    html += "</div>";
    html += "</div>";
    html += starButton("ko", word, word, sub, word);
    html += "</div>";

    if (def) {
      html += '<div class="field"><div class="field-label">뜻</div><div class="field-body">' + escapeHtml(def) + "</div></div>";
    }

    if (entry && entry.ex) {
      html += '<div class="field"><div class="field-label">예문</div><div class="examples"><div class="example">' +
        '<div class="ex-en" style="font-size:15.5px">' + escapeHtml(entry.ex) + "</div></div></div></div>";
    }

    if (entry && ((entry.syn && entry.syn.length) || (entry.ant && entry.ant.length))) {
      html += '<div class="field"><div class="field-label">비슷한 말 · 반대말</div><div class="tag-row">';
      if (entry.syn && entry.syn.length) {
        html += '<span class="tag-label">비슷한 말</span>';
        entry.syn.forEach(function (s) { html += '<span class="tag syn">' + escapeHtml(s) + "</span>"; });
      }
      if (entry.ant && entry.ant.length) {
        html += '<span class="tag-label" style="margin-left:6px">반대말</span>';
        entry.ant.forEach(function (s) { html += '<span class="tag ant">' + escapeHtml(s) + "</span>"; });
      }
      html += "</div></div>";
    }

    // 위키낱말사전 풀이
    if (liveState === "loading") {
      html += '<div class="wiki-box"><div class="wiki-head">' + icon("wiki") + " 위키낱말사전</div>" +
        '<div class="skel" style="height:13px;width:88%;margin-bottom:8px"></div>' +
        '<div class="skel" style="height:13px;width:70%;margin-bottom:8px"></div>' +
        '<div class="skel" style="height:13px;width:80%"></div></div>';
    } else if (live) {
      html += '<div class="wiki-box"><div class="wiki-head">' + icon("wiki") + " 위키낱말사전 풀이</div>" +
        '<div class="wiki-body">' + renderWikiLines(live.text, entry && entry.def) + "</div>" +
        '<div class="wiki-note">뜻이 더 여러 가지일 수 있어요.</div></div>';
    } else if (liveState === "done" && entry) {
      html += '<div class="live-status" style="margin-top:12px;font-size:12.5px">위키낱말사전에서 더 찾지 못했어요.</div>';
    }

    html += "</article>";
    return html;
  }

  /* ---------- 렌더: 한자 카드 ---------- */
  function renderHanjaEntry(h) {
    var words = (h.w || []).slice(0, 5);
    var sub = h.h + " " + h.e + " · 부수 " + h.r + " · " + h.s + "획" + (h.g ? " · " + h.g : "");
    var alt = (h.alt || []).filter(function (a) { return a[1] !== h.e || a[0] !== h.h; });

    var html = '<article class="entry hanja-entry">';
    html += '<div class="hanja-tile"><span class="hanja-char">' + escapeHtml(h.c) + "</span></div>";
    html += '<div class="hanja-side">';
    html += '<div class="entry-top"><div class="entry-title-wrap">';
    html += '<div class="hun-eum"><span class="hun">' + escapeHtml(h.h) + "</span> <span class=\"eum\">" + escapeHtml(h.e) + "</span>";
    alt.forEach(function (a) {
      html += '<span class="alt">' + escapeHtml(a[0] + " " + a[1]) + "</span>";
    });
    html += "</div>";
    html += "</div>";
    html += '<button class="icon-btn speak-btn speak-sm ko-speak" type="button" data-speak="' + escapeHtml(h.h + " " + h.e) + '" data-lang="ko" data-audio="" aria-label="' + escapeHtml(h.h + " " + h.e) + ' 읽어 주기">' + icon("wave") + "</button>";
    html += starButton("hanja", h.c, h.c, sub, h.c);
    html += "</div>";

    html += '<div class="hanja-meta">';
    html += '<span class="meta-chip">부수 <span class="hanja-mini">' + escapeHtml(h.r) + "</span> <b>" + escapeHtml(h.rn || "") + "</b></span>";
    html += '<span class="meta-chip">총 <b>' + escapeHtml(h.s) + "</b>획</span>";
    if (h.g) html += '<span class="meta-chip grade">' + escapeHtml(h.g) + "</span>";
    html += "</div>";

    if (words.length) {
      html += '<div class="field" style="margin-top:16px"><div class="field-label">이 글자가 들어간 낱말</div><div class="word-list">';
      words.forEach(function (w) {
        html += '<button class="word-pill" type="button" data-search="' + escapeHtml(w) + '">' + escapeHtml(w) + "</button>";
      });
      html += "</div></div>";
    }

    html += "</div></article>";
    return html;
  }

  /* ---------- 렌더: 결과 ---------- */
  function runSearch(q, opts) {
    opts = opts || {};
    q = String(q || "").trim();
    if (!q) return;

    state.query = q;
    state.liveKo = null;
    state.liveEn = null;
    state.liveKoState = "idle";
    state.liveEnState = "idle";
    state.view = "result";

    if (opts.remember !== false) addRecent(q);

    showResult();
    el.input.value = q;
    el.clear.hidden = false;
    el.resultQuery.textContent = "‘" + q + "’";

    var seq = ++state.seq;
    var tab = state.tab;

    var koResults = tab === "all" || tab === "ko" ? searchKorean(q) : [];
    var enResults = tab === "all" || tab === "en" ? searchEnglish(q) : [];
    var hanjaResults = tab === "all" || tab === "hanja" ? searchHanja(q) : [];

    var wantKoLive = (tab === "all" || tab === "ko") && isHangulQuery(q) && q.length <= 12;
    var wantEnLive = (tab === "all" || tab === "en") && isLatinQuery(q);
    state.wantKo = wantKoLive;
    state.wantEn = wantEnLive;

    if (wantKoLive) state.liveKoState = "loading";
    if (wantEnLive) state.liveEnState = "loading";

    renderResults({ ko: koResults, en: enResults, hanja: hanjaResults, q: q });

    if (wantEnLive) {
      fetchEnglishLive(q.trim()).then(function (live) {
        if (seq !== state.seq) return;
        state.liveEn = live;
        state.liveEnState = live ? "done" : "failed";
        renderResults({ ko: koResults, en: enResults, hanja: hanjaResults, q: q });
      });
    }

    if (wantKoLive) {
      fetchKoreanLive(q.trim()).then(function (live) {
        if (seq !== state.seq) return;
        state.liveKo = live;
        state.liveKoState = live ? "done" : "failed";
        renderResults({ ko: koResults, en: enResults, hanja: hanjaResults, q: q });
      });
    }
  }

  function renderResults(data) {
    var q = data.q;
    var ko = data.ko, en = data.en, hanja = data.hanja;
    var liveEn = state.liveEn;
    var liveKo = state.liveKo;
    var total = ko.length + en.length + hanja.length + (liveEn && !en.some(function (e) { return e.w.toLowerCase() === liveEn.word.toLowerCase(); }) ? 1 : 0);

    var summary = [];
    if (ko.length || (state.liveKoState === "loading" && (state.tab === "all" || state.tab === "ko"))) summary.push("국어 " + (ko.length || "…"));
    if (en.length || (state.liveEnState === "loading" && (state.tab === "all" || state.tab === "en"))) summary.push("영어 " + (en.length || "…"));
    if (hanja.length) summary.push("한자 " + hanja.length);
    el.resultSummary.innerHTML = summary.length ? summary.map(escapeHtml).join(" · ") : "찾은 낱말이 없어요";

    var html = "";

    var showKo = state.tab === "ko" ||
      (state.tab === "all" && (ko.length > 0 || (state.wantKo && state.liveKoState !== "failed")));
    var showEn = state.tab === "en" ||
      (state.tab === "all" && (en.length > 0 || state.wantEn || state.liveEn));

    /* 국어 */
    if (showKo) {
      var koInner = "";
      if (ko.length) {
        ko.forEach(function (entry, i) {
          koInner += renderKoreanEntry(entry, i === 0 ? liveKo : null, i === 0 ? state.liveKoState : "idle");
        });
      } else if (liveKo && state.liveKoState === "done") {
        koInner += renderKoreanEntry(null, liveKo, "done");
      } else if (state.liveKoState === "loading") {
        koInner += renderKoreanEntry({ w: q, p: "", def: "", ex: "", syn: [], ant: [] }, null, "loading");
      } else {
        koInner = '<div class="empty">국어 사전에서 <b>' + escapeHtml(q) + "</b>을(를) 찾지 못했어요.</div>";
      }
      if (ko.length && liveKo && state.liveKoState === "done") {
        // 첫 카드에 위키 풀이가 이미 붙어 있음
      }
      html += sectionWrap("ko", "국어", ko.length || (liveKo ? 1 : 0), ko.length > 1 ? "뜻이 여러 개예요" : "", koInner);
    }

    /* 영어 */
    if (showEn) {
      var enInner = "";
      var enList = en.slice();
      var liveIsNew = liveEn && !enList.some(function (e) { return e.w.toLowerCase() === liveEn.word.toLowerCase(); });

      if (enList.length) {
        enList.forEach(function (entry, i) {
          var live = (i === 0 && liveEn && liveEn.word.toLowerCase() === entry.w.toLowerCase()) ? liveEn : null;
          enInner += renderEnglishEntry(entry, live);
        });
      }
      if (liveIsNew) {
        enInner += renderEnglishEntry(null, liveEn);
      }
      if (!enInner) {
        if (state.liveEnState === "loading") {
          enInner = '<div class="section-loading"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>';
        } else {
          enInner = '<div class="empty">영어 사전에서 <b>' + escapeHtml(q) + "</b>을(를) 찾지 못했어요.<br>철자를 다시 확인해 보세요.</div>";
        }
      } else if (state.liveEnState === "failed" && enList.length && !enList[0].defs.length) {
        enInner += '<div class="live-status" style="padding-left:4px">실시간 영영 사전에 연결하지 못해 내장 사전으로 보여주고 있어요.</div>';
      }
      var enCount = enList.length + (liveIsNew ? 1 : 0);
      html += sectionWrap("en", "영어", enCount, enList.length ? "" : "", enInner);
    }

    /* 한자 */
    var showHanja = state.tab === "hanja" || (state.tab === "all" && hanja.length > 0);
    if (showHanja) {
      var hInner = "";
      if (hanja.length) {
        hanja.forEach(function (h) { hInner += renderHanjaEntry(h); });
      } else {
        hInner = '<div class="empty">한자 사전에서 <b>' + escapeHtml(q) + "</b>을(를) 찾지 못했어요.<br>한자(大) · 음(대) · 훈(클)으로 다시 찾아보세요.</div>";
      }
      html += sectionWrap("hanja", "한자", hanja.length, hanjaMatchNote(q, hanja), hInner);
    }

    if (!total && !ko.length && !en.length && !hanja.length && !liveEn && state.liveEnState !== "loading" && state.liveKoState !== "loading") {
      html = '<div class="no-result"><div class="nr-emoji">🔎</div><h3>‘' + escapeHtml(q) + "’을(를) 찾지 못했어요</h3>" +
        "<p>낱말의 철자를 확인하거나, 다른 낱말로 찾아보세요.</p>" +
        '<div class="sugg">' + ["사과", "apple", "大", "학교", "사랑"].map(function (s) {
          return '<button class="chip" type="button" data-search="' + escapeHtml(s) + '">' + escapeHtml(s) + "</button>";
        }).join("") + "</div></div>";
    }

    el.resultBody.innerHTML = html;
  }

  /* ---------- 홈 ---------- */
  function hashSeed() {
    var d = new Date();
    var s = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    return s;
  }

  function pick(list, offset) {
    if (!list.length) return null;
    return list[(hashSeed() * 7 + offset * 13) % list.length];
  }

  var WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

  function renderHome() {
    var d = new Date();
    el.todayDate.textContent = (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + WEEKDAYS[d.getDay()] + "요일";

    var ko = pick(KO_WORDS.filter(function (e) { return e.kind !== "idiom" && e.kind !== "proverb"; }), 1) || pick(KO_WORDS, 1);
    var en = pick(EN_WORDS, 2);
    var hanja = pick(HANJA, 3);

    var cards = [];
    if (ko) {
      cards.push('<button class="today-card ko" type="button" data-search="' + escapeHtml(ko.w) + '" data-tab="ko">' +
        '<span class="today-type ko">국어</span>' +
        '<span class="today-word">' + escapeHtml(ko.w) + "</span>" +
        '<span class="today-meaning">' + escapeHtml(firstSentence(ko.def, 62)) + "</span>" +
        '<span class="today-arrow">뜻 보기 →</span></button>');
    }
    if (en) {
      cards.push('<button class="today-card en" type="button" data-search="' + escapeHtml(en.w) + '" data-tab="en">' +
        '<span class="today-type en">영어</span>' +
        '<span class="today-word">' + escapeHtml(en.w) + "</span>" +
        '<span class="today-meaning">' + escapeHtml((en.ko || []).slice(0, 3).join(", ")) + "</span>" +
        '<span class="today-arrow">뜻 보기 →</span></button>');
    }
    if (hanja) {
      cards.push('<button class="today-card hanja" type="button" data-search="' + escapeHtml(hanja.c) + '" data-tab="hanja">' +
        '<span class="today-type hanja">한자</span>' +
        '<span class="today-word hanja-big">' + escapeHtml(hanja.c) + "</span>" +
        '<span class="today-meaning">' + escapeHtml(hanja.h + " " + hanja.e) + " · " + escapeHtml(hanja.g || "") + "</span>" +
        '<span class="today-arrow">낱말 보기 →</span></button>');
    }
    el.todayGrid.innerHTML = cards.join("");

    renderRecent();
    renderBookHome();
  }

  function renderRecent() {
    if (!recent.length) {
      el.recentBlock.hidden = true;
      return;
    }
    el.recentBlock.hidden = false;
    el.recentChips.innerHTML = recent.slice(0, 10).map(function (r) {
      return '<button class="chip" type="button" data-search="' + escapeHtml(r.q) + '">' +
        '<span class="chip-type">' + escapeHtml(TYPE_LABEL[r.type] || "") + "</span>" +
        escapeHtml(r.q) + "</button>";
    }).join("");
  }

  function addRecent(q) {
    var type = /[一-鿿]/.test(q) ? "hanja" : (/^[a-zA-Z]/.test(q) ? "en" : "ko");
    recent = recent.filter(function (r) { return squash(r.q) !== squash(q); });
    recent.unshift({ q: q, type: type });
    recent = recent.slice(0, 12);
    writeStore(KEY_RECENT, recent);
    renderRecent();
  }

  function renderBookHome() {
    var n = book.length;
    if (!n) {
      el.bookHome.innerHTML = '<div class="book-home-icon">' + icon("star") + "</div>" +
        '<div class="book-home-text"><strong>아직 담은 낱말이 없어요</strong><span>카드 오른쪽 ☆를 누르면 여기에 모여요.</span></div>';
      return;
    }
    var recentThree = book.slice(0, 3).map(function (b) { return b.title; }).join(" · ");
    el.bookHome.innerHTML = '<div class="book-home-icon">' + icon("star") + "</div>" +
      '<div class="book-home-text"><strong>' + n + "개의 낱말을 담았어요</strong><span>" + escapeHtml(recentThree) + "</span></div>" +
      '<button class="primary-btn" type="button" data-goto-book="1">복습하기</button>';
  }

  /* ---------- 단어장 화면 ---------- */
  function renderBook() {
    var n = book.length;
    el.bookSummary.textContent = n ? n + "개의 낱말을 담아 두었어요." : "담아 둔 낱말을 다시 보고 복습해요.";
    el.startReview.hidden = n === 0;

    if (!n) {
      el.bookBody.innerHTML = '<div class="book-empty"><div class="be-icon">⭐</div><h3>단어장이 비어 있어요</h3>' +
        "<p>찾은 낱말 카드에서 ☆를 누르면<br>여기에 차곡차곡 모여요.</p></div>";
      return;
    }

    var groups = ["ko", "en", "hanja"];
    var html = "";
    groups.forEach(function (type) {
      var items = book.filter(function (b) { return b.type === type; });
      if (!items.length) return;
      html += '<div class="book-group"><div class="book-group-head">' +
        '<span class="dot dot-' + type + '"></span><h3>' + TYPE_LABEL[type] + "</h3>" +
        '<span class="n">' + items.length + "개</span></div>";
      items.forEach(function (b) {
        html += '<div class="book-row">' +
          '<button class="book-row-main" type="button" data-search="' + escapeHtml(b.query) + '" data-tab="' + type + '">' +
          '<span class="book-row-title">' + (type === "hanja" ? '<span class="hanja-mini">' + escapeHtml(b.title) + "</span>" : escapeHtml(b.title)) + "</span>" +
          '<span class="book-row-sub">' + escapeHtml(b.sub || "") + "</span></button>" +
          '<button class="icon-btn book-del" type="button" data-del="' + escapeHtml(b.id) + '" aria-label="단어장에서 빼기">' + icon("trash") + "</button>" +
          "</div>";
      });
      html += "</div>";
    });
    el.bookBody.innerHTML = html;
  }

  /* ---------- 화면 전환 ---------- */
  function setTab(tab) {
    state.tab = tab;
    $$(".tab", el.tabs).forEach(function (b) {
      var on = b.getAttribute("data-tab") === tab;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-current", on ? "true" : "false");
    });
  }

  function showHome() {
    state.view = "home";
    el.homeView.hidden = false;
    el.resultView.hidden = true;
    el.bookView.hidden = true;
    renderHome();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showResult() {
    el.homeView.hidden = true;
    el.resultView.hidden = false;
    el.bookView.hidden = true;
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function showBook() {
    state.view = "book";
    el.homeView.hidden = true;
    el.resultView.hidden = true;
    el.bookView.hidden = false;
    renderBook();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  /* ---------- 복습 모달 ---------- */
  var review = { items: [], idx: 0, flipped: false };

  function openReview() {
    if (!book.length) { toast("단어장에 담은 낱말이 없어요"); return; }
    review.items = book.slice();
    review.idx = 0;
    review.flipped = false;
    el.modal.hidden = false;
    document.body.style.overflow = "hidden";
    drawReview();
  }

  function closeReview() {
    el.modal.hidden = true;
    document.body.style.overflow = "";
  }

  function drawReview() {
    var item = review.items[review.idx];
    if (!item) return;
    el.reviewProgress.textContent = (review.idx + 1) + " / " + review.items.length;
    var isHanja = item.type === "hanja";
    el.flipFront.className = "flip-face" + (isHanja ? " hanja-big" : "");
    el.flipFront.textContent = item.title;
    el.flipBack.textContent = item.sub || "";
    el.flipBack.hidden = !review.flipped;
    el.flipFront.hidden = review.flipped;
    el.flipHint.textContent = review.flipped ? "눌러서 낱말 보기" : "눌러서 뜻 보기";
    el.flipCard.classList.toggle("flipped", review.flipped);
    el.reviewPrev.disabled = review.idx === 0;
    el.reviewPrev.style.opacity = review.idx === 0 ? ".45" : "1";
    el.reviewNext.textContent = review.idx === review.items.length - 1 ? "처음으로" : "다음";
  }

  function moveReview(delta) {
    var n = review.items.length;
    review.idx = (review.idx + delta + n) % n;
    review.flipped = false;
    drawReview();
  }

  /* ---------- 이벤트 ---------- */
  var debounceTimer = null;
  el.input.addEventListener("input", function () {
    var v = el.input.value;
    el.clear.hidden = !v;
    clearTimeout(debounceTimer);
    if (!v.trim()) {
      state.seq++;
      showHome();
      return;
    }
    debounceTimer = setTimeout(function () { runSearch(v, { remember: false }); }, 380);
  });

  el.clear.addEventListener("click", function () {
    el.input.value = "";
    el.clear.hidden = true;
    state.seq++;
    setTab(state.tab === "book" ? "all" : state.tab);
    showHome();
    el.input.focus();
  });

  el.form.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = el.input.value.trim();
    if (!v) { toast("찾고 싶은 낱말을 입력해 주세요"); el.input.focus(); return; }
    clearTimeout(debounceTimer);
    if (state.tab === "book") setTab("all");
    runSearch(v);
    el.input.blur();
  });

  el.tabs.addEventListener("click", function (e) {
    var btn = e.target.closest(".tab");
    if (!btn) return;
    var tab = btn.getAttribute("data-tab");
    if (tab === "book") {
      setTab("book");
      showBook();
      return;
    }
    setTab(tab);
    if (state.query && state.view === "result") {
      runSearch(state.query, { remember: false });
    } else if (state.view === "book") {
      if (state.query) runSearch(state.query, { remember: false });
      else showHome();
    }
  });

  el.resultBody.addEventListener("click", onBodyClick);
  el.bookBody.addEventListener("click", onBodyClick);
  el.homeView.addEventListener("click", onBodyClick);

  function onBodyClick(e) {
    var starBtn = e.target.closest("[data-star]");
    if (starBtn) {
      toggleBook({
        type: starBtn.getAttribute("data-type"),
        key: starBtn.getAttribute("data-key"),
        title: starBtn.getAttribute("data-title"),
        sub: starBtn.getAttribute("data-sub"),
        query: starBtn.getAttribute("data-query")
      });
      // 상태 갱신
      var on = starBtn.getAttribute("aria-pressed") === "true";
      starBtn.classList.toggle("is-on", !on);
      starBtn.setAttribute("aria-pressed", String(!on));
      starBtn.innerHTML = icon(!on ? "starFilled" : "star");
      starBtn.setAttribute("aria-label", !on ? "단어장에서 빼기" : "단어장에 담기");
      if (state.view === "book") renderBook();
      return;
    }

    var speakBtn = e.target.closest("[data-speak]");
    if (speakBtn) {
      speakText(speakBtn.getAttribute("data-speak"), speakBtn.getAttribute("data-lang"), speakBtn.getAttribute("data-audio") || "", speakBtn);
      return;
    }

    var delBtn = e.target.closest("[data-del]");
    if (delBtn) {
      var id = delBtn.getAttribute("data-del");
      book = book.filter(function (b) { return b.id !== id; });
      writeStore(KEY_BOOK, book);
      updateBookCount();
      toast("단어장에서 뺐어요");
      return;
    }

    var gotoBook = e.target.closest("[data-goto-book]");
    if (gotoBook) {
      setTab("book");
      showBook();
      openReview();
      return;
    }

    var searchBtn = e.target.closest("[data-search]");
    if (searchBtn) {
      var q = searchBtn.getAttribute("data-search");
      var tab = searchBtn.getAttribute("data-tab");
      if (tab) setTab(tab); else if (state.tab === "book") setTab("all");
      runSearch(q);
      return;
    }
  }

  el.clearRecent.addEventListener("click", function () {
    recent = [];
    writeStore(KEY_RECENT, recent);
    renderRecent();
    toast("검색 기록을 지웠어요");
  });

  el.backHome.addEventListener("click", function () { showHome(); });
  el.backHome2.addEventListener("click", function () { showHome(); });

  el.startReview.addEventListener("click", openReview);
  el.flipCard.addEventListener("click", function () {
    review.flipped = !review.flipped;
    drawReview();
  });
  el.reviewPrev.addEventListener("click", function () { moveReview(-1); });
  el.reviewNext.addEventListener("click", function () { moveReview(1); });
  $$("[data-close-modal]").forEach(function (n) { n.addEventListener("click", closeReview); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !el.modal.hidden) closeReview();
    if (!el.modal.hidden && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      moveReview(e.key === "ArrowRight" ? 1 : -1);
    }
    if (e.key === "/" && document.activeElement !== el.input) {
      e.preventDefault();
      el.input.focus();
    }
  });

  /* ---------- PWA ---------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {});
    });
  }

  /* ---------- 시작 ---------- */
  function init() {
    setTab("all");
    renderHome();
    updateBookCount();
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) {
      document.body.classList.add("standalone");
    }
  }

  init();
})();
