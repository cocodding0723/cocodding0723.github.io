---
title: "B2B 입찰 플랫폼 기술 총정리 — React·NestJS·AWS로 짜며 내린 결정들"
description: "B2B 입찰 플랫폼을 React·NestJS·AWS로 만들며 내린 기술 결정 총정리. 7요소 랭킹 알고리즘, React+Capacitor vs Native, Supabase·Firebase 대신 AWS를 고른 이유, Terraform까지."
date: 2026-06-18
categories: [Project]
tags: [React, NestJS, AWS, Terraform, Algorithm, Architecture]
---

## 들어가며 — 어떤 프로젝트인가

최근에 만든 건 **택배 화주(Shipper)와 택배사 대리점(Agency)을 매칭해 주는 B2B 입찰·계약 플랫폼**이다. 화주가 물량과 조건을 등록하면 여러 대리점이 단가를 써서 입찰하고, 화주가 실시간으로 비교한 뒤 전자계약을 체결한다. 한국 택배 시장은 연 37억 건이 넘는데도 계약은 여전히 아날로그였고, 그 사이에 투명한 가격 비교와 전자계약을 끼워 넣는 게 목표였다.

규모가 작지 않다. 웹과 모바일(iOS/Android)을 동시에 지원하고, 입찰은 실시간이며, 계약은 부인방지(non-repudiation)가 걸린 법적 문서다. 그래서 "그냥 CRUD 하나 더"로 끝나는 결정이 거의 없었다. 이 글은 이 플랫폼을 만들며 실제로 쓴 기술과, 갈림길마다 무엇을 왜 골랐는지를 한 번에 정리한 기록이다.

순서는 이렇다.

1. 전체 스택 한눈에
2. 서버 아키텍처 — NestJS 모듈·트랜잭션·멱등성
3. 알고리즘 — 7요소 가중 랭킹과 입찰권 원장
4. 실시간 입찰 — 왜 WebSocket이 아니라 REST polling 3초인가
5. 인증 — 끊기지 않는 refresh token 회전과 탈취 탐지
6. React + Capacitor vs React Native/Native
7. 프론트 — 상태관리·전자서명·디자인 시스템
8. 가장 고민한 결정 — Supabase + Firebase냐, 직접 운영하는 AWS냐
9. AWS 인프라와 Terraform
10. 무중단 키 로테이션을 어떻게 구성했나 (그리고 어디까지가 진짜 무중단인가)

---

## 1. 전체 스택 한눈에

먼저 큰 그림. 이 프로젝트는 npm workspaces 기반 모노레포다.

```text
deal-link/
├── apps/
│   ├── web/      React 18 + Vite (웹 + Capacitor로 모바일 래핑)
│   ├── api/      NestJS 10 + Prisma 5 (REST, 스케줄러, 큐)
│   └── mobile/   (Deprecated — RN/Expo에서 Capacitor로 전환)
├── packages/shared/   공통 타입 (OpenAPI → 타입 생성)
└── infra/terraform/   AWS IaC (dev / preview / prod)
```

| 레이어 | 선택 | 핵심 이유 |
|--------|------|-----------|
| 프론트 | React 18 + Vite 5 + React Router 6 | 빠른 빌드, 웹 코드 한 벌을 그대로 앱으로 |
| 서버 상태 | TanStack Query 5 | 캐싱·polling·invalidation을 선언적으로 |
| 클라 상태 | Zustand 5 | 인증/UI만 담는 가벼운 store |
| 모바일 | Capacitor 7 | 같은 웹을 네이티브 쉘로 래핑 |
| 백엔드 | NestJS 10 + TypeScript | DI·Guard·Interceptor 표준화, 프론트와 타입 공유 |
| ORM/DB | Prisma 5 + PostgreSQL 16 | 타입 안전, 마이그레이션, 트랜잭션 |
| 캐시/큐 | Redis + BullMQ | 세션·rate limit·비동기 작업 |
| 인증 | 자체 JWT + argon2 | access 15분 + refresh 30일 회전 |
| 인프라 | AWS ECS Fargate · RDS · ElastiCache · S3 · CloudFront | 직접 운영하는 클라우드 |
| IaC | Terraform + GitHub Actions OIDC | 환경 3개 분리, 키리스 배포 |
| 관찰성 | pino + CloudWatch + Sentry | 구조화 로그·에러 추적 |

이 표 한 줄 한 줄이 뒤에서 설명할 결정들이다.

---

