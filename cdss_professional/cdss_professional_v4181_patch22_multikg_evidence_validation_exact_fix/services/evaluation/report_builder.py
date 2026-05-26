from __future__ import annotations

from statistics import mean


class ReportBuilder:
    """Turns metric dictionaries into a report-friendly structure."""

    def build(self, rows: list[dict[str, object]]) -> dict[str, object]:
        total = len(rows)
        blocked = sum(1 for row in rows if row.get('blocking_safety_issue'))
        meds = [int(row.get('num_medications', 0)) for row in rows]
        avg_stage = [float(row.get('avg_stage_duration_ms', 0.0)) for row in rows]
        return {
            'rows': rows,
            'count': total,
            'blocked_count': blocked,
            'blocked_rate': round((blocked / total), 3) if total else 0.0,
            'avg_num_medications': round(mean(meds), 2) if meds else 0.0,
            'avg_stage_duration_ms': round(mean(avg_stage), 2) if avg_stage else 0.0,
        }
