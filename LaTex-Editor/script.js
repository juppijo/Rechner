/* =====================================================
   LaTeX Editor — script.js
   Multi-page · Document+Formula modes · Mixed text/math
   ===================================================== */

/* ── Helpers ────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const escHTML = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ── State ─────────────────────────────────────────── */
const state = {
  mode: 'doc',        // 'doc' | 'formula'
  theme: 'dark',
  font: 'font-ibm-plex',
  previewFont: 'pf-crimson',
  a4: true,           // A4 by default in doc mode
  showAllPages: true,
  format: 'display',
  zoom: 1.0,
  currentPage: 0,     // 0-based
  pages: [''],        // array of page content strings
};

const PAGE_SEP = '=== NEUE SEITE ===';

/* ── DOM ────────────────────────────────────────────── */
const body           = document.body;
const latexInput     = $('latexInput');
const lineNumbers    = $('lineNumbers');
const charCount      = $('charCount');
const renderStatus   = $('renderStatus');
const previewInner   = $('previewInner');
const toast          = $('toast');
const pageIndicator  = $('pageIndicator');
const currentPageLabel = $('currentPageLabel');
const totalPageLabel   = $('totalPageLabel');
const zoomLabel        = $('zoomLabel');

/* ── KaTeX ready ────────────────────────────────────── */
let katexReady = false;
function waitForKaTeX(cb) {
  if (typeof katex !== 'undefined' && typeof renderMathInElement !== 'undefined') {
    katexReady = true; cb();
  } else {
    setTimeout(() => waitForKaTeX(cb), 80);
  }
}

const KATEX_OPTS = {
  delimiters: [
    { left: '$$',    right: '$$',    display: true  },
    { left: '$',     right: '$',     display: false },
    { left: '\\[',   right: '\\]',   display: true  },
    { left: '\\(',   right: '\\)',   display: false },
    { left: '\\begin{equation}', right: '\\end{equation}', display: true },
    { left: '\\begin{align}',    right: '\\end{align}',    display: true },
    { left: '\\begin{align*}',   right: '\\end{align*}',   display: true },
    { left: '\\begin{gather}',   right: '\\end{gather}',   display: true },
    { left: '\\begin{cases}',    right: '\\end{cases}',    display: true },
    { left: '\\begin{matrix}',   right: '\\end{matrix}',   display: true },
    { left: '\\begin{pmatrix}',  right: '\\end{pmatrix}',  display: true },
    { left: '\\begin{bmatrix}',  right: '\\end{bmatrix}',  display: true },
  ],
  throwOnError: false,
  errorColor: 'var(--error-color)',
};

/* ════════════════════════════════════════════════════
   DOCUMENT PARSER
   Converts mixed text+LaTeX into HTML paragraphs.
   Handles Markdown-style headings, bold, italic, quotes.
   Math blocks ($$...$$) and inline ($...$) pass through
   as-is; KaTeX auto-render handles them afterwards.
   ════════════════════════════════════════════════════ */
