---
title: "Unity IL2CPP 완전 정리 - Mono에서 넘어온 사람을 위한 내부 동작과 실전 주의점"
description: "IL2CPP가 무엇이고, Mono와 어떻게 다르며, 빌드 파이프라인은 어떻게 돌아가는가. AOT 제약, 리플렉션, 제네릭, 링커, 디버깅까지 실전에서 부딪히는 지점만 모아 정리한다."
date: 2026-04-08
categories: [Dev]
tags: [Unity]
---

## IL2CPP는 왜 있는가

Unity는 오래 전부터 Mono 런타임으로 C#을 돌렸다. Mono는 이식성이 훌륭했지만 두 가지 큰 문제가 있었다. 첫째, iOS가 JIT(Just-In-Time) 컴파일을 보안상 금지했다. 둘째, Mono가 쓰던 .NET 버전이 너무 오래돼서 C# 신규 문법이나 BCL(Base Class Library) 개선을 따라가기 힘들었다.

IL2CPP는 이 두 문제를 한 번에 해결하려는 Unity 내부 프로젝트다. 이름 그대로 **IL(CIL, Common Intermediate Language)을 C++ 소스로 변환**한 다음, 플랫폼의 네이티브 C++ 컴파일러(clang, MSVC 등)로 돌려 네이티브 실행 파일을 만든다. 덕분에 JIT 없이 AOT(Ahead-Of-Time)로 iOS를 지원할 수 있고, 컴파일러 최적화를 통째로 활용할 수 있다.

지금 시점에서 IL2CPP는 "선택"이 아니다. iOS/tvOS/WebGL/PS5/XboxSX/Switch 등 대부분의 출시 타깃에서 강제이고, Android에서도 사실상 표준이다. Mono 백엔드는 에디터 iterate 속도와 일부 데스크톱 빌드에서나 의미가 남아 있다.

---

## 빌드 파이프라인 전체 그림

IL2CPP 빌드가 실제로 하는 일을 순서대로 보면 Mono와 어디서 갈라지는지 명확해진다.

```
C# 소스
  │
  ▼ (Roslyn 컴파일러)
IL 어셈블리 (.dll, Assembly-CSharp.dll 등)
  │
  ▼ (Unity Linker, link.xml + annotations)
스트리핑된 IL 어셈블리
  │
  ▼ (il2cpp.exe, "IL → C++ 변환기")
C++ 소스 (수천 개 .cpp 파일) + 메타데이터
  │
  ▼ (플랫폼 C++ 툴체인: clang / MSVC / xcodebuild)
네이티브 라이브러리 (.so / .a / .dylib / .wasm)
  │
  ▼ (Unity Build Player)
최종 바이너리 (APK/AAB/IPA/EXE)
```

Mono 빌드는 이 흐름에서 IL 어셈블리를 그대로 런타임으로 실어 보낸다. IL2CPP는 IL을 C++로 변환하고 그 C++을 다시 컴파일한다. 단계가 두 개 더 붙기 때문에 빌드 시간이 길어지는 대가로, 실행 파일은 네이티브가 된다.

### il2cpp.exe가 하는 일

실제로 C#의 모든 연산을 의미상 동등한 C++로 바꾼다. 예를 들어 이런 C# 메서드가:

```csharp
public static int Sum(int[] arr)
{
    int total = 0;
    for (int i = 0; i < arr.Length; i++)
        total += arr[i];
    return total;
}
```

대략 이런 느낌의 C++로 변환된다(가상 코드, 실제는 훨씬 장황하다).

```cpp
int32_t Sum_m1234(Int32Array_t* arr, const MethodInfo* method)
{
    int32_t total = 0;
    int32_t length = ((int32_t)(arr)->max_length);
    for (int32_t i = 0; i < length; i++)
    {
        int32_t element = (arr)->GetAt(static_cast<il2cpp_array_size_t>(i));
        total = ((int32_t)il2cpp_codegen_add(total, element));
    }
    return total;
}
```

