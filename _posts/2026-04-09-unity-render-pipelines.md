---
title: "Unity의 그래픽 엔진 톺아보기 - BRP, URP, HDRP 그리고 SRP"
description: "Unity의 렌더 파이프라인 3형제(Built-in, URP, HDRP)와 그 기반인 SRP가 어떻게 동작하는지, 어떤 프로젝트에 어떤 파이프라인을 골라야 하는지 정리한다."
date: 2026-04-09
categories: [Dev]
tags: [Unity]
---

## "Unity의 그래픽 엔진"이라는 말

Unity에 "그래픽 엔진"이라는 이름의 모듈은 없다. 정확히는 **렌더 파이프라인(Render Pipeline)** 이라고 부른다. 화면에 삼각형 하나가 찍히기까지의 과정 — 컬링, 섀도우 생성, 불투명/투명 드로우콜, 포스트프로세스, 최종 블릿 — 을 누가 어떤 순서로 실행할지 정의한 모듈이다.

2018년까지는 이 파이프라인이 엔진 깊숙한 곳에 C++로 박혀 있어 건드릴 수 없었다. 그걸 C# 레벨로 끌어올려서 개발자가 직접 고칠 수 있게 만든 게 **SRP(Scriptable Render Pipeline)** 이고, Unity가 SRP 위에서 직접 만든 기성품 두 개가 **URP**와 **HDRP**다. 그 밑바닥에는 아직도 **Built-in Render Pipeline(BRP)** 이 레거시로 남아 있다.

이 글은 네 가지를 한 번에 정리한다. 무엇이 어떻게 다르고, 왜 그렇게 쪼개졌는지, 그리고 2026년 시점에서 신규 프로젝트는 뭘 골라야 하는지.

---

## 렌더 파이프라인이 하는 일

엔진이 프레임 하나를 그릴 때 내부에서는 대략 이런 일이 일어난다.

1. **Culling** — 카메라 프러스텀 밖의 오브젝트를 버린다.
2. **Shadow Pass** — 라이트별로 섀도우맵을 렌더링한다.
3. **Opaque Pass** — 불투명 메시를 깊이 순으로(또는 머티리얼 순으로) 그린다.
4. **Skybox / Transparent Pass** — 하늘과 알파 블렌딩 오브젝트를 그린다.
5. **Post-processing** — 블룸, 톤매핑, DOF 등을 이미지 전체에 적용한다.
6. **Final Blit** — 백버퍼로 복사해 화면에 출력한다.

이 순서와 각 패스의 세부 동작을 결정하는 게 렌더 파이프라인이다. 단계 하나의 구현만 바꿔도 전체 비주얼이 달라진다. 예를 들어 그림자 알고리즘을 PCF에서 PCSS로 바꾸거나, Opaque Pass를 Forward에서 Deferred로 바꾸는 식이다.

---

## Built-in Render Pipeline (BRP)

Unity가 처음부터 쓰던 레거시 파이프라인이다. C++로 고정되어 있고, 설정은 Graphics Settings에서 일부만 건드릴 수 있다.

### 특징

- **Forward / Deferred 둘 다 지원**. 카메라마다 고를 수 있다.
- 셰이더는 **CG/HLSL surface shader** 중심. `Shader "Standard"`가 대표 머티리얼이다.
- 포스트프로세스는 별도 패키지인 **Post Processing Stack v2(PPv2)** 로 들어간다.
- 거의 모든 구형 에셋스토어 리소스가 이 파이프라인을 가정하고 만들어졌다.

### 장단점

장점은 **에셋 호환성**이다. 2018 이전부터 쌓인 스탠더드 셰이더 기반 에셋은 BRP에서 별도 변환 없이 바로 돈다. 단점은 **확장성이 없다**는 것이다. 렌더 순서를 바꾸고 싶으면 `CommandBuffer`를 카메라 이벤트에 달아 끼워 넣는 게 한계였고, 그나마도 하드코딩된 내부 패스 사이에 끼워 넣는 거라 순서가 꼬이기 쉬웠다.

