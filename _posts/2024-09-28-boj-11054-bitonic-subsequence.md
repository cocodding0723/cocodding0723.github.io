---
title: "BOJ 11054 — 가장 긴 바이토닉 부분 수열 (C++ 풀이)"
description: "LIS를 양방향으로 구한 뒤 합산하여 가장 긴 바이토닉 부분 수열을 구하는 DP 풀이."
date: 2024-09-28
categories: [Algorithm]
tags: [Algorithm, DP]
---

## 문제

[BOJ 11054 - 가장 긴 바이토닉 부분 수열](https://www.acmicpc.net/problem/11054)

수열에서 어떤 지점까지 증가하다가 그 이후 감소하는 **바이토닉 부분 수열** 중 가장 긴 것의 길이를 구하는 문제다.

## 핵심 아이디어

1. 각 위치 i에서 **왼쪽에서의 LIS**(증가)와 **오른쪽에서의 LIS**(감소)를 구한다.
2. `asend_dp[i]` = i까지의 가장 긴 증가 부분 수열 길이.
3. `desend_dp[i]` = i부터 끝까지의 가장 긴 감소 부분 수열 길이.
4. 답: `max(asend_dp[i] + desend_dp[i] - 1)` (i는 꼭짓점이므로 1을 빼야 중복 제거).

## 풀이

```cpp
#include <iostream>

using namespace std;

int main() {
    int n, m = 0;
    int arr[1001];
    int asend_dp[1001];
    int desend_dp[1001];

    cin >> n;

    for (int i = 1; i <= n; i++) {
        cin >> arr[i];
        asend_dp[i] = desend_dp[i] = 1;
    }

    for (int i = 1; i <= n; i++) {
        // 왼쪽에서의 LIS
        for (int j = 1; j <= i; j++) {
            if (arr[i] > arr[j]) {
                asend_dp[i] = max(asend_dp[j] + 1, asend_dp[i]);
            }
        }

        // 오른쪽에서의 LIS (뒤에서부터)
        for (int j = n - i + 1; j <= n; j++) {
            if (arr[n - i] > arr[j]) {
                desend_dp[n - i] = max(desend_dp[j] + 1,
                                       desend_dp[n - i]);
            }
        }
    }

    for (int i = 1; i <= n; i++) {
        m = max(m, asend_dp[i] + desend_dp[i] - 1);
    }

    cout << m << endl;

    return 0;
}
```

## 주요 포인트

- 한 번의 루프에서 앞에서의 LIS와 뒤에서의 LIS를 동시에 계산한다.
- `-1`을 하는 이유: 꼭짓점 i가 양쪽에서 중복 카운트되기 때문이다.
- 순수 증가나 순수 감소 수열도 바이토닉 수열의 특수한 경우에 해당한다.

## 복잡도

- 시간: O(N^2)
- 공간: O(N)

*LIS를 양방향으로 확장하는 응용 문제, LIS의 원리를 정확히 이해하고 있어야 한다.*
