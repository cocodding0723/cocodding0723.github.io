---
title: "AI로 게임 개발하기 - 11일차: 패링의 쾌감을 만드는 법"
description: "dspTime 기반 리듬 엔진 위에 4등급 패링 시스템을 구축. 87개 테스트, 44개 스크립트, Phase 1 코어 전투 프로토타입 완성."
date: 2026-03-10
categories: [Project]
tags: [Unity, AI]
---

## 코드 0줄에서 44개 스크립트로

<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;max-width:100%;">
  <iframe src="https://www.youtube.com/embed/lcAxdUnSIZ0" style="position:absolute;top:0;left:0;width:100%;height:100%;" frameborder="0" allowfullscreen></iframe>
</div>

[10일차](/blog/2026/03/09/ai-game-dev-day-10/)에서 GDD 900줄, CLAUDE.md 342줄, asmdef 13개를 만들고 코드는 0줄이었다. "이 투자가 실제로 회수되는지는 다음 포스트에서 확인할 수 있다"고 마무리했다.

결론부터 말하면, 회수됐다. 11일차에 Phase 1 코어 전투 프로토타입을 완성했다. C# 스크립트 44개, EditMode 테스트 87개. 순환 의존성 0개, 싱글톤 0개. 위 영상이 그 결과물이다.

---

## 리듬 엔진 — 패링의 기반

패링 시스템을 만들기 전에, 먼저 리듬 엔진이 필요하다. 패링 판정의 기준이 "비트"이기 때문이다.

### dspTime을 쓰는 이유

Unity에서 시간을 재는 방법은 여러 가지다. `Time.time`, `Time.deltaTime`, `Time.unscaledTime`. 리듬 게임에서는 전부 부적절하다.

```csharp
// 프레임 기반 시간 — 프레임 드랍 시 리듬이 어긋남
elapsed += Time.deltaTime; // 60fps에서 16.7ms, 30fps에서 33.3ms — 누적 오차 발생

// 오디오 DSP 시간 — 프레임과 무관하게 정확
double songPosition = AudioSettings.dspTime - _songStartDspTime;
```

`AudioSettings.dspTime`은 오디오 하드웨어의 클럭을 직접 읽는다. 프레임이 30fps로 떨어지든 1000fps로 올라가든, 오디오 클럭은 일정하다. 리듬 게임의 판정은 밀리초 단위인데, `Time.deltaTime` 누적으로는 이 정밀도를 보장할 수 없다.

### RhythmManager

`RhythmManager`는 dspTime 기반으로 비트를 추적하고, R3 Observable 스트림으로 이벤트를 발행한다.

```csharp
// R3 Observable 스트림
Observable<BeatEvent> OnBeat;      // 비트마다 발행
Observable<BeatEvent> OnHalfBeat;  // 반비트마다 발행
Observable<BeatEvent> OnMeasure;   // 마디마다 발행
```

비트 이벤트를 구독하는 시스템이 여럿이다. 적 AI는 비트에 맞춰 공격하고, 카메라는 비트에 맞춰 미세하게 펄스하고, UI는 비트 인디케이터를 갱신한다. R3의 Observable 패턴이 이 1:N 관계를 깔끔하게 처리한다.

오디오 레이턴시 오프셋 보정도 포함했다. 블루투스 이어폰 사용 시 50~200ms의 레이턴시가 발생하는데, 이 오프셋을 설정에서 보정할 수 있다.

### BeatJudge — 입력 타이밍 평가

```text
Perfect  ±50ms
Great    ±100ms
Good     ±150ms
Miss     >150ms
```

BeatJudge는 플레이어 입력 시각과 가장 가까운 비트의 시간차를 계산해서 등급을 매긴다. 9개 경계값 테스트를 작성했다. 정확히 50ms에서 Perfect→Great 전환, 100ms에서 Great→Good 전환, 150ms에서 Good→Miss 전환이 일어나는지 검증한다. 경계값 버그는 나중에 발견하면 원인 추적이 어렵다. 처음부터 테스트로 잡아둔다.

---

## 패링 시스템 — 핵심

