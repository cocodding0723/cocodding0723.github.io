---
title: "C# 리플렉션이란 무엇이고 Unity는 이걸 어디서 쓰는가"
description: "Type, MethodInfo, Activator 같은 C# 리플렉션 API가 하는 일을 정리하고, SerializeField부터 에디터 확장, JsonUtility, 테스트 프레임워크까지 Unity 내부 어디에서 리플렉션이 돌고 있는지 추적한다."
date: 2026-04-09
categories: [Dev]
tags: [Unity]
---

## 리플렉션이 뭐 하는 물건인가

C#으로 다음과 같이 클래스를 만들면 컴파일러는 클래스 이름, 필드 목록, 메서드 시그니처, 어트리뷰트 같은 정보를 실행 파일(어셈블리)에 **메타데이터**로 함께 박아 넣는다.

```csharp
public class Player
{
    [SerializeField] private int _hp;
    public string Name { get; set; }
    public void TakeDamage(int dmg) { _hp -= dmg; }
}
```

리플렉션(Reflection)은 이 메타데이터를 런타임에 **다시 읽어 오는** 기능이다. 컴파일 시점엔 `Player` 타입이 있는지도 몰랐던 코드가, 문자열 `"Player"`만으로 타입을 찾아내고, 필드를 돌고, 메서드를 호출할 수 있다. 즉 "코드가 코드를 들여다보는 거울" 같은 기능이다.

```csharp
using System;
using System.Reflection;

var type = Type.GetType("MyGame.Player");          // 문자열로 타입 찾기
var player = Activator.CreateInstance(type);      // 기본 생성자로 인스턴스 만들기
var field = type.GetField("_hp", BindingFlags.NonPublic | BindingFlags.Instance);
field.SetValue(player, 100);                      // private 필드에 값 쓰기
var method = type.GetMethod("TakeDamage");
method.Invoke(player, new object[] { 10 });       // 메서드 호출
```

위 코드에서 `Player`라는 이름은 단 한 번도 `new Player()`로 컴파일러에 알려지지 않는다. 그럼에도 실행된다. 이게 리플렉션이다.

---

## 핵심 API 지도

리플렉션 API는 이름만 봐도 뭘 하는지 대충 짐작이 간다. 자주 쓰는 것만 추리면 이 정도다.

| 클래스 | 역할 |
|--------|------|
| `Type` | 타입 정보 진입점. `typeof(T)`, `obj.GetType()`, `Type.GetType(string)` |
| `Assembly` | 어셈블리(.dll) 자체. 타입 목록을 돌 때 시작점 |
| `MemberInfo` | 필드/프로퍼티/메서드/이벤트의 공통 베이스 |
| `FieldInfo` | 필드 메타데이터, 값 읽기/쓰기 |
| `PropertyInfo` | 프로퍼티 메타데이터, get/set |
| `MethodInfo` | 메서드 메타데이터, `Invoke` |
| `ConstructorInfo` | 생성자 메타데이터, `Invoke` |
| `Activator` | 생성자 호출 헬퍼 (`CreateInstance`) |
| `Attribute` / `GetCustomAttributes` | 커스텀 어트리뷰트 읽기 |

특히 어트리뷰트를 읽는 부분이 Unity에서 엄청나게 자주 쓰인다. 이유는 잠시 후에 나온다.

### BindingFlags

`GetField`, `GetMethod` 같은 API는 기본으로 **public + 인스턴스 멤버**만 돌려준다. private나 static까지 보려면 플래그를 줘야 한다.

```csharp
var flags = BindingFlags.Public
          | BindingFlags.NonPublic
          | BindingFlags.Instance
          | BindingFlags.Static;

foreach (var f in typeof(Player).GetFields(flags))
    Debug.Log(f.Name);
```

이걸 모르고 `[SerializeField] private` 필드를 못 찾아 헤매는 경우가 많다.

---

## 리플렉션이 비싼 이유

리플렉션은 편리하지만 싸지 않다. 크게 세 가지 이유다.

