---
title: "AI로 게임 개발하기 - 9일차: 프로젝트 회고"
description: "AI와 함께 뱀서라이크를 처음부터 끝까지 만든 9일간의 여정을 돌아본다. 장점, 한계, 그리고 다음 프로젝트를 위한 개선 방향."
date: 2026-03-06
categories: [Project]
tags: [Unity, AI]
---

## 9일간의 기록을 돌아보며

[1일차](/blog/2026/02/20/ai-game-dev-day-1/)에 "AI로 게임을 만들 수 있을까?"라는 질문으로 시작했다. 9일이 지난 지금, 결과물이 있다. Vampire Survivors 스타일의 2D 탑다운 오토어택 로그라이크. 무기 20종, 패시브 아이템 13종, 보스, 5개 스테이지, 6명의 캐릭터, 도감, 업적, 튜토리얼, 수익화 프레임워크까지 갖춘 게임이다.

오늘은 PLAN.md와 TODO.md를 대조하며 전체 진행 상황을 점검하고, AdMob SDK를 실제 연동했다. 수익화 프레임워크의 마지막 퍼즐이 맞춰진 셈이다. 9일간의 개발 과정을 처음부터 끝까지 정리하고, AI를 활용한 게임 개발의 장단점을 분석한다.

---

## 뭘 만들었나

| 항목 | 수치 |
|------|------|
| 장르 | 2D 탑다운 오토어택 로그라이크 서바이벌 |
| 엔진 | Unity 6000.3.0f1 (URP 2D) |
| 세션 길이 | 10분 |
| 무기 | 20종 (기본) + 20종 (진화) |
| 패시브 아이템 | 13종 |
| 캐릭터 | 6명 |
| 스테이지 | 5개 |
| 적 유형 | 5종 + 보스 1종 (3페이즈) |
| 테스트 | 180개 (EditMode 137 + PlayMode 18 + Integration 24 + 도감 10) |
| 달성률 | 36/37 항목 완료 (97%) |

핵심 기술 스택은 Unity + URP + UI Toolkit + Reflex (DI) + R3 (Reactive) + Cinemachine이다. 모바일과 PC 동시 지원을 목표로 New Input System과 플로팅 조이스틱을 병행 구현했다.

---

## 개발 타임라인

### 1일차 — 방향 설정

AI에게 "뱀서라이크 만들어줘"라고 말하지 않았다. 먼저 장르를 분석했다. Vampire Survivors의 핵심 루프(이동 → 자동 공격 → 경험치 → 레벨업 → 성장)를 분해하고, 10분 세션에 맞는 난이도 곡선을 설계했다. GDD(Game Design Document)의 뼈대를 잡은 날이다.

### 2일차 — GDD 완성

60페이지짜리 GDD를 완성했다. 무기 20종의 이름, 데미지, 쿨다운, 레벨별 수치를 전부 확정했다. 적 5종의 HP, 이동속도, 스폰 패턴까지. AI에게 줄 스펙이 구체적일수록 결과물의 품질이 올라간다는 것을 이 단계에서 확신했다.

### 3일차 — 아키텍처 결정

기술 스택을 확정했다. Reflex로 DI, R3로 이벤트 바인딩, UI Toolkit으로 UI. `GameEvents` 싱글톤에 21종 이벤트를 정의하고, 시스템 간 의존성을 이벤트 기반으로 끊는 구조를 설계했다. 이 날의 아키텍처 결정이 이후 모든 구현의 기반이 되었다.

### 4일차 — 폭발적 구현 (M1~M4)

GDD가 확정된 상태에서 AI에게 구현을 맡겼다. 하루 만에 36개 피처 중 31개를 구현했다. 달성률 0%에서 86%로 점프. GameManager, 이벤트 시스템, 오브젝트 풀링, 플레이어 이동, 카메라, 적 5종, 웨이브 스포닝, XP 시스템, HUD, 무한 맵, 무기 20종, 패시브 13종, 레벨업 UI, 무기 진화, 스탯 계산, 보스, 스테이지 5개, 캐릭터 6명, 상점, 코인, 업적, 세이브/로드, 메뉴 UI, 결과 화면까지.

### 5일차 — VFX 에셋 임포트

CartoonFX와 HyperCasualFX 에셋 504개를 임포트하고 무기별 VFX를 매핑했다. 에셋 정리와 프리팹 연결 작업이 주였다.

