#!/bin/bash
# Stop Hook: 포스트 품질 검사 + 셀프 체크 리마인더
# 이번 세션에서 수정된 _posts/*.md 파일의 front matter를 검증

TMPFILE=$(mktemp)
cat > "$TMPFILE"

# 무한 루프 방지
if grep -q '"stop_hook_active"' "$TMPFILE" 2>/dev/null; then
  STOP_ACTIVE=$(sed -n 's/.*"stop_hook_active" *: *\([a-z]*\).*/\1/p' "$TMPFILE" | head -1)
  if [ "$STOP_ACTIVE" = "true" ]; then
    rm -f "$TMPFILE"
    exit 0
  fi
fi

rm -f "$TMPFILE"

LOG_FILE="$CLAUDE_PROJECT_DIR/.claude/edit-log.txt"

# edit-log가 없으면 검사할 것이 없음
if [ ! -f "$LOG_FILE" ]; then
  exit 0
fi

# 수정된 _posts 파일 목록 추출 (백슬래시를 슬래시로 정규화, 중복 제거)
POST_FILES=$(sed 's|\\\\|/|g; s|\\|/|g' "$LOG_FILE" 2>/dev/null | grep '_posts/' | sed -n 's/.*\([^ ]*_posts\/[^ ]*\).*/\1/p' | sort -u)

if [ -z "$POST_FILES" ]; then
  # edit-log 초기화
  > "$LOG_FILE"
  exit 0
fi

ERRORS=""
VALID_CATEGORIES="Dev Project Algorithm Daily Essay"

for FILE in $POST_FILES; do
  # 파일 존재 확인
  if [ ! -f "$FILE" ]; then
    continue
  fi

  BASENAME=$(basename "$FILE")

  # Front matter 추출 (--- 사이의 내용)
  FRONT_MATTER=$(sed -n '/^---$/,/^---$/p' "$FILE" | head -50)

  if [ -z "$FRONT_MATTER" ]; then
    ERRORS="${ERRORS}\n- [$BASENAME] front matter(---)가 없습니다."
    continue
  fi

  # 필수 필드 검사
  for FIELD in title description date categories tags; do
    if ! echo "$FRONT_MATTER" | grep -q "^${FIELD}:"; then
      ERRORS="${ERRORS}\n- [$BASENAME] 필수 필드 '${FIELD}'가 없습니다."
    fi
  done

  # 카테고리 유효성 검사
  CATEGORY=$(echo "$FRONT_MATTER" | grep '^categories:' | sed -n 's/.*\[\([^]]*\)\].*/\1/p' | tr -d ' ')
  if [ -n "$CATEGORY" ]; then
    FOUND=0
    for VALID in $VALID_CATEGORIES; do
      if [ "$CATEGORY" = "$VALID" ]; then
        FOUND=1
        break
      fi
    done
    if [ "$FOUND" = "0" ]; then
      ERRORS="${ERRORS}\n- [$BASENAME] 카테고리 '$CATEGORY'는 허용되지 않습니다. (허용: $VALID_CATEGORIES)"
    fi
  fi

  # 파일명 형식 검사 (YYYY-MM-DD-*.md)
  if ! echo "$BASENAME" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}-.+\.md$'; then
    ERRORS="${ERRORS}\n- [$BASENAME] 파일명이 YYYY-MM-DD-slug.md 형식이 아닙니다."
  fi
done

# 결과 출력
if [ -n "$ERRORS" ]; then
  REASON=$(printf "[품질 검사 실패] 수정된 포스트에서 다음 문제가 발견되었습니다:%b\n\n위 문제를 수정한 후 다시 완료하세요." "$ERRORS")
  # JSON 이스케이프
  ESCAPED=$(echo "$REASON" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')
  echo "{\"decision\":\"block\",\"reason\":\"$ESCAPED\"}"
else
  cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": "[셀프 체크 리마인더] 포스트 기본 검증 통과. 추가로 확인하세요:\n- description이 50-160자로 충분히 구체적인가?\n- 태그가 기존 포스트와 일관되는가?\n- 코드 블록에 언어가 지정되었는가?\n- 글 마지막에 이탤릭 한 줄 요약이 있는가?"
  }
}
EOF
fi

# edit-log 초기화 (다음 세션을 위해)
> "$LOG_FILE"
