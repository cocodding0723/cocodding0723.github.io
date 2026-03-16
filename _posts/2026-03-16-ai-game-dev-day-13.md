---
title: "AI로 게임 개발하기 - 13일차: 히트 판정을 애니메이션에 묶다"
description: "코루틴 히트 딜레이를 StateMachineBehaviour의 normalizedTime으로 교체. Animator speed 변화에도 자동 동기화되는 히트 판정 구조."
date: 2026-03-16
categories: [Project]
tags: [Unity, AI]
---

## 타이밍이 어긋나는 문제

[12일차](/blog/2026/03/13/ai-game-dev-day-12/)에서 전투 루프를 완성했다. 비트 기반 3단 콤보, 패링 반격, HitStop까지 한 사이클이 돌아가는 상태였다. 그런데 콤보 애니메이션을 다듬기 시작하자 문제가 드러났다.

일반 공격의 히트 판정은 코루틴으로 구현되어 있었다. 공격 상태에 진입하면 코루틴이 시작되고, 일정 시간(`_attackHitDelays` 배열) 대기 후 히트 판정을 발동하는 방식이다. 문제는 이 "일정 시간"이 애니메이션 클립 길이와 하드코딩으로 매칭되어 있다는 점이었다.

```text
Attack1 클립: 0.5초 → hitDelay: 0.2초 (40% 지점)
Attack2 클립: 0.6초 → hitDelay: 0.24초 (40% 지점)
Attack3 클립: 0.8초 → hitDelay: 0.32초 (40% 지점)
```

클립 길이가 고정이면 작동한다. 하지만 현실은 그렇지 않다.

---

## 코루틴 히트 딜레이의 한계

세 가지 상황에서 타이밍이 어긋난다.

**1. Animator speed 변경**

전투 속도를 올리고 싶을 때 `Animator.speed`를 조절하는 건 흔한 패턴이다. 그런데 코루틴의 대기 시간은 `Time.deltaTime` 기반이지, Animator speed를 따르지 않는다. Animator speed를 1.5배로 올리면 애니메이션은 빨라지는데 히트 판정은 원래 타이밍에 발동한다. 칼이 이미 지나간 뒤에 대미지가 들어간다.

**2. Transition blending**

State 간 전이에 블렌딩이 걸리면 실제 애니메이션 재생 타이밍이 미세하게 달라진다. 코루틴은 이 블렌딩을 전혀 인식하지 못한다.

**3. 콤보별 개별 관리**

각 콤보 단계(Attack1, Attack2, Attack3)마다 별도의 히트 딜레이 값을 배열로 관리해야 했다. 콤보가 3단이면 3개, 나중에 5단으로 늘리면 5개. 클립을 교체할 때마다 딜레이 값도 같이 수정해야 한다. 애니메이터와 코드 사이에 암묵적 의존이 생긴다.

근본 원인은 명확하다. **히트 판정의 타이밍 기준이 애니메이션이 아니라 "절대 시간"이기 때문이다.** 애니메이션과 동기화하려면, 애니메이션 자체에서 타이밍을 가져와야 한다.

---

## StateMachineBehaviour로 전환

Unity의 `StateMachineBehaviour`는 Animator State에 직접 부착되는 컴포넌트다. `OnStateEnter`, `OnStateUpdate`, `OnStateExit`에서 해당 State의 `normalizedTime`(0~1)에 접근할 수 있다. 애니메이션 재생 진행률 그 자체다.

새로 만든 `AttackHitStateBehaviour`의 전체 코드다.

