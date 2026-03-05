---
title: "AI로 게임 개발하기 - 8일차"
description: "도감 시스템 구현 전 Unity 프로젝트 건강 체크. 컴파일 에러 0건 확인, Library/StateCache 캐시 손상 발견과 대응. AI를 활용한 프로젝트 진단의 가치."
date: 2026-03-05
categories: [Project]
tags: [Unity, AI]
---

## 도감 시스템 전에 할 일이 있었다

[7일차](/blog/2026/03/04/ai-game-dev-day-7/)에서 1주일 공백 후 복귀하여 문서를 점검하고, 도감 시스템(M4-27)을 다음 세션에서 착수하기로 계획했다. 8일차인 오늘, 바로 도감 구현에 들어가려 했는데 한 가지가 걸렸다.

7일차는 문서만 봤다. Unity 에디터를 열지 않았다. 1주일 넘게 프로젝트를 빌드하지 않은 상태에서 바로 새 피처를 구현하면, 기존 코드에 이미 문제가 있는 것인지 새 코드가 문제를 만든 것인지 구분할 수 없다.

그래서 도감 구현에 앞서 프로젝트 건강 체크를 먼저 수행했다.

---

## AI에게 프로젝트 진단 맡기기

Unity 프로젝트를 열고, AI에게 콘솔 에러를 확인해달라고 요청했다. 확인 항목은 세 가지다.

1. **컴파일 에러** — C# 스크립트에 문법 오류나 참조 누락이 있는가
2. **에디터 에러** — Unity 에디터 자체에서 발생하는 경고나 에러가 있는가
3. **런타임 에러** — 플레이 모드에서 예외가 발생하는가 (이건 실제로 플레이해봐야 확인 가능)

결과는 깔끔했다. **컴파일 에러 0건, 코드 에러 0건.** 1주일 넘게 방치했는데 깨진 것이 없다.

이것이 당연한 결과처럼 보일 수 있지만, AI와 빠르게 개발한 프로젝트에서는 당연하지 않다. [5일차](/blog/2026/02/24/ai-game-dev-day-5/)에 하루 만에 31개 피처를 구현했고, 그 과정에서 생성된 C# 파일, ScriptableObject, 프리팹이 수십 개다. Unity 버전 업데이트, 패키지 의존성 변경, 캐시 손상 등 어떤 이유로든 컴파일이 깨질 가능성은 항상 존재한다.

에러가 없다는 사실을 **확인한 것** 자체가 가치 있다. "아마 괜찮겠지"와 "확인했고 괜찮다"는 이후 작업의 자신감이 다르다.

---

## Library/StateCache 손상 — Unity의 내부 사정

컴파일 에러는 없었지만, Unity 콘솔에 로그 하나가 찍혀 있었다.

```text
Refreshing native plugins compatible for Editor and target platform.
A cache file at Library/StateCache/... was damaged and has been automatically deleted.
```

`Library/StateCache`는 Unity 에디터가 내부적으로 사용하는 캐시 디렉토리다. 에디터 상태(인스펙터 접힘/펼침, 선택된 오브젝트 등)를 저장해두고 다음에 프로젝트를 열 때 복원하는 데 쓴다. 이 캐시 파일이 손상되면 Unity가 자동으로 삭제하고 재생성한다.

### 왜 손상되는가

대표적인 원인은 세 가지다.

| 원인 | 설명 |
|------|------|
| 비정상 종료 | Unity 에디터가 크래시하거나 강제 종료되면 캐시 파일이 불완전한 상태로 남는다 |
| 버전 불일치 | Unity 패치 업데이트 후 이전 캐시 포맷과 호환되지 않는 경우 |
| 디스크 I/O 이슈 | 파일 시스템 수준에서 쓰기가 중단된 경우 |

### 영향 범위

