#!/bin/bash
# UserPromptSubmit Hook: 블로그 관련 작업 시 매뉴얼 확인 리마인더

TMPFILE=$(mktemp)
cat > "$TMPFILE"

# sed로 prompt 추출 (grep -P 미지원 환경 대응)
PROMPT=$(sed -n 's/.*"prompt" *: *"\([^"]*\)".*/\1/p' "$TMPFILE" | head -1)

rm -f "$TMPFILE"

# 블로그 관련 키워드 검사
if echo "$PROMPT" | grep -qiE '포스트|블로그|글.*작성|글.*쓰|post|blog|_posts|게시글|시리즈'; then
  cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "[매뉴얼 확인] 블로그 관련 작업이 감지되었습니다. CLAUDE.md의 '포스트 작성 규칙'을 반드시 확인하세요: 파일명 형식, Front Matter 필수 항목, 카테고리 제한, 작성 스타일, 기존 태그 목록."
  }
}
EOF
else
  echo '{}'
fi
