---
title: "Unity에서 SOLID를 지키는 프레임워크 - VContainer, R3, MessagePipe, UniTask"
description: "MonoBehaviour 신(神) 클래스에서 벗어나는 법. SOLID 5원칙을 Unity에 매핑하고, VContainer, R3, MessagePipe, UniTask로 실제 코드를 어떻게 분리하는지 정리한다."
date: 2026-04-06
categories: [Dev]
tags: [Unity]
---

## 왜 Unity에서 SOLID가 어려운가

Unity는 컴포넌트 지향이라 OOP 친화적으로 보이지만, 실제로 짜다 보면 한 MonoBehaviour가 입력, 상태, 렌더링, 사운드, UI까지 전부 떠안는 "God 컴포넌트"가 되기 쉽다. `FindObjectOfType`, `GetComponent`, `static Instance` 세 가지가 의존성을 숨기고, 인스펙터에서 끌어다 꽂는 직렬화 필드는 결합도를 시각적으로만 가린다.

SOLID는 이걸 막기 위한 지침이지만, 원칙만 외워서는 코드가 바뀌지 않는다. 각 원칙을 강제(혹은 권장)하는 도구가 같이 있어야 한다. 이 글에서는 SOLID 5원칙을 Unity 맥락에서 다시 풀고, 각 원칙에 잘 맞는 프레임워크를 짝지어 본다. 결론부터 말하면 추천 스택은 다음이다.

| 도구 | 역할 | 출처 |
|------|------|------|
| VContainer | DI 컨테이너 | hadashiA |
| R3 | Reactive Extensions (UniRx 후속) | Cysharp |
| MessagePipe | Pub/Sub 메시징 | Cysharp |
| UniTask | 알로케이션 없는 async/await | Cysharp |

Zenject(Extenject)도 살아 있지만, 신규 프로젝트라면 가벼움과 IL2CPP 호환성에서 VContainer가 우위다. UniRx는 더 이상 신규 기능이 들어오지 않고, 같은 저자가 만든 R3로 흐름이 옮겨갔다.

---

## S - Single Responsibility Principle

> 클래스는 하나의 변경 이유만 가져야 한다.

### Unity에서의 안티패턴

```csharp
// PlayerController.cs - 흔한 God MonoBehaviour
public class PlayerController : MonoBehaviour
{
    [SerializeField] private float _moveSpeed;
    [SerializeField] private AudioSource _footstep;
    [SerializeField] private Slider _hpBar;
    [SerializeField] private ParticleSystem _hitFx;

    private int _hp = 100;

    void Update()
    {
        var input = new Vector3(Input.GetAxis("Horizontal"), 0, Input.GetAxis("Vertical"));
        transform.Translate(input * _moveSpeed * Time.deltaTime);
        if (input.sqrMagnitude > 0.1f) _footstep.Play();
    }

    public void TakeDamage(int dmg)
    {
        _hp -= dmg;
        _hpBar.value = _hp / 100f;
        _hitFx.Play();
        if (_hp <= 0) GameObject.Destroy(gameObject);
    }
}
```

입력, 이동, 사운드, HP, UI, VFX, 사망 처리가 한 클래스에 다 있다. HP 표시 위치만 바뀌어도 PlayerController를 건드려야 한다.

### 분리 후

```csharp
// 각자 한 가지만 책임진다
public class PlayerInput : MonoBehaviour { public Vector3 MoveAxis { get; private set; } /* ... */ }
public class PlayerMover : MonoBehaviour { public void Move(Vector3 dir) { /* ... */ } }
public class PlayerHealth : MonoBehaviour
{
    public int Current { get; private set; } = 100;
    public event Action<int> OnChanged;
    public void TakeDamage(int dmg) { Current -= dmg; OnChanged?.Invoke(Current); }
}
public class PlayerHpView : MonoBehaviour { /* PlayerHealth.OnChanged 구독해서 슬라이더만 갱신 */ }
```

여기서 R3가 들어오면 `event Action`을 `Observable`로 바꿀 수 있다. View는 Model을 직접 알 필요 없이 스트림만 구독한다.