리듬 엔진 위에 패링 시스템을 올렸다. 이 게임의 핵심 메카닉이다.

### 판정 구조

패링은 "적 공격이 도달하는 시점"과 "플레이어가 패링 버튼을 누른 시점"의 시간차로 판정한다. BeatJudge가 "비트에 맞춘 입력인가"를 판정하는 것과 달리, 패링은 "적 공격에 맞춘 반응인가"를 판정한다. 같은 등급명을 쓰지만 기준이 다르다.

```text
Perfect  ≤80ms    반격 대미지 200%, 리듬 게이지 +15
Great    ≤150ms   반격 대미지 150%, 리듬 게이지 +8
Good     ≤250ms   반격 대미지 100%, 리듬 게이지 +3
Miss     >250ms   피격, 콤보 리셋
```

GDD에서는 ±50/100/200ms로 설계했지만, 구현 후 실제 플레이 테스트에서 윈도우를 넓혔다. 비트 판정은 예측 가능한 타이밍(BGM 비트)을 기준으로 하지만, 패링은 적 공격 도달이라는 반응형 이벤트를 기준으로 한다. 반응 시간이 추가로 필요하므로 윈도우를 ≤80/150/250ms로 조정했다. GDD 수치는 출발점이고, 실제 체감은 구현 후 조율해야 한다.

패링 스팸을 방지하기 위해 쿨다운 시스템을 넣었다. 패링 실패 시 0.3초 경직이 발생한다. GDD에서 이미 명시한 수치다. 10일차에서 "에지 케이스를 기획 단계에서 정의한다"는 원칙을 세웠는데, 구현 단계에서 바로 효과를 봤다. "패링 스팸 어떻게 처리하지?"라는 고민 없이 GDD의 0.3초 경직을 그대로 구현하면 됐다.

패링 성공 후에는 2.0초간 반격 윈도우가 열린다. 이 윈도우 안에서 공격하면 반격 대미지 보너스가 적용된다.

### ICombatTarget — 순환 참조를 끊는 설계

패링 시스템의 데이터 흐름은 이렇다.

```text
Enemy가 공격 → Player가 수신 → 패링/회피/피격 판정 → 결과를 Enemy에게 반환
```

여기서 문제가 생긴다. Enemy가 Player를 알아야 공격을 보내고, Player가 Enemy를 알아야 반격을 보낸다. 양방향 참조다. 뱀서라이크에서 이런 패턴이 의존성을 뒤엉키게 만들었다.

해결책은 `ICombatTarget` 인터페이스다.

```csharp
public interface ICombatTarget
{
    AttackReceiveResult ReceiveAttack(AttackData attackData);
}

public struct AttackReceiveResult
{
    public CombatOutcome Outcome;  // Parried, Dodged, Hit, Blocked
    public float DamageDealt;
    public ParryGrade ParryGrade;  // Perfect, Great, Good, None
}
```

Enemy는 `ICombatTarget`에게 공격을 보낸다. Player의 구체적인 타입을 모른다. Player는 `ICombatTarget`을 구현하면서 내부에서 패링/회피/피격 판정을 처리하고, `AttackReceiveResult`로 결과를 돌려준다. Enemy는 결과만 보고 다음 행동(경직, 반격 당함 등)을 결정한다.

asmdef 구조에서 `RhythmRogue.Player`와 `RhythmRogue.Enemy`가 서로를 참조하지 않는다. 둘 다 `RhythmRogue.Combat`의 `ICombatTarget`만 참조한다. 10일차에서 세운 단방향 의존성 원칙이 실제 코드에서 작동하는 모습이다.

---

## 패링 피드백 — 쾌감의 실체

패링 판정 로직만으로는 "쾌감"이 없다. `bool isParried = true`는 아무 감각도 전달하지 않는다. 쾌감은 피드백에서 나온다. 카메라, VFX, UI가 동시에 반응해야 플레이어가 "지금 내가 뭔가를 해냈다"고 느낀다.

### ParryCameraEffect — 3단계 시퀀스

패링 성공 시 카메라가 3단계로 움직인다.

