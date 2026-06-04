---
title: "Claude Code의 effort와 workflow — 실행 깊이를 조절하는 두 레버"
description: "Claude Code의 effort(추론 깊이 다이얼)와 workflow(subagent 오케스트레이션 스크립트)를 실제로 굴려본 기록. ultracode가 무엇이고 언제 켜야 하는지, 그리고 이 글 묶음이 어떻게 만들어졌는지까지 솔직하게 정리한다."
date: 2026-06-04
categories: [Dev]
tags: [AI, Blog]
---

Claude Code를 오래 쓰면서 한동안 답답했던 지점이 있다. 어시스턴트는 하나인데, 그 하나가 모든 작업을 같은 깊이로 처리한다는 것이다. 오타 한 줄 고치는 일과, 멀티 모듈 리팩토링을 설계하는 일이 동일한 "한 번의 사고 + 한 번의 응답" 루프를 탄다. 가벼운 일에는 과하고, 무거운 일에는 모자라다.

[Ultra Harness를 만들면서]({% post_url 2026-05-20-claude-code-ultra-harness %}) 에이전트를 16개로 계층화하고 호출 동선을 커맨드로 묶어봤지만, 그건 "누구를 부를지"를 정한 것이지 "얼마나 깊게 팔지"를 정한 게 아니었다. 깊이는 여전히 매번 손으로 지시했다.

그 깊이를 다이얼로 빼낸 게 `effort`고, 깊이를 끝까지 올렸을 때 자동으로 켜지는 게 `workflow`다. 이 글은 둘을 실제로 굴려본 기록이다. 마지막에는 이 글을 포함한 리뷰 글 묶음 자체가 어떻게 생산됐는지도 적는다. 그게 가장 솔직한 사용 후기다.

> 미리 밝혀둘 것: 여기서 다루는 effort 레벨(특히 `ultracode`)과 dynamic workflow는 글을 쓰는 시점의 비교적 최근 Claude Code 빌드에서 동작하는 기능이고, 정확한 명칭·설정 경로·동작은 버전에 따라 다를 수 있다. 이 글은 공식 스펙 문서가 아니라 **내 환경에서 실제로 굴려본 기록 + 도구 자체 설명**에 근거한다. 코드 스니펫이 그대로 안 돈다면 십중팔구 빌드 차이이니, 자기 환경에서 확인하길 권한다.

---

## effort — 실행 깊이 다이얼

`effort`는 한 세션이 작업당 쓰는 추론·오케스트레이션의 깊이를 정하는 컨트롤이다. 낮으면 혼자서 빠르고 싸게, 높으면 더 철저하고 비싸게 간다. 레버 하나로 품질·속도·비용을 맞바꾸는 구조다.

| 레벨 | 성격 | 비용/지연 | 설정 경로 |
|------|------|-----------|-----------|
| low | 빠르고 좁게, 단발성 작업 | 가장 저렴 | `/effort` (빌드별 설정) |
| medium | 균형 | 보통 | `/effort` (빌드별 설정) |
| high | 포괄적, 교차 확인 늘어남 | 높음 | `/effort` (빌드별 설정) |
| xhigh | 가장 철저한 단독 추론 | 매우 높음 | `/effort` (빌드별 설정) |
| ultracode | xhigh + 자동 workflow 오케스트레이션 | 가장 높음 | **세션 한정** `/effort ultracode` 또는 키워드 |

설정 방식이 한 칸 다르다는 점이 중요하다. low부터 xhigh까지는 `/effort` 커맨드로 세션에 지정한다(빌드에 따라 설정 파일이나 환경변수로 고정할 수도 있다). 반면 `ultracode`는 세션 한정 토글이다. `/effort ultracode`를 치거나 프롬프트 안에 `ultracode`라고 쓰면 그 세션에만 걸리고, 새 세션을 시작하면 리셋된다. 실제로 `/effort ultracode`를 치면 "Set effort level to ultracode (this session only)"라고 응답한다.

여기서 한 가지 오해를 먼저 깨야 한다. xhigh와 ultracode의 **모델 추론 깊이는 동일하다**. ultracode가 모델에 보내는 reasoning effort는 그대로 xhigh다.

