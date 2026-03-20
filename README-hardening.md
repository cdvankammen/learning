Repository hardening checklist

- Ensure no secrets in repo
- Add .gitignore for sensitive files
- Ensure CI does not echo secrets
- Ensure scripts default to dry-run where deletion is involved
- Add logging and rotation for session-files
- Code linting configured (ESLint)
- Add release-draft generation and signed releases in CI when enabled
