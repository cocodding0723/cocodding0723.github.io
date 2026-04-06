---
title: "C# 버전별 진화와 Unity의 C#, 그리고 9.0과 10.0이 가져온 것들"
description: "C# 버전이 어떻게 발전해왔는지, Unity는 어떤 C# 버전을 쓸 수 있는지, 그리고 C# 9.0과 10.0에서 추가된 핵심 기능을 코드 예제와 함께 정리한다."
date: 2026-04-01
categories: [Dev]
tags: [Unity]
---

## C#은 왜 자주 바뀌는가

C#은 2002년 1.0이 나온 이후 거의 1~2년 주기로 새 버전을 내고 있다. 처음에는 Java를 닮은 보수적인 OOP 언어였지만, LINQ(3.0), async/await(5.0), 패턴 매칭(7.0), nullable 참조 타입(8.0)을 거치면서 함수형과 표현식 중심의 언어로 빠르게 옮겨가고 있다. 최근 버전들은 "코드를 더 짧게"보다는 "의도를 더 명확하게" 쓰게 만드는 방향이다.

게임 개발자에게 이게 중요한 이유는 두 가지다. 첫째, Unity 프로젝트는 대부분 수년간 유지보수되기 때문에 내가 쓰는 C# 버전을 명확히 알아야 한다. 둘째, Unity의 .NET 런타임과 컴파일러가 분리돼 있어서 "C# 10이라는데 record struct가 안 된다" 같은 함정이 자주 생긴다.

이 글은 세 부분으로 나눈다.

1. C# 버전별 핵심 기능 한 줄 요약
2. Unity에서 실제로 쓸 수 있는 C# 버전과 제약
3. C# 9.0 / 10.0에서 추가된 주요 기능 상세

---

## C# 버전별 핵심 기능 요약

| 버전 | 출시 | 핵심 기능 |
|------|------|----------|
| 1.0 | 2002 | 기본 OOP, 델리게이트 |
| 2.0 | 2005 | 제네릭, nullable 값 타입, iterator(yield) |
| 3.0 | 2007 | LINQ, 람다, 익명 타입, var, 확장 메서드 |
| 4.0 | 2010 | dynamic, 명명된 인수, 옵셔널 매개변수 |
| 5.0 | 2012 | async / await |
| 6.0 | 2015 | 문자열 보간(`$""`), null 조건 연산자(`?.`), 자동 속성 초기화 |
| 7.0~7.3 | 2017~2018 | 튜플 분해, 패턴 매칭, ref locals, in 매개변수 |
| 8.0 | 2019 | nullable 참조 타입, default interface, switch 식, range/index |
| **9.0** | 2020 | record, init, top-level statements, target-typed new |
| **10.0** | 2021 | record struct, file-scoped namespace, global using |
| 11.0 | 2022 | raw string literal, required, list pattern, generic math |
| 12.0 | 2023 | primary constructor, collection expression(`[1,2,3]`), 람다 기본값 |
| 13.0 | 2024 | params collection, ref struct interface, partial property |
| 14.0 | 2025 | field 키워드, 확장 멤버, null 조건 할당, partial 생성자/이벤트 |
| 15.0 | 2026 | 최신 버전, 추가 패턴/제네릭/확장 개선 진행 중 |

8.0 이전은 대체로 안정화 단계였고, 9.0부터는 함수형 스타일과 데이터 중심 코드를 본격적으로 지원하기 시작했다. 게임 코드에서 자주 보이는 "데이터 클래스"가 record로, "거대한 if-else"가 패턴 매칭으로 정리되는 흐름이다.

참고로 이 글을 쓰는 2026년 4월 시점에 C#은 **15버전까지** 나와 있다. 14버전이 2025년 11월 .NET 10과 함께 정식 출시되면서 `field` 키워드(자동 속성 안에서 백킹 필드를 직접 참조), 확장 멤버, 조건부 할당 같은 기능이 추가됐고, 15버전은 .NET 11과 함께 그 흐름을 이어가고 있다. 다만 Unity가 아직 9.0에 머물러 있다는 사실은 변하지 않는다 — 14, 15의 신기능은 서버나 백엔드 .NET 프로젝트에서나 만날 수 있다.

