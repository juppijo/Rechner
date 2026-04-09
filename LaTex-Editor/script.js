/* =====================================================
   LaTeX Editor — script.js
   ===================================================== */

const $ = id => document.getElementById(id);
const escHTML = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ══ State ══════════════════════════════════════════ */
const state = {
  mode: 'doc',
  theme: 'dark',
  font: 'font-ibm-plex',
  a4: true,
  showAllPages: true,
  format: 'display',
  zoom: 1.0,
  currentPage: 0,
  pages: [''],
  stylePanelOpen: true,
  preview: {
    font:          "'Crimson Pro',Georgia,serif",
    fontSize:      17,
    lineH:         1.75,
    letterSpacing: 0,
    paraSpacing:   0.5,
    textColor:     '#dde1f5',
    bgColor:       '#13172a',
    canvasColor:   '#0e1019',
    headColor:     '#8fa0ff',
    accentColor:   '#6c7ef5',
    mathColor:     '#a8d8f0',
    pageWidth:     210,
    pagePad:       20,
    align:         'justify',
    border:        'thin',
    shadow:        'soft',
    indent:        false,
    h1Rule:        true,
  }
};

const PAGE_SEP = '=== NEUE SEITE ===';

/* ══ DOM ════════════════════════════════════════════ */
const body             = document.body;
const latexInput       = $('latexInput');
const lineNumbers      = $('lineNumbers');
const charCount        = $('charCount');
const renderStatus     = $('renderStatus');
const previewInner     = $('previewInner');
const previewScroll    = $('previewScroll');
const toast            = $('toast');
const pageIndicator    = $('pageIndicator');
const currentPageLabel = $('currentPageLabel');
const totalPageLabel   = $('totalPageLabel');
const zoomLabel        = $('zoomLabel');
const stylePanel       = $('stylePanel');

/* ══ KaTeX ══════════════════════════════════════════ */
let katexReady = false;
function waitForKaTeX(cb) {
  if (typeof katex !== 'undefined' && typeof renderMathInElement !== 'undefined') {
    katexReady = true; cb();
  } else { setTimeout(() => waitForKaTeX(cb), 80); }
}

const KATEX_OPTS = {
  delimiters: [
    { left: '$$',  right: '$$',  display: true  },
    { left: '$',   right: '$',   display: false },
    { left: '\\[', right: '\\]', display: true  },
    { left: '\\(', right: '\\)', display: false },
    { left: '\\begin{equation}', right: '\\end{equation}', display: true },
    { left: '\\begin{align}',    right: '\\end{align}',    display: true },
    { left: '\\begin{align*}',   right: '\\end{align*}',   display: true },
    { left: '\\begin{gather}',   right: '\\end{gather}',   display: true },
    { left: '\\begin{cases}',    right: '\\end{cases}',    display: true },
    { left: '\\begin{pmatrix}',  right: '\\end{pmatrix}',  display: true },
    { left: '\\begin{bmatrix}',  right: '\\end{bmatrix}',  display: true },
    { left: '\\begin{matrix}',   right: '\\end{matrix}',   display: true },
  ],
  throwOnError: false,
  errorColor: '#f87171',
};

