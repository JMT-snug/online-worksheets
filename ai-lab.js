/* ═══════════════════════════════════════════════════════════════
   ai-lab.js — 🤖 AI 분석실(ai.html) 계산 로직 (화면·Firebase 없이 도는 순수 함수만)

   ai.html 이 <script src="ai-lab.js?v=버전"> 으로 읽는다. grading.js(questionHistory·recordHistoryStats)를 먼저 읽어야 한다.
   검증: 검증_AI분석실.js 가 이 파일을 그대로 불러 시나리오를 돌린다 — 여기 함수를 고치면 그것도 돌릴 것.

   ■ 오답 유형 분류표 (2026-09-29)
     예상 오답(aiReview.traps · 문항 aiTraps)과 빈출 오답(wrongAnalysis.items · 문항 freqTraps)마다
     유형 코드 `sub`(예: 'calc.sign')를 하나씩 붙인다. 대분류는 코드 앞부분('calc')이다.
     · 기본 유형(TAX_BASE)은 코드에 고정 — **코드를 바꾸거나 지우지 말 것**(쌓인 기록이 그 코드를 가리킨다).
     · 교사가 더한 유형은 Firestore config/errorTaxonomy.subs:[{code,cat,name,desc,hidden,at,by}] — 코드는 '{대분류}.u{번호}'.
       지우지 않고 숨기기(hidden)만 한다. 숨긴 유형은 AI 에 보내지 않지만 이미 붙은 기록은 그대로 보인다.
     · 합치기(v1.1) — 교사 유형의 오답을 모두 기존 유형으로 옮기고 그 유형은 hidden + mergedInto:'옮긴 곳' 으로 남긴다.
     · subManual:true — 교사가 직접 고른 유형. 다시 분석해도 AI 가 덮어쓰지 않는다.
   ═══════════════════════════════════════════════════════════════ */

const TAX_BASE = [
  { code:'calc', name:'계산 실수', icon:'🧮', color:'#2563eb', subs:[
    ['calc.sign',  '부호',          '음수·부호를 빠뜨리거나 반대로 씀 (괄호 앞 − 처리, 이항할 때 부호 등)'],
    ['calc.arith', '사칙계산·약분', '덧셈·곱셈·나눗셈, 통분·약분, 분수·소수 계산을 틀림'],
    ['calc.paren', '괄호·분배',     '괄호를 풀거나 분배법칙을 적용할 때 일부 항을 빠뜨림'],
    ['calc.power', '거듭제곱·근호', '지수법칙·거듭제곱·제곱근 계산을 틀림'],
    ['calc.copy',  '옮겨 적기',     '문제의 수나 앞 줄의 식을 잘못 옮겨 적음'],
  ]},
  { code:'concept', name:'개념 오해', icon:'💡', color:'#7c3aed', subs:[
    ['concept.def',     '정의·용어',        '용어나 정의를 잘못 알고 있음'],
    ['concept.prop',    '성질·법칙 혼동',   '성질·법칙을 잘못 기억하거나 성립하지 않는 곳에 적용함'],
    ['concept.formula', '공식 오적용',      '공식을 잘못 기억하거나 맞지 않는 공식을 씀'],
    ['concept.confuse', '비슷한 개념 혼동', '비슷한 개념·용어를 서로 바꿔 씀 (예: 약수와 배수, 둘레와 넓이)'],
  ]},
  { code:'proc', name:'풀이 과정', icon:'🪜', color:'#0d9488', subs:[
    ['proc.stop',   '중간에서 멈춤',  '중간 결과를 답으로 냄 — 마지막 단계를 빠뜨림'],
    ['proc.method', '방법·순서 잘못', '풀이 방법을 잘못 고르거나 계산 순서를 지키지 않음'],
    ['proc.cond',   '조건·범위 누락', '주어진 조건·범위를 빠뜨리거나 구한 해를 검토하지 않음'],
  ]},
  { code:'read', name:'문제 이해', icon:'📖', color:'#d97706', subs:[
    ['read.goal',   '묻는 것 오해',      '문제가 구하라는 것과 다른 값을 구함'],
    ['read.cond',   '조건 잘못 읽음',    '문제의 수·조건을 잘못 읽거나 빠뜨려 읽음'],
    ['read.figure', '그림·그래프·표',    '그림·그래프·표의 정보를 잘못 읽음'],
  ]},
  { code:'form', name:'표현·형식', icon:'✏️', color:'#db2777', subs:[
    ['form.unit',     '단위',         '단위를 빠뜨리거나 바꾸지 않음'],
    ['form.simplify', '최종 꼴 정리', '기약분수·동류항 정리 등 답을 끝까지 정리하지 않음'],
    ['form.notation', '답 표기 형식', '답을 쓰는 형식(순서쌍·부등호·기호 등)이 요구와 다름'],
  ]},
  { code:'etc', name:'기타', icon:'❓', color:'#78716c', subs:[
    ['etc.unknown', '원인 불명확', '어디에도 맞지 않거나 원인을 알 수 없음'],
  ]},
];
const TAX_UNKNOWN = 'etc.unknown';

