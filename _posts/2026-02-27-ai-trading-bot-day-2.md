---
title: "AI 트레이딩 봇 개발기 - 2일차"
description: "주식 단타 모니터에 트레일링 스탑을 구현하고, AI로 전체 시스템 코드 리뷰를 돌렸다. 진짜 버그 3건, 오탐 21건. AI 코드 리뷰의 현실."
date: 2026-02-27
categories: [Project]
tags: [AI, Trading]
---

## 고정 손절/익절의 한계

[1일차](/blog/2026/02/26/ai-trading-bot-day-1/)에서 AI 트레이딩 시스템의 API 폴백과 선물 포지션 설정을 최적화했다. 시스템 기본 구조는 이미 갖춰진 상태였고, 주식 단타 모니터도 매수 신호가 발생하면 진입하고 고정된 손절(SL)과 익절(TP) 라인에 도달하면 매도하는 방식으로 돌아가고 있었다.

문제는 수익이 나고 있는 포지션에서 발생한다. 주가가 +5% 올랐다가 +2%로 되돌아오면 어떻게 해야 하는가? 고정 TP가 +6%라면 익절에 도달하지 못한 채 수익이 줄어드는 것을 지켜봐야 한다. 고정 SL이 -3%라면 +5% 수익이 -3% 손실로 바뀔 때까지 아무것도 하지 않는다.

고정 SL/TP 시스템은 "어디서 나갈 것인가"를 진입 시점에 결정한다. 하지만 시장은 진입 이후에도 계속 움직인다. 진입 후 상황 변화에 대응하려면 동적인 매도 전략이 필요하다. 그 대표적인 방법이 트레일링 스탑이다.

---

## 트레일링 스탑 개념

트레일링 스탑은 두 단계로 작동한다.

1. **활성화(Activation)**: 수익이 일정 비율(activation threshold)을 넘으면 트레일링 스탑이 가동된다.
2. **추적(Trailing)**: 최고가를 갱신할 때마다 매도선이 따라 올라간다. 현재가가 최고가 대비 일정 비율(trail percentage) 하락하면 매도한다.

예시를 들어보면 이렇다.

| 시점 | 주가 | 수익률 | 최고가 | 트레일링 SL | 상태 |
|------|------|--------|--------|-------------|------|
| 진입 | 10,000 | 0% | - | - | 대기 |
| T+1 | 10,300 | +3% | 10,300 | 10,146 (-1.5%) | 활성화 |
| T+2 | 10,500 | +5% | 10,500 | 10,343 | SL 상향 |
| T+3 | 10,400 | +4% | 10,500 | 10,343 | 유지 |
| T+4 | 10,300 | +3% | 10,500 | 10,343 | **매도** |

핵심은 **매도선이 올라가기만 하고 내려가지 않는다**는 것이다. 수익을 일정 부분 확보한 상태에서 하락 전환 시 빠르게 탈출한다.

---

## 구현

### Config 설정

`ShortTermTradingConfig`에 세 개 필드를 추가했다.

```python
# src/config.py
@dataclass
class ShortTermTradingConfig:
    # 기존 필드 ...
    trailing_stop_enabled: bool = True
    trailing_stop_activation_pct: float = 3.0   # 수익률 3% 이상이면 활성화
    trailing_stop_trail_pct: float = 1.5         # 최고가 대비 1.5% 하락 시 매도
```

YAML에서 오버라이드할 수 있도록 `trading_config.yaml`에도 해당 섹션을 추가했다.

```yaml
# config/trading_config.yaml
short_term:
  trailing_stop_enabled: true
  trailing_stop_activation_pct: 3.0
  trailing_stop_trail_pct: 1.5
```

### Position 상태 관리

`ShortTermPosition` 클래스에 트레일링 상태를 추적하는 필드를 추가했다.

```python
# src/services/stock_short_term_monitor.py
@dataclass
class ShortTermPosition:
    symbol: str
    entry_price: float
    quantity: int
    entry_time: datetime

    # 트레일링 스탑 상태
    trailing_activated: bool = False
    highest_price: float = 0.0
    trailing_stop_price: float = 0.0
```

`highest_price`는 진입 이후 관측된 최고가, `trailing_stop_price`는 현재 트레일링 매도선이다.

### 핵심 로직 — _check_sl_tp()

기존 `_check_sl_tp()` 메서드에 트레일링 스탑 분기를 추가했다. 로직의 흐름은 다음과 같다.

