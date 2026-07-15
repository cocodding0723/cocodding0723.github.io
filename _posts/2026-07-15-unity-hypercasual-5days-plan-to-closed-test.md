---
title: "Unity 하이퍼캐주얼 게임 개발기 A to Z — 5일 만에 기획부터 구글 플레이 비공개 테스트까지"
description: "Unity 6 + VContainer + R3로 ZigZag 러너를 5일 만에 완성한 기록. 기획과 피벗, SOLID 아키텍처, 스킨 시스템, LevelPlay 광고·IAP 연동, UGS Analytics·리더보드, 경제 밸런싱, 비공개 테스트 배포까지 전 과정을 정리한다."
date: 2026-07-15
categories: [Project]
tags: [Unity, AI]
image: /assets/images/zigzag-jump/feature.png
---

7월 10일 아침에 브레인스토밍으로 장르를 정했고, 7월 14일 밤에 서명된 `.aab`를 뽑았다. 그 빌드는 지금 Google Play 비공개 테스트 트랙에 올라가 있다. 커밋 166개(자동 저장 제외 141개), 게임 스크립트 93개, 유닛 테스트 223개가 5일 동안 쌓였다. 이 글은 그 5일의 기록이다 — 기획, 하루 만의 피벗, 아키텍처 설계, 게임 디테일, UGS 연동, 수익화, 그리고 스토어 업로드까지 전부.

![ZigZag & Jump 피처 그래픽](/assets/images/zigzag-jump/feature.png)

게임 이름은 **ZigZag & Jump**. 자동으로 달리는 공을 코너에서 꺾고, 구멍과 장애물은 점프로 넘어 최대 거리에 도전하는 세로 화면 엔드리스 러너다. 규칙은 딱 두 개 — 턴, 그리고 점프.

장르는 단순하지만 목표는 단순하지 않았다. 상용 모바일 게임 팀이 클라이언트 개발자에게 기대하는 것들이 있다 — 계층 아키텍처와 테스트, 광고·IAP 수익화 SDK 연동, 카탈로그 기반 코스메틱 시스템, 데이터로 검증하는 경제 밸런싱, 개인정보 컴플라이언스. 이것들을 작은 게임 하나에 전부 눌러 담는 것. 그래서 이 글도 그 순서대로 깊게 들어간다.

---

## Day 0. 기획 — 왜 하필 이 게임인가

이 프로젝트의 목표는 처음부터 명확했다. **수익이 아니라 출시 풀사이클을 한 바퀴 도는 것.** 메인 포트폴리오와 별개의 워밍업 프로젝트로, 스토어 등록·광고·분석·IAP·심사 대응까지 혼자서 전 과정을 경험하는 게 목적이었다.

그 목표에서 역산하면 장르 선정 기준이 나온다.

- **코드가 최소인 장르** — 콘텐츠 제작에 시간을 뺏기면 사이클을 못 돈다. ZigZag류 원버튼 엔드리스는 코어 루프가 단순하다.
- **광고 소재 텐션이 강한 장르** — "아 방금 죽을 뻔" 하는 순간이 곧 광고 영상이 된다.
- **리소스 0 지향** — 디자이너 없는 1인 개발이라 그래픽 이미지 파일 없이 3D 프리미티브 + 절차 메시 + 셰이더로만 만든다. 2D 스프라이트보다 3D 내장 프리미티브가 이 조건에 유리해서 3D를 골랐다.

테크 스택은 다른 프로젝트([5일 만에 만든 카타나 제로 스타일 액션 게임](/blog/2026/05/29/katana-zero-inspired-action-game-5days/))에서 검증된 조합을 그대로 미러했다: **Unity 6 (6000.4.5f1) + URP 17.4 + VContainer(DI) + R3(reactive) + DOTween Pro + FEEL**.

## Day 1. 하루 만의 피벗 — 리듬을 버리다

원래 컨셉은 "리듬 ZigZag"였다. 비트에 싱크된 코너를 박자에 맞춰 꺾는 게임. `BeatClock`(dspTime 기반 비트 클럭), `RhythmJudge`(Perfect/Good/Miss 판정)까지 실제로 구현하고 테스트 61개를 통과시킨 상태였다.

그리고 첫날이 끝나기 전에 전부 버렸다. 플레이해 보니 리듬 타이밍이 캐주얼 접근성을 해쳤고, 곡 에셋 의존과 오디오 레이턴시 캘리브레이션이라는 무거운 짐이 딸려 왔다. **클래식 ZigZag 엔드리스 + 점프**로 피벗하고 리듬 코어를 걷어냈다.

피벗 비용이 하루 치로 끝난 이유는 구조에 있었다. 리듬 판정 로직은 순수 클래스로 분리돼 있었고, 타일 풀·스포너·DI·테스트 인프라는 장르와 무관했다. 버린 것은 판정부뿐이고 기반은 전부 계승됐다. **"버릴 수 있게 만들어야 빨리 버린다"** — 이 프로젝트에서 얻은 첫 교훈이다.

---

## 아키텍처 — VContainer + R3 + SOLID

전체 구조는 4개 층으로 나뉜다. 씬 View(MonoBehaviour), 서비스 레이어, 순수 로직, 외부 SDK. 그리고 이 전부를 `GameLifetimeScope`라는 단 하나의 컴포지션 루트가 배선한다.

![ZigZag & Jump 시스템 아키텍처 구조도 — GameLifetimeScope 컴포지션 루트가 씬 View·서비스 레이어·순수 로직·외부 SDK 4개 층을 배선](/assets/images/zigzag-jump/architecture.png)

### 컴포지션 루트 하나로 전부 배선한다

VContainer의 `LifetimeScope`를 상속한 `GameLifetimeScope`가 씬에 붙어 있고, `Configure()` 한 곳에서 모든 의존성이 등록된다. 실제 코드 발췌:

