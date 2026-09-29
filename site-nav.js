/* site-nav.js — 모든 페이지 헤더의 「이동 ▾」 드롭다운 (v1.0, 2026-09-29)
 *
 * 새 페이지를 만들면 아래 SITE_PAGES 에 한 줄만 넣으면 된다 — 모든 페이지 헤더에 자동으로 나타난다.
 *   id    : 페이지 구분자. 각 페이지 헤더의 <span id="site-nav" data-current="id"> 와 맞춘다.
 *   file  : 배포 파일명(버전 없는 이름). b-*.html 에서 열었으면 b- 를 붙여 이동한다.
 *   group : 메뉴 안의 묶음 제목(나온 순서대로 묶인다).
 *   role  : 'all'(학생 포함 모두) · 'teacher'(담당 교사 포함 교사) · 'base'(기본 교사만)
 *   ws    : true 면 학습지에서 넘어갈 때 ?ws=학습지ID 를 붙인다 (SiteNav.setWs).
 * 숨은 페이지(카페·배틀)는 넣지 않는다. 점검/사이트목록_점검.js 가 빠진 페이지를 알려 준다.
 *
 * 페이지 쪽 사용법:
 *   <head> 에 <script src="site-nav.js?v=1.0"></script>
 *   헤더에 <span id="site-nav" data-current="teacher"></span>
 *   로그인 확인 뒤 SiteNav.setRole('student'|'teacher'|'base'), 로그아웃 때 SiteNav.setRole(null)
 */
