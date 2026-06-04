---
title: "Understand-Anything 리뷰 — 코드베이스를 사람이 탐험하는 인터랙티브 지식 그래프"
description: "Understand-Anything을 사람용 onboarding 그래프 관점에서 뜯어봤다. tree-sitter+LLM 구조, /understand --language ko 한국어 출력, LLM 요약의 hallucination 리스크까지 솔직하게 정리한다."
date: 2026-06-04
categories: [Dev]
tags: [AI, Blog]
---

새 코드베이스에 처음 들어갈 때 가장 비싼 자원은 token이 아니라 사람의 시간이다. 낯선 200K-LOC 저장소 앞에서 "여기 어디서부터 봐야 하지"를 푸는 데 며칠이 녹는다. [Ultra Harness를 만들면서]({% post_url 2026-05-20-claude-code-ultra-harness %}) 나는 에이전트가 코드를 더 잘 읽게 만드는 쪽에 집중했지, 정작 **사람이** 코드를 더 빨리 이해하게 만드는 도구는 거의 안 봤다. 그러던 차에 Understand-Anything이 눈에 들어왔다.

슬로건이 노골적이다. "Graphs that teach > graphs that impress." 코드를 token 아끼는 그래프가 아니라, 사람이 클릭하며 탐험하고 질문하는 그래프로 바꾸겠다는 것이다. 이 글은 내가 만든 게 아니라 남이 만든 프로젝트를 뜯어본 리뷰다. 영리한 부분은 영리하다고 적고, 의심스러운 부분은 의심스럽다고 적는다.

한 줄로 좌표를 먼저 박아두면 이렇다. **CodeGraph가 에이전트를 위한 그래프라면, Understand-Anything은 사람을 위한 그래프다.** 전자는 token을 아끼고 후자는 신입 개발자의 onboarding을 빠르게 한다. 청중이 다르다.

---

## Understand-Anything이 뭔가

