from services.llm.qwen_provider import shared_transformers_status


def test_shared_transformers_status_is_importable_without_loading_model():
    status = shared_transformers_status()
    assert "cache_currsize" in status
    assert "process_id" in status
    assert "actual_load_count_this_process" in status