/* ══ Style presets ══════════════════════════════════ */
const PRESETS = {
  'dark-elegant': {
    font:"'Crimson Pro',Georgia,serif", fontSize:17, lineH:1.75, letterSpacing:0, paraSpacing:0.5,
    textColor:'#dde1f5', bgColor:'#13172a', canvasColor:'#0e1019',
    headColor:'#8fa0ff', accentColor:'#6c7ef5', mathColor:'#a8d8f0',
    pageWidth:210, pagePad:20, align:'justify', border:'thin', shadow:'soft', indent:false, h1Rule:true,
  },
  'light-classic': {
    font:"'Lora',serif", fontSize:16, lineH:1.8, letterSpacing:0, paraSpacing:0.5,
    textColor:'#1a1a2e', bgColor:'#ffffff', canvasColor:'#eeedf7',
    headColor:'#2a2a60', accentColor:'#4554d4', mathColor:'#1a4a7a',
    pageWidth:210, pagePad:22, align:'justify', border:'thin', shadow:'soft', indent:false, h1Rule:true,
  },
  'sepia': {
    font:"'EB Garamond',serif", fontSize:17, lineH:1.85, letterSpacing:0.3, paraSpacing:0.6,
    textColor:'#3b2f1e', bgColor:'#f5efdf', canvasColor:'#e8e0cc',
    headColor:'#6b4c2a', accentColor:'#8b6440', mathColor:'#5a4030',
    pageWidth:210, pagePad:22, align:'justify', border:'left', shadow:'soft', indent:true, h1Rule:true,
  },
  'midnight-blue': {
    font:"'Source Serif 4',serif", fontSize:16, lineH:1.7, letterSpacing:0, paraSpacing:0.5,
    textColor:'#c8d8f8', bgColor:'#0a0e24', canvasColor:'#060810',
    headColor:'#5890ff', accentColor:'#3366ee', mathColor:'#80b0ff',
    pageWidth:210, pagePad:20, align:'left', border:'left', shadow:'glow', indent:false, h1Rule:true,
  },
  'forest': {
    font:"'PT Serif',serif", fontSize:16, lineH:1.8, letterSpacing:0, paraSpacing:0.5,
    textColor:'#d4e8d0', bgColor:'#0e1f12', canvasColor:'#08100a',
    headColor:'#6ed680', accentColor:'#3caa50', mathColor:'#a0d8a0',
    pageWidth:210, pagePad:20, align:'justify', border:'thin', shadow:'soft', indent:false, h1Rule:true,
  },
  'rose': {
    font:"'Libre Baskerville',serif", fontSize:16, lineH:1.8, letterSpacing:0.2, paraSpacing:0.5,
    textColor:'#4a2035', bgColor:'#fff5f8', canvasColor:'#f5e8ec',
    headColor:'#b04060', accentColor:'#d06080', mathColor:'#903050',
    pageWidth:180, pagePad:18, align:'left', border:'thin', shadow:'soft', indent:true, h1Rule:true,
  },
  'print': {
    font:"'Times New Roman',Times,serif", fontSize:12, lineH:1.5, letterSpacing:0, paraSpacing:0.3,
    textColor:'#000000', bgColor:'#ffffff', canvasColor:'#f0f0f0',
    headColor:'#000000', accentColor:'#000000', mathColor:'#000000',
    pageWidth:210, pagePad:25, align:'justify', border:'thin', shadow:'none', indent:true, h1Rule:true,
  },
  'neon': {
    font:"'JetBrains Mono',monospace", fontSize:14, lineH:1.7, letterSpacing:0.5, paraSpacing:0.5,
    textColor:'#00ffcc', bgColor:'#080818', canvasColor:'#040410',
    headColor:'#ff00ff', accentColor:'#00ccff', mathColor:'#ffff00',
    pageWidth:210, pagePad:20, align:'left', border:'left', shadow:'glow', indent:false, h1Rule:false,
  },
};

/* ══ Apply preview styles ═══════════════════════════ */
function applyPreviewStyles() {
  const p = state.preview;
  // Inject a <style> tag
  let el = document.getElementById('previewStyleTag');
  if (!el) { el = document.createElement('style'); el.id = 'previewStyleTag'; document.head.appendChild(el); }

  const borderCSS = {
    none:  'border: none;',
    thin:  `border: 1px solid ${p.bgColor === '#ffffff' || p.bgColor === '#fff5f8' || p.bgColor === '#f5efdf' ? '#ccc' : '#252c55'};`,
    thick: `border: 2px solid ${p.accentColor};`,
    left:  `border: none; border-left: 3px solid ${p.accentColor};`,
  }[p.border] || '';

  const shadowCSS = {
    none: 'box-shadow: none;',
    soft: 'box-shadow: 0 4px 40px rgba(0,0,0,.5);',
    hard: `box-shadow: 6px 6px 0 ${p.accentColor}40;`,
    glow: `box-shadow: 0 0 30px ${p.accentColor}50, 0 0 60px ${p.accentColor}20;`,
  }[p.shadow] || '';

  const indentCSS = p.indent ? '.page-content p { text-indent: 1.5em; }' : '';
  const h1RuleCSS = p.h1Rule
    ? `.page-content h1 { border-bottom: 1px solid ${p.headColor}40; padding-bottom: .4rem; }`
    : '.page-content h1 { border-bottom: none; }';

  el.textContent = `
    #previewScroll {
      background: ${p.canvasColor} !important;
    }
    .page-a4, .page-free {
      background: ${p.bgColor} !important;
      width: ${p.a4 || state.a4 ? p.pageWidth + 'mm' : '100%'} !important;
      padding: ${p.pagePad}mm !important;
      ${borderCSS}
      ${shadowCSS}
    }
    .page-content {
      font-family: ${p.font} !important;
      font-size: ${p.fontSize}px !important;
      line-height: ${p.lineH} !important;
      letter-spacing: ${p.letterSpacing}px !important;
      color: ${p.textColor} !important;
      text-align: ${p.align} !important;
    }
    .page-content p { margin: ${p.paraSpacing}rem 0 !important; }
    .page-content h1 { color: ${p.headColor} !important; font-size: ${Math.round(p.fontSize * 1.9)}px !important; }
    .page-content h2 { color: ${p.headColor} !important; font-size: ${Math.round(p.fontSize * 1.4)}px !important; }
    .page-content h3 { color: ${p.headColor}cc !important; font-size: ${Math.round(p.fontSize * 1.15)}px !important; }
    .page-content strong { color: ${p.textColor} !important; }
    .page-content blockquote { border-left-color: ${p.accentColor} !important; color: ${p.textColor}99 !important; }
    .page-content hr.doc-hr { border-top-color: ${p.accentColor}30 !important; }
    .page-content .katex { color: ${p.mathColor} !important; }
    .page-content .katex-display { color: ${p.mathColor} !important; }
    ${h1RuleCSS}
    ${indentCSS}
  `;
}

