---
title: "백준 11401번 이항 계수 3 — 페르마 소정리 C++ 풀이"
description: "백준 11401번 이항 계수 3 풀이. 페르마 소정리로 모듈러 역원을 구해 C(N, K) mod p를 계산하고 팩토리얼 전처리와 분할 정복 거듭제곱을 쓰는 C++ 코드와 풀이 과정을 정리한다."
date: 2025-07-19
categories: [Algorithm]
tags: [Algorithm, Math]
---

## 문제

[BOJ 11401 - 이항 계수 3](https://www.acmicpc.net/problem/11401)

N과 K가 최대 4,000,000일 때 이항 계수 C(N, K)를 1,000,000,007로 나눈 나머지를 구하는 문제다.

보통 이항 계수는 `N! / (K! × (N-K)!)`로 계산한다. 문제는 나머지 연산 안에서는 정수 나눗셈을 그대로 쓸 수 없다는 점이다. 예를 들어 나머지만 남겨 둔 분모를 나눈다고 해서 원래 분수의 나머지가 보존되지 않는다.

그래서 나눗셈을 “곱했을 때 1이 되는 수”와의 곱셈으로 바꾼다. 이 수를 **모듈러 역원**이라고 한다. 나누는 수와 모듈러 값이 서로소이고, 여기처럼 모듈러 값이 소수라면 페르마 소정리로 역원을 빠르게 구할 수 있다.

## 핵심 아이디어

1. C(N, K) = N! / (K! × (N-K)!)인데, 나눗셈은 모듈러 연산에서 직접 사용할 수 없다.
2. **페르마 소정리**: p가 소수일 때 a^(p-1) ≡ 1 (mod p)이므로, a^(-1) ≡ a^(p-2) (mod p).
3. 따라서 `N! × (K!)^(p-2) × ((N-K)!)^(p-2) mod p`로 계산한다.
4. 팩토리얼을 미리 전처리하고, 거듭제곱은 분할 정복으로 O(log p)에 수행한다.

## 풀이

```cpp
#include <iostream>

using namespace std;

const int MOD = 1e9 + 7;
long long f[4000001];

long long mod_pow(long long base, long long exponent) {
    long long result = 1;

    while (exponent > 0) {
        if (exponent % 2 == 1) result = result * base % MOD;
        base = base * base % MOD;
        exponent /= 2;
    }

    return result;
}

void fac() {
    f[0] = 1;

    for (int i = 1; i <= 4000000; i++) {
        f[i] = f[i - 1] * i % MOD;
    }
}

int main() {
    int n, k;

    cin >> n >> k;

    fac();

    long long denominator = f[k] * f[n - k] % MOD;
    long long ret = f[n] * mod_pow(denominator, MOD - 2) % MOD;

    cout << ret << endl;

    return 0;
}
```

## 주요 포인트

- `mod_pow(denominator, MOD - 2)`가 분모 전체의 모듈러 역원이다.
- 이 코드는 팩토리얼 조회는 O(1), 역원 계산은 O(log MOD)다. 여러 쿼리를 처리한다면 역팩토리얼까지 미리 계산해 쿼리당 O(1)로 줄일 수 있다.

## 복잡도

- 시간: O(N + log P) — 팩토리얼 전처리 O(N) + 거듭제곱 O(log P)
- 공간: O(N)

*모듈러 역원과 페르마 소정리, 정수론 문제의 필수 테크닉이다.*
