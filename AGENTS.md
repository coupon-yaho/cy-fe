<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

---

# 관제(D2) 화면 작업 규칙

이 레포의 프론트는 AI 세션으로 작업합니다. 그래서 사람이 암묵적으로 지키는 경계를
문서로 박아 둡니다. **아래 규칙은 취향이 아니라 리젝트 기준입니다.**

## 1. 타입 계약은 잠겨 있습니다

관제(D2, `/admin/system`) 화면의 타입 계약은 **CY-361 에서 AB-G0 기준선에 맞춰 한 번에
확정**했습니다. 다음 파일의 계약을 수정하는 PR 은 리젝트합니다.

| 파일 | 성격 |
| --- | --- |
| `src/lib/admin/types.ts` | 관제 계약 전체 |
| `src/lib/admin/mock.ts` | types.ts 의 짝. 한쪽만 바뀐 상태는 허용하지 않습니다 |
| `src/components/admin/state.tsx` | 상태 렌더 + G0-05 표시 규칙 강제 |
| `src/lib/admin/contract.ts` | API 시그니처 |

**왜 잠그는가.** 계약과 렌더를 같은 티켓에서 만지면, 값이 안 맞을 때 화면이 아니라
타입을 고쳐서 맞추는 일이 반드시 생깁니다. 사람이라면 "이상한데?" 하고 멈출 자리에서
AI 세션은 타입을 넓혀 컴파일을 통과시킵니다. 그러면 계약이 조용히 녹습니다.

**값이 안 맞으면 타입을 고치지 말고 멈추고 물어보십시오.**

### 확정된 계약

- **SourceState 7종** — `VALID · PENDING · WARMING_UP · STALE · NO_TRAFFIC · UNAVAILABLE · N_A`
  `WARMING_UP`(표본 미달, 곧 값이 나옴)과 `UNAVAILABLE`(원천 접근 불가)은 다른 사건입니다.
  하나로 합치면 둘 중 하나를 표현할 수단이 사라집니다.
- **GapValue** — 허용 상태 5종(`VALID · PENDING · STALE · UNAVAILABLE · N_A`).
  `SourceValue<number>` 의 별칭이 아니라 별도 타입입니다. `WARMING_UP · NO_TRAFFIC` 이
  타입으로 막혀야 하기 때문입니다.
- **overIssued** — gap 배열 **밖** 독립 필드이고 타입은 `GapValue` 입니다.
  gap 은 정확히 4종(`ACTIVE_DB_GAP · LUA_GAP · PERSIST_GAP · DB_COUNTER_GAP`)이고,
  배열에 다섯 번째를 넣으면 렌더 루프가 다섯 칸을 그립니다.
  `long` 이 아닌 이유는 미계산을 0 으로 만들지 않기 위해서입니다.
- **Severity** — `NONE · WARN · CRITICAL`, 합성은 `CRITICAL > WARN > NONE`.
  평가 가능한 gap 이 없으면 `null` 이고 **`NONE` 으로 치환하지 않습니다**
  ("문제 없음"과 "판단 불가"는 다릅니다). 값은 백엔드(A-05)가 계산해 내려줍니다 —
  화면이 gap 을 보고 다시 판정하면 규칙이 두 곳으로 갈립니다.
  `verdict`(정합성 판정)와 `severity`(운영 대응 우선순위)는 다른 축이라 한쪽에서
  파생시키지 않습니다.
- **UriGroup** — `ISSUE · ENTRY · QUEUE_POLL · LOOKUP · TRANSITION`.
  응답 시간대가 자릿수로 다르므로 한 선에 합치지 않습니다. 단, **이 항목만 AB-G0 근거가
  없는 B 단독 결정**입니다(G0 문서에 uri 언급 0건). 나머지와 같은 확정 계약으로 취급하지
  마십시오.

## 2. 표시 규칙은 컴포넌트가 강제합니다

빈칸과 0 을 구분하지 못하면 관제가 아닙니다. 아직 안 센 값을 0 으로 그리면 화면이
"정합성 통과"라고 거짓말을 하고, 발표 중이라면 그대로 합격이라 말하게 됩니다.

G0-05 표시 규칙 5개는 화면이 아니라 `src/components/admin/state.tsx` 가 강제합니다.

| 상태 | 규칙 |
| --- | --- |
| `PENDING` | 0 표시 금지 — 값이 있어도 대시 |
| `STALE` | 마지막 값은 참고값 — 값은 보이되 현재값 톤을 주지 않음 |
| `UNAVAILABLE` | 현재값처럼 표시 금지 — 값이 있어도 대시 |
| `N_A` | 0·정상 표시 금지 — 값이 있어도 대시 |
| `NO_TRAFFIC` | 장애색 금지 — 요청이 없는 것은 장애가 아님 |

