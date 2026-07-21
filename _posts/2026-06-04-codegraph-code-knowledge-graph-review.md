---
title: "CodeGraph 리뷰 — 에이전트가 grep 대신 질의하는 로컬 코드 지식 그래프, 미리 색인하는 게 정말 이득일까"
description: "Claude Code 같은 에이전트가 grep/read로 token을 태우는 대신 MCP로 질의하는 로컬 code knowledge graph, CodeGraph를 뜯어봤다. index staleness와 self-report 벤치마크까지 의심하며 정리한다."
date: 2026-06-04
categories: [Dev]
tags: [AI, Blog]
---

Claude Code로 큰 저장소를 처음 만지면 똑같은 장면이 반복된다. "이 함수 누가 호출해?"라고 물으면 에이전트가 grep을 던지고, 결과를 read하고, 또 grep을 던지고, 다시 read한다. call graph를 따라 한 hop씩 이동할 때마다 tool call과 token이 같이 빠져나간다. multi-hop 질문 하나가 수십 번의 tool call로 fan-out되는 걸 보고 있으면, "이걸 매번 실시간으로 뒤지는 게 맞나"라는 생각이 든다.

CodeGraph는 코드를 미리 색인해 그래프로 만들고, 에이전트가 반복 검색 대신 그 그래프에 질의하게 한다. 이 리뷰에서는 한 가지를 확인한다. 검색 횟수를 줄이는 이득이 오래된 색인과 불완전한 파싱을 믿어야 하는 위험보다 큰가. 마지막 판단도 저장소 크기와 변경 빈도를 기준으로 내린다.

---

## CodeGraph가 뭔가

