---
title: "Flutter와 Unity를 연동하는 법 — flutter_unity_widget 실전 가이드"
description: "AR 카메라 기능을 Flutter 앱에 붙이기 위해 Unity를 임베딩한 경험을 정리했습니다. 실제 프로젝트에서 마주친 문제들과 해결법을 공유합니다."
date: 2024-05-10
tags: [Flutter, Unity, Android, iOS]
---

회사에서 쇼트폼 영상 앱 **툭**을 개발하면서 AR 카메라 기능을 Unity로 구현하고 Flutter 앱 안에 임베딩해야 했습니다. `flutter_unity_widget` 패키지를 사용했는데, 문서가 친절하지 않아서 꽤 고생했습니다. 이 글은 그 경험을 정리한 것입니다.

## 왜 Unity인가?

Flutter에도 AR 관련 패키지(`ar_flutter_plugin` 등)가 있지만, 실시간 영상 처리와 커스텀 셰이더가 필요한 수준의 AR 효과는 Unity의 생태계가 훨씬 풍부합니다. 특히 **ARFoundation**과 **VFX Graph**를 활용하면 모바일에서도 꽤 괜찮은 AR 렌더링이 가능합니다.

## 전체 구조

```
Flutter App
└── UnityWidget (flutter_unity_widget)
    └── Unity Player (AR 카메라, 렌더링)
        ↕ MessageChannel (JSON)
Flutter ←→ Unity 양방향 통신
```

Flutter가 셸 역할을 하고, Unity가 카메라 뷰를 렌더링합니다. UI는 Flutter가 Unity 뷰 위에 오버레이로 그립니다.

## 1. Unity 프로젝트 설정

### Export Settings

Unity에서 Android/iOS 각각 Export용 설정이 필요합니다.

**Android:**
- `Build Settings → Export Project` 체크
- `Player Settings → Scripting Backend` → **IL2CPP**
- Target Architecture: **ARM64** (현대 기기 대부분)

**iOS:**
- `Build Settings → Run Xcode Project` 대신 Export
- `Player Settings → Target SDK` → Device SDK

### flutter_unity_widget 전용 수정

Unity 프로젝트에서 `flutter_unity_widget`이 요구하는 스크립트를 추가해야 합니다.

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

Android의 경우 `android/app/build.gradle`에 Unity 빌드 경로를 추가해야 합니다.

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

`onUnitySceneLoaded` 콜백을 사용해야 합니다. `onUnityCreated`는 Unity가 생성됐다는 것이지 씬이 로드됐다는 의미가 아닙니다.

### 문제 2: iOS 빌드 시 심볼 충돌

Flutter와 Unity 둘 다 OpenGL/Metal 관련 심볼을 가지고 있어서 충돌이 납니다.

`Podfile`에 아래를 추가했습니다:

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

Unity Player 자체가 상당한 메모리를 잡아먹습니다. 카메라 화면을 쓰지 않을 때는 Unity를 pause 상태로 만드는 것이 중요합니다.

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

공식 문서보다 GitHub Issues가 더 도움이 됐습니다. 같은 문제로 헤매는 분이 있다면 [flutter_unity_widget repo의 Issues](https://github.com/juicycleff/flutter-unity-view-widget/issues)를 먼저 검색해보길 권합니다.
