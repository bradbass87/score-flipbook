/*!
 * score-flipbook — self-hosted PDF flipbook widget
 * Replaces per-widget services (e.g. Elfsight Flipbook) with a free embed.
 *
 * Usage (Squarespace Code Block or any HTML page):
 *
 * Image mode (preferred — works from any host, no CORS requirements):
 *   <script src="https://YOURUSER.github.io/score-flipbook/flipbook.js" defer></script>
 *   <div class="score-flipbook"
 *        data-pages="https://example.com/scores/my-score/page-{nn}.jpg"
 *        data-count="16"></div>
 *   {n} = page number (1, 2, …), {nn} = zero-padded (01, 02, …).
 *   data-pages also accepts a comma-separated list of full image URLs.
 *
 * PDF mode (requires a CORS-enabled host, e.g. GitHub Pages —
 * Squarespace-uploaded PDFs will NOT work):
 *   <div class="score-flipbook" data-pdf="https://example.com/score.pdf"></div>
 *
 * Optional attributes:
 *   data-height="700"   max height of the book area in px (default 640)
 *   data-scale="2"      PDF mode render scale; raise for sharper pages (default 2)
 *
 * Libraries (loaded on demand from jsDelivr):
 *   pdfjs-dist (Apache-2.0)  — renders PDF pages to images
 *   page-flip  (MIT)         — page-turn animation (StPageFlip)
 */
