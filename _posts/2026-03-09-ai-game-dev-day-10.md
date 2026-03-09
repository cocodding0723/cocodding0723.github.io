---
title: "AI로 게임 개발하기 - 10일차: 새 프로젝트, Rhythm Rogue"
description: "뱀서라이크 회고의 개선 방향 5가지를 Rhythm Rogue 첫날부터 적용. 코드 0줄, GDD 900줄, CLAUDE.md 342줄, asmdef 13개."
date: 2026-03-09
categories: [Project]
tags: [Unity, AI]
---

## 뱀서라이크 이후

[9일차](/blog/2026/03/06/ai-game-dev-day-9/)에서 프로젝트 회고를 마쳤다. 장점 5가지, 단점 5가지, 그리고 단점마다 구체적인 개선 방향을 정리했다. 회고를 적어놓고 다음 프로젝트에 적용하지 않으면 의미가 없다.

그 전에, 뱀서라이크의 최종 결과물을 남겨둔다.

<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;max-width:100%;">
  <iframe src="https://www.youtube.com/embed/mVbxNQSLJoM" style="position:absolute;top:0;left:0;width:100%;height:100%;" frameborder="0" allowfullscreen></iframe>
</div>

9일간 AI와 함께 만든 뱀서라이크 장르는 이 영상으로 마무리한다. 무기 20종, 패시브 13종, 보스, 5개 스테이지, 6명의 캐릭터, 180개 테스트 — 완성된 게임이 돌아가는 모습이다. 출시 과정은 별도로 다룰 예정이었지만, 먼저 새 프로젝트에 착수했다.

오늘 새 프로젝트를 시작했다. 뱀서라이크의 두 번째 프로젝트가 아니라, 완전히 다른 장르다. 이번에는 회고에서 뽑은 개선 방향 5가지를 1일차부터 전부 적용했다. 코드 한 줄 쓰기 전에.

---

## Rhythm Rogue — 기획

### 컨셉

"적의 공격이 곧 음악이다 -- 리듬을 읽고, 패링하고, 반격하라."

장르는 로그라이크 + 리듬 액션. 시점은 3인칭(TPS). 레퍼런스 게임은 세 개다.

| 레퍼런스 | 가져온 요소 |
|----------|-------------|
| 젠레스 존 제로 | 패링 시스템, 카메라 연출 |
| Crypt of the NecroDancer | 리듬 기반 전투 |
| Hi-Fi Rush | BGM 연동 액션 |

뱀서라이크는 조작이 "이동"뿐이었다. 전투는 자동이고, 전략적 선택은 레벨업 때만 발생한다. Rhythm Rogue는 정반대다. 매 비트마다 판단이 필요하다. 적의 공격 리듬을 읽고, 타이밍에 맞춰 패링하고, 반격 콤보를 넣는다. 플레이어의 실시간 입력이 게임의 핵심이다.

### 적 공격 = 리듬 패턴

이 게임의 핵심 시스템은 "적의 공격이 BGM의 비트에 동기화된다"는 것이다. 적이 마음대로 공격하는 게 아니라, 음악의 리듬 패턴에 맞춰 정해진 타이밍에 공격한다.

리듬 패턴은 20종이다.

| # | 패턴 | 악보 표기 (8비트) | 난이도 |
|---|------|-------------------|--------|
| 1 | 온비트 | `X . X . X . X .` | 1 |
| 2 | 엇박 | `. X . X . X . X` | 2 |
| 3 | 스윙 | `X . . X X . . X` | 3 |
| 4 | 폴리리듬 | `X . X . . X . .` | 4 |
| 5 | 트레실로 | `X . . X . . X .` | 3 |
| 6 | 셔플 | `X . X X . X X .` | 3 |
| 7 | 헤미올라 | `X . X . X . | X . X .` | 5 |
| 8 | 브레이크비트 | `X . X . . X . X` | 4 |
| 9 | 필인 | `X X X X . . . .` | 2 |
| 10 | 더블타임 | `X X X X X X X X` | 5 |