**코드와 무관하다.** `Library/` 폴더 전체가 Unity의 로컬 캐시이며, 프로젝트의 소스 코드나 에셋에 영향을 주지 않는다. `.gitignore`에도 `Library/`는 기본적으로 포함되어 있다. 캐시가 손상되면 Unity가 알아서 삭제하고, 다음에 필요할 때 재생성한다.

실제로 이 로그 이후 어떤 기능적 문제도 발생하지 않았다.

### 알아둬야 하는 이유

Unity 초보자나 AI에게 에러 로그를 붙여넣을 때, `Library/StateCache` 관련 메시지를 보고 "프로젝트가 손상됐다"고 오판할 수 있다. 이것은 무시해도 되는 로그다. 하지만 그 판단을 내리려면 `Library/` 폴더의 역할을 이해하고 있어야 한다.

만약 이 로그가 반복적으로 발생한다면, 그때는 `Library/` 폴더 전체를 삭제하고 프로젝트를 다시 임포트하는 것을 고려해야 한다. Unity가 `Library/`를 처음부터 재생성하면 대부분의 캐시 문제가 해결된다. 다만 프로젝트 규모에 따라 재임포트에 수 분에서 수십 분이 걸릴 수 있다.

---

## "에러 없음"의 가치

오늘 변경한 코드는 0줄이다. 7일차에 이어 연속 2일째 코드 변경 없음. 생산적이지 않아 보일 수 있지만, 이 과정에는 나름의 논리가 있다.

### 공백 후 복귀의 3단계

```text
7일차: 문서 점검 → 어디까지 했는지, 뭘 해야 하는지 파악
8일차: 프로젝트 건강 체크 → 기존 코드가 멀쩡한지 확인
9일차: 구현 착수 → 깨끗한 기반 위에서 새 피처 시작
```

7일차에서 "복귀 시 문서를 먼저 보라"는 원칙을 세웠다면, 8일차의 교훈은 "구현 전에 빌드가 되는지 확인하라"다. 특히 AI와 함께 개발할 때 이 단계가 중요한 이유가 있다.

AI는 세션 간 맥락을 유지하지 못한다. 새 세션에서 "도감 시스템 구현해줘"라고 하면, AI는 현재 프로젝트의 빌드 상태를 모른 채 코드를 생성한다. 만약 기존 코드에 컴파일 에러가 있는 상태에서 새 코드가 추가되면, 에러의 원인이 기존 코드인지 새 코드인지 구분하기 어렵다. AI에게 "이 에러 고쳐줘"라고 하면 AI는 새 코드와 기존 코드를 모두 건드리기 시작하고, 문제가 확산된다.

반면, "기존 빌드는 깨끗하다"는 사실이 확인된 상태에서 새 코드를 추가하면, 에러가 발생했을 때 원인은 100% 새 코드에 있다. 디버깅 범위가 명확해진다.

---

## 도감 시스템 설계 착수

프로젝트가 건강한 상태임을 확인했으니, 도감 시스템(M4-27)의 설계에 들어갔다. 7일차에서 정리한 구현 순서를 다시 보면 다음과 같다.

1. `CollectionData` ScriptableObject 설계
2. `CollectionManager` 구현 — 이벤트 리스너로 수집 데이터 기록
3. 도감 UI 구현 — 카드 그리드, 잠금/해제 상태 표시, 상세 정보 팝업
4. `SaveSystem`에 도감 데이터 저장/로드 추가

### CollectionData SO 설계

기존 `WeaponData`, `EnemyData` SO에 이미 도감에 필요한 정보가 대부분 들어 있다. 무기 이름, 아이콘, 설명, 스탯 — 이것들은 6일차에서 분석한 그 ScriptableObject들이다.

도감 전용 SO를 새로 만드는 대신, 기존 SO에 도감용 필드를 추가하는 방식을 택했다.