1. **문자열 탐색**: `GetField("_hp")`는 해시맵 조회가 아니라 메타데이터 테이블 선형 탐색에 가까운 동작을 한다.
2. **박싱**: `Invoke(obj, new object[] { 10 })`은 값 타입 인자를 힙에 박싱한다. 매 호출마다 GC 알로케이션이 생긴다.
3. **보안 / 접근 검사**: private 멤버에 접근할 때 추가 검증이 들어간다.

벤치마크 감각으로, 일반 메서드 호출 대비 `MethodInfo.Invoke`는 수십~수백 배 느리다. 핫 루프에서 프레임마다 돌리면 바로 프로파일러에 피크가 찍힌다. 그래서 실전에서는 **한 번 찾은 MemberInfo를 캐싱**하거나, `Delegate.CreateDelegate` / `Expression.Compile`로 미리 컴파일된 델리게이트로 바꿔 쓰는 패턴이 기본이다.

```csharp
// 나쁜 예 - 매 프레임 리플렉션
void Update()
{
    var method = GetType().GetMethod("Tick");
    method.Invoke(this, null);
}

// 나은 예 - 델리게이트로 캐시
private Action _tick;
void Awake()
{
    var method = GetType().GetMethod("Tick");
    _tick = (Action)Delegate.CreateDelegate(typeof(Action), this, method);
}
void Update() { _tick(); }
```

`Delegate.CreateDelegate`는 내부적으로 호출 지점을 JIT(Mono) 또는 기 생성된 네이티브 함수(IL2CPP)로 묶어주기 때문에, 일반 메서드 호출과 거의 같은 속도가 나온다.

---

## Unity는 어디서 리플렉션을 쓰는가

여기가 본론이다. 우리가 평소에 "Unity가 알아서 해주는 기능"이라고 느끼는 것 대부분이 뒤에서 리플렉션으로 돌고 있다.

### 1) `[SerializeField]`와 인스펙터

MonoBehaviour의 필드를 인스펙터에 띄우는 과정은 대략 이렇다.

1. Unity 에디터가 컴포넌트 타입을 받는다.
2. 리플렉션으로 `public` 필드와 `[SerializeField]`가 붙은 `private` 필드를 모두 나열한다.
3. 각 필드의 타입을 보고 알맞은 Property Drawer(슬라이더, 오브젝트 필드, 토글 등)를 고른다.
4. 필드에 값을 그려 넣고, 수정되면 다시 리플렉션으로 값을 써 넣는다.

```csharp
public class Enemy : MonoBehaviour
{
    [SerializeField] private int _hp;
    [Range(0, 10)] public float speed;
    [Header("AI")]
    public float detectRange;
}
```

`[SerializeField]`, `[Range]`, `[Header]` 전부 어트리뷰트다. 에디터가 리플렉션으로 이 어트리뷰트를 읽어서 "아, 이 int는 필드로 그리고, 이 float는 슬라이더로, 이 float 위엔 'AI' 라벨 헤더를 붙여라" 라고 해석한다. 우리가 어트리뷰트 하나만 달면 인스펙터 UI가 바뀌는 마법은 전부 런타임 메타데이터 조회의 결과다.

### 2) 직렬화 (씬 저장, 프리팹)

`SerializeField` 필드의 값을 씬 파일(.unity, YAML)에 쓰는 과정도 같은 메커니즘이다. Unity는 타입 정보를 리플렉션으로 꺼내 "이 객체의 이 필드는 무슨 값이다"를 직렬화한다. 불러올 때는 반대로, 메타데이터를 돌며 역직렬화한 값을 필드에 주입한다.

`[System.Serializable]`을 붙인 일반 클래스 역시 같은 경로를 탄다.

```csharp
[System.Serializable]
public class Stats { public int atk; public int def; }

public class Weapon : MonoBehaviour
{
    public Stats baseStats;   // 인스펙터에 중첩 블록으로 펼쳐진다
}
```

Unity가 `Stats`의 필드 목록을 따로 알 리 없다. 리플렉션이 그때그때 파내는 것이다.

### 3) 에디터 확장 - `[MenuItem]`, `[CustomEditor]`, `[InitializeOnLoad]`

에디터 기능을 만드는 어트리뷰트는 전부 리플렉션 기반이다.

```csharp
public static class ToolMenu
{
    [MenuItem("Tools/Clean Log")]
    public static void CleanLog() { Debug.ClearDeveloperConsole(); }
}
```

