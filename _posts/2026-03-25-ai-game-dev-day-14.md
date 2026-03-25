---
title: "AI로 게임 개발하기 - 14일차: 로그라이크 런을 굴리다"
description: "R3 ReactiveProperty 상태 머신, Fisher-Yates 시드 맵 생성, EnemyPatternSO 기반 엘리트/보스 AI, VContainer LifetimeScope 분리까지 Phase 3 구현 기록."
date: 2026-03-25
categories: [Project]
tags: [Unity, AI]
---

## Phase 3 진입

[13일차](/blog/2026/03/16/ai-game-dev-day-13/)에서 Phase 2 전투 확장을 마무리했다. 8개 Sprint에 걸쳐 EnemyPatternSO + Sequencer 패턴 인프라, 이중 게이지, 궁극기, 적 4종, 연출 시스템을 전부 넣었다. 전투 한 판은 재미있는데, 한 판 싸우고 끝이다. Phase 3에서는 이 전투를 반복시키는 로그라이크 런 구조를 만들었다.

---

## RunManager: R3 ReactiveProperty 상태 머신

`RunManager`는 순수 C# 클래스다. MonoBehaviour가 아닌 `IDisposable`을 구현하고, R3의 `ReactiveProperty`로 상태를 관리한다.

```csharp
// RunManager.cs 실제 코드
public class RunManager : IDisposable
{
    private readonly ReactiveProperty<RunState> _reactiveState = new(RunState.NotStarted);
    private RunProgressData _progress;

    private readonly Subject<(RunState Previous, RunState Current)> _onRunStateChanged = new();
    private readonly Subject<int> _onStageCompleted = new();
    private readonly Subject<bool> _onRunEnded = new();

    // 상태 전이 규칙을 Dictionary로 정적 정의
    private static readonly Dictionary<RunState, HashSet<RunState>> ValidTransitions = new()
    {
        { RunState.NotStarted, new HashSet<RunState> { RunState.MapSelect } },
        { RunState.MapSelect, new HashSet<RunState> { RunState.StageIntro } },
        { RunState.StageIntro, new HashSet<RunState> { RunState.Combat, RunState.MapSelect } },
        { RunState.Combat, new HashSet<RunState> { RunState.CombatResult } },
        { RunState.CombatResult, new HashSet<RunState> { RunState.RewardSelect } },
        { RunState.RewardSelect, new HashSet<RunState> { RunState.MapSelect, RunState.StageTransition } },
        { RunState.StageTransition, new HashSet<RunState> { RunState.StageIntro, RunState.WorldClear } },
        { RunState.WorldClear, new HashSet<RunState> { RunState.MapSelect, RunState.RunComplete } },
        { RunState.RunComplete, new HashSet<RunState>() },
        { RunState.RunFailed, new HashSet<RunState>() },
    };

    public ReadOnlyReactiveProperty<RunState> ReactiveState => _reactiveState;
    public Observable<(RunState Previous, RunState Current)> OnRunStateChanged => _onRunStateChanged;
    public Observable<bool> OnRunEnded => _onRunEnded;
}
```

상태 전이 규칙을 `Dictionary<RunState, HashSet<RunState>>`로 선언한 부분이 핵심이다. `NotStarted`에서는 `MapSelect`로만 갈 수 있고, `Combat`에서는 `CombatResult`로만 갈 수 있다. 유효하지 않은 전이를 코드 레벨에서 차단한다. `RunFailed`는 어느 활성 상태에서든 강제 전이 가능하도록 별도 처리했다.

R3의 `Subject`로 `OnRunStateChanged`, `OnStageCompleted`, `OnRunEnded` 세 개의 이벤트 스트림을 발행한다. `StageFlowController`와 `RoguelikeBootstrap`이 이 스트림을 구독해서 전투 시작, 보상 UI 표시, 맵 복귀 등을 처리한다. RunManager 자체는 "다음에 무엇을 해야 하는지" 모른다. 상태만 바꾸고 이벤트를 쏜다.

`RunProgressData`는 킬 수, 패링 횟수, Perfect 비율, 경과 시간, 골드, 획득 아티팩트 등 런 통계를 struct로 추적한다.

---

## RunMapGenerator: Fisher-Yates 시드 맵

맵 생성기도 순수 C# 클래스다. `System.Random(seed)`을 받아서 결정론적 맵을 생성한다.