```python
def _check_sl_tp(self, position: ShortTermPosition, current_price: float) -> str | None:
    pnl_pct = (current_price - position.entry_price) / position.entry_price * 100

    # 1. 고정 손절 — 트레일링과 무관하게 항상 체크
    if pnl_pct <= -self.config.stop_loss_pct:
        return "SELL_SL"

    # 2. 고정 익절
    if pnl_pct >= self.config.take_profit_pct:
        return "SELL_TP"

    # 3. 트레일링 스탑
    if self.config.trailing_stop_enabled:
        # 최고가 갱신
        if current_price > position.highest_price:
            position.highest_price = current_price

        # 활성화 조건 체크
        if not position.trailing_activated:
            if pnl_pct >= self.config.trailing_stop_activation_pct:
                position.trailing_activated = True
                position.trailing_stop_price = (
                    position.highest_price
                    * (1 - self.config.trailing_stop_trail_pct / 100)
                )

        # 활성화 상태에서 매도선 갱신 및 체크
        if position.trailing_activated:
            new_stop = position.highest_price * (1 - self.config.trailing_stop_trail_pct / 100)
            if new_stop > position.trailing_stop_price:
                position.trailing_stop_price = new_stop

            if current_price <= position.trailing_stop_price:
                return "SELL_TS"

    return None
```

매도 태그 `SELL_TS`를 추가하여 로그와 대시보드에서 트레일링 스탑으로 인한 매도를 구분할 수 있게 했다. 기존 `SELL_SL`, `SELL_TP`와 같은 패턴이다.

주의할 점: 고정 손절은 트레일링 활성화 여부와 관계없이 항상 먼저 체크한다. 트레일링 스탑은 수익 구간에서만 의미가 있고, 손실 구간에서는 고정 SL이 방어해야 한다.

---

## 시스템 전체 코드 리뷰 — AI에게 맡기기

트레일링 스탑 구현을 마친 후, AI에게 전체 시스템 코드 리뷰를 요청했다. 암호화폐 선물 모니터, 주식 단타 모니터, 대시보드, API 래퍼 등 전 모듈을 대상으로 했다.

결과부터 말하면 다음과 같다.

| 분류 | 건수 |
|------|------|
| 진짜 버그 | 3건 |
| 오탐 (False Positive) | 21건 |
| **오탐률** | **87.5%** |

24건의 지적 사항 중 실제로 수정이 필요한 것은 3건뿐이었다. 나머지 21건은 검토 결과 문제가 아니었다.

---

## 진짜 버그 3건

### 1. pandas deprecated API

```python
# 수정 전 — pandas 3.0에서 경고
df = df.reindex(new_index, method="ffill")

# 수정 후
df = df.reindex(new_index).ffill()
```

`crypto_futures_monitor.py`에서 사용하던 `reindex(method="ffill")`은 pandas 2.x에서 deprecated 경고가 나오고, pandas 3.0에서는 제거될 예정이다. 현재 당장 에러는 아니지만, pandas 업데이트 시 런타임 에러로 전환되므로 선제 수정했다.

### 2. MACD 캐시 타임스탬프 — 심볼 간 오염

MACD 지표를 계산한 결과를 캐싱하는 로직에서, 캐시 갱신 시각을 전역 `float` 변수 하나로 관리하고 있었다.

```python
# 수정 전 — 모든 심볼이 동일한 타임스탬프를 공유
self._macd_cache_ts: float = 0.0

# 수정 후 — 심볼별 독립 타임스탬프
self._macd_cache_ts: dict[str, float] = {}
```

문제 시나리오: BTC의 MACD를 계산하면 `_macd_cache_ts`가 갱신된다. 직후 ETH의 MACD를 조회하면, BTC의 캐시 시각이 "최근"이므로 ETH도 캐시가 유효하다고 판단하여 오래된 ETH MACD 값을 반환한다. 심볼이 많아질수록 캐시 데이터가 다른 심볼의 것과 뒤섞일 확률이 높아진다.

심볼별 `dict`로 변경하여 각 심볼의 캐시 유효성을 독립적으로 판단하게 했다.

### 3. 재시작 시 SL/TP 복구 누락

시스템이 재시작되면 Redis에 저장된 `PositionState`를 복구한다. 그런데 복구 시 SL/TP 값을 ATR 기반으로 재계산하지 않고 고정 기본값(`sl=-2%`, `tp=+4%`)을 사용하고 있었다.

```python
# 수정 전 — 고정 기본값 사용
restored_position.stop_loss = entry_price * 0.98
restored_position.take_profit = entry_price * 1.04

# 수정 후 — ATR 기반 재계산
atr = await self._calculate_atr(symbol, period=14)
restored_position.stop_loss = entry_price - (atr * self.config.sl_atr_multiplier)
restored_position.take_profit = entry_price + (atr * self.config.tp_atr_multiplier)
```