위는 10종 예시다. 나머지 10종(하프타임, 점음표, 셋잇단음표, 엑센트이동, 쉼표 페이크, 캐논, 리버스, 변박, 그레이스노트, 콜앤리스폰스)까지 총 20종이 GDD에 상세 기술되어 있다.

각 적이 고유한 리듬 패턴 조합을 사용한다. 같은 적이라도 월드가 바뀌면(=음악 장르가 바뀌면) BPM이 달라지므로 체감 난이도가 달라진다.

### 패링 시스템

젠레스 존 제로 스타일의 4등급 패링이다.

```text
Perfect  ±50ms   대미지 200%, 리듬 게이지 +15
Great    ±100ms  대미지 150%, 리듬 게이지 +8
Good     ±200ms  대미지 100%, 리듬 게이지 +3
Miss     >200ms  피격, 콤보 리셋
```

타이밍 윈도우는 밀리초 단위로 확정했다. 뱀서라이크에서 "적당히"라고 넘겼다가 나중에 수치를 잡느라 고생한 경험이 있다. 이번에는 기획 단계에서 수치를 확정한다.

패링에는 엣지 케이스 처리도 기획서에 명시했다.

```text
- 패링 스팸 방지: 빗나간 패링 시 0.3초 경직
- 동시 공격: 첫 번째 공격만 패링 판정, 나머지는 회피로 처리
- 롱노트 홀드 중 버튼 일찍 떼기: 현재까지 누적 점수의 50%만 인정
- BGM 동기화 드리프트: AudioSettings.dspTime 기준 보정, 허용 오차 ±5ms
```

9일차 회고의 첫 번째 개선 방향이 "GDD에 에지 케이스 체크리스트 포함"이었다. 뱀서라이크에서 VFX 중복, 앱 포커스, timeScale 잔류 버그가 모두 "정상 플로우에서는 발생하지 않는" 엣지 케이스에서 나왔다. Rhythm Rogue에서는 패링 스팸, 동시 공격, 롱노트 중단, 오디오 드리프트 같은 엣지 케이스를 기획서 단계에서 먼저 정의했다.

### 이중 게이지 구조

전투 보상 시스템은 두 갈래다.

```text
공격 콤보 → 스킬 게이지 충전 → 강공격 발동
패링 성공 → 리듬 게이지 충전 → 궁극기 발동
```

공격만 잘해도 강공격을 쓸 수 있고, 패링만 잘해도 궁극기를 쓸 수 있다. 둘 다 잘하면 둘 다 쓸 수 있다. 플레이어의 성향(공격적 vs 방어적)에 따라 보상 경로가 갈린다.

### 캐릭터 6종

각 캐릭터가 고유한 공격 리듬 패턴을 가진다.

| 캐릭터 | 무기 | 고유 리듬 | 콤보 특성 |
|--------|------|-----------|-----------|
| 케이든 | 대검 | 온비트 (4/4) | 느리지만 묵직한 타격 |
| 리라 | 쌍검 | 셋잇단 (3연음) | 빠른 연타 체인 |
| 마르코 | 권총+근접 | 엇박 | 원거리↔근접 스위칭 |
| 아이비 | 지팡이 | 왈츠 (3/4) | 범위 마법 캐스팅 |
| 드럼 | 건틀릿 | 스윙 | 차지 펀치 체인 |
| 산바 | 채찍 | 트레실로 | 긴 사거리 콤보 |

뱀서라이크에서 캐릭터 6명의 차별점은 시작 무기와 스탯 배율뿐이었다. 플레이 스타일의 차이가 크지 않았다. Rhythm Rogue에서는 캐릭터마다 공격 리듬 자체가 다르다. 케이든의 4/4 온비트 대검과 리라의 셋잇단 쌍검은 입력 패턴부터 다르다.

