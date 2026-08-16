// functions/_lib/engine.js — 상태머신. 순수 함수, CF 의존 0.

/**
 * 새 세션 상태 생성
 * @param {string} sessionId
 * @returns {Object}
 */
export function createState(sessionId) {
  return {
    session_id: sessionId,
    cursor: 0,
    answers: {},
    created_at: new Date().toISOString(),
    done: false,
  };
}

/**
 * 다음 Step 반환. cursor 가 대본 끝을 넘으면 null + done:true.
 * @param {Object} state
 * @param {import('./script.js').Step[]} script
 * @returns {{ step: Object|null, done: boolean }}
 */
export function nextStep(state, script) {
  if (state.cursor >= script.length) {
    return { step: null, done: true };
  }
  const raw = script[state.cursor];
  // progress.total 은 script.length 로 계산 — 하드코딩 금지
  return {
    step: {
      slot: raw.slot,
      kind: raw.kind,
      title: raw.title,
      hint: raw.hint,
      required: raw.required,
      placeholder: raw.placeholder,
      ...(raw.options ? { options: raw.options } : {}),
      ...(raw.min !== undefined ? { min: raw.min } : {}),
      ...(raw.max !== undefined ? { max: raw.max } : {}),
    },
    done: false,
  };
}

/**
 * 답변 1건 검증 + 반영. {state, error} 반환.
 * @param {Object} state
 * @param {import('./script.js').Step[]} script
 * @param {{ slot: string, value: any, skipped?: boolean }} answer
 * @returns {{ state: Object, error: string|null }}
 */
export function applyAnswer(state, script, answer) {
  if (state.done) {
    return { state, error: 'already_done' };
  }

  const currentStep = script[state.cursor];
  if (!currentStep) {
    return { state, error: 'out_of_range' };
  }

  // slot_mismatch: compound slot 지원
  if (answer.slot !== currentStep.slot) {
    if (currentStep.slot.includes('+')) {
      const parts = currentStep.slot.split('+');
      if (!parts.includes(answer.slot)) {
        return { state, error: 'slot_mismatch' };
      }
    } else {
      return { state, error: 'slot_mismatch' };
    }
  }

  const skipped = answer.skipped === true;
  const value = answer.value;

  // slot_required: required 인데 skipped 이거나 값이 비면
  if (currentStep.required) {
    if (skipped) {
      return { state, error: 'slot_required' };
    }
    if (value === undefined || value === null) {
      return { state, error: 'slot_required' };
    }
    if (typeof value === 'string' && value.trim() === '') {
      return { state, error: 'slot_required' };
    }
    if (Array.isArray(value) && value.length === 0) {
      return { state, error: 'slot_required' };
    }
    // products: 배열 + 각 행 name 필수
    if (currentStep.kind === 'products') {
      if (!Array.isArray(value) || value.length === 0) {
        return { state, error: 'slot_required' };
      }
      for (const row of value) {
        if (!row.name || typeof row.name !== 'string' || row.name.trim() === '') {
          return { state, error: 'slot_required' };
        }
      }
    }
  }

  // bad_value: kind 별 타입 검사 (값이 있고 skipped 가 아닐 때만)
  if (!skipped && value !== undefined && value !== null) {
    switch (currentStep.kind) {
      case 'text':
        if (typeof value !== 'string') {
          return { state, error: 'bad_value' };
        }
        break;
      case 'textarea':
        // compound textarea (brand.story+goal.never_guess) 는 객체 허용
        if (currentStep.slot.includes('+')) {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return { state, error: 'bad_value' };
          }
        } else if (typeof value !== 'string') {
          return { state, error: 'bad_value' };
        }
        break;
      case 'choice':
        if (typeof value !== 'string') {
          return { state, error: 'bad_value' };
        }
        break;
      case 'multi':
        if (!Array.isArray(value)) {
          return { state, error: 'bad_value' };
        }
        break;
      case 'swatch':
        // 화면은 고른 값들의 **배열**을 보낸다(계약 §1-B: multi 와 같은 모양).
        // 옛 구현은 {moods:[...]} 객체를 기대해 화면이 보내는 값을 전부 거부했다 —
        // 어느 쪽도 틀리지 않았고 계약이 애매했던 것이라, 배열을 정본으로 삼고 객체도 받아준다.
        if (Array.isArray(value)) break;
        if (typeof value === 'object' && value !== null && Array.isArray(value.moods)) break;
        return { state, error: 'bad_value' };
      case 'products':
        if (!Array.isArray(value)) {
          return { state, error: 'bad_value' };
        }
        for (const row of value) {
          if (typeof row !== 'object' || row === null || typeof row.name !== 'string') {
            return { state, error: 'bad_value' };
          }
          if (row.price_krw !== null && row.price_krw !== undefined) {
            if (!Number.isInteger(row.price_krw)) {
              return { state, error: 'bad_value' };
            }
          }
        }
        break;
      case 'contact':
        if (typeof value !== 'object' || Array.isArray(value)) {
          return { state, error: 'bad_value' };
        }
        break;
    }
  }

  // 통과 — answers 갱신 + cursor 전진
  const newState = { ...state, answers: { ...state.answers } };

  if (skipped) {
    // skipped 이면 값을 넣지 않는다 (buildIntake 에서 빈 값으로 채움)
  } else if (currentStep.slot.includes('+')) {
    // compound slot: 각 부분에 분배
    const parts = currentStep.slot.split('+');
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const part of parts) {
        const fieldName = part.split('.').pop();
        if (value[fieldName] !== undefined) {
          newState.answers[part] = value[fieldName];
        }
      }
    }
  } else {
    newState.answers[currentStep.slot] = value;
  }

  newState.cursor = state.cursor + 1;

  // done 체크
  if (newState.cursor >= script.length) {
    newState.done = true;
  }

  return { state: newState, error: null };
}

