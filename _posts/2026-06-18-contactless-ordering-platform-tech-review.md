---
title: "음식점 비대면 주문 플랫폼 기술 정밀 리뷰 — 단일 코드베이스 3앱, 3중 백엔드 어댑터, 실시간 주문"
description: "음식점 비대면 주문 플랫폼을 만들며 쓴 기술을 레이어별로 본다. React 단일 코드베이스 3앱, Mock/Supabase/Firebase 3중 어댑터(DIP), 실시간 주문 반영, 동시성 락, Capacitor APK, 그리고 AWS와 비교한 Supabase 후기까지."
date: 2026-06-18
categories: [Project]
tags: [React, TypeScript, Supabase, AWS, Capacitor, Architecture]
---

## 들어가며 — 손님·가게·관리자를 한 코드베이스로

음식점 비대면 주문 플랫폼을 만들고 있다. 손님이 테이블 QR을 찍어 주문하면 → 주방 KDS에 실시간으로 뜨고 → 홀/카운터에서 처리하고 → 관리자가 메뉴·매장·통계를 관리하는, 역할이 다른 **세 종류의 앱**이 한 시스템 안에서 맞물린다.

보통 이쯤 되면 앱을 세 개로 쪼개고 백엔드를 따로 두지만, 이 프로젝트는 의도적으로 **React 단일 코드베이스 + 교체 가능한 백엔드 어댑터**로 갔다. 이 글은 그 선택을 레이어별로 하나씩 정밀하게 뜯어보는 기술 리뷰다. (아직 배포 전이라 서비스 고유명사는 빼고 구조·기술 위주로 쓴다.)

순서는 ① 전체 스택 → ② 모노레포와 3앱 분리 → ③ 백엔드 3중 어댑터(핵심) → ④ 실시간 주문 → ⑤ 동시성·도메인 안전 → ⑥ 상태관리 → ⑦ Capacitor → ⑧ 인증/권한 → ⑨ 디자인 시스템 → ⑩ 테스트 → ⑪ AWS와 비교한 Supabase 후기다.

---

## 1. 전체 스택 한눈에

| 레이어 | 선택 |
|--------|------|
| 언어/번들 | TypeScript 5.5 · Vite 5 · pnpm workspaces |
| 프론트 | React 18 · React Router 6 · Framer Motion |
| 상태 | Zustand(전역) · TanStack Query(서버 상태) · Context(인증) |
| 디자인 | Tailwind CSS · shadcn/ui · CSS 토큰 |
| 데이터 | Supabase(Postgres + Realtime + Storage) |
| 인증/푸시 | Firebase Auth · FCM |
| 모바일 | Capacitor 6 (Android/iOS) + geolocation·push·app 플러그인 |
| 테스트 | Vitest + Testing Library · Playwright(3뷰포트 × 3앱) |

핵심은 마지막 두 줄이 아니라 **"데이터 계층을 통째로 갈아끼울 수 있게 추상화했다"**는 점이다. 그래서 같은 화면 코드가 Mock에서도, Supabase에서도 똑같이 돈다.

---

## 2. 모노레포와 3앱 분리

pnpm 워크스페이스 기반 모노레포다. 공유 패키지와 앱을 나눴다.

```text
packages/
  core/   도메인 모델 + Repository 인터페이스 + 상수(DDD의 도메인 계층)
  ui/     디자인 시스템(공유 컴포넌트 + CSS 토큰 + 애니메이션)
  api/    백엔드 어댑터 팩토리(Mock / Supabase / Firebase)
apps/
  customer/  손님: QR 진입 → 메뉴 → 장바구니 → 주문 → 현황
  store/     가게: /kitchen · /hall · /counter 모드
  admin/     관리자: 메뉴·매장·직원·통계
  operator/  운영자: 매장 생성/관리
```

3개 앱은 **각자 다른 포트**(5173/5174/5175)에서 뜨고, Vite alias로 공유 패키지를 끌어 쓴다.

```ts
// 각 앱 vite.config.ts
resolve: {
  alias: {
    "@app/core": "../../packages/core/src",
    "@app/ui":   "../../packages/ui/src",
    "@app/api":  "../../packages/api/src",
  },
}
```

