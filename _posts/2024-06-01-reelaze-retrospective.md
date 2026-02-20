---
title: "Reelaze 출시 회고 — 쇼트폼 앱을 혼자 플레이스토어에 올리기까지"
description: "Flutter로 TikTok 유사 쇼트폼 영상 앱을 만들어 Google Play & App Store에 출시한 과정을 회고합니다. 혼자 개발부터 배포까지 겪었던 시행착오를 기록합니다."
date: 2024-06-01
categories: [Project]
tags: [Flutter, Firebase, CI/CD, Fastlane]
---

2023년 초, 회사에서 쇼트폼 영상 플랫폼 **Reelaze**를 Flutter로 개발해 Google Play와 App Store에 출시했습니다. 기획부터 배포까지 약 4개월. 이 글은 그 과정에서 겪었던 것들을 정리한 회고입니다.

## 프로젝트 개요

Reelaze는 TikTok·YouTube Shorts와 유사한 쇼트폼 영상 소셜 미디어입니다. Flutter 단일 코드베이스로 Android와 iOS를 동시 지원하고, Unity로 만든 영상 촬영 기능을 임베딩하는 구조였습니다.

**핵심 기능:**
- 세로형 영상 피드 (무한 스크롤)
- Unity AR 카메라 + 영상 촬영
- FFMPEG 기반 영상 편집 (트리밍, 필터)
- Firebase 기반 리얼타임 팔로우/좋아요/댓글
- Google Play + App Store 동시 배포

## 잘 됐던 것들

### Flutter의 단일 코드베이스

Android/iOS 분기 코드가 거의 없었습니다. Platform Channel을 사용한 부분은 Unity 연동과 카메라 권한 정도였고, 나머지 UI/로직은 완전히 공유했습니다. 유지보수 비용이 네이티브 개발 대비 확연히 낮았습니다.

### Firebase의 생산성

BaaS답게 빠른 초기 개발이 가능했습니다. Firestore + Storage + Auth 조합으로 백엔드 없이 MVP를 빠르게 만들었습니다.

```dart
// 피드 스트림 구독
Stream<List<VideoModel>> get feedStream => FirebaseFirestore.instance
  .collection('videos')
  .orderBy('createdAt', descending: true)
  .limit(20)
  .snapshots()
  .map((snap) => snap.docs.map(VideoModel.fromDoc).toList());
```

### Fastlane으로 배포 자동화

처음에는 수동으로 빌드·업로드했는데, 릴리즈마다 30분 이상이 걸렸습니다. Fastlane을 도입한 후:

```ruby
# Fastfile
lane :release_android do
  gradle(task: 'bundle', build_type: 'Release')
  upload_to_play_store(track: 'production')
end

lane :release_ios do
  build_app(scheme: 'Runner')
  upload_to_app_store
end
```

GitHub Actions와 연결해서 `main` 브랜치 머지 시 자동 배포가 되도록 했습니다. 배포 시간이 **30분 → 5분**으로 줄었습니다.

## 힘들었던 것들

### Unity-Flutter 연동의 복잡성

Unity를 Flutter 앱 안에 임베딩하는 것 자체는 `flutter_unity_widget` 덕분에 가능했지만, 빌드 시간이 크게 늘었습니다. Android 기준:

| 구분 | 빌드 시간 |
|------|------|
| Flutter만 | ~2분 |
| Flutter + Unity | ~12분 |

CI/CD에서 Unity 빌드 캐싱이 어렵고, 매번 전체 빌드가 필요해서 배포 주기가 늘어났습니다.

### App Store 심사

Android는 Google Play에 올리고 하루 만에 승인됐지만, App Store는 다른 얘기였습니다.

- **1차 리젝**: 개인정보 처리방침 링크 누락
- **2차 리젝**: 카메라 권한 사용 목적 설명 불충분
- **3차 리젝**: 신고 기능 없음 (UGC 앱 필수 요구사항)

신고 기능을 추가하고 나서야 통과됐습니다. iOS 심사는 여유 있게 2주 이상 잡는 게 맞는 것 같습니다.

### 영상 업로드 실패율

4G 환경에서 영상 업로드 실패율이 생각보다 높았습니다. 재시도 로직 없이 단순 `putFile()`만 하면 네트워크 불안정 시 사용자가 그냥 실패를 맞이하게 됩니다.

```dart
// 개선 전
await storage.ref(path).putFile(file);

// 개선 후: 재시도 + 진행률 표시
Future<void> uploadWithRetry(File file, String path, {int maxRetries = 3}) async {
  for (int attempt = 0; attempt < maxRetries; attempt++) {
    try {
      final task = storage.ref(path).putFile(file);
      task.snapshotEvents.listen((snap) {
        final progress = snap.bytesTransferred / snap.totalBytes;
        uploadProgress.value = progress;
      });
      await task;
      return;
    } catch (e) {
      if (attempt == maxRetries - 1) rethrow;
      await Future.delayed(Duration(seconds: 2 << attempt)); // 지수 백오프
    }
  }
}
```

## 배운 것들

1. **MVP는 진짜 최소한**으로. 처음부터 모든 기능을 넣으려 했다가 개발 기간이 두 배로 늘었습니다.
2. **App Store 심사 요구사항은 미리 숙지**. 특히 UGC 앱은 신고 기능, 개인정보 처리방침이 필수입니다.
3. **CI/CD는 초반부터 세팅**. 나중에 붙이면 기존 코드에 맞추는 게 더 힘듭니다.
4. **Firebase는 MVP에는 좋지만, 스케일 시 비용 주의**. Firestore 읽기 비용이 생각보다 빠르게 올라갑니다.

출시 후 실제 사용자가 생기고 피드백을 받는 경험은 굉장히 즐거웠습니다. 다음 프로젝트에서는 더 나은 아키텍처와 테스트 코드를 갖춰서 시작하고 싶다는 생각이 들었습니다.
