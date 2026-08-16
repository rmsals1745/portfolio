// functions/_lib/store.js — KV 래퍼. KV 객체를 인자로 받는다.

/**
 * 세션 저장 (TTL 24시간)
 * @param {Object} kv — KVNamespace (주입)
 * @param {string} id
 * @param {Object} state
 */
export async function putSession(kv, id, state) {
  await kv.put(`sess:${id}`, JSON.stringify(state), { expirationTtl: 86400 });
}

/**
 * 세션 읽기
 * @param {Object} kv
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getSession(kv, id) {
  const raw = await kv.get(`sess:${id}`);
  return raw ? JSON.parse(raw) : null;
}

/**
 * 확정본 저장 (TTL 없음)
 * @param {Object} kv
 * @param {string} ref — JD-YYYYMMDD-<hex4>
 * @param {Object} intake
 */
export async function putIntake(kv, ref, intake) {
  await kv.put(`intake:${ref}`, JSON.stringify(intake));
}

/**
 * IP 당 시간당 카운터 (start 전용, 10회 제한)
 * @param {Object} kv
 * @param {string} ip
 * @returns {Promise<number>} 현재 카운트
 */
export async function bumpRate(kv, ip) {
  const key = `rate:${ip}`;
  const raw = await kv.get(key);
  const count = raw ? parseInt(raw, 10) + 1 : 1;
  await kv.put(key, String(count), { expirationTtl: 3600 });
  return count;
}
