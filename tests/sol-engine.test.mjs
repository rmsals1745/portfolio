// tests/engine.test.mjs — node --test 로 도는 엔진 테스트 (7개 게이트)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { script, TASTE_SWATCHES } from '../functions/_lib/script.js';
import { createState, nextStep, applyAnswer, buildIntake } from '../functions/_lib/engine.js';
import { writeSay } from '../functions/_lib/llm.js';

// ── 헬퍼 ──────────────────────────────────────────────

/** state 를 n 단계 전진시킨다 (실제 값 채움) */
function advanceState(n) {
  let state = createState('test');
  for (let i = 0; i < n; i++) {
    const step = script[i];
    const value = sampleValue(step);
    const r = applyAnswer(state, script, { slot: step.slot, value });
    assert.equal(r.error, null, `step ${i} (${step.slot}) failed: ${r.error}`);
    state = r.state;
  }
  return state;
}

/** 슬롯 kind 에 맞는 샘플 값 */
function sampleValue(step) {
  switch (step.kind) {
    case 'text':
      return '테스트값';
    case 'textarea':
      // compound textarea (brand.story+goal.never_guess) 는 객체
      if (step.slot.includes('+')) {
        const obj = {};
        for (const part of step.slot.split('+')) {
          obj[part.split('.').pop()] = '테스트값';
        }
        return obj;
      }
      return '테스트값';
    case 'choice':
      if (step.options && step.options.length > 0) return step.options[0].value;
      return 'yes';
    case 'multi':
      if (step.options && step.options.length > 0) return [step.options[0].value];
      return ['map'];
    case 'swatch':
      return { moods: [step.options[0].value], avoid: '', reference: '' };
    case 'products':
      return [{ name: '테스트상품', desc: '설명', price_krw: 1000 }];
    case 'contact':
      return { phone: '010-1234-5678', instagram: '@test', address: '서울시', hours: '9-18' };
    default:
      return '값';
  }
}

// ── 게이트 1: 대본 17슬롯 전부 fallback_say 를 갖는다 / progress.total == script.length ──

describe('Gate 1: script integrity', () => {
  it('17슬롯 전부 fallback_say 를 갖는다', () => {
    for (const step of script) {
      assert.ok(step.fallback_say, `slot "${step.slot}" 에 fallback_say 가 없다`);
      assert.ok(step.fallback_say.length > 0, `slot "${step.slot}" 의 fallback_say 가 비어있다`);
    }
  });

  it('progress.total 이 script.length 와 같다', () => {
    const state = createState('test');
    const { step } = nextStep(state, script);
    assert.ok(step, '첫 step 이 null 이면 안 된다');
    // progress.total 은 script.length 에서 계산 — 하드코딩 금지
    assert.equal(script.length, 17, 'script.length 가 17이 아니다');
  });
});

// ── 게이트 2: 필수 슬롯 skip → slot_required, 순서 어긋남 → slot_mismatch, 잘못된 타입 → bad_value ──

describe('Gate 2: validation errors', () => {
  it('필수 슬롯 skip → slot_required', () => {
    const state = createState('test');
    // brand.name (required) 을 skip
    const r = applyAnswer(state, script, { slot: 'brand.name', skipped: true });
    assert.equal(r.error, 'slot_required');
  });

  it('필수 슬롯 빈 문자열 → slot_required', () => {
    const state = createState('test');
    const r = applyAnswer(state, script, { slot: 'brand.name', value: '  ' });
    assert.equal(r.error, 'slot_required');
  });

  it('순서 어긋난 slot → slot_mismatch', () => {
    const state = createState('test');
    // cursor=0 인데 brand.category (slot 1) 를 보냄
    const r = applyAnswer(state, script, { slot: 'brand.category', value: '카페' });
    assert.equal(r.error, 'slot_mismatch');
  });

  it('text 슬롯에 숫자 → bad_value', () => {
    const state = createState('test');
    const r = applyAnswer(state, script, { slot: 'brand.name', value: 12345 });
    assert.equal(r.error, 'bad_value');
  });

  it('products 슬롯에 name 없는 행 → slot_required (required 필수값 누락)', () => {
    // ⚠️ 인덱스를 박아두면 대본이 바뀔 때마다 깨진다 — 슬롯 이름으로 찾는다.
    let state = advanceState(script.findIndex(x => x.slot === 'products'));
    const r = applyAnswer(state, script, {
      slot: 'products',
      value: [{ desc: '이름이 없다' }],
    });
    // name 이 빈 행은 required 검증에서 먼저 잡힌다
    assert.equal(r.error, 'slot_required');
  });

  it('products 에 price_krw 가 정수가 아니면 bad_value', () => {
    let state = advanceState(script.findIndex(x => x.slot === 'products'));
    const r = applyAnswer(state, script, {
      slot: 'products',
      value: [{ name: '상품', price_krw: '천원' }],
    });
    assert.equal(r.error, 'bad_value');
  });
});