```csharp
protected override void Configure(IContainerBuilder builder)
{
    // 상태 소스 (R3)
    builder.Register<IGameState, GameState>(Lifetime.Singleton);

    // 서비스는 엔트리포인트(IStartable/ITickable)로 — Update 폴링 대신 명시 배선
    builder.RegisterEntryPoint<ScoreService>().As<IScoreService>();
    builder.RegisterEntryPoint<BallController>().As<IBall>().As<IReviveCountdown>().AsSelf();

    // 씬에 미리 배치된 View는 RegisterComponent로 주입
    if (_hud != null) builder.RegisterComponent(_hud);
    if (_settingsView != null) builder.RegisterComponent(_settingsView);

    // 설정 객체는 불변 인스턴스로
    builder.RegisterInstance(new PathSettings());
    ...
}
```

포인트가 몇 가지 있다.

- **런타임 생성 금지** — GameObject/Material/Mesh를 코드에서 `new` 하지 않는다. 전부 프리팹·머티리얼·메시 에셋을 참조하고, 씬 프리배치를 우선한다. 덕분에 씬을 열면 보이는 것이 곧 실행 결과다.
- **등록 순서가 곧 계약** — `AnalyticsTracker`는 데이터 소스(Score/Crystal/Revive)보다 뒤에 등록해서 같은 상태 전이에서 갱신된 값을 읽는다. `LeaderboardSubmitter`도 `ScoreService` 뒤에 등록해 `SaveBest` 이후의 베스트를 제출한다. 주석으로 이유를 남겨 두면 이 순서가 우연이 아니라 설계임이 드러난다.
- **MonoBehaviour는 얇게** — View는 버튼 리스너와 트윈만 갖고, 로직은 전부 주입받은 서비스에 위임한다.

### 상태는 R3 스트림 하나로 흐른다

게임 전체 상태는 `IGameState`가 가진 R3 `ReactiveProperty<GamePhase>` 하나다. Boot → Title → Playing → Dead → GameOver의 전이를 모든 서비스와 뷰가 구독한다.

![GamePhase 상태 흐름도 — Boot·Title·Playing·Dead·GameOver 전이와 부활 루프](/assets/images/zigzag-jump/gamephase.png)

이 구조의 장점은 **기능 추가가 구독 추가로 끝난다**는 것이다. 사망 햅틱을 넣을 때는 `HapticService`가 Dead 전이를 구독하면 되고, 인터스티셜 광고를 넣을 때는 `InterstitialController`가 GameOver 전이를 구독하면 된다. 기존 코드는 건드리지 않는다. 입력도 마찬가지로 `InputService`가 탭을 R3 `Observable`(OnTurn/OnJump)로 흘리고, `BallController`가 구독한다. Update에서 폴링하는 코드는 거의 없다.

`Dead`와 `GameOver`를 분리한 것도 의도적이다. Dead는 "부활 제안 중"이라는 별도 상태여서, 런 크리스탈의 지갑 적립 같은 종료 처리가 이중 실행되지 않는다.

### SOLID는 이렇게 지켰다

원칙을 문서에 적어놓는 것과 코드에 배어 있는 것은 다르다. 원칙과 프레임워크의 짝짓기 일반론은 [Unity SOLID 원칙 적용 글](/blog/2026/04/06/unity-solid-frameworks/)에서 정리했으니, 여기서는 이 프로젝트에서 실제로 작동한 사례만 적는다:

- **SRP (단일 책임)** — 층 분리 자체가 SRP다. `BallModel`(순수 이동·생사 계산) / `BallController`(공 GameObject 소유·구동) / `HudView`(표시)가 각각 하나의 이유로만 바뀐다. 순수 로직 4종(BallModel, PathGenerator, SpeedController, CrystalCollector)은 Unity API 참조가 0이라 에디터 없이 밀리초 단위로 테스트가 돈다.
- **OCP (개방-폐쇄)** — 공 스킨 시스템을 만든 뒤 배경 스킨을 추가할 때, `ICosmeticService`/`ICosmeticDef` 공용 추상화를 뽑아 쇼룸 UI(SkinView)가 탭별로 서비스만 갈아끼우게 했다. 배경 14종이 추가되는 동안 쇼룸의 순회·미리보기·구매 코드는 한 줄도 안 바뀌었다.
- **ISP (인터페이스 분리)** — `LevelPlayAdService` 하나가 `IRewardedAdService`와 `IInterstitialAdService` 둘로 등록된다. 부활 서비스는 리워드만, 인터스티셜 컨트롤러는 전면 광고만 본다. `BallController`도 `IBall`(구동)과 `IReviveCountdown`(부활 UI용)으로 분리 노출된다. 초기 리듬 시절에도 `IBeatClock`(관찰)/`IBeatClockControl`(제어)을 분리했었다 — 코드 리뷰 에이전트의 감사 지적을 반영한 결과다.
- **DIP (의존 역전)** — 게임 코드는 어떤 SDK도 직접 참조하지 않는다. `IAnalytics`, `ILeaderboardService`, `IIapService`, `IShareService` 같은 인터페이스(심)만 보고, 구현체가 UGS/LevelPlay/Android API를 감싼다. 그래서 안드로이드가 아니면 `NullShareService`, 스토어 연결 실패면 `IsAvailable=false` 폴백으로 게임이 그대로 돈다.

### 테스트 전략 — 순수 로직을 뽑아내면 테스트는 공짜다

층 분리의 가장 큰 배당은 테스트에서 나온다. 테스트는 두 층으로 나뉜다.

- **EditMode 223개** — 순수 로직 대상. 생사 판정, 경로 지오메트리, 부활 비용 증가, 광고 빈도 정책, 지갑 차감처럼 "돈과 목숨이 걸린" 규칙이 전부 여기서 검증된다. Unity 씬을 띄울 필요가 없어 이백 개 넘는 테스트가 초 단위로 돈다.
- **PlayMode 26개** — 통합 대상. DI 그래프 전체가 resolve되는지, 탭 → Playing 전이, 설정 패널 열림/닫힘, 동의 게이트 노출 같은 씬 배선을 확인한다.

