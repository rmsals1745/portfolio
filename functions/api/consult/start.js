// functions/api/consult/start.js — POST /api/consult/start
import { script } from '../../_lib/script.js';
import { createState, nextStep } from '../../_lib/engine.js';
import { putSession, bumpRate } from '../../_lib/store.js';

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

  // 레이트 리밋: IP 당 시간당 10회
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  try {
    const count = await bumpRate(env.INTAKE, ip);
    if (count > 10) {
      return json({ ok: false, error: 'rate_limited', message: '잠시 후 다시 시도해주세요.' });
    }
  } catch {
    // KV 실패해도 진행
  }

  // 세션 생성
  const sessionId = 's_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  const state = createState(sessionId);

  try {
    await putSession(env.INTAKE, sessionId, state);
  } catch {
    return json({ ok: false, error: 'server_error', message: '서버 오류입니다.' }, 500);
  }

  const { step } = nextStep(state, script);

  return json({
    ok: true,
    session_id: sessionId,
    step,
    progress: { current: 1, total: script.length },
  });
}