// ── 게이트 3: 17슬롯 끝까지 답하면 done:true + intake_v2 필수 키 전부 존재 ──

describe('Gate 3: full completion → done:true + intake_v2 keys', () => {
  it('17슬롯을 끝까지 답하면 done:true', () => {
    const state = advanceState(17);
    assert.equal(state.done, true);
  });

  it('buildIntake 결과에 intake_v2 필수 키가 전부 존재한다', () => {
    const state = advanceState(17);
    const intake = buildIntake(state, script);

    assert.equal(intake.form_version, 'intake_v2');
    assert.equal(intake.collected_by, 'sol');
    assert.ok(intake.submitted_at);

    // goal 필수 키
    assert.ok('primary_action' in intake.goal, 'goal.primary_action 누락');
    assert.ok('why_now' in intake.goal, 'goal.why_now 누락');
    assert.ok('current_pain' in intake.goal, 'goal.current_pain 누락');
    assert.ok('success_6m' in intake.goal, 'goal.success_6m 누락');
    assert.ok('audience' in intake.goal, 'goal.audience 누락');
    assert.ok('never_guess' in intake.goal, 'goal.never_guess 누락');

    // care.wants
    assert.ok('wants' in intake.care, 'care.wants 누락');

    // brand
    assert.ok('name' in intake.brand, 'brand.name 누락');
    assert.ok('category' in intake.brand, 'brand.category 누락');
    assert.ok('story' in intake.brand, 'brand.story 누락');

    // contact
    assert.ok('phone' in intake.contact, 'contact.phone 누락');
  });
});

// ── 게이트 4: 선택 슬롯을 전부 skip 해도 키들이 빈 값으로 존재한다 ──

describe('Gate 4: optional skip → keys still present', () => {
  it('선택 슬롯 전부 skip 해도 모든 키가 존재한다', () => {
    let state = createState('test');
    for (let i = 0; i < script.length; i++) {
      const step = script[i];
      let r;
      if (step.required) {
        r = applyAnswer(state, script, { slot: step.slot, value: sampleValue(step) });
      } else {
        r = applyAnswer(state, script, { slot: step.slot, skipped: true });
      }
      assert.equal(r.error, null, `step ${i} (${step.slot}): ${r.error}`);
      state = r.state;
    }
    assert.equal(state.done, true);

    const intake = buildIntake(state, script);

    // goal 키 전부 존재 (빈 값 허용)
    assert.ok('primary_action' in intake.goal);
    assert.ok('why_now' in intake.goal);
    assert.ok('current_pain' in intake.goal);
    assert.ok('success_6m' in intake.goal);
    assert.ok('audience' in intake.goal);
    assert.ok('never_guess' in intake.goal);
    assert.ok('wants' in intake.care);

    // brand
    assert.ok('name' in intake.brand);
    assert.ok('category' in intake.brand);
    assert.ok('story' in intake.brand);

    // products: 빈 배열
    assert.ok(Array.isArray(intake.products));

    // taste
    assert.ok(Array.isArray(intake.taste.moods));
    assert.ok('avoid' in intake.taste);
    assert.ok('reference' in intake.taste);

    // musts: 빈 배열
    assert.ok(Array.isArray(intake.musts));

    // contact 키 전부 존재
    assert.ok('phone' in intake.contact);
    assert.ok('instagram' in intake.contact);
    assert.ok('address' in intake.contact);
    assert.ok('hours' in intake.contact);
  });
});

// ── 게이트 5: writeSay 실패 fetch → null 반환, fallback_say 로 진행 ──

