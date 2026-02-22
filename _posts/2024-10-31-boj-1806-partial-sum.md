---
title: "BOJ 1806 — 부분합 (C++ 풀이)"
description: "투 포인터로 연속 부분 수열의 합이 S 이상인 최소 길이를 구하는 풀이. 슬라이딩 윈도우의 대표 문제다."
date: 2024-10-31
categories: [Algorithm]
tags: [Algorithm]
---

## 문제

[BOJ 1806 - 부분합](https://www.acmicpc.net/problem/1806)

N개의 자연수로 이루어진 수열에서 연속된 부분 수열의 합이 S 이상인 것 중 가장 짧은 길이를 구하는 문제다.

## 핵심 아이디어

1. **투 포인터(슬라이딩 윈도우)** 기법을 사용한다.
2. `start`와 `end` 두 포인터를 유지하면서:
   - `sum < S`이면 `end`를 오른쪽으로 이동하여 합을 늘린다.
   - `sum >= S`이면 길이를 기록하고 `start`를 오른쪽으로 이동하여 합을 줄인다.
3. 한 번의 순회로 O(N)에 해결 가능하다.

## 풀이

```cpp
#include <iostream>

using namespace std;

int n, x;
int arr[100001];

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(); cout.tie();

    int start = 0, end = 0, sum = 0, result;

    cin >> n >> x;

    result = x + 1;

    for (int i = 0; i < n; i++) {
        cin >> arr[i];
    }

    sum += arr[0];

    while (start <= end && end < n) {
        if (sum < x) {
            sum += arr[++end];
        } else {
            result = min(result, end - start + 1);
            sum -= arr[start++];
        }
    }

    if (result == x + 1) result = 0;

    cout << result << endl;

    return 0;
}
```

## 주요 포인트

- `result = x + 1`로 초기화하여, 답이 없는 경우를 감지한다 (result가 변하지 않으면 0 출력).
- `start <= end` 조건으로 포인터가 역전되지 않도록 한다.
- 투 포인터의 핵심: start와 end 모두 **한 방향으로만** 이동하므로 O(N)이다.

## 복잡도

- 시간: O(N) — 각 포인터가 최대 N번 이동
- 공간: O(N)

*투 포인터의 기본 문제, 연속 부분 수열 조건 최적화에 자주 등장하는 패턴이다.*