## 2. 서버 아키텍처 — NestJS 모듈·트랜잭션·멱등성

서버는 **NestJS 10 + Prisma 5 + PostgreSQL 16**으로 짰다. 도메인을 모듈 단위로 쪼갰다.

```text
apps/api/src/modules/
├── auth/         JWT, OAuth(Google/Naver/Kakao), 비밀번호 해시
├── users/        가입·이메일 인증·비밀번호 재설정
├── shippers/     화주 프로필, 입찰 공고 생성
├── agencies/     대리점 프로필, 멤버(소장/점장/기사) 관리
├── tenders/      입찰 공고 (draft → open → closed → awarded)
├── bids/         대리점 입찰 응답 (upsert, 수정 무료)
├── contracts/    계약 + 양방 전자서명
├── ranking/      7요소 점수 계산, nightly cron
├── credits/      입찰권 원장(ledger)
├── notifications/ 인앱 + 푸시(FCM/APNs)
└── reviews/      계약 종료 후 평점
```

### 트랜잭션은 도메인 불변식의 경계로

가격이 오가는 플랫폼이라 "절반만 반영된 상태"가 가장 무섭다. 그래서 한 비즈니스 동작이 건드리는 여러 테이블을 Prisma `$transaction`으로 한 단위로 묶었다. 예를 들어 입찰 등록은 `bid.upsert` + `tender.lastBidAt` 갱신 + 입찰권 차감을 한 트랜잭션에서 처리한다.

```typescript
await this.prisma.$transaction(async (tx) => {
  const tender = await tx.tender.findUnique({ where: { id: tenderId } });
  if (tender.status !== 'open') throw new BadRequestException();

  // 같은 (tender, agency) 슬롯이면 update — 수정은 추가 차감 없음
  const existing = await tx.bid.findUnique({
    where: { tenderId_agencyId: { tenderId, agencyId } },
  });
  const bid = await tx.bid.upsert({ /* create | update */ });

  if (!existing) await credits.chargeBid(tx, { agencyId, bidId: bid.id });
  return bid;
});
```

원칙도 코드만큼 중요했다. **모든 금액은 정수(KRW)로만** 저장한다(float 금지). **계약·입찰 데이터는 절대 hard-delete 하지 않고** soft-delete + 감사 로그를 남긴다. 분쟁이 생기면 "그때 무슨 일이 있었나"를 복원할 수 있어야 하기 때문이다.

### 멱등성은 DB 제약으로 강제한다

재시도는 분산 시스템의 기본값이다. PG 결제 webhook은 같은 이벤트를 두 번 보내고, 사용자는 서명 버튼을 두 번 누른다. 이걸 애플리케이션 코드의 if문으로만 막으면 언젠가 샌다. 그래서 **유니크 제약으로 DB가 직접 막게** 했다(입찰권 원장은 4번에서 다시 다룬다).

```prisma
@@unique([kind, paymentId])         // 같은 결제로 두 번 충전 금지
@@unique([kind, bidId])             // 한 입찰당 차감 1회
@@unique([kind, refundOfLedgerId])  // 한 차감당 환불 1회
```

서명 같은 경우는 추가로 `Idempotency-Key` 헤더를 받는다. 인덱스도 "조회 패턴 우선"으로 깔았다 — 입찰 비교 핵심 쿼리에는 `@@index([tenderId, unitPriceKrw])`, 마감 임박 cron에는 `@@index([status, closesAt])` 같은 식이다.

---

## 3. 알고리즘 — 7요소 가중 랭킹과 입찰권 원장

### 대리점 랭킹: 7요소 가중 점수

화주가 대리점을 비교할 때 "어디가 잘하는 곳인가"를 한 숫자로 보여줘야 했다. 별점 평균만 쓰면 후기 10개짜리 신규 대리점이 만점으로 1등을 먹는다. 그래서 7개 요소를 정규화한 뒤 가중 합산하는 0~100점 공식을 설계했다.

```text
최종점수 = Σ(wᵢ × normalizedᵢ) × 100      (가중치 합 = 1.0)
```

