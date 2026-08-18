/* ═══════════════════════════════════════════════════════════════
   grading.js — 채점 로직 단일 소스 (index.html / teacher.html 공용)

   일반 학습지·시험지·재채점 모두 judgeAnswer() 하나로 판정한다.
   채점 규칙을 바꿀 때는 이 파일만 수정하면 되고,
   HTML 안에 채점 함수를 복사해 넣지 말 것 (과거 세 벌 복사가 채점 불일치 사고의 원인).

   포함: evalAnswer, eqEquivCheck, exprEquivCheck, _examEvExpr,
         normalizeMultiAnswer, gradeExamWord, judgeAnswer
   캐시: <script src="grading.js?v=버전"> 형태로 로드해 갱신 시 쿼리를 올릴 것.
   ═══════════════════════════════════════════════════════════════ */

function evalAnswer(s){
  // 문자열 수식("8/3", "Math.sqrt(2)", "23/5")을 수치로 평가
  if(typeof s==='number') return s;
  if(s==null||s==='') return NaN;
  let t=String(s).replace(/−/g,'-').replace(/\s/g,'').replace(/\^/g,'**');
  // 안전: 허용 문자(숫자, 연산자, 괄호, Math 함수)만
  if(!/^[-+*/().\d]+$/.test(t.replace(/Math\.(sqrt|cbrt|pow|abs|PI|E)/g,'').replace(/\*\*/g,''))){
    const n=parseFloat(s); return isNaN(n)?NaN:n;
  }
  try{ return Function('"use strict";return('+t+')')(); }
  catch(e){ const n=parseFloat(s); return isNaN(n)?NaN:n; }
}

function eqEquivCheck(userEq, correctEq){
  function normEq(s){
    s=String(s).toLowerCase().replace(/\s+/g,'').replace(/−/g,'-').replace(/×/g,'*');
    let prev;
    do{prev=s;
      s=s.replace(/(\d|\)|x)\(/g,'$1*(');
      s=s.replace(/\)(\d|x|\()/g,')*$1');
      s=s.replace(/(\d)x/g,'$1*x');
      s=s.replace(/x(\d)/g,'x*$1');
    }while(prev!==s);
    return s;
  }
  function evalSide(s,x){
    try{
      let t=normEq(s).replace(/\^/g,'**').replace(/x/g,`(${x})`);
      if(!/^[\d+\-*/().\s]+$/.test(t.replace(/\*\*/g,''))) return NaN;
      return Function('"use strict";return('+t+')')();
    }catch(e){return NaN;}
  }
  try{
    const uParts=userEq.split('=');
    const cParts=correctEq.split('=');
    if(uParts.length!==2||cParts.length!==2) return false;
    const pts=[0.317,1.234,-2.57,4.91,-0.718,7.37];
    let ratio=null;
    for(const x of pts){
      const du=evalSide(uParts[0],x)-evalSide(uParts[1],x);
      const dc=evalSide(cParts[0],x)-evalSide(cParts[1],x);
      if(!isFinite(du)||!isFinite(dc)) return false;
      if(Math.abs(dc)<1e-9){if(Math.abs(du)>1e-6) return false; continue;}
      const r=du/dc;
      if(ratio===null) ratio=r;
      else if(Math.abs(r-ratio)>1e-6) return false;
    }
    return ratio!==null&&Math.abs(ratio)>1e-9;
  }catch(e){return false;}
}

function exprEquivCheck(userExpr, correctExpr){
  function ev(s,x){
    try{
      let t=String(s).toLowerCase().replace(/\s/g,'').replace(/−/g,'-').replace(/×/g,'*');
      let prev;
      do{prev=t;
        t=t.replace(/(\d|\)|[a-z])\(/g,'$1*(');
        t=t.replace(/\)(\d|[a-z]|\()/g,')*$1');
        t=t.replace(/(\d)([a-z])/g,'$1*$2');
        t=t.replace(/([a-z])(\d)/g,'$1*$2');
      }while(prev!==t);
      t=t.replace(/\^/g,'**').replace(/[a-z]/g,`(${x})`);
      if(!/^[\d+\-*/().\s]+$/.test(t.replace(/\*\*/g,''))) return NaN;
      return Function('"use strict";return('+t+')')();
    }catch(e){return NaN;}
  }
  const pts=[1,-1,2,-2,0.5,3];
  return pts.every(x=>{
    const uv=ev(userExpr,x), cv=ev(correctExpr,x);
    return isFinite(uv)&&isFinite(cv)&&Math.abs(uv-cv)<0.001;
  });
}

function _examEvExpr(s,x){
  try{
    let t=String(s).replace(/\s/g,'').replace(/−/g,'-').replace(/×/g,'*')
      .replace(/\*\*/g,'^').replace(/\^/g,'**')          // ^ 와 ** 모두 수용
      .replace(/Math\.sqrt\(/g,'sqrt(')
      .replace(/sqrt\(([^)]+)\)/g,(_,v)=>`((${v})**0.5)`);
    let prev;
    do{prev=t;
      t=t.replace(/(\d|\)|[a-z])\(/g,'$1*(');
      t=t.replace(/\)(\d|[a-z]|\()/g,')*$1');
      t=t.replace(/(\d)([a-z])/g,'$1*$2');
      t=t.replace(/([a-z])(\d)/g,'$1*$2');
      t=t.replace(/([a-z])([a-z])/g,'$1*$2');
    }while(prev!==t);
    t=t.replace(/[a-z]/g,`(${x})`);
    if(!/^[\d+\-*/().\s]+$/.test(t.replace(/\*\*/g,''))) return NaN;
    return Function('"use strict";return('+t+')')();
  }catch(e){ return NaN; }
}

