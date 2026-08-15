import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 분야 축 — 이 5개가 화면의 뼈대다.
 * 크론이 사례를 계속 밀어 넣어도 축은 늘지 않는다. 축이 늘면 화면이 방대해진다.
 * 새 사례는 반드시 이 중 하나에 속한다.
 */
export const CATEGORIES = [
  {
    id: 'agent-infra',
    label: '에이전트 인프라',
    en: 'Agent Infrastructure',
    blurb: '에이전트를 조직이 매일 그 위에서 일하게 만드는 층 — 오케스트레이션 엔진, 컨트롤 플레인, 내구성 워크플로.',
    accent: 'var(--accent)',
  },
  {
    id: 'product',
    label: '제품 · 커머스',
    en: 'Shipped Product',
    blurb: '결제까지 붙여 실제로 출시한 것. 토이가 아니라 돈을 받을 수 있는 형태로 끝낸 것들.',
    accent: 'var(--accent)',
  },
  {
    id: 'applied',
    label: '에이전트 응용',
    en: 'Applied Pipelines',
    blurb: '인프라를 실제 산출물로 바꾼 파이프라인 — 에이전트가 만들고, 다른 에이전트가 검수해 통과시킨 결과.',
    accent: 'var(--cool)',
  },
  {
    id: 'ops',
    label: '자동화 · 운영',
    en: 'Automation & Ops',
    blurb: '사람이 자리에 없어도 계속 도는 층 — 상시 런타임, 스케줄 분리, 환경 재현, 백업.',
    accent: 'var(--cool)',
  },
] as const;
// 생성 미디어(genai) 축은 2026-08-15 폐지.
// 사례가 1건뿐이라 층 그림에서 그 칸만 비어 보였고, 축 이름이 "미디어"라
// AI 인프라 엔지니어링이라는 초점을 흐렸다. 해당 사례는 성격상으로도
// 창작물이 아니라 파이프라인 부품이라 `applied` 로 옮겼다.

export type CategoryId = (typeof CATEGORIES)[number]['id'];

const categoryIds = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];

/** 사례 — 포트폴리오의 기본 단위. 목록에서는 카드 1장으로만 보인다. */
const cases = defineCollection({
  loader: glob({ base: './src/content/cases', pattern: '**/*.md' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      /** 카드에 보이는 한 줄. 목록에서 유일하게 읽히는 문장이므로 가장 공들여야 한다. */
      tagline: z.string(),
      category: z.enum(categoryIds),
      period: z.string(),
      role: z.string().optional(),
      status: z.enum(['live', 'active', 'archived']).default('active'),
      /** 카드 우상단 배지. 없으면 카테고리 라벨이 대신 뜬다. */
      badge: z.string().optional(),

      /** 카드에 박히는 숫자 — 정확히 3개까지만. 넘치면 카드가 표가 된다. */
      metrics: z
        .array(z.object({ value: z.string(), label: z.string() }))
        .max(3)
        .default([]),

      stack: z.array(z.string()).default([]),
      tags: z.array(z.string()).default([]),

      cover: image().optional(),
      coverAlt: z.string().optional(),

      /** 목록 정렬용. 클수록 앞. 크론이 갱신하는 유일한 숫자. */
      weight: z.number().default(0),
      /** 최상단 대표 3건. 카테고리와 무관하게 맨 앞에 선다. */
      featured: z.boolean().default(false),
      /** 초안(크론 생성 직후) 은 빌드에서 제외된다. 사장이 확인 후 false 로 내린다. */
      draft: z.boolean().default(false),

      /** 어디서 왔는지 — 크론이 채운다. 사람이 쓴 사례는 비어 있다. */
      source: z.string().optional(),
      updated: z.coerce.date().optional(),
    }),
});

/** 역량 주장 + 근거. 사례에서 역산한 것이라 사례보다 위에 놓인다. */
const capabilities = defineCollection({
  loader: glob({ base: './src/content/capabilities', pattern: '**/*.md' }),
  schema: z.object({
    claim: z.string(),
    why: z.string(),
    evidenceLabel: z.string(),
    evidence: z.string(),
    order: z.number().default(0),
  }),
});

export const collections = { cases, capabilities };