```text
1단계 (0~0.1s)   접촉점 줌인 + 패링 방향으로 roll
2단계 (0.1~0.3s) 넉백 추적 + 클로즈업 + 슬로우모션 (timescale 20%)
3단계 (0.3~0.6s) Cinemachine Blend로 원래 카메라 복귀
```

1단계에서 카메라가 패링 접촉점으로 빠르게 이동한다. FOV를 좁히고, 패링 방향으로 약간 기울인다(roll). 플레이어의 시선이 접촉점에 집중된다.

2단계가 핵심이다. `Time.timeScale = 0.2f`로 슬로우모션이 걸린다. 적이 밀려나는 동작이 느리게 재생되면서, 카메라가 클로즈업 상태를 유지한다. 0.2초간이지만 체감상 훨씬 길게 느껴진다. 젠레스 존 제로의 패링 연출에서 가장 인상적인 부분이 바로 이 슬로우모션 구간이다.

3단계에서 Cinemachine의 블렌드 기능으로 원래 게임플레이 카메라로 부드럽게 복귀한다.

등급별로 강도가 다르다. Perfect가 가장 극적이다. FOV 변화량, roll 각도, 넉백 거리, 슬로우모션 지속 시간이 전부 Perfect > Great > Good으로 스케일링된다. Good 패링도 성공이지만, Perfect 패링은 화면 전체가 반응한다. 이 차이가 플레이어에게 "더 정확하게 맞추고 싶다"는 동기를 부여한다.

### ParrySparkVFX — 패링 스파크

시각적 피드백의 두 번째 요소는 스파크 이펙트다.

```text
구성 요소:
- Stretched Billboard 파티클 (T_SparkStreak 64x16)
- Flash 이펙트 (T_SparkFlash 32x32)
- PointLight (순간 점등)
```

스폰 위치는 무기 본(bone)을 우선 탐색하고, 없으면 플레이어와 적의 중간점에 생성한다. 오브젝트 풀링으로 단일 인스턴스를 재사용한다. 매번 Instantiate/Destroy하면 GC 스파이크가 발생하는데, 패링은 매 비트마다 시도될 수 있으므로 풀링이 필수다.

Perfect 등급에서는 파티클 수가 1.5배, 라이트 강도가 2배로 올라간다. 카메라 연출과 마찬가지로, 등급별 피드백 차이가 "더 정확하게"라는 동기를 만든다.

### ParryResultUI — 등급 팝업

```text
Perfect → 금색
Great   → 파란색
Good    → 초록색
Miss    → 빨간색
```

화면에 등급 텍스트가 팝업으로 뜬다. 색상만으로 결과를 즉시 인지할 수 있다. 카메라 연출 + 스파크 VFX + 등급 팝업이 동시에 발생하면서, 패링 한 번에 3채널의 피드백이 겹친다. 이 레이어링이 "쾌감"의 실체다.

---

## 적 공격 → 패링 루프

패링이 의미를 가지려면 "패링할 공격"이 필요하다. 적의 공격 시스템을 리듬 엔진과 연결했다.

### EnemyStateMachine — 9상태

```text
Spawn → Idle → Approach → Telegraph → Attack → Recover → Hit → Stun → Dead
```

상태 전이 테스트가 24개다. "Telegraph 상태에서 피격 → Hit 전이", "Stun 상태에서 일정 시간 경과 → Idle 전이", "Dead 상태에서 어떤 입력도 전이 불가" 같은 케이스를 전부 검증한다.

### EnemyRhythmAttack — 비트 동기화 공격

적은 온비트 패턴(8비트 간격)으로 공격한다. 공격 시퀀스는 3단계다.

```text
Telegraph (1.0s) → Attack (0.558s) → Recover (1.0s)
```

Telegraph는 "곧 공격이 온다"는 예고다. 이 1초 동안 플레이어가 패링을 준비한다. Attack에서 실제 판정이 발생하고, Recover에서 적이 경직된다. Recover 동안 반격할 수 있다.

### EyeGlowController — 공격 예고 VFX