- 모든 메서드에는 `MethodInfo*` 가 꼬리로 붙는다. 이게 IL2CPP 런타임이 제네릭, 리플렉션, 가상 호출을 풀 때 쓰는 메타데이터 포인터다.
- 배열 접근은 `GetAt`이 자동으로 바운드 체크를 해준다. C#의 `IndexOutOfRangeException`이 그대로 살아 있다.
- 산술은 `il2cpp_codegen_add` 같은 인라인 헬퍼를 거친다. 빌드 설정에서 `Use incremental GC`/`Checked arithmetic` 같은 옵션에 따라 모양이 달라진다.

핵심은 **C#의 의미론을 그대로 유지한 채 네이티브 속도로 돌리려는 설계**라는 것이다. GC도, 예외도, 배열 체크도 전부 살아 있다.

---

## Mono와 IL2CPP의 실제 차이

| 항목 | Mono | IL2CPP |
|------|------|--------|
| 코드 실행 | IL을 JIT로 네이티브화 | 사전에 C++로 변환 후 AOT 컴파일 |
| 실행 속도 | 보통 | Mono 대비 약 1.5~3배 빠름 (핫 루프) |
| 빌드 시간 | 빠름 | 느림 (프로젝트에 따라 10~60분) |
| 빌드 크기 | 작음 | Mono보다 큼 (단, 링커로 상쇄 가능) |
| 리플렉션/동적 코드 | 자유 | 제약 많음 (AOT 제약) |
| 디버깅 | 쉬움 | 상대적으로 어려움 (C++ 심볼 필요) |
| iOS 지원 | 불가 | 유일한 선택지 |
| `Assembly.Load` / `Emit` | 가능 | 불가 |

실행 속도 이득은 단순 연산보다 GC 알로케이션이 적은 핫 루프에서 크다. 알로케이션이 많으면 어느 쪽이든 GC에 묶이기 때문에 차이가 작다. 즉 IL2CPP로 바꿨다고 프레임이 저절로 나아지는 게 아니라, "최적화된 코드의 상한을 끌어올려 준다"는 쪽이 정확한 표현이다.

---

## AOT 제약 - 가장 많이 걸리는 함정

IL2CPP는 빌드 시점에 모든 코드 경로를 알아야 한다. 런타임에 "없던 코드"를 만들어낼 수 없다. 이 원칙에서 주의해야 할 몇 가지가 나온다.

### 1) 제네릭 값 타입 인스턴스화

IL2CPP는 **실제로 호출되는 제네릭 인스턴스화**를 빌드에서 생성한다. 코드에 `List<int>`, `List<MyStruct>`가 어디선가 명시적으로 쓰이지 않으면, 나중에 리플렉션으로 그 타입을 만들려 해도 실패한다. 로그에 흔히 나오는 다음 문구가 이 상황이다.

```
ExecutionEngineException: Attempting to call method
'System.Collections.Generic.List`1[[MyGame.MyStruct]]::.ctor'
for which no ahead of time (AOT) code was generated.
```

해결법:

```csharp
// link.xml이 아니라 "더미 코드"로 강제 인스턴스화
public static class AotHints
{
    public static void Reference()
    {
        _ = new List<MyStruct>();
        _ = new Dictionary<int, MyStruct>();
    }
}
```

이런 클래스는 어디서도 호출할 필요 없이 존재만 하면 된다. 실제 호출이 없어도 IL2CPP가 코드 존재를 보고 인스턴스화 정보를 함께 생성한다. (버전에 따라 `UnityEngine.Scripting.Preserve`나 `AlwaysLinkAssembly`를 추가로 붙이는 게 안전하다.)

### 2) 리플렉션과 링커

Unity의 Managed Code Stripping(Unity Linker)은 "쓰이지 않는 것처럼 보이는" 타입과 메서드를 빌드에서 지워 크기를 줄인다. 문제는 정적 분석으로는 리플렉션 호출을 추적할 수 없다는 점이다.

```csharp
// 이렇게 하면 MyComponent가 스트리핑될 수 있다
var type = Type.GetType("MyGame.MyComponent");
var instance = Activator.CreateInstance(type);
```

세 가지 해결 방법:

**방법 A - `[Preserve]` 어트리뷰트**

```csharp
using UnityEngine.Scripting;

