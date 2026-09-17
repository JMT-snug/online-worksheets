/* ═══════════════════════════════════════════════════════════════
   grading.js — 채점 로직 단일 소스 (index.html / teacher.html 공용)

   일반 학습지·시험지·재채점 모두 judgeAnswer() 하나로 판정한다.
   채점 규칙을 바꿀 때는 이 파일만 수정하면 되고,
   HTML 안에 채점 함수를 복사해 넣지 말 것 (과거 세 벌 복사가 채점 불일치 사고의 원인).

   포함: evalAnswer, eqEquivCheck, ineqEquivCheck, mathEquivCheck, exprEquivCheck,
         _examEvExpr, isTextAnswerQ, varsOf, isCaseSignificant,
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

/* ── 다변수 수식 평가 ──
   예전에는 모든 문자를 '같은 값'으로 치환해서
     · x²y 와 xy² 가 같은 식으로 판정됨(오답을 정답 처리)
   또 방정식 판정은 x만 치환할 수 있어
     · y가 들어간 식은 계산 자체가 불가능(정답도 오답 처리)
   → 변수마다 서로 다른 값을 대입해 평가한다. */
function _envsFor(vars){
  const seeds=[
    [ 1.7,  2.3,  3.1,  4.7,  5.3,  6.1],
    [-2.1,  3.7, -1.3,  2.9, -4.1,  1.9],
    [ 0.6, -1.4,  2.2, -3.8,  1.1, -0.7],
    [ 3.3,  1.2, -2.6,  4.4, -1.8,  2.5],
    [-0.9, -2.7,  1.6,  3.2, -3.4,  0.8],
  ];
  return seeds.map(seed=>{
    const env={};
    vars.forEach((v,i)=>{ env[v]=seed[i%seed.length]; });
    return env;
  });
}

/* 같은 식을 수백 번 평가하는 곳이 있어서(해집합 비교) 번역 결과를 캐시해 둔다.
   문자는 값이 아니라 env 조회(e["x"])로 바꾸므로, 대입값이 달라져도 다시 번역하지 않는다. */