순수 클래스를 만들 때의 규율 하나: **비결정 요소(시간·랜덤)는 밖에서 주입한다**. 예컨대 광고 빈도 정책 `AdFrequencyGuard`는 `Time.time`을 직접 읽지 않고 호출자가 `now`를 넘긴다 — 덕분에 "리워드 광고를 본 판은 전면 광고를 스킵한다" 같은 수익화 정책을 시계 없이 유닛 테스트할 수 있다(코드는 아래 수익화 파트에서).

### 외부 에셋은 심(shim) 뒤에, 용도는 명확하게

외부 에셋도 규칙을 정해 놓고 썼다. 서드파티 폴더(`Plugins/`, `_ThirdParty/`, `Packages/`)는 절대 수정하지 않는다.

| 에셋 | 실제 용도 | 비고 |
|---|---|---|
| VContainer 1.18.0 | DI 컨테이너, 컴포지션 루트 | NuGetForUnity로 설치 |
| R3 1.3.1 | 상태·입력·UI 스트림 바인딩 | UniRx 아님 — 후속작 |
| DOTween Pro | 게임 필(주스) 전담 — 스쿼시&스트레치, 카메라 펀치, UI 트윈 | 코드 기반이라 자동화 도구와 궁합이 좋다 |
| FEEL | 파티클 스프라이트 머티리얼만 부분 사용 | MMFeedbacks는 인스펙터 기반이라 코드 중심 워크플로와 안 맞아 주스는 DOTween으로 |
| LevelPlay 9.5 | 리워드·인터스티셜 광고 중개 | `IRewardedAdService`/`IInterstitialAdService` 심 뒤 |
| Unity Purchasing 5.4.1 | IAP | `IIapService` 심 뒤 |

연출 도구로 FEEL 대신 DOTween을 고른 결정이 대표적이다. FEEL의 MMFeedbacks는 강력하지만 인스펙터에서 조립하는 물건이라, 코드로 전부 재현·검증하는 이 프로젝트의 워크플로와 맞지 않았다. 도구는 스펙이 아니라 **워크플로에 맞춰** 골라야 한다.

### UI는 컨테이너 방식으로

UI에서 한 번 삽질을 했다. 패널을 열 때 슬라이더·버튼 같은 요소들의 `anchoredPosition`을 개별 트윈했더니, `VerticalLayoutGroup`이 레이아웃을 다시 계산하면서 트윈과 서로 싸웠다.

해결은 **컨테이너 방식**이다. 패널 아래 `Content`라는 RectTransform을 하나 두고(VerticalLayoutGroup + ContentSizeFitter), 요소들은 그 안에서 LayoutElement로 크기만 선언한다. 연출은 요소가 아니라 **컨테이너째** 움직인다:

```csharp
// SettingsView — 열림: 콘텐츠를 위로 올린 뒤 홈으로 슬라이드 + 페이드 인
[SerializeField] private CanvasGroup _panelGroup;
[SerializeField] private RectTransform _content; // 슬라이더/토글/닫기를 담은 컨테이너

private void SetPanel(bool open, bool animate)
{
    // CanvasGroup은 페이드·인터랙션 차단 담당,
    // _content는 anchoredPosition 슬라이드 담당 — 레이아웃은 컨테이너 내부에서만 계산
}
```

레이아웃 계산(LayoutGroup)과 연출(트윈)의 관할을 분리한 것이다. 모든 뷰가 같은 패턴을 공유한다: **씬 프리배치 MonoBehaviour + `[Inject]` 생성자 주입 + CanvasGroup 페이드 + 컨테이너 슬라이드**. 설정·일시정지·부활·동의 게이트·리더보드·광고제거 팝업까지 전부 이 틀 하나로 찍어냈고, 새 패널을 추가하는 비용이 거의 0에 수렴했다.

---

## 게임 디테일 — "타일 위에 있으면 산다"

하이퍼캐주얼은 단순해 보여도 디테일 싸움이다. 5일 중 상당 시간이 여기 들어갔다.

![ZigZag & Jump 인게임 화면 — 지그재그 타일 경로를 달리는 공과 트레일, TURN/JUMP 버튼](/assets/images/zigzag-jump/shot-ingame.png)

### 생사 판정은 규칙 하나

초기 구현은 "코너 근처 허용 오차 내에서 꺾었는가"를 path 기반 상수들로 판정했다. 미턴·이른 턴·구멍·장애물·횡이탈마다 규칙이 따로 놀았고, 점프가 불가능한 불공정 구간이 생겼다.

이걸 전부 버리고 규칙 하나로 통합했다: **"지상일 때 공의 실제 위치가 solid 타일 위인가"** (`PathGenerator.FloorAt`). 타일 그리드가 스폰(시각)과 판정(논리)의 공통 소스라서 **보이는 타일 = 판정되는 타일**이다. 턴은 방향만 90° 꺾고 위치 보정(스냅)을 하지 않는다. 생존 여부는 꺾은 뒤 타일 위에 있는지로만 결정되고, 턴/낙하 여유는 임의 상수가 아니라 타일 반 칸(cell/2)에서 자연스럽게 파생된다.

### 경로는 절차적이고 결정적이다

