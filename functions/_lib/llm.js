// functions/_lib/llm.js — LLM 호출. fetch 를 인자로 주입받는다.

/**
 * ⚠️ 이 프롬프트는 **말투만** 담당한다. 대화를 운전하게 두면 안 된다.
 *
 * 처음엔 "직전 답을 받아준 뒤 다음 질문으로 넘어갑니다" 였는데, 실측(2026-08-16)에서 셋 다 터졌다:
 *   ① 다음 질문을 **대신 답해버렸다** ("6개월 뒤에 …되면 성공이에요")
 *   ② 손님이 **건너뛴 질문의 내용을 지어냈다** ("사장님이 매일 아침 일찍 와서 직접…")
 *      — 상담지는 손님이 한 말을 받아적는 물건이라, 지어내면 존재 이유가 무너진다.
 *   ③ **가게 입장에서** 말했다 ("저희 매장에 따로 준비돼 있지 않아요")
 * 그래서 역할을 잘라냈다: 다음 질문은 화면이 `step.title` 로 이미 보여주므로
 * Sol 이 할 일은 **직전 답을 받아주는 한 문장**뿐이다.
 */
const SYSTEM_PROMPT = [
  '너는 동네 가게 사장님의 홈페이지 상담을 돕는 상담원이다.',
  '손님이 방금 한 답을 받아주는 **한 문장**만 쓴다. 40자 이내, 존댓말, 전문용어 금지.',
  '',
  '반드시 지킬 것:',
  '- **질문하지 않는다.** 다음 질문은 화면에 이미 떠 있다.',
  '- **손님이 하지 않은 말을 지어내지 않는다.** 가게 사정을 추측해서 덧붙이지 않는다.',
  '- **가게 주인 행세를 하지 않는다.** 너는 듣는 쪽이다.',
  '- 조언·평가·영업 멘트를 하지 않는다. 들었다는 표시만 한다.',
  '- 손님이 답을 건너뛰었으면 재촉하지 말고 짧게 넘어간다.',
  '',
  '좋은 예: "네, 골목 꽃집이시군요." / "전화가 오는 게 제일 중요하시군요." / "네, 적어두겠습니다."',
  '나쁜 예: "그럼 6개월 뒤 목표는 무엇인가요?"(질문함) / "매일 새벽 꽃시장에 가시는군요"(지어냄)',
].join('\n');

/** 한 문장이면 충분하다. 길면 잘리는 게 아니라 애초에 길지 않아야 한다. */
const MAX_RESPONSE_LENGTH = 90;
const TIMEOUT_MS = 5000;

/** 문장 중간에서 자르면 고장 난 것처럼 보인다. 마지막 문장 끝에서 자른다. */
function trimToSentence(text, limit) {
  if (text.length <= limit) return text;
  const head = text.slice(0, limit);
  const cut = Math.max(
    head.lastIndexOf('.'), head.lastIndexOf('!'), head.lastIndexOf('?'),
    head.lastIndexOf('요'), head.lastIndexOf('다'), head.lastIndexOf('죠'),
  );
  return cut > limit * 0.4 ? head.slice(0, cut + 1) : head;
}

/**
 * LLM 으로 say 문장 1개 생성. 실패 시 null.
 * @param {{ prev: Object|null, next: Object|null, answer: any }} params
 * @param {{ LLM_API_BASE?: string, LLM_API_KEY?: string, LLM_MODEL?: string }} env
 * @param {Function} [fetchImpl] — 주입 가능 fetch (기본: globalThis.fetch)
 * @returns {Promise<string|null>}
 */
export async function writeSay(params, env, fetchImpl) {
  const doFetch = fetchImpl || globalThis.fetch;

  // 키가 없으면 즉시 null
  if (!env.LLM_API_KEY || !env.LLM_API_BASE) {
    return null;
  }

  const { prev, next, answer, skipped } = params;

  // 건너뛴 답에는 **모델을 부르지 않는다.** 내용이 없는데 문장을 만들게 하면 지어낸다(실측).
  if (skipped) {
    return next ? '네, 넘어갈게요.' : '네, 여기까지 하겠습니다.';
  }

  // 유저 메시지 조립 — 다음 질문은 **맥락으로만** 주고, 되묻지 말라고 못박는다.
  let userMsg = '';
  if (prev) {
    userMsg += `[손님이 방금 답한 질문] ${prev.title}\n`;
  }
  if (answer !== undefined && answer !== null) {
    const ansStr = typeof answer === 'object' ? JSON.stringify(answer) : String(answer);
    userMsg += `[손님 답변] ${ansStr}\n`;
  }
  if (next) {
    userMsg += `[참고: 화면에 이미 떠 있는 다음 질문] ${next.title}\n`
      + '이 질문을 다시 묻지 말고, 위 답변을 받아주는 한 문장만 써라.';
  } else {
    userMsg += '[상담 종료] 짧게 감사 인사 한 문장만 써라.';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const base = env.LLM_API_BASE.replace(/\/+$/, '');
    const res = await doFetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.LLM_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
        max_tokens: 80,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // ⚠️ 이유를 통째로 삼키면 "왜 말투가 안 붙지"를 영원히 못 찾는다.
      //    키·토큰은 절대 찍지 않는다 — 상태 코드와 짧은 본문만 남긴다.
      let body = '';
      try { body = (await res.text()).slice(0, 200); } catch { body = '(본문 읽기 실패)'; }
      console.warn(`[sol/llm] HTTP ${res.status} ${body}`);
      return null;
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.warn('[sol/llm] 응답에 본문이 없다:', JSON.stringify(data).slice(0, 200));
      return null;
    }

    // 길이 상한 — 문장 끝에서 자른다(중간에서 자르면 고장 난 것처럼 보인다)
    return trimToSentence(text, MAX_RESPONSE_LENGTH);
  } catch (e) {
    // 실패해도 상담은 계속 굴러가야 하므로 null 을 돌려주되, 이유는 남긴다.
    console.warn(`[sol/llm] 호출 실패: ${e?.name || 'Error'} ${String(e?.message || '').slice(0, 160)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
