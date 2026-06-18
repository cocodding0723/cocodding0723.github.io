---
title: "GitHub Actions + OIDC로 AWS 비밀번호 없는 배포 파이프라인 구축하기"
description: "GitHub Actions와 OIDC로 AWS access key 없는 CD 파이프라인을 구축한 기록. Terraform으로 IAM OIDC 신뢰 정책을 코드화하고 web/api/terraform-apply/Mobile OTA 네 워크플로를 순서대로 올렸다."
date: 2026-05-20
categories: [Project]
tags: [AWS, CI/CD, Terraform]
---

deal-link는 화주와 대리점을 연결하는 물류 중개 플랫폼이다. 웹(React), 앱(React Native), API(NestJS)를 모노레포 하나에서 관리하고, 인프라는 AWS 위에 Terraform으로 정의되어 있다. 지금까지 배포는 수동 또는 임시 스크립트로 처리했다. 오늘은 그 부분을 완전히 자동화한 기록이다.

---

## 왜 OIDC인가

기존 방식의 문제는 단순하다. **IAM access key를 GitHub Secrets에 박아두는 것**은 위험하다.

- key는 만료되지 않으므로 유출되면 즉시 권한 탈취 가능
- rotation을 수동으로 해야 하고, 까먹으면 그대로 묵혀진다
- 키가 여러 레포에 복사되면 관리 포인트가 늘어난다

GitHub Actions의 OIDC(OpenID Connect) 연동은 이 문제를 구조적으로 해결한다. GitHub이 워크플로 실행 시 **단명(short-lived) JWT 토큰**을 발급하고, AWS는 이 토큰을 검증해서 IAM 역할을 assume한다. 실제 credential은 워크플로 실행 중 몇 분만 살아있고, 저장되지 않는다.

```text
GitHub Actions runner
  │
  │ 1. OIDC JWT 요청 (ACTIONS_ID_TOKEN_REQUEST_URL)
  ▼
GitHub OIDC Provider
  │
  │ 2. 서명된 JWT 반환
  ▼
GitHub Actions runner
  │
  │ 3. AssumeRoleWithWebIdentity 호출
  ▼
AWS STS
  │
  │ 4. JWT 검증 (발급자, audience, sub 조건)
  ▼
IAM Role (deallink-dev-gha)
  │
  │ 5. 임시 credential 발급 (만료 시간 포함)
  ▼
배포 작업 수행
```

---

## Terraform으로 OIDC 인프라 코드화

구성의 핵심은 `infra/terraform/modules/iam-oidc/main.tf`에 있다. OIDC provider 등록과 신뢰 정책 연결을 한 모듈로 묶었다.

### OIDC Provider 등록

```hcl
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = [
    "sts.amazonaws.com"
  ]

  # AWS STS는 2023년부터 thumbprint를 자체 검증하므로
  # 값은 placeholder로 유지해도 동작한다
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd"
  ]
}
```

### IAM Role 및 신뢰 정책

```hcl
data "aws_iam_policy_document" "github_assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    actions = ["sts:AssumeRoleWithWebIdentity"]

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:cocodding0723/deal-link:*",
        "repo:cocodding0723/<infra-repo>:*"
      ]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name               = "deallink-dev-gha"
  assume_role_policy = data.aws_iam_policy_document.github_assume_role.json
}
```

처음에는 `sub` 조건을 `StringEquals`로 설정해서 특정 브랜치(`ref:refs/heads/main`)만 허용했다. 그러다 PR 브랜치에서 `terraform plan`을 미리 실행할 필요가 생겼고, `StringLike`로 변경해서 와일드카드로 레포 전체를 허용했다.

이 신뢰 정책에 두 개의 레포를 등록했다. 애플리케이션 레포(`deal-link`) 외에 인프라 레포가 별도로 있어서, 두 곳 모두에서 OIDC를 통해 역할을 assume할 수 있도록 `sub` 조건에 각각 추가했다.

---

## GitHub Actions 워크플로

워크플로에서 OIDC를 사용하려면 `permissions` 블록이 반드시 필요하다. 이 줄이 빠지면 토큰 요청 자체가 실패한다.

```yaml
permissions:
  id-token: write   # OIDC JWT 요청 권한
  contents: read
```

### 웹 배포 (deploy-web)

```yaml
name: Deploy Web

on:
  push:
    branches: [main]
    paths:
      - "apps/web/**"

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/deallink-dev-gha
          aws-region: ap-northeast-2

      - name: Build
        run: |
          cd apps/web
          npm ci
          npm run build

      - name: Deploy to S3 + CloudFront invalidation
        run: |
          aws s3 sync apps/web/dist s3://${{ secrets.WEB_BUCKET }} --delete
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CF_DISTRIBUTION_ID }} \
            --paths "/*"
```

### API 배포 (deploy-api)

API는 ECS Fargate에 올라간다. Docker 이미지를 빌드해서 ECR에 푸시하고, ECS 서비스를 rolling update로 교체한다.

```yaml
- name: Configure AWS credentials (OIDC)
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/deallink-dev-gha
    aws-region: ap-northeast-2

- name: Login to ECR
  id: ecr-login
  uses: aws-actions/amazon-ecr-login@v2

- name: Build and push Docker image
  run: |
    IMAGE_URI=${{ steps.ecr-login.outputs.registry }}/deallink-api:${{ github.sha }}
    docker build -t $IMAGE_URI apps/api
    docker push $IMAGE_URI
    echo "image=$IMAGE_URI" >> $GITHUB_OUTPUT

- name: Deploy to ECS
  run: |
    aws ecs update-service \
      --cluster deallink-dev \
      --service api \
      --force-new-deployment
```