```csharp
namespace RhythmRogue.Player
{
    using UnityEngine;

    public class AttackHitStateBehaviour : StateMachineBehaviour
    {
        [Header("히트 판정 설정")]
        [Range(0f, 1f)]
        [SerializeField] private float _hitNormalizedTime = 0.4f;

        [SerializeField] private bool _isCounterAttack;

        private PlayerAttack _playerAttack;
        private bool _hasFired;

        public override void OnStateEnter(
            Animator animator,
            AnimatorStateInfo stateInfo,
            int layerIndex)
        {
            _hasFired = false;
            if (_playerAttack == null)
                _playerAttack = animator.GetComponent<PlayerAttack>();
        }

        public override void OnStateUpdate(
            Animator animator,
            AnimatorStateInfo stateInfo,
            int layerIndex)
        {
            if (_hasFired || _playerAttack == null) return;

            float normalizedTime = stateInfo.normalizedTime % 1f;
            if (normalizedTime >= _hitNormalizedTime)
            {
                _hasFired = true;
                if (_isCounterAttack)
                    _playerAttack.TriggerCounterHitDetection();
                else
                    _playerAttack.TriggerNormalHitDetection();
            }
        }
    }
}
```

---

## 설계 포인트

### normalizedTime의 의미

`stateInfo.normalizedTime`은 0에서 시작해 1이면 클립 한 바퀴 재생 완료다. `% 1f`를 하는 이유는 루프 애니메이션에서 1을 넘길 수 있기 때문이다. 공격 애니메이션은 루프하지 않지만, 방어적으로 처리한다.

핵심은 이 값이 **Animator speed, transition blending을 모두 반영한다**는 점이다. `Animator.speed = 2.0f`로 설정하면 normalizedTime이 2배 빠르게 진행되고, 히트 판정도 2배 빠르게 발동한다. 코루틴에서는 불가능했던 자동 동기화다.

### State 단위 동작

이 Behaviour는 Animator Controller의 각 State에 개별 부착된다. Attack1, Attack2, Attack3 State에 각각 하나씩. State마다 `_hitNormalizedTime`을 다르게 설정할 수 있다. 방패 공격(Attack1)은 0.3, 베기(Attack2, Attack3)는 0.4처럼. Inspector에서 조절하므로 코드 수정이 필요 없다.

```text
Attack1 State → AttackHitStateBehaviour (hitTime: 0.4)
Attack2 State → AttackHitStateBehaviour (hitTime: 0.4)
Attack3 State → AttackHitStateBehaviour (hitTime: 0.4)
```

### _hasFired 플래그

한 State 진입당 한 번만 히트 판정을 발동한다. `OnStateEnter`에서 false로 초기화하고, 발동 시 true로 전환. 단순하지만 필수적인 가드다. 이 플래그가 없으면 `OnStateUpdate`가 매 프레임 호출되므로, normalizedTime 조건을 만족하는 동안 매 프레임 히트 판정이 발생한다.

---

## PlayerAttack 변경 사항

코루틴 기반 히트 판정 코드를 전부 제거하고, StateMachineBehaviour에서 호출할 public 메서드를 추가했다.

**제거된 것들:**

| 항목 | 역할 |
|------|------|
| `_attackHitDelays` 배열 | 콤보 단계별 히트 딜레이 값 |
| `_hitDetectionCoroutine` | 코루틴 참조 |
| `StartHitDetectionCoroutine()` | 코루틴 시작 |
| `DelayedHitDetectionCoroutine()` | 실제 대기 + 판정 로직 |
| `GetAttackHitDelay()` | 딜레이 값 조회 |
| `CancelPendingHitDetection()` | 코루틴 취소 |

**추가된 것들:**

| 항목 | 역할 |
|------|------|
| `TriggerNormalHitDetection()` | StateMachineBehaviour에서 호출하는 진입점 |
| `TriggerCounterHitDetection()` | 반격 히트 판정 진입점 |
| `_pendingComboStep` | 히트 판정 시점에 참조할 콤보 단계 |
| `_pendingAttackResult` | 히트 판정 시점에 참조할 비트 판정 결과 |

코루틴 6개 항목이 메서드 2개 + 필드 2개로 줄었다. 코드량 자체도 줄었지만, 더 중요한 건 **`PlayerAttack`이 더 이상 히트 타이밍을 알 필요가 없다**는 점이다. 타이밍은 Animator가 관리하고, `PlayerAttack`은 "히트가 발동됐을 때 무엇을 할지"만 담당한다.