function parseDocToHTML(src) {
  if (!src.trim()) return '';

  // 1. Split into lines
  const lines = src.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // --- Display math block: $$ ... $$ (possibly multi-line)
    if (line.trimStart().startsWith('$$')) {
      let block = line;
      // If $$ is not closed on the same line, gather until next $$
      if ((line.match(/\$\$/g) || []).length < 2) {
        i++;
        while (i < lines.length) {
          block += '\n' + lines[i];
          if (lines[i].trimEnd().endsWith('$$')) break;
          i++;
        }
      }
      out.push(`<div class="math-display">${escHTML(block)}</div>`);
      i++; continue;
    }

    // --- \begin{...} environments
    if (line.trim().startsWith('\\begin{')) {
      let block = line;
      const envMatch = line.match(/\\begin\{([^}]+)\}/);
      const envName  = envMatch ? envMatch[1] : null;
      i++;
      while (i < lines.length) {
        block += '\n' + lines[i];
        if (envName && lines[i].trim() === `\\end{${envName}}`) break;
        i++;
      }
      out.push(`<div class="math-display">${escHTML(block)}</div>`);
      i++; continue;
    }

    // --- Blank line → paragraph break
    if (line.trim() === '') {
      out.push('<p class="para-gap"></p>');
      i++; continue;
    }

    // --- Horizontal rule
    if (/^---+$/.test(line.trim())) {
      out.push('<hr class="doc-hr" />');
      i++; continue;
    }

    // --- Headings
    const h3 = line.match(/^###\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h1 = line.match(/^#\s+(.*)/);
    if (h1) { out.push(`<h1>${inlineFormat(h1[1])}</h1>`); i++; continue; }
    if (h2) { out.push(`<h2>${inlineFormat(h2[1])}</h2>`); i++; continue; }
    if (h3) { out.push(`<h3>${inlineFormat(h3[1])}</h3>`); i++; continue; }

    // --- Blockquote
    if (line.startsWith('> ')) {
      let block = line.slice(2);
      i++;
      while (i < lines.length && lines[i].startsWith('> ')) {
        block += '\n' + lines[i].slice(2);
        i++;
      }
      out.push(`<blockquote>${inlineFormat(block)}</blockquote>`);
      continue;
    }

    // --- Normal paragraph line: collect until blank or special
    let para = line;
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('$$') &&
      !lines[i].trimStart().startsWith('\\begin{') &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('> ') &&
      !/^---+$/.test(lines[i].trim())
    ) {
      para += '\n' + lines[i];
      i++;
    }
    out.push(`<p>${inlineFormat(para)}</p>`);
  }

  return out.join('\n');
}

/* Inline formatting: bold, italic, inline math — minimal but correct */
function inlineFormat(text) {
  // Protect inline math $...$ from HTML escaping (preserve as-is)
  // Strategy: tokenize into math and non-math segments
  const parts = [];
  let rest = text;
  const mathRx = /(\$[^$\n]+?\$)/g;
  let last = 0;
  let m;
  while ((m = mathRx.exec(text)) !== null) {
    // text before match
    parts.push({ type: 'text', val: text.slice(last, m.index) });
    parts.push({ type: 'math', val: m[1] });
    last = m.index + m[0].length;
  }
  parts.push({ type: 'text', val: text.slice(last) });

  return parts.map(p => {
    if (p.type === 'math') return escHTML(p.val);
    let s = escHTML(p.val);
    // Bold **text**
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic *text*
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // newline → space (within paragraph, lines are joined)
    s = s.replace(/\n/g, ' ');
    return s;
  }).join('');
}

/* ── Formula-only wrapper ───────────────────────────── */
function wrapFormula(src, fmt) {
  const t = src.trim();
  if (!t) return '';
  switch (fmt) {
    case 'inline':   return `$${t}$`;
    case 'display':  return `$$\n${t}\n$$`;
    case 'equation': return `\\begin{equation}\n${t}\n\\end{equation}`;
    case 'align':    return `\\begin{align}\n${t}\n\\end{align}`;
    case 'gather':   return `\\begin{gather}\n${t}\n\\end{gather}`;
    case 'matrix':   return `\\begin{pmatrix}\n${t}\n\\end{pmatrix}`;
    case 'cases':    return `\\begin{cases}\n${t}\n\\end{cases}`;
    default:         return `$$\n${t}\n$$`;
  }
}

/* ════════════════════════════════════════════════════
   PAGE MANAGEMENT
   ════════════════════════════════════════════════════ */

/* Save current textarea content into state.pages */
function saveCurrentPage() {
  state.pages[state.currentPage] = latexInput.value;
}

/* Load page into textarea */
function loadPage(idx) {
  saveCurrentPage();
  state.currentPage = idx;
  latexInput.value = state.pages[idx] || '';
  updateLineNumbers();
  updatePageUI();
  scheduleRender();
}

