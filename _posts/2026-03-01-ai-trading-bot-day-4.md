---
title: "AI 트레이딩 봇 개발기 - 4일차"
description: "코인 선물 백테스트 모듈 D-VAT 전략 신규 구축. 백테스트 구현 중 프로덕션 SHORT 트레일링 버그 발견. SL 쿨다운, 블랙리스트, 거래량 필터 3건 적용."
date: 2026-03-01
categories: [Project]
tags: [AI, Trading]
---

## 백테스트를 선물 시장으로 확장한 이유

[3일차](/blog/2026/02/28/ai-trading-bot-day-3/)에서 현물 시장용 백테스트 프레임워크를 구축했다. 현물은 단방향(매수 후 매도)이라 시뮬레이션이 단순한 편이다. 그런데 실제로 수익이 집중되는 곳은 선물 시장이다. 레버리지, SHORT 포지션, 트레일링 스탑, 피라미딩 — 현물에는 없는 메커니즘이 선물에는 전부 있고, 그만큼 전략 검증 없이 실전에 투입하면 손실 규모도 크다.

프로덕션에서 이미 `CryptoFuturesMonitor`가 D-VAT 전략으로 돌아가고 있었다. 문제는 이 전략이 백테스트 없이 라이브로 올라간 상태였다는 것이다. "과거 데이터에서 이 전략이 어떤 성과를 냈는지" 검증할 수단이 없었다. 4일차의 목표는 명확했다. **프로덕션과 동일한 로직을 bar-by-bar로 재현하는 선물 백테스트 모듈을 만드는 것.**

---

## D-VAT 전략 해부

D-VAT(Dual-Verification with ATR and Trailing)은 프로덕션 `CryptoFuturesMonitor`에서 사용하는 코인 선물 전략이다. 핵심은 이중 시간프레임 확인과 동적 리스크 관리다.

### 진입 조건: BB(1h) + MACD(4h) 이중확인

단일 지표만으로 진입하면 노이즈에 휘둘린다. D-VAT은 두 개의 시간프레임에서 독립적으로 시그널이 발생해야만 포지션을 연다.

| 시간프레임 | 지표 | LONG 조건 | SHORT 조건 |
|-----------|------|-----------|------------|
| 1h | Bollinger Band | 종가 < 하단 밴드 | 종가 > 상단 밴드 |
| 4h | MACD | MACD > Signal (골든크로스) | MACD < Signal (데드크로스) |

1시간봉에서 과매도/과매수를 감지하고, 4시간봉 MACD로 추세 방향을 확인한다. 둘 다 일치할 때만 진입한다.

### 리스크 관리: ATR 기반 SL/TP

Stop Loss와 Take Profit을 고정 퍼센트가 아닌 ATR(Average True Range) 배수로 설정한다.

```python
atr = calculate_atr(high, low, close, period=14)
stop_loss = entry_price - atr * sl_multiplier   # LONG
take_profit = entry_price + atr * tp_multiplier  # LONG
```

ATR은 시장의 변동성을 반영하므로, 변동성이 큰 장에서는 SL이 넓어지고 변동성이 작은 장에서는 좁아진다. 고정 2% SL 같은 방식보다 시장 상황에 적응적이다.

### Volume-Adjusted Trailing Stop (VAT)

포지션이 수익 구간에 진입하면, 트레일링 스탑이 활성화된다. 일반적인 트레일링 스탑은 고정 거리를 유지하지만, VAT은 거래량에 따라 트레일링 거리를 조절한다.

```python
def update_trailing_stop(position, current_price, current_volume, avg_volume):
    volume_ratio = current_volume / avg_volume
    trail_distance = base_trail * (1 / max(volume_ratio, 0.5))

    if position.side == "LONG":
        new_stop = current_price - trail_distance
        position.trailing_stop = max(position.trailing_stop, new_stop)
    elif position.side == "SHORT":
        new_stop = current_price + trail_distance
        position.trailing_stop = min(position.trailing_stop, new_stop)
```

거래량이 평균보다 높으면 트레일링 거리가 좁아진다(빠른 익절). 거래량이 낮으면 거리가 넓어진다(추세를 더 오래 추적). 거래량이 급증하는 구간은 대개 추세 전환이 임박했다는 신호이므로, 빠르게 수익을 확정하는 것이 합리적이다.