에디터 시작 시 Unity는 모든 어셈블리를 돌며 `[MenuItem]`이 붙은 **public static 메서드**를 찾아 메뉴 항목으로 등록한다. 그 "모든 어셈블리를 돈다"가 정확히 리플렉션이다.

```csharp
Assembly.GetExecutingAssembly()
    .GetTypes()
    .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.Static))
    .Where(m => m.GetCustomAttribute<MenuItem>() != null);
```

`[CustomEditor(typeof(Enemy))]`, `[CustomPropertyDrawer(typeof(Health))]`, `[InitializeOnLoadMethod]`, `[RuntimeInitializeOnLoadMethod]` 전부 같은 방식이다. 어트리뷰트를 검색해서 매칭되는 타입/메서드를 실행 시점에 연결한다.

### 4) `JsonUtility`와 JSON 라이브러리

`JsonUtility.ToJson(obj)`는 객체의 필드를 리플렉션으로 나열해 JSON 문자열로 찍는다. 반대 방향인 `FromJson<T>`는 `Activator.CreateInstance<T>()`로 인스턴스를 만든 뒤 필드에 값을 써 넣는다. `Newtonsoft.Json`, `System.Text.Json`도 근본 원리는 같다. 단, Newtonsoft는 리플렉션 결과를 내부에서 컴파일된 델리게이트로 캐싱해 재사용하고, `System.Text.Json`은 최신 버전부터 **Source Generator**로 컴파일 타임에 미리 접근 코드를 생성해서 리플렉션을 완전히 피할 수 있다.

```csharp
var json = JsonUtility.ToJson(new Stats { atk = 10, def = 5 });
// {"atk":10,"def":5}
```

모바일·콘솔처럼 IL2CPP 타깃에서는 리플렉션이 자유롭지 않다 ([IL2CPP의 AOT 제약](/2026/04/08/unity-il2cpp-deep-dive/) 참고). 그래서 Newtonsoft 같은 라이브러리를 쓸 때 `link.xml`로 모델 타입을 보존해주지 않으면 "빌드에선 비어 있는 객체가 나온다"는 사고가 난다.

### 5) DI 컨테이너와 테스트 프레임워크

Zenject/Extenject는 모든 `[Inject]` 어트리뷰트를 리플렉션으로 찾아 주입 지점을 해석한다. 이 때문에 리플렉션 오버헤드가 적지 않았고, **VContainer**는 같은 일을 Source Generator + 코드 생성으로 해결해 리플렉션 호출을 사실상 0에 가깝게 줄였다. "VContainer가 Zenject보다 빠르다"는 말의 가장 큰 이유가 여기다.

Unity Test Framework(UTF)도 같은 구조다. `[Test]`, `[UnityTest]`, `[SetUp]`, `[TearDown]`, `[TestFixture]` 전부 리플렉션으로 어셈블리를 스캔해서 러너에 등록한다. NUnit 위에 얹혀 있기 때문에 구조는 .NET 생태계의 표준이다.

### 6) Animation Event와 UnityEvent

애니메이션 클립에 "이 프레임에 `PlayFootstep` 호출"을 꽂으면, Unity는 런타임에 대상 GameObject의 컴포넌트들을 뒤져 `PlayFootstep`이라는 이름의 public 메서드를 리플렉션으로 찾아 호출한다. 메서드 이름을 바꾸거나 시그니처를 바꿔서 한참 뒤에야 "애니 이벤트가 안 울린다"는 버그를 만나는 경우가 여기서 나온다.

`UnityEvent`도 비슷하다. 인스펙터에서 드래그해서 연결한 메서드는 `MethodInfo`로 저장되고, `Invoke()` 시점에 `MethodInfo.Invoke`가 돌아간다. (단, 런타임에 코드로 `AddListener`를 쓴 경우는 일반 델리게이트라 리플렉션이 아니다.)

### 7) `SerializeReference`와 다형성 직렬화

2019.3에서 들어온 `[SerializeReference]`는 인터페이스나 추상 클래스 필드를 직렬화할 수 있게 해준다. 내부적으로는 **구체 타입 이름**을 YAML에 저장해두고, 역직렬화 시 `Type.GetType`으로 타입을 찾아 `Activator.CreateInstance`로 복원한다.

