---
title: "oh-my-pi(omp) 리뷰 — 가성비로 보는 터미널 코딩 에이전트, Claude Code/Codex와 비교"
description: "오픈소스 터미널 코딩 에이전트 oh-my-pi(omp)를 뜯어봤다. CLI를 코어까지 커스텀하는 자유, 그리고 Claude Max·Codex 정액 구독 대비 model을 골라 내는 API 토큰 가성비를 Claude Code/Codex와 솔직하게 비교한다."
date: 2026-06-04
categories: [Dev]
tags: [AI, Blog]
---

Claude Code를 프로젝트 단위로 매일 굴리는 사람이라면 청구서를 볼 때마다 같은 생각을 한다. "이 에이전트가 하는 일의 절반은 cheap model로도 충분한 잡일인데, 왜 모든 turn이 frontier 모델 단가로 빠지는가."

[Ultra Harness를 만들면서]({% post_url 2026-05-20-claude-code-ultra-harness %}) subagent를 16개로 쪼개고, [ECC 규칙셋을 전역 레이어로 깐]({% post_url 2026-05-03-claude-code-ecc-rules-adoption %}) 것도 결국은 "비싼 모델을 비싼 일에만 쓰자"는 욕심이었다. 그래서 "model을 네가 골라라, key는 네가 가져와라"를 정면에 내건 oh-my-pi(omp)가 눈에 들어왔다.

이 리뷰의 질문은 단순하다. 모델을 자유롭게 고르면 실제 지출은 줄어드는가, 아니면 설정과 유지에 쓰는 사람의 시간만 늘어나는가. 공개 저장소의 구조와 주장, 직접 운영할 때 생길 비용을 이 기준으로 나눠 본다.

---

## omp가 뭔가

