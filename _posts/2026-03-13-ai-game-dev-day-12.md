---
title: "AI로 게임 개발하기 - 12일차: 리듬에 맞춰 베고, 패링 후 반격하다"
description: "Unity 리듬 액션 게임 전투 루프 완성. 비트 판정 3단 콤보, 패링 후 4비트 반격, HitStop 타격감, 상태 머신 재진입 구현."
date: 2026-03-13
categories: [Project]
tags: [Unity, AI]
---

## 전투 루프가 돌아간다

<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;max-width:100%;">
  <iframe src="https://www.youtube.com/embed/9doBXRV4HCg" style="position:absolute;top:0;left:0;width:100%;height:100%;" frameborder="0" allowfullscreen></iframe>
</div>

[11일차](/blog/2026/03/10/ai-game-dev-day-11/)에서 패링 시스템의 판정 로직과 피드백(카메라, VFX, 슬로우모션)을 만들었다. 패링 한 번에 3채널 피드백이 겹치는 구조까지 완성했지만, 실제 전투는 패링만으로 이루어지지 않는다. 플레이어가 "공격"하고, 패링 성공 후 "반격"하는 루프가 필요하다.

12일차에서 이 루프를 완성했다. 비트에 맞춰야 공격이 나가고, 패링 성공 시 4비트 동안 반격 기회가 열리고, 반격이 적중하면 HitStop으로 화면이 멈춘다. 위 영상이 그 결과물이다.

---

## 리듬 공격 시스템 — 비트를 벗어나면 경직

11일차에서 만든 BeatJudge는 패링 타이밍을 평가하는 데 쓰였다. 12일차에서는 같은 BeatJudge를 공격에도 적용했다. 공격 버튼을 누르면 `BeatJudge.Judge(JudgeType.Attack)`가 호출되고, 현재 입력이 비트에서 얼마나 벗어났는지 판정한다.

```text
Perfect  ±80ms    최고 정밀도
Great    ±130ms   양호
Good     ±200ms   허용 범위
Miss     >200ms   공격 불발 → whiff penalty
```

11일차의 패링 판정(±80/150/250ms)과 윈도우 크기가 다르다. 패링은 적 공격이라는 반응형 이벤트에 대응하므로 윈도우가 넓고, 공격은 BGM 비트라는 예측 가능한 타이밍에 맞추므로 윈도우가 좁다. 같은 BeatJudge를 사용하되, JudgeType별로 윈도우를 분리한 설계다.

핵심은 Miss 판정이다. 비트에서 200ms 이상 벗어나면 공격 자체가 나가지 않는다. 0.5초 whiff penalty(경직)가 발생하고, 그 동안 플레이어는 무방비 상태가 된다. "아무 때나 연타하면 된다"는 전략이 통하지 않는 구조다.

### 3단 콤보

```text
방패 공격 (100%) → 베기1 (100%) → 베기2 (150%)
```

11일차에서는 4단 콤보(횡베기 → 역베기 → 찌르기 → 차지 발도)였다. 12일차에서 3단으로 줄였다. 이유는 실제 플레이 테스트에서 나왔다. 4단째까지 비트에 맞춰 연속 입력하는 건 리듬 게임 숙련자에게도 부담이 컸다. 콤보 길이를 줄이고 마지막 타의 대미지를 150%로 올려서, 짧지만 강한 콤보가 됐다.

콤보 대미지 배율은 누적된다. `1.0 + (comboCount × 0.02)`, 최대 2.0배. 콤보를 이어갈수록 한 타당 대미지가 올라간다. 콤보 타임아웃은 1.5초. 1.5초 내에 다음 공격이 들어가지 않으면 콤보가 끊기고 배율이 리셋된다. 쿨다운은 0.45초이므로, 비트에 맞추면서 0.45초~1.5초 사이에 다음 타를 넣어야 한다.

---

## 패링 반격 시스템 — 4비트 윈도우

11일차에서 패링 성공 후 2.0초 반격 윈도우를 만들었다. 12일차에서 이것을 "시간" 기반에서 "비트" 기반으로 변경했다. 반격 윈도우가 4비트(60BPM 기준 약 4초)로 열린다. 시간이 아니라 비트로 카운트다운하기 때문에, BPM이 바뀌어도 "4번의 비트 안에 반격"이라는 게임플레이 감각은 동일하다.