```csharp
// RunMapGenerator.cs 실제 코드
public class RunMapGenerator
{
    private const int LAYERS_PER_WORLD = 6;
    private const int START_NODES_MIN = 2;
    private const int START_NODES_MAX_EXCL = 4;   // 시작층 2~3개
    private const int ELITE_NODES_MIN = 1;
    private const int ELITE_NODES_MAX_EXCL = 3;   // 엘리트 1~2개
    private const int BOSS_NODE_COUNT = 1;         // 보스 항상 1개

    public List<List<StageNodeData>> GenerateMap(RunConfigSO config, int seed)
    {
        var random = new Random(seed);
        var allLayers = new List<List<StageNodeData>>();
        int nodeIdCounter = 0;

        for (int world = 0; world < config.WorldCount; world++)
        {
            var worldLayers = GenerateWorld(random, world, ref nodeIdCounter);
            allLayers.AddRange(worldLayers);
        }
        return allLayers;
    }
}
```

6층 구조에서 각 층의 노드 수를 랜덤으로 결정하되, 상한/하한을 const로 고정했다. Layer 0~2는 Combat(2~3개), Layer 3은 Elite(1~2개), Layer 4는 Utility(Shop/Event/Rest 중 랜덤), Layer 5는 Boss(1개). `nodeIdCounter`를 `ref`로 넘겨서 다중 월드에서도 노드 ID가 겹치지 않는다.

### 연결 생성과 고립 방지

```csharp
// RunMapGenerator.cs — BuildConnections
private Dictionary<int, List<int>> BuildConnections(Random random, int[][] layerNodeIds)
{
    var connections = new Dictionary<int, List<int>>();

    // 모든 노드에 빈 연결 리스트 초기화
    for (int layer = 0; layer < LAYERS_PER_WORLD; layer++)
        foreach (int nodeId in layerNodeIds[layer])
            connections[nodeId] = new List<int>();

    // 각 층 → 다음 층 1~2개 연결
    for (int layer = 0; layer < LAYERS_PER_WORLD - 1; layer++)
    {
        var currentIds = layerNodeIds[layer];
        var nextIds = layerNodeIds[layer + 1];

        foreach (int currentId in currentIds)
        {
            int maxConnections = Math.Min(
                random.Next(MIN_CONNECTIONS, MAX_CONNECTIONS_EXCL), nextIds.Length);
            var selectedIndices = PickRandomIndices(random, nextIds.Length, maxConnections);
            foreach (int idx in selectedIndices)
                connections[currentId].Add(nextIds[idx]);
        }

        // 고립 노드 방지
        EnsureNoIsolation(random, currentIds, nextIds, connections);
    }
    return connections;
}
```

`PickRandomIndices`가 Fisher-Yates 부분 셔플이다. 전체 인덱스 배열을 만들고, 앞에서 `count`개만 셔플해서 선택한다.

```csharp
private List<int> PickRandomIndices(Random random, int total, int count)
{
    var indices = new List<int>(total);
    for (int i = 0; i < total; i++) indices.Add(i);

    // Fisher-Yates 부분 셔플
    for (int i = 0; i < count; i++)
    {
        int j = random.Next(i, indices.Count);
        (indices[i], indices[j]) = (indices[j], indices[i]);
    }
    return indices.GetRange(0, count);
}
```

`EnsureNoIsolation`은 다음 층에서 인바운드 연결이 0인 노드를 찾아 현재 층의 랜덤 노드에서 연결을 추가한다. 이 조합 덕분에 같은 시드는 같은 맵을 생성하면서, 어떤 시드에서도 고립 노드가 생기지 않는다.

노드 데이터는 `StageNodeData` struct로, `NodeId`, `NodeType`, `ConnectedNodeIds[]`, `WorldIndex`, `StageIndex`를 담고, `WithCompleted()` 같은 immutable 패턴 메서드를 제공한다.

---

## FillInBerserkerAI: EnemyPatternSO 기반 패턴 전환

엘리트 적은 기존의 `EnemyPatternSequencer`를 재활용한다. 핵심은 두 개의 `EnemyPatternSO`를 `_sequencer.SetNextPattern()`으로 전환하는 구조다.