| 서브스코어 | 가중치 | 무엇을 보나 | 정규화 |
|------------|:-----:|-------------|--------|
| price (가격경쟁력) | 0.30 | 최근 90일 단가의 지역 중앙값 대비 | 중앙값 근처일수록 높음 |
| rating (평점) | 0.20 | 베이지안 평균 (사전 m=10, c=4.0) | `(n·avg + m·c)/(n+m)` |
| response (반응속도) | 0.15 | 초청→제출 시간 중앙값 | `100·exp(−t/240)` |
| fulfillment (이행률) | 0.15 | 정상종료/연장 비율 | `good/total` |
| retention (재계약율) | 0.10 | 12개월 내 동일 화주 재계약 | 비율 |
| coverage (지역충실도) | 0.05 | 1차 지역 일치 정도 | 1차=100, 인접=60, 시도=30 |
| activity (최근활동) | 0.05 | 최근 30일 응답 입찰 수 | `log1p(n)/log1p(20)` |

핵심은 **rating을 단순 평균이 아니라 베이지안 평균**으로 둔 것이다. 후기가 적으면 사전평균(4.0) 쪽으로 끌어당겨서, 표본 1~2개로 만점을 받는 걸 막는다. 그리고 콜드스타트(신규 대리점)는 첫 30일 노출 보너스 5%를 줘서 "기회 자체가 없어 영원히 데이터가 안 쌓이는" 문제를 완화했다.

어뷰징 방지도 알고리즘의 일부다. 같은 화주→대리점 리뷰는 14일에 1회만, 사업자번호 연관 검사로 자기평가를 차단하고, P10 이하 + 마진 음수 추정 입찰가는 운영자 검토 플래그를 띄운다.

계산은 매일 새벽 nightly 배치(`@nestjs/schedule` cron)로 전 대리점을 재집계하고, 점수와 함께 서브스코어 JSON을 같이 저장해 대시보드에서 "왜 이 점수인지"를 보여준다.

### 입찰권: append-only 원장으로 정합성 보장

대리점이 입찰할 때마다 입찰권 1건이 차감된다(베타는 무료, GA는 건당 1,000원). 잔액을 컬럼 하나로 두고 `balance = balance - 1` 하는 방식은 동시성·재시도·환불에서 반드시 깨진다. 그래서 회계 시스템처럼 **모든 변동을 불변 원장(immutable ledger)에 한 줄씩 적고**, 잔액은 그 합으로 본다.

- `CreditLedger` — 모든 변동(purchase / spend / refund / grant…)을 부호 있는 정수로 기록. UPDATE/DELETE 없음.
- 멱등성은 2번에서 본 유니크 제약 3종으로 강제.
- 공고가 취소되면 해당 입찰들의 `spend`를 찾아 `refund_tender_canceled`로 자동 환불하되, `@@unique([kind, refundOfLedgerId])`로 이중 환불을 원천 차단.

이 구조 덕분에 베타(0원) → GA(유료) 전환도 코드 변경 없이 가격 정책 row 하나만 추가하면 됐다.

---

## 4. 실시간 입찰 — 왜 WebSocket이 아니라 REST polling 3초인가

"실시간 입찰 비교"라는 말을 들으면 반사적으로 WebSocket을 떠올린다. 여기서는 일부러 그러지 않았다. **TanStack Query의 3초 polling**으로 시작했다.

```typescript
export function useBids(tenderId, sort = 'price', { isOpen = false } = {}) {
  return useQuery({
    queryKey: ['bids', tenderId, sort],
    queryFn: () => api(`/tenders/${tenderId}/bids?sort=${sort}`),
    staleTime: 1_000,
    refetchInterval: isOpen ? 3_000 : false,   // open일 때만 3초마다
    refetchIntervalInBackground: false,         // 백그라운드 탭이면 정지
  });
}
```

판단 근거는 이랬다.

| 항목 | WebSocket | REST polling 3초 |
|------|-----------|------------------|
| 구현 | Socket.io + Redis adapter + 재연결·인증 핸드셰이크 | `refetchInterval: 3000` 한 줄 |
| 사용 패턴 적합성 | 장기 idle 연결에 강함 | 화주가 비교 화면을 켜는 건 분 단위 |
| 디버깅 | 연결 상태·재연결 추적 필요 | 그냥 HTTP 요청 |
| 비용 | 상시 연결 유지 | 인덱스 + 캐시로 흡수 |

화주가 입찰 비교 화면에 머무는 시간은 길어야 몇 분이다. WebSocket의 강점인 "수백 개의 오래 살아있는 연결"이 살지 않는 시나리오에서, 구현·운영 복잡도만 떠안는 셈이다. polling은 백그라운드 탭에서 자동으로 멈춰 배터리·네트워크도 아낀다.

