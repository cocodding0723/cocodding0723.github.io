---
title: "ECC(Everything Claude Code) 전체 리뷰 — 에이전트 63 + 스킬 249짜리 메가 하네스, 다 쓰긴 하나"
description: "5개월 만에 별 20만 개 찍은 Claude Code 하네스 ECC를 전체 리뷰한다. 에이전트 63, 스킬 249, MCP 14개를 통째로 깔아야 하나, AgentShield와 ECC 2.0은 진짜인가, 정직한 한계까지."
date: 2026-06-04
categories: [Dev]
tags: [AI, Blog]
---

ECC를 처음 설치했을 때 제일 인상 깊었던 건 스킬 카탈로그가 아니라, ECC 자신을 잘라내는 게 일인 스킬이 들어있다는 점이었다. 이름은 `agent-sort`. 이 스킬의 일은 "내 레포가 진짜로 필요로 하는 만큼만 ECC를 추리는 것"이다. 별 20만 개짜리 프로젝트가, 자기 자신을 통째로 쓰지 말라고 권하는 도구를 기본 탑재하고 있다. 이 글은 그 아이러니에서 시작한다.

ECC(Everything Claude Code)는 Affaan Mustafa가 만든 Claude Code용 에이전트 하네스다. 2026년 1월 18일에 공개됐고, 오늘(2026-06-04) GitHub API 기준으로 **별 205,768개, fork 31,594개, 라이선스 MIT**다. 공개된 지 약 5개월 만의 숫자다.

규칙 레이어는 [지난 글]({% post_url 2026-05-03-claude-code-ecc-rules-adoption %})에서 다뤘다. 이번엔 규칙만이 아니라 에이전트 / 스킬 / 훅 / AgentShield / cross-harness / ECC 2.0까지 전체 프로젝트를 본다. 나는 지금 내 Claude Code에서 ECC를 실제로 돌리고 있고, 그래서 칭찬할 부분과 의심하는 부분을 둘 다 솔직하게 적을 수 있다.

## ECC가 대체 뭔가 — "Everything"이라는 이름값

ECC는 스스로를 "the agent harness performance optimization system"이라고 부른다. 핵심은 Claude Code의 native primitive(skill, subagent, hook, plugin)들을 거대한 번들로 미리 채워 넣고, 거기에 다른 하네스용 어댑터까지 붙인 것이다. 라이브 README가 밝히는 규모는 이렇다.

| 구성 요소 | 수량 | 역할 |
|-----------|------|------|
| subagents | 63 | planner, architect, code-reviewer, security-reviewer, 언어별 리뷰어, build-error-resolver 등 위임 단위 |
| skills | 249 | TDD, security-review, api-design, frontend/backend 패턴, framework 스킬, continuous-learning, deep-research 등 워크플로 표면 |
| legacy command shims | 79 | commands→skills 마이그레이션 동안 유지되는 슬래시 명령 호환층 |
| MCP servers | 14 | Claude Code 기준 (Codex는 6개, Supabase 포함 시 7개) |

여기서 미리 한 가지 짚는다. 리서치하다 보면 "에이전트 13~48개, 스킬 39~183개, 별 8.2만~16.3만 개" 같은 숫자가 여러 글에 돌아다닌다. 전부 stale snapshot이다. 레포가 워낙 빨리 자라서 어제 적힌 수치가 오늘 틀린다. 이 글에서 권위 있는 출처는 라이브 README(63 / 249 / 79 / 14)와 라이브 GitHub API(205,768)뿐이다.

철학은 한 줄로 요약된다. **"Rules tell you WHAT; Skills tell you HOW."** 규칙은 무엇을 할지, 스킬은 어떻게 할지를 담당한다. 거기에 research-first, TDD 80%+ coverage, token optimization, hook 기반 cross-session memory persistence, confidence scoring이 붙은 continuous learning, security-by-default가 얹힌다. 말로만 들으면 흠잡을 데 없다.

작가의 배경도 이 바이럴을 설명한다. Affaan은 2025년 9월 NYC에서 열린 Anthropic x Forum Ventures 해커톤에서 Claude Code로 zenith.chat을 만들어 우승했고, 자기 개인 설정을 2026년 1월에 ECC로 오픈소스화했다. "전투에서 검증된 개인 config가 바이럴 탄" 서사가 여기서 나온다.

