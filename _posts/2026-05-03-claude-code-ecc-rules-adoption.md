---
title: "Claude Code에 ECC 규칙셋을 얹다 - 공통 규칙 + 언어별 오버라이드 레이어로 에이전트 행동 통제하기"
description: "Claude Code의 행동을 일관되게 만들기 위해 ECC 규칙셋을 도입했다. common + 언어별 디렉터리로 레이어를 나눠 에이전트 오케스트레이션, 코드 스타일, 테스트, 보안, 훅까지 묶어둔 구조와 실제 적용 후기를 정리한다."
date: 2026-05-03
categories: [Dev]
tags: [AI, Blog]
---

## 왜 규칙셋이 필요한가

Claude Code를 본격적으로 쓰면서 거슬리는 지점이 하나 있었다. **세션마다 동일한 지시를 반복하고 있다**는 점이다. "함수는 50줄 이내로", "테스트 먼저 작성해라", "커밋 전에 보안 체크해라", "에이전트 병렬로 굴려라" 같은 말을 매번 다시 적었다. CLAUDE.md에 박아두면 프로젝트 단위로는 해결되지만, 새 프로젝트마다 같은 가이드를 복붙하는 순간 결국 표류한다.

그래서 전역 규칙으로 떼어내야 한다는 결론에 도달했고, 마침 ECC라는 규칙셋이 잘 정리되어 있어 이걸 그대로 가져다 깔았다. 이번 글은 ECC가 어떤 구조이고, 왜 이런 식으로 레이어를 나눴는지, 그리고 깔고 난 다음 실제로 어떤 변화가 있었는지를 정리한다.

---

## ECC의 디렉터리 구조

ECC는 두 층으로 되어 있다. **공통 규칙(common)** 과 **언어별 규칙**.

```
rules/
├── common/          # 언어 무관 — 항상 설치
│   ├── coding-style.md
│   ├── git-workflow.md
│   ├── testing.md
│   ├── performance.md
│   ├── patterns.md
│   ├── hooks.md
│   ├── agents.md
│   ├── security.md
│   ├── code-review.md
│   └── development-workflow.md
├── typescript/      # TS/JS 특화
├── python/
├── golang/
├── rust/
├── cpp/
├── csharp/
├── java/
├── kotlin/
├── swift/
├── php/
├── dart/
├── perl/
├── web/             # 프론트엔드 도메인 특화
└── zh/              # common의 중국어 번역
```

핵심은 **common이 universal default를 정의하고, 언어 디렉터리가 그 위에 얹혀서 구체적인 도구·관용·코드 예시를 더한다**는 점이다. 같은 `coding-style.md` 파일이 common과 언어 디렉터리에 동시에 있고, 언어 디렉터리의 내용이 우선한다. CSS specificity나 `.gitignore` 우선순위와 같은 발상이다.

설치 시 주의할 점은 디렉터리를 통째로 옮겨야 한다는 것. `cp -r rules/common ~/.claude/rules/common` 식으로. `rules/*`로 평면화하면 같은 이름 파일이 서로 덮어쓰면서 `../common/` 상대 경로 참조가 깨진다.

---

## common 레이어가 다루는 범위

10개 파일이 들어 있는데, 각각이 전혀 다른 축을 담당한다.

### coding-style.md

immutability, KISS / DRY / YAGNI, 파일 길이 제한(800줄), 함수 길이 제한(50줄), 깊은 중첩(4단계 이상) 금지, 매직 넘버 금지. 큰 그림은 "**작은 파일 여러 개 > 큰 파일 하나**". 도메인/기능 단위로 200~400줄짜리 모듈을 잘게 쪼개라는 신호다.

### testing.md

테스트 커버리지 80% 최소선, TDD RED→GREEN→REFACTOR 사이클, AAA(Arrange-Act-Assert) 패턴, 단위/통합/E2E 세 가지 모두 요구. 흥미로운 건 "**구현이 아니라 테스트가 잘못됐을 때만 테스트를 고쳐라**"라는 명시적 가드라는 점이다. 에이전트가 빨간 테스트를 보고 슬그머니 expected 값을 바꾸려는 흔한 실수를 차단한다.

### agents.md

ECC에서 가장 중요한 파일이라고 본다. 어떤 에이전트가 있고 언제 부르는지, 그리고 **즉시 호출(no user prompt needed)** 의 트리거를 정의해뒀다.

```markdown
1. 복잡한 기능 요청 → planner 에이전트
2. 코드를 막 작성/수정한 직후 → code-reviewer 에이전트
3. 버그 픽스 또는 신규 기능 → tdd-guide 에이전트
4. 아키텍처 결정 → architect 에이전트
```

여기에 더해 "**독립 작업은 무조건 병렬 Task 실행**"이라는 룰이 있다. 보안 분석/성능 리뷰/타입 체크가 서로 의존이 없으면 순차로 굴리지 말고 한 번에 띄우라는 뜻인데, 직렬로 흐를 때 체감되던 답답함이 확연히 줄었다.

