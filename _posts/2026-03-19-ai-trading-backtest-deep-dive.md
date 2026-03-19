---
title: "AI 트레이딩 백테스트 프레임워크 — 3,300줄 코인 선물 시뮬레이터 기술 분석"
description: "코인 선물 3,300줄 시뮬레이터, 17개 성과 지표, 8중 진입 필터 구조와 6개 개선사항 Walk-Forward 검증. BTC 바로미터로 Sharpe +92%를 달성한 백테스트 프레임워크 분석."
date: 2026-03-19
categories: [Project]
tags: [AI, Trading]
---

## 왜 백테스트 딥다이브인가

[AI 트레이딩 봇 개발기 시리즈](/blog/2026/02/26/ai-trading-bot-day-1/)에서는 매일의 개발 과정을 기록했고, [중간 회고](/blog/2026/03/17/ai-trading-bot-midterm-review/)에서는 20일간의 전체 흐름을 정리했다. 하지만 두 글 모두 백테스트 프레임워크 자체를 깊이 다루지는 않았다.

이 글은 시리즈와 별개의 기술 딥다이브다. 백테스트 프레임워크의 아키텍처, 3,300줄짜리 코인 선물 시뮬레이터의 내부 구조, 17개 성과 지표 시스템, 정확성 보장을 위한 수정 사항, 그리고 6개 개선사항에 대한 체계적 검증 결과를 숫자와 코드 중심으로 정리한다.

핵심 질문은 하나다. **"이 전략을 프로덕션에 적용해야 하는가, 말아야 하는가?"를 데이터로 판단할 수 있는 프레임워크를 어떻게 만들었는가.**

---

## 1. 백테스트 프레임워크 아키텍처

2026년 2월 28일([3일차](/blog/2026/02/28/ai-trading-bot-day-3/))에 구축을 시작했다. 프레임워크는 5개의 핵심 모듈로 구성된다.

```text
src/backtest/
  ├── run.py                  # CLI 엔트리포인트 (Click 기반)
  ├── futures_simulator.py    # 코인 선물 bar-by-bar 시뮬레이터 (3,300줄+)
  ├── simulator.py            # 주식 시뮬레이터
  ├── metrics.py              # 17개 성과 지표 계산
  └── data_loader.py          # yfinance(주식) + ccxt(크립토) 데이터 로더
```

### CLI 설계

`run.py`는 Click 기반 CLI로, 시장 선택부터 전략 플래그까지 한 줄로 제어할 수 있다.

**지원 시장:**

| 시장 | 설명 |
|------|------|
| `domestic` | 국내 주식 (KIS) |
| `overseas` | 해외 주식 |
| `crypto` | 크립토 현물 |
| `futures` | 코인 선물 |
| `all` | 전체 시장 |

**검증 모드 4가지:**

| 모드 | 플래그 | 용도 |
|------|--------|------|
| 표준 백테스트 | (기본) | 단일 기간 성과 측정 |
| Random Sampling | `--sample N --trials M` | N개 코인, M회 반복 |
| Walk-Forward | `--walk-forward` | 과적합 검증 |
| Monte Carlo | `--monte-carlo --mc-simulations 1000` | Bootstrap 강건성 검증 |

**선물 전략 플래그:**

```bash
# 전략 선택
--strategy (bb_macd|rsi|donchian|ema_cross|stoch_rsi|mtf_ema_rsi)

# 고급 필터/기능
--rotation          # 약한 포지션 → 강한 시그널 교체
--ai-proxy          # AI Market Proxy (BTC EMA+RSI)
--trailing          # Trailing Stop
--vat               # ATR 기반 동적 trailing
--bb-squeeze        # 저변동성 구간 진입 차단
--chop              # Choppiness Index 필터
--adaptive          # 전략 자동 전환
--vix-scaling       # VIX 기반 사이징 조절
--spy-filter        # SPY SMA(200) trend gate (주식용)
```

CLI 한 줄로 어떤 조합이든 테스트할 수 있다는 것이 핵심이다. 전략 A에 필터 B를 붙이고 C를 끄는 실험을 코드 수정 없이 반복할 수 있다.

---

## 2. 코인 선물 시뮬레이터 — 3,300줄의 내부 구조

`futures_simulator.py`는 이 프레임워크의 심장이다. bar-by-bar로 과거 데이터를 순회하며 실제 거래를 시뮬레이션한다. 3,300줄이 넘는 코드가 하는 일을 구조별로 분해한다.

### 2-1. 시그널 생성 (멀티타임프레임)

진입 시그널은 두 개의 타임프레임에서 독립적으로 생성되고, 양쪽이 일치해야 진입한다.

```text
Primary Signal (1h):  Bollinger Bands + BB%B
Confirm Signal (4h):  MACD (12/26/9)

진입 조건: Primary 방향 == Confirm 방향
```

1시간봉의 Bollinger Bands가 과매수/과매도를 감지하고, 4시간봉의 MACD가 추세 방향을 확인한다. 이중 확인 구조로 노이즈 시그널을 걸러낸다.

### 2-2. 포지션 관리

**동시 포지션 제한:**

```text
stoch_rsi:  최대 2 슬롯
donchian:   최대 5 슬롯
합계:       최대 7 동시 포지션
```

**ATR(14) 기반 동적 SL/TP:**

| 모드 | SL | TP |
|------|-----|-----|
| 프로덕션 (추세추종) | ATR x 2.0 | ATR x 7.0 |
| Mean-reversion | ATR x 1.5 | ATR x 2.0 |

ATR(Average True Range)을 기준으로 SL/TP를 설정하면, 시장 변동성에 따라 자동으로 폭이 조절된다. 변동성이 큰 장에서는 SL이 넓어지고, 잔잔한 장에서는 좁아진다.

### 2-3. 청산 우선순위

6단계의 청산 로직이 우선순위를 가지고 작동한다. 상위 조건이 먼저 체크되고, 해당 없으면 다음 단계로 넘어간다.

```text
1. SL Hit          → 즉시 전량 청산
2. TP Hit          → 단계적 청산 (50% → 100%)
3. Trailing Stop   → 3% 이익 시 활성화, 2% trail
4. VAT             → ATR 기반 동적 trail% (0.5~4%)
5. Signal Reversal → MACD 4h 방향 전환 (30바 이상 보유 후)
6. Signal Vanish   → 10바 이상 무신호 → 강제 청산
```

