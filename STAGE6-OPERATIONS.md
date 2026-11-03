# Arya AI Office — Tahap 6

Dokumen ini memisahkan kemampuan yang tersedia dari konektor yang masih memerlukan konfigurasi pemilik.

## Arsitektur

Telegram owner ID → autentikasi → command center → persistent workflow → bounded meeting → dependency-aware tasks → verified model inference → project-isolated artifacts → evidence quality gate → owner approval.

## Implemented and tested

- Individual agent metadata: role, model policy, capabilities, tools, readiness, project-scoped context, task history, and inference provenance.
- Role prompts for 35 virtual agents. Shared models are reported as shared; sistem tidak mengklaim model independen yang belum dikonfigurasi.
- Real model calls for meeting contributions and workflow stages. Empty, unverified, or unproven model responses are rejected.
- Persistent project memory: brief, assumptions, decisions, revisions, access scope, meetings, tasks, artifacts, quality evidence, and audit.
- Bounded meetings: participant, round, token, duration, transcript, conflict, decision, and assignment limits.
- Task dependencies, cycle detection, missing-prerequisite blocking, retry bounds, completion evidence, and recovery normalization.
- Telegram owner authentication by numeric user ID plus private/bound chat. Operational aliases and inline callbacks execute the same backend command path.
- Risk classification in approval-policy.js: LOW, MEDIUM, HIGH. External publication, deployment, deletion, payment, and sensitive sending remain approval-gated.
- Artifact storage with project isolation, symlink checks, SHA-256 verification, and safe filenames.
- Dashboard metrics: projects, active meetings, failed tasks, model tokens, duration, quality evidence, readiness, artifacts, and audit records.

## Data model

operations.json contains commands, projects, and meetings. Each project contains memory, tasks, collaboration, artifacts, audit, quality, and evaluations. Task records include assignment, objective, requirements, inputs, dependencies, expected outputs, acceptance criteria, priority, retry count, inference provenance, and completion evidence. Secrets remain in encrypted settings storage and are excluded from model context and logs.

## Tool readiness

| Role | Connected tools | Status |
| --- | --- | --- |
| Programmer | model-backed generation, website artifact validation | Available when model is verified |
| Graphic designer | model-backed SVG generation, SVG sanitization, PNG rasterization | Available when model is verified |
| Copywriter | model-backed copy draft | Available when model is verified |
| QA | model review plus static/artifact checks | Available; runtime claims remain explicit |
| Video creator | storyboard and plan artifact | MP4 renderer not connected |
| Social media manager | preparation and approval records | Official publishing adapter not connected |

## Validation

Run npm test, npm run build, npm run check:build, npm run test:workspace, npm run test:hq, and npm run test:a11y. These tests use isolated fixtures and mock providers where external accounts are unavailable. Production Telegram, social publishing, video rendering, deployment, and paid API calls require owner credentials, permissions, budgets, and approval policy.

No Grade 10/10 claim is made. Dashboard scores are evidence-backed workflow evaluations, not an assertion of general model intelligence.