### 6일차 — 코드 리뷰

새 기능 0개. 대신 AI가 만든 코드를 읽었다. `WeaponBase → AoEWeapon → ArrowRainWeapon` 상속 구조를 분석하고, 각 계층의 책임과 확장 포인트를 이해했다. AI Trading 프로젝트의 버그 2건도 병행 수정했다.

### 7일차 — 복귀 후 상태 점검

일주일 공백 후 복귀. 코드 0줄. PLAN.md와 TODO.md를 대조하며 남은 작업을 파악하고 우선순위를 결정했다. "콘텐츠 → UX → 수익화 → 최적화" 순서를 확정했다.

### 8일차 — 버그 수정 + 도감 + 튜토리얼

VFX 중복/잔상 버그, 앱 포커스 버그, timeScale 잔류 버그 3건을 수정했다. 매직넘버를 상수 클래스 3종으로 정리하며 ~30파일을 리팩토링했다. 그 후 도감 시스템과 온보딩 튜토리얼을 구현했다. 달성률 89%에서 94%로 점프.

### 9일차 (오늘) — AdMob 연동 + 프로젝트 회고

PLAN.md와 TODO.md를 최종 대조. AdMob SDK를 실제 연동하여 수익화 파이프라인을 완성했다. 37개 계획 항목 중 36개 완료. 남은 것은 모바일 최적화(SpriteAtlas, Safe Area 최종 검증) 1개뿐이다.

---

## 최종 아키텍처

9일간 만들어진 시스템의 전체 구조다.

```text
Core
├── GameManager (상태 머신: Menu/InGame/Paused/GameOver)
├── GameEvents (R3 Subject Hub, 21종 이벤트)
├── PoolManager (제네릭 오브젝트 풀)
└── PlayerStatCalculator (Base + Passive + Permanent 합산)

Gameplay
├── PlayerMovement (New Input System + 플로팅 조이스틱)
├── EnemyController + EnemyMovement (5종 행동 패턴)
├── EnemySpawner (웨이브 기반 + 시간 스케일링)
├── WeaponBase → 10개 서브클래스 → 20종 무기
├── WeaponManager (6슬롯, 진화 트리거)
├── PassiveItemManager (13종)
└── BossController (3페이즈 Death Knight)

Meta
├── CharacterManager (6캐릭터, 해금 조건)
├── StageManager (5스테이지, 난이도 스케일링)
├── ShopManager (영구 업그레이드 5종 × 10레벨)
├── AchievementManager (15업적, 12조건 타입)
├── EncyclopediaManager (적/무기/패시브 발견 추적)
└── SaveManager (PlayerPrefs)

Infrastructure
├── AnalyticsManager (Firebase 19종 이벤트)
├── AdService (IAdService → DebugAdService / AdMobService)
├── AudioManager (BGM 크로스페이드 + SFX 풀)
├── VFXManager (풀링된 ParticleSystem)
├── TutorialController (3단계 온보딩)
└── PerformanceManager (프레임레이트, 배칭)
```

시스템 간 통신은 전부 `GameEvents`의 R3 Subject를 통한다. 순환 의존성 없이 단방향 참조만 존재한다.

---

## Firebase Analytics — 19종 이벤트 추적

게임이 동작하는 것과 게임이 어떻게 플레이되는지 아는 것은 다른 문제다. 출시 후 밸런싱 조정, 이탈 구간 분석, 수익화 전환율 측정을 위해 Firebase Analytics를 연동했다.

### 아키텍처

```text
GameEvents (R3 Subject Hub, 21종)
    ↓ Subscribe
AnalyticsManager (19종 이벤트 구독)
    ↓ Delegate
IAnalyticsProvider (인터페이스)
    ├── FirebaseAnalyticsProvider (프로덕션)
    └── DebugAnalyticsProvider (에디터 테스트용)
```

핵심은 `IAnalyticsProvider` 인터페이스로 구현체를 분리한 것이다. `FirebaseAnalyticsProvider`는 `#if FIREBASE_ANALYTICS` 조건부 컴파일로 Firebase SDK가 설치된 환경에서만 활성화되고, 에디터에서는 `DebugAnalyticsProvider`가 `Debug.Log`로 이벤트를 출력한다. 개발 중에 실제 Firebase 콘솔을 열지 않아도 이벤트 발화를 확인할 수 있다.

