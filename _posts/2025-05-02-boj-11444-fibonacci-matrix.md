---
title: "백준 11444번 피보나치 수 6 — 행렬 거듭제곱 C++ 풀이"
description: "백준 11444번 피보나치 수 6 풀이. 2×2 점화식 행렬의 분할 정복 거듭제곱으로 F(N)을 O(log N)에 구하는 C++ 코드와 풀이 과정을 정리한다."
date: 2025-05-02
categories: [Algorithm]
tags: [Algorithm, Math, DP]
---

## 문제

[BOJ 11444 - 피보나치 수 6](https://www.acmicpc.net/problem/11444)

N이 최대 10^18일 때 피보나치 수 F(N)을 1,000,000,007로 나눈 나머지를 구하는 문제다.

## 핵심 아이디어

피보나치 수는 앞의 두 수로 다음 수를 만든다. 이 변화를 2×2 행렬 하나로 표현하면 같은 행렬을 N번 곱하는 문제로 바뀐다.

```text
|F(n+1)|   |1 1| |F(n)  |
|F(n)  | = |1 0| |F(n-1)|
```

예를 들어 `F(1)=1`, `F(0)=0`에서 시작해 행렬을 한 번 곱하면 `F(2)=1`, 두 번 곱하면 `F(3)=2`를 얻는다. 따라서 아래 행렬을 N제곱했을 때 오른쪽 위 원소가 `F(N)`이다.

```text
|1 1|^N   |F(N+1) F(N)  |
|1 0|   = |F(N)   F(N-1)|
```

행렬을 N번 차례대로 곱하면 너무 느리다. 대신 지수를 절반씩 줄이는 **분할 정복 거듭제곱**을 사용한다. `A^10`을 `A^5 × A^5`로 계산하는 식이라 필요한 곱셈 횟수가 O(log N)으로 줄어든다.

## 풀이

```cpp
#include <iostream>
#include <array>

using namespace std;

constexpr long long MOD = 1'000'000'007;
using Matrix = array<array<long long, 2>, 2>;

Matrix multiply(const Matrix& a, const Matrix& b) {
    Matrix result{};

    for (int row = 0; row < 2; ++row) {
        for (int col = 0; col < 2; ++col) {
            for (int mid = 0; mid < 2; ++mid) {
                result[row][col] += a[row][mid] * b[mid][col];
                result[row][col] %= MOD;
            }
        }
    }

    return result;
}

Matrix matrix_power(Matrix base, long long exponent) {
    Matrix result{};
    result[0][0] = 1;
    result[1][1] = 1;

    while (exponent > 0) {
        if (exponent % 2 == 1) {
            result = multiply(result, base);
        }
        base = multiply(base, base);
        exponent /= 2;
    }

    return result;
}

int main() {
    long long n;
    cin >> n;

    Matrix fibonacci{};
    fibonacci[0] = {1, 1};
    fibonacci[1] = {1, 0};
    Matrix result = matrix_power(fibonacci, n);

    cout << result[0][1] << '\n';

    return 0;
}
```

## 코드에서 확인할 부분

- `result`는 처음에 단위행렬이다. 숫자 거듭제곱에서 1이 하는 역할을 행렬에서는 단위행렬이 한다.
- 지수가 홀수일 때만 현재 `base`를 결과에 곱하고, 매 반복마다 `base`는 제곱하고 지수는 절반으로 줄인다.
- `N=0`이면 반복문을 실행하지 않고 단위행렬의 `[0][1]`, 즉 0을 출력한다. 별도 예외 처리 없이 `F(0)`도 다룰 수 있다.
- 두 원소를 곱한 값은 `long long` 범위 안에 들어오며, 더할 때마다 나머지를 취한다.

## 복잡도

- 시간: O(8 × log N) ≈ O(log N) — 2×2 행렬 곱셈이 상수
- 공간: O(1) — 2×2 행렬 몇 개만 사용

*피보나치 점화식을 행렬로 바꾸는 이유는 N번의 계산을 O(log N)번의 행렬 곱셈으로 줄이기 위해서다.*
