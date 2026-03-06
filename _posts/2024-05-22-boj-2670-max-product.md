---
title: "BOJ 2670 — 연속부분최대곱 (C++ 풀이)"
description: "연속 부분 수열의 곱이 최대가 되는 값을 구하는 DP 문제. Kadane's Algorithm의 곱셈 버전이다."
date: 2024-05-22
categories: [Algorithm]
tags: [Algorithm]
---

## 문제

[BOJ 2670 - 연속부분최대곱](https://www.acmicpc.net/problem/2670)

N개의 실수로 이루어진 수열에서 연속된 부분 수열의 곱이 최대가 되는 값을 구하라. 소수점 셋째 자리까지 출력한다.

## 핵심 포인트

1. **Kadane's Algorithm 변형**: 최대 부분합(Maximum Subarray Sum)의 곱셈 버전이다.
2. `dp[i] = max(arr[i], arr[i] * dp[i-1])` — 이전까지의 곱에 현재 값을 곱하는 것과, 현재 값에서 새로 시작하는 것 중 큰 값을 선택한다.
3. 모든 값이 양수이므로 음수 처리가 필요 없다 (이 문제 한정).

## C++ 풀이

```cpp
#include <iostream>

using namespace std;

double arr[10001];
double result;
int N;

int main() {
    cin >> N;
    cin >> arr[0];

    result = arr[0];

    for (int i = 1; i < N; i++) {
        cin >> arr[i];

        arr[i] = max(arr[i], arr[i] * arr[i - 1]);  // 이어가기 vs 새로 시작
        result = max(arr[i], result);                  // 전체 최대값 갱신
    }

    printf("%.3f", result);

    return 0;
}
```

## 풀이 흐름

1. `arr[i]`를 입력받으면서 동시에 DP를 수행한다. 별도 DP 배열 없이 입력 배열을 재사용한다.
2. 각 위치에서 "이전까지의 최대 곱 × 현재 값"과 "현재 값 단독" 중 큰 것을 선택한다.
3. `result`에 지금까지의 전체 최대값을 유지한다.

## 최대 부분합과의 비교

| | 최대 부분합 | 연속부분최대곱 |
|---|---|---|
| 점화식 | `dp[i] = max(a[i], dp[i-1] + a[i])` | `dp[i] = max(a[i], dp[i-1] * a[i])` |
| 이어갈 조건 | `dp[i-1] > 0` | `dp[i-1] > 1` |
| 새로 시작 | 이전 합이 음수일 때 | 이전 곱이 1보다 작을 때 |

구조가 동일하다. 덧셈이 곱셈으로 바뀌었을 뿐이다.

## 주의사항

**출력 형식**: `printf("%.3f")`로 소수점 셋째 자리까지 반올림 출력한다. `cout`을 사용하려면 `cout << fixed << setprecision(3)`을 설정해야 한다.

## 복잡도

- 시간: O(N) — 한 번 순회
- 공간: O(N) — 입력 배열 (O(1)로도 가능하지만 가독성을 위해 배열 사용)

*Kadane's Algorithm을 알면 덧셈을 곱셈으로 바꾸는 것만으로 새 문제를 풀 수 있다. 알고리즘의 패턴을 익히는 것이 중요한 이유다.*