화면마다 지키게 하면 반드시 한 곳이 빠지므로, 규칙은 `Value` · `StateBadge` 한 층에만
둡니다. 상태는 색만으로 전달하지 않습니다 — `StateGlyph` 의 모양과 라벨을 함께 씁니다.

## 3. 티켓 경계 — 남의 몫을 미리 그리지 마십시오

관제 화면은 **S-3a(완료) → S-3 → OBS-7 → OBS-9 → OBS-11 → OBS-12 → OBS-13 → OBS-16**
순서로 작업합니다. CY-361 은 타입 자리만 만들고 일부러 그리지 않았습니다.

| 아직 안 그린 것 | 주인 |
| --- | --- |
| `ConsistencyPanel.severity` 렌더 · phase 표시 위치 · 색 체계 개편 | OBS-16 |
| `LatencyPanel.success/.failure.groups` (uri 그룹별 13·14번 분리) | OBS-11 |
| 300점 롤링 차트(`components/admin/charts.tsx`) · 폴링 훅(`hooks/use-admin-polling.ts`) | S-3 본체 |

범위 밖 문제를 발견하면 **고치지 말고 PR 본문에 적어** 다음 티켓으로 넘기십시오.

## 4. 목과 타입은 항상 같이 바꿉니다

관제 API 는 백엔드 미구현입니다. `lib/admin/mock.ts`(목)와 `lib/admin/http.ts`(실서버)가
`lib/admin/contract.ts` 의 같은 인터페이스를 구현하고 `VITE_ADMIN_API=live` 로
갈아끼웁니다. **한쪽만 바뀐 상태는 허용하지 않습니다.**

목은 타이머가 아니라 시간 함수입니다 — BOOT 기준 85초 주기로 부하 국면(램프업 · 정상 ·
소진 · 영속화 수렴 · 유휴)이 반복되므로, 화면을 언제 열든 어느 국면엔가 걸립니다.
목을 고칠 때는 **새 타입을 충족시키는 목적만** 허용합니다. 화면 숫자를 예쁘게 만들려고
목을 바꾸지 마십시오. 새 상태는 최소 한 곳에서 실제로 관측돼야 후속 티켓이 렌더를
검증할 수 있습니다.

## 5. 검증

이 레포에는 테스트 셋업이 없습니다. **도입하지 마십시오.** 타입 체크가 유일한 검증
수단이므로, 아래 3개가 전부 통과해야 합니다.

```bash
npx tsc --noEmit    # bun 이 있으면 bunx tsc --noEmit
npm run lint        # 에러 0건 기준. 기존 react-refresh 경고 14건은 정상
npm run build
```

- 레포에 `bun.lock` 만 있지만 환경에 bun 이 없으면 `npm install` 로 대체합니다.
  이때 생기는 `package-lock.json` 은 **커밋 대상이 아닙니다**(`.gitignore` 에도 없으므로
  `git add .` 하지 말고 파일을 명시해서 add 하십시오).
- prettier 가 eslint 에 물려 있어 포맷 위반이 lint **에러**로 잡힙니다.
- dev 서버는 http://localhost:8081 입니다.

## 6. 근거 문서

| 문서 | 위치 |
| --- | --- |
| AB-G0 공동계약 기준선 (G0-01 ~ G0-13) | `~/Downloads/AB-G0-공동계약-기준선.html` |
| AB-B티켓 구현상세 (S-0 ~ OBS-23) | `~/Downloads/AB-B티켓-구현상세.html` |
| 관리자 구현가이드 상세설계도 | 레포 루트 `AB-관리자-구현가이드-상세설계도.html` |

B티켓 구현상세는 일반 HTML 파싱으로 69자만 나옵니다. 본문이 **267번째 줄의
`const T = [...]` JSON 배열** 안에 있어서 그 줄을 잘라 `JSON.parse` 해야 읽힙니다.

```js
const l = fs.readFileSync(path, "utf8").split("\n")[266];
const arr = JSON.parse(l.slice(l.indexOf("["), l.lastIndexOf("]") + 1));
// 항목: { key, title, phase, effort, before, after, why[], files[], steps[], traps[], verify[], done[] }
```

G0 인용 문구와 다른 값·이름을 쓰지 마십시오. 판단이 필요한 지점이 나오면 멈추고
물어보고, G0 근거 없이 내린 결정은 PR 본문에 전부 적으십시오.