2026년 현시점에서 BRP는 **신규 프로젝트에 권장되지 않는다**. Unity도 장기적으로 URP/HDRP로 무게중심을 완전히 옮겼고, 신규 기능(예: GPU Resident Drawer, Render Graph 디버거)은 URP/HDRP에만 들어간다. 단, 이미 돌아가는 구형 프로젝트를 URP로 마이그레이션하는 건 셰이더 재작성 비용이 크니 판단이 필요하다.

---

## SRP - Scriptable Render Pipeline

SRP는 파이프라인 자체가 아니라 **파이프라인을 짜기 위한 프레임워크**다. Unity 2018에서 도입됐고, 핵심 아이디어는 "C++로 박혀 있던 렌더 루프를 C#으로 빼내자"는 것이다.

### 구조

가장 단순화한 SRP의 심장은 이 두 줄이다.

```csharp
public class MyRenderPipeline : RenderPipeline
{
    protected override void Render(ScriptableRenderContext context, Camera[] cameras)
    {
        foreach (var camera in cameras)
        {
            // 1. 컬링
            camera.TryGetCullingParameters(out var cullingParams);
            var cullingResults = context.Cull(ref cullingParams);

            // 2. 카메라 속성 설정
            context.SetupCameraProperties(camera);

            // 3. 드로우콜 빌드
            var sortingSettings = new SortingSettings(camera);
            var drawingSettings = new DrawingSettings(
                new ShaderTagId("SRPDefaultUnlit"), sortingSettings);
            var filteringSettings = new FilteringSettings(RenderQueueRange.opaque);

            context.DrawRenderers(cullingResults, ref drawingSettings, ref filteringSettings);

            // 4. 스카이박스 & 커밋
            context.DrawSkybox(camera);
            context.Submit();
        }
    }
}
```

`RenderPipeline`을 상속해서 `Render()`를 구현하는 게 전부다. `ScriptableRenderContext`가 C++ 렌더러와의 브릿지 역할을 하고, 실제 GPU 커맨드는 `context.Submit()`이 호출될 때 한꺼번에 밀려 들어간다.

이 구조의 의미는 크다. 렌더 순서, 셰이더 태그, 카메라 루프, 섀도우 전략을 전부 프로젝트별로 커스터마이징할 수 있다는 뜻이다. URP와 HDRP는 Unity가 이 프레임워크 위에 만들어 올린 두 개의 구체적인 구현물이다.

### Render Graph

2023부터 SRP에는 **Render Graph**라는 상위 계층이 도입됐다. 기존에는 개발자가 RenderTexture를 직접 만들고 해제했는데, Render Graph에서는 "이 패스는 이 텍스처를 읽고, 저 텍스처에 쓴다"만 선언하면 프레임워크가 의존성을 분석해서 메모리 재사용, 패스 병합, 드로우콜 순서 최적화를 자동으로 한다. 모바일 타일드 GPU에서 메모리 대역폭을 줄이는 데 특히 효과적이다.

---

## URP - Universal Render Pipeline

SRP 위에 Unity가 "가볍고 범용적인" 버전으로 만든 파이프라인. 2019년 LWRP(Lightweight RP)에서 이름이 바뀌며 정식 출시됐다.

### 타겟

- 모바일 / 콘솔 / WebGL / Switch 등 **저~중급 하드웨어**
- 단일 패스 Forward 렌더링 중심
- 가벼운 포스트프로세스 (URP 내장)

### 핵심 개념

URP에서 기억해야 할 단어는 세 개다.

**1) Renderer Feature** — 파이프라인에 새 패스를 끼워 넣는 방법이다. 예를 들어 "특정 레이어만 아웃라인을 그리는 패스"를 추가하고 싶다면 `ScriptableRendererFeature`를 상속받아 구현하고, Forward Renderer 에셋의 리스트에 추가한다.