```csharp
public interface IAnalyticsProvider
{
    void LogEvent(string eventName);
    void LogEvent(string eventName, string paramKey, string paramValue);
    void LogEvent(string eventName, string paramKey, int paramValue);
    void LogEventWithParams(string eventName, Dictionary<string, object> parameters);
    void SetUserProperty(string propertyName, string value);
}
```

### 추적 이벤트 전체 목록

| # | 이벤트 | 파라미터 | 용도 |
|---|--------|----------|------|
| 1 | `game_start` | — | 세션 시작 |
| 2 | `game_over` | — | 세션 종료 (사망) |
| 3 | `player_revive` | — | 광고 부활 사용률 |
| 4 | `player_damaged` | damage, remaining_hp | 피격 패턴 분석 |
| 5 | `player_death` | — | 사망 빈도 |
| 6 | `enemy_killed` | enemy_id | 적 처치 분포 |
| 7 | `level_up` | level, total_xp | 성장 곡선 추적 |
| 8 | `boss_spawn` | boss_id | 보스 도달률 |
| 9 | `boss_death` | boss_id | 보스 클리어률 |
| 10 | `boss_phase_change` | boss_id, boss_phase, hp_ratio | 보스 난이도 분석 |
| 11 | `item_collected` | item_type_id | 아이템 수집 패턴 |
| 12 | `xp_collected` | xp_amount | 경험치 획득 속도 |
| 13 | `coin_collected` | coin_amount | 코인 이코노미 |
| 14 | `weapon_selected` | weapon_id, weapon_level | 무기 선호도 |
| 15 | `weapon_evolved` | weapon_id, evolved_name | 진화 달성률 |
| 16 | `passive_item_acquired` | item_type_id | 패시브 선호도 |
| 17 | `passive_item_level_up` | item_type_id, item_level | 패시브 성장 패턴 |
| 18 | `treasure_chest_opened` | — | 보물상자 도달률 |
| 19 | `stage_selected` | stage_id | 스테이지 선택 분포 |
| 20 | `stage_cleared` | stage_id, clear_time | 클리어 시간 분석 |
| 21 | `session_end` | is_victory, session_time, total_kills, total_coins, player_level | 세션 종합 리포트 |

### 스팸 방지 — ThrottleFirst

경험치 젬과 코인은 한 프레임에 수십 개가 동시에 수집될 수 있다. 매번 이벤트를 발화하면 Firebase 할당량을 빠르게 소진한다. R3의 `ThrottleFirst`로 200ms 간격으로 제한했다.

```csharp
// XP 수집 — 200ms 내 첫 이벤트만 전송
GameEvents.OnXPGemCollected
    .ThrottleFirst(TimeSpan.FromMilliseconds(200))
    .Subscribe(xp => LogEvent("xp_collected", "xp_amount", xp))
    .AddTo(_disposables);

// 코인 수집 — 동일한 200ms 스로틀
GameEvents.OnCoinCollected
    .ThrottleFirst(TimeSpan.FromMilliseconds(200))
    .Subscribe(coin => LogEvent("coin_collected", "coin_amount", coin))
    .AddTo(_disposables);
```

나머지 17종 이벤트는 발생 빈도가 낮으므로(레벨업, 보스 등장, 무기 선택 등) 스로틀링 없이 즉시 전송한다.

### 이 데이터로 뭘 할 수 있나

출시 후 Firebase 콘솔에서 확인할 수 있는 지표 예시:

- **이탈 구간**: `session_end`의 `session_time` 분포. 3분대에 몰려있으면 초반 난이도가 너무 높은 것이다.
- **무기 밸런스**: `weapon_selected`의 `weapon_id` 분포. 특정 무기만 선택된다면 나머지 무기의 매력도를 올려야 한다.
- **수익화 전환율**: `player_death` 대비 `player_revive` 비율. 부활 광고의 효용을 측정할 수 있다.
- **보스 난이도**: `boss_spawn` 대비 `boss_death` 비율. 보스 도달률은 높은데 클리어률이 낮으면 보스 HP를 하향 조정해야 한다.

밸런싱은 AI가 못한다고 앞서 적었다. 하지만 Firebase Analytics로 데이터를 수집하면, **감이 아닌 수치 기반의 밸런싱**이 가능해진다. "이 무기가 너무 강한 것 같다"는 AI의 판단 대신 "weapon_selected 분포에서 Magic Bolt가 78%를 차지한다"는 팩트가 의사결정을 뒷받침한다.

