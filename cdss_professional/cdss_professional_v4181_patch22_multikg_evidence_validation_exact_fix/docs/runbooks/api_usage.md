# API usage

## Draft a prescription

```bash
curl -X POST http://127.0.0.1:8000/v1/prescriptions/draft \
  -H "Content-Type: application/json" \
  -d @examples/request_demo.json
```

## Validate an existing plan

```bash
curl -X POST http://127.0.0.1:8000/v1/prescriptions/validate \
  -H "Content-Type: application/json" \
  -d '{
    "patient": {
      "patient_id": "p-001",
      "age_years": 30,
      "sex": "female",
      "pregnant": true,
      "known_allergies": []
    },
    "plan": {
      "problem_summary": "symptomatic treatment",
      "medications": [
        {
          "active_ingredient": "ibuprofen",
          "indication": "pain",
          "dose": "400 mg",
          "frequency": "every 8 hours",
          "duration": "3 days",
          "route": "oral"
        }
      ]
    }
  }'
```

## Fetch the audit trace

```bash
curl http://127.0.0.1:8000/v1/prescriptions/audit/<trace_id>
```
