---
title: "AI로 게임 개발하기 - 6일차"
description: "AI가 만든 Unity 코드를 사람이 읽는 날. Arrow Rain 무기 상속 구조 분석, AI Trading 버그 수정. 스프린트 후 코드 리뷰의 가치."
date: 2026-02-25
categories: [Project]
tags: [Unity, AI]
---

## 속도를 줄인 이유

[5일차](/blog/2026/02/24/ai-game-dev-day-5/)에서 36개 피처 중 31개를 하루 만에 구현했다. 달성률 86%. GDD 확정이 만든 폭발적 속도였다. 무기 20종, 패시브 13종, 보스, 메뉴까지 하루에 끝냈다.

6일차에는 의도적으로 속도를 줄였다. 새 기능을 추가하지 않고, 어제 만든 것을 읽었다. 이유는 단순하다. **AI가 만든 코드를 사람이 이해하지 못하면, 그 코드는 유지보수할 수 없다.**

5일차에 AI가 생성한 코드량은 상당했다. 무기 20종의 클래스 파일, ScriptableObject 20개, 프리팹 28개. 이것들이 어떤 구조로 연결되어 있는지, 각 클래스가 어떤 책임을 가지는지, 확장 포인트는 어디인지 — 만든 당일에는 "동작하니까 다음"으로 넘어갔지만, 내일 버그가 발생하면 어디를 고쳐야 하는지 모르는 상태였다.

스프린트 후에는 반드시 리뷰가 필요하다. 6일차는 그 리뷰의 날이다.

---

## Arrow Rain 무기 분석 — 상속 구조 해부

무기 20종 중 Arrow Rain을 선택해 코드를 분석했다. Arrow Rain은 `AoEWeapon` 계열이라 상속 구조가 3단계로 깊고, 데이터-로직 분리 패턴을 가장 잘 보여주는 무기이기 때문이다.

### 상속 구조

```text
WeaponBase (추상 클래스)
└── AoEWeapon (추상 클래스)
    └── ArrowRainWeapon (구현 클래스)
```

각 계층의 책임은 명확하게 분리되어 있다.

| 계층 | 책임 |
|------|------|
| `WeaponBase` | 쿨다운 타이머, 레벨 관리, 스탯 계산, 공통 인터페이스 |
| `AoEWeapon` | 범위 공격의 공통 로직 — 범위 지정, 다수 적 감지, 이펙트 생성 |
| `ArrowRainWeapon` | Arrow Rain 고유 동작 — 랜덤 위치에 화살 낙하, 데미지 적용 |

### WeaponBase — 모든 무기의 뼈대

`WeaponBase`는 무기의 공통 라이프사이클을 관리한다. 핵심은 쿨다운 타이머와 레벨업 시스템이다.

```csharp
public abstract class WeaponBase : MonoBehaviour
{
    [SerializeField] protected WeaponData weaponData;

    protected int currentLevel = 1;
    protected float cooldownTimer;

    protected virtual void Update()
    {
        cooldownTimer -= Time.deltaTime;
        if (cooldownTimer <= 0f)
        {
            Attack();
            cooldownTimer = GetCooldown();
        }
    }

    protected abstract void Attack();

    protected float GetDamage() => weaponData.GetDamage(currentLevel) * playerStats.AttackPower;
    protected float GetCooldown() => weaponData.GetCooldown(currentLevel) * playerStats.CooldownMultiplier;
}
```

모든 무기는 `Attack()`만 오버라이드하면 된다. 쿨다운 관리, 스탯 보정, 레벨별 수치 조회는 `WeaponBase`가 처리한다. AI가 무기 20종을 빠르게 찍어낼 수 있었던 이유가 여기에 있다 — 각 무기는 `Attack()` 구현만 다르고 나머지는 전부 상속받는다.

### WeaponData — 데이터와 로직의 분리

`WeaponData`는 ScriptableObject로, 무기의 모든 수치를 에디터에서 관리할 수 있게 한다.

```csharp
[CreateAssetMenu(menuName = "Game/WeaponData")]
public class WeaponData : ScriptableObject
{
    public string weaponName;
    public Sprite icon;
    public WeaponType weaponType;

    [Header("Level Stats")]
    public LevelStat[] levelStats;

    [System.Serializable]
    public class LevelStat
    {
        public float damage;
        public float cooldown;
        public float area;        // AoE 무기용
        public int projectileCount;
        public float knockback;
    }

    public float GetDamage(int level) => levelStats[level - 1].damage;
    public float GetCooldown(int level) => levelStats[level - 1].cooldown;
}
```

이 패턴의 장점은 두 가지다.

1. **밸런싱이 코드 수정 없이 가능하다.** Arrow Rain의 데미지를 50에서 60으로 올리고 싶으면 SO 에디터에서 수치만 바꾸면 된다. 컴파일이 필요 없다.
2. **AI에게 새 무기를 만들라고 할 때, SO 하나와 클래스 하나만 추가하면 된다.** 기존 코드를 수정할 필요가 없으니 regression 위험이 낮다.

