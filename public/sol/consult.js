// consult.js — Sol 상담 화면 순수 로직 (DOM·window 없이 import 가능)
// 화면은 step.kind 만 보고 그린다. 슬롯 이름으로 분기하지 말 것.

/**
 * HTML 이스케이프 — 모든 사용자 입력·서버 문자열은 이걸 통과해야 한다.
 * @param {string} s
 * @returns {string}
 */
export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Step 객체를 HTML 문자열로 렌더링한다.
 * step.kind 별로 분기: text, textarea, choice, multi, swatch, products, contact, confirm
 * @param {object} step — API 계약 §2 Step 객체
 * @returns {string} HTML 문자열
 */
export function renderStep(step) {
  if (!step) return '';
  const { kind, title, hint, placeholder, options, required, min, max } = step;
  const titleHtml = title ? `<div class="step-title">${escapeHtml(title)}</div>` : '';
  const hintHtml = hint ? `<div class="step-hint">${escapeHtml(hint)}</div>` : '';
  const reqMark = required ? '<span class="req-mark" aria-label="필수">*</span>' : '';

  switch (kind) {
    case 'text':
      return `<div class="step step-text" data-kind="text">
        ${titleHtml}${reqMark}${hintHtml}
        <input type="text" class="step-input" placeholder="${escapeHtml(placeholder || '')}" />
      </div>`;

    case 'textarea':
      return `<div class="step step-textarea" data-kind="textarea">
        ${titleHtml}${reqMark}${hintHtml}
        <textarea class="step-input" rows="4" placeholder="${escapeHtml(placeholder || '')}"></textarea>
      </div>`;

    case 'choice':
      return `<div class="step step-choice" data-kind="choice">
        ${titleHtml}${reqMark}${hintHtml}
        <div class="option-list">
          ${(options || []).map((opt, i) => `
            <label class="option-card">
              <input type="radio" name="step-choice" value="${escapeHtml(opt.value)}" ${i === 0 ? '' : ''} />
              <span class="option-label">${escapeHtml(opt.label)}</span>
            </label>`).join('')}
        </div>
      </div>`;

    case 'multi':
      return `<div class="step step-multi" data-kind="multi">
        ${titleHtml}${reqMark}${hintHtml}
        ${min != null || max != null ? `<div class="range-hint">${min != null ? `최소 ${min}개` : ''}${min != null && max != null ? ' · ' : ''}${max != null ? `최대 ${max}개` : ''}</div>` : ''}
        <div class="option-list">
          ${(options || []).map(opt => `
            <label class="option-card">
              <input type="checkbox" name="step-multi" value="${escapeHtml(opt.value)}" />
              <span class="option-label">${escapeHtml(opt.label)}</span>
            </label>`).join('')}
        </div>
      </div>`;

    case 'swatch':
      return `<div class="step step-swatch" data-kind="swatch">
        ${titleHtml}${reqMark}${hintHtml}
        ${min != null || max != null ? `<div class="range-hint">${min != null ? `최소 ${min}개` : ''}${min != null && max != null ? ' · ' : ''}${max != null ? `최대 ${max}개` : ''}</div>` : ''}
        <div class="swatch-list">
          ${(options || []).map(opt => {
            const colors = opt.swatch || ['#ccc', '#999', '#333'];
            return `
            <label class="swatch-card">
              <input type="checkbox" name="step-swatch" value="${escapeHtml(opt.value)}" />
              <div class="swatch-preview">
                <span class="swatch-bg" style="background:${escapeHtml(colors[0])}"></span>
                <span class="swatch-accent" style="background:${escapeHtml(colors[1])}"></span>
                <span class="swatch-text" style="background:${escapeHtml(colors[2])}"></span>
              </div>
              <span class="swatch-label">${escapeHtml(opt.label)}</span>
            </label>`}).join('')}
        </div>
      </div>`;

    case 'products':
      return `<div class="step step-products" data-kind="products">
        ${titleHtml}${reqMark}${hintHtml}
        <table class="products-table">
          <thead><tr>
            <th>상품명</th><th>설명</th><th>가격</th><th></th>
          </tr></thead>
          <tbody class="products-body">
            <tr class="product-row">
              <td><input type="text" class="prod-name" placeholder="예: 시그니처 라떼" /></td>
              <td><input type="text" class="prod-desc" placeholder="간단 설명" /></td>
              <td><input type="text" class="prod-price" placeholder="5,500" inputmode="numeric" /></td>
              <td><button type="button" class="btn-remove-row" aria-label="행 삭제">✕</button></td>
            </tr>
          </tbody>
        </table>
        <button type="button" class="btn-add-row">+ 상품 추가</button>
      </div>`;

    case 'contact':
      return `<div class="step step-contact" data-kind="contact">
        ${titleHtml}${reqMark}${hintHtml}
        <div class="contact-grid">
          <label class="contact-field">
            <span class="contact-label">전화번호</span>
            <input type="tel" class="step-input contact-phone" placeholder="010-1234-5678" />
          </label>
          <label class="contact-field">
            <span class="contact-label">주소</span>
            <input type="text" class="step-input contact-address" placeholder="서울시 강남구 ..." />
          </label>
          <label class="contact-field">
            <span class="contact-label">영업시간</span>
            <input type="text" class="step-input contact-hours" placeholder="매일 10:00~22:00" />
          </label>
          <label class="contact-field">
            <span class="contact-label">인스타그램</span>
            <input type="text" class="step-input contact-instagram" placeholder="@myshop" />
          </label>
        </div>
      </div>`;

    case 'confirm':
      return `<div class="step step-confirm" data-kind="confirm">
        ${titleHtml}${hintHtml}
        <div class="confirm-body"></div>
      </div>`;

    default:
      return `<div class="step step-unknown" data-kind="${escapeHtml(kind)}">
        ${titleHtml}<p>알 수 없는 입력 유형입니다.</p>
      </div>`;
  }
}

