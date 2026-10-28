/* ═══════════════════════════════════════════════════════════════
   grading.js — 채점 로직 단일 소스 (index.html / teacher.html 공용)

   일반 학습지·시험지·재채점 모두 judgeAnswer() 하나로 판정한다.
   채점 규칙을 바꿀 때는 이 파일만 수정하면 되고,
   HTML 안에 채점 함수를 복사해 넣지 말 것 (과거 세 벌 복사가 채점 불일치 사고의 원인).

   포함: normPi, evalAnswer, eqEquivCheck, ineqEquivCheck, mathEquivCheck, exprEquivCheck,
         _examEvExpr, isTextAnswerQ, varsOf, isCaseSignificant,
         normalizeMultiAnswer, gradeExamWord, judgeAnswer, stepAsQuestion, judgeStep,
         그래프 피드백 누적(drawingSig, feedbackLogAfterSave, feedbackView, feedbackEarlierHtml, formatFbAt — 맨 아래 절)
   캐시: <script src="grading.js?v=버전"> 형태로 로드해 갱신 시 쿼리를 올릴 것.
   ═══════════════════════════════════════════════════════════════ */

/* ══════════ 원주율 π ══════════
   π 는 문자(변수)가 아니라 상수 3.14159… 이다. 학생은 키패드의 π 버튼으로 넣고, 교사는 π 버튼·pi·\pi·Math.PI 중
   무엇으로 적어도 되도록 채점하기 전에 모두 π 한 글자로 통일한다(normPi).
   pi 는 앞뒤에 영문자가 붙어 있지 않을 때만 π 로 본다 — 낱말(api, pie)과 변수 곱(p·i·r)은 건드리지 않는다.
   그래서 2πr 을 pi 로 쓰려면 2pi*r 이나 2pi r 처럼 띄우거나 π 버튼을 쓴다.
   (정규식 lookbehind 는 옛 Safari 에서 파싱 자체가 죽으므로 쓰지 않는다 — 앞쪽 영문자는 콜백에서 가린다.) */
function normPi(s){
  return String(s??'')
    .replace(/Math\.PI/g,'π')
    .replace(/\\pi(?![a-zA-Z])/g,'π')
    .replace(/([a-zA-Z]*)pi([a-zA-Z]*)/gi,(m,a,b)=>(a||b)?m:'π');
}
/* 공백을 이미 지운 식에서 π 를 JS 로 계산할 수 있는 글로 바꾼다. 2π → 2*(Math.PI), (8π)/3 → (8*(Math.PI))/3 */
function piToJs(t){
  if(t.indexOf('π')<0) return t;
  return t.replace(/π/g,'(Math.PI)').replace(/(\d|\))\(/g,'$1*(').replace(/\)(\d)/g,')*$1');
}

/* 맨 앞·여는 괄호 뒤·곱셈/덧셈/뺄셈 뒤의 음수 부호를 (-1)* 로 바꾼다.
   JS 는 -x**2 처럼 단항 마이너스 바로 뒤에 거듭제곱이 오면 문법 오류로 막는다. 수학에서는 -x² = -(x²) 이므로 (-1)*x**2 와 같다.
   예전에는 이 오류를 삼켜 식이 통째로 NaN 이 되어(_compileMulti) 키패드로 쓴 -(x)**(2) 가 정답 -x^2 와 글자까지 같아야만 정답이었고,
   evalAnswer 는 -2^2 를 앞 숫자만 읽어 -2 로 돌려줬다(-4 여야 한다).
   · 지수 자리(x^-2)와 나눗셈 뒤(a/-b)는 뜻이 달라지므로 건드리지 않는다 — a/-b 를 a/(-1)*b 로 바꾸면 (a/-1)*b 가 된다.
   · 거듭제곱은 ^ 로 적혀 있어야 한다(** 는 먼저 ^ 로 바꿔 둘 것): 그래야 지수 앞의 * 와 구별된다.
   (-1)*x 는 -x 와 비트까지 같아서 이미 되던 식의 계산 결과는 달라지지 않는다. */