(function () {
  'use strict';

  var PDFJS_VERSION = '3.11.174';
  var PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VERSION + '/build/pdf.min.js';
  var PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VERSION + '/build/pdf.worker.min.js';
  var PAGEFLIP_URL = 'https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.js';

  var scriptCache = {};
  function loadScript(src) {
    if (!scriptCache[src]) {
      scriptCache[src] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = resolve;
        s.onerror = function () { reject(new Error('Failed to load ' + src)); };
        document.head.appendChild(s);
      });
    }
    return scriptCache[src];
  }

  var CSS = [
    '.sfb-wrap{position:relative;width:100%;max-width:1100px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-user-select:none;user-select:none}',
    '.sfb-stage{position:relative;padding:0 44px}',
    '.sfb-book{margin:0 auto;touch-action:pan-y}',
    '.sfb-book .stf__parent{margin:0 auto}',
    '.sfb-book .stf__block{box-shadow:0 3px 14px rgba(0,0,0,.28)}',
    // !important guards: host-site theme CSS (e.g. Squarespace's img/canvas
    // max-width rules) must not resize book internals — that squeezes pages.
    '.sfb-page{background:#fff;overflow:hidden}',
    '.sfb-page img{display:block;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;object-fit:contain;-webkit-user-drag:none}',
    '.sfb-book .stf__wrapper,.sfb-book .stf__block,.sfb-book .stf__item{max-width:none!important;max-height:none!important}',
    '.sfb-arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:5;width:36px;height:36px;border-radius:50%;border:none;cursor:pointer;background:rgba(30,30,30,.55);color:#fff;font-size:17px;line-height:36px;text-align:center;padding:0;transition:background .15s,opacity .15s}',
    '.sfb-arrow:hover{background:rgba(30,30,30,.8)}',
    '.sfb-arrow[disabled]{opacity:.25;cursor:default}',
    '.sfb-prev{left:0}.sfb-next{right:0}',
    '.sfb-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-height:220px;color:#777;font-size:13px}',
    '.sfb-spinner{width:30px;height:30px;border:3px solid #ddd;border-top-color:#777;border-radius:50%;animation:sfb-spin .8s linear infinite}',
    '@keyframes sfb-spin{to{transform:rotate(360deg)}}',
    '.sfb-error{padding:28px 16px;text-align:center;color:#a33;font-size:14px;border:1px dashed #d99;border-radius:6px}',
    '@media (max-width:600px){.sfb-stage{padding:0 38px}}'
  ].join('\n');

  function injectStyles() {
    if (document.getElementById('sfb-styles')) return;
    var st = document.createElement('style');
    st.id = 'sfb-styles';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function el(tag, className, html) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function initWidget(container) {
    if (container.dataset.sfbInit) return;
    container.dataset.sfbInit = '1';

    var pdfUrl = container.getAttribute('data-pdf');
    var pagesAttr = container.getAttribute('data-pages');
    var pageCount = parseInt(container.getAttribute('data-count'), 10) || 0;
    var maxHeight = parseInt(container.getAttribute('data-height'), 10) || 640;
    var renderScale = parseFloat(container.getAttribute('data-scale')) || 2;

    var wrap = el('div', 'sfb-wrap');
    var stage = el('div', 'sfb-stage');
    var book = el('div', 'sfb-book');
    var prevBtn = el('button', 'sfb-arrow sfb-prev', '&#10094;');
    var nextBtn = el('button', 'sfb-arrow sfb-next', '&#10095;');
    prevBtn.type = nextBtn.type = 'button';
    prevBtn.setAttribute('aria-label', 'Previous page');
    nextBtn.setAttribute('aria-label', 'Next page');
    var loading = el('div', 'sfb-loading');
    loading.appendChild(el('div', 'sfb-spinner'));
    var loadingText = el('div', null, 'Loading score…');
    loading.appendChild(loadingText);

    stage.appendChild(prevBtn);
    stage.appendChild(book);
    stage.appendChild(nextBtn);
    wrap.appendChild(stage);
    book.appendChild(loading);
    container.appendChild(wrap);

    if (pagesAttr) {
      var urls = expandPageUrls(pagesAttr, pageCount);
      if (!urls.length) {
        book.innerHTML = '';
        book.appendChild(el('div', 'sfb-error', 'score-flipbook: <code>data-pages</code> with a {n}/{nn} pattern also needs <code>data-count</code>.'));
        return;
      }
      // Preload the first page to learn the page aspect ratio, then let
      // PageFlip load the rest itself.
      Promise.all([loadScript(PAGEFLIP_URL), preloadImage(urls[0])])
        .then(function (res) {
          var img = res[1];
          book.innerHTML = '';
          buildBook({ images: urls, pageWidth: img.naturalWidth, pageHeight: img.naturalHeight },
            { wrap: wrap, book: book, prevBtn: prevBtn, nextBtn: nextBtn, maxHeight: maxHeight });
        })
        .catch(function (err) { showError(book, err); });
      return;
    }

    if (!pdfUrl) {
      book.innerHTML = '';
      book.appendChild(el('div', 'sfb-error', 'score-flipbook: missing <code>data-pages</code> or <code>data-pdf</code> attribute.'));
      return;
    }

    Promise.all([loadScript(PDFJS_URL), loadScript(PAGEFLIP_URL)])
      .then(function () {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        return window.pdfjsLib.getDocument({ url: pdfUrl }).promise;
      })
      .then(function (pdf) {
        return renderAllPages(pdf, renderScale, function (done, total) {
          loadingText.textContent = 'Rendering page ' + done + ' of ' + total + '…';
        });
      })
      .then(function (result) {
        book.innerHTML = '';
        buildBook(result, { wrap: wrap, book: book, prevBtn: prevBtn, nextBtn: nextBtn, maxHeight: maxHeight });
      })
      .catch(function (err) { showError(book, err); });
  }

  function showError(book, err) {
    book.innerHTML = '';
    var msg = 'Could not load the score.';
    if (/CORS|NetworkError|Failed to fetch|status 0/i.test(String(err && err.message))) {
      msg += ' The PDF host may not allow cross-site access (CORS) — see the score-flipbook README.';
    }
    book.appendChild(el('div', 'sfb-error', msg));
    if (window.console) console.error('score-flipbook:', err);
  }

  function expandPageUrls(pagesAttr, count) {
    if (pagesAttr.indexOf(',') !== -1) {
      return pagesAttr.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }
    if (!/\{nn?\}/.test(pagesAttr)) return [pagesAttr];
    if (!count) return [];
    var urls = [];
    for (var i = 1; i <= count; i++) {
      var padded = i < 10 ? '0' + i : String(i);
      urls.push(pagesAttr.replace('{nn}', padded).replace('{n}', String(i)));
    }
    return urls;
  }

  function preloadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Failed to load page image ' + src)); };
      img.src = src;
    });
  }

  function renderAllPages(pdf, scale, onProgress) {
    var total = pdf.numPages;
    var images = [];
    var pageW = 0, pageH = 0;

    function renderPage(n) {
      return pdf.getPage(n).then(function (page) {
        var viewport = page.getViewport({ scale: scale });
        if (n === 1) { pageW = viewport.width / scale; pageH = viewport.height / scale; }
        var canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        var ctx = canvas.getContext('2d');
        return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
          images.push(canvas.toDataURL('image/jpeg', 0.92));
          onProgress(n, total);
          canvas.width = canvas.height = 0; // free memory
          if (n < total) return renderPage(n + 1);
        });
      });
    }

    return renderPage(1).then(function () {
      return { images: images, pageWidth: pageW, pageHeight: pageH };
    });
  }

  function buildBook(result, ui) {
    var ratio = result.pageHeight / result.pageWidth;
    var baseH = Math.min(ui.maxHeight, 640);
    var baseW = Math.round(baseH / ratio);

    // HTML mode: each page is a real <img> scaled by the browser, so pages
    // stay sharp on HiDPI displays (canvas mode ignores devicePixelRatio).
    var pages = result.images.map(function (src, i) {
      var page = el('div', 'sfb-page');
      var img = document.createElement('img');
      img.alt = 'Page ' + (i + 1);
      img.src = src;
      page.appendChild(img);
      return page;
    });

    var pageFlip = new window.St.PageFlip(ui.book, {
      width: baseW,
      height: baseH,
      size: 'stretch',
      minWidth: 200,
      maxWidth: baseW * 2,
      minHeight: 150,
      maxHeight: ui.maxHeight * 2,
      usePortrait: true,
      autoSize: true,
      maxShadowOpacity: 0.4,
      showCover: true,
      mobileScrollSupport: true
    });
    pageFlip.loadFromHTML(pages);
    ui.wrap.sfbPageFlip = pageFlip; // debug/scripting handle

    var total = result.images.length;
    function updateUi(idx) {
      // flip events carry the target index; getCurrentPageIndex is stale
      // while a flip animation is still running
      if (typeof idx !== 'number') idx = pageFlip.getCurrentPageIndex();
      ui.prevBtn.disabled = idx <= 0;
      ui.nextBtn.disabled = idx >= total - 1;
    }
    pageFlip.on('flip', function (e) { updateUi(e.data); });
    pageFlip.on('changeOrientation', function () { updateUi(); });
    updateUi();

    ui.prevBtn.addEventListener('click', function () { pageFlip.flipPrev(); });
    ui.nextBtn.addEventListener('click', function () { pageFlip.flipNext(); });

    ui.wrap.tabIndex = 0;
    ui.wrap.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { pageFlip.flipPrev(); e.preventDefault(); }
      if (e.key === 'ArrowRight') { pageFlip.flipNext(); e.preventDefault(); }
    });

  }

  function initAll() {
    injectStyles();
    var nodes = document.querySelectorAll('.score-flipbook[data-pdf], .score-flipbook');
    for (var i = 0; i < nodes.length; i++) initWidget(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