---

## Unity에서 사용 가능한 C# 버전

여기가 가장 자주 헷갈리는 지점이다. Unity의 C# 버전은 단순히 "유니티 버전 = C# 버전"이 아니라, **컴파일러 버전**과 **런타임(.NET Standard) 버전**이 모두 맞아야 기능이 동작한다.

| Unity 버전 | C# 버전 | API 호환성 |
|-----------|--------|-----------|
| 2018.3 | 7.3 | .NET Standard 2.0 / .NET 4.x |
| 2019.x | 7.3 | .NET Standard 2.0 / .NET 4.x |
| 2020.2+ | 8.0 | .NET Standard 2.1 |
| 2020.3 LTS | 8.0 | .NET Standard 2.1 |
| 2021.2+ | **9.0** | .NET Standard 2.1 |
| 2022.3 LTS | 9.0 | .NET Standard 2.1 |
| 2023.x | 9.0 | .NET Standard 2.1 |
| Unity 6 (6000.x) | 9.0 (CoreCLR 통합 진행 중) | .NET Standard 2.1 |

핵심은 두 가지다.

**1) Unity는 C# 9.0에서 멈춰 있다.** Unity 6까지도 공식 지원 C# 버전은 9.0이다. 10.0의 `record struct`, `global using`, `file-scoped namespace` 같은 기능을 그냥 쓰면 컴파일 에러가 난다. (단, 일부는 우회 가능 — 아래 참고)

**2) C# 9의 일부 기능은 런타임 타입이 필요해서 동작이 제한된다.** 대표적으로 `init` 접근자와 `record`는 `IsExternalInit`이라는 타입이 필요한데, 이 타입은 .NET 5+에만 들어있다. Unity는 .NET Standard 2.1을 쓰기 때문에 그대로는 컴파일되지 않는다.

### IsExternalInit 우회

이게 Unity에서 C# 9 기능을 쓸 때 가장 흔히 만나는 문제다. 해결법은 의외로 간단하다. 같은 이름의 더미 클래스를 직접 만들어주면 된다.

```csharp
// Assets/Scripts/Compat/IsExternalInit.cs
namespace System.Runtime.CompilerServices
{
    internal static class IsExternalInit { }
}
```

이 파일 하나만 있으면 `init`과 `record`가 모두 동작한다. C# 컴파일러는 이름만 보고 타입의 존재 여부를 확인하기 때문이다. 같은 트릭으로 `Index`/`Range`, `ModuleInitializer`도 우회 가능하다.

### Unity의 컴파일러 디렉티브

Unity에서 어떤 C# 기능이 켜져 있는지 확인하려면 `Edit > Project Settings > Player > Other Settings > Api Compatibility Level`을 본다. .NET Standard 2.1로 설정돼 있어야 C# 9 기능 대부분이 정상 동작한다.

추가로 .csproj에 직접 LangVersion을 명시할 수도 있지만, Unity가 csproj를 자동으로 다시 생성하기 때문에 보통은 권장되지 않는다. csc.rsp 파일에 컴파일 옵션을 넣는 게 더 안전하다.

```text
# Assets/csc.rsp
-langversion:9
-nullable:enable
```

이 파일을 두면 nullable 참조 타입까지 같이 켤 수 있다.

---

## C# 9.0의 주요 기능

C# 9.0은 "데이터 중심 프로그래밍"을 본격적으로 끌어올린 버전이다. record와 init이 그 핵심이다.

### 1. Records

값 동등성(value equality)과 불변성을 한 줄로 선언할 수 있다.

```csharp
public record PlayerSnapshot(string Name, int Hp, Vector3 Position);

var a = new PlayerSnapshot("Hero", 100, Vector3.zero);
var b = new PlayerSnapshot("Hero", 100, Vector3.zero);

Debug.Log(a == b);          // true (값 비교)
Debug.Log(a.Equals(b));     // true
Debug.Log(a.GetHashCode()); // 동일

// with 식으로 일부만 바꿔 새 인스턴스 생성
var damaged = a with { Hp = 80 };
```