앱마다 라우팅 성격이 다르다 — 손님은 탭 기반 선형 흐름(`/enter → /menu → /cart → /status`), 가게는 **모드 기반**(`/kitchen`·`/hall`·`/counter`)이라 같은 장비에서 역할을 전환한다. 공통점은 화면이 도메인 로직을 직접 모른다는 것 — 전부 `core`의 Repository 인터페이스에만 의존한다.

---

## 3. 백엔드 3중 어댑터 (핵심 설계)

이 프로젝트에서 가장 공들인 부분이다. **DIP(의존성 역전)**로 데이터 계층을 추상화해, Mock·Supabase를 환경 변수 하나로 갈아끼운다.

### 인터페이스는 도메인이 소유한다

`core`가 Repository 인터페이스를 정의하고, `api`가 구현을 제공한다. 화면은 인터페이스만 본다.

```ts
// packages/core — 도메인이 계약을 소유
export interface OrderRepository {
  getOrders(storeId: string): Promise<Order[]>;
  createOrder(order: Order): Promise<Order>;
  updateStatus(orderId: string, status: OrderStatus,
               storeId?: string, actor?: StaffRole | 'customer'): Promise<Order>;
  subscribeOrders(storeId: string, cb: (orders: Order[]) => void): Unsubscribe;
}

export interface Repositories {
  store: StoreRepository;  menu: MenuRepository;  order: OrderRepository;
  payment: PaymentRepository;  staff: StaffRepository;  /* … 12종 */
}
```

### 팩토리가 환경에 따라 구현을 고른다

```ts
// packages/api/factory.ts (요약)
export async function initLiveRepositories(mode: BackendMode): Promise<void> {
  if (_singleton) return;
  if (mode === "live") {
    const live = await loadLiveRepositories();   // ↓ 동적 import
    if (live) { _singleton = live; return; }
    console.warn("[api] live 토큰 미설정 — mock 폴백");
  }
  _singleton = createMockRepositories();         // 메모리 구현
}

async function loadLiveRepositories(): Promise<Repositories | null> {
  const [{ getSupabase }, { SupabaseOrderRepository, /* … */ }] = await Promise.all([
    import("./supabase/client.js"),
    import("./supabase/repositories.js"),         // Supabase는 별도 청크로 분리
  ]);
  const sb = getSupabase();
  if (!sb) return null;                           // 토큰 없으면 mock 폴백
  return { order: new SupabaseOrderRepository(sb), /* … */ };
}
```

여기 설계 포인트가 셋이다.

- **동적 import로 번들 분리.** Supabase 클라이언트는 `live` 경로에서만 `import()`한다. Mock 빌드엔 `@supabase/*`가 아예 안 들어가 초기 번들이 가볍다.
- **안전한 폴백.** `live`인데 토큰이 없으면 무한 대기 대신 Mock으로 떨어지고 경고를 남긴다.
- **실수 방지 가드.** `initLiveRepositories()`를 await하지 않고 `createRepositories('live')`를 부르면 즉시 throw한다 — 백색 화면 대신 명확한 에러로.

그래서 앱 부트스트랩은 "어댑터 초기화 → await → App 로드" 순서를 지킨다.

```ts
// apps/store/main.tsx (요약)
const mode = import.meta.env.VITE_BACKEND === "live" ? "live" : "mock";
await initLiveRepositories(mode);          // Supabase 클라이언트 준비
const { App } = await import("./App.js");  // 이제 createRepositories(live) 안전
ReactDOM.createRoot(el).render(<App />);
```

이 한 겹 덕분에 **테스트·개발은 Mock(메모리)으로 즉시**, 운영은 Supabase로 — 화면 코드는 한 줄도 안 바뀐다.

---

## 4. 실시간 주문 반영

손님이 주문하면 주방 KDS에 즉시 떠야 한다. Supabase Realtime의 `postgres_changes`로 구독한다.

```ts
// SupabaseOrderRepository.subscribeOrders (요약)
subscribeOrders(storeId: string, cb: (orders: Order[]) => void): Unsubscribe {
  this.getOrders(storeId).then(cb);                  // 1) 초기 스냅샷
  const ch = this.sb
    .channel(uniqueChannel(`orders:${storeId}`))     // 2) 채널명 고유화
    .on("postgres_changes",
        { event: "*", schema: "public", table: "orders",
          filter: `store_id=eq.${storeId}` },        // 3) 매장 단위 필터
        () => this.getOrders(storeId).then(cb))       // 4) 변경 → 재조회
    .subscribe();
  return () => this.sb.removeChannel(ch);
}
```

