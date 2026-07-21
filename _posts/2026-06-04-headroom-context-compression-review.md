---
title: "Headroom 리뷰 — 에이전트가 읽기 전에 context를 압축한다는 발상, 진짜일까"
description: "AI 코딩 에이전트의 token 비용을 LLM에 닿기 전에 줄이겠다는 오픈소스 Headroom을 뜯어봤다. CCR reversible compression 구조부터 저장소가 공개한 수치의 함정, 내가 의심하는 지점까지 솔직하게 정리한다."
date: 2026-06-04
categories: [Dev]
tags: [AI, Blog]
---

Claude Code를 프로젝트 단위로 오래 굴리다 보면 비용 청구서가 거짓말을 하지 않는다. 에이전트 루프 한 번이 도는 동안 모델은 같은 파일 트리, 같은 build log, 같은 JSON 응답을 몇 번이고 다시 읽는다. 그 대부분은 정보량이 거의 없는 redundant token이다. [Ultra Harness를 만들면서]({% post_url 2026-05-20-claude-code-ultra-harness %}) 파일 줄 수를 Hook으로 막아본 적은 있지만, 그건 코드 비대화를 막는 일이지 모델이 삼키는 context 자체를 줄이는 일은 아니었다.

그래서 "에이전트가 읽기 전에 context를 압축한다"는 Headroom을 살펴봤다. 확인할 질문은 압축률 자체가 아니다. 로그와 검색 결과를 줄인 뒤에도 오류 원인과 코드 위치처럼 작업에 필요한 정보가 남는가, 그리고 원문을 다시 볼 수 있는가다.

---

## Headroom이 뭔가