/**
 * 세션 상태 → intake_v2 객체. 빈 선택 슬롯은 빈 문자열/빈 배열로 채운다(키 누락 0).
 * @param {Object} state
 * @param {import('./script.js').Step[]} script
 * @returns {Object} intake_v2
 */
export function buildIntake(state, script) {
  const a = state.answers;

  return {
    form_version: 'intake_v2',
    submitted_at: new Date().toISOString(),
    collected_by: 'sol',

    goal: {
      primary_action: a['goal.primary_action'] || '',
      why_now:        a['goal.why_now'] || '',
      current_pain:   a['goal.current_pain'] || '',
      success_6m:     a['goal.success_6m'] || '',
      audience:       a['goal.audience'] || '',
      never_guess:    a['goal.never_guess'] || '',
    },

    care: {
      wants:  a['care.wants'] === 'yes',
      notes:  '',
    },

    brand: {
      name:     a['brand.name'] || '',
      category: a['brand.category'] || '',
      tagline:  '',
      story:    a['brand.story'] || '',
    },

    products: Array.isArray(a['products']) ? a['products'].map(p => ({
      name:       p.name || '',
      desc:       p.desc || '',
      price_krw:  p.price_krw ?? null,
    })) : [],

    photos: {
      mode:   a['photos'] || 'none',
      source: '',
      mood:   '',
    },

    taste: {
      // taste.moods 는 배열이 정본. 옛 {moods:[...]} 객체 형태도 계속 받아준다.
      moods: Array.isArray(a['taste.moods'])
        ? a['taste.moods']
        : (Array.isArray(a['taste']?.moods) ? a['taste'].moods : []),
      avoid:     a['taste.avoid']     || a['taste']?.avoid     || '',
      reference: a['taste.reference'] || a['taste']?.reference || '',
    },

    musts: Array.isArray(a['musts']) ? a['musts'] : [],

    contact: {
      phone:     a['contact']?.phone || '',
      instagram: a['contact']?.instagram || '',
      address:   a['contact']?.address || '',
      hours:     a['contact']?.hours || '',
    },
  };
}
