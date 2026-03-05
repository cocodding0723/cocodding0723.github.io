---
title: "AI로 게임 개발하기 - 8일차"
description: "VFX 버그 수정, 매직넘버 30파일 정리에 이어 도감 시스템과 튜토리얼까지 구현. 달성률 89%에서 94%로 점프한 폭풍 코딩의 날."
date: 2026-03-05
categories: [Project]
tags: [Unity, AI]
---

## 드디어 코드를 쓰는 날

[7일차](/blog/2026/03/04/ai-game-dev-day-7/)는 문서만 봤다. 코드 0줄. 복귀 후 상태 점검에 집중한 날이었다. 8일차인 오늘은 Unity 에디터를 열고 프로젝트를 빌드했다. 컴파일 에러 0건. `Library/StateCache` 캐시 손상 로그가 하나 있었지만, Unity 내부 캐시 이슈로 코드와 무관하다.

깨끗한 빌드를 확인했으니 코드를 작성할 차례다. 그런데 도감 시스템(M4-27)에 들어가기 전에 먼저 해결해야 할 것들이 있었다. 플레이 테스트를 돌려보니 VFX가 이상했고, 앱을 내렸다 올리면 게임이 깨졌고, 메뉴에서 게임에 들어가면 조작이 안 됐다.

도감보다 급한 것이 3건의 버그 수정이었다.

---

## 버그 1: VFX가 중복되고 잔상이 남는다

가장 규모가 큰 수정이었다. 문제는 세 곳에서 동시에 발생하고 있었다.

### ObjectPool — ParticleSystem 중앙 관리

오브젝트 풀에서 가져온 VFX가 이전 파티클을 그대로 들고 있는 문제가 있었다. 풀에서 꺼낼 때(`Get`) 파티클이 클리어되지 않고, 반납할 때(`Return`) 파티클이 멈추지 않았다.

```csharp
// ObjectPool — Get 시
var allPS = obj.GetComponentsInChildren<ParticleSystem>(true);
foreach (var ps in allPS)
{
    ps.Clear(true);
    ps.Play(true);
}

// ObjectPool — Return 시
foreach (var ps in allPS)
{
    ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
    ps.Clear(true);
}
```

IPoolable 인터페이스도 개선했다. 풀에서 꺼낼 때 해당 오브젝트의 **모든** 컴포넌트에 통지하도록 변경했다. 이전에는 루트 컴포넌트 하나만 통지받았는데, 자식에 달린 VFX 컴포넌트는 초기화 시점을 알지 못했다.

### WeaponBase — ShowAttackVFX 중복 방지

무기가 공격할 때마다 VFX를 스폰하는데, 이전 VFX가 아직 재생 중인 상태에서 새 VFX가 겹쳐 나왔다. 특히 쿨다운이 짧은 무기에서 VFX가 2~3개 겹쳐 보이는 현상이 심했다.

```csharp
// WeaponBase — 이전 VFX 회수 후 새 VFX 스폰
if (_activeVFXInstance != null)
    _poolManager.Return(_activeVFXInstance);

_activeVFXInstance = _poolManager.Get(vfxPrefab);

// duration 미지정 시 쿨다운 기반 자동 산출
float autoDuration = Mathf.Min(_adjustedCooldown * 0.9f, 1.0f);
```

`_activeVFXInstance`로 현재 활성 VFX를 추적하고, 새 VFX를 스폰하기 전에 이전 것을 반납한다. duration은 쿨다운의 90%와 1초 중 작은 값으로 자동 산출한다. 루핑 파티클이 쿨다운보다 오래 재생되는 일이 없어진다.

### MeteorWeapon — 지연 데미지 리워크

Meteor는 완전히 리워크했다. 기존에는 VFX 스폰 즉시 데미지가 들어갔는데, 운석이 떨어지는 VFX의 착탄 시점과 데미지 타이밍이 맞지 않았다. 하늘에 운석이 나타나자마자 데미지가 들어가니 플레이어 입장에서 "왜 맞은 거지?" 싶은 상황이었다.

