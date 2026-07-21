---
title: "요양시설 재활 플랫폼 개발 6주 — AI 코딩 도구에 안전 경계를 둔 방법"
description: "민감한 이용자 데이터를 다루는 재활 플랫폼에서 AI 코딩 도구가 지켜야 할 규칙을 문서, 자동 검사, 교차 암호화 테스트로 만든 6주간의 개발 기록."
date: 2026-05-28
categories: [Project]
tags: [AI, Flutter, Docker, React]
---

## 이 프로젝트에서 먼저 지켜야 했던 것

요양시설 입소자가 공용 태블릿으로 재활 운동을 진행하고, 담당자가 기록을 확인하는 플랫폼을 개발했다. 한 기기를 여러 사람이 사용하므로 다른 이용자의 세션이 섞이지 않아야 했고, 건강 관련 데이터가 로그나 AI 대화에 노출되지 않게 해야 했다.

이 글에서는 이런 민감한 건강 정보를 편의상 **PHI(Protected Health Information)**라고 부른다. 다만 특정 데이터가 법적으로 PHI에 해당하는지, 어떤 암호화와 보관 절차가 필요한지는 국가·계약·서비스 구조에 따라 달라진다. 아래 내용은 개발 과정 기록이지 의료·보안 규정 준수 인증이 아니다. 실제 서비스에는 별도의 법률·보안 검토가 필요하다.

앱은 Flutter, 서버 기능은 Firebase Cloud Functions로 만들었다. QR로 사용자를 구분하고, 앱과 Node.js 서버가 같은 방식으로 데이터를 암호화하고 복호화하는지 자동 테스트했다. AI 코딩 도구에는 코드 생성 전에 읽을 규칙과, 위험한 변경을 감지하는 검사를 함께 붙였다.

개발 인원은 1~2명이었고 Claude Code를 코드 작성과 검토에 사용했다. 핵심 질문은 "AI가 얼마나 많은 코드를 만들었나"가 아니라 **민감한 프로젝트에서 AI가 넘지 말아야 할 경계를 어떻게 기계적으로 확인했나**였다.

글의 흐름은 다음과 같다.

1. AI가 먼저 읽는 프로젝트 규칙
2. 파일을 수정할 때 실행되는 GateGuard 검사
3. Flutter와 Node.js 사이의 암호화 호환성 테스트
4. 자동화가 실제로 작동하는지 보는 대시보드와 작업 추적

기술 스택은 아래와 같다.

| 영역 | 스택 |
|------|------|
| 앱 | Flutter 3.x, Dart |
| 백엔드 | Firebase Cloud Functions, Firestore |
| 모니터링 | React 18 + TypeScript + Vite, Node.js, SQLite |
| 인프라 | Docker Compose, Nginx, Qdrant |
| 테스트 | Patrol (Flutter E2E), Playwright (React E2E) |
| 보안 | HKDF, AES-GCM, HMAC-SHA256 |
| AI | Claude Code (Haiku / Sonnet / Opus 혼용) |

---

## 프롬프트만으로 부족했던 이유

### Andrej Karpathy와 vibe coding

2025년 초 널리 알려진 "vibe coding" 논의는 자연어로 원하는 결과를 설명하고 AI가 만든 코드를 빠르게 실행해 보는 작업 방식을 보여 줬다. 내가 여기서 받아들인 장점은 아이디어를 코드로 옮기는 속도였다. 반대로 민감한 데이터를 다루는 프로젝트에서는 결과가 얼핏 동작한다는 이유만으로 넘어갈 수 없었다.

그가 말한 것 중 하나 — "언어가 가장 핫한 프로그래밍 언어가 된다" — 는 CLAUDE.md를 쓰기 시작한 직접적인 계기였다. 코드를 직접 짜는 것보다, 에이전트에게 뭘 만들지 정확하게 설명하는 능력이 더 중요한 스킬이 된 것이다.

