/*!
 * cafe-engine.js — 「카페 타이쿤」 계산 엔진  v2.0
 * 중학교 1학년 <정수와 유리수> 학습용 카페 경영 게임의 규칙 엔진.
 *
 * v2.0: 도전 과제(10절)와 오늘의 카페 챌린지(11절)가 들어왔다. 둘 다 기존 계산(계획·영업)을 그대로 쓴다.
 *       일반 시즌의 계산 결과는 v1.3 과 완전히 같다(점검_카페.js 의 회귀 스냅샷이 이를 확인한다).
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
      직원당최대업무: r.직원당최대업무 || 99,
      손님1명당매출: r.손님1명당매출,
      평판배수: {},
      만족기준: Fraction.parse(r.만족기준),
      계산: {
        업무별가능손님숨김: !!(r.계산 && r.계산.업무별가능손님숨김),
        예측입력: !!(r.계산 && r.계산.예측입력),
        예측보너스: (r.계산 && r.계산.예측보너스) || 0,
        추천배치비용: (r.계산 && r.계산.추천배치비용 !== undefined) ? r.계산.추천배치비용 : 0
      },
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
    능력표: raw.업무능력표.map(function (r) {
      return { 레벨: r.레벨, 업무능력: Fraction.parse(r.업무능력), 비용: r.비용 };
    }),
    인테리어: raw.인테리어.slice(), 인테리어별: {},
    // v2.0 — 도전 과제 보상 인테리어. 가격 0, 상점에서 못 산다. 인테리어별(찾기표)에는 같이 들어가서
    //        매력도·카페 그림·친구 카페 구경이 보통 인테리어와 똑같이 다룬다.
    보상인테리어: (raw.보상인테리어 || []).map(function (d) {
      return { id: d.id, 이름: d.이름, 가격: 0, 매력도: d.매력도 || 0, 세트: null,
               배치: d.배치 || '바닥', 이미지: d.이미지 || null, 보상: true };
    }),
    도전과제: (raw.도전과제 || []).map(function (a) {
      var o = {};
      Object.keys(a).forEach(function (k) { o[k] = a[k]; });
      if (o.비율 !== undefined) o.비율 = Fraction.parse(o.비율);
      return o;
    }),
    도전과제별: {},
    오늘의챌린지: raw.오늘의챌린지 || null,
    배경: (raw.배경 || []).slice(), 배경별: {}, 기본배경: {},
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
  c.보상인테리어.forEach(function (d) {
    if (c.인테리어별[d.id]) throw new Error('보상 인테리어 id 가 상점 인테리어와 겹칩니다: ' + d.id);
    c.인테리어별[d.id] = d;
  });
  c.도전과제.forEach(function (a) {
    if (c.도전과제별[a.id]) throw new Error('도전 과제 id 가 겹칩니다: ' + a.id);
    if (a.보상 && !c.인테리어별[a.보상]) throw new Error('도전 과제 "' + a.이름 + '" 의 보상 인테리어가 설정표에 없습니다: ' + a.보상);
    c.도전과제별[a.id] = a;
  });
  c.시설.forEach(function (f) { c.시설별[f.id] = f; });

  // 배경: 종류마다 가격 0 인 것 하나가 처음부터 가지고 있는 기본 배경이다.
  c.배경.forEach(function (b) {
    c.배경별[b.id] = b;
    if (b.가격 === 0 && !c.기본배경[b.종류]) c.기본배경[b.종류] = b.id;
  });
  c.배경.forEach(function (b) {
    if (!c.기본배경[b.종류]) {
      throw new Error('배경 종류 "' + b.종류 + '" 에 가격 0 인 기본 항목이 없습니다.');
    }
  });

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
  var v = row.업무능력.clone();          // 분수일 수 있다 (예: 29/2)
  var 배수 = 능력배수(st, 직원);          // 오늘의 챌린지에서만 값이 있다 (일반 시즌은 null)
  return 배수 ? v.mul(배수) : v;
}

/** 오늘의 챌린지가 이 직원에게 건 업무능력 배수. 일반 시즌에는 없다(null). */
function 능력배수(st, 직원) {
  var m = st && st.챌린지 && st.챌린지.능력배수 && st.챌린지.능력배수[직원.id];
  return m ? Fraction.parse(m) : null;
}

/** 손님 1명당 필요 업무량. 오늘의 챌린지가 그 업무에 배수를 걸었으면 곱한다(일반 시즌은 설정표 값 그대로). */
function 필요업무량(st, 업무) {
  var m = st && st.챌린지 && st.챌린지.업무배수 && st.챌린지.업무배수[업무.id];
  return m ? 업무.필요업무량.mul(Fraction.parse(m)) : 업무.필요업무량;
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
    배경보유: Object.keys(c.기본배경).map(function (k) { return c.기본배경[k]; }),
    배경: (function () {                         // 종류별로 지금 적용 중인 배경
      var m = {};
      Object.keys(c.기본배경).forEach(function (k) { m[k] = c.기본배경[k]; });
      return m;
    })(),
    시설: [],
    좋아요매력도: 0,           // 친구가 눌러 준 좋아요로 얻는 매력도 (온라인 연결 후 사용)
    누적: { 매출: ZERO, 급여: ZERO, 투자: ZERO, 보너스: ZERO },
    기록: [],
    다음주배수: null,
    예보: null,
    끝남: false,
    _다음직원번호: 0
  };
  (opts.시작직원 || c.규칙.시작직원).forEach(function (t) { 직원추가(st, t); });
  주간시작(st);
  // v2.0 — 도전 과제·오늘의 챌린지 기록은 시즌을 넘어 이어진다 (opts.이월 = 이월정보(이전 상태))
  if (opts.이월) 이월적용(st, opts.이월); else 도전과제준비(st);
  return st;
}