Telegraph 단계에서 적의 눈이 빨갛게 빛난다. "패링 가능한 공격이 온다"는 시각적 신호다.

처음에는 Material의 Emission 값을 올리는 방식으로 구현했지만, 모델마다 Material 구조가 달라서 범용성이 떨어졌다. Particle VFX 방식으로 전환했다.

```text
- CrossStar 파티클, URP Particles/Unlit, Additive 블렌딩
- ZTest=Always (벽 뒤에서도 보임, 게임플레이 우선)
- 머리 본 추적 + LateUpdate
- EaseIn 커브 → 피크 버스트 → 0.15초 페이드
```

`ZTest=Always`가 중요한 결정이다. 적이 오브젝트 뒤에 있어도 눈 빛이 보인다. 리얼리즘보다 가독성을 선택한 것이다. 리듬 게임에서 "공격이 온다"는 신호를 놓치면 게임 경험이 무너진다. 항상 보이는 텔레그래프가 정답이다.

---

## 플레이어 전투 시스템

### PlayerStateMachine — 12상태

```text
Idle, Moving, Attacking, Parrying, ParrySuccess, ParryFail,
Dodging, Hit, StrongAttack, WhiffAttack, Dead, Ultimate
```

캔슬 규칙이 핵심이다.

```text
Attack → Parry/Dodge  가능 (공격 중 패링/회피로 전환)
Parrying → 캔슬 불가  (패링 모션은 끊기지 않음)
StrongAttack → 캔슬 불가  (슈퍼아머, 대신 높은 대미지)
```

Attack에서 Parry로 캔슬할 수 있다는 건, 공격 도중에 적의 텔레그래프를 보고 패링으로 전환할 수 있다는 뜻이다. 공격과 방어가 유기적으로 연결된다. 반면 Parrying 상태는 캔슬 불가다. 패링을 시도하면 결과(성공/실패)가 나올 때까지 기다려야 한다. 무분별한 입력 전환을 방지한다. 14개 전이 테스트가 이 규칙을 보장한다.

### PlayerAttack — 비트 동기화 4단 콤보

```text
횡베기 (100%) → 역베기 (100%) → 찌르기 (110%) → 차지 발도 (150%)
```

콤보는 비트에 맞춰야 연결된다. 비트와 어긋난 타이밍에 공격하면 0.5초 경직이 발생한다(whiff penalty). "아무때나 버튼을 연타"하면 오히려 손해다. 리듬에 맞춰 공격해야 콤보가 이어지고, 대미지가 올라간다.

### ComboTracker — 이중 게이지 구현

10일차에서 설계한 이중 게이지(공격 → 스킬 게이지, 패링 → 리듬 게이지)를 구현했다. 구현 과정에서 추가된 것은 엣지 케이스 처리다. 게이지가 100%를 넘을 때 오버플로우 방지, 궁극기 발동 후 즉시 리셋, 사망 시 전체 리셋 — 12개 테스트로 이 로직들을 검증한다.

### PlayerInputBuffer — 200ms 윈도우

입력이 상태 전이보다 빨리 들어올 수 있다. 패링 모션이 끝나기 직전에 공격 버튼을 누르면, 그 입력을 200ms 동안 버퍼에 보관했다가 상태 전이가 가능해지는 순간 실행한다.

```text
우선순위: Dodge > Parry > StrongAttack > Attack
```

Dodge가 최우선이다. 위험 회피가 가장 중요하기 때문이다. 같은 프레임에 Dodge와 Attack이 버퍼에 있으면 Dodge가 실행된다.

### PlayerMovement — 예측 슬로우모션 회피

대시 시작 시 `OverlapSphere`로 주변 적을 감지한다. 범위 내에 적 공격이 있으면 자동으로 `Time.timeScale = 0.2f`가 적용된다. 패링과 마찬가지로 슬로우모션이 "방금 위험한 상황을 피했다"는 감각을 증폭시킨다. BeatJudge와 연동해서, 비트에 맞춘 회피일수록 슬로우모션이 길어진다.

---

## 아키텍처 & 테스트