그의 Software 2.0 개념도 영향을 줬다. 에이전트가 규칙을 학습하게 하는 것보다, 에이전트에게 명시적 규칙을 주입하는 것이 현재 단계에서 훨씬 실용적이라는 결론이 나왔다. 그게 CLAUDE.md와 GateGuard 훅 설계 방향의 출발점이다.

### everything-claude-code (ECC)

GitHub에 공개된 [everything-claude-code](https://github.com/everything-claude-code) 스킬셋이 하네스의 실질적인 출발점이었다. Claude Code에서 쓸 수 있는 pre-built 에이전트와 skill을 모아놓은 오픈소스 모음이다.

이 프로젝트에서 실제로 활용한 ECC 스킬들:

| 스킬 | 용도 |
|------|------|
| `code-reviewer` | PR 리뷰를 멀티 에이전트로 실행 |
| `security-reviewer` | 보안 취약점 자동 스캔 |
| `tdd-guide` | TDD 워크플로우 강제 |
| `flutter-review` | Flutter 코드 패턴 검토 |
| `build-error-resolver` | 빌드 실패 자동 분석 |
| `blog-writer`, `blog-reviewer`, `blog-publisher` | 이 포스트도 ECC로 작성됨 |

ECC를 그대로 쓰지 않았다. `flutter-review`는 DDD 레이어 경계 검사 로직을 추가했고, `security-reviewer`는 PHI 패턴 목록을 의료 도메인에 맞게 확장했다. 오픈소스를 fork해서 쓰는 게 아니라, 구조를 참조해 프로젝트 전용 에이전트를 새로 만드는 방식이었다.

### CLAUDE.md — AI 팀원 온보딩 문서

팀에 새 개발자가 합류하면 온보딩 문서를 준다. CLAUDE.md는 Claude Code 에이전트에게 주는 온보딩 문서다.

이 프로젝트의 CLAUDE.md에 들어간 것들:

- 프로젝트 아키텍처 (DDD 레이어 설명, 의존성 방향)
- 금지 패턴 목록 (presentation에서 domain 직접 참조 금지 등)
- PHI 데이터 처리 규칙 (어떤 필드가 암호화 대상인지, 래퍼 타입 목록)
- 커밋 컨벤션, 브랜치 전략
- "모르는 게 있으면 구현하지 말고 먼저 물어봐라"는 규칙

에이전트는 세션을 시작할 때마다 이 파일을 읽는다. 한 번 잘 써두면 에이전트가 매번 같은 실수를 반복하지 않는다. CLAUDE.md는 코드베이스의 일부이고, 팀의 결정사항이 담긴 살아있는 문서다. 에이전트가 실수할 때마다 새 규칙이 추가됐다.

---

## 프로젝트 규칙을 자동 검사로 바꾸기

Ultra Harness v1.0의 slash command는 6개였다. 실제 프로젝트에 붙이면서 23개로 늘었다. 추가된 것들이 어떤 문제를 해결하는지가 핵심이다.

### 커맨드 구조

```text
/bug-hunt        → bug-hunter 에이전트 + 재현 시나리오 자동 생성
/feature         → feature-spec-writer → flutter-specialist → qa-specialist
/sprint          → 스프린트 목표 로드 + 태스크 분해 + 담당 에이전트 배정
/pr-gate         → 코드 리뷰 + PHI 감지 + DDD 구조 검사 + flutter analyze
/codegen         → 도메인 레이어 기준 boilerplate 생성
/e2e-check       → Patrol 기반 Flutter E2E + Playwright 기반 대시보드 E2E 순차 실행
/maintenance     → 의존성 업데이트 + deprecated API 탐지 + 보안 취약점 스캔
```

`/pr-gate`가 가장 많이 쓰였다. PR을 올리기 전에 이 커맨드 하나로 PHI 하드코딩 여부, DDD 레이어 경계 침범, analyze 경고를 한 번에 체크한다. 이 커맨드가 없었다면 각 체크를 수동으로 돌리거나 빠뜨렸을 가능성이 높다.

### 모델 라우팅 전략 — Haiku / Sonnet / Opus 역할 분리

에이전트마다 쓰는 모델이 달랐다. 무조건 Opus를 쓰면 비용이 감당이 안 된다.

| 에이전트 | 모델 | 이유 |
|----------|------|------|
| codegen-agent | Haiku | boilerplate 생성, 패턴이 명확함 |
| flutter-specialist | Sonnet | 구현 작업, 맥락 이해 필요 |
| qa-agent | Sonnet | 테스트 케이스 설계, 엣지 케이스 발굴 |
| review-agent | Opus | 아키텍처 판단, 미묘한 레이어 경계 침범 탐지 |
| bug-hunter | Opus | 재현 시나리오 구성, 원인 추론 |

Haiku는 빠르고 저렴하다. 반복적이고 구조가 명확한 작업 — 도메인 엔티티 생성, boilerplate 스캐폴드 — 에는 Haiku면 충분하다. Opus는 느리고 비싸지만 판단이 필요한 작업에서 차이가 확실히 난다. 레이어 경계 침범은 코드가 맞아 보여도 아키텍처상 문제가 있는 케이스이기 때문에 Sonnet으로는 놓치는 경우가 있었다.

실제로 `/feature` 커맨드 한 번 실행에 Haiku 1회 + Sonnet 2회 + Opus 1회가 쓰인다. Opus만 썼을 때보다 비용이 60% 이상 줄었다.

### Claude Code Plan 모드 — 실행 전 설계를 분리하다

모델 라우팅과 함께 쓴 것이 Claude Code의 **Plan 모드**다. Claude Code에서 `/plan` 명령을 실행하면 에이전트가 실제 코드를 짜기 전에 설계 단계를 별도로 진행한다.

Plan 모드에서는 에이전트가 파일을 수정하지 않는다. 대신 "무엇을 어떤 순서로 만들 것인가"를 먼저 정리하고 사용자의 확인을 받는다. 확인이 되면 그때 실제 구현으로 넘어간다.

이 프로젝트에서는 Plan 모드에 Opus를 붙였다.

```bash
# Claude Code 설정에서 Plan 모드 모델 지정
# settings.json
{
  "planModel": "claude-opus-4-5",
  "model": "claude-sonnet-4-5"
}
```

이렇게 설정하면 `/plan`을 실행할 때는 Opus가 설계를 담당하고, 실제 구현 단계에서는 Sonnet이 코드를 짠다. Opus의 추론력을 설계에만 집중적으로 쓰고, 반복적인 구현 작업은 Sonnet에게 넘기는 방식이다.

실제 사용 흐름은 이렇다.

```text
개발자: /plan — PHI 암호화 레이어를 domain과 infrastructure 사이에 추가해줘

[Opus가 Plan 모드로 실행]
→ 현재 DDD 구조 파악
→ 암호화가 들어갈 레이어 결정 (infrastructure/services/phi_encryptor.dart)
→ 영향 받는 파일 목록 정리
→ 변경 순서 제안 (인터페이스 → 구현체 → 의존성 주입 → 테스트)

개발자: 승인

[Sonnet이 구현 시작]
→ 순서대로 파일 생성·수정
→ GateGuard가 각 Write 전 검증
```

Plan 모드를 쓰기 전에는 에이전트가 구현을 시작한 다음에 "이 방향이 맞나"를 되묻는 경우가 많았다. 이미 파일이 절반쯤 생성된 상태에서 방향을 바꾸면 롤백 비용이 생긴다. Plan 모드는 이 문제를 구조적으로 차단한다. **설계와 구현을 분리하면 수정 비용이 설계 단계에서 멈춘다.**

### 멀티 에이전트 파이프라인

`/feature` 커맨드를 기준으로 에이전트 흐름을 그리면 이렇다.

```text
codegen-agent (Haiku)
    → 도메인 모델 + repository interface 생성
    ↓
qa-agent (Sonnet) — 병렬 실행 가능
    → 해당 기능의 테스트 케이스 먼저 작성 (TDD)
    ↓
flutter-specialist (Sonnet)
    → qa-agent가 작성한 테스트를 통과하는 구현 작성
    ↓
review-agent (Opus)
    → DDD 레이어 침범 여부, PHI 노출 위험, 테스트 커버리지 검증
```

TDD 순서를 강제하는 부분이 처음엔 어색했다. 테스트를 먼저 쓰면 qa-agent가 구현을 아직 모르는 상태에서 테스트를 작성하기 때문에 인터페이스 설계가 먼저 명확해진다. 구현하다가 "이건 테스트하기 어렵게 생겼다"고 뒤늦게 깨닫는 일이 줄었다.

### git worktree — 에이전트 병렬 실행을 위한 환경 분리

멀티 에이전트 파이프라인에서 병목이 생기는 구간이 있다. `codegen-agent`가 도메인 모델을 만드는 동안 `qa-agent`가 같은 파일을 읽으려 하면 충돌이 생긴다. 에이전트들이 같은 working directory를 공유하면 파일 충돌과 git 상태 오염이 발생한다.

해결책은 `git worktree`다. 하나의 리포지토리에서 여러 브랜치를 동시에 체크아웃해 각각 독립된 디렉토리로 분리한다.

```bash
# feature/exercise-module 브랜치를 별도 worktree로 분리
git worktree add ../project.wt/exercise-module feature/exercise-module

# QR 인증 개발을 별도 worktree로 분리
git worktree add ../project.wt/qr-auth feature/qr-auth
```

이렇게 하면 `exercise-module` worktree에서 `flutter-specialist`가 구현을 짜는 동안, `qr-auth` worktree에서 `qa-agent`가 인증 테스트를 작성할 수 있다. 두 에이전트가 완전히 독립된 파일시스템 경로에서 동작하기 때문에 충돌이 없다.

실제 디렉토리 구조는 이렇게 됐다.

```text
../
├── project/               # main 브랜치 (리뷰, PR 병합용)
└── project.wt/
    ├── exercise-module/   ← flutter-specialist 실행 중
    ├── qr-auth/           ← qa-agent 실행 중
    └── dashboard/         ← 대시보드 에이전트 실행 중
```

Claude Code 인스턴스를 각 worktree 디렉토리에서 따로 실행한다. 각 인스턴스는 자신의 worktree만 보기 때문에 서로의 작업을 방해하지 않는다. 작업이 끝나면 PR을 올리고 main에 병합한 다음 worktree를 제거한다.

```bash
git worktree remove ../project.wt/exercise-module
```

이 방식으로 동시에 3~4개 기능을 병렬로 개발할 수 있었다. 에이전트가 한 기능의 코드를 짜는 동안 다른 에이전트가 다른 기능의 테스트를 작성한다. 순차 개발 대비 실질적인 처리량이 2배 이상으로 늘었다.

---

## AI가 안전 경계를 넘을 때 바로 알리기

### 왜 훅인가

에이전트에게 "PHI를 평문으로 저장하지 마"라고 system prompt나 CLAUDE.md에 써두면 알겠다고 한다. 하지만 결국 까먹는다. 정확히는, 에이전트가 모르는 게 아니라 그 규칙을 파일 쓰기 순간에 연결하지 못하는 경우가 생긴다.

훅은 다르다. 에이전트가 파일을 쓰기 직전에 OS 수준에서 실행되기 때문에 에이전트가 무시할 방법이 없다.

Claude Code의 훅은 두 종류다:

- `PreToolUse` — 도구 실행 전 (Write, Bash 등). 여기서 차단하면 에이전트의 작업이 실행되지 않는다.
- `PostToolUse` — 도구 실행 후. 검증, 로깅, 부수 작업에 쓴다.

GateGuard는 `PreToolUse`에 걸려 있다. Write 도구가 실행되기 직전에 `gate-guard.sh`가 돌고, `exit 2`를 반환하면 에이전트의 쓰기 작업이 차단된다. 에이전트는 차단 이유를 메시지로 받고, 다른 방법을 찾아야 한다.

이 구조가 중요한 이유: **에이전트는 자기가 실수를 하는지 모른다.** PHI 필드를 평문으로 쓰려고 할 때 에이전트는 "이게 문제"라는 것을 감지하지 못한다. 훅이 실행 전에 잡아야 한다.

### 훅 구현 (gate-guard.sh)

Ultra Harness에는 파일 길이를 보는 훅이 있었다. 이 프로젝트에서는 의료 데이터를 다루기 때문에 훅을 두 층으로 분리했다.

**PreToolUse Hook**

Write 도구가 파일을 쓰기 직전에 실행된다. 다음 세 가지를 순서대로 검사한다.

```bash
# 1. PHI 패턴 감지 (이름, 생년월일, 주민번호 등)
if echo "$content" | grep -E "(ssn|resident_number|birth_date_raw)" > /dev/null; then
  echo "[gate-guard] BLOCKED: raw PHI field detected. Use encrypted wrapper."
  exit 2
fi

# 2. DDD 레이어 경계 검사
# presentation → domain 직접 참조 금지 (infrastructure 경유 강제)
if echo "$file_path" | grep "presentation/" > /dev/null; then
  if echo "$content" | grep "domain/entities" > /dev/null; then
    echo "[gate-guard] WARN: presentation layer importing domain entities directly."
  fi
fi

# 3. 파일 길이 (800줄 초과 시 차단)
line_count=$(echo "$content" | wc -l)
if [ "$line_count" -gt 800 ]; then
  echo "[gate-guard] BLOCKED: $line_count lines. Split module before writing."
  exit 2
fi
```

**Pre-commit Hook**

커밋 직전에 `flutter analyze --fatal-infos`를 돌린다. analyze가 통과하지 않으면 커밋이 막힌다. 처음에는 귀찮을 것 같았는데, 실제로는 에이전트가 코드를 짜면서 analyze 결과를 즉각 확인하게 되는 구조가 자연스럽게 생겼다.

### 실제로 에이전트가 막힌 사례들

훅을 만들고 6주 동안 에이전트가 실제로 차단된 패턴들이다. 이 사례들이 쌓이면서 CLAUDE.md에 새 규칙이 추가됐다. 에이전트가 실수한 패턴이 곧 새 규칙의 원천이 됐다.

1. **Firestore 쿼리를 `domain/repositories/` 안에 직접 작성하려다 차단.** GateGuard가 infrastructure 레이어로 이동할 것을 요구했다. 에이전트는 "repository 인터페이스 파일에 구현체도 같이 쓰면 편하지 않나"는 식으로 접근했고, 훅이 막았다.

2. **`patient_name`을 `String`으로 선언하려다 PHI 감지에 걸림.** `EncryptedString` 래퍼 타입을 쓰도록 수정됐다. 이 사례 이후 CLAUDE.md에 "PHI 필드는 반드시 `EncryptedString`, `EncryptedDate` 래퍼를 사용한다"는 항목이 추가됐다.

3. **900줄짜리 BLoC 파일을 한 번에 쓰려다 차단.** 에이전트는 파일 하나에 모든 상태 처리를 몰아 넣으려 했다. 훅이 막고, 3개 파일(event, state, bloc)로 분리된 구조로 다시 작성됐다.

4. **`presentation/pages/`에서 `domain/entities/Patient`를 직접 import하려다 경고.** ViewModel을 거치도록 수정됐다. 이건 차단이 아니라 경고였는데, 에이전트가 경고를 받고 스스로 수정했다.

훅을 만들면서 발견한 패턴 하나: **차단보다 조기 경고가 더 효과적이다.** PHI 패턴이 파일 하나에 들어가기 시작할 때 신호를 주는 것과, 이미 50줄이 들어간 다음에 차단하는 것은 수정 비용이 전혀 다르다. 훅이 일찍 신호를 줄수록 에이전트의 수정 방향도 덜 흔들린다.

---

## 앱에서 암호화한 값을 서버가 풀 수 있는지 확인하기

환자 식별 정보를 저장할 때 클라이언트(Flutter)와 서버(Cloud Functions/Node.js)가 동일한 암호화 결과를 내야 한다. 키 파생은 HKDF, 암호화는 AES-GCM을 썼다.

### Node.js 쪽 (Cloud Functions)

```javascript
const { hkdf, createCipheriv, randomBytes } = require('crypto');
const { promisify } = require('util');

const hkdfAsync = promisify(hkdf);

async function deriveKey(masterKey, salt) {
  const derived = await hkdfAsync(
    'sha256', masterKey, salt,
    Buffer.from('phi-encryption-v1'), 32
  );
  return Buffer.from(derived);
}

async function encryptPHI(plaintext, masterKey) {
  const salt = randomBytes(16);
  const iv   = randomBytes(12);
  const key  = await deriveKey(masterKey, salt);

  const cipher    = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag       = cipher.getAuthTag();

  // salt(16) + iv(12) + tag(16) + ciphertext 순서로 패킹 — Flutter와 동일 순서
  return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
}
```

### Flutter 쪽 (pointycastle 패키지)

```dart
import 'package:pointycastle/export.dart';

Uint8List deriveKey(Uint8List masterKey, Uint8List salt) {
  final hkdf = HKDFKeyDerivator(HMac(SHA256Digest(), 64));
  hkdf.init(HkdfParameters(
    masterKey, 32, salt,
    Uint8List.fromList(utf8.encode('phi-encryption-v1')),
  ));
  final output = Uint8List(32);
  hkdf.deriveKey(null, 0, output, 0);
  return output;
}
```

가장 오래 걸린 부분은 **info 파라미터 인코딩**이었다. Node.js의 `Buffer.from('phi-encryption-v1')`과 Flutter의 `utf8.encode('phi-encryption-v1')`이 같은 바이트 배열을 생성한다는 것을 테스트로 확인하기 전까지 복호화 실패가 계속 났다. 양쪽에서 같은 plaintext를 암호화한 결과를 교차 복호화하는 단위 테스트를 만들고 나서야 호환성이 검증됐다.

환경별 키 분리는 Firebase Remote Config와 Cloud Secret Manager를 조합했다. 개발/스테이징/프로덕션이 서로 다른 마스터 키를 쓰기 때문에 어느 환경의 암호화 데이터가 다른 환경에서 열리지 않는다.

---

## 검사는 작업의 어느 시점에 실행됐나

훅 구현 과정에서 정리된 구조적 판단들을 한곳에 모아둔다.

**훅이 system prompt보다 강력한 이유**

에이전트는 세션 내에서 많은 컨텍스트를 처리한다. system prompt나 CLAUDE.md에 적힌 규칙은 컨텍스트가 길어지면 희석된다. 훅은 도구 실행 직전/직후에 실행되는 독립적인 프로세스다. 에이전트의 컨텍스트 길이와 무관하게 항상 동작한다.

**PreToolUse vs PostToolUse 선택 기준**

차단이 필요하면 PreToolUse. 이미 실행된 결과를 기반으로 추가 작업(로깅, 알림, 검증)이 필요하면 PostToolUse. GateGuard처럼 "이 파일은 쓰면 안 된다"는 종류의 제약은 PreToolUse가 맞다. 쓰고 나서 막으면 이미 파일이 생성된 상태이고, 롤백 비용이 생긴다.

**exit code 규칙**

- `exit 0` — 통과. 에이전트 작업 계속.
- `exit 2` — 차단. 에이전트에게 차단 메시지 전달. 에이전트는 다른 방법을 시도해야 한다.
- `exit 1` — 훅 자체 오류. 에이전트 작업이 중단되고 오류로 처리된다.

---

## 자동화가 실제로 작동하는지 관찰하기

에이전트가 여러 개 동시에 돌면 "지금 무슨 작업이 진행 중인가"를 파악하기 어렵다. 스프린트 진행률, 에이전트 실행 로그, flutter analyze 결과 추이를 한 화면에서 보기 위해 별도 대시보드를 만들었다.

스택은 React 18 + TypeScript + Vite + Tailwind CSS. API 서버는 Node.js + SQLite. Nginx가 앞에서 라우팅하고, Qdrant가 에이전트 응답 벡터를 저장한다.

```yaml
# docker-compose.yml 핵심 구조
services:
  dashboard:
    build: ./dashboard
    ports: ["3000:3000"]

  api:
    build: ./api
    environment:
      - DB_PATH=/data/harness.db
    volumes:
      - sqlite-data:/data

  nginx:
    image: nginx:alpine
    ports: ["80:80"]
    depends_on: [dashboard, api]

  qdrant:
    image: qdrant/qdrant
    ports: ["6333:6333"]
    volumes:
      - qdrant-data:/qdrant/storage
```

Docker Compose로 묶어두면 팀원이 `docker compose up` 한 번으로 동일한 환경을 띄운다. "내 환경에서는 됐는데" 문제가 없다.

Playwright로 대시보드의 주요 페이지를 E2E 검증한다. 스프린트 현황 페이지, 에이전트 로그 뷰, analyze 지표 차트가 정상 렌더링되는지 `/e2e-check` 커맨드가 자동으로 확인한다.

---

## 작업 목록과 코드 변경을 연결하기

에이전트가 작업을 완료해도 Jira 업데이트는 수동으로 남아 있었다. PR을 올리고, Jira 티켓을 In Progress → Done으로 옮기고, 코멘트에 링크를 추가하는 일들이다. 에이전트가 코드를 짜는 속도보다 Jira 반영이 느려지면 칸반 보드가 현실을 반영하지 못한다.

MCP(Model Context Protocol)로 Jira를 Claude Code에 연결했다. 에이전트가 직접 Jira API를 호출해서 작업이 완료되는 즉시 보드를 갱신한다.

`.mcp.json` 설정은 이렇다.

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-jira"],
      "env": {
        "JIRA_HOST": "your-org.atlassian.net",
        "JIRA_EMAIL": "dev@example.com",
        "JIRA_API_TOKEN": "${JIRA_API_TOKEN}"
      }
    }
  }
}
```

이 설정으로 에이전트가 접근할 수 있는 Jira 도구들이 생긴다.

| 도구 | 용도 |
|------|------|
| `jira_get_issue` | 티켓 상세 조회, 담당자·우선순위 확인 |
| `jira_transition_issue` | 상태 전환 (To Do → In Progress → Done) |
| `jira_add_comment` | 작업 내용, PR 링크 코멘트 추가 |
| `jira_search` | JQL로 현재 스프린트 이슈 목록 로드 |

`/sprint` 커맨드에 이 연동을 붙였다. 흐름은 이렇다.

```text
/sprint 실행
  → Jira에서 현재 스프린트 이슈 목록 로드 (jira_search)
  → 우선순위 순으로 태스크 정렬
  → 각 태스크를 담당 에이전트에 배정

