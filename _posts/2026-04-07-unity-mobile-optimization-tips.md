---
title: "Unity 모바일 최적화 - Android와 iOS에서 30fps를 60fps로 끌어올리는 법"
description: "Unity로 만든 모바일 게임이 저가형 안드로이드에서 끊기는 이유는 대부분 같은 자리에서 새는 비용이다. 빌드 설정, 메모리, 드로우콜, 셰이더, GC, 플랫폼별 함정까지 실전 체크리스트로 정리한다."
date: 2026-04-07
categories: [Dev]
tags: [Unity, Android]
---

## 모바일은 PC가 아니다

PC에서 100fps로 잘 돌던 프로젝트를 안드로이드 중저가형(예: Snapdragon 6 시리즈)에 올려보면 25~30fps로 떨어지는 일이 흔하다. 원인은 거의 정해져 있다. 메모리 대역폭, 픽셀 처리량, 그리고 GC 스파이크다. iOS는 하드웨어가 비교적 균일해서 덜 티가 나지만, 발열로 인한 thermal throttling이 시작되면 똑같이 무너진다.

이 글은 "어디부터 손댈지 모르겠다"는 사람을 위한 우선순위 체크리스트다. 위에서부터 순서대로 적용하면 효과가 큰 순서다. 모든 항목은 Unity 2022 LTS 이상 + URP(Universal Render Pipeline) 기준이다.

---

## 1. 빌드 설정 - 가장 적은 노력으로 가장 큰 효과

### IL2CPP + ARM64 (Android)

`Player Settings > Other Settings`에서 가장 먼저 확인할 것.

| 항목 | 권장값 | 이유 |
|------|--------|------|
| Scripting Backend | IL2CPP | Mono 대비 2~3배 빠른 실행 속도 |
| Api Compatibility Level | .NET Standard 2.1 | 빌드 크기 축소 |
| Target Architectures | ARMv7 해제, ARM64만 체크 | Google Play 정책상 ARM64 필수, ARMv7은 빌드 크기만 키움 |
| Managed Stripping Level | Minimal 또는 Low | 코드 사이즈 축소, 단 리플렉션 사용 시 link.xml 필요 |

iOS는 IL2CPP가 강제이므로 신경 쓸 게 적다. 대신 `Player Settings > iOS > Other > Strip Engine Code`를 켜야 IPA가 작아진다.

### Graphics API

- Android: **Vulkan**을 1순위로, 호환 안 되는 기기 대비 OpenGLES3을 2순위로 둔다. Vulkan은 드라이버 오버헤드가 낮아 드로우콜 비용을 절반 가까이 줄여준다.
- iOS: **Metal** 한 가지만 둔다. OpenGLES는 deprecated.

### Splash와 압축

- `Compression Method`를 LZ4HC로 설정하면 다운로드 크기는 줄고 런타임 압축 해제 비용은 거의 늘지 않는다.
- Android의 경우 `Build App Bundle (Google Play)`를 켜서 AAB로 빌드하면 디바이스별로 필요한 ABI/리소스만 다운로드된다. 다운로드 크기 30~50% 절감.

---

## 2. 텍스처 - 메모리의 90%는 여기서 샌다

### 압축 포맷

| 플랫폼 | 권장 포맷 | 설명 |
|--------|----------|------|
| Android | ASTC 6x6 (균형) / ASTC 8x8 (배경) | OpenGLES3.1+ 필수, 거의 모든 현행 기기 지원 |
| iOS | ASTC 6x6 | A8(2014) 이후 모든 iOS 기기 지원 |

ETC2는 ASTC 미지원 구형 기기 대비용. 신규 프로젝트라면 ASTC를 기본으로 두고 폴백만 ETC2로 둔다. RGBA32 같은 무압축 포맷이 섞여 있으면 메모리 사용량이 4~8배 폭증한다.

### Max Size

UI 아이콘이 4096x4096으로 들어와 있는 경우가 의외로 많다. Android는 1024, 2048까지가 합리적인 상한이다. `Texture > Max Size`를 줄이는 것만으로 메모리가 1/4로 떨어진다.