TP는 부분 청산을 지원한다. 10% 수익 시 포지션의 50%를 청산하고, 나머지 50%는 더 큰 수익을 노린다. SL은 부분 청산 없이 즉시 전량 청산이다. 돈을 잃는 포지션에는 선택의 여지를 주지 않는다.

VAT(Volatility-Adjusted Trailing)는 ATR에 따라 trail 폭을 0.5%~4% 사이에서 동적으로 조절한다. 고변동성 구간에서는 trail을 넓혀 조기 청산을 방지하고, 저변동성 구간에서는 좁혀 수익을 빠르게 확정한다.

### 2-4. 진입 필터 — 8중 관문

시그널이 발생해도, 8개의 필터를 모두 통과해야 실제 진입이 이루어진다.

| 필터 | 조건 | 차단 대상 |
|------|------|----------|
| EMA Trend (4h EMA 50) | 추세 반대 진입 차단 | 역추세 진입 |
| Regime Filter (BTC 1D RSI) | RSI < 30: 숏만, RSI > 70: 롱만 | 극단 구간 역방향 |
| AI Market Proxy (BTC EMA+RSI) | 역방향 차단 + 사이징 조절 | BTC 추세 반대 |
| BB Squeeze | 하위 20% band width 시 차단 | 저변동성 구간 |
| Choppiness Index | CHOP > 61.8이면 차단 | 횡보 구간 |
| Correlation Filter | 보유 포지션과 상관 > 0.85이면 차단 | 중복 노출 |
| Sentiment Proxy | composite < -0.5이면 차단 | 극심한 공포 |
| SL Cooldown / Blacklist | SL 후 30시간 금지, 연속 3회 SL 시 5일 금지 | 연속 손실 |

Correlation Filter가 흥미로운 지점이다. 이미 ETHUSDT 롱을 보유하고 있을 때 ETHUSDT와 상관계수 0.85 이상인 코인에 롱을 잡으면, 사실상 같은 포지션을 두 배로 갖는 것과 다름없다. 분산 효과 없이 리스크만 두 배가 된다.

SL Blacklist는 감정적 대응을 시스템으로 차단하는 장치다. 같은 코인에서 연속 3회 손절이 발생하면, 해당 코인을 5일간 진입 금지 목록에 올린다. "이번엔 다를 거야"라는 생각을 코드 레벨에서 막는다.

### 2-5. 포지션 사이징

사이징은 5개의 요소가 곱해져 최종 포지션 크기를 결정한다.

```text
최종 사이즈 = 기본 사이즈 × 레버리지 × Vol Target 승수 × Sentiment 승수 × VIX 승수
```

각 요소의 범위는 다음과 같다.

| 요소 | 범위 | 설명 |
|------|------|------|
| 기본 사이즈 | 자본의 20%/포지션 | 고정 |
| 레버리지 | 1~5x (프로덕션 3x) | ATR 기반 동적 |
| Vol Target | 가변 | 연간 25% 목표 변동성 |
| Sentiment 승수 | 0.5x~1.3x | 순방향 130%, 역방향 50% |
| VIX 스케일링 | 30%~100% | VIX 15~30 선형 보간 |

Vol Target은 연간 변동성을 25%로 맞추기 위해 현재 변동성에 따라 사이즈를 조절한다. 변동성이 낮으면 사이즈를 키우고, 높으면 줄인다. 레버리지와 반대 방향으로 작동하는 셈이다.

### 2-6. 고급 메카닉

**Pyramiding (OFF):**

```text
조건: +2% 이익 시 추가 진입
규모: 초기 포지션의 50%
최대: 2회
결과: -28% Sharpe degradation → OFF
```

수익 중인 포지션에 추가 진입하는 전략이다. 추세가 이어지면 효과적이지만, 반전 시 손실이 가파르게 증가한다. 백테스트 결과 Sharpe가 28% 하락해 비활성화했다.

**Rotation:**

```text
조건: 보유 포지션 대비 15%+ 우위 시그널 발생
동작: 약한 포지션 청산 → 강한 시그널 진입
상태: ON
```

**비용 시뮬레이션:**

```text
Funding Rate:  8시간마다 -0.01% (LONG 기준)
Slippage:      0.1% 기본 + 거래량 의존 (0.05%~0.5% cap)
```

Funding Rate와 Slippage를 시뮬레이션에 포함시키는 것이 중요하다. 이 두 비용을 빼면 백테스트 결과가 실전보다 좋게 나온다. 특히 Funding Rate는 장기 보유 시 누적 효과가 크다. 1일 3회 x 0.01% = 하루 0.03%, 한 달이면 약 0.9%다.

**리스크 킬 스위치:**

| 조건 | 동작 |
|------|------|
| Daily Loss ≥ -5% (실현 PnL) | 신규 진입 중단 |
| Portfolio MDD ≥ -15% | 사이징 50%로 축소 |

---

## 3. 주식 시뮬레이터 구조

코인 선물에 비해 상대적으로 단순하지만, 주식 시뮬레이터도 3가지 전략 변형을 지원한다.

### 전략 변형

| 전략 | 로직 | 용도 |
|------|------|------|
| Default (Momentum) | 기술 + 감성 + AI 스코어링 | 범용 |
| Mean Reversion | Bollinger + RSI + Stochastic | 국내 전용 |
| Adaptive (Buy & Hold Protected) | Golden/Death Cross + Crash Defense | 장기 보유 |

Adaptive 전략의 Crash Defense는 20% 낙폭 시 자동으로 포지션을 축소하는 방어 로직이다. "Buy & Hold 하되, 폭락장에서는 빠져나온다"는 컨셉이다.

### 감성 프록시 (주식 전용)

실제 감성 데이터(뉴스, SNS)를 사용하지 않고, 가격 데이터에서 감성을 추정하는 프록시 시스템이다.

```text
Composite Score = 20D Momentum(40%) + RSI Reversal(30%) + 20D Volatility(30%)
```

| 요소 | 가중치 | 해석 |
|------|--------|------|
| 20D Momentum | 40% | -10%~+10% 정규화, 추세 강도 |
| RSI Reversal | 30% | < 30 = 불(반전 기대), > 70 = 베어(과열) |
| 20D Volatility | 30% | 고변동 = 공포, 저변동 = 탐욕 |

