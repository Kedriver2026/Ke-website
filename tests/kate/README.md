# KatE customer-service validation

Run local integration checks from the website repository root using Node 24 or newer:

```
node tests/kate/test-delivery-workflows.cjs
node tests/kate/test-photo-server.cjs
node tests/kate/test-conversation-and-intake.cjs
node tests/kate/test-contact-server.cjs
```

These tests use simulated providers and records. They verify verification boundaries, complete photo sets, contextual acknowledgements, explicit save consent, retry deduplication, and English/Spanish contact collection. They do not create passenger requests or send messages.

`scenarios.json` contains 100 synthetic customer conversations across ten groups. `run_simulations.py` calls the live conversational endpoint with synthetic messages, paces requests below its rate limit, and saves replies for review. It does not call the contact-saving endpoint. Live runs incur model usage and should only run when authorized.

```
python tests/kate/run_simulations.py --output /absolute/path/results.json
```

`baseline_review.json` records the 33 cases selected for targeted rechecks after reviewing all 100 replies. `regression_scenarios.json` includes those cases, all explicit contact preferences, and twelve comfort/urgency scenarios. Automatic flags are screening checks; the full replies also need human review for truthful capabilities, unnecessary offers, tone, and relevance.

Email/callback requests are saved in the existing admin Passenger Updates inbox only after confirmation. K&E staff handle actual correspondence. The chatbot does not send emails, place calls, close cases, or promise response times.

## Durable 1000-scenario review

The KatE 1000 conversation review workflow evaluates 1000 distinct message/history combinations against the live AI endpoint, with 4.2 seconds between launches and at most three requests in flight. These are contextual response evaluations, not 1000 complete multi-turn passenger sessions. Local workflow tests separately check verification, photo sets and consent behavior with synthetic providers.

Results are uploaded every 100 cases and retained for 30 days. Screening flags require manual review; workflow completion does not mean all replies are correct. No passenger records, contact saves, calls or emails are created. Live model usage requires authorization.