/* Sync panel inputs from state.preview */
function syncPanelFromState() {
  const p = state.preview;
  $('spFont').value          = p.font;
  $('spFontSize').value      = p.fontSize;
  $('spLineH').value         = p.lineH;
  $('spLetterSpacing').value = p.letterSpacing;
  $('spParaSpacing').value   = p.paraSpacing;
  $('spPageWidth').value     = p.pageWidth;
  $('spPagePad').value       = p.pagePad;
  $('spIndent').checked      = p.indent;
  $('spH1Rule').checked      = p.h1Rule;

  const colorPairs = [
    ['spTextColor',   'spTextColorHex',   p.textColor],
    ['spBgColor',     'spBgColorHex',     p.bgColor],
    ['spCanvasColor', 'spCanvasColorHex', p.canvasColor],
    ['spHeadColor',   'spHeadColorHex',   p.headColor],
    ['spAccentColor', 'spAccentColorHex', p.accentColor],
    ['spMathColor',   'spMathColorHex',   p.mathColor],
  ];
  colorPairs.forEach(([cid, hid, val]) => {
    const cEl = $(cid), hEl = $(hid);
    if (cEl) cEl.value = val;
    if (hEl) hEl.value = val;
  });

  // Toggle buttons: align
  ['Left','Justify','Center','Right'].forEach(a => {
    const btn = $('spAlign' + a);
    if (btn) btn.classList.toggle('sp-toggle-active', p.align === a.toLowerCase());
  });
  // border
  ['None','Thin','Thick','Left'].forEach(b => {
    const btn = $('spBorder' + b);
    if (btn) btn.classList.toggle('sp-toggle-active', p.border === b.toLowerCase());
  });
  // shadow
  ['None','Soft','Hard','Glow'].forEach(s => {
    const btn = $('spShadow' + s);
    if (btn) btn.classList.toggle('sp-toggle-active', p.shadow === s.toLowerCase());
  });
}

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  Object.assign(state.preview, preset);
  syncPanelFromState();
  applyPreviewStyles();
  showToast(`✨ Stil: ${name}`);
}

/* ══ Doc parser ═════════════════════════════════════ */
function parseDocToHTML(src) {
  if (!src.trim()) return '';
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trimStart().startsWith('$$')) {
      let block = line;
      if ((line.match(/\$\$/g) || []).length < 2) {
        i++;
        while (i < lines.length) { block += '\n' + lines[i]; if (lines[i].trimEnd().endsWith('$$')) break; i++; }
      }
      out.push(`<div class="math-display">${escHTML(block)}</div>`);
      i++; continue;
    }
    if (line.trim().startsWith('\\begin{')) {
      let block = line;
      const m = line.match(/\\begin\{([^}]+)\}/);
      const env = m ? m[1] : null;
      i++;
      while (i < lines.length) { block += '\n' + lines[i]; if (env && lines[i].trim() === `\\end{${env}}`) break; i++; }
      out.push(`<div class="math-display">${escHTML(block)}</div>`);
      i++; continue;
    }
    if (line.trim() === '') { out.push('<p class="para-gap"></p>'); i++; continue; }
    if (/^---+$/.test(line.trim())) { out.push('<hr class="doc-hr" />'); i++; continue; }
    const h3 = line.match(/^###\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h1 = line.match(/^#\s+(.*)/);
    if (h1) { out.push(`<h1>${inlineFmt(h1[1])}</h1>`); i++; continue; }
    if (h2) { out.push(`<h2>${inlineFmt(h2[1])}</h2>`); i++; continue; }
    if (h3) { out.push(`<h3>${inlineFmt(h3[1])}</h3>`); i++; continue; }
    if (line.startsWith('> ')) {
      let block = line.slice(2); i++;
      while (i < lines.length && lines[i].startsWith('> ')) { block += '\n' + lines[i].slice(2); i++; }
      out.push(`<blockquote>${inlineFmt(block)}</blockquote>`); continue;
    }
    let para = line; i++;
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].trimStart().startsWith('$$') && !lines[i].trimStart().startsWith('\\begin{') && !lines[i].startsWith('#') && !lines[i].startsWith('> ') && !/^---+$/.test(lines[i].trim())) {
      para += '\n' + lines[i]; i++;
    }
    out.push(`<p>${inlineFmt(para)}</p>`);
  }
  return out.join('\n');
}

function inlineFmt(text) {
  const parts = [];
  const mathRx = /(\$[^$\n]+?\$)/g;
  let last = 0, m;
  while ((m = mathRx.exec(text)) !== null) {
    parts.push({ t: 'text', v: text.slice(last, m.index) });
    parts.push({ t: 'math', v: m[1] });
    last = m.index + m[0].length;
  }
  parts.push({ t: 'text', v: text.slice(last) });
  return parts.map(p => {
    if (p.t === 'math') return escHTML(p.v);
    let s = escHTML(p.v);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/\n/g, ' ');
    return s;
  }).join('');
}