```csharp
public class OutlineFeature : ScriptableRendererFeature
{
    class OutlinePass : ScriptableRenderPass
    {
        public override void Execute(ScriptableRenderContext ctx, ref RenderingData data)
        {
            // 아웃라인 머티리얼로 풀스크린 블릿
        }
    }

    OutlinePass _pass;

    public override void Create() { _pass = new OutlinePass(); }

    public override void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData data)
    {
        renderer.EnqueuePass(_pass);
    }
}
```

BRP의 `CommandBuffer` 끼워 넣기보다 훨씬 깔끔하다. 순서 제어도 명시적이다.

**2) Volume** — 포스트프로세스와 환경광을 **공간 기반**으로 섞는다. 카메라가 볼륨에 진입하면 블룸, 톤매핑, 비네트 같은 효과가 블렌딩된다. PPv2의 후속이다.

**3) Shader Graph** — URP의 머티리얼은 대부분 Shader Graph로 만든다. 노드 기반이고 URP의 표준 라이팅 모델(URP Lit, Unlit)에 직접 꽂힌다. BRP의 surface shader를 복사해 오면 동작하지 않는다.

### 언제 URP를 고르는가

- 모바일 게임 전부
- 카툰/미드폴리 스타일 PC·콘솔
- WebGL 빌드가 필요한 프로젝트
- 2D 게임 (URP 2D Renderer가 전용으로 있다)

사실상 **신규 프로젝트의 90%는 URP로 시작하는 게 정답**이다. 필요하면 Renderer Feature로 확장하면 된다.

---

## HDRP - High Definition Render Pipeline

URP의 반대편. **고사양 하드웨어**에서 영화급 비주얼을 뽑기 위한 파이프라인이다.

### 타겟

- PC(DX12/Vulkan), PS5/Xbox Series
- 물리 기반 라이팅(단위가 실제 lux, EV)
- 볼류메트릭 포그, 레이트레이싱, SSGI, 스크린스페이스 리플렉션 등 고급 효과 기본 내장

### 핵심 차이

HDRP는 **Deferred 기반**이 기본이다. 조명이 수십 개 있어도 비용이 선형에 가까워서 현실적인 실내/야간 씬에 유리하다. 대신 G-Buffer 용량이 커서 모바일엔 맞지 않는다.

그리고 HDRP의 물리 단위는 진짜 물리 단위다. 라이트 강도를 `1500 lumen`이라고 적으면 그게 그대로 노출과 톤매핑에 들어간다. 카메라도 ISO, 조리개, 셔터스피드로 조절한다. 이 때문에 URP에서 잘 보이던 라이팅 세팅을 그대로 가져오면 전부 새로 잡아야 한다.

```csharp
// HDRP에서만 동작 - 레이트레이싱 리플렉션 활성화
var rtSettings = volumeProfile.Add<ScreenSpaceReflection>();
rtSettings.rayTracing.overrideState = true;
rtSettings.rayTracing.value = true;
```

### 언제 HDRP를 고르는가

- AAA 또는 고품질 시네마틱을 목표로 하는 PC/콘솔
- 아키비즈(건축 시각화), 자동차 렌더링 같은 산업용
- 레이트레이싱을 써야 하는 경우

모바일·WebGL·스위치는 HDRP가 사실상 **금기**다.

---

## 한 표로 비교

| 항목 | BRP | URP | HDRP |
|------|-----|-----|------|
| 기반 | C++ 레거시 | SRP | SRP |
| 라이팅 | Forward/Deferred | Forward+ 중심 | Deferred 중심 |
| 타겟 플랫폼 | 전 플랫폼 | 모바일~중급 PC | 고급 PC/콘솔 |
| 포스트프로세스 | PPv2 (별도) | 내장 Volume | 내장 Volume + 고급 |
| 셰이더 작성 | surface shader | Shader Graph | Shader Graph (HDRP Lit) |
| 물리 단위 | 없음 | 없음 | 있음 (lux, EV) |
| 레이트레이싱 | 미지원 | 미지원 | 지원 |
| 커스터마이징 | CommandBuffer | Renderer Feature | Custom Pass |
| 2026 권장도 | 레거시 유지용 | **신규 기본값** | 고급 비주얼 타겟 |

