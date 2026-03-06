---
title: "BOJ 1697 — 숨바꼭질 (C++ 풀이)"
description: "1차원 좌표에서 걷기(±1)와 순간이동(×2)을 사용해 최단 시간을 구하는 BFS 문제."
date: 2023-08-14
categories: [Algorithm]
tags: [Algorithm, BFS]
---

## 문제

[BOJ 1697 - 숨바꼭질](https://www.acmicpc.net/problem/1697)

수빈이의 위치 N과 동생의 위치 K가 주어진다. 매 초마다 수빈이는 X-1, X+1, 2×X 중 하나로 이동할 수 있다. 동생을 찾는 최소 시간을 구하라.

## 핵심 포인트

1. **1차원 BFS**: 좌표가 1차원이지만, 이동 방법이 3가지이므로 그래프 탐색으로 모델링한다.
2. **상태 공간**: 0부터 100,000까지의 좌표가 노드, 3가지 이동이 간선이다.
3. BFS로 탐색하면 최초로 K에 도달하는 시점이 최단 시간이다.

## C++ 풀이

```cpp
#include <iostream>
#include <queue>

using namespace std;

int N, K;
bool visit[100001];

void bfs() {
    queue<pair<int, int>> q;
    q.push(make_pair(N, 0));

    while (!q.empty()) {
        pair<int, int> v = q.front();
        q.pop();

        if (v.first == K) {
            cout << v.second;
            return;
        }
        if (v.first < 0 || v.first > 100000) continue;

        if (!visit[v.first]) {
            visit[v.first] = true;
            q.push(make_pair(v.first - 1, v.second + 1));
            q.push(make_pair(v.first + 1, v.second + 1));
            q.push(make_pair(2 * v.first, v.second + 1));
        }
    }
}

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    cin >> N >> K;
    bfs();

    return 0;
}
```

## 풀이 흐름

1. 시작 위치 N을 큐에 넣고 BFS를 시작한다.
2. 각 위치에서 X-1, X+1, 2×X 세 방향으로 탐색한다.
3. 범위를 벗어나는 좌표(0 미만, 100000 초과)는 건너뛴다.
4. K에 도달하면 현재까지의 이동 횟수를 출력한다.

## 주의사항

**범위 체크 순서**: `visit` 배열 접근 전에 범위 체크를 먼저 해야 한다. `2 * v.first`가 100000을 초과할 수 있으므로, 범위를 벗어난 좌표를 큐에 넣고 꺼낼 때 걸러내는 방식으로 처리한다.

**N > K인 경우**: 순간이동(×2)은 앞으로만 갈 수 있다. N이 K보다 크면 뒤로 한 칸씩 걷는 것(X-1)만 가능하므로 답은 N-K다. BFS로도 올바른 답이 나오지만, 이 점을 알면 조기 종료 최적화가 가능하다.

## 복잡도

- 시간: O(N) — 최대 100,001개 좌표를 한 번씩 방문
- 공간: O(N) — visited 배열

*"걷기와 순간이동 중 뭘 선택하지?"라는 탐욕적 고민 대신, 모든 가능성을 BFS로 탐색하면 최적해가 보장된다.*