```csharp
// R3 적용
public class PlayerHealth
{
    private readonly ReactiveProperty<int> _current = new(100);
    public ReadOnlyReactiveProperty<int> Current => _current;
    public void TakeDamage(int dmg) => _current.Value -= dmg;
}

public class PlayerHpView : MonoBehaviour
{
    [SerializeField] private Slider _slider;

    public void Bind(PlayerHealth health)
    {
        health.Current
            .Subscribe(hp => _slider.value = hp / 100f)
            .AddTo(this); // GameObject 파괴 시 자동 Dispose
    }
}
```

`AddTo(this)`는 R3.Unity의 확장으로, GameObject가 파괴되면 자동으로 구독을 해제한다. 메모리 누수와 NRE 위험을 한 줄로 막아준다.

---

## O - Open/Closed Principle

> 확장에는 열려 있고, 수정에는 닫혀 있어야 한다.

### Unity에서의 적용

새 무기를 추가할 때 `WeaponManager`의 `switch (weaponType)`을 매번 수정해야 한다면 OCP 위반이다. ScriptableObject 기반 전략 패턴이 정석이다.

```csharp
public abstract class WeaponSO : ScriptableObject
{
    public abstract void Fire(Transform muzzle);
}

[CreateAssetMenu(menuName = "Weapon/Pistol")]
public class PistolSO : WeaponSO
{
    public override void Fire(Transform muzzle) { /* ... */ }
}

[CreateAssetMenu(menuName = "Weapon/Shotgun")]
public class ShotgunSO : WeaponSO
{
    public override void Fire(Transform muzzle) { /* ... */ }
}

public class WeaponHolder : MonoBehaviour
{
    [SerializeField] private WeaponSO _equipped;
    public void Trigger() => _equipped.Fire(transform);
}
```

새 무기는 새 SO를 만들면 끝. `WeaponHolder`는 한 글자도 안 바뀐다.

여기에 R3를 곁들이면 무기 교체 자체를 스트림으로 만들 수 있다.

```csharp
public class WeaponHolder : MonoBehaviour
{
    public ReactiveProperty<WeaponSO> Equipped { get; } = new();

    void Start()
    {
        Equipped
            .Where(w => w != null)
            .Subscribe(w => Debug.Log($"무기 교체: {w.name}"))
            .AddTo(this);
    }
}
```

UI, 사운드, 애니메이터 어느 쪽이든 `Equipped`만 구독하면 된다. 새 시스템(예: 무기 교체 시 튜토리얼 표시)을 추가해도 `WeaponHolder`는 닫혀 있다.

---

## L - Liskov Substitution Principle

> 하위 타입은 상위 타입을 대체할 수 있어야 한다.

Unity에서 LSP를 깨는 가장 흔한 경우는 깊은 MonoBehaviour 상속 트리다. `EnemyBase` → `RangedEnemy` → `MagicRangedEnemy` 식으로 내려가다 보면, 상위 클래스의 `Attack()`을 하위에서 `throw new NotSupportedException()`으로 막아버리는 일이 생긴다.

해결은 상속이 아닌 컴포지션이다. "공격할 수 있는 것"은 베이스 클래스가 아니라 인터페이스로 표현한다.

```csharp
public interface IDamageable { void TakeDamage(int dmg); }
public interface IAttacker { void Attack(IDamageable target); }
public interface IMovable { void MoveTo(Vector3 pos); }

public class Goblin : MonoBehaviour, IDamageable, IAttacker, IMovable { /* ... */ }
public class Turret : MonoBehaviour, IAttacker { /* 움직이지 않는다 */ }
public class Crate : MonoBehaviour, IDamageable { /* 공격받기만 한다 */ }
```

Turret이 `EnemyBase`를 상속받지 않으니 `MoveTo`를 억지로 구현할 필요가 없다. 각 기능을 가진 객체가 그 기능의 인터페이스만 구현한다. 이게 다음 원칙(ISP)으로 자연스럽게 이어진다.

---

## I - Interface Segregation Principle

> 클라이언트는 사용하지 않는 메서드에 의존하지 않아야 한다.

위에서 본 `IDamageable`, `IAttacker`, `IMovable`이 ISP의 예시 그대로다. 거대한 `IEntity` 하나에 모든 기능을 욱여넣는 대신, 작은 인터페이스를 여러 개 두는 게 정답이다.

ISP의 진가는 메시징 시스템에서 드러난다. **MessagePipe**가 여기에 잘 맞는다.