[Preserve]
public class MyComponent { }
```

**방법 B - `link.xml`**

`Assets/link.xml`을 만든다:

```xml
<linker>
  <assembly fullname="Assembly-CSharp">
    <type fullname="MyGame.MyComponent" preserve="all"/>
  </assembly>
  <assembly fullname="Newtonsoft.Json" preserve="all"/>
</linker>
```

**방법 C - `Managed Stripping Level`을 낮춤**

`Player Settings > Other > Managed Stripping Level`을 `Minimal`로 두면 링커가 관대해진다. 대신 빌드 크기가 커진다.

실전 권장은 A+B의 혼합이다. 내가 작성한 타입은 A, 외부 라이브러리(JSON, DI, serializer)는 B로 잡는다.

### 3) `Assembly.Load`, `Type.GetType`(동적 문자열), `Emit`

`System.Reflection.Emit`은 IL2CPP에서 **동작하지 않는다**. 런타임에 IL을 만드는 것 자체가 AOT 원칙에 어긋나기 때문이다. JSON 직렬화 라이브러리나 Expression 트리 컴파일을 쓰는 라이브러리 중 이걸 사용하는 것들이 있으므로, 모바일 타깃이라면 호환성 문서를 먼저 확인해야 한다.

`Newtonsoft.Json`은 AOT 모드에서 동작하도록 우회 경로를 갖고 있지만, 반드시 `link.xml`로 모델 타입을 보존해야 한다. `System.Text.Json`은 Source Generator를 쓰면 AOT 친화적이다.

### 4) `dynamic` 키워드

IL2CPP에서 `dynamic`은 사실상 쓸 수 없다. 내부적으로 DLR(Dynamic Language Runtime)을 쓰는데, 이게 Emit을 필요로 한다. 코드에 `dynamic`이 들어가 있다면 다른 방식으로 풀어야 한다.

---

## 링커와 빌드 크기

기본값인 `Managed Stripping Level = Low`는 대부분 프로젝트에 무난하다. 크기가 문제라면 `Medium`/`High`로 올리면서 스트리핑되는 타입을 `link.xml`로 하나씩 되살리는 접근이 정석이다.

빌드 크기 큰 덩어리 순서:

1. 텍스처/사운드/메시 (99% 이곳)
2. 네이티브 라이브러리(IL2CPP 변환 결과 + 엔진 코드)
3. 매니지드 어셈블리(스트리핑 후)

즉 IL2CPP는 크기 증가의 주범이지만, 대부분의 경우 텍스처를 ASTC로 압축하고 Max Size를 낮추는 게 10배 효과가 크다. 링커로 매니지드 쪽을 쥐어짜는 건 순서상 마지막이다.

---

## 디버깅과 심볼

### 에디터 vs 디바이스

에디터는 Mono로 돌기 때문에 `Debug.Log`, 브레이크포인트, Hot Reload 모두 일상적이다. 문제는 디바이스 빌드에서 발생한 이슈를 재현할 때다.

### Script Debugging 옵션

`Build Settings`에서 `Development Build` + `Script Debugging`을 켜면, 디바이스 IL2CPP 빌드에 관리되는 디버거를 붙일 수 있다. Rider/Visual Studio에서 원격 디버그가 가능하다. 단, 빌드가 훨씬 느려지고 실행 속도도 떨어지므로 출시 빌드에는 쓰지 않는다.

### 크래시 리포트 해석

프로덕션 빌드에서 받는 크래시 스택은 C++ 심볼로 찍힌다.

```
#0  il2cpp::vm::Exception::Raise
#1  MyGame_PlayerHealth_TakeDamage_m4F8A...
#2  MyGame_DamageSystem_Apply_m1234...
```

`m4F8A` 같은 접미사는 IL2CPP가 붙인 메서드 해시다. Unity는 빌드마다 `il2cpp_data/Metadata/global-metadata.dat`와 함께 심볼 매핑 정보를 남긴다. Android는 `symbols.zip`, iOS는 `.dSYM` 파일을 업로드해야 Crashlytics나 Backtrace 같은 서비스가 원본 C# 메서드 이름으로 디심볼라이즈해 준다. 출시 시점에 이 파일들을 백업해 두지 않으면 이후 크래시가 올라와도 해석할 수 없다.

---

## 빌드 시간 줄이기

IL2CPP의 가장 큰 체감 단점은 빌드 시간이다. 줄이는 몇 가지 방법:

- **Incremental IL2CPP**: 2021 이후 기본 켜짐. 변경된 어셈블리만 재변환한다. 직접 끄지 말 것.
- **C++ Compiler Configuration**: `Player Settings > Other > C++ Compiler Configuration`
  - Debug: 가장 빠른 빌드, 가장 느린 실행
  - Release: 균형
  - Master: 가장 느린 빌드, 가장 빠른 실행 (출시용)
- **Il2CppCodeGeneration**: `Faster (smaller) builds` vs `Faster runtime`
  - 전자: 제네릭을 공유 코드로 생성 → 빌드 빠름, 런타임 약간 느림
  - 후자: 제네릭을 인스턴스별로 생성 → 빌드 느림, 런타임 빠름
  - 개발 중엔 전자, 출시 빌드엔 후자
- **어셈블리 정의(asmdef)**: 코드를 여러 어셈블리로 쪼개면 변경이 없는 어셈블리는 재변환을 건너뛴다. 효과가 크다.
- **Development 빌드와 Release 빌드를 분리**: CI 파이프라인을 두 개 두고, 일상 테스트는 Development+Mono 또는 Development+IL2CPP(Debug), 출시/QA는 Master 설정을 쓴다.

---

## 실전 체크리스트

IL2CPP 프로젝트를 처음 세팅할 때 확인할 것들:

- [ ] `Scripting Backend = IL2CPP`
- [ ] `Api Compatibility Level = .NET Standard 2.1` (호환성 우선시 .NET Framework)
- [ ] `Managed Stripping Level = Low` (안정되면 Medium 시도)
- [ ] `link.xml` 작성: 리플렉션 쓰는 외부 라이브러리 보존
- [ ] 자주 쓰는 제네릭 값 타입은 `AotHints`로 강제 인스턴스화
- [ ] JSON 라이브러리 선택 시 AOT 호환성 확인 (Newtonsoft.Json + link.xml, 또는 System.Text.Json + Source Generator)
- [ ] `dynamic`, `Reflection.Emit`, `Expression.Compile()` 사용 여부 점검
- [ ] 출시 빌드용 C++ Configuration = Master, Code Generation = Faster runtime
- [ ] Android `symbols.zip` / iOS `.dSYM` 백업 자동화

이 체크리스트의 70%는 "런타임에 터진 다음 고치려 하면 늦는 것들"이다. 프로젝트 초기에 한 번 정리해두면, 출시 전 한 달을 크래시 해석에 날리는 일을 피할 수 있다.

---

## 정리

IL2CPP는 Unity가 C#의 생산성과 네이티브의 배포 요구사항을 동시에 만족시키려는 현실적 타협이다. IL을 C++로 변환한다는 발상 자체가 우아하지는 않지만, 덕분에 같은 C# 코드가 iOS, 콘솔, WebGL에서 그대로 돌아간다. 반대로 그 대가로 AOT 제약, 빌드 시간, 디버깅 난이도가 따라온다.

Mono에서 넘어온 사람이 가장 크게 느끼는 전환점은 두 가지다. 첫째, "에디터에서 되면 디바이스에서도 된다"는 가정이 깨진다는 점. 둘째, 리플렉션/동적 코드가 공짜가 아니라는 점. 이 두 가지를 머리에 넣고 빌드 설정과 `link.xml`을 초기에 잡아두면, IL2CPP는 투명한 도구처럼 보이기 시작한다.

새 프로젝트라면 처음부터 IL2CPP로 빌드 파이프라인을 돌려보는 걸 권한다. 출시 직전에 "IL2CPP로 한 번 뽑아봤더니 100가지 AOT 에러"가 쏟아지는 것보다, 매일 한두 개씩 고치는 쪽이 훨씬 덜 아프다.

*C#을 C++로 변환해 네이티브 속도와 AOT 호환성을 모두 얻는 대신, 리플렉션 제약과 빌드 시간을 감수한다 -- IL2CPP의 존재 이유를 한 줄로 줄이면 이것이다.*
