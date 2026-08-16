// functions/api/consult/reply.js — POST /api/consult/reply
import { script } from '../../_lib/script.js';
import { nextStep, applyAnswer, buildIntake } from '../../_lib/engine.js';
import { getSession, putSession } from '../../_lib/store.js';
import { writeSay } from '../../_lib/llm.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });

  if (!env.INTAKE) {
    return json({ ok: false, error: 'server_error', message: '서버 오류입니다.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_value', message: '요청 형식이 올바르지 않습니다.' });
  }

  const { session_id, slot, value, skipped } = body;
  if (!session_id) {
    return json({ ok: false, error: 'bad_value', message: 'session_id가 필요합니다.' });
  }

  // 세션 로드
  let state;
  try {
    state = await getSession(env.INTAKE, session_id);
  } catch {
    return json({ ok: false, error: 'server_error', message: '서버 오류입니다.' }, 500);
  }
  if (!state) {
    return json({ ok: false, error: 'bad_session', message: '세션을 찾을 수 없거나 만료되었습니다.' });
  }

  // 직전 Step (say 생성용)
  const prevStep = state.cursor < script.length ? script[state.cursor] : null;

  // 답변 적용
  const result = applyAnswer(state, script, { slot, value, skipped: skipped === true });
  if (result.error) {
    // slot_mismatch 시 최신 step 동봉
    const latestStep = nextStep(state, script).step;
    return json({
      ok: false,
      error: result.error,
      message: errorMessage(result.error),
      step: latestStep,
    });
  }

  const newState = result.state;

  // 다음 Step
  const { step: nextStepObj, done } = nextStep(newState, script);

  // say 생성 (LLM 실패 시 fallback_say)
  let say;
  try {
    say = await writeSay(
      { prev: prevStep, next: nextStepObj, answer: value, skipped: skipped === true },
      env,
    );
  } catch {
    say = null;
  }
  if (!say) {
    // fallback: say 는 **받아주는 말**이지 질문이 아니다. 슬롯의 fallback_say(질문 문구)를
    // 여기 쓰면 방금 답한 질문을 다시 묻는 꼴이 된다(2026-08-16 실측). 중립적인 한마디로 넘어간다.
    say = nextStepObj ? '네, 알겠습니다.' : '말씀 감사합니다.';
  }

  // 세션 저장
  try {
    await putSession(env.INTAKE, session_id, newState);
  } catch {
    return json({ ok: false, error: 'server_error', message: '서버 오류입니다.' }, 500);
  }

  // done 이면 intake 포함
  const response = {
    ok: true,
    session_id,
    say,
    step: done ? null : nextStepObj,
    progress: {
      current: done ? script.length : newState.cursor,
      total: script.length,
    },
    done,
  };

  if (done) {
    response.intake = buildIntake(newState, script);
  }

  return json(response);
}

function errorMessage(code) {
  switch (code) {
    case 'slot_mismatch':  return '질문 순서가 바뀌었습니다. 다시 시도해주세요.';
    case 'slot_required':  return '필수 항목입니다. 답변해주세요.';
    case 'bad_value':      return '입력 형식이 올바르지 않습니다.';
    case 'already_done':   return '이미 완료된 상담입니다.';
    default:               return '오류가 발생했습니다.';
  }
}
