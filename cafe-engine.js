/*!
 * cafe-engine.js — 「카페 타이쿤」 계산 엔진  v1.0
 * 중학교 1학년 <정수와 유리수> 학습용 카페 경영 게임의 규칙 엔진.
 *
 * 이 파일에는 화면(DOM) 코드가 전혀 없다. 브라우저(cafe-tycoon.html)와
 * Node(점검_카페.js) 양쪽에서 그대로 불러 쓸 수 있고, 그래서 규칙을 자동 검증할 수 있다.
 *
 * ■ 설계 원칙
 *   1) 모든 수는 Fraction(분자/분모 정수쌍)으로만 계산한다. 부동소수점 연산 금지.
 *      (0.75 같은 소수를 쓰면 3/4 + 1/3 같은 계산에서 오차가 생기고, 학생에게 보여 줄
 *       계산식도 교과서와 달라진다.)
 *   2) 수치·아이템은 이 파일에 없다. 전부 cafe-catalog.js 에 있다.
 *   3) 상태(state)는 그대로 JSON 으로 저장·복원할 수 있다 → 나중에 Firestore 연결이 쉽다.
 *
 * ■ 핵심 계산 (반비례)
 *   직원 1명이 업무를 n가지 맡으면, 업무 하나당 처리량 = 업무능력 ÷ n
 *   → 업무능력이 상수이므로 (맡은 업무 수) × (업무 하나당 처리량) = 업무능력, 즉 반비례다.
 *   업무별 "가능 손님 수" = 그 업무의 처리량 합계 ÷ 손님 1명당 필요 업무량
 *   → 열린 업무 중 가장 작은 값이 이번 주에 받을 수 있는 손님 수(병목)가 된다.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;   // Node
  if (typeof window !== 'undefined') window.CafeGame = api;                 // 브라우저
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* ══════════════════════════════════════════════════════════════════════════
   1. Fraction — 유리수  (cardgame-engine.js 의 것과 같은 구현)
   ══════════════════════════════════════════════════════════════════════════
   「유리수 배틀」과 똑같이 동작하도록 그대로 옮겨 왔다. 두 게임이 서로를 불러 쓰지
   않게 해서(각각 독립 페이지) 한쪽을 고쳐도 다른 쪽이 깨지지 않게 한다.
   ────────────────────────────────────────────────────────────────────────── */

/** 유클리드 호제법으로 최대공약수를 구한다. 0에 대해서는 1을 돌려 약분을 무해하게 만든다. */
function igcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { var t = a % b; a = b; b = t; }
  return a || 1;
}

function Fraction(numerator, denominator) {
  if (denominator === undefined) denominator = 1;
  if (denominator === 0) throw new Error('분모가 0인 유리수는 만들 수 없습니다.');
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new Error('Fraction 은 정수 분자·분모로만 만듭니다: ' + numerator + '/' + denominator);
  }
  if (denominator < 0) { numerator = -numerator; denominator = -denominator; }  // 분모는 항상 양수
  var g = igcd(numerator, denominator);                                          // 약분
  this.numerator = numerator / g;
  this.denominator = denominator / g;
}

/** 짧게 쓰는 생성자.  F(3,4) → 3/4,  F(5) → 5 */
function F(n, d) { return new Fraction(n, d === undefined ? 1 : d); }