기존에 같은 일을 하려면 `Equals`, `GetHashCode`, `ToString`, 생성자, 프로퍼티를 전부 직접 써야 했다. record는 이걸 한 줄로 끝낸다.

게임에서는 **세이브 데이터, 액션 명령, 상태 스냅샷**에 잘 맞는다. 예를 들어 리플레이 시스템에서 매 프레임 입력을 기록할 때:

```csharp
public record InputCommand(int Frame, Vector2 Move, bool Attack);

// 리플레이 큐
var commands = new List<InputCommand>();
commands.Add(new InputCommand(123, new(1, 0), false));
```

값 비교가 기본이라 두 리플레이가 같은지 확인하기도 쉽다.

> ⚠ Unity에서 record를 쓰려면 위에서 본 `IsExternalInit` 더미 클래스가 필요하다.

### 2. Init-only Setters

`init` 접근자는 "객체 생성 시점에만" 값을 넣을 수 있게 한다. `readonly`보다 유연하면서 불변성은 그대로 유지한다.

```csharp
public class WeaponConfig
{
    public string Name { get; init; }
    public int Damage { get; init; }
    public float FireRate { get; init; }
}

var pistol = new WeaponConfig
{
    Name = "Pistol",
    Damage = 12,
    FireRate = 0.3f
};

// pistol.Damage = 999; // 컴파일 에러 — 생성 후엔 변경 불가
```

object initializer 문법을 그대로 쓰면서 불변성도 보장한다는 게 핵심이다. ScriptableObject의 인스펙터 직렬화와는 별개로, 코드에서 만드는 설정 객체에 잘 어울린다.

### 3. Target-Typed New

타입을 좌변으로 추론할 수 있을 때 우변에서 생략할 수 있다.

```csharp
// before
private readonly Dictionary<string, List<EnemySpawnInfo>> _spawnTable
    = new Dictionary<string, List<EnemySpawnInfo>>();

// after (C# 9)
private readonly Dictionary<string, List<EnemySpawnInfo>> _spawnTable = new();
```

`var`와 정반대 방향이다. var는 좌변을 생략하고, target-typed new는 우변을 생략한다. 필드 선언처럼 좌변 타입이 명시적이어야 하는 곳에서 특히 깔끔해진다.

### 4. Pattern Matching 강화 (관계/논리 패턴)

이전까지는 `switch`에서 타입 매칭만 가능했지만, 9.0부터는 `<`, `>`, `and`, `or`, `not`을 패턴 안에서 쓸 수 있다.

```csharp
public string GetHpStatus(int hp) => hp switch
{
    <= 0           => "사망",
    < 30           => "위험",
    < 70           => "경상",
    <= 100         => "건강",
    _              => "오버힐"
};

public bool IsCombatReady(Enemy e) => e switch
{
    { Hp: > 0, Stunned: false } and { Type: EnemyType.Boss or EnemyType.Elite } => true,
    _ => false
};
```

게임 로직의 if-else 사다리를 패턴 매칭으로 펴면 가독성이 확 올라간다. 특히 상태 머신을 다룰 때 효과가 크다.

### 5. Top-Level Statements

`Main` 메서드를 생략하고 곧장 코드를 쓸 수 있다.

```csharp
// Program.cs (콘솔 앱)
using System;

Console.WriteLine("Hello, World");
var name = Console.ReadLine();
Console.WriteLine($"안녕, {name}");
```

게임 클라이언트에서는 거의 안 쓰지만, **빌드 후 후처리 스크립트, 데이터 가공 콘솔, 서버 빌드 검증 도구** 같은 보조 프로젝트에서 유용하다. 짧은 도구는 클래스 한 개도 만들지 않고 끝낼 수 있다.

### 6. Covariant Return Types

오버라이드 시 반환 타입을 더 구체적인 파생 타입으로 좁힐 수 있다.

