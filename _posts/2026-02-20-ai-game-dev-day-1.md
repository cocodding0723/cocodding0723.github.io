---
title: "AI로 게임 개발하기 - 1일차"
description: "AI로 뱀서라이크(Vampire Survivors 라이크) 게임을 만들어보자"
date: 2026-02-20
categories: [Project]
tags: [Unity, AI]
---

만들 게임 주제는 **뱀서라이크**(Vampire Survivors 라이크)로 정했다. 1일차에는 개발 환경 세팅에 올인했고, 그중 가장 먼저 한 일이 **Unity MCP**를 Cursor와 Claude Desktop에 연결하는 것이었다.

## Unity MCP를 Cursor·Claude Desktop에 추가하기

[Unity MCP](https://github.com/CoplayDev/unity-mcp)는 Claude·Cursor 같은 AI 어시스턴트가 Unity 에디터와 직접 통신하게 해주는 MCP(Model Context Protocol) 브릿지다. 에셋 관리, 씬 제어, 스크립트 편집, 반복 작업 자동화를 LLM에게 맡길 수 있다.

### 세팅 절차

1. **Unity 패키지 설치**  
   `Window > Package Manager > + > Add package from git URL...`에서 아래 주소 입력:
   ```
   https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#beta
   ```
2. **MCP 서버 실행**  
   Unity에서 `Window > MCP for Unity` 창을 열고 **Start Server** 클릭 (로컬 HTTP 서버가 `localhost:8080`에서 실행됨)
3. **Cursor MCP 설정**  
   MCP 클라이언트 설정 파일에 다음을 추가:
   ```json
   "mcpServers": {
     "unityMCP": {
       "url": "http://localhost:8080/mcp"
     }
   }
   ```
4. **연결 확인**  
   Cursor 설정에서 MCP를 켠 뒤, Unity 창에 🟢 "Connected ✓"가 보이면 준비 끝이다. **Claude Desktop**에도 동일한 `mcpServers` 설정을 넣어 두었고, 두 클라이언트 모두 정상 연결된다.

이제 Cursor나 Claude Desktop에서 "빨간, 파란, 노란 큐브 만들어줘"처럼 자연어로 Unity 작업을 지시할 수 있다.

## Claude 프로젝트 & PM 프롬프트 설정

2D 로그라이크 개발용 **Claude 프로젝트**를 하나 만들고, 프로젝트 지침(Project Guidelines)에 **1인 인디 모바일 게임 개발자용 PM 어시스턴트** 프롬프트를 넣었다.

![Claude 프로젝트 지침 설정 - PM 프롬프트](/assets/images/claude-pm-guidelines.png)

PM 프롬프트 요지는 아래와 같다.

- **역할**: 기획·개발·아트·QA를 혼자 맡는 개발자가 집중을 유지하고 프로젝트를 완주하도록 돕는 것. 과한 문서화보다 실질적인 진척과 완성에 초점.
- **프로젝트 컨텍스트**: 게임명, 장르/핵심 루프, 타겟 플랫폼, 엔진, 현재 단계, 목표 출시일, 현재 고민 — 대화 시작할 때마다 업데이트.
- **핵심 원칙**: 완성 > 완벽, 범위 크리프 경계, 주간 단위 리듬, 에너지 관리.
- **PM 역할**: 로드맵(MVP → 콘텐츠 완성 → 폴리싱/출시), 태스크·이슈 트래킹, 주간 회고, 가벼운 문서화(One-Page GDD, 기능 스펙, 아이디어 백로그 등).

주간 계획·GDD·기능 스펙·아이디어 백로그·리스크 메모 템플릿도 넣어 두었기 때문에, "이번 주 계획 세워줘", "GDD 작성 도와줘", "이번 주 회고 같이 해줘" 같은 요청을 바로 쓸 수 있다.


## Claude AI Agent 스킬 구성

Claude에서 아래 네 가지 프롬프트를 **스킬(Skill)**로 만들어 AI Agent에 적용해 두었다.

| 스킬 | 역할 |
|------|------|
| **인디 픽셀아트 게임 디자이너** | UI/UX, 캐릭터 아트 디렉션, 레벨 디자인, 게임플레이 시스템 — 1인 개발 리소스 한계를 고려한 현실적 제안 |
| **Unity 2D 게임 개발** | C# 코드 작성·리뷰, 게임 디자인·기획, 아트 에셋 가이드, 버그 디버깅 — Unity LTS 기준 실행 가능한 지원 |
| **1인 개발자 전용 게임 기획자** | Core Loop 설계, MVP 스코프 관리, 밸런싱, 수치 설계 — 혼자 기획·개발·출시까지 염두에 둔 파트너 |
| **게임 QA 전문가** | 버그 리포트 템플릿, 테스트 케이스 설계, 밸런스 검토, 릴리즈 체크리스트 — 품질 관리 전반 지원 |

기획·디자인·개발·QA를 각각 맡는 AI 역할을 두고, 상황에 따라 골라 쓸 수 있게 해 두었다.

## Agent Team 통합 시스템 프롬프트

위 네 역할이 **한 대화 안에서 자동으로 전환**되도록 **1인 인디 모바일 게임 개발 — Agent Team 통합 시스템 프롬프트**를 만들어 Claude에 넣어 두었다. 이 프롬프트 덕분에 "올인원 개발 파트너" 한 명이 요청 키워드(GDD·기획서·픽셀아트·C# 코드·테스트·주간 계획 등)에 맞춰 PM·게임 기획자·게임 디자이너·Unity 개발자·QA 엔지니어 중 하나를 스스로 골라 응답한다. 공통 원칙은 완성 > 완벽, 범위 크리프 경계, 빠른 결정 후 검증, 에너지 관리, 실행 가능한 산출물 우선이다. 역할별로 태스크 형식, 주간 계획/회고 템플릿, 버그 리포트/테스트 케이스 템플릿, 밸런스 검토 관점을 갖추었다. **이 통합 프롬프트로** 기획서 작성 → 로드맵·마일스톤 정리 → GDD 기반 구현 방향 설정까지 이어 붙여, 실제 게임 개발 흐름을 만들었다.

## Claude Code 에이전트 팀 구성

**[디자이너 + 개발자] 병렬 작업**을 실제로 쓰기 위해 [Claude Code의 에이전트 팀(Agent Teams)](https://code.claude.com/docs/ko/agent-teams)도 구성해 두었다. 여러 Claude Code 인스턴스가 팀 단위로 움직이게 하며, 공유 작업 목록·에이전트 간 메시징·팀 리더의 할당/종합을 지원한다.

- **팀 리더**: 작업 분배, 팀원 생성, 결과 종합을 맡는 메인 세션
- **팀원**: 할당된 작업만 담당하는 별도 Claude Code 인스턴스. 서로 메시지 주고받기 가능
- **공유 작업 목록**: 팀 전체가 보는 작업 목록. 대기 → 진행 중 → 완료와 작업 간 종속 관계 관리

에이전트 팀은 **실험 기능**이라 기본 비활성화되어 있다. `settings.json`의 `env`에 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"`을 넣거나 셸 환경 변수로 설정해야 쓸 수 있다. 병렬 탐색이 유리한 경우(연구·검토, 모듈별 분담, 경쟁 가설 디버깅, 프론트/백/테스트 교차 작업)에 쓰고, 단순 순차 작업이나 같은 파일을 여러 명이 건드리는 상황에서는 단일 세션이나 subagents가 더 낫다. 디자이너·개발자를 팀원으로 두고 병렬로 돌릴 때 이 구성을 쓰면 된다.

![1인 인디 모바일 게임 개발 파트너 시스템 - 활성화된 전문 역할](/assets/images/claude-agent-roles.png)

## 기획서 작성 및 에이전트 팀 공유

PM이 만든 프로젝트 계획을 바탕으로 **게임 기획자 Agent** 역할로 Claude에 **2D 자동 사냥 로그라이크 기획서(GDD)** 작성을 요청했다. Vampire Survivors 라이크, 10분 세션, 무기 6종·적 5종·스테이지 3개·보스 1종 등 MVP 범위를 정한 뒤, 핵심 루프·플레이어/무기/적/보스 시스템·스테이지 설계·레벨업·메타 성장·경제·UI/UX·수익화·밸런싱 수치 테이블·기술 설계 가이드·MVP 기능 분류·마일스톤까지 담은 GDD가 나왔다.

이 **기획서를 에이전트 팀에 공유해 두었다.** 팀원이 `CLAUDE.md`나 프로젝트 컨텍스트로 같은 GDD를 참조하게 해 두면, 디자이너·개발자·QA가 각자 작업할 때 "무엇을 만드는지"를 하나의 기준으로 맞출 수 있다. 구현과 밸런싱은 앞으로 이 GDD를 기준으로 에이전트 팀이 병렬로 진행할 예정이다.

## 게임 개발 흐름

이 환경으로 진행할 개발 흐름은 아래와 같다. 단계마다 사용자 검토(⏸️)를 두고, 승인하면 다음 단계로, 수정 요청이 있으면 해당 Agent에서 다시 작업하는 구조다.

```
[PM Agent] 결과 생성
    ↓
⏸️ [사용자 검토] ← 승인 / 수정 요청
    ↓
[기획자 Agent] 결과 생성
    ↓
⏸️ [사용자 검토] ← 승인 / 수정 요청
    ↓
[디자이너 + 개발자] 병렬 작업
    ↓
⏸️ [사용자 검토] ← 승인 / 수정 요청
    ↓
[QA 루프] 자동 진행
    ↓
⏸️ [최종 검토]
    ↓
  완성 🎮
```

PM → 기획자 → 디자이너·개발자 병렬 → QA 루프 순으로 이어지며, 각 단계에서 사용자가 최종 검증을 맡는다. 이 환경으로 뱀서라이크 게임 개발을 진행할 예정이다.

**《1인 인디 모바일 게임 개발 — Agent Team 통합 시스템 프롬프트》**를 Claude에 넣어 두고 요청할 때마다 PM·게임 기획자·게임 디자이너·Unity 개발자·QA 엔지니어가 자동으로 전환되게 했다. GDD·주간 계획·코드·테스트 케이스까지 이 프롬프트 한 흐름으로 이어 붙여 나가고 있다.

---

아래는 위와 같은 환경으로 하루 만에 만든 **AI Survivor** 프로토타입의 요약이다.

## 1. 서론 — 왜 AI와 함께 게임을 만들었는가

> 인디 개발자가 AI 코딩 어시스턴트와 함께 Vampire Survivors 스타일의 2D 자동사냥 로그라이크를 만들어간 과정을 정리한 글이다.

혼자 게임을 만들어 본 적이 있다면 "기획은 넘치는데 구현이 안 따라온다"는 좌절을 겪어 봤을 것이다. 나도 마찬가지였다. Vampire Survivors를 하면서 "이 정도 시스템이면 나도 만들 수 있지 않을까?"라는 생각이 들었고, 그 아이디어를 **Claude Code**와 함께 현실로 옮겨 보기로 했다.

**AI Survivor**는 30분 세션 동안 점점 강해지는 적의 물결을 헤쳐 나가며 생존하는 2D 자동사냥 로그라이크다. 플레이어 캐릭터는 장착한 무기로 자동 공격하고, 플레이어는 이동과 전략적 업그레이드 선택에 집중한다.

**프로토타입 플레이 영상**

<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 1em 0;">
  <iframe style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" src="https://www.youtube.com/embed/PeM1KSJJFwQ" title="AI Survivor 프로토타입 플레이" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>

### 사용 도구

| 도구 | 역할 |
|------|------|
| **Unity 6 (URP 17.3.0)** | 게임 엔진 |
| **Claude Code** | AI 코딩 어시스턴트 (코드 생성, 리팩토링, 아키텍처 설계) |
| **MCP (Model Context Protocol)** | Claude Code와 Unity Editor 간 직접 통신 (설정 방법은 글 상단 참고) |
| **Input System 1.18.0** | 터치/키보드 입력 추상화 |

---

## 2. 프로젝트 셋업 — 기초 다지기

### 아키텍처 결정

프로젝트 초기에 결정한 것은 두 가지다.

**첫째, ScriptableObject 기반 데이터.** 무기·적·스테이지·업그레이드 등 수치 데이터를 전부 SO로 분리해 Inspector에서 밸런싱할 수 있게 설계했다.

```csharp
[CreateAssetMenu(menuName = "AI-Roguelike/Weapon Data")]
public class WeaponData : ScriptableObject
{
    public string weaponName;
    public Sprite icon;

    [Header("공격 스탯")]
    public float damageMultiplier = 1.0f;
    public float attackInterval = 1.0f;
    public float projectileSpeed = 0f;
    public float range = 5f;
}
```

**둘째, 오브젝트 풀링.** 적, 투사체, 경험치 젬, 데미지 숫자처럼 자주 생성/파괴되는 오브젝트를 `ObjectPoolManager` 싱글턴으로 관리한다. 모바일 타겟이라 GC 압박을 줄이는 게 필수였다.

이번에 구현한 핵심 스크립트는 다음과 같다.
- `PlayerController` — Input System 기반 8방향 이동
- `PlayerStats` — HP, ATK, 이동속도 등 스탯 관리
- `GameManager` — 게임 상태 머신 (Menu, Playing, LevelUp, Paused, GameOver, StageClear)
- `ObjectPoolManager` — 중앙 집중식 오브젝트 풀링
- `CameraController` — 플레이어 추적 + Perlin noise 기반 카메라 셰이크

---

## 3. 코어 루프 구현

### 전투의 뼈대

무기 시스템의 기반이 되는 `WeaponBase` 추상 클래스를 설계했다. 모든 무기는 이 클래스를 상속하고 `Attack()`만 오버라이드하면 된다.

```csharp
public abstract class WeaponBase : MonoBehaviour
{
    [SerializeField] protected WeaponData _weaponData;
    [SerializeField] private WeaponLevelData[] _levelDataArray;

    protected abstract void Attack();  // 각 무기가 구현

    private void Update()
    {
        _attackTimer += Time.deltaTime;
        if (_attackTimer >= _weaponData.attackInterval)
        {
            Attack();
            _attackTimer = 0f;
        }
    }
}
```

첫 무기 2종(나이프, 채찍)과 적 2종(슬라임, 박쥐)을 구현하고, `EnemySpawner`로 웨이브 기반 스폰을 만들었다.

### 성장의 쾌감

레벨업 시 3개 선택지 중 하나를 고르는 업그레이드 시스템과 실시간 HUD를 구현했다. `UpgradeData` SO로 업그레이드 항목을 데이터로 분리해 두어서, 새 업그레이드는 SO 에셋 하나만 추가하면 됐다.

### 목표와 마무리

보스 시스템(`BossEnemy`, `BossController`)과 결과화면(`ResultUI`)을 넣어 한 판의 시작과 끝이 있는 게임 루프를 완성했다. [Undead Survivor](https://goldmetal.co.kr) 스프라이트 시트를 적용해 플레이스홀더를 벗어난 비주얼을 갖췄다.

### 무기 다양성

6종 무기(나이프, 채찍, 번개, 화염구, 오라, 부메랑)를 완성했다. 공격 패턴이 확 달라져서, 이 시점부터 "어떤 무기 조합을 가져갈지" 전략적 선택이 의미를 갖기 시작했다.

---

## 4. 메타 시스템 — 한 판을 넘어서

### 영구 진행

`MetaManager`로 PlayerPrefs 기반 코인/메타 업그레이드를 구현했다. 런 종료 시 획득 코인으로 영구 스탯 강화를 구매하는 메타 상점을 넣어 "한 판 더" 동기를 만들었다.

### 캐릭터와 스테이지

플레이어블 캐릭터 3종(농부/마법사/도적)과 스테이지 2개(초원/던전)를 추가했다. `CharacterData` SO에 스탯 배율·시작 무기, `StageData` SO에 적 구성·난이도 배율을 두어, 데이터만 추가해도 콘텐츠가 늘어나게 했다.

### 통계와 업적

누적 통계 8종(총 처치 수, 누적 피해량, 플레이 횟수 등)과 업적 7종을 넣었다. 세션 종료 시 `GameManager`가 통계를 기록하고 업적 달성 여부를 체크해 보상을 지급하는 흐름이다.

---

## 5. 적 시스템 리뉴얼 — 2종에서 7종+사신으로

초기의 슬라임/박쥐 2종에서 벗어나 본격적인 적 생태계를 만들었다.

### 5종의 고유 AI

| 적 | 행동 패턴 | HP | EXP |
|----|----------|-----|-----|
| **떼쟁이(Swarmer)** | 단순 추적, 대량 스폰 | 8 | 1 |
| **돌진자(Charger)** | 예고 후 돌진 공격 | 25 | 3 |
| **파수꾼(Sentinel)** | 고정 포탑, 투사체 발사 | 15 | 3 |
| **방패병(Blocker)** | 전면 공격 무효화, 느린 접근 | 30 | 5 |
| **분열체(Splitter)** | 사망 시 소형 2마리로 분열 | 20 | 4 |

각 적은 `EnemyBase`를 상속해 `MoveTowardsPlayer()`와 전투 로직을 오버라이드한다. `OnEnable()` 시점에 시간 배율이 적용되므로, 같은 떼쟁이도 게임 후반에는 다른 위협이 된다.

### 시간 배율 시스템

`TimeScalingData` SO에 `AnimationCurve`로 30분 동안의 난이도 곡선을 둔다. Inspector에서 곡선을 조절할 수 있어 밸런싱이 직관적이다.

```csharp
[CreateAssetMenu(menuName = "AI-Roguelike/Time Scaling Data")]
public class TimeScalingData : ScriptableObject
{
    [Header("시간별 HP 배율")]
    public AnimationCurve hpMultiplier = new AnimationCurve(
        new Keyframe(0f, 1.0f),   // 시작: 1배
        new Keyframe(15f, 3.5f),  // 15분: 3.5배
        new Keyframe(25f, 8.0f),  // 25분: 8배
        new Keyframe(30f, 10.0f)  // 30분: 10배
    );

    public float GetHPMultiplier(float minutes) => hpMultiplier.Evaluate(minutes);
}
```

### 사신(Reaper) 시스템

29분 30초에 무적의 사신이 등장한다. 접촉 시 즉사라, "이제 도망칠 때"라는 최종 압박을 주는 역할이다.

---

## 6. 무기 시스템 대확장 — 6종에서 20종 이상으로

### 무기 분류 체계

| 분류 | 무기 목록 |
|------|----------|
| **근접** | 나이프, 채찍, 창, 도끼, 검기 |
| **원거리** | 화살, 권총, 샷건, 레일건, 로켓 런처 |
| **마법** | 화염구, 번개, 매직 미사일, 독구름 |
| **소환/장판** | 오라, 부메랑, 빙벽, 썬더존, 터렛, 가디언 |
| **설치** | 지뢰, 블랙홀 |

무기 관련 스크립트 39개(`WeaponBase` 서브클래스 + Projectile/Entity)가 같은 아키텍처 위에서 동작한다.

### 패시브 아이템 & 무기 진화

패시브 아이템은 스탯 보너스를 주고, 최대 레벨 무기와 대응 패시브를 함께 보유하면 **무기 진화**가 발동한다. `WeaponEvolutionManager`와 `EvolutionData` SO가 이 시스템을 맡는다.

### 에디터 자동화

무기가 20종을 넘기면서 SO 에셋을 수동으로 만드는 게 비효율적이 됐다. `WeaponDataGenerator`, `PassiveItemGenerator`, `EvolutionDataGenerator` 같은 에디터 스크립트를 만들어 `Tools` 메뉴에서 한 번에 전체 데이터 에셋을 생성할 수 있게 했다.

---

## 7. 사운드, 연출, VFX 통합

### DamageNumber 플로팅 텍스트

적에게 데미지를 줄 때 숫자가 떠오르며 사라지는 연출이다. TextMeshPro로 구현했고, `ObjectPoolManager`로 풀링해 GC 부담을 줄였다.

### 카메라 셰이크

Perlin noise 기반 카메라 셰이크로 타격감을 높였다. 피격 시 `CameraController.ShakeCameraStatic()`을 호출하면 된다.

### 오디오 시스템

`AudioManager` 싱글턴이 BGM·SFX를 관리한다. WeaponData에 `attackSFX`, EnemyData에 `hitSFX`/`deathSFX` 필드를 넣어, SO에 오디오 클립만 드래그앤드롭하면 사운드가 연결되게 했다. 8비트 스타일 BGM 10트랙을 포함한다.

---

## 8. 코드 품질 개선 — 70개 파일 동시 리팩토링

프로젝트가 커지면서 코드 컨벤션 통일이 필요해졌다.

### .editorconfig 기반 코딩 컨벤션

```
# 주요 규칙
- private/protected 필드: _camelCase (언더스코어 접두사)
- 상수: UPPER_SNAKE_CASE
- 접근 제한자 항상 명시
- SerializeField 리네임 시 [FormerlySerializedAs] 필수
- 한국어 주석, Allman 중괄호
```

### 병렬 에이전트 리팩토링

컨벤션을 소급 적용하려고 **Claude Code 에이전트 4개를 병렬로 돌려** 70개 이상 C# 파일을 한꺼번에 리팩토링했다. 필드명을 `weaponData` → `_weaponData`로 바꿀 때 `[FormerlySerializedAs("weaponData")]`를 함께 넣어 Inspector SO 참조가 끊기지 않게 했다.

```csharp
// 리팩토링 전
[SerializeField] WeaponData weaponData;

// 리팩토링 후 - 기존 직렬화된 참조 안전하게 유지
[FormerlySerializedAs("weaponData")]
[SerializeField] protected WeaponData _weaponData;
```

수동으로 했으면 며칠 걸렸을 작업을, 병렬 에이전트 덕분에 한 세션 안에 마쳤다.

---

## 9. AI 보조 개발의 장점과 한계

### 장점

**빠른 프로토타이핑.** "부메랑 무기 만들어줘, 곡선 궤적으로 갔다 돌아오는 패턴으로"라고 하면 `BoomerangWeapon`과 `BoomerangProjectile`이 몇 분 안에 나온다. 20종 무기를 혼자 처음부터 짜면 상당한 노동이지만, AI와 함께하면 패턴별 핵심 로직에만 집중할 수 있다.

**반복 작업 자동화.** SO 정의, 에디터 헬퍼, UI 코드처럼 구조가 비슷한 작업은 AI가 특히 잘 맡는다. `WeaponDataGenerator` 같은 에디터 유틸을 요청하면 기존 패턴을 참고해 일관된 코드를 만든다.

**MCP로 Unity Editor 직접 조작.** 1일차에 세팅한 MCP 덕분에 채팅만으로 씬 배치·컴포넌트 추가·SO 생성이 가능했고, 실제 개발에서 체감이 가장 컸다.

**일관된 코드 스타일.** 컨벤션 문서를 한 번 정해 두면 AI가 새 코드에 같은 스타일을 적용한다.

### 한계

**복잡한 시각 디자인.** AI는 게임플레이 로직은 잘 만들지만 "이 이펙트가 어떻게 보일지"는 판단하기 어렵다. 지금도 무기 투사체 상당수가 코드로 만든 단색 도형이다. 이 부분은 결국 아티스트 에셋으로 갈아타야 한다.

**게임 밸런싱 감각.** 수치를 채우는 건 가능해도, "이 난이도 곡선이 재미있는가?"는 사람이 직접 플레이해 봐야 안다.

**SO 참조 관리.** MCP로 SO를 만들었다가 씬 참조가 끊기는 경우가 있었다. null fallback을 넣거나 에디터 스크립트로 재할당하는 식의 우회가 필요했다.

### 실전 팁

1. **컴파일 에러를 먼저 잡자.** 스크립트 에러 하나가 Assembly-CSharp 전체 컴파일을 막아서 MCP 컴포넌트 추가가 전부 실패한다.
2. **커스텀 컴포넌트 추가 시** `component_type`을 `"ClassName, Assembly-CSharp"` 형태로 지정해야 한다.
3. **병렬 에이전트를 쓰자.** 무기 A와 적 B처럼 독립된 시스템은 동시에 작업할 수 있다.
4. **MEMORY.md를 유지하자.** AI가 맥락을 잃지 않도록 진행 상황을 기록해 두자.

---

## 10. 마무리 — 현재와 앞으로

### 현재 진행 상황

| 구분 | 내용 |
|------|------|
| 무기 | 20종 이상 (근접/원거리/마법/소환/설치) |
| 적 | 7종 + 사신 (떼쟁이, 돌진자, 파수꾼, 방패병, 분열체, 슬라임, 박쥐) |
| 캐릭터 | 3종 (농부, 마법사, 도적) |
| 스테이지 | 2종 (초원, 던전) |
| 메타 시스템 | 코인 상점, 영구 업그레이드, 통계, 업적 |
| 사운드 | BGM 10트랙, SFX 전체 연결 완료 |
| 스크립트 수 | C# 파일 80개 이상 |

### 앞으로의 계획

1. **리소스 교체** — 프로시저럴 스프라이트를 실제 에셋으로 교체
2. **VFX 폴리싱** — Cartoon FX Remaster 통합 마무리
3. **밸런싱** — 실제 플레이테스트 기반 수치 조정
4. **모바일 최적화** — 터치 UI, 성능 프로파일링
5. **출시 준비** — 스토어 등록, 광고/IAP 연동

### Claude Code로 게임 개발하기를 추천하는 이유

하루 만에 20종 무기, 7종 적, 메타·업적·통계까지 갖춘 프로토타입을 만들 수 있었던 건 AI 보조 개발 덕분이다. AI가 모든 걸 해주진 않는다. 기획, 밸런싱, 아트 디렉션, 최종 판단은 여전히 사람 몫이다. 대신 "아이디어를 코드로 옮기는 속도"가 확 빨라진다는 점은 분명하다. 인디 게임 개발을 시작하려는 분, 프로토타입을 빨리 만들어 보고 싶은 분에게는 Claude Code + Unity MCP 조합을 추천한다.

---

*이 글은 AI Survivor 프로젝트의 개발 과정을 정리한 것이다.*  
*스프라이트 에셋: [Undead Survivor](https://goldmetal.co.kr) · AI 보조 개발: [Claude Code](https://claude.ai/claude-code)*
