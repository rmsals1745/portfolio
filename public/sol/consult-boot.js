// consult-boot.js — DOM 배선: consult.js 순수 로직을 실제 화면에 붙이는 얇은 층
// consult.html 에서 <script type="module"> 로 임포트된다.

import {
  renderStep, collectValue, validate, escapeHtml, applyResponse, createInitialView
} from './consult.js';

// ── 상태 ──
let view = createInitialView();
let formState = {};   // 현재 step의 입력값 캐시

// ── DOM 캐시 ──
let $wrap, $messages, $stepArea, $progress, $progressFill, $progressText;
let $actions, $btnSubmit, $btnSkip;

// ── API 래퍼 (mock 여부에 따라 분기) ──
let apiStart, apiReply, apiFinish;

/**
 * consult-boot 초기화. DOM이 준비된 뒤 호출.
 * @param {object} opts
 * @param {string} opts.wrapSelector — 루트 컨테이너 셀렉터
 * @param {Function} [opts.onStart] — start API 함수 (기본: fetch)
 * @param {Function} [opts.onReply] — reply API 함수
 * @param {Function} [opts.onFinish] — finish API 함수
 */
export function init(opts = {}) {
  const sel = opts.wrapSelector || '#consult';
  $wrap = document.querySelector(sel);
  if (!$wrap) throw new Error(`consult-boot: ${sel} not found`);

  // 내장 레이아웃 생성
  $wrap.innerHTML = `
    <div class="consult-wrap">
      <div class="progress-bar">
        <span class="progress-text">0 / 0</span>
        <div class="progress-track"><div class="progress-fill" style="width:0%"></div></div>
      </div>
      <div class="messages"></div>
      <div class="step-area"></div>
      <div class="actions">
        <button class="btn-submit" type="button">보내기</button>
        <button class="btn-skip" type="button" style="display:none">건너뛰기</button>
      </div>
    </div>`;

  $messages = $wrap.querySelector('.messages');
  $stepArea = $wrap.querySelector('.step-area');
  $progressText = $wrap.querySelector('.progress-text');
  $progressFill = $wrap.querySelector('.progress-fill');
  $btnSubmit = $wrap.querySelector('.btn-submit');
  $btnSkip = $wrap.querySelector('.btn-skip');

  // API 함수 연결
  apiStart = opts.onStart || defaultApiStart;
  apiReply = opts.onReply || defaultApiReply;
  apiFinish = opts.onFinish || defaultApiFinish;

  // 이벤트 바인딩
  $btnSubmit.addEventListener('click', onSubmit);
  $btnSkip.addEventListener('click', () => onSubmit(true));
  $wrap.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      onSubmit();
    }
  });

  // 시작
  start();
}

// ── 시작 ──
async function start() {
  setBusy(true);
  try {
    const res = await apiStart();
    view = applyResponse(view, res);
    render();
  } catch (err) {
    showNetworkError(() => start());
  } finally {
    setBusy(false);
  }
}

// ── 제출 ──
async function onSubmit(skipped = false) {
  if (view.busy || !view.step) return;

  // formState 수집
  readFormState();

  // 건너뛰기
  if (skipped) {
    if (view.step.required) {
      // required 슬롯은 skip 불가 — validate가 막는다
      const v = validate(view.step, '');
      showInlineError(v.message);
      return;
    }
  } else {
    // 검증
    const value = collectValue(view.step, formState);
    const v = validate(view.step, value);
    if (!v.ok) {
      showInlineError(v.message);
      return;
    }
  }

  // 사용자 말풍선 추가
  if (!skipped) {
    const summary = summarizeForBubble(view.step, formState);
    addBubble(summary, 'user');
  } else {
    addBubble('(건너뜀)', 'user');
  }

  // 서버로 전송
  setBusy(true);
  try {
    const value = skipped ? null : collectValue(view.step, formState);
    const res = await apiReply({
      session_id: view.sessionId,
      slot: view.step.slot,
      value: value,
      skipped: skipped,
    });
    view = applyResponse(view, res);
    render();
  } catch (err) {
    showNetworkError(() => onSubmit(skipped));
  } finally {
    setBusy(false);
  }
}

