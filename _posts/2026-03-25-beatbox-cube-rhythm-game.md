---
title: "BeatBox - 큐브가 비트에 맞춰 굴러가는 리듬 게임"
description: "RotateAround 피벗 회전, dspTime 비트 판정, TileSpawner 동적 생성과 커스텀 이징, DOTween 비트 글로우까지 BeatBox 전체 구현 기록."
date: 2026-03-25
categories: [Project]
tags: [Unity, AI]
---

## BeatBox

3D 큐브가 BPM에 맞춰 타일 위를 굴러가는 리듬 게임이다. 방향키로 조작하고, 빗박이면 즉사. [AI로 게임 개발하기 시리즈](/blog/2026/02/20/ai-game-dev-day-1/)의 Rhythm Rogue와는 별개 프로젝트로, 같은 dspTime 비트 엔진 위에 전혀 다른 게임성을 얹었다. Unity 6, URP, New Input System, DOTween, Unity MCP로 구성했다.

스크립트 11개로 전체가 돌아간다: GameManager, CubeController, CubeRoller, RhythmManager, JudgeSystem, LevelData, LevelLoader, TileSpawner, UIManager, BeatPulse, TileEffect.

---

## CubeRoller: RotateAround 피벗 회전

큐브의 구르기를 구현하는 핵심 클래스다. 단순 translate가 아닌, 바닥 모서리를 피벗으로 90도 회전시켜야 정육면체가 "구르는" 것처럼 보인다.

```csharp
// CubeRoller.cs 실제 코드
private const float CUBE_SIZE = 1f;
private const float HALF_SIZE = CUBE_SIZE / 2f;
private const float ROLL_ANGLE = 90f;
private const int ROLL_STEPS = 20;

[SerializeField] private float _rollDuration = 0.15f;
[SerializeField] private LayerMask _groundLayer;

private IEnumerator RollCoroutine(RollDirection direction, Vector3 moveDir, Vector3 nextGridPos)
{
    _isRolling = true;

    var pivot = transform.position + (moveDir * HALF_SIZE + Vector3.down * HALF_SIZE);
    var axis = GetRotationAxis(direction);
    var anglePerStep = ROLL_ANGLE / ROLL_STEPS;
    var timePerStep = _rollDuration / ROLL_STEPS;

    for (int i = 0; i < ROLL_STEPS; i++)
    {
        transform.RotateAround(pivot, axis, anglePerStep);
        yield return new WaitForSeconds(timePerStep);
    }

    _targetGridPosition = nextGridPos;
    SnapPosition();
    _isRolling = false;
    OnRollComplete?.Invoke();
}
```

`pivot`은 `transform.position + (moveDir * 0.5 + Vector3.down * 0.5)`로 계산한다. 이동 방향으로 반 칸, 아래로 반 칸 이동한 지점이 바닥 모서리다. `GetRotationAxis`는 방향에 따라 회전축을 결정한다: Forward → `Vector3.right`, Back → `Vector3.left`, Left → `Vector3.forward`, Right → `Vector3.back`.

20스텝 × 4.5도 = 90도. `_rollDuration` 0.15초를 20으로 나눈 0.0075초 간격으로 `RotateAround`를 호출한다. DOTween 대신 코루틴을 쓴 이유는, `RotateAround`가 피벗 기준 회전이라 DOTween의 `DORotate`로는 이 동작을 표현할 수 없기 때문이다.

### 그리드 스냅

```csharp
private void SnapPosition()
{
    var pos = _targetGridPosition;
    transform.position = new Vector3(pos.x, pos.y + HALF_SIZE, pos.z);

    var euler = transform.eulerAngles;
    transform.eulerAngles = new Vector3(
        Mathf.Round(euler.x / ROLL_ANGLE) * ROLL_ANGLE,
        Mathf.Round(euler.y / ROLL_ANGLE) * ROLL_ANGLE,
        Mathf.Round(euler.z / ROLL_ANGLE) * ROLL_ANGLE
    );
}
```

`RotateAround` 20회 후 부동소수점 오차가 누적된다. `SnapPosition`에서 위치를 그리드 좌표로, 회전을 90도 단위로 강제 보정한다. 이 보정이 없으면 50회 이상 구른 후 큐브가 타일과 어긋나 보인다.