CodeGraph([github.com/colbymchenry/codegraph](https://github.com/colbymchenry/codegraph))는 AI 코딩 에이전트를 위한 **로컬 code intelligence index**다. 한 문장으로 요약된 태그라인이 정직하다. "Pre-indexed code knowledge graph for Claude Code, Codex, Gemini, Cursor, OpenCode, AntiGravity, Kiro, and Hermes Agent — fewer tokens, fewer tool calls, 100% local."

동작 원리는 단순하다. tree-sitter로 코드를 파싱해서 symbol, call graph, 파일 구조, route 같은 걸 추출하고, 그걸 로컬 SQLite DB에 넣는다(FTS5 full-text search 포함). 그리고 그 DB를 **MCP server로 노출**해서, 에이전트가 grep/glob/Read 대신 MCP tool로 질의하게 만든다. API key가 필요 없고 전부 로컬에서 돈다. native OS file watcher(macOS FSEvents / Linux inotify / Windows ReadDirectoryChangesW)가 약 2초 debounce로 파일 변경을 감지해 index를 auto-sync한다. 그래도 index가 뒤처지면 staleness banner를 띄운다.

라이선스는 MIT, TypeScript가 ~92%다. 오늘(2026-06-04) 기준 GitHub에 별 약 39.4k개, fork 약 2.4k개가 찍혀 있다. 다만 이 숫자는 그대로 품질의 증거로 받아들이면 안 된다. 저장소는 2026년 1월 18일에 만들어졌고, 최신 릴리스는 **v0.9.9**다. 5개월밖에 안 된 pre-1.0 프로젝트가 5개월 만에 별 39k를 모은 것이다. 별 증가 속도가 성숙도를 한참 앞지르고 있다는 뜻이고, 이건 안정성의 신호가 아니라 hype velocity의 신호에 가깝다. 이 점은 뒤에서 다시 짚는다.

---

## 왜 지금 이 문제가 중요한가

agentic coding의 비용 구조는 단순하다. token은 돈이고, 에이전트는 한 task를 풀기 위해 tool을 여러 번 호출하면서 그 결과를 매 turn마다 context에 다시 쌓는다. 그중에서도 가장 비싼 게 **탐색(exploration)** 단계다.

- "이 symbol이 어디 정의돼 있지?" — search 한 번.
- "이걸 누가 호출하지?" — grep 한 번, read 여러 번.
- "이걸 고치면 어디가 깨지지?" (blast radius) — call graph를 손으로 따라가며 수십 번.

이 fan-out이 큰 저장소에서 폭발한다. 파일 수만 개짜리 monorepo에서 "이 함수 바꾸면 영향받는 곳"을 native tool로 추적하면, 에이전트가 한 hop씩 이동하느라 tool call과 token을 어마어마하게 태운다. [Ultra Harness를 만들면서]({% post_url 2026-05-20-claude-code-ultra-harness %}) 에이전트의 행동을 정형화하긴 했지만, 탐색 비용 자체를 구조적으로 깎는 건 별개의 문제였다. CodeGraph는 그 탐색을 **미리 계산해 둔 그래프 한 번의 질의**로 바꾸겠다는 것이다. caller/callee/impact를 SQLite가 이미 알고 있으니, 에이전트는 grep으로 더듬을 필요 없이 답을 받아온다.

여기서 이 리뷰의 핵심 질문이 나온다. **미리 색인하는 게 정말로 에이전트의 native grep/read를 이기는가, 그리고 그 대가로 치러야 할 유지 비용은 얼마인가.**

---

## 어떻게 동작하는가 (MCP tool과 설정)

에이전트가 실제로 쓰는 건 8개의 MCP tool이다.

| MCP tool | 역할 |
|----------|------|
| `codegraph_explore` | 메인. entry point + 관련 symbol을 한 번의 호출로 묶어서 반환 |
| `codegraph_search` | symbol/텍스트 검색 (FTS5) |
| `codegraph_callers` | 이 symbol을 호출하는 곳 |
| `codegraph_callees` | 이 symbol이 호출하는 곳 |
| `codegraph_impact` | blast radius — 바꾸면 영향받는 범위 |
| `codegraph_node` | 단일 노드 상세 |
| `codegraph_files` | 파일 단위 구조 |
| `codegraph_status` | index 상태/staleness 확인 |

핵심은 `codegraph_explore`와 `codegraph_impact`다. native tool이 여러 번 왕복해야 하는 "entry point + 관련 symbol", "변경 영향 범위" 같은 질문을 **한 번의 질의로 미리 계산된 답**으로 돌려주는 게 이 도구의 진짜 edge다. 단일 파일 한 번 읽기 같은 one-off 질문은 어차피 native read가 이미 싸다. CodeGraph가 이기는 영역은 call-graph traversal과 impact 분석 쪽으로 분명하게 쏠려 있다.

설정은 zero-config를 표방한다. `node_modules`/`vendor`/`dist`를 제외하고, `.gitignore`를 존중하고, 1MB 넘는 파일은 건너뛴다. 20개 이상 언어를 지원하고, 14개 이상 web framework에 대해 framework-aware routing을 한다. Swift↔ObjC / React Native bridge / Expo 같은 cross-language bridging도 하는데, 이건 heuristic이다(뒤에서 짚는다).

설치와 사용 흐름은 이렇다.

```bash
# 설치 (셋 중 하나)
npm i -g @colbymchenry/codegraph
# 또는 install.sh / install.ps1

# 에이전트 자동 감지 후 등록
codegraph install

# 프로젝트별 초기화 (대화형)
codegraph init -i

# MCP server로 서빙
codegraph serve --mcp
```

CLI로 직접 질의할 수도 있다.

```bash
codegraph index            # 색인 생성
codegraph sync             # 변경분 동기화
codegraph callers <symbol> # 호출자
codegraph callees <symbol> # 피호출
codegraph impact <symbol>  # blast radius
codegraph affected         # 변경 영향 파일
```

programmatic하게 `CodeGraph` 클래스를 임베드해 쓸 수도 있는데, 이 라이브러리 경로는 **Node 22.5+**가 필요하다. 내장 `node:sqlite` 모듈(WAL 포함)을 백엔드로 쓰기 때문이다. CLI/MCP-server 경로는 일반 사용자에게 그 버전을 강제하진 않지만, 임베드 API를 쓸 거면 런타임 버전을 먼저 확인해야 한다.

---

## 저장소가 공개한 수치, 그리고 그 함정

여기서부터 조심해야 한다. CodeGraph를 검색하면 "92% fewer tool calls", "70% fewer tool calls, 49% faster", "VSCode ~94% fewer tool calls" 같은 화려한 숫자들이 여러 블로그에 떠다닌다. **이 숫자들은 쓰면 안 된다.** README 본문의 헤드라인 수치와 모순되기 때문이다. 저 블로그들은 per-repo 최댓값을 평균인 척 옮겼거나, 그냥 지어낸 것으로 보인다.

저장소가 README에 직접 적은 수치는 이것이다.

```text
Average: 16% cheaper · 47% fewer tokens · 22% faster · 58% fewer tool calls
```

이게 전부다. 7개 OSS 저장소(VS Code, Alamofire, OkHttp 등)를 골라 CodeGraph on vs off로 돌리고, 각 칸은 **arm당 4회 실행의 median**에서의 절감률이다. per-repo 최댓값으로는 VS Code에서 tool call 81% 감소 / token 64% 감소, Alamofire에서 비용 40% 감소, OkHttp에서 31% 빠름이 보고됐다. README 스스로 per-repo 숫자는 실행마다 흔들린다고 인정한다.

그리고 한 가지 더. 저자의 Medium 글 제목은 "I Cut Claude Code Exploration Time and Costs by 90% With One Tool"이고, 같은 글 본문에는 "cut my Claude Code API costs by 40%"라는 별개의 문장도 있다. 둘 다 벤치마크가 아니라 마케팅이다. README가 스스로 매긴 평균 비용 절감은 그 90%도, 본문의 40%도 아닌 **16%**다. Medium의 90%는 cherry-pick된 best case로 봐야 한다.

정리하면 이렇게 읽는 게 맞다.

- 저장소가 공개한 평균: **16% cheaper / 47% fewer tokens / 22% faster / 58% fewer tool calls** (7개 repo, 4회 median).
- VS Code 81% / 64% 같은 숫자는 **최댓값**이지 평균이 아니다.
- 90%, 92%, 70% 같은 숫자는 2차 블로그의 과장이거나 마케팅이다. 무시한다.

전부 **저장소가 self-report한 수치**다. 독립적으로 재현된 적이 없다. 에이전트 실행은 high-variance에 non-deterministic이고, "4회의 median"은 표본으로 얇다. 게다가 repo도 prompt도 저자가 골랐다. 당신의 사설 monorepo에서 token이 얼마나 줄지는 아무도 모른다.

참고로 독립적인 외부 평가도 사실상 없다. Hacker News에 올라온 글은 1점에 댓글 2개짜리 non-event였고, 의미 있는 Reddit 토론도 못 찾았다. 글로 된 "coverage" 대부분이 저품질 SEO/AI 생성 tool-roundup 블로그다. 즉 별 39k는 **편집권 있는 제3자 검증으로 뒷받침되지 않는다.**

---

## 같은 "코드 그래프"라도 겨냥하는 곳이 다르다 (Understand-Anything과의 한 줄 대조)

오해를 미리 끊자면 — Understand-Anything도 코드 그래프를 만들지만 겨냥하는 청중이 다르다. Understand-Anything은 개발자가 보는 **human-facing 시각화/온보딩 도구**이고, CodeGraph는 LLM이 질의하는 **agent-facing token 절감용 MCP API**다. 사실상 경쟁자가 아니다. 한 줄이면 충분하니 더 끌지 않는다.

진짜 비교 대상은 둘이다. (1) 에이전트의 native grep/read, (2) Serena.

| 항목 | native grep/read | CodeGraph | Serena |
|------|------------------|-----------|--------|
| 데이터 출처 | 디스크 ground truth | 미리 만든 SQLite 그래프 | live Language Server (LSP) |
| freshness | 항상 최신 | snapshot, stale 위험 | 항상 최신 |
| symbol 정확도 | (검색 수준) | tree-sitter AST | compiler-grade |
| 강점 | 단발 lookup이 이미 쌈 | call-graph/impact 광역 탐색 | 정밀 + 편집까지 가능 |
| 약점 | multi-hop이 tool call로 폭발 | staleness + 파서 한계 | 언어별 LSP 구동 필요 |

native grep/read는 항상 ground truth를 읽고 절대 stale되지 않는다. 대신 hop마다 tool call과 token을 낸다. CodeGraph는 freshness를 내주고 미리 계산된 답을 얻는다 — 그 edge는 큰 저장소의 call-graph/impact traversal에 집중되고, 단발 단일 파일 lookup에서는 native read가 그냥 이긴다.

Serena([oraios/serena](https://github.com/oraios/serena))가 가장 강력한 대안이다. 둘 다 MCP code-intelligence server지만 메커니즘이 근본적으로 다르다. Serena는 **live LSP**에 질의한다. compiler-grade로 symbol을 풀고, 절대 stale되지 않고, 편집까지 한다. 대신 언어마다 LSP를 띄워야 한다. CodeGraph는 미리 만든 그래프에 질의한다. 언어별 LSP 설치가 필요 없고, cold query가 빠르고, LSP가 기본 노출하지 않는 call-graph/impact/route 추상을 더해준다. 대신 staleness와 tree-sitter 정확도라는 세금을 낸다. 한 줄로: **fresh-and-precise(Serena) vs pre-indexed-and-broad(CodeGraph)**.

비교 축도 다르게 잡아야 한다. CodeGraph는 native 대비 **비용(token)**으로 비교하고, Serena와는 **freshness/정확도**로 비교하는 게 맞다. Serena의 셀링 포인트는 token 절감 퍼센트가 아니라 정밀함이라, 둘을 token-savings 숫자로 줄세우는 건 잘못된 축이다.

---

## 내가 의심하는 지점 / 한계

영리한 발상이라는 건 인정한다. 그래도 리뷰어로서 정직하게 의심해야 하는 지점이 적지 않다.

**1. index staleness가 agent-facing 용도의 급소다.** 그래프는 특정 시점의 snapshot이다. 2초 debounce file watcher와 staleness banner는 *완화책*이지 *보장*이 아니다. multi-file을 빠르게 연속 편집하거나, `git checkout`/rebase/branch 전환을 하거나, 코드를 generate하는 순간, 에이전트는 **디스크와 더 이상 일치하지 않는 그래프**에 질의할 수 있다. 그러고도 자신만만하게 stale한 symbol 위치로 추론한다. 이건 grep/Read가 절대 겪지 않는 실패 모드다 — 걔네는 항상 ground truth를 읽으니까. 빠른 iteration일수록 이 위험이 커지는데, 빠른 iteration이야말로 내 일상이다.

**2. self-reported 벤치마크다.** 앞 섹션에서 본 수치 자체가 한계다 — 독립 재현이 없고, 에이전트 실행의 분산을 생각하면 4회 median은 표본으로 얇으며, repo도 prompt도 저자가 골랐다.

**3. pre-1.0 성숙도(v0.9.9).** API, schema, index format이 안정화되지 않았다고 저장소가 명시한다. 5개월짜리 프로젝트의 hype velocity는 battle-tested의 증거가 아니다. 인기 곡선이 성숙도 곡선을 한참 앞질렀다.

**4. "또 하나의 상시 daemon + MCP server"가 정작 아끼겠다는 context budget을 갉아먹는다.** 모든 MCP server는 자기 tool schema와 instruction을 system prompt에 주입한다. file watcher는 상시 background process다. 작은/중간 규모 저장소에서는 native grep+read가 이미 싸기 때문에, 고정 overhead(tool 정의 + 유지해야 할 index)가 절감액을 넘어설 수 있다. 이득은 대형/레거시 코드베이스에 집중된다.

**5. 20개+ 언어에 걸친 tree-sitter symbol resolution 정확도가 천장이다.** tree-sitter는 빠른 AST 파서지 type-aware 컴파일러/LSP가 아니다. dynamic dispatch, duck typing, macro, reflection, re-export, overload resolution 앞에서 약하다. Swift↔ObjC / RN bridge / Expo의 cross-language bridging은 heuristic이다. 여기서 진짜 무서운 건, **틀린 caller/callee edge는 그래프가 없는 것보다 나쁘다**는 점이다. 에이전트가 그 edge를 믿어버리면 잘못된 전제로 추론한다.

**6. 새로운 trust boundary를 받아들이는 일이다.** CodeGraph를 쓴다는 건 에이전트가 이제 *index를 믿는다*는 뜻이다. init/sync가 1MB 넘는 파일을, 혹은 `.gitignore`에 걸렸지만 사실 중요한 파일을, 혹은 잘 못 파싱하는 언어를 조용히 누락하면, 에이전트는 **자신만만하게 불완전한 지도**를 받는다. native grep/read는 최소한 시끄럽게 실패한다(no match). 그럴듯하지만 틀린 그래프를 돌려주지 않는다.

**7. 플랫폼이 native로 흡수할 위험.** Claude Code는 이미 subagent 기반 Explore를 제공하고, 에디터/에이전트들은 내장 code search와 caching을 꾸준히 개선하고 있다. pre-1.0짜리 서드파티 상시 indexer는 native 기능에 의해 commoditize될 수 있다. 장기 lock-in에 대한 합리적인 회의다.

---

## 언제 써볼 만한가 / 결론

"내 Claude Code에 이걸 적용할 것인가"에 정직하게 답하면, 답은 **저장소 성격에 따라 갈린다.**

**적용할 만하다(YES):** 크고, 천천히 변하고, polyglot인 코드베이스. 탐색 비용이 작업의 대부분을 차지하고, call-graph/impact 질문이 자주 나오고, 파일이 분 단위로 흔들리지 않는 곳. 여기서는 미리 색인의 광역 탐색 이득이 staleness 위험과 고정 overhead를 충분히 amortize한다. 대형 legacy monorepo의 온보딩/리팩터링이 전형적인 sweet spot이다.

**아직은 아니다(NOT YET):** 작거나 중간 규모이고 빠르게 iteration하는 저장소. native grep/read가 이미 싸고, 빠른 편집이 staleness를 가장 세게 때리고, v0.9.9의 유지/context overhead를 회수할 만큼 탐색 비용이 크지 않은 곳. 내가 매일 만지는 Unity/Flutter 프로젝트 다수가 솔직히 이쪽이다. 그래서 나는 지금 당장 전역으로 깔지는 않는다. 대신 대형 OSS를 처음 읽어야 하는 read-only 탐색 세션에서, 그것도 v1.0이 나오고 staleness 동작을 직접 검증한 뒤에 제한적으로 붙여볼 것이다.

핵심 질문으로 돌아가면 — 미리 색인하는 게 native grep/read를 이기는가? **multi-hop 탐색에서는 그렇고, 단발 lookup에서는 아니다.** 그 이득은 16%(평균, self-report)만큼 실재하지만 modest하고, freshness와 정확도와 유지 비용이라는 대가가 따라온다. 영리한 도구이고 노리는 문제도 진짜지만, 별 39k가 v0.9.9의 staleness와 tree-sitter 정확도 문제를 대신 풀어주지는 않는다.

*CodeGraph는 큰 저장소의 multi-hop 탐색을 미리 계산된 질의로 바꿔 token을 아끼는 영리한 agent-facing 그래프지만, staleness·tree-sitter 정확도·pre-1.0 성숙도라는 세금이 붙으므로 "별 39k"가 아니라 "내 저장소가 크고 천천히 변하는가"로 도입을 판단해야 한다.*
