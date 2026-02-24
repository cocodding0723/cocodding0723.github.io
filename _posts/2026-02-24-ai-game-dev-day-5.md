---
title: "AI로 게임 개발하기 - 5일차"
description: "GDD 확정 다음 날, 36개 피처 중 31개를 하루 만에 구현해 86% 완성. 무기 20종, 패시브 13종, 보스, 메뉴까지 끝낸 기록."
date: 2026-02-24
categories: [Project]
tags: [Unity, AI]
---

## 오늘의 성과 요약

[4일차](/blog/2026/02/23/ai-game-dev-day-4/)에서 네 가지를 계획했다.

1. 뱀서라이크 Phase 1 구현 착수
2. 크롤러 실전 투입
3. R3 프레임워크 설치 완료
4. 수집된 에셋 Unity 연동

결과부터 말하면, Phase 1만 착수한 게 아니라 **Phase 4까지 끝내고 Phase 5 절반까지 진행**했다. 36개 기능 중 31개 완성. 달성률 86%. 어제 "GDD가 구성되었으니 내일부터 진짜 게임을 만든다"고 썼는데, 진짜로 하루 만에 거의 다 만들었다.

| 항목 | 계획 | 실제 |
|------|------|------|
| Phase 1 코어 파운데이션 | 착수 | **12/12 완료** |
| Phase 2 무기/아이템 | 미정 | **6/6 완료** |
| Phase 3 보스/스테이지 | 미정 | **4/4 완료** |
| Phase 4 메타게임 | 미정 | **6/8 완료** |
| Phase 5 폴리시 | 미정 | **3/5 완료** |
| **합계** | | **31/36 (86%)** |

---

## 왜 이 속도가 가능했는가

### GDD의 효과

4일차에서 "명확한 스펙을 주면 AI는 정확하게 구현한다"는 교훈을 얻었다. 5일차에서 그것이 실제로 검증됐다. GDD에 36개 피처의 스펙이 수치까지 전부 확정되어 있었기 때문에, AI에게 "M1-5 구현해"라고 하면 그 안의 입력 방식, 이동 속도, 정규화 규칙까지 전부 알고 코드를 생성했다. "무엇을 만들지" 고민이 사라진 순간 속도가 폭발한 것이다.

### Phase 순서대로 진행한 이유

5개 Phase는 의존성 순서대로 설계되어 있다. Phase 1의 오브젝트 풀링이 없으면 Phase 2의 투사체를 못 만들고, Phase 2의 무기 시스템이 없으면 Phase 3의 보스 전투가 무의미하다. 이 순서를 지켰기 때문에 "이전 단계 코드를 고쳐야 한다"는 상황이 거의 발생하지 않았다.

### AI의 패턴 복제 능력

무기 20종을 하루에 만든 것이 가장 대표적이다. `WeaponBase` 추상 클래스와 `WeaponData` ScriptableObject를 먼저 설계하면, AI는 그 패턴을 복제해서 나머지 19종을 찍어낸다. 패시브 아이템 13종, 캐릭터 6종도 같은 원리다. 첫 번째를 사람이 설계하고, 나머지를 AI가 복제한다.

---

## Phase 1 — 코어 파운데이션 (12/12)

게임의 뼈대. 여기가 무너지면 모든 게 무너진다.

### M1-0: 에셋 임포트

크롤러로 수집한 에셋과 직접 구한 에셋을 Unity에 임포트했다.

| 카테고리 | 내용 |
|----------|------|
| 캐릭터 | Player, Enemy 3종 스프라이트 |
| 환경 | 타일셋, 투사체, VFX |
| 아이템 | 드롭 아이템 스프라이트 |
| 오디오 | BGM 3곡, SFX 11개 |
| UI | 폰트 4종, UI 에셋 2종 |

### M1-1 ~ M1-4: 프로젝트 기반

```text
Assets/_Project/
├── Scripts/
│   ├── Core/          # GameManager, EventHub, ObjectPool
│   ├── Player/        # 이동, 스탯, HP
│   ├── Enemy/         # AI, 스폰, 데이터
│   ├── Weapon/        # 무기 베이스, 투사체, AoE
│   ├── Item/          # 패시브, 경험치, 코인
│   ├── UI/            # HUD, 레벨업, 메뉴, 결과
│   └── Stage/         # 스테이지, 보스, 무한맵
├── Data/              # ScriptableObject (SO)
├── Prefabs/
├── Audio/
└── ... (20개 폴더)
```