```csharp
private const float IMPACT_DELAY = 0.6f;

private struct PendingImpact
{
    public Vector3 Position;
    public float RemainingTime;
}

private readonly List<PendingImpact> _pendingImpacts = new();
```

`PendingImpact` 구조체로 "대기 중인 착탄"을 관리한다. Attack() 시점에 VFX를 스폰하고 PendingImpact를 등록한 뒤, `LateUpdate`에서 0.6초가 지나면 해당 위치에 데미지를 판정한다. 다중 운석이 동시에 날아가는 것도 자연스럽게 지원된다.

---

## 버그 2: 앱을 내리면 게임이 깨진다

모바일에서 앱을 백그라운드로 내렸다가 복귀하면 게임이 비정상 동작했다. `Time.deltaTime`이 폭발하면서 적이 순간이동하고, 타이머가 수십 초씩 점프했다.

```csharp
// GameManager — 앱 포커스/포즈 자동 처리
private bool _autoPaused;

private void OnApplicationFocus(bool hasFocus)
{
    if (!hasFocus && CurrentState.CurrentValue == GameState.InGame)
    {
        _autoPaused = true;
        PauseGame();
    }
    else if (hasFocus && _autoPaused)
    {
        _autoPaused = false;
        ResumeGame();
    }
}
```

`_autoPaused` 플래그로 사용자가 수동으로 일시정지한 것과 앱 백그라운드로 인한 자동 일시정지를 구분한다. 사용자가 수동 일시정지 중에 앱을 내렸다 올려도 자동 해제되지 않는다.

---

## 버그 3: 메뉴에서 게임에 들어가면 조작이 안 된다

이전 세션에서 일시정지(`Time.timeScale = 0`) 상태로 게임을 끝내고 메뉴로 돌아가면, 다음 게임에서 `Time.timeScale`이 0인 채로 시작된다. `SceneManager.LoadScene`은 timeScale을 리셋하지 않는다.

```csharp
// GameManager.StartGame()
Time.timeScale = 1f;  // 이전 세션 Pause 상태 잔류 방지
```

한 줄 수정이다. 하지만 재현 조건이 "일시정지 상태에서 메뉴로 돌아간 뒤 다시 게임을 시작한다"여서, 정상 플로우에서는 발생하지 않는다. 이런 종류의 버그가 가장 발견하기 어렵다.

---

## 하드코딩 값 정리 — 30파일 리팩토링

버그 3건을 수정한 뒤, 코드 전반에 흩어진 매직넘버를 정리했다. 공유 상수 클래스 3종을 새로 만들고, ~30개 파일에서 하드코딩된 값을 중앙 상수로 교체했다.

```csharp
// 신규 상수 클래스 3종
public static class PlayerPrefsKeys    // 10종 키 중앙화
public static class SceneNames         // GameScene, MenuScene
public static class PickupConstants    // 마그넷 물리 4상수
```

수정 대상은 광범위했다.

| 영역 | 수정 파일 | 내용 |
|------|-----------|------|
| PlayerPrefs 키 | AchievementManager, ShopManager 등 8개 | 문자열 리터럴 → `PlayerPrefsKeys` |
| 무기 매직넘버 | ArrowRain, Meteor, FlamePillar 등 7개 | Attack() 내 매직넘버 → `const` |
| 무기 진화 보너스 | 무기 11종 | 진화 배율 → `named const` |
| 기타 | AudioManager, DamageTextSpawner, XPManager 등 | 임계값/오프셋 → `const` |

~30파일 수정, **동작 변경 0건**. 순수한 리팩토링이다.

---

## 도감 시스템 (M4-27) — 구현 완료

버그 수정과 리팩토링이 끝나고, 7일차에서 계획한 도감 시스템에 착수했다. 계획만 세워두면 AI에게 한 번에 구현을 맡길 수 있다고 했는데, 실제로 그랬다.