대신 "언제 WebSocket으로 올릴지"를 미리 정의해 뒀다 — 동일 입찰을 5명 이상이 동시에 보거나, 평균 체류가 30분을 넘거나, polling만으로 DB 캐시 히트율이 90% 밑으로 떨어질 때. socket.io 의존성은 깔아만 두고 P2로 미뤘다. **"지금 필요 없는 복잡도는 트리거를 정해 미룬다"**가 이 프로젝트의 일관된 태도였다.

---

## 5. 인증 — 끊기지 않는 refresh token 회전과 탈취 탐지

인증은 자체 JWT로 구현했다. access 토큰은 15분, refresh 토큰은 30일짜리이며 **쓸 때마다 회전(rotation)** 한다. 사용자 입장에서 토큰은 한 번도 끊기지 않지만, 내부적으로는 계속 새 토큰으로 갈아끼워진다. 비밀번호는 argon2(Argon2id)로 해시한다.

회전의 핵심은 "한 번 쓴 refresh 토큰을 즉시 폐기하고, 폐기된 토큰이 다시 들어오면 탈취로 간주"하는 것이다. 실제 코드는 이렇다.

```typescript
async refresh(refreshToken: string, ip?, ua?): Promise<TokenPair> {
  const payload = await this.jwt.verifyAsync(refreshToken, {
    secret: env.JWT_REFRESH_SECRET, algorithms: ['HS256'],
  });

  const jtiHash = sha256(payload.jti);
  const session = await this.prisma.refreshSession.findUnique({ where: { jtiHash } });
  if (!session || session.userId !== payload.sub) throw new UnauthorizedException();
  if (session.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException();

  if (session.revokedAt) {
    // 이미 폐기된 토큰 재사용 → 탈취 의심. 이 유저의 살아있는 세션 전부 폐기.
    await this.prisma.refreshSession.updateMany({
      where: { userId: session.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new UnauthorizedException('session compromised — please sign in again');
  }

  // 새 페어 발급 + 이전 row 회전 마킹 (replacedByJtiHash로 체인 추적)
  const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
  const tokens = await this.signTokens(user.id, user.role, ip, ua);
  const newJtiHash = sha256(extractJti(tokens.refreshToken));
  await this.prisma.refreshSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date(), replacedByJtiHash: newJtiHash },
  });
  return tokens;
}
```

토큰 원문이 아니라 `jti`(토큰 ID)의 sha256만 DB에 저장하는 점이 포인트다. DB가 털려도 토큰 자체는 복원되지 않는다. 그리고 폐기된 jti가 재사용되면 — 공격자가 탈취한 옛 토큰으로 접근하는 시나리오 — **해당 유저의 모든 세션을 한꺼번에 끊는다.** 정상 사용자는 회전을 전혀 느끼지 못하지만, 토큰이 유출되는 순간 전 기기가 강제 로그아웃되는 것이다.

access 토큰 payload에는 `{ sub, role }`만 담고 email 같은 PII를 넣지 않았다. 웹에서는 access를 메모리에만 두고 refresh는 향후 httpOnly 쿠키로 옮겨 XSS 노출을 줄이는 방향으로 설계했다.

> 프론트의 `api` 클라이언트는 401을 받으면 자동으로 refresh를 1회 시도한 뒤 원 요청을 재시도한다. 그래서 토큰 만료가 사용자 경험으로 새어 나오지 않는다. 여러 탭을 켜둬도 storage 이벤트로 동기화해 한 탭에서 로그아웃하면 다른 탭도 정리된다.

---

## 6. React + Capacitor vs React Native/Native

모바일 앱 전략은 이 프로젝트에서 방향을 한 번 바꾼 부분이다. 처음엔 `apps/mobile`을 **React Native + Expo**로 잡았다가, 웹(React + Vite)이 충분히 성숙한 시점에 **Capacitor로 같은 웹을 래핑**하는 쪽으로 deprecate 했다.

이유는 단순하다. RN을 유지하면 웹과 앱, **두 코드베이스를 평행하게 끌고 가야** 한다 — 기능 추가도 두 번, 버그 수정도 두 번, 테스트도 두 배다. 웹 코드가 이미 모든 화면을 커버하는 상황에서 그 비용은 정당화되지 않았다.

| 기준 | Capacitor 래핑 | React Native | PWA |
|------|----------------|--------------|-----|
| 코드 재사용 | 현 React 웹 그대로 | 별도 RN 코드베이스 | 현 웹 그대로 |
| 스토어 등록 | App Store / Play 가능 | 가능 | iOS는 홈화면만 |
| 네이티브 성능 | 웹뷰 기반(대부분 충분) | 네이티브 렌더링(최상) | 웹뷰 |
| 네이티브 기능 | 플러그인(카메라/푸시/생체) | 가장 풍부 | 표준 웹 API 한도 |
| 유지비 | 중 (쉘 1개) | 높음 (코드 이중화) | 최저 |