```csharp
// WeaponData.cs에 추가
[Header("Collection")]
public string collectionDescription;  // 도감용 상세 설명
public Sprite collectionSprite;       // 도감용 큰 이미지 (아이콘과 별도)
public bool isHidden;                 // 히든 무기 여부 (도감에서 ???로 표시)
```

별도 SO를 만들면 데이터가 이중 관리된다. 무기 이름을 바꾸면 `WeaponData`와 `CollectionData`를 둘 다 수정해야 한다. 기존 SO를 확장하면 단일 소스가 유지된다.

### CollectionManager 구조

`CollectionManager`는 기존 `GameEvents` 이벤트 허브를 구독해서 수집 이벤트를 감지한다.

```csharp
public class CollectionManager : MonoBehaviour
{
    private HashSet<string> _unlockedWeapons = new();
    private HashSet<string> _unlockedEnemies = new();
    private Dictionary<string, int> _enemyKillCounts = new();

    private void Start()
    {
        // 기존 이벤트 허브 구독
        GameEvents.OnEnemyKilled.Subscribe(OnEnemyKilled).AddTo(this);
        GameEvents.OnWeaponAcquired.Subscribe(OnWeaponAcquired).AddTo(this);
    }

    private void OnEnemyKilled(EnemyKilledEvent e)
    {
        _unlockedEnemies.Add(e.EnemyId);
        _enemyKillCounts[e.EnemyId] = _enemyKillCounts.GetValueOrDefault(e.EnemyId) + 1;
    }

    private void OnWeaponAcquired(WeaponAcquiredEvent e)
    {
        _unlockedWeapons.Add(e.WeaponId);
    }
}
```

5일차에서 구축한 R3 기반 이벤트 시스템이 여기서 빛을 발한다. 적 처치, 무기 획득 이벤트가 이미 존재하므로, 도감은 그 이벤트를 구독하기만 하면 된다. 기존 코드를 수정할 필요가 없다.

---

## 진행 상황

| 항목 | ID | 마일스톤 | 상태 |
|------|----|----------|------|
| 도감 시스템 | M4-27 | M4 | **진행 중** (설계 완료, 구현 착수) |
| 온보딩 튜토리얼 | M5-31 | M5 | 미완료 |
| 수익화 (보상형 광고) | M5-32 | M5 | 미완료 |
| 모바일 최적화 | M5-35 | M5 | 미완료 |

달성률은 여전히 32/36 (89%). 하지만 도감 시스템의 설계가 완료되었고, 다음 세션에서 구현만 남았다.

---

## 숫자로 보는 하루

| 지표 | 수치 |
|------|------|
| 코드 변경 | 0줄 |
| 컴파일 에러 | 0건 |
| 발견된 이슈 | Library/StateCache 캐시 손상 1건 (자동 복구, 코드 무관) |
| 설계 완료 | CollectionData SO, CollectionManager 구조 |
| 게임 피처 달성률 | 32/36 (89%) |

---

## 다음 단계

다음 세션에서는 도감 시스템의 실제 구현에 들어간다.

1. `CollectionData` 필드를 기존 SO에 추가하고 에디터에서 데이터 입력
2. `CollectionManager` 구현 및 `GameEvents` 구독 연결
3. 도감 UI — 카드 그리드 레이아웃, 잠금/해제 토글, 상세 정보 팝업
4. `SaveSystem` 연동 — 도감 해금 상태 영속화

설계가 끝났으니, [5일차](/blog/2026/02/24/ai-game-dev-day-5/)의 패턴대로 AI에게 스펙을 넘기면 구현은 빠르게 진행될 것이다. 기존 이벤트 시스템과 SO 구조를 그대로 활용하므로 새로 설계할 부분이 적다.

7일차는 문서를 읽는 날, 8일차는 프로젝트를 진단하고 설계하는 날이었다. 9일차에는 코드를 쓴다.

---

*공백 후 복귀 3일째 — 문서 점검, 빌드 확인, 설계 완료까지 마쳤으니 이제 남은 건 구현뿐이다.*