롤 시작 전에 `HasGroundAt`이 레이캐스트(`Physics.Raycast(rayOrigin, Vector3.down, 3f, _groundLayer)`)로 다음 타일 유무를 확인한다. 타일이 없으면 `OnFall` 이벤트 → GameOver.

---

## CubeController: 타이밍 + 방향 이중 판정

입력 처리와 판정 로직을 담당한다.

```csharp
// CubeController.cs 실제 코드
private void OnMovePerformed(InputAction.CallbackContext ctx)
{
    if (GameManager.Instance.CurrentState != GameState.Playing) return;
    if (_roller.IsRolling) return;

    var input = ctx.ReadValue<Vector2>();
    var inputDir = GetRollDirection(input);
    if (!inputDir.HasValue) return;

    if (_rhythmMode && _judgeSystem != null)
    {
        var judgment = _judgeSystem.Judge();
        if (judgment == Judgment.Miss)
        {
            HandleFall();  // 타이밍 미스 → 즉사
            return;
        }

        if (_levelLoader != null)
        {
            var expectedDir = _levelLoader.GetDirectionAtBeat(_currentBeatIndex);
            var expectedRollDir = LevelDirToRollDir(expectedDir);
            if (inputDir.Value != expectedRollDir)
            {
                HandleFall();  // 방향 미스 → 즉사
                return;
            }
        }
    }

    _roller.TryRoll(inputDir.Value);
}
```

판정이 두 단계다. 먼저 `_judgeSystem.Judge()`로 타이밍을 검사한다. Miss가 아니면, `_levelLoader.GetDirectionAtBeat(_currentBeatIndex)`로 이 비트에 기대되는 방향을 가져와서 입력 방향과 비교한다. 둘 중 하나라도 실패하면 `HandleFall()` → `GameManager.GameOver()`.

New Input System의 `InputAction`을 코드에서 직접 생성한다. `AddCompositeBinding("2DVector")`로 화살표 + WASD 양쪽 바인딩을 등록한다.

---

## RhythmManager + JudgeSystem: dspTime 판정

```csharp
// RhythmManager.cs 실제 코드
public void StartMusic(AudioClip clip)
{
    _lastReportedBeat = -1;
    _dspSongStartTime = AudioSettings.dspTime + (_startBeatDelay * _secondsPerBeat);
    _audioSource.clip = clip;
    _audioSource.PlayScheduled(_dspSongStartTime + _audioOffset);
    _isPlaying = true;
}

public double GetTimingError()
{
    double currentTime = AudioSettings.dspTime;
    double songPosition = currentTime - _dspSongStartTime;
    double beatPosition = songPosition / _secondsPerBeat;
    double nearestBeat = Math.Round(beatPosition);
    double error = (beatPosition - nearestBeat) * _secondsPerBeat;
    return error;
}
```

`PlayScheduled`로 음악 시작 시각을 `_dspSongStartTime + _audioOffset`으로 정확히 예약한다. `_startBeatDelay`만큼의 박자를 미리 확보해서 카운트다운 시간을 확보한다.

`GetTimingError`는 현재 dspTime에서 곡 위치를 구하고, 가장 가까운 비트까지의 부호 있는 오차를 초 단위로 반환한다. `JudgeSystem.Judge()`가 이 값의 절대값을 `_perfectWindow`(0.08초)과 `_goodWindow`(0.15초)에 대해 비교한다.

```csharp
// JudgeSystem.cs 실제 코드
public Judgment Judge()
{
    double error = _rhythmManager.GetTimingError();
    double absError = Math.Abs(error);
    int nearestBeat = _rhythmManager.GetNearestBeatIndex();

    Judgment result;
    if (absError <= _perfectWindow)
        result = Judgment.Perfect;
    else if (absError <= _goodWindow)
        result = Judgment.Good;
    else
        result = Judgment.Miss;

    OnJudgment?.Invoke(result, nearestBeat, error);
    return result;
}
```

`OnJudgment` 이벤트로 `(Judgment, int beatIndex, double error)` 튜플을 전파한다. UIManager가 이 이벤트를 받아서 판정 텍스트("PERFECT" 초록 / "GOOD" 파랑)와 콤보 카운터를 표시한다.

---

## TileSpawner: 동적 생성 + 커스텀 이징 + 비트 글로우

가장 코드량이 많은 클래스다(316줄). 타일 동적 생성, 비행 애니메이션, 낙하 애니메이션, 비트 글로우를 전부 담당한다.

