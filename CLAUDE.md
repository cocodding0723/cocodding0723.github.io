# 블로그 프로젝트 가이드

## 프로젝트 개요
- Jekyll 기반 포트폴리오 & 기술 블로그
- URL: https://cocodding0723.github.io
- 작성자: 강찬형
- 배포: master 브랜치 push → GitHub Pages 자동 배포

## 포스트 작성 규칙

### 파일명
- 형식: `YYYY-MM-DD-slug-title.md`
- 위치: `_posts/`
- 슬러그: 영문 소문자, 하이픈 구분

### Front Matter (필수)
```yaml
---
title: "제목 (한국어)"
description: "카드와 SEO에 사용되는 간단 설명 (50-160자)"
date: YYYY-MM-DD
categories: [카테고리]
tags: [태그1, 태그2, ...]
---
```

### 카테고리 (하나만 선택)
| 카테고리 | 용도 |
|----------|------|
| Dev | 개발 기술 정리, TIL, 튜토리얼 |
| Project | 프로젝트 개발 과정, 회고 |
| Algorithm | 알고리즘 풀이 |
| Daily | 일상, 잡담 |
| Essay | 장문 분석 |

### 작성 스타일
- 한국어로 작성
- 경어체 사용하지 않음 (다, 이다 체)
- 기술 용어는 영문 그대로 사용
- 코드 블록에 언어 지정 필수 (```csharp, ```yaml 등)
- 이미지: `/assets/images/` 하위에 저장
- 글 마지막에 이탤릭으로 한 줄 요약

### 시리즈 포스트
- 제목 패턴: "시리즈명 - N일차" 또는 "시리즈명 - 부제"
- 같은 태그 공유
- 이전 글 내용 참조 시 링크 포함

### 기존 태그 목록 (일관성 유지)
Unity, AI, Flutter, Android, Algorithm, BFS, DFS, Blog

## 빌드 & 배포
- 로컬 테스트: `bundle exec jekyll serve`
- 빌드: `bundle exec jekyll build`
- 배포: master 브랜치 push → GitHub Pages 자동 배포

## 프로젝트 구조
```
_posts/       → 블로그 포스트 (마크다운)
_layouts/     → 레이아웃 (default, post, blog)
_includes/    → 컴포넌트 파셜 (header, footer, post-card 등)
_data/        → YAML 데이터 (skills, projects, timeline, certifications)
_sass/        → SCSS 스타일시트 (_variables, _post, _blog 등)
assets/       → CSS, JS, 이미지
  css/main.scss → 컴파일 진입점
  js/main.js    → 네비게이션, 필터링, 애니메이션
  images/       → 포스트/프로젝트 이미지
blog/index.html → 블로그 목록 페이지
index.html      → 포트폴리오 홈페이지
_config.yml     → Jekyll 설정
```

## 에이전트 활용
- `.claude/agents/blog-writer.md` — 포스트 초안 작성
- `.claude/agents/blog-reviewer.md` — 포스트 품질 검토
- `.claude/agents/blog-publisher.md` — SEO/메타데이터 최적화
