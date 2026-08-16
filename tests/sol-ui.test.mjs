// tests/consult.test.mjs — spec 게이트 7개 검사
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  renderStep, collectValue, validate, escapeHtml, applyResponse
} from '../public/sol/consult.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 헬퍼: spec §2 형태의 step 팩토리 ──
function makeStep(overrides) {
  return {
    slot: 'test.slot',
    kind: 'text',
    title: '테스트',
    hint: '',
    required: true,
    placeholder: '',
    options: undefined,
    ...overrides,
  };
}

// ── 1. renderStep: 8가지 kind 전부 비어있지 않은 HTML ──
describe('1. renderStep — 8 kind 전부 HTML 생성', () => {
  const kinds = ['text', 'textarea', 'choice', 'multi', 'swatch', 'products', 'contact', 'confirm'];

  for (const kind of kinds) {
    it(`kind="${kind}" → 비어있지 않은 HTML`, () => {
      const step = makeStep({
        kind,
        options: (kind === 'choice' || kind === 'multi' || kind === 'swatch')
          ? [
              { value: 'a', label: '옵션A', swatch: ['#fff', '#000', '#333'] },
              { value: 'b', label: '옵션B', swatch: ['#eee', '#111', '#444'] },
            ]
          : undefined,
      });
      const html = renderStep(step);
      assert.ok(html.length > 10, `${kind}: HTML이 너무 짧음 (${html.length}자)`);
      assert.ok(html.includes('step-'), `${kind}: step 클래스 누락`);
    });
  }
});

// ── 2. swatch: HEX 색이 실제로 들어간다 ──
describe('2. swatch — HEX 색이 렌더에 포함', () => {
  it('swatch 옵션의 HEX 색 3개가 HTML에 존재', () => {
    const step = makeStep({
      kind: 'swatch',
      options: [
        { value: 'warm', label: '따뜻한', swatch: ['#F6EFE7', '#C88E5F', '#2E2A26'] },
        { value: 'cool', label: '차가운', swatch: ['#E7EFF6', '#5F8EC8', '#262A2E'] },
      ],
    });
    const html = renderStep(step);
    assert.ok(html.includes('#F6EFE7'), '첫 번째 swatch 배경색 누락');
    assert.ok(html.includes('#C88E5F'), '첫 번째 swatch 강조색 누락');
    assert.ok(html.includes('#2E2A26'), '첫 번째 swatch 텍스트색 누락');
    assert.ok(html.includes('#E7EFF6'), '두 번째 swatch 배경색 누락');
    assert.ok(html.includes('#5F8EC8'), '두 번째 swatch 강조색 누락');
    assert.ok(html.includes('#262A2E'), '두 번째 swatch 텍스트색 누락');
  });
});

// ── 3. escapeHtml: script 태그가 살아남지 않는다 ──
describe('3. escapeHtml — XSS 방지', () => {
  const xss = '<script>alert(1)</script>';

  it('title에 script 태그 → 이스케이프됨', () => {
    const step = makeStep({ kind: 'text', title: xss });
    const html = renderStep(step);
    assert.ok(!html.includes('<script>'), 'title에서 script 태그가 살아있음');
    assert.ok(html.includes('&lt;script&gt;'), '이스케이프된 entity가 없음');
  });

  it('choice 옵션 label에 script 태그 → 이스케이프됨', () => {
    const step = makeStep({
      kind: 'choice',
      options: [{ value: 'x', label: xss }],
    });
    const html = renderStep(step);
    assert.ok(!html.includes('<script>'), '옵션 label에서 script 태그가 살아있음');
  });

  it('products 렌더 — 상품명 placeholder에 script가 없음', () => {
    const step = makeStep({ kind: 'products', title: xss });
    const html = renderStep(step);
    assert.ok(!html.includes('<script>'), 'products title에서 script 태그가 살아있음');
  });

  it('escapeHtml 함수 단독 테스트', () => {
    assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    assert.equal(escapeHtml('a & b'), 'a &amp; b');
    assert.equal(escapeHtml('"hello"'), '&quot;hello&quot;');
    assert.equal(escapeHtml("it's"), "it&#39;s");
  });
});