- 한 변 1.5의 정사각 타일이 간격 0으로 붙어 연속 경로를 이룬다. 코너마다 두 세그먼트가 타일 하나를 공유한다.
- 세그먼트 길이는 결정적 해시로 2~5셀 — 꺾이는 간격이 매번 다르지만 같은 시드면 같은 맵이다. 매 판 시드를 랜덤화하되 **부활은 같은 맵을 유지**한다(죽은 지점 연습이 가능해진다).
- 위험(구멍/장애물)은 6칸마다 교대로 나오되 **세그먼트 중앙 1칸만** 차지하고, 위험 세그먼트는 최소 4셀을 강제한다. 코너에서 위험까지 항상 ~2.25칸의 런웨이가 확보돼 "턴 직후 점프 불가" 같은 억울한 죽음이 없다.
- 속도는 `SpeedAt(d) = clamp(6 + 0.03·d, 6, 12)` — 거리 비례로 빨라지고 2배에서 상한. 점프는 속도와 무관한 거리 기반 아치(체공 거리 2.6, 높이 1.8)라 게임이 빨라져도 점프 감각은 일정하다.

### 죽음과 부활의 UX

- **ready-gate**: 첫 입력 전엔 공이 안 달린다. 시작 타이밍은 플레이어의 것.
- 사망 순간 파스텔 큐브 10개가 산산조각 나는 VFX + 햅틱 진동(설정 게이트) + 카메라 셰이크.
- 부활 위치는 죽은 세그먼트의 시작 코너 — 부활하자마자 낭떠러지인 상황을 없앤다. 재개 직후엔 슬로우 스타트(감속 램프)로 반응 여유를 준다.
- 부활 제안은 5초 카운트다운(만료 시 자동 게임오버), 베스트 기록의 80%를 넘긴 판이면 부활 버튼이 펄스로 강조된다 — "아까운 판"일수록 부활 동기가 크다는 가설을 UI에 심었다.

### 주스(게임 필)

DOTween으로 전부 코드 연출했다. 점프 이륙 시 수직 스트레치, 착지 시 스쿼시(부피 보존 근사 + OutBack 스프링) — 단, 착지 스쿼시는 지면 생존 착지에만 걸고 낭떠러지로 떨어질 때는 뺐다. 카메라는 스무스 팔로우 위에 상황별 레이어를 얹는다: 점프 펀치, 수집 미세 펀치, 사망 강한 Perlin 셰이크. 크리스탈 수집 팝과 상시 트레일까지가 기본 세트다.

### 실기기에서 잡은 버그 — 60fps 프레임캡

고사양 폰인데 전반적으로 프레임이 낮다는 제보(내 폰이다)를 받고 프로파일링 대신 코드를 먼저 뒤졌다. `Application.targetFrameRate` 설정이 코드베이스 어디에도 없었다. Android는 이걸 명시하지 않으면 기기 성능과 무관하게 OS 전력 관리 기본값(대개 30fps)에 캡되는 흔한 함정이다. 부트스트랩 최상단에 두 줄로 해결:

```csharp
QualitySettings.vSyncCount = 0;
Application.targetFrameRate = 60;
```

이 외에도 그림자 계단현상(캐스케이드 4→1 + 섀도 거리 32 + 셰이더 블러), 저사양 fill-rate 병목(그림자 블러 12→6탭, Nebula 셰이더 fbm 5→3옥타브) 같은 모바일 특유의 디테일이 계속 나왔다. 이런 항목들의 일반론은 [Unity 모바일 최적화 팁](/blog/2026/04/07/unity-mobile-optimization-tips/)에 따로 정리해 뒀다.

---

## 아트 — 이미지 파일 0에서 시작한 파스텔

아트 디렉션은 Monument Valley식 플랫 셰이딩이다. 크림 배경 `#F2EAD9` · 코랄 경로 `#DBA089` · 틸 공 `#279B94` · 골드 장애물 `#D9A94E`. 전부 머티리얼 에셋 색이고, 낮은 smoothness와 소프트 앰비언트로 면마다 플랫한 톤을 만든다. (이 글의 구조도들도 같은 팔레트로 그렸다.)

"이미지 파일 0" 원칙은 콘텐츠가 늘며 실용적으로 완화됐지만, 방식이 재밌다:

- **공 스킨 50종** — 셰이더(그라디언트/글로우/이리데슨트 프레넬) + 절차 패턴(Bands/Seams/Spot/Noise로 농구공·지구 등) + 트레일 스타일 + 파티클 조합. 행성 9종은 Solar System Scope의 CC BY 4.0 텍스처를 쓰고 크레딧을 표기했다. 야구공·볼링공 등 5종은 이미지 생성이 막힌 환경에서 **C# 코드로 equirectangular 텍스처를 베이크**해서 만들었다.
- **크리스탈 오브 스킨** — 유리 구슬 속에 은하가 도는 스킨. 겉면 데칼로 속이는 게 아니라 유리 쉘 + 내부 코어 스피어의 **진짜 2겹 구조**로 만들어 시차 깊이가 생긴다.
- **배경 14종** — 배경은 하늘 이미지가 아니라 **공을 따라오는 바닥 플레인의 셰이더 모드**다. `_Mode` 하나로 Solid/Gradient/NightLake(밤 호수: 절차 별 + 달빛 반사 기둥 + sin 리플)/Nebula(fbm 성운 + 도메인 워프로 흐르는 구름)를 전환한다. 각 배경이 경로 타일 팔레트까지 지정해서(셰이더 전역 `_TileTint`) 어두운 호수 위에선 경로가 밝게 빛난다.
- **테마 스와프** — 달리는 거리 250m마다 배경 테마가 자동 순환한다. 유저 선택은 오버라이드 스택(`preview ?? override ?? selected`)으로 보존된다.

## 스킨 시스템 — 라이브옵스를 견디는 코스메틱 설계

스킨 50종은 아트 작업이기 전에 설계 문제다. 코스메틱은 출시 후에도 계속 추가되는 콘텐츠라서, "스킨 하나 추가"의 비용이 코드 수정이면 라이브옵스가 불가능해진다.

### 스킨 1종 = 코드가 아니라 데이터 1건

스킨은 불변(init-only) 데이터 클래스 `SkinDefinition`으로 정의된다. 색·셰이더 스타일·절차 패턴 파라미터·트레일·파티클·컴패니언(달/고리)·등급·**획득 경로와 가격**까지 전부 데이터다:

```csharp
public sealed class SkinDefinition : ICosmeticDef
{
    public string Id { get; init; }
    public Color TopColor { get; init; }
    public SkinStyle Style { get; init; } = SkinStyle.Gradient; // Glow/Iridescent...
    public SkinPattern Pattern { get; init; } = SkinPattern.None; // Bands/Seams/Spot/Noise
    public TrailStyle TrailStyle { get; init; } = TrailStyle.Solid;
    public SkinUnlock Unlock { get; init; } = SkinUnlock.Crystal; // Crystal/Ad/Iap
    public int CrystalCost { get; init; }
    public string IapProductId { get; init; }
    // ... 파라미터 20여 개, 신규 필드는 기본값 제공(기존 카탈로그 하위호환)
}
```

`SkinCatalog`가 이 정의들의 단일 진실 소스(SSOT)다. 뒤에 나올 IAP 상품 등록도 이 카탈로그에서 동적으로 뽑기 때문에, 스킨을 추가하면 쇼룸 노출·구매 버튼·스토어 상품 등록이 전부 따라온다.

### 상태는 소유 · 선택 · 미리보기 3계층

`SkinService`는 렌더링 의존이 0인 순수 서비스로, 세 가지 상태만 관리한다: 소유 집합(PlayerPrefs CSV), 선택 스킨, 미리보기. 실제 공에 적용될 "유효 스킨"은 R3로 파생시킨다:

```csharp
// 미리보기가 있으면 미리보기, 없으면 선택 스킨 — 유효 스킨은 '파생 상태'
_effectiveSub = _previewId.CombineLatest(_selectedId, (p, s) => p ?? s)
                          .Subscribe(id => _effectiveId.Value = id);
```

쇼룸에서 ◀▶로 스킨을 넘길 때마다 `SetPreview(id)` 한 줄이면 공이 실시간으로 갈아입는다. 라이브 미리보기가 별도 기능이 아니라 **상태 파생의 부산물**로 공짜로 나온 것이다. 적용 자체는 `SkinApplier`가 담당한다 — 셰이더 파라미터 주입, 트레일 widthCurve(스타일마다 꼬리 실루엣이 다르다: Ice=물방울, Flame=뾰족, Comet=혜성), 파티클 렌더러 스왑. 로직과 렌더링이 분리돼 있어 `SkinService`는 EditMode에서 통째로 테스트된다.

### 획득 경로 3종은 UX 정책이 다르다

| 경로 | 처리 | 이유 |
|---|---|---|
| 크리스탈 | 지갑 차감 성공 시에만 소유 + **즉시 착용** | 방금 산 스킨을 바로 보여주는 게 구매 만족 |
| 리워드 광고 | 소유만 부여 | 착용은 유저 선택 — 광고 시청이 강제 착용이 되면 불쾌 |
| IAP | 소유만 부여, **복원 대상** | 재설치·기기 변경 시 자동 복원 |

크리스탈 구매는 원자성이 핵심이다 — 지갑 차감(`TrySpend`)이 실패하면 소유 부여까지 아무 일도 일어나지 않는다:

```csharp
public bool TryUnlockByCrystals(string id)
{
    var def = _catalog.Get(id);
    if (def == null || def.Unlock != SkinUnlock.Crystal) return false;
    if (_owned.Contains(id)) return false;
    if (!_wallet.TrySpend(def.CrystalCost)) return false; // 잔액 부족 → 차감도 소유도 없음
    GrantOwned(id);
    Select(id); // 구매 즉시 착용
    return true;
}
```

저장값 방어도 잊지 않았다 — PlayerPrefs에 남은 선택 스킨이 소유 목록에 없으면(데이터 꼬임·치팅) 기본 스킨으로 폴백한다. 배경 스킨도 같은 구조(`ICosmeticService` 구현)라서, 앞서 OCP에서 말한 대로 쇼룸 UI는 탭만 바꿔 두 도메인을 그대로 소비한다.

## 경제 — 봇으로 실측하고 가격을 정했다

![ZigZag & Jump 부활 제안 화면 — 5초 카운트다운, 크리스탈 비용 25, AD REVIVE·CONTINUE·GIVE UP 버튼](/assets/images/zigzag-jump/shot-revive.png)

경제 구조: 런에서 모은 크리스탈이 게임오버 시 영구 지갑에 적립되고, 부활(25→50→100 증가)과 스킨·배경 구매에 쓴다.

가격을 감으로 정하는 대신 **자동 플레이 봇을 만들어 실측했다**. `#if DEBUG`로만 컴파일되는 `AutoPlayBot`이 완벽한 판정으로 6,000m 이상을 달리며 수입률을 측정한다. 첫 실측이 100m당 크리스탈 8.25개 — 체감보다 후해서 크리스탈 생성률을 55%에서 35%로 내리고 재실측하니 **4.40개/100m**. 이 숫자를 기준으로 상점 가격표를 재설계했다. "스킨 하나 = 몇 분 플레이"가 데이터로 계산되는 상태가 된 것이다.

바이럴 루프도 경제에 붙였다. 게임오버 화면의 점수 공유는 스크린샷 + 텍스트를 Android 네이티브 공유 시트(`ACTION_SEND` + FileProvider)로 보내고, 게임오버당 1회 크리스탈 +10을 보상한다. 보상 문구는 스크린샷 캡처 **이후**에 표시해서 공유본에 안 찍히게 했다.

---

## 수익화 SDK — LevelPlay 광고와 Unity IAP

수익이 부차 목표라도 연동은 상용 수준으로 했다. 광고 중개(mediation)와 IAP는 규모와 무관하게 어느 모바일 프로젝트든 피해 갈 수 없는 실무이기 때문이다.

### 광고 — 정책과 SDK를 분리한다

광고 코드에서 지키고 싶었던 첫 원칙은 **정책(언제·왜 보여주나)과 SDK(어떻게 보여주나)의 분리**다.