/** 분류표 = 기본 + 교사가 더한 것. { cats:[{code,name,icon,color,subs:[…]}], byCode:{code:{…}} } */
function buildTaxonomy(custom){
  const cats = TAX_BASE.map(c=>({ code:c.code, name:c.name, icon:c.icon, color:c.color,
    subs:c.subs.map(([code,name,desc])=>({ code, name, desc, cat:c.code, custom:false, hidden:false })) }));
  const catMap = new Map(cats.map(c=>[c.code,c]));
  (custom||[]).forEach(s=>{
    if(!s || !s.code || !s.name) return;
    const c = catMap.get(s.cat) || catMap.get(String(s.code).split('.')[0]);
    if(!c || c.subs.some(x=>x.code===s.code)) return;
    c.subs.push({ code:String(s.code), name:String(s.name), desc:String(s.desc||''), cat:c.code, custom:true, hidden:!!s.hidden, at:s.at||'', by:s.by||'', mergedInto:s.mergedInto||'' });
  });
  const byCode = {};
  cats.forEach(c=>c.subs.forEach(s=>{ byCode[s.code]={ ...s, catName:c.name, icon:c.icon, color:c.color }; }));
  return { cats, byCode };
}
/** AI 에 보내는 분류표 — 숨긴 유형은 뺀다 */
function taxForAI(tax){
  const out=[];
  tax.cats.forEach(c=>c.subs.forEach(s=>{ if(!s.hidden) out.push({ code:s.code, cat:c.code, catName:c.name, name:s.name, desc:s.desc }); }));
  return out;
}
const catOf = code => String(code||'').split('.')[0];
/** 화면 표시용 이름 — "계산 실수 › 부호". 모르는 코드면 코드 그대로, 없으면 '' */
function typeName(tax, code, sep=' › '){
  if(!code) return '';
  const s=tax.byCode[code];
  return s ? s.catName+sep+s.name : code;
}
/** 새 교사 유형 코드 — '{대분류}.u{번호}' (번호는 전체에서 가장 큰 것 + 1, 숨긴 것 포함) */
function nextCustomCode(tax, cat){
  let n=0;
  Object.keys(tax.byCode).forEach(code=>{ const m=/\.u(\d+)$/.exec(code); if(m) n=Math.max(n,+m[1]); });
  return cat+'.u'+(n+1);
}

/* ── 답 비교 (teacher·index 의 _trapNorm/_multiNums 와 같은 규칙 — 바꾸면 셋 다 바꿀 것) ── */
function trapNorm(v){
  return String(v??'').trim().toLowerCase()
    .replace(/\s+|,/g,'')
    .replace(/[−–—]/g,'-').replace(/[×✕]/g,'*').replace(/[÷]/g,'/')
    .replace(/[≤]/g,'<=').replace(/[≥]/g,'>=')
    .replace(/^\+/,'');
}
/** 객관식 오답 기록은 0부터 세는 보기 번호("0,2") — 예상·빈출 오답은 1부터 세는 번호("1,3")로 적는다 */
function multiNums(raw){
  const s=String(raw??'').trim();
  if(!s || !/^\d+(,\d+)*$/.test(s)) return s;
  return s.split(',').map(n=>String(+n+1)).join(',');
}
function ansForCompare(q, raw){ return q?.type==='multi' ? multiNums(raw) : String(raw??''); }
function studentAnsText(q, raw){
  if(q?.type!=='multi') return String(raw??'');
  const nums=multiNums(raw);
  if(!/^\d+(,\d+)*$/.test(nums)) return String(raw??'');
  const texts=nums.split(',').map(n=>(q.options||[])[+n-1]).filter(t=>t!=null);
  return nums+'번'+(texts.length?` (${texts.join(' / ')})`:'');
}
const AI_SKIP_TYPES = new Set(['graph','link','pool_random']);
const plainText = (s,n) => String(s||'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').slice(0,n);
/** AI 에 보낼 정답 요약 (edit·teacher 와 같은 꼴) */
function aiAnswerSummary(q){
  if(q.type==='multi'){
    const opts=(q.options||[]).map((o,i)=>`${i+1}.${o}`).join(' / ');
    return `보기: ${opts} / 정답 번호: ${(q.answer||[]).map(i=>i+1).join(',')}`;
  }
  if(q.type==='step3') return (q.steps||[]).map((s,i)=>`${i+1}단계 정답:${s.answer}`).join(' / ');
  return q.answer!=null && q.answer!=='' ? String(q.answer) : null;
}

/* ══════════ 🕳 예상 오답 기록 (aiReview) ══════════
   aiReview = { at, count, traps:[{idx, qid, wrong, path, label, sub, subManual?, on, at}], coverage, findings? }
   · edit v4.x 까지는 edit 가 만들었고(idx 만), edit v5.0 부터는 AI 분석실만 만든다. findings(문항 점검)는 edit 의 aiCheck 로 옮겨 갔다
     — 예전 기록에 남은 findings 는 건드리지 않고 그대로 둔다.
   · qid(2026-09-29) — edit 가 문항 순서를 바꾸면 idx 가 어긋나므로 문항 id 도 적는다. 없는 옛 항목은 처음 읽을 때 지금 순서로 채운다.
   · 예전처럼 검토를 거듭해도 쌓이고(같은 문항·같은 오답은 한 번), 체크를 푼 것(on:false)은 다시 올라오지 않는다. */