### code-review.md

리뷰 트리거(코드 작성 직후, 공유 브랜치 커밋 전, 보안 민감 코드 변경 시, PR 머지 전)와 함께 **심각도 4단계**가 박혀 있다.

| 등급 | 의미 | 액션 |
|------|------|------|
| CRITICAL | 보안 취약점 / 데이터 손실 위험 | **BLOCK** — 머지 전 반드시 수정 |
| HIGH | 버그 / 중대한 품질 이슈 | **WARN** — 머지 전 수정 권장 |
| MEDIUM | 유지보수성 우려 | **INFO** — 가능하면 수정 |
| LOW | 스타일 / 사소한 제안 | **NOTE** — 선택 |

리뷰 결과가 단순한 텍스트 덩어리가 아니라 등급화된 액션 아이템으로 돌아온다. 머지 가능 여부를 기계적으로 판단할 수 있는 형태가 된다.

### security.md

커밋 전 강제 체크리스트가 박혀 있다.

- 하드코딩 시크릿(API 키, 비밀번호, 토큰) 금지
- 모든 사용자 입력 검증
- SQL 인젝션 방지(파라미터 바인딩)
- XSS 방지(HTML sanitize)
- CSRF 보호 활성화
- 인증/인가 검증
- 모든 엔드포인트에 rate limit
- 에러 메시지가 민감 정보 누출하지 않게

그리고 보안 이슈 발견 시의 **응급 프로토콜**이 따로 있다. STOP → security-reviewer 에이전트 → CRITICAL 먼저 → 노출된 시크릿 회전 → 코드베이스 전체에서 동일 패턴 검색. 사고 났을 때의 동선이 미리 적혀 있다는 게 핵심이다.

### development-workflow.md

여기에 박힌 0번 단계가 의외로 강력하다.

> **Research & Reuse** _(어떤 새 구현이든 시작 전 필수)_
>
> - **GitHub 코드 검색이 1순위:** `gh search repos`, `gh search code`로 기존 구현·템플릿·패턴 먼저 확인.
> - **라이브러리 docs가 2순위:** Context7나 벤더 1차 문서로 API 동작 검증.
> - **Exa는 1·2가 부족할 때만:** 더 넓은 웹 리서치/탐색이 필요할 때.
> - **패키지 레지스트리 확인:** npm, PyPI, crates.io에서 검증된 라이브러리부터 본다.
> - **80% 채우는 오픈소스 채택:** fork·port·wrap 가능한 구현이 있으면 새로 짜지 마라.

이 0번이 들어가면서 "**새로 짜기 전에 이미 누가 푼 적 있는지 먼저 본다**"가 기본 동선이 된다. 손으로 짜는 유틸 코드가 줄어들고, 라이브러리 채택 결정이 빨라진다.

### hooks.md, performance.md, patterns.md, git-workflow.md

각각 PostToolUse / PreToolUse / Stop 훅 사용법, 모델 선택 전략(Haiku vs Sonnet vs Opus), 레포지토리 패턴·API 응답 envelope 같은 재사용 가능한 디자인 패턴, 컨벤셔널 커밋 + PR 워크플로우를 다룬다. 이 네 파일은 "한 번 읽고 머릿속 어디에 박혀 있을 만한" 짧은 가이드 위주다.

---

## 언어 레이어가 더하는 것

언어 디렉터리는 common을 **확장**하지 **대체**하지 않는다. 같은 `coding-style.md`라도 언어별로 들어가는 내용이 다르다.

예를 들어 `web/coding-style.md`는 common의 immutability·작은 파일 원칙은 그대로 두고, 그 위에 다음을 더한다.

- 디렉터리를 **타입이 아니라 surface area로** 묶어라 (`components/hero/`, `components/scrolly-section/` 식)
- 디자인 토큰을 CSS 커스텀 프로퍼티로 일원화 (`--color-surface`, `--text-hero`, `--ease-out-expo`)
- 애니메이션은 컴포지터 친화 속성(`transform`, `opacity`, `clip-path`)만, layout-bound 속성(`width`, `top`, `margin`)은 금지
- 시맨틱 HTML 우선 — `<main>`, `<section aria-labelledby>` 위에 div 래퍼 stack 쌓지 말 것

`web/`은 더 나아가 `design-quality.md`라는 파일에서 **anti-template 정책**을 박아둔다. "기본 카드 그리드", "센터 헤드라인 + 그라디언트 블랍 + 일반 CTA로 된 stock 히어로", "라이브러리 디폴트 그대로 쓴 마감", "균일한 radius/spacing/shadow", "안전한 회색-on-흰색 + 액센트 한 가지"는 금지 목록에 들어가 있다. 대신 "**의미 있는 모든 프론트엔드 표면이 적어도 4개**의 quality(scale contrast로 만든 hierarchy, 의도된 spacing rhythm, overlap·shadow·motion으로 만든 depth, 진짜 페어링 전략을 가진 typography 등)를 가져야 한다"고 못 박는다.