```csharp
public interface IAction { void Do(); }
public class Wait : IAction { public float seconds; public void Do() { } }
public class Jump : IAction { public float power; public void Do() { } }

public class Sequence : MonoBehaviour
{
    [SerializeReference] public List<IAction> actions;
}
```

이 리스트에 서로 다른 타입을 섞어 넣을 수 있는 건, 저장 시점에 각 요소의 `GetType()`을 기록해 두고 로드 시점에 그걸로 다시 인스턴스화하기 때문이다. 전형적인 리플렉션 패턴이다.

### 8) `UnityEngine.PropertyAttribute`와 커스텀 드로어

직접 만든 어트리뷰트로 인스펙터를 꾸밀 때도 같은 원리다.

```csharp
public class ReadOnlyAttribute : PropertyAttribute { }

[CustomPropertyDrawer(typeof(ReadOnlyAttribute))]
public class ReadOnlyDrawer : PropertyDrawer
{
    public override void OnGUI(Rect r, SerializedProperty p, GUIContent label)
    {
        GUI.enabled = false;
        EditorGUI.PropertyField(r, p, label);
        GUI.enabled = true;
    }
}
```

필드에 `[ReadOnly]`가 붙어 있는지는 에디터가 리플렉션으로 검사하고, 붙어 있으면 매칭되는 Drawer를 찾아 `OnGUI`를 호출한다. 이 연결도 전부 타입 스캔에서 시작한다.

### 9) MonoBehaviour 생명주기 메서드 디스커버리

`Awake`, `Start`, `OnEnable`, `Update`, `LateUpdate`, `FixedUpdate`, `OnDestroy` 같은 매직 메서드는 인터페이스가 아니다. Unity는 `IUpdatable` 같은 베이스를 강제하지 않기 때문에, 런타임이 "이 컴포넌트가 `Update`를 가지고 있는지" 알아낼 길이 결국 리플렉션밖에 없다.

다만 매 프레임 `MethodInfo.Invoke`를 도는 건 아니다. 흐름은 이렇다.

1. **타입이 처음 등장할 때 한 번**, Unity 네이티브가 해당 MonoBehaviour 타입의 메서드 목록을 리플렉션으로 스캔한다 (`GetMethod("Update", ...)` 같은 식).
2. 결과를 타입별 캐시 테이블에 저장한다. "이 타입은 Update 있음, FixedUpdate 없음, OnDestroy 있음" 같은 비트마스크와 함수 포인터로.
3. 인스턴스가 활성화되면 캐시를 보고 종류에 맞는 **업데이트 리스트**(UpdateBehaviourManager, FixedBehaviourManager 등)에 등록된다.
4. 매 프레임 메인 루프는 이 리스트만 돌면서 캐시된 호출 경로로 직접 진입한다. 이 단계는 더 이상 리플렉션이 아니다.

즉 "디스패치 자체는 리플렉션이 아니지만, **누가 디스패치 대상인지를 결정하는 단계는 리플렉션의 결과물**"이다. 이게 Unity가 공식 블로그의 "10000 Update() calls" 글에서 **빈 `Update()`라도 가지고 있으면 비용이 든다**고 경고한 이유다. 메서드가 존재한다는 사실 자체가 캐시에 등록되고, 인스턴스가 늘면 매 프레임 리스트 순회와 매니지드 ↔ 네이티브 경계 호출 비용이 따라붙는다. 안 쓰는 빈 `Update`는 그래서 지우는 게 맞다.

비슷한 경로로, `[RuntimeInitializeOnLoadMethod]`도 생명주기 카테고리에 들어가지만 이쪽은 더 노골적인 리플렉션이다.

```csharp
public static class Bootstrap
{
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
    static void Init() { /* 게임 시작 시 자동 호출 */ }
}
```

게임이 시작될 때 Unity가 **모든 어셈블리를 풀 스캔**해서 이 어트리뷰트가 붙은 정적 메서드를 찾아 호출한다. 한 번뿐이지만 어셈블리가 많은 프로젝트에서는 도메인 리로드 시간을 늘리는 주범 중 하나다. 에디터 시작 시 `[InitializeOnLoadMethod]`도 같은 메커니즘이다.