---

## 대미지 계산 버그 수정

StateMachineBehaviour로 전환하면서 기존에 숨어 있던 버그가 드러났다.

기존 `CalculateAttackDamage()`는 `_currentComboStep`을 참조해서 콤보 단계별 대미지 배율을 적용했다. 문제는 `_currentComboStep`이 공격 시작 시점에 이미 증가한다는 것이다.

```text
공격 시작 → _currentComboStep++ (1 → 2)
  ... 애니메이션 재생 ...
히트 발동 → CalculateAttackDamage() → _currentComboStep은 이미 2
```

1타의 대미지를 계산하는데 2타의 배율이 적용된다. 코루틴 시절에는 딜레이가 짧아서 체감하기 어려웠지만, 구조적으로 잘못된 코드였다.

수정은 간단하다. 공격 시작 시 `_pendingComboStep`에 현재 단계를 저장하고, `CalculateAttackDamage()`에서 `_pendingComboStep`을 참조한다. 히트 발동 시점이 아니라 공격 시작 시점의 콤보 단계를 사용하는 것이다.

```csharp
// 공격 시작 시
_pendingComboStep = _currentComboStep;
_currentComboStep++;

// 히트 발동 시 (StateMachineBehaviour에서 호출)
public void TriggerNormalHitDetection()
{
    float damage = CalculateAttackDamage(_pendingComboStep);
    // ...
}
```

---

## 반격은 왜 코루틴을 유지하는가

일반 공격은 StateMachineBehaviour로 깔끔하게 전환했다. 반격(Counter Attack)은 그렇지 않다. 기존 코루틴(`StartCounterHitCoroutine`, `CounterHitDelayCoroutine`)을 그대로 유지했다.

이유는 반격의 실행 시퀀스가 단일 Animator State로 표현되지 않기 때문이다.

```text
반격 시퀀스:
패링 성공 → 도약(Leap) → [공중 이동] → 착지 감지 → 스윙 → 히트 판정
```

도약 중에는 Animator State가 달라질 수 있고, 착지 시점은 `PlayerMovement.IsLeaping` 플래그로 감지해야 한다. 물리 기반 이동과 애니메이션이 얽혀 있는 복합 시퀀스다. StateMachineBehaviour 하나로는 도약-착지-스윙을 제어할 수 없다.

적절한 도구를 적절한 곳에 쓰는 것이 중요하다. 일반 공격처럼 "하나의 State 안에서 특정 시점에 발동"하는 경우는 StateMachineBehaviour가 최적이다. 반격처럼 "여러 State와 물리 이벤트를 가로지르는 시퀀스"는 코루틴이 여전히 적합하다.

---

## 정리

| 항목 | Before (12일차) | After (13일차) |
|------|-----------------|----------------|
| 히트 타이밍 기준 | 절대 시간 (코루틴 대기) | normalizedTime (애니메이션 진행률) |
| Animator speed 대응 | 불가 | 자동 동기화 |
| 콤보별 설정 위치 | 코드 내 배열 | Inspector (State별) |
| 코드 복잡도 | 코루틴 6개 항목 | 메서드 2개 + 필드 2개 |
| 반격 히트 판정 | 코루틴 | 코루틴 (유지) |

12일차에서 HitStop을 코루틴 + UniTask의 `ignoreTimeScale`로 구현한 건 올바른 선택이었다. HitStop은 `Time.timeScale = 0`에서도 동작해야 하므로 코루틴이 맞다. 하지만 히트 판정 자체는 애니메이션과 동기화되어야 하므로, StateMachineBehaviour가 맞다. 같은 "타이밍 제어"라도 맥락에 따라 최적의 도구가 다르다.

---

*코루틴으로 "언제" 때릴지 코드에 적던 히트 판정을, StateMachineBehaviour의 normalizedTime으로 애니메이션 자체에 묶었다 -- 타이밍의 주인을 애니메이터에게 돌려준 13일차.*