- 정책 서비스 3개 — `ReviveService`(광고 부활), `DoubleRewardService`(크리스탈 2배), `InterstitialController`(게임오버 주기) — 는 `IRewardedAdService`/`IInterstitialAdService` 인터페이스만 본다. `LevelPlayAdService`는 로드·표시·콜백 같은 SDK 세부만 담당한다. 광고 네트워크를 갈아타도 정책 코드는 그대로다.
- App Key가 공란이거나 동의 전이면 `Init` 자체를 생략한다(동의 게이트는 다음 섹션). 광고가 "항상 미준비" 상태일 뿐 게임은 정상이고, 부활은 크리스탈 경로만 남는다.
- `ad_shown` 계측은 SDK 래퍼가 아니라 정책 서비스가 발화한다 — placement(revive/double/interstitial)의 의미를 아는 쪽이 기록해야 데이터가 깨끗하다.

실전에서 배운 함정 하나 — **보상 판정은 `OnAdRewarded`가 유일한 진실**이다:

```csharp
// LevelPlay는 OnAdClosed를 OnAdRewarded보다 "먼저" 낼 수 있다(에디터 시뮬레이터/일부 네트워크).
// 닫힘 시점에 보상을 판정하면 콜백이 유실된다.
_rewarded.OnAdRewarded += (info, reward) => GrantReward();
_rewarded.OnAdClosed   += info => _rewarded?.LoadAd(); // 재로드만(보상은 위에서)
```

노출 빈도 정책은 순수 클래스 `AdFrequencyGuard`로 뽑았다. 앞서 말한 대로 시간을 주입받아 EditMode 테스트가 가능하다:

```csharp
// 런 종료 시 1회 판정: 리워드 본 판이 아니고, 마지막 광고로부터 최소 간격이 지났으면 전면 허용.
public bool ConsumeInterstitialWindow(float now)
{
    bool rewardedThisRun = _rewardedThisRun;
    _rewardedThisRun = false; // 다음 판 이월 없음
    return !rewardedThisRun && now - _lastAdAt >= _settings.InterstitialMinIntervalSeconds;
}
```

정책 자체는 표 하나로 요약된다:

| 배치 | 정책 |
|---|---|
| 리워드 — 부활 | 판당 1회, 부활 제안 5초 카운트다운 안에서 |
| 리워드 — 크리스탈 2배 | 게임오버 화면, 런당 1회 |
| 인터스티셜 | 게임오버 3회마다 + 최소 간격 60초 + 리워드 본 판은 스킵, 이월 없음 |
| 광고제거 IAP | 인터스티셜(강제 노출)만 제거 — 리워드는 능동적 가치 교환이라 유지 |

"광고 보고 이어했는데 죽자마자 또 전면 광고"가 이 규칙들이 막는 대표 시나리오다. 광고는 많이 트는 것보다 **미워지지 않게 트는 것**이 리텐션에 유리하다는 가설이고, `ad_shown` 퍼널로 검증할 예정이다. 판매 타이밍도 설계했다 — 광고제거 IAP의 구매 유도 팝업은 인터스티셜이 **닫히는 순간**에 뜬다. 방금 강제 광고를 견딘 유저가 가장 구매 동기가 높은 시점이고, 강제 게이트가 아니라 "나중에"로 닫을 수 있는 업셀이다.

### IAP — 카탈로그가 SSOT, 복원은 자동

IAP는 Unity Purchasing 5.4.1의 **v5 아키텍처**(`StoreController` — 구 `IStoreListener` 방식이 아니다)로 붙였다. 상용 IAP에 요구되는 요소를 하나씩 짚으면:

**① 상품 등록은 하드코딩하지 않는다.** 스킨·배경 카탈로그에서 `Unlock == Iap` 항목을 초기화 시점에 동적 수집한다. 스킨 시스템 섹션에서 말한 SSOT 원칙이 여기서 회수된다 — 스킨을 추가하면 스토어 상품 등록이 따라온다.

```csharp
private List<ProductDefinition> BuildProductDefinitions()
{
    var defs = new List<ProductDefinition>();
    foreach (var s in _skinCatalog.All)
        if (s.Unlock == SkinUnlock.Iap && !string.IsNullOrEmpty(s.IapProductId))
            defs.Add(new ProductDefinition(s.IapProductId, ProductType.NonConsumable));
    // ... 배경 카탈로그도 동일 + 광고제거(remove_ads)
    return defs;
}
```

**② 구매 플로우는 "부여 → 확인" 순서.** `OnPurchasePending`에서 소유를 부여(`Grant`)한 뒤 `ConfirmPurchase`로 스토어에 확인을 보낸다. 부여가 먼저여야 확인 직후 앱이 죽어도 유저가 산 것을 잃지 않는다 — 미확인 주문은 스토어가 다음 실행에 재통지한다.

**③ Deferred(결제 대기)를 처리한다.** 가족 결제 승인, 후불 결제처럼 구매가 즉시 확정되지 않는 경로가 실존한다. 이때는 성공 처리하지 않고 대기시키며, 실제 승인되면 복원 경로로 자연 반영된다.

**④ 복원은 버튼 없이 자동.** 재설치·기기 변경 시 `FetchPurchases()`가 돌려주는 `ConfirmedOrders`를 전부 자동 언락한다. 비소모성(NonConsumable) 상품만 팔기 때문에 가능한 단순화다.

**⑤ Grant는 라우팅만 한다.** 상품 ID가 스킨 카탈로그 소속이면 `SkinService.Unlock`, 배경이면 `BackgroundService.Unlock`, `remove_ads`면 `AdRemovalService.Unlock`. 구매 코드는 도메인 내용을 모른 채 배달만 한다.