둘의 유일한 차이는 그 위에 자동 workflow 오케스트레이션 레이어가 붙느냐다. 즉 ultracode는 "더 똑똑하게 생각하기"가 아니라 "필요하면 알아서 일을 쪼개 여러 subagent에게 던지기"가 추가된 모드다. 이 환경의 동작 기준으로는, ultracode를 켜면 사용자가 시키기 전에도 Claude가 substantive task마다 workflow를 기본값으로 계획한다.

체감상 이게 핵심이다. effort를 올린다고 답이 갑자기 천재가 되는 게 아니다. xhigh까지는 "한 머리가 더 오래 고민"하는 것이고, ultracode부터는 "여러 머리를 풀어서 커버리지와 교차검증을 산다"는 쪽으로 성격이 바뀐다.

---

## workflow — model이 도는 루프가 아니라 코드가 도는 루프

`workflow`는 deterministic JavaScript 오케스트레이션 스크립트다. 이게 평소의 subagent 호출과 결정적으로 다른 지점이다. 일반적인 subagent/skill/agent team에서는 Claude가 오케스트레이터다. 다음에 누구를 부를지, 루프를 더 돌지를 매 턴 모델이 판단한다. workflow는 그 판단(루프, 분기, 중간 결과 보관)을 **코드로 내린다**. workflow 도구 설명을 그대로 옮기면, workflow script가 loop와 branching과 intermediate result를 직접 들고 있어서, Claude의 context에는 최종 답만 남는다.

Claude가 스크립트를 직접 작성하고, runtime이 그걸 background에서 실행한다. 기본 형태는 fan-out → reduce → synthesize다. 핵심 primitive는 이렇다.

- `agent(prompt, { schema, label, phase, agentType, model, isolation })` — subagent 하나를 띄운다. `schema`를 주면 결과 JSON을 검증한 뒤 돌려준다.
- `parallel(thunks)` — **barrier**다. 전부 끝날 때까지 await하고, 실패한 건 `.filter(Boolean)`으로 떨궈낸다.
- `pipeline(items, ...stages)` — 각 item이 스테이지를 독립적으로 흘러간다. **barrier 없음**이고, multi-stage 작업의 기본값이다.
- `phase()` / `log()` — 진행 상황 표시.
- `budget` — token 목표치에 맞춰 규모를 스케일링.

작은 예시 하나. item 묶음을 `research → draft → factcheck` 세 단계로 흘려보내되, 각 item이 서로를 기다리지 않게 하는 형태다.

```typescript
// pipeline(): 각 아이템이 스테이지를 독립적으로 통과 (barrier 없음)
await pipeline(
  topics, // ["repo-A", "repo-B", ...]
  (topic) =>
    agent(`${topic} 자료 조사`, {
      label: `research:${topic}`,
      phase: "research",
      schema: { type: "object", required: ["topic", "facts", "sources"] },
    }),
  (research) =>
    agent(`초안 작성. 근거: ${JSON.stringify(research.facts)}`, {
      label: `draft:${research.topic}`,
      phase: "draft",
      schema: { type: "object", required: ["topic", "text"] },
    }),
  (draft) =>
    agent(`사실 검증 + 리뷰: ${draft.text}`, {
      label: `verify:${draft.topic}`,
      phase: "verify",
      schema: { type: "object", required: ["issues", "verdict"] },
    }),
);
```

`parallel`을 쓰면 의미가 달라진다. 이쪽은 "전부 모일 때까지 기다렸다가 합친다".

```typescript
// parallel(): barrier — 전부 끝나면 합쳐서 종합
const findings = await parallel(
  files.map((f) => () => agent(`${f} 보안 점검`, { schema: secSchema })),
);
const summary = await agent(`종합: ${JSON.stringify(findings.filter(Boolean))}`);
```

런타임 제약이 있다. 동시 실행 agent는 `min(16, cores-2)` 정도로 캡이 걸리고, 한 run당 총 1000 agent가 상한이다. runaway loop를 막고 자원을 묶어두는 안전장치다. 실행은 background에서 돌고, 끝나면 알림이 오며, 같은 세션 안에서는 runId로 재개할 수 있다. 재개 시 이미 끝난 agent는 캐시된 결과를 그대로 돌려주고 나머지만 라이브로 돈다.