정리하면 **Native(RN)는 코드 이중화 비용을, PWA는 스토어 입점 한계를 진다.** Capacitor는 그 사이에서 "웹 한 벌 유지 + 필요하면 스토어 입점"을 동시에 가져가는 절충안이다. B2B라 초기엔 스토어 입점이 필수가 아니어서, 단기 전략은 PWA로 앱 같은 경험을 주고 입점이 필요해지면 Capacitor로 같은 웹을 감싸는 것으로 잡았다.

Capacitor 설정은 이게 전부다. Vite 빌드 출력(`dist`)을 네이티브 쉘이 그대로 서빙한다.

```typescript
const config: CapacitorConfig = {
  appId: 'com.example.app',
  appName: 'MyApp',
  webDir: 'dist',
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};
```

다만 솔직히 적어두면, **Capacitor 전환에는 "묶음 비용"이 따라온다.** 두 가지가 컸다.

- **푸시 파이프라인 재배선.** RN 시절엔 Expo Push(`exp.host`)에 ticket→receipt 2단계로 얹혀 있었는데, Capacitor로 가면 이걸 FCM/APNs 직결로 다시 짜야 한다. 푸시 등록 훅은 네이티브 환경에서만 토큰을 받아 `/devices`에 등록하고 웹에서는 no-op으로 동작하게 분기했다.
- **Sign in with Apple.** 네이티브 앱이 다른 SNS 로그인(구글/카카오/네이버)을 제공하면 App Store 심사상 Apple 로그인이 사실상 의무다. 게다가 Apple은 정적 시크릿이 없고 ES256 서명 JWT를 client_secret으로 쓰며 ~6개월마다 만료된다 — 즉 **로그인 하나에도 키 로테이션 운영이 따라붙는다**(10번과 연결된다).

"웹뷰니까 다 똑같겠지"가 아니라, 스토어와 푸시라는 네이티브 경계에서 비용이 발생한다는 걸 미리 계상해 둔 게 전환 결정의 핵심이었다.

---

## 7. 프론트 — 상태관리·전자서명·디자인 시스템

### 상태관리: 서버 상태와 클라 상태를 분리

프론트 상태는 두 도구로 명확히 갈랐다.

- **서버에서 온 모든 것 → TanStack Query.** 입찰 목록, 계약, 대시보드 집계. 캐싱·polling·`invalidateQueries`를 선언적으로 처리한다.
- **순수 클라이언트 상태 → Zustand.** 인증 세션과 토스트/모달 정도. store 하나로 가볍게.

이 분리 덕분에 "서버 데이터를 useState에 복사했다가 동기화가 깨지는" 흔한 함정을 구조적으로 피했다. 계약 서명이 성공하면 화주·대리점 양쪽 계약 쿼리를 한 번에 invalidate 해서 화면이 알아서 최신화된다.

### 전자서명: canvas → PNG + 메타데이터

계약 서명은 법적 효력이 걸려 있어 단순 "동의 체크박스"로는 부족했다. canvas로 손글씨 서명을 받아 PNG base64로 인코딩하고, 여기에 부인방지용 메타데이터(해시·IP·디바이스·시각)를 함께 묶어 서버로 보낸다.

```typescript
const dataUrl = canvasRef.current.toDataURL('image/png');  // 손글씨 → PNG base64
await signMut.mutateAsync({
  signaturePngBase64: dataUrl,
  agreed: true,
  signerEmail, signerPhone,
  bizCertBase64,                 // 사업자등록증 이미지
});
```

서명은 화주·대리점 **양방 서명**이라, 한쪽이 서명하면 `waiting_agency` 단계로 넘어가 진행도를 보여준다. 터치와 마우스를 모두 받도록 이벤트를 분기했다.

### 디자인 시스템: oklch 컬러 + Pretendard

UI 라이브러리(MUI 등)나 CSS-in-JS 없이, CSS 변수 토큰 + 유틸 클래스로 직접 만들었다. 색은 hex가 아니라 **oklch**로 정의했다.

```css
:root {
  --dl-primary: oklch(55% 0.18 250);
  --dl-success: oklch(62% 0.15 155);
  --dl-danger:  oklch(60% 0.22 25);
  --dl-font: 'Pretendard Variable', Pretendard, system-ui, sans-serif;
}
```