에디터에서는 Fake Store를 즉시 승인 모드(`FakeStoreUIMode.DeveloperUser`)로 돌려 반복 테스트를 자동화했다(`#if UNITY_EDITOR` 안이라 실빌드에는 컴파일조차 안 된다). 다만 에디터 Fake Store가 구매 확인 콜백을 멈추는 알려진 이슈가 있어, 실구매 왕복의 최종 검증은 Play Console 라이선스 테스터로 남겨 뒀다.

---

## UGS 풀스택 — 계정 하나로 분석·리더보드·인증

Unity Gaming Services는 이 프로젝트에서 가장 "출시 학습"다운 부분이었다. 하나의 UGS 프로젝트(`cloudProjectId`)에 Analytics, Leaderboards, Authentication, LevelPlay를 전부 링크해서 대시보드 한 곳에서 관리한다. 광고·IAP의 SDK 연동은 앞 섹션에서 다뤘으니, 여기서는 계정·동의·데이터 파트다.

공통 설계 원칙 두 가지가 모든 UGS 연동을 관통한다.

1. **동의(consent) 게이트 뒤에서만 초기화한다.** 처음엔 부팅 즉시 `StartDataCollection()`을 호출했는데, 이는 GDPR 관점에서 동의 없는 수집이다. `IConsentService`(PlayerPrefs 영속, R3 `Status`)를 만들고 Analytics와 LevelPlay의 초기화를 Granted 알림 뒤로 옮겼다.
2. **실패해도 조용히 비활성.** 프로젝트 미링크·오프라인·보드 미생성이면 경고 한 줄 남기고 기능만 꺼진다. 게임은 그대로 돈다.

![UGS 동의 게이트 시퀀스 다이어그램 — 동의(Granted) 이후에만 Analytics와 LevelPlay SDK를 초기화하는 흐름](/assets/images/zigzag-jump/ugs-consent.png)

### Analytics — 이벤트 5개면 퍼널이 보인다

`IAnalytics` 심 뒤의 `UnityAnalyticsService`가 동의 후 `UnityServices.InitializeAsync()` + `StartDataCollection()`을 수행하고, 이후 `CustomEvent`를 기록한다. 이벤트는 딱 5개로 시작했다:

| 이벤트 | 파라미터 | 보고 싶은 것 |
|---|---|---|
| `game_start` | — | 세션·판수 |
| `game_over` | distance, crystals, best, revives_used | 판당 거리 분포, 이탈 지점 |
| `ad_shown` | placement (revive/double/interstitial) | 광고 노출 밸런스 |
| `revive_used` | method (crystal/ad), cost | 부활 경제가 작동하는가 |
| `revive_offer_expired` | — | 부활 제안이 무시되는 비율 |

주의할 점: 커스텀 이벤트는 대시보드 **Event Manager에 같은 이름·파라미터 스키마로 등록**해야 한다. 미등록 이벤트는 Invalid로 버려진다. 발화 지점은 뷰가 아니라 정책 서비스(Revive/DoubleReward/Interstitial) 내부에 두어, UI를 갈아엎어도 계측이 안 깨진다.

### Leaderboards — 익명 인증 + Keep Best

`UgsLeaderboardService`가 UGS Core 초기화 후 `SignInAnonymouslyAsync()`로 익명 로그인하고, 게임오버마다 `LeaderboardSubmitter`가 베스트 거리를 제출한다. 대시보드에는 `best_distance` 보드를 정렬 Descending, 갱신 정책 **Keep Best**로 생성했다 — 매번 제출해도 서버가 최고 기록만 유지하니 클라이언트가 "갱신됐을 때만 보내기" 로직을 가질 필요가 없다.

디테일 하나 — 초기화가 끝나기 전에 게임오버가 나면 제출이 유실된다. 그래서 pending 값을 보관했다가 준비되는 순간 flush한다:

```csharp
public async void SubmitBest(int distance)
{
    if (!_ready.Value) { _pendingBest = Mathf.Max(_pendingBest, distance); return; }
    try { await LeaderboardsService.Instance.AddPlayerScoreAsync(LeaderboardId, distance); }
    catch (Exception e) { Debug.LogWarning($"[leaderboard] 제출 실패: {e.Message}"); }
}
// 초기화가 끝나는 순간 Start()가 보관해 둔 _pendingBest를 SubmitBest로 다시 흘려보낸다(flush)
```

리더보드(🏆) 버튼을 누르면 Top N + 내 순위를 조회하는 `LeaderboardView`가 뜬다. 익명 인증이라 표시 이름이 비어 오는데, 일단 "Player"로 폴백하고 닉네임 입력은 후속 과제로 남겼다.

### 크래시 리포팅 — 패키지를 설치하지 않은 이유

"Cloud Diagnostics 패키지를 설치하자"로 시작했다가, 조사해 보니 해당 패키지는 deprecated였고 Unity 6.2+부터는 엔진 내장 Diagnostics로 대체됐다. 결국 코드 0줄 — `ProjectSettings`의 `CrashReportingSettings` 토글 하나로 끝났다. 오래된 튜토리얼보다 현재 버전의 문서를 먼저 확인할 것.

---

## 출시 준비 — 스토어에 올리기까지

![ZigZag & Jump 타이틀 화면 — ZIGZAG 로고와 TAP TO START 문구](/assets/images/zigzag-jump/shot-title.png)

마지막 구간은 코딩보다 **컴플라이언스와 소재** 싸움이다.