function wrapFormula(src, fmt) {
  const t = src.trim(); if (!t) return '';
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

/* ══ Pages ══════════════════════════════════════════ */
function saveCurrentPage() { state.pages[state.currentPage] = latexInput.value; }
function loadPage(idx) {
  saveCurrentPage();
  state.currentPage = idx;
  latexInput.value = state.pages[idx] || '';
  updateLineNumbers(); updatePageUI(); scheduleRender();
}
function updatePageUI() {
  const n = state.pages.length;
  pageIndicator.textContent    = `${state.currentPage + 1} / ${n}`;
  currentPageLabel.textContent = state.currentPage + 1;
  totalPageLabel.textContent   = n;
  $('btnPageDel').disabled = n <= 1;
}
function addPage() {
  saveCurrentPage(); state.pages.splice(state.currentPage + 1, 0, '');
  state.currentPage++; latexInput.value = '';
  updateLineNumbers(); updatePageUI(); scheduleRender();
  showToast(`📄 Seite ${state.currentPage + 1} hinzugefügt`);
}
function deletePage() {
  if (state.pages.length <= 1) return;
  state.pages.splice(state.currentPage, 1);
  state.currentPage = Math.min(state.currentPage, state.pages.length - 1);
  latexInput.value = state.pages[state.currentPage];
  updateLineNumbers(); updatePageUI(); scheduleRender();
  showToast('🗑 Seite gelöscht');
}

/* ══ Render ═════════════════════════════════════════ */
let renderTimer = null;
function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(render, 180); }

function render() {
  if (!katexReady) return;
  saveCurrentPage();
  const pagesToShow = state.showAllPages ? state.pages : [state.pages[state.currentPage]];
  const startIdx    = state.showAllPages ? 0 : state.currentPage;
  previewInner.innerHTML = '';

  pagesToShow.forEach((src, relIdx) => {
    const absIdx = startIdx + relIdx;
    const pageEl = document.createElement('div');
    pageEl.className = state.a4 ? 'page-a4' : 'page-free';
    pageEl.dataset.pageIndex = absIdx;

    const badge = document.createElement('div');
    badge.className = 'page-badge';
    badge.textContent = `Seite ${absIdx + 1}`;
    pageEl.appendChild(badge);

    const content = document.createElement('div');
    content.className = 'page-content';

    if (!src.trim()) {
      content.innerHTML = '<span class="empty-hint">Leere Seite…</span>';
    } else if (state.mode === 'doc') {
      try { content.innerHTML = parseDocToHTML(src); }
      catch(e) { content.innerHTML = `<span class="error-msg">Fehler: ${escHTML(e.message)}</span>`; }
    } else {
      const tmp = document.createElement('div');
      tmp.textContent = wrapFormula(src, state.format);
      content.appendChild(tmp);
    }
    pageEl.appendChild(content);
    if (absIdx === state.currentPage) pageEl.classList.add('page-current');
    pageEl.addEventListener('click', () => { if (state.currentPage !== absIdx) loadPage(absIdx); });
    previewInner.appendChild(pageEl);
    try { renderMathInElement(content, KATEX_OPTS); setStatus('ok','● OK'); }
    catch(e) { setStatus('err','● Fehler'); }
  });

  applyZoom();
  updateLineNumbers();
  charCount.textContent = `${latexInput.value.length} Z · ${latexInput.value.split('\n').length} Zeilen`;
}

function setStatus(t, msg) {
  renderStatus.textContent = msg;
  renderStatus.className = t === 'err' ? 'status-err' : 'status-ok';
}

/* ══ Zoom ═══════════════════════════════════════════ */
function applyZoom() {
  previewInner.querySelectorAll('.page-a4,.page-free').forEach(p => {
    p.style.transform = `scale(${state.zoom})`;
    p.style.transformOrigin = 'top center';
    p.style.marginBottom = `${(state.zoom - 1) * p.offsetHeight * 0.5}px`;
  });
  zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
}
function setZoom(delta) { state.zoom = Math.max(0.3, Math.min(3.0, state.zoom + delta)); applyZoom(); }

/* ══ Line numbers ═══════════════════════════════════ */
function updateLineNumbers() {
  const n = latexInput.value.split('\n').length;
  let h = '';
  for (let i = 1; i <= n; i++) h += `<span>${i}</span>`;
  lineNumbers.innerHTML = h;
  lineNumbers.scrollTop = latexInput.scrollTop;
}