---

## 파이프라인 간 이사의 현실

"BRP로 만들다가 URP로 옮기면 되지 않나"는 질문이 자주 나온다. 답은 "가능은 한데 싸지 않다"이다.

가장 큰 비용은 **셰이더**다. BRP의 standard/surface shader는 URP의 Lit 셰이더와 호환되지 않는다. Unity가 제공하는 Render Pipeline Converter가 표준 머티리얼은 자동 변환해 주지만, 커스텀 셰이더는 전부 Shader Graph 또는 URP용 HLSL로 재작성해야 한다.

두 번째는 **포스트프로세스**다. PPv2 프로파일은 URP Volume으로 변환되지 않는다. 효과 목록을 보고 수동으로 다시 잡아야 한다.

세 번째는 **라이트 세팅**이다. 같은 Intensity 값이어도 파이프라인별로 밝기 해석이 달라서 전체 씬이 한 번 다시 라이팅되는 경우가 많다.

URP ↔ HDRP는 더 어렵다. Deferred G-Buffer 레이아웃이 다르고, HDRP는 실제 물리 단위를 쓰기 때문에 라이팅을 처음부터 다시 잡아야 한다. 사실상 **다시 만드는 수준**이라고 보면 된다.

결론은 하나. **프로젝트 초기에 파이프라인을 확정**하고 가야 한다. 나중 일이 되면 될수록 이사 비용은 지수로 는다.

---

## 2026년 시점의 선택 가이드

- 모바일·2D·저사양·WebGL·빠른 프로토타입 → **URP**
- PC/콘솔 단일 타겟, 고품질 비주얼, 레이트레이싱 → **HDRP**
- 이미 돌아가는 구프로젝트, 에셋스토어 리소스 의존 큰 프로젝트 → **BRP 유지** (단, 신기능은 포기)
- 렌더링 연구, 커스텀 파이프라인 필요 → **SRP 직접 구현**

URP가 기본값이라는 말의 뜻은 "특별한 이유가 없으면 URP"라는 뜻이다. "혹시 나중에 HDRP로 옮길 수도 있으니까 BRP로 시작한다"는 가장 나쁜 선택이다. 옮길 비용을 따지면 처음부터 URP로 시작하는 게 거의 항상 싸다.

---

## 마무리

렌더 파이프라인은 셰이더보다 한 층 위의 주제다. 셰이더가 "삼각형 하나를 어떻게 색칠할까"라면, 파이프라인은 "삼각형들을 어떤 순서로, 어떤 버퍼에, 어떤 카메라로 그릴까"를 정한다. 이 구조를 이해하지 못하면 Shader Graph로 만든 효과가 왜 URP에서는 되는데 BRP에서는 안 되는지, Renderer Feature를 어디에 달아야 특정 오브젝트 뒤에 아웃라인이 나오는지 같은 문제에서 계속 막힌다.

반대로 구조를 한 번 잡고 나면, 커스텀 효과를 집어넣거나 퍼포먼스를 깎는 작업이 훨씬 명시적으로 바뀐다. "어느 패스에서 비용이 나가는가", "어느 텍스처를 재사용할 수 있는가"를 프로파일러와 Render Graph Viewer로 볼 수 있게 되기 때문이다.

*Unity의 그래픽 엔진은 SRP라는 프레임워크 위에 URP(가벼움)와 HDRP(고품질) 두 기성품이 얹힌 구조이고, 신규 프로젝트는 거의 항상 URP로 시작하는 게 정답이다.*