### 피라미딩

기존 포지션이 수익 중일 때 같은 방향으로 추가 진입한다. 최대 피라미딩 횟수와 추가 진입 조건(기존 포지션 수익률 N% 이상)을 설정한다.

---

## 백테스트가 프로덕션을 미러링해야 하는 이유

백테스트 모듈을 설계할 때 가장 중요하게 생각한 원칙이 하나 있다. **프로덕션 코드의 로직을 그대로 재현해야 한다.**

"비슷하게" 만들면 안 된다. 프로덕션에서 BB 기간이 20이고 표준편차 배수가 2.0인데, 백테스트에서 기간을 25로 바꾸면 전혀 다른 전략을 검증하는 셈이다. SL/TP 계산 로직, 트레일링 스탑 업데이트 타이밍, 피라미딩 조건 — 전부 프로덕션과 동일해야 백테스트 결과를 신뢰할 수 있다.

이 원칙이 실제로 가치를 발휘한 사건이 바로 이날 발생했다.

---

## SHORT 트레일링 스탑 버그 — 백테스트가 프로덕션 버그를 잡다

`futures_simulator.py`를 구현하면서 SHORT 포지션의 트레일링 스탑 로직을 작성하던 중, 프로덕션 코드의 버그를 발견했다.

SHORT 포지션에서 트레일링 스탑은 가격이 내려갈수록(수익 방향) 스탑 가격도 내려가야 한다. 트리거 조건은 "현재 가격이 트레일링 스탑보다 **높으면**" 손절이다.

```python
# 버그가 있던 프로덕션 코드 (crypto_futures_monitor.py)
if position.side == "SHORT":
    if current_price < position.trailing_stop:  # 방향이 반대
        close_position(position, reason="trailing_stop")
```

`current_price < position.trailing_stop` — 이것은 LONG의 트리거 조건이다. SHORT에서는 가격이 올라가면 손절해야 하므로 `current_price > position.trailing_stop`이어야 한다.

```python
# 수정 후
if position.side == "SHORT":
    if current_price > position.trailing_stop:  # 올바른 방향
        close_position(position, reason="trailing_stop")
```

이 버그가 프로덕션에서 어떤 영향을 미쳤는지 생각해보면, SHORT 포지션에서 가격이 올라가도(손실 방향) 트레일링 스탑이 트리거되지 않았다. 가격이 내려갈 때(수익 방향) 트레일링 스탑이 발동해서, 수익 중인 포지션을 조기 청산했을 가능성이 높다. 수익은 줄이고 손실은 방치하는 최악의 조합이다.

이 버그는 **백테스트 코드를 한 줄씩 작성하면서** 발견했다. 프로덕션 로직을 그대로 옮기는 과정에서 "이 조건이 맞나?" 하고 의심한 것이 출발점이었다. 프로덕션 코드만 읽었다면 놓쳤을 수 있다. 동일한 로직을 처음부터 다시 구현하는 행위 자체가 코드 리뷰와 같은 역할을 한 셈이다.

---

## 백테스트 모듈 구조

### FuturesBacktestConfig

```python
@dataclass
class FuturesBacktestConfig:
    # Bollinger Band (1h)
    bb_period: int = 20
    bb_std: float = 2.0

    # MACD (4h)
    macd_fast: int = 12
    macd_slow: int = 26
    macd_signal: int = 9

    # Risk Management
    atr_period: int = 14
    sl_multiplier: float = 1.5
    tp_multiplier: float = 3.0

    # Trailing Stop
    trail_activation_pct: float = 1.0   # 수익 1% 이상 시 활성화
    base_trail_multiplier: float = 1.0

    # Pyramiding
    max_pyramid: int = 3
    pyramid_threshold_pct: float = 1.5  # 기존 수익 1.5% 이상 시

    # Position Sizing
    leverage: int = 10
    position_size_pct: float = 0.1      # 자본의 10%
```

설정값은 프로덕션 `CryptoFuturesMonitor`의 기본값과 동일하게 맞췄다. 백테스트에서 파라미터를 바꿔가며 최적값을 찾은 후 프로덕션에 반영하는 흐름이다.