### 주식 리스크 관리

| 항목 | 국내 | 해외 |
|------|------|------|
| SL | 3% | 7% (수수료 0.25% 고려) |
| Trailing | 1.5% 활성화, 0.8% trail | 동일 |
| TP 1단계 | 10% → 50% 매도 | 동일 |
| TP 2단계 | 20% → 전량 매도 | 동일 |
| Min Hold | 0일 | 10일 (anti-churn) |
| SPY Filter | N/A | SPY < SMA(200) 시 차단 |

해외 주식의 Min Hold 10일은 anti-churn 정책이다. 잦은 매매를 막아 수수료 손실을 줄인다. 해외 주식 수수료(0.25%)가 국내(0.015%)보다 16배 이상 높기 때문에 필요한 조치다.

---

## 4. 성과 지표 시스템 — 17개 지표

`metrics.py`에서 계산하는 17개 지표는 4개 그룹으로 분류된다.

### Core Returns (4개)

| 지표 | 계산식 | 비고 |
|------|--------|------|
| Total Return | (최종자산 - 초기자산) / 초기자산 | 절대 수익률 |
| CAGR | (최종자산/초기자산)^(1/년수) - 1 | 연환산 수익률 |
| Annualized Volatility | std(일간수익률) x sqrt(거래일수) | 연환산 변동성 |
| Sharpe Ratio | CAGR / Annualized Volatility | 위험 대비 수익 |

### Risk (3개)

| 지표 | 계산식 | 비고 |
|------|--------|------|
| MDD | max(peak - trough) / peak | 최대 낙폭 |
| MAR Ratio | CAGR / MDD | 낙폭 대비 수익 |
| Sortino Ratio | CAGR / Downside Volatility | 손실 변동성만 고려 |

### Trade Stats (4개)

| 지표 | 설명 |
|------|------|
| Win Rate | 수익 거래 / 전체 거래 |
| Avg Trade Return | 거래당 평균 수익률 |
| Max/Min Trade Return | 최대 수익/손실 거래 |
| Gain-to-Loss Ratio | 평균 수익 / 평균 손실 |

### Risk-Adjusted (3개 + 연환산 기준)

| 지표 | 설명 |
|------|------|
| Alpha | 벤치마크 대비 초과 수익 |
| Beta | 시장 민감도 |
| Alpha p-value | Alpha의 통계적 유의성 |

연환산 기준은 시장에 따라 다르다.

```python
# metrics.py
ANNUALIZATION_FACTOR = {
    'stock': 252,    # 주식: 연간 거래일
    'crypto': 365,   # 크립토: 365일 24/7
}
```

Sharpe와 Sortino의 차이가 중요하다. Sharpe는 전체 변동성(상승+하락)을 분모로 쓰지만, Sortino는 하락 변동성만 쓴다. 수익이 크게 나서 변동성이 높아진 경우, Sharpe는 불이익을 주지만 Sortino는 그렇지 않다. 트레이딩 전략 평가에는 Sortino가 더 적합한 지표라는 주장이 있고, 타당하다.

---

## 5. 백테스트 정확성 보장

백테스트에서 가장 위험한 것은 미래 데이터를 참조하는 것이다. 과거 데이터로 테스트하면서 무의식적으로 미래 정보를 끌어오면, 결과가 비현실적으로 좋게 나온다. 2026년 3월 2일([5일차](/blog/2026/03/02/ai-trading-bot-day-5/))과 3월 6일에 이를 차단하기 위한 수정을 진행했다.

### 미래참조 방지 (2026-03-02)

4시간봉 합성 시 `label`과 `closed` 파라미터가 잘못 설정되어 있었다.

```python
# 수정 전 — 미래참조 발생
df_4h = df_1h.resample('4h').agg(ohlcv_dict)

# 수정 후 — 미래참조 차단
df_4h = df_1h.resample('4h', label='right', closed='right').agg(ohlcv_dict)
```

`label='right', closed='right'`는 4시간 봉의 값이 해당 구간이 끝난 후에야 확정된다는 것을 보장한다. 이 설정이 없으면, 4시간 구간이 아직 진행 중인데 이미 완성된 봉 데이터를 사용하게 된다. 실전에서는 불가능한 행위다.

### MACD 초기 불안정 시그널 제거

```python
# 수정 전
macd = ta.MACD(close, min_periods=50)

# 수정 후
macd = ta.MACD(close, min_periods=100)
```

MACD(12, 26, 9)의 signal line은 MACD 값의 9일 EMA다. MACD 자체가 안정되려면 최소 26일이 필요하고, signal line까지 포함하면 35일이다. 하지만 EMA의 특성상 초기값의 영향이 오래 남기 때문에, `min_periods=100`으로 넉넉하게 잡아 초기 노이즈를 제거했다.

### 통계 계산 안정성

```python
# Sortino — 0-division 방지
# 수정 전
if len(downside) > 0:
    sortino = cagr / downside_std

# 수정 후
if len(downside) > 1:  # 표본이 2개 이상이어야 표준편차 의미 있음
    sortino = cagr / downside_std
```

```python
# Alpha/Beta — 행렬 랭크 체크 추가
if np.linalg.matrix_rank(X) < X.shape[1]:
    alpha, beta = 0.0, 1.0  # 퇴화 행렬 시 기본값
```

### Timeframe 하드코딩 수정 (2026-03-06)

```python
# 수정 전 — 4h 하드코딩
bar_seconds = 14400  # 4시간

# 수정 후 — 동적 계산
def _bar_seconds(self, timeframe: str) -> int:
    mapping = {'1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400}
    return mapping.get(timeframe, 3600)
```

Walk-Forward 검증 시 timeframe 파라미터가 시뮬레이터까지 전파되지 않아, 1시간봉 테스트인데 4시간봉 기준으로 시간이 계산되는 문제가 있었다. `_bar_seconds()` 헬퍼를 추가하고 Walk-Forward에 timeframe을 명시적으로 전달하도록 수정했다.

이 종류의 버그가 가장 까다롭다. 결과가 완전히 틀리지 않고 "약간 이상하게" 나오기 때문에, 발견하기 어렵다.

---

## 6. 검증 방법론 — Walk-Forward와 Monte Carlo

백테스트 결과를 그대로 믿으면 안 된다. 과적합(overfitting) 가능성을 검증하기 위한 두 가지 방법론을 구현했다.