const _MULTI_CACHE = new Map();
function _compileMulti(s){
  if(_MULTI_CACHE.has(s)) return _MULTI_CACHE.get(s);
  let fn=null;
  try{
    /* 대문자와 소문자를 다른 문자로 다룬다 (넓이 A 와 한 변 a).
       예전에는 여기서 통째로 소문자로 바꿔서 A 와 a 가 같은 문자가 됐다.
       '대소문자를 구분하지 않는' 지금까지의 동작은 mathEquivCheck 가
       필요할 때 양쪽을 소문자로 바꿔 주는 것으로 유지한다. */
    let t=String(s).replace(/\s/g,'')
      .replace(/−/g,'-').replace(/×/g,'*').replace(/÷/g,'/')
      .replace(/Math\./gi,'')
      .replace(/sqrt\(/gi,'sqrt(')
      .replace(/\*\*/g,'^');
    let g=0;
    while(/sqrt\(/.test(t) && g++<12) t=t.replace(/sqrt\(([^()]*)\)/g,(_,v)=>`((${v})^0.5)`);
    if(/sqrt/i.test(t)) throw 0;
    let prev;
    do{prev=t;
      t=t.replace(/(\d|\)|[a-zA-Z])\(/g,'$1*(');
      t=t.replace(/\)(\d|[a-zA-Z]|\()/g,')*$1');
      t=t.replace(/(\d)([a-zA-Z])/g,'$1*$2');
      t=t.replace(/([a-zA-Z])(\d)/g,'$1*$2');
      t=t.replace(/([a-zA-Z])([a-zA-Z])/g,'$1*$2');
    }while(prev!==t);
    t=t.replace(/\^/g,'**');
    // 허용 문자(숫자·영문자·사칙연산·괄호)만 남았는지 먼저 확인한 뒤에 치환한다
    if(!/^[a-zA-Z\d+\-*/().]+$/.test(t.replace(/\*\*/g,''))) throw 0;
    t=t.replace(/[a-zA-Z]/g, ch=>'e['+JSON.stringify(ch)+']');
    fn=new Function('e','"use strict";return('+t+')');
  }catch(err){ fn=null; }
  if(_MULTI_CACHE.size>500) _MULTI_CACHE.clear();
  _MULTI_CACHE.set(s, fn);
  return fn;
}

function _evalMulti(s, env){
  const fn=_compileMulti(String(s));
  if(!fn) return NaN;                 // 번역 실패(한글·함수명 등) = 계산할 수 없는 식
  try{
    const r=fn(env);                  // env 에 없는 문자는 undefined → NaN 으로 번져 나간다
    return (typeof r==='number'&&isFinite(r))?r:NaN;
  }catch(e){ return NaN; }
}

/* 두 값이 사실상 같은가 (값이 커질 때를 대비한 상대 비교) */
function _numEq(a,b){ return Math.abs(a-b) < 1e-6*Math.max(1,Math.abs(a),Math.abs(b)); }

/* ══════════ 관계 기호(=, <, ≤, >, ≥) 다루기 ══════════
   부등식 답은 예전에 글자가 똑같을 때만 정답이었다 — x>3 을 3<x 나 2x>6 으로
   쓰면 오답이었다. 관계식을 (왼쪽, 오른쪽, 기호)로 갈라 두고 수치로 비교한다. */
function normalizeRelText(s){
  return String(s??'').replace(/≤/g,'<=').replace(/≥/g,'>=')
                      .replace(/=</g,'<=').replace(/=>/g,'>=');
}

/* 관계식을 조각으로 가른다. "1<x<3" 처럼 이어 쓴 것도 [1<x, x<3] 으로 나눈다.
   관계 기호가 없으면 null (= 그냥 식). */
function splitRelChain(s){
  const t=normalizeRelText(s);
  if(!/[<>=]/.test(t)) return null;
  const parts=t.split(/(<=|>=|<|>|=)/);
  if(parts.length<3 || parts.length%2===0) return null;   // 기호만 있거나 짝이 안 맞음
  const rels=[];
  for(let i=1;i<parts.length;i+=2){
    const lhs=parts[i-1].trim(), rhs=parts[i+1].trim();
    if(!lhs||!rhs) return null;
    rels.push({lhs,rhs,op:parts[i]});
  }
  return rels;
}

/* a<b, a≤b, a>b, a≥b 를 모두 "왼쪽 − 오른쪽 < 0" 꼴로 맞춰 둔다 */
function _toLessCond(rel){
  if(rel.op==='=') return null;
  const lt = rel.op.charAt(0)==='<';
  return { lhs: lt?rel.lhs:rel.rhs, rhs: lt?rel.rhs:rel.lhs, strict: rel.op.length===1 };
}

/* 두 부등식 조건이 같은 범위를 뜻하는가.
   f_u = (양수)×f_c 이면 같은 범위다. 음수배는 부등호가 뒤집힌 것이므로 다른 답이고,
   문자배(x 배 등)도 x 의 부호에 따라 범위가 달라지므로 같다고 볼 수 없다. */
function _condEquiv(cu, cc){
  if(cu.strict!==cc.strict) return false;    // x>3 과 x≥3 은 다른 답
  const vars=[...new Set((varsOf(cu.lhs)+varsOf(cu.rhs)+varsOf(cc.lhs)+varsOf(cc.rhs)).split(''))].filter(Boolean);
  let ratio=null;
  for(const env of _envsFor(vars)){
    const du=_evalMulti(cu.lhs,env)-_evalMulti(cu.rhs,env);
    const dc=_evalMulti(cc.lhs,env)-_evalMulti(cc.rhs,env);
    if(!isFinite(du)||!isFinite(dc)) return false;
    if(Math.abs(dc)<1e-9){ if(Math.abs(du)>1e-6) return false; continue; }
    const r=du/dc;
    if(ratio===null) ratio=r;
    else if(Math.abs(r-ratio)>1e-6) return false;
  }
  return ratio!==null && ratio>1e-9;
}

/* 부등식끼리 비교 — 조각 수가 같고, 조각끼리 짝이 지어지면 같은 답으로 본다
   (1<x<3 과 3>x>1 처럼 순서를 바꿔 쓴 것도 통과시키기 위해 짝짓기로 비교한다) */
function ineqEquivCheck(userIneq, correctIneq){
  try{
    const ur=splitRelChain(userIneq), cr=splitRelChain(correctIneq);
    if(!ur||!cr||ur.length!==cr.length) return false;
    const uc=ur.map(_toLessCond), cc=cr.map(_toLessCond);
    if(uc.some(c=>!c)||cc.some(c=>!c)) return false;      // = 가 섞여 있으면 부등식이 아니다
    const used=new Array(cc.length).fill(false);
    return uc.every(u=>{
      const j=cc.findIndex((c,k)=>!used[k]&&_condEquiv(u,c));
      if(j<0) return false;
      used[j]=true; return true;
    });
  }catch(e){ return false; }
}

function eqEquivCheck(userEq, correctEq){
  try{
    const u=String(userEq).split('='), c=String(correctEq).split('=');
    if(u.length!==2||c.length!==2) return false;
    const vars=[...new Set((varsOf(userEq)+varsOf(correctEq)).split(''))].filter(Boolean);
    /* ① 상수배 판정 — 양변 차가 몇 배인지가 어디서나 같으면 같은 방정식
          (2x+3=11 과 x=4, y=-x+3 과 x+y=3 처럼 이항·정리만 한 답) */
    let ratio=null, constRatio=true;
    for(const env of _envsFor(vars)){
      const du=_evalMulti(u[0],env)-_evalMulti(u[1],env);
      const dc=_evalMulti(c[0],env)-_evalMulti(c[1],env);
      if(!isFinite(du)||!isFinite(dc)){ constRatio=false; break; }
      if(Math.abs(dc)<1e-9){ if(Math.abs(du)>1e-6){ constRatio=false; break; } continue; }
      const r=du/dc;
      if(ratio===null) ratio=r;
      else if(Math.abs(r-ratio)>1e-6){ constRatio=false; break; }
    }
    if(constRatio && ratio!==null && Math.abs(ratio)>1e-9) return true;
    /* ② 문자를 곱해야 같아지는 답 — xy=6 과 y=6/x 는 배수가 x 라서 ①을 통과하지 못한다.
          이때는 두 식의 해집합(그래프)이 같은지 직접 확인한다. */
    return _sameSolutionSet(u, c, vars);
  }catch(e){ return false; }
}

/* 해집합 비교 — 한 식의 해를 실제로 찾아 다른 식도 그 점에서 0이 되는지 본다.
   반드시 양쪽 방향을 모두 확인해야 한다: 한 방향만 보면 x=2 의 해를 x²=4 도
   만족하므로 서로 다른 답이 정답 처리된다(x=−2 는 x=2 를 만족하지 않는다). */
/* 해를 찾아볼 지점들. −8~8 은 촘촘히(0.25 간격), 그 바깥은 듬성듬성 넓게 —
   y=30/x 처럼 해가 17.6 같은 큰 값인 경우를 놓치지 않으려는 것이다. */
const _SCAN_GRID=(()=>{
  const g=[];
  for(let k=0;k<=64;k++) g.push(-8+k*0.25);
  for(let m=10.4; m<600; m*=1.3){ g.push(m); g.push(-m); }
  return g.sort((a,b)=>a-b);
})();

function _sameSolutionSet(u, c, vars){
  if(!vars.length) return false;
  const F=env=>_evalMulti(u[0],env)-_evalMulti(u[1],env);
  const G=env=>_evalMulti(c[0],env)-_evalMulti(c[1],env);
  const xs=_SCAN_GRID;
  const BASES=_envsFor(vars).slice(0,2);
  let checked=0;
  for(const v of vars.slice(0,3)){          // 해를 구할 문자를 바꿔 가며 확인
    for(const base of BASES){               // 나머지 문자에 넣어 볼 값
      for(let dir=0; dir<2; dir++){
        const A=dir?F:G, B=dir?G:F;         // A 의 해에서 B 도 0인지 본다
        const env=Object.assign({}, base);
        const as=[], bs=[];
        let scaleA=0, scaleB=0;
        for(let k=0;k<xs.length;k++){
          env[v]=xs[k];
          const a=A(env), b=B(env);
          as.push(a); bs.push(b);
          if(isFinite(a)) scaleA=Math.max(scaleA,Math.abs(a));
          if(isFinite(b)) scaleB=Math.max(scaleB,Math.abs(b));
        }
        const tolA=1e-9*Math.max(1,scaleA), tolB=1e-9*Math.max(1,scaleB);
        /* 해 후보 하나를 확인한다. 반환값 false = 한쪽만 만족 → 서로 다른 답 */
        const verify=x=>{
          env[v]=x;
          const av=A(env);
          if(!isFinite(av)||Math.abs(av)>tolA) return true;   // 해가 아니다(극 부근 등) → 그냥 넘어감
          const bv=B(env);
          if(!isFinite(bv)||Math.abs(bv)>tolB) return false;
          checked++; return true;
        };
        for(let i=0;i<xs.length;i++){
          if(isFinite(as[i]) && Math.abs(as[i])<=tolA){       // 격자점이 이미 해인 경우
            if(!verify(xs[i])) return false;
            continue;
          }
          if(i===0) continue;
          const y0=as[i-1], y1=as[i];
          if(!isFinite(y0)||!isFinite(y1)) continue;
          if((y0<0)===(y1<0)) continue;                       // 부호가 안 바뀌면 사이에 해가 없다
          let lo=xs[i-1], hi=xs[i], flo=y0;                   // 이분법으로 해를 좁힌다
          for(let it=0; it<80; it++){
            const m=(lo+hi)/2; env[v]=m;
            const fm=A(env);
            if(!isFinite(fm)) break;
            if((fm<0)===(flo<0)){ lo=m; flo=fm; } else { hi=m; }
          }
          if(!verify((lo+hi)/2)) return false;
        }
      }
    }
  }
  return checked>=2;   // 확인한 해가 너무 적으면 같다고 단정하지 않는다
}

function exprEquivCheck(userExpr, correctExpr){
  if(varsOf(userExpr)!==varsOf(correctExpr)) return false;   // 변수·단위가 다르면 다른 식
  const vars=varsOf(userExpr).split('').filter(Boolean);
  let any=false;
  const ok=_envsFor(vars).every(env=>{
    const uv=_evalMulti(userExpr,env), cv=_evalMulti(correctExpr,env);
    if(!isFinite(uv)||!isFinite(cv)) return false;
    any=true;
    return _numEq(uv,cv);
  });
  return any&&ok;
}

/* ══════════ 수학적 동치 판정 단일 입구 ══════════
   답의 생김새를 보고 알아서 갈라 준다 — 문항·단계에서 유형을 따로 고르지 않아도 된다.
     · 둘 다 부등식(<, ≤, >, ≥) → ineqEquivCheck
     · 둘 다 등식(=)            → eqEquivCheck
     · 둘 다 그냥 식            → exprEquivCheck
   한쪽만 관계식이면 다른 답으로 본다 (정답 x=4 에 4 만 쓴 것은 답이 아니다). */
function mathEquivCheck(user, correct){
  try{
    /* 정답이 A 와 a 를 갈라 쓰지 않았다면 대소문자를 무시한다 (x 를 X 로 쳐도 정답).
       갈라 썼다면 그대로 두어 구분해 채점한다 — A=a² 를 a=A² 로 쓴 것은 다른 답이다. */
    if(!isCaseSignificant(correct)){
      user=String(user).toLowerCase();
      correct=String(correct).toLowerCase();
    }
    const ur=splitRelChain(user), cr=splitRelChain(correct);
    if(!ur && !cr) return exprEquivCheck(user, correct);
    if(!ur || !cr) return false;
    const uIneq=ur.some(r=>r.op!=='='), cIneq=cr.some(r=>r.op!=='=');
    if(uIneq!==cIneq) return false;                      // 등식과 부등식은 다른 답
    if(uIneq) return ineqEquivCheck(user, correct);
    if(ur.length!==1||cr.length!==1) return false;       // a=b=c 꼴은 다루지 않는다
    return eqEquivCheck(user, correct);
  }catch(e){ return false; }
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

/* 답을 '텍스트'로 다뤄야 하는 문항인가 (한글 용어 등)
   텍스트 문항에 수식 동치 판정을 쓰면 단위가 변수로 파싱된다.
   예: 정답 '40km/h' → k*m/h, 모든 문자가 같은 값이라 x*x/x = x
       → '40km/h' ≡ '40m' ≡ '40x' ≡ '40km/s' 가 되어 엉뚱한 답이 정답 처리됨. */
function isTextAnswerQ(q){
  if(!q) return false;
  if(q.type==='word_text') return true;
  if(q.answerType==='text') return true;
  if(q.answerType==='expr') return false;
  // answerType 미지정(구 데이터)은 index의 isExprInput과 같은 규칙: 한글이 있으면 텍스트
  if(q.answerType==null){
    return /[가-힣]/.test(String(q.answer??'')+(q.answerAlt||[]).join(''));
  }
  return false;
}

/* 식에 쓰인 문자(변수·단위) 집합 — 함수명은 제외
   수식 동치는 모든 문자를 같은 값으로 치환하므로, 쓰인 문자가 다르면 서로 다른 식으로 본다.
   (40km/h vs 40m, 2x+3 vs 2y+3 처럼 문자만 다른 답이 통과하던 문제 방지) */
function varsOf(s){
  let t=String(s??'').replace(/Math\./gi,'')
        .replace(/sqrt|cbrt|pow|abs|log|sin|cos|tan|pi/gi,'');
  return [...new Set(t.match(/[a-zA-Z]/g)||[])].sort().join('');
}

/* 정답이 스스로 대문자와 소문자를 갈라 쓰고 있는가 — 넓이 A 와 한 변 a 처럼
   같은 글자를 두 가지로 쓴 경우에만 참이다.
   이런 답만 대소문자를 구분해 채점하고, 나머지는 지금까지처럼 구분하지 않는다.
   (학생은 화면 키패드에 나온 글자를 누르므로 평소엔 구분이 오히려 방해가 된다.) */
function isCaseSignificant(s){
  const t=String(s??'');
  const lower=new Set(t.match(/[a-z]/g)||[]);
  return (t.match(/[A-Z]/g)||[]).some(ch=>lower.has(ch.toLowerCase()));
}

function gradeExamWord(q, ans){
  if(ans===null||ans===undefined) return false;
  const raw=String(ans).trim();
  if(!raw || raw==='(빈칸)') return false;
  const allAns=[q.answer,...(q.answerAlt||[])].filter(a=>a!=null&&String(a)!=='');
  if(!allAns.length) return false;
  const textMode=isTextAnswerQ(q);   // 텍스트 문항이면 수식 판정을 건너뛴다
  // 1) 수학적 동치 — 등식(=)·부등식(<, ≤, >, ≥)·그냥 식을 답 모양대로 갈라 판정
  if(!textMode) try{
    if(allAns.some(a=>mathEquivCheck(raw, String(a)))) return true;
  }catch(e){}
  // 2) 텍스트 정규화 비교 — 일반 모드와 동일한 normW (≤ 와 <= 는 같은 글자로 본다)
  //    대소문자는 정답이 A 와 a 를 갈라 쓴 경우에만 구분한다 (isCaseSignificant)
  const normW=(s,keepCase)=>{
    const t=String(s||"").replace(/−/g,"-").replace(/≤/g,"<=").replace(/≥/g,">=")
      .replace(/\s*,\s*/g,",")
      .replace(/\(\s+/g,"(").replace(/\s+\)/g,")").replace(/\s+/g,"").trim();
    return keepCase?t:t.toLowerCase();
  };
  if(allAns.some(a=>{ const ks=isCaseSignificant(a); return normW(a,ks)===normW(raw,ks); })) return true;
  // 3) 숫자 동치 — 문자가 섞인 식에는 쓰지 않는다
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