스크립트는 `~/.claude/projects/<session>/`에 떨어져서 직접 읽고 고쳐 다시 돌릴 수도 있고, 마음에 들면 `/workflows`에서 저장해 `.claude/workflows/`(팀 공유)나 `~/.claude/workflows/`(개인용) 슬래시 커맨드로 박을 수 있다.

진짜 가치는 규모 자체보다 **반복 가능한 품질 패턴**에 있다. workflow 도구 설명이 제시하는 품질 패턴들이다(표현은 일부 의역).

- **diverse lenses (여러 각도로 훑기)** — 한 주제를 여러 각도로 동시에 훑어 누락을 줄인다.
- **adversarial verify** — 각 발견에 대해 독립적인 회의론자 agent를 붙여 서로 깐다.
- **judge panel** — 여러 안을 만들어 서로 견주게 한다.
- **loop-until-dry** — 더 나올 게 없을 때까지 돈다.

이게 skill과 갈리는 지점이다. skill은 Claude가 따라가는 지시문이고 다음 스텝을 모델이 정한다. workflow는 스크립트가 루프를 들고 있고 runtime이 control flow를 집행하며 Claude는 각 agent 안에서 생각만 한다. deterministic하게 흘러야 하는 fan-out/loop/조건 분기에는 workflow가, 턴마다 모델 판단이 필요한 일에는 skill이 맞다.

---

## 왜 둘이 짝인가

이제 두 레버가 왜 한 쌍인지가 분명해진다. `effort`가 깊이를 돌리고, 그 깊이를 ultracode까지 올리면 `workflow` 오케스트레이션이 자동으로 켜진다. ultracode 세션은 그 순간 단순한 어시스턴트가 아니라 오케스트레이터가 된다. 들어온 일을 분해하고, fan-out하고, adversarial하게 교차검증한 뒤, 종합된 답만 들고 돌아온다.

정리하면 선택지는 이렇게 줄세워진다.

| 도구 | 규모 | 흐름 제어 | 적합한 일 |
|------|------|-----------|-----------|
| subagent | 턴당 소수 | 모델 주도 | 맥락 실어 한두 갈래 위임 |
| agent team | 소수 장기 peer | 공유 task list | 오래 가는 협업 |
| workflow | 수십~수백 | 코드 주도(JS) | 대규모 fan-out + 반복 품질 패턴 |

xhigh와 ultracode를 가르는 기준도 같은 맥락이다. 한 context window 안에서 끝나는 깊은 단독 추론이면 xhigh로 충분하고, breadth·교차검증·window를 넘는 규모가 필요하면 ultracode다.

---

## 이 글 묶음이 실제로 만들어진 방식

여기서부터가 가장 솔직한 후기다. 지금 읽고 있는 이 글을 포함해 7개쯤 되는 저장소 리뷰 글 묶음은 `effort=ultracode` + 직접 짠 workflow로 생산했다. 구조는 위의 `pipeline` 예시 그대로다. 글마다 `research → draft → fact-check + review → revise` 단계를 태우되, 글들끼리는 서로를 기다리지 않게 병렬로 흘렸다. 한 글이 fact-check에 묶여 있어도 다른 글의 draft는 계속 굴러갔다.

가장 의미 있었던 건 fact-check subagent다. 한 저장소를 다루던 draft가 web fetch로 긁어온 GitHub 별 개수를 그대로 본문에 박았는데, fact-check subagent가 그 수치를 "출처가 스크래핑이고 수치가 비현실적"이라고 잡아냈다. 그래서 강제로 GitHub API ground truth로 다시 검증하게 했고, 실제 수치는 긁어온 숫자와 달랐다. 이게 adversarial verify 패턴이 추상적인 마케팅 문구가 아니라는 증거다. 독립된 회의론자 한 명을 파이프라인에 끼워 넣었더니, 작성자(나)와 draft agent가 같이 흘려보낼 뻔한 오류를 실제로 막았다.

이 경험이 ultracode를 보는 내 관점을 바꿨다. "더 좋은 답을 한 번에 받는다"가 아니라 "틀릴 만한 지점에 검증 agent를 배치해두면 내가 안 봐도 걸린다"가 진짜 효용이다. 사람이 7개 글의 모든 별 개수를 일일이 API로 재확인했을까. 솔직히 아니다.

---

## 내가 의심하는 지점 / 한계

영리한 만큼 비용도 정직하게 청구된다. 다음은 실제로 굴려보며 걸린 지점들이다.