```csharp
// 패링 성공 시 상태 전이
stateMachine.TryTransitionTo(PlayerState.ParrySuccess);

// OnBeat 이벤트마다 남은 비트 카운트다운
remainingBeats--;
if (remainingBeats <= 0)
    ExitCounterWindow();
```

패링 성공 시 `PlayerState.ParrySuccess`로 전이된다. 이 상태에서 OnBeat 이벤트가 발행될 때마다 남은 비트가 하나씩 줄어든다. 4비트가 다 지나면 반격 윈도우가 닫히고 일반 상태로 복귀한다.

### 반격의 두 형태

반격 윈도우 안에서 공격 버튼을 누르면, 적과의 거리에 따라 두 가지 반격이 나뉜다.

```text
근거리  → Immediate Counter (즉시 반격)
원거리  → Leap Attack (돌진 후 반격)
```

Leap Attack은 적에게 돌진한 뒤 타격한다. 패링은 성공했지만 넉백으로 적이 밀려난 경우에 대응하는 형태다. 어느 쪽이든 반격 대미지는 `AttackPower × 2.0`이다. 콤보 배율이 적용되지 않는 고정 2.0배. 일반 공격의 콤보 배율 최대치가 2.0배인 걸 고려하면, 반격 한 방이 만렙 콤보와 동일한 대미지를 낸다. 패링의 보상이 명확하다.

### 패링 실패 페널티

패링을 남용할 수 없게 연속 미스 페널티를 넣었다. 패링 실패 시 쿨다운이 `whiffCooldown × consecutiveMisses`로 늘어난다. 최대 1.5초. 연속으로 틀리면 쿨다운이 길어져서 다음 패링 시도까지 시간이 걸린다. 한 번 성공하면 consecutiveMisses가 리셋된다.

11일차에서는 패링 실패 시 고정 0.3초 경직이었다. 12일차에서 이것을 "누적 페널티"로 발전시켰다. 스팸 방지라는 목적은 같지만, 연속 실패에 가중치를 주면서 "찍기"가 더 불리해졌다. 실력 차이가 페널티 크기로 드러난다.

---

## HitStop — 50ms의 타격감

타격감의 핵심 요소인 HitStop을 구현했다. 공격이 적중하는 순간 화면 전체가 멈추고, 짧은 정지 후 다시 움직인다. 격투 게임에서 보편적으로 쓰이는 기법이다.

```csharp
public class HitStopService
{
    public async UniTaskVoid Apply(float duration)
    {
        float savedTimeScale = Time.timeScale;
        Time.timeScale = 0f;
        await UniTask.Delay(
            TimeSpan.FromSeconds(duration),
            ignoreTimeScale: true);
        Time.timeScale = savedTimeScale;
    }
}
```

`Time.timeScale = 0`으로 게임 전체를 정지시키고, `WaitForSecondsRealtime`(여기서는 UniTask의 `ignoreTimeScale`)로 실제 시간 기준으로 대기한 뒤 복귀한다. 중요한 건 `savedTimeScale`이다. 슬로우모션 중에 HitStop이 발생할 수 있다. 11일차에서 만든 패링 슬로우모션(`Time.timeScale = 0.2f`) 도중에 반격이 적중하면, HitStop 후 timeScale이 0.2f로 복귀해야 한다. 1.0f로 복귀하면 슬로우모션이 깨진다.

### 일반 공격 vs 반격

```text
일반 공격 히트스톱: 0.05초 (50ms)
반격 히트스톱:      0.10초 (100ms)
```

반격의 히트스톱이 2배 길다. 50ms와 100ms — 수치로는 작은 차이지만 체감은 크다. 일반 공격은 "톡" 하고 멈추는 느낌, 반격은 "쿵" 하고 박히는 느낌이다. 11일차에서 패링 피드백의 등급별 차이(Perfect > Great > Good)를 강조했듯이, 공격 종류별로도 피드백 강도를 차별화했다.