### Mipmap

3D 오브젝트 텍스처는 거의 항상 Mipmap을 켠다. 메모리는 33% 더 쓰지만 멀리 있는 픽셀의 샘플링 비용이 줄고 모아레 패턴이 사라진다. 반대로 UI/스프라이트는 Mipmap을 끈다 — 화면에서 1:1로 보이기 때문에 메모리만 낭비한다.

```csharp
// 런타임에 텍스처 메모리 점검
long total = 0;
foreach (var t in Resources.FindObjectsOfTypeAll<Texture2D>())
{
    total += UnityEngine.Profiling.Profiler.GetRuntimeMemorySizeLong(t);
}
Debug.Log($"Texture Memory: {total / (1024 * 1024)} MB");
```

---

## 3. 드로우콜과 배칭

모바일 GPU는 드로우콜당 오버헤드가 PC보다 훨씬 크다. 목표는 화면당 100콜 이하, 가능하면 50콜 이하다.

### SRP Batcher (URP 전용)

`URP Asset > Advanced > SRP Batcher`를 켠다. 단, 머티리얼이 같은 셰이더 + 같은 키워드 조합이어야 묶인다. `Shader Variant`가 폭발하지 않게 키워드를 줄이는 게 핵심.

### GPU Instancing

같은 메시 + 같은 머티리얼을 여러 번 그릴 때(풀, 돌, 적 캐릭터) `Material > Enable GPU Instancing`을 체크. 단, MaterialPropertyBlock으로 인스턴스별 색상/위치를 넘길 때만 SRP Batcher와 호환된다.

### Static / Dynamic Batching

- Static Batching: 움직이지 않는 메시는 `Static`으로 표시. 빌드 크기는 약간 늘지만 드로우콜이 크게 줄어든다.
- Dynamic Batching: 정점 300개 이하 메시에만 적용. URP에서는 기본 꺼져 있고, 켜면 오히려 CPU 비용이 늘 수 있어 측정 후 결정.

### UI 드로우콜

uGUI는 캔버스 단위로 메시를 다시 빌드한다. 자주 바뀌는 텍스트(점수, 타이머)와 정적인 UI(배경)를 같은 캔버스에 두면, 텍스트 한 글자 바뀔 때마다 캔버스 전체가 다시 그려진다.

```
Canvas (Static)
  ├── Background
  └── HUD Frame
Canvas (Dynamic)
  ├── ScoreText
  └── TimerText
```

캔버스를 정적/동적으로 분리하는 것만으로 UI 비용이 절반 이하로 떨어지는 경우가 흔하다.

---

## 4. 셰이더와 픽셀 비용

### 모바일은 픽셀 페이트가 부족하다

화면 전체를 덮는 풀스크린 효과(블룸, 색수차, 모션 블러)는 모바일에서 비용이 폭발적이다. 1080p 화면 = 200만 픽셀, 후처리 효과 4개 = 800만 픽셀 처리. URP의 Renderer Feature로 추가하기 전에 정말 필요한지 다시 생각한다.

| 후처리 효과 | 모바일 비용 | 권장 |
|------------|------------|------|
| Bloom | 매우 높음 | Threshold 높이고 Iteration 줄이기 |
| Tonemapping | 낮음 | OK |
| Vignette | 매우 낮음 | OK |
| Motion Blur | 매우 높음 | 비권장 |
| Depth of Field | 매우 높음 | 비권장 |
| Color Grading (LUT) | 낮음 | OK |

### 셰이더 작성 시

- `half`를 기본으로 쓴다. `float`은 정밀도가 필요한 곳(월드 좌표, UV 계산)만.
- `discard` (clip)는 조심. 타일 기반 GPU(Mali, PowerVR, Adreno)에서 early-Z를 무력화시켜 픽셀 비용이 늘어난다. 컷아웃 트랜스페어런시를 알파 블렌드로 바꿀 수 있다면 그게 더 빠를 수 있다.
- 텍스처 샘플링 횟수를 세어본다. 한 픽셀당 4번 이상이면 의심.