**1. token 비용이 선형으로 늘지 않는다.** ultracode와 workflow는 단독 작업보다 훨씬 많은 token을 태운다. agent 수십 개가 각자 context를 들고 돌면 그만큼 곱해진다. 도구 설명도 workflow가 "많은 token을 소비한다"고 못 박는다. 품질을 사는 대신 비용을 내는 거래이고, 그 환율이 늘 유리하지는 않다. 작은 슬라이스에서 먼저 테스트해 비용 감을 잡는 게 맞다.

**2. 모든 일이 ultracode를 받을 자격은 없다.** 오타 수정, 단순 리네임, 한 함수 시그니처 확인에 16-agent fan-out을 돌리는 건 낭비다. 이건 ECC 규칙이나 Ultra Harness로도 못 막는 종류의 과잉이다. 레버는 일의 무게에 맞춰 돌려야 한다. 기본은 medium/high로 두고, 무거운 일에만 ultracode를 꺼내는 운용이 현실적이다.

**3. 오케스트레이션의 wall-clock 오버헤드.** 동시 실행이 `min(16, cores-2)`로 캡이 걸린다. core 많은 머신에서 긴 fan-out을 돌리면 16개씩 직렬로 배치 처리되며 늘어진다. 이 캡을 풀 노브는 공개돼 있지 않다. 그리고 "deterministic"이라는 단어를 오해하면 안 된다. 결정적인 건 **control flow(JS가 흐름을 잡는다)**이지, 각 agent 안의 모델 추론은 여전히 비결정적이다. 같은 스크립트를 두 번 돌리면 흐름은 같아도 내용은 다를 수 있다.

**4. resumability의 경계.** 재개는 **같은 세션 안에서만** 된다. Claude Code를 종료하면 다음 세션은 처음부터다. workflow 상태는 세션 재시작 너머로 영속되지 않는다. 긴 잡을 며칠에 걸쳐 돌릴 생각이라면 이게 발목을 잡는다.

**5. 문서가 따라오지 못한 구석.** `agent()`의 전체 파라미터 셋(`label`, `phase`, `isolation` 등), `phase()` / `log()`, `schema`의 정확한 문법은 공개 문서에 끝까지 명시돼 있지 않다. SDK와 CLI 사이에 차이가 있을 수 있다. 안정적인 패턴이라고 단정하기 전에 자기 환경의 실제 예제로 확인하는 게 안전하다.

**6. 가용성 자체가 변수다.** 노출 방식과 사용 가능 여부는 빌드·플랜에 따라 다르다 — 내 세션에서는 `/effort`로 켰지만 환경마다 다를 수 있다. 이 글의 코드 스니펫을 그대로 복붙해서 안 돈다면 십중팔구 버전 문제다. primitive 시그니처가 빌드마다 달라질 수 있으니 자기 빌드에서 한 번 확인하고 가는 게 안전하다.

---

## 언제 써볼 만한가 / 결론

내 운용 기준은 이렇게 정리됐다. 일상 작업은 medium/high로 둔다. 한 머리가 오래 고민해서 풀리는 설계·디버깅은 xhigh. breadth가 필요하거나(여러 파일·여러 후보·여러 각도), 내가 직접 검증하기 귀찮은 사실이 많이 섞인 일에만 ultracode를 꺼낸다. 특히 "틀려도 내가 못 알아챌" 종류의 fan-out 작업 — 이번 글 묶음의 별 개수 검증 같은 — 이 ultracode의 단물이 가장 진한 영역이다.

반대로 비용에 민감하거나, 일이 가볍거나, 결과를 어차피 한 줄씩 손으로 확인할 거라면 레버를 굳이 끝까지 올릴 이유가 없다. effort와 workflow는 "항상 켜두는 부스터"가 아니라 "무게에 맞춰 돌리는 다이얼"이다. 그 거리감만 지키면, 한 어시스턴트가 모든 일을 같은 깊이로 처리하던 답답함은 꽤 깔끔하게 풀린다.

*effort는 실행 깊이를 돌리는 다이얼이고 workflow는 그 깊이를 코드로 집행하는 오케스트레이터다 — ultracode는 그 둘을 잇는 스위치일 뿐, 항상 켜는 부스터가 아니라 일의 무게에 맞춰 꺼내는 레버다.*