---

## IL2CPP에서 주의할 점

리플렉션이 Unity에서 "어디서나" 쓰이는 만큼, IL2CPP 타깃에서 생기는 AOT 제약도 여기저기서 터진다. 핵심은 세 가지다.

1. **`Reflection.Emit`은 금지**다. 런타임에 IL을 만드는 것 자체가 AOT 원칙 위반이다. `Expression.Compile()`을 쓰는 라이브러리는 폴백 경로가 있는지 확인해야 한다.
2. **Unity Linker 스트리핑**은 리플렉션으로만 접근되는 타입을 "쓰이지 않는" 것으로 판단해 지워버린다. `[Preserve]` 어트리뷰트나 `link.xml`로 살려야 한다.
3. **제네릭 값 타입 인스턴스화**는 빌드에 포함되지 않으면 런타임에 만들 수 없다. `List<MyStruct>` 같은 조합을 리플렉션으로만 쓰면 `ExecutionEngineException`이 뜬다.

자세한 대응은 [IL2CPP 완전 정리](/2026/04/08/unity-il2cpp-deep-dive/)에 따로 정리했다.

---

## 리플렉션을 줄이는 세 가지 전략

Unity가 리플렉션에 의존한다고 해서, 우리가 작성하는 게임 코드도 그래야 하는 건 아니다. 줄일 수 있으면 줄이는 게 낫다.

**1) 한 번만 찾고 델리게이트로 캐시**

```csharp
static readonly Action<Enemy, int> SetHp =
    (Action<Enemy, int>)Delegate.CreateDelegate(
        typeof(Action<Enemy, int>),
        typeof(Enemy).GetMethod("SetHp", BindingFlags.NonPublic | BindingFlags.Instance));
```

`Invoke` 박싱이 사라져서 핫 패스에서도 쓸 만해진다.

**2) Source Generator**

.NET 5 이후의 Source Generator는 컴파일 타임에 C# 코드를 생성한다. 리플렉션이 하던 일을 빌드 시점에 끝내버리는 셈이다. `System.Text.Json`, VContainer, MessagePipe, MemoryPack 같은 현대 Unity/C# 생태계 라이브러리가 이 경로를 택하고 있다.

**3) 어노테이션 기반이 아니라 명시 등록**

리플렉션으로 `[Handler]` 어트리뷰트를 스캔하는 대신, 시작 시점에 명시적으로 등록하는 방식으로 바꿀 수 있다.

```csharp
// 리플렉션 기반
services.ScanAllAssemblies<IHandler>();

// 명시적
services.Register<DamageHandler>();
services.Register<HealHandler>();
```

코드가 조금 장황해지지만 IL2CPP, 스트리핑, 빌드 시간 모두에 좋다.

---

## 정리

리플렉션은 **"런타임에 메타데이터를 보고 행동을 결정하는" 기능**이고, C#에서는 `Type`, `FieldInfo`, `MethodInfo`, `Activator`, `Attribute`가 그 입구다. 편리하지만 비싸고, AOT에서는 위험하다.

Unity는 이 기능에 깊이 의존한다. 인스펙터도, 씬 직렬화도, 에디터 메뉴도, `JsonUtility`도, 테스트도, Animation Event도, `SerializeReference`도 모두 리플렉션 없이는 성립하지 않는다. 그래서 한 번 Unity 어딘가에서 "왜 이건 어트리뷰트 하나 달았더니 되지?"라는 마법을 느낀다면, 십중팔구 뒤에서 어셈블리를 훑고 있는 리플렉션 코드가 있는 셈이다.

내가 쓰는 게임 로직 코드에서는 리플렉션을 직접 부르기보다, 델리게이트 캐시와 Source Generator 기반 라이브러리로 밀어내는 걸 기본으로 삼는 게 좋다. 그러면 Mono 에디터에서는 편하게, IL2CPP 출시 빌드에서는 탈 없이 같은 기능을 굴릴 수 있다.

*C# 리플렉션은 메타데이터를 런타임에 들여다보는 거울이고, Unity의 "어트리뷰트 하나만 달면 되는" 편의 기능 대부분이 그 거울 위에 서 있다.*
