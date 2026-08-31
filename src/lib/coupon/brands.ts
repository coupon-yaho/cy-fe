/**
 * 브랜드 카탈로그.
 *
 * DB `brands` 테이블은 `id · name · category` 뿐이고 **색 컬럼이 없습니다**
 * (`storage/.../V1__init_schema.sql`). 색은 표시용이라 프론트가 듭니다 —
 * `/admin/brands` 가 붙어도 색은 여기 남습니다.
 *
 * 값의 출처는 `cy-be/docs/05-design-handoff.md` §3 "브랜드 고유색 12종" 입니다.
 *
 * **brandId 는 DB `brands.id` 와 같아야 합니다.** 회차 API 는 브랜드 이름을 안 내려주고
 * `brandId` 만 줍니다 — 이 표가 유일한 이름 출처라, id 가 어긋나면 화면에 남의 브랜드
 * 이름·색이 붙습니다. 실제로 11·12 가 뒤바뀌어 있어 "헬스클럽 브랜드데이" 회차에
 * 게임 브랜드의 보라색 플레이트가 찍혔습니다. 서버 기준은 11 게임패스 · 12 헬스클럽입니다.
 *
 * ── hue 와 ink 를 나눈 이유 ──
 * hue 는 브랜드가 정한 색 그대로입니다. 그런데 브랜드 플레이트는 이 색을 배경으로
 * 깔고 **흰 글씨 두 자(11~13px)** 를 얹습니다. 사양서 값을 그대로 쓰면 12종 중 5종이
 * WCAG AA(4.5:1)에 미달합니다 — 실측치는 아래 주석의 대비값입니다.
 *
 *   버거하우스 2.85 · 프레시마트 2.87 · 스포츠존 3.28 · 딜리버리고 2.19 · 트래블온 3.51
 *
 * 그래서 흰 글씨가 올라가는 면에는 4.6:1 을 넘을 때까지 명도를 낮춘 ink 를 씁니다.
 * 색을 바꾼 게 아니라 **같은 색의 어두운 단계**라 브랜드가 흐트러지지 않습니다.
 * 틴트·레일·캘린더 액센트처럼 글씨가 안 올라가는 곳에는 hue 를 그대로 씁니다.
 */

export interface Brand {
  brandId: number;
  name: string;
  /** 브랜드 플레이트에 찍히는 두 글자 */
  plate: string;
  category: string;
  /** 브랜드 고유색. 틴트·레일·액센트에 씁니다 */
  hue: string;
  /** 흰 글씨를 얹는 면에 쓰는 어두운 단계. 전부 4.6:1 이상 */
  ink: string;
}

export const BRANDS: Brand[] = [
  // 각 줄 끝 수치는 ink 와 흰색의 실측 대비입니다.
  { brandId: 1, name: "모카빈", plate: "모카", category: "카페", hue: "#8b5e3c", ink: "#8b5e3c" }, // 5.58:1
  {
    brandId: 2,
    name: "씨네플러스",
    plate: "씨네",
    category: "영화",
    hue: "#c0392b",
    ink: "#c0392b",
  }, // 5.44:1
  {
    brandId: 3,
    name: "버거하우스",
    plate: "버거",
    category: "외식",
    hue: "#e67e22",
    ink: "#af601a",
  }, // 4.67:1
  {
    brandId: 4,
    name: "프레시마트",
    plate: "프레",
    category: "마트",
    hue: "#27ae60",
    ink: "#1e8449",
  }, // 4.70:1
  { brandId: 5, name: "북스토리", plate: "북스", category: "서점", hue: "#2d6cb5", ink: "#2d6cb5" }, // 5.35:1
  {
    brandId: 6,
    name: "필름아레나",
    plate: "필름",
    category: "영화",
    hue: "#8e44ad",
    ink: "#8e44ad",
  }, // 5.87:1
  {
    brandId: 7,
    name: "스포츠존",
    plate: "스포",
    category: "스포츠",
    hue: "#16a085",
    ink: "#12836d",
  }, // 4.66:1
  { brandId: 8, name: "뷰티랩", plate: "뷰티", category: "뷰티", hue: "#d81b60", ink: "#d81b60" }, // 4.95:1
  {
    brandId: 9,
    name: "딜리버리고",
    plate: "딜리",
    category: "배달",
    hue: "#f39c12",
    ink: "#a0670c",
  }, // 4.72:1
  {
    brandId: 10,
    name: "트래블온",
    plate: "트래",
    category: "여행",
    hue: "#0097a7",
    ink: "#007f8c",
  }, // 4.76:1
  {
    brandId: 11,
    name: "게임패스",
    plate: "게임",
    category: "게임",
    hue: "#5b3fd6",
    ink: "#5b3fd6",
  }, // 6.72:1
  {
    brandId: 12,
    name: "헬스클럽",
    plate: "헬스",
    category: "피트니스",
    hue: "#455a64",
    ink: "#455a64",
  }, // 7.24:1
];

const FALLBACK: Brand = {
  brandId: 0,
  name: "제휴 브랜드",
  plate: "제휴",
  category: "기타",
  hue: "#6b7f96",
  ink: "#4a5b6d",
};

const BY_ID = new Map(BRANDS.map((b) => [b.brandId, b]));

export function brandOf(brandId: number): Brand {
  return BY_ID.get(brandId) ?? FALLBACK;
}