### Shader Variant Stripping

URP는 키워드 조합으로 셰이더 베리언트를 자동 생성한다. Lightmap, ReflectionProbe, AdditionalLights 등을 안 쓰면 `Graphics Settings > Shader Stripping`에서 명시적으로 제외한다. 셰이더 워밍업 시간과 빌드 크기가 크게 줄어든다.

---

## 5. 스크립트와 GC

### 매 프레임 0바이트 알로케이션 목표

GC가 한 번 돌면 모바일에서 5~30ms 스파이크가 생긴다. 30fps 게임이라면 한 프레임이 33ms이므로, GC 한 번에 그대로 프레임 드랍이다.

대표적인 누수 패턴:

```csharp
// 매 프레임 새 배열 할당
void Update()
{
    var hits = Physics.OverlapSphere(transform.position, 5f); // 매번 GC
    foreach (var h in hits) { /* ... */ }
}
```

```csharp
// 비할당 버전
private readonly Collider[] _buffer = new Collider[16];

void Update()
{
    int n = Physics.OverlapSphereNonAlloc(transform.position, 5f, _buffer);
    for (int i = 0; i < n; i++) { /* ... */ }
}
```

다른 흔한 GC 발생 지점:

- `string` 연결 (`"Score: " + score`) → `StringBuilder` 또는 `ZString` 사용
- `foreach` over `List<T>` → 박싱 없음, OK. `IEnumerable<T>`는 박싱 발생
- LINQ → 모바일 핫 패스에서 금지
- `GetComponent<T>()` 매 프레임 호출 → 캐시
- 람다에서 외부 변수 캡처 → 클로저 알로케이션

### Update 호출 자체가 비싸다

Unity의 Update는 C++ → C# 호출이라 호출당 오버헤드가 있다. 1000개 오브젝트가 각자 Update를 갖는 것보다, Manager 하나가 1000개를 순회하는 게 훨씬 빠르다.

```csharp
public class EnemyManager : MonoBehaviour
{
    private readonly List<Enemy> _enemies = new();
    public void Register(Enemy e) => _enemies.Add(e);

    void Update()
    {
        float dt = Time.deltaTime;
        for (int i = 0; i < _enemies.Count; i++)
            _enemies[i].Tick(dt);
    }
}
```

수백 개 단위에서는 차이가 작지만, 수천 개가 되면 프레임 단위로 차이가 난다.

---

## 6. 물리, 사운드, 그리고 플랫폼별 함정

### Physics

- `Fixed Timestep`: 기본값 0.02(50Hz)는 모바일에 과하다. 0.0333(30Hz)로 낮추면 물리 비용이 40% 줄어든다.
- `Layer Collision Matrix`에서 불필요한 충돌 조합을 끈다. 적과 적이 충돌할 필요가 없다면 같은 레이어로 묶고 자기 충돌을 끈다.
- MeshCollider는 절대 Convex 없이 쓰지 말 것. Convex 체크 + 정점 50개 이하가 모바일 한계.

### Audio

- 짧은 효과음(0.5초 이하): `Decompress on Load` + PCM 또는 ADPCM
- 긴 BGM: `Streaming` + Vorbis
- iOS는 `Override for iOS`에서 AAC가 ADPCM보다 유리할 때가 많다.
- 동시 재생 채널 수(Project Settings > Audio > Max Real Voices)를 모바일에서는 16~24로 줄인다.

### Android 특수 함정

- **Vulkan과 단말기 호환성**: Vulkan을 1순위로 두면 일부 구형 Adreno에서 셰이더 컴파일 충돌이 난다. Player Settings에서 OpenGLES3을 폴백으로 반드시 둘 것.
- **Adaptive Performance**: Samsung 단말에서 thermal throttling을 미리 감지할 수 있다. Package Manager에서 Adaptive Performance Samsung Provider를 추가하면 발열 단계에 따라 해상도/프레임을 자동 낮출 수 있다.
- **Refresh Rate**: 120Hz 단말에서 `Application.targetFrameRate = 60`을 명시하지 않으면 GPU가 120fps를 시도하다 발열 폭발한다.