(function(){
  var SITE_PAGES = [
    { id:'index',   file:'index.html',   icon:'📘', label:'학습지',  group:'학습',      role:'all',     desc:'학습지 풀기' },
    { id:'teacher', file:'teacher.html', icon:'📊', label:'관리',    group:'수업 관리', role:'teacher', desc:'학급·학습지·성적 관리', ws:true },
    { id:'scoring', file:'scoring.html', icon:'✍️', label:'채점',    group:'수업 관리', role:'teacher', desc:'그래프 수동 채점',      ws:true },
    { id:'edit',    file:'edit.html',    icon:'✏️', label:'편집',    group:'수업 관리', role:'teacher', desc:'학습지 편집기',         ws:true },
    { id:'ai',      file:'ai.html',      icon:'🤖', label:'AI 분석', group:'수업 관리', role:'teacher', desc:'예상·빈출 오답, 학생 성취 분석' },
    { id:'qna',     file:'qna.html',     icon:'💬', label:'질문',    group:'소통',      role:'teacher', desc:'학생 질문 답변' },
    { id:'report',  file:'report.html',  icon:'🚨', label:'신고',    group:'소통',      role:'base',    desc:'오류 신고 목록 (기본 교사 전용)' }
  ];
  var RANK = { student:0, teacher:1, base:2 };
  var NEED = { all:0, teacher:1, base:2 };
  var state = { role:null, ws:'' };

  var CSS =
    '.sn-wrap{position:relative;display:inline-flex}' +
    '.sn-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:5px;font-size:12px;font-weight:600;' +
      'font-family:inherit;line-height:1.4;cursor:pointer;white-space:nowrap;background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.28)}' +
    '.sn-btn:hover,.sn-wrap.open .sn-btn{background:rgba(255,255,255,.24)}' +
    '.sn-caret{font-size:9px;opacity:.8;transition:transform .15s}' +
    '.sn-wrap.open .sn-caret{transform:rotate(180deg)}' +
    '.sn-panel{display:none;position:absolute;top:calc(100% + 6px);right:0;z-index:10000;min-width:250px;max-height:calc(100vh - 70px);overflow-y:auto;' +
      'background:#fff;color:#1f2937;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:6px;text-align:left}' +
    '.sn-wrap.open .sn-panel{display:block}' +
    '.sn-group{font-size:11px;font-weight:700;color:#9ca3af;padding:8px 10px 3px;letter-spacing:.3px}' +
    '.sn-item{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:7px;color:#1f2937;text-decoration:none;font-size:13px}' +
    '.sn-item:hover,.sn-item:focus{background:#f3f4f6;outline:none}' +
    '.sn-item.cur{background:#eef2ff;cursor:default}' +
    '.sn-ico{width:20px;text-align:center;font-size:15px;flex:none}' +
    '.sn-txt{display:flex;flex-direction:column;min-width:0}' +
    '.sn-lbl{font-weight:700}' +
    '.sn-desc{font-size:11px;color:#6b7280;white-space:nowrap}' +
    '.sn-cur-mark{margin-left:auto;font-size:11px;color:#4f46e5;font-weight:700;flex:none}' +
    '@media(max-width:520px){.sn-btn .sn-cur-lbl{display:none}.sn-panel{position:fixed;top:52px;right:8px;left:8px;min-width:0}}';

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  // b-index.html 처럼 b- 판에서 열었으면 이동도 b- 판끼리 한다
  function prefix(){ return /(^|\/)b-[^\/]*$/.test(location.pathname) ? 'b-' : ''; }

  function visible(){
    if(state.role == null || !(state.role in RANK)) return [];
    var r = RANK[state.role];
    return SITE_PAGES.filter(function(p){ return r >= NEED[p.role]; });
  }

  function render(){
    var host = document.getElementById('site-nav');
    if(!host) return;
    var cur = host.getAttribute('data-current') || '';
    var pages = visible();
    // 지금 페이지 말고 갈 곳이 없으면 버튼 자체를 숨긴다 (예: 학생 — 지금은 학습지 한 곳뿐)
    var others = pages.filter(function(p){ return p.id !== cur; });
    if(!others.length){ host.innerHTML = ''; host.style.display = 'none'; return; }
    host.style.display = '';
    var curPage = SITE_PAGES.filter(function(p){ return p.id === cur; })[0];
    var pre = prefix(), qs = state.ws ? '?ws=' + encodeURIComponent(state.ws) : '';
    var html = '', lastGroup = null;
    pages.forEach(function(p){
      if(p.group !== lastGroup){ html += '<div class="sn-group">' + esc(p.group) + '</div>'; lastGroup = p.group; }
      var isCur = p.id === cur;
      var href = pre + p.file + (p.ws ? qs : '');
      html += (isCur ? '<div class="sn-item cur" aria-current="page">' : '<a class="sn-item" role="menuitem" href="' + esc(href) + '">') +
        '<span class="sn-ico">' + p.icon + '</span>' +
        '<span class="sn-txt"><span class="sn-lbl">' + esc(p.label) + '</span><span class="sn-desc">' + esc(p.desc) + '</span></span>' +
        (isCur ? '<span class="sn-cur-mark">지금 화면</span></div>' : '</a>');
    });
    host.innerHTML =
      '<span class="sn-wrap">' +
        '<button type="button" class="sn-btn" aria-haspopup="true" aria-expanded="false" title="다른 화면으로 이동">' +
          '<span>' + (curPage ? curPage.icon : '☰') + '</span>' +
          '<span class="sn-cur-lbl">' + esc(curPage ? curPage.label : '이동') + '</span>' +
          '<span class="sn-caret">▼</span>' +
        '</button>' +
        '<div class="sn-panel" role="menu">' + html + '</div>' +
      '</span>';
    var wrap = host.firstChild, btn = wrap.firstChild;
    btn.addEventListener('click', function(e){ e.stopPropagation(); toggle(wrap); });
  }

  function toggle(wrap, force){
    var open = force != null ? force : !wrap.classList.contains('open');
    wrap.classList.toggle('open', open);
    var btn = wrap.querySelector('.sn-btn');
    if(btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function closeAll(){ var w = document.querySelector('#site-nav .sn-wrap.open'); if(w) toggle(w, false); }

  document.addEventListener('click', function(e){
    var w = document.querySelector('#site-nav .sn-wrap.open');
    if(w && !w.contains(e.target)) toggle(w, false);
  });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeAll(); });

  function init(){
    if(!document.getElementById('sn-style')){
      var st = document.createElement('style'); st.id = 'sn-style'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    render();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.SiteNav = {
    pages: SITE_PAGES,
    setRole: function(role){ state.role = role || null; render(); },
    setWs: function(wsId){ wsId = wsId || ''; if(wsId === state.ws) return; state.ws = wsId; render(); }
  };
})();