### Walk-Forward 검증

```text
[------- 훈련 180일 -------][-- 테스트 30일 --]
                    [------- 훈련 180일 -------][-- 테스트 30일 --]
                                        [------- 훈련 180일 -------][-- 테스트 30일 --]
```

핵심 지표는 **열화 비율(degradation ratio)**이다.

```text
열화 비율 = 테스트 기간 Sharpe / 훈련 기간 Sharpe
```

| 열화 비율 | 판정 |
|----------|------|
| > 50% | 정상 — 과적합 낮음 |
| 30~50% | 주의 — 일부 과적합 의심 |
| < 30% | 위험 — 심각한 과적합 |

훈련 기간에서 Sharpe 5.0이 나왔는데 테스트 기간에서 1.0이 나오면, 열화 비율은 20%다. 해당 전략은 과거 데이터에 과적합되었을 가능성이 높다.

```bash
# Walk-Forward 실행
python -m src.backtest.run --market futures --walk-forward --wf-train-days 180 --wf-test-days 30
```

### Monte Carlo 검증

Bootstrap resampling으로 1,000번의 시뮬레이션을 돌린다.

```bash
# Monte Carlo 실행
python -m src.backtest.run --market crypto --monte-carlo --mc-simulations 1000
```

일간 수익률을 무작위로 섞어 1,000개의 가상 시나리오를 만들고, 95% 신뢰구간을 산출한다. "특정 순서로 거래가 이루어졌기 때문에 좋은 결과가 나온 것"인지, "어떤 순서든 상관없이 전략 자체가 강건한 것"인지를 구분할 수 있다.

---

## 7. 백테스트 결과 — 6개 개선사항 체계적 검증

2026년 3월 19일, 6개 개선사항에 대해 180일 + 365일 백테스트와 Walk-Forward 검증을 실시했다. 이것이 이 글의 핵심이다.

### 검증 프로토콜

```text
1단계: 180일 표준 백테스트 (Sharpe, MDD, Win Rate 측정)
2단계: 365일 표준 백테스트 (장기 안정성 확인)
3단계: Walk-Forward 검증 (과적합 여부 판정)
4단계: 기존 설정 대비 Sharpe 변화율 계산
5단계: APPLY / DEFER / REJECT 판정
```

### 전체 결과 요약

| 개선사항 | Sharpe 변화 | MDD 변화 | 판정 | 근거 |
|---------|------------|---------|------|------|
| BTC 바로미터 | **+92%** | 개선 | **APPLY** | WF 통과, 압도적 개선 |
| Donchian 70:30 비중 | Sharpe 6.55 | - | **APPLY** | stoch_rsi 대비 10x |
| DriftDetector | 모니터링 도구 | - | 연결 완료 | 성과 지표 아님 |
| Chop 필터 | **-5%** | 미세 개선 | DEFER | 효과 미미 |
| Adaptive 전략전환 | **-56%** | 악화 | **REJECT** | 심각한 성능 저하 |
| VIX 스케일링 | **-24% Sharpe** | -24% MDD | DEFER | MDD 개선이나 수익 타격 큼 |

3개 판정 기준은 다음과 같다.

```text
APPLY:  Sharpe 개선 + Walk-Forward 통과 → 즉시 프로덕션 적용
DEFER:  효과 불분명 또는 Trade-off 존재 → 추가 검증 후 재판정
REJECT: Sharpe 악화 > 20% → 프로덕션 적용 불가
```

### 7-1. BTC 바로미터 — Sharpe +92%, APPLY

가장 큰 성과를 낸 개선사항이다. BTC의 EMA(20/50)와 RSI(14)를 조합해 시장 전체 방향을 판단하고, 이를 개별 코인 진입에 필터로 적용한다.

**로직:**

```text
BTC 추세 판단:
  EMA(20) > EMA(50) AND RSI > 50 → BULLISH
  EMA(20) < EMA(50) AND RSI < 50 → BEARISH
  그 외 → NEUTRAL

필터링:
  BULLISH → 숏 진입 차단
  BEARISH → 롱 진입 차단

사이징 조절:
  순방향 (추세와 같은 방향) → 130%
  역방향 (추세와 반대 방향) → 50%
```

BTC는 코인 시장 전체의 방향을 결정하는 지배적 자산이다. BTC가 하락 추세인데 알트코인 롱을 잡는 것은, 파도가 밀려오는데 역방향으로 수영하는 것과 같다. 개별 코인의 시그널이 아무리 좋아도, 시장 전체가 반대로 가면 이길 확률이 낮다.

**구현 위치:**

```text
src/config.py                              — btc_barometer 10개 파라미터
src/services/crypto_futures_monitor.py      — 계산 + 필터 + 사이징 적용
```

**검증 결과:**
- 180일 백테스트: Sharpe +92%
- Walk-Forward: 열화 비율 50% 초과 — 통과
- 판정: **APPLY** → 프로덕션 즉시 적용

### 7-2. Donchian vs Stoch RSI 전략 비중 — APPLY

두 전략의 성과 차이가 압도적이었다.

| 전략 | Sharpe | 설명 |
|------|--------|------|
| Donchian Ensemble Trend Following | **6.55** | 앙상블 추세추종 |
| Stoch RSI | 0.62 | 오실레이터 기반 |

Donchian 전략의 구성:

```text
Lookback 앙상블: [5, 10, 20, 60]  — 단기 중심 4개 윈도우
Vol Target:     연간 25%
Max Leverage:   2.0x
```

4개의 lookback period를 앙상블로 사용한다. 5일, 10일, 20일, 60일 Donchian Channel을 동시에 계산하고, 다수가 동의하는 방향으로만 진입한다. 단일 기간보다 노이즈에 강건하다.

Sharpe 6.55 vs 0.62는 10배 이상의 차이다. 이 결과를 바탕으로 전략 비중을 조정했다.

```text
변경 전: stoch_rsi 40% (2슬롯) + donchian 60% (3슬롯)
변경 후: stoch_rsi 30% (2슬롯) + donchian 70% (5슬롯)
```

stoch_rsi를 완전히 제거하지 않은 이유는 전략 다각화다. Donchian이 추세추종이라면 Stoch RSI는 역추세 성격이 있어, 횡보장에서 보완 역할을 할 수 있다.