---

## AI 활용의 장점

### 1. 구현 속도가 압도적이다

4일차 하루 만에 31개 피처를 구현한 것이 가장 극적인 예시다. 무기 20종의 클래스 파일, ScriptableObject, 프리팹을 AI가 연속으로 생성했다. 사람이 손으로 했다면 무기 20종만 1주일이 걸렸을 것이다.

속도의 핵심은 **스펙의 구체성**이었다. GDD에 무기별 데미지, 쿨다운, 레벨별 수치가 전부 적혀 있었기 때문에 AI는 "해석"할 필요 없이 그대로 코드로 옮기기만 하면 됐다. 모호한 지시("적당한 무기 만들어줘")였다면 이 속도는 불가능했다.

### 2. 아키텍처 패턴 적용이 정확하다

`WeaponBase` 추상 클래스의 Template Method 패턴, `WeaponData` ScriptableObject의 데이터-로직 분리, `GameEvents`의 Observer 패턴 — AI가 생성한 아키텍처는 교과서적으로 깔끔했다. 각 계층의 책임이 명확하고, 새 무기를 추가할 때 `Attack()`만 오버라이드하면 되는 확장성도 갖추고 있었다.

단, 이것은 GDD와 아키텍처 문서에서 구조를 명시했기 때문이다. AI가 알아서 좋은 아키텍처를 만든 것이 아니라, 사람이 설계한 구조를 AI가 정확하게 구현한 것이다.

### 3. 반복 작업을 위임할 수 있다

무기 20종, 패시브 13종, ScriptableObject 40개, 테스트 180개 — 이런 반복적이면서 패턴이 일정한 작업은 AI의 강점이다. 첫 번째 무기를 만들면서 패턴을 확립하면, 나머지 19개는 AI가 패턴을 따라 찍어낸다. 사람이 반복 작업에서 느끼는 피로와 실수가 없다.

### 4. 테스트 코드 생성이 빠르다

"이 클래스에 대한 EditMode 테스트를 작성해"라고 하면 AI가 정상 케이스, 경계값, 에러 케이스를 포함한 테스트 스위트를 생성한다. 180개 테스트를 사람이 직접 작성했다면 며칠이 걸렸을 것이다. AI는 몇 시간 만에 생성했다.

### 5. 크로스 도메인 지식이 즉시 사용 가능하다

Unity 특유의 API(`Physics2D.OverlapCircleAll`, `ParticleSystem.Stop`, `SpriteAtlas` 설정), UI Toolkit의 UXML/USS 문법, Cinemachine 3.x의 Impulse API — 이런 프레임워크별 세부 지식을 AI가 즉시 활용한다. 문서를 찾아볼 필요가 없었다.

---

## AI 활용의 단점

### 1. Happy Path만 구현한다

8일차에 수정한 버그 3건이 전부 이 문제에서 비롯됐다.

- **VFX 중복**: 쿨다운이 짧은 무기에서 이전 VFX가 회수되지 않고 새 VFX가 겹쳐 생성
- **앱 포커스**: 백그라운드 전환 시 `Time.deltaTime` 폭발
- **timeScale 잔류**: 일시정지 상태에서 메뉴로 돌아가면 다음 게임에서 조작 불가

세 가지 모두 "정상적으로 플레이하면 발생하지 않는" 엣지 케이스다. AI는 정상 플로우의 코드를 생성하는 데 뛰어나지만, "사용자가 이상한 짓을 하면 어떻게 되는가?"에 대한 방어 코드는 스스로 작성하지 않는다. 명시적으로 요구하지 않는 한.

> **→ 개선**: GDD에 각 피처마다 "예외 시나리오" 섹션을 추가한다. "앱 백그라운드 전환", "버튼 연타", "네트워크 끊김" 같은 체크리스트를 미리 작성해두고, AI에게 구현을 요청할 때 "정상 시나리오와 함께 다음 예외 시나리오도 처리해"라고 전달한다. 프롬프트에 에지 케이스를 명시하면 AI는 방어 코드까지 포함한 구현을 생성한다.

### 2. 컨텍스트 유실이 누적된다

AI와의 대화에는 컨텍스트 윈도우 한계가 있다. 4일차에 31개 피처를 연속으로 구현하면서 초반에 만든 코드의 컨텍스트가 후반에는 사라졌다. 그 결과 후반에 만든 코드가 초반 코드와 스타일이 미묘하게 달라지거나, 이미 만든 유틸리티 함수를 모르고 새로 만드는 일이 발생했다.