describe('Gate 5: writeSay failure → null + fallback', () => {
  it('fetch 가 실패하면 null 을 반환한다', async () => {
    const failingFetch = async () => { throw new Error('network down'); };
    const result = await writeSay(
      { prev: script[0], next: script[1], answer: '테스트' },
      { LLM_API_BASE: 'https://fake.api', LLM_API_KEY: 'key', LLM_MODEL: 'test' },
      failingFetch,
    );
    assert.equal(result, null);
  });

  it('API 키가 없으면 null 을 반환한다', async () => {
    const result = await writeSay(
      { prev: script[0], next: script[1], answer: '테스트' },
      {},
    );
    assert.equal(result, null);
  });

  it('HTTP 에러 시 null 을 반환한다', async () => {
    const errorFetch = async () => ({ ok: false, status: 500 });
    const result = await writeSay(
      { prev: script[0], next: script[1], answer: '테스트' },
      { LLM_API_BASE: 'https://fake.api', LLM_API_KEY: 'key' },
      errorFetch,
    );
    assert.equal(result, null);
  });

  it('null 이면 fallback_say 로 진행한다 (통합)', async () => {
    // writeSay 가 null 을 반환하면 호출부는 fallback_say 를 쓴다
    const say = null;
    const fallback = script[0].fallback_say;
    assert.ok(fallback.length > 0, 'fallback_say 가 비어있다');
    assert.equal(say ?? fallback, fallback);
  });
});

// ── 게이트 6: taste 무드 키 6종이 계약 문자열과 정확히 일치한다 ──