// ── 렌더 ──
function render() {
  // 진행 표시 — 서버가 준 progress.total을 쓴다 (하드코딩 금지)
  if (view.progress) {
    const { current, total } = view.progress;
    $progressText.textContent = `${current} / ${total}`;
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    $progressFill.style.width = `${pct}%`;
  }

  // 메시지 렌더
  $messages.innerHTML = view.messages
    .map(m => `<div class="bubble bubble-${escapeHtml(m.role)}">${escapeHtml(m.text)}</div>`)
    .join('');

  // 스크롤 하단
  $messages.scrollTop = $messages.scrollHeight;

  // done → 확인 화면
  if (view.done) {
    renderDone();
    return;
  }

  // step 렌더
  if (view.step) {
    $stepArea.innerHTML = renderStep(view.step);
    // 건너뛰기 버튼: required:false일 때만
    $btnSkip.style.display = view.step.required ? 'none' : '';
    $btnSubmit.textContent = '보내기';
    $btnSubmit.disabled = false;
    bindStepEvents();
    // 첫 번째 입력에 포커스
    const first = $stepArea.querySelector('input, textarea');
    if (first) first.focus();
  } else {
    $stepArea.innerHTML = '';
    $btnSkip.style.display = 'none';
  }
}

// ── Done 화면 ──
function renderDone() {
  $btnSkip.style.display = 'none';
  $btnSubmit.textContent = '이대로 보내기';
  $btnSubmit.disabled = false;

  // intake 요약
  const intake = view.intake || {};
  let summaryHtml = '<div class="done-screen"><h2>상담 내용 확인</h2>';
  summaryHtml += '<dl class="confirm-body">';

  if (intake.brand) {
    summaryHtml += `<dt>가게 이름</dt><dd>${escapeHtml(intake.brand.name || '')}</dd>`;
    summaryHtml += `<dt>카테고리</dt><dd>${escapeHtml(intake.brand.category || '')}</dd>`;
    if (intake.brand.story) summaryHtml += `<dt>가게 이야기</dt><dd>${escapeHtml(intake.brand.story)}</dd>`;
  }
  if (intake.goal) {
    summaryHtml += `<dt>핵심 목표</dt><dd>${escapeHtml(intake.goal.primary_action || '')}</dd>`;
    if (intake.goal.current_pain) summaryHtml += `<dt>현재 문제</dt><dd>${escapeHtml(intake.goal.current_pain)}</dd>`;
    if (intake.goal.audience) summaryHtml += `<dt>주요 손님</dt><dd>${escapeHtml(intake.goal.audience)}</dd>`;
  }
  if (intake.products && intake.products.length) {
    summaryHtml += '<dt>상품</dt><dd>';
    summaryHtml += intake.products.map(p =>
      `${escapeHtml(p.name)}${p.price_krw != null ? ` (${p.price_krw.toLocaleString()}원)` : ''}`
    ).join(', ');
    summaryHtml += '</dd>';
  }
  if (intake.contact) {
    summaryHtml += `<dt>전화</dt><dd>${escapeHtml(intake.contact.phone || '')}</dd>`;
    if (intake.contact.address) summaryHtml += `<dt>주소</dt><dd>${escapeHtml(intake.contact.address)}</dd>`;
    if (intake.contact.hours) summaryHtml += `<dt>영업시간</dt><dd>${escapeHtml(intake.contact.hours)}</dd>`;
    if (intake.contact.instagram) summaryHtml += `<dt>인스타</dt><dd>${escapeHtml(intake.contact.instagram)}</dd>`;
  }

  summaryHtml += '</dl></div>';
  $stepArea.innerHTML = summaryHtml;

  // "이대로 보내기" → finish
  $btnSubmit.onclick = onFinish;
}

// ── Finish ──
async function onFinish() {
  setBusy(true);
  try {
    const res = await apiFinish({ session_id: view.sessionId, confirm: true });
    if (res.ok) {
      view.ref = res.ref;
      $stepArea.innerHTML = `
        <div class="done-screen">
          <h2>접수 완료!</h2>
          <p>상담 번호</p>
          <div class="ref-number">${escapeHtml(res.ref)}</div>
          <p>이 번호로 진행 상황을 확인하실 수 있습니다.</p>
        </div>`;
      $btnSubmit.style.display = 'none';
      $btnSkip.style.display = 'none';
      addBubble('감사합니다! 접수가 완료되었습니다.', 'sol');
    } else {
      showInlineError(res.message || '접수에 실패했습니다.');
    }
  } catch (err) {
    showNetworkError(() => onFinish());
  } finally {
    setBusy(false);
  }
}