8일차에 ~30파일의 매직넘버를 정리한 것도 이 문제의 결과다. 파일마다 같은 PlayerPrefs 키를 문자열 리터럴로 중복 사용하고 있었다. 한 세션에서 일관되게 상수를 사용했어야 하지만, 컨텍스트가 유실되면서 각 파일이 독립적으로 작성된 것이다.

> **→ 개선**: 프로젝트 루트의 `CLAUDE.md`에 코딩 컨벤션을 1일차에 확정하여 기록한다. "PlayerPrefs 키는 `PlayerPrefsKeys` 클래스를 통해 접근", "매직넘버는 `const`로 선언" 같은 규칙을 명시해두면 AI가 컨텍스트 윈도우가 넘어가더라도 매 세션 시작 시 `CLAUDE.md`를 읽고 일관된 코드를 생성한다. 세션 로그에 "이번 세션에서 만든 공통 유틸리티 목록"을 기록해두는 것도 효과적이다.

### 3. "동작하니까 다음"의 함정

AI가 빠르게 코드를 생성하면 사람은 "동작하니까 넘어가자"라는 유혹에 빠진다. 6일차에 의도적으로 멈추고 코드를 읽기 전까지, 나는 무기 20종의 내부 구조를 이해하지 못하는 상태였다. 동작하지만 유지보수할 수 없는 코드베이스가 되어가고 있었다.

AI의 생산성이 높을수록 이 함정은 더 위험하다. "하루에 31개 피처를 만들었다"는 성취감 뒤에 "31개 피처의 코드를 이해하는가?"라는 질문이 숨어 있다.

> **→ 개선**: 스프린트-리뷰 사이클을 짧게 가져간다. 31개를 몰아치고 이틀 뒤에 리뷰하는 대신, 5~10개 피처 단위로 끊고 코드를 읽는다. "오전에 구현, 오후에 리뷰"가 이상적이다. 또한 AI에게 코드를 생성시킨 직후, 같은 세션에서 "방금 만든 코드의 구조를 설명해줘"라고 요청하면 사람이 빠르게 이해할 수 있다. 코드를 읽는 시간을 별도로 잡지 않아도 되므로 전체 속도를 유지하면서 이해도를 확보할 수 있다.

### 4. 디버깅을 사람에게 맡긴다

AI가 만든 코드의 버그를 AI에게 "고쳐줘"라고 하면, AI는 기존 컨텍스트를 모르기 때문에 새로운 코드를 덧붙인다. 근본 원인을 파악하지 않고 증상만 가리는 수정이 나올 확률이 높다. 결국 사람이 코드를 읽고, 원인을 찾고, 수정 방향을 결정해야 한다.

MeteorWeapon의 VFX 타이밍 버그가 좋은 예다. AI에게 "Meteor 데미지 타이밍이 안 맞아"라고만 말하면 `Invoke`나 `Coroutine`으로 지연을 추가하는 식의 임시 수정이 나왔을 것이다. 사람이 "VFX 착탄 시점과 데미지 판정 시점을 분리해야 한다"는 설계 결정을 내렸기 때문에 `PendingImpact` 구조체를 사용한 근본적 리워크가 가능했다.

> **→ 개선**: 피처 구현과 테스트 작성을 한 번에 요청한다. "이 클래스를 구현하고, 바로 EditMode 테스트도 작성해"라고 하면 AI가 정상/경계/에러 케이스를 포함한 테스트를 함께 생성한다. 테스트가 있으면 버그 발생 시 실패하는 테스트를 단서로 원인을 좁힐 수 있다. 또한 AI에게 버그를 전달할 때 "증상"이 아니라 "재현 스텝 + 기대 동작 + 실제 동작"의 3단 구조로 전달하면, 임시 수정 대신 근본 원인을 찾는 방향의 코드가 나올 확률이 높아진다.

### 5. 밸런싱은 AI가 못한다

GDD에 모든 수치를 적어놨지만, 그 수치가 "재미있는가?"는 플레이해봐야 안다. AI는 수치를 코드에 넣을 수는 있지만, "이 무기가 너무 강한가?", "8분대 난이도 곡선이 너무 가파른가?" 같은 판단은 할 수 없다. 게임 밸런싱은 본질적으로 플레이 테스트 기반이고, 이건 사람의 영역이다.