Fraction.prototype = {
  constructor: Fraction,
  add: function (o) {
    return new Fraction(this.numerator * o.denominator + o.numerator * this.denominator,
                        this.denominator * o.denominator);
  },
  sub: function (o) {
    return new Fraction(this.numerator * o.denominator - o.numerator * this.denominator,
                        this.denominator * o.denominator);
  },
  mul: function (o) {
    return new Fraction(this.numerator * o.numerator, this.denominator * o.denominator);
  },
  div: function (o) {
    if (o.numerator === 0) throw new Error('0으로 나눌 수 없습니다.');
    return new Fraction(this.numerator * o.denominator, this.denominator * o.numerator);
  },
  recip: function () {
    if (this.numerator === 0) throw new Error('0의 역수는 없습니다.');
    return new Fraction(this.denominator, this.numerator);
  },
  abs: function () { return new Fraction(Math.abs(this.numerator), this.denominator); },
  neg: function () { return new Fraction(-this.numerator, this.denominator); },
  cmp: function (o) {
    var L = this.numerator * o.denominator, R = o.numerator * this.denominator;
    return L < R ? -1 : (L > R ? 1 : 0);
  },
  eq:  function (o) { return this.cmp(o) === 0; },
  lt:  function (o) { return this.cmp(o) <  0; },
  gt:  function (o) { return this.cmp(o) >  0; },
  lte: function (o) { return this.cmp(o) <= 0; },
  gte: function (o) { return this.cmp(o) >= 0; },
  isZero: function () { return this.numerator === 0; },
  isNeg:  function () { return this.numerator < 0; },
  isPos:  function () { return this.numerator > 0; },
  isInt:  function () { return this.denominator === 1; },
  /** 화면 표기: 정수면 "5", 아니면 기약분수 "3/4" */
  toString: function () {
    return this.denominator === 1 ? String(this.numerator)
                                  : this.numerator + '/' + this.denominator;
  },
  /** 대분수 표기. 27 1/2 형태. 정수/진분수면 toString 과 같다. */
  toMixed: function () {
    if (this.denominator === 1) return String(this.numerator);
    var n = Math.abs(this.numerator), d = this.denominator, w = Math.floor(n / d), r = n % d;
    if (w === 0) return this.toString();
    return (this.numerator < 0 ? '-' : '') + w + ' ' + r + '/' + d;
  },
  /** 저장용. 항상 "분자/분모" 꼴이라 불러올 때 되살릴 수 있다. */
  toJSON: function () { return this.numerator + '/' + this.denominator; },
  clone:  function () { return new Fraction(this.numerator, this.denominator); }
};

/** " 3/4 ", "5", {numerator,denominator}, 3 등을 Fraction 으로 되돌린다. */
Fraction.parse = function (v) {
  if (v instanceof Fraction) return v.clone();
  if (v && typeof v === 'object' && 'numerator' in v) return new Fraction(v.numerator, v.denominator);
  if (typeof v === 'number') return new Fraction(v, 1);
  var s = String(v).trim();
  var m = s.match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
  if (m) return new Fraction(parseInt(m[1], 10), parseInt(m[2], 10));
  if (/^-?\d+$/.test(s)) return new Fraction(parseInt(s, 10), 1);
  throw new Error('유리수로 해석할 수 없습니다: ' + v);
};

var ZERO = F(0);

function fmt(x)  { return x.toString(); }
/** 분수를 넘지 않는 최대 정수 (손님은 사람이라 소수점으로 받을 수 없다) */
function floorF(x) { return Math.floor(x.numerator / x.denominator); }
/** 분수 이상인 최소 정수 */
function ceilF(x)  { return Math.ceil(x.numerator / x.denominator); }

/* ══════════════════════════════════════════════════════════════════════════
   2. 카탈로그 — cafe-catalog.js 를 읽어 분수 문자열을 Fraction 으로 바꿔 둔다
   ══════════════════════════════════════════════════════════════════════════ */

var CAT = null;

