test:
	python -m pip install -r requirements.txt || true
	pytest -q