`uniqueChannel()`로 채널명에 시퀀스를 붙이는 건 실제로 부딪힌 버그 때문이다 — 같은 이름 채널을 두 구독자가 재사용하면 `cannot add postgres_changes callbacks after subscribe()`로 크래시한다. 채널을 매번 고유화해서 피했다.

Mock 모드에선 전 앱이 같은 메모리 싱글턴을 공유하므로, 손님앱 주문이 가게앱 KDS에 동기적으로 반영된다 — 실시간 흐름을 백엔드 없이도 그대로 테스트할 수 있다. React Query는 구독 콜백으로 캐시를 갱신해 화면에 흘린다.

```ts
useEffect(() => repos.order.subscribeOrders(storeId, (fresh) =>
  queryClient.setQueryData(["orders", storeId], fresh)), [storeId]);
```

---

## 5. 동시성·도메인 안전

가게에선 여러 직원이 같은 주문을 동시에 건드린다. 그래서 상태 변경에 두 겹의 방어를 넣었다.

**낙관적 락(TOCTOU 방지).** "읽고 → 판단하고 → 쓰는" 사이에 남이 바꾸면 마지막 쓰기가 이긴다. UPDATE의 WHERE에 "내가 본 그 상태일 때만"을 박아서 막는다.

```ts
const { data: rows } = await this.sb
  .from("orders")
  .update({ status, updated_at: nowIso() })
  .eq("id", orderId)
  .eq("status", currentOrder.status)   // ← 내가 본 상태와 같을 때만 성공
  .eq("store_id", storeId)             // ← 크로스-스토어 변경 차단
  .select();
if (!rows?.length)
  throw new Error("주문 상태가 이미 변경됐습니다. 새로 고침 후 다시 시도하세요.");
```

**상태머신 + actor 권한.** 상태 전이는 도메인 함수가 검증한다. "확정→취소"는 직원/매니저만, "접수→취소"는 손님도 가능 — 이런 규칙을 화면이 아니라 `core`의 `transitionOrder()`가 actor를 받아 판정한다. UI에 권한 로직이 새지 않는다.

여기에 모든 쓰기 쿼리에 `store_id` 필터를 강제해, 한 매장이 다른 매장 데이터를 못 건드리게 했다.

---

## 6. 상태관리 — 세 도구의 역할 분리

상태를 종류별로 다른 도구에 맡겼다.

- **TanStack Query** — 서버에서 온 것(주문·메뉴). 캐싱·재조회·구독 갱신.
- **Zustand** — 순수 클라이언트 상태. 대표적으로 장바구니. 옵션 조합으로 라인 key를 만들어 동일 항목을 합산한다.
- **Context** — 인증 세션. Firebase 복원 중엔 `restoring` 플래그로 로딩 화면을 띄운다.

장바구니 스토어는 개발 모드에서 `window.__cartStore`로 노출해, Playwright가 UI 클릭 없이 상태를 직접 세팅하고 검증할 수 있게 했다.

---

## 7. Capacitor — 웹 한 벌을 APK로

모바일은 별도 네이티브 앱이 아니라 **같은 웹을 Capacitor로 래핑**한다. Vite 빌드 산출물(`dist`)을 네이티브 쉘이 서빙한다.

```ts
const config: CapacitorConfig = {
  appId: "com.example.store",
  appName: "Store",
  webDir: "dist",
  server: { androidScheme: "https" },
};
```

플러그인은 역할에 맞게 — 손님앱은 `@capacitor/geolocation`(좌석/매장 위치), 가게·관리자앱은 `@capacitor/push-notifications`(FCM), 공통으로 `@capacitor/app`(라이프사이클). APK 빌드는 단순하다.

```bash
pnpm build && cap sync android && cd android && ./gradlew assembleDebug
```

---

## 8. 인증·권한

앱마다 인증 성격이 다르다.