function updatePageUI() {
  const n = state.pages.length;
  pageIndicator.textContent   = `${state.currentPage + 1} / ${n}`;
  currentPageLabel.textContent = state.currentPage + 1;
  totalPageLabel.textContent   = n;
  $('btnPageDel').disabled = n <= 1;
}

function addPage() {
  saveCurrentPage();
  state.pages.splice(state.currentPage + 1, 0, '');
  state.currentPage++;
  latexInput.value = '';
  updateLineNumbers();
  updatePageUI();
  scheduleRender();
  showToast(`📄 Seite ${state.currentPage + 1} hinzugefügt`);
}

function deletePage() {
  if (state.pages.length <= 1) return;
  state.pages.splice(state.currentPage, 1);
  state.currentPage = Math.min(state.currentPage, state.pages.length - 1);
  latexInput.value = state.pages[state.currentPage];
  updateLineNumbers();
  updatePageUI();
  scheduleRender();
  showToast('🗑 Seite gelöscht');
}

/* ════════════════════════════════════════════════════
   RENDER
   ════════════════════════════════════════════════════ */
let renderTimer = null;
function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 180); }

function render() {
  if (!katexReady) return;
  saveCurrentPage();

  // Determine which pages to show
  const pagesToShow = state.showAllPages ? state.pages : [state.pages[state.currentPage]];
  const startIdx    = state.showAllPages ? 0 : state.currentPage;

  previewInner.innerHTML = '';

  pagesToShow.forEach((src, relIdx) => {
    const absIdx = startIdx + relIdx;
    const pageEl = document.createElement('div');
    pageEl.className = state.a4 ? 'page-a4' : 'page-free';
    pageEl.dataset.pageIndex = absIdx;

    // Page number badge
    const badge = document.createElement('div');
    badge.className = 'page-badge';
    badge.textContent = `Seite ${absIdx + 1}`;
    pageEl.appendChild(badge);

    // Content div
    const content = document.createElement('div');
    content.className = 'page-content';

    if (!src.trim()) {
      content.innerHTML = '<span class="empty-hint">Leere Seite…</span>';
    } else {
      if (state.mode === 'doc') {
        try {
          content.innerHTML = parseDocToHTML(src);
        } catch(e) {
          content.innerHTML = `<span class="error-msg">Parse-Fehler: ${escHTML(e.message)}</span>`;
        }
      } else {
        // Formula mode
        const wrapped = wrapFormula(src, state.format);
        const tmp = document.createElement('div');
        tmp.textContent = wrapped;
        content.appendChild(tmp);
      }
    }

    pageEl.appendChild(content);

    // Highlight current page
    if (absIdx === state.currentPage) pageEl.classList.add('page-current');

    // Click to switch
    pageEl.addEventListener('click', () => {
      if (state.currentPage !== absIdx) loadPage(absIdx);
    });

    previewInner.appendChild(pageEl);

    // Apply zoom
    applyZoom();

    // Render math in this page
    try {
      renderMathInElement(content, KATEX_OPTS);
      setStatus('ok', '● OK');
    } catch(e) {
      setStatus('err', '● Fehler');
    }
  });

  updateLineNumbers();
  charCount.textContent = `${latexInput.value.length} Z · ${latexInput.value.split('\n').length} Zeilen`;
}

function setStatus(t, msg) {
  renderStatus.textContent = msg;
  renderStatus.className = t === 'err' ? 'status-err' : 'status-ok';
}

/* ── Zoom ───────────────────────────────────────────── */
function applyZoom() {
  const pages = previewInner.querySelectorAll('.page-a4, .page-free');
  pages.forEach(p => { p.style.transform = `scale(${state.zoom})`; p.style.transformOrigin = 'top center'; });
  previewInner.style.paddingBottom = `${(state.zoom - 1) * 100 + 20}px`;
  zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
}