Headroom([github.com/chopratejas/headroom](https://github.com/chopratejas/headroom))은 AI 에이전트가 읽는 모든 것 — tool output, log, RAG chunk, 파일, 대화 히스토리 — 을 **LLM에 도달하기 전에 압축하는 레이어**다. 핵심 아이디어는 단 하나다. "어차피 모델이 다 읽지 않을 거면, 모델에게 보내기 전에 줄여서 보내자." 저장소는 content type에 따라 token을 60~95% 줄이면서 답변 정확도는 유지한다고 주장한다.

모든 처리는 local-first다. proxy도 로컬에서 돌고 CCR 저장소도 로컬에 있다. Apache-2.0 라이선스이고, 글을 쓰는 시점 GitHub에 별 약 9.8k개, fork 645개가 찍혀 있다.

흥미로운 건 언어 구성이다. Python 76.8%, Rust 18.4%, TypeScript 2.7%. compressor와 tokenizer, transform 같은 hot path는 실제로 Rust crate(`headroom-core`, `headroom-proxy` 등)에 들어 있다. 이 crate는 PyO3 cdylib로 빌드돼 Python에 `headroom._core`로 노출된다. 즉 "Python으로 적당히 짠 wrapper"가 아니라 hot path를 native로 내린 polyglot monorepo다. 이 점은 내가 처음 기대했던 것보다 진지했다.

---

## 왜 지금 이 문제가 중요한가

context window economics는 단순하다. token은 돈이고, 같은 token을 반복해서 보내면 돈이 반복해서 빠진다. agentic coding은 이 문제를 구조적으로 악화시킨다.

- 에이전트는 한 task를 풀기 위해 tool을 여러 번 호출하고, 그 결과를 매 turn마다 context에 다시 쌓는다.
- `ls -R` 한 번, 100건짜리 search 결과 한 번, 200줄 build log 한 번 — 이런 게 turn마다 누적되면 context window가 금세 찬다.
- context가 차면 모델이 느려지고, 비싸지고, 정작 중요한 정보가 window 밖으로 밀려난다.

내 경험상 가장 아까운 건 "정보 밀도가 낮은 거대한 tool output"이다. JSON array 100개를 받았는데 그중 진짜 봐야 하는 필드는 두세 개뿐인 경우, 나머지는 순수하게 token만 잡아먹는다. Headroom이 정조준한 지점이 정확히 여기다. 모델의 reasoning은 건드리지 않고, 모델 입력단의 군더더기만 깎겠다는 것.

---

## 어떻게 동작하는가 (아키텍처)

저장소 문서가 설명하는 파이프라인은 세 단계다. 들어온 메시지를 받아 prefix를 안정화하고(CacheAligner), content type을 감지해 전용 compressor로 보내고(ContentRouter), token budget 안에 맞도록 메시지 중요도를 점수화한다(IntelligentContext).

| 컴포넌트 | 역할 | 비고 |
|----------|------|------|
| CacheAligner | system prompt의 동적 부분(날짜, UUID, session token)을 추출해 뒤로 보내 prefix를 안정화 | provider KV cache hit 보존이 목적, sub-ms overhead |
| ContentRouter | content type을 감지해 가장 적합한 compressor로 라우팅 | 실제 코드는 `compression/detector.py` |
| SmartCrusher | JSON array/객체를 통계 분석으로 압축 (variance, uniqueness, change point) | `max_items_after_crush=15` 같은 config |
| CodeAwareCompressor | AST 기반 압축, signature는 보존하고 body는 collapse | 문서에 따라 `CodeCompressor`로도 표기됨 |
| TextCompressor 외 | log/search/diff/HTML용 전용 compressor | LogCompressor, SearchCompressor 등 |
| CCR | 압축 전 원본을 로컬에 보관, 모델이 필요하면 tool call로 원본을 retrieve | reversible compression의 핵심 |

한 가지 먼저 짚어야 할 게 있다. ContentRouter, SmartCrusher, CodeCompressor, CacheAligner 같은 멋진 이름들은 **README/마케팅 라벨이지 실제 Python 클래스명이 아니다.** 저장소를 까보면 라우팅은 `detector.py`, JSON 압축은 `handlers/json_handler.py`, 코드 압축은 `handlers/code_handler.py`로 되어 있다. 기능은 코드로 뒷받침되지만 고유명사는 그 위에 입힌 브랜딩이다. 리뷰어로서 클래스명 하나하나에 과몰입하지 않는 게 맞다.

### CCR이 진짜 영리한 부분

Headroom에서 가장 똑똑하다고 느낀 건 CCR(Compress-Cache-Retrieve)이다. 보통의 prompt compression은 lossy다. 한 번 깎아낸 token은 영영 사라진다. 정확도가 떨어지는 근본 이유가 여기 있다. CCR은 발상을 뒤집는다.

1. 압축할 때 **원본을 로컬 캐시에 보관**하고, 모델에게는 압축본 + hash를 보낸다.
2. 모델이 "이건 원본을 봐야겠다"고 판단하면 주입된 `headroom_retrieve` tool을 호출한다. (description: "Retrieve original uncompressed data from Headroom cache")
3. proxy가 이 tool call을 가로채 로컬 캐시에서 약 1ms 만에 원본을 돌려주고, API 호출은 자동으로 이어진다.
4. `query` 파라미터를 같이 주면 캐시된 항목에 대해 BM25 검색을 돌려 **전체 원본이 아니라 관련 부분만** 반환한다.

이게 영리한 이유는 명확하다. 평소엔 압축본으로 token을 아끼다가, 모델이 디테일이 필요하다고 느낄 때만 on-demand로 원본을 꺼낸다. lossy의 비용 절감과 lossless의 안전성을 모드 전환으로 절충하려는 시도다.

다만 문서가 "Nothing is ever thrown away", "every piece of original data remains accessible"라고 단언하는 부분은 액면 그대로 받으면 안 된다. 같은 CCR 페이지가 `storeMaxEntries: 1000`(LRU)와 `storeTtlSeconds: 3600`(1시간 TTL)을 기본값으로 문서화한다. 즉 원본은 **캐시 수명 안에서만** 보장된다. 1시간이 지나거나 항목이 1000개를 넘어 evict되면 그 원본은 사라진다.

그리고 더 중요한 전제 — 모델이 `headroom_retrieve`를 **실제로 호출해야** 원본이 복원된다. 모델이 "압축본만으로 충분하다"고 오판하고 그냥 답해버리면, 그 turn에서 깎인 디테일은 기능적으로 손실된 것이다. "reversible-on-demand"는 정확한 표현이고 "lossless"는 마케팅이다.

---

## 숫자로 보는 효과

저장소가 공개한 수치부터 보자. 이건 어디까지나 프로젝트 자체가 보고한 값이고 제3자가 독립적으로 재현한 게 아니다.

| 워크로드 | before → after (token) | 절감률 |
|----------|------------------------|--------|
| code search (100 results) | 17,765 → 1,408 | 92% |
| SRE incident debugging | 65,694 → 5,118 | 92% |
| GitHub issue triage | 54,174 → 14,761 | 73% |
| codebase exploration | 78,502 → 41,254 | 47% |

accuracy benchmark도 README에 같이 실려 있다. GSM8K 0.870 → 0.870 (변화 없음), TruthfulQA 0.530 → 0.560 (+0.030), SQuAD v2 19% 압축에서 97% 정확도, BFCL 32% 압축에서 97% 정확도. 별도로 docs의 benchmark 페이지에는 HTML 추출 F1 0.919, QA F1 0.85 → 0.87 같은 다른 수치가 실려 있다. (참고로 docs와 README는 benchmark set이 서로 다르다. 같은 프로젝트인데 보고 수치가 page마다 갈린다는 건 그 자체로 성숙도 신호다.)

여기서 멈추면 광고문이다. 의심해야 할 지점이 셋 있다.

**첫째, 90%대 숫자는 가장 압축이 잘 되는 데이터 타입에서 나온다.** 92%가 찍힌 code search, SRE 워크로드는 log와 반복적 JSON처럼 redundancy가 극단적으로 높은 데이터다. 같은 표 안에서 codebase exploration은 47%다. 저장소 자신의 문서조차 git diff는 거의 0%, dense prose는 심하면 token이 **늘어나는** 경우(약 -0.3%)를 인정한다. 즉 60~95%는 best-case 범위지 평균이 아니다.

**둘째, production telemetry가 헤드라인과 다르다.** docs의 benchmark 페이지는 5만 세션 이상에서 측정한 **median 압축률이 4.8%**라고 적는다 (헤드라인 60~95%와 한 자릿수 차이다). 40~80%는 heavy tool-use 워크로드에 한정된 값이다. 다시 말해 일반 트래픽 대부분에서 실제 end-to-end 절감은 헤드라인보다 훨씬 낮다.

**셋째, 독립 측정이 거의 없고, 있는 것은 더 보수적이다.** 한 독립 블로거(Miya-Gadget)가 실제 multi-tool 디버깅 세션을 측정한 결과는 59,742 → 31,358 token, **47.5% 절감**이었다. 타입별로는 code 79.8%, JSON 59.2%, log는 31.0%였다. HN 스레드의 한 사용자도 Claude Code에 붙여보고 "약 50% 절약"이라고 보고했다. 90%가 아니라 45~50%가 현실적인 혼합 세션의 수치라고 보는 게 안전하다.

accuracy 쪽도 비슷하다. GSM8K가 유지됐다는 건 좋지만, TruthfulQA의 +0.030 같은 swing은 confidence interval도 run 수도 공개되지 않아 작은 데이터셋의 noise일 가능성을 배제할 수 없다. 게다가 이 benchmark는 전부 프로젝트 자체 eval framework(`headroom.evals`)로 돌린 self-reported 값이다. lm-eval harness wrapper와 22개 가량의 벤치 스크립트가 저장소에 실재하긴 하지만, 그게 README의 숫자를 고정된 모델/seed/데이터셋 버전에서 생산했다는 보장은 없다.

---

## 네 가지 사용 모드

Headroom은 붙이는 방법이 여러 갈래다. 다만 미리 경고하면, 아래 1번과 2번은 docs로 확인되지만 3번 `wrap`과 4번 `mcp install`은 docs 사이트(`/docs/cli`가 404)에서 확인되지 않았고 README 기준이다. 모듈(`mcp_registry/`, `learn/`)은 저장소에 실재한다.

**1) Library — `compress()` 직접 호출**

```python
from headroom import compress

result = compress(messages, model="claude-sonnet-4")
# 반환 metric 필드: tokensBefore, tokensAfter, tokensSaved, compressionRatio, transformsApplied, messages
print(result.compressionRatio, result.tokensSaved)
```

위 필드명은 저장소가 문서화한 반환 metric 기준이며, SDK·버전에 따라 attribute 표기는 달라질 수 있다. 또 한 가지, TypeScript SDK의 `compress()`는 순수 in-process가 아니다. 내부적으로 로컬 proxy에 HTTP로 메시지를 보내 압축한다. 즉 TS의 "library" 모드는 proxy 위에 얹은 얇은 client에 가깝고, proxy를 먼저 띄워야 한다.

**2) HTTP proxy — 코드 0줄 수정**