- **손님** — 익명 게스트 세션(localStorage 토큰). 로그인 마찰 0.
- **가게/관리자/운영자** — Firebase Auth. custom claims로 `role`과 권한 매장 목록(`storeIds`)을 실어 보낸다.

인증도 어댑터다(`MockAuthAdapter` / `FirebaseAuthAdapter`). Mock은 시드 사용자로 자동 로그인해 화면·E2E가 인증 없이 돌고, **운영 환경에서 Mock이 켜지면 가드가 경고하며 세션을 잠근다** — 실수로 인증 우회가 배포되는 걸 막는 안전장치다.

---

## 9. 디자인 시스템

UI 라이브러리에 통째로 기대지 않고, **CSS 토큰 + Tailwind + shadcn/ui**를 조합했다. 색·타이포·간격·애니메이션 시간을 `tokens.css`의 CSS 변수로 정의하고, 컴포넌트는 그 변수만 참조한다. 전환·등장 애니메이션은 Framer Motion으로 공통 패키지(`ui`)에 모아 세 앱이 같은 모션을 공유한다.

흥미로운 디테일 하나: ESG(친환경) 절약 환산(종이 영수증 절감 → CO₂·물·비용)을 `core`의 상수 블록 한 곳에 격리했다. 그 블록만 고치면 전 화면 환산이 자동으로 따라온다 — "매직 넘버를 한 곳에 모은다"의 전형이다.

---

## 10. 테스트

- **Vitest + Testing Library** — 도메인·컴포넌트 단위. Mock 어댑터를 쓰고 `resetRepositories()`로 케이스마다 격리한다.
- **Playwright** — E2E를 **3뷰포트 × 3앱 = 9조합**으로 돌린다. 모바일·태블릿·데스크톱에서 손님/가게/관리자 흐름이 각각 깨지지 않는지 본다.

Mock이 단순한 개발 편의가 아니라 **테스트 전략의 축**이라는 점이 핵심이다. 어댑터를 추상화해 둔 덕에, 실제 Supabase 없이도 주문 생성→실시간 반영→상태 전이까지 전 경로를 메모리에서 재현해 검증한다.

---

## 11. 후기 — AWS를 직접 운영해 보고 쓴 Supabase

비슷한 시기에 만든 다른 프로젝트([B2B 입찰·계약 플랫폼]({% post_url 2026-06-18-b2b-bidding-platform-tech-stack %}))는 백엔드를 **AWS에 직접 올렸다** — NestJS + RDS(Postgres) + ElastiCache + ECS Fargate를 Terraform으로 깔고, 인증은 자체 JWT 회전, 배포는 GitHub Actions OIDC, 시크릿 로테이션까지 손으로 짰다. 반면 이 주문 플랫폼은 **Supabase**로 갔다. 둘 다 결국 Postgres를 쓰는데 체감은 꽤 달랐다. 양쪽을 다 굴려 본 입장에서 정리한다.

| 항목 | 직접 운영 AWS (B2B 플랫폼) | Supabase (이 프로젝트) |
|------|--------------------------|------------------------|
| 시작 속도 | VPC·RDS·ECS·Terraform 구성 (수일) | 프로젝트 생성 + 키 주입 (수분) |
| 실시간 | 직접 구축(REST polling / WebSocket) | `postgres_changes` 내장 |
| 인증 | 자체 JWT 회전·세션 직접 구현 | Auth 내장(+RLS) |
| 서버 연산·워커 | NestJS·BullMQ로 자유롭게 | Edge Functions로 제한적 |
| 운영 부담 | 높음 (IaC·키 로테이션·스케일·모니터링) | 낮음 (관리형) |
| 비용 | 인스턴스 기반, 과프로비저닝 위험 | 무료 티어 → 사용량 과금, 초기 저렴 |
| 제어·유연성 | 최고 (전 계층 통제) | 플랫폼이 정한 범위 안 |
| 벤더 락인 | 낮음 (표준 컴포넌트) | 있음 (어댑터로 완화) |

### Supabase가 확실히 좋았던 점