### 7-3. DriftDetector — 연결 완료

DriftDetector는 성과를 개선하는 도구가 아니라, 실전과 백테스트의 괴리를 감지하는 모니터링 도구다.

```text
실행 주기: 4시간마다 (스케줄러 연결)
비교 대상: 최근 30일 실거래 vs 같은 기간 백테스트
출력:      data/drift_detection.json
```

**판정 기준:**

| 상태 | 승률 차이 | PnL 차이 | 대응 |
|------|----------|---------|------|
| OK | ±20% 이내 | ±2% 이내 | 없음 |
| WARNING | ±20~40% | ±2~5% | Discord 알림 |
| CRITICAL | ±40% 초과 | ±5% 초과 | 긴급 리튜닝 |

백테스트에서는 Sharpe 6.55인데 실전에서 승률이 30% 아래로 떨어진다면, 시장 구조가 변했거나 시뮬레이터에 누락된 비용이 있다는 신호다. DriftDetector는 이런 괴리를 자동으로 감지해 알려준다.

### 7-4. Chop 필터 — DEFER

Choppiness Index가 61.8 이상이면 횡보장으로 판단하고 진입을 차단하는 필터다.

```text
결과: Sharpe -5%
판정: DEFER
```

-5%는 통계적 노이즈 범위 안에 있다. 명확한 개선도, 명확한 악화도 아니다. Chop 필터의 이론적 근거(횡보장에서 추세추종 전략이 손실을 내기 쉽다)는 타당하지만, 현재 데이터에서는 효과가 입증되지 않았다. 더 긴 기간의 데이터로 재검증이 필요하다.

### 7-5. Adaptive 전략전환 — REJECT

시장 상황에 따라 추세추종(Donchian)과 역추세(Stoch RSI) 사이를 자동 전환하는 전략이다.

```text
결과: Sharpe -56%
판정: REJECT
```

Sharpe가 56% 하락한 이유는 전환 타이밍 문제다. 시장이 추세에서 횡보로, 횡보에서 추세로 전환되는 시점을 정확히 감지하기 어렵다. 감지가 늦으면 "추세장에서 역추세 전략을, 횡보장에서 추세 전략을" 적용하게 되어 양쪽 모두에서 손실을 낸다. 이론상으로는 매력적이지만, 실전에서는 전환 지연이 치명적이다.

### 7-6. VIX 스케일링 — DEFER

VIX(변동성 지수)에 따라 포지션 사이즈를 조절하는 기능이다.

```text
VIX 15 → 사이징 100%
VIX 30 → 사이징 30%
(선형 보간)

결과: Sharpe -24%, MDD -24%
판정: DEFER
```

흥미로운 Trade-off다. Sharpe는 24% 하락했지만, MDD도 24% 개선되었다. 수익을 포기하는 대신 최대 낙폭을 줄인 것이다. 리스크 회피 성향이 강한 투자자에게는 오히려 바람직한 결과일 수 있다. 하지만 현재 시스템은 수익 극대화를 우선하므로 DEFER로 판정했다. Portfolio MDD Limit(-15%)가 이미 안전장치 역할을 하고 있기 때문이다.

---

## 8. StrategyAllocator — Thompson Sampling 동적 자본 배분

백테스트 결과와 별개로, 전략 간 자본 배분을 자동화하는 시스템도 구현했다.

### Multi-Armed Bandit

각 전략을 슬롯머신의 팔(arm)로 취급한다. 어떤 팔이 가장 높은 기대 수익을 주는지를 탐색(exploration)과 착취(exploitation) 사이에서 균형을 잡으며 학습한다.

```text
알고리즘: Thompson Sampling (Beta 분포 기반)
샘플링:   Beta(alpha, beta) 분포에서 1,000회 샘플링
감쇠:     alpha_new = 0.7 x alpha_old + wins (14일 window)
최소 탐험: 5%
리밸런싱:  일일
```

**동작 원리:**

```python
# 의사코드
for strategy in strategies:
    alpha = 0.7 * prev_alpha + recent_wins
    beta  = 0.7 * prev_beta  + recent_losses
    samples = np.random.beta(alpha, beta, size=1000)
    expected_return[strategy] = np.mean(samples)

# 기대 수익 비례 자본 배분
allocation = normalize(expected_return, min_per_strategy=0.05)
```

**현재 결과:**

```text
출력: data/strategy_allocations.json
상태: donchian으로 수렴
판정: DEFER
```

StrategyAllocator가 독립적으로 donchian에 자본을 집중시키는 결론에 도달했다. 이는 백테스트에서 donchian의 Sharpe(6.55)가 stoch_rsi(0.62)를 압도한 것과 일치한다. Thompson Sampling이라는 다른 방법론으로 같은 결론에 도달한 것은, donchian 우위의 강건성을 간접적으로 확인해준다.

DEFER로 판정한 이유는 아직 전략이 2개뿐이라 allocator의 가치가 제한적이기 때문이다. 전략이 5개 이상으로 늘어나면 재검토한다.

---

## 9. 트레일링 스탑 비교 — OFF가 최적

2026년 3월 15일에 5가지 트레일링 스탑 파라미터를 비교했다.

| 파라미터 | 활성화 수익 | Trail 폭 | Sharpe |
|---------|-----------|---------|--------|
| **OFF** | - | - | **10.43** |
| 10%/5% | 10% | 5% | < 10.43 |
| 15%/8% | 15% | 8% | < 10.43 |
| 20%/10% | 20% | 10% | < 10.43 |
| 25%/12% | 25% | 12% | < 10.43 |

**결론: 트레일링 OFF 유지.**

모든 트레일링 설정이 OFF보다 낮은 Sharpe를 기록했다. 이유는 ATR 기반 SL/TP와 Signal Reversal/Vanish가 이미 충분한 청산 로직을 제공하기 때문이다. 여기에 트레일링을 추가하면 수익 포지션을 조기에 청산하는 경향이 생긴다. "이익을 더 키울 수 있는 포지션"을 트레일링이 너무 빨리 잘라버리는 것이다.

---

## 10. 1년 투자 성과 예상

2026년 3월 16일, 22일간의 실전 데이터와 백테스트 결과를 결합해 3가지 시나리오를 산출했다.

