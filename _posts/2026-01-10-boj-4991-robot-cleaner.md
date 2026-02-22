---
title: "BOJ 4991 — 로봇 청소기 (C++ 풀이)"
description: "BFS로 각 지점 간 최단 거리를 구한 뒤, 순열 완전 탐색으로 최적 방문 순서를 찾는 풀이."
date: 2026-01-10
categories: [Algorithm]
tags: [Algorithm, BFS]
---

## 문제

[BOJ 4991 - 로봇 청소기](https://www.acmicpc.net/problem/4991)

W×H 방에 로봇 청소기와 더러운 칸들이 있을 때, 모든 더러운 칸을 방문하는 최소 이동 횟수를 구하는 문제다.

## 핵심 아이디어

1. 더러운 칸이 최대 10개이므로, **모든 방문 순서를 순열로 탐색**할 수 있다.
2. 먼저 BFS로 로봇 위치와 각 더러운 칸에서 다른 모든 지점까지의 **최단 거리**를 구한다.
3. 순열 완전 탐색으로 모든 방문 순서를 시도하고 최소 이동 횟수를 찾는다.
4. 어떤 더러운 칸에 도달할 수 없으면 -1을 출력한다.

## 풀이

```cpp
#define INF 401
#include <iostream>
#include <queue>
#include <vector>

using namespace std;

struct NODE {
    int x, y, depth = 0;
    bool operator<(const NODE& rhs) const {
        return this->depth < rhs.depth;
    }
};

int dirX[4] = {1, 0, -1, 0};
int dirY[4] = {0, 1, 0, -1};
int dist[401][21][21];
bool visit[401];
int arr[401];

void initialize(int (*dist)[21], int sx, int sy) {
    for (int y = 0; y < sy; y++)
        for (int x = 0; x < sx; x++)
            dist[y][x] = INF;
}

void findShortestRoute(char (*room)[21], int (*dist)[21],
                       NODE start, int w, int h) {
    priority_queue<NODE> q;
    dist[start.y][start.x] = 0;
    q.push(start);

    while (!q.empty()) {
        NODE c = q.top(); q.pop();

        for (int i = 0; i < 4; i++) {
            NODE next = {c.x + dirX[i], c.y + dirY[i], c.depth + 1};
            if (next.x < 0 || next.x >= w ||
                next.y < 0 || next.y >= h) continue;
            if (room[next.y][next.x] == 'x') continue;

            if (dist[next.y][next.x] > next.depth) {
                dist[next.y][next.x] = next.depth;
                q.push(next);
            }
        }
    }
}

int getOptimizeRoute(vector<NODE> places, int depth) {
    int n = places.size();

    if (n == depth) {
        int sum = 0;
        for (int i = 0; i < n - 1; i++) {
            int c = arr[i];
            int ni = arr[i + 1];
            NODE next = places[ni];
            int d = dist[c][next.y][next.x];
            if (d == INF) return -1;
            sum += d;
        }
        return sum;
    }

    int ret = 401 * 401 + 1;

    for (int i = 0; i < n; i++) {
        if (visit[i]) continue;
        visit[i] = true;
        arr[depth] = i;
        ret = min(ret, getOptimizeRoute(places, depth + 1));
        visit[i] = false;
    }

    return ret;
}

int main() {
    while (true) {
        int w, h;
        cin >> w >> h;
        if (w == 0 && h == 0) break;

        char room[21][21];
        int placeCount = 0;
        vector<NODE> places;

        for (int i = 0; i < h; i++) {
            for (int j = 0; j < w; j++) {
                cin >> room[i][j];
                if (room[i][j] == 'o' || room[i][j] == '*') {
                    places.push_back({j, i});
                    initialize(dist[placeCount++], w, h);
                }
            }
        }

        for (int i = 0; i < placeCount; i++) {
            findShortestRoute(room, dist[i], places[i], w, h);
        }

        cout << getOptimizeRoute(places, 0) << endl;
    }

    return 0;
}
```

## 주요 포인트

- 로봇 위치(`o`)와 더러운 칸(`*`)을 모두 `places`에 넣고 각각에서 BFS를 수행한다.
- 순열 탐색에서 `arr[]`에 방문 순서를 기록하고, `dist[arr[i]][places[arr[i+1]]]`로 거리를 합산한다.
- 더러운 칸이 최대 10개이므로 순열 탐색(11!)은 시간 내에 충분히 동작한다.

## 복잡도

- 시간: O(K × W × H + K!) — K: 더러운 칸 수(최대 10)
- 공간: O(K × W × H)

*BFS 전처리 + 순열 완전 탐색, 작은 K 제약을 활용하는 문제다.*
