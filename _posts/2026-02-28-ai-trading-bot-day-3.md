---
title: "AI 트레이딩 봇 개발기 - 3일차"
description: "백테스트 프레임워크를 하루 만에 구축하고, Claude Code 자동 검증 훅으로 전략 변경의 안전장치를 마련한 과정. 실제 돈이 걸린 시스템에서 감으로 전략을 바꾸면 안 되는 이유."
date: 2026-02-28
categories: [Project]
tags: [AI, Trading]
---

## 전략을 바꾸기 전에 검증하라

[2일차](/blog/2026/02/27/ai-trading-bot-day-2/)에서 실거래 시스템이 돌아가기 시작했다. 매수/매도 로직이 동작하고, Discord 알림이 오고, 대시보드에서 수익률을 확인할 수 있게 됐다.

문제는 그 다음이다. "이동평균 기간을 20에서 50으로 바꾸면 어떨까?", "손절 라인을 5%에서 3%로 줄이면?" 같은 생각이 떠오를 때, 실제 돈이 걸린 시스템에서 감으로 변경할 수 있는가? 할 수 없다. 과거 데이터로 검증하지 않은 전략 변경은 도박이다.

3일차의 목표는 명확했다. **전략을 변경하기 전에 자동으로 검증하는 체계를 구축하는 것.**

---

## 백테스트 프레임워크 아키텍처

백테스트 시스템은 4단계 파이프라인으로 설계했다.

```text
DataLoader → MockAI → Simulator → Metrics
```

각 모듈의 책임은 다음과 같다.

| 모듈 | 파일 | 책임 |
|------|------|------|
| **DataLoader** | `data_loader.py` | yfinance(국내/해외 주식) + ccxt(Binance 크립토) 데이터 수집 |
| **MockAI** | `mock_ai.py` | 기술적 시그널 기반 매매 판단 (Claude API 대체) |
| **Simulator** | `simulator.py` | 주식 bar-by-bar + 크립토 Donchian+SL 시뮬레이션 |
| **Metrics** | `metrics.py` | Sharpe Ratio, MDD, CAGR 등 성과 지표 계산 |

전체 구조는 `src/backtest/` 패키지로 정리했다. `__init__.py`와 `__main__.py`를 함께 만들어서 `python -m src.backtest`로 바로 실행할 수 있게 했다.

---

## DataLoader — 시장별 데이터 수집

국내 주식, 해외 주식, 크립토를 하나의 인터페이스로 수집하는 것이 목표였다. yfinance는 주식 쪽을 담당하고, ccxt는 Binance 크립토 데이터를 가져온다.

```python
# data_loader.py
class DataLoader:
    def load(self, symbol: str, market: str, days: int) -> pd.DataFrame:
        if market == "crypto":
            return self._load_crypto(symbol, days)
        else:
            return self._load_stock(symbol, days)

    def _load_crypto(self, symbol: str, days: int) -> pd.DataFrame:
        exchange = ccxt.binance()
        ohlcv = exchange.fetch_ohlcv(symbol, "1d", limit=days)
        df = pd.DataFrame(ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"])
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
        return df.set_index("timestamp")
```

`requirements.txt`에 `ccxt>=4.0.0`을 추가했다. yfinance는 이미 있었고, ccxt만 새로 필요했다.

---

## MockAI — 왜 실제 Claude API를 쓰지 않는가

백테스트에서 가장 중요한 결정이 MockAI였다. 실거래 시스템은 Claude API를 호출해서 매매 판단을 받는다. 그런데 백테스트에서 365일치 데이터를 매일 Claude API로 보내면 두 가지 문제가 생긴다.

1. **비용**: 365번의 API 호출. 시장 3개면 1,095번. 파라미터 조합까지 테스트하면 수천 번.
2. **재현성**: LLM의 응답은 동일 입력에도 달라질 수 있다. 같은 전략을 두 번 돌렸는데 결과가 다르면 비교가 불가능하다.

MockAI는 기술적 시그널(이동평균, RSI, 볼륨 등)만으로 매매 판단을 내린다. Claude의 판단을 완벽히 대체하진 못하지만, **전략 파라미터 변경의 영향을 빠르고 저렴하게 검증**하는 용도로는 충분하다.

```python
# mock_ai.py
class MockAI:
    def decide(self, row: pd.Series, context: dict) -> str:
        sma_short = context["sma_short"]
        sma_long = context["sma_long"]
        rsi = context["rsi"]

        if sma_short > sma_long and rsi < 70:
            return "BUY"
        elif sma_short < sma_long and rsi > 30:
            return "SELL"
        return "HOLD"
```

실제 구현은 더 많은 시그널을 조합하지만, 핵심 아이디어는 같다. 결정론적(deterministic)이고 비용이 0이다.