function reviewQuestions(ws){
  return (ws?.questions||[]).map((q,i)=>({ idx:i, qid:q.id, type:q.type, text:plainText(q.text,1200), answer:aiAnswerSummary(q) }))
    .filter(q=>!AI_SKIP_TYPES.has(q.type) && q.answer!=null);
}
/** 저장된 기록 (없는데 옛 방식의 aiTraps 만 있으면 그것으로 만든다 · count 0). 항목에 qid 를 채워 돌려준다 */
function loadReviewRecord(ws){
  const qsArr=ws?.questions||[];
  const idOf=i=>qsArr[i]?.id;
  const r=ws?.aiReview;
  if(r && Array.isArray(r.traps)){
    return { ...r, at:r.at||'', count:r.count||0, coverage:r.coverage||null,
      traps:r.traps.map(t=>({ ...t, qid:t.qid||idOf(t.idx)||'' })) };
  }
  const legacy=[];
  qsArr.forEach((q,i)=>(q.aiTraps||[]).forEach(t=>legacy.push({ idx:i, qid:q.id, wrong:String(t.wrong??''), path:String(t.path??''),
    label:String(t.label??''), ...(t.sub?{sub:t.sub}:{}), on:true, at:'' })));
  return legacy.length ? { at:'', count:0, traps:legacy, coverage:null } : null;
}
/** 새 결과를 기록에 합친다 — 새 오답은 더하고, 이미 있는 오답은 유형만 채운다(비어 있고 교사가 고른 게 아니면) */
function mergeReview(prev, out, qs, now){
  now=now||new Date().toISOString();
  const qById=new Map(qs.map(q=>[q.idx,q]));
  const traps=(prev?.traps||[]).map(t=>({...t}));
  let added=0, typed=0;
  (out.traps||[]).forEach(t=>{
    const q=qById.get(t?.idx);
    if(!t || !t.wrong || !t.path || !q) return;
    const key=trapNorm(t.wrong);
    const ex=traps.find(x=>(x.qid ? x.qid===q.qid : x.idx===q.idx) && trapNorm(x.wrong)===key);
    if(ex){ if(t.type && !ex.sub && !ex.subManual){ ex.sub=t.type; typed++; } return; }
    const o={ idx:q.idx, qid:q.qid, wrong:String(t.wrong).slice(0,60), path:String(t.path).slice(0,200), label:String(t.label||'').slice(0,20), on:true, at:now };
    if(t.type) o.sub=t.type;
    traps.push(o); added++;
  });
  return { ...(prev||{}), at:now, count:(prev?.count||0)+1, traps, coverage:out.coverage||prev?.coverage||null, _added:added, _typed:typed };
}
/** 저장할 기록 (화면용 _필드 빼고) */
function storedReview(rec){
  const o={}; Object.keys(rec).forEach(k=>{ if(k[0]!=='_') o[k]=rec[k]; }); return o;
}
/** 문항의 aiTraps 를 기록의 on 인 것으로 다시 만든다 — 문항은 qid 로(없으면 idx) 맞춘다 */
function withAiTraps(questions, rec){
  const byQ=new Map();
  (rec?.traps||[]).filter(t=>t.on).forEach(t=>{
    const qid=t.qid || questions[t.idx]?.id; if(!qid) return;
    if(!byQ.has(qid)) byQ.set(qid,[]);
    byQ.get(qid).push({ wrong:t.wrong, path:t.path, label:t.label||'', ...(t.sub?{sub:t.sub}:{}) });
  });
  return (questions||[]).map(q=>{ const c={...q}; const l=byQ.get(q.id); if(l?.length) c.aiTraps=l; else delete c.aiTraps; return c; });
}

/* ══════════ 📊 빈출 오답 (wrongAnalysis) — teacher v3.51~5.0 의 것을 옮겨 왔다 ══════════
   wrongAnalysis = { at, count, students, by, summary, teachingPoints, items:[{idx, qid, wrong, students, path, label, sub, subManual?, on, at}] }
   문항에는 on 인 것만 freqTraps:[{wrong, path, label, students, sub}] */