/**
 * 서버로 보낼 value를 form state에서 추출한다.
 * products는 빈 행을 버리고, price_krw는 숫자만 남겨 정수로, 못 읽으면 null.
 * @param {object} step
 * @param {object} formState — DOM에서 읽은 현재 입력값
 * @returns {*} 서버 계약 §1-B 타입
 */
export function collectValue(step, formState) {
  if (!step) return null;
  const { kind } = step;

  switch (kind) {
    case 'text':
    case 'textarea':
      return (formState.value || '').trim();

    case 'choice':
    case 'swatch':
      return formState.value || '';

    case 'multi':
      return Array.isArray(formState.value) ? formState.value : [];

    case 'products': {
      const rows = Array.isArray(formState.rows) ? formState.rows : [];
      return rows
        .filter(r => (r.name || '').trim() !== '')
        .map(r => ({
          name: (r.name || '').trim(),
          desc: (r.desc || '').trim(),
          price_krw: parsePrice(r.price),
        }));
    }

    case 'contact':
      return {
        phone: (formState.phone || '').trim(),
        instagram: (formState.instagram || '').trim(),
        address: (formState.address || '').trim(),
        hours: (formState.hours || '').trim(),
      };

    case 'confirm':
      return formState.confirmed || false;

    default:
      return formState.value || '';
  }
}

/**
 * 가격 문자열에서 숫자만 추출해 정수로. 못 읽으면 null.
 * "12,000원" → 12000, "모름" → null, "" → null
 * @param {string} s
 * @returns {number|null}
 */
export function parsePrice(s) {
  if (s == null) return null;
  const trimmed = String(s).trim();
  if (trimmed === '') return null;
  const digits = trimmed.replace(/[^0-9]/g, '');
  if (digits === '') return null;
  return parseInt(digits, 10);
}

