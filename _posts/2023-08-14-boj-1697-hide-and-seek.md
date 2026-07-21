---
title: "백준 1697번 숨바꼭질 — BFS C++ 풀이"
description: "백준 1697번 숨바꼭질 풀이. 1차원 좌표에서 걷기(±1)와 순간이동(×2)을 간선으로 보는 BFS로 동생까지의 최단 시간을 구하는 C++ 코드와 풀이 과정을 정리한다."
date: 2023-08-14
categories: [Algorithm]
tags: [Algorithm, BFS]
---

## 문제

[BOJ 1697 - 숨바꼭질](https://www.acmicpc.net/problem/1697)

수빈이의 위치 N과 동생의 위치 K가 주어진다. 매 초마다 수빈이는 X-1, X+1, 2×X 중 하나로 이동할 수 있다. 동생을 찾는 최소 시간을 구하라.

좌표가 한 줄이라도 선택지가 세 개라면 단순히 가까워 보이는 방향만 고를 수 없다. 예를 들어 순간이동이 당장은 목표를 지나치더라도, 다시 한 칸 돌아오는 경로가 더 빠를 수 있다. 따라서 좌표 하나를 그래프의 정점으로 보고, 1초에 갈 수 있는 세 좌표를 간선으로 연결한다.

BFS는 0초에 갈 수 있는 위치, 1초에 갈 수 있는 위치, 2초에 갈 수 있는 위치 순서로 탐색한다. 그래서 동생의 좌표를 처음 발견했을 때의 시간이 최소 시간이다.

## 핵심 포인트

1. **1차원 BFS**: 좌표가 1차원이지만, 이동 방법이 3가지이므로 그래프 탐색으로 모델링한다.
2. **상태 공간**: 0부터 100,000까지의 좌표가 노드, 3가지 이동이 간선이다.
3. BFS로 탐색하면 최초로 K에 도달하는 시점이 최단 시간이다.

## C++ 풀이

```cpp
#include <algorithm>
#include <iostream>
#include <queue>

using namespace std;

const int MAX_POSITION = 100000;
int startPosition, targetPosition;
int distanceFromStart[MAX_POSITION + 1];

void bfs() {
    fill(distanceFromStart, distanceFromStart + MAX_POSITION + 1, -1);

    queue<int> q;
    q.push(startPosition);
    distanceFromStart[startPosition] = 0;

    while (!q.empty()) {
        int current = q.front();
        q.pop();

        if (current == targetPosition) {
            cout << distanceFromStart[current];
            return;
        }

        int nextPositions[3] = {current - 1, current + 1, current * 2};
        for (int next : nextPositions) {
            if (next < 0 || next > MAX_POSITION) continue;
            if (distanceFromStart[next] != -1) continue;

            distanceFromStart[next] = distanceFromStart[current] + 1;
            q.push(next);
        }
    }
}

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    cin >> startPosition >> targetPosition;
    bfs();

    return 0;
}
```

## 풀이 흐름

1. 시작 위치를 큐에 넣고 그 위치의 거리를 0으로 기록한다.
2. 각 위치에서 X-1, X+1, 2×X 세 방향으로 탐색한다.
3. 범위를 벗어나거나 이미 더 빠른 시간에 방문한 좌표는 건너뛴다.
4. 목표에 처음 도달하면 거리 배열에 기록된 시간이 정답이다.

## 주의사항

**범위 체크 순서**: 거리 배열에 접근하기 전에 좌표가 0~100,000 안인지 확인해야 한다. 특히 `current * 2`는 상한을 쉽게 넘는다.

**N > K인 경우**: 순간이동(×2)은 앞으로만 갈 수 있다. N이 K보다 크면 뒤로 한 칸씩 걷는 것(X-1)만 가능하므로 답은 N-K다. BFS로도 올바른 답이 나오지만, 이 점을 알면 조기 종료 최적화가 가능하다.

## 복잡도

- 시간: O(N) — 최대 100,001개 좌표를 한 번씩 방문
- 공간: O(N) — visited 배열

*"걷기와 순간이동 중 뭘 선택하지?"라는 탐욕적 고민 대신, 모든 가능성을 BFS로 탐색하면 최적해가 보장된다.*