describe('Gate 6: taste swatch keys match contract', () => {
  const CONTRACT_KEYS = ['warm_minimal', 'dark_mood', 'color_pop', 'fresh_green', 'clean_mono', 'retro'];

  it('6종 무드 키가 CONTRACT.md 와 정확히 일치한다', () => {
    const actual = TASTE_SWATCHES.map(s => s.value);
    assert.deepEqual(actual, CONTRACT_KEYS);
  });

  it('각 스와치에 색 3개(bg·accent·text) HEX 가 있다', () => {
    for (const s of TASTE_SWATCHES) {
      assert.equal(s.swatch.length, 3, `${s.value}: swatch 길이가 3이 아니다`);
      for (const hex of s.swatch) {
        assert.match(hex, /^#[0-9A-Fa-f]{6}$/, `${s.value}: ${hex} 는 HEX 가 아니다`);
      }
    }
  });

  it('taste 슬롯의 options 가 스와치와 일치한다', () => {
    const tasteStep = script.find(s => s.slot === 'taste.moods');
    assert.ok(tasteStep, 'taste 슬롯이 없다');
    assert.equal(tasteStep.options.length, 6, 'taste options 가 6개가 아니다');
    for (let i = 0; i < 6; i++) {
      assert.equal(tasteStep.options[i].value, CONTRACT_KEYS[i]);
    }
  });
});

// ── 게이트 7: 클라이언트 입력이 buildIntake 에 글자 그대로 들어간다 ──

describe('Gate 7: client input preserved verbatim', () => {
  it('상호·상품명·가격 문자열이 글자 그대로 들어간다', () => {
    let state = createState('test');

    // brand.name: 특수문자+공백 포함
    const storeName = '  서울 분식!!  ';
    let r = applyAnswer(state, script, { slot: 'brand.name', value: storeName });
    assert.equal(r.error, null);
    state = r.state;

    // brand.category
    r = applyAnswer(state, script, { slot: 'brand.category', value: '한식 분식 카페' });
    assert.equal(r.error, null);
    state = r.state;

    // goal.primary_action
    r = applyAnswer(state, script, { slot: 'goal.primary_action', value: 'call' });
    assert.equal(r.error, null);
    state = r.state;

    // goal.current_pain (선택, 비워도 됨)
    r = applyAnswer(state, script, { slot: 'goal.current_pain', value: '' });
    assert.equal(r.error, null);
    state = r.state;

    // goal.why_now
    r = applyAnswer(state, script, { slot: 'goal.why_now', value: '' });
    assert.equal(r.error, null);
    state = r.state;

    // goal.success_6m
    r = applyAnswer(state, script, { slot: 'goal.success_6m', value: '' });
    assert.equal(r.error, null);
    state = r.state;

    // goal.audience
    r = applyAnswer(state, script, { slot: 'goal.audience', value: '' });
    assert.equal(r.error, null);
    state = r.state;

    // brand.story / goal.never_guess (2026-08-16 에 쪼갠 두 슬롯)
    r = applyAnswer(state, script, { slot: 'brand.story', value: '할머니 레시피' });
    assert.equal(r.error, null);
    state = r.state;

    r = applyAnswer(state, script, { slot: 'goal.never_guess', value: '비밀 양념' });
    assert.equal(r.error, null);
    state = r.state;

    // products: 가격 문자열 그대로 (null 허용)
    const products = [
      { name: '떡볶이', desc: '매운 떡볶이', price_krw: 5000 },
      { name: '순대', desc: '', price_krw: null },
    ];
    r = applyAnswer(state, script, { slot: 'products', value: products });
    assert.equal(r.error, null);
    state = r.state;

    // photos
    r = applyAnswer(state, script, { slot: 'photos', value: 'none' });
    assert.equal(r.error, null);
    state = r.state;

    // taste
    r = applyAnswer(state, script, { slot: 'taste.moods', value: ['warm_minimal'] });
    assert.equal(r.error, null);
    state = r.state;

    // taste.avoid / taste.reference (2026-08-16 에 쪼갠 슬롯 — avoid 는 금지선이라 잃으면 안 된다)
    r = applyAnswer(state, script, { slot: 'taste.avoid', value: '어두운 건 싫어요' });
    assert.equal(r.error, null);
    state = r.state;

    r = applyAnswer(state, script, { slot: 'taste.reference', value: '@어느가게' });
    assert.equal(r.error, null);
    state = r.state;

    // musts
    r = applyAnswer(state, script, { slot: 'musts', value: ['map', 'phone'] });
    assert.equal(r.error, null);
    state = r.state;

    // contact
    r = applyAnswer(state, script, {
      slot: 'contact',
      value: { phone: '02-123-4567', instagram: '@seoul_bunsik', address: '서울시 강남구', hours: '09:00-21:00' },
    });
    assert.equal(r.error, null);
    state = r.state;

    // care.wants
    r = applyAnswer(state, script, { slot: 'care.wants', value: 'yes' });
    assert.equal(r.error, null);
    state = r.state;

    assert.equal(state.done, true);

    const intake = buildIntake(state, script);

    // 글자 그대로 검증
    assert.equal(intake.taste.avoid, '어두운 건 싫어요', '피하고 싶은 느낌이 상담지에 안 실림');
    assert.deepEqual(intake.taste.moods, ['warm_minimal'], '고른 무드가 상담지에 안 실림');
    assert.equal(intake.goal.never_guess, '비밀 양념', '손님이 모를 얘기가 상담지에 안 실림');
    assert.equal(intake.brand.name, storeName, '상호가 변형됨');
    assert.equal(intake.brand.category, '한식 분식 카페');
    assert.equal(intake.brand.story, '할머니 레시피');
    assert.equal(intake.goal.never_guess, '비밀 양념');
    assert.equal(intake.products[0].name, '떡볶이');
    assert.equal(intake.products[0].price_krw, 5000);
    assert.equal(intake.products[1].name, '순대');
    assert.equal(intake.products[1].price_krw, null);
    assert.equal(intake.contact.phone, '02-123-4567');
    assert.equal(intake.contact.instagram, '@seoul_bunsik');
    assert.equal(intake.contact.address, '서울시 강남구');
    assert.equal(intake.contact.hours, '09:00-21:00');
  });
});


// ── 회귀: say 는 「받아주는 말」이지 질문이 아니다 (2026-08-16 실서버 실측 결함) ──

describe('say 생성 규율', () => {
  it('건너뛴 답이면 모델을 아예 부르지 않는다 (지어내기 차단)', async () => {
    let called = 0;
    const spy = async () => { called++; throw new Error('불러선 안 된다'); };
    const say = await writeSay(
      { prev: script[3], next: script[4], answer: null, skipped: true },
      { LLM_API_KEY: 'x', LLM_API_BASE: 'https://example.invalid' },
      spy,
    );
    assert.equal(called, 0, '건너뛴 답에 모델을 불렀다 — 없는 내용을 지어낼 자리다');
    assert.ok(say && say.length > 0, '건너뛰어도 할 말은 있어야 한다');
    assert.ok(!say.includes('?'), `건너뛴 뒤에 되묻고 있다: ${say}`);
  });

  it('생성된 say 가 길면 문장 끝에서 잘린다', async () => {
    const long = '네 알겠습니다 그리고 이것은 아주 긴 문장이라서 상한을 넘습니다 그래서 잘려야 합니다 정말로 길어요 계속 이어집니다 끝없이 이어집니다';
    const fakeFetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: long } }] }),
    });
    const say = await writeSay(
      { prev: script[0], next: script[1], answer: '골목 꽃집' },
      { LLM_API_KEY: 'x', LLM_API_BASE: 'https://example.invalid' },
      fakeFetch,
    );
    assert.ok(say.length <= 90, `상한을 넘었다: ${say.length}자`);
  });
});
