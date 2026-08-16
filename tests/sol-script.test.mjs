// tests/script.test.mjs — 대본 무결성 테스트
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  script,
  PRIMARY_ACTION_OPTIONS,
  TASTE_SWATCHES,
  MUSTS_OPTIONS,
  getStepBySlot,
} from '../functions/_lib/script.js';

describe('script structure', () => {
  it('17 슬롯이다', () => {
    assert.equal(script.length, 17);
  });

  it('모든 슬롯에 slot, kind, title, hint, required, placeholder, fallback_say 이 있다', () => {
    for (const step of script) {
      assert.ok(step.slot, 'slot 누락');
      assert.ok(step.kind, `${step.slot}: kind 누락`);
      assert.ok(step.title, `${step.slot}: title 누락`);
      assert.ok(step.hint, `${step.slot}: hint 누락`);
      assert.ok(typeof step.required === 'boolean', `${step.slot}: required 가 boolean 이 아니다`);
      assert.ok(typeof step.placeholder === 'string', `${step.slot}: placeholder 누락`);
      assert.ok(step.fallback_say, `${step.slot}: fallback_say 누락`);
    }
  });

  it('slot 이름이 중복되지 않는다 (compound 는 + 로 구분)', () => {
    const allSlots = [];
    for (const step of script) {
      if (step.slot.includes('+')) {
        allSlots.push(...step.slot.split('+'));
      } else {
        allSlots.push(step.slot);
      }
    }
    const unique = new Set(allSlots);
    assert.equal(unique.size, allSlots.length, `중복 슬롯: ${[...allSlots.filter((s, i) => allSlots.indexOf(s) !== i)]}`);
  });

  it('kind 가 허용된 값 중 하나다', () => {
    const validKinds = ['text', 'textarea', 'choice', 'multi', 'swatch', 'products', 'contact'];
    for (const step of script) {
      assert.ok(validKinds.includes(step.kind), `${step.slot}: kind "${step.kind}" 는 허용되지 않는다`);
    }
  });

  it('choice/multi/swatch 슬롯에 options 가 있다', () => {
    for (const step of script) {
      if (['choice', 'multi', 'swatch'].includes(step.kind)) {
        assert.ok(Array.isArray(step.options), `${step.slot}: ${step.kind} 에 options 가 없다`);
        assert.ok(step.options.length > 0, `${step.slot}: options 가 비어있다`);
      }
    }
  });

  it('products/contact 슬롯에는 options 가 없다', () => {
    for (const step of script) {
      if (['products', 'contact'].includes(step.kind)) {
        assert.ok(!step.options, `${step.slot}: ${step.kind} 에 options 가 있으면 안 된다`);
      }
    }
  });
});

describe('goal.primary_action options', () => {
  it('6개 선택지가 있다', () => {
    assert.equal(PRIMARY_ACTION_OPTIONS.length, 6);
  });

  it('각 선택지에 value 와 label 이 있다', () => {
    for (const opt of PRIMARY_ACTION_OPTIONS) {
      assert.ok(opt.value, 'value 누락');
      assert.ok(opt.label, `${opt.value}: label 누락`);
    }
  });

  it('value 가 계약과 일치한다 (call|reserve|visit|order|inquiry|browse)', () => {
    const values = PRIMARY_ACTION_OPTIONS.map(o => o.value);
    assert.deepEqual(values, ['call', 'reserve', 'visit', 'order', 'inquiry', 'browse']);
  });
});

describe('taste swatches', () => {
  it('6종이다', () => {
    assert.equal(TASTE_SWATCHES.length, 6);
  });

  it('각 스와치에 value, label, swatch[3] HEX 가 있다', () => {
    for (const s of TASTE_SWATCHES) {
      assert.ok(s.value, 'value 누락');
      assert.ok(s.label, `${s.value}: label 누락`);
      assert.equal(s.swatch.length, 3, `${s.value}: swatch 가 3개가 아니다`);
      for (const hex of s.swatch) {
        assert.match(hex, /^#[0-9A-Fa-f]{6}$/, `${s.value}: ${hex} 는 6자리 HEX 가 아니다`);
      }
    }
  });

  it('무드 키가 CONTRACT.md 와 정확히 일치한다', () => {
    const expected = ['warm_minimal', 'dark_mood', 'color_pop', 'fresh_green', 'clean_mono', 'retro'];
    const actual = TASTE_SWATCHES.map(s => s.value);
    assert.deepEqual(actual, expected);
  });
});

describe('musts options', () => {
  it('8개 선택지가 있다', () => {
    assert.equal(MUSTS_OPTIONS.length, 8);
  });

  it('value 가 계약과 일치한다', () => {
    const expected = ['map', 'phone', 'hours', 'menu', 'insta', 'reserve', 'review', 'parking'];
    const actual = MUSTS_OPTIONS.map(o => o.value);
    assert.deepEqual(actual, expected);
  });
});

describe('getStepBySlot', () => {
  it('slot 이름으로 Step 을 찾는다', () => {
    const step = getStepBySlot('brand.name');
    assert.ok(step);
    assert.equal(step.slot, 'brand.name');
  });

  it('존재하지 않는 slot 은 null 을 반환한다', () => {
    assert.equal(getStepBySlot('nonexistent'), null);
  });
});