/** 카탈로그를 등록한다. 게임을 시작하기 전에 반드시 한 번 불러야 한다. */
function setCatalog(raw) {
  if (!raw) throw new Error('카탈로그가 없습니다. cafe-catalog.js 를 먼저 불러오세요.');
  var r = raw.규칙;
  var c = {
    원본: raw,
    버전: raw.버전,
    규칙: {
      시즌주차: r.시즌주차,
      시작코인: r.시작코인,
      시작평판: r.시작평판,
      시작직원: r.시작직원.slice(),
      최대직원수: r.최대직원수 || 6,
      손님1명당매출: r.손님1명당매출,
      평판배수: {},
      만족기준: Fraction.parse(r.만족기준),
      주차별손님: r.주차별손님.slice(),
      SNS: {
        기본확률: r.SNS.기본확률,
        매력도계수: r.SNS.매력도계수,
        최대확률: r.SNS.최대확률,
        배수: Fraction.parse(r.SNS.배수),
        예약주차제외: !!r.SNS.예약주차제외
      }
    },
    업무: [], 업무별: {},
    직원유형: [], 직원유형별: {},
    능력표: raw.업무능력표.slice(),
    인테리어: raw.인테리어.slice(), 인테리어별: {},
    세트보너스: raw.세트보너스.slice(),
    시설: raw.시설.slice(), 시설별: {},
    예약미션: [], 예약별: {},
    이미지: raw.이미지 || { 폴더: 'assets/cafe/' }
  };

  Object.keys(r.평판배수).forEach(function (k) { c.규칙.평판배수[k] = Fraction.parse(r.평판배수[k]); });

  raw.업무.forEach(function (t) {
    var o = {
      id: t.id, 이름: t.이름, 필요업무량: Fraction.parse(t.필요업무량),
      열리는주차: t.열리는주차 || null, 열리는시설: t.열리는시설 || null,
      색: t.색 || '#888', 이미지: t.이미지 || null
    };
    if (o.필요업무량.isZero() || o.필요업무량.isNeg()) {
      throw new Error('업무 "' + o.이름 + '" 의 필요업무량은 0보다 커야 합니다.');
    }
    c.업무.push(o); c.업무별[o.id] = o;
  });

  raw.직원유형.forEach(function (s) {
    var 보정 = {};
    Object.keys(s.보정 || {}).forEach(function (k) { 보정[k] = Fraction.parse(s.보정[k]); });
    var o = {
      id: s.id, 이름: s.이름, 고용비: s.고용비, 주급: s.주급,
      고용가능주차: s.고용가능주차 || 1, 보정: 보정, 설명: s.설명 || '', 이미지: s.이미지 || null
    };
    c.직원유형.push(o); c.직원유형별[o.id] = o;
  });

  c.인테리어.forEach(function (d) { c.인테리어별[d.id] = d; });
  c.시설.forEach(function (f) { c.시설별[f.id] = f; });

  (raw.예약미션 || []).forEach(function (m) {
    var o = {
      주차: m.주차, 준비: F(m.준비), 계수: Fraction.parse(m.계수),
      총량: F(m.총량), 답: m.답, 이야기: m.이야기 || ''
    };
    // 준비 + 계수 × 답 = 총량 이 실제로 성립하는지 확인한다.
    // (설정표의 수치를 고쳤을 때 방정식이 안 맞는 채로 학생에게 나가는 사고를 막는다.)
    var 좌변 = o.준비.add(o.계수.mul(F(o.답)));
    if (!좌변.eq(o.총량)) {
      throw new Error(o.주차 + '주차 예약미션의 방정식이 맞지 않습니다: ' +
        fmt(o.준비) + ' + ' + fmt(o.계수) + ' × ' + o.답 + ' = ' + fmt(좌변) +
        ' (총량 ' + fmt(o.총량) + ' 이어야 함)');
    }
    c.예약미션.push(o); c.예약별[o.주차] = o;
  });

  CAT = c;
  return c;
}
function getCatalog() {
  if (!CAT) throw new Error('setCatalog() 를 먼저 부르세요.');
  return CAT;
}

/* ══════════════════════════════════════════════════════════════════════════
   3. 게임 상태 만들기
   ══════════════════════════════════════════════════════════════════════════
   state = {
     주차, 코인(F), 평판(1~5), 직원[], 인테리어[id], 시설[id],
     누적:{매출(F), 급여(F), 투자(F)}, 기록[], 다음주배수(F|null), 예보{}, 끝남
   }
   ────────────────────────────────────────────────────────────────────────── */

function 능력(st, 직원) {
  var c = getCatalog();
  var row = c.능력표[직원.레벨 - 1];
  if (!row) throw new Error('없는 레벨입니다: ' + 직원.레벨);
  return F(row.업무능력);
}