### _SimPosition

```python
@dataclass
class _SimPosition:
    side: str                    # "LONG" or "SHORT"
    entry_price: float
    quantity: float
    stop_loss: float
    take_profit: float
    trailing_stop: Optional[float] = None
    pyramid_count: int = 0
    entry_time: datetime = None
    pnl: float = 0.0
```

프로덕션의 포지션 객체를 간소화한 버전이다. 백테스트에서는 거래소 API가 필요 없으므로, 포지션 관리에 필요한 필드만 유지했다.

### FuturesSimulator — bar-by-bar 시뮬레이션

시뮬레이터의 핵심 루프는 다음과 같다.

```python
class FuturesSimulator:
    def run(self, df: pd.DataFrame) -> BacktestResult:
        self._calculate_indicators(df)

        for i in range(self.warmup_period, len(df)):
            bar = df.iloc[i]

            # 1. 기존 포지션 점검: SL/TP/트레일링 히트 여부
            self._check_exits(bar)

            # 2. 트레일링 스탑 업데이트
            self._update_trailing_stops(bar)

            # 3. 피라미딩 조건 확인
            self._check_pyramiding(bar)

            # 4. 신규 진입 시그널 확인
            self._check_entries(bar)

        return self._compile_results()
```

매 봉(bar)마다 4단계를 순차 실행한다. 순서가 중요한데, 청산을 먼저 확인하고 나서 신규 진입을 검토해야 같은 봉에서 청산과 진입이 동시에 발생하는 비현실적인 시뮬레이션을 방지할 수 있다.

---

## 프로덕션 개선 3건

백테스트 모듈 구축과 병행해서 프로덕션 `crypto_futures_monitor.py`에 실전 운영에서 필요했던 개선 3건을 적용했다.

### 1. SL 30분 쿨다운

Stop Loss가 발동한 직후 같은 방향으로 즉시 재진입하면, 같은 노이즈에 연속으로 손절당하는 whipsaw가 발생한다.

```python
# 손절 후 30분 동안 같은 방향 진입 금지
if position.close_reason == "stop_loss":
    cooldown_until = position.close_time + timedelta(minutes=30)
    if datetime.now() < cooldown_until:
        return False  # 진입 거부
```

30분이라는 수치는 1h봉 기반 전략이므로 최소 반 봉 이상의 새로운 정보가 유입된 후에 재진입하겠다는 의미다.

### 2. 연속 3회 SL 시 2시간 블랙리스트

쿨다운 30분으로도 부족한 경우가 있다. 특정 코인이 강한 횡보장에 진입하면 BB 밴드 터치 → 진입 → SL 발동이 반복된다.

```python
# 최근 N회 거래가 전부 SL이면 해당 심볼을 2시간 블랙리스트
recent_trades = get_recent_trades(symbol, limit=3)
if all(t.close_reason == "stop_loss" for t in recent_trades):
    blacklist[symbol] = datetime.now() + timedelta(hours=2)
```

연속 3회 손절이면 "이 코인은 지금 D-VAT 전략과 맞지 않는 장"으로 판단하고 2시간 동안 해당 심볼을 배제한다. 시장 상태가 바뀔 시간을 주는 것이다.

### 3. $5M 최소 거래량 필터

거래량이 낮은 코인은 슬리피지가 크고, BB/MACD 지표 자체가 신뢰도가 떨어진다. 24시간 거래대금 $5M 미만인 심볼은 진입 대상에서 제외한다.

```python
def is_tradeable(symbol: str) -> bool:
    ticker = exchange.fetch_ticker(symbol)
    quote_volume_24h = ticker['quoteVolume']
    return quote_volume_24h >= 5_000_000  # $5M minimum
```

세 가지 개선 모두 "프로덕션에서 며칠 운영해보니 필요했던 것"이다. 백테스트에서는 발견하기 어려운, 실전 운영에서만 체감되는 문제들이다.

---

## 41개 테스트로 전략 로직 검증

`test_futures_backtest.py`에 41개 테스트를 작성했다. 테스트의 목적은 시뮬레이터의 각 모듈이 프로덕션 로직과 동일하게 동작하는지 확인하는 것이다.