## 똑똑한 부분은 진짜로 똑똑하다

비판하기 전에 공정하게 인정한다. ECC에는 native Claude Code + 잘 짠 CLAUDE.md만으로는 안 나오는 차별화 포인트가 분명히 있다.

**1) cross-harness portability.** 하나의 canonical source에서 Claude Code, Codex, Cursor, OpenCode, Gemini, Zed, GitHub Copilot, Antigravity, Kiro용 어댑터를 뽑아낸다. `.cursor/`, `.codex/`, `.opencode/`, `.zed/`, `.github/`로 흩어진다. 여러 하네스를 오가는 사람이라면 이 한 가지만으로도 값어치를 한다.

**2) AgentShield.** Claude Code 설정 자체를 보안 감사하는 도구다. 명령은 이렇다.

```bash
npx ecc-agentshield scan --opus --stream
```

README에 따르면 102개의 static analysis rule로 vulnerability / misconfig / injection risk를 훑고, `--opus` 플래그를 주면 **Claude Opus 4.6 에이전트 3개가 red-team / blue-team / auditor 파이프라인**으로 돈다. 대부분의 팀은 자기 에이전트 config를 보안 관점에서 감사하는 도구를 따로 만들지 않는다. 이건 진짜 빈틈을 메운다.

다만 README가 자랑하는 "1,282 tests, 98% coverage" 같은 수치는 전부 저장소가 공개한 self-reported 수치다. 그대로 믿지 말고 기억해 둔다.

**3) continuous learning v2 (instincts).** 세션에서 instinct를 추출하고 confidence score를 매겨 memory로 persistence한다. hook이 SessionStart / PreToolUse / PostToolUse / Stop 시점에 secret detection, auto-format, memory 저장, compaction 제안을 처리한다. 잘 돌면 세션 간 학습이 누적되는 구조다.

내 Ultra Harness에서도 결국 비슷한 걸 직접 만들어 쓰고 있었다. 차이는, 나는 내가 무엇을 왜 넣었는지 전부 알고 있다는 점이다. ECC는 그 반대다.

## 내가 의심하는 지점 / 한계

여기서부터가 이 리뷰의 본론이다.

### 핵심 아이러니: ECC가 ECC를 잘라낸다

위에서 말한 `agent-sort` 스킬. 이 환경의 라이브 스킬 메타데이터를 그대로 인용하면 이렇다.

```text
...sorting skills, commands, rules, hooks, and extras into DAILY vs LIBRARY
buckets... Use when ECC should be trimmed to what a project actually needs
instead of loading the full bundle.
```

README 표에는 "Sort agent catalogs and assignment surfaces"라고 밋밋하게 적혀 있어서 이 의도가 잘 안 보인다. 하지만 권위 있는 라이브 스킬 메타데이터는 명확하다. **스킬, 명령, 규칙, 훅, 부가물을 DAILY와 LIBRARY로 나눠서, 전체 번들을 통째로 로드하는 대신 프로젝트가 실제로 필요한 만큼으로 ECC를 잘라내라**는 것이다.

이건 결정적이다. 63 에이전트 / 249 스킬 / 79 shim / 14 MCP짜리 번들이, 자기를 DAILY subset으로 줄이는 게 일인 스킬을 기본 탑재한다는 건 곧 **"전체 번들은 통째로 돌리기엔 너무 크다"는 자기 고백**이다. 같은 긴장은 수치로도 드러난다. README가 권하는 위생 수칙 "MCP 10개 미만, active tool 80개 미만"을 full install(MCP 14개)이 스스로 어긴다.

### context-window 비용

스킬, 규칙, 훅, MCP tool 정의는 전부 진짜 작업이 시작되기도 전에 context를 먹는다. tool definition, skill metadata, rule 텍스트가 system context로 미리 올라간다. context rot을 다룬 업계 글들의 논지는 일관된다. bloated된 instruction/skill 파일은 "모델이 네가 시킨 문제에 닿기도 전에 그 배경을 다 들고 있느라 더 힘들게 일한다"는 것이다.