Understand-Anything([github.com/Lum1104/Understand-Anything](https://github.com/Lum1104/Understand-Anything))은 코드베이스·문서·knowledge base를 **사람이 탐험하는 interactive knowledge graph**로 바꾸는 Claude Code 플러그인이다. Codex, Cursor, Copilot, Gemini CLI 등 13개 이상의 harness와 함께 쓸 수 있다고 한다. 결과물은 그냥 그림이 아니다. 모든 파일·함수·클래스가 plain-English 요약을 가진 **클릭 가능한 node**가 되고, dependency map 위에서 서로 연결된다.

핵심 기능을 추려보면 이렇다.

- **layer view**: API / Service / Data / UI / Utility로 색을 입혀 계층을 한눈에 본다.
- **domain view**: 기술 구조가 아니라 business process 단위로 코드를 묶는다.
- **guided tour**: dependency 순서대로 아키텍처를 안내하는 가이드 투어.
- **search**: fuzzy 검색과 semantic 검색을 둘 다 지원한다.
- **diff impact analysis**: 변경이 어디까지 파급되는지 보여준다.
- **persona-adaptive detail**: 같은 코드를 junior dev / PM / power user에 맞춰 다른 깊이로 설명한다.
- **pattern callout**: 12가지 프로그래밍 패턴을 자동으로 짚어준다.
- **multilingual output**: 영어 외에 zh / zh-TW / ja / **ko(한국어)** / ru로 출력한다.

오늘(2026-06-04) 기준 GitHub API로 별 약 51,000개, fork 4,175개, MIT 라이선스, 주 언어 TypeScript(약 70%)에 JS·Python·Astro가 섞여 있다. 만들어진 건 2026-03-15라 **이제 약 3개월 된 저장소**다. 최신 릴리스는 v2.7.3(2026-05-19). 별 5만은 분명 큰 숫자지만, 뒤에서 따로 말하겠지만 이 숫자를 품질의 증거로 받으면 안 된다. 3개월에 5만이라는 hockey stick 자체가 의심 대상이다.

---

## 왜 지금 이 문제가 중요한가

agentic coding이 보편화되면서 "에이전트가 코드를 읽는 비용"을 줄이는 도구는 쏟아진다. CodeGraph가 대표적이다. 그런데 그 와중에 빠지기 쉬운 게 **사람의 onboarding 비용**이다. 코드를 가장 빨리 짜는 에이전트를 옆에 둬도, 그 코드의 구조를 머릿속에 넣어야 하는 건 결국 사람이다. PR 리뷰, 신규 입사자 적응, legacy 인수인계 — 전부 사람이 코드 지도를 그리는 일이다.

이 지점이 내게 개인적으로 와닿는 이유가 있다. 나는 Unity·Flutter·AI 프로젝트를 여러 개 굴려왔고, 몇 달 손을 뗐다 다시 들어가면 **내가 짠 코드인데도** 구조가 기억나지 않는다. 그때마다 결국 grep하고, 진입점부터 읽고, Claude Code한테 "이 프로젝트 어디서 시작해"라고 묻는다. Understand-Anything의 약속은 그 과정을 committable한 시각 artifact로 한 번 만들어두면, 다음 사람(혹은 미래의 나)이 그걸 탐험만 하면 된다는 것이다. 매력적인 프레이밍이긴 하다. 진짜 그런지가 문제일 뿐.

---

## 어떻게 동작하는가 (tree-sitter + LLM 분리)

이 프로젝트에서 가장 칭찬할 만한 설계 결정부터 짚는다. 구조 추출과 의미 생성을 **다른 엔진에 맡긴다.**

- **구조(structure)**: tree-sitter로 deterministic하게 뽑는다. 파일·함수·클래스의 경계, import/call 같은 edge가 여기서 나온다.
- **의미(semantics)**: LLM 에이전트가 요약 문장, domain 태그, layer 분류를 생성한다.

저자도 HN에서 이 분리를 자기 설계로 명시했다. tree-sitter로 코드 구조를 결정론적으로 잡고, 그 위에 LLM 에이전트로 "business knowledge graph"를 올린다는 것이다. 이게 왜 합리적인 hedge냐면, **그래프의 뼈대(edge)는 hallucination이 끼어들 여지가 적은 deterministic parser가 책임지고, 환각 위험은 prose 요약 레이어로 격리되기 때문이다.** "LLM아 저장소 읽고 그래프 그려줘"라는 all-LLM 접근보다 훨씬 견고하다. 이 부분은 공정하게 인정해야 한다.

semantic 생성은 6-agent pipeline으로 돈다.

| 단계 | 에이전트 | 역할 |
|------|----------|------|
| 1 | project-scanner | 저장소를 스캔해 파일 목록·언어·진입점 파악 |
| 2 | file-analyzer | 파일별로 함수/클래스 요약, 태그 생성 (LLM) |
| 3 | architecture-analyzer | layer·아키텍처 구조 추론 (LLM) |
| 4 | tour-builder | dependency 순서대로 guided tour 구성 |
| 5 | graph-reviewer | 생성된 그래프 검수 |
| +α | domain / article analyzer | domain view·문서화 보강 |

배치 처리는 5 concurrent, batch당 20~30 파일로 병렬화한다. 첫 빌드 이후엔 fingerprint 기반 incremental update로 바뀐 파일만 다시 돈다. 결과물은 한 파일이다.

```bash
# 실행하면 이 경로에 그래프가 쌓인다
.understand-anything/knowledge-graph.json
```

이 JSON을 git에 커밋해 팀이 공유한다(큰 그래프는 git-lfs 권장). commit 후크로 그래프를 자동 갱신하는 옵션도 있다.

```bash
# 코드베이스를 분석해 그래프 생성
/understand

# post-commit 후크로 그래프 자동 갱신
/understand --auto-update
```

명령어는 용도별로 갈라져 있다.

```text
/understand            그래프 생성
/understand-dashboard  웹 대시보드 열기
/understand-chat       그래프에 질문하기
/understand-diff       변경 영향 분석
/understand-domain     business domain 뷰
/understand-knowledge  knowledge base 조회
/understand-explain    특정 노드/파일 설명
/understand-onboard    신입용 onboarding 흐름
--language ko          한국어 출력
```

라이브 데모는 understand-anything.com/demo에서 직접 만져볼 수 있다.

---

## 한국어 출력(`--language ko`)이라는 각도

한국 개발자로서 내가 제일 먼저 만져보고 싶었던 건 `--language ko`다. 단순 UI 번역이 아니다. v2.7.3 릴리스 노트는 "architecture 요약, node 설명, tour, onboarding 콘텐츠가 요청한 언어로 end-to-end 생성된다"고 적는다. 즉 pipeline 자체가 한국어로 결과를 만든다.

```bash
# 내 프로젝트를 한국어 그래프로 빌드
/understand --language ko
```

ko는 README가 풀 한국어 버전까지 제공하는 first-class 로케일이고, ru는 바로 이 v2.7.3에서 추가됐다. 다만 정직하게 짚을 게 둘 있다.

첫째, **baseline 일부 자료엔 es(스페인어)·tr(터키어)도 지원 로케일로 적혀 있지만, 릴리스 노트와 저장소 소스로 end-to-end 생성이 확인되는 건 en/zh/zh-TW/ja/ko/ru까지다.** es·tr은 README의 마케팅성 locale 카드에서 보일 뿐 실제 생성 타깃인지 확인되지 않았다. 한국어는 안전하지만, 스페인어/터키어 출력이 필요하면 제품에서 직접 검증하는 게 맞다.

둘째, **한국어 출력의 품질은 이 리뷰에서 독립 검증되지 않았다.** 기능이 있다는 것과 한국어 요약이 자연스럽고 정확하다는 것은 다른 얘기다. LLM이 만든 한국어 기술 요약은 종종 기계번역체가 되거나, 영어 원문에선 맞던 뉘앙스가 한국어로 옮겨지며 미묘하게 틀어진다. 그래서 이 기능을 제대로 평가하려면 **내가 코드를 이미 아는 내 프로젝트**(예전에 정리한 [reelaze 같은]({% post_url 2024-06-01-reelaze-retrospective %}) 저장소)에 ko로 돌려보고, 한국어 요약이 내가 아는 사실과 맞는지 한 줄씩 대조하는 수밖에 없다. 정답을 아는 코드에서 틀린 한국어 설명을 잡아내는 게 이 도구의 신뢰도를 재는 가장 정직한 방법이다.

---

## 내가 의심하는 지점 / 한계

리뷰의 핵심이다. 솔직하게 적는다.

### 1) 모르는 코드를 자신 있게 틀리게 가르치는 위험 (가장 큰 리스크)

이게 1순위다. 그리고 이건 내 추측이 아니라 HN에서 독립적으로 지적된 문제다. imiric은 이렇게 적었다. "거의 확실히 중요한 디테일을 놓치거나 hallucinate할 것이다."

문제의 본질은 이 도구의 슬로건 자체에 있다. "graphs that **teach**." 가르치는 도구는 틀리게 가르칠 때 가장 위험하다. tree-sitter가 edge와 구조는 지켜주지만, **사람이 읽는 요약 문장, layer/domain 분류, tour 내러티브는 전부 순수 LLM 출력**이고 표준적인 hallucination 위험을 그대로 진다. 그런데 onboarding이라는 용도의 정의상, 이 그래프를 읽는 사람은 **그 코드를 모르는 신입**이다. 신입은 정의상 틀린 설명을 잡아낼 context가 없다.

시각적으로 권위 있게 제시된 plain-English node 요약이 틀려도, 읽는 사람은 그게 틀렸는지 알 길이 없다. 이건 README가 틀린 것보다 더 음험하다. README는 사람이 썼다는 걸 알지만, 깔끔한 대시보드는 "분석 결과"라는 가짜 객관성을 두른다.

### 2) 200K-LOC에 6-agent pipeline을 돌리는 token/$ 비용과 시간

project-scanner → file-analyzer → architecture-analyzer → tour-builder → graph-reviewer(+domain/article)를 200K-LOC 저장소에 돌린다는 건, **사실상 거의 모든 파일에 LLM을 한 번씩 통과시킨다**는 뜻이다. batch 20~30 파일, 5 concurrent로 병렬화해도 token 청구서와 wall-clock 시간은 실제로 크다. 그리고 incremental update에서도 부분적으로 반복된다. 저장소가 공개한 batching·성능 수치는 어디까지나 self-reported이고, 비용이나 정확도를 독립적으로 측정한 벤치마크는 찾지 못했다. 첫 빌드 한 번의 비용을 "팀 전체가 공유하니 amortize된다"고 변호할 수는 있다. 다만 그 전제는 그래프가 최신으로 유지될 때만 성립한다. 그게 다음 문제다.

### 3) 빠른 코드 vs 정체된 그래프(staleness)

그래프는 커밋된 JSON 스냅샷이다. 활발한 저장소에서 코드는 매시간 바뀌는데, 그래프는 post-commit `--auto-update` 후크가 돌 때(혹은 누가 비용 아끼려고 안 돌릴 때)까지 drift한다. fingerprint incremental update가 완화는 하지만 제거하진 못한다. 최악의 시나리오는 이거다. **신입이 stale 그래프를 보고 이미 존재하지 않는 아키텍처를 학습한다.** onboarding 도구가 가르치는 지도가 실제 지형과 다르면, 안 보느니만 못할 수 있다. 빠르게 움직이는 코드일수록 이 도구의 가치 제안이 약해지는 역설이 있다.

### 4) 예쁜 대시보드가 코드 읽기 + 탄탄한 README를 이기는가

HN의 회의론자들이 정확히 이걸 찔렀다. m3kw9는 "수백 개 스파게티 노드짜리 큰 그래프는 내가 피하려는 종류의 학습이다. 그냥 '어디서 시작해'라고 직접 물어보는 게 낫다"고 했고, ks2048은 "같은 정보를 화면 한 장짜리 nested `<ul>`로 더 압축해서 만들 수 있어 보인다"고 했다. 둘 다 공정한 지적이다. 작거나 중간 규모이거나 문서화가 잘 된 저장소라면, 좋은 README + grep + 에이전트한테 직접 질문하는 게 노드 그래프 탐색보다 빠를 수 있다.

더 깊은 pedagogy 반론도 있다(169점 스레드의 핵심). "더 polished하고 ELI5일수록 덜 기억에 남는다." tour를 클릭하며 지나가는 건 **학습한 느낌**을 줄 뿐, durable한 mental model을 만들지 못할 수 있다. 진짜 이해는 노력해서 직접 헤맨 끝에 온다는 오래된 명제를, 이 도구의 "graphs that teach" 전제가 정면으로 건드린다.

### 5) 별 5만은 품질의 증거가 아니다

3개월 된 저장소에 별 51k는 그 자체로 의심 신호다. HN에서 throwup238은 "readme 하단 star graph를 봐라 — 그 hockey stick이 organic이라고 보기 어렵다"고 했고, graypegg는 "며칠 연속으로 정확히 +1000씩 뛰는 건 의심스럽다"고 매수 의혹을 제기했다.

별도로, 명시적 'Show HN' 시도 두 개는 각각 1점/3점에 그쳐 거의 묻혔다. traction을 얻은 건 'Understand Anything'이라는 제목의 단일 스레드 하나(169점, 49댓글)뿐이고, 그 밖의 커버리지는 대부분 SEO/aggregator tool-directory 페이지나 짧은 walkthrough다. **substantive한 독립 평가가 거의 없다는 뜻이다.** 별 숫자가 아니라 직접 손으로 돌려본 결과를 믿어야 하는 이유다.

---

## 비교 — 어디에 놓이는 도구인가

| 대상 | 청중 | 핵심 차이 | 한 줄 |
|------|------|-----------|-------|
| **CodeGraph** (~39.4k★) | 에이전트 | MCP로 pre-indexed 그래프를 에이전트에 먹여 token/tool call 절감 (self-reported 최대 49x). 사람용 대시보드 없음 | 에이전트를 싸게 만든다 |
| **Understand-Anything** | 사람 | 읽고 탐험하는 시각 그래프 + guided tour, committable JSON | 사람을 빠르게 만든다 |
| **에이전트 native 기능** | 사람/에이전트 | Claude Code의 Explore/subagent, `/init`, `CLAUDE.md`, Cursor/Copilot 인덱싱이 이미 "어디서 시작해"에 inline으로 답함 | 그냥 물어보면 된다 |
| **좋은 README + 아키텍처 문서** | 사람 | token 비용 0, staleness 파이프라인 없음, 사람이 썼으니 hallucinate 안 됨 | 가장 싼 baseline |
| **Sourcegraph / LSP / Doxygen** | 사람 | 정밀하고 환각 없는 구조. 단 plain-English 내러티브·persona 적응 없음 | 정확하지만 설명은 없다 |

정리하면 둘 다 tree-sitter를 쓰지만 CodeGraph는 SQLite/FTS5에 저장해 에이전트에게 서빙하고, Understand-Anything은 committable JSON + 웹 대시보드를 사람에게 내놓는다. 경쟁자가 아니라 **청중이 다른 도구**다. "CodeGraph makes the agent cheaper; Understand-Anything makes the human faster."

그리고 가장 싼 baseline — 잘 쓴 README + 아키텍처 문서 — 를 절대 잊으면 안 된다. 작고 잘 문서화된 저장소에서는 이게 이긴다. Understand-Anything의 우위는 **저장소가 거대하고, 문서가 없는 legacy 코드**일수록 커진다. 사람이 onboarding 문서를 아무도 안 써둔 바로 그 상황 말이다.

---

## 언제 써볼 만한가 / 결론

정직한 판정은 이렇다. Understand-Anything은 **설계가 영리하지만(tree-sitter로 구조를 잡고 LLM을 prose 레이어로 격리한 hedge), onboarding 도구라는 용도 자체가 가장 위험한 실패 모드를 안고 있는** 매우 어린 프로젝트다. 틀린 한국어 요약을, 코드를 모르는 신입이, 권위 있는 대시보드 위에서 믿어버리는 시나리오 — 이게 핵심 리스크다. tree-sitter가 edge는 지켜도 요약은 못 지킨다.

그래서 내 워크플로에 지금 당장 박을 것이냐 — 아니다. 적어도 production onboarding 자료로 신입에게 던지기 전에, **내가 코드를 완벽히 아는 내 프로젝트에 `--language ko`로 먼저 돌려 한국어 요약의 정확도를 한 줄씩 검수**하겠다. 거기서 hallucination 빈도가 허용 가능하고, tour가 실제로 사람을 빠르게 만든다는 게 확인되면, 그때 legacy 인수인계 같은 좁은 용도에 한정해 붙일 만하다.

써볼 조건을 추리면 셋이다. (1) 문서화가 안 된 대규모 legacy 코드베이스를 사람에게 인수인계해야 하는데 onboarding 문서가 아예 없는 경우, (2) 시각 학습자가 많고 dependency 지도를 cross-team으로 공유할 가치가 있는 경우, (3) 그래프 staleness를 감수할 만큼 코드가 충분히 안정적인 경우. 반대로 저장소가 작거나, README가 탄탄하거나, 그냥 에이전트한테 "어디서 시작해"라고 물으면 되는 상황이라면 — 예쁜 그래프보다 코드를 직접 읽는 게 더 빠르고, 더 정확하고, 더 오래 남는다.

*Understand-Anything은 tree-sitter로 뼈대를 지키고 LLM으로 의미를 입힌 영리한 onboarding 도구지만, "가르치는 그래프"라는 정의 자체가 틀린 것을 자신 있게 가르칠 위험을 안고 있어서 — 별 5만이 아니라 내가 아는 코드에 `--language ko`로 직접 돌려 검수하는 게 이 어린 프로젝트를 대하는 올바른 태도다.*