### ArrowRainWeapon — 고유 로직

Arrow Rain의 `Attack()`은 다음과 같이 동작한다.

```csharp
public class ArrowRainWeapon : AoEWeapon
{
    protected override void Attack()
    {
        Vector2 targetPos = GetRandomPositionNearPlayer();

        // 범위 내 모든 적에게 데미지
        Collider2D[] hits = Physics2D.OverlapCircleAll(targetPos, GetArea(), enemyLayer);
        foreach (var hit in hits)
        {
            if (hit.TryGetComponent<Health>(out var health))
            {
                health.TakeDamage(new DamageInfo(GetDamage(), GetKnockback(), targetPos));
            }
        }

        // VFX 재생
        SpawnAreaEffect(targetPos, GetArea());
    }
}
```

`GetRandomPositionNearPlayer()`는 `AoEWeapon`에서 제공하는 헬퍼 메서드다. 플레이어 주변 일정 반경 내 랜덤 좌표를 반환한다. `SpawnAreaEffect()`도 `AoEWeapon`의 공통 메서드로, 범위 이펙트 프리팹을 풀에서 꺼내 재생한다.

이 구조를 이해하고 나면 FrostNova, Earthquake, FlamePillar 같은 다른 AoE 무기도 읽을 수 있다. 전부 같은 패턴이다. `Attack()` 안에서 타겟 위치를 정하고, `OverlapCircleAll`로 범위 내 적을 감지하고, 데미지를 적용하고, VFX를 재생한다. 차이는 타겟 위치 결정 방식(랜덤 vs 플레이어 위치 vs 적 밀집 지역)과 VFX 종류뿐이다.

---

## 왜 AI가 만든 코드를 사람이 읽어야 하는가

"동작하면 됐지, 왜 굳이 읽어?"라는 반론이 있을 수 있다. 세 가지 이유가 있다.

### 1. 디버깅

Arrow Rain이 특정 상황에서 데미지를 0으로 찍는 버그가 발생했다고 가정하자. 코드를 읽지 않은 상태에서는 "Arrow Rain 데미지 안 들어감"이라는 증상만 알 수 있다. 코드를 읽은 상태에서는 원인 후보를 즉시 좁힐 수 있다.

- `WeaponData`의 레벨별 데미지가 0으로 설정되어 있는가?
- `playerStats.AttackPower`가 0인가?
- `Physics2D.OverlapCircleAll`의 레이어 마스크가 잘못되었는가?
- `Health.TakeDamage`에서 무적 상태가 걸려 있는가?

### 2. 확장

업적 시스템을 구현할 때 "Arrow Rain으로 적 100마리 처치" 같은 업적을 넣으려면, 어디에 카운터를 추가해야 하는지 알아야 한다. `ArrowRainWeapon.Attack()` 안의 `foreach` 루프에서 처치 판정이 발생하므로, 거기에 이벤트를 발행하면 된다. 코드를 읽지 않았다면 이 판단을 내릴 수 없다.

### 3. AI에게 더 좋은 프롬프트를 줄 수 있다

코드를 이해하면 AI에게 "ArrowRainWeapon의 Attack()에서 hits 루프 안에 OnEnemyKilled 이벤트를 추가해"라고 구체적으로 지시할 수 있다. 이해하지 못하면 "Arrow Rain에 처치 카운트 기능 추가해"라고 모호하게 지시하게 되고, AI는 기존 구조를 무시하고 새로운 구조를 만들 확률이 높아진다.

---

## AI Trading v3 — 운영 중 발생한 예외

게임 개발 리뷰와 병행해서 AI Trading v3 프로젝트의 버그 두 건을 수정했다. 이것도 "AI가 만든 시스템을 운영하면서 발생하는 문제"의 사례다.

### MIN_NOTIONAL 이슈

TRX 코인 매도가 계속 실패했다. 로그를 확인하니 Binance API가 `MIN_NOTIONAL` 에러를 반환하고 있었다.

```text
APIError(code=-1013): Filter failure: MIN_NOTIONAL
```

`MIN_NOTIONAL`은 Binance의 최소 주문 금액 필터다. 주문의 `price * quantity`가 $5 미만이면 거부한다. 소량의 TRX를 매도하려 했는데, 총 금액이 $5에 미달한 것이다.

AI가 처음 만든 `sell_market_order()`에는 이 검증이 없었다. "매도 수량을 받아서 API를 호출한다"까지만 구현되어 있었다. Binance의 거래 필터 규칙까지 학습 데이터에 포함되어 있었을 수 있지만, 실제 코드에서는 사전 검증 없이 API를 호출하고 에러가 나면 그냥 실패하는 구조였다.

수정은 두 단계로 진행했다.

