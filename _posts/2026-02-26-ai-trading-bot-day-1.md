---
title: "AI 트레이딩 봇 개발기 - 1일차"
description: "Claude API 529 과부하 에러 대응으로 OpenAI 자동 폴백을 구현하고, 선물 포지션 설정을 최적화한 기록"
date: 2026-02-26
categories: [Project]
tags: [AI, Trading]
---

## AI 트레이딩 시스템이란

AI Trading v3는 Claude API와 OpenAI API를 활용해 Binance(코인)와 KIS(국내주식)를 자동매매하는 시스템이다. 핵심 구조는 단순하다. 시장 데이터를 수집하고, AI에게 분석을 맡기고, AI의 판단에 따라 매매를 실행한다.

```text
[시장 데이터 수집] → [AI 분석 (Claude/OpenAI)] → [매매 판단] → [주문 실행 (Binance/KIS)]
```

AI가 시스템의 두뇌 역할을 맡기 때문에, AI API가 응답하지 않으면 매매 판단 자체가 멈춘다. 오늘 겪은 문제가 정확히 이것이었다.

---

## Anthropic API 529 Overloaded — AI가 멈추면 모든 게 멈춘다

트레이딩 봇을 운영하던 중 로그에 익숙하지 않은 에러가 찍히기 시작했다.

```text
anthropic.APIStatusError: 529 Overloaded
```

HTTP 529는 Anthropic 서버가 과부하 상태일 때 반환하는 코드다. Claude API 요청이 거부되면서 선물 모니터의 AI 분석이 전부 실패했다. 문제는 이 에러가 일시적이지 않았다는 점이다. 수 분에서 수십 분까지 지속되는 경우가 있었고, 그 동안 트레이딩 봇은 아무런 판단도 내리지 못한 채 멈춰 있었다.

AI 기반 시스템의 근본적인 취약점이다. AI API에 전적으로 의존하는 구조에서 API 장애는 곧 시스템 전체 장애로 이어진다.

---

## 해결 1: 재시도 강화 + OpenAI 자동 폴백

대응 전략은 두 가지다.

1. **Anthropic 클라이언트의 재시도 횟수를 늘린다** — 일시적 과부하라면 재시도로 해결된다.
2. **재시도가 전부 실패하면 OpenAI로 자동 폴백한다** — 장기 과부하에 대한 보험이다.

### 재시도 강화

Anthropic Python SDK의 `max_retries` 파라미터를 기본값에서 5로 올렸다.

```python
# src/api/ai_client.py
from anthropic import Anthropic

self.anthropic_client = Anthropic(
    api_key=api_key,
    max_retries=5  # 기본값 → 5회로 강화
)
```

SDK 내부에서 exponential backoff를 적용하므로, 5회 재시도는 짧은 과부하 구간을 넘기기에 충분하다.

### OpenAI 자동 폴백

재시도 5회가 모두 실패하면 OpenAI GPT로 폴백하는 `_fallback_openai()` 메서드를 추가했다.

```python
# src/api/ai_client.py
import openai

def analyze(self, market_data: dict) -> dict:
    """AI 분석 실행. Anthropic 실패 시 OpenAI로 폴백."""
    try:
        return self._analyze_anthropic(market_data)
    except Exception as e:
        if self._is_overloaded_error(e):
            logger.warning(f"Anthropic 529 과부하 감지, OpenAI로 폴백: {e}")
            return self._fallback_openai(market_data)
        raise

def _is_overloaded_error(self, error: Exception) -> bool:
    """529 과부하 에러인지 판별."""
    return "529" in str(error) or "overloaded" in str(error).lower()

def _fallback_openai(self, market_data: dict) -> dict:
    """OpenAI GPT를 사용한 폴백 분석."""
    response = openai.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": self._build_prompt(market_data)}
        ],
        temperature=0.3
    )
    return self._parse_response(response.choices[0].message.content)
```

폴백 로직은 세 가지 경우를 커버한다.

| 상황 | 동작 |
|------|------|
| Anthropic 529 과부하 | `_fallback_openai()` 호출 |
| Anthropic 클라이언트 비활성화 | `_fallback_openai()` 호출 |
| Anthropic 클라이언트 자체가 None | `_fallback_openai()` 호출 |

Claude와 GPT는 같은 프롬프트를 사용하므로, 분석 결과의 형식은 동일하다. 다만 모델별로 판단 성향이 다를 수 있다는 점은 인지하고 있다. 장기적으로는 폴백 발생 시 로그를 남겨 두 모델의 판단 차이를 비교 분석할 계획이다.

---

## 해결 2: 선물 포지션 설정 최적화

529 에러와 별개로, 선물 모니터가 진입 신호를 내보내도 실제 포지션이 열리지 않는 문제가 있었다. AI는 "매수" 판단을 내리는데 주문이 실행되지 않는 상황.