### 초기 생성: 즉시 + 비행

```csharp
// TileSpawner.cs 실제 코드
public void Initialize(Vector3[] positions, Material defaultMat, Material startMat, Material endMat)
{
    _spawnedTiles = new GameObject[positions.Length];
    _tileMaterials = new Material[positions.Length];
    _originalColors = new Color[positions.Length];

    // 첫 3개: 즉시 배치
    for (int i = 0; i < Mathf.Min(_initialVisibleCount, positions.Length); i++)
        SpawnTileImmediate(i);

    // 다음 5개: 비행 애니메이션 (0.12초 간격 스태거)
    int flyEnd = Mathf.Min(_initialVisibleCount + _lookAheadCount, positions.Length);
    for (int i = _initialVisibleCount; i < flyEnd; i++)
        SpawnTileFlyIn(i, (i - _initialVisibleCount) * 0.12f);
}
```

타일은 `GameObject.CreatePrimitive(PrimitiveType.Cube)`로 생성한다. 각 타일마다 `new Material(srcMat)`으로 인스턴스 머티리얼을 만들고, `EnableKeyword("_EMISSION")`을 활성화한다. 비트 글로우에서 개별 타일의 Emission 색상을 독립적으로 제어하기 위해서다.

### 커스텀 이징 함수

비행과 낙하에 DOTween 대신 코루틴 + 커스텀 이징을 쓴다.

```csharp
// TileSpawner.cs — 커스텀 이징
private static float EaseOutBack(float t)
{
    const float c1 = 1.70158f;
    const float c3 = c1 + 1f;
    return 1f + c3 * Mathf.Pow(t - 1f, 3f) + c1 * Mathf.Pow(t - 1f, 2f);
}

private static float EaseOutBounceLight(float t)
{
    if (t < 0.7f)
        return Mathf.Lerp(0f, 1.1f, t / 0.7f);  // 0→1.1 (오버슈트)
    else
        return Mathf.Lerp(1.1f, 1f, (t - 0.7f) / 0.3f);  // 1.1→1 (안착)
}
```

비행 코루틴에서 위치는 `EaseOutBack`(끝에서 살짝 튕기는 효과), 스케일은 `EaseOutBounceLight`(1.1까지 오버슈트 후 1.0으로 안착)를 사용한다. `LerpUnclamped`로 0~1 범위를 넘는 커브값을 허용한다.

```csharp
private IEnumerator FlyInCoroutine(Transform tile, Vector3 from, Vector3 to, float delay)
{
    if (delay > 0f) yield return new WaitForSeconds(delay);
    float elapsed = 0f;
    while (elapsed < _flyDuration)
    {
        elapsed += Time.deltaTime;
        float t = Mathf.Clamp01(elapsed / _flyDuration);
        tile.position = Vector3.LerpUnclamped(from, to, EaseOutBack(t));
        tile.localScale = Vector3.one * EaseOutBounceLight(t);
        yield return null;
    }
    tile.position = to;
    tile.localScale = Vector3.one;
}
```

비행 방향은 11개 후보(`Vector3.up`, `up+right`, `down+left` 등) 중에서 플레이어 뒤쪽이 아닌 방향을 랜덤 선택한다. `Vector3.Dot(candidate, playerBackDir) < 0.5f`로 필터링해서, 타일이 항상 플레이어 시야 안에서 날아오도록 한다.

### 비트 글로우

```csharp
// TileSpawner.cs — HandleBeat
private void HandleBeat(int beatIndex)
{
    int nextTileIndex = _currentPlayerIndex + 1;
    for (int i = 0; i < _glowAheadCount; i++)
    {
        int idx = nextTileIndex + i;
        if (idx < 0 || idx >= _allPositions.Length) continue;
        if (_spawnedTiles[idx] == null) continue;

        float intensity = Mathf.Lerp(_glowIntensity, _glowIntensity * 0.3f,
            (float)i / _glowAheadCount);
        Color color = _glowColors[(beatIndex + i) % _glowColors.Length];
        PulseTile(idx, intensity, color);
    }
}
```

플레이어 앞 2개 타일(`_glowAheadCount`)을 비트마다 펄스한다. 4색(crimson `#D90B56`, indigo `#423DD9`, yellow `#F2E966`, violet `#8C3FBF`)을 `beatIndex % 4`로 순환한다. 거리에 따라 intensity를 6.0 → 1.8로 감쇠시킨다.