```python
# binance_api.py — 최소 주문 금액 조회 메서드 추가
def get_min_notional(self, symbol: str) -> float:
    info = self.client.get_symbol_info(symbol)
    for f in info['filters']:
        if f['filterType'] == 'MIN_NOTIONAL':
            return float(f['minNotional'])
    return 5.0  # 기본값

# sell_market_order에 사전검증 추가
def sell_market_order(self, symbol: str, quantity: float) -> dict:
    min_notional = self.get_min_notional(symbol)
    ticker = self.client.get_symbol_ticker(symbol=symbol)
    current_price = float(ticker['price'])
    order_value = current_price * quantity

    if order_value < min_notional:
        raise ValueError(
            f"Order value ${order_value:.2f} < min notional ${min_notional:.2f}"
        )

    return self.client.order_market_sell(symbol=symbol, quantity=quantity)
```

### 대시보드 총자산 regression

국내주식 총자산 계산에서 `cash_krw`(현금 보유분)가 누락되는 regression이 발생했다. 이전 업데이트에서 `routes.py`의 총자산 계산 로직을 리팩토링하면서 현금 항목을 빠뜨린 것이다. 대시보드에 표시되는 총자산이 실제보다 수백만 원 적게 나왔다.

원인은 단순했다. 주식 평가금액만 합산하고 현금 잔고를 더하지 않은 것이다. 한 줄 수정으로 해결했지만, 발견하기까지 며칠이 걸렸다.

### 교훈

두 버그 모두 AI가 만든 코드의 "정상 경로(happy path)"만 구현된 상태에서 발생했다. MIN_NOTIONAL은 거래소의 예외 규칙을 사전 검증하지 않은 것이고, 총자산 누락은 리팩토링 과정에서 엣지 케이스를 놓친 것이다.

AI가 만든 시스템이 프로덕션에서 돌아가면, 정상 경로에서는 잘 동작하지만 엣지 케이스에서 실패한다. 이런 버그는 운영하면서만 발견할 수 있고, 발견한 후에는 사람이 코드를 읽고 원인을 파악해야 한다. 6일차의 코드 리뷰가 단순한 학습이 아니라 실전적으로 필요한 작업인 이유다.

---

## 숫자로 보는 하루

| 지표 | 수치 |
|------|------|
| 새로 구현한 피처 | 0개 |
| 코드 리뷰/분석 | WeaponBase, AoEWeapon, ArrowRainWeapon, WeaponData |
| AI Trading 버그 수정 | 2건 (MIN_NOTIONAL, 총자산 regression) |
| 테스트 통과 | 574 passed |
| 게임 피처 달성률 | 31/36 (86%, 변동 없음) |

---

## 회고

### 스프린트와 리뷰의 리듬

5일차가 스프린트였다면 6일차는 리뷰다. 이 리듬이 중요하다. AI와 함께 개발할 때 속도에 취해서 계속 새 기능만 추가하면, 어느 순간 코드베이스가 "동작하지만 아무도 이해하지 못하는" 상태가 된다. 그 상태에서 버그가 발생하면 AI에게 "고쳐줘"라고 해도, AI는 기존 컨텍스트를 모르기 때문에 새로운 코드를 생성해서 위에 덧붙이고, 복잡도는 더 증가한다.

주기적으로 멈추고 읽는 것이 결국 전체 속도를 높인다.

### AI가 만든 아키텍처의 품질

긍정적인 발견도 있었다. Arrow Rain 분석을 통해 확인한 `WeaponBase → AoEWeapon → ArrowRainWeapon` 상속 구조는 교과서적으로 깔끔했다. 각 계층의 책임이 명확하고, 새 무기를 추가할 때 `Attack()`만 구현하면 되는 확장성도 좋다. `WeaponData` SO로 데이터를 분리한 것도 Unity의 표준 패턴을 정확히 따르고 있다.

AI가 아키텍처 설계를 못하는 것이 아니다. GDD에서 무기 시스템의 구조를 명시했기 때문에 AI가 그대로 구현한 것이다. 다시 한 번, 스펙의 구체성이 결과의 품질을 결정한다.

---

## 다음 단계

미완성 5개 피처의 상태는 변하지 않았다. 다음에 착수할 작업은 다음과 같다.

1. **업적/도감 기획 확정** — 업적 목록, 도감 카테고리를 GDD에 추가. 기획이 확정되면 AI에게 구현을 맡길 수 있다.
2. **모바일 빌드 테스트** — Android APK 빌드, SpriteAtlas 패킹, Safe Area 대응, 성능 프로파일링.
3. **수익화 연동** — AdMob SDK 연동, 보상형 광고 3곳 구현.
4. **온보딩 튜토리얼** — 이동/레벨업/무기 선택 3단계 설계.

오늘은 코드를 한 줄도 작성하지 않았지만, 내일 코드를 작성할 때 더 정확하게 작성할 수 있게 되었다. 그것이 리뷰의 가치다.

---

*86% 구현 폭주 다음 날, 속도를 줄이고 AI가 만든 코드를 읽었다 — 스프린트 후 리뷰가 없으면 코드는 동작하지만 유지보수할 수 없게 된다.*