```csharp
// 메시지 타입 자체가 ISP의 단위
public readonly struct PlayerDamagedMessage
{
    public readonly int Amount;
    public PlayerDamagedMessage(int amount) { Amount = amount; }
}

public readonly struct EnemyKilledMessage
{
    public readonly int Score;
    public EnemyKilledMessage(int score) { Score = score; }
}
```

```csharp
public class ScoreSystem : IInitializable, IDisposable
{
    private readonly ISubscriber<EnemyKilledMessage> _subscriber;
    private IDisposable _disposable;

    public ScoreSystem(ISubscriber<EnemyKilledMessage> subscriber)
    {
        _subscriber = subscriber;
    }

    public void Initialize()
    {
        _disposable = _subscriber.Subscribe(msg => AddScore(msg.Score));
    }

    private void AddScore(int s) { /* ... */ }
    public void Dispose() => _disposable?.Dispose();
}
```

`ScoreSystem`은 `EnemyKilledMessage`만 구독한다. `PlayerDamagedMessage`를 알 필요도, 의존할 필요도 없다. 이벤트 버스가 하나의 거대한 `GameEvents` 정적 클래스였다면, 점수 시스템도 데미지 이벤트 정의에 묶여버린다.

---

## D - Dependency Inversion Principle

> 고수준 모듈은 저수준 모듈에 의존하면 안 된다. 둘 다 추상에 의존해야 한다.

DIP는 SOLID의 마지막이지만, 다른 네 원칙을 가능하게 만드는 토대다. 그리고 Unity에서 DIP를 가장 잘 강제하는 도구가 **VContainer**다.

### VContainer 기본 구조

```csharp
// 1) 추상
public interface IAudioService
{
    void Play(string clipId);
}

// 2) 구현 (저수준)
public class FmodAudioService : IAudioService
{
    public void Play(string clipId) { /* FMOD 호출 */ }
}

// 3) 사용 (고수준)
public class PlayerHealth
{
    private readonly IAudioService _audio;
    public PlayerHealth(IAudioService audio) { _audio = audio; }
    public void TakeDamage(int dmg) { _audio.Play("hit"); }
}

// 4) LifetimeScope에서 등록
public class GameLifetimeScope : LifetimeScope
{
    protected override void Configure(IContainerBuilder builder)
    {
        builder.Register<IAudioService, FmodAudioService>(Lifetime.Singleton);
        builder.Register<PlayerHealth>(Lifetime.Scoped);
    }
}
```

`PlayerHealth`는 FMOD를 모른다. `IAudioService`만 안다. 테스트할 때는 `MockAudioService`를 등록하면 끝. `FindObjectOfType`도 `Singleton.Instance`도 없다.

### MonoBehaviour 주입

VContainer는 MonoBehaviour에도 생성자 대신 메서드 주입을 지원한다.

```csharp
public class HudPresenter : MonoBehaviour
{
    private PlayerHealth _health;

    [Inject]
    public void Construct(PlayerHealth health)
    {
        _health = health;
    }
}
```

씬에 미리 배치된 컴포넌트는 `builder.RegisterComponentInHierarchy<HudPresenter>()`로 등록한다. 런타임에 생성되는 프리팹은 `builder.RegisterComponentInNewPrefab(prefab, Lifetime.Scoped)`을 쓴다.

### Zenject와의 차이

Zenject도 똑같은 일을 하지만 메서드 호출이 많고 리플렉션 비용도 크다. VContainer는 코드 생성으로 IL2CPP에서도 빠르다. 측정치로는 Zenject 대비 5~10배 정도 빠른 것으로 알려져 있다. 신규 프로젝트라면 VContainer를 권한다.

---

## UniTask: SOLID와 직접 관련은 없지만 필수

SOLID 원칙 자체는 아니지만, 위 코드 중 비동기가 들어가는 모든 곳에서 UniTask가 필요하다. Unity의 `Task`는 GC 알로케이션이 크고 SynchronizationContext가 무거워서, 게임 루프에 그대로 쓰면 프레임 드랍이 생긴다.