> **→ 개선**: 밸런싱 자체를 AI에게 맡기는 것은 불가능하지만, **밸런싱 반복 속도를 AI로 높일 수 있다.** 수치를 전부 ScriptableObject로 분리해두면(이미 했다), 밸런싱 조정이 코드 수정 없이 SO 에디터에서 가능하다. 여기에 더해 AI에게 "플레이 테스트 결과 Arrow Rain이 너무 강하다. 다른 무기와 DPS를 맞추려면 레벨별 데미지를 어떻게 조정해야 하는가?"처럼 수치 분석과 조정안을 요청할 수 있다. AI가 판단은 못하지만, 사람이 방향을 정하면 구체적인 수치 계산은 빠르게 해준다. 또한 자동 플레이 봇을 만들어 "10분 세션을 100회 시뮬레이션하고 무기별 DPS 분포를 출력해"와 같은 자동화 테스트를 구축하면, 밸런싱 피드백 루프를 크게 단축할 수 있다.

---

## 개선 방향 요약

위 단점별 개선 방향을 한눈에 정리하면 다음과 같다.

| 단점 | 핵심 원인 | 개선 전략 | 적용 시점 |
|------|-----------|-----------|-----------|
| Happy Path만 구현 | 프롬프트에 예외 시나리오 없음 | GDD에 에지 케이스 체크리스트 포함 | 기획 단계 |
| 컨텍스트 유실 | 컨텍스트 윈도우 한계 | `CLAUDE.md`에 컨벤션 1일차 확정 + 세션 로그 | 프로젝트 초기 |
| "동작하니까 다음" | 속도에 취한 검증 생략 | 5~10 피처 단위 스프린트-리뷰 사이클 | 구현 중 |
| 디버깅 위임 불가 | AI의 컨텍스트 부재 | 구현+테스트 동시 요청, 버그 리포트 3단 구조 | 구현/유지보수 |
| 밸런싱 불가 | 주관적 판단 영역 | SO 분리 + 수치 분석 위임 + 자동 플레이 봇 | 밸런싱 단계 |

공통 원칙은 하나다: **AI에게 주는 입력의 품질이 출력의 품질을 결정한다.** 단점 대부분은 "AI가 못하는 것"이 아니라 "사람이 충분히 전달하지 않은 것"에서 비롯된다. GDD를 더 구체적으로, 프롬프트를 더 명시적으로, 컨벤션을 더 일찍 확정하면 같은 AI로도 훨씬 나은 결과를 얻을 수 있다.

---

## 숫자로 보는 9일

| 지표 | 수치 |
|------|------|
| 총 개발 일수 | 9일 (실제 코딩 일수 약 5일) |
| 최종 달성률 | 36/37 (97%) |
| 무기 | 20종 (기본) + 20종 (진화) = 40종 |
| 패시브 아이템 | 13종 |
| 캐릭터 | 6명 |
| 스테이지 | 5개 |
| ScriptableObject | 82개 |
| 테스트 | 180개 |
| 총 에셋 | ~946개 |
| 버그 수정 | 6건 |
| 리팩토링 파일 | ~30개 |

---

## 결론

AI로 게임을 만들 수 있는가? **만들 수 있다.** 9일 만에 상용 수준에 근접한 뱀서라이크를 완성했다. 하지만 "AI가 만들었다"는 표현은 정확하지 않다.

정확한 표현은 이렇다: **사람이 설계하고, AI가 구현하고, 사람이 검증했다.** GDD 작성, 아키텍처 결정, 코드 리뷰, 디버깅, 밸런싱 — 이 다섯 가지는 사람이 했다. 코드 생성, 테스트 작성, 반복 작업 — 이 세 가지는 AI가 했다.

AI는 프로그래머를 대체하지 않는다. 프로그래머의 생산성을 10배로 만든다. 단, 프로그래머가 뭘 만들어야 하는지 정확히 알고 있을 때만.

이 글을 쓰는 시점에 AdMob SDK 연동도 완료했다. 남은 작업은 모바일 최적화 최종 검증뿐이다. 게임 로직과 수익화 인프라 모두 완성됐다. 다음 포스트는 출시 과정을 다룰 예정이다.

---

*9일, 37개 피처, 180개 테스트, 946개 에셋 — AI가 코드를 쓰고 사람이 방향을 잡으면, 혼자서도 게임 하나를 완성할 수 있다.*