function negToMul(t){ return t.replace(/(^|[(*+\-])-/g,'$1(-1)*'); }

function evalAnswer(s){
  // 문자열 수식("8/3", "Math.sqrt(2)", "23/5", "6π")을 수치로 평가
  if(typeof s==='number') return s;
  if(s==null||s==='') return NaN;
  const hasPi=normPi(s).indexOf('π')>=0;
  /* 계산이 안 되면 맨 앞 숫자만 읽는 오랜 보험(parseFloat)이 있다. π 가 든 식에는 쓰면 안 된다 —
     「6π」가 6 으로 읽혀 정답 6 과 같아진다. */
  const fallback=()=>{ if(hasPi) return NaN; const n=parseFloat(s); return isNaN(n)?NaN:n; };
  let t=piToJs(negToMul(normPi(s).replace(/−/g,'-').replace(/\s/g,'').replace(/\*\*/g,'^')).replace(/\^/g,'**'));
  // 안전: 허용 문자(숫자, 연산자, 괄호, Math 함수)만
  if(!/^[-+*/().\d]+$/.test(t.replace(/Math\.(sqrt|cbrt|pow|abs|PI|E)/g,'').replace(/\*\*/g,''))){
    return fallback();
  }
  try{ return Function('"use strict";return('+t+')')(); }
  catch(e){ return fallback(); }
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
    /* π 는 값이 정해진 상수라 문자처럼 곱셈 생략(2π·πr)만 풀어 주고, 마지막에 3.14159… 로 바꾼다.
       normPi 가 pi·\pi·Math.PI 를 먼저 π 한 글자로 통일한다(Math. 를 지우기 전이어야 Math.PI 가 살아남는다). */
    let t=normPi(s).replace(/\s/g,'')
      .replace(/−/g,'-').replace(/×/g,'*').replace(/÷/g,'/')
      .replace(/Math\./gi,'')
      .replace(/sqrt\(/gi,'sqrt(')
      .replace(/\*\*/g,'^');
    let g=0;
    while(/sqrt\(/.test(t) && g++<12) t=t.replace(/sqrt\(([^()]*)\)/g,(_,v)=>`((${v})^0.5)`);
    if(/sqrt/i.test(t)) throw 0;
    let prev;
    do{prev=t;
      t=t.replace(/(\d|\)|[a-zA-Zπ])\(/g,'$1*(');
      t=t.replace(/\)(\d|[a-zA-Zπ]|\()/g,')*$1');
      t=t.replace(/(\d)([a-zA-Zπ])/g,'$1*$2');
      t=t.replace(/([a-zA-Zπ])(\d)/g,'$1*$2');
      t=t.replace(/([a-zA-Zπ])([a-zA-Zπ])/g,'$1*$2');
    }while(prev!==t);
    t=negToMul(t).replace(/\^/g,'**');   // -x^2 가 JS 문법 오류가 되지 않게 (negToMul 주석 참고) — 거듭제곱이 아직 ^ 일 때 한다
    // 허용 문자(숫자·영문자·π·사칙연산·괄호)만 남았는지 먼저 확인한 뒤에 치환한다
    if(!/^[a-zA-Zπ\d+\-*/().]+$/.test(t.replace(/\*\*/g,''))) throw 0;
    t=t.replace(/π/g,'(3.141592653589793)');
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

/* 숫자 답이 같은가 — 소수 다섯째 자리까지 비교한다 (v13.9, 교사 요청).
   예전에는 차가 0.001 보다 작으면 정답이라 정답 1/3 에 0.333 이 통과했고, 문자 없는 식은 위 _numEq(값에 비례한 오차)를 써서
   큰 수일수록 느슨했다(정답 1048576 에 1048577 이 정답). 이제 값 크기와 상관없이 차가 0.00001(다섯째 자리 한 칸)보다 작아야 한다:
   정답 1/3 에 0.33333·0.33334 는 정답, 0.3333 은 오답 · 정답 2/3 에 0.66667(반올림)·0.66666(버림) 정답.
   · 다섯째 자리가 딱 한 칸 다른 답(0.12346 ↔ 0.12345)은 부동소수점에서 차가 0.0000099999… 로 나와 기준을 겨우 넘지 못하므로 기준을 1e-9 만큼 낮춰 둔다.
   · 10억이 넘는 수는 부동소수점 자체의 오차가 다섯째 자리를 넘을 수 있어 값 크기에 비례한 아주 작은 여유를 둔다. */
function numAnsEq(a,b){
  if(typeof a!=='number'||typeof b!=='number'||!isFinite(a)||!isFinite(b)) return false;
  return Math.abs(a-b) < Math.max(1e-5-1e-9, 1e-14*Math.max(Math.abs(a),Math.abs(b)));
}

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
    return vars.length ? _numEq(uv,cv) : numAnsEq(uv,cv);   // 문자 없는 식(숫자 답)은 소수 다섯째 자리까지
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
    const t=normPi(s||"").replace(/−/g,"-").replace(/≤/g,"<=").replace(/≥/g,">=")
      .replace(/\s*,\s*/g,",")
      .replace(/\(\s+/g,"(").replace(/\s+\)/g,")").replace(/\s+/g,"").trim();
    return keepCase?t:t.toLowerCase();
  };
  if(allAns.some(a=>{ const ks=isCaseSignificant(a); return normW(a,ks)===normW(raw,ks); })) return true;
  // 3) 숫자 동치 — 문자가 섞인 식에는 쓰지 않는다
  //    (parseFloat("2x+5")===2 여서 정답 "2x+3"과 숫자만 같으면 오답이 정답 처리되던 오검출 방지)
  //    π 도 같다 — parseFloat("6π")===6 이라 정답 6 에 「6π」가 통과하고, 정답 「6π」에는 소수 근사(18.85)가 통과한다.
  //    학생 답은 맨 앞 숫자만 읽지(parseFloat) 않고 식 전체를 계산한다 — 예전에는 「1/3」이 1, 「2+3」이 2 로 읽혀 정답 1·2 에 통과했다.
  //    비교는 numAnsEq(소수 다섯째 자리까지, v13.9 — 예전에는 0.001 차이까지 정답).
  const hasVar=s=>/[a-zA-Zπ가-힣]/.test(normPi(s));
  if(!hasVar(raw)){
    const r=raw.replace(/−/g,'-');
    const uf=/^[+-]?(\d+\.?\d*|\.\d+)$/.test(r) ? Number(r) : _evalMulti(r,{});   // 「05」처럼 0 으로 시작하는 수는 JS 식으로는 오류라 따로 읽는다
    if(!isNaN(uf)){
      try{
        if(allAns.some(a=>{
          if(hasVar(a)) return false;
          return numAnsEq(uf, evalAnswer(String(a)));
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

/* ── 단계형의 한 단계 채점 (v13.0) ──
   단계의 답 유형(answerType)마다 따로 채점 규칙을 두면 같은 유형의 문항과 규칙이 어긋난다
   (예전에는 한글 용어 단계가 글자를 그대로 비교해서, 문항에서는 맞는 「이차 방정식」이 단계에서는 오답이었다).
   그래서 단계를 같은 유형의 '문항' 모양으로 바꿔 judgeAnswer 하나로 채점한다 —
   띄어쓰기·대소문자·≤ 표기·수식 동치 같은 규칙이 문항과 한 곳에서 맞춰진다.
     text  → 한글 용어   word / answerType text
     number→ 숫자 값     equation
     expr  → 문자 포함 식 word / answerType expr  (옛 이름 equation 도 같은 것)
     multi → 객관식      multi (options · answer 는 문항과 같은 모양)
   ※ 학생 화면(index)의 숫자 단계는 키패드 값을 직접 비교한다 — 문항 ② 숫자 값을 연습할 때와 같은 방식이다. */
function stepAsQuestion(step){
  const s=step||{};
  const at=(s.answerType==='equation') ? 'expr' : (s.answerType||'number');
  if(at==='multi')  return {type:'multi', options:s.options||[], answer:s.answer};
  if(at==='number') return {type:'equation', answer:s.answer, answerAlt:s.answerAlt||[]};
  return {type:'word', answerType:(at==='expr'?'expr':'text'), answer:s.answer, answerAlt:s.answerAlt||[]};
}
/** 단계 하나를 판정한다. ans: 문자열(용어·식) 또는 고른 선지 번호 배열(객관식, 0부터) */
function judgeStep(step, ans, tokens){
  return judgeAnswer(stepAsQuestion(step), ans, tokens);
}

/* ═══════════════════════════════════════════════════════════════
   학습지 완료 판정 (v9.3, index·teacher·scoring 공용)

   그래프 문항은 선생님이 scoring.html 에서 손으로 채점한다. 그래서 학습지에 그래프 문항이 있으면
   그림을 냈다고 끝이 아니라, 그래프 문항이 **모두 ⭕ 정답으로 채점된 뒤**에야 그 학습지가 완료다.
   (저장된 isComplete 가 true 여도 — 옛 규칙으로 완료된 기록 포함 — 그래프가 ❌ 오답이거나
    아직 채점 전이면 완료로 보여 주지 않는다. 다시 채점해 ⭕ 가 되면 그때 완료로 바뀐다.)
   ═══════════════════════════════════════════════════════════════ */
/* 이 학습지의 그래프 문항이 모두 정답으로 채점됐는가 (그래프 문항이 없으면 true) */
function graphsAllCorrect(questions, perQuestion){
  const pq = perQuestion || {};
  return (questions || []).every(q => !q || q.type !== 'graph' || pq[q.id]?.correct === true);
}
/* records 문서(rec) 하나가 "완료"인가 — 완료 플래그·완료 시각·전부 응답 중 하나가 있고,
   그래프 문항까지 모두 정답 채점된 경우. questions 가 없으면(학습지를 못 찾음) 옛 규칙 그대로. */
function recordIsDone(rec, questions){
  if(!rec) return false;
  const flag = !!(rec.isComplete || rec.completedAt ||
                  (rec.answeredCount && rec.totalCount && rec.answeredCount >= rec.totalCount));
  if(!flag) return false;
  return Array.isArray(questions) ? graphsAllCorrect(questions, rec.perQuestion) : true;
}

/* ═══════════════════════════════════════════════════════════════
   문항별 풀이 이력 (grading v10.0 — teacher v5.0 · index v10.0 공용)

   정답률(correctRate)은 「마지막에 맞힌 문항 ÷ 전체 문항」이라 여러 번 틀리다 맞혀도
   한 번에 맞힌 것과 같고, 안 푼 문항은 틀린 것과 구별되지 않는다. 그래서 문항마다 상태를 나눈다:
     first      — 첫 시도에 바로 맞힘
     recovered  — 틀렸다가 다시 풀어 맞힘
     wrong      — 지금도 틀린 상태 (오답을 낸 적 있고 아직 못 맞힘)
     partial    — 단계형을 몇 단계만 풀고 멈춤 (오답은 없음)
     pending    — 그래프를 냈지만 아직 선생님 채점 전
     unanswered — 답을 한 번도 내지 않음
   오답 횟수는 wrongInputs(서로 다른 오답) 개수 — teacher 의 「시도」 열·✓(n) 표시와 같은 기준.
   attempts 는 쓰지 않는다: 옛 기록에는 정답 제출까지 센 것이 있어 한 번에 맞힌 문항도 「고침」으로 잘못 나뉜다.
   시험지 문항(examAnswer)은 다시 풀기가 없으므로 여기서 다루지 않는다 — 부르는 쪽이 일반 학습지에만 쓴다.
   ═══════════════════════════════════════════════════════════════ */
function questionHistory(q, v){
  const wrongs = Array.isArray(v?.wrongInputs) ? v.wrongInputs.map(x => String(x ?? '')) : [];
  const wrongCount = wrongs.length;
  if(!v) return { status:'unanswered', wrongCount:0, wrongs:[] };
  if(q && q.type === 'graph'){
    if(!v.drawing) return { status:'unanswered', wrongCount:0, wrongs:[] };
    return { status: v.correct === true ? 'first' : v.correct === false ? 'wrong' : 'pending', wrongCount:0, wrongs:[] };
  }
  if(v.correct === true) return { status: wrongCount > 0 ? 'recovered' : 'first', wrongCount, wrongs };
  // 아직 못 맞힌 문항의 attempts 에는 정답 제출이 섞일 수 없으니 함께 본다(오답 글이 없어진 옛 기록 대비)
  const wrongCountNow = Math.max(wrongCount, Number(v.attempts) || 0);
  if(wrongCountNow > 0) return { status:'wrong', wrongCount: wrongCountNow, wrongs };
  const sd = Array.isArray(v.stepDone) ? v.stepDone : null;
  if(sd && sd.some(Boolean)) return { status:'partial', wrongCount:0, wrongs:[], stepsDone: sd.filter(Boolean).length, stepsTotal: sd.length };
  return { status:'unanswered', wrongCount:0, wrongs:[] };
}
/* 기록 하나의 요약 — 분모는 correctRate 와 같이 링크 문항을 뺀 전체 문항 수.
   firstTryRate = 첫 시도에 맞힌 문항 비율(%), unanswered = 미답변 + 단계형 미완(끝까지 답하지 못한 문항) */
function recordHistoryStats(questions, perQuestion){
  const pq = perQuestion || {};
  const qs = (questions || []).filter(q => q && q.type !== 'link');
  const c = { total: qs.length, first:0, recovered:0, wrong:0, partial:0, pending:0, unanswered:0 };
  qs.forEach(q => { c[questionHistory(q, pq[q.id]).status]++; });
  c.firstTryRate = c.total ? Math.round(c.first / c.total * 100) : null;
  c.notAnswered = c.unanswered + c.partial;
  return c;
}

/* ═══════════════════════════════════════════════════════════════
   그래프 피드백 누적 (grading v14.6 — index 14.6 · scoring 2.7 · teacher 6.10 공용)

   그래프 문항의 선생님 피드백은 perQuestion.{문항id}.feedback 한 칸뿐이라 새로 쓰면 덮어쓰고, 학생이 그래프를 고쳐 다시 내면
   index 가 첨삭·피드백·판정을 지운다. 이 칸은 「지금 답안에 대한 최신 피드백」으로 그대로 둔다(챗 알림이 그 뜻에 기대고 있다).
   지난 피드백은 기록 문서 **최상위** graphFeedbackLog[문항id] = [{at, text, d}, …](오래된 것이 앞)에 따로 쌓는다.
     at   — 마지막으로 저장한 때(ISO). 모르면 ''(옛 기록에서 건져 온 것)
     text — 피드백 글
     d    — 그 글을 남긴 학생 답안의 지문(drawingSig). 같은 답안에 대한 수정은 마지막 줄을 덮어쓰고(오타를 고칠 때마다 줄이 늘지 않게),
            답안이 바뀐 뒤의 피드백은 새 줄로 쌓는다. index 가 학생 기록을 저장해도 이 필드는 건드리지 않는다.
   최상위인 이유는 graphErrorTypes 와 같다 — index 가 perQuestion.{문항id} 를 정해진 키로 통째로 다시 써서 그 안의 새 키는 지워진다.
   첨삭 그림(teacherDrawing)은 PNG 문자열이라 쌓으면 문서 1MB 한도에 닿을 수 있어 누적하지 않는다.
   ═══════════════════════════════════════════════════════════════ */
const FB_LOG_MAX = 30;   // 문항 하나에 남기는 최대 줄 수 — 넘으면 가장 오래된 것부터 버린다(글이라 이 정도면 한도와 한참 멀다)

/* 학생 답안(PNG 데이터 문자열)의 지문 — 같은 답안인지만 알면 되므로 길이 + 32비트 해시. 답안이 없으면 '' */
function drawingSig(drawing){
  const s = String(drawing ?? '');
  if(!s) return '';
  let h = 0x811c9dc5;
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return s.length.toString(36) + '.' + (h >>> 0).toString(36);
}
/* 저장돼 있던 로그를 믿을 수 있는 꼴로 — 배열이 아니거나 글이 빈 줄은 거른다 */
function normFbLog(log){
  return (Array.isArray(log) ? log : [])
    .filter(e => e && typeof e === 'object' && String(e.text ?? '').trim())
    .map(e => ({ at: String(e.at ?? ''), text: String(e.text), d: String(e.d ?? '') }));
}
/* 피드백을 저장할 때 쌓을 새 로그 — { log, changed }. changed 가 false 면 쓰지 않아도 된다.
   · 같은 답안(d 가 마지막 줄과 같음)에 대한 저장: 글이 같으면 그대로, 다르면 마지막 줄을 덮어쓰고, 글을 비웠으면 그 줄을 뺀다
   · 다른 답안(또는 처음): 글이 있으면 새 줄로 쌓는다(글을 비운 저장은 쌓을 것이 없다)
   nowIso 를 ''로 주면 날짜를 모르는 줄이 된다(학생 화면이 옛 피드백을 건져 둘 때). */
function feedbackLogAfterSave(log, text, drawing, nowIso){
  const arr = normFbLog(log);
  const t = String(text ?? '').trim();
  const d = drawingSig(drawing);
  const last = arr[arr.length - 1];
  const same = !!(last && d && last.d === d);
  if(!t){
    if(same){ arr.pop(); return { log: arr, changed: true }; }
    return { log: arr, changed: false };
  }
  if(same){
    if(last.text === t) return { log: arr, changed: false };
    arr[arr.length - 1] = { at: String(nowIso ?? ''), text: t, d };
    return { log: arr, changed: true };
  }
  if(last && !d && last.text === t) return { log: arr, changed: false };   // 답안 지문이 없을 때 같은 글을 되풀이 저장해도 줄을 늘리지 않는다
  arr.push({ at: String(nowIso ?? ''), text: t, d });
  while(arr.length > FB_LOG_MAX) arr.shift();
  return { log: arr, changed: true };
}
/* 화면에 보여 줄 것 — { latest, earlier }
   latest  = 지금 답안에 대한 피드백(perQuestion.feedback). 없으면 null. { text, at, n } (at·n 은 로그에서 찾았을 때만, 못 찾으면 '' · 0)
   earlier = 이전 답안에 남긴 피드백들, 최근 것이 앞. { text, at, n }  (n = 몇 번째로 남긴 피드백인지, 1부터)
   지금 답안에 대한 줄(로그의 마지막 줄이 이 답안 지문과 같을 때)은 latest 와 겹치므로 earlier 에서 뺀다. */
function feedbackView(log, drawing, currentFeedback){
  const arr = normFbLog(log);
  const d = drawingSig(drawing);
  const cur = (d && arr.length && arr[arr.length - 1].d === d) ? arr.length - 1 : -1;
  const text = String(currentFeedback ?? '').trim();
  const latest = text ? { text, at: cur >= 0 ? arr[cur].at : '', n: cur >= 0 ? cur + 1 : 0 } : null;
  const earlier = [];
  for(let i = arr.length - 1; i >= 0; i--){
    if(i === cur) continue;
    earlier.push({ text: arr[i].text, at: arr[i].at, n: i + 1 });
  }
  return { latest, earlier };
}
/* ISO 시각 → '10/28 14:20' (보는 사람의 시계). 모르면 '' */
function formatFbAt(iso){
  const t = Date.parse(iso || '');
  if(!isFinite(t)) return '';
  const dt = new Date(t), p = n => String(n).padStart(2, '0');
  return (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + p(dt.getHours()) + ':' + p(dt.getMinutes());
}
function _fbEsc(s){
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
/* 이전 피드백 목록 HTML — 학생 화면·scoring·teacher 가 같은 모양으로 쓴다. 최신 피드백과 한눈에 구별되도록 회색 점선 틀 안에 작게 둔다.
   opts.open = 처음부터 펼칠지(최신 피드백이 없을 때), opts.note = 제목 옆 설명. 이전 피드백이 없으면 ''. */
function feedbackEarlierHtml(earlier, opts){
  const list = Array.isArray(earlier) ? earlier : [];
  if(!list.length) return '';
  const o = opts || {};
  const items = list.map(e => {
    const when = formatFbAt(e.at);
    return '<div style="margin-top:6px;padding:6px 10px;border-left:3px solid var(--rule,#d1d5db);background:var(--paper,#f9fafb);border-radius:0 6px 6px 0">'
      + '<div style="font-size:12px;font-weight:600;color:var(--ink2,#4b5563);margin-bottom:2px">' + (e.n ? e.n + '번째 피드백' : '이전 피드백') + (when ? ' · ' + when : '') + '</div>'
      + '<div style="font-size:13px;color:var(--ink2,#4b5563);white-space:pre-line;word-break:break-word">' + _fbEsc(e.text) + '</div></div>';
  }).join('');
  return '<details class="fb-earlier"' + (o.open ? ' open' : '') + ' style="margin-top:8px;padding:6px 10px;border:1px dashed var(--rule,#d1d5db);border-radius:8px">'
    + '<summary style="cursor:pointer;font-size:12px;font-weight:700;color:var(--ink2,#4b5563)">🕘 이전 피드백 ' + list.length + '개'
    + (o.note ? ' <span style="font-weight:400">— ' + _fbEsc(o.note) + '</span>' : '') + '</summary>'
    + items + '</details>';
}