const FREQ_MIN_STUDENTS=2;   // 이 수 이상의 학생이 낸 오답만 "빈출"
const FREQ_MAX_PER_Q=5;      // 문항당 AI 에 보내는 빈출 오답 수 (학생 수 많은 순)
/** 문항별 오답 집계 { students, byQ:{[qid]:[{wrong, students, blank}]} } — 같은 학생의 같은 답은 1명 */
function freqWrongStats(ws, allData){
  const byQ={}; const stu=new Set();
  const qById=new Map((ws?.questions||[]).map(q=>[q.id,q]));
  Object.entries(allData||{}).forEach(([uid,d])=>{
    const r=d?.[ws.id]; if(!r?.perQuestion) return;
    stu.add(uid);
    Object.entries(r.perQuestion).forEach(([qid,v])=>{
      if(!Array.isArray(v?.wrongInputs) || !v.wrongInputs.length) return;
      const q=qById.get(qid);
      const m=byQ[qid]||(byQ[qid]=new Map());
      v.wrongInputs.forEach(w=>{
        const raw=String(w??'').trim();
        const blank = raw==='' || raw==='(빈칸)';
        const shown = blank ? '(빈칸)' : ansForCompare(q, raw).slice(0,40);
        const key = blank ? '(빈칸)' : trapNorm(shown);
        const cur=m.get(key)||{wrong:shown, uids:new Set(), blank};
        cur.uids.add(uid); m.set(key,cur);
      });
    });
  });
  const out={};
  Object.entries(byQ).forEach(([qid,m])=>{
    out[qid]=[...m.values()].map(x=>({wrong:x.wrong, students:x.uids.size, blank:x.blank})).sort((a,b)=>b.students-a.students);
  });
  return { students:stu.size, byQ:out };
}
/** 분석 대상 문항 [{idx, qid, type, text, answer, wrongs:[{wrong,students}], predicted:[{wrong,path,label}]}] */
function freqQuestions(ws, stats){
  return (ws?.questions||[]).map((q,i)=>{
    if(AI_SKIP_TYPES.has(q.type)) return null;
    const wrongs=(stats.byQ[q.id]||[]).filter(w=>!w.blank && w.students>=FREQ_MIN_STUDENTS).slice(0,FREQ_MAX_PER_Q).map(w=>({wrong:w.wrong, students:w.students}));
    if(!wrongs.length) return null;
    return { idx:i, qid:q.id, type:q.type, text:plainText(q.text,400), answer:aiAnswerSummary(q), wrongs,
      predicted:(q.aiTraps||[]).map(t=>({wrong:String(t.wrong??''), path:String(t.path??''), label:String(t.label??'')})) };
  }).filter(Boolean);
}
/** 새 결과를 기록으로 — 지금 빈출인 오답마다 항목 하나. 설명·유형은 새 결과, 없으면 이전 것. 체크·교사가 고른 유형은 잇는다 */
function mergeWrongAnalysis(prev, out, qs, stats, by, now){
  now=now||new Date().toISOString();
  const ai=new Map((out.items||[]).filter(t=>t&&t.path).map(t=>[t.idx+'|'+trapNorm(t.wrong), t]));
  const old=new Map((prev?.items||[]).map(t=>[t.qid+'|'+trapNorm(t.wrong), t]));
  const items=[]; let analyzed=0, kept=0, missing=0;
  qs.forEach(q=>q.wrongs.forEach(w=>{
    const key=trapNorm(w.wrong);
    const a=ai.get(q.idx+'|'+key), o=old.get(q.qid+'|'+key);
    let path, label, at, sub;
    if(a){ path=String(a.path).slice(0,200); label=String(a.label||'').slice(0,20); at=now; sub=a.type||''; analyzed++; }
    else if(o){ path=o.path; label=o.label; at=o.at||''; sub=o.sub||''; kept++; }
    else { missing++; return; }
    const manual = !!o?.subManual;
    if(manual) sub=o.sub;
    else if(!sub && o?.sub) sub=o.sub;
    const it={ idx:q.idx, qid:q.qid, wrong:w.wrong, students:w.students, path, label, on: o ? o.on!==false : true, at };
    if(sub) it.sub=sub;
    if(manual) it.subManual=true;
    items.push(it);
  }));
  return { at:now, count:(prev?.count||0)+1, students:stats.students, by:by||'', summary:String(out.summary||''),
    teachingPoints:(out.teachingPoints||[]).map(String).filter(Boolean), items, _analyzed:analyzed, _kept:kept, _missing:missing };
}
function storedWrongAnalysis(rec){
  return { at:rec.at, count:rec.count, students:rec.students, by:rec.by||'', summary:rec.summary||'', teachingPoints:rec.teachingPoints||[], items:rec.items };
}
function withFreqTraps(questions, rec){
  const byQid=new Map();
  (rec?.items||[]).filter(t=>t.on).forEach(t=>{ if(!byQid.has(t.qid)) byQid.set(t.qid,[]);
    byQid.get(t.qid).push({ wrong:t.wrong, path:t.path, label:t.label||'', students:t.students||0, ...(t.sub?{sub:t.sub}:{}) }); });
  return (questions||[]).map(q=>{ const c={...q}; const l=byQid.get(q.id); if(l?.length) c.freqTraps=l; else delete c.freqTraps; return c; });
}
/** 지금 집계로 본 학습지 상태 — 빈출 오답 수, 그중 기록에 없는 것(새로 생김) */
function freqStatus(ws, allData){
  const stats=freqWrongStats(ws, allData);
  const qs=freqQuestions(ws, stats);
  const rec=ws.wrongAnalysis;
  const have=new Set((rec?.items||[]).map(t=>t.qid+'|'+trapNorm(t.wrong)));
  let total=0, fresh=0;
  qs.forEach(q=>q.wrongs.forEach(w=>{ total++; if(!have.has(q.qid+'|'+trapNorm(w.wrong))) fresh++; }));
  return { students:stats.students, total, fresh, qs, stats };
}