- **동의 게이트 UI** — 최초 실행 시 불투명 패널이 타이틀을 가리고 동의/거부를 받는다. `Application.systemLanguage`로 한국어면 한글, 그 외엔 영어를 보여주는 `CopyFor()` 순수 함수로 현지화했다(리더보드·공유 문구도 같은 패턴).
- **개인정보 처리방침** — 수집 항목(UGS Analytics 이벤트·기기 정보, LevelPlay 광고 ID와 연동 네트워크 목록, 크래시 리포트)을 KO/EN으로 작성해 Notion에 공개 게시하고, Play Console 데이터 보안 양식에 URL을 등록했다.
- **스토어 소재** — 앱 아이콘(1024²)과 피처 그래픽(1024×500), 폰 스크린샷 5장. 스크린샷은 에디터 플레이 모드를 Step 단위로 스테핑하며 "이동 중 트레일", "점프 정점의 포물선" 같은 순간을 강제 재현해 캡처했다.
- **리스팅 문구** — 제목 "ZigZag & Jump", 짧은 설명과 전체 설명 KO/EN. "예정" 기능이 아니라 실제 들어간 기능만 적었다.
- **키스토어와 빌드** — Unity Keystore Manager로 키스토어 생성(파일은 `.gitignore`, `ProjectSettings`에는 참조만 커밋), IL2CPP + ARM64로 App Bundle 빌드. **19.7분, 159MB `.aab`**, 에러 0.
- **업로드** — Play Console에 앱을 만들고 데이터 보안 양식을 채운 뒤, `.aab`를 비공개 테스트 트랙에 올렸다. 이제 테스터들의 폰에 게임이 깔린다.
- **비공개 테스트 운영 — Doply** — 업로드가 끝이 아니다. 2023년 11월 이후 만든 개인 개발자 계정은 **테스터 12명이 14일 연속** 참여하는 비공개 테스트를 통과해야 프로덕션(정식 출시) 신청 자격이 생긴다. 테스터를 직접 모으고 기기마다 설치·참여 상태를 일일이 확인하는 대신 자동화 테스트 플랫폼 **Doply**에 앱을 등록했다 — 테스터 디바이스 설치가 자동으로 진행되고, 대시보드에서 설치 상태가 실시간으로 추적되며, 14일을 채운 뒤의 프로덕션 신청 설문 준비까지 이어진다. 요건 충족을 수작업 관리에서 모니터링 문제로 바꿔 주는 도구다.

![Doply 대시보드 — ZigZag & Jump 비공개 테스트, 테스터 디바이스에 앱 설치가 자동 진행·추적되는 화면](/assets/images/zigzag-jump/doply-closed-test.png)

## 5일이 가능했던 이유 — AI 에이전트와 일하는 법

이 프로젝트는 Claude Code + Unity MCP 브리지(에디터 원격 제어)로 개발했다. 5일 사이클이 가능했던 건 타이핑 속도가 아니라 **운영 방식** 덕이 크다.

- **로컬 메모리 문서** — `CLAUDE.md`(규칙)/`DESIGN.md`(현재 상태)/`CONTEXT.md`(결정과 이유)/`TASKS.md`(백로그)를 유지하며 세션이 바뀌어도 맥락이 이어진다. 특히 CONTEXT.md에 "왜 이렇게 정했는지"를 남기는 게 핵심이다 — 피벗 근거, 폐기한 대안, 유저 지시가 전부 남아 재논의 비용이 사라진다.
- **모델 라우팅** — 메인 구현은 Opus, 코드 리뷰·QA 같은 적대 검증은 Fable(high effort), 코드 탐색·증거 수집은 Haiku. 역할별로 다른 모델을 병렬로 돌려 비용과 속도를 같이 잡았다.
- **"pid ≠ progress"** — 프로세스가 돌았다는 것과 진전이 있었다는 것은 다르다. 완료 주장은 테스트 green, 콘솔 0, 스크린샷 관찰 같은 증거를 요구했고, 큰 작업 뒤엔 별도 리뷰 에이전트가 적대적으로 재검증했다. 실제로 이 과정에서 수익화 콜백 오배송(MAJOR), 공유 머티리얼 에셋 드리프트(CRITICAL) 같은 버그가 출시 전에 잡혔다.
- **테스트 상시화** — 태스크마다 EditMode(순수 유닛) + PlayMode(통합) 테스트를 강제했다. 순수 로직 분리 덕에 테스트가 빠르고, 테스트가 있으니 에이전트의 대담한 리팩터링을 안심하고 받을 수 있다. 선순환이다.

## 5일간의 숫자

| 항목 | 값 |
|---|---|
| 기간 | 2026-07-10 ~ 07-14 (07-15 잔여 정리) |
| 커밋 | 166 (자동 저장 제외 141) |
| 게임 스크립트 | 93개 (테스트 파일 36개 별도) |
| 테스트 | EditMode 223 + PlayMode 26(+1 skip) green |
| 콘텐츠 | 공 스킨 50종 · 배경 14종 · 크리스탈 오브 13종 |
| 빌드 | IL2CPP + ARM64 `.aab` 159MB, 19.7분 |
| 수입률 실측 | 4.40 크리스탈/100m (봇 자동 플레이) |

## 남은 것

비공개 테스트가 끝이 아니라 시작이다. SFX가 아직 0건이고(절차 합성 검토 중), IAP 실구매 왕복과 공유 시트는 실기기 검증이 남았다. 리더보드 닉네임, 각도 바리에이션(90°→60/45°), iOS 대응이 그 뒤를 잇는다. 테스터 피드백과 Analytics 퍼널이 쌓이면 그때부터가 진짜 라이브옵스 학습이다.

기획부터 스토어 업로드까지 한 바퀴를 돈다는 계획은 5일 만에 끝났다. 그리고 이 한 바퀴에서 다룬 계층 아키텍처와 테스트, 광고·IAP 연동, 카탈로그 기반 코스메틱, 데이터 밸런싱, 컴플라이언스는 규모만 다를 뿐 상용 프로젝트에서 매일 요구되는 근육이다. 다음 게임은 더 빠를 것이다.

---

*하이퍼캐주얼 게임 하나를 5일 만에 기획→피벗→SOLID 아키텍처→스킨·광고·IAP 수익화→UGS 풀스택→비공개 테스트까지 완주한 기록 — 속도의 비결은 버릴 수 있는 구조, 증거 기반 검증, 그리고 AI 에이전트와의 분업이었다.*