function setZoom(delta) {
  state.zoom = Math.max(0.3, Math.min(3.0, state.zoom + delta));
  applyZoom();
}

/* ── Line numbers ───────────────────────────────────── */
function updateLineNumbers() {
  const n = latexInput.value.split('\n').length;
  let html = '';
  for (let i = 1; i <= n; i++) html += `<span>${i}</span>`;
  lineNumbers.innerHTML = html;
  lineNumbers.scrollTop = latexInput.scrollTop;
}

/* ── Theme ──────────────────────────────────────────── */
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  body.classList.toggle('theme-dark',  state.theme === 'dark');
  body.classList.toggle('theme-light', state.theme === 'light');
  $('btnTheme').querySelector('.icon-dark').style.display  = state.theme === 'dark'  ? '' : 'none';
  $('btnTheme').querySelector('.icon-light').style.display = state.theme === 'light' ? '' : 'none';
  showToast(state.theme === 'dark' ? '🌙 Dunkles Design' : '☀️ Helles Design');
}

/* ── Font ───────────────────────────────────────────── */
const FONT_CLASSES = ['font-ibm-plex','font-jetbrains','font-fira','font-playfair','font-crimson','font-lora','font-merriweather','font-space'];
function applyEditorFont(cls) {
  FONT_CLASSES.forEach(c => body.classList.remove(c));
  body.classList.add(cls);
  state.font = cls;
}

const PF_CLASSES = ['pf-crimson','pf-lora','pf-merriweather','pf-playfair','pf-space','pf-ibm'];
function applyPreviewFont(cls) {
  PF_CLASSES.forEach(c => body.classList.remove(c));
  body.classList.add(cls);
  state.previewFont = cls;
}

/* ── A4 mode ────────────────────────────────────────── */
function toggleA4() {
  state.a4 = !state.a4;
  $('btnA4').classList.toggle('toggle-btn-active', state.a4);
  scheduleRender();
  showToast(state.a4 ? '📄 A4-Modus AN' : '📄 A4-Modus AUS');
}

/* ── Edit mode ──────────────────────────────────────── */
function setMode(m) {
  state.mode = m;
  $('modeDoc').classList.toggle('mode-active',     m === 'doc');
  $('modeFormula').classList.toggle('mode-active', m === 'formula');
  $('groupFormat').style.display    = m === 'formula' ? '' : 'none';
  $('groupPages').style.display     = m === 'doc'     ? '' : 'none';
  $('docSnipGroup').style.display   = m === 'doc'     ? '' : 'none';
  $('docMathSep').style.display     = m === 'doc'     ? '' : 'none';
  $('btnPageBreak').style.display   = m === 'doc'     ? '' : 'none';
  $('btnInsertDisplay').style.display = m === 'doc'   ? '' : 'none';
  $('btnInsertInline').style.display  = m === 'doc'   ? '' : 'none';
  $('btnInsertAlign').style.display   = m === 'doc'   ? '' : 'none';
  $('editorModeLabel').textContent = m === 'doc' ? 'Dokument' : 'Formel';
  scheduleRender();
}

/* ── Show all pages toggle ──────────────────────────── */
function toggleShowAll() {
  state.showAllPages = !state.showAllPages;
  $('btnShowAll').classList.toggle('pane-btn-active', state.showAllPages);
  $('btnShowAll').textContent = state.showAllPages ? 'Alle Seiten' : 'Nur aktuelle';
  scheduleRender();
}

/* ── Insert helpers ─────────────────────────────────── */
function insertAtCursor(text, moveCursorBack = 0) {
  const start = latexInput.selectionStart;
  const end   = latexInput.selectionEnd;
  const val   = latexInput.value;
  latexInput.value = val.slice(0, start) + text + val.slice(end);
  const pos = start + text.length - moveCursorBack;
  latexInput.selectionStart = latexInput.selectionEnd = pos;
  latexInput.focus();
  scheduleRender();
}

function insertTex(tex) { insertAtCursor(tex); }