omp([github.com/can1357/oh-my-pi](https://github.com/can1357/oh-my-pi))는 Can Bölük이 만든 **오픈소스 터미널 코딩 에이전트**다. Claude Code, OpenAI Codex와 같은 자리에 놓이는 도구이고, 사이트는 omp.sh, 슬로건은 "A coding agent with the IDE wired in"이다. MIT 라이선스이고, 글을 쓰는 오늘(2026-06-04) 기준 GitHub에 별 약 10.3k개, fork 856개가 찍혀 있다.

먼저 정확히 짚을 게 있다. omp는 from-scratch 오리지널이 아니다. **Mario Zechner의 Pi(pi-mono)를 기반으로 한 fork이자 파생 프로젝트**다. LICENSE에 `Copyright (c) 2025 Mario Zechner`와 `Copyright (c) 2025-2026 Can Bölük`이 함께 박혀 있고, README도 "omp is a fork of pi-mono by Mario Zechner, extended with a batteries-included coding workflow"라고 명시한다. GitHub API가 `fork:false`로 표시하는 건 GitHub의 fork 버튼이 아니라 별도 저장소로 재생성됐기 때문이지, 독립 창작물이라는 뜻이 아니다. 이 구분은 나중에 "독립적 검증" 문제를 따질 때 다시 중요해진다.

언어 구성은 TypeScript 약 83.5%, Rust 8.5%, Python 6.9%다. 핵심은 약 27k LoC 규모의 Rust core(`pi-natives`)다. search/shell/AST 같은 hot path를 fork/exec로 외부 프로세스에 던지는 대신 **in-process로 실행한다.** `pi-shell`(embedded bash, persistent session), `pi-ast`(tree-sitter), `pi-iso`(task isolation), 그리고 native grep/glob/PTY가 여기 들어 있다. 스펙으로 보면 built-in tool 32개, LSP operation 13개, DAP(debugger) operation 27개. npm 레지스트리 기준 최신 버전은 15.8.3이고 `bun >=1.3.14`를 요구한다.

한 가지 미리 의심해 둘 것 — 별 10.3k는 오늘 기준 snapshot일 뿐이고, 이 저장소는 2025-12-31에 생긴 약 5개월짜리다. 5개월 만에 별 10k가 붙었다는 건 화제성의 증거이지 품질의 증거가 아니다. 별 개수와 코드 품질을 등치시키지 않는 데서 리뷰를 시작한다.

---

## 왜 지금 이 문제가 중요한가

agentic coding의 비용 구조는 단순하다. token은 돈이고, 에이전트는 한 task를 풀기 위해 같은 모델을 수십 번 호출한다. 여기서 두 가지 낭비가 생긴다.

- **모델 낭비:** 파일 이름 바꾸기, grep, 빌드 로그 읽기 같은 잡일까지 전부 frontier 모델 단가로 처리한다.
- **edit 낭비:** 에이전트가 파일을 고칠 때 흔히 쓰는 string-replace 방식은 약한 모델에서 자주 깨진다. 한 줄 고치려고 파일 전체를 다시 출력하거나, anchor를 못 찾아 같은 tool call을 반복하는 식이다. 이 실패가 그대로 output token 청구서가 된다.

omp는 이 두 지점을 동시에 노린다. 첫째, model을 네가 직접 고르고 role별로 routing하게 해서 잡일은 싼 모델로 내린다. 둘째, hashline이라는 edit 방식으로 string-replace의 실패율 자체를 낮춘다. 발상 자체는 내가 Ultra Harness에서 subagent로 하려던 일을, harness 레벨이 아니라 도구 레벨에서 푼 것에 가깝다.

---

## 어떻게 동작하는가

### hashline edit — 가장 영리한 부분

omp에서 제일 똑똑하다고 느낀 건 hashline이다. 보통의 edit 도구는 "이 문자열을 찾아서 저 문자열로 바꿔라"는 string-replace다. 문제는 모델이 원본 문자열을 정확히 기억하지 못하면(공백 하나, 따옴표 하나만 틀려도) patch가 통째로 실패한다는 것이다. hashline은 문자열 대신 **각 줄의 content hash를 anchor로 쓴다.** 모델은 "이 hash가 붙은 줄을 이렇게 바꿔라"라고 지시하고, anchor가 실제 파일과 어긋나면 patch를 거부한다.

```text
# string-replace (기존)
old: "  const timeout = 3000  // ms"   ← 공백·주석까지 정확히 맞아야 함
new: "  const timeout = 5000  // ms"

# hashline (omp)
@a3f9 → const timeout = 5000   ← 줄 content hash로 위치를 고정
```

이게 왜 중요한가. string-replace가 깨지면 모델은 "그럼 파일 전체를 다시 쓰자"로 도망가고, 그 순간 output token이 폭발한다. hashline은 그 실패 경로를 막는다. 저장소는 hashline 덕에 output token이 줄고 약한 모델의 pass-rate가 크게 오른다고 주장한다 — 이 수치는 뒤에서 따로 의심한다.

### model routing — 가성비의 본체

omp는 free + MIT이고 **BYO-credentials**다. 40개 이상의 provider를 붙일 수 있다. frontier API(Anthropic, OpenAI, Gemini, xAI, Groq, Cerebras, Fireworks...), coding-plan route(Cursor, GitHub Copilot, GitLab Duo, Kimi, MiniMax, Qwen, GLM...), 그리고 **local(Ollama, LM Studio, llama.cpp, vLLM)**. 마지막 줄이 핵심이다. local 모델로 돌리면 API 비용이 사실상 ~$0이 된다.

여기에 role 기반 routing이 붙는다.

| role | 용도 | 권장 모델 성향 |
|------|------|----------------|
| default | 일반 작업 | 중급 모델 |
| smol | cheap subagent, 잡일 | 싸고 빠른 모델 (Grok Code Fast, Cerebras 등) |
| slow | 깊은 reasoning | frontier 모델 |
| plan | 계획 수립 | reasoning 강한 모델 |

session 중간에 `/model`로 즉시 바꿀 수 있고, credential을 round-robin으로 쌓아 quota를 분산한다. 설치도 한 줄이다.

```bash
# 설치
curl -fsSL https://omp.sh/install | sh
# 또는
bun install -g @oh-my-pi/pi-coding-agent   # bun >=1.3.14
# 또는 (Windows PowerShell)
irm https://omp.sh/install.ps1 | iex
```

진입점은 TUI, one-shot(`omp -p`), Node SDK, RPC, ACP(Zed)까지 있다. one-shot은 내가 harness에서 즐겨 쓰는 패턴이라 반갑다.

```bash
# 비대화형 one-shot — CI나 스크립트에 박기 좋다
omp -p "이 디렉토리 테스트 전부 돌리고 실패만 요약해줘"
```

### 나머지 native 도구들

omp의 진짜 차별점은 도구 깊이다. 핵심만 끊어 보면 이렇다.

- **실제 debugger attach** — lldb/dlv/debugpy로 27개 DAP operation. 로그만 읽는 게 아니라 진짜 breakpoint를 건다.
- **persistent runtime** — Python/JS runtime이 떠 있으면서 agent tool을 거꾸로 호출한다.
- **관통하는 LSP rename** — barrel/re-export를 가로지르는 rename까지 13개 operation.
- **isolated subagent** — worktree 격리 후 typed JSON으로 결과 반환.

여기에 "Hindsight"라는 cross-session memory, abort-mid-token 후 교정을 주입하는 time-traveling stream rule, stealth Puppeteer browser, 14-provider web-search auto-chain까지 얹힌다. 기능 목록상으로는 first-party를 통틀어 가장 넓다 — 다만 넓이가 곧 안정성은 아니다(churn과 불안정성은 아래 한계 섹션에서 따로 깐다).

---

## omp vs Claude Code vs Codex — CLI를 얼마나 내 손에 쥐는가

사용자가 가장 궁금해한 비교인데, 축을 하나로 모으면 선명해진다. **이 CLI 에이전트를 내가 어디까지 뜯어고칠 수 있는가**다. 셋 다 터미널에서 도는 코딩 에이전트지만, "내 CLI 환경"을 손에 쥐는 정도가 다르다.

| 항목 | omp | Claude Code | Codex |
|------|-----|-------------|-------|
| 코어 개방성 | **오픈소스(MIT), fork해서 코어까지 개조 가능** | 클로즈드 소스 (코어 루프 수정 불가) | CLI는 오픈소스, 단 OpenAI 모델 중심 |
| 커스텀 방식 | TypeScript extension이 built-in과 같은 tool API 사용, plugin hot-reload, TUI 동작까지 손댐 | skill · subagent · hook · MCP · CLAUDE.md (정해진 확장 표면) | AGENTS.md · config · MCP |
| 모델 선택 | provider-agnostic, 40+ provider + local, `/model`로 중간 교체 | Anthropic 모델 only (lock-in) | OpenAI 모델 only (lock-in) |
| 에디터/진입점 | TUI · one-shot · Node SDK · RPC · ACP(Zed 등 에디터 직결) | 자체 TUI + IDE 확장 | 자체 TUI + IDE 확장 |
| 폴리시 / 안정성 | power-user 지향, 설정 많고 거칠다, churn 큼 | first-party, 폴리시·안정성 높음 | first-party, 폴리시·안정성 높음 |
| 지원 | community only | first-party 지원/SLA | first-party 지원/SLA |

핵심은 이거다. omp는 **CLI 에이전트 자체를 내가 소유한다.** 도구를 새로 짜 넣고, TUI 동작을 바꾸고, 모델 routing을 내 워크플로에 맞춰 재설계하고, ACP로 Zed 같은 에디터에 직접 붙인다. extension이 내장 도구와 똑같은 API를 쓰니 "플러그인이 할 수 있는 일"과 "코어가 할 수 있는 일"의 경계가 사실상 없다.

반면 Claude Code는 코어가 클로즈드라 정해진 확장 표면(skill·subagent·hook·MCP·CLAUDE.md) 안에서만 논다 — 넓고 잘 다듬어졌지만 에이전트 루프 자체는 못 바꾼다. Codex CLI는 오픈소스라 고칠 여지는 있으나 OpenAI 모델 중심이라, "모델까지 내 맘대로"는 omp가 압도한다.

그래서 CLI 환경에서의 장단점은 한 줄로 갈린다. **omp는 전부 내 손에 쥐어 주는 대신 내가 다 관리해야 하고, Claude Code/Codex는 정해진 틀에 가두는 대신 알아서 매끄럽게 돌아간다.** 무엇을 customize할지가 분명하고 그 유지 비용을 감당할 사람이면 omp의 천장이 압도적으로 높고, "그냥 잘 돌면 된다"면 first-party의 폴리시가 이긴다.

---

## 가성비 — 구독(Max)이냐, API 토큰이냐

사용자가 가장 알고 싶어한 지점이다. omp의 가성비는 결국 **"model을 내가 고른다"**는 한 가지에서 나온다. 그래서 질문이 "omp가 싸냐"가 아니라, **고정 구독료(Claude Max·Codex 최상위 plan)와 쓴 만큼 내는 API 토큰 중, 같은 사용량에서 뭐가 싸냐**로 바뀐다.

### 고정 구독 vs 종량 토큰

Claude Code와 Codex의 최상위 plan은 **월 정액**이다. Claude Max는 대략 월 $100(5x)~$200(20x), ChatGPT/Codex 최상위도 대략 월 $200 선이다(시점·플랜에 따라 변동). 정액제의 성격은 분명하다 — **아주 무겁게 쓰면 본전 이상**이지만, 한도가 있고 벤더 모델에 묶인다.

omp는 정반대다. 정액이 없고 **BYO-key로 쓴 토큰만큼만** 낸다. 같은 사용량을 놓으면 셈이 이렇게 갈린다.

| 사용 강도 | 정액 구독 (Max ~$100-200/월) | omp + frontier API (종량) | omp + cheap/local 모델 |
|-----------|------------------------------|----------------------------|-------------------------|
| 가벼움 | 한도 남아돌아 **돈 낭비** | 토큰값만 내서 **저렴** | 거의 $0 |
| 보통 | 대체로 본전 | list rate라 구독료에 근접/초과 | 구독료의 일부 |
| 아주 무거움 | 한도 안이면 **정액이 이김** | list rate 종량이라 **더 비쌀 수도** | 여전히 가장 쌈(품질은 타협) |

두 가지가 핵심이다. 첫째, **가볍게 쓰는 사람**에게 월 $200 정액은 그냥 낭비고, 토큰만 내는 omp가 싸다. 둘째, omp의 진짜 무기는 **model을 골라 단가 자체를 내리는 것**이다. 똑같은 일을 frontier 대신 cheap route(Grok Code Fast, Cerebras, MiniMax, GLM)나 local(Ollama·vLLM)로 내리면 토큰 단가가 한 자릿수 분의 일로 떨어진다. role routing으로 잡일은 smol(싼 모델), 깊은 추론만 slow(frontier)에 보내 "비싼 모델을 비싼 일에만" 쓰면, 같은 작업량의 토큰 청구서가 정액 구독료보다 한참 아래로 내려갈 수 있다. 정액제에는 이 "단가를 내가 내리는" 레버가 없다.

### 단, "Claude를 구독가로 싸게"는 막혔다

여기에 2026년의 결정적 변수가 있다. 2026-04-04 Anthropic이 third-party agent의 Pro/Max 구독 credential 사용을 금지했다가 반발로 약 24시간 만에 철회했지만, **2026-06-15부터** agent / Agent-SDK / `claude -p` workload는 pool·이월 불가의 별도 월간 credit(Pro $20 / Max-5x $100 / Max-20x $200)에서 빠지고, 그걸 넘기면 **standard API list rate로 과금된다.**

풀어 말하면, omp 같은 third-party harness 안에서 **Claude를 "Max 구독가로 싸게" 쓰던 길이 막힌다.** omp로 Claude/GPT 같은 frontier를 통과시키면 구독 할인이 아니라 full API list rate가 그대로 붙는다(Tech Times 2026-06-02도 이 credit이 per-user·non-poolable·non-rolling이라고 전한다).

그래서 omp의 비용 우위는 **Anthropic·OpenAI 모델이 아니라 cheap/local 모델에서** 나온다는 점을 분명히 해야 한다. "무제한에 가까운 frontier"를 정액으로 쓰고 싶으면 그건 Max plan의 영역이지 omp의 영역이 아니다.

### hashline 수치는 self-report다

토큰 단가를 따진 김에, 앞에서 미뤄둔 hashline benchmark도 정리한다. README는 hashline이 output token을 **−61%**(Grok 4 Fast 기준) 줄이고 약한 모델 pass-rate를 **Grok Code Fast 6.7%→68.3%**, **MiniMax 2.1x**, **Gemini 3 Flash +5pp** 끌어올린다고 적는다. 셋 다 의심할 지점이 있다.

- **약하고 싼 모델 편향.** 폭등 수치는 전부 약하고 싼 모델에서 나온다. string-replace로 자꾸 깨지던 모델을 hashline이 "구조한" 것이지, 모델을 똑똑하게 만든 게 아니다.
- **강한 모델에선 효과가 압축된다.** Better Stack 가이드는 omp 문서를 인용해 Claude Opus에선 절감이 "그 절반 정도(~30%)"라고 적는다. 즉 −61%는 평균이 아니라 best-case다.
- **독립 검증 부재.** sample size·task set·harness가 없는 self-report이고, README 바깥에서 교차 검증되지 않는다.

요컨대 hashline은 가성비에 분명히 보탬이 되지만(output token이 줄면 종량 청구서가 준다), 그 보탬은 "싼 모델을 덜 깨지게" 만드는 쪽이지 광고판의 배수 그대로가 아니다.

### 그리고 진짜 비용은 네 시간이다

omp의 종량 가성비에는 보이지 않는 비용표가 붙는다. 40+ provider에 걸친 key·quota 관리, round-robin credential stacking, role routing(default/smol/slow/plan) 설계, 그리고 거친 부분 쫓아다니기가 전부 네 몫이다. Claude Code/Codex는 정액을 더 내는 대신 그 관리를 거의 0으로 만들고 first-party 지원과 SLA를 끼워 준다. 그러니 omp의 가성비는 **"토큰값을 아끼는 대신 내 시간으로 메운다"**로 읽어야 정확하다.

---

## 내가 의심하는 지점 / 한계

- **churn과 불안정성.** 2025-12-31 생성 이후 ~5개월간 약 415 release, 약 6,931 commit이면 하루에 여러 번 배포된다는 뜻이다. open issue는 264개. Hacker News 사용자는 "파일 하나 고치는 tool call을 11번 반복했다", upstream 업데이트가 tool-calling을 깨뜨린 뒤 모델이 "파일 전체를 기억에서 다시 써냈다", 업데이트 후 Hindsight memory가 stale해졌다 같은 구체적 불안정성을 보고한다. update를 당겨오면 동작이 나빠질 수 있다. 이건 stable daily driver가 아니라 bleeding-edge다.
- **검증 공백.** 별 10k가 ~5개월 만에 붙었지만, 그 상당수는 HN 한 번과 SEO/AI 생성 "리뷰"의 파도에서 왔다. explainx, betterstack, stork, knightli, note.com 류의 listicle은 대체로 홍보성이고, 한 가이드는 "critical caveat가 전혀 없는 entirely promotional" 평가를 받는다. 다만 앞서 인용한 Better Stack의 Opus ~30% 대목만큼은 omp 자체 문서 수치를 출처와 함께 재인용한 것이라 그 한 줄은 신뢰할 만하다. 적대적이고 독립적인 benchmark는 사실상 없다. **별 개수는 성능 주장의 검증이 아니다.** 게다가 자주 인용되는 owainlewis/jock.pl 리뷰의 일부는 omp가 아니라 upstream Pi를 평가한 것이다. owainlewis는 Pi에 "subagent가 없다"고 적었는데 omp는 그걸 추가했으니, omp 고유의 공개 반응은 더 얇은 셈이다.
- **first-party의 추격.** Claude Code와 Codex도 이미 MCP, subagent, plan mode, hook, in-repo search, frontier 모델에서의 안정적 edit을 갖췄다. omp의 우위(debugger attach, in-process Rust 도구, hashline)는 **약하고 싼 모델과 niche workflow에서 가장 날카롭다.** top 모델 + 구독으로 가면 Claude Code 대비 marginal benefit은 줄어드는데 설정 비용은 그대로다.
- **단독 메인테이너 + 보안 표면.** 빠르게 움직이는 solo-led 프로젝트가 embedded bash(`brush`), agent tool을 거꾸로 호출하는 persistent Python/JS runtime, stealth Puppeteer browser, 14-provider web-search auto-chain을 한 번에 들고 있다. autonomous agent에게 실제 codebase에서 shell + network 권한을 줄 때, 이건 상당한 attack/footgun 표면이다. bus-factor도 함께 고려할 일이다.

---

## 언제 써볼 만한가 / 결론

깎아내리려는 게 아니다. 아키텍처는 진지하고, hashline과 in-process native 도구는 실제로 영리하다. 독립 리뷰어 jock.pl도 "제약 없이 고를 수 있다면 Pi가 Claude Code를 대체할 daily harness에 가장 근접한 것"이라고 했다. 문제는 "제약 없이"라는 전제가 현실에선 성립하지 않는다는 것뿐이다.

정리하면 이렇다.

- **omp가 맞는 사람:** 비용에 민감한 tinkerer, local LLM 사용자, 자기 harness/automation을 직접 만드는 사람, 또는 더 나은 edit 포맷으로 싼 모델을 구조하려는 사람. 모델 자유나 offline이 중요하면 사실상 유일한 선택지다.
- **Claude Code가 맞는 사람:** frontier Anthropic 모델로 autonomous/overnight 품질을 최소한의 손길로 뽑고 싶은 사람.
- **Codex가 맞는 사람:** OpenAI 모델로 turnkey 가성비를 원하는 일반 solo dev.

가성비의 솔직한 결론은 이거다. **omp는 cheap/local 모델을 받아들이고 routing·key 관리를 스스로 할 의향이 있을 때 "가능한 가장 싼" 옵션이다.** 그 의향이 없다면, Codex가 가장 싼 turnkey이고 Claude Code가 가장 비싸지만 가장 매끄럽다. 나는 당장 Claude Code를 버리진 않겠지만, smol role을 local 모델로 내려 잡일 token을 ~$0으로 만드는 실험만큼은 omp로 해볼 가치가 있다고 본다. 돈을 아끼는 대가가 내 시간이라는 걸 분명히 알고서.

*omp는 돈을 최소화하는 대신 네 시간을 쓰게 하고, Claude Code/Codex는 시간을 최소화하는 대신 돈과 model lock-in을 쓰게 한다 — "가장 싸다"는 그 트레이드를 받아들일 때만 참이다.*