- **실시간이 그냥 딸려온다.** AWS 쪽에선 실시간 입찰을 위해 polling 주기·캐시·"언제 WebSocket으로 올릴지"를 직접 설계해야 했다. Supabase는 테이블에 `postgres_changes` 구독 한 줄이면 끝이라, KDS 실시간 반영을 만드는 비용이 사실상 0에 가까웠다. 이 프로젝트의 성격(주문이 실시간으로 흘러야 하는 CRUD)과 가장 잘 맞은 지점이다.
- **셋업이 압도적으로 빠르다.** AWS는 첫 배포까지 Terraform·네트워크·RDS·ECS를 깔며 며칠이 갔다. Supabase는 프로젝트 만들고 URL/키 두 개 꽂으면 Postgres + Storage + 실시간이 한 번에 선다.
- **운영 부담이 낮다.** RDS 비밀번호 로테이션, ECS 재배포, 키 관리 같은 걸 신경 쓸 필요가 없다. 1인 개발에서 이 차이는 크다.

### AWS가 나았던 점 (= Supabase의 한계)

- **무거운 서버 연산·백그라운드 작업.** B2B 플랫폼엔 가중 랭킹 배치, 입찰권 원장 트랜잭션, BullMQ 워커가 있었다. 이런 건 NestJS를 직접 굴리는 AWS 쪽이 압도적으로 자유롭다. Supabase의 Edge Functions로는 한계가 있다.
- **세밀한 제어.** 커넥션 풀, 캐시 계층, 토큰 회전 정책처럼 "내가 전부 쥐고 싶은" 부분은 직접 운영이 답이다.
- **정직한 단서 하나** — 이 프로젝트는 사실 **Supabase의 간판 기능(Auth/RLS)을 다 쓰진 않았다.** 인증은 Firebase Auth로 따로 갔고, 권한도 상당 부분 앱 레이어(어댑터 + `store_id` 필터)에서 처리했다. 실제로 크게 덕 본 건 **관리형 Postgres + Realtime + Storage**였다. 즉 "Supabase 풀스택"을 산 게 아니라 **필요한 부품만 골라 쓴** 셈이다.

### 그래서 결론

- **실시간 중심 CRUD + 빨리 띄워야 하는 서비스 → Supabase.** 이 주문 플랫폼처럼 "데이터가 실시간으로 흐르고, 서버에서 무거운 연산은 별로 없는" 경우 가성비가 최고다.
- **복잡한 도메인 연산·워커·세밀한 제어가 핵심 → 직접 운영 AWS.** 랭킹·원장·큐 같은 게 본질인 서비스는 BaaS로 옮기면 재구현 비용이 절감액을 넘어선다.
- **그리고 이 프로젝트가 데이터 계층을 어댑터로 추상화해 둔 게 결정적이었다.** Supabase로 시작했지만, 락인이 부담되거나 서버 연산이 커지면 `api` 패키지에 새 어댑터(직접 운영 백엔드)를 하나 더 붙이면 된다 — 화면은 그대로. BaaS를 고르되 BaaS에 갇히지 않는 길을 열어 둔 셈이다.

---

## 마무리 — 한 겹의 추상화가 만든 것

이 프로젝트의 기술적 성취를 셋으로 줄이면 이렇다.

1. **3중 어댑터(Mock/Supabase/Firebase)** — 환경 변수 하나로 데이터·인증 계층을 교체. 화면 코드는 불변. 동적 import로 번들까지 분리.
2. **실시간 주문** — Supabase Realtime + 채널 고유화로 손님 주문을 KDS에 즉시 반영하고, 낙관적 락·상태머신·크로스스토어 필터로 동시성을 안전하게.
3. **단일 코드베이스 3앱** — React Router 코드 스플리팅 + Capacitor로 웹과 APK를 한 벌에서 뽑고, 가게앱은 모드 전환으로 한 장비가 주방·홀·카운터를 겸한다.

관통하는 한 줄은 **"경계를 인터페이스로 끊어 두면, 그 너머는 언제든 갈아끼울 수 있다"**는 것이다. Mock이냐 Supabase냐, 웹이냐 APK냐를 나중에 정해도 되게 만든 한 겹의 추상화가, 개발 속도와 테스트 용이성을 동시에 가져다줬다.

*화면을 도메인 인터페이스에만 의존시키면 백엔드는 교체 가능한 부품이 된다 — 이 플랫폼에서 가장 크게 남은 교훈이다. (개발 진행 중)*
