install:
	pip install -e ".[dev]"

run:
	uvicorn apps.api.main:app --reload

test:
	PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 pytest -q

verify:
	python tools/verify_data_integration.py
	python tools/run_professional_validation_suite.py
	python tools/run_patch7_data_driven_evaluation.py

package:
	python tools/package_release.py --root . --output ../cdss_release.zip


.PHONY: test-fast test-safety test-integration test-release
test-fast:
	python -m pytest tests/unit -q

test-safety:
	python -m pytest tests/unit/test_*business* tests/unit/test_*safety* tests/unit/test_*generation* -q

test-integration:
	python -m pytest tests/integration -q

test-release: test-fast test-safety