```csharp
// FillInBerserkerAI.cs 실제 코드
public class FillInBerserkerAI : MonoBehaviour
{
    [SerializeField] private EnemyPatternSO _normalPattern;   // ● _ _ _ ● _ _ _
    [SerializeField] private EnemyPatternSO _burstPattern;    // ● _ _ _ ● ● ● ●
    [SerializeField] private int _normalMeasuresBeforeFillIn = 3;
    [SerializeField] private float _berserkHpThreshold = 0.5f;
    [SerializeField] private float _berserkSpeedMultiplier = 2.0f;
    [SerializeField] private float _berserkTelegraphMultiplier = 0.8f;

    [SerializeField] private EnemyPatternSequencer _sequencer;
    [SerializeField] private EnemyMovement _movement;
    [SerializeField] private EnemyRhythmAttack _rhythmAttack;
    [SerializeField] private HealthComponent _healthComponent;

    private bool _isBerserk;
    private int _normalLoopCount;
    private DisposableBag _disposables;

    public event Action OnBerserkActivated;
    public event Action<bool> OnPatternSwitched;  // true=필인, false=기본
}
```

`_normalPattern`은 느린 4비트(`● _ _ _ ● _ _ _`, 2마디), `_burstPattern`은 연타(`● _ _ _ ● ● ● ●`, 2마디)다. 시퀀서가 패턴 루프를 완료할 때마다 `_normalLoopCount`를 증가시키고, `_normalMeasuresBeforeFillIn`(기본 3)에 도달하면 `_burstPattern`으로 전환한다.

광폭화 로직은 R3의 `DisposableBag`으로 관리한다. `HealthComponent.OnDamagedStream`을 구독해서 HP 비율이 임계값 이하로 떨어지면 발동한다.

```csharp
// 광폭화 시 변경되는 수치
_movement.SetMoveSpeed(_baseSpeed * _berserkSpeedMultiplier);  // 3.0 → 6.0 m/s
_rhythmAttack.TelegraphMultiplier = _berserkTelegraphMultiplier; // 0.8배 (20% 감소)
// 광폭화 후에는 매 루프마다 필인 발동 (_normalMeasuresBeforeFillIn 무시)
```

테스트는 35개. 패턴 SO 검증(노트 수, 비트 위치, 빛남 색상), 광폭화 전환(플래그, 이벤트, 속도 2배, 텔레그래프 0.8배), 패턴 사이클(기본 N회 → 필인 → 반복), HP 임계값 판정 등을 커버한다.

---

## MetronomeKnightAI: 런타임 BPM 전환

보스 AI의 기술적 핵심은 `RhythmManager`에 런타임으로 BPM을 주입하는 구조다.

```csharp
// MetronomeKnightAI.cs 실제 코드
public class MetronomeKnightAI : MonoBehaviour
{
    private const float DEFAULT_P1_BPM = 120f;
    private const float DEFAULT_P2_BPM = 240f;
    private const float DEFAULT_PHASE_TRANSITION_PAUSE = 1.0f;
    private const int DEFAULT_BOSS_HP = 500;

    [SerializeField] private EnemyPatternSO _phase1Pattern;  // ● _ _ _ ● _ _ _ (Red)
    [SerializeField] private EnemyPatternSO _phase2Pattern;  // ● _ ● _ ● _ ● _ (Orange)
    [SerializeField] private float _phase1BPM = DEFAULT_P1_BPM;
    [SerializeField] private float _phase2BPM = DEFAULT_P2_BPM;
    [SerializeField] private float _bpmTransitionDuration = 1.0f;
    [SerializeField] private RhythmManager _rhythmManager;

    public event Action OnPhase2Activated;
    public event Action<float, float> OnBPMTransitionRequested;  // (targetBPM, duration)
    public event Action OnBGMTransitionRequested;
    public event Action<bool> OnPatternSwitched;  // true=P2
}
```

P1은 BPM 120, 패턴 `● _ _ _ ● _ _ _`(2마디, Red 빛남, 대미지 20). P2는 BPM 240, 패턴 `● _ ● _ ● _ ● _`(더블타임, Orange 빛남, 대미지 15). HP 500.

페이즈 전환 시 1초 정지(`_phaseTransitionPause`) 후 `OnBPMTransitionRequested` 이벤트를 발행한다. `RoguelikeBootstrap`이 이 이벤트를 받아서 `RhythmManager.SetBPM()`을 호출하고, `AudioLayerManager`가 BGM 레이어를 Base → Boss로 전환한다. 보스 AI 자체는 RhythmManager를 직접 호출하지 않고 이벤트로 위임한다.

`_phase2Speed`(4.5 m/s)는 P1 기본 속도(3.0 m/s)의 1.5배. BPM이 2배로 올라가면서 이동 속도는 1.5배만 올리는 이유는, 2배로 하면 플레이어가 따라잡을 수 없기 때문이다. 대신 대미지를 20 → 15로 낮춰서, "빠르지만 한 발 한 발이 약한" 체감을 만든다.