에이전트 작업 시작
  → 해당 Jira 티켓 In Progress 전환 (jira_transition_issue)

PR 생성 시
  → Jira 티켓 코멘트에 PR 링크 자동 추가 (jira_add_comment)

PR 병합 시
  → Jira 티켓 Done 전환 (jira_transition_issue)
  → 실제 소요 시간 업데이트
```

이 흐름이 자동화되면서 칸반 보드가 항상 현재 상태를 반영하게 됐다. 에이전트가 코드를 올리는 순간 Jira 보드가 바뀐다. 따로 Jira를 열어서 티켓을 드래그할 일이 없어졌다.

주의할 점이 하나 있다. Jira API 토큰은 환경 변수(`${JIRA_API_TOKEN}`)로 관리하고 `.mcp.json`에 직접 넣지 않는다. GateGuard가 설정 파일에 API 키 패턴이 들어가는 것을 차단하도록 설정했다. PHI 감지 훅과 같은 방식이다.

---

## 화면 코드가 데이터 저장소를 직접 건드리지 않게 하기

앱 레이어는 세 층으로 나눴다.

```text
lib/
├── domain/
│   ├── entities/        # Exercise, Patient, Session
│   ├── repositories/    # 인터페이스만 (구현 없음)
│   └── use_cases/       # 비즈니스 로직
├── infrastructure/
│   ├── repositories/    # Firestore 구현체
│   └── services/        # Firebase Auth, Cloud Functions 연동
└── presentation/
    ├── pages/
    ├── widgets/
    └── blocs/           # flutter_bloc
