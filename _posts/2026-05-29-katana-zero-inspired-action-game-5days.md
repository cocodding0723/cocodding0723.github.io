---
title: "5일 만에 만든 카타나 제로 스타일 액션 게임 — R3, VContainer, FEEL, VFX Graph"
description: "카타나 제로의 타격감에서 출발해 R3 반응형 아키텍처, VContainer DI, FEEL 히트스톱, VFX Graph 이펙트로 5일간 게임을 만들면서 게임 설계의 중요성을 몸으로 배운 기록."
date: 2026-05-29
categories: [Project]
tags: [Unity, C#, Game]
---

## 시작 — 카타나 제로의 타격감

카타나 제로를 처음 플레이했을 때 가장 인상 깊었던 건 스토리가 아니라 타격감이었다. 칼이 적에게 닿는 순간 화면이 살짝 멈추고, 피가 터지고, 사운드가 꽉 차는 그 0.1초. 그 감각 하나를 직접 구현해보고 싶어서 5일 스프린트를 시작했다.

결과물은 유튜브에 올렸다: [링크](https://youtu.be/hp6LrmIztKU?si=3nydBbRO-r8ebuez)

기술 스택은 R3, VContainer, FEEL, VFX Graph, DOTween. 각각 왜 선택했는지, 어떻게 썼는지 정리한다.

---

## R3 — 이벤트를 흐름으로 다루기

R3는 UniRx의 후속 라이브러리다. `Observable`로 게임 내 이벤트를 스트림으로 연결할 수 있다. 왜 썼냐면, 액션 게임에서 입력 → 판정 → 피드백 파이프라인이 콜백 지옥이 되기 쉽기 때문이다.

```csharp
// AttackSystem.cs
_inputProvider.OnAttackPerformed
    .Where(_ => _stateModel.CanAttack.CurrentValue)
    .Select(_ => Physics2D.OverlapCircleAll(
        _attackOrigin.position, _attackRadius, _enemyLayer))
    .Where(hits => hits.Length > 0)
    .Subscribe(hits =>
    {
        foreach (var hit in hits)
            _hitProcessor.Process(hit);

        _stateModel.SetAttackCooldown(_attackCooldown);
    })
    .AddTo(_disposables);
```

`Where`로 공격 가능 상태를 필터하고, `Select`로 히트 판정을 변환하고, `Subscribe`에서 처리한다. 중간에 조건을 추가하거나 파이프라인을 갈라낼 때 콜백 구조보다 훨씬 깔끔하다.

`ReactiveProperty`는 상태 동기화에 유용했다. HP, 쿨다운, 콤보 카운터를 `ReactiveProperty<int>`로 만들고 UI가 구독하면, 값 변경 시 UI 업데이트 코드를 따로 호출할 필요가 없다.

```csharp
// PlayerModel.cs
public ReactiveProperty<int> Hp { get; } = new ReactiveProperty<int>(3);
public ReactiveProperty<int> Combo { get; } = new ReactiveProperty<int>(0);

// HudView.cs — 구독만 하면 자동 업데이트
_model.Hp
    .Subscribe(hp => _hpText.text = $"HP {hp}")
    .AddTo(this);
```

---

## VContainer — 의존성 주입으로 결합도 낮추기

VContainer는 Unity용 DI 컨테이너다. 5일 프로젝트에 DI가 과한가 싶었지만, `GameManager`에 모든 게 몰리는 걸 막으려고 도입했다.

```csharp
// GameLifetimeScope.cs
public class GameLifetimeScope : LifetimeScope
{
    protected override void Configure(IContainerBuilder builder)
    {
        builder.RegisterComponentInHierarchy<PlayerController>();
        builder.Register<AttackSystem>(Lifetime.Scoped);
        builder.Register<HitProcessor>(Lifetime.Scoped);
        builder.Register<PlayerModel>(Lifetime.Singleton);
        builder.RegisterComponentInHierarchy<HudView>();
    }
}
```

`AttackSystem`이 `HitProcessor`를 쓰고, `HitProcessor`가 `PlayerModel`을 참조하는 의존 관계를 컨테이너가 자동으로 연결한다. 새 시스템을 추가할 때 `new`로 객체를 만들며 의존성을 수동으로 넘기는 작업이 없어진다.

5일 프로젝트에서 실제로 느낀 장점은 테스트보다 **구조 강제**다. VContainer를 쓰면 클래스가 자신이 필요한 게 뭔지 생성자에 명시해야 한다. `GameManager.Instance.GetWhatever()`로 전역 접근을 남발하는 패턴을 자연스럽게 차단한다.

---

## FEEL — 타격감의 핵심

FEEL(Feel by More Mountains)은 카메라 흔들기, 히트스톱, 크로마틱 어버레이션 같은 피드백 효과를 에디터에서 조합하는 에셋이다. 카타나 제로 스타일 타격감에서 가장 중요한 부분이 여기에 있었다.

히트스톱은 적을 명중한 순간 `Time.timeScale`을 0에 가깝게 잠시 낮추는 기법이다. FEEL에서는 `MMTimeManager`와 `MMFeedbacks`로 이걸 에셋 파이프라인 안에서 처리한다.

```csharp
// HitProcessor.cs
public class HitProcessor
{
    private readonly MMFeedbacks _hitFeedbacks;

    public void Process(Collider2D hit)
    {
        if (hit.TryGetComponent<IDamageable>(out var damageable))
        {
            damageable.TakeDamage(1);
            _hitFeedbacks?.PlayFeedbacks(hit.transform.position);
        }
    }
}
```

`MMFeedbacks`에 담은 피드백 목록:
- `MMFeedbackCameraShake` — 히트 시 카메라 0.1초 진동
- `MMFeedbackTimescale` — `timeScale 0.05, 지속 0.06초` 히트스톱
- `MMFeedbackChromaticAberration` — 크로마틱 어버레이션 순간 강조
- `MMFeedbackSound` — 타격음 재생
- `MMFeedbackFlash` — 화면 흰색 플래시 1프레임

히트스톱 0.06초가 핵심이었다. 이 숫자가 0.03이면 너무 짧아서 못 느끼고, 0.1이면 답답하다. 카타나 제로 클립을 슬로우모션으로 돌려보면서 프레임을 세서 맞췄다.

---

## VFX Graph — GPU 파티클로 피 튀기기

URP 기반이라 VFX Graph를 쓸 수 있었다. CPU 파티클 시스템 대신 VFX Graph를 선택한 이유는 런타임에 방향과 속도를 직접 제어할 수 있어서다. 칼 방향을 따라 피가 뿌려지는 연출을 만들기 좋다.

```csharp
// BloodVFXController.cs
[SerializeField] private VisualEffect _bloodVFX;

public void Play(Vector3 position, Vector2 hitDirection)
{
    _bloodVFX.transform.position = position;
    _bloodVFX.SetVector3("HitDirection",
        new Vector3(hitDirection.x, hitDirection.y, 0f));
    _bloodVFX.SetFloat("Intensity", Random.Range(0.8f, 1.2f));
    _bloodVFX.Play();
}
```

VFX Graph 안에서 `HitDirection`을 받아 초기 속도 방향에 반영한다. `Intensity`는 파티클 수와 속도에 같이 연결해서, 강한 공격일 때 피가 더 많이 튀는 연출을 가능하게 했다.

VFX Graph의 단점은 에디터 안에서 노드를 연결하는 방식이라 버전 관리가 불편하다는 것이다. `.vfx` 파일이 크고 diff가 읽기 어렵다. 팀 프로젝트라면 신중하게 도입해야 한다.

---

## DOTween — 연출 접착제

R3, FEEL, VFX Graph가 각자 역할이 있어서 DOTween은 그 외 자잘한 연출에 집중했다.

```csharp
// 적 사망 시 넉백 + 스케일 아웃 + 페이드아웃
public void Die(Vector2 knockbackDir)
{
    DOTween.Kill(gameObject);

    transform
        .DOMove(transform.position + (Vector3)(knockbackDir * 2f), 0.3f)
        .SetEase(Ease.OutExpo);

    transform
        .DOScale(Vector3.zero, 0.25f)
        .SetDelay(0.1f)
        .SetEase(Ease.InBack)
        .OnComplete(() => Destroy(gameObject));

    _spriteRenderer
        .DOFade(0f, 0.3f)
        .SetEase(Ease.InCubic);
}
```

넉백 방향으로 날아가면서 스케일이 0으로 줄어들고 페이드아웃한다. `SetEase(Ease.OutExpo)`로 처음엔 빠르게 날아가다가 감속하는 커브를 쓴다. 0.3초짜리 연출이지만 없을 때와 있을 때 타격감 차이가 크다.

---

## 5일 스프린트 구조

| 일차 | 작업 |
|------|------|
| Day 1 | VContainer 세팅, PlayerController, 기본 이동/점프 |
| Day 2 | 공격 판정 (R3 파이프라인), 적 AI 상태머신 |
| Day 3 | FEEL 통합, 히트스톱 튜닝, 카메라 쉐이크 |
| Day 4 | VFX Graph 블러드 이펙트, DOTween 사망 연출 |
| Day 5 | 레벨 디자인, 밸런스, 빌드 |

Day 3이 가장 오래 걸렸다. FEEL의 피드백 수치 튜닝은 코드가 아니라 감각의 영역이라 숫자를 조금씩 바꿔가며 플레이테스트를 반복했다.

---

## 5일 후 깨달은 것 — 게임 설계의 중요성

기술적으로 배운 것도 많지만, 가장 크게 남은 건 기술 이전에 **설계**가 먼저라는 감각이다.

Day 4까지 타격감 구현에 집중하다가 Day 5에 레벨을 만들기 시작했을 때 문제가 터졌다. 적이 어디서 나오고, 어떤 패턴으로 공격하고, 플레이어가 무엇을 보고 반응해야 하는지에 대한 설계가 없었다. 히트스톱이 아무리 좋아도 레벨이 재미없으면 게임이 재미없다.

카타나 제로가 타격감이 좋게 느껴지는 건 FEEL 같은 라이브러리 때문이 아니다. 적의 배치, 공격 패턴, 방 구조가 "타격감을 느낄 수 있는 상황"을 계속 만들어주기 때문이다. 도구는 그 설계를 표현하는 수단일 뿐이다.

다음 프로젝트에선 기술 스택을 고르기 전에 게임 루프와 레벨 구조를 먼저 스케치할 생각이다. 5일 프로젝트에서 가장 비싸게 배운 교훈이다.

---

## 정리

| 기술 | 역할 |
|------|------|
| R3 | 입력→판정→피드백 이벤트 파이프라인, ReactiveProperty UI 동기화 |
| VContainer | DI로 클래스 간 결합도 제어, 전역 접근 패턴 차단 |
| FEEL | 히트스톱, 카메라 쉐이크, 크로마틱 어버레이션 — 타격감 핵심 |
| VFX Graph | GPU 파티클 블러드 이펙트, 런타임 방향 제어 |
| DOTween | 넉백, 사망 연출, UI 트윈 |

*타격감은 라이브러리가 만드는 게 아니라 설계가 만든다 — 5일이 걸려서 알았다.*
