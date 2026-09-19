from trust404.benchmark import run_benchmark


def test_benchmark_measures_complete_log_and_detects_four_attacks():
    result = run_benchmark(3)
    assert result["requests"] == 3
    assert result["entries"] == 6
    assert result["proof_bytes"] > 0
    assert result["verification_seconds"] >= 0
    assert result["normal_verified"] is True
    assert result["attacks_detected"] == 4
    assert result["attacks_total"] == 4