```

`domain/`은 Firebase를 모른다. Firestore 쿼리나 Cloud Functions 호출이 도메인 레이어에 들어가면 GateGuard가 경고를 낸다. 처음에는 불편해 보였지만 테스트할 때 이 구조의 장점이 나온다. 도메인 로직 테스트에 Firebase 에뮬레이터가 필요 없다.

QR 인증은 HMAC-SHA256으로 서명한 토큰을 사용한다. 공유 태블릿에서 스태프가 환자 QR을 스캔하면 해당 환자 세션이 열린다. 토큰에는 환자 ID, 만료 시각, nonce가 들어가고, 서버에서 서명을 검증한다. 토큰이 만료되면 스캔해도 세션이 열리지 않는다.

---

## 6주 뒤에 남은 원칙

**에이전트는 경계가 명확할수록 잘 작동한다.** `flutter-specialist`가 Firestore 쿼리를 직접 짜려고 할 때 GateGuard가 막는다. 처음엔 답답해 보이지만 에이전트가 레이어 경계를 지키면서 코드 구조가 훨씬 일관성을 유지했다.

**CLAUDE.md는 규칙 목록이 아니라 의사결정 기록이다.** 에이전트가 실수할 때마다 새 항목이 추가됐다. 6주 후 CLAUDE.md는 팀의 아키텍처 결정 이유가 담긴 살아있는 문서가 됐다.

**모델 선택은 비용 최적화가 아니라 역할 분리다.** Haiku로 boilerplate를 만들고, Opus로 아키텍처를 검토하는 파이프라인은 단순히 저렴한 것이 아니라 각 역할에 맞는 판단력을 쓰는 것이다.

**PHI 암호화 호환성은 테스트로만 검증 가능하다.** "이론상 맞다"고 양쪽 코드를 따로 짜면 반드시 어딘가서 바이트 순서나 인코딩이 어긋난다. 교차 복호화 테스트를 제일 먼저 만들었어야 했다.

**git worktree는 에이전트 병렬화의 전제조건이다.** 에이전트를 여러 개 띄워도 같은 working directory를 공유하면 충돌이 생긴다. worktree로 브랜치마다 독립된 디렉토리를 주면 에이전트들이 진짜로 병렬로 작동한다.

**MCP는 도구 통합의 표준 경로다.** Jira를 에이전트에 연결하는 데 별도 스크립트를 짤 필요가 없었다. MCP 서버 하나 설정으로 에이전트가 Jira를 native 도구처럼 쓴다. 이 패턴이 확장되면 어떤 외부 서비스든 에이전트 워크플로우에 붙일 수 있다.

**Docker Compose로 환경을 고정하면 에이전트 재현성이 높아진다.** 에이전트가 "어떤 버전의 Node.js인지"를 물어보지 않아도 되고, 대시보드 개발과 API 개발이 독립적으로 진행될 수 있다.

**훅의 가치는 차단이 아니라 타이밍이다.** PHI 패턴이 들어가기 시작하는 순간에 신호를 주는 것과, 이미 50줄이 들어간 다음에 차단하는 것은 수정 비용이 전혀 다르다.

*의료 데이터를 다루는 AI 개발에서는 더 많은 에이전트보다 명확한 경계, 교차 검증 테스트, 이른 시점의 안전 신호가 중요했다.*
