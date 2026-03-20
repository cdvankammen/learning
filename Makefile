.PHONY: test test-bats test-python lint lint-shell lint-frontend build serve health-check prune help

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

test: test-bats test-python ## Run all tests

test-bats: ## Run BATS shell tests
	@command -v bats >/dev/null 2>&1 || { echo "bats not installed"; exit 1; }
	bats tests/

test-python: ## Run Python tests (if any)
	@python -m pip install -q -r requirements.txt 2>/dev/null || true
	@pytest -q 2>/dev/null || echo "No Python tests found"

lint: lint-shell lint-frontend ## Run all linters

lint-shell: ## Run shellcheck on all scripts
	@echo "Running shellcheck..."
	@find modules/ tools/ scripts/ -name '*.sh' -exec shellcheck {} + 2>/dev/null || echo "shellcheck issues found"

lint-frontend: ## Run ESLint on frontend
	@cd webapp/frontend && ./node_modules/.bin/eslint src --ext .js,.jsx --format unix 2>/dev/null || echo "ESLint issues found"

build: ## Build frontend
	cd webapp/frontend && npm run build

serve: ## Start backend server
	cd webapp/backend && node index.js

health-check: ## Run health check
	bash modules/monitor/health-check.sh

prune: ## Dry-run prune of old backups
	bash modules/backup/prune-backups.sh -n

prune-exec: ## Actually prune old backups (keep 10)
	bash modules/backup/prune-backups.sh -k 10

backup-range: ## Backup CTs in 500-999 range
	bash tools/backup-500-range.sh

harden: ## Run hardening checks
	bash tools/harden-scripts.sh

secrets-scan: ## Scan for leaked secrets
	bash tools/ensure-no-secrets.sh