### 로그라이크 런 구조

```text
일반 전투 (2~3회) → 엘리트 전투 → 상점/이벤트 → 보스
     ↑                                              ↓
     └──────────── 다음 월드로 반복 ────────────────┘
```

5개 월드가 있고, 각 월드마다 음악 장르가 다르다.

| 월드 | 음악 장르 | BPM 범위 | 특성 |
|------|-----------|----------|------|
| 1 | 일렉트로닉 | 120-130 | 정박 중심, 입문용 |
| 2 | 재즈 | 100-140 | 스윙/엇박, 불규칙 |
| 3 | 라틴 | 90-120 | 폴리리듬, 클라베 |
| 4 | 메탈 | 140-180 | 고속, 변박 |
| 5 | 오케스트라 | 60-200 | 전 패턴 총출동 |

월드 1에서 온비트를 익히고, 월드 2에서 스윙과 엇박을 만나고, 월드 5에서 모든 패턴이 섞여 나온다. 음악 장르가 곧 난이도 커브다.

### GDD 규모

900줄짜리 `GameDesign/GameDesignDocument.md`를 완성했다. 뱀서라이크 GDD가 60페이지였는데, Rhythm Rogue의 GDD는 그보다 밀도가 높다. 리듬 패턴 20종의 악보 표기, 난이도, 사용 적, 패링 타이밍이 전부 수치로 들어있다. 패링 등급별 카메라 연출(접촉점 클로즈업 → 밀림 → 복귀 3단계)도 상세 설계했다. 6 캐릭터의 콤보 모션 체인(타수별 모션, 대미지 비율)도 전부 확정했다.

9일차에서 "AI에게 주는 입력의 품질이 출력의 품질을 결정한다"고 썼다. GDD의 구체성은 그 원칙의 직접적인 실천이다.

---

## 9일차 개선 방향 → 10일차 실행

회고에서 정리한 5가지 개선 방향을 하나씩 대응시켜 보겠다.

### 1. GDD에 에지 케이스 체크리스트 포함

**9일차 분석**: Happy Path만 구현하는 문제. VFX 중복, 앱 포커스, timeScale 잔류 버그가 전부 엣지 케이스에서 발생.

**10일차 실행**: 패링 스팸 방지(빗나간 패링 0.3초 경직), 동시 공격 처리, 롱노트 중단 처리, BGM 동기화 드리프트 보정 -- 전부 GDD에 명시했다. AI에게 "패링 시스템 구현해"라고만 말하는 게 아니라 "패링 시스템 구현하되, 스팸 방지와 동시 공격 처리도 포함해"라고 말할 수 있게 됐다.

### 2. CLAUDE.md에 컨벤션 1일차 확정

**9일차 분석**: 컨텍스트 유실로 코드 스타일이 달라지고, 매직넘버가 흩어지고, PlayerPrefs 키가 중복되는 문제.

**10일차 실행**: 342줄짜리 `CLAUDE.md`를 프로젝트 시작과 동시에 작성했다. 뱀서라이크에서는 6일차에야 `.editorconfig`를 만들고 70파일을 소급 리팩토링했다. 이번에는 코드 한 줄 쓰기 전에 컨벤션을 확정했다.

CLAUDE.md에 들어간 내용:

```yaml
# 네이밍 규칙
- private/protected 필드: _camelCase
- 상수/static readonly: UPPER_SNAKE_CASE
- 메서드: PascalCase
- 로컬 변수/파라미터: camelCase

# SerializeField 사용법
- [SerializeField] private 필수
- public 필드 금지 (Inspector 노출용이라도 SerializeField 사용)
- 리네이밍 시 [FormerlySerializedAs] 필수

# 코드 구조 템플릿
1. 상수/SerializeField
2. private 필드
3. Unity 라이프사이클 (Awake → Start → Update)
4. public 메서드
5. private 메서드
```

