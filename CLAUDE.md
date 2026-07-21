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

### 독자 우선 원칙
- 기본 독자는 **주제를 처음 접하거나 인접 분야 경험만 있는 개발자**다.
- 첫 2~4문단에서 독자가 겪는 문제, 이 글을 읽을 이유, 읽고 얻는 결과를 먼저 밝힌다.
- 약어·제품명·프레임워크·도메인 용어는 처음 등장할 때 쉬운 말로 정의한다.
- 설명 순서는 `독자의 문제 → 쉬운 말의 원리 → 기술 용어 → 구현 → 결과`를 따른다.
- 공식·코드·아키텍처보다 먼저 작은 입력, 실제 화면, 실패 상황 중 하나를 예로 든다.
- 한 글은 하나의 중심 질문만 다룬다. 독립적인 주제가 두 개면 글을 나눈다.
- 클래스명과 도구명을 섹션 제목으로 나열하지 않는다. 독자가 해결하려는 질문을 제목으로 쓴다.
- 숫자·테스트 수·커밋 수는 의미를 해석할 수 있을 때만 쓴다. 수치 나열로 성과를 대신하지 않는다.
- 사실, 외부 주장, 개인 경험, 추론을 구분한다. 시의성 있는 사실과 벤치마크에는 출처를 붙인다.
- 같은 문장 구조와 고정 섹션 템플릿을 여러 글에 반복하지 않는다.

### 시리즈 포스트
- 제목 패턴: "시리즈명 - N일차" 또는 "시리즈명 - 부제"
- 같은 태그 공유
- 이전 글 내용 참조 시 링크 포함

### 기존 태그 목록 (일관성 유지)
Unity, AI, Flutter, Android, Algorithm, BFS, DFS, Blog, Trading

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