function 직원추가(st, 유형id) {
  var c = getCatalog();
  var t = c.직원유형별[유형id];
  if (!t) throw new Error('없는 직원 유형입니다: ' + 유형id);
  st._다음직원번호 = (st._다음직원번호 || 0) + 1;
  var s = { id: 's' + st._다음직원번호, 유형: 유형id, 이름: t.이름 + ' ' + st._다음직원번호, 레벨: 1 };
  st.직원.push(s);
  return s;
}

function newGame(opts) {
  var c = getCatalog();
  opts = opts || {};
  var st = {
    주차: 1,
    코인: F(c.규칙.시작코인),
    평판: c.규칙.시작평판,
    직원: [],
    인테리어: [],
    시설: [],
    좋아요매력도: 0,           // 친구가 눌러 준 좋아요로 얻는 매력도 (온라인 연결 후 사용)
    누적: { 매출: ZERO, 급여: ZERO, 투자: ZERO },
    기록: [],
    다음주배수: null,
    예보: null,
    끝남: false,
    _다음직원번호: 0
  };
  (opts.시작직원 || c.규칙.시작직원).forEach(function (t) { 직원추가(st, t); });
  주간시작(st);
  return st;
}

/** 이번 주에 열려 있는 업무 목록 */
function 열린업무(st) {
  var c = getCatalog();
  return c.업무.filter(function (t) {
    if (t.열리는시설) return st.시설.indexOf(t.열리는시설) >= 0;
    return st.주차 >= (t.열리는주차 || 1);
  });
}

/** 이번 주 손님 예보를 정한다 (주가 시작될 때 자동으로 불린다) */
function 주간시작(st) {
  var c = getCatalog();
  var w = st.주차;
  var 미션 = c.예약별[w] || null;
  var 기본 = 미션 ? 미션.답 : c.규칙.주차별손님[w - 1];
  if (기본 === undefined) throw new Error(w + '주차의 손님 수가 설정표에 없습니다.');

  var 배수 = st.다음주배수 || null;
  var 손님 = F(기본);
  if (배수) 손님 = 손님.mul(배수);

  st.예보 = {
    주차: w,
    기본손님: 기본,
    배수: 배수,                 // SNS가 터졌으면 그 배수, 아니면 null
    손님수: ceilF(손님),        // 실제로 찾아올 손님 수
    숨김: !!미션,               // 예약 주문 주는 손님 수를 화면에 보여 주지 않는다
    미션: 미션
  };
  st.다음주배수 = null;
  return st.예보;
}

/* ══════════════════════════════════════════════════════════════════════════
   4. 업무 배정 계산 — 반비례가 실제로 일어나는 곳
   ══════════════════════════════════════════════════════════════════════════
   배정 = { 직원id: [업무id, ...], ... }
   ────────────────────────────────────────────────────────────────────────── */

/** 직원이 맡은 업무 목록 중 지금 열려 있는 것만 남긴다 (닫힌 업무에 배정해도 무시) */
function 유효배정(st, 배정, 직원) {
  var 열린 = 열린업무(st).map(function (t) { return t.id; });
  var ts = (배정 && 배정[직원.id]) || [];
  var out = [];
  ts.forEach(function (id) { if (열린.indexOf(id) >= 0 && out.indexOf(id) < 0) out.push(id); });
  return out;
}

/** 직원 한 명이 업무 하나에 내는 처리량 = 업무능력 ÷ 맡은 업무 수 × 보정 */
function 처리량(st, 직원, 맡은업무들, 업무id) {
  var c = getCatalog();
  var n = 맡은업무들.length;
  if (!n || 맡은업무들.indexOf(업무id) < 0) return ZERO;
  var v = 능력(st, 직원).div(F(n));
  var 보정 = c.직원유형별[직원.유형].보정[업무id];
  if (보정) v = v.mul(보정);
  return v;
}