// ── 4. collectValue: 빈 행 버리기, 가격 파싱 ──
describe('4. collectValue — products 빈 행 제거 + 가격 파싱', () => {
  it('빈 상품 행이 버려진다', () => {
    const step = makeStep({ kind: 'products' });
    const formState = {
      rows: [
        { name: '라떼', desc: '맛있는 라떼', price: '5,500' },
        { name: '', desc: '', price: '' },
        { name: '  ', desc: '비어있음', price: '' },
      ],
    };
    const value = collectValue(step, formState);
    assert.equal(value.length, 1, `빈 행이 제거되지 않음: ${value.length}개`);
    assert.equal(value[0].name, '라떼');
  });

  it('"12,000원" → 12000', () => {
    const step = makeStep({ kind: 'products' });
    const formState = { rows: [{ name: '상품', desc: '', price: '12,000원' }] };
    const value = collectValue(step, formState);
    assert.equal(value[0].price_krw, 12000);
  });

  it('"모름" → null', () => {
    const step = makeStep({ kind: 'products' });
    const formState = { rows: [{ name: '상품', desc: '', price: '모름' }] };
    const value = collectValue(step, formState);
    assert.equal(value[0].price_krw, null);
  });

  it('빈 가격 → null', () => {
    const step = makeStep({ kind: 'products' });
    const formState = { rows: [{ name: '상품', desc: '', price: '' }] };
    const value = collectValue(step, formState);
    assert.equal(value[0].price_krw, null);
  });

  it('contact 타입 수집', () => {
    const step = makeStep({ kind: 'contact' });
    const formState = { phone: '010-1234-5678', instagram: '@shop', address: '서울', hours: '10~22' };
    const value = collectValue(step, formState);
    assert.equal(value.phone, '010-1234-5678');
    assert.equal(value.instagram, '@shop');
  });

  it('choice 타입 수집', () => {
    const step = makeStep({ kind: 'choice' });
    const formState = { value: 'call' };
    assert.equal(collectValue(step, formState), 'call');
  });

  it('multi 타입 수집', () => {
    const step = makeStep({ kind: 'multi' });
    const formState = { value: ['a', 'b'] };
    const value = collectValue(step, formState);
    assert.deepEqual(value, ['a', 'b']);
  });
});

// ── 5. validate: required 빈 값 → ok:false, 비-required → ok:true ──
describe('5. validate — required 검증', () => {
  it('required + 빈 text → ok:false + 메시지', () => {
    const step = makeStep({ kind: 'text', required: true, title: '가게 이름' });
    const result = validate(step, '');
    assert.equal(result.ok, false);
    assert.ok(result.message.length > 0, '메시지가 비어있음');
  });

  it('required + 값 있는 text → ok:true', () => {
    const step = makeStep({ kind: 'text', required: true });
    const result = validate(step, '맛있는 라떼');
    assert.equal(result.ok, true);
  });

  it('required:false + 빈 값 → ok:true', () => {
    const step = makeStep({ kind: 'text', required: false });
    const result = validate(step, '');
    assert.equal(result.ok, true);
  });

  it('required + 빈 choice → ok:false', () => {
    const step = makeStep({ kind: 'choice', required: true });
    const result = validate(step, '');
    assert.equal(result.ok, false);
  });

  it('required + 빈 products → ok:false', () => {
    const step = makeStep({ kind: 'products', required: true });
    const result = validate(step, []);
    assert.equal(result.ok, false);
  });

  it('required + 빈 contact → ok:false (전화번호 필수)', () => {
    const step = makeStep({ kind: 'contact', required: true });
    const result = validate(step, { phone: '', address: '', hours: '', instagram: '' });
    assert.equal(result.ok, false);
  });

  it('multi 최소 선택 검증', () => {
    const step = makeStep({ kind: 'multi', required: false, min: 2 });
    const result = validate(step, ['a']);
    assert.equal(result.ok, false);
    assert.ok(result.message.includes('2'), '최소 개수 안내');
  });
});