### iOS 특수 함정

- **Background Audio**: `Player Settings > iOS > Behavior in Background`를 잘못 설정하면 앱 심사에서 거절된다.
- **Memory Warning**: iOS는 메모리 부족 시 OS가 그냥 앱을 죽인다. `Application.lowMemory` 콜백을 받아 텍스처 캐시를 비우는 로직이 필요하다.

```csharp
void Awake()
{
    Application.lowMemory += OnLowMemory;
    Application.targetFrameRate = 60;
}

void OnLowMemory()
{
    Resources.UnloadUnusedAssets();
    System.GC.Collect();
}
```

- **PostProcessing 정밀도**: iOS Metal은 half가 PC와 다르게 동작하는 경우가 있다. 색이 뭉개진다면 후처리 셰이더를 float로 바꿔본다.

---

## 7. 프로파일링이 먼저다

위 항목을 다 적용하기 전에 한 가지가 먼저다. **실제 디바이스에서 프로파일러를 연결한다.**

- `Build Settings > Development Build` + `Autoconnect Profiler` 체크
- USB 연결(Android: adb, iOS: Xcode)
- Window > Analysis > Profiler

확인할 지표:

| 지표 | 정상 범위 | 의심 신호 |
|------|----------|----------|
| CPU Main Thread | < 16ms (60fps) | 16ms 초과 시 어느 모듈인지 분석 |
| GC Alloc / frame | 0 B | KB 단위 보이면 누수 |
| SetPass Calls | < 50 | 100 넘으면 셰이더/머티리얼 분리 검토 |
| Tris | < 100k | 200k 넘으면 LOD 검토 |

Memory Profiler 패키지를 깔면 텍스처/메시/오디오 점유 상위 N개를 볼 수 있다. 이게 가장 빠른 메모리 절약 루트다.

### Frame Debugger와 RenderDoc

Frame Debugger로 한 프레임의 드로우콜을 순서대로 볼 수 있다. "왜 배칭이 안 되지?" 싶을 때 가장 먼저 열어볼 도구다. 더 깊이 보려면 Android는 RenderDoc, iOS는 Xcode GPU Capture를 쓴다.

---

## 우선순위 요약

같은 시간을 쓴다면 효과가 큰 순서대로:

1. **빌드 설정 점검** (10분, 효과 큼) - IL2CPP, ARM64, Vulkan/Metal
2. **텍스처 압축과 Max Size** (1시간, 효과 가장 큼) - 메모리 절반
3. **UI 캔버스 분리** (1시간, 효과 큼) - CPU 비용 절반
4. **GC 누수 제거** (며칠, 효과 큼) - 프레임 스파이크 제거
5. **셰이더와 후처리 다이어트** (반나절) - GPU 부하 감소
6. **Physics Timestep 조정** (5분) - CPU 절감
7. **Adaptive Performance 도입** (반나절, Android만) - 발열 방어

가장 조심해야 할 것은 "프로파일링 없이 최적화부터 시작하는 것"이다. 위 항목들도 측정 없이 적용하면 헛수고가 되거나 멀쩡한 코드를 망가뜨릴 수 있다. 디바이스 프로파일러로 병목을 찾고, 가장 큰 한 가지부터 잡고, 다시 측정하는 루프를 반복하는 게 정석이다.

모바일 최적화의 진짜 어려움은 기술이 아니라 우선순위 판단이다. 1년 차 프로젝트가 출시 직전에 30fps에서 멈추는 이유는 대부분 첫 6개월 동안 이 체크리스트의 1~3번을 미뤄둔 결과다. 처음부터 빌드 설정과 텍스처 정책만 잡아두면, 이후 콘텐츠가 늘어나도 프레임은 잘 안 무너진다.

*Vulkan/Metal로 그래픽 API를 정리하고, ASTC로 텍스처를 압축하고, UI 캔버스를 분리하고, GC 알로케이션을 0으로 만든다 -- 모바일 Unity 최적화의 80%는 이 네 줄에 들어 있다.*