// ── formState 수집 ──
function readFormState() {
  if (!view.step) return;
  const { kind } = view.step;

  switch (kind) {
    case 'text':
    case 'textarea': {
      const input = $stepArea.querySelector('.step-input');
      formState = { value: input ? input.value : '' };
      break;
    }
    case 'choice': {
      const checked = $stepArea.querySelector('input[name="step-choice"]:checked');
      formState = { value: checked ? checked.value : '' };
      break;
    }
    case 'multi': {
      const checked = $stepArea.querySelectorAll('input[name="step-multi"]:checked');
      formState = { value: Array.from(checked).map(c => c.value) };
      break;
    }
    case 'swatch': {
      const checked = $stepArea.querySelectorAll('input[name="step-swatch"]:checked');
      formState = { value: Array.from(checked).map(c => c.value) };
      break;
    }
    case 'products': {
      const rows = $stepArea.querySelectorAll('.product-row');
      formState = {
        rows: Array.from(rows).map(r => ({
          name: r.querySelector('.prod-name')?.value || '',
          desc: r.querySelector('.prod-desc')?.value || '',
          price: r.querySelector('.prod-price')?.value || '',
        })),
      };
      break;
    }
    case 'contact': {
      formState = {
        phone: $stepArea.querySelector('.contact-phone')?.value || '',
        address: $stepArea.querySelector('.contact-address')?.value || '',
        hours: $stepArea.querySelector('.contact-hours')?.value || '',
        instagram: $stepArea.querySelector('.contact-instagram')?.value || '',
      };
      break;
    }
    default:
      formState = {};
  }
}

// ── Step 이벤트 바인딩 ──
function bindStepEvents() {
  // products: 행 추가/삭제
  const btnAdd = $stepArea.querySelector('.btn-add-row');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      const tbody = $stepArea.querySelector('.products-body');
      const tr = document.createElement('tr');
      tr.className = 'product-row';
      tr.innerHTML = `
        <td><input type="text" class="prod-name" placeholder="예: 시그니처 라떼" /></td>
        <td><input type="text" class="prod-desc" placeholder="간단 설명" /></td>
        <td><input type="text" class="prod-price" placeholder="5,500" inputmode="numeric" /></td>
        <td><button type="button" class="btn-remove-row" aria-label="행 삭제">✕</button></td>`;
      tbody.appendChild(tr);
      tr.querySelector('.btn-remove-row').addEventListener('click', () => tr.remove());
      tr.querySelector('.prod-name').focus();
    });
  }

  // products: 기존 행 삭제 버튼
  $stepArea.querySelectorAll('.btn-remove-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.product-row');
      if (row) row.remove();
    });
  });
}

// ── 말풍선 추가 ──
function addBubble(text, role) {
  view.messages = [...(view.messages || []), { role, text }];
  const div = document.createElement('div');
  div.className = `bubble bubble-${escapeHtml(role)}`;
  div.textContent = text;
  $messages.appendChild(div);
  $messages.scrollTop = $messages.scrollHeight;
}

// ── 인라인 에러 ──
function showInlineError(msg) {
  // 기존 인라인 에러 제거
  const old = $stepArea.querySelector('.inline-error');
  if (old) old.remove();

  const div = document.createElement('div');
  div.className = 'inline-error';
  div.style.cssText = 'color:#c33;font-size:14px;margin-top:8px;padding:6px 0;';
  div.textContent = msg;
  $stepArea.appendChild(div);
}

// ── 네트워크 에러 ──
function showNetworkError(retryFn) {
  $stepArea.innerHTML = `
    <div style="text-align:center;padding:20px;">
      <p style="color:#c33;margin-bottom:12px;">인터넷 연결에 문제가 있습니다. 잠시 후 다시 시도해 주세요.</p>
      <button class="btn-retry" type="button">다시 시도</button>
    </div>`;
  $btnSubmit.disabled = true;
  $btnSkip.style.display = 'none';

  $stepArea.querySelector('.btn-retry').addEventListener('click', () => {
    $stepArea.innerHTML = '';
    retryFn();
  });
}

// ── 바쁨 상태 ──
function setBusy(b) {
  view.busy = b;
  $btnSubmit.disabled = b;
}

// ── 말풍선 요약 (사용자 답을 한 줄로) ──
function summarizeForBubble(step, fs) {
  if (!step) return '';
  const { kind } = step;
  switch (kind) {
    case 'text':
    case 'textarea':
      return fs.value || '(입력 없음)';
    case 'choice': {
      const opt = (step.options || []).find(o => o.value === fs.value);
      return opt ? opt.label : (fs.value || '(선택 없음)');
    }
    case 'multi':
    case 'swatch': {
      const labels = (fs.value || []).map(v => {
        const opt = (step.options || []).find(o => o.value === v);
        return opt ? opt.label : v;
      });
      return labels.join(', ') || '(선택 없음)';
    }
    case 'products':
      return (fs.rows || []).filter(r => r.name.trim()).map(r => r.name).join(', ') || '(상품 없음)';
    case 'contact':
      return fs.phone || '(연락처 없음)';
    default:
      return '(입력 완료)';
  }
}

// ── 기본 API (fetch) ──
async function defaultApiStart() {
  const r = await fetch('/api/consult/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  return r.json();
}
async function defaultApiReply(body) {
  const r = await fetch('/api/consult/reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
async function defaultApiFinish(body) {
  const r = await fetch('/api/consult/finish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
}
