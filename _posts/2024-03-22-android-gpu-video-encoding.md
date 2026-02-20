---
title: "Android에서 GPU 기반 영상 인코딩 — MediaCodec + OpenGL ES"
description: "FFMPEG 소프트웨어 인코딩의 한계를 넘기 위해 MediaCodec과 OpenGL ES를 조합해 GPU 가속 인코딩을 구현한 경험을 정리합니다."
date: 2024-03-22
tags: [Android, Kotlin, OpenCV, FFMPEG]
---

쇼트폼 영상 편집 앱 **Mix**를 개발할 때 가장 큰 기술적 도전은 **영상 필터를 빠르게 인코딩**하는 것이었습니다. 처음에는 FFMPEG의 소프트웨어 인코더를 사용했는데, 30초 영상에 필터를 입히는 데 거의 1분이 걸렸습니다. GPU를 활용하면 이를 크게 줄일 수 있다는 걸 알고 `MediaCodec` + `OpenGL ES` 조합을 도입했습니다.

## 문제 정의

기존 파이프라인:

```
원본 영상 → FFMPEG 디코딩 → CPU 필터 처리 → FFMPEG 인코딩
```

- 30초 영상 + 빈티지 필터 → **약 58초** 소요
- CPU 사용률 100% 지속, 기기 발열 심함

목표: **실시간 수준(30초 영상 → 10초 이내)**

## 해결 방향: Surface 기반 인코딩

`MediaCodec`을 Surface 입력 모드로 쓰면 OpenGL ES로 렌더링한 프레임을 GPU 메모리에서 직접 인코더로 넘길 수 있습니다. CPU-GPU 메모리 복사가 없어집니다.

```
MediaExtractor → MediaCodec(디코더)
                      ↓ (SurfaceTexture)
              OpenGL ES (필터 셰이더)
                      ↓ (Surface)
              MediaCodec(인코더) → MP4
```

## 핵심 구현

### 1. 인코더 Surface 생성

```kotlin
val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)

val format = MediaFormat.createVideoFormat(
    MediaFormat.MIMETYPE_VIDEO_AVC,
    outputWidth,
    outputHeight
).apply {
    setInteger(MediaFormat.KEY_BIT_RATE, 4_000_000) // 4Mbps
    setInteger(MediaFormat.KEY_FRAME_RATE, 30)
    setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
    setInteger(MediaFormat.KEY_COLOR_FORMAT,
        MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface) // ← 핵심
}

encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
val encoderSurface: Surface = encoder.createInputSurface() // ← GPU Surface
encoder.start()
```

### 2. EGL Context 설정

OpenGL로 렌더링하려면 EGL 환경을 직접 구성해야 합니다.

```kotlin
class EglCore(private val encoderSurface: Surface) {
    private val eglDisplay: EGLDisplay
    private val eglContext: EGLContext
    private val eglSurface: EGLSurface

    init {
        eglDisplay = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
        EGL14.eglInitialize(eglDisplay, null, 0, null, 0)

        val attribs = intArrayOf(
            EGL14.EGL_RED_SIZE, 8,
            EGL14.EGL_GREEN_SIZE, 8,
            EGL14.EGL_BLUE_SIZE, 8,
            EGL14.EGL_ALPHA_SIZE, 8,
            EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
            EGL14.EGL_NONE
        )
        val configs = arrayOfNulls<EGLConfig>(1)
        EGL14.eglChooseConfig(eglDisplay, attribs, 0, configs, 0, 1, null, 0)

        val ctxAttribs = intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE)
        eglContext = EGL14.eglCreateContext(eglDisplay, configs[0], EGL14.EGL_NO_CONTEXT, ctxAttribs, 0)

        // ← 인코더 Surface를 EGL Surface로 래핑
        eglSurface = EGL14.eglCreateWindowSurface(eglDisplay, configs[0], encoderSurface, intArrayOf(EGL14.EGL_NONE), 0)
        EGL14.eglMakeCurrent(eglDisplay, eglSurface, eglSurface, eglContext)
    }

    fun swapBuffers() {
        EGL14.eglSwapBuffers(eglDisplay, eglSurface) // 프레임 완성 → 인코더로 전달
    }
}
```

### 3. 필터 셰이더 (GLSL)

빈티지 필터 예시:

```glsl
// fragment shader
precision mediump float;
uniform sampler2D uTexture;
varying vec2 vTexCoord;

void main() {
    vec4 color = texture2D(uTexture, vTexCoord);

    // 채도 감소
    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(color.rgb, vec3(gray), 0.4);

    // 따뜻한 색조
    color.r = min(color.r * 1.1, 1.0);
    color.b = max(color.b * 0.85, 0.0);

    // 비네팅
    vec2 uv = vTexCoord - 0.5;
    float vignette = 1.0 - dot(uv, uv) * 1.5;
    color.rgb *= max(vignette, 0.0);

    gl_FragColor = color;
}
```

### 4. 인코딩 루프

```kotlin
fun encode(extractor: MediaExtractor) {
    val decoder = setupDecoder(extractor)
    val bufferInfo = MediaCodec.BufferInfo()

    while (!isEOS) {
        // 디코더 입력 공급
        feedInputToDecoder(extractor, decoder)

        // 디코더 출력 → OpenGL → 인코더
        val outIdx = decoder.dequeueOutputBuffer(bufferInfo, 10_000)
        if (outIdx >= 0) {
            // SurfaceTexture.updateTexImage()로 프레임을 텍스처에 업로드
            surfaceTexture.updateTexImage()

            // OpenGL로 필터 적용해서 encoderSurface에 렌더링
            renderWithFilter()
            eglCore.swapBuffers() // ← 이 시점에 인코더가 프레임 받음

            // 타임스탬프 동기화 (중요!)
            EGLExt.eglPresentationTimeANDROID(
                eglDisplay, eglSurface,
                bufferInfo.presentationTimeUs * 1000L
            )

            decoder.releaseOutputBuffer(outIdx, true)
        }

        // 인코더 출력 수집 → MP4에 쓰기
        drainEncoder(muxer)
    }
}
```

## 결과

| 방법 | 30초 영상 처리 시간 | CPU 피크 |
|------|------|------|
| FFMPEG 소프트웨어 | 58초 | 100% |
| MediaCodec + OpenGL ES | **8초** | 35% |

7배 빠르고, 발열도 훨씬 줄었습니다.

## 주의할 점

**타임스탬프 처리**: `EGLExt.eglPresentationTimeANDROID`로 정확한 타임스탬프를 인코더에 전달하지 않으면 영상 재생 속도가 틀어집니다. microsecond를 nanosecond로 변환(`* 1000`)하는 것도 빠뜨리기 쉽습니다.

**SurfaceTexture 스레드**: `SurfaceTexture.updateTexImage()`는 반드시 EGL Context가 bind된 스레드에서 호출해야 합니다. 멀티스레딩하면 GL 오류가 납니다.

**기기 호환성**: `COLOR_FormatSurface`는 API 18 이상에서 지원하지만, 일부 구형 기기의 인코더 구현이 불안정합니다. 예외 처리와 FFMPEG 폴백을 같이 두는 게 안전합니다.