---

## Simulator — 두 가지 시뮬레이션 모드

주식과 크립토는 시뮬레이션 방식이 다르다.

**주식 (bar-by-bar)**: 일봉 단위로 순회하면서 MockAI의 판단에 따라 매수/매도를 실행한다. 단순하지만 일봉 기반 전략 검증에는 충분하다.

**크립토 (Donchian + Stop Loss)**: Donchian Channel 돌파를 기본 전략으로 사용하고, 손절(Stop Loss) 로직을 추가했다. 크립토는 24시간 거래되고 변동성이 크기 때문에 손절이 필수다.

```python
# simulator.py
class CryptoSimulator:
    def run(self, df: pd.DataFrame, config: dict) -> pd.DataFrame:
        donchian_period = config.get("donchian_period", 20)
        stop_loss_pct = config.get("stop_loss_pct", 0.05)

        df["upper"] = df["high"].rolling(donchian_period).max()
        df["lower"] = df["low"].rolling(donchian_period).min()

        for i in range(donchian_period, len(df)):
            if not self.in_position:
                if df.iloc[i]["close"] > df.iloc[i - 1]["upper"]:
                    self._enter(df.iloc[i]["close"])
            else:
                if df.iloc[i]["close"] < df.iloc[i - 1]["lower"]:
                    self._exit(df.iloc[i]["close"], "donchian_break")
                elif df.iloc[i]["close"] < self.entry_price * (1 - stop_loss_pct):
                    self._exit(df.iloc[i]["close"], "stop_loss")

        return self.trades
```

---

## Metrics — 성과 지표 독립 추출

성과 지표 계산 로직은 원래 `donchian.py` 안에 섞여 있었다. 이걸 `metrics.py`로 분리해서 어떤 시뮬레이터의 결과든 동일한 지표를 계산할 수 있게 했다.

```python
# metrics.py
def calculate_metrics(trades: pd.DataFrame, initial_capital: float) -> dict:
    returns = trades["pnl"] / initial_capital
    sharpe = returns.mean() / returns.std() * np.sqrt(252) if returns.std() > 0 else 0
    cumulative = (1 + returns).cumprod()
    mdd = (cumulative / cumulative.cummax() - 1).min()
    total_return = cumulative.iloc[-1] - 1
    days = (trades.index[-1] - trades.index[0]).days
    cagr = (1 + total_return) ** (365 / days) - 1 if days > 0 else 0

    return {
        "sharpe_ratio": round(sharpe, 3),
        "max_drawdown": round(mdd * 100, 2),
        "cagr": round(cagr * 100, 2),
        "total_return": round(total_return * 100, 2),
        "trade_count": len(trades),
    }
```

Sharpe Ratio, MDD(Maximum Drawdown), CAGR(Compound Annual Growth Rate)은 전략 비교의 기본 지표다. 이 세 가지만 봐도 "이 전략이 과거에 얼마나 벌었고, 얼마나 위험했는지"를 판단할 수 있다.

---

## CLI로 백테스트 실행

Click CLI를 만들어서 터미널 한 줄로 백테스트를 돌릴 수 있게 했다.

```bash
# 전 시장 1년치 백테스트
python -m src.backtest.run --market all --days 365

# 크립토만 180일
python -m src.backtest.run --market crypto --days 180
```

`run.py`가 Click으로 인자를 받아서 DataLoader → MockAI → Simulator → Metrics 파이프라인을 순차 실행하고, 결과를 테이블로 출력한다. 전략 파라미터를 바꿔가며 반복 실행하기 편하다.

---

## Claude Code 자동 검증 훅

백테스트 프레임워크를 만든 것만으로는 부족하다. **전략 파일을 수정했을 때 자동으로 검증이 돌아가야 한다.** 사람이 "백테스트 돌려야지"를 기억하는 것에 의존하면 안 된다.

Claude Code의 PostToolUse 훅을 활용했다.

```bash
# scripts/hooks/post_edit_hook.sh
#!/bin/bash
# .py 파일 수정 시: pytest 자동 실행 (blocking)
# 전략 파일 수정 시: 백테스트 실행 안내 (advisory)

CHANGED_FILE="$1"

if [[ "$CHANGED_FILE" == *.py ]]; then
    echo "Running pytest..."
    python -m pytest tests/ -x -q
    exit $?
fi
```

`.claude/settings.local.json`에 hooks 섹션을 추가해서, `.py` 파일이 수정되면 pytest가 blocking으로 실행되고 테스트가 실패하면 수정이 거부된다. 전략 관련 파일이 수정되면 백테스트 실행을 advisory로 안내한다.