아키텍처 패턴도 명시했다.

```text
- DI: VContainer (Reflex 대신)
- Reactive: R3
- 이벤트 채널: ScriptableObject Event Channel 패턴
- 싱글톤: 금지 (DI로 대체)
```

뱀서라이크에서 `GameEvents` 싱글톤에 21종 이벤트를 몰아넣었다. 시스템 간 의존성을 이벤트로 끊은 건 좋았지만, 싱글톤 자체가 전역 상태를 만든다는 근본적 문제가 있었다. Rhythm Rogue에서는 VContainer DI + ScriptableObject Event Channel 패턴으로 아키텍처를 격상했다. DI 컨테이너가 의존성을 관리하므로, 싱글톤이 필요 없다.

금지 패턴 목록도 넣었다.

```text
# 금지 패턴
- FindObjectOfType / FindObjectsOfType
- GetComponent in Update/FixedUpdate
- 문자열 비교 (태그 비교 포함)
- public 필드 (Inspector 노출용 포함)
- 싱글톤 패턴
- God class (500줄 초과)
- Scene 간 static 참조
```

이 목록이 있으면 AI가 컨텍스트 윈도우를 넘겨도, 매 세션 시작 시 CLAUDE.md를 읽고 금지 패턴을 피한다. 뱀서라이크에서 `FindObjectOfType`이 여러 파일에 흩어져 있었던 문제가 반복되지 않는다.

### 3. 5~10 피처 단위 스프린트-리뷰 사이클

**9일차 분석**: 4일차에 31개 피처를 몰아 구현하고, 6일차에야 코드를 읽은 문제. "동작하니까 다음"의 함정.

**10일차 실행**: 아직 코드를 작성하지 않았으므로 이 개선 방향은 구현 단계에서 적용할 예정이다. 다만 CLAUDE.md의 "AI 워크플로우" 섹션에 작업 프로세스를 명시해두었다.

```text
# 작업 프로세스
1. 기획/작업 문서 확인
2. 구현 (5~10 피처 단위)
3. 테스트 작성 (구현과 동시)
4. 코드 리뷰
5. 다음 스프린트
```

"구현과 동시에 테스트 작성"이 4번째 개선 방향과도 연결된다.

### 4. 구현+테스트 동시 요청

**9일차 분석**: AI가 만든 코드의 버그를 나중에 발견하면, AI에게 "고쳐줘"라고 해도 근본 원인을 모르는 수정이 나오는 문제.

**10일차 실행**: CLAUDE.md에 테스트 요구사항을 명시했다.

```text
# 테스트 요구사항
- 네이밍: MethodName_Condition_ExpectedResult
- 커버리지 목표: 80%
- 모든 public 메서드에 대해 최소 1개 테스트
- 경계값, 에러 케이스 포함 필수
```

Assembly Definition에 테스트용 asmdef 2개(EditMode, PlayMode)도 미리 생성해두었다. 코드를 작성하기 전에 테스트 인프라가 준비되어 있으면, "구현하고 나서 테스트를 추가하자"가 아니라 "구현할 때 테스트도 같이 작성해"가 자연스러워진다.

### 5. SO 분리 + 수치 분석 위임

**9일차 분석**: 밸런싱은 AI가 못하지만, ScriptableObject로 수치를 분리하면 코드 수정 없이 Inspector에서 밸런싱이 가능한 점.

**10일차 실행**: GDD에 모든 수치를 확정하고, 폴더 구조에 `Data/` 디렉토리 4개(Characters, Enemies, Rhythm, Roguelike)를 미리 생성했다. ScriptableObject 기반 데이터 드리븐 설계는 뱀서라이크와 동일하지만, 이번에는 폴더 구조까지 1일차에 확정했다.

---

## 프로젝트 인프라 구축

### 폴더 구조 — 33개 디렉토리

코드 한 줄 쓰기 전에 프로젝트의 물리적 구조를 먼저 잡았다.