/* ══ Theme ══════════════════════════════════════════ */
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  body.classList.toggle('theme-dark',  state.theme === 'dark');
  body.classList.toggle('theme-light', state.theme === 'light');
  $('btnTheme').querySelector('.icon-dark').style.display  = state.theme === 'dark'  ? '' : 'none';
  $('btnTheme').querySelector('.icon-light').style.display = state.theme === 'light' ? '' : 'none';
  showToast(state.theme === 'dark' ? '🌙 Dunkles Design' : '☀️ Helles Design');
}

/* ══ Editor font ════════════════════════════════════ */
const FONT_CLASSES = ['font-ibm-plex','font-jetbrains','font-fira','font-playfair','font-crimson','font-lora','font-merriweather','font-space'];
function applyEditorFont(cls) { FONT_CLASSES.forEach(c => body.classList.remove(c)); body.classList.add(cls); }

/* ══ A4 ═════════════════════════════════════════════ */
function toggleA4() {
  state.a4 = !state.a4;
  $('btnA4').classList.toggle('toggle-btn-active', state.a4);
  applyPreviewStyles(); scheduleRender();
  showToast(state.a4 ? '📄 A4-Modus AN' : '📄 A4-Modus AUS');
}

/* ══ Mode ═══════════════════════════════════════════ */
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

/* ══ Show all ═══════════════════════════════════════ */
function toggleShowAll() {
  state.showAllPages = !state.showAllPages;
  $('btnShowAll').classList.toggle('pane-btn-active', state.showAllPages);
  $('btnShowAll').textContent = state.showAllPages ? 'Alle Seiten' : 'Nur aktuelle';
  scheduleRender();
}

/* ══ Style panel toggle ═════════════════════════════ */
function toggleStylePanel() {
  state.stylePanelOpen = !state.stylePanelOpen;
  stylePanel.classList.toggle('sp-open', state.stylePanelOpen);
  $('btnStylePanel').classList.toggle('pane-btn-active', state.stylePanelOpen);
}

/* ══ Style panel bindings ═══════════════════════════ */
function bindStylePanel() {
  // Font
  $('spFont').addEventListener('change', e => { state.preview.font = e.target.value; applyPreviewStyles(); });

  // Numeric steppers helper
  function bindStepper(inputId, downId, upId, key, step, min, max) {
    const inp = $(inputId);
    $(downId).addEventListener('click', () => {
      state.preview[key] = Math.max(min, Math.round((+inp.value - step) * 100) / 100);
      inp.value = state.preview[key]; applyPreviewStyles();
    });
    $(upId).addEventListener('click', () => {
      state.preview[key] = Math.min(max, Math.round((+inp.value + step) * 100) / 100);
      inp.value = state.preview[key]; applyPreviewStyles();
    });
    inp.addEventListener('input', () => {
      state.preview[key] = Math.max(min, Math.min(max, +inp.value));
      applyPreviewStyles();
    });
  }
  bindStepper('spFontSize',     'spFontSizeDown',  'spFontSizeUp',  'fontSize',      1,    8,  48);
  bindStepper('spLineH',        'spLineHDown',      'spLineHUp',     'lineH',         0.05, 1.0, 3.5);
  bindStepper('spLetterSpacing','spLetterDown',     'spLetterUp',    'letterSpacing', 0.5, -2,  10);
  bindStepper('spParaSpacing',  'spParaDown',       'spParaUp',      'paraSpacing',   0.25, 0,   4);
  bindStepper('spPageWidth',    'spWidthDown',      'spWidthUp',     'pageWidth',     10,  100, 400);
  bindStepper('spPagePad',      'spPadDown',        'spPadUp',       'pagePad',       5,    5,  60);

  // Color pickers
  function bindColor(colorId, hexId, key) {
    const cEl = $(colorId), hEl = $(hexId);
    cEl.addEventListener('input', () => {
      state.preview[key] = cEl.value;
      hEl.value = cEl.value;
      applyPreviewStyles();
    });
    hEl.addEventListener('change', () => {
      const v = hEl.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        state.preview[key] = v;
        cEl.value = v;
        applyPreviewStyles();
      }
    });
  }
  bindColor('spTextColor',   'spTextColorHex',   'textColor');
  bindColor('spBgColor',     'spBgColorHex',     'bgColor');
  bindColor('spCanvasColor', 'spCanvasColorHex', 'canvasColor');
  bindColor('spHeadColor',   'spHeadColorHex',   'headColor');
  bindColor('spAccentColor', 'spAccentColorHex', 'accentColor');
  bindColor('spMathColor',   'spMathColorHex',   'mathColor');

  // Align toggles
  ['Left','Justify','Center','Right'].forEach(a => {
    const btn = $('spAlign' + a);
    if (!btn) return;
    btn.addEventListener('click', () => {
      state.preview.align = a.toLowerCase();
      ['Left','Justify','Center','Right'].forEach(x => $('spAlign'+x)?.classList.remove('sp-toggle-active'));
      btn.classList.add('sp-toggle-active');
      applyPreviewStyles();
    });
  });

  // Border toggles
  ['None','Thin','Thick','Left'].forEach(b => {
    const btn = $('spBorder' + b);
    if (!btn) return;
    btn.addEventListener('click', () => {
      state.preview.border = b.toLowerCase();
      ['None','Thin','Thick','Left'].forEach(x => $('spBorder'+x)?.classList.remove('sp-toggle-active'));
      btn.classList.add('sp-toggle-active');
      applyPreviewStyles();
    });
  });

  // Shadow toggles
  ['None','Soft','Hard','Glow'].forEach(s => {
    const btn = $('spShadow' + s);
    if (!btn) return;
    btn.addEventListener('click', () => {
      state.preview.shadow = s.toLowerCase();
      ['None','Soft','Hard','Glow'].forEach(x => $('spShadow'+x)?.classList.remove('sp-toggle-active'));
      btn.classList.add('sp-toggle-active');
      applyPreviewStyles();
    });
  });

  // Checkboxes
  $('spIndent').addEventListener('change', e => { state.preview.indent = e.target.checked; applyPreviewStyles(); });
  $('spH1Rule').addEventListener('change', e => { state.preview.h1Rule = e.target.checked; applyPreviewStyles(); });

  // Presets
  document.querySelectorAll('.sp-preset').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });

  // Reset
  $('spReset').addEventListener('click', () => {
    applyPreset('dark-elegant');
    showToast('↺ Stil zurückgesetzt');
  });
}