### EncyclopediaManager

도감의 핵심 로직이다. GameEvents를 구독해서 적/보스/무기/패시브 아이템의 발견을 추적하고, 킬 카운트까지 기록한다.

```csharp
public class EncyclopediaManager : MonoBehaviour
{
    // GameEvents 구독 6종
    // - OnEnemyKilled → 적 발견 + 킬카운트 증가
    // - OnBossKilled → 보스 발견
    // - OnWeaponSelected → 무기 발견
    // - OnWeaponEvolved → 진화 무기 발견
    // - OnPassiveItemAcquired → 패시브 발견
    // - OnGameOver → 세션 델타 플러시

    private void FlushSessionDelta()
    {
        // 세션 중 변경된 데이터만 PlayerPrefs에 저장
    }
}
```

영속화는 PlayerPrefs를 사용했다. [4일차](/blog/2026/02/23/ai-game-dev-day-4/)에서 세이브/로드를 PlayerPrefs MVP로 구현한 것과 같은 패턴이다. 세션이 끝날 때 `FlushSessionDelta()`로 변경분만 저장하므로, 매 이벤트마다 PlayerPrefs를 쓰는 것보다 I/O가 효율적이다.

### 기존 SO 확장

7일차에서 "별도 SO를 만들면 데이터가 이중 관리된다"고 분석했던 대로, 기존 `EnemyData`와 `BossData`에 도감용 필드를 추가했다.

```csharp
// EnemyData, BossData에 추가
[Header("Encyclopedia")]
public string DisplayName;    // 도감 표시 이름
public string Description;    // 도감 설명 텍스트
```

`WeaponData`와 `PassiveItemData`는 이미 DisplayName이 있었으므로 추가 필드가 필요 없었다.

### 메인 메뉴 UI 통합

도감은 메인 메뉴에 탭 형태로 들어간다. 3개 탭(적, 무기, 패시브)으로 나뉘고, 각 탭에 카드 그리드가 표시된다.

```xml
<!-- MainMenu.uxml 확장 -->
<ui:Button name="btn-encyclopedia" text="도감" />
<ui:VisualElement name="encyclopedia-panel">
    <!-- 탭 3종: 적 / 무기 / 패시브 -->
    <!-- ScrollView + 카드 그리드 -->
</ui:VisualElement>
```

미발견 항목은 `???`로 표시되고 opacity가 낮아진다. Vampire Survivors의 도감과 동일한 패턴이다. `MainMenuController`에 카드 빌더 3종(적/무기/패시브)을 추가해서 SO 데이터를 기반으로 카드를 동적 생성한다.

### 테스트

EditMode 테스트 10개를 작성했다. 적 발견, 킬카운트 증가, 무기 해금, 패시브 해금, 세션 플러시 등 핵심 로직을 커버한다. 이전 세션에서 구축한 테스트 프레임워크(146 + 24 = 170개 테스트)에 10개가 추가되어 총 180개 테스트가 되었다.

한 마디로 정리하면, 발견은 이벤트 구독, 저장은 PlayerPrefs, 표시는 UI Toolkit. 기존 시스템을 그대로 조합했을 뿐 새로운 아키텍처 패턴은 없다. 그래서 빠르게 끝났다.

---

## 온보딩 튜토리얼 (M5-31) — 구현 완료

도감까지 끝내고, 7일차에서 2순위로 잡았던 온보딩 튜토리얼에도 착수했다. "도감이 완성된 후에 튜토리얼에서 도감도 안내할 수 있다"고 했던 순서 의존이 해소된 것이다.

### 3단계 인게임 튜토리얼

```text
Step 1: 이동 안내
  → 풀스크린 오버레이 + 일시정지 + 탭하여 해제

Step 2: 자동 공격 안내
  → 3초 후 상단 힌트 표시 (일시정지 없음)

Step 3: 레벨업 안내
  → OnLevelUp 이벤트 구독, 첫 레벨업 시 안내
```