여기서 ECC의 token 절감 팁이 묘하게 읽힌다. README는 이렇게 권한다.

```bash
# 저장소가 공개한 비용 절감 조합 (self-reported)
# model: sonnet             -> ~60% 비용 절감
# MAX_THINKING_TOKENS=10000 -> ~70%
# CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50
# 그리고 "MCP 10개 미만, tool 80개 미만 유지"
```

이 수치들은 전부 저장소가 공개한 값이고, 독립적으로 벤치마크된 게 아니다. 더 중요한 건, 이 권고들 상당수가 **번들 자체가 만들어낸 overhead를 다시 깎아내는 mitigation**이라는 점이다. 짐을 잔뜩 실어 놓고 더 약한 모델로 돌리라고 권하는 구조다.

### 보안 / 유지보수 표면

full install은 SessionStart / Pre / PostToolUse / Stop hook, MCP 서버 14개, 그리고 `install.sh`/`install.ps1`, `ecc_dashboard.py`(Tkinter GUI), 각종 npx 도구를 네 라이브 환경에 떨군다. hook과 MCP 서버의 코드는 **네 셸에서 실행된다.** AgentShield가 네 config를 감사해 주긴 하지만, 프레임워크 자체가 공격/유지보수 표면을 넓힌다는 사실은 변하지 않는다. 이걸 신뢰하려면 아주 큰 표면을 직접 읽거나, 유지보수자를 믿는 수밖에 없다. 별 20만 개가 코드 감사를 대신해 주지는 않는다.

### discoverability

스킬 249개에 에이전트 63개. 어느 게 언제 발화하는지(auto-trigger인지 명시적 `/command`인지)를 아는 것 자체가 인지 부하다. "스킬이 너무 많아서" 모델이 엉뚱한 스킬을 고르거나, 여러 스킬을 로드하느라 context를 태우는 실패 모드는 실재한다. 도구가 많을수록 좋은 게 아니라, 많을수록 고르기 어려워진다.

### install fragility — 유지보수자도 인정한다

README에 bold 경고 박스가 있다.

```text
Do not stack install methods. The most common broken setup is:
/plugin install first, then install.sh --profile full or
npx ecc-install --profile full afterward.
```

설치 경로는 **딱 하나만 골라야 한다.** plugin 방식이거나, manual 방식이거나.

```bash
# 방법 A — plugin
# /plugin marketplace add https://github.com/affaan-m/ECC
# /plugin install ecc@ecc

# 방법 B — manual (둘 중 하나만)
./install.sh --profile full
# 또는 Windows: .\install.ps1 --profile full
```

둘을 섞으면 skill/hook이 중복되고, 이게 "가장 흔한 깨진 설정"이다. 게다가 규칙 레이어는 plugin 시스템으로 자동 배포가 안 돼서 `.claude/rules/`로 수동 복사해야 한다. "원커맨드 설치"라는 약속이 여기서 깨진다. 설치 표면이 fragile하다는 걸 유지보수자가 README로 인정하고 있다는 게 핵심이다.

### hype vs substance

별 205,768개는 좋은 숫자다. 하지만 이걸 품질의 증거로 읽으면 안 된다. 5개월 만의 폭발적 별 증가는 바이럴 X 스레드 한 방과, 앞서 믿지 말라고 짚은 바로 그 stale 마일스톤(10만 / 11.8만 / 16.3만)을 쫓아 달린 블로그 커버리지가 끌어올린 면이 크다. ECC를 비판적으로 다룬 Medium 에세이("dividing the developer community")는 GitHub Discussions 활동이 일일 Issue 대비 미미하다는 점, 그리고 "star count and daily usage may not align"을 지적한다. **별 20만 개 ≠ 일일 사용자 20만 명**이다.

정직하게 읽으면 바이럴성은 잘 기록됐지만, 엄밀한 독립 벤치마크는 빈약하다. 직접 ECC를 깊게 비판 분석한 1차 자료는 사실상 Medium 에세이 하나 정도다.