oklch는 지각적으로 균일해서, 명도(L)만 조절하면 hover/soft/다크모드 변형이 자연스럽게 나온다. WCAG AA 색대비 맞추기도 hex보다 직관적이다. 폰트는 한글·영문 비율이 좋은 Pretendard(가변 폰트, OFL 라이선스)로 통일했다.

---

## 8. 가장 고민한 결정 — Supabase + Firebase냐, 직접 운영하는 AWS냐

이 프로젝트에서 제일 오래 붙잡고 있던 갈림길이 이거였다. **인증·DB·스토리지·푸시를 Supabase + Firebase 같은 관리형 BaaS에 통째로 맡길 것인가, 아니면 AWS에 직접 인프라를 올려 운영할 것인가.** BaaS는 분명 초기 호스팅비와 운영 부담이 낮다.

정직하게 옵션을 셋으로 나눠 비교했다.

| 옵션 | 엔지니어링 비용 | 호스팅 절감 | 리스크 |
|------|-----------------|-------------|--------|
| (a) 현 AWS right-sizing | 낮음 (인스턴스/NAT 조정) | 중~높음 | 낮음 (코드 변경 0) |
| (b) Supabase = Postgres만 | 중 (DATABASE_URL 재배선, pooler 함정) | 불확실 | 중 (RLS 안 쓰면서 벤더만 추가) |
| (c) Firebase + Supabase 전면 이전 | 매우 높음 | 수개월 내 회수 불가 | 높음 (금융·계약 로직 재작성) |

결론은 **AWS를 직접 운영하는 쪽**이었다. BaaS로 갈아엎는 게 가장 비싼 길이었기 때문이다. 이유는 추상적이지 않고 구체적이었다 — 다시 짜야 하는 것들이 하필 이 서비스의 핵심이었다.

- **랭킹 산정**(3번) — RLS로 옮길 수 없는 서버 연산이다. nightly 배치가 필요하다.
- **입찰권 원장의 멱등성·잔액 트랜잭션**(3번) — KRW 정수 불변식과 유니크 제약에 의존한다.
- **부인방지 양방 서명**(7번) — 복합 PK + 감사 로그 + hard-delete 금지 정책.
- **BullMQ 워커** — Firebase엔 직접 대응물이 없어 Cloud Tasks/Functions로 재설계해야 한다.
- **PII 화이트리스트** — 화주 PII가 대리점 응답에 새지 않도록 막는 정책을, RLS 컬럼 정책으로 한 줄도 빠짐없이 재표현해야 한다. 하나라도 누락되면 그게 곧 데이터 유출이다.

핵심은 **Supabase의 진짜 가치(Auth/RLS/Realtime)를 이 프로젝트가 거의 쓰지 않는다**는 점이었다. 인증·인가는 이미 앱이 전담하고 있다. 그러니 (b)는 RLS를 안 쓰면서 벤더만 하나 더 늘리는 구성이 되고, (c)는 호스팅비를 줄이려다 재구현 비용이 절감액을 압도하는 전형적 안티패턴이 된다.

그래서 "비용이 부담이면 BaaS로 이주"가 아니라 **"AWS를 유지하되 과프로비저닝을 걷어내는 right-sizing"**으로 방향을 잡았다 — NAT Gateway 통합, RDS/Redis 다운사이즈, 워커를 Fargate Spot으로, dev는 야간 스케일다운. 코드 변경 0, 롤백은 `terraform apply` 역방향. 같은 절감을 벤더 추가 없이 얻는 길이다.

> 한 가지 분명히 해두면, 여기서 "AWS"는 EC2에 직접 서버를 띄우는 방식이 아니라 **ECS Fargate(컨테이너)** 기반이다. 서버 인스턴스를 직접 관리하지 않으면서도, BaaS만큼 도메인 로직을 벤더에 가두지는 않는 중간 지점을 택한 셈이다.

---

## 9. AWS 인프라와 Terraform

인프라는 전부 **Terraform**으로 코드화했고, 환경을 `dev / preview / prod` 셋으로 분리했다.

```text
[클라이언트]  React 웹 · Capacitor 앱
     │
     ├─ 정적 자산 ─ CloudFront ─ S3 (웹 빌드)
     │
     └─ API 요청 ─ ALB(HTTPS/ACM) ─ ECS Fargate: NestJS API (오토스케일)
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                    RDS PostgreSQL   ElastiCache       S3
                    (Multi-AZ)       Redis(큐·캐시)    (계약 PDF·서명)
                                          │
                                   ECS Fargate: BullMQ 워커
                                   (랭킹 배치 · 알림 · PDF 생성)
────────────────────────────────────────────────────────────────
IaC: Terraform(dev/preview/prod)   ·   배포: GitHub Actions OIDC
```