```csharp
public class TutorialController : MonoBehaviour
{
    // Reflex DI + R3 구독
    // PlayerPrefs "Tutorial_Completed" → 1회만 표시
    // Step1: 풀스크린 오버레이, timeScale=0, 탭으로 해제
    // Step2: 3초 대기 후 상단 플로팅 힌트
    // Step3: OnLevelUp 구독, 첫 레벨업 시 무기 선택 안내
}
```

뱀서라이크는 조작이 단순하므로 튜토리얼도 가볍게 만들었다. Step 1만 일시정지를 걸고, Step 2~3은 게임 플레이를 방해하지 않는 힌트로 처리한다.

UI는 별도 UIDocument에 `sortOrder=20`으로 배치해서 게임 HUD 위에 오버레이된다. CSS transition으로 opacity 300ms 페이드인/아웃을 넣었다.

`PlayerPrefs`에 `Tutorial_Completed` 키를 저장해서 한 번만 표시한다. 두 번째 플레이부터는 튜토리얼이 뜨지 않는다.

---

## 숫자로 보는 하루

| 지표 | 수치 |
|------|------|
| 버그 수정 | 3건 (VFX 중복/잔상, 앱 포커스, timeScale 잔류) |
| 신규 피처 | 2개 (도감 시스템, 온보딩 튜토리얼) |
| 신규 파일 | 상수 클래스 3개 + EncyclopediaManager + TutorialController + UXML/USS |
| 수정 파일 | ~30개 (하드코딩 정리) |
| 테스트 추가 | 10개 (도감 EditMode 테스트) |
| 게임 피처 달성률 | **34/36 (94%)** ← 32/36 (89%)에서 점프 |

---

## 남은 것은 2개

| 항목 | ID | 마일스톤 | 상태 |
|------|----|----------|------|
| ~~도감 시스템~~ | ~~M4-27~~ | ~~M4~~ | ✅ **완료** |
| ~~온보딩 튜토리얼~~ | ~~M5-31~~ | ~~M5~~ | ✅ **완료** |
| 수익화 (보상형 광고 3곳) | M5-32 | M5 | 미완료 |
| 모바일 최적화 | M5-35 | M5 | 미완료 |

7일차에서 4개 남았던 피처가 2개로 줄었다. 남은 것은 수익화(AdMob)와 모바일 최적화(SpriteAtlas, 배칭, Safe Area). 둘 다 게임 로직이 아니라 인프라 작업이다.

7일차의 우선순위 "콘텐츠 → UX → 수익화 → 최적화"에서 콘텐츠(도감)와 UX(튜토리얼)를 하루 만에 끝냈다. 다음은 수익화, 그리고 마지막으로 최적화.

---

## 복귀 3일의 흐름

```text
7일차: 문서 점검 → 상태 파악, 우선순위 결정
8일차: 버그 수정 → 리팩토링 → 도감 구현 → 튜토리얼 구현
9일차: 수익화(AdMob) 또는 모바일 최적화
```

7일차에 코드를 한 줄도 쓰지 않고 계획만 세운 것이 8일차의 생산성으로 이어졌다. 우선순위가 명확했기 때문에 "다음에 뭘 하지?"라는 고민 없이 순서대로 처리했다. 버그 수정 → 리팩토링 → 도감 → 튜토리얼. 방향이 정해져 있으면 AI에게도 정확한 지시를 내릴 수 있고, AI가 빠르게 코드를 생성하면 사람은 검증에 집중할 수 있다.

[5일차](/blog/2026/02/24/ai-game-dev-day-5/)에 하루 만에 무기 20종을 찍어냈을 때처럼, 기획이 단단하면 구현 속도는 AI가 만들어준다.

---

*버그 3건 수정, 매직넘버 30파일 정리, 도감과 튜토리얼까지 — 달성률 89%에서 94%로, 남은 피처는 이제 2개다.*