/* ══════════ 유형 바꾸기 (교사가 고르거나 🏷 재분류를 적용할 때) ══════════
   docData = 학습지 문서(Firestore 에서 **방금 다시 읽은** 것). changes = [{kind:'ai'|'freq', qid, key, sub, manual?}]
   돌려주는 것 = setDoc(…, {merge:true}) 에 넣을 조각 { aiReview?, wrongAnalysis?, questions } — 바뀐 게 없으면 null */
function applyTypeChanges(docData, changes){
  const d={ ...docData, questions:(docData.questions||[]).map(q=>({...q})) };
  let rv=null, wa=null, n=0;
  const aiCh=changes.filter(c=>c.kind==='ai'), fqCh=changes.filter(c=>c.kind==='freq');
  if(aiCh.length){
    rv=loadReviewRecord(d);
    if(rv) aiCh.forEach(c=>{
      rv.traps.forEach(t=>{ if(t.qid===c.qid && trapNorm(t.wrong)===c.key){
        if(c.sub) t.sub=c.sub; else delete t.sub;
        if(c.manual) t.subManual=true; else if(c.manual===false) delete t.subManual;
        n++; } });
    });
  }
  if(fqCh.length && d.wrongAnalysis?.items){
    wa={ ...d.wrongAnalysis, items:d.wrongAnalysis.items.map(t=>({...t})) };
    fqCh.forEach(c=>{
      wa.items.forEach(t=>{ if(t.qid===c.qid && trapNorm(t.wrong)===c.key){
        if(c.sub) t.sub=c.sub; else delete t.sub;
        if(c.manual) t.subManual=true; else if(c.manual===false) delete t.subManual;
        n++; } });
    });
  }
  if(!n) return null;
  let questions=d.questions;
  const patch={};
  if(rv){ questions=withAiTraps(questions, rv); patch.aiReview=storedReview(rv); }
  if(wa){ questions=withFreqTraps(questions, wa); patch.wrongAnalysis=wa; }
  patch.questions=questions;
  patch._changed=n;
  return patch;
}

/* ══════════ 🏷 유형별 집계 ══════════ */
/** 학습지 하나의 오답 유형 목록 — 예상(on)·빈출(on) 항목에 문항 글을 붙여 평평하게.
    [{kind:'ai'|'freq', wsId, qid, idx, wrong, key, path, label, sub, subManual, students, q, answer}] */
function wsTypedItems(ws){
  const qById=new Map((ws.questions||[]).map((q,i)=>[q.id,{q,i}]));
  const out=[];
  const rv=loadReviewRecord(ws);
  (rv?.traps||[]).filter(t=>t.on).forEach(t=>{
    const e=qById.get(t.qid); if(!e) return;
    out.push({ kind:'ai', wsId:ws.id, qid:t.qid, idx:e.i, wrong:t.wrong, key:trapNorm(t.wrong), path:t.path, label:t.label||'', sub:t.sub||'', subManual:!!t.subManual,
      students:0, q:plainText(e.q.text,200), answer:aiAnswerSummary(e.q)||'' });
  });
  (ws.wrongAnalysis?.items||[]).filter(t=>t.on).forEach(t=>{
    const e=qById.get(t.qid); if(!e) return;
    out.push({ kind:'freq', wsId:ws.id, qid:t.qid, idx:e.i, wrong:t.wrong, key:trapNorm(t.wrong), path:t.path, label:t.label||'', sub:t.sub||'', subManual:!!t.subManual,
      students:t.students||0, q:plainText(e.q.text,200), answer:aiAnswerSummary(e.q)||'' });
  });
  return out;
}
/** 항목들을 유형별로 센다 — ai: 예상 오답 개수, freq: 빈출 오답 개수, stu: 빈출 오답을 낸 학생 수 합.
    { bySub:{code:{ai,freq,stu}}, byCat:{cat:{ai,freq,stu}}, none:{ai,freq,stu} } (none = 유형 없음) */
function countTypes(items){
  const z=()=>({ai:0,freq:0,stu:0});
  const bySub={}, byCat={}, none=z();
  items.forEach(it=>{
    const add=o=>{ if(it.kind==='ai') o.ai++; else { o.freq++; o.stu+=it.students||0; } };
    if(!it.sub){ add(none); return; }
    add(bySub[it.sub]||(bySub[it.sub]=z()));
    add(byCat[catOf(it.sub)]||(byCat[catOf(it.sub)]=z()));
  });
  return { bySub, byCat, none };
}