| 시나리오 | 예상 수익률 | 근거 |
|---------|-----------|------|
| 실전 추세 연장 | -4.8% | 실전 22일 데이터 외삽 |
| 백테스트 기반 낙관 | +14.7% | 365일 백테스트 결과 |
| 현실적 | +1~5% (20,000~100,000원) | 양쪽 가중 평균 |

**실전 22일 데이터:**

```text
승률:     38.6%
SL 비율:  51.7%
```

거래의 절반 이상이 손절로 끝난다. 그럼에도 전체 수익이 흑자인 이유는 Gain-to-Loss Ratio가 1보다 크기 때문이다. 손절 금액보다 익절 금액이 크다. 하지만 승률 38.6%는 심리적으로 부담이 되는 숫자다. 10번 거래하면 6번은 돈을 잃는다.

---

## 11. 현재 프로덕션 설정 — 백테스트 결과 기반

위의 모든 검증 결과를 종합해 확정한 프로덕션 설정이다.

```yaml
# 전략 배분
strategy:
  stoch_rsi: 30%   # 2 슬롯
  donchian: 70%    # 5 슬롯

# 레버리지 & 리스크
leverage: 3x       # 원래 5x에서 하향
atr_sl: 2.0x
atr_tp: 7.0x
vol_target: 25%    # 연간 목표 변동성
daily_loss_limit: 5%
portfolio_mdd_limit: -15%

# 필터 & 기능 (ON)
btc_barometer: ON      # +92% Sharpe → APPLY
bb_squeeze: ON         # 하위 20% band width 차단
sentiment_filter: ON   # entry + sizing 양쪽 적용
rotation: ON           # 15%+ 우위 시 교체

# 필터 & 기능 (OFF)
trailing: OFF          # Sharpe 10.43 최적
pyramiding: OFF        # -28% degradation
chop: OFF              # -5% 미세 효과
vix_scaling: OFF       # -24% Sharpe (MDD는 개선)
adaptive: OFF          # -56% 심각한 저하
```

ON/OFF 판단의 일관된 원칙은 하나다. **Sharpe를 올리면 켜고, 내리면 끈다.** 예외는 VIX 스케일링인데, MDD를 24% 줄여주지만 Sharpe도 24% 줄인다. 현재는 수익 우선이므로 OFF지만, 자본이 커지면 리스크 관리 우선으로 전환하며 ON할 수 있다.

---

## CLI 실전 예시

```bash
# 코인 선물 1년 백테스트 (현재 프로덕션 설정)
python -m src.backtest.run --market futures --days 365 --bb-squeeze --btc-barometer

# 국내 주식 1년 백테스트
python -m src.backtest.run --market domestic --days 365

# 랜덤 샘플링: 전체 풀에서 10코인 뽑아 50회 반복
python -m src.backtest.run --market futures --sample 10 --trials 50 --pool all

# Walk-Forward 검증 (훈련 180일, 테스트 30일)
python -m src.backtest.run --market futures --walk-forward --wf-train-days 180 --wf-test-days 30

# Monte Carlo 강건성 검증 (1000 bootstrap)
python -m src.backtest.run --market crypto --monte-carlo --mc-simulations 1000
```

---

## 12. 실전 백테스트 결과 — 전략별 비교

2026년 3월 19일, 6가지 전략을 동일 조건(BTC, ETH, SOL, XRP, DOGE 포트폴리오, 공유 자본 $10K, 펀딩비 0.01%/8h, 슬리피지 0.10%)에서 실행한 결과다.

### 코인 선물 전략별 180일 백테스트

```text
전략           Sharpe      MDD     총수익     거래수
─────────────────────────────────────────────────
ema_cross       0.14   -29.7%     +5.3%      718
donchian        0.13   -28.8%     +4.4%      883
stoch_rsi      -0.02   -10.5%     -0.3%      423
mtf_ema_rsi    -0.07   -27.1%     -1.9%      406
bb_macd        -0.45   -28.4%    -13.2%      634
rsi            -0.71   -18.1%     -8.7%      413
```

### 코인 선물 전략별 365일 백테스트

```text
전략           Sharpe      MDD     총수익     거래수
─────────────────────────────────────────────────
donchian        0.07   -37.2%     +4.5%     1826
ema_cross      -0.11   -28.3%     -4.9%      849
mtf_ema_rsi    -0.12   -39.7%     -8.1%     1360
bb_macd        -0.52   -32.8%    -24.4%     1346
stoch_rsi      -0.56   -24.5%    -13.1%      864
rsi            -0.96   -37.4%    -22.9%      870
```

365일 기준으로 **양의 Sharpe를 기록한 전략은 donchian 하나뿐이다**. 나머지 5개 전략은 모두 손실을 냈다. 180일에서는 ema_cross가 donchian을 근소하게 앞섰지만, 장기로 갈수록 donchian의 추세추종 특성이 강점을 발휘한다.

### 필터 조합별 365일 백테스트 (donchian 기준)

donchian 전략에 각 필터를 개별 적용한 결과다.

```text
조합                 Sharpe      MDD     총수익     거래수
────────────────────────────────────────────────────────
+ vix-scaling         0.17   -35.7%     +9.1%     1826
+ adaptive            0.09   -31.2%     +5.4%     1814
donchian (기본)       0.07   -37.2%     +4.5%     1826
+ chop               -0.10   -35.5%     -5.7%     1786
+ bb-squeeze         -0.17   -35.5%     -9.9%     1782
+ trailing           -1.81   -39.1%    -32.8%     1733
```

VIX 스케일링이 Sharpe 0.07 → 0.17로 개선했지만, 이전 세션에서 BTC 바로미터를 함께 적용했을 때의 +92% 개선에는 미치지 못한다. Trailing Stop은 -1.81로 **치명적인 성능 저하**를 보인다. Adaptive는 365일 기준으로는 소폭 개선이지만, 이전 세션의 WF 검증에서 -56% 열화가 나왔기 때문에 과적합 위험이 있다.

### 시장별 365일 백테스트 비교

```text
시장             Sharpe      MDD     총수익     비고
─────────────────────────────────────────────────────
국내 주식          1.15    -3.1%     +8.8%    5종목 평균
크립토 현물        0.71    -3.9%     +6.3%    5종목 평균
코인 선물          0.07   -37.2%     +4.5%    donchian 포트폴리오
해외 주식         -0.56    -5.5%     -1.7%    5종목 평균
```

