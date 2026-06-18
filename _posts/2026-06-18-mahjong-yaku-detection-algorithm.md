---
title: "마작 역(役)은 어떻게 판별할까 — 손패 분해 알고리즘과 디텍터 설계 기록"
description: "한 손패가 여러 갈래로 분해되는 마작에서 화료·역 판정은 단순 if문으로 안 풀린다. 재귀 분해(DFS 백트래킹)로 모든 후보를 펼치고 한수 최대화로 최적 분해를 고른 Unity 마작 엔진 구현기."
date: 2026-06-18
categories: [Project]
tags: [Unity, Algorithm, DFS, Game, C#]
---

## 들어가며 — "이거 화료 맞아?"가 생각보다 어렵다

팀 프로젝트로 만들던 포커마작(Unity / C#)에서 가장 머리를 싸맨 부분은 그래픽도, 네트워크도 아니라 **화료(和了) 판정**이었다. 손에 14장이 들어왔을 때 답해야 하는 질문이 셋이다.

1. 이 손패는 **완성된 화료형**인가?
2. 완성됐다면 **무슨 역**이 붙는가? (리치, 핑후, 탕야오, 일색…)
3. 그래서 **몇 점**인가? (한수 × 부수)

처음엔 "패턴 매칭 if문 몇 개면 되겠지" 싶었다. 그런데 마작은 그렇게 안 풀린다. 결정적인 이유는 하나다.

> **같은 14장이 여러 방식으로 분해된다.**

예를 들어 `2233344m`을 보자. `234m + 234m + 3m`으로도 읽히고, `22m + 333m + 44m`처럼도 묶인다. 어느 쪽으로 읽느냐에 따라 붙는 역이 달라지고, 점수가 달라진다. 그러니까 "화료냐 아니냐"는 boolean 하나로 끝나는 문제가 아니라, **가능한 모든 해석을 펼쳐 놓고 그중 제일 점수 높은 걸 골라야 하는** 탐색 문제다.

이 글은 그 판정을 어떤 알고리즘으로 풀었고, 까다로운 지점마다 어떻게 고민해서 코드를 구조화했는지를 실제 엔진 코드(`pokermahjong`)와 함께 정리한 기록이다. 순서는 **① 문제 쪼개기 → ② 패의 표현 → ③ 화료형 판정 → ④ 표준형 재귀 분해 → ⑤ 한수 최대화 → ⑥ 화료 패의 위치 → ⑦ 역 디텍터 설계 → ⑧ 까다로웠던 판정들 → ⑨ 최종 오케스트레이션**이다.

---

## 1. 문제를 세 계층으로 쪼개기

엉킨 문제를 풀려면 먼저 쪼갠다. 화료 판정을 다음 세 계층으로 분리했다.

| 계층 | 책임 | 핵심 타입 |
|------|------|----------|
| **분해(Decompose)** | 14장을 "4면자 + 1머리"로 나누는 모든 방법을 찾는다 | `HandDecomposer`, `WinChecker` |
| **역 판정(Yaku)** | 분해 하나에 어떤 역이 성립하는지 본다 | `IYakuDetector`, `YakuRegistry` |
| **점수(Score)** | 그 역들로 한수·부수·점수를 계산한다 | `FuCalculator`, `ScoreCalculator` |

핵심 설계 원칙은 **분해와 역 판정을 떼어 놓는 것**이었다. 분해기는 화료 상황(리치인지, 쯔모인지)을 전혀 모른다. 그냥 "이 패 뭉치를 면자+머리로 나누는 법은 이거 이거 이거"만 순수 함수로 뱉는다. 역 판정은 그 결과 하나를 받아서 "여기엔 핑후가 붙네"만 본다. 이렇게 나눠야 역 40여 개를 각자 독립적으로 짤 수 있다.

```text
손패 14장
   │
   ▼
[분해] ── 가능한 모든 (4면자+머리) 후보 N개 생성
   │
   ▼  후보마다 반복
[역 판정] ── 후보 1개 → 성립하는 역 목록
   │
   ▼
[점수] ── 역 목록 → 한수·부수·점수
   │
   ▼
가장 점수 높은 후보 선택 → 최종 결과
```

---

## 2. 패를 숫자로 — 34종 카운트 배열

알고리즘을 짜기 전에 패부터 다루기 쉽게 만들어야 한다. 리치마작의 패는 종류로 따지면 34종이다. 만수(1~9), 통수(1~9), 삭수(1~9), 그리고 자패 7종(동남서북·백발중).

`Tile`은 값 타입(struct)으로 두고, 종류를 `TileType` enum 하나로 표현했다. 중요한 건 **34종을 0~33 정수 인덱스에 일렬로 매핑**한 것이다. 만1=0 … 삭9=26, 자패=27~33. 이렇게 깔면 "패 한 줌"을 길이 34짜리 카운트 배열로 압축할 수 있다.

```csharp
public const int TileTypeCount = 34;

public static int[] ToCounts(IEnumerable<Tile> tiles)
{
    var counts = new int[TileTypeCount];
    foreach (var t in tiles) counts[(int)t.Type]++;
    return counts;
}
```

이 카운트 배열이 분해 알고리즘의 주인공이다. `counts[i]`는 "i번 패가 몇 장 있나"다. 면자를 만들 때 그 자리에서 빼고(`counts[i] -= 3`), 백트래킹하며 되돌린다(`counts[i] += 3`). 패를 리스트로 들고 다니며 정렬·삭제하는 것보다 훨씬 싸다.

수패와 자패를 가르는 경계도 인덱스 산수로 끝난다. 27 미만이면 수패고, 같은 색 안에서 끗수는 `i % 9`다.

```csharp
private static bool IsSuitedIndex(int index) => index < 27;
```

슌츠(연속 3장)는 같은 색 안에서만 만들 수 있으므로, `i % 9 <= 6`(끗수 1~7에서 시작)이고 `i+1`, `i+2`가 존재할 때만 시도하면 된다. 색 경계를 넘는 `9m-1p-2p` 같은 헛짚음이 이 조건 하나로 막힌다.

---

## 3. 화료형은 딱 세 가지

리치마작의 완성형은 세 종류뿐이다.

- **표준형**: 4면자 + 1머리 (대부분의 손패)
- **치또이츠**: 서로 다른 2장 쌍 7개
- **국사무쌍**: 요구패 13종 전부 + 그중 1종 쌍

특수형 둘은 카운트 배열만 보면 즉답이 나온다. 치또이츠는 "0이 아닌 칸이 전부 정확히 2장이고, 그런 칸이 7개"인지만 보면 된다.

```csharp
public static bool IsChiitoitsu(IReadOnlyList<Tile> tiles)
{
    if (tiles.Count != 14) return false;
    var counts = ToCounts(tiles);
    int pairs = 0;
    foreach (int c in counts)
    {
        if (c == 0) continue;
        if (c != 2) return false; // 1·3·4장이 섞이면 치또이 아님
        pairs++;
    }
    return pairs == 7;
}
```

여기서 작은 함정 하나. 같은 패 4장(`c == 4`)을 "2쌍"으로 세면 안 된다. `c != 2`에서 바로 탈락시켜 막았다. 국사무쌍도 비슷하게 "요구패 13종이 전부 1장 이상, 그중 1종만 쌍, 요구패 외 패는 0장"을 카운트로 확인한다.

문제는 표준형이다. 이건 카운트만 봐서는 못 푼다. 직접 나눠 봐야 한다.

---

## 4. 표준형 재귀 분해 — DFS 백트래킹

표준형 판정의 본질은 이렇다. **머리 한 쌍을 떼고, 남은 12장을 면자 4개로 빈틈없이 나눌 수 있는가?**

머리 후보부터 깐다. 카운트가 2 이상인 패를 차례로 머리로 가정해 보고(2장 빼고), 남은 패를 면자로 쪼갠다.

```csharp
public static List<ConcealedForm> StandardForms(IReadOnlyList<Tile> tiles)
{
    var forms = new List<ConcealedForm>();
    if (tiles.Count % 3 != 2) return forms; // 3k+2장이 아니면 화료형 불가

    var counts = ToCounts(tiles);

    for (int pair = 0; pair < TileTypeCount; pair++)
    {
        if (counts[pair] < 2) continue;
        counts[pair] -= 2;                       // 머리 떼기
        foreach (var melds in EnumerateMelds(counts))
            forms.Add(new ConcealedForm(melds, Tile.Of((TileType)pair)));
        counts[pair] += 2;                       // 되돌리기
    }
    return forms;
}
```

남은 패를 면자로 쪼개는 `EnumerateMelds`가 알고리즘의 심장이다. 전형적인 DFS 백트래킹인데, 중복 탐색을 막는 한 가지 트릭이 들어간다. **항상 "남아 있는 가장 작은 인덱스" 패를 먼저 처리한다.**

```csharp
private static List<List<Meld>> EnumerateMelds(int[] counts)
{
    int i = 0;
    while (i < TileTypeCount && counts[i] == 0) i++;

    if (i == TileTypeCount)
        return new List<List<Meld>> { new() }; // 다 비었으면 완성 (빈 분해 1개)

    var results = new List<List<Meld>>();

    // ① 코츠 분기 — 같은 패 3장
    if (counts[i] >= 3)
    {
        counts[i] -= 3;
        foreach (var rest in EnumerateMelds(counts))
        {
            rest.Insert(0, Meld.Koutsu(Tile.Of((TileType)i)));
            results.Add(rest);
        }
        counts[i] += 3;
    }

    // ② 슌츠 분기 — i, i+1, i+2 연속 (수패·끗수 1~7·다음 두 패 존재)
    if (IsSuitedIndex(i) && (i % 9) <= 6 && counts[i + 1] > 0 && counts[i + 2] > 0)
    {
        counts[i]--; counts[i + 1]--; counts[i + 2]--;
        foreach (var rest in EnumerateMelds(counts))
        {
            rest.Insert(0, Meld.Shuntsu(Tile.Of((TileType)i)));
            results.Add(rest);
        }
        counts[i]++; counts[i + 1]++; counts[i + 2]++;
    }

    return results;
}
```

왜 "가장 작은 인덱스부터"가 중요한가. 가장 작은 패는 **반드시 어떤 면자에 들어가야 한다**(머리는 이미 뗐으므로). 그 패로 시작하는 면자는 코츠 아니면 슌츠 둘뿐이다. 두 경우만 분기하고 나머지를 재귀로 넘기면, `234m`을 만드는 순서를 `2m→3m→4m`으로 고정하게 된다. `3m`이나 `4m`부터 면자를 짜는 중복 경로가 원천 봉쇄된다. 정렬해서 첫 번째 원소를 고정하는 고전적인 조합 탐색 트릭을 카운트 배열 위에서 구현한 셈이다.

그리고 이 함수의 반환 타입을 주목할 만하다. `bool`이 아니라 `List<List<Meld>>` — **가능한 모든 분해를 다 모아서 돌려준다.** 여기가 첫 번째 큰 설계 결정이었다.

---

## 5. 첫 번째 고민 — "화료냐 아니냐"가 아니라 "어떻게 화료냐"

대부분의 마작 화료 판정 예제는 `IsWinningHand → bool`로 끝난다. 하지만 점수까지 내려면 그걸로 부족하다. 앞에서 본 `2233344m`처럼, **같은 손패가 코츠로도 슌츠로도 읽히면 붙는 역이 달라지기 때문**이다.

기획서에도 이 케이스를 명시해 뒀다.

> 같은 패 구성이 코츠로도 슌츠로도 읽혀 붙는 역이 달라짐 → **역 한수가 높은 분해를 선택** (예: `2233344m`을 `333` 코츠로 읽으면 핑후가 깨지고, `234`+`234`로 읽으면 핑후가 붙는다 — 더 높은 쪽 택1)

그래서 분해기는 모든 후보를 뱉고, 위 계층에서 후보마다 점수를 매겨 **가장 높은 걸 고른다**. 이게 기획서의 "한수 최대화" 원칙이다. 선택 로직은 점수 → 한수 → 부수 순의 사전식 비교다.

```csharp
private static bool IsBetter(WinEvaluation candidate, WinEvaluation current)
{
    if (current == null) return true;
    if (candidate.TotalPoints != current.TotalPoints)
        return candidate.TotalPoints > current.TotalPoints; // 1순위: 총점
    if (candidate.TotalHan != current.TotalHan)
        return candidate.TotalHan > current.TotalHan;        // 2순위: 한수
    return candidate.Fu > current.Fu;                         // 3순위: 부수
}
```

만약 분해기가 boolean만 줬다면, 후보 중 하나를 임의로 골라 "탕야오 1판"이라 답하고 더 높은 "치또이츠 2판"을 놓쳤을 것이다. 그리디하게 끊지 않고 **전부 펼친 뒤 최댓값을 고르는 것** — 이게 마작 점수 계산의 정확성을 보장하는 핵심이었다.

---

## 6. 두 번째 고민 — 화료 패가 "어디에 꽂혔나"

분해를 다 구했다고 끝이 아니다. 같은 분해라도 **마지막 화료 패가 어느 면자를 완성했느냐**에 따라 역과 부수가 또 갈린다.

`456m`이 완성됐다고 하자. `45m`을 들고 있다가 `6m`(또는 `3m`)으로 화료하면 **양면 대기**다. `46m`을 들고 `5m`으로 화료하면 **간짱(끼인) 대기**다. 양면 대기는 핑후의 필수 조건이지만 간짱은 핑후가 안 된다. 손패 구성은 똑같은데 어느 패로 메웠느냐가 역을 바꾼다.

그래서 `WinChecker`는 분해 결과를 그냥 쓰지 않고, **화료 패가 머리를 완성했는지 / 어느 면자를 완성했는지**로 갈라서 조립 후보를 따로 만든다.

```csharp
foreach (var form in HandDecomposer.StandardForms(full))
{
    var allMelds = new List<Meld>(ctx.OpenMelds);
    allMelds.AddRange(form.Melds);

    // 머리 단기 (화료 패가 머리를 완성)
    if (form.Pair.Type == ctx.WinningTile.Type)
        result.Add(new HandDecomposition(allMelds, form.Pair, WaitType.Tanki, ...));

    // 면자 완성 (화료 패가 손패 면자 중 하나를 완성)
    for (int j = 0; j < form.Melds.Count; j++)
    {
        var meld = form.Melds[j];
        if (meld.Tiles.All(t => t.Type != ctx.WinningTile.Type)) continue;
        var wait = ComputeWait(meld, ctx.WinningTile);  // 양면/간짱/변짱/샤보 분류
        result.Add(new HandDecomposition(allMelds, form.Pair, wait, ..., winningMeldIndex: openCount + j));
    }
}
```

대기 형태 분류는 화료 면자와 화료 패의 끗수 관계만 보면 결정된다.

```csharp
private static WaitType ComputeWait(Meld meld, Tile winningTile)
{
    if (meld.Type == MeldType.Koutsu) return WaitType.Shanpon; // 쌍 2개 중 하나
    int a = meld.Lead.Rank;   // 슌츠 최저 끗수
    int r = winningTile.Rank; // 화료 패 끗수
    if (r == a + 1) return WaitType.Kanchan;        // 1_3 → 2 (간짱)
    if (a == 1 && r == 3) return WaitType.Penchan;  // 12 → 3 (변짱)
    if (a == 7 && r == 7) return WaitType.Penchan;  // 89 → 7 (변짱)
    return WaitType.Ryanmen;                         // 양면
}
```

결국 한 손패에서 나오는 "후보"의 수는 **(머리 후보 × 면자 분해 방법 × 화료 패가 꽂힌 위치)**의 곱이 된다. 텐파이·유효패 계산도 이 위에서 공짜로 떨어진다. 13장 손패에 34종 패를 하나씩 넣어 보고 화료형이 하나라도 만들어지면 그 패가 대기패다.

```csharp
public static List<TileType> WaitingTiles(IReadOnlyList<Tile> closedHand, ...)
{
    var waits = new List<TileType>();
    for (int t = 0; t < HandDecomposer.TileTypeCount; t++)
    {
        if (counts[t] >= 4) continue; // 5번째 패는 존재 불가
        var probe = new WinContext { ClosedHand = ..., WinningTile = Tile.Of((TileType)t) };
        if (WinChecker.IsComplete(probe)) waits.Add((TileType)t);
    }
    return waits;
}
```

분해기를 순수 함수로 짜둔 덕에, "화료 판정"과 "텐파이 판정"이 같은 코드를 재사용한다.

---

## 7. 세 번째 고민 — 역 40개를 어떻게 관리하나

리치마작의 역은 일반 역·역만 합쳐 40개가 넘는다. 이걸 거대한 `switch`나 `if-else` 폭포로 짜면 새 역 하나 추가할 때마다 그 괴물을 건드려야 한다. 그래서 **역 하나 = 클래스 하나**로 쪼갰다. 공통 인터페이스는 단 두 메서드다.

```csharp
public interface IYakuDetector
{
    bool CanApply(WinContext ctx);    // 이 역을 평가할 형태인가 (빠른 거름)
    YakuResult Evaluate(WinContext ctx); // 성립하면 한수, 아니면 None
}
```

`CanApply`는 "이 디텍터를 돌려볼 가치가 있나"를 싸게 거른다. 예컨대 핑후는 멘젠 + 표준형일 때만 의미가 있다.

```csharp
public sealed class PinfuDetector : IYakuDetector
{
    public bool CanApply(WinContext ctx) => ctx.IsMenzen && (ctx.BestDecomp?.IsStandard ?? false);
    public YakuResult Evaluate(WinContext ctx)
        => ScoringRules.IsPinfu(ctx.BestDecomp, ctx) ? new YakuResult("Pinfu", 1) : YakuResult.None;
}
```

모든 디텍터는 `YakuRegistry`에 리스트로 등록된다. 평가는 "적용 가능한 것만 돌려서, 성립한 것만 추린다"로 단 몇 줄이다.

```csharp
public List<YakuResult> Evaluate(WinContext ctx)
{
    var results = _detectors
        .Where(d => d.CanApply(ctx))
        .Select(d => d.Evaluate(ctx))
        .Where(r => r.IsValid)
        .ToList();

    // 역만이 1개라도 있으면 일반 역은 모두 제거 (역만 우선)
    if (results.Any(r => r.IsYakuman))
        results = results.Where(r => r.IsYakuman).ToList();

    return results;
}
```

이 구조의 이점은 명확하다. **새 역을 추가한다 = 디텍터 클래스 하나 짜서 리스트에 한 줄 더한다.** 기존 코드는 손대지 않는다(개방-폐쇄 원칙). 각 디텍터는 독립적이라 단위 테스트도 따로 짤 수 있다. 등록 리스트는 특수형 → 상황역 → 수패 패턴 → 면자 구성 → 자패/일색 순으로 묶어 가독성을 챙겼다.

---

## 8. 까다로웠던 판정들 — 진짜 고민은 여기서

뼈대는 깔끔했지만, 개별 역에는 마작 규칙 특유의 함정이 숨어 있었다. 기억에 남는 넷.

### ① 핑후 — 조건의 논리곱

핑후는 "아무 역 없는 멘젠 손"처럼 보이지만 조건이 까다롭다. **멘젠 + 4면자 전부 슌츠 + 양면 대기 + 머리가 역패가 아님**, 넷이 전부 참이어야 한다. 앞 계층에서 분해와 대기 형태를 이미 구해 뒀기 때문에, 판정 자체는 조건의 AND로 떨어진다.

```csharp
public static bool IsPinfu(HandDecomposition decomp, WinContext ctx)
{
    if (!decomp.IsStandard) return false;
    if (!ctx.IsMenzen) return false;
    if (decomp.Melds.Any(m => m.Type != MeldType.Shuntsu)) return false;   // 코츠 있으면 탈락
    if (decomp.WaitType != WaitType.Ryanmen) return false;                 // 양면 아니면 탈락
    if (decomp.Pair.IsValueTile(ctx.SeatWind, ctx.RoundWind)) return false; // 역패 머리면 탈락
    return true;
}
```

분해를 미리 펼쳐 둔 설계가 여기서 빛을 본다. "양면인가"를 핑후 안에서 다시 계산하지 않고, `decomp.WaitType`만 읽으면 된다.

### ② 산안커/스안커 — "론으로 완성된 코츠는 안커가 아니다"

가장 미묘했던 규칙. 안커(暗刻, 손안에서 자력으로 만든 코츠)를 3개 모으면 산안커, 4개면 역만(스안커)이다. 그런데 **마지막 코츠를 상대 패를 론해서 완성하면, 그 코츠는 안커로 안 친다**(밍커 취급). 같은 규칙이 부수 계산에도 똑같이 등장한다 — 안커냐 밍커냐로 부수가 다르다.

같은 규칙이 두 곳(역 판정 + 부수 계산)에서 필요하니, 한 곳에 모았다.

```csharp
public static bool IsConcealedTriplet(Meld meld, HandDecomposition decomp, WinType winType)
{
    if (meld.Type != MeldType.Koutsu && meld.Type != MeldType.Kantsu) return false;
    if (!meld.IsConcealed) return false;
    if (meld.Type == MeldType.Kantsu) return true;          // 안깡은 항상 안커
    // 손안 코츠라도 론으로 완성한 면자면 안커가 아니다
    return !(winType == WinType.Ron && ReferenceEquals(meld, decomp.WinningMeld));
}
```

`WinningMeld`(화료 패가 꽂힌 면자)를 6번 계층에서 추적해 뒀기 때문에, "이 코츠가 론으로 막 완성된 그 면자인가"를 참조 비교 한 줄로 판별한다. 산안커·스안커·부수 계산이 전부 이 한 함수를 공유해 규칙이 어긋날 일이 없다.

### ③ 이페코 / 량페코 vs 치또이 — 배타를 코드로 안 쓴다

이페코(동일 슌츠 1쌍), 량페코(2쌍), 치또이츠는 서로 배타적인 역이다. 보통은 "이거 성립하면 저건 끄기" 같은 배제 로직을 짜야 할 것 같지만, **분해 후보를 분리해 둔 덕에 그게 저절로 해결됐다.**

`2233m`은 `234m 슌츠 + 23m` 같은 표준형 분해 후보와 `22m·33m` 치또이 후보가 **서로 다른 후보**로 존재한다. 표준형 후보에서는 이페코가, 치또이 후보에서는 치또이츠가 평가되고, 5번의 한수 최대화가 둘 중 점수 높은 쪽을 고른다. 배제 코드 한 줄 없이 규칙이 자연스럽게 성립한다. 이페코/량페코 판정도 "동일 슌츠 쌍의 개수"를 세는 한 줄로 끝난다.

```csharp
public static int IdenticalSequencePairs(HandDecomposition d)
{
    int pairs = 0;
    foreach (var g in d.Melds.Where(m => m.Type == MeldType.Shuntsu).GroupBy(m => m.Lead.Type))
        pairs += g.Count() / 2;  // 같은 시작 슌츠 2개 = 1쌍
    return pairs; // 1이면 이페코, 2면 량페코
}
```

### ④ 구련보등 — 카운트 패턴 비교

역만인 구련보등은 한 색으로 `1112345678999 + 아무 1장`을 모으는 형태다. 면자로 분해하기보다 **목표 패턴과 카운트를 직접 비교**하는 게 깔끔했다.

```csharp
private static readonly int[] BasePattern = { 0, 3, 1, 1, 1, 1, 1, 1, 1, 3 }; // rank 1~9

// 한 색만 쓰고 자패 없음 → 끗수별 카운트가 기본 패턴을 전부 만족하고, 초과분이 정확히 1장
int extra = 0;
for (int r = 1; r <= 9; r++)
{
    int diff = counts[r] - BasePattern[r];
    if (diff < 0) return YakuResult.None; // 기본 패턴 미충족
    extra += diff;
}
if (extra != 1) return YakuResult.None;
```

화료 직전 13장이 정확히 기본 패턴이면 순정 구련(9면 대기)이라 더블 역만으로 올린다. "지금 손패"가 아니라 "화료 직전 손패"를 봐야 한다는 점이 포인트였다.

---

## 9. 마지막 — 역 없으면 화료가 아니다

모든 계층을 묶는 건 `ScoreEvaluator`다. 후보를 전부 돌며 역·부수·점수를 내고 최댓값을 고른다. 여기서 마작의 핵심 규칙 하나가 들어간다. **역이 하나도 없으면 형태가 완성됐어도 화료가 아니다**(도라는 역이 아니라 보너스라, 도라만으로는 화료 못 한다).

```csharp
foreach (var decomp in candidates)
{
    ctx.BestDecomp = decomp;
    var yaku = _registry.Evaluate(ctx);

    // 역 없으면 이 후보는 화료 불가 → 건너뜀
    if (!yaku.Any(y => y.Name != "WinDeclarerBonus")) { sawYakuless = true; continue; }

    int fu  = FuCalculator.Calculate(decomp, ctx);
    int dora = DoraCounter.Count(ctx.AllTiles(), doraIndicators, ...);
    var score = ScoreCalculator.CalculateScore(yaku, fu, dora, ctx.IsOya);
    var eval = WinEvaluation.Win(decomp, yaku, fu, dora, score, ...);

    if (IsBetter(eval, best)) best = eval; // 한수 최대화
}

if (best == null)
    return WinEvaluation.NoWin(sawYakuless ? "역 없음 (도라만으로는 화료 불가)" : "완성형 아님");
```

"모든 후보가 역 없음"과 "애초에 완성형이 아님"을 구분해 메시지를 다르게 준 것도 작은 디테일이다. 전자는 텐파이는 됐는데 역이 없어 못 나는 흔한 상황이고, UI에서 화료 버튼을 비활성화하는 근거가 된다.

---

## 마무리 — 끝까지 끌고 간 설계 원칙 셋

마작 역 판정을 짜며 결국 세 원칙으로 수렴했다.

1. **분해는 순수 함수로.** 입력(패) → 출력(분해 목록), 상태도 부작용도 없다. 그래서 화료 판정과 텐파이 판정이 같은 코드를 공유하고, 테스트가 쉽다.
2. **그리디로 끊지 말고 전부 펼친 뒤 최댓값.** 같은 손패의 모든 분해 × 모든 화료 위치를 후보로 만들고, 점수로 최적을 고른다. 마작 점수의 정확성은 여기서 나온다.
3. **역은 독립 디텍터로.** 40개 역을 인터페이스 하나 뒤에 줄 세우니, 새 역 추가가 "클래스 하나 + 등록 한 줄"이 됐다. 공통 규칙("론 완성 코츠는 안커 아님")은 한 곳에 모아 부수 계산과 공유한다.

복잡해 보이는 도메인일수록, 엉킨 문제를 **순수한 탐색(분해) + 독립적인 규칙(역) + 최댓값 선택(점수)**으로 분리하는 게 답이었다. 마작이라는 30년 묵은 규칙 덩어리도, 계층만 잘 그으면 한 조각씩 정복할 수 있는 문제로 바뀐다.

*마작 화료 판정의 핵심은 "화료냐 아니냐"가 아니라 "같은 손패를 펼칠 수 있는 모든 해석 중 가장 점수 높은 것 고르기"다 — 그래서 boolean이 아니라 탐색이다.*