### Terraform Apply

`terraform apply`는 인프라 레포의 워크플로에서 처리한다. PR이 열리면 `plan`만 실행하고, main 브랜치 머지 후에만 `apply`가 실행되도록 조건을 걸었다.

```yaml
- name: Terraform Apply
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  run: terraform apply -auto-approve
  working-directory: infra/terraform
```

### Mobile OTA (EAS Update)

모바일은 빌드를 새로 올리는 것이 아니라 Expo EAS OTA 업데이트를 사용한다. JS 번들만 교체하므로 앱스토어 심사 없이 배포가 가능하다.

```yaml
- name: Publish EAS Update
  run: |
    npx eas-cli update \
      --branch production \
      --message "Deploy ${{ github.sha }}"
  env:
    EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
```

---

## 트러블슈팅

### 1. `sub` 조건 형식

OIDC로 처음 전환할 때 가장 많이 실수하는 지점이다. GitHub Actions의 `sub` 클레임은 다음 형식이다.

```
repo:{owner}/{repo}:ref:refs/heads/{branch}
```

특정 브랜치만 허용하려면 `StringEquals`로 `ref:refs/heads/main`을 박으면 된다. 그러나 PR 브랜치나 feature 브랜치에서도 plan을 미리 실행해야 한다면 `StringLike`로 `repo:cocodding0723/deal-link:*` 패턴을 쓰는 것이 맞다. 두 레포를 모두 허용할 때는 `values` 배열에 각각 추가한다.

### 2. `permissions` 블록 위치

GitHub Actions에서 `id-token: write`는 **OIDC 토큰을 요청할 수 있는 권한**이다. 이 줄이 없으면 `configure-aws-credentials` action이 토큰 요청 단계에서 바로 실패한다. workflow 레벨에 선언했더라도 job 레벨에서 별도의 `permissions` 블록을 선언하면 workflow 설정이 덮어씌워지므로 `id-token: write`를 job 레벨 블록에도 명시해야 한다.

### 3. Playwright E2E — 31/41 PASS

`dev.deallink.link`에 올린 후 Playwright로 E2E를 돌렸는데 31/41이 나왔다. 10건의 실패는 분석 중이다. 크게 두 가지 패턴으로 보인다.

- 비동기 상태 로딩 타이밍 문제
- 모바일 뷰포트에서 특정 버튼이 스크롤 영역 밖에 걸리는 문제

ShipperApply 화면의 품목 추가 스크롤 버그와 연관된 케이스가 있어서, 해당 UI 수정과 함께 다시 돌릴 예정이다.

### 4. Metro — Node.js v24 호환 문제 (미해결)

에뮬레이터에서 앱을 실행하면 Metro가 Node.js v24에서 오류를 낸다. 번들링이 정상적으로 완료되지 않아 UI 렌더링까지 도달하지 못했다. Metro의 v24 공식 지원 여부를 확인 중이며, 이 이슈는 현재 열려 있다.

---

## 결과

네 가지 워크플로가 모두 green이다.

| 워크플로 | 대상 | 상태 |
|----------|------|------|
| deploy-web | S3 + CloudFront | 성공 |
| deploy-api | ECS Fargate | 성공 |
| terraform-apply | AWS 인프라 | 성공 |
| Mobile OTA | EAS Update (production) | 성공 |

QA 지표는 다음과 같다.

| 항목 | 결과 |
|------|------|
| 병렬 에이전트 코드 레벨 검증 | 13/13 PASS |
| Playwright E2E (dev) | 31/41 PASS (10건 분석 중) |
| API 단위 테스트 | 652/652 PASS |
| EAS OTA 배포 | 성공 |

---

## 이 구조의 장점과 한계

**장점**

- IAM access key가 어디에도 저장되지 않는다. GitHub Secrets에는 `AWS_ACCOUNT_ID`만 있으면 충분하고, key rotation이 필요 없다.
- Terraform 모듈로 OIDC 설정이 코드화되어 있어서, 신규 레포를 추가할 때 `sub` 조건에 한 줄 추가하면 된다.
- 워크플로마다 `role-to-assume`을 분리하면 최소 권한 원칙을 role 단위로 적용할 수 있다. 지금은 하나의 역할이지만, 프로덕션으로 갈 때 web-deploy/api-deploy/infra-apply를 역할로 분리할 예정이다.

**한계**

- 현재 `deallink-dev-gha` 역할의 권한이 넓다. 빠르게 올리는 것을 우선했고, 최소 권한으로 조이는 작업은 프로덕션 전환 시점에 같이 처리할 계획이다.
- Playwright 커버리지가 아직 완전하지 않다. 화주/대리점 플로우의 핵심 경로는 녹색이지만, 엣지 케이스와 모바일 뷰포트 테스트가 남아있다.

---

## 다음 단계

1. IAM 역할을 기능별로 분리 (web/api/infra 각각)
2. Playwright 31/41 → 41/41 완성 (10건 원인 분석 후)
3. 프로덕션 환경 워크플로 추가 (dev → staging → prod 순차 배포)
4. Node.js v24 Metro 공식 지원 릴리즈 이후 `.nvmrc` 업데이트

---

*IAM access key를 GitHub Secrets에 박는 방식에서 OIDC로 넘어가는 순간, 배포 파이프라인에서 "유효 기간 없는 credential"이 완전히 사라진다.*