/** 이번 주에 열려 있는 업무 목록 */
function 열린업무(st) {
  var c = getCatalog();
  if (st.챌린지 && st.챌린지.열린업무) {          // 오늘의 챌린지: 주차·시설과 상관없이 정해진 업무만 연다
    return c.업무.filter(function (t) { return st.챌린지.열린업무.indexOf(t.id) >= 0; });
  }
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
  // 한 사람에게 몰아줄 수 있는 업무 수 상한 (넘치면 앞에서부터 자른다 — 화면에서 미리 막지만 안전장치)
  var 상한 = getCatalog().규칙.직원당최대업무;
  if (out.length > 상한) out = out.slice(0, 상한);
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
    var 필요 = 필요업무량(st, t);                    // 오늘의 챌린지 배수가 걸리면 곱한 값, 아니면 설정표 값
    var 가능 = 합.isZero() ? ZERO : 합.div(필요);
    return {
      id: t.id, 이름: t.이름, 색: t.색, 이미지: t.이미지,
      필요: 필요,
      기본필요: t.필요업무량,
      업무배수: 필요.eq(t.필요업무량) ? null : 필요.div(t.필요업무량),
      처리량: 합,
      가능손님: 가능,
      가능손님정수: floorF(가능),
      담당: 담당,
      식: {
        담당: 담당식,
        합계: 항.length > 1 ? (항.join(' + ') + ' = ' + fmt(합)) : null,
        손님: fmt(합) + ' ÷ ' + fmt(필요) + ' = ' + fmt(가능)
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
  // 배경은 "지금 적용 중인 것"만 매력도에 들어간다 (사 모으는 게 아니라 갈아타는 구조)
  Object.keys(st.배경 || {}).forEach(function (종류) {
    var b = c.배경별[st.배경[종류]];
    if (b) v += b.매력도;
  });
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

function 누적순이익(st) {
  return st.누적.매출.add(st.누적.보너스 || ZERO).sub(st.누적.급여).sub(st.누적.투자);
}

/**
 * 이번 주 영업을 실행한다. state 를 다음 주로 넘기고, 이번 주 기록을 돌려준다.
 * rng 는 0 이상 1 미만의 수를 돌려주는 함수(기본 Math.random). 검사할 때 고정할 수 있다.
 */
function 영업(st, 배정, rng, 예측) {
  if (st.끝남) throw new Error('시즌이 이미 끝났습니다.');
  var c = getCatalog();
  rng = rng || Math.random;

  var p = 계획(st, 배정);
  var 예상 = st.예보.손님수;
  var 받은 = Math.max(0, Math.min(예상, p.가능손님));

  /* 돈은 0과 자연수만 쓴다.
     손님 1명당 매출은 평판 배수 때문에 분수가 될 수 있으므로(예: 3 × 6/5 = 18/5),
     그 주 매출을 낸 다음 소수점 아래를 버려 정수로 만든다. 계산 과정은 분수 그대로 보여 준다. */
  var 단가 = 손님단가(st);
  var 매출원 = F(받은).mul(단가);              // 버리기 전 값 (화면에 계산식으로 보여 준다)
  var 매출 = F(floorF(매출원));

  /* 코인이 0 아래로 내려가지 않게 한다.
     가진 돈과 이번 주 매출을 합쳐도 급여가 모자라면 있는 만큼만 주고, 못 준 만큼은 체불로 남는다.
     (체불이 생기면 아래에서 평판이 한 칸 더 떨어진다.) */
  var 급여 = 주급합(st);
  var 낼수있는돈 = st.코인.add(매출);
  var 실지급 = 급여.lte(낼수있는돈) ? 급여 : 낼수있는돈;
  var 미지급 = 급여.sub(실지급);
  var 순익 = 매출.sub(실지급);

  st.코인 = st.코인.add(순익);                 // 위 상한 덕분에 절대 음수가 되지 않는다
  st.누적.매출 = st.누적.매출.add(매출);
  st.누적.급여 = st.누적.급여.add(실지급);

  /* 예측 보너스 — 영업 전에 "몇 명 받게 될까"를 스스로 계산해 맞히면 코인을 준다.
     매출이 아니라 따로 쌓아 두어야 어디서 온 돈인지 화면에 나눠 보여 줄 수 있다.
     누적 순이익 = 매출 + 보너스 − 급여 − 투자 이므로 코인과 어긋나지 않는다. */
  var 예측맞음 = (예측 !== undefined && 예측 !== null && Number(예측) === 받은);
  var 보너스 = F(예측맞음 ? (c.규칙.계산.예측보너스 || 0) : 0);
  if (보너스.isPos()) {
    st.코인 = st.코인.add(보너스);
    if (!st.누적.보너스) st.누적.보너스 = ZERO;
    st.누적.보너스 = st.누적.보너스.add(보너스);
  }

  // 평판: 예상 손님을 다 받으면 ↑, 만족기준(3/4)보다 적게 받으면 ↓
  var 이전평판 = st.평판, 평가;
  if (예상 > 0 && 받은 >= 예상)                                     { 평가 = '만족'; st.평판 = Math.min(5, st.평판 + 1); }
  else if (예상 > 0 && F(받은).div(F(예상)).lt(c.규칙.만족기준))     { 평가 = '불만'; st.평판 = Math.max(1, st.평판 - 1); }
  else                                                              { 평가 = '보통'; }
  if (미지급.isPos()) { 평가 = '급여 체불'; st.평판 = Math.max(1, st.평판 - 1); }

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
    예측: (예측 === undefined || 예측 === null) ? null : Number(예측),
    예측맞음: 예측맞음, 보너스: 보너스,
    단가: 단가, 매출원: 매출원, 매출: 매출,
    급여: 급여, 실지급: 실지급, 미지급: 미지급, 순익: 순익,
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
  if (d.보상) return { ok: false, 이유: '도전 과제를 달성하면 얻는 인테리어라 살 수 없습니다.' };
  if (st.인테리어.indexOf(id) >= 0) return { ok: false, 이유: '이미 가지고 있습니다.' };
  if (!지불(st, d.가격)) return { ok: false, 이유: '코인이 모자랍니다. (' + d.가격 + ' 필요)' };
  st.인테리어.push(id);
  return { ok: true, 매력도: 매력도(st) };
}

/** 배경(벽지·바닥)을 산다. 사면 바로 적용된다. */
function 배경구매(st, id) {
  var c = getCatalog();
  var b = c.배경별[id];
  if (!b) return { ok: false, 이유: '없는 배경입니다.' };
  if ((st.배경보유 || []).indexOf(id) >= 0) return { ok: false, 이유: '이미 가지고 있습니다.' };
  if (!지불(st, b.가격)) return { ok: false, 이유: '코인이 모자랍니다. (' + b.가격 + ' 필요)' };
  st.배경보유.push(id);
  st.배경[b.종류] = id;
  return { ok: true, 종류: b.종류, 매력도: 매력도(st) };
}

/** 이미 산 배경 중에서 골라 바꾼다. 돈은 들지 않는다. */
function 배경적용(st, id) {
  var c = getCatalog();
  var b = c.배경별[id];
  if (!b) return { ok: false, 이유: '없는 배경입니다.' };
  if ((st.배경보유 || []).indexOf(id) < 0) return { ok: false, 이유: '아직 사지 않았습니다.' };
  st.배경[b.종류] = id;
  return { ok: true, 종류: b.종류, 매력도: 매력도(st) };
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
  var 상한 = getCatalog().규칙.직원당최대업무;
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
        if (pick.length > 상한) pick = pick.slice(0, 상한);
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
          if (!next.length || next.length > 상한) continue;
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
   10. 도전 과제 — 시즌을 넘어 계속 쌓이는 수집 목표  (v2.0)
   ══════════════════════════════════════════════════════════════════════════
   상태(state)에 다음이 붙는다. 예전 저장 데이터에 없으면 도전과제준비() 가 만들어 준다.
     st.도전과제 = { 달성: { 과제id: { 날짜, 주차 } }, 통계: { 예측성공, SNS발동, 연속수용, 최대연속수용 } }
     st.오늘의챌린지 = { 기록: { 'YYYY-MM-DD': { 별, 시도, 완료 } } }
     st.좋아요수 (친구에게 받은 좋아요 수), st.시즌번호 (새 시즌을 시작할 때마다 1씩)
   기록에서 바로 셀 수 있는 값(이번 시즌 체불 여부·완주 여부·누적 순이익)은 따로 저장하지 않는다.
   판정은 여기 한 곳에서만 한다 — 일반 시즌 영업과 오늘의 챌린지가 같은 함수를 부른다.
   ────────────────────────────────────────────────────────────────────────── */

/** 대한민국 기준 오늘 날짜 'YYYY-MM-DD'. now(ms)를 넘기면 그 시각 기준 (검사용). */
function 오늘키(now) {
  var t = (now === undefined ? Date.now() : now) + 9 * 60 * 60 * 1000;   // UTC+9 (서머타임 없음)
  return new Date(t).toISOString().slice(0, 10);
}

function 빈통계() { return { 예측성공: 0, SNS발동: 0, 연속수용: 0, 최대연속수용: 0 }; }

/** 통계에 쓰는 "연속 수용률" 기준 — 판정이 연속수용률인 과제의 비율 (없으면 9/10) */
function 연속기준(c) {
  var a = c.도전과제.filter(function (x) { return x.판정 === '연속수용률'; })[0];
  return a && a.비율 ? a.비율 : F(9, 10);
}

/** 과제 하나를 달성 처리하고 보상 인테리어를 준다. 이미 달성했으면 null. */
function 과제달성(st, id, 옵션) {
  var c = getCatalog();
  var a = c.도전과제별[id];
  if (!a || st.도전과제.달성[id]) return null;
  st.도전과제.달성[id] = { 날짜: (옵션 && 옵션.날짜) || 오늘키(), 주차: st.주차 };
  if (a.보상 && c.인테리어별[a.보상] && st.인테리어.indexOf(a.보상) < 0) st.인테리어.push(a.보상);
  return a;
}

/** 달성한 과제의 보상 인테리어가 빠져 있으면 채워 넣는다 (새 시즌·다른 기기에서 불러왔을 때). */
function 보상동기화(st) {
  var c = getCatalog();
  Object.keys(st.도전과제.달성).forEach(function (id) {
    var a = c.도전과제별[id];
    if (a && a.보상 && c.인테리어별[a.보상] && st.인테리어.indexOf(a.보상) < 0) st.인테리어.push(a.보상);
  });
}

/**
 * 영업 기록 하나를 과제 판정에 반영한다. 옵션.시즌 이 true 면 일반 시즌의 한 주(연속 수용률·SNS 도 센다),
 * false 면 오늘의 챌린지(시즌을 전제로 하는 통계는 세지 않는다). 새로 달성한 과제 목록을 돌려준다.
 */
function 기록판정(st, r, 옵션) {
  옵션 = 옵션 || {};
  var c = getCatalog(), 통계 = st.도전과제.통계, 새것 = [];
  var 예상 = r.예상손님 || 0, 받은 = r.받은손님 || 0;
  var 미지급 = r.미지급 ? Fraction.parse(r.미지급) : ZERO;
  var 급여 = r.급여 ? Fraction.parse(r.급여) : ZERO;
  var 코인 = (r.코인 !== undefined && r.코인 !== null) ? Fraction.parse(r.코인) : null;

  if (r.예측맞음) 통계.예측성공 += 1;
  if (옵션.시즌 && r.SNS발동) 통계.SNS발동 += 1;
  if (옵션.시즌 && 예상 > 0) {
    if (F(받은).div(F(예상)).gte(연속기준(c))) 통계.연속수용 += 1; else 통계.연속수용 = 0;
    통계.최대연속수용 = Math.max(통계.최대연속수용, 통계.연속수용);
  }

  var 목표달성 = 예상 > 0 && 받은 >= 예상;
  var 가능손님 = (r.업무 && r.업무.length)
    ? Math.min.apply(null, r.업무.map(function (x) { return x.가능손님정수 || 0; })) : 0;
  var 배정표 = r.배정 || {};
  var 배치직원 = Object.keys(배정표).filter(function (k) { return (배정표[k] || []).length > 0; });
  var 최다업무 = 배치직원.reduce(function (m, k) { return Math.max(m, 배정표[k].length); }, 0);

  c.도전과제.forEach(function (a) {
    if (st.도전과제.달성[a.id]) return;
    var ok = false;
    switch (a.판정) {
      case '예측성공':   ok = 통계.예측성공 >= a.목표; break;
      case 'SNS누적':    ok = !!옵션.시즌 && 통계.SNS발동 >= a.목표; break;
      case '연속수용률': ok = !!옵션.시즌 && 통계.연속수용 >= a.목표; break;
      case '전원수용':   ok = 목표달성 && 예상 >= (a.최소손님 || 1); break;
      case '멀티태스커': ok = 목표달성 && 최다업무 >= (a.업무수 || 3); break;
      case '완벽균형':   ok = 예상 > 0 && 가능손님 === 예상; break;
      case '빈털터리':   ok = !!코인 && 코인.isZero() && 미지급.isZero() && 급여.isPos(); break;
      case '독불장군':   ok = 목표달성 && 배치직원.length === 1 &&
                              (!옵션.시즌 || (r.주차 || 1) >= (a.최소주차 || 1)); break;
    }
    if (ok) { var got = 과제달성(st, a.id, 옵션); if (got) 새것.push(got); }
  });
  return 새것;
}

/** 지금 상태만 보고 판정하는 과제들 (매력도·좋아요·시즌 누적 순이익·완주·무체불 완주). */
function 상태판정(st, 옵션) {
  옵션 = 옵션 || {};
  var c = getCatalog(), 통계 = st.도전과제.통계, 새것 = [];
  var 기록 = st.기록 || [];
  var 완주 = !!st.끝남 && 기록.length >= c.규칙.시즌주차;
  var 체불없음 = 기록.every(function (r) { return !r.미지급 || Fraction.parse(r.미지급).isZero(); });
  c.도전과제.forEach(function (a) {
    if (st.도전과제.달성[a.id]) return;
    var ok = false;
    switch (a.판정) {
      case '매력도':     ok = 매력도(st) >= a.목표; break;
      case '시즌순이익': ok = 누적순이익(st).gte(F(a.목표)); break;
      case '좋아요':     ok = (st.좋아요수 || 0) >= a.목표; break;
      case '시즌완주':   ok = 완주; break;
      case '시즌무체불': ok = 완주 && 체불없음; break;
      case '예측성공':   ok = 통계.예측성공 >= a.목표; break;
      case 'SNS누적':    ok = 통계.SNS발동 >= a.목표; break;
      case '연속수용률': ok = 통계.최대연속수용 >= a.목표; break;
    }
    if (ok) { var got = 과제달성(st, a.id, 옵션); if (got) 새것.push(got); }
  });
  return 새것;
}

/**
 * 상태에 도전 과제 칸이 없으면 만든다(예전 저장 데이터). 이때 지금까지의 기록을 다시 훑어
 * 이미 해낸 것은 바로 달성 처리한다. 새로 달성한 과제 목록을 돌려준다. 여러 번 불러도 안전하다.
 */
function 도전과제준비(st, 옵션) {
  옵션 = 옵션 || {};
  var 새것 = [];
  if (st.좋아요수 === undefined || st.좋아요수 === null) st.좋아요수 = 0;
  if (!st.시즌번호) st.시즌번호 = 1;
  if (!st.오늘의챌린지 || typeof st.오늘의챌린지 !== 'object') st.오늘의챌린지 = { 기록: {} };
  if (!st.오늘의챌린지.기록) st.오늘의챌린지.기록 = {};
  if (!st.도전과제 || typeof st.도전과제 !== 'object') {
    st.도전과제 = { 달성: {}, 통계: 빈통계() };
    (st.기록 || []).forEach(function (r) { 새것 = 새것.concat(기록판정(st, r, { 시즌: true, 날짜: 옵션.날짜 })); });
    새것 = 새것.concat(상태판정(st, 옵션));
  } else {
    if (!st.도전과제.달성) st.도전과제.달성 = {};
    var 통계 = 빈통계();
    Object.keys(st.도전과제.통계 || {}).forEach(function (k) { 통계[k] = st.도전과제.통계[k]; });
    st.도전과제.통계 = 통계;
  }
  보상동기화(st);
  return 새것;
}

/**
 * 과제 판정의 입구. 화면은 이것만 부른다.
 *   상황 = { 종류: '영업',   기록 }   일반 시즌에서 한 주 영업을 마쳤을 때
 *          { 종류: '챌린지', 기록 }   오늘의 챌린지 영업을 마쳤을 때
 *          { 종류: '상태' }           상점에서 샀을 때·좋아요를 받았을 때·불러왔을 때
 * 새로 달성한 과제(설정표 항목) 목록을 돌려준다. 여러 개면 화면에서 한 번에 보여 준다.
 */
function 도전과제갱신(st, 상황) {
  상황 = 상황 || { 종류: '상태' };
  var 새것 = [];
  if (!st.도전과제) {
    새것 = 도전과제준비(st, 상황);          // 예전 데이터: 기록 전체를 훑었으니 이번 기록도 이미 반영됐다
    if (상황.종류 === '영업') 상황 = { 종류: '상태' };
  } else 도전과제준비(st, 상황);
  if ((상황.종류 === '영업' || 상황.종류 === '챌린지') && 상황.기록) {
    새것 = 새것.concat(기록판정(st, 상황.기록, { 시즌: 상황.종류 === '영업', 날짜: 상황.날짜 }));
  }
  새것 = 새것.concat(상태판정(st, 상황));
  return 새것;
}

/** 화면에 그릴 진행도. 숨김 과제는 달성 전엔 이름·설명을 감춘 채로 돌려준다. */
function 도전과제진행(st) {
  도전과제준비(st);
  var c = getCatalog(), 통계 = st.도전과제.통계, 기록 = st.기록 || [];
  var 체불 = 기록.some(function (r) { return r.미지급 && Fraction.parse(r.미지급).isPos(); });
  return c.도전과제.map(function (a) {
    var d = st.도전과제.달성[a.id] || null, 진행 = null;
    switch (a.판정) {
      case '예측성공':   진행 = { 현재: 통계.예측성공, 목표: a.목표, 단위: '회' }; break;
      case '연속수용률': 진행 = { 현재: 통계.연속수용, 목표: a.목표, 단위: '주' }; break;
      case '매력도':     진행 = { 현재: 매력도(st), 목표: a.목표, 단위: '' }; break;
      case 'SNS누적':    진행 = { 현재: 통계.SNS발동, 목표: a.목표, 단위: '회' }; break;
      case '시즌순이익': 진행 = { 현재: Math.max(0, floorF(누적순이익(st))), 목표: a.목표, 단위: '코인' }; break;
      case '좋아요':     진행 = { 현재: st.좋아요수 || 0, 목표: a.목표, 단위: '개' }; break;
      case '시즌완주':   진행 = { 현재: Math.min(기록.length, c.규칙.시즌주차), 목표: c.규칙.시즌주차, 단위: '주' }; break;
      case '시즌무체불': 진행 = { 현재: 체불 ? 0 : Math.min(기록.length, c.규칙.시즌주차), 목표: c.규칙.시즌주차, 단위: '주',
                                메모: 체불 ? '이번 시즌은 체불이 있었어요. 다음 시즌에 다시 도전!' : null }; break;
    }
    if (진행 && d) 진행.현재 = 진행.목표;
    if (진행) 진행.현재 = Math.min(진행.현재, 진행.목표);
    var 보상 = c.인테리어별[a.보상] || null;
    var 공개 = !a.숨김 || !!d;
    return {
      id: a.id, 숨김: !!a.숨김, 공개: 공개, 달성: !!d, 날짜: d ? d.날짜 : null,
      아이콘: 공개 ? a.아이콘 : '❓', 이름: 공개 ? a.이름 : '???',
      설명: 공개 ? a.설명 : '숨겨진 도전 과제입니다.', 조건: 공개 ? a.조건 : null,
      달성문구: a.달성문구, 진행: 공개 ? 진행 : null,
      보상id: 공개 ? a.보상 : null, 보상이름: 공개 && 보상 ? 보상.이름 : '???', 보상: 공개 ? 보상 : null
    };
  });
}

/** 새 시즌으로 넘어갈 때 가져갈 것 (도전 과제·오늘의 챌린지 기록·좋아요·시즌 번호) */
function 이월정보(st) {
  if (!st) return null;
  도전과제준비(st);
  return JSON.parse(JSON.stringify({
    시즌번호: st.시즌번호 || 1, 좋아요수: st.좋아요수 || 0,
    도전과제: st.도전과제, 오늘의챌린지: st.오늘의챌린지
  }));
}

/** 이월정보를 새 상태에 붙인다. 연속 수용 기록은 시즌이 바뀌면 0부터 다시 센다. */
function 이월적용(st, 이월) {
  if (!이월) return st;
  st.시즌번호 = (이월.시즌번호 || 1) + 1;
  st.좋아요수 = 이월.좋아요수 || 0;
  st.도전과제 = JSON.parse(JSON.stringify(이월.도전과제 || { 달성: {}, 통계: 빈통계() }));
  st.오늘의챌린지 = JSON.parse(JSON.stringify(이월.오늘의챌린지 || { 기록: {} }));
  도전과제준비(st);
  st.도전과제.통계.연속수용 = 0;
  return st;
}

/**
 * 두 상태(예: 서버 것과 이 기기 것)의 과제 기록을 합친다. 달성은 합집합, 통계는 큰 쪽,
 * 챌린지 기록은 날짜별로 별이 큰 쪽. 대상(st)을 고쳐서 돌려준다.
 */
function 도전과제합치기(st, 다른) {
  if (!다른) return st;
  도전과제준비(st);
  var 원 = 다른.도전과제 || {}, 달성 = 원.달성 || {}, 통계 = 원.통계 || {};
  Object.keys(달성).forEach(function (id) {
    if (!st.도전과제.달성[id]) st.도전과제.달성[id] = JSON.parse(JSON.stringify(달성[id]));
  });
  Object.keys(통계).forEach(function (k) {
    if (typeof 통계[k] === 'number' && (st.도전과제.통계[k] || 0) < 통계[k]) st.도전과제.통계[k] = 통계[k];
  });
  var 기록 = (다른.오늘의챌린지 && 다른.오늘의챌린지.기록) || {};
  Object.keys(기록).forEach(function (날짜) {
    var a = st.오늘의챌린지.기록[날짜], b = 기록[날짜];
    if (!a) st.오늘의챌린지.기록[날짜] = JSON.parse(JSON.stringify(b));
    else { a.별 = Math.max(a.별 || 0, b.별 || 0); a.시도 = Math.max(a.시도 || 0, b.시도 || 0); a.완료 = !!(a.완료 || b.완료); }
  });
  if ((다른.좋아요수 || 0) > (st.좋아요수 || 0)) st.좋아요수 = 다른.좋아요수;
  보상동기화(st);
  return st;
}

/* ══════════════════════════════════════════════════════════════════════════
   11. 오늘의 카페 챌린지 — 날짜를 씨앗으로 매일 하나씩  (v2.0)
   ══════════════════════════════════════════════════════════════════════════
   · 날짜 문자열('2026-09-22')을 씨앗으로 쓰는 고정 난수로 만들기 때문에 같은 날짜면 언제 누가 열어도 같다.
   · 유형 템플릿을 먼저 고르고 → 설정표의 풀에서 직원·업무·배수·제약을 뽑고 → 가능한 배치를 전부 탐색해
     방문 손님 수와 별 목표를 "풀 수 있는 값"으로 정한다 → 마지막에 챌린지검증() 으로 다시 확인한다.
   · 못 만들면 씨앗을 '날짜#시도' 로 바꿔 다시 뽑고, 최대시도까지 실패하면 설정표의 대체챌린지를 준다.
   · 챌린지 상태는 보통 게임 상태와 같은 모양이고 st.챌린지 에 {열린업무, 업무배수, 능력배수} 만 더 붙는다.
     열린업무()·능력()·계획() 이 이 값을 보고, 없으면(일반 시즌) 예전과 완전히 똑같이 계산한다.
   ────────────────────────────────────────────────────────────────────────── */

/** 문자열 → 32비트 해시 (FNV-1a). 씨앗을 만드는 데 쓴다. */
function 문자열해시(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** 씨앗이 같으면 같은 순서로 0 이상 1 미만의 수를 내는 난수 (mulberry32). 정수 연산만 쓰므로 어디서나 같다. */
function 고정난수생성(seed) {
  var a = typeof seed === 'number' ? (seed >>> 0) : 문자열해시(String(seed));
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function 뽑기(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function 정수뽑기(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }
function 가중치뽑기(rng, 목록) {
  var 합 = 목록.reduce(function (s, t) { return s + (t.가중치 || 1); }, 0);
  var r = rng() * 합;
  for (var i = 0; i < 목록.length; i++) { r -= (목록[i].가중치 || 1); if (r < 0) return 목록[i]; }
  return 목록[목록.length - 1];
}
function 비트수(m) { var n = 0; while (m) { n += m & 1; m >>= 1; } return n; }
function ilcm(a, b) { return a / igcd(a, b) * b; }
function 내림5(n) { return Math.floor(n / 5) * 5; }

/** 한글 조사만 돌려준다: 꼬리('서빙', '이', '가') → '이' */
function 꼬리(말, 있을때, 없을때) {
  var s = String(말), code = s.charCodeAt(s.length - 1);
  var 받침 = (code >= 0xAC00 && code <= 0xD7A3) ? ((code - 0xAC00) % 28 !== 0) : false;
  return 받침 ? 있을때 : 없을때;
}

function 챌린지설정() {
  var cfg = getCatalog().오늘의챌린지;
  if (!cfg) throw new Error('설정표(cafe-catalog.js)에 오늘의챌린지 절이 없습니다.');
  return cfg;
}

/** 챌린지(JSON) → 배정·영업을 할 수 있는 게임 상태. 직원 id 는 s1, s2, … 순서대로 붙는다. */
function 챌린지상태만들기(ch) {
  var c = getCatalog(), cfg = c.오늘의챌린지 || {};
  var st = {
    주차: cfg.주차 || c.규칙.시즌주차,
    코인: F(ch.시작코인 || 0),
    평판: ch.평판 || 1,
    직원: [], 인테리어: [],
    배경보유: Object.keys(c.기본배경).map(function (k) { return c.기본배경[k]; }),
    배경: (function () { var m = {}; Object.keys(c.기본배경).forEach(function (k) { m[k] = c.기본배경[k]; }); return m; })(),
    시설: [], 좋아요매력도: 0,
    누적: { 매출: ZERO, 급여: ZERO, 투자: ZERO, 보너스: ZERO },
    기록: [], 다음주배수: null, 예보: null, 끝남: false, _다음직원번호: 0,
    챌린지: { 날짜: ch.날짜 || null, 열린업무: (ch.열린업무 || []).slice(), 업무배수: {}, 능력배수: {} }
  };
  Object.keys(ch.업무배수 || {}).forEach(function (k) {
    if (!c.업무별[k]) throw new Error('없는 업무에 배수를 걸었습니다: ' + k);
    st.챌린지.업무배수[k] = Fraction.parse(ch.업무배수[k]);
  });
  (ch.직원 || []).forEach(function (d) {
    var s = 직원추가(st, d.유형);
    s.레벨 = d.레벨 || 1;
    if (!c.능력표[s.레벨 - 1]) throw new Error('없는 레벨입니다: ' + s.레벨);
    if (d.능력배수) st.챌린지.능력배수[s.id] = Fraction.parse(d.능력배수);
  });
  st.예보 = { 주차: st.주차, 기본손님: ch.방문손님, 배수: null, 손님수: ch.방문손님, 숨김: false, 미션: null };
  return st;
}

/** 제약 하나를 사람이 읽는 문구로 */
function 제약문구(k, st) {
  var c = getCatalog();
  var 이름 = function (id) { var s = (st ? st.직원 : []).filter(function (x) { return x.id === id; })[0]; return s ? s.이름 : id; };
  var 업무 = function (id) { return (c.업무별[id] || { 이름: id }).이름; };
  switch (k.종류) {
    case '최대배치직원':   return '업무를 맡는 직원은 최대 ' + k.값 + '명';
    case '전원배치':       return '모든 직원을 최소 1개 업무에 배치';
    case '직원당최대업무': return '한 직원은 최대 ' + k.값 + '개 업무만 담당';
    case '정확히N업무직원': return '한 직원은 정확히 ' + k.값 + '개 업무를 담당 (최소 한 명)';
    case '직원사용금지':   return 이름(k.직원) + '은(는) 오늘 휴가 — 업무 배치 금지';
    case '업무최소인원':   return '「' + 업무(k.업무) + '」에는 최소 ' + k.값 + '명 배치';
    case '총배치개수':     return '업무 배치는 모두 합쳐 ' + k.값 + '개까지';
    case '서로다른업무수': return '직원마다 맡는 업무 수가 서로 다르게';
  }
  return k.종류;
}

/** 배정표(직원id → 업무 목록)가 제약을 어기면 그 이유들을 돌려준다. 비어 있으면 통과. */
function 제약위반(제약들, st, 표) {
  var out = [];
  var 업무수 = function (s) { return (표[s.id] || []).length; };
  var 일하는 = st.직원.filter(function (s) { return 업무수(s) > 0; });
  (제약들 || []).forEach(function (k) {
    switch (k.종류) {
      case '최대배치직원':
        if (일하는.length > k.값) out.push('업무를 맡는 직원은 최대 ' + k.값 + '명이어야 해요. (지금 ' + 일하는.length + '명)');
        break;
      case '전원배치': {
        var 놀 = st.직원.filter(function (s) { return 업무수(s) === 0; });
        if (놀.length) out.push('모든 직원이 업무를 하나 이상 맡아야 해요. (' + 놀.map(function (s) { return s.이름; }).join(', ') + ')');
        break;
      }
      case '직원당최대업무': {
        var 초과 = st.직원.filter(function (s) { return 업무수(s) > k.값; });
        if (초과.length) out.push('한 직원이 맡는 업무는 최대 ' + k.값 + '가지예요. (' + 초과.map(function (s) { return s.이름; }).join(', ') + ')');
        break;
      }
      case '정확히N업무직원':
        if (!st.직원.some(function (s) { return 업무수(s) === k.값; }))
          out.push('정확히 ' + k.값 + '가지 업무를 맡는 직원이 한 명은 있어야 해요.');
        break;
      case '직원사용금지':
        if ((표[k.직원] || []).length) out.push(제약문구(k, st).replace(' — 업무 배치 금지', '') + '라 업무를 맡을 수 없어요.');
        break;
      case '업무최소인원': {
        var n = st.직원.filter(function (s) { return (표[s.id] || []).indexOf(k.업무) >= 0; }).length;
        if (n < k.값) out.push(제약문구(k, st) + '해야 해요. (지금 ' + n + '명)');
        break;
      }
      case '총배치개수': {
        var 총 = st.직원.reduce(function (a, s) { return a + 업무수(s); }, 0);
        if (총 > k.값) out.push('업무 배치는 모두 합쳐 ' + k.값 + '개까지만 할 수 있어요. (지금 ' + 총 + '개)');
        break;
      }
      case '서로다른업무수': {
        var ns = st.직원.map(업무수), 겹침 = false;
        for (var i = 0; i < ns.length; i++) for (var j = i + 1; j < ns.length; j++) if (ns[i] === ns[j]) 겹침 = true;
        if (겹침) out.push('직원마다 맡는 업무 수가 서로 달라야 해요.');
        break;
      }
    }
  });
  return out;
}

/** 화면의 배정을 제약에 비춰 본다. 위반 문구 목록(비어 있으면 통과). */
function 챌린지제약검사(ch, st, 배정) {
  var 표 = {};
  st.직원.forEach(function (s) { 표[s.id] = 유효배정(st, 배정, s); });
  return 제약위반(ch.제약 || [], st, 표);
}

/** 서로 어긋나 절대 풀 수 없는 제약 조합인지 본다 (생성기가 피하지만 검사에서도 한 번 더 본다). */
function 제약충돌검사(제약들, 직원수, 업무수) {
  var 문제 = [], 종류별 = {};
  (제약들 || []).forEach(function (k) { (종류별[k.종류] = 종류별[k.종류] || []).push(k); });
  Object.keys(종류별).forEach(function (t) { if (종류별[t].length > 1 && t !== '업무최소인원' && t !== '직원사용금지') 문제.push(t + ' 제약이 두 번 걸렸다'); });
  var 금지수 = (종류별.직원사용금지 || []).length;
  var 쓸수있는 = 직원수 - 금지수;
  if (종류별.전원배치 && 금지수) 문제.push('전원 배치와 휴가 직원이 함께 걸렸다');
  if (종류별.전원배치 && 종류별.최대배치직원 && 종류별.최대배치직원[0].값 < 직원수) 문제.push('전원 배치와 최대 배치 인원이 어긋난다');
  if (종류별.직원당최대업무 && 종류별.정확히N업무직원 && 종류별.정확히N업무직원[0].값 > 종류별.직원당최대업무[0].값) 문제.push('직원당 최대 업무와 정확히 N업무가 어긋난다');
  if (종류별.직원당최대업무 && 쓸수있는 * 종류별.직원당최대업무[0].값 < 업무수) 문제.push('직원당 최대 업무로는 모든 업무를 덮을 수 없다');
  if (종류별.최대배치직원 && 종류별.최대배치직원[0].값 * getCatalog().규칙.직원당최대업무 < 업무수) 문제.push('최대 배치 인원으로는 모든 업무를 덮을 수 없다');
  if (종류별.총배치개수 && 종류별.총배치개수[0].값 < 업무수) 문제.push('총 배치 개수가 업무 수보다 적다');
  if (종류별.총배치개수 && 종류별.정확히N업무직원 && 종류별.총배치개수[0].값 < 업무수 && 종류별.총배치개수[0].값 < 종류별.정확히N업무직원[0].값) 문제.push('총 배치 개수가 정확히 N업무와 어긋난다');
  if (종류별.서로다른업무수 && 종류별.직원당최대업무 && 직원수 > 종류별.직원당최대업무[0].값 + 1) 문제.push('서로 다른 업무 수를 만들 수 없다');
  if (쓸수있는 <= 0) 문제.push('쓸 수 있는 직원이 없다');
  return 문제;
}

/**
 * 가능한 배치를 전부 훑는다 (직원마다 업무 0개 또는 1~직원당최대업무개).
 * 화면 계산(계획)과 같은 값을 정수 연산으로 빠르게 낸다: 처리량을 공통분모 D로 정수화하고
 * 업무별 가능 손님 = ⌊합 × 필요분모 ÷ (D × 필요분자)⌋. 같은 직원(유형·레벨·배수가 같고 제약이 지목하지 않은)끼리는
 * 순서를 바꾼 배치를 한 번만 본다. 돌려주는 결과의 각 항목: { idx(직원별 부분집합 번호), caps(업무별 가능 손님), 최소 }.
 */
function 챌린지탐색(st, 제약들) {
  var c = getCatalog();
  var 직원 = st.직원, S = 직원.length;
  var 열린 = 열린업무(st), T = 열린.length;
  var 상한 = c.규칙.직원당최대업무;
  var subs = [0], m;
  for (m = 1; m < (1 << T); m++) if (비트수(m) <= 상한) subs.push(m);
  var subSize = subs.map(비트수);

  var 필요 = 열린.map(function (t) { return 필요업무량(st, t); });
  var 기여 = [], D = 1, s, n, t;
  for (s = 0; s < S; s++) {
    기여[s] = [null];
    for (n = 1; n <= 상한; n++) {
      기여[s][n] = [];
      for (t = 0; t < T; t++) {
        var v = 능력(st, 직원[s]).div(F(n));
        var 보정 = c.직원유형별[직원[s].유형].보정[열린[t].id];
        if (보정) v = v.mul(보정);
        기여[s][n][t] = v;
        D = ilcm(D, v.denominator);
      }
    }
  }
  var 정수 = [];
  for (s = 0; s < S; s++) { 정수[s] = [null]; for (n = 1; n <= 상한; n++) { 정수[s][n] = []; for (t = 0; t < T; t++) { var f = 기여[s][n][t]; 정수[s][n][t] = f.numerator * (D / f.denominator); } } }
  var 곱 = 필요.map(function (f) { return f.denominator; });
  var 나눔 = 필요.map(function (f) { return D * f.numerator; });

  var 지목 = {};
  (제약들 || []).forEach(function (k) { if (k.직원) 지목[k.직원] = true; });
  var 서명 = 직원.map(function (x) { return x.유형 + '|' + x.레벨 + '|' + fmt(능력(st, x)) + '|' + (지목[x.id] ? x.id : ''); });
  var 이전 = 직원.map(function (x, i) { for (var j = i - 1; j >= 0; j--) if (서명[j] === 서명[i]) return j; return -1; });

  var 결과 = [], idx = new Array(S);
  function 평가() {
    var caps = new Array(T), 최소 = Infinity;
    for (var t = 0; t < T; t++) {
      var sum = 0;
      for (var s = 0; s < S; s++) { var k = idx[s]; if (subs[k] & (1 << t)) sum += 정수[s][subSize[k]][t]; }
      var num = sum * 곱[t];
      var cap = sum > 0 ? (num - num % 나눔[t]) / 나눔[t] : 0;    // 정수 나눗셈 (소수 없이)
      caps[t] = cap; if (cap < 최소) 최소 = cap;
    }
    결과.push({ idx: idx.slice(), caps: caps, 최소: 최소 });
  }
  (function 재귀(i) {
    if (i === S) { 평가(); return; }
    for (var k = 0; k < subs.length; k++) {
      if (이전[i] >= 0 && k < idx[이전[i]]) continue;
      idx[i] = k; 재귀(i + 1);
    }
  })(0);

  var 열린id = 열린.map(function (x) { return x.id; });
  function 표로(r) {
    var 표 = {};
    for (var s = 0; s < S; s++) { var ts = []; for (var t = 0; t < T; t++) if (subs[r.idx[s]] & (1 << t)) ts.push(열린id[t]); 표[직원[s].id] = ts; }
    return 표;
  }
  return { 결과: 결과, 표로: 표로, 열린: 열린id, 직원수: S, 업무수: T, D: D };
}

/** 돈 계산표: 받은 손님 n명일 때의 매출·순익·급여 뒤 코인 (영업()과 같은 규칙) */
function 챌린지돈표(st, 최대) {
  var 단가 = 손님단가(st), 급여 = 주급합(st), 표 = [];
  for (var n = 0; n <= 최대; n++) {
    var 매출 = F(floorF(F(n).mul(단가)));
    var 낼수있는 = st.코인.add(매출);
    var 실지급 = 급여.lte(낼수있는) ? 급여 : 낼수있는;
    var 순익 = 매출.sub(실지급);
    표.push({ 매출: floorF(매출), 순익: floorF(순익), 코인후: floorF(st.코인.add(순익)), 미지급: floorF(급여.sub(실지급)) });
  }
  return 표;
}

/** 조건 하나를 평가한다. ctx = { V, 받은, caps, 최소, 열린, 돈, 표(배정표), st, 예측결과 } */
function 조건통과(조건, ctx) {
  var i;
  switch (조건.종류) {
    case '수용':     return ctx.받은 >= 조건.값;
    case '전원':     return ctx.V > 0 && ctx.받은 >= ctx.V;
    case '정확히':   return ctx.최소 === 조건.값;
    case '순이익':   return ctx.돈.순익 >= 조건.값;
    case '매출':     return ctx.돈.매출 >= 조건.값;
    case '코인':     return ctx.돈.코인후 >= 조건.값;
    case '병목아님': i = ctx.열린.indexOf(조건.업무); return i >= 0 && ctx.caps[i] > ctx.최소;
    case '두업무동일': {
      var a = ctx.열린.indexOf(조건.업무A), b = ctx.열린.indexOf(조건.업무B);
      return a >= 0 && b >= 0 && ctx.caps[a] === ctx.caps[b];
    }
    case '예측':     return ctx.예측결과 ? !!(ctx.예측결과[조건.항목] && ctx.예측결과[조건.항목].맞음) : true;
    case '배치':     return 제약위반([조건.제약], ctx.st, ctx.표()).length === 0;
  }
  return false;
}

/** 별 단계(누적 조건)를 평가한다. 단계 k 는 1..k 의 조건을 모두 만족해야 한다. */
function 단계평가(목표, ctx) {
  var 별 = 0, 계속 = true, 단계 = [];
  (목표 || []).forEach(function (tier) {
    var ok = 계속 && (tier.조건 || []).every(function (cond) { return 조건통과(cond, ctx); });
    if (!ok) 계속 = false;
    if (ok) 별 = tier.별;
    단계.push({ 별: tier.별, 문구: tier.문구, 달성: ok });
  });
  return { 별: 별, 단계: 단계 };
}

/** 조건 → 문구 */
function 조건문구(조건, ch, st) {
  var c = getCatalog();
  var 업무 = function (id) { return (c.업무별[id] || { 이름: id }).이름; };
  switch (조건.종류) {
    case '수용':     return 조건.값 + '명 이상 받기';
    case '전원':     return ch.방문손님 + '명 전원 받기';
    case '정확히':   return '최대 수용 인원을 정확히 ' + 조건.값 + '명으로 맞추기 (남는 처리량 없이)';
    case '순이익':   return '순이익 ' + 조건.값 + '코인 이상';
    case '매출':     return '매출 ' + 조건.값 + '코인 이상';
    case '코인':     return '급여를 주고 나서 코인 ' + 조건.값 + ' 이상 남기기';
    case '병목아님': return '「' + 업무(조건.업무) + '」' + 꼬리(업무(조건.업무), '이', '가') + ' 병목이 되지 않게 하기';
    case '두업무동일': return '「' + 업무(조건.업무A) + '」' + 꼬리(업무(조건.업무A), '과', '와') + ' 「' + 업무(조건.업무B) + '」의 최대 수용 인원을 같게 만들기';
    case '예측':     return { 손님: '받을 손님 수 예측 성공', 병목: '병목 업무 예측 성공', 순이익: '순이익 예측 성공' }[조건.항목] || '예측 성공';
    case '배치':     return 제약문구(조건.제약, st);
  }
  return 조건.종류;
}

/** 별 단계 문구를 채운다 (조건을 ' + ' 로 잇는다) */
function 목표문구채우기(ch, st) {
  ch.목표.forEach(function (tier) {
    tier.문구 = tier.조건.map(function (cond) { return 조건문구(cond, ch, st); }).join(' + ');
  });
}

/** 챌린지 화면에 보여 줄 특별 조건 문구들 */
function 챌린지설명(ch) {
  var c = getCatalog(), st = 챌린지상태만들기(ch), out = [];
  Object.keys(ch.업무배수 || {}).forEach(function (id) {
    var t = c.업무별[id], 배수 = Fraction.parse(ch.업무배수[id]);
    var 설명 = 배수.gt(F(1)) ? '대란!' : '수월함';
    out.push('「' + t.이름 + '」 업무량이 평소의 ' + fmt(배수) + '배 (' + 설명 + ' 손님 1명당 ' +
             fmt(t.필요업무량) + ' × ' + fmt(배수) + ' = ' + fmt(t.필요업무량.mul(배수)) + ')');
  });
  st.직원.forEach(function (s) {
    var m = st.챌린지.능력배수[s.id];
    if (!m) return;
    var 기본 = c.능력표[s.레벨 - 1].업무능력;
    out.push(s.이름 + '의 업무능력이 ' + fmt(m) + '배 (' + fmt(기본) + ' × ' + fmt(m) + ' = ' + fmt(기본.mul(m)) + ')' +
             (m.gt(F(1)) ? ' — 오늘 컨디션 최고!' : ' — 오늘은 컨디션이 안 좋아요'));
  });
  (ch.제약 || []).forEach(function (k) { out.push('제약: ' + 제약문구(k, st)); });
  if ((ch.평판 || 1) > 1) {
    out.push('오늘의 평판 ' + '★'.repeat(ch.평판) + ' → 손님 1명당 매출 ' + c.규칙.손님1명당매출 + ' × ' +
             fmt(c.규칙.평판배수[String(ch.평판)]) + ' = ' + fmt(손님단가(st)));
  }
  out.push('시작 코인 ' + (ch.시작코인 || 0) + ' · 급여 합계 ' + fmt(주급합(st)) + ' · 손님 1명당 매출 ' + fmt(손님단가(st)));
  return out;
}

/** 챌린지가 실제로 풀리는지 검증한다. 별 3개 조건(예측 제외)을 만족하는 배치가 최소 하나 있어야 한다. */
function 챌린지검증(ch, 탐색) {
  var c = getCatalog(), cfg = 챌린지설정();
  var 문제 = [];
  try {
    (ch.직원 || []).forEach(function (d) { if (!c.직원유형별[d.유형]) 문제.push('없는 직원 유형: ' + d.유형); });
    (ch.열린업무 || []).forEach(function (id) { if (!c.업무별[id]) 문제.push('없는 업무: ' + id); });
    if (!(ch.방문손님 > 0)) 문제.push('방문 손님이 0 이하');
    if (!(ch.직원 || []).length) 문제.push('직원이 없다');
    if (!(ch.열린업무 || []).length) 문제.push('열린 업무가 없다');
    if (!(ch.목표 || []).length) 문제.push('목표가 없다');
    if (문제.length) return { 가능: false, 문제: 문제 };
    문제 = 제약충돌검사(ch.제약, ch.직원.length, ch.열린업무.length);
    if (문제.length) return { 가능: false, 문제: 문제 };

    var st = 챌린지상태만들기(ch);
    탐색 = 탐색 || 챌린지탐색(st, ch.제약);
    var V = ch.방문손님, 돈표 = 챌린지돈표(st, V);
    var 준수 = 0, 별수 = [0, 0, 0, 0], 최대 = 0, 예시 = null, 예시별 = 0;
    탐색.결과.forEach(function (r) {
      var 표 = null;
      var ctx = {
        V: V, 받은: Math.min(V, r.최소), caps: r.caps, 최소: r.최소, 열린: 탐색.열린,
        돈: 돈표[Math.min(V, r.최소)], st: st, 예측결과: null,
        표: function () { if (!표) 표 = 탐색.표로(r); return 표; }
      };
      if (제약위반(ch.제약, st, ctx.표()).length) return;
      준수++;
      if (r.최소 > 최대) 최대 = r.최소;
      var e = 단계평가(ch.목표, ctx);
      for (var k = 1; k <= e.별; k++) 별수[k]++;
      if (e.별 > 예시별 || (e.별 === 예시별 && 예시 === null)) { 예시별 = e.별; 예시 = ctx.표(); }
    });
    var 최고별 = ch.목표.length ? ch.목표[ch.목표.length - 1].별 : 0;
    var 가능 = 준수 > 0 && 별수[최고별] > 0;
    if (!가능) 문제.push(준수 === 0 ? '제약을 지키는 배치가 없다' : '별 ' + 최고별 + '개를 만드는 배치가 없다');
    for (var k = 1; k < 최고별; k++) if (별수[k] < 별수[k + 1]) 문제.push('별 ' + k + '개보다 별 ' + (k + 1) + '개가 더 쉽다');
    var 난이도 = 난이도계산(ch, 준수, 별수[최고별]);
    return {
      가능: 가능 && !문제.length, 문제: 문제, 난이도: 난이도,
      통계: { 전체: 탐색.결과.length, 준수: 준수, 별1: 별수[1], 별2: 별수[2], 별3: 별수[3], 최대수용: 최대 },
      예시배정: 예시
    };
  } catch (e) {
    return { 가능: false, 문제: ['검증 중 오류: ' + e.message] };
  }
}

/** 난이도 ★1~3 */
function 난이도계산(ch, 준수, 별3수) {
  var cfg = 챌린지설정(), d = cfg.난이도 || {};
  var S = (ch.직원 || []).length, T = (ch.열린업무 || []).length;
  var 배수 = Object.keys(ch.업무배수 || {}).length + (ch.직원 || []).filter(function (x) { return !!x.능력배수; }).length;
  var 조건들 = [];
  (ch.목표 || []).forEach(function (tier) { 조건들 = 조건들.concat(tier.조건 || []); });
  var 예측 = 조건들.filter(function (x) { return x.종류 === '예측'; }).length;
  var 정확 = 조건들.some(function (x) { return x.종류 === '정확히' || x.종류 === '두업무동일' || x.종류 === '병목아님' || x.종류 === '배치'; }) ? 1 : 0;
  var 구조 = Math.max(0, S - 2) + Math.max(0, T - 2) + 배수 + (ch.제약 || []).length + 예측 + 정확;
  var 희귀 = 0;
  (d.희귀점수 || []).forEach(function (b) {              // 비율이 작은 것부터 적어 두면 첫 번째로 맞는 것을 쓴다
    if (희귀) return;
    var 비율 = Fraction.parse(b.비율이하);
    if (준수 > 0 && 별3수 * 비율.denominator <= 준수 * 비율.numerator) 희귀 = b.점수;
  });
  var 점수 = F(구조).mul(Fraction.parse(d.구조가중치 || '1/2')).add(F(희귀));
  return 점수.gte(Fraction.parse(d.별3최소점수 || 5)) ? 3 : 점수.gte(Fraction.parse(d.별2최소점수 || 3)) ? 2 : 1;
}

/** 수용 목표 인원: 방문 × 비율 을 올림 */
function 수용인원(V, 비율) { return Math.max(1, ceilF(F(V).mul(Fraction.parse(비율)))); }

/**
 * 직원에게 능력 배수를 건다. 업무능력 × 배수 가 설정표 꼴(분모 ≤ 한도, 분자는 3의 배수)이 되는 레벨이어야 하며,
 * 지금 레벨이 안 맞으면 맞는 레벨 중 가장 낮은 것으로 바꿔 건다. 맞는 레벨이 없으면 걸지 않는다(false).
 */
function 능력배수걸기(직원, 배수) {
  var c = getCatalog(), cfg = 챌린지설정();
  var 한도 = cfg.능력배수최대분모 || 2, 배 = cfg.능력배수분자배수 || 1, m = Fraction.parse(배수);
  var 맞나 = function (레벨) {
    var v = c.능력표[레벨 - 1].업무능력.mul(m);
    return v.denominator <= 한도 && v.numerator % 배 === 0;
  };
  var 레벨 = 맞나(직원.레벨) ? 직원.레벨 : null;
  for (var L = 1; 레벨 === null && L <= c.능력표.length; L++) if (맞나(L)) 레벨 = L;
  if (레벨 === null) return false;
  직원.레벨 = 레벨; 직원.능력배수 = 배수;
  return true;
}

/** 업무 배수 후보 중 필요업무량 × 배수 의 분모가 한도 이하인 (업무, 배수) 쌍 하나를 고른다. 없으면 null. */
function 업무배수고르기(rng, 열린, 풀) {
  var c = getCatalog(), cfg = 챌린지설정();
  var 한도 = cfg.업무배수최대분모 || 8, 쌍 = [];
  열린.forEach(function (id) {
    풀.forEach(function (m) {
      if (c.업무별[id].필요업무량.mul(Fraction.parse(m)).denominator <= 한도) 쌍.push([id, m]);
    });
  });
  return 쌍.length ? 뽑기(rng, 쌍) : null;
}

/** 후보 챌린지 하나를 만든다. 못 만들면 null (생성기가 다음 씨앗으로 넘어간다). */
function 챌린지후보(날짜, 시도, rng, tpl) {
  var c = getCatalog(), cfg = 챌린지설정();
  tpl = tpl || 가중치뽑기(rng, cfg.템플릿);
  var S = 정수뽑기(rng, tpl.직원수[0], tpl.직원수[1]);
  var T = 정수뽑기(rng, tpl.업무수[0], tpl.업무수[1]);
  if (tpl.종류 === 'together') T = S;                       // 모두 하나씩 → 직원 수 = 업무 수
  if (S >= 4 && T > 4) T = 4;                               // 너무 복잡한 조합은 만들지 않는다
  var 조합들 = cfg.업무조합풀.filter(function (a) { return a.length === T; });
  if (!조합들.length) return null;
  var 열린 = 뽑기(rng, 조합들).slice();

  var 직원 = [];
  for (var i = 0; i < S; i++) {
    var 유형 = 뽑기(rng, cfg.직원유형풀);
    if (유형 === '셰프' && 열린.indexOf('dessert') < 0) 유형 = '신입';
    if (유형 === '홀담당' && 열린.indexOf('serve') < 0 && 열린.indexOf('clean') < 0) 유형 = '신입';
    if (!c.직원유형별[유형]) 유형 = c.직원유형[0].id;
    직원.push({ 유형: 유형, 레벨: 뽑기(rng, cfg.레벨풀) });
  }

  var 업무배수 = {}, 제약 = [], 대란업무 = null, 능력변동 = 0;
  var 쌍;
  switch (tpl.종류) {
    case 'rush':
      쌍 = 업무배수고르기(rng, 열린, cfg.업무배수풀); if (!쌍) return null;
      대란업무 = 쌍[0]; 업무배수[대란업무] = 쌍[1];
      if (S >= 3 && rng() < 0.25) 제약.push({ 종류: '직원사용금지', 직원: 's' + 정수뽑기(rng, 1, S) });
      break;
    case 'crisis':
      쌍 = 업무배수고르기(rng, 열린, cfg.업무배수풀); if (!쌍) return null;
      대란업무 = 쌍[0]; 업무배수[대란업무] = 쌍[1];
      if (S >= 3 && rng() < 0.3) 제약.push({ 종류: '업무최소인원', 업무: 대란업무, 값: 2 });
      break;
    case 'ace': {
      var a = 정수뽑기(rng, 0, S - 1), b = (a + 1 + 정수뽑기(rng, 0, S - 2)) % S;
      if (!능력배수걸기(직원[a], cfg.에이스배수) || !능력배수걸기(직원[b], cfg.부진배수)) return null;
      능력변동 = 2;
      break;
    }
    case 'small':     제약.push({ 종류: '최대배치직원', 값: 2 }); break;
    case 'together':  제약.push({ 종류: '전원배치' }, { 종류: '직원당최대업무', 값: 1 }); break;
    case 'multitask': 제약.push({ 종류: '정확히N업무직원', 값: 3 }); break;
    case 'short':     if (rng() < 0.3) 제약.push({ 종류: '총배치개수', 값: T + 1 }); break;
    case 'balance':
      if (rng() < 0.4) { 쌍 = 업무배수고르기(rng, 열린, rng() < 0.5 ? cfg.약한업무배수풀 : cfg.강한업무배수풀); if (쌍) 업무배수[쌍[0]] = 쌍[1]; }
      break;
    case 'calculator':
      if (rng() < 0.3) { 쌍 = 업무배수고르기(rng, 열린, rng() < 0.5 ? cfg.약한업무배수풀 : cfg.강한업무배수풀); if (쌍) 업무배수[쌍[0]] = 쌍[1]; }
      break;
  }
  if (!능력변동 && rng() * 100 < (cfg.능력변동확률 || 0)) {
    능력배수걸기(직원[정수뽑기(rng, 0, S - 1)], 뽑기(rng, cfg.능력배수풀));
  }

  var ch = {
    날짜: 날짜, 시도: 시도, 템플릿: tpl.id, 아이콘: tpl.아이콘, 이름: tpl.이름, 소개: tpl.소개,
    직원: 직원, 열린업무: 열린, 업무배수: 업무배수,
    시작코인: 뽑기(rng, cfg.시작코인풀),
    평판: tpl.종류 === 'profit' ? 뽑기(rng, cfg.평판풀) : (cfg.기본평판 || 1),
    제약: 제약, 방문손님: 0, 목표: []
  };
  if (제약충돌검사(제약, S, T).length) return null;

  // 가능한 배치를 전부 훑어 "풀 수 있는" 손님 수와 목표를 정한다
  var st = 챌린지상태만들기(ch);
  var 탐색 = 챌린지탐색(st, 제약);
  var 준수 = 탐색.결과.filter(function (r) { return 제약위반(제약, st, 탐색.표로(r)).length === 0; });
  if (!준수.length) return null;
  var M = 준수.reduce(function (m, r) { return Math.max(m, r.최소); }, 0);
  if (M < (cfg.최소가능손님 || 1)) return null;

  var 풀 = cfg.손님풀.slice().sort(function (a, b) { return a - b; });
  var 이하 = 풀.filter(function (v) { return v <= M; });
  var 끝쪽 = function (arr, n) { return arr.slice(Math.max(0, arr.length - n)); };
  var 비1 = cfg.수용률.별1, 비2 = cfg.수용률.별2, V, 목표;

  function 수용단계(V) {       // 75% → 90% 를 서로 다른 값으로
    var n1 = 수용인원(V, 비1), n2 = 수용인원(V, 비2);
    if (n2 <= n1) n2 = n1 + 1;
    if (n2 >= V) { n2 = V - 1; }
    if (n1 >= n2) n1 = n2 - 1;
    if (n1 < 1) return null;
    return [n1, n2];
  }

  switch (tpl.종류) {
    case 'rush': {
      var 큰것 = 이하.filter(function (v) { return v >= 18; });
      if (!큰것.length) return null;
      V = 큰것[큰것.length - 1];
      var s1 = 수용단계(V); if (!s1) return null;
      목표 = [[{ 종류: '수용', 값: s1[0] }], [{ 종류: '수용', 값: s1[1] }], [{ 종류: '전원' }, { 종류: '예측', 항목: '손님' }]];
      break;
    }
    case 'short': case 'small': case 'multitask': case 'crisis': case 'ace': case 'together': {
      if (!이하.length) return null;
      V = 뽑기(rng, 끝쪽(이하, 2));
      var s2 = 수용단계(V); if (!s2) return null;
      if (tpl.종류 === 'short')     목표 = [[{ 종류: '수용', 값: s2[0] }], [{ 종류: '수용', 값: s2[1] }], [{ 종류: '전원' }, { 종류: '예측', 항목: '병목' }]];
      if (tpl.종류 === 'small')     목표 = [[{ 종류: '수용', 값: s2[0] }], [{ 종류: '수용', 값: s2[1] }], [{ 종류: '전원' }, { 종류: '예측', 항목: '손님' }]];
      if (tpl.종류 === 'multitask') 목표 = [[{ 종류: '수용', 값: s2[0] }], [{ 종류: '수용', 값: s2[1] }],
                                         S >= 3 ? [{ 종류: '전원' }, { 종류: '배치', 제약: { 종류: '서로다른업무수' } }] : [{ 종류: '전원' }, { 종류: '예측', 항목: '손님' }]];
      if (tpl.종류 === 'crisis')    목표 = [[{ 종류: '수용', 값: s2[0] }], [{ 종류: '수용', 값: s2[1] }], [{ 종류: '전원' }, { 종류: '병목아님', 업무: 대란업무 }]];
      if (tpl.종류 === 'ace')       목표 = [[{ 종류: '수용', 값: s2[0] }], [{ 종류: '전원' }], [{ 종류: '예측', 항목: '손님' }]];
      if (tpl.종류 === 'together')  목표 = [[{ 종류: '수용', 값: s2[0] }], [{ 종류: '전원' }], [{ 종류: '예측', 항목: '병목' }]];
      break;
    }
    case 'balance': {
      var 정확값 = {};
      준수.forEach(function (r) { if (r.최소 >= (cfg.최소가능손님 || 1)) 정확값[r.최소] = true; });
      var E = Object.keys(정확값).map(Number).sort(function (a, b) { return a - b; });
      if (!E.length) return null;
      var E풀 = E.filter(function (v) { return 풀.indexOf(v) >= 0; });
      if (!E풀.length) E풀 = E;
      var 아래 = E풀.filter(function (v) { return v < M; });   // 최대치보다 작은 값이면 "전원"(⭐)과 "정확히"(⭐⭐)의 난이도가 갈린다
      V = 뽑기(rng, 끝쪽(아래.length ? 아래 : E풀, 3));
      var 쌍 = null;
      if (T >= 2 && rng() < 0.4) {
        var 후보쌍 = [];
        for (var x = 0; x < T; x++) for (var y = x + 1; y < T; y++) {
          if (준수.some(function (r) { return r.최소 === V && r.caps[x] === r.caps[y]; })) 후보쌍.push([탐색.열린[x], 탐색.열린[y]]);
        }
        if (후보쌍.length) 쌍 = 뽑기(rng, 후보쌍);
      }
      목표 = 쌍
        ? [[{ 종류: '전원' }], [{ 종류: '두업무동일', 업무A: 쌍[0], 업무B: 쌍[1] }], [{ 종류: '정확히', 값: V }]]
        : [[{ 종류: '전원' }], [{ 종류: '정확히', 값: V }], [{ 종류: '예측', 항목: '손님' }]];
      break;
    }
    case 'profit': {
      var 근처 = 풀.filter(function (v) { return v * 5 >= M * 4 && v * 2 <= M * 3; });
      if (!근처.length) 근처 = 이하;
      if (!근처.length) return null;
      V = 뽑기(rng, 근처);
      var 돈표 = 챌린지돈표(st, V), pmax = -Infinity, mmax = 0;
      준수.forEach(function (r) { var 돈 = 돈표[Math.min(V, r.최소)]; if (돈.순익 > pmax) pmax = 돈.순익; if (돈.매출 > mmax) mmax = 돈.매출; });
      if (pmax < (cfg.수익최소순이익 || 1)) return null;
      var r1 = Fraction.parse(cfg.수익목표비율.별1), r2 = Fraction.parse(cfg.수익목표비율.별2);
      var m1 = 내림5(floorF(F(mmax).mul(r1))), p2 = 내림5(floorF(F(pmax).mul(r2)));
      if (p2 >= pmax) p2 = pmax - 5;
      if (m1 < 5 || p2 < 5) return null;
      var 끝 = rng() < 0.5 ? { 종류: '순이익', 값: pmax } : { 종류: '코인', 값: ch.시작코인 + pmax };
      목표 = [[{ 종류: '매출', 값: m1 }], [{ 종류: '순이익', 값: p2 }], [끝]];
      break;
    }
    case 'calculator': {
      var 여유 = Fraction.parse(cfg.계산기손님비율 || '9/10');
      var 편한것 = 이하.filter(function (v) { return F(v).lte(F(M).mul(여유)); });
      if (!편한것.length) return null;
      V = 뽑기(rng, 끝쪽(편한것, 2));
      목표 = [[{ 종류: '전원' }], [{ 종류: '예측', 항목: '손님' }], [{ 종류: '예측', 항목: rng() < 0.5 ? '병목' : '순이익' }]];
      break;
    }
    default: return null;
  }
  ch.방문손님 = V;
  ch.목표 = 목표.map(function (조건, i) { return { 별: i + 1, 조건: 조건, 문구: '' }; });
  목표문구채우기(ch, st);
  ch._탐색 = 탐색;                 // 검증에서 다시 훑지 않도록 잠시 들고 간다 (돌려주기 전에 뗀다)
  return ch;
}

/** 설정표의 대체 챌린지 (어떤 날짜든 풀 수 있게 미리 정해 둔 것) */
function 대체챌린지(날짜) {
  var cfg = 챌린지설정(), 원 = cfg.대체챌린지;
  var ch = JSON.parse(JSON.stringify(원));
  ch.날짜 = 날짜; ch.시도 = -1; ch.대체 = true;
  ch.템플릿 = 원.템플릿 || 'fallback';
  ch.목표 = (원.목표 || []).map(function (t, i) { return { 별: t.별 || i + 1, 조건: t.조건 || [], 문구: t.문구 || '' }; });
  if (ch.목표.some(function (t) { return !t.문구; })) 목표문구채우기(ch, 챌린지상태만들기(ch));
  var v = 챌린지검증(ch);
  ch.난이도 = v.난이도 || 1;
  return ch;
}

/**
 * 오늘의 챌린지를 만든다. 같은 날짜면 항상 같은 결과. (generateDailyChallenge)
 *   옵션.최대시도  기본은 설정표의 최대시도
 */
function 오늘의챌린지생성(날짜, 옵션) {
  var cfg = 챌린지설정();
  옵션 = 옵션 || {};
  날짜 = 날짜 || 오늘키();
  var 최대 = (옵션.최대시도 !== undefined && 옵션.최대시도 !== null) ? 옵션.최대시도 : (cfg.최대시도 || 30);
  var tpl = 가중치뽑기(고정난수생성(날짜 + '#유형'), cfg.템플릿);   // 유형은 날짜만으로 정한다
  for (var 시도 = 0; 시도 < 최대; 시도++) {
    var rng = 고정난수생성(날짜 + '#' + 시도);
    var ch = 챌린지후보(날짜, 시도, rng, tpl);
    if (!ch) continue;
    var 탐색 = ch._탐색; delete ch._탐색;
    var v = 챌린지검증(ch, 탐색);
    if (v.가능) {
      ch.난이도 = v.난이도;
      ch.통계 = v.통계;
      return ch;
    }
  }
  return 대체챌린지(날짜);
}

/**
 * 챌린지 영업. st 는 챌린지상태만들기() 로 만든 상태, 배정은 화면의 것, 예측 = { 손님, 병목(업무id), 순이익 } (없는 건 null).
 * 제약을 어기면 { ok:false, 위반:[...] }. 아니면 영업 결과와 별을 돌려준다.
 */
function 챌린지영업(ch, st, 배정, 예측) {
  예측 = 예측 || {};
  var 위반 = 챌린지제약검사(ch, st, 배정);
  if (위반.length) return { ok: false, 위반: 위반 };
  var 예측손님 = (예측.손님 === undefined || 예측.손님 === null || 예측.손님 === '') ? null : Number(예측.손님);
  var 기록 = 영업(st, 배정, function () { return 0.99; }, 예측손님);
  var 열린 = ch.열린업무.slice();
  var caps = 열린.map(function (id) { var r = 기록.업무.filter(function (x) { return x.id === id; })[0]; return r ? r.가능손님정수 : 0; });
  var 최소 = caps.length ? Math.min.apply(null, caps) : 0;
  var 병목집합 = 열린.filter(function (id, i) { return caps[i] === 최소; });
  var 순익 = floorF(기록.순익), 매출 = floorF(기록.매출), 코인후 = floorF(기록.코인);
  var 예측결과 = {
    손님: 예측손님 === null ? null : { 입력: 예측손님, 실제: 기록.받은손님, 맞음: !!기록.예측맞음 },
    병목: 예측.병목 ? { 입력: 예측.병목, 실제: 병목집합.slice(), 맞음: 병목집합.indexOf(예측.병목) >= 0 } : null,
    순이익: (예측.순이익 === undefined || 예측.순이익 === null || 예측.순이익 === '') ? null
            : { 입력: Number(예측.순이익), 실제: 순익, 맞음: Number(예측.순이익) === 순익 }
  };
  var 표 = 기록.배정;
  var ctx = {
    V: ch.방문손님, 받은: 기록.받은손님, caps: caps, 최소: 최소, 열린: 열린,
    돈: { 매출: 매출, 순익: 순익, 코인후: 코인후 }, st: st, 예측결과: 예측결과, 표: function () { return 표; }
  };
  var e = 단계평가(ch.목표, ctx);
  var c = getCatalog();
  return {
    ok: true, 기록: 기록, 별: e.별, 단계: e.단계,
    방문: ch.방문손님, 받은: 기록.받은손님, 놓친: 기록.놓친손님,
    병목: 병목집합, 병목이름: 병목집합.map(function (id) { return c.업무별[id].이름; }),
    가능손님: 최소, 매출: 매출, 급여: floorF(기록.급여), 실지급: floorF(기록.실지급), 미지급: floorF(기록.미지급),
    순익: 순익, 코인후: 코인후, 예측결과: 예측결과
  };
}

/** 오늘의 최고 기록을 저장한다 (같은 날짜에 몇 번이든 도전 가능). 오래된 날짜는 기록보관일수만 남긴다. */
function 챌린지기록저장(st, ch, 결과) {
  도전과제준비(st);
  var cfg = 챌린지설정(), 기록 = st.오늘의챌린지.기록;
  var 전 = 기록[ch.날짜] || { 별: 0, 시도: 0, 완료: false };
  var 새 = { 별: Math.max(전.별 || 0, 결과.별 || 0), 시도: (전.시도 || 0) + 1, 완료: !!(전.완료 || (결과.별 || 0) >= 1) };
  기록[ch.날짜] = 새;
  var 날짜들 = Object.keys(기록).sort();
  var 보관 = cfg.기록보관일수 || 60;
  while (날짜들.length > 보관) delete 기록[날짜들.shift()];
  return 새;
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
  배경구매: 배경구매, 배경적용: 배경적용,
  저장: 저장, 불러오기: 불러오기, 추천배치: 추천배치,
  능력배수: 능력배수, 필요업무량: 필요업무량,
  // v2.0 도전 과제
  오늘키: 오늘키, 도전과제준비: 도전과제준비, 도전과제갱신: 도전과제갱신, 도전과제진행: 도전과제진행,
  이월정보: 이월정보, 도전과제합치기: 도전과제합치기,
  // v2.0 오늘의 챌린지
  고정난수생성: 고정난수생성, 오늘의챌린지생성: 오늘의챌린지생성, 챌린지검증: 챌린지검증,
  챌린지상태만들기: 챌린지상태만들기, 챌린지설명: 챌린지설명, 제약문구: 제약문구, 제약충돌검사: 제약충돌검사,
  챌린지제약검사: 챌린지제약검사, 챌린지탐색: 챌린지탐색, 챌린지영업: 챌린지영업, 챌린지기록저장: 챌린지기록저장,
  대체챌린지: 대체챌린지,
  // 영문 별칭 (검사·개발용)
  generateDailyChallenge: 오늘의챌린지생성, validateDailyChallenge: 챌린지검증
};
});