`GameManager`는 R3의 `ReactiveProperty`로 게임 상태를 관리한다. 600초(10분) 세션 타이머, 상태 전환 화이트리스트, 부활 1회 제한까지 GDD 스펙 그대로 구현했다.

```csharp
// 상태 전환 화이트리스트 — 허용되지 않은 전이는 무시
private static readonly HashSet<(GameState from, GameState to)> _validTransitions = new()
{
    (GameState.Menu, GameState.Playing),
    (GameState.Playing, GameState.Paused),
    (GameState.Playing, GameState.LevelUp),
    (GameState.Playing, GameState.GameOver),
    (GameState.Playing, GameState.Victory),
    (GameState.Paused, GameState.Playing),
    (GameState.LevelUp, GameState.Playing),
    (GameState.GameOver, GameState.Menu),
    (GameState.Victory, GameState.Menu),
};
```

이벤트 시스템은 R3 `Subject` 기반 14종 이벤트 허브로 구성했다. 페이로드는 전부 `readonly struct`로 만들어 GC 압력을 최소화했다.

### M1-5: 플레이어 이동

`Rigidbody2D.MovePosition` + FloatingJoystick(uGUI) + InputSystem WASD/게임패드를 지원한다. 대각선 이동 시 속도가 1.414배 되는 문제는 `Vector2.ClampMagnitude`로 정규화했다.

### M1-6: 카메라

Cinemachine 3.x API로 구현했다. `CinemachineCamera` + `CinemachinePositionComposer`로 플레이어 추적, `CinemachineImpulseSource`/`Listener`로 피격 시 화면 흔들림.

### M1-7: HP 시스템

```csharp
public void TakeDamage(DamageInfo info)
{
    if (_isInvincible) return;

    CurrentHP.Value = Mathf.Max(0, CurrentHP.Value - info.FinalDamage);
    StartCoroutine(InvincibilityFrame(0.5f));  // iFrame 0.5초
    StartCoroutine(DamageFlash());             // 빨간 플래시
    GameEvents.OnPlayerDamaged.OnNext(info);

    if (CurrentHP.Value <= 0)
    {
        Time.timeScale = 0.3f;  // 사망 슬로모션
        GameEvents.OnPlayerDeath.OnNext(Unit.Default);
    }
}
```

`ReactiveProperty`로 HP를 관리하니, HUD의 HP 바가 자동으로 구독해서 갱신된다. 별도의 업데이트 호출이 필요 없다.

### M1-8 ~ M1-9: 적 AI + 스폰

5종 적 AI를 구현했다.

| 적 | 행동 패턴 |
|----|-----------|
| 슬라임 | 직선 추적 |
| 스켈레톤 | 직선 추적 + 근접 공격 |
| 다크배트 | 지그재그 이동 |
| 아머골렘 | 느린 추적 + 높은 HP |
| 폭탄 | 돌진 후 자폭 |

전부 `EnemyData` ScriptableObject로 수치를 분리했다. AI 로직과 데이터가 분리되어 있으니 새 적 추가가 SO 하나 만드는 것으로 끝난다.

스폰 시스템은 GDD의 5페이즈 웨이브를 구현했다. 뷰포트 바깥에서 랜덤 스폰하되, 가중치 선택으로 시간이 지날수록 강한 적이 더 자주 나온다. 동시 존재 상한은 200마리.

### M1-10 ~ M1-12: XP + HUD + 무한 맵

경험치 젬 3종(소/중/대)은 자석 반경에 들어오면 플레이어에게 흡수된다. GDD의 EXP 테이블에 따라 레벨업이 발생하면 `GameEvents.OnLevelUp`을 발행한다.

HUD는 UI Toolkit(UXML + USS)으로 구현했다. `PanelSettings`의 `ScaleWithScreenSize`를 1920x1080 기준으로 설정해 다양한 해상도를 지원한다.

무한 맵은 3x3 청크를 플레이어 위치 기준으로 재배치하는 방식이다. `ChunkDecorator`가 청크마다 랜덤으로 나무, 꽃, 돌 등 장식 20종을 배치한다.

---

## Phase 2 — 무기/아이템 시스템 (6/6)

### M2-13 ~ M2-14: 무기 20종

무기 시스템의 핵심 아키텍처는 다음과 같다.

