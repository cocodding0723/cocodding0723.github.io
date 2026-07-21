---
title: "Flutter Unity 연동하는 법 — flutter_unity_widget로 AR 임베딩 실전 가이드"
description: "Flutter 앱에 Unity를 임베딩해 AR 카메라를 붙이는 법. flutter_unity_widget 설정, Android/iOS 빌드, 실제 프로젝트에서 마주친 문제와 해결법까지 단계별로 정리한다."
date: 2024-05-10
categories: [Dev]
tags: [Flutter, Unity, Android, iOS]
---

회사에서 쇼트폼 영상 앱 **툭**을 개발하면서 AR 카메라 기능을 Unity로 구현하고 Flutter 앱 안에 임베딩해야 했다. `flutter_unity_widget` 패키지를 사용했는데 문서만으로는 전체 빌드 구조를 파악하기 어려웠다. 이 글은 실제로 연결하며 막혔던 지점을 정리한 기록이다.

## 왜 Unity인가?

Flutter에도 AR 관련 패키지(`ar_flutter_plugin` 등)가 있지만, 실시간 영상 처리와 커스텀 셰이더가 필요한 수준의 AR 효과는 Unity 생태계가 더 풍부하다. 특히 **ARFoundation**과 **VFX Graph**를 활용하면 모바일에서도 복잡한 AR 렌더링을 구성할 수 있다.

## 전체 구조

```text
Flutter App
└── UnityWidget (flutter_unity_widget)
    └── Unity Player (AR 카메라, 렌더링)
        ↕ MessageChannel (JSON)
Flutter ←→ Unity 양방향 통신
```

Flutter가 앱의 셸 역할을 하고 Unity가 카메라 뷰를 렌더링한다. UI는 Flutter가 Unity 뷰 위에 오버레이로 그린다.

## 1. Unity 프로젝트 설정

### Export Settings

Unity에서 Android/iOS 각각 Export용 설정이 필요하다.

**Android:**
- `Build Settings → Export Project` 체크
- `Player Settings → Scripting Backend` → **IL2CPP**
- Target Architecture: **ARM64** (현대 기기 대부분)

**iOS:**
- `Build Settings → Run Xcode Project` 대신 Export
- `Player Settings → Target SDK` → Device SDK

### flutter_unity_widget 전용 수정

Unity 프로젝트에서 `flutter_unity_widget`이 요구하는 스크립트를 추가해야 한다.

```csharp
// Assets/FlutterUnityIntegration/UnityMessageManager.cs
// 패키지 README의 스크립트를 그대로 복붙
```

이 스크립트 없이는 Flutter ↔ Unity 메시지 통신이 작동하지 않습니다.

## 2. Flutter 프로젝트 설정

```yaml
# pubspec.yaml
dependencies:
  flutter_unity_widget: ^2022.2.1
```

Android에서는 `android/app/build.gradle`에 Unity 빌드 경로를 추가해야 한다.

```groovy
// android/app/build.gradle
android {
    // ...
    sourceSets {
        main {
            jniLibs.srcDirs += ['path/to/unity/exported/libs']
        }
    }
}
```

## 3. 양방향 통신 구현

### Flutter → Unity 메시지 전송

```dart
// Flutter에서 Unity로 필터 변경 명령 전송
_unityWidgetController.postMessage(
  'ARCamera',          // Unity 게임오브젝트 이름
  'SetFilter',         // 메서드 이름
  jsonEncode({'filterId': 'vintage', 'intensity': 0.8}),
);
```

### Unity → Flutter 이벤트 수신

```csharp
// Unity C# 스크립트
void OnPhotoCaptured(byte[] imageData) {
    string base64 = Convert.ToBase64String(imageData);
    UnityMessageManager.Instance.SendMessageToFlutter(
        JsonUtility.ToJson(new CaptureResult { image = base64 })
    );
}
```

```dart
// Flutter에서 수신
UnityWidget(
  onUnityMessage: (message) {
    final data = jsonDecode(message);
    if (data['type'] == 'capture') {
      _handleCapture(data['image']);
    }
  },
  // ...
)
```

## 4. 실제로 마주친 문제들

### 문제 1: Unity 뷰가 검게 나올 때

첫 로드 시 Unity가 초기화되기 전에 Flutter가 렌더링을 시도하면 검은 화면이 나옵니다.

```dart
UnityWidget(
  onUnityCreated: (controller) {
    _unityWidgetController = controller;
    // 여기서 초기화 메시지 전송
  },
  onUnitySceneLoaded: (info) {
    // Scene 로드 완료 후 카메라 시작
    _startARCamera();
  },
)
```

`onUnitySceneLoaded` 콜백을 사용해야 한다. `onUnityCreated`는 Unity가 생성됐다는 뜻이지 씬 로드까지 끝났다는 의미는 아니다.

### 문제 2: iOS 빌드 시 심볼 충돌

Flutter와 Unity 둘 다 OpenGL/Metal 관련 심볼을 가지고 있어서 충돌이 납니다.

`Podfile`에는 아래 설정을 추가했다.

```ruby
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['ENABLE_BITCODE'] = 'NO'
    end
  end
end
```

### 문제 3: 메모리 사용량

Unity Player 자체가 상당한 메모리를 사용한다. 카메라 화면을 쓰지 않을 때는 Unity를 pause 상태로 만드는 것이 중요하다.

```dart
// 백그라운드 진입 시
AppLifecycleState.paused => _unityWidgetController.pause()
AppLifecycleState.resumed => _unityWidgetController.resume()
```

## 정리

| 항목 | 주의사항 |
|------|----------|
| Unity 빌드 | IL2CPP + ARM64 필수 |
| 초기화 타이밍 | `onUnitySceneLoaded` 이후 메시지 전송 |
| iOS 빌드 | Bitcode 비활성화 |
| 메모리 관리 | 백그라운드 시 pause() 필수 |

실제 통합 과정에서는 공식 문서보다 [flutter_unity_widget 저장소의 Issues](https://github.com/juicycleff/flutter-unity-view-widget/issues)가 더 도움이 됐다. 같은 오류를 만났다면 패키지 버전과 플랫폼을 함께 검색하는 편이 빠르다.

*Flutter는 앱과 UI를, Unity는 AR 렌더링을 맡기고 두 런타임의 생성·씬 로드·메시지 시점을 분리해서 다뤄야 한다.*
