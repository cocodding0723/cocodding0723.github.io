---
title: "BOJ 10830 — 행렬 제곱 (C++ 풀이)"
description: "분할 정복으로 행렬 거듭제곱을 O(N^3 log B)에 수행하는 풀이. 행렬 곱셈 연산자 오버로딩으로 코드를 깔끔하게 구성한다."
date: 2025-04-07
categories: [Algorithm]
tags: [Algorithm, Math]
---

## 문제

[BOJ 10830 - 행렬 제곱](https://www.acmicpc.net/problem/10830)

N×N 행렬 A가 주어졌을 때, A^B를 1,000으로 나눈 나머지를 구하는 문제다. B는 최대 100,000,000,000.

## 핵심 아이디어

1. B가 최대 10^11이므로 단순 반복 곱셈으로는 불가능하다.
2. **분할 정복 거듭제곱**: A^B = (A^(B/2))^2 × (B가 홀수면 A 한 번 더 곱함).
3. `*` 연산자를 오버로딩하여 행렬 곱셈을 자연스럽게 표현한다.

## 풀이

```cpp
#include <iostream>

using namespace std;

struct Matrix {
    int m[6][6];
    int size;

    static Matrix identity(int size) {
        Matrix ret;
        for (int i = 0; i < size; i++)
            for (int j = 0; j < size; j++)
                ret.m[i][j] = 1;
        return ret;
    }

    Matrix operator*(Matrix rhs) {
        Matrix ret;
        for (int i = 0; i < size; i++)
            for (int j = 0; j < size; j++)
                ret.m[i][j] = 0;

        for (int i = 0; i < size; i++) {
            for (int j = 0; j < size; j++) {
                for (int k = 0; k < size; k++) {
                    ret.m[i][j] += this->m[i][k] * rhs.m[k][j];
                }
                ret.m[i][j] %= 1000;
            }
        }

        ret.size = this->size;
        return ret;
    }

    void print() {
        for (int i = 0; i < size; i++) {
            for (int j = 0; j < size; j++) {
                cout << this->m[i][j] << ' ';
            }
            cout << endl;
        }
    }
};

Matrix square(Matrix m, long long sqr) {
    if (sqr == 0) return Matrix::identity(m.size);
    if (sqr == 1) return m;

    Matrix a = square(m, sqr / 2);
    if (sqr % 2 != 0) {
        return a * a * m;
    } else {
        return a * a;
    }
}

int main() {
    int n;
    long long b;
    Matrix m;

    cin >> n >> b;

    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            cin >> m.m[i][j];
            m.m[i][j] %= 1000;
        }
    }

    m.size = n;

    Matrix ret = square(m, b);
    ret.print();

    return 0;
}
```

## 주요 포인트

- 입력 시 `m.m[i][j] %= 1000`을 해야 한다. 1000의 배수가 입력될 수 있다.
- 구조체에 `operator*`를 오버로딩하면 `a * a * m`처럼 직관적으로 작성 가능하다.
- B = 0인 경우 단위 행렬을 반환해야 한다.

## 복잡도

- 시간: O(N^3 × log B) — 행렬 곱셈 O(N^3) × 분할 정복 O(log B)
- 공간: O(N^2 × log B) — 재귀 스택

*분할 정복 거듭제곱의 행렬 버전, 정수 거듭제곱과 동일한 원리다.*
