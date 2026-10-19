# Security and production boundary

## Current guarantee

This repository is a browser-based visualization and paper-trading simulator. It must not receive exchange secrets, wallet private keys, seed phrases or unrestricted webhook credentials.

## Production architecture

- Browser: visualization, signed approvals and read-only status.
- API gateway: authentication, CSRF protection, schema validation and rate limiting.
- Orchestrator: isolated agent execution with per-agent identity and budgets.
- Risk service: independent deployment; every order requires a signed risk approval.
- Execution service: idempotent order state machine and venue allowlist.
- Secrets: managed vault, short-lived credentials and automatic rotation.
- Ledger/audit: append-only durable storage with external checkpoints.

## Required controls before real capital

1. Replace simulated adapters with authenticated backend services.
2. Enforce MFA, RBAC and four-eyes approval for strategy promotion.
3. Keep withdrawal permission disabled on every exchange key.
4. Apply IP and symbol allowlists, daily loss limits and reduce-only emergency mode.
5. Run SAST, dependency scanning, secret scanning and penetration testing.
6. Test kill switches against exchange outage, duplicate messages and delayed fills.
7. Store audit checkpoints outside the primary environment.
8. Complete disaster recovery and rollback exercises.

## Endpoint policy

The UI accepts only local model identifiers or HTTPS hosts explicitly allowed by the backend. User-entered endpoints must never be fetched server-side without DNS/IP revalidation and SSRF controls.