두 가지를 구분한 이유가 있다.

- **pytest (blocking)**: 코드가 깨지면 안 된다. 문법 에러나 로직 버그는 즉시 잡아야 한다.
- **백테스트 (advisory)**: 백테스트는 수 분이 걸릴 수 있고, 전략 탐색 중에 매번 강제 실행하면 흐름이 끊긴다. 대신 "백테스트 돌려라"는 안내를 준다.

---

## 웹훅 URL 검증 스크립트

Discord와 Slack 웹훅은 트레이딩 봇의 알림 채널이다. 웹훅 URL이 유효하지 않으면 매매 알림이 안 온다. 이걸 배포 전에 검증하는 스크립트를 만들었다.

```python
# scripts/validate_webhook.py
def validate_discord(url: str) -> bool:
    """Discord 웹훅 URL 유효성 검증 + 테스트 메시지 전송"""
    if not re.match(r"https://discord\.com/api/webhooks/\d+/.+", url):
        return False
    resp = requests.post(url, json={"content": "[TEST] Webhook validation"})
    return resp.status_code == 204

def validate_slack(url: str) -> bool:
    """Slack 웹훅 URL 유효성 검증 + 테스트 메시지 전송"""
    if not re.match(r"https://hooks\.slack\.com/services/.+", url):
        return False
    resp = requests.post(url, json={"text": "[TEST] Webhook validation"})
    return resp.status_code == 200
```

URL 형식 검증(regex)과 실제 전송 테스트를 함께 수행한다. 형식은 맞지만 토큰이 만료된 경우까지 잡을 수 있다.

---

## 테스트 33개

백테스트 프레임워크 24개, 웹훅 검증 9개, 총 33개의 테스트를 작성했다.

| 테스트 파일 | 테스트 수 | 커버리지 |
|------------|----------|---------|
| `tests/test_backtest.py` | 24개 | DataLoader, MockAI, Simulator, Metrics 전체 |
| `tests/test_validate_webhook.py` | 9개 | URL 검증, 전송 테스트, 에러 핸들링 |

테스트 24개 중 주요한 것 몇 가지를 보면:

- DataLoader가 빈 데이터를 반환할 때 Simulator가 graceful하게 처리하는지
- MockAI의 결정이 동일 입력에 대해 항상 같은 결과를 내는지 (재현성)
- Metrics가 거래 0건일 때 division by zero 없이 처리하는지
- Stop Loss가 정확한 가격에서 발동하는지

이 테스트들이 PostToolUse 훅과 결합되면서, `.py` 파일을 수정할 때마다 자동으로 33개 테스트가 돌아간다.

---

## 숫자로 보는 하루

| 지표 | 수치 |
|------|------|
| 신규 파일 | 10개 (backtest 7 + scripts 2 + tests 2) |
| 수정 파일 | 2개 (settings, requirements) |
| 테스트 | 33개 (backtest 24 + webhook 9) |
| 백테스트 파이프라인 | DataLoader → MockAI → Simulator → Metrics |
| 자동 검증 | PostToolUse 훅 (pytest blocking + 백테스트 advisory) |

---

## 교훈: 자동화된 안전장치의 가치

실제 돈이 걸린 시스템에서 가장 위험한 순간은 "잘 돌아가고 있을 때"다. 잘 돌아가니까 전략을 조금 바꿔보고 싶어진다. 이동평균 기간을 조정하고, 손절 라인을 줄이고, 새 시그널을 추가하고. 각각은 합리적인 변경이지만, 검증 없이 적용하면 누적 리스크가 커진다.

백테스트 프레임워크는 "이 변경이 과거에 어떤 결과를 냈을지" 사전에 확인하는 도구다. Claude Code 자동 검증 훅은 "검증을 잊지 않게" 강제하는 장치다. 웹훅 검증 스크립트는 "알림이 안 오는 상태로 운영하는 사고"를 방지하는 장치다. 세 가지 모두 **실수를 사전에 차단하는 자동화**라는 공통점이 있다.

하루 만에 백테스트 프레임워크, 테스트 33개, 자동 검증 체계를 구축한 건 AI의 코드 생성 속도 덕분이다. 하지만 "무엇을 만들어야 하는지"를 결정한 건 사람이다. "전략을 바꾸기 전에 검증하라"는 원칙을 세우고, 그 원칙을 시스템으로 구현한 것이다. AI는 구현 속도를 높여주지만, 안전에 대한 판단은 사람의 몫이다.

---

*실제 돈이 걸린 트레이딩 봇에서 "감으로 전략 변경"을 막기 위해, 백테스트 프레임워크와 자동 검증 훅을 하루 만에 구축했다 -- 검증 없는 변경은 도박이다.*