```text
Assets/
├── Scripts/
│   ├── Core/           # GameManager, 상태 머신, 유틸리티
│   ├── Rhythm/         # BeatManager, BeatMap, 리듬 판정
│   ├── Combat/         # 패링, 대미지, 히트 판정
│   ├── Player/         # 이동, 입력, 콤보
│   ├── Enemy/          # 적 AI, 리듬 공격 패턴
│   ├── Camera/         # 카메라 연출, 패링 카메라
│   ├── Audio/          # BGM 동기화, SFX
│   ├── UI/             # HUD, 메뉴, 리듬 UI
│   ├── Roguelike/      # 런 구조, 보상, 상점
│   ├── Data/           # ScriptableObject 정의
│   └── Utils/          # 확장 메서드, 공통 유틸리티
├── Prefabs/
│   ├── Characters/
│   ├── Enemies/
│   ├── Effects/
│   └── UI/
├── Art/
│   ├── Characters/
│   ├── Enemies/
│   ├── Environment/
│   ├── Effects/
│   └── UI/
├── Audio/
│   ├── BGM/
│   ├── SFX/
│   └── BeatMaps/
├── Data/
│   ├── Characters/
│   ├── Enemies/
│   ├── Rhythm/
│   └── Roguelike/
├── Scenes/
│   ├── Main/
│   ├── Combat/
│   ├── UI/
│   └── Test/
├── Settings/
├── Resources/
└── Tests/
    ├── EditMode/
    └── PlayMode/
```

뱀서라이크에서 Scripts 폴더가 flat했다. 80개 이상의 C# 파일이 하나의 디렉토리에 섞여 있었다. 파일을 찾으려면 이름으로 검색해야 했다. Rhythm Rogue에서는 Scripts 하위에 11개 모듈 디렉토리를 두었다. 모듈 경계가 디렉토리로 물리적으로 분리되어 있으면, 파일을 어디에 둘지 고민할 필요가 없다.

### Assembly Definition — 13개

폴더 구조만으로는 모듈 간 의존성을 강제할 수 없다. C#에서 모듈 경계를 강제하는 방법은 Assembly Definition이다.

```text
런타임 (11개)
RhythmRogue.Core
RhythmRogue.Rhythm        → Core 참조
RhythmRogue.Combat        → Core, Rhythm 참조
RhythmRogue.Player        → Core, Rhythm, Combat 참조
RhythmRogue.Enemy         → Core, Rhythm, Combat 참조
RhythmRogue.Camera        → Core, Combat 참조
RhythmRogue.Audio         → Core, Rhythm 참조
RhythmRogue.UI            → Core, Rhythm, Combat, Player 참조
RhythmRogue.Roguelike     → Core, Combat 참조
RhythmRogue.Data          → Core 참조
RhythmRogue.Utils         → (참조 없음)

테스트 (2개)
RhythmRogue.Tests.EditMode
RhythmRogue.Tests.PlayMode
```

의존성 방향은 단방향이다. `Core`는 아무것도 참조하지 않고, `Rhythm`은 `Core`만 참조하고, `Combat`은 `Core`와 `Rhythm`을 참조한다. 순환 의존성이 물리적으로 불가능하다. 컴파일러가 강제한다.

뱀서라이크에서는 Assembly Definition을 사용하지 않았다. 모든 스크립트가 `Assembly-CSharp.dll` 하나에 들어갔다. 어떤 클래스든 다른 클래스를 참조할 수 있었고, 그래서 의존성이 뒤엉켰다. `WeaponBase`가 `UIManager`를 직접 참조한다거나, `EnemySpawner`가 `ShopManager`를 알고 있다거나 하는 문제가 은밀하게 쌓였다.