```text
WeaponBase (추상 클래스)
├── ProjectileWeapon → ThrowingKnife, IceShard, Boomerang, ArcaneMissile
├── AoEWeapon       → FrostNova, ArrowRain, Earthquake, FlamePillar
├── OrbitWeapon     → HolyCross, SpiritOrb
└── SpecialWeapon   → LightningRing, BloodScythe, Tornado, DivineBeam, ...
```

`WeaponData` SO에 데미지, 쿨다운, 투사체 속도, 넉백 수치가 전부 정의되어 있다. AI에게 "ThrowingKnife와 같은 구조로 IceShard를 만들어라, 수치는 이것"이라고 하면 그대로 복제한다. 이 방식으로 20종을 프리팹 28개, SO 20개로 완성했다.

넉백 파이프라인은 `Health` → `EnemyHitReaction` → `WeaponBase`로 전달된다. 무기마다 넉백 강도가 다르고, 아머골렘은 넉백 저항이 높다.

### M2-15: 패시브 아이템 13종

```csharp
public enum PassiveItemType
{
    MaxHP, Armor, HPRegen, MoveSpeed, Magnet,
    AttackPower, AttackSpeed, CooldownReduction,
    ProjectileCount, ProjectileSpeed, AreaSize,
    Duration, Luck
}
```

`PassiveItemManager`는 6슬롯을 관리하며, dirty 플래그 캐싱으로 스탯 집계 비용을 최소화했다. 쿨다운 감소(CDR)는 곱연산으로 처리해 중첩 시 100%에 수렴하지 않도록 했다.

### M2-16: 레벨업 선택 UI

레벨업 시 `timeScale = 0`으로 일시정지하고, 카드 3장을 팝업으로 보여준다. GDD 가중치에 따라 새 무기 60%, 기존 무기 레벨업 20%, 패시브 아이템 20% 확률로 옵션을 생성한다. 카드 등장 애니메이션은 `EaseOutBack` 커브.

### M2-17: 무기 진화

무기 레벨이 최대(5→8 확장 적용)에 도달하고, 대응하는 패시브 아이템을 보유하면 진화가 활성화된다. 13쌍의 진화 페어가 존재한다. 진화 트리거는 Phase 3의 보물 상자에서 발생한다.

### M2-18: 스탯 계산

`IPassiveStatProvider` 인터페이스를 통해 패시브 보너스를 수집하고, `PlayerStatCalculator`가 기본 스탯 + 패시브 보너스 + 영구 강화 보너스를 합산한다. 계산 결과는 `StatsChangedEvent`로 13개 필드를 브로드캐스트한다.

---

## Phase 3 — 보스/스테이지 (4/4)

### M3-19: 보스 시스템

`BossController`는 3페이즈 상태 머신으로 동작한다. HP 비율에 따라 페이즈가 전환되며, 각 페이즈마다 행동 패턴이 변한다. `BossMovement`는 추적, 돌진, 충격파, 소환 4가지 행동을 조합한다. 보스 HP 바는 `Lerp` 보간으로 부드럽게 감소한다.

### M3-20 ~ M3-21: 난이도 곡선 + 스테이지 3종

`StageData` SO에 스테이지별 HP/ATK/스폰속도/보스HP 배율을 정의했다. 시간이 지날수록 적이 강해지는 것과 별도로, 스테이지 자체의 난이도 배율이 적용된다.

| 스테이지 | 테마 | 배경 |
|----------|------|------|
| 어둠의 숲 | 초록 타일, 나무 장식 | 짙은 녹색 |
| 잊혀진 묘지 | 회색 타일, 묘비 장식 | 어두운 보라 |
| 붕괴의 던전 | 돌 타일, 기둥 장식 | 짙은 회색 |

`InfiniteMap.ApplyTheme()`으로 청크의 스프라이트와 장식을 테마에 맞게 교체한다.

### M3-22: 보물 상자

보스 사망 시 `TreasureChest`가 스폰된다. 부유 애니메이션(사인파)으로 눈에 띄게 만들고, 획득 시 HP 25% 회복 + 무기 진화를 트리거한다.

---

## Phase 4 — 메타게임 (6/8)

### M4-23: 캐릭터 6종

| 캐릭터 | 특성 |
|--------|------|
| Knight | HP/방어 특화, 시작무기 가드 계열 |
| Rogue | 이동속도/공속 특화 |
| Mage | 공격력/범위 특화, 시작무기 ArcaneMissile |
| Priest | HP 회복 특화 |
| Berserker | 공격력 극대화, 낮은 방어 |
| Ranger | 투사체 속도/개수 특화 |