/**
 * 화면에서 먼저 검증. required인데 비었으면 ok:false + 사람 말 메시지.
 * @param {object} step
 * @param {*} value — collectValue 의 결과
 * @returns {{ok: boolean, message: string}}
 */
export function validate(step, value) {
  if (!step) return { ok: true, message: '' };
  const { required, kind, title, min, max } = step;
  const label = title || '이 항목';

  // required가 아니면 빈 값도 통과
  if (!required) {
    // multi/swatch 최소 선택 검증은 required가 아니어도 적용
    if ((kind === 'multi' || kind === 'swatch') && Array.isArray(value) && min != null && value.length < min) {
      return { ok: false, message: `최소 ${min}개를 선택해 주세요.` };
    }
    return { ok: true, message: '' };
  }

  // required=true 검증
  switch (kind) {
    case 'text':
    case 'textarea':
      if (!value || String(value).trim() === '') {
        return { ok: false, message: `${label}을(를) 입력해 주세요.` };
      }
      break;

    case 'choice':
    case 'swatch':
      if (!value || String(value).trim() === '') {
        return { ok: false, message: `${label}을(를) 선택해 주세요.` };
      }
      break;

    case 'multi':
      if (!Array.isArray(value) || value.length === 0) {
        return { ok: false, message: `${label}을(를) 하나 이상 선택해 주세요.` };
      }
      if (min != null && value.length < min) {
        return { ok: false, message: `최소 ${min}개를 선택해 주세요.` };
      }
      break;

    case 'products':
      if (!Array.isArray(value) || value.length === 0) {
        return { ok: false, message: `대표 상품을 하나 이상 입력해 주세요.` };
      }
      break;

    case 'contact':
      if (!value || !value.phone || String(value.phone).trim() === '') {
        return { ok: false, message: `전화번호를 입력해 주세요.` };
      }
      break;

    case 'confirm':
      break;

    default:
      break;
  }

  // multi/swatch 최대 선택 검증
  if ((kind === 'multi' || kind === 'swatch') && Array.isArray(value) && max != null && value.length > max) {
    return { ok: false, message: `최대 ${max}개까지만 선택해 주세요.` };
  }

  return { ok: true, message: '' };
}

/**
 * 서버 응답을 받아 새 view 상태를 반환한다.
 * res.ok:false 면 res.message를 말풍선으로, error==="slot_mismatch"면 동봉된 step으로 갈아탄다.
 * @param {object} view — 현재 view 상태 { step, progress, sessionId, messages, busy, error }
 * @param {object} res — 서버 응답
 * @returns {object} 새 view 상태
 */
export function applyResponse(view, res) {
  const next = { ...view, busy: false };

  if (!res.ok) {
    // slot_mismatch: 동봉된 step으로 갈아탄다 (진행하지 않는다)
    if (res.error === 'slot_mismatch' && res.step) {
      next.step = res.step;
      next.messages = [...(view.messages || []), { role: 'system', text: res.message || '질문이 변경되었습니다.' }];
      return next;
    }
    // 일반 오류: 메시지 표시
    next.error = res.message || '문제가 발생했습니다.';
    next.messages = [...(view.messages || []), { role: 'system', text: next.error }];
    return next;
  }

  // 성공
  next.error = null;
  next.sessionId = res.session_id || view.sessionId;

  if (res.say) {
    next.messages = [...(view.messages || []), { role: 'sol', text: res.say }];
  }

  if (res.progress) {
    next.progress = res.progress;
  }

  if (res.done) {
    next.done = true;
    next.step = null;
    next.intake = res.intake || null;
  } else if (res.step) {
    next.step = res.step;
    next.done = false;
  }

  return next;
}

/**
 * 초기 view 상태 생성
 * @returns {object}
 */
export function createInitialView() {
  return {
    step: null,
    progress: { current: 0, total: 0 },
    sessionId: null,
    messages: [],
    busy: false,
    error: null,
    done: false,
    intake: null,
    ref: null,
  };
}