// ── 6. applyResponse: slot_mismatch → 동봉된 step으로 갈아탄다 ──
describe('6. applyResponse — slot_mismatch 처리', () => {
  it('slot_mismatch 응답 → step이 교체되고 진행하지 않는다', () => {
    const view = {
      step: { kind: 'text', slot: 'old.slot', title: '이전' },
      progress: { current: 3, total: 14 },
      sessionId: 's_abc',
      messages: [],
      busy: false,
      error: null,
      done: false,
    };
    const newStep = { kind: 'choice', slot: 'new.slot', title: '올바른 질문', options: [] };
    const res = {
      ok: false,
      error: 'slot_mismatch',
      message: '질문이 변경되었습니다.',
      step: newStep,
    };
    const next = applyResponse(view, res);
    assert.deepEqual(next.step, newStep, 'step이 동봉된 것으로 교체되어야 함');
    assert.equal(next.done, false, '진행하면 안 됨');
    assert.ok(next.messages.length > 0, '메시지가 추가되어야 함');
  });

  it('정상 응답 → step + progress 갱신', () => {
    const view = {
      step: null,
      progress: { current: 1, total: 14 },
      sessionId: null,
      messages: [],
      busy: true,
      error: null,
      done: false,
    };
    const res = {
      ok: true,
      session_id: 's_new',
      say: '안녕하세요!',
      step: { kind: 'text', slot: 'brand.name', title: '가게 이름' },
      progress: { current: 2, total: 14 },
      done: false,
    };
    const next = applyResponse(view, res);
    assert.equal(next.sessionId, 's_new');
    assert.equal(next.progress.current, 2);
    assert.equal(next.done, false);
    assert.ok(next.messages.some(m => m.text === '안녕하세요!'), 'say 메시지 추가');
  });

  it('done:true 응답 → intake 수신', () => {
    const view = {
      step: null, progress: { current: 14, total: 14 }, sessionId: 's_abc',
      messages: [], busy: true, error: null, done: false,
    };
    const res = {
      ok: true, session_id: 's_abc', say: '감사합니다!',
      step: null, progress: { current: 14, total: 14 },
      done: true, intake: { brand: { name: '카페' } },
    };
    const next = applyResponse(view, res);
    assert.equal(next.done, true);
    assert.deepEqual(next.intake, { brand: { name: '카페' } });
  });
});

// ── 7. progress.total 하드코딩 금지 — 소스 문자열 검색 ──
describe('7. progress.total — 하드코딩 금지', () => {
  it('consult.js 소스에 "14" 하드코딩이 없다', async () => {
    const src = await readFile(join(__dirname, '..', 'public', 'sol', 'consult.js'), 'utf8');
    // progress.total = 14 또는 total: 14 패턴 검색 (문자열 리터럴만, 주석 제외)
    const lines = src.split('\n').filter(l => !l.trim().startsWith('//'));
    const code = lines.join('\n');
    const hardcoded = /total\s*[:=]\s*14\b/;
    assert.ok(!hardcoded.test(code), 'consult.js에서 progress.total=14 하드코딩 발견');
  });

  it('consult-boot.js 소스에 "14" 하드코딩이 없다', async () => {
    let src;
    try {
      src = await readFile(join(__dirname, '..', 'public', 'sol', 'consult-boot.js'), 'utf8');
    } catch {
      // boot 파일이 아직 없을 수 있음 — 통과
      return;
    }
    const lines = src.split('\n').filter(l => !l.trim().startsWith('//'));
    const code = lines.join('\n');
    const hardcoded = /total\s*[:=]\s*14\b/;
    assert.ok(!hardcoded.test(code), 'consult-boot.js에서 progress.total=14 하드코딩 발견');
  });
});
