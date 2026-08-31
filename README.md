# Coupon FE

쿠폰 야~호 프론트엔드. TanStack Start + React 19 + Vite.

```bash
npm install
cp .env.example .env.local   # 값은 .env.example 의 주석 참고
npm run dev
```

> **Node 22 가 필요합니다.** 이 저장소는 Vite 8 이고 Vite 8 은 ESM 전용이라
> Node 20 에서는 개발 서버도 테스트도 안 돕니다. 호스트 Node 가 낮으면
> 컨테이너로 돌리십시오.
>
> ```bash
> docker run -d --name cyfe-dev \
>   -v "$PWD":/app -v cyfe_node_modules:/app/node_modules -w /app \
>   -p 127.0.0.1:5173:5173 --add-host host.docker.internal:host-gateway \
>   -e API_ORIGIN=http://host.docker.internal:8080 \
>   node:22-bookworm sh -c "npm run dev -- --host 0.0.0.0"
> ```

## 문서

| 문서 | 무엇 |
|---|---|
| [`docs/local-batch-setup.md`](docs/local-batch-setup.md) | **배치 검증 패널이 안 뜰 때** — 배치 서버 띄우기와 프록시·토큰 설정 |
| [`.env.example`](.env.example) | 환경변수마다 왜 필요한지 |

## 검사

```bash
npm test        # node:test — vite 로 .ts 를 읽습니다
npx tsc --noEmit
npx eslint src tests vite.config.ts
```