ATR 기반 SL/TP는 시장 변동성에 따라 동적으로 결정되므로, 변동성이 큰 코인에서는 SL 폭이 넓고 작은 코인에서는 좁다. 고정 기본값으로 복구하면 이 동적 조정이 사라져 불필요한 손절이나 조기 익절이 발생할 수 있다. 실제로 시스템 재시작 후 몇 건의 불필요한 매도가 있었는데, 이 버그가 원인이었을 가능성이 높다.

---

## 오탐 21건 분석

오탐은 크게 두 부류였다.

### 레이스 컨디션 경고 — 8건

AI가 주식 단타 모니터의 여러 비동기 메서드에서 "공유 상태에 대한 race condition" 위험을 8건 지적했다. 포지션 딕셔너리를 여러 코루틴이 동시에 읽고 쓸 수 있다는 논리였다.

결론: **오탐이다.** Python의 `asyncio`는 싱글 스레드 이벤트 루프다. 코루틴이 `await`를 만나기 전까지는 다른 코루틴으로 전환되지 않는다. 포지션 딕셔너리의 읽기-수정-쓰기가 하나의 동기 블록 안에서 이루어지므로, 중간에 다른 코루틴이 끼어들 수 없다. `threading`이나 `multiprocessing`을 사용했다면 실제 문제가 되었겠지만, `asyncio` 환경에서는 해당 없다.

AI가 "비동기 = 동시성 = race condition 가능"이라는 패턴 매칭을 한 것으로 보인다. `asyncio`의 cooperative multitasking 특성을 이해하지 못한 오탐이다.

### Config 불일치 경고 — 13건

YAML 설정 파일의 값과 Python `dataclass` 기본값이 다른 경우를 13건 지적했다. 예를 들어 Python에서 `stop_loss_pct: float = 2.0`인데 YAML에서는 `stop_loss_pct: 2.5`로 되어 있으면 "불일치"로 분류했다.

결론: **오탐이다.** 이것이 Config 시스템의 설계 의도다. Python `dataclass`의 기본값은 YAML 파일이 없을 때의 fallback이다. YAML이 존재하면 해당 값으로 오버라이드한다. 불일치가 아니라 정상적인 오버라이드 동작이다.

### 오탐률이 높은 이유

AI 코드 리뷰의 오탐률이 87.5%인 것은 높아 보이지만, AI 코드 리뷰의 특성을 생각하면 자연스럽다.

1. **보수적 탐지 전략**: AI는 "지적하지 않아서 놓치는 것"보다 "지적했는데 아닌 것"을 선호하도록 학습되어 있다. 보안 도구의 SAST와 같은 맥락이다.
2. **도메인 컨텍스트 부족**: `asyncio`의 실행 모델, Config 오버라이드 패턴 같은 프로젝트 고유 맥락을 코드만 보고 추론해야 한다. 코드 바깥의 설계 의도는 알 수 없다.
3. **패턴 매칭 한계**: "비동기 + 공유 상태 = race condition", "선언된 값 != 사용되는 값 = 불일치"라는 일반 패턴을 적용한 결과다.

---

## 교훈: 오탐을 걸러내는 것도 기술이다

AI 코드 리뷰에서 중요한 것은 "리뷰를 돌리는 것"이 아니라 **결과를 해석하는 것**이다. 24건의 지적 사항을 받아들고 전부 수정하면 불필요한 코드 변경 21건이 발생한다. 불필요한 변경은 regression 위험을 높이고, 코드 이력을 오염시키며, 시간을 낭비한다.

오탐을 걸러내려면 두 가지가 필요하다.

1. **런타임 모델 이해**: `asyncio`가 싱글 스레드인지, 멀티 스레드인지를 모르면 race condition 오탐을 걸러낼 수 없다.
2. **설계 의도 파악**: Config 오버라이드가 의도된 동작인지, 실수인지를 판단하려면 시스템 설계를 이해해야 한다.

결국 AI 코드 리뷰의 가치는 "AI가 찾아주는 것"이 아니라 "AI가 찾아준 것 중 진짜를 골라내는 사람의 판단"에 달려 있다. 3건의 진짜 버그를 찾아낸 것은 AI의 성과이고, 21건의 오탐을 걸러낸 것은 사람의 성과다.

---

## 정리

| 작업 | 결과 |
|------|------|
| 트레일링 스탑 구현 | activation 3%, trail 1.5%, 매도 태그 `SELL_TS` |
| 코드 리뷰 총 지적 | 24건 |
| 실제 버그 수정 | 3건 (pandas, MACD 캐시, SL/TP 복구) |
| 오탐 판정 | 21건 (race condition 8, Config 불일치 13) |
| 오탐률 | 87.5% |

---

*트레일링 스탑으로 수익 구간의 매도 전략을 개선하고, AI 코드 리뷰 24건 중 진짜 버그 3건을 골라냈다 -- 오탐률 87.5%를 걸러내는 것이 AI 코드 리뷰의 실제 기술이다.*