서버 구조의 핵심은 **컴퓨트(API·워커)를 내가 직접 소유**한다는 점이다. NestJS API와 BullMQ 워커를 ECS에 띄우고, 그 아래 데이터(RDS)·캐시/큐(Redis)·스토리지(S3)를 직접 운영한다. 층이 두껍지만, 랭킹 배치나 입찰권 원장처럼 무거운 도메인 연산을 마음대로 굴릴 수 있다.

VPC는 3-tier(public / private-app / private-data) 서브넷으로 나누고, ECS 태스크 SG만 RDS·Redis 포트에 인바운드를 허용한다. 비용을 결정하는 변수(NAT 개수, RDS 인스턴스 클래스 등)는 전부 `terraform.tfvars`로 빼서 dev는 작게, prod는 Multi-AZ로 키운다.

### Terraform 구성

- **모듈 분리** — `network`, `ecs`, `dns-tls`, `iam-oidc`, `observability` 등을 모듈로 두고, 환경별 `envs/{env}/main.tf`가 변수만 바꿔 호출한다.
- **환경 분리는 workspace가 아니라 디렉토리로.** `envs/dev`·`envs/prod`를 물리적으로 나눠서, prod에 dev 값을 잘못 apply하는 실수를 구조적으로 막았다.
- **remote state는 S3 + DynamoDB lock.** `bootstrap/`이 state 버킷과 잠금 테이블을 1회 생성한다.

### CI/CD: GitHub Actions OIDC로 키리스 배포

영구 AWS 액세스 키를 리포지토리 시크릿에 넣는 건 피했다. 대신 **GitHub Actions OIDC**로 매 실행마다 단기 토큰을 교환해 IAM role을 assume 한다.

```yaml
permissions:
  id-token: write     # OIDC 토큰 발급
  contents: read
# ...
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
```

배포는 변경 경로 기반으로 필요한 것만 돌리고(`apps/api` 바뀌면 API만), **dev는 `terraform apply` 자동, prod는 `plan`만 돌리고 사람이 수동 승인**한다. ECS는 deployment circuit breaker로 실패 시 자동 롤백한다. 영구 키가 사라지니, 키 유출 시나리오 자체가 줄어든다 — 이게 다음 절의 키 로테이션과 같은 철학이다.

> **구조 비교:** 같은 류의 서비스를 직접 운영하는 대신 관리형 BaaS(Supabase/Firebase)로 풀면 이 그림이 얼마나 납작해지는지는 [비대면 주문 플랫폼 기술 리뷰]({% post_url 2026-06-18-contactless-ordering-platform-tech-review %})의 "서버 구조로 비교하면"에서 두 아키텍처를 나란히 놓고 다뤘다.

---

## 10. 무중단 키 로테이션을 어떻게 구성했나

"로테이션 키를 끊기지 않게 구성하는 법"은 이 프로젝트에서 가장 재미있었던 주제다. 한 문장으로 답하면 이렇다 — **"끊김 없음"에는 두 층위가 있고, 그 둘을 다르게 다뤄야 한다.**

### 층위 1: 토큰 회전은 진짜로 끊기지 않는다 (구현됨)

5번의 refresh token 회전이 정확히 이 패턴이다. 옛 토큰과 새 토큰이 회전 체인(`replacedByJtiHash`)으로 이어져 있고, 사용자는 갱신을 인지하지 못한 채 계속 새 토큰으로 갈아탄다. 이건 애플리케이션이 토큰 수명을 스스로 쥐고 있어서 가능한 **진짜 무중단**이다.

### 층위 2: 인프라 시크릿 로테이션 — 솔직하게 "거의 무중단"

DB 비밀번호 같은 인프라 시크릿은 다르다. 이 프로젝트는 RDS의 `manage_master_user_password = true`로 **마스터 비번을 7일마다 Secrets Manager가 자동 로테이션**하게 했다. 문제는, 이미 떠 있는 ECS 태스크들이 기동 시점의 비번을 메모리에 들고 있다는 점이다 — 로테이션이 끝나면 옛 비번으로 붙다가 연결이 깨진다.