국내 주식이 Sharpe 1.15로 가장 안정적이다. MDD도 -3.1%로 매우 낮다. 크립토 현물은 Sharpe 0.71로 준수하지만, 코인 선물은 레버리지와 펀딩비 부담으로 Sharpe가 크게 떨어진다. 해외 주식은 수수료(0.25%)와 최근 시장 상황(AAPL, NVDA 하락)으로 인해 마이너스다.

국내 주식 개별 종목 결과:

```text
종목     Sharpe      MDD     CAGR    총수익    승률    거래수
─────────────────────────────────────────────────────────
000660    2.34    -1.5%    11.0%   10.6%  100.0%      3
051910    1.73    -5.9%    15.2%   14.6%  100.0%      2
006400    1.56    -4.5%    14.2%   13.6%   66.7%      6
005930    1.12    -2.3%     6.5%    6.3%  100.0%      4
035420   -0.99    -1.2%    -1.3%   -1.2%    0.0%      2
```

SK하이닉스(000660)가 Sharpe 2.34로 최고 성과를 기록했다. 삼성전자(005930)도 Sharpe 1.12로 안정적이다. NAVER(035420)만 유일하게 손실이다.

### Walk-Forward 검증 (donchian, 180일 훈련 / 30일 테스트)

```text
Walk-Forward 검증 (train=180d, test=30d)
──────────────────────────────────────────────────
  폴드 수: 6
  Fold 0: IS Sharpe=0.17, OOS Sharpe=-1.95
  Fold 1: IS Sharpe=-0.25, OOS Sharpe=-0.25
  Fold 2: IS Sharpe=0.21, OOS Sharpe=-4.03
  Fold 3: IS Sharpe=-1.14, OOS Sharpe=0.38
  Fold 4: IS Sharpe=-1.13, OOS Sharpe=72.65
  Fold 5: IS Sharpe=0.24, OOS Sharpe=-2.73
  Degradation Ratio: -33.76 (과적합 의심)
  OOS 종합: Sharpe=-0.03, MDD=-31.5%, 총수익=-0.9%
```

Degradation Ratio가 -33.76으로 과적합 의심 구간이다. 다만 Fold 4에서 OOS Sharpe 72.65라는 극단값이 나왔는데, 이는 테스트 기간이 30일로 짧아 한두 건의 큰 수익 거래가 결과를 왜곡한 것이다. 극단값을 제외하면 전반적으로 OOS에서 IS 대비 성능이 떨어지는 패턴이 보인다. 이것이 백테스트만 믿으면 안 되는 이유다.

### 실전 운영 데이터 (DriftDetector 출력)

```json
{
  "updated": "2026-03-19T07:25:43",
  "futures": {
    "live_win_rate": 44.44,
    "live_avg_pnl": 1.69,
    "live_trades": 36,
    "backtest_win_rate": 50.0,
    "backtest_avg_pnl": -0.09,
    "win_rate_drift": -5.56,
    "pnl_drift": 1.78,
    "drift_severity": "OK",
    "message": "정상: 승률 차이=-5.6%p, PnL 차이=+1.78%"
  }
}
```

흥미로운 역전 현상이 발생했다. 실전 평균 PnL(+1.69%)이 백테스트(-0.09%)보다 **높다**. 일반적으로 실전이 백테스트보다 나쁜 결과를 내는데, 여기서는 반대다. 이는 백테스트에서 시뮬레이션하지 못하는 요소(AI 레짐 분석기의 진입 타이밍 조절, 실시간 감성 데이터 반영 등)가 실전에서 긍정적으로 작용했을 가능성을 시사한다. DriftDetector 판정은 OK다.

### 현재 보유 포지션 스냅샷

```text
종목       전략          방향   진입가        현재가       미실현PnL   레버리지
────────────────────────────────────────────────────────────────────────
BTCUSDT    donchian_s1  SELL   73,211.40    69,924.23    +4.5%      5x
ASTERUSDT  donchian_s1  SELL      0.7060       0.6808    +3.6%      5x
ETHUSDT    bb_macd      SELL   2,222.13     2,160.83     +2.8%      5x
BCHUSDT    donchian_s1  SELL     464.22       452.32     +2.6%      5x
ZROUSDT    donchian_s1  SELL      2.114        2.076     +1.8%      2x
XRPUSDT    bb_macd      SELL      1.474        1.460     +1.0%      5x
WLFIUSDT   donchian_s1  SELL     0.0966       0.0962     +0.5%      2x
```

7개 포지션 전부 SELL(숏)이고, 전부 수익 중이다. BTC 바로미터가 BEARISH로 판정한 상태에서 롱 진입을 차단하고 숏만 허용한 결과다. donchian_s1 전략이 5개, bb_macd가 2개로 donchian 70% 비중 설정이 실전에서도 반영되고 있다.

### AI 시장 레짐 분석

```json
{
  "regime": "CAUTION",
  "confidence": 0.65,
  "risk_level": 3,
  "max_leverage": 1,
  "key_risks": [
    "VIX 급등(+12.16%) - 시장 변동성 및 불안감 증대",
    "금값 하락(-2.22%) - 리스크온 약화 신호",
    "S&P500 정체(+0.00%) - 주식시장 모멘텀 부재",
    "공포탐욕지수 중립(50/100) - 시장 방향성 불명확"
  ]
}
```

AI 레짐 분석기가 CAUTION(경계)을 판정했다. 레버리지를 1x로 제한하고, 위험 자산(PAXG, GLD)을 회피 목록에 올린 상태다. 이 데이터가 BTC 바로미터와 함께 진입 필터로 작동하면서, 시장이 불확실할 때 공격적 포지션을 억제한다.

---

## 13. 전략별 장단점 비교

6가지 전략의 특성을 실제 백테스트 결과를 바탕으로 정리한다.

### Donchian Ensemble Trend Following

```text
365일 Sharpe: 0.07 | MDD: -37.2% | 총수익: +4.5% | 거래수: 1,826
```

**장점:**
- 유일하게 365일 기준 양의 Sharpe를 기록한 전략
- 앙상블 구조([5, 10, 20, 60] lookback)로 단일 기간 대비 노이즈에 강건
- 추세장에서 수익을 크게 가져가는 구조 (TP = ATR × 7.0)
- 거래 빈도가 높아(1,826건) 통계적 신뢰도가 높음