```csharp
public interface IEnemySpawner
{
    UniTask SpawnWaveAsync(int count, CancellationToken ct);
}

public class EnemySpawner : IEnemySpawner
{
    public async UniTask SpawnWaveAsync(int count, CancellationToken ct)
    {
        for (int i = 0; i < count; i++)
        {
            await UniTask.Delay(TimeSpan.FromSeconds(0.5f), cancellationToken: ct);
            // 스폰 로직
        }
    }
}
```

VContainer로 `IEnemySpawner`를 주입받으면, 테스트에서는 `await UniTask.CompletedTask`만 반환하는 Mock을 끼워 넣을 수 있다. DIP + 비동기가 자연스럽게 결합된다.

R3와도 잘 섞인다. R3의 `Observable`은 `ToUniTask()`로, UniTask는 `ToObservable()`로 양방향 변환이 가능하다.

---

## 추천 스택을 한 화면에

```csharp
// 입력 (R3 + UniTask)
public class PlayerInput : MonoBehaviour
{
    public Observable<Vector2> Move { get; private set; }
}

// 도메인 (POCO, MonoBehaviour 아님 - 테스트 가능)
public class PlayerHealth
{
    private readonly IAudioService _audio;
    private readonly IPublisher<PlayerDamagedMessage> _publisher;
    private readonly ReactiveProperty<int> _hp = new(100);

    public ReadOnlyReactiveProperty<int> Hp => _hp;

    public PlayerHealth(IAudioService audio, IPublisher<PlayerDamagedMessage> publisher)
    {
        _audio = audio;
        _publisher = publisher;
    }

    public void TakeDamage(int dmg)
    {
        _hp.Value -= dmg;
        _audio.Play("hit");
        _publisher.Publish(new PlayerDamagedMessage(dmg));
    }
}

// 뷰 (구독만)
public class HpBarView : MonoBehaviour
{
    [SerializeField] private Slider _slider;

    [Inject]
    public void Construct(PlayerHealth health)
    {
        health.Hp.Subscribe(v => _slider.value = v / 100f).AddTo(this);
    }
}

// 컴포지션 루트
public class GameLifetimeScope : LifetimeScope
{
    protected override void Configure(IContainerBuilder builder)
    {
        var options = builder.RegisterMessagePipe();
        builder.RegisterMessageBroker<PlayerDamagedMessage>(options);

        builder.Register<IAudioService, FmodAudioService>(Lifetime.Singleton);
        builder.Register<PlayerHealth>(Lifetime.Scoped);
        builder.RegisterComponentInHierarchy<HpBarView>();
    }
}
```

각 클래스가 자기 책임만 가지고(SRP), 새 뷰가 추가되어도 도메인은 닫혀 있고(OCP), 각 인터페이스는 작고(ISP), 도메인은 구체 구현이 아닌 추상에 의존한다(DIP). LSP는 인터페이스 기반 컴포지션이 자연스럽게 보장한다.

---

## 정리

| SOLID | Unity의 함정 | 대응 도구 |
|-------|-------------|----------|
| SRP | God MonoBehaviour | R3 (스트림으로 책임 분리) |
| OCP | switch-case 분기 추가 | ScriptableObject + R3 |
| LSP | 깊은 MonoBehaviour 상속 | 인터페이스 컴포지션 |
| ISP | 거대한 GameEvents 정적 클래스 | MessagePipe (메시지 단위 분리) |
| DIP | FindObjectOfType, Singleton.Instance | VContainer |

도구를 도입하기 전에 먼저 점검할 것은 "이 클래스가 바뀌는 이유가 몇 개냐"는 질문이다. 이유가 하나가 될 때까지 쪼개고, 그다음 R3로 결합을 풀고, VContainer로 주입을 정리하면 SOLID는 따라온다. 반대로 도구만 먼저 넣으면 `[Inject]`만 잔뜩 붙은 God 클래스가 또 만들어진다.

게임 코드가 늘어날수록 가장 먼저 무너지는 건 아키텍처가 아니라 변경 비용이다. SOLID는 변경 비용을 일정하게 유지하기 위한 규칙이고, VContainer/R3/MessagePipe/UniTask는 그 규칙을 매일의 코드에 강제하는 가드레일이다.

*God MonoBehaviour를 R3 스트림으로 잘라내고, VContainer로 의존성을 뒤집고, MessagePipe로 메시지를 분리하고, UniTask로 비동기를 묶는다 -- Unity에서 SOLID를 실제로 굴리는 한 줄 요약이다.*