```bash
headroom proxy --port 8787
# 에이전트는 환경변수로 라우팅
ANTHROPIC_BASE_URL=http://localhost:8787 claude
OPENAI_BASE_URL=http://localhost:8787/v1
```

`/stats`로 누적 절감을 볼 수 있고, `--budget`, `--no-cache`, `--llmlingua` 같은 플래그가 있다. mode는 `audit`(관찰/로깅만), `optimize`(안전한 deterministic transform, 기본값), `simulate`(API 호출 없이 plan만 반환해 비용 추정)로 나뉜다. Claude Code, Codex, Aider, Cursor가 명시적으로 호환 목록에 있다.

**3) Agent wrap (README 기준, docs 미확인)**

```bash
headroom wrap claude
```

**4) MCP server (README 기준, docs 미확인)**

```bash
headroom mcp install
```

설치는 셋 다 표준적이다.

```bash
pip install "headroom-ai[all]"
npm install headroom-ai
docker pull ghcr.io/chopratejas/headroom:latest
```

extras로 `[proxy]`, `[ml]`, `[code]`, `[mcp]`, `[langchain]`, `[evals]` 등을 골라 깔 수 있다. Python 3.10+가 필요하다.

---

## 인상 깊은 설계 결정

의심은 잠시 미뤄두고, 잘 짠 부분을 정리한다.