function insertPrefix(prefix) {
  const start = latexInput.selectionStart;
  const val   = latexInput.value;
  // Find beginning of line
  const lineStart = val.lastIndexOf('\n', start - 1) + 1;
  latexInput.value = val.slice(0, lineStart) + prefix + val.slice(lineStart);
  latexInput.selectionStart = latexInput.selectionEnd = start + prefix.length;
  latexInput.focus();
  scheduleRender();
}

function insertInline(wrap, wrapEnd) {
  const start = latexInput.selectionStart;
  const end   = latexInput.selectionEnd;
  const val   = latexInput.value;
  const sel   = val.slice(start, end) || 'text';
  const ins   = wrap + sel + wrapEnd;
  latexInput.value = val.slice(0, start) + ins + val.slice(end);
  latexInput.selectionStart = start + wrap.length;
  latexInput.selectionEnd   = start + wrap.length + sel.length;
  latexInput.focus();
  scheduleRender();
}

/* ── File I/O ───────────────────────────────────────── */
function loadFile() { $('fileInput').click(); }

$('fileInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const txt = ev.target.result;
    // If JSON project file
    if (file.name.endsWith('.json')) {
      try {
        const proj = JSON.parse(txt);
        if (proj.pages && Array.isArray(proj.pages)) {
          state.pages = proj.pages;
          state.currentPage = 0;
          latexInput.value = state.pages[0];
          if (proj.mode) setMode(proj.mode);
          updatePageUI();
          scheduleRender();
          showToast(`📂 Projekt "${file.name}" geladen`);
          return;
        }
      } catch(_) {}
    }
    // Plain text / .tex
    state.pages = [txt];
    state.currentPage = 0;
    latexInput.value = txt;
    updatePageUI();
    scheduleRender();
    showToast(`📂 "${file.name}" geladen`);
  };
  reader.readAsText(file);
  e.target.value = '';
});