마지막으로 상업적 중력도 이름을 붙여 둔다. MIT core는 진짜로 오픈이지만, 그 위에 private repo용 "ECC Pro" GitHub App이 **$19/seat/mo**로 올라가 있고 sponsorship 자금도 있다. 유지보수자에게는 표면을 넓고 눈에 띄게 유지할 인센티브가 있다는 뜻이다.

## 대안과 비교 — "통째로"가 아니라 "골라 캐기"

| 옵션 | 표면 크기 | 성격 | 트레이드오프 |
|------|-----------|------|--------------|
| native Claude Code + 탄탄한 CLAUDE.md | 매우 작음 | 1차 primitive만 | 예측 가능, 직접 구성 필요 |
| ECC (full) | 거대 | everything-bundle + cross-harness | 차별화 모듈 있으나 context/유지보수 비용 큼 |
| obra/superpowers (~9.3만, 대략 snapshot) | 중간 | 7단계 TDD성 방법론, opinionated | 좁고 추론하기 쉬움 |
| wshobson/agents (~3.3만, 대략 snapshot) | 작음 | multi-harness 에이전트 마켓, 수동 조립 | batteries 적지만 overhead 낮음 |

표의 별 개수는 ground truth가 아니라 오늘 기준 대략의 분위기로만 봐 달라. 핵심은 이거다. Skill, subagent, plugin, hook, plugin marketplace는 **이제 전부 Claude Code의 first-party 기능**이다. ECC는 본질적으로 이 native primitive들을 거대하게 미리 채운 번들 + cross-harness 어댑터다.

그래서 senior 독자가 물어야 할 질문은 하나다 — "ECC의 어떤 조각이, native Claude Code + 빡빡한 CLAUDE.md가 이미 못 푸는 문제를 푸나?" 정직한 답은 "한 줌"이다. 좋은 code-reviewer / security-reviewer 에이전트, TDD 워크플로, AgentShield 정도. 249개 스킬 전부가 아니다.

비판 커버리지의 반복되는 전문가 합의도 같은 결이다 — "대부분은 그냥 좋은 CLAUDE.md, 견고한 테스트, 깔끔한 커밋 메시지가 필요한 거지, 생태계 전체가 필요한 게 아니다." 많은 레포에서 50줄짜리 CLAUDE.md + 손으로 고른 에이전트 2~3개가, full ECC install을 context 비용과 예측가능성 양쪽에서 이긴다.

## 언제 써볼 만한가 / 결론

ECC는 "통째로 깔 것"이 아니라 "몇 모듈만 캐낼 것"이다. 그리고 그 캐내는 길을 ECC 자신이 `agent-sort`로 이미 제공한다. 권하는 사용법은 명확하다 — full install로 시작하지 말고, `agent-sort`로 DAILY 버킷을 뽑은 뒤 그것만 남겨라.

- 여러 하네스(Claude Code / Codex / Cursor 등)를 오간다 → cross-harness 어댑터 때문에 볼 가치 있다.
- 에이전트 config 보안 감사가 필요하다 → AgentShield만 npx로 떼어 써도 된다.
- 단일 레포 하나에 native Claude Code를 잘 쓰고 있다 → full ECC는 거의 확실히 overkill이다. 한 줌만 가져와라.

ECC 2.0(`ecc2/`의 Rust control-plane)은 dashboard / start / sessions / status / stop / resume / daemon 명령을 노출하고 로컬 빌드가 된다. 다만 README가 "usable as an alpha, not yet a general release"라고 못 박는다. 알파다. 기대는 하되 프로덕션 기대는 접어 둔다.

총평하면, ECC는 영리한 아이디어 몇 개와 진짜 차별화 모듈 몇 개를, 통째로 돌리기엔 너무 큰 번들로 포장한 프로젝트다. 가장 정직한 신호는 별 20만 개가 아니라, 자기를 잘라내라고 권하는 `agent-sort` 스킬 그 자체다. 그 충고를 따르는 게, ECC를 가장 잘 쓰는 법이다.

*ECC 평가의 진짜 기준은 별 20만 개가 아니라 "native Claude Code + 빡빡한 CLAUDE.md가 못 푸는 걸 ECC의 어떤 조각이 푸나"라는 질문이고, 정직한 답은 거대한 번들이 아니라 한 줌이다.*