이게 실제로 굴러가면 어떤가. "랜딩 페이지 만들어줘" 한 마디에 에이전트가 그냥 shadcn 디폴트 카드를 깔아놓는 일이 거의 없어진다. 스타일 방향(에디토리얼/네오 브루탈리즘/벤토/스크롤리텔링/스위스 등)을 먼저 고르고, 팔레트와 typography를 의도적으로 잡고, 레퍼런스를 모은 다음에야 코드로 들어간다.

`web/performance.md`는 Core Web Vitals 타깃(LCP < 2.5s, INP < 200ms, CLS < 0.1)과 번들 예산(랜딩 < 150KB gzipped JS, 앱 페이지 < 300KB)을 숫자로 박아둔다. 추상적인 "성능 신경써라"가 아니라, **실제로 측정 가능한 게이트**가 된다.

---

## 우선순위와 충돌 처리

언어 규칙과 공통 규칙이 충돌하면 **언어 규칙이 우선**한다. 예시 하나가 README에 박혀 있다.

> common/coding-style.md는 immutability를 디폴트 원칙으로 권한다. 언어별 golang/coding-style.md는 이걸 오버라이드할 수 있다:
>
> > 관용적인 Go는 struct mutation에 pointer receiver를 쓴다 — 일반 원칙은 common/coding-style.md를 보되, 여기서는 Go-관용적인 mutation을 선호한다.

언어 관용에 따라 immutability 원칙을 굽힐 수 있게 명시적인 출구가 있다는 게 깔끔하다. common 규칙 중에서 언어별로 오버라이드 가능성이 있는 항목은 다음과 같이 표시되어 있다.

> **Language note**: This rule may be overridden by language-specific rules for languages where this pattern is not idiomatic.

이 한 줄이 "공통 규칙이 절대명령이 아니라 디폴트"라는 톤을 잡아준다.

---

## Rules vs Skills

ECC는 두 가지 자산을 분리해서 관리한다.

- **Rules**: 광범위하게 적용되는 표준·관례·체크리스트 (예: "테스트 커버리지 80%", "하드코딩 시크릿 금지")
- **Skills**: 특정 작업에 대한 깊이 있는 실행 레퍼런스 (예: `python-patterns`, `golang-testing`)

> **Rules tell you *what* to do; skills tell you *how* to do it.**

이 분리가 의외로 효과가 크다. CLAUDE.md를 한 번이라도 부풀려 본 사람은 안다 — 한 파일에 표준과 실행 레시피를 다 욱여넣으면 둘 다 흐려진다. ECC는 표준을 짧게 유지하고, 실행 디테일은 skills로 빼낸다. 언어별 규칙 파일은 적절한 곳에서 해당 skill을 참조한다.

---

## 설치 후 변화 — 실제 체감

규칙을 깔고 며칠 굴려 봤을 때의 변화는 다음 네 가지다.

**1) 에이전트 호출 패턴이 바뀌었다.** 코드 수정 직후 자동으로 code-reviewer가 붙고, 새 기능 요청에는 planner가 먼저 도는 게 디폴트가 됐다. 명시적으로 "리뷰해줘"라고 안 적어도 흐름이 그쪽으로 흐른다.

**2) 병렬 Task 실행이 자연스러워졌다.** 보안 + 성능 + 타입 체크처럼 독립된 분석 작업을 한 번에 띄우는 게 디폴트가 됐다. 직렬로 굴리던 시절보다 체감 속도가 확연히 다르다.

**3) "이미 누가 풀었는지" 먼저 본다.** development-workflow.md의 0번 단계 덕분에 새 기능 작업이 들어왔을 때 GitHub 검색 → 라이브러리 docs → 패키지 레지스트리 → 그래도 없으면 직접 구현, 순서가 자리잡혔다. 손으로 짜는 보일러플레이트가 줄었다.

**4) 디자인 품질 가드가 작동한다.** 프론트엔드 작업에서 "기본 shadcn 디폴트 깔아놓기"가 거의 사라졌다. 스타일 방향을 먼저 정하고 들어간다.

---

## 다음에 할 것

언어 디렉터리에서 더 가져올 게 남았다. 지금은 common + web + csharp + python 정도만 깔아둔 상태인데, 새로 시작하려는 Rust 프로젝트가 있으면 `rules/rust/`도 같이 깔 예정이다. 또 ECC 자체에 없는 도메인(예: 게임 엔진, 모바일 네이티브)은 README의 "Adding a New Language" 가이드를 따라 자체 디렉터리를 만들어 추가할 수 있다.

규칙셋이 자리잡으면 그 다음은 **skills 디렉터리를 채우는 작업**이다. 표준은 잡았으니 이제 실행 레시피를 모을 차례다. 이건 별도 글로 정리하기로.

---

*규칙셋은 한 번 깔면 매 세션의 첫 200줄을 자동화해준다. CLAUDE.md를 매번 새로 쓰는 시간이 그대로 절약된다.*