/* ══ Insert helpers ═════════════════════════════════ */
function insertAtCursor(text, back = 0) {
  const s = latexInput.selectionStart, e = latexInput.selectionEnd;
  latexInput.value = latexInput.value.slice(0, s) + text + latexInput.value.slice(e);
  latexInput.selectionStart = latexInput.selectionEnd = s + text.length - back;
  latexInput.focus(); scheduleRender();
}
function insertPrefix(prefix) {
  const s = latexInput.selectionStart;
  const ls = latexInput.value.lastIndexOf('\n', s - 1) + 1;
  latexInput.value = latexInput.value.slice(0, ls) + prefix + latexInput.value.slice(ls);
  latexInput.selectionStart = latexInput.selectionEnd = s + prefix.length;
  latexInput.focus(); scheduleRender();
}
function insertInline(wrap, end) {
  const s = latexInput.selectionStart, e = latexInput.selectionEnd;
  const sel = latexInput.value.slice(s, e) || 'text';
  const ins = wrap + sel + end;
  latexInput.value = latexInput.value.slice(0, s) + ins + latexInput.value.slice(e);
  latexInput.selectionStart = s + wrap.length;
  latexInput.selectionEnd   = s + wrap.length + sel.length;
  latexInput.focus(); scheduleRender();
}

/* ══ File I/O ═══════════════════════════════════════ */
function loadFile() { $('fileInput').click(); }
$('fileInput').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const txt = ev.target.result;
    if (file.name.endsWith('.json')) {
      try {
        const proj = JSON.parse(txt);
        if (proj.pages) {
          state.pages = proj.pages; state.currentPage = 0;
          latexInput.value = state.pages[0];
          if (proj.mode) setMode(proj.mode);
          if (proj.preview) { Object.assign(state.preview, proj.preview); syncPanelFromState(); applyPreviewStyles(); }
          updatePageUI(); scheduleRender();
          showToast(`📂 "${file.name}" geladen`); return;
        }
      } catch(_) {}
    }
    state.pages = [txt]; state.currentPage = 0;
    latexInput.value = txt; updatePageUI(); scheduleRender();
    showToast(`📂 "${file.name}" geladen`);
  };
  reader.readAsText(file); e.target.value = '';
});