function normalizeMultiAnswer(q){
  const n=(q.options||[]).length;
  let a=[...(q.answer||[])].map(Number).filter(v=>!isNaN(v));
  if(n>0 && a.length && a.every(v=>v>=1&&v<=n) && a.some(v=>v===n)){
    a=a.map(v=>v-1);   // 0-based면 불가능한 인덱스 존재 → 1-based 데이터로 판단
  }
  return a.sort((x,y)=>x-y);
}

function gradeExamWord(q, ans){
  if(ans===null||ans===undefined) return false;
  const raw=String(ans).trim();
  if(!raw || raw==='(빈칸)') return false;
  const allAns=[q.answer,...(q.answerAlt||[])].filter(a=>a!=null&&String(a)!=='');
  if(!allAns.length) return false;
  // 1) 방정식(= 포함)
  if(raw.includes('=')||allAns.some(a=>String(a).includes('='))){
    try{ if(allAns.some(a=>eqEquivCheck(raw,String(a)))) return true; }catch(e){}
  }
  // 2) 수식 동치 (여러 값 대입) — 일반 모드와 동일
  const pts=[1,-1,2,-2,0.5,3];
  try{
    if(allAns.some(a=>{
      let any=false;
      const okAll=pts.every(x=>{
        const uv=_examEvExpr(raw,x), av=_examEvExpr(String(a),x);
        if(!isFinite(uv)||!isFinite(av)) return false;
        any=true;
        return Math.abs(uv-av)<0.001;
      });
      return any&&okAll;
    })) return true;
  }catch(e){}
  // 3) 텍스트 정규화 비교 — 일반 모드와 동일한 normW
  const normW=s=>String(s||"").replace(/−/g,"-").replace(/\s*,\s*/g,",")
    .replace(/\(\s+/g,"(").replace(/\s+\)/g,")").replace(/\s+/g,"").trim().toLowerCase();
  if(allAns.map(normW).includes(normW(raw))) return true;
  // 4) 숫자 동치 — 문자가 섞인 식에는 쓰지 않는다
  //    (parseFloat("2x+5")===2 여서 정답 "2x+3"과 숫자만 같으면 오답이 정답 처리되던 오검출 방지)
  const hasVar=s=>/[a-zA-Z가-힣]/.test(String(s));
  if(!hasVar(raw)){
    const uf=parseFloat(raw.replace(/−/g,'-'));
    if(!isNaN(uf)){
      try{
        if(allAns.some(a=>{
          if(hasVar(a)) return false;
          const av=evalAnswer(String(a));
          return isFinite(av)&&Math.abs(uf-av)<0.001;
        })) return true;
      }catch(e){}
    }
  }
  return false;
}

/* ── 입력 형태 검사 (소인수분해 등) — 키패드 토큰 구조 기반 ── */
function isPrime(n){ n=Math.round(n); if(n<2)return false; for(let i=2;i<=Math.sqrt(n);i++)if(n%i===0)return false; return true; }

function isFactoredForm(tokens){
  let depth=0;
  for(const t of tokens){
    if(t.type==='frac'||t.type==='exp'||t.type==='sqrt') continue;
    if(t.type==='char'){
      if(t.val==='(') depth++;
      else if(t.val===')') depth--;
      else if(depth===0&&(t.val==='+'||t.val==='−'||t.val==='-')) return false;
    }
  }
  return true;
}

function isPrimeFactorExpr(tokens){
  return tokens.every(t=>{
    if(t.type==='char') return /[+*×\-()]/.test(t.val)||isPrime(Number(t.val));
    if(t.type==='exp')  return isPrime(Number(t.base));
    if(t.type==='frac') return false;
    return true;
  });
}

/* ── 단일 채점 진입점 ──
   답안값(문자열/배열/불리언)을 받아 정답 여부를 판정한다. 화면(DOM)을 보지 않는 순수 함수.
   반환: true=정답, false=오답, null=수동 채점 대상(그래프)
   tokens(선택): 키패드 토큰 배열 또는 그 JSON 문자열. factorMode(소인수분해/인수분해)
   문항의 '형태 검사'에 사용한다. 시험지는 제출 시 examAnswerTokens로 저장해 두고
   채점·재채점 때 넘긴다. tokens가 없으면 값 동치만 판정한다(과거 기록 호환). */
function judgeAnswer(q, ans, tokens){
  if(!q) return false;
  const t = q.type;
  if(t==='word' || t==='equation' || t==='word_text' || t==='word_expr'){
    let ok = gradeExamWord(q, ans);
    if(ok && q.factorMode){
      let tk = tokens;
      if(typeof tk === 'string'){ try{ tk = JSON.parse(tk); }catch(e){ tk = null; } }
      if(Array.isArray(tk) && tk.length){
        if(q.factorMode==='prime')  ok = isPrimeFactorExpr(tk) && isFactoredForm(tk);
        if(q.factorMode==='factor') ok = isFactoredForm(tk);
      }
    }
    return ok;
  }
  if(t==='multi'){
    const expected = normalizeMultiAnswer(q);
    // 선택이 없거나 정답 미설정이면 정답 처리하지 않는다 (빈 배열끼리 통과 방지)
    if(Array.isArray(ans) && ans.length>0 && expected.length>0){
      const sel = [...ans].map(Number).sort((a,b)=>a-b);
      return sel.length===expected.length && sel.every((v,i)=>v===expected[i]);
    }
    return false;
  }
  if(t==='link') return ans===true;
  if(t==='graph') return null;   // scoring.html에서 수동 채점
  return false;
}