그래서 **Secrets Manager 로테이션 완료 이벤트 → EventBridge → Lambda → ECS 강제 재배포** 파이프라인을 Terraform 모듈로 짰다.

```python
def handler(event, context):
    secret_arn = (event.get("resources") or [""])[0]
    # 감시 목록 밖 시크릿은 무시 (다른 로테이션에 오발동 방지)
    if WATCHED_ARNS and secret_arn not in WATCHED_ARNS:
        return
    boto3.client("ecs").update_service(
        cluster=ECS_CLUSTER, service=ECS_SERVICE,
        forceNewDeployment=True,     # 새 비번으로 태스크 새로 띄움
    )
```

```hcl
resource "aws_cloudwatch_event_rule" "rotation" {
  event_pattern = jsonencode({
    source      = ["aws.secretsmanager"]
    detail-type = ["Secret Manager Secret Rotation Successful"]
  })
}
```

여기서 정직해야 한다. 이 방식은 **완전한 zero-downtime이 아니다.** 모듈 주석에도 그렇게 적어놨다 — 로테이션 감지 후 새 태스크가 기동·헬스체크를 통과하기까지 약 2~3분이 걸린다. ECS의 롤링 배포(min 50% / max 200%)로 끊김을 최소화하지만 0은 아니다. "자동이고, 사람 개입 없고, 옛 비번으로 멈춰 있는 일은 없다"까지가 정확한 표현이다.

### 진짜 0초로 가려면

완전 무중단을 원한다면 방향은 둘이다.

- **데이터 레이어 — RDS Proxy.** 클라이언트와 RDS 사이에 Proxy를 두면, 로테이션 시 Proxy가 새 비번으로 재연결하는 동안 애플리케이션 연결은 유지된다. 이번엔 비용 때문에 일단 제외했지만, 트래픽이 커지면 1순위 후보다.
- **서명 키 레이어 — key ring + `kid` 헤더.** JWT 서명 시크릿을 바꾸면 발급된 토큰이 전부 무효화된다(전 사용자 강제 로그아웃). 이걸 피하려면 토큰 헤더에 `kid`(키 ID)를 넣고, **검증 측이 신·구 키를 함께 보관**해 한동안 둘 다 유효하게 둔다. grace period가 지나면 옛 키를 폐기한다. 이 "겹치는 유효기간(overlapping validity)" 패턴이야말로 키를 끊김 없이 교체하는 정석이다. 6번에서 언급한 Apple client_secret JWT의 6개월 로테이션도 같은 사고방식으로 풀린다.

정리하면, 끊김 없는 로테이션은 마법이 아니라 **"옛것과 새것이 겹치는 구간을 만들어 주는 것"**이다 — 토큰 회전 체인이든, key ring이든, connection proxy든. 토큰 층위는 그 정석대로 구현했고, 인프라 시크릿 층위는 "자동 재배포로 거의 무중단"까지 와 있으며, 완전 0초로 가는 길까지 설계해 둔 상태다.

---

## 마무리

이 플랫폼을 만들며 쓴 기술을 한 줄로 꿰면 이렇다.

- **서버**: NestJS + Prisma + PostgreSQL. 트랜잭션으로 불변식을 묶고, 멱등성은 DB 제약으로 강제.
- **알고리즘**: 7요소 가중 랭킹(베이지안 평점 + 콜드스타트 보정), append-only 입찰권 원장.
- **실시간**: WebSocket 대신 REST polling 3초 — 사용 패턴에 맞춰 복잡도를 미뤘다.
- **인증**: refresh token 회전 + 탈취 시 전 세션 폐기.
- **모바일**: React Native 이중화를 버리고 Capacitor로 웹 한 벌을 래핑.
- **인프라**: BaaS 대신 AWS ECS Fargate를 직접 운영하되 right-sizing으로 비용을 잡고, Terraform + OIDC로 코드화·키리스 배포.

관통하는 원칙은 두 개였다. **(1) 지금 필요 없는 복잡도는 트리거를 정해 미룬다**(WebSocket, RDS Proxy, 구조화 채팅 카드). **(2) 정합성과 보안은 if문이 아니라 구조로 강제한다**(DB 유니크 제약, 트랜잭션, 토큰 회전 체인, OIDC). 기술 선택은 결국 이 두 원칙을 도메인에 맞게 적용한 결과였다.

*화려한 기술을 고르는 게 아니라, 도메인의 불변식을 지키는 가장 단순한 구조를 고르는 일 — 이 프로젝트에서 배운 건 그거였다.*