function saveFile() {
  saveCurrentPage();
  // Save as JSON project (preserves all pages)
  const proj = { mode: state.mode, pages: state.pages };
  const blob = new Blob([JSON.stringify(proj, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = 'dokument.json'; a.click();
  URL.revokeObjectURL(url);
  showToast('💾 Projekt gespeichert (JSON)');
}

function exportHTML() {
  saveCurrentPage();
  const katexCSS = `https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css`;

  const pagesHTML = state.pages.map((src, idx) => {
    const tmp = document.createElement('div');
    if (state.mode === 'doc') {
      tmp.innerHTML = parseDocToHTML(src);
    } else {
      tmp.textContent = wrapFormula(src, state.format);
    }
    renderMathInElement(tmp, { ...KATEX_OPTS, throwOnError: false });
    return `<div class="page" id="page-${idx+1}">\n<div class="page-num">Seite ${idx+1}</div>\n${tmp.innerHTML}\n</div>`;
  }).join('\n<div class="page-divider"></div>\n');

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>LaTeX Export</title>
  <link rel="stylesheet" href="${katexCSS}"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Crimson Pro',Georgia,serif;background:#f5f4f0;color:#1a1a2e;font-size:1.1rem;line-height:1.8;}
    @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap');
    .page{background:#fff;width:210mm;min-height:297mm;margin:2rem auto;padding:25mm 30mm;box-shadow:0 4px 30px rgba(0,0,0,.12);border-radius:2px;position:relative;}
    .page-num{position:absolute;bottom:15mm;right:20mm;font-size:.8rem;color:#aaa;font-family:monospace;}
    .page-divider{height:1rem;}
    h1{font-size:2rem;margin:1.5rem 0 .8rem;border-bottom:2px solid #eee;padding-bottom:.3rem;}
    h2{font-size:1.5rem;margin:1.3rem 0 .6rem;color:#333;}
    h3{font-size:1.2rem;margin:1.1rem 0 .4rem;color:#555;}
    p{margin:.6rem 0;text-align:justify;}
    blockquote{border-left:3px solid #aaa;margin:1rem 0;padding:.5rem 1rem;color:#555;font-style:italic;}
    .math-display{margin:1.2rem 0;overflow-x:auto;text-align:center;}
    hr{border:none;border-top:1px solid #ddd;margin:1.5rem 0;}
    .katex-display{margin:1rem 0;}
    @media print{body{background:#fff;}.page{box-shadow:none;margin:0;page-break-after:always;}.page-divider{display:none;}}
  </style>
</head>
<body>
${pagesHTML}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = 'dokument.html'; a.click();
  URL.revokeObjectURL(url);
  showToast('🌐 HTML exportiert');
}

/* ── Copy ───────────────────────────────────────────── */
async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`📋 ${label} kopiert`);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(`📋 ${label} kopiert`);
  }
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    insertAtCursor(text);
    showToast('📋 Eingefügt');
  } catch { showToast('⚠ Clipboard-Zugriff nicht erlaubt'); }
}

/* ── Fullscreen ─────────────────────────────────────── */
function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
}
document.addEventListener('fullscreenchange', () => {
  const fs = !!document.fullscreenElement;
  $('btnFullscreen').querySelector('.icon-enter').style.display = fs ? 'none' : '';
  $('btnFullscreen').querySelector('.icon-exit').style.display  = fs ? '' : 'none';
});

/* ── Drag resize ────────────────────────────────────── */
function initDivider() {
  const divider = $('paneDivider');
  const main    = $('editorMain');
  let dragging = false, startX, startPct;
  divider.addEventListener('mousedown', e => {
    dragging = true;
    startX   = e.clientX;
    startPct = (divider.previousElementSibling.offsetWidth / main.offsetWidth) * 100;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx  = e.clientX - startX;
    const pct = Math.max(20, Math.min(80, startPct + (dx / main.offsetWidth) * 100));
    main.style.gridTemplateColumns = `${pct}fr 4px ${100 - pct}fr`;
  });
  document.addEventListener('mouseup', () => {
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

/* ── Toast ──────────────────────────────────────────── */
let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

/* ── Event wiring ───────────────────────────────────── */
latexInput.addEventListener('input', () => {
  updateLineNumbers();
  scheduleRender();
});
latexInput.addEventListener('scroll', () => { lineNumbers.scrollTop = latexInput.scrollTop; });

// Tab key
latexInput.addEventListener('keydown', e => {
  if (e.key === 'Tab') { e.preventDefault(); insertAtCursor('  '); }
});

$('formatSelect').addEventListener('change', e => { state.format = e.target.value; scheduleRender(); });
$('fontSelect').addEventListener('change', e => applyEditorFont(e.target.value));
$('previewFontSelect').addEventListener('change', e => applyPreviewFont(e.target.value));

$('modeDoc').addEventListener('click',     () => setMode('doc'));
$('modeFormula').addEventListener('click', () => setMode('formula'));

$('btnPagePrev').addEventListener('click', () => { if (state.currentPage > 0) loadPage(state.currentPage - 1); });
$('btnPageNext').addEventListener('click', () => { if (state.currentPage < state.pages.length - 1) loadPage(state.currentPage + 1); });
$('btnPageAdd').addEventListener('click',  addPage);
$('btnPageDel').addEventListener('click',  deletePage);

$('btnLoad').addEventListener('click',   loadFile);
$('btnSave').addEventListener('click',   saveFile);
$('btnExport').addEventListener('click', exportHTML);
$('btnPrint').addEventListener('click',  () => window.print());
$('btnA4').addEventListener('click',     toggleA4);
$('btnTheme').addEventListener('click',  toggleTheme);
$('btnFullscreen').addEventListener('click', toggleFullscreen);
$('btnShowAll').addEventListener('click',    toggleShowAll);

$('btnClearEditor').addEventListener('click', () => { latexInput.value = ''; scheduleRender(); showToast('🗑 Seite geleert'); });
$('btnPaste').addEventListener('click',     pasteFromClipboard);
$('btnCopyLatex').addEventListener('click', () => copyText(latexInput.value, 'LaTeX'));
$('btnCopyHTML').addEventListener('click',  () => {
  const html = Array.from(previewInner.querySelectorAll('.page-content')).map(e => e.innerHTML).join('\n');
  copyText(html, 'HTML');
});

$('btnZoomIn').addEventListener('click',    () => setZoom(+0.1));
$('btnZoomOut').addEventListener('click',   () => setZoom(-0.1));
$('btnZoomReset').addEventListener('click', () => { state.zoom = 1.0; applyZoom(); });

// Snippets
document.querySelectorAll('.snip[data-tex]').forEach(btn => {
  btn.addEventListener('click', () => insertTex(btn.dataset.tex));
});
document.querySelectorAll('.snip[data-prefix]').forEach(btn => {
  btn.addEventListener('click', () => insertPrefix(btn.dataset.prefix));
});
document.querySelectorAll('.snip[data-inline]').forEach(btn => {
  btn.addEventListener('click', () => insertInline(btn.dataset.inline, btn.dataset.inlineEnd || ''));
});

$('btnInsertDisplay').addEventListener('click', () => insertAtCursor('\n$$\n\n$$\n', 3));
$('btnInsertInline').addEventListener('click',  () => insertAtCursor('$  $', 2));
$('btnInsertAlign').addEventListener('click',   () => insertAtCursor('\n\\begin{align}\n\n\\end{align}\n', 13));
$('btnPageBreak').addEventListener('click', () => {
  insertAtCursor(`\n\n${PAGE_SEP}\n\n`);
  showToast('⏎ Seitenumbruch eingefügt');
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 's') { e.preventDefault(); saveFile(); }
    if (e.key === 'o') { e.preventDefault(); loadFile(); }
    if (e.key === 'e') { e.preventDefault(); exportHTML(); }
    if (e.key === 'd') { e.preventDefault(); toggleTheme(); }
    if (e.key === 'p') { e.preventDefault(); window.print(); }
  }
  if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); }
});

/* ════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════ */
function init() {
  setMode('doc');
  toggleA4(); // default: A4 on (this will flip to off then on — just set directly)
  state.a4 = true;
  $('btnA4').classList.add('toggle-btn-active');

  const defaultDoc =
`# Welleninterferenz — Skalare Betrachtung

Zuerst betrachten wir die Wellen als einfache Zahlen (Skalare), ohne eine Richtung.

Die Amplitude einer Welle an einem bestimmten Ort und zu einer bestimmten Zeit ist:

$$ E_1 = A_1 \\sin(k r_1 - \\omega t) $$

$$ E_2 = A_2 \\sin(k r_2 - \\omega t) $$

Die **Superposition** beider Wellen ergibt:

$$ E_{\\text{ges}} = E_1 + E_2 $$

Bei gleicher Amplitude $A_1 = A_2 = A$ vereinfacht sich dies zu:

$$ E_{\\text{ges}} = 2A \\cos\\!\\left(\\frac{k(r_1 - r_2)}{2}\\right) \\sin\\!\\left(k\\frac{r_1+r_2}{2} - \\omega t\\right) $$

Der Gangunterschied $\\Delta r = r_2 - r_1$ bestimmt dabei, ob es zur *konstruktiven* oder *destruktiven* Interferenz kommt.`;

  state.pages = [defaultDoc, '## Seite 2\n\nHier kommt der nächste Abschnitt…\n\n$$ F = ma $$'];
  state.currentPage = 0;
  latexInput.value = state.pages[0];
  updateLineNumbers();
  updatePageUI();
  initDivider();

  waitForKaTeX(() => {
    render();
    showToast('⚡ Editor bereit');
  });
}

window.addEventListener('DOMContentLoaded', init);