function saveFile() {
  saveCurrentPage();
  const proj = { mode: state.mode, pages: state.pages, preview: state.preview };
  const blob = new Blob([JSON.stringify(proj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'dokument.json'; a.click();
  URL.revokeObjectURL(url);
  showToast('💾 Projekt gespeichert');
}

function exportHTML() {
  saveCurrentPage();
  const p = state.preview;
  const pagesHTML = state.pages.map((src, idx) => {
    const tmp = document.createElement('div');
    if (state.mode === 'doc') tmp.innerHTML = parseDocToHTML(src);
    else tmp.textContent = wrapFormula(src, state.format);
    renderMathInElement(tmp, { ...KATEX_OPTS, throwOnError: false });
    return `<div class="page" id="page-${idx+1}"><div class="page-num">${idx+1}</div>${tmp.innerHTML}</div>`;
  }).join('\n');

  const borderCSS = { none:'border:none', thin:'border:1px solid #ccc', thick:`border:2px solid ${p.accentColor}`, left:`border:none;border-left:3px solid ${p.accentColor}` }[p.border] || '';
  const shadowCSS = { none:'box-shadow:none', soft:'box-shadow:0 4px 30px rgba(0,0,0,.12)', hard:`box-shadow:6px 6px 0 ${p.accentColor}40`, glow:`box-shadow:0 0 30px ${p.accentColor}40` }[p.shadow] || '';

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"/>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css"/>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,700;1,400&family=Lora:ital,wght@0,400;0,700;1,400&family=EB+Garamond:ital,wght@0,400;0,700;1,400&family=Space+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<title>Export</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{background:${p.canvasColor};padding:2rem;}
.page{font-family:${p.font};font-size:${p.fontSize}px;line-height:${p.lineH};letter-spacing:${p.letterSpacing}px;color:${p.textColor};background:${p.bgColor};text-align:${p.align};width:${p.pageWidth}mm;min-height:297mm;padding:${p.pagePad}mm;margin:0 auto 2rem;position:relative;${borderCSS};${shadowCSS};}
.page-num{position:absolute;bottom:10mm;right:12mm;font-size:.75rem;color:${p.textColor}55;font-family:monospace;}
h1{font-size:${Math.round(p.fontSize*1.9)}px;color:${p.headColor};margin:0 0 .8rem;${p.h1Rule?`border-bottom:1px solid ${p.headColor}40;padding-bottom:.3rem`:''};}
h2{font-size:${Math.round(p.fontSize*1.4)}px;color:${p.headColor};margin:1.2rem 0 .5rem;}
h3{font-size:${Math.round(p.fontSize*1.15)}px;color:${p.headColor}cc;margin:1rem 0 .4rem;}
p{margin:${p.paraSpacing}rem 0;${p.indent?'text-indent:1.5em':''}}
blockquote{border-left:3px solid ${p.accentColor};margin:1rem 0;padding:.4rem 1rem;color:${p.textColor}99;font-style:italic;}
.math-display{margin:1.2rem 0;text-align:center;overflow-x:auto;}
.katex,.katex-display{color:${p.mathColor};}
.katex-display{margin:1rem 0;overflow-x:auto;}
@media print{body{background:#fff;padding:0;}.page{box-shadow:none !important;margin:0 auto;page-break-after:always;}}
</style></head><body>${pagesHTML}</body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'dokument.html'; a.click();
  URL.revokeObjectURL(url);
  showToast('🌐 HTML exportiert');
}

/* ══ Copy ═══════════════════════════════════════════ */
async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); }
  catch { const t = document.createElement('textarea'); t.value=text; t.style.position='fixed'; t.style.opacity='0'; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); }
  showToast(`📋 ${label} kopiert`);
}
async function pasteFromClipboard() {
  try { const t = await navigator.clipboard.readText(); insertAtCursor(t); showToast('📋 Eingefügt'); }
  catch { showToast('⚠ Clipboard-Zugriff nicht erlaubt'); }
}

/* ══ Fullscreen ═════════════════════════════════════ */
function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
}
document.addEventListener('fullscreenchange', () => {
  const fs = !!document.fullscreenElement;
  $('btnFullscreen').querySelector('.icon-enter').style.display = fs ? 'none' : '';
  $('btnFullscreen').querySelector('.icon-exit').style.display  = fs ? '' : 'none';
});

/* ══ Drag resize ════════════════════════════════════ */
function initDivider() {
  const divider = $('paneDivider'), main = $('editorMain');
  let dragging=false, startX, startPct;
  divider.addEventListener('mousedown', e => {
    dragging=true; startX=e.clientX;
    startPct=(divider.previousElementSibling.offsetWidth/main.offsetWidth)*100;
    document.body.style.cursor='col-resize'; document.body.style.userSelect='none';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const pct=Math.max(20,Math.min(80,startPct+(e.clientX-startX)/main.offsetWidth*100));
    main.style.gridTemplateColumns=`${pct}fr 4px ${100-pct}fr`;
  });
  document.addEventListener('mouseup', () => { dragging=false; document.body.style.cursor=''; document.body.style.userSelect=''; });
}

/* ══ Toast ══════════════════════════════════════════ */
let toastTimer;
function showToast(msg) {
  toast.textContent=msg; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove('show'),2200);
}

/* ══ Event wiring ═══════════════════════════════════ */
latexInput.addEventListener('input', () => { updateLineNumbers(); scheduleRender(); });
latexInput.addEventListener('scroll', () => { lineNumbers.scrollTop = latexInput.scrollTop; });
latexInput.addEventListener('keydown', e => { if(e.key==='Tab'){e.preventDefault();insertAtCursor('  ');} });

$('formatSelect').addEventListener('change', e => { state.format = e.target.value; scheduleRender(); });
$('fontSelect').addEventListener('change', e => applyEditorFont(e.target.value));

$('modeDoc').addEventListener('click',     () => setMode('doc'));
$('modeFormula').addEventListener('click', () => setMode('formula'));

$('btnPagePrev').addEventListener('click', () => { if(state.currentPage>0) loadPage(state.currentPage-1); });
$('btnPageNext').addEventListener('click', () => { if(state.currentPage<state.pages.length-1) loadPage(state.currentPage+1); });
$('btnPageAdd').addEventListener('click',  addPage);
$('btnPageDel').addEventListener('click',  deletePage);