/**
 * 이번 주 배정 결과를 계산한다. 영업을 시작하기 전 미리보기에도, 결과 계산에도 같이 쓴다.
 * 돌려주는 값의 업무별 항목에는 학생에게 펼쳐 보여 줄 계산식(식)도 들어 있다.
 */
function 계획(st, 배정) {
  var c = getCatalog();
  var 열린 = 열린업무(st);

  var 배정표 = {};                       // 직원id → 유효한 업무 목록
  var 미배정직원 = [];
  st.직원.forEach(function (s) {
    var ts = 유효배정(st, 배정, s);
    배정표[s.id] = ts;
    if (!ts.length) 미배정직원.push(s.id);
  });

  var 업무결과 = 열린.map(function (t) {
    var 담당 = [], 합 = ZERO, 담당식 = [], 항 = [];
    st.직원.forEach(function (s) {
      var ts = 배정표[s.id];
      if (ts.indexOf(t.id) < 0) return;
      var v = 처리량(st, s, ts, t.id);
      합 = 합.add(v);
      담당.push({ 직원: s.id, 이름: s.이름, 업무수: ts.length, 몫: v });
      var 보정 = c.직원유형별[s.유형].보정[t.id];
      담당식.push(s.이름 + ': ' + fmt(능력(st, s)) + ' ÷ ' + ts.length +
                  (보정 ? ' × ' + fmt(보정) : '') + ' = ' + fmt(v));
      항.push(fmt(v));
    });
    var 가능 = 합.isZero() ? ZERO : 합.div(t.필요업무량);
    return {
      id: t.id, 이름: t.이름, 색: t.색, 이미지: t.이미지,
      필요: t.필요업무량,
      처리량: 합,
      가능손님: 가능,
      가능손님정수: floorF(가능),
      담당: 담당,
      식: {
        담당: 담당식,
        합계: 항.length > 1 ? (항.join(' + ') + ' = ' + fmt(합)) : null,
        손님: fmt(합) + ' ÷ ' + fmt(t.필요업무량) + ' = ' + fmt(가능)
      }
    };
  });

  var 병목 = null, 최소 = null;
  업무결과.forEach(function (r) {
    if (최소 === null || r.가능손님.lt(최소)) { 최소 = r.가능손님; 병목 = r.id; }
  });

  return {
    업무: 업무결과,
    병목: 병목,
    가능손님: 업무결과.length ? floorF(최소) : 0,
    가능손님분수: 업무결과.length ? 최소 : ZERO,
    예상손님: st.예보 ? st.예보.손님수 : 0,
    미배정직원: 미배정직원,
    빈업무: 업무결과.filter(function (r) { return r.처리량.isZero(); }).map(function (r) { return r.id; }),
    배정표: 배정표
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   5. 매력도 · SNS
   ══════════════════════════════════════════════════════════════════════════ */

function 매력도(st) {
  var c = getCatalog();
  var v = 0;
  st.인테리어.forEach(function (id) { var d = c.인테리어별[id]; if (d) v += d.매력도; });
  c.세트보너스.forEach(function (b) {
    var 세트원 = c.인테리어.filter(function (d) { return d.세트 === b.세트; });
    var 다샀나 = 세트원.length > 0 && 세트원.every(function (d) { return st.인테리어.indexOf(d.id) >= 0; });
    if (다샀나) v += b.매력도;
  });
  return v + (st.좋아요매력도 || 0);
}

/** 완성한 세트 이름 목록 (화면 표시용) */
function 완성세트(st) {
  var c = getCatalog();
  return c.세트보너스.filter(function (b) {
    var 세트원 = c.인테리어.filter(function (d) { return d.세트 === b.세트; });
    return 세트원.length > 0 && 세트원.every(function (d) { return st.인테리어.indexOf(d.id) >= 0; });
  }).map(function (b) { return b.세트; });
}

/** 다음 주에 SNS가 터질 확률(%) */
function SNS확률(st) {
  var c = getCatalog();
  var 다음 = st.주차 + 1;
  if (다음 > c.규칙.시즌주차) return 0;
  if (c.규칙.SNS.예약주차제외 && c.예약별[다음]) return 0;   // 예약 주문 주에는 발동하지 않는다
  return Math.min(c.규칙.SNS.최대확률, c.규칙.SNS.기본확률 + 매력도(st) * c.규칙.SNS.매력도계수);
}

/* ══════════════════════════════════════════════════════════════════════════
   6. 영업 — 한 주를 마감한다
   ══════════════════════════════════════════════════════════════════════════ */

/** 손님 1명이 쓰는 코인 = (기본 매출 + 시설 보너스) × 평판 배수 */
function 손님단가(st) {
  var c = getCatalog();
  var 기본 = c.규칙.손님1명당매출;
  st.시설.forEach(function (id) { var f = c.시설별[id]; if (f) 기본 += (f.매출증가 || 0); });
  return F(기본).mul(c.규칙.평판배수[String(st.평판)]);
}

function 주급합(st) {
  var c = getCatalog();
  return st.직원.reduce(function (a, s) { return a.add(F(c.직원유형별[s.유형].주급)); }, ZERO);
}

function 누적순이익(st) { return st.누적.매출.sub(st.누적.급여).sub(st.누적.투자); }

/**
 * 이번 주 영업을 실행한다. state 를 다음 주로 넘기고, 이번 주 기록을 돌려준다.
 * rng 는 0 이상 1 미만의 수를 돌려주는 함수(기본 Math.random). 검사할 때 고정할 수 있다.
 */
function 영업(st, 배정, rng) {
  if (st.끝남) throw new Error('시즌이 이미 끝났습니다.');
  var c = getCatalog();
  rng = rng || Math.random;

  var p = 계획(st, 배정);
  var 예상 = st.예보.손님수;
  var 받은 = Math.max(0, Math.min(예상, p.가능손님));

  var 단가 = 손님단가(st);
  var 매출 = F(받은).mul(단가);
  var 급여 = 주급합(st);
  var 순익 = 매출.sub(급여);

  st.코인 = st.코인.add(순익);
  st.누적.매출 = st.누적.매출.add(매출);
  st.누적.급여 = st.누적.급여.add(급여);

  // 평판: 예상 손님을 다 받으면 ↑, 만족기준(3/4)보다 적게 받으면 ↓
  var 이전평판 = st.평판, 평가;
  if (예상 > 0 && 받은 >= 예상)                                     { 평가 = '만족'; st.평판 = Math.min(5, st.평판 + 1); }
  else if (예상 > 0 && F(받은).div(F(예상)).lt(c.규칙.만족기준))     { 평가 = '불만'; st.평판 = Math.max(1, st.평판 - 1); }
  else                                                              { 평가 = '보통'; }

  // 다음 주 SNS 굴리기
  var 확률 = SNS확률(st), SNS = false;
  if (확률 > 0 && rng() * 100 < 확률) { SNS = true; st.다음주배수 = c.규칙.SNS.배수; }

  var 기록 = {
    주차: st.주차,
    예상손님: 예상,
    받은손님: 받은,
    놓친손님: Math.max(0, 예상 - 받은),
    병목: p.병목,
    병목이름: (function () { var r = p.업무.filter(function (x) { return x.id === p.병목; })[0]; return r ? r.이름 : null; })(),
    업무: p.업무.map(function (r) {
      return { id: r.id, 이름: r.이름, 처리량: r.처리량, 가능손님: r.가능손님, 가능손님정수: r.가능손님정수, 식: r.식 };
    }),
    단가: 단가, 매출: 매출, 급여: 급여, 순익: 순익,
    코인: st.코인, 평판이전: 이전평판, 평판이후: st.평판, 평가: 평가,
    매력도: 매력도(st), SNS확률: 확률, SNS발동: SNS,
    미션: st.예보.미션 ? { 주차: st.예보.미션.주차, 답: st.예보.미션.답, 성공: 받은 >= 예상 } : null,
    배정: JSON.parse(JSON.stringify(p.배정표))
  };
  st.기록.push(기록);

  st.주차 += 1;
  if (st.주차 > c.규칙.시즌주차) { st.끝남 = true; st.예보 = null; }
  else 주간시작(st);

  return 기록;
}

/* ══════════════════════════════════════════════════════════════════════════
   7. 상점 — 돈 쓰는 곳 네 갈래
   ══════════════════════════════════════════════════════════════════════════
   모두 { ok:true } 또는 { ok:false, 이유:'...' } 를 돌려준다.
   산 값은 전부 누적.투자 에 쌓이고, 누적 순이익 = 매출 − 급여 − 투자 가 된다.
   ────────────────────────────────────────────────────────────────────────── */

function 지불(st, 금액) {
  var v = F(금액);
  if (st.코인.lt(v)) return false;
  st.코인 = st.코인.sub(v);
  st.누적.투자 = st.누적.투자.add(v);
  return true;
}

function 고용(st, 유형id) {
  var c = getCatalog();
  var t = c.직원유형별[유형id];
  if (!t) return { ok: false, 이유: '없는 직원 유형입니다.' };
  if (st.직원.length >= c.규칙.최대직원수) return { ok: false, 이유: '직원은 최대 ' + c.규칙.최대직원수 + '명까지입니다.' };
  if (st.주차 < t.고용가능주차) return { ok: false, 이유: t.고용가능주차 + '주차부터 고용할 수 있습니다.' };
  if (!지불(st, t.고용비)) return { ok: false, 이유: '코인이 모자랍니다. (' + t.고용비 + ' 필요)' };
  return { ok: true, 직원: 직원추가(st, 유형id) };
}

function 업그레이드가능(st, 직원id) {
  var c = getCatalog();
  var s = st.직원.filter(function (x) { return x.id === 직원id; })[0];
  if (!s) return null;
  return c.능력표[s.레벨] || null;      // 다음 레벨 (없으면 최고 레벨)
}

function 업그레이드(st, 직원id) {
  var s = st.직원.filter(function (x) { return x.id === 직원id; })[0];
  if (!s) return { ok: false, 이유: '없는 직원입니다.' };
  var next = 업그레이드가능(st, 직원id);
  if (!next) return { ok: false, 이유: '이미 최고 레벨입니다.' };
  if (!지불(st, next.비용)) return { ok: false, 이유: '코인이 모자랍니다. (' + next.비용 + ' 필요)' };
  s.레벨 += 1;
  return { ok: true, 레벨: s.레벨, 업무능력: next.업무능력 };
}

function 인테리어구매(st, id) {
  var c = getCatalog();
  var d = c.인테리어별[id];
  if (!d) return { ok: false, 이유: '없는 인테리어입니다.' };
  if (st.인테리어.indexOf(id) >= 0) return { ok: false, 이유: '이미 가지고 있습니다.' };
  if (!지불(st, d.가격)) return { ok: false, 이유: '코인이 모자랍니다. (' + d.가격 + ' 필요)' };
  st.인테리어.push(id);
  return { ok: true, 매력도: 매력도(st) };
}

function 시설구매(st, id) {
  var c = getCatalog();
  var f = c.시설별[id];
  if (!f) return { ok: false, 이유: '없는 시설입니다.' };
  if (st.시설.indexOf(id) >= 0) return { ok: false, 이유: '이미 가지고 있습니다.' };
  if (st.주차 < (f.구매가능주차 || 1)) return { ok: false, 이유: (f.구매가능주차) + '주차부터 살 수 있습니다.' };
  if (!지불(st, f.가격)) return { ok: false, 이유: '코인이 모자랍니다. (' + f.가격 + ' 필요)' };
  st.시설.push(id);
  return { ok: true, 여는업무: f.여는업무 || null };
}

/* ══════════════════════════════════════════════════════════════════════════
   8. 저장 · 불러오기
   ══════════════════════════════════════════════════════════════════════════
   Fraction 은 "3/4" 처럼 반드시 빗금이 들어간 문자열로 저장되므로(정수 3도 "3/1"),
   불러올 때 그 모양의 문자열만 되살리면 된다.
   ────────────────────────────────────────────────────────────────────────── */

function 저장(st) { return JSON.stringify(st); }

function 되살리기(v) {
  if (typeof v === 'string' && /^-?\d+\/\d+$/.test(v)) return Fraction.parse(v);
  if (Array.isArray(v)) return v.map(되살리기);
  if (v && typeof v === 'object') {
    var o = {};
    Object.keys(v).forEach(function (k) { o[k] = 되살리기(v[k]); });
    return o;
  }
  return v;
}
function 불러오기(text) {
  return 되살리기(typeof text === 'string' ? JSON.parse(text) : text);
}

/* ══════════════════════════════════════════════════════════════════════════
   9. 배치 도우미 — "이 직원들로 최대 몇 명까지 받을 수 있나"를 찾아 준다
   ══════════════════════════════════════════════════════════════════════════
   밸런스 점검(점검_카페.js --sim)과, 화면의 [추천 배치] 버튼에 쓴다.
   모든 경우의 수를 다 보는 대신 무작위로 시작해 한 칸씩 고쳐 가며 올라간다.
   ────────────────────────────────────────────────────────────────────────── */

function 추천배치(st, 시도, rng) {
  시도 = 시도 || 40;
  rng = rng || Math.random;
  var 열린 = 열린업무(st).map(function (t) { return t.id; });
  if (!열린.length || !st.직원.length) return { 배정: {}, 가능손님: 0 };

  function 값(a) { return 계획(st, a).가능손님분수; }

  var best = null, bestV = null;
  for (var i = 0; i < 시도; i++) {
    var a = {};
    st.직원.forEach(function (s, idx) {
      // 첫 시도는 "직원마다 업무 하나씩" 으로 시작하고, 이후에는 무작위로 시작한다
      if (i === 0) a[s.id] = [열린[idx % 열린.length]];
      else {
        var pick = 열린.filter(function () { return rng() < 0.5; });
        a[s.id] = pick.length ? pick : [열린[Math.floor(rng() * 열린.length)]];
      }
    });
    var v = 값(a), 개선 = true;
    while (개선) {                                  // 한 칸씩 켜고 꺼 보며 더 좋아지면 채택
      개선 = false;
      for (var si = 0; si < st.직원.length; si++) {
        for (var ti = 0; ti < 열린.length; ti++) {
          var sid = st.직원[si].id, tid = 열린[ti];
          var cur = a[sid], has = cur.indexOf(tid) >= 0;
          var next = has ? cur.filter(function (x) { return x !== tid; }) : cur.concat([tid]);
          if (!next.length) continue;
          var trial = {};
          Object.keys(a).forEach(function (k) { trial[k] = a[k]; });
          trial[sid] = next;
          var nv = 값(trial);
          if (nv.gt(v)) { a = trial; v = nv; 개선 = true; }
        }
      }
    }
    if (bestV === null || v.gt(bestV)) { bestV = v; best = a; }
  }
  return { 배정: best, 가능손님: floorF(bestV), 가능손님분수: bestV };
}

/* ══════════════════════════════════════════════════════════════════════════
   내보내기
   ══════════════════════════════════════════════════════════════════════════ */
return {
  Fraction: Fraction, F: F, fmt: fmt, floorF: floorF, ceilF: ceilF, igcd: igcd,
  setCatalog: setCatalog, getCatalog: getCatalog,
  newGame: newGame, 주간시작: 주간시작, 열린업무: 열린업무,
  처리량: 처리량, 계획: 계획, 영업: 영업,
  매력도: 매력도, 완성세트: 완성세트, SNS확률: SNS확률,
  손님단가: 손님단가, 주급합: 주급합, 누적순이익: 누적순이익, 능력: 능력,
  고용: 고용, 업그레이드: 업그레이드, 업그레이드가능: 업그레이드가능,
  인테리어구매: 인테리어구매, 시설구매: 시설구매,
  저장: 저장, 불러오기: 불러오기, 추천배치: 추천배치
};
});