- **local-first.** proxy도 CCR 저장소도 로컬이다. payload를 외부 SaaS로 흘리지 않는다는 건 보안 민감한 환경에서 의미가 크다.
- **reversible를 기본 철학으로 삼은 점.** lossy compression의 정확도 리스크를 retrieval tool로 상쇄하려는 발상은 단순한 token 절약 도구들과 차별화된다.
- **content-aware routing.** "모든 걸 같은 방식으로 압축"하지 않고 JSON, 코드, log를 각자 다른 전략으로 다룬다. JSON에 통계 분석, 코드에 AST를 쓰는 건 합리적이다.
- **KV cache를 의식한 CacheAligner.** 많은 prompt compression이 prefix를 마구 바꿔 provider의 prompt cache hit를 깨버리는데, Headroom은 동적 부분을 뒤로 빼서 cache hit를 보존하려 한다. 이건 비용을 다른 축에서 추가로 아끼는, 디테일이 살아 있는 결정이다.
- **cross-agent memory와 `headroom learn`.** Claude/Codex/Gemini가 압축된 context를 공유(dedup 포함)하고, 실패한 세션을 분석해 `CLAUDE.md`/`AGENTS.md`에 교정을 적는다는 기능. 저장소에 `memory/`, `learn/` 모듈이 실재한다. 다만 모듈이 있다는 건 의도와 scaffolding의 증거지, end-to-end로 잘 동작한다는 증명은 아니다.

이 `headroom learn`이라는 발상은 내 Ultra Harness 철학과 묘하게 닿아 있다. 나는 규칙을 `~/.claude/rules/`에 수동으로 쌓는데, 실패한 세션에서 자동으로 교정을 추출해 규칙 파일에 적어준다면 그 노동을 덜어줄 여지가 있다. 매력적인 방향인 건 분명하다.

---

## 내가 의심하는 지점 / 한계

리뷰의 핵심이다. 솔직하게 적는다.

**1) lossy 정확도 리스크가 retrieval에 전적으로 의존한다.** 앞서 말했듯 CCR의 안전망은 모델이 `headroom_retrieve`를 호출해야만 작동한다. 모델이 압축본만으로 답해버리면 깎인 디테일은 그대로 손실이다. 코드 생성, incident response, 규제 산업처럼 정확도가 치명적인 도메인에서 "모델이 얼마나 자주 retrieve에 실패하고 degraded context로 조용히 답하는가"를 정량화한 독립 데이터가 없다. 이게 가장 큰 미지수다.

**2) request path에 제3자 컴포넌트가 끼어든다.** proxy든 wrap이든, 모든 prompt가 Headroom을 통과한다. 저자는 1~5ms overhead라고 주장하지만, 압축 단계의 비용이 좁은 운영 구간 밖에서는 end-to-end 속도 이득을 상쇄할 수 있다는 건 prompt compression 연구의 일관된 지적이다. 게다가 모든 prompt가 흐르는 단일 지점은 성능 이슈를 넘어 가용성/보안의 single point of failure다. 엔터프라이즈 보안팀이 민감 payload의 새 interception point를 반길 리 없다.

**3) native compaction + prompt caching과 상당 부분 겹친다.** 저장소 자신의 when-to-use 가이드가 "단일 provider의 native compression으로 충분하면 Headroom을 건너뛰라"고 적는다. Anthropic 계열의 automatic context compaction이나 context editing은 단일 provider 사용자에게 의존성 추가 없이 이미 장기 에이전트 context를 다루는 것으로 알려져 있다. prompt caching도 반복 prefix 비용을 다른 축에서 깎는다. Headroom의 진짜 가치는 multi-agent / cross-provider / reversible라는 좁은 niche로 수렴한다 — 그리고 그 niche는 저장소의 가이드 스스로가 그어놓은 경계와 정확히 같다.