$('btnLoad').addEventListener('click',    loadFile);
$('btnSave').addEventListener('click',    saveFile);
$('btnExport').addEventListener('click',  exportHTML);
$('btnPrint').addEventListener('click',   () => window.print());
$('btnA4').addEventListener('click',      toggleA4);
$('btnTheme').addEventListener('click',   toggleTheme);
$('btnFullscreen').addEventListener('click', toggleFullscreen);
$('btnShowAll').addEventListener('click',    toggleShowAll);
$('btnStylePanel').addEventListener('click', toggleStylePanel);

$('btnClearEditor').addEventListener('click', () => { latexInput.value=''; scheduleRender(); showToast('🗑 Seite geleert'); });
$('btnPaste').addEventListener('click',    pasteFromClipboard);
$('btnCopyLatex').addEventListener('click',() => copyText(latexInput.value,'LaTeX'));
$('btnCopyHTML').addEventListener('click', () => {
  const html = Array.from(previewInner.querySelectorAll('.page-content')).map(e=>e.innerHTML).join('\n');
  copyText(html,'HTML');
});

$('btnZoomIn').addEventListener('click',    () => setZoom(+0.1));
$('btnZoomOut').addEventListener('click',   () => setZoom(-0.1));
$('btnZoomReset').addEventListener('click', () => { state.zoom=1.0; applyZoom(); });

document.querySelectorAll('.snip[data-tex]').forEach(b => b.addEventListener('click', () => insertAtCursor(b.dataset.tex)));
document.querySelectorAll('.snip[data-prefix]').forEach(b => b.addEventListener('click', () => insertPrefix(b.dataset.prefix)));
document.querySelectorAll('.snip[data-inline]').forEach(b => b.addEventListener('click', () => insertInline(b.dataset.inline, b.dataset.inlineEnd||'')));

$('btnInsertDisplay').addEventListener('click', () => insertAtCursor('\n$$\n\n$$\n', 3));
$('btnInsertInline').addEventListener('click',  () => insertAtCursor('$  $', 2));
$('btnInsertAlign').addEventListener('click',   () => insertAtCursor('\n\\begin{align}\n\n\\end{align}\n', 13));
$('btnPageBreak').addEventListener('click', () => { insertAtCursor(`\n\n${PAGE_SEP}\n\n`); showToast('⏎ Seitenumbruch eingefügt'); });

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key==='s'){e.preventDefault();saveFile();}
    if (e.key==='o'){e.preventDefault();loadFile();}
    if (e.key==='e'){e.preventDefault();exportHTML();}
    if (e.key==='d'){e.preventDefault();toggleTheme();}
    if (e.key==='p'){e.preventDefault();window.print();}
  }
  if (e.key==='F11'){e.preventDefault();toggleFullscreen();}
});

/* ══ Init ═══════════════════════════════════════════ */
function init() {
  setMode('doc');
  state.a4 = true;
  $('btnA4').classList.add('toggle-btn-active');

  const defaultDoc = `# Welleninterferenz — Skalare Betrachtung

Zuerst betrachten wir die Wellen als einfache Zahlen (Skalare), ohne eine Richtung.
Die Amplitude einer Welle an einem bestimmten Ort und zu einer bestimmten Zeit ist:

$$ E_1 = A_1 \\sin(k r_1 - \\omega t) $$

$$ E_2 = A_2 \\sin(k r_2 - \\omega t) $$

Die **Superposition** beider Wellen ergibt die **Gesamtamplitude**:

$$ E_{\\text{ges}} = E_1 + E_2 $$

Bei gleicher Amplitude $A_1 = A_2 = A$ vereinfacht sich dies zu:

$$ E_{\\text{ges}} = 2A \\cos\\!\\left(\\frac{k(r_1 - r_2)}{2}\\right) \\sin\\!\\left(k\\frac{r_1+r_2}{2} - \\omega t\\right) $$

Der **Gangunterschied** $\\Delta r = r_2 - r_1$ bestimmt, ob *konstruktive* oder *destruktive* Interferenz auftritt.`;

  state.pages = [defaultDoc, `## Interferenzbedingungen\n\nKonstruktive Interferenz tritt auf, wenn:\n\n$$ \\Delta r = n \\lambda, \\quad n \\in \\mathbb{Z} $$\n\nDestruktive Interferenz tritt auf, wenn:\n\n$$ \\Delta r = \\left(n + \\frac{1}{2}\\right)\\lambda $$\n\nDabei ist $\\lambda$ die **Wellenlänge** der Welle.`];
  state.currentPage = 0;
  latexInput.value = state.pages[0];

  updateLineNumbers();
  updatePageUI();
  initDivider();
  bindStylePanel();
  stylePanel.classList.add('sp-open');

  waitForKaTeX(() => {
    applyPreviewStyles();
    render();
    showToast('⚡ Editor bereit');
  });
}

window.addEventListener('DOMContentLoaded', init);