```csharp
public class WeaponBase
{
    public virtual WeaponBase Clone() => new WeaponBase();
}

public class Sword : WeaponBase
{
    // 반환 타입을 Sword로 좁힘 (이전에는 WeaponBase로만 가능)
    public override Sword Clone() => new Sword();
}

Sword s = new Sword().Clone(); // 캐스팅 불필요
```

팩토리 메서드와 프로토타입 패턴에서 매번 캐스팅하던 코드가 사라진다.

### 7. 그 외

- **Module Initializers**: 어셈블리 로드 시점에 자동 실행되는 메서드. Unity에서는 `[RuntimeInitializeOnLoadMethod]` 쪽이 더 일반적.
- **Function Pointers**: `delegate*` 문법. 알로케이션 없는 콜백이 필요할 때.
- **Native Sized Integers**: `nint`, `nuint`. 인터롭에서 주로 사용.

이 셋은 Unity 게임 코드에서 잘 안 보이지만, 네이티브 플러그인이나 알로케이션 민감한 코드를 짤 때 도움이 된다.

---

## C# 10.0의 주요 기능

10.0은 9.0이 던진 변화를 다듬는 버전이다. record를 구조체로, namespace를 한 줄로, using을 전역으로 정리했다.

> ⚠ Unity 6까지도 공식적으로는 C# 10을 지원하지 않는다. 아래 기능들은 비-Unity .NET 프로젝트(서버, 도구, 라이브러리)에 적용 가능하며, Unity에서는 csc.rsp로 강제하더라도 일부만 동작한다.

### 1. Record Struct

C# 9의 record는 참조 타입(class)이었다. 10.0부터는 값 타입(struct)으로도 만들 수 있다.

```csharp
public readonly record struct GridPos(int X, int Y);

var a = new GridPos(3, 4);
var b = new GridPos(3, 4);

Debug.Log(a == b); // true, 알로케이션 없음
```

게임에서 좌표, 색상, 작은 설정값을 다룰 때 가장 좋은 선택이다. **알로케이션이 없으면서**, 값 비교와 `with` 식이 모두 동작한다. `Vector2Int`에 라벨을 붙여 더 의미 있게 만들고 싶을 때 record struct가 답이다.

### 2. Global Using Directives

자주 쓰는 using을 프로젝트 전역으로 빼낼 수 있다.

```csharp
// GlobalUsings.cs (프로젝트 어디든 한 곳)
global using System;
global using System.Collections.Generic;
global using UnityEngine;
global using Cysharp.Threading.Tasks;
```

이러면 다른 파일에서 더 이상 `using UnityEngine;`을 쓰지 않아도 된다. 200개 파일 위쪽에 박혀 있던 똑같은 using 묶음이 한 곳으로 모인다.

### 3. File-Scoped Namespace

namespace 한 줄짜리 선언. 들여쓰기 한 단계가 사라진다.

```csharp
// before (블록 형태)
namespace Game.Combat
{
    public class DamageCalculator
    {
        // ...
    }
}

// after (file-scoped)
namespace Game.Combat;

public class DamageCalculator
{
    // ...
}
```

파일 전체가 하나의 namespace에 속할 때(거의 항상 그렇다) 들여쓰기가 한 칸 줄어들어 가독성이 좋아진다.

### 4. Extended Property Patterns

중첩된 프로퍼티를 점 표기로 패턴 매칭할 수 있다.

```csharp
// before (C# 9)
if (enemy is { Stats: { Hp: > 50 } }) { /* ... */ }

// after (C# 10)
if (enemy is { Stats.Hp: > 50 }) { /* ... */ }
```

스탯 시스템처럼 중첩이 깊어질수록 효과가 크다.

### 5. Constant Interpolated Strings

상수 문자열에서 보간을 쓸 수 있다 (단, 보간 대상도 상수여야 함).

```csharp
private const string Version = "1.0.0";
private const string Build = "release";
private const string Banner = $"MyGame {Version} ({Build})";
```

빌드 메타데이터, 로그 프리픽스를 한 곳에서 조립할 때 깔끔하다.

### 6. Parameterless Struct Constructors / Field Initializers

이전엔 struct에 매개변수 없는 생성자와 필드 초기화를 쓸 수 없었다. 10.0부터 가능해졌다.

