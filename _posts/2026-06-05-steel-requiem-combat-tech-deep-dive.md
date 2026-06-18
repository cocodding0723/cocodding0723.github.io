---
title: "카타나 제로 스타일 액션 게임 기술 해부 — 탐지·레이캐스트·스킬 판정·코드 VFX"
description: "Unity 2D 액션 게임의 전투 코드를 직접 뜯어본다. VContainer 2계층 DI와 R3 이벤트 버스, Physics2D 캐스트 탐지, 베지어 곡선 히트 판정, 머티리얼 없이 코드로만 그린 슬래시 VFX까지."
date: 2026-06-05
categories: [Project]
tags: [Unity, C#, Game]
---

## 들어가며 — '손맛'을 코드로만 만든다는 것

지난번에 [5일 만에 만든 카타나 제로 스타일 액션 게임](/blog/2026/05/29/katana-zero-inspired-action-game-5days/) 글을 썼다. 그 글이 "무슨 기술을 왜 골랐나"에 대한 회고였다면, 이번 글은 "그래서 코드가 실제로 어떻게 동작하나"다. 프로젝트 코드명은 Steel Requiem이고, 7웨이브 생존형 2D 핵 앤 슬래시다.

코드를 다시 들여다보니 이 프로젝트를 관통하는 설계 규칙이 두 개 있었다.

1. **VFX는 머티리얼·프리팹 한 장 없이 런타임 코드로만 만든다.** 슬래시 궤적, 잔상, 혈흔, 칼자국, 충격파 전부 `LineRenderer`·`SpriteRenderer`·`ParticleSystem`을 코드에서 생성한다.
2. **눈에 보이는 궤적이 곧 히트박스다.** 슬래시 VFX를 그리는 베지어 곡선과 실제 타격 판정이 같은 곡선을 공유한다.

이 두 규칙이 탐지·FSM·판정·연출을 어떻게 하나로 묶는지를, 가능한 한 실제 코드 그대로 따라가 본다. (참고로 지난 글의 코드 예시는 설명용으로 단순화한 것이었고, 이번엔 전부 실제 파일에서 그대로 가져왔다.)

순서는 **① 기술 스택과 DI 뼈대 → ② 적·플레이어 탐지 → ③ 디자인 패턴 → ④ 히트 판정과 베지어 → ⑤ 스킬 판정 → ⑥ VFX와 손맛**이다. 관심 있는 곳부터 골라 읽어도 된다.

---

## 기술 스택과 2계층 DI 아키텍처

먼저 뼈대다. 스택은 다음과 같다.

| 패키지 | 버전 | 용도 |
|--------|------|------|
| VContainer | 1.18.0 | DI 컨테이너 (수동 싱글턴 대체) |
| R3 (Cysharp) | 1.3.1 | Reactive — `ReactiveProperty`, `Subject`, `CompositeDisposable` |
| Feel (MoreMountains) | 설치됨 | 히트스톱·스크린 셰이크·오디오·포스트프로세싱 피드백 |
| Cinemachine | 3.1.6 | 카메라, `CinemachineImpulse` |
| New Input System | 1.18.0 | 플레이어 입력 |
| DOTween | 설치됨 | 트윈 (웨이브 배너, 스킬 연출, 페이드) |
| UnityEngine.Pool | 내장 | `ObjectPool<T>` |

DI는 2계층 `LifetimeScope`로 나눴다. `DontDestroyOnLoad`로 살아남는 부모(`GameLifetimeScope`)에는 게임 전체에서 하나면 되는 서비스만, 씬마다 새로 만들어지는 자식(`SceneLifetimeScope`)에는 플레이어·전투·UI 컴포넌트 30여 개를 등록한다.

```csharp
// GameLifetimeScope.cs
[DefaultExecutionOrder(0)] // Must build before SceneLifetimeScope (order 1)
public class GameLifetimeScope : LifetimeScope
{
    protected override void Configure(IContainerBuilder builder)
    {
        builder.RegisterComponentInHierarchy<PoolManager>().AsImplementedInterfaces().AsSelf();
        builder.RegisterComponentInHierarchy<AudioManager>().AsImplementedInterfaces().AsSelf();
        builder.Register<GameEventBus>(Lifetime.Singleton);
    }

    protected override void Awake()
    {
        base.Awake();
        Time.timeScale = 1f; // Guard against timeScale pollution from editor testing

        // Enemies should not physically push each other — only player collision matters
        int enemyLayer = LayerMask.NameToLayer("Enemy");
        if (enemyLayer >= 0)
            Physics2D.IgnoreLayerCollision(enemyLayer, enemyLayer, true);
    }
}
```

세 가지 등록 방식이 섞여 있다. 씬에 미리 배치된 MonoBehaviour는 `RegisterComponentInHierarchy`로 계층에서 찾아 등록하고, 순수 C# 클래스인 `GameEventBus`는 `Register(Lifetime.Singleton)`으로 생성자 주입 대상으로 등록한다.

그리고 `AudioManager`·`PoolInitializer`·`WaveManager`는 `IStartable`을 구현해 **주입이 끝난 뒤** VContainer가 `Start()`를 불러준다. 이게 중요한 이유는 씬 로드 시 `OnEnable`이 주입보다 먼저 실행되기 때문이다 — 주입받은 의존성이 필요한 구독 코드를 `OnEnable`에 두면 `null`을 만진다.

시스템 간 통신은 `static` 이벤트나 직접 참조 대신 R3 `Subject` 8종을 노출하는 이벤트 버스로 한다.

```csharp
// GameEventBus.cs
public class GameEventBus
{
    public static GameEventBus Current { get; private set; }

    public readonly Subject<Unit> OnPlayerDied = new();
    public readonly Subject<Unit> OnPlayerHit = new();
    public readonly Subject<EnemyDeadEvent> OnEnemyDied = new();
    public readonly Subject<DamageEvent> OnDamageDealt = new();
    public readonly Subject<int> OnWaveStarted = new();
    public readonly Subject<Unit> OnWaveCompleted = new();
    public readonly Subject<Unit> OnGameOver = new();
    public readonly Subject<Unit> OnGameClear = new();

    public GameEventBus() => Current = this;
}
```

`EnemyBase`가 적이 죽을 때 `OnEnemyDied.OnNext(...)` 한 줄을 쏘면, 거기에 관심 있는 `AudioManager`(사망음), `KillCamController`(킬캠 슬로모), `BloodSplatterController`(혈흔), `GameFeedbackManager`(셰이크)가 각자 `Subscribe`로 반응한다. 발행자는 누가 듣는지 모르고, 구독자는 누가 쏘는지 모른다. 모든 구독은 `CompositeDisposable`에 `AddTo`로 묶어 `OnDestroy`에서 한 번에 정리한다.

흥미로운 절충 하나. DI를 메인 경로로 쓰면서도 `GameEventBus.Current` 같은 `static` 인스턴스를 같이 둔 하이브리드다. 오브젝트 풀에서 꺼낸 적처럼 VContainer 주입 경로 밖에서 생성되는 객체가 있어서, `EventBus ?? GameEventBus.Current` 식으로 폴백한다. 순수주의로 보면 Service Locator 안티패턴이지만, 풀링과 DI를 같이 쓰는 현실적 안전망이다.

풀링도 첫 웨이브 프레임 스파이크를 막는 디테일이 있다. `PoolInitializer`가 `IStartable.Start`에서 풀 객체만 먼저 등록한 뒤, 코루틴으로 **1프레임에 1개씩** `Get`→`Release`를 돌려 인스턴스 생성을 분산한다. 첫 웨이브 시작 지연(1초) 안에 워밍업이 끝나서, 적이 우르르 등장하는 순간 `Instantiate` 폭탄을 맞지 않는다.

---

## 적은 어떻게 플레이어를 발견하는가 — 거리·FOV·시야 3중 탐지

적이 가만히 순찰하다가 플레이어에게 달려드는 그 전이 조건이 생각보다 까다롭게 짜여 있다. 단순히 "거리 안에 들어오면"이 아니라 세 조건을 모두 통과해야 한다.

```csharp
// EnemyIdleStateBase.cs — 지상·비행 순찰 상태의 공통 베이스
public override void Update()
{
    if (Enemy.DistanceToPlayer() < Enemy.AlertDetectionRange && Enemy.IsPlayerInFOV())
    {
        Enemy.AlertNearbyEnemies();
        Enemy.ChangeState(AlertTarget);
        return;
    }

    OnIdleTick();

    _timer -= Time.unscaledDeltaTime;
    if (_timer <= 0f)
    {
        if (_isWalking) StartPause();
        else            StartWalk();
    }
}
```

`DistanceToPlayer()`는 매 프레임 새로 계산하지 않는다. `EnemyBase`가 `Time.frameCount`로 프레임당 한 번만 `Vector2.Distance`를 구해 캐시하고, `Update`와 `FixedUpdate`가 같은 값을 공유한다. 적 수십 마리가 동시에 도는 웨이브에서 거리 계산 중복을 없애는 작은 최적화다.

진짜는 `IsPlayerInFOV()`다. 거리(1차)를 통과하면 시야각(2차)과 시야 차단(3차)을 본다.

```csharp
// EnemyBase.cs
public virtual bool IsPlayerInFOV()
{
    if (Player == null) return false;
    Vector2 toPlayer = (Vector2)Player.position - (Vector2)transform.position;
    if (toPlayer.sqrMagnitude < 0.01f) return true;
    float facingDir = Mathf.Sign(transform.localScale.x);
    var forward = new Vector2(facingDir, 0f);
    if (Vector2.Angle(forward, toPlayer.normalized) > _fovAngle * 0.5f) return false;
    return HasLineOfSightToPlayer();
}

// Shared raycast kernel used by HasLineOfSightToPlayer and HasLineOfSightToEnemy.
private bool HasLineOfSight(Vector2 origin, Vector2 target)
{
    Vector2 dir  = target - origin;
    float   dist = dir.magnitude;
    if (dist < 0.1f) return true;
    var hit = Physics2D.Raycast(origin, dir / dist, dist, _wallMask);
    return hit.collider == null;
}
```

적이 바라보는 방향(`transform.localScale.x` 부호)을 forward로 잡고, 플레이어까지의 각도가 `_fovAngle`(기본 120°)의 절반을 넘으면 등 뒤라 못 본다. 각도까지 통과하면 적과 플레이어의 눈높이(`EYE_HEIGHT = 0.5`) 사이로 `Ground` 레이어를 향해 `Physics2D.Raycast`를 쏜다. 벽 타일에 막히면 시야가 끊긴 거라 `false`. 즉 벽 뒤에 숨으면 적이 못 본다.

단, 이 FOV·시야 검사는 **idle 상태에서 최초 발견할 때만** 한다. 일단 추격에 들어가면 FOV를 무시하고 거리 기반으로 쫓는다 (등 뒤로 돌았다고 갑자기 추격을 포기하면 어색하니까). 그리고 `FlyingEye`(날아다니는 눈)는 `IsPlayerInFOV()`를 `override`해서 항상 `true`를 반환한다 — 눈깔 괴물답게 전방향 탐지다.

발견 직후 `AlertNearbyEnemies()`가 한 번 더 들어간다. 한 마리가 플레이어를 보면, 시야가 닿는 반경 안의 동료들을 같이 깨운다. 혼자 발각됐는데 옆의 고블린이 멀뚱히 서 있으면 바보 같으니까, 그룹 경보로 같이 달려들게 했다.

---

## 플레이어는 어떻게 세상을 읽는가 — 레이캐스트로 짠 환경 탐지

여기가 이 프로젝트에서 레이캐스트를 가장 빡세게 쓴 부분이다. 타일맵 2D 플랫포머에서 벽·지면·경사·난간을 정확히 감지하는 건 생각보다 함정이 많다.

벽 감지부터. 발끝 레이 하나로는 벽에 매달리기(hang)와 미끄러지기(slide)를 구분할 수 없어서, **상체 5개·하체 3개**의 레이를 분포시킨다. 핵심 트릭은 레이의 시작점을 콜라이더 표면이 아니라 **콜라이더 중심**에 두는 것이다.

```csharp
// PlayerMovement.cs — CheckWalls() 상체 레이 루프
const int RAY_COUNT = 5;
float yMin     = b.center.y;
float yMax     = b.max.y - 0.05f;
// Cast from center outward — avoids origin-inside-wall failure when player penetrates
float castDist = b.extents.x + _wallCheckDistance;

// ...

for (int i = 0; i < RAY_COUNT; i++)
{
    float y      = Mathf.Lerp(yMin, yMax, (float)i / (RAY_COUNT - 1));
    var   origin = new Vector2(b.center.x, y);
    bool  isTopTwo = i >= RAY_COUNT - 2;

    var hitL = Physics2D.Raycast(origin, Vector2.left, castDist, layerMask);
    if (hitL.collider != null)
    {
        _isTouchingWallLeft = true;
        if (hitL.distance < _wallClosestDistLeft)
        {
            _wallClosestDistLeft = hitL.distance;
            _wallLeftX = b.center.x - hitL.distance;
            closestNormalLeft = hitL.normal;
        }
        if (isTopTwo) topTwoHitLeft++;
    }
    // ... 오른쪽도 동일
}
```

만약 레이를 콜라이더 표면에서 쐈다면, 플레이어가 빠르게 이동하다 벽에 살짝 파고든 프레임에서 시작점이 이미 벽 안이라 레이가 아무것도 못 맞히는 origin-inside-wall 버그가 생긴다. 중심에서 바깥(`b.extents.x + _wallCheckDistance`)으로 쏘면 파고들어도 정확히 표면 거리를 잡는다. 그리고 상위 2개 레이가 모두 맞아야(`topTwoHit >= 2`) "벽에 매달림" 조건이 성립한다 — 발만 모서리에 걸린 걸 매달림으로 오인하지 않으려는 장치다.

지면 감지는 `Raycast`가 아니라 `CircleCast`를 쓴다. 이것도 타일맵 특유의 함정 때문이다.

```csharp
// PlayerMovement.cs — CheckGrounded()
// CircleCast from above feet downward — avoids start-inside-collider misses on TilemapCollider2D
var groundHit = Physics2D.CircleCast(
    (Vector2)_groundCheckPoint.position + Vector2.up * 0.2f,
    _groundCheckRadius,
    Vector2.down,
    0.3f,
    _groundLayer);
_isGrounded = groundHit.collider != null;
```

`TilemapCollider2D` 바로 위에 서 있으면 발 위치가 콜라이더 경계와 겹쳐서, 그 지점에서 시작한 레이는 "이미 안에 있다"며 miss가 난다. 그래서 발보다 0.2 위에서 시작해 반지름 0.1짜리 원을 아래로 0.3 쓸어내린다. 시작점을 콜라이더 밖으로 띄우고 원으로 두께를 줘서 경계 케이스를 흡수하는 것이다.

나머지 환경 감지도 전부 레이 기반이다.

- **경사면**: 별도 레이로 `hit.normal`과 `Vector2.up`의 각도를 재서 46°까지 슬라이딩 없이 걷게 한다 (법선의 탄젠트 방향으로 속도를 투영).
- **벽 각도 필터**: `hit.normal`이 수평에서 30°를 넘으면 "경사진 지면 모서리"로 보고 벽 판정을 무효화한다 (언덕 모서리에서 벽 슬라이드가 오발동하는 걸 막는다).
- **난간(ledge)**: 벽 표면 너머 위쪽에서 아래로 레이를 쏴 올라설 수 있는 높이인지 확인한다.

프로젝트 전역의 `Physics2D` 캐스트를 전부 세어 보면 24곳이고, 용도별로 묶으면 이렇다.

| 용도 | API | 위치(대표) |
|------|-----|-----------|
| 적 시야 판정 (적↔플레이어, 적↔적) | `Raycast` | `EnemyBase.HasLineOfSight` |
| 적 점프/반전 (지면·전방 벽·낭떠러지) | `Raycast` ×3 | `EnemyBase.CheckGrounded/CheckWallAhead/CheckGroundAhead` |
| 비행 적 순찰 장애물 | `Raycast` | `FlyingEyeIdleState.IsObstacleAhead` |
| 플레이어 벽 감지 (상체 5 + 하체 3) | `Raycast` ×4 루프 | `PlayerMovement.CheckWalls` |
| 플레이어 경사·난간 | `Raycast` ×2 | `PlayerMovement.CheckSlope/CheckLedgeAbove` |
| 플레이어 지면 | `CircleCast` | `PlayerMovement.CheckGrounded` |
| 플랫폼 통과 낙하 | `OverlapCircle`(NonAlloc) | `PlayerMovement` DropThrough |
| 근접 공격 시야 판정 | `Linecast` ×5점 | `PhysicsUtil.HasLineOfSight` |
| 콤보·스킬·런지 히트 판정 | `OverlapCircleAll` / `CircleCastAll` | `PlayerCombat` / `LungeExecutor` / `Skill*` |
| 보스 광역기 | `OverlapCircleAll` | `BringerOfDeathEnemy` |

같은 게임 안에서 "탐지"라는 한 단어가 환경 충돌(레이), 시야 차단(라인캐스트), 타격 범위(오버랩)로 갈라져 있는 게 보인다.

---

## 디자인 패턴 — 한 게임에 두 종류의 FSM

적 AI와 플레이어가 둘 다 상태머신인데, 구현 방식이 정반대다. 이 대조가 재미있다.

**적은 진짜 State 패턴**이다. 각 상태가 객체이고, 추상 베이스를 상속한다.

```csharp
// EnemyState.cs — FSM 노드의 최소 인터페이스
public abstract class EnemyState
{
    protected EnemyBase Enemy { get; private set; }

    public void Init(EnemyBase enemy) => Enemy = enemy;

    public virtual bool IsIdleState => false;

    public abstract void Enter();
    public virtual void Update() { }
    public virtual void FixedUpdate() { }
    public virtual void Exit() { }
}
```

`EnemyBase`는 Idle/Chase/Attack/Hurt/Dead/Alert/DashCharge 같은 상태 슬롯을 들고 있고, 각 적 서브클래스가 `InitializeStates()`에서 자기 상태들을 채운다. 전이는 `ChangeState`가 이전 상태의 `Exit()` → 새 상태 `Init()`/`Enter()` 순으로 처리하고, `Update`/`FixedUpdate`를 현재 상태에 위임한다. 교과서적인 State 패턴이다.

여기에 중복 제거를 위해 Template Method를 얹었다. 원거리 적(머쉬룸·플라잉아이)은 "너무 가까우면 도망, 너무 멀면 접근, 적정 거리면 정지"라는 사거리 유지 로직이 똑같다. 이 본문을 부모 한 곳에 두고, 전이 조건만 자식이 다르게 둔다.

```csharp
// RangedEnemyMovementState.cs — 사거리 유지 본문을 한 곳에
public override void FixedUpdate()
{
    float dist = Enemy.DistanceToPlayer();

    if (dist < PREFERRED_MIN)        // 4f
    {
        Enemy.FleeFromPlayer(Enemy.MoveSpeed);
        SetSpeed(1f);
        return;
    }

    if (dist > PREFERRED_MAX)        // 8f
    {
        Enemy.MoveTowardPlayer(Enemy.MoveSpeed);
        SetSpeed(1f);
        return;
    }

    Enemy.StopMovement();
    SetSpeed(0f);
}
```

`RangedChaseState`(이동하다 사거리 들면 공격으로 전이)와 `RangedRepositionState`(쿨다운 끝나면 다시 추격으로)가 이 클래스를 상속해 `Update`의 전이 조건만 추가한다. 이동 코드는 부모 한 군데, 전이 분기만 자식 두 군데로 갈라 중복을 없앴다. 순찰 idle도 같은 식으로 `EnemyIdleStateBase`가 지상·비행을 통합한다.

반면 **플레이어는 State 패턴이 아니라 enum 폴링 FSM**이다.

```csharp
// PlayerController.cs — DetermineState()
private void DetermineState()
{
    if (_currentState == PlayerState.Dead) return;
    if (_isRolling) return;

    if (_movement.IsClimbingLedge) { TransitionTo(PlayerState.WallClimb); return; }

    // Skills own their state until the coroutine completes
    if (_skillDashSlash.IsActive) return;

    if (_movement.IsDashing && !_movement.IsAirDash) { TransitionTo(PlayerState.Dash); return; }

    // ... 카운터어택 등 일부 우선순위 분기 생략 ...

    // Aerial state takes priority over regular attack
    if (!_movement.IsGrounded)
    {
        TransitionTo(_rb.linearVelocity.y >= 0f ? PlayerState.Jump : PlayerState.Fall);
        return;
    }

    if (_combat.IsAttacking) { TransitionTo(PlayerState.Attack); return; }

    TransitionTo(Mathf.Abs(_moveInput.x) > 0.01f ? PlayerState.Run : PlayerState.Idle);
}
```

상태 객체가 따로 없다. 매 프레임 `PlayerMovement`/`PlayerCombat`의 공개 플래그를 우선순위대로 폴링해서 13종 `PlayerState` enum 중 하나로 전이하고 애니메이터를 구동한다. 입력도 한 프레임에 들어온 one-shot 플래그(점프·대시·공격·패링)를 우선순위 순서로 소비한다.

솔직히 말하면, 프로젝트에 `IPlayerState`라는 인터페이스가 `Enter`/`Update`/`Exit` 시그니처까지 정의돼 있다. 그런데 `PlayerController`는 이걸 전혀 참조하지 않는다 — 처음엔 적처럼 State 패턴으로 가려다가 enum 폴링으로 선회한 흔적이고, 인터페이스만 남았다. "플레이어도 State 패턴"이라고 쓰면 거짓말이라, 정확히는 **적은 객체형 State 패턴, 플레이어는 enum 폴링 FSM**이다.

정리하면 이 프로젝트가 실제로 쓴 패턴은 다음과 같다.

| 패턴 | 어디에 |
|------|--------|
| State (객체형) | 적 AI (`EnemyState` + `ChangeState`) |
| FSM (enum 폴링) | 플레이어 (`PlayerController.DetermineState`) |
| Template Method | `RangedEnemyMovementState`, `EnemyIdleStateBase`, `SkillBase` |
| Object Pool | `PoolManager` (적·투사체·잔상·이펙트·혈흔) |
| Observer / Pub-Sub | `GameEventBus` (R3 `Subject`) |
| Dependency Injection | VContainer 2계층 스코프 |
| Strategy / 위임 | `LungeExecutor`를 콤보·카운터가 공유 |
| Service Locator (폴백) | `*.Current` static 안전망 |

---

## 칼이 닿았는가 — 히트 판정 두 갈래

히트 판정이 한 방식이 아니라 두 방식이 공존한다. 이걸 구분하는 게 이 게임 전투를 이해하는 핵심이다.

(1) **적 무기·투사체는 트리거 콜라이더 방식**이다. 콜라이더를 `isTrigger`로 두고 `OnTriggerEnter2D`에서 판정한다.

```csharp
// DamageDealer.cs
private void OnTriggerEnter2D(Collider2D other)
{
    if (other.CompareTag(_ownerTag)) return;
    if (!other.TryGetComponent<IHittable>(out var hittable)) return;
    if (!hittable.IsAlive) return;

    Vector2 knockDir = _attackDir;

    var info = new DamageInfo
    {
        Amount               = _damage,
        HitPoint             = other.ClosestPoint(transform.position),
        KnockbackDir         = knockDir,
        KnockbackForce       = _knockbackForce,
        HitStopDuration      = _hitStopDuration,
        ScreenShakeIntensity = _screenShakeIntensity,
        IsCritical           = false
    };

    hittable.TakeDamage(info);
}
```

콜라이더는 평소 꺼두고, 애니메이션 이벤트로 `EnableHitbox()`/`DisableHitbox()`를 호출해 칼을 휘두르는 프레임에만 켠다 (타이머로 켜고 끄지 않는 게 규칙이다). `_ownerTag`로 자기편은 무시한다.

한 가지 재미있는 디테일은 `Awake`에서 자신의 레이어를 강제로 `Default`로 바꾼다는 것이다 — 앞서 `GameLifetimeScope`가 Player↔Enemy 물리 충돌을 전역으로 꺼버렸기 때문에, 트리거가 정상 작동하려면 충돌 매트릭스에서 살아있는 레이어에 있어야 한다.

(2) **플레이어 칼질은 트리거가 아니라 캐스트 샘플 방식**이다. 콜라이더를 휘두르는 게 아니라, 베지어 곡선 위 점마다 `Physics2D.OverlapCircleAll`로 적을 훑는다 (다음 섹션에서 자세히).

두 방식 모두 같은 계약으로 수렴한다. 데미지는 `DamageInfo` 구조체에 담아 `IHittable.TakeDamage`로 넘긴다.

```csharp
// IHittable.cs
public struct DamageInfo
{
    public int Amount;
    public Vector2 HitPoint;
    public Vector2 KnockbackDir;
    public float KnockbackForce;
    public float HitStopDuration;
    public float ScreenShakeIntensity;
    public bool IsCritical;
}

public interface IHittable
{
    void TakeDamage(DamageInfo info);
    bool IsAlive { get; }
}
```

적이든 플레이어든 맞는 쪽은 `IHittable` 하나만 구현하면 된다. 데미지뿐 아니라 넉백 방향·힘, 히트스톱 시간, 셰이크 강도까지 한 구조체에 실어 보내기 때문에, **때리는 쪽이 손맛 파라미터를 결정하고 맞는 쪽이 그대로 연출**한다. 기본 콤보는 히트스톱 0.05s·셰이크 0.1, 스킬은 더 세게 — 이 값들이 전부 `DamageInfo`를 타고 흐른다.

벽 너머 적을 거르는 시야 판정도 있는데, **여기서 LOS 커널이 두 종류로 갈린다**는 점을 짚어야 한다. 앞서 본 적 탐지용 `EnemyBase.HasLineOfSight`는 단일 `Raycast`다. 반면 플레이어 공격 판정용 `PhysicsUtil.HasLineOfSight`는 콜라이더 외곽 5점을 `Linecast`로 검사한다.

```csharp
// PhysicsUtil.cs — 근접 공격용 5점 시야 판정
public static bool HasLineOfSight(Vector2 origin, Collider2D target, LayerMask wallMask)
{
    if (wallMask == 0) return true;

    Bounds  b = target.bounds;
    const float k = 0.05f;
    _sampleBuf[0] = b.center;
    _sampleBuf[1] = new Vector2(b.center.x,            (float)b.max.y - k);
    _sampleBuf[2] = new Vector2(b.center.x,            (float)b.min.y + k);
    _sampleBuf[3] = new Vector2((float)b.min.x + k,    b.center.y);
    _sampleBuf[4] = new Vector2((float)b.max.x - k,    b.center.y);

    foreach (var pt in _sampleBuf)
        if (!Physics2D.Linecast(origin, pt, wallMask))
            return true;

    return false;
}
```

적 콜라이더의 중심 + 상하좌우 모서리 5점 중 **하나라도** 벽에 안 막히면 명중을 허용한다. 관대한 판정이다 — 적이 벽 모서리에 반쯤 가려 있어도 몸 일부가 보이면 칼이 닿는다. 단일 레이로 중심만 봤다면 "몸은 보이는데 중심이 기둥에 가려 안 맞는" 답답한 상황이 나오는데, 5점 샘플이 그걸 없앤다. 샘플 좌표는 매번 `new` 하지 않고 `static` 버퍼를 재사용해 GC 할당을 0으로 만든다.

---

## 보이는 궤적이 곧 히트박스 — 베지어 곡선 판정

이 프로젝트에서 가장 마음에 드는 부분이다. 슬래시 VFX를 그리는 곡선과 실제 타격 판정이 **같은 베지어 곡선**을 쓴다.

`SlashVFXController`는 콤보 1~3타마다 다른 3차 베지어 곡선(제어점 4개)을 갖고, 그 곡선 위의 월드 좌표를 반환하는 함수를 공개한다.

```csharp
// SlashVFXController.cs
public Vector2[] GetWorldHitPoints(int comboIndex, int sampleCount = 8)
{
    if (comboIndex < 0 || comboIndex >= 3 || _shapes == null) return System.Array.Empty<Vector2>();

    GetTransformedBezierPoints(comboIndex, _shapes[comboIndex],
        out Vector2 p0, out Vector2 p1, out Vector2 p2, out Vector2 p3);
    Vector2 origin = GetVfxOrigin(comboIndex);

    var pts = new Vector2[sampleCount];
    for (int i = 0; i < sampleCount; i++)
    {
        float   t = i / (float)(sampleCount - 1);
        Vector2 b = BezierCubic(t, p0, p1, p2, p3);
        pts[i]    = origin + b;
    }
    return pts;
}

private static Vector2 BezierCubic(float t, Vector2 p0, Vector2 p1, Vector2 p2, Vector2 p3)
{
    float u = 1f - t;
    return u*u*u*p0 + 3f*u*u*t*p1 + 3f*u*t*t*p2 + t*t*t*p3;
}
```

그리고 `PlayerCombat`이 이 점들을 받아 각 점에서 작은 원을 그려 적을 검출한다.

```csharp
// PlayerCombat.cs
private void BezierHitCheck(int comboIndex, Vector2 attackDir)
{
    if (_slashVFX == null) return;

    _bezierHitSet.Clear();
    var pts      = _slashVFX.GetWorldHitPoints(comboIndex, _bezierHitSamples);
    var knockDir = new Vector2(attackDir.x, 0.2f).normalized;

    Vector2 attackOrigin = (Vector2)transform.position + Vector2.up * _attackPivotHeight;
    foreach (var pt in pts)
    {
        var cols = Physics2D.OverlapCircleAll(pt, _lungeCastRadius, _enemyLayerMask);
        foreach (var col in cols)
            ApplyHitToCollider(col, pt, comboIndex, knockDir, attackOrigin);
    }
}

private void ApplyHitToCollider(Collider2D col, Vector2 hitPoint, int comboIndex, Vector2 knockDir, Vector2 attackOrigin)
{
    var hittable = col.GetComponentInParent<IHittable>();
    if (hittable == null || !hittable.IsAlive || !_bezierHitSet.Add(hittable)) return;
    if (!PhysicsUtil.HasLineOfSight(attackOrigin, col, _wallLayerMask)) return;

    hittable.TakeDamage(new DamageInfo
    {
        Amount               = COMBO_DAMAGE[comboIndex],
        // ...
    });
}
```

화면에 그려지는 칼날(`LineRenderer`가 따라 그리는 베지어)과 판정 영역(`OverlapCircleAll`로 훑는 같은 베지어)이 같은 수식에서 나온다. 그래서 "보이는 만큼 맞는다." 히트박스를 별도의 박스 콜라이더로 두면 시각 효과와 어긋나기 마련인데, 단일 소스로 묶으면 그 괴리가 원천적으로 없다. 이게 이 게임 손맛의 정체라고 생각한다. `HashSet`으로 한 스윙당 적 1회만 때리고, 앞서 본 5점 `HasLineOfSight`로 벽 가림을 거른다.

---

## 스킬 판정의 설계

활성 스킬은 입력에 묶인 게 셋이다 — Q(초승달 검기), R(시간정지), E(불릿타임 카운터). 거기에 우클릭 퍼펙트 도지가 더해진다. 정리하면 이렇다.

| 입력 | 스킬 | 판정 방식 |
|------|------|-----------|
| Q (홀드→릴리즈) | 초승달 검기 | 이동하는 호의 `OverlapCircleAll` 관통 |
| R (토글) | 시간정지 | 적 동결 + 마크 + 순차 처형 |
| E (홀드→릴리즈) | 불릿타임 카운터 | 슬로우모 진입 후 런지 캐스트 |
| 우클릭 | 퍼펙트 도지 | `OverlapCircleAll` 타이밍 판정 |

스킬의 공통 골격은 `SkillBase`가 Template Method로 잡는다.

```csharp
// SkillBase.cs
private void Update()
{
    if (_cooldownTimer > 0f)
    {
        _cooldownTimer -= Time.unscaledDeltaTime;
        if (_cooldownTimer < 0f) _cooldownTimer = 0f;

        var reactive = CooldownReactive;
        if (reactive != null) reactive.Value = _cooldownTimer;
    }
    OnUpdate();
}

public bool TryActivate()
{
    if (!IsReady) return false;
    if (!_stats.IsAlive) return false;
    if (!CanActivate()) return false;

    _cooldownTimer = Cooldown;
    var reactive = CooldownReactive;
    if (reactive != null) reactive.Value = _cooldownTimer;

    StartCoroutine(ExecuteWrapper());
    return true;
}
```

쿨다운은 `Time.unscaledDeltaTime`으로 깎는다. 시간정지나 슬로우모션으로 `Time.timeScale`이 멈춰도 쿨다운은 정상 속도로 흘러야 하기 때문이다. 그리고 매 프레임 그 값을 파생 클래스가 지정한 `PlayerStats`의 `ReactiveProperty<float>`에 써준다 — HUD의 쿨다운 아이콘은 이 `ReactiveProperty`만 구독하면 알아서 갱신된다. R3가 여기서 빛난다.

각 스킬의 "판정"은 전부 `OverlapCircleAll`로 적 레이어 콜라이더를 모아 `IHittable.TakeDamage`를 부르는 방식인데, 모양이 조금씩 다르다. 가장 독특한 건 초승달 검기(`SkillDashSlash`)다. 정지한 원이 아니라 **매 프레임 앞으로 이동하는 호(arc)의 3점 평균을 중심으로** 원을 굴린다.

```csharp
// SkillDashSlash.cs — 초승달이 날아가며 경로를 훑는다
while (traveled < maxRange)
{
    float   step   = speed * Time.unscaledDeltaTime;
    traveled      += step;
    Vector3 offset = moveDir * step;

    for (int i = 0; i < ARC_POINTS; i++)
    {
        positions[i] += offset;
        _crescentLR.SetPosition(i, positions[i]);
        _crescentGlowLR.SetPosition(i, positions[i]);
    }

    Vector2 midpoint = (
        (Vector2)positions[0] +
        (Vector2)positions[ARC_POINTS / 2] +
        (Vector2)positions[ARC_POINTS - 1]
    ) / 3f;

    var overlaps = Physics2D.OverlapCircleAll(midpoint, radius * 0.75f, enemyMask);
    foreach (var col in overlaps)
    {
        var h = col.GetComponentInParent<IHittable>();
        if (h == null || !h.IsAlive || !hitSet.Add(h)) continue;

        h.TakeDamage(new DamageInfo { /* Amount = 9999, ... */ });
    }
    yield return null;
}
```

`LineRenderer`로 그린 초승달 호가 날아가면서, 그 호의 대표점에서 매 프레임 원을 검출하고 `HashSet`으로 이미 맞은 적을 거른다. 그래서 경로 위 모든 적을 한 번씩 관통한다.

여기서 두 가지는 정확히 짚어야겠다.

- **차징 단계가 데미지를 바꾸지 않는다.** Q를 길게 누르면 3단계로 차징되는데, 코드상 단계별 데미지는 전부 `9999`로 같다. 단계가 바꾸는 건 데미지가 아니라 **호의 반경·사거리·이동 속도·히트스톱·셰이크·카메라 줌**이다. 사실 이 게임은 거의 모든 공격이 9999라 "원샷 전투" 콘셉트에 가깝다 — 그래서 차징의 의미는 데미지 밸런싱이 아니라 판정 범위와 연출 스케일에 있다.
- **초승달은 시야 판정(LOS)을 안 한다.** 앞의 기본 콤보·런지는 `HasLineOfSight`로 벽 가림을 걸렀지만, 초승달과 광역기(지면 강타류)는 순수 `OverlapCircle` 관통이라 벽 차폐를 검사하지 않는다. "모든 판정이 시야를 본다"고 일반화하면 틀린다 — 기본 공격·런지만 LOS를 보고, 광역 스킬은 관통이다.

한편 `SkillBase`도 100% 일률적이진 않다. Q(초승달)는 홀드 차징 때문에 `SkillBase.TryActivate`를 쓰지 않고 쿨다운·실행을 직접 관리한다 — 베이스 계약의 예외다.

R(시간정지, `SkillTimeStop`)은 다른 결이다. 적의 `Time.timeScale`을 건드리는 게 아니라 `EnemyBase.Freeze()`로 적을 개별 동결하고, 동결 중 좌클릭으로 때린 적에 `DeathMark`(칼자국)를 등록해 뒀다가, R을 다시 누르면 마크된 적을 순차로 처형한다. 처형 순간에만 `Time.timeScale = 0` 히트스톱을 걸어 연출을 끊어 보여준다.

E(불릿타임 카운터)와 우클릭 퍼펙트 도지는 **슬로우모션 윈도우가 카운터를 게이트한다**는 구조를 공유한다. 퍼펙트 도지는 `OverlapCircleAll`(반경 3.5)로 주변에 공격 중인(슈퍼아머) 적이나 투사체가 있는지 보고, 있으면 `Time.timeScale = 0.2` 슬로우모로 들어간다. 이때 카메라 줌인·비네트는 전부 `unscaledDeltaTime`을 써서 시간이 0.2배여도 정상 속도로 연출된다.

그리고 카운터(`PerfectCounterAttack.TryActivate`)는 `PerfectDodgeController.IsSlowMoActive`가 켜져 있을 때만 발동한다 — 회피 성공으로 열린 슬로우모 창 안에서만 반격이 나간다. 카타나 제로식 "저스트 회피 후 즉발 반격"을 입력 타이밍 → 상태 플래그 → 판정으로 옮긴 것이다.

마지막으로 휴면 코드 이야기 하나. 코드에는 지면 강타(`SkillGroundSlam`)와 수리검 텔레포트(`SkillShurikenTeleport`)도 완성돼 있다. 그런데 둘 다 `PlayerController`의 입력에 연결돼 있지 않다 — 구현은 됐지만 휴면 상태다. 웨이브에 안 쓰이는 적 3종(스켈레톤·이블위자드·브링어오브데스)과 같은 처지다. 프로토타입을 빠르게 굴리다 보면 "만들었지만 안 붙인" 코드가 쌓이는데, 이 프로젝트도 예외는 아니었다.

---

## VFX와 손맛 — 코드로만, 그리고 시간이 멈춰도

VFX는 전부 런타임 코드다. 슬래시부터 보자. `SlashVFXController`는 베지어 곡선을 32점으로 구워 `LineRenderer`에 넣는데, 한 번에 다 그리지 않고 끝(tip)부터 칠해지는 "페인트 온" 연출을 한다.

```csharp
// SlashVFXController.cs — draw → hold → fade 3단계
private void ComputeSlashFrame(float elapsed, out int reveal, out float alpha)
{
    if (elapsed < _drawTime)
    {
        float rawT   = elapsed / _drawTime;
        float easedT = 1f - (1f - rawT) * (1f - rawT);
        reveal = Mathf.Clamp(Mathf.RoundToInt(easedT * _slashPoints), 2, _slashPoints);
        alpha  = 1f;
    }
    else if (elapsed < _drawTime + _holdTime)
    {
        reveal = _slashPoints;
        alpha  = 1f;
    }
    else
    {
        float fadeT = (elapsed - _drawTime - _holdTime) / _fadeTime;
        reveal = _slashPoints;
        alpha  = Mathf.Clamp01(1f - fadeT);
    }
}
```

`reveal`은 지금 몇 개의 점을 노출할지다. draw 구간(0.05s)에 `easeOutQuad`로 2→32개까지 빠르게 늘려 칼날이 휙 그어지는 느낌을 주고, hold(0.02s) 동안 유지, fade(0.10s)에 알파를 떨군다. `LineRenderer.positionCount`를 `reveal`로 잘라 그리는 게 페인트 온의 전부다. 콤보별 색은 시안 → 마젠타 → 오렌지로 다르고, 카운터는 곡선 3개를 겹쳐 그리는 트리플 슬래시다. 머티리얼 에셋은 한 장도 없다 — `Sprites/Default` 셰이더로 런타임에 만든다.

대시 잔상은 오브젝트 풀에서 꺼낸 객체에 현재 스프라이트를 스냅샷처럼 복제한 뒤 페이드아웃한다.

```csharp
// AfterImageController.cs
var img = _poolManager.Get<AfterImageEffect>(PoolKeys.AfterImage);
if (img == null) return;

img.transform.position   = _sourceRenderer.transform.position;
img.transform.localScale = _sourceRenderer.transform.lossyScale;
var captured = img;
img.Initialize(
    _sourceRenderer.sprite, _sourceRenderer.flipX,
    _sourceRenderer.sortingLayerID, _sourceRenderer.sortingOrder,
    color,
    () => _poolManager.Release(PoolKeys.AfterImage, captured),
    useOverlayLayer);
```

`Initialize`가 `DOFade`로 알파를 0까지 낮추고 끝나면 콜백으로 풀에 반납한다. 대시는 0.03초 간격 3개, 카운터 런지는 0.02초 간격으로 더 촘촘하게 뿜는다.

이 외에 혈흔(`BloodSplatter`)은 런타임 `ParticleSystem`을 바닥에 충돌(`Collision2D`)시켜 법선이 위를 향한 지점에만 바닥 얼룩 스프라이트를 런타임 텍스처로 남기고, 칼자국(`DeathMark`)은 `DOTween`으로 진행도 0→1을 보간해 `LineRenderer` 버텍스가 차례로 끝점으로 Lerp되며 그어지는 연출을 만든다.

> 혈흔은 지난 글을 한 가지 정정한다. 지난 글에선 "VFX Graph GPU 파티클"로 소개했지만, 실제 코드에서 VFX Graph 경로(`_useVFXGraphHit`/`_useVFXGraphDeath`)는 "폭죽처럼 보인다"는 이유로 기본 비활성화돼 있고, 동작하는 건 위의 코드 기반 `ParticleSystem` 경로다.

그리고 이 모든 연출을 관통하는 마지막 규칙. **시간이 멈춰도 화면은 살아 움직여야 한다.** 히트스톱(`timeScale 0.05`), 킬캠(0.3배), 퍼펙트 도지 슬로모(0.2배), 시간정지 처형(순간 0)이 서로 겹치는데, 이들이 `timeScale`을 두고 충돌하지 않도록 복원 우선순위를 정해 뒀다.

```csharp
// HitStopController.cs
private IEnumerator HitStopRoutine(float duration)
{
    Time.timeScale = 0.05f; // near-freeze — avoids hard-stop lag feel
    yield return GetWait(duration);
    // Restore to the appropriate base timeScale — prioritise kill-cam, then dodge slow-mo
    if (KillCamController.IsActive)
        Time.timeScale = 0.3f;
    else if (PerfectDodgeController.IsSlowMoActive)
        Time.timeScale = PerfectDodgeController.SlowMoTimeScale;
    else
        Time.timeScale = 1f;
    _stopCoroutine = null;
}
```

히트스톱은 완전한 0이 아니라 0.05다 — 진짜 0은 멈춤이 너무 딱딱하게 느껴져서 살짝 흐르게 둔다. 복원할 때는 "킬캠이 켜져 있으면 0.3, 아니면 슬로모면 0.2, 아니면 1"로 우선순위를 따져 누가 무엇 위에 얹혀 있는지 조율한다. `WaitForSecondsRealtime`도 매번 `new` 하면 콤보 중 GC 스파이크가 생기니 `Dictionary`로 캐시해 재사용한다.

그리고 화면 셰이크·비네트·블룸·크로마틱 어버레이션을 발행하는 `GameFeedbackManager`는 `GameEventBus`를 구독해 타격/사망/피격에 자동 반응하는데, URP 셰이커를 전부 `TimescaleModes.Unscaled`로 발행한다. 그래서 `timeScale`이 0.05로 떨어진 순간에도 화면은 정상 속도로 흔들리고 번쩍인다. 잔상의 `DOFade`도 `SetUpdate(true)`로 `timeScale`을 무시한다. 즉 코드 전반이 `unscaledDeltaTime` / `WaitForSecondsRealtime` / `SetUpdate(true)` / `Unscaled`로 통일돼 있어서, "시간을 멈추는 연출"과 "멈춘 시간 위에서 도는 연출"이 한 화면에 공존한다.

---

## 마치며 — 일관된 규칙이 손맛을 만든다

코드를 다시 훑고 나니, 이 프로젝트의 손맛은 라이브러리가 아니라 **두 개의 일관된 규칙**에서 나왔다는 게 분명해졌다.

1. **보이는 궤적 = 실제 히트박스.** 슬래시를 그리는 베지어 곡선이 곧 판정의 입력이라 시각과 판정이 어긋나지 않는다.
2. **모든 연출은 unscaledTime.** 그래서 히트스톱·슬로모·시간정지가 겹쳐도 화면이 죽지 않는다.

그리고 이 규칙들을 30여 개 컴포넌트에 느슨하게 퍼뜨린 척추가 VContainer DI와 R3 이벤트 버스다. 한 곳에서 이벤트 한 줄을 쏘면 오디오·셰이크·혈흔·킬캠이 서로를 모른 채 각자 반응한다.

물론 들여다보니 개선거리도 보였다. 데미지가 전부 9999라 밸런싱이라 부를 게 없고, `IPlayerState` 인터페이스는 정의만 남은 채 안 쓰이며, 지면 강타·수리검 텔레포트는 완성됐는데 입력에 안 붙어 휴면 중이다. 프로토타입을 빠르게 굴린 흔적이고, 다음에 다듬는다면 이 잔재부터 정리할 생각이다.

지난 글에서 "타격감은 라이브러리가 아니라 설계가 만든다"고 썼는데, 코드를 다시 읽으니 한 겹 더 구체적으로 말할 수 있겠다. 설계란 결국 **하나의 규칙을 끝까지 일관되게 미는 것**이다. 베지어 하나로 VFX와 판정을 묶고, unscaledTime 하나로 모든 연출을 묶었다 — 그 일관성이 손맛이었다.

*칼날을 그리는 곡선이 곧 맞는 범위이고, 시간이 멈춰도 화면은 흔들린다 — 카타나 제로식 손맛은 이 두 규칙의 일관성에서 나왔다.*