원인은 포지션 설정이 지나치게 보수적이었기 때문이다.

### 기존 설정의 문제

```yaml
# config/trading_config.yaml (변경 전)
binance_futures:
  max_position_pct: 0.3   # 총 자산의 30%까지만 포지션
  max_positions: 5         # 최대 5개 동시 포지션
```

`max_position_pct: 0.3`은 총 자산의 30%까지만 포지션을 열겠다는 의미다. `max_positions: 5`는 최대 5개 종목에 동시 진입할 수 있다는 뜻이다. 이 두 값의 조합이 문제였다.

자산의 30%를 5개 종목에 나누면, 종목당 최대 6%만 투입된다. 이 금액이 Binance 선물의 최소 주문 금액(notional)에 미달하는 경우가 빈번했다. AI가 분석하고 판단까지 내려도, 실제 주문 금액이 최소 기준에 못 미쳐 체결이 안 되는 것이다.

### 조정 후

```yaml
# config/trading_config.yaml (변경 후)
binance_futures:
  max_position_pct: 0.5   # 총 자산의 50%까지 포지션
  max_positions: 3         # 최대 3개 동시 포지션
```

변경의 핵심은 **집중도를 높인 것**이다.

| 설정 | 변경 전 | 변경 후 | 효과 |
|------|---------|---------|------|
| `max_position_pct` | 0.3 (30%) | 0.5 (50%) | 전체 투입 가능 금액 증가 |
| `max_positions` | 5 | 3 | 종목당 투입 금액 증가 |
| 종목당 최대 비중 | 6% | ~16.7% | 최소 notional 충족 |

5개 종목에 얇게 퍼뜨리는 대신, 3개 종목에 적정 금액을 집중하는 방향으로 바꿨다. `src/config.py`의 기본값은 건드리지 않고 YAML 오버라이드로만 처리했다. 설정 파일 변경이므로 코드 수정 없이 롤백이 가능하다.

---

## 선물 모니터의 동작 흐름

이번 이슈를 추적하면서 선물 모니터의 전체 동작 흐름과 AI API 호출 빈도를 정리했다. 시스템을 운영하면서 "AI가 언제, 얼마나 자주 호출되는지"를 정확히 파악하는 것이 중요하기 때문이다.

```text
[선물 모니터 루프]
  ├── 시장 데이터 수집 (Binance API)
  │     └── OHLCV, 호가, 펀딩비 등
  ├── AI 분석 요청 (Claude API → 실패 시 OpenAI 폴백)
  │     └── 시장 상황 분석 + 매매 판단
  ├── 판단 결과에 따라 주문 실행
  │     └── 진입/청산/유지
  └── 대기 → 다음 루프
```

AI API는 모니터링 주기마다 호출된다. 주기가 5분이면 하루 288회, 1분이면 1,440회다. 과부하 에러가 간헐적으로 발생하는 환경에서 폴백 없이 이 빈도의 호출을 유지하는 것은 위험하다. 오늘 추가한 폴백 로직은 이 호출 빈도를 고려하면 필수적인 안전장치다.

---

## 교훈: AI 의존 시스템에서 폴백은 선택이 아닌 필수

오늘 작업에서 얻은 핵심 교훈은 하나다.

**AI API에 의존하는 시스템이라면, AI API가 죽었을 때의 시나리오를 반드시 설계해야 한다.**

트레이딩 봇은 실제 돈이 오가는 시스템이다. API 장애로 판단이 멈추면 기회를 놓치거나, 더 나쁜 경우 이미 열린 포지션의 청산 타이밍을 놓칠 수 있다. 단순히 "에러를 로그에 찍고 넘어간다"로는 부족하다.

폴백 전략의 우선순위는 다음과 같이 정리할 수 있다.

1. **재시도** — 일시적 장애 대응. exponential backoff 필수.
2. **대체 모델 폴백** — Claude 장애 시 GPT로 전환. 같은 프롬프트를 사용하면 전환 비용이 낮다.
3. **보수적 기본 동작** — 모든 AI가 불가능하면 신규 진입을 중단하고, 기존 포지션만 보수적으로 관리.

오늘은 1번과 2번을 구현했다. 3번은 다음 과제로 남겨둔다.

---

## 다음 단계

- AI 폴백 발생 시 Claude vs GPT 판단 결과 비교 로깅 구현
- 3단계 폴백(AI 전체 장애 시 보수적 기본 동작) 구현
- 선물 포지션 설정 변경 후 실제 체결률 모니터링

---

*Claude API 529 과부하에 OpenAI 자동 폴백으로 대응하고, 선물 포지션 설정을 집중형으로 전환한 1일차 기록이다.*
