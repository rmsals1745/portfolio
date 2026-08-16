// functions/_lib/notify.js — 사장 알림 (텔레그램). fetch 를 인자로 주입받는다.

/**
 * 텔레그램 sendMessage 알림. 실패해도 에러를 던지지 않는다.
 * @param {Object} params — { ref, intake }
 * @param {{ TELEGRAM_BOT_TOKEN?: string, TELEGRAM_CHAT_ID?: string }} env
 * @param {Function} [fetchImpl]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function notifyOwner(params, env, fetchImpl) {
  const doFetch = fetchImpl || globalThis.fetch;

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return { ok: false, error: 'missing_telegram_config' };
  }

  const { ref, intake } = params;
  const goal = intake.goal || {};
  const brand = intake.brand || {};
  const contact = intake.contact || {};

  const text = [
    `[Sol 상담 완료] ${ref}`,
    `상호: ${brand.name || '-'}`,
    `업종: ${brand.category || '-'}`,
    `주행동: ${goal.primary_action || '-'}`,
    `전화: ${contact.phone || '-'}`,
  ].join('\n');

  try {
    const res = await doFetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `telegram_${res.status}: ${body.slice(0, 100)}` };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: `telegram_fetch_error: ${e.message || 'unknown'}` };
  }
}