**단점:**
- MDD -37.2%로 가장 큰 낙폭 중 하나
- 횡보장에서 잦은 손절 발생 (추세추종의 본질적 약점)
- 레버리지 환경에서 펀딩비 누적 부담

**적합한 시장:** 명확한 추세가 형성되는 강세/약세장

---

### EMA Cross

```text
365일 Sharpe: -0.12 | MDD: -39.7% | 총수익: -8.1% | 거래수: 1,360
```

**장점:**
- 180일 기준에서는 Sharpe 0.14로 donchian을 근소하게 앞섬
- EMA 교차는 직관적이고 구현이 단순
- 추세 전환 시점 포착에 비교적 빠른 반응

**단점:**
- 장기(365일)에서는 마이너스 전환 — 시장 구조 변화에 취약
- MDD -39.7%로 전체 전략 중 최악
- EMA 특성상 급변하는 시장에서 후행 지표 역할

**적합한 시장:** 중기(3~6개월) 명확한 추세장. 장기 운용에는 부적합

---

### MTF EMA RSI (Multi-Timeframe)

```text
365일 Sharpe: -0.11 | MDD: -28.3% | 총수익: -4.9% | 거래수: 849
```

**장점:**
- 멀티타임프레임 확인으로 노이즈 시그널 필터링
- MDD -28.3%로 상대적으로 낮은 최대 낙폭
- 거래 빈도가 낮아(849건) 수수료/펀딩비 부담 적음

**단점:**
- 수익률이 부진 (-4.9%)
- 멀티타임프레임 조건이 까다로워 진입 기회를 많이 놓침
- 복잡한 로직 대비 성과가 정당화되지 않음

**적합한 시장:** 변동성이 중간 수준인 시장. 과도한 필터링이 오히려 기회를 차단

---

### BB + MACD (이중 확인)

```text
365일 Sharpe: -0.52 | MDD: -32.8% | 총수익: -24.4% | 거래수: 1,346
```

**장점:**
- Bollinger Bands(과매수/과매도)와 MACD(추세)의 이중 확인으로 이론적 안정성
- 현재 프로덕션에서 stoch_rsi 슬롯(2개)으로 보조 운용 중

**단점:**
- 365일 수익률 -24.4%로 심각한 손실
- 이중 확인이 진입을 너무 늦추는 경향 — 추세 초반을 놓침
- 횡보장에서 Bollinger Bands가 잦은 거짓 시그널 생성

**적합한 시장:** 변동성이 높고 추세가 명확한 시장. 저변동성 횡보장에서는 역효과

---

### Stoch RSI

```text
365일 Sharpe: -0.56 | MDD: -24.5% | 총수익: -13.1% | 거래수: 864
```

**장점:**
- MDD -24.5%로 전 전략 중 최저 낙폭 — 리스크 관리 측면에서 우수
- 거래 빈도가 낮아 수수료 절약
- 과매수/과매도 구간을 정밀하게 포착

**단점:**
- 역추세(mean-reversion) 성격이라 추세장에서 수익을 놓침
- 크립토 시장의 강한 추세 특성과 맞지 않음 (Sharpe 0.62 vs donchian 6.55 — 이전 세션 결과)
- 오실레이터 특성상 강한 추세에서 조기 청산 경향

**적합한 시장:** 횡보/레인지 바운드 시장. 추세장에서는 donchian의 보완 역할로 제한적 사용

---

### RSI

```text
365일 Sharpe: -0.96 | MDD: -37.4% | 총수익: -22.9% | 거래수: 870
```

**장점:**
- 단순한 로직으로 구현/디버깅 용이
- 과매수/과매도 감지의 고전적 도구

**단점:**
- **전체 전략 중 최악의 Sharpe (-0.96)**
- 단일 오실레이터로는 크립토 선물에서 수익 창출이 어려움
- 추세를 무시하는 역추세 진입이 빈번한 손절로 이어짐
- 같은 오실레이터 계열인 stoch_rsi보다 모든 지표에서 열등

**적합한 시장:** 단독 사용 부적합. 다른 전략의 보조 필터로만 활용 권장

---

### 전략 선택 매트릭스

| 우선순위 | 전략 | 핵심 강점 | 핵심 약점 | 권장 비중 |
|---------|------|----------|----------|----------|
| 1 | Donchian | 유일한 양의 Sharpe, 추세추종 | 높은 MDD | **70%** |
| 2 | Stoch RSI | 최저 MDD, 분산 효과 | 추세장 부진 | **30%** |
| 3 | EMA Cross | 180일 단기 우수 | 장기 불안정 | 모니터링 |
| 4 | MTF EMA RSI | 낮은 MDD | 기회 손실 | 모니터링 |
| 5 | BB+MACD | 이중 확인 | 진입 지연 | 보조 전용 |
| 6 | RSI | 단순함 | 최악 성과 | 사용 안 함 |

현재 프로덕션 설정(donchian 70% + stoch_rsi 30%)은 이 매트릭스의 1위와 2위 조합이다. Donchian이 추세장에서 수익을 내고, Stoch RSI가 MDD를 완충하는 구조다. 두 전략의 상관계수가 낮아 포트폴리오 분산 효과를 기대할 수 있다.

---

## 남은 과제

백테스트 프레임워크 자체는 성숙 단계에 들어섰지만, 풀어야 할 문제가 남아 있다.

1. **승률 38.6%의 구조적 개선**: MACD 강도 필터, TP/SL 비율 재조정. 손절 비율 51.7%를 40% 이하로 낮추는 것이 목표다.
2. **Chop 필터 장기 검증**: 1년 이상 데이터로 재검증. 횡보장 필터의 이론적 가치는 충분하다.
3. **VIX 스케일링 재판정**: 자본 규모가 커지면 MDD 관리가 수익보다 중요해진다. 재판정 기준을 미리 정해둘 필요가 있다.
4. **DriftDetector 실전 검증**: 4시간마다 돌아가고 있지만, WARNING/CRITICAL 판정이 실제로 의미 있는 조기 경보가 되는지는 시간이 더 필요하다.

---

*6가지 전략, 4개 시장, 17개 지표 — 365일 백테스트에서 양의 Sharpe를 기록한 전략은 Donchian 하나뿐이었고, 실전 36건 거래의 평균 PnL +1.69%는 백테스트보다 높았다.*
