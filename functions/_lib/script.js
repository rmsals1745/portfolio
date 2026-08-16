// functions/_lib/script.js — 대본 (14 슬롯). 순수 데이터+함수, CF 의존 0.

/**
 * @typedef {Object} Step
 * @property {string} slot
 * @property {'text'|'textarea'|'choice'|'multi'|'swatch'|'products'|'contact'} kind
 * @property {string} title
 * @property {string} hint
 * @property {boolean} required
 * @property {string} placeholder
 * @property {Array<{value:string,label:string,swatch?:string[]}>} [options]
 * @property {number} [min]
 * @property {number} [max]
 * @property {string} fallback_say
 */

/** goal.primary_action 선택지 6개 — 쉬운 한국어 라벨 */
export const PRIMARY_ACTION_OPTIONS = [
  { value: 'call',    label: '전화가 왔으면 좋겠다' },
  { value: 'reserve', label: '예약이 잡혔으면 좋겠다' },
  { value: 'visit',   label: '가게로 찾아왔으면 좋겠다' },
  { value: 'order',   label: '주문이 들어왔으면 좋겠다' },
  { value: 'inquiry', label: '문의가 왔으면 좋겠다' },
  { value: 'browse',  label: '뭘 파는지 훑어보게 하고 싶다' },
];

/** taste 스와치 6종 — CONTRACT.md 무드 키 정확히 일치, 색 3개 (bg·accent·text) */
export const TASTE_SWATCHES = [
  { value: 'warm_minimal', label: '따뜻하고 단정한',     swatch: ['#F6EFE7','#C88E5F','#2E2A26'] },
  { value: 'dark_mood',    label: '어둡고 고급스러운',   swatch: ['#1A1A2E','#E94560','#EAEAEA'] },
  { value: 'color_pop',    label: '밝고 경쾌한',         swatch: ['#FFF8F0','#FF6B6B','#2D2D2D'] },
  { value: 'fresh_green',  label: '싱그럽고 자연스러운',  swatch: ['#F0F7EE','#4CAF50','#1B3A1B'] },
  { value: 'clean_mono',   label: '무채색 담백한',       swatch: ['#F5F5F5','#9E9E9E','#212121'] },
  { value: 'retro',        label: '복고 느낌',           swatch: ['#FFF3E0','#E65100','#3E2723'] },
];

/** musts 선택지 — 한국어 라벨 */
export const MUSTS_OPTIONS = [
  { value: 'map',     label: '지도' },
  { value: 'phone',   label: '전화번호' },
  { value: 'hours',   label: '영업시간' },
  { value: 'menu',    label: '메뉴판' },
  { value: 'insta',   label: '인스타그램' },
  { value: 'reserve', label: '예약' },
  { value: 'review',  label: '후기' },
  { value: 'parking', label: '주차' },
];