---

## GameLifetimeScope: VContainer 조건부 DI 등록

VContainer DI의 진입점이다. `RunConfigSO` 할당 여부로 로그라이크 서비스 등록을 분기한다.

```csharp
// GameLifetimeScope.cs — 실제 등록 구조
public class GameLifetimeScope : LifetimeScope
{
    [SerializeField] private CombatTimingConfigSO _combatTimingConfig;
    [SerializeField] private RunConfigSO _runConfig;  // null이면 로그라이크 비활성

    protected override void Configure(IContainerBuilder builder)
    {
        // 항상 등록: 전투 코어
        builder.RegisterInstance(_combatTimingConfig);
        builder.RegisterComponentInHierarchy<RhythmManager>();
        builder.RegisterComponentInHierarchy<BeatJudge>();
        builder.Register<DamageCalculator>(Lifetime.Singleton);

        // RunConfigSO가 있을 때만: 로그라이크 서비스
        if (_runConfig != null)
        {
            builder.RegisterInstance(_runConfig);
            builder.Register<RunManager>(Lifetime.Singleton);
            builder.Register<RunMapGenerator>(Lifetime.Singleton);
            builder.Register<RewardGenerator>(Lifetime.Singleton);
            builder.Register<DifficultyScaler>(Lifetime.Singleton);
            builder.Register<ArtifactManager>(Lifetime.Singleton);
            builder.Register<StageFlowController>(Lifetime.Singleton);
        }
    }
}
```

`PrototypeBootstrap`(`DefaultExecutionOrder(-100)`)은 `_roguelikeMode` bool 플래그로 분기한다. `false`면 기존 즉시 전투 모드로 적 스폰/전투 초기화를 직접 수행한다. `true`면 적/전투 초기화를 스킵하고, `RoguelikeBootstrap`(`DefaultExecutionOrder(-90)`)이 런 루프를 제어한다.

`RoguelikeBootstrap`의 런 루프는 다음 흐름이다:
1. 런 시작 → `RunMapGenerator.GenerateMap(config, seed)` → 맵 UI 표시
2. 노드 선택 → 전투 노드면 `StageFlowController.EnterStage()` → `RhythmManager.SetBPM()` → `EnemySpawner.SpawnFirstWave()` → `PrototypeBootstrap.WireNewCombatEnemies()` 호출
3. 전투 승리 → `RewardGenerator`가 시드 기반(`seed ^ (nodeId × 31 + 7)`)으로 보상 3개 생성 → RewardSelectionUI 표시
4. 보상 선택 → `ArtifactManager.AddArtifact()` 또는 골드/HP 적용 → 맵 복귀

`DifficultyScaler`는 월드 인덱스에 따라 적 HP(`× (1 + worldIndex × 0.15)`), 공격력(`× (1 + worldIndex × 0.1)`), 텔레그래프 시간(`× max(0.5, 1 - worldIndex × 0.05)`)을 스케일링한다.

---

## 정리

| 항목 | 구현 |
|------|------|
| RunManager | R3 ReactiveProperty 상태 머신 + ValidTransitions Dictionary로 전이 규칙 정적 정의 |
| RunMapGenerator | System.Random(seed) + Fisher-Yates 부분 셔플 + EnsureNoIsolation. 순수 C# |
| FillInBerserkerAI | EnemyPatternSO 2종 전환 + R3 DisposableBag HP 구독 + 광폭화(속도×2, 텔레그래프×0.8) |
| HemiolaMageAI | 2박↔3박 패턴 교대 + 투사체 발사(12 m/s). 루프 완료마다 SetNextPattern |
| MetronomeKnightAI | P1 BPM 120 → P2 BPM 240 + 이벤트 위임(OnBPMTransitionRequested) |
| GameLifetimeScope | RunConfigSO null 체크로 로그라이크 DI 조건부 등록 |
| Bootstrap 분리 | DefaultExecutionOrder(-100/-90) + _roguelikeMode 플래그 |
| 테스트 | FillInBerserkerTests 35개, HemiolaMageTests 40개, MetronomeKnightTests 200+ 개 |

다음 단계는 보상 시스템(리듬 유물 6종, 스킬 변형 3종)과 이벤트 노드 콘텐츠다.

---

*R3 ReactiveProperty 상태 머신, Fisher-Yates 시드 맵, EnemyPatternSO 패턴 전환, VContainer 조건부 DI -- Phase 3 로그라이크의 기술적 뼈대를 세운 14일차.*
