/**
 * 브랜드 카탈로그.
 *
 * CY-1 에는 아직 브랜드 도메인이 없고 coupon_template.brand_id 만 있습니다.
 * 브랜드 이름·업종·색은 화면 표시용이라 프론트에 둡니다 —
 * /admin/brands 가 붙으면 이 파일을 그 응답으로 갈아 끼웁니다.
 */

export interface Brand {
  brandId: number;
  name: string;
  /** 브랜드 플레이트에 찍히는 두 글자 */
  plate: string;
  category: string;
  /** 방송 그래픽의 브랜드 띠 색 (oklch) */
  hue: string;
}

export const BRANDS: Brand[] = [
  { brandId: 1, name: "모카빈", plate: "모카", category: "카페", hue: "oklch(0.48 0.09 55)" },
  { brandId: 2, name: "씨네플러스", plate: "씨네", category: "영화", hue: "oklch(0.5 0.17 20)" },
  { brandId: 3, name: "버거하우스", plate: "버거", category: "외식", hue: "oklch(0.55 0.14 55)" },
  { brandId: 4, name: "프레시마트", plate: "프레", category: "마트", hue: "oklch(0.52 0.13 150)" },
  { brandId: 5, name: "북스토리", plate: "북스", category: "서점", hue: "oklch(0.45 0.12 250)" },
  { brandId: 6, name: "필름아레나", plate: "필름", category: "영화", hue: "oklch(0.47 0.16 300)" },
  { brandId: 7, name: "스포츠존", plate: "스포", category: "스포츠", hue: "oklch(0.5 0.11 190)" },
  { brandId: 8, name: "뷰티랩", plate: "뷰티", category: "뷰티", hue: "oklch(0.53 0.17 350)" },
  { brandId: 9, name: "딜리버리고", plate: "딜리", category: "배달", hue: "oklch(0.56 0.16 40)" },
  { brandId: 10, name: "트래블온", plate: "트래", category: "여행", hue: "oklch(0.5 0.13 225)" },
  {
    brandId: 11,
    name: "헬스클럽",
    plate: "헬스",
    category: "피트니스",
    hue: "oklch(0.46 0.11 145)",
  },
  {
    brandId: 12,
    name: "게임스테이션",
    plate: "게임",
    category: "게임",
    hue: "oklch(0.44 0.15 280)",
  },
];

const BY_ID = new Map(BRANDS.map((b) => [b.brandId, b]));

const UNKNOWN: Brand = {
  brandId: 0,
  name: "제휴 브랜드",
  plate: "브랜",
  category: "기타",
  hue: "oklch(0.45 0.03 258)",
};

export function brandOf(brandId: number): Brand {
  return BY_ID.get(brandId) ?? UNKNOWN;
}