`CharacterManager`가 선택/해금 상태를 `PlayerPrefs`로 영속한다.

### M4-24 ~ M4-25: 골드 시스템 + 영구 강화

적이 코인을 드롭하고, 코인으로 영구 강화 5종(MaxHP, Attack, Speed, Armor, XPGain)을 구매한다. 영구 강화 보너스는 `PlayerStatCalculator`에 통합되어 게임 시작 시 자동 적용된다.

### M4-28 ~ M4-30: 세이브/로드 + 메뉴 + 결과 화면

메뉴 씬을 분리하고, `MainMenu.uxml` + USS로 홈/업그레이드/캐릭터/스테이지 4개 화면을 구현했다. `Reflex`(Unity용 DI 프레임워크)로 의존성을 주입하고, `SceneManager.LoadScene`으로 씬 전환한다.

결과 화면은 생존 시간, 처치 수, 획득 코인, 최종 레벨을 보여주고, "광고 시청 시 보상 2배" MVP 버튼을 배치했다(실제 광고 연동은 M5-32).

---

## Phase 5 — 폴리시 (3/5)

### M5-33: 오디오

`AudioManager`는 BGM 크로스페이드(2소스) + SFX 풀(8소스)로 구성된다. `GameEvents`를 구독해 9종 이벤트(피격, 레벨업, 보스 등장 등)에 자동 반응한다. `ThrottleFirst`로 동시에 같은 SFX가 도배되는 것을 방지했다.

| 오디오 | 내용 |
|--------|------|
| BGM | 메뉴, 필드, 보스전 3곡 |
| SFX | 공격, 피격, 레벨업, 코인 획득 등 8종 |

### M5-34: VFX

AI-Roguelike 프로젝트에서 CartoonFX와 HyperCasualFX 2종을 마이그레이션했다. `Assets/VFX/` 폴더 신규 생성, 총 504개 파일.

| 패키지 | 프리팹 | 머티리얼 | 텍스처 | 셰이더 |
|--------|--------|----------|--------|--------|
| CartoonFX | 65개 | 192개 | 141개 | 4개 |
| HyperCasualFX | 25개 | 4개 | 44개 | - |

`VFXManager`는 R3 이벤트 5종을 구독해 적절한 파티클을 재생한다.

### M5-36: 밸런싱

GDD 수치를 전수 검증하면서 몇 가지를 보정했다.

- MagicBolt, GuardianAura 쿨다운 보정
- Mage 시작 무기를 ThrowingKnife에서 ArcaneMissile로 변경 — 마법 테마에 맞지 않았다

---

## 코드 리팩토링

기능 구현만큼 중요한 것이 코드 품질이다. AI가 생성한 코드를 그대로 두면 중복이 쌓인다.

| 리팩토링 | 효과 |
|----------|------|
| WeaponBase 공유 헬퍼 추출 | AoE 무기 8종의 중복 코드 ~200줄 감소 |
| 투사체 3종 `RotateVector` 중복 제거 | 공통 유틸 메서드로 통합 |
| Material/Texture2D `OnDestroy` 누수 수정 | 런타임 메모리 누수 방지 |
| deprecated `transform.scale` → `style.scale` | UI Toolkit 경고 제거 |
| HUDSpriteApplier | bar-bg/weapon-slot에 픽셀아트 프레임 적용 |

AI가 무기 20종을 찍어내면서 `RotateVector` 같은 유틸 함수를 각 클래스에 중복 생성한 것이 대표적인 예다. AI는 파일 단위로 완결된 코드를 생성하려는 경향이 있어서, 크로스 파일 중복을 스스로 제거하지 않는다. 이런 부분은 사람이 잡아야 한다.

---

## 기타 병렬 작업: AI Trading v3

게임 개발과 별도로 AI Trading 프로젝트도 업데이트했다.

### 랭킹 + 해외뉴스 통합

KIS(한국투자증권) 국내 랭킹 API를 전면 수정했다. KIS 공식 GitHub에서 실제 API 스펙을 확인하고, 10가지 순위 유형별로 올바른 엔드포인트/TR-ID/파라미터를 재구현했다.

| 순위 유형 | 엔드포인트 |
|-----------|-----------|
| volume, vol_increase, turnover, trade_amount | `/ranking/volume-rank` |
| change_up, change_down | `/ranking/fluctuation` |
| market_cap | `/ranking/market-cap` |
| strength (체결강도) | `/ranking/volume-power` |
| new_high, new_low | `/ranking/near-new-highlow` |