`PulseTile`은 DOTween을 사용한다. `_BaseColor`와 `_EmissionColor`를 동시에 밝게 설정한 뒤, `DOColor`로 원래 색상으로 페이드한다. `DOPunchScale(0.12f, 0.3s)`로 스케일 펄스도 추가한다. `DOTween.Kill(tile.GetInstanceID())`로 이전 트윈을 정리해서 중첩을 방지한다.

### 타일 낙하

```csharp
private IEnumerator FallAwayCoroutine(GameObject tile)
{
    var startPos = tile.transform.position;
    var fallDir = (Vector3.down + new Vector3(
        Random.Range(-0.3f, 0.3f), 0f, Random.Range(-0.3f, 0.3f)
    )).normalized;
    var endPos = startPos + fallDir * _flyDistance;

    float elapsed = 0f;
    while (elapsed < _fallAwayDuration)
    {
        elapsed += Time.deltaTime;
        float progress = Mathf.Clamp01(elapsed / _fallAwayDuration);
        tile.transform.position = Vector3.LerpUnclamped(startPos, endPos, EaseInBack(progress));
        tile.transform.localScale = Vector3.one * (1f - progress);
        yield return null;
    }
    Destroy(tile);
}
```

플레이어가 지나간 타일(`_keepBehindCount` 1개 유지)은 아래 + 랜덤 X/Z 방향으로 `EaseInBack`(가속하면서 빨려들어가는 커브)으로 낙하하며 스케일이 0으로 축소된다. 0.25초면 끝.

---

## BeatPulse + UIManager: 이벤트 기반 피드백

```csharp
// BeatPulse.cs — 큐브 비트 펄스 (전체 코드)
private void HandleBeat(int beatIndex)
{
    _currentTween?.Complete();
    _currentTween = transform.DOPunchScale(_punchScale, _duration, _vibrato, _elasticity)
        .SetEase(Ease.OutQuad);
}
```

`DOPunchScale(0.2f, 0.3s, vibrato 4, elasticity 0.5)`로 큐브가 매 비트마다 통통 튄다. `Complete()`로 이전 트윈을 즉시 완료시켜서 스케일이 꼬이지 않게 한다.

UIManager(223줄)는 카운트다운, 콤보, 판정 텍스트, 진행도 바, 비트 인디케이터, Game Over 패널을 전부 관리한다. 카운트다운은 `DOScale(1.5 → 1.0, EaseOutBack)` + `DOToAlpha(0.3, delay 0.5)`로 숫자가 크게 나타났다가 페이드된다. 판정 텍스트는 Perfect이면 초록, Good이면 파랑, Miss면 빨강. 비트 인디케이터는 매 비트마다 하얀색으로 플래시한 뒤 원래 색으로 `Lerp`(속도 8)한다.

---

## 정리

| 클래스 | 핵심 구현 |
|--------|----------|
| CubeRoller | `RotateAround` 20스텝 피벗 회전 + 90도 단위 그리드 스냅 |
| CubeController | `JudgeSystem.Judge()` 타이밍 + `LevelLoader.GetDirectionAtBeat()` 방향 이중 판정 |
| RhythmManager | `PlayScheduled` + `dspTime` 기반 비트 추적 + `GetTimingError()` 부호 있는 오차 |
| JudgeSystem | Perfect ±80ms / Good ±150ms / Miss. `OnJudgment(result, beat, error)` 이벤트 |
| TileSpawner | 즉시/비행/낙하 3모드 + 커스텀 이징(EaseOutBack, EaseOutBounceLight) + DOTween 비트 글로우 |
| LevelData SO | BPM, audioOffset, startBeatDelay, Direction[] 시퀀스 |
| BeatPulse | `DOPunchScale` 비트 펄스 |

스크립트 11개, 총 약 1200줄. 가장 큰 건 TileSpawner(316줄)다. 커스텀 이징과 DOTween을 혼합해서 타일이 날아오고, 비트에 맞춰 빛나고, 지나가면 떨어지는 연출을 만들었다. 게임 로직 자체는 단순하지만, 주스(juice)가 체감을 만든다.

*RotateAround 피벗 회전, dspTime 이중 판정, 커스텀 이징 타일 비행, DOTween 비트 글로우 -- 스크립트 11개로 굴러가는 BeatBox의 전부다.*