**4) lock-in.** Apache-2.0이고 local-first라 vendor lock-in은 약하지만, **operational lock-in**은 실재한다. 에이전트들이 Headroom의 retrieval tool 의미론과 압축 포맷에 의존하기 시작하면, 그게 request path의 load-bearing 컴포넌트가 된다. v0.x의 사실상 단일 메인테이너(chopratejas) 프로젝트가 내 파이프라인의 중심에 들어오는 건 의존성 리스크다. 게다가 그 위에 얹은 상용 제품(ExtraHeadroom)이 존재한다는 점은 흔한 open-core 궤적의 질문을 부른다.

**5) 프로젝트 성숙도가 어리고, 독립 검증이 얇다.** 별 9.8k개가 많아 보이지만 fork는 645개이고, HN 스레드 셋은 각각 2~5개 댓글에 그치며 그나마 대부분 저자 본인 코멘트다. 한 HN 사용자는 "이게 뭘 하는지 예시가 하나도 없다"고 적었다. 5월 trade press 시점엔 별이 약 2k였으니 traction의 대부분이 매우 최근의 급성장이고, 그에 비례하는 독립적 기술 검증이 따라붙지 않았다. The Register, AI Weekly 등의 보도도 대부분 저자의 Open Source Summit 발표를 받아쓴 것이지 직접 테스트한 게 아니다.

**6) 헤드라인 절감 수치가 self-reported다.** "1.4 billion token 절감 / 약 $4,000"(docs telemetry)와 발표에서 언급된 "$700K / 200B token"은 출처가 서로 다른 별개의 값이고, 둘 다 opt-in telemetry를 저자가 집계한 것이다. 저자 본인이 LinkedIn에서 "telemetry 공유에 opt-in한 사람들이 아낀 200B token"이라고 명시했다. 표본 크기도 기간도 방법론도 공개되지 않았다. 확정된 성과로 인용하면 안 되는 숫자다.

기성 대안과 비교하면 위치가 더 분명해진다. Microsoft의 LLMLingua/LongLLMLingua는 학술적으로 더 검증돼 있고(EMNLP'23/ACL'24), 측정된 accuracy 비용과 함께 최대 20x 압축을 보고한다. Headroom의 차별점은 결국 세 가지로 좁혀진다 — (a) cache hit를 보존하는 CacheAligner, (b) 영구 token drop이 아닌 CCR reversible retrieval, (c) prose 압축용 자체 모델 Kompress-base. 이 중 Kompress-base는 HuggingFace의 ModernBERT 계열 ~150M 파라미터 모델로, Apache-2.0 라이선스로 LLMLingua-2를 대체하겠다고 표방한다. 이 셋이 매력적인 건 맞지만, 그게 전부라는 것도 인정해야 한다.

---

## 언제 써볼 만한가 / 결론

정직한 판정은 이렇다. Headroom은 **영리한 아이디어와 진지한 엔지니어링(Rust hot path, content-aware routing, CCR)을 갖췄지만, 헤드라인 수치를 그대로 믿어선 안 되는 매우 어린 프로젝트**다. 90%는 best-case이고 median은 5% 안팎, 현실적 혼합 세션은 45~50% 부근이다. 정확도는 모델이 retrieve를 제대로 부른다는 전제 위에서만 보장된다.

그래서 내 Claude Code 셋업에 `headroom wrap claude`를 지금 당장 박아 넣을 것이냐 — 아니다. 적어도 지금은 production path가 아니라 **별도 실험 환경에서 `audit` 모드로 먼저 관찰**하겠다. audit는 수정 없이 로깅만 하니, 내 실제 워크로드에서 절감 잠재력이 헤드라인이 아니라 median 쪽에 가까운지 직접 측정할 수 있다. 그 수치가 내 트래픽에서 의미 있게 나오고, retrieve 실패로 인한 정확도 저하가 보이지 않는다면 — 그때 `optimize`로 올리고, tool-output이 무거운 multi-agent 작업에 한정해 붙일 만하다.

요약하면 쓸 조건은 셋이다. (1) AI 코딩 에이전트를 매일 굴려 tool-output 비용이 실제로 아픈 팀, (2) cross-provider 또는 multi-agent로 native compaction만으로는 부족한 경우, (3) reversible compression의 안전망이 필요한 경우. 이 셋에 해당하지 않고 단일 provider의 native 기능으로 충분하다면, 저장소 자신의 조언대로 건너뛰는 게 맞다.

*Headroom은 "모델에 닿기 전에 줄인다"는 영리한 발상을 reversible CCR로 구현했지만, 90%라는 헤드라인보다 median 5%·실측 47%를 먼저 믿고 audit 모드로 직접 재보는 게 이 어린 프로젝트를 대하는 올바른 태도다.*
