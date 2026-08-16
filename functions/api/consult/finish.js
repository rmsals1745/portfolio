// functions/api/consult/finish.js — POST /api/consult/finish
import { script } from '../../_lib/script.js';
import { buildIntake } from '../../_lib/engine.js';
import { getSession, putIntake } from '../../_lib/store.js';
import { notifyOwner } from '../../_lib/notify.js';

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

  const { session_id, confirm } = body;
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

  // done:false 면 not_finished
  if (!state.done) {
    return json({ ok: false, error: 'not_finished', message: '상담이 아직 완료되지 않았습니다.' });
  }

  // ref = JD-YYYYMMDD-<hex4>
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const hex4 = crypto.randomUUID().replace(/-/g, '').slice(0, 4);
  const ref = `JD-${dateStr}-${hex4}`;

  // intake 생성
  const intake = buildIntake(state, script);

  // KV 저장 (TTL 없음)
  try {
    await putIntake(env.INTAKE, ref, intake);
  } catch {
    return json({ ok: false, error: 'server_error', message: '서버 오류입니다.' }, 500);
  }

  // 사장 알림 (실패해도 ok:true 반환)
  try {
    const result = await notifyOwner({ ref, intake }, env);
    if (!result.ok) {
      try {
        await env.INTAKE.put(`notify_fail:${ref}`, result.error || 'unknown');
      } catch {
        // KV 실패 무시
      }
    }
  } catch (e) {
    try {
      await env.INTAKE.put(`notify_fail:${ref}`, e.message || 'unknown_exception');
    } catch {
      // 무시
    }
  }

  return json({
    ok: true,
    ref,
    download: intake,
  });
}