해외뉴스 API(해외 종합뉴스/속보)와 Binance 트렌딩 코인 API(24hr 상승률 상위, $1M 최소 거래대금 필터)도 추가했다.

---

## 미완성 5개 — 왜 아직 못 했는가

| 피처 | Phase | 미완성 이유 |
|------|-------|-------------|
| 업적 시스템 | M4-26 | 업적 목록 기획이 필요. 어떤 업적을 넣을지 결정되지 않음 |
| 도감 시스템 | M4-27 | 도감 UI/UX 설계와 콘텐츠 정리가 선행되어야 함 |
| 온보딩 튜토리얼 | M5-31 | 게임 완성 후 플레이 흐름이 확정되어야 설계 가능 |
| 수익화 (보상형 광고) | M5-32 | 빌드 후 실기기에서 테스트 필요 |
| 모바일 최적화 | M5-35 | SpriteAtlas, 배칭, Safe Area — 역시 실기기 빌드 후 작업 |

패턴이 보인다. **콘텐츠 기획이 필요한 것**(업적, 도감, 튜토리얼)과 **실기기 빌드가 필요한 것**(수익화, 모바일 최적화)이다. 둘 다 "코드만 짜면 되는" 작업이 아니기 때문에 AI에게 바로 던질 수 없었다. AI가 빠르게 처리할 수 있는 건 스펙이 명확한 구현 작업이고, 기획 결정이나 물리 디바이스 테스트는 여전히 사람의 몫이다.

---

## 회고

### GDD → 구현 폭발의 인과관계

4일차에서 GDD를 확정하는 데 하루를 투자했다. 36개 피처의 수치와 동작을 전부 확정하는 작업이었다. 그 투자가 5일차에 86% 완성이라는 결과로 돌아왔다. 만약 GDD 없이 "뱀서라이크 만들어줘"라고 했다면, AI는 제네릭한 템플릿을 생성했을 것이고, 그걸 수정하는 데 더 많은 시간이 들었을 것이다.

교훈은 단순하다. **AI에게 투입하는 스펙의 구체성이 곧 결과물의 완성도다.**

### AI 코드 생성의 한계

86%를 완성했지만, AI가 생성한 코드를 그대로 쓸 수는 없었다. 대표적인 문제들:

1. **크로스 파일 중복** — AI는 파일 단위로 완결된 코드를 생성하려 한다. `RotateVector` 같은 유틸을 3개 파일에 각각 만든다.
2. **메모리 관리 부주의** — `Material`, `Texture2D`를 `OnDestroy`에서 해제하지 않는다. 에디터에서는 문제가 안 보이지만 모바일에서는 메모리 누수다.
3. **deprecated API 사용** — `transform.scale` 같은 구버전 API를 사용한다. 학습 데이터의 시차 문제다.

결론: AI는 "첫 번째 동작하는 버전"을 만드는 데 탁월하고, 사람은 "프로덕션 품질"로 끌어올리는 데 필요하다.

### 숫자로 보는 하루

| 지표 | 수치 |
|------|------|
| 완성 피처 | 31/36 (86%) |
| 무기 종류 | 20종 + 진화 13쌍 |
| 패시브 아이템 | 13종 |
| 캐릭터 | 6종 |
| 스테이지 | 3종 |
| 적 유형 | 5종 + 보스 1종 |
| ScriptableObject | 50+ 개 |
| VFX 파일 마이그레이션 | 504개 |

---

## 다음 단계

1. **미완성 5개 중 업적/도감 기획 확정** — 업적 목록과 도감 카테고리를 GDD에 추가하고 구현
2. **모바일 빌드 테스트** — Android APK 빌드 후 SpriteAtlas, Safe Area, 성능 프로파일링
3. **수익화 연동** — AdMob 보상형 광고 3곳(부활, 코인 2배, 보물 상자 추가)
4. **온보딩 튜토리얼** — 이동, 레벨업, 무기 선택 3단계

36개 중 31개를 하루에 끝낸 건 GDD 확정 덕분이다. 남은 5개는 기획 결정과 실기기 테스트가 필요한 것들이다. 속도의 병목은 코드 작성이 아니라 의사결정이라는 것을, 이 시리즈를 시작한 이래 가장 명확하게 체감한 하루였다.

---

*GDD를 구성한 다음 날, 36개 기능 중 31개를 하루 만에 구현해 86% 완성 — 명확한 스펙이 AI의 속도를 폭발시킨다는 가설이 검증된 기록이다.*