13개 asmdef를 1일차에 생성한 이유는 컨텍스트 유실 방어다. AI가 세션을 넘기면서 모듈 A의 클래스를 모듈 B에서 참조하는 코드를 생성하더라도, asmdef 참조에 포함되지 않은 어셈블리의 타입은 컴파일 에러가 난다. 사람이 리뷰하지 않아도 컴파일러가 잡아준다.

### VContainer DI + R3 Reactive

뱀서라이크에서 Reflex DI + R3 조합을 사용했다. 이번에는 VContainer로 DI 프레임워크를 변경했다.

VContainer를 선택한 이유:

```text
1. Unity 특화 (MonoBehaviour 주입 네이티브 지원)
2. 소스 제너레이터 기반 (리플렉션 없음, IL2CPP 친화적)
3. Lifetime Scope 계층 구조 (Scene별 DI 컨테이너 분리)
4. 커뮤니티 규모 (한국 Unity 커뮤니티에서 사실상 표준)
```

R3는 그대로 유지했다. Reactive 프로그래밍은 리듬 게임에 특히 적합하다. 비트 이벤트가 발생하면 여러 시스템(적 공격, 카메라 펄스, UI 피드백)이 동시에 반응해야 하는데, R3의 Subject/Observable 패턴이 이 구조를 깔끔하게 처리한다.

### Cinemachine 3.1.6

패링 성공 시 카메라 연출이 핵심 피드백이다. GDD에 설계한 3단계 연출:

```text
1단계: 접촉점 클로즈업 (0.1초, FOV 축소)
2단계: 밀림 (0.2초, 카메라 후퇴)
3단계: 복귀 (0.3초, 원래 위치로)
```

Cinemachine 3.x의 Impulse 시스템과 CinemachineCamera의 Blend를 활용할 예정이다. 뱀서라이크에서도 Cinemachine을 사용했지만 Perlin noise 카메라 셰이크 정도였다. Rhythm Rogue에서는 패링 등급(Perfect/Great/Good)에 따라 다른 강도의 카메라 연출이 들어간다.

---

## 컴파일 에러 디버깅

인프라 구축을 마치고 Unity에서 Reimport All을 실행했더니 CS0246 에러가 발생했다. `BeatEvent`와 `BeatMapSO` 타입을 찾을 수 없다는 에러다.

확인한 항목:

```text
1. asmdef GUID 참조 → 정상
2. 소스 코드 파일 존재 여부 → 정상
3. 파일 인코딩 (UTF-8 BOM) → 정상
4. asmdef JSON 유효성 → 정상
5. namespace 일치 → 정상
```

원인은 Unity의 asmdef 캐시가 외부에서 생성된 파일(AI가 만든 .cs와 .asmdef)을 인식하지 못한 것이었다. Unity가 실행 중인 상태에서 외부 도구가 파일을 생성하면, FileSystemWatcher가 변경을 감지하지 못하는 경우가 있다. Reimport All이 이를 해결할 것으로 기대했지만, asmdef 자체의 캐시는 Reimport All로도 갱신되지 않았다.

해결 방법은 Unity 에디터를 완전히 종료했다가 다시 여는 것이다. 다음부터는 asmdef를 외부에서 생성한 뒤 반드시 Unity를 재시작해야 한다는 것을 기억해두겠다.

이 문제는 뱀서라이크에서는 발생하지 않았다. 뱀서라이크에서는 asmdef를 사용하지 않았기 때문이다. 13개 asmdef를 도입한 대가로 "Unity 외부에서 asmdef를 생성하면 캐시 문제가 발생할 수 있다"는 주의사항을 하나 얻었다.

---

## Unity MCP 서버 상태

`.mcp.json` 설정은 뱀서라이크 프로젝트에서 그대로 가져왔다. 하지만 MCP 서버가 실행되지 않는 상태를 확인했다. Unity Editor에서 `Tools > Unity MCP > Start Server`를 실행해야 한다. MCP 서버가 없어도 코드 생성은 가능하지만, 씬 배치나 컴포넌트 추가 같은 Unity Editor 직접 조작은 MCP가 필요하다.