이 값들은 `CombatTimingConfigSO`(ScriptableObject)에서 설정한다. 코드 수정 없이 Inspector에서 조절할 수 있어서, 플레이 테스트 중 실시간으로 튜닝할 수 있다.

---

## 상태 머신 개선 — 재진입 가능 상태

콤보 구현에서 예상치 못한 문제가 발생했다. PlayerStateMachine이 동일 상태로의 전이를 차단하고 있었다. `Attacking → Attacking`이 불가능하므로, 콤보의 2타, 3타가 상태 머신을 통과하지 못했다.

11일차에서 PlayerAttack이 상태 머신을 우회하는 워크라운드를 쓰고 있었다. 상태 머신을 거치지 않고 직접 콤보 단계를 관리한 것이다. 작동은 했지만, 상태 머신의 전이 규칙과 별개의 로직이 존재하는 셈이라 캔슬 규칙과 충돌할 여지가 있었다.

### ReenterableStates

```csharp
private readonly HashSet<PlayerState> _reenterableStates = new()
{
    PlayerState.Attacking
};

public bool TryTransitionTo(PlayerState newState)
{
    if (newState == CurrentState && !_reenterableStates.Contains(newState))
        return false;

    // 동일 상태 재진입 시에도 타이머 리셋 + OnStateChanged 발행
    _stateTimer = 0f;
    OnStateChanged?.Invoke(newState);
    CurrentState = newState;
    return true;
}
```

`ReenterableStates` HashSet에 `Attacking`을 등록했다. `TryTransitionTo`에서 동일 상태 전이 시, HashSet에 포함된 상태면 전이를 허용한다. 타이머를 리셋하고 `OnStateChanged`를 다시 발행한다. 이제 콤보의 매 타격이 `TryTransitionTo(Attacking)`을 정상적으로 호출한다. 워크라운드 제거, 상태 머신이 모든 전이를 관리한다.

이 패턴은 Attacking에만 한정되지 않는다. 향후 다른 상태가 재진입이 필요하면 HashSet에 추가하면 된다. 범용적인 해결책이다.

---

## 전투 루프 전체 흐름

12일차에서 만든 시스템들이 하나의 루프로 연결된다.

```text
BGM 비트 → 플레이어 공격 (비트 판정) → 적 피격
                                         ↓
적 텔레그래프 (눈 빛) → 적 공격 → 플레이어 패링 판정
                                         ↓
                                  패링 성공 → 4비트 반격 윈도우
                                         ↓
                                  반격 (2.0x) + HitStop (100ms)
                                         ↓
                                  다시 비트에 맞춰 공격 →  ...
```

공격, 패링, 반격이 비트를 축으로 순환한다. 비트에서 벗어나면 whiff penalty, 비트에 맞추면 콤보가 이어지고, 패링 성공 시 반격으로 큰 대미지를 넣는다. 리듬 게임의 타이밍 정밀도가 액션 게임의 전투 보상과 직결되는 구조다.

---

## 다음 단계

코어 전투 루프는 완성됐다. 공격 → 패링 → 반격의 사이클이 돌아간다. 하지만 아직 "한 종류의 적"과 "한 가지 BGM"에서만 테스트한 상태다.

```text
우선순위:
1. 적 패턴 다양화 (연속 공격, 페인트, 패링 불가 공격)
2. BGM BPM 변화에 따른 난이도 조절
3. 로그라이크 런 구조 (전투 → 보상 → 다음 전투)
```

특히 패링 불가 공격이 중요하다. 모든 공격을 패링할 수 있으면, 패링만 반복하는 것이 최적 전략이 된다. 패링 불가 공격을 섞어서 "회피해야 하는 공격"과 "패링해야 하는 공격"을 구분하게 만들어야 한다. 텔레그래프 색상으로 구분할 계획이다 — 빨간 눈은 패링 가능, 보라 눈은 회피만 가능.

---

*비트에 맞춰 3단 콤보를 넣고, 패링 성공 시 4비트 안에 2.0배 반격을 꽂고, 50ms 히트스톱으로 타격감을 찍는다 — 리듬과 액션이 하나의 전투 루프로 엮인 12일차.*