```csharp
public struct EnemyStats
{
    public int Hp = 100;
    public int Atk = 10;

    public EnemyStats() { }
}
```

기본값을 명시적으로 줄 수 있어 "0으로 시작하는데 알고 보니 100이어야 했던" 종류의 버그가 줄어든다. 단, `default(EnemyStats)`로 만들면 여전히 모든 값이 0이라는 점은 주의해야 한다.

### 7. Lambda 개선

람다에 명시적 반환 타입과 속성을 붙일 수 있고, 자연스러운 델리게이트 추론도 강화됐다.

```csharp
var parse = int.Parse; // var로 메서드 그룹을 받을 수 있게 됨
var add = [System.Diagnostics.Conditional("DEBUG")] (int a, int b) => a + b;
Func<int, int> square = int (int x) => x * x; // 명시적 반환 타입
```

UnityEvent나 R3 스트림에 람다를 자주 넣는 코드에서 디버그 어트리뷰트를 직접 붙일 수 있다는 게 의외로 유용하다.

---

## Unity에서 9.0을 최대한 활용하는 패턴

Unity가 9.0에 묶여 있다고 해서 답답할 필요는 없다. 9.0만 잘 써도 코드 품질이 한 단계 올라간다.

```csharp
// Compat
namespace System.Runtime.CompilerServices
{
    internal static class IsExternalInit { }
}

// 도메인 모델: record로 불변 데이터
public record EnemySpawnInfo(string PrefabId, Vector3 Position, float Delay);

// 설정: init으로 한 번만 채우기
public class GameConfig
{
    public int MaxPlayers { get; init; } = 4;
    public float Tickrate { get; init; } = 60f;
}

// 상태 분기: 패턴 매칭
public string ResolveAction(Enemy e) => e switch
{
    { Hp: <= 0 } => "Despawn",
    { Stunned: true, Hp: < 30 } => "Flee",
    { Type: EnemyType.Boss, Hp: < 50 } => "Enrage",
    _ => "Attack"
};

// 컬렉션 초기화: target-typed new
private readonly Dictionary<string, EnemySpawnInfo> _table = new();
```

여기에 C# 10 스타일의 코드가 정말 필요하면, **순수 .NET 프로젝트(예: 서버, 도구, 데이터 파이프라인)**를 별도로 만들어 빼내는 게 답이다. 게임 클라이언트는 9.0, 서버/툴은 11~13까지 자유롭게 — 이렇게 분리하는 회사가 많다.

---

## 정리

| 항목 | 핵심 |
|------|------|
| C# 버전 흐름 | 8.0까지 안정화, 9.0부터 데이터 중심으로 가속 |
| Unity의 C# | 2021.2부터 9.0, Unity 6까지도 9.0에서 멈춤 |
| Unity 함정 | `IsExternalInit` 더미로 record/init 활성화 |
| C# 9 핵심 | record, init, target-typed new, 패턴 매칭 강화 |
| C# 10 핵심 | record struct, global using, file-scoped namespace |

C# 버전을 따라가는 건 트렌드 추종이 아니라 **변경 비용을 줄이는 일**이다. 같은 데이터 클래스를 200줄로 쓰던 걸 record 한 줄로 쓰면, 그 200줄에 숨어 있던 버그도 같이 사라진다. Unity가 9.0에서 멈춰 있더라도, 9.0의 record와 패턴 매칭만 제대로 써도 코드 베이스의 체감 품질은 크게 달라진다.

다음으로 할 일은 단순하다. 지금 프로젝트의 `Api Compatibility Level`을 .NET Standard 2.1로 맞추고, `IsExternalInit` 더미 파일 하나를 추가하고, 가장 최근에 만든 데이터 클래스 하나를 record로 바꿔 보는 것. 거기서부터 시작하면 된다.

*Unity는 C# 9.0에서 멈춰 있지만, record와 init과 패턴 매칭만 제대로 써도 아직 꺼낼 카드는 충분히 많다 — 그게 이 글의 한 줄 요약이다.*