| 테스트 그룹 | 개수 | 검증 내용 |
|-------------|------|-----------|
| Config | 5 | 기본값, 커스텀 설정, 유효성 검증 |
| Indicator | 6 | BB, MACD, ATR 계산 정확도 |
| Entry Signal | 8 | LONG/SHORT 진입 조건 조합 |
| Exit Logic | 10 | SL, TP, 트레일링 스탑 트리거 |
| Trailing Stop | 5 | VAT 거리 계산, 방향별 업데이트 |
| Pyramiding | 4 | 추가 진입 조건, 최대 횟수 제한 |
| Integration | 3 | 전체 시뮬레이션 흐름 |

특히 Exit Logic 10개 테스트 중 SHORT 트레일링 스탑 방향 테스트가 포함되어 있다. 프로덕션에서 발견한 버그를 regression test로 고정한 것이다.

```python
def test_short_trailing_stop_triggers_when_price_rises():
    """SHORT 포지션: 가격이 트레일링 스탑 위로 올라가면 청산"""
    sim = FuturesSimulator(config)
    position = _SimPosition(
        side="SHORT",
        entry_price=100.0,
        trailing_stop=98.0,  # 스탑은 진입가 아래
        ...
    )
    bar = make_bar(close=99.0)  # 스탑 위, 아직 트리거 안 됨
    assert not sim._should_exit(position, bar)

    bar = make_bar(close=98.5)  # 스탑 위로 올라감 (SHORT에서 손실 방향)
    assert not sim._should_exit(position, bar)

    bar = make_bar(close=98.1)  # 여전히 스탑 아래
    assert not sim._should_exit(position, bar)

    bar = make_bar(close=98.0)  # 스탑 도달
    assert sim._should_exit(position, bar)
```

---

## 숫자로 보는 하루

| 지표 | 수치 |
|------|------|
| 신규 파일 | 2개 (futures_simulator.py, test_futures_backtest.py) |
| 신규 코드 | ~850줄 |
| 수정 파일 | 3개 (data_loader.py, run.py, crypto_futures_monitor.py) |
| 테스트 | 41개 전체 통과 |
| 프로덕션 버그 수정 | 1건 (SHORT 트레일링 방향) |
| 프로덕션 개선 | 3건 (쿨다운, 블랙리스트, 거래량 필터) |

---

## 교훈: 이중 구현의 가치

4일차의 가장 큰 수확은 백테스트 모듈 그 자체가 아니다. **동일한 전략을 두 번 구현하는 행위가 코드 리뷰 역할을 한다**는 것이다.

프로덕션 코드를 읽기만 하면, 기존 로직을 "맞겠지"라고 넘기게 된다. 하지만 같은 로직을 처음부터 다시 작성하면, 매 줄마다 "이 조건이 맞나, 이 방향이 맞나"를 판단해야 한다. SHORT 트레일링 버그는 정확히 이 과정에서 발견됐다.

AI가 생성한 프로덕션 코드를 검증하는 방법으로, 단순한 코드 리뷰보다 "같은 로직을 다른 맥락(백테스트)에서 재구현"하는 것이 더 효과적일 수 있다. 코드를 읽는 것과 코드를 쓰는 것은 사고의 깊이가 다르다.

---

## 다음 단계

1. **백테스트 실행 및 파라미터 최적화** — 실제 과거 데이터로 D-VAT을 돌려보고, BB 기간/ATR 배수/트레일링 설정의 최적 조합을 탐색
2. **성과 리포트 시각화** — 수익 곡선, 드로다운, 승률, Sharpe ratio 등을 차트로 출력
3. **프로덕션 개선사항 모니터링** — SL 쿨다운과 블랙리스트가 실전에서 whipsaw를 얼마나 줄이는지 추적
4. **멀티 심볼 백테스트** — 단일 심볼이 아닌 유니버스 전체에 대한 병렬 백테스트

---

*프로덕션 선물 전략을 백테스트로 재구현하면서 SHORT 트레일링 버그를 발견했다 -- 같은 로직을 두 번 쓰는 것이 가장 정직한 코드 리뷰다.*