/* ══════════ 👤 학생 성취 ══════════ */
/** 이 문항의 오답 경로(예상+빈출, 같은 오답은 합침) + 학생 답과 일치하는지 + 유형 이름 (teacher v5.0 _trapsFor 에 유형을 더함) */
function trapsFor(q, studentAns, tax){
  const ai=q.aiTraps||[], fq=q.freqTraps||[];
  if(!ai.length && !fq.length) return [];
  const sa=trapNorm(ansForCompare(q, studentAns));
  const out=[], byKey=new Map();
  const mk=(t,src)=>{ const o={ wrong:String(t.wrong??''), path:String(t.path??''), label:String(t.label??''), src };
    if(t.sub){ o.sub=t.sub; if(tax) o.typeName=typeName(tax, t.sub, '>'); } return o; };
  ai.forEach(t=>{ const o=mk(t,'ai'); out.push(o); byKey.set(trapNorm(o.wrong), o); });
  fq.forEach(t=>{
    const key=trapNorm(t.wrong); const prev=byKey.get(key);
    if(prev){ prev.src='both'; if(t.path) prev.path=String(t.path); if(t.label) prev.label=String(t.label); prev.students=+t.students||0;
      if(t.sub){ prev.sub=t.sub; if(tax) prev.typeName=typeName(tax, t.sub, '>'); } return; }
    const o=mk(t,'freq'); o.students=+t.students||0; out.push(o); byKey.set(key, o);
  });
  out.forEach(o=>{ o.hit = sa!=='' && trapNorm(o.wrong)===sa; });
  return out;
}
/** 적중한 경로를 이름별로 — [{label, path, sub, count, answers, peers}] */
function countTrapHits(worksheets){
  const map=new Map();
  worksheets.forEach(w=>(w.wrongItems||[]).concat(w.recoveredItems||[]).forEach(it=>(it.traps||[]).forEach(t=>{
    if(!t.hit) return;
    const key=t.label||t.path;
    const cur=map.get(key)||{label:t.label||'(이름 없음)', path:t.path, sub:t.sub||'', count:0, answers:[], peers:0};
    cur.count++; if(cur.answers.length<5) cur.answers.push(t.wrong);
    if(!cur.sub && t.sub) cur.sub=t.sub;
    if((t.src==='freq'||t.src==='both') && (+t.students||0)>cur.peers) cur.peers=+t.students||0;
    map.set(key,cur);
  })));
  return [...map.values()].sort((a,b)=>b.count-a.count);
}
const recDate = r => String(r?.completedAt || r?.lastUpdated || '').slice(0,10);
const isRegular = ws => ws && ws.type!=='review' && ws.type!=='exam';
/** 학습지별 학급 첫 시도 정답률 평균 {wsId: avg} — 불러온 학생 전체 기준 */
function classFirstTryAvg(worksheets, allData){
  const out={};
  worksheets.forEach(ws=>{
    if(!isRegular(ws)) return;
    let s=0, n=0;
    Object.values(allData||{}).forEach(d=>{ const r=d?.[ws.id]; if(!r?.perQuestion) return;
      const st=recordHistoryStats(ws.questions, r.perQuestion); if(st.firstTryRate!=null){ s+=st.firstTryRate; n++; } });
    if(n) out[ws.id]=Math.round(s/n);
  });
  return out;
}
/** 학생 한 명의 학습지별 오답 유형 — 한 문항에서 낸 서로 다른 오답마다, 분류된 오답 경로와 일치하면 그 유형으로 센다 */
function studentWsTypes(ws, r, tax){
  const res={ wrongTotal:0, matched:0, subs:{} };
  if(!r?.perQuestion) return res;
  (ws.questions||[]).forEach(q=>{
    if(AI_SKIP_TYPES.has(q.type)) return;
    const v=r.perQuestion[q.id]; if(!v) return;
    const seen=new Set();
    (Array.isArray(v.wrongInputs)?v.wrongInputs:[]).forEach(w=>{
      const raw=String(w??'').trim(); if(!raw || raw==='(빈칸)') return;
      const k=trapNorm(ansForCompare(q,raw)); if(seen.has(k)) return; seen.add(k);
      res.wrongTotal++;
      const hit=trapsFor(q, raw, tax).find(t=>t.hit && t.sub);
      if(hit){ res.matched++; res.subs[hit.sub]=(res.subs[hit.sub]||0)+1; }
    });
  });
  return res;
}
/** 여러 학습지를 합친 유형 분포 → AI·화면용 { wrongTotal, matched, bySub, cats:[{code,name,count,subs:[{code,name,count}]}] } */
function mergeCatStats(parts, tax){
  const bySub={}; let wrongTotal=0, matched=0;
  parts.forEach(p=>{ wrongTotal+=p.wrongTotal; matched+=p.matched; Object.entries(p.subs).forEach(([k,n])=>{ bySub[k]=(bySub[k]||0)+n; }); });
  const cats=[];
  tax.cats.forEach(c=>{
    const subs=c.subs.filter(s=>bySub[s.code]).map(s=>({code:s.code, name:s.name, count:bySub[s.code]})).sort((a,b)=>b.count-a.count);
    const count=subs.reduce((n,s)=>n+s.count,0);
    if(count) cats.push({ code:c.code, name:c.name, count, subs });
  });
  // 분류표에 없는 코드(지운 유형 등)도 버리지 않는다
  const known=new Set(Object.keys(tax.byCode));
  const orphan=Object.entries(bySub).filter(([k])=>!known.has(k));
  if(orphan.length) cats.push({ code:'?', name:'알 수 없는 유형', count:orphan.reduce((n,[,c])=>n+c,0), subs:orphan.map(([k,c])=>({code:k,name:k,count:c})) });
  cats.sort((a,b)=>b.count-a.count);
  return { wrongTotal, matched, bySub, cats };
}
/** 기간 나누기 — 두 달 이상이면 월, 아니면 주(월요일 시작) */
function periodKeyFn(dates){
  const months=new Set(dates.map(d=>d.slice(0,7)));
  if(months.size>=2) return d=>d.slice(0,7);
  return d=>{ const t=new Date(d+'T00:00:00Z'); const wd=(t.getUTCDay()+6)%7; t.setUTCDate(t.getUTCDate()-wd); return t.toISOString().slice(0,10)+' 주'; };
}
/** 시간 순 기록 — rows(학습지별)·periods(기간별). 일반 학습지 중 풀이 기록과 날짜가 있는 것만 */
function studentTimeline(targets, wsMap, classAvg, tax){
  const rows=[];
  targets.forEach(ws=>{
    if(!isRegular(ws)) return;
    const r=wsMap[ws.id]; if(!r?.perQuestion) return;
    const date=recDate(r); if(!date) return;
    const st=recordHistoryStats(ws.questions, r.perQuestion);
    const ty=studentWsTypes(ws, r, tax);
    rows.push({ date, wsId:ws.id, title:ws.title||ws.id, firstTryRate:st.firstTryRate, classAvg:classAvg[ws.id]??null,
      correctRate:r.correctRate??null, subs:ty.subs });
  });
  rows.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  const pk=periodKeyFn(rows.map(r=>r.date));
  const pm=new Map();
  rows.forEach(r=>{ const k=pk(r.date); if(!pm.has(k)) pm.set(k,[]); pm.get(k).push(r); });
  const periods=[...pm.entries()].map(([period,l])=>{
    const f=l.filter(r=>r.firstTryRate!=null);
    const d=f.filter(r=>r.classAvg!=null);
    const cc={};
    l.forEach(r=>Object.entries(r.subs).forEach(([s,n])=>{ const c=catOf(s); cc[c]=(cc[c]||0)+n; }));
    const cats=Object.entries(cc).sort((a,b)=>b[1]-a[1]).map(([c,n])=>(tax.cats.find(x=>x.code===c)?.name||c)+' '+n).join(', ');
    return { period, n:l.length,
      avgFirst: f.length?Math.round(f.reduce((s,r)=>s+r.firstTryRate,0)/f.length):null,
      avgDiff: d.length?Math.round(d.reduce((s,r)=>s+(r.firstTryRate-r.classAvg),0)/d.length):null,
      cats };
  });
  return { rows, periods };
}
/** analyzeStudent 로 보낼 학습지 목록 (teacher v5.0 _runStudentAI 와 같은 꼴 + 오답 경로에 유형) */
function studentAiWorksheets(targets, wsMap, tax){
  return targets.map(ws=>{
    const r=wsMap[ws.id];
    const rate=r.correctRate ?? (r.totalCount?Math.round((r.answeredCount||0)/r.totalCount*100):0);
    const regular=isRegular(ws);
    const wrongItems=[], recoveredItems=[], unansweredItems=[];
    const qTextOf=(q,n)=>plainText(q.text,n);
    const correctAnsOf=q=>q.type==='multi'
      ? (q.answer||[]).map(i=>i+1).join(',')+'번 ('+(q.options||[]).filter((_,i)=>(q.answer||[]).includes(i)).join(' / ')+')'
      : q.answer;
    (ws.questions||[]).forEach(q=>{
      if(AI_SKIP_TYPES.has(q.type)) return;
      const v=r.perQuestion?.[q.id];
      if(!regular){
        if(!v || v.correct!==false) return;
        const sa=(v.wrongInputs&&v.wrongInputs.length)?v.wrongInputs[v.wrongInputs.length-1]:(v.lastAnswer??'(기록 없음)');
        const traps=trapsFor(q, sa, tax);
        wrongItems.push({ qText:qTextOf(q,300), correctAnswer:String(correctAnsOf(q)??''), studentAnswer:studentAnsText(q, sa), ...(traps.length?{traps}:{}) });
        return;
      }
      const h=questionHistory(q, v);
      if(h.status==='wrong'){
        const sa=h.wrongs.length?h.wrongs[h.wrongs.length-1]:'(기록 없음)';
        const traps=trapsFor(q, sa, tax);
        wrongItems.push({ qText:qTextOf(q,300), correctAnswer:String(correctAnsOf(q)??''), studentAnswer:studentAnsText(q, sa),
          wrongCount:h.wrongCount, wrongHistory:h.wrongs.slice(0,-1).slice(-5).map(w=>studentAnsText(q,w)), ...(traps.length?{traps}:{}) });
      } else if(h.status==='recovered'){
        const traps=[]; const seen=new Set();
        h.wrongs.forEach(w=>trapsFor(q, w, tax).forEach(t=>{ if(t.hit && !seen.has(t.wrong)){ seen.add(t.wrong); traps.push(t); } }));
        recoveredItems.push({ qText:qTextOf(q,300), correctAnswer:String(correctAnsOf(q)??''),
          wrongCount:h.wrongCount, wrongHistory:h.wrongs.slice(-5).map(w=>studentAnsText(q,w)), ...(traps.length?{traps}:{}) });
      } else if(h.status==='unanswered' || h.status==='partial'){
        unansweredItems.push({ qText:qTextOf(q,120), ...(h.status==='partial'?{partial:`단계형 ${h.stepsDone}/${h.stepsTotal}단계까지 해결`}:{}) });
      }
    });
    if(!regular) return { title:ws.title||'', correctRate:rate, wrongItems };
    const st=recordHistoryStats(ws.questions, r.perQuestion);
    recoveredItems.sort((a,b)=>b.wrongCount-a.wrongCount);
    return { title:ws.title||'', done:recordIsDone(r, ws.questions), correctRate:rate, firstTryRate:st.firstTryRate, unansweredCount:st.notAnswered,
             wrongItems, recoveredItems:recoveredItems.slice(0,15), unansweredItems:unansweredItems.slice(0,15) };
  });
}
/** 학생 목록 한 줄의 요약 — 학습지 수·평균 첫 시도·학급 평균 대비·최근 날짜 */
function studentSummary(wsMap, worksheets, classAvg){
  let n=0, fs=0, fn=0, ds=0, dn=0, last='';
  worksheets.forEach(ws=>{
    const r=wsMap?.[ws.id]; if(!r || ws.type==='review') return;
    n++;
    const d=recDate(r); if(d>last) last=d;
    if(!isRegular(ws) || !r.perQuestion) return;
    const st=recordHistoryStats(ws.questions, r.perQuestion);
    if(st.firstTryRate==null) return;
    fs+=st.firstTryRate; fn++;
    if(classAvg[ws.id]!=null){ ds+=st.firstTryRate-classAvg[ws.id]; dn++; }
  });
  return { n, avgFirst:fn?Math.round(fs/fn):null, avgDiff:dn?Math.round(ds/dn):null, last };
}
/** 분석에 쓴 기록 중 가장 늦은 lastUpdated — 이후 새 풀이가 있으면 「새 기록」 표시 */
function basisAtOf(targets, wsMap){
  return targets.reduce((m,ws)=>{ const t=String(wsMap?.[ws.id]?.lastUpdated||''); return t>m?t:m; },'');
}
const stuAiKey=(scope,unitId)=>scope==='unit'?('unit_'+String(unitId||'').replace(/[\/.#\[\]]/g,'_')):'all';

/* ══════════ 🏷 재분류 (classifyErrors) 결과 정리 ══════════
   items 는 wsTypedItems 로 모은 것 + 요청용 id. 응답 assignments 를 제안(proposal)별·기존 유형별로 묶는다. */
function groupAssignments(items, res){
  const byId=new Map(items.map(it=>[it.id,it]));
  const toExisting=new Map(), toProposal=new Map();
  (res.assignments||[]).forEach(a=>{
    const it=byId.get(a.id); if(!it) return;
    const target=/^new\d+$/.test(a.code) ? toProposal : toExisting;
    if(target===toExisting && a.code===it.sub) return;   // 그대로인 것
    if(!target.has(a.code)) target.set(a.code,[]);
    target.get(a.code).push(it);
  });
  return { toExisting, toProposal };
}
/** 학습지별 바꿀 목록 — pairs = [[항목, 새 유형, 교사가 정함?], …] → { wsId: [{kind, qid, key, sub, manual?}] }
    manual 이면 subManual 로 남아 다시 분석해도 AI 가 덮어쓰지 않는다 (v1.1 — 옮기기·합치기·재분류 결과를 교사가 바꾼 것) */
function changesByWs(pairs){
  const out={};
  pairs.forEach(([it,sub,manual])=>{ (out[it.wsId]||(out[it.wsId]=[])).push({ kind:it.kind, qid:it.qid, key:it.key, sub, ...(manual?{manual:true}:{}) }); });
  return out;
}

if(typeof module!=='undefined') module.exports={ TAX_BASE, TAX_UNKNOWN, buildTaxonomy, taxForAI, catOf, typeName, nextCustomCode, trapNorm, multiNums,
  ansForCompare, studentAnsText, aiAnswerSummary, reviewQuestions, loadReviewRecord, mergeReview, storedReview, withAiTraps,
  FREQ_MIN_STUDENTS, FREQ_MAX_PER_Q, freqWrongStats, freqQuestions, mergeWrongAnalysis, storedWrongAnalysis, withFreqTraps, freqStatus,
  applyTypeChanges, wsTypedItems, countTypes, trapsFor, countTrapHits, classFirstTryAvg, studentWsTypes, mergeCatStats, periodKeyFn,
  studentTimeline, studentAiWorksheets, studentSummary, basisAtOf, stuAiKey, groupAssignments, changesByWs, recDate, isRegular };