/** 대본 14 슬롯 (REFERENCE-SOL-API.md §5 표) */
export const script = [
  {
    slot: 'brand.name',
    kind: 'text',
    title: '가게 이름이 뭔가요?',
    hint: '간판에 적힌 그대로 알려주시면 됩니다.',
    required: true,
    placeholder: '예: 서울분식',
    fallback_say: '가게 이름을 알려주세요.',
  },
  {
    slot: 'brand.category',
    kind: 'text',
    title: '무엇을 하는 가게인가요?',
    hint: '업종이나 주력 서비스를 알려주세요.',
    required: true,
    placeholder: '예: 분식집, 미용실, 카페',
    fallback_say: '어떤 가게인지 알려주세요.',
  },
  {
    slot: 'goal.primary_action',
    kind: 'choice',
    title: '홈페이지에 온 손님이 뭘 하면 좋겠어요?',
    hint: '하나만 골라주세요.',
    required: true,
    placeholder: '',
    options: PRIMARY_ACTION_OPTIONS,
    fallback_say: '손님이 홈페이지에서 뭘 하면 좋겠어요?',
  },
  {
    slot: 'goal.current_pain',
    kind: 'textarea',
    title: '지금 뭐가 안 되고 있나요?',
    hint: '플레이스나 인스타로 안 되는 것이 있다면 알려주세요.',
    required: false,
    placeholder: '예: 전화가 안 와요, 예약이 없어요',
    fallback_say: '지금 뭐가 안 되고 있는지 알려주세요.',
  },
  {
    slot: 'goal.why_now',
    kind: 'textarea',
    title: '왜 지금 홈페이지를 만드시나요?',
    hint: '계기가 있으시면 편하게 말씀해주세요.',
    required: false,
    placeholder: '예: 경쟁 가게가 생겨서, 곧 시즌이라',
    fallback_say: '왜 지금 만들려고 하시는지 알려주세요.',
  },
  {
    slot: 'goal.success_6m',
    kind: 'textarea',
    title: '6개월 뒤에 어떻게 되면 성공인가요?',
    hint: '숫자로 말씀해주시면 더 좋아요. 예: 문의 주 2건→5건',
    required: false,
    placeholder: '예: 예약이 한 달에 10건 이상',
    fallback_say: '6개월 뒤에 어떻게 되면 성공이라고 느끼실 것 같아요?',
  },
  {
    slot: 'goal.audience',
    kind: 'textarea',
    title: '주로 오는 손님이 누구인가요?',
    hint: '나이대, 동네 분, 직장인 등 편하게 말씀해주세요.',
    required: false,
    placeholder: '예: 30대 직장인, 동네 어르신',
    fallback_say: '주로 어떤 손님이 오시나요?',
  },
  // ⚠️ 이 둘은 원래 한 슬롯('brand.story+goal.never_guess')이었다.
  //    화면은 textarea 를 그려 문자열을 보내는데 엔진은 객체를 기대해 bad_value 로 막혔다
  //    (2026-08-16 실서버 완주에서 8번째 질문에서 멈춤). 슬롯을 쪼개서 kind 와 값 타입을 1:1 로 맞춘다.
  {
    slot: 'brand.story',
    kind: 'textarea',
    title: '가게 이야기를 들려주세요.',
    hint: '어떻게 시작하셨는지, 뭘 고집하시는지 편하게 적어 주세요.',
    required: false,
    placeholder: '예: 할머니 레시피로 시작했어요',
    fallback_say: '가게에 어떤 이야기가 있으신가요?',
  },
  {
    slot: 'goal.never_guess',
    kind: 'textarea',
    title: '손님이 봐서는 절대 모를 얘기가 있을까요?',
    hint: '말 안 하면 아무도 모르는 것 — 그게 홈페이지에 쓸 가장 좋은 재료입니다.',
    required: false,
    placeholder: '예: 남은 재료는 그날 다 버립니다',
    fallback_say: '손님이 모르실 만한 얘기가 있으신가요?',
  },
  {
    slot: 'products',
    kind: 'products',
    title: '대표 상품을 알려주세요.',
    hint: '이름, 설명, 가격을 적어주세요. 가격은 비워도 됩니다.',
    required: true,
    placeholder: '',
    fallback_say: '대표 상품을 알려주세요.',
  },
  {
    slot: 'photos',
    kind: 'choice',
    title: '상품 사진이 있으신가요?',
    hint: '없으면 저희가 만들어 드려요.',
    required: false,
    placeholder: '',
    options: [
      { value: 'have', label: '네, 있어요' },
      { value: 'none', label: '아니요, 없어요' },
    ],
    fallback_say: '사진이 있으신가요?',
  },
  // ⚠️ 'taste' 한 슬롯에 moods·avoid·reference 셋을 담았더니, 화면은 스와치 배열만 보내고
  //    **「피하고 싶은 느낌」 입력칸이 아예 그려지지 않았다.** 3사이클에서 어두운 안을 막아 준 게 그 항목이라
  //    잃으면 안 된다. 셋을 각자의 슬롯으로 쪼갠다.
  {
    slot: 'taste.moods',
    kind: 'swatch',
    title: '어떤 느낌이 마음에 드세요?',
    hint: '설명하기 어려우시면 눈에 드는 걸 고르시면 됩니다.',
    required: false,
    placeholder: '',
    options: TASTE_SWATCHES,
    min: 1,
    max: 3,
    fallback_say: '마음에 드는 느낌을 골라주세요.',
  },
  {
    slot: 'taste.avoid',
    kind: 'textarea',
    title: '반대로, 피하고 싶은 느낌이 있으신가요?',
    hint: '싫은 걸 알려주시면 그쪽 시안은 아예 안 만듭니다.',
    required: false,
    placeholder: '예: 너무 어둡거나 알록달록한 건 싫어요',
    fallback_say: '피하고 싶은 느낌이 있으신가요?',
  },
  {
    slot: 'taste.reference',
    kind: 'text',
    title: '마음에 드는 가게나 사이트가 있으세요?',
    hint: '인스타 계정이나 주소를 적어 주셔도 됩니다.',
    required: false,
    placeholder: '예: 인스타 @어느가게 처럼요',
    fallback_say: '참고할 만한 곳이 있으신가요?',
  },
  {
    slot: 'musts',
    kind: 'multi',
    title: '홈페이지에 반드시 들어가야 할 것이 있나요?',
    hint: '여러 개 골라도 됩니다.',
    required: false,
    placeholder: '',
    options: MUSTS_OPTIONS,
    fallback_say: '반드시 들어가야 할 것을 골라주세요.',
  },
  {
    slot: 'contact',
    kind: 'contact',
    title: '연락처 정보를 알려주세요.',
    hint: '전화번호, 주소, 영업시간, 인스타그램 주소.',
    required: true,
    placeholder: '',
    fallback_say: '연락처 정보를 알려주세요.',
  },
  {
    slot: 'care.wants',
    kind: 'choice',
    title: '홈페이지 만든 뒤 관리도 맡기실래요?',
    hint: '아니어도 괜찮아요.',
    required: false,
    placeholder: '',
    options: [
      { value: 'yes', label: '네, 맡기고 싶어요' },
      { value: 'no',  label: '아니요, 괜찮아요' },
    ],
    fallback_say: '만든 뒤 관리도 맡기실 건가요?',
  },
];

/** 슬롯 이름으로 Step 찾기 (디버그·테스트용) */
export function getStepBySlot(slot) {
  return script.find(s => s.slot === slot) ?? null;
}