### 87개 EditMode 테스트

| 테스트 클래스 | 테스트 수 | 검증 대상 |
|--------------|-----------|-----------|
| BeatJudgeTests | 9 | 타이밍 경계값, 등급 판정 |
| PlayerStateMachineTests | 14 | 상태 전이, 캔슬 규칙 |
| EnemyStateMachineTests | 24 | 9상태 전이, 엣지 케이스 |
| HealthComponentTests | 19 | HP 증감, 사망, 무적 |
| DamageCalculatorTests | 19 | 대미지 공식, 등급 보너스 |
| ComboTrackerTests | 12 | 게이지 충전, 오버플로우 |

뱀서라이크에서 4일차에 31개 피처를 구현하면서 테스트는 한 줄도 없었다. 6일차에야 "아, 테스트가 필요하다"고 깨달았다. Rhythm Rogue에서는 10일차에 세운 "구현+테스트 동시" 원칙을 그대로 실행했다. 44개 스크립트, 87개 테스트. 2:1 비율이다.

### 싱글톤 0개, 순환 의존성 0개

VContainer DI로 모든 의존성을 주입한다. `RhythmManager`, `BeatJudge`, `DamageCalculator` 전부 DI 컨테이너에서 resolve된다. 싱글톤이 하나도 없다.

asmdef 13개가 순환 참조를 물리적으로 차단한다. `RhythmRogue.Player`가 `RhythmRogue.Enemy`를 참조하려고 하면 컴파일 에러가 난다. `ICombatTarget` 인터페이스를 통해서만 소통한다. 10일차에서 설계한 아키텍처가 코드로 실현된 것이다.

---

## 뱀서라이크 4일차 vs Rhythm Rogue 2일차

뱀서라이크 4일차에 31개 피처를 몰아 구현했다. Rhythm Rogue 2일차에는 44개 스크립트를 작성했다. 비슷한 규모의 작업이지만 과정이 다르다.

| 항목 | 뱀서라이크 4일차 | Rhythm Rogue 2일차 |
|------|-----------------|---------------------|
| 스크립트 수 | 31개 피처 | 44개 스크립트 |
| 테스트 | 0개 | 87개 |
| 싱글톤 | GameEvents 등 다수 | 0개 |
| 순환 의존성 | 미확인 (asmdef 없음) | 0개 (asmdef 강제) |
| 아키텍처 기반 | 없음 (직접 참조) | VContainer DI + ICombatTarget |
| 코드 컨벤션 | 없음 | CLAUDE.md 342줄 |

인프라를 먼저 갖추고 구현한 결과다. 일차에 투자한 GDD, CLAUDE.md, asmdef가 2일차 구현 속도와 품질 모두에 영향을 미쳤다. GDD에 수치가 확정되어 있으니 구현할 때 "이 값은 얼마로 하지?"라는 고민이 없다. CLAUDE.md에 컨벤션이 명시되어 있으니 AI가 일관된 코드를 생성한다. asmdef가 모듈 경계를 강제하니 순환 참조가 불가능하다.

---

## 다음 단계

Phase 1 코어 전투 프로토타입이 완성됐다. 리듬 엔진, 패링 시스템, 적 AI, 플레이어 전투가 하나의 루프로 연결된다. 다음은 이것들을 실제 씬에 배치하고 플레이 가능한 상태로 만드는 작업이다.

```text
우선순위:
1. 프로토타입 씬 구성 (플레이어 + 적 1체 + BGM)
2. 리듬 패턴 확장 (온비트 외 추가 패턴)
3. 로그라이크 런 구조 (전투 → 보상 → 다음 전투)
4. 캐릭터 차별화 (케이든 외 추가 캐릭터)
```

코드는 준비됐다. 다음 단계는 이 코드가 "플레이 가능한 게임"이 되는 과정이다.

---

*44개 스크립트, 87개 테스트, 싱글톤 0개 -- 인프라 위에서 만든 패링 시스템은 코드뿐 아니라 카메라, VFX, 슬로우모션이 겹쳐야 비로소 "쾌감"이 된다.*