코드 생성 단계에서는 MCP 없이 진행하고, 씬 구성 단계에서 MCP를 활성화할 예정이다.

---

## 뱀서라이크 vs Rhythm Rogue — 1일차 비교

| 항목 | 뱀서라이크 1일차 | Rhythm Rogue 1일차 |
|------|-----------------|-------------------|
| GDD | 60페이지, 에지 케이스 미포함 | 900줄, 에지 케이스 명시 |
| CLAUDE.md | 없음 (6일차에 .editorconfig) | 342줄, 컨벤션+아키텍처+금지 패턴 |
| Assembly Definition | 없음 | 13개 (런타임 11 + 테스트 2) |
| DI 프레임워크 | Reflex | VContainer |
| 이벤트 시스템 | GameEvents 싱글톤 | SO Event Channel + R3 |
| 폴더 구조 | flat | 33개 디렉토리, 모듈별 분리 |
| 테스트 인프라 | 없음 (4일차 이후 추가) | asmdef 2개 + 테스트 규칙 명시 |
| 코드 작성 | 있음 (프로토타입) | 0줄 |

코드 0줄이 오늘의 핵심이다. 뱀서라이크 1일차에는 MCP 세팅을 하고 PM 프롬프트를 만들고 GDD를 작성하면서 프로토타입 코드도 함께 작성했다. 4일차에 31개 피처를 폭발적으로 구현하기 전에, 아키텍처도 컨벤션도 확정하지 않은 상태였다.

Rhythm Rogue 1일차에는 코드를 한 줄도 작성하지 않았다. 대신 GDD 900줄, CLAUDE.md 342줄, asmdef 13개, 폴더 33개를 만들었다. 코드를 작성하기 전에 "어떤 코드를, 어떤 규칙으로, 어떤 구조에" 작성할지를 전부 확정한 것이다.

9일차 회고의 결론이 "AI에게 주는 입력의 품질이 출력의 품질을 결정한다"였다. GDD, CLAUDE.md, asmdef는 전부 AI에게 주는 입력이다. 이 입력의 품질을 1일차에 확보했으므로, 코드 작성이 시작되면 뱀서라이크 4일차와 같은 속도를 내면서도 뱀서라이크의 단점을 반복하지 않을 수 있다.

---

## 다음 단계

GDD와 인프라가 완성됐으니, 다음 작업은 코어 시스템 구현이다.

```text
우선순위:
1. BeatManager (BGM 비트 동기화, dspTime 기반)
2. RhythmPattern (20종 리듬 패턴 데이터 구조)
3. ParrySystem (4등급 패링 판정 로직)
4. PlayerController (3인칭 이동 + 콤보 입력)
5. EnemyRhythmAttack (리듬 패턴 기반 적 공격)
```

BeatManager가 모든 것의 기반이다. BGM의 비트를 정확하게 감지하고, 그 비트에 맞춰 적이 공격하고, 플레이어가 패링하는 전체 루프가 BeatManager 위에 올라간다. `AudioSettings.dspTime` 기반으로 프레임 독립적인 타이밍 시스템을 구축해야 한다. `Time.time`이나 `Time.deltaTime`에 의존하면 프레임 드랍 시 리듬이 어긋난다.

뱀서라이크에서 9일 걸린 것은 코드 작성만이 아니었다. 아키텍처를 중간에 바꾸고, 컨벤션을 소급 적용하고, 매직넘버를 정리하는 데 시간을 썼다. Rhythm Rogue에서는 그 시간을 1일차에 선투자했다. 이 투자가 실제로 회수되는지는 다음 포스트에서 확인할 수 있다.

---

*코드 0줄, GDD 900줄, CLAUDE.md 342줄, asmdef 13개 -- 뱀서라이크에서 배운 교훈을 새 프로젝트의 첫날에 전부 적용했다.*
