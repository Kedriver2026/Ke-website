# Version-bound web onboarding regression checks

Run from the repository root with Node 24:

    node tests/onboarding/test-document-upload.cjs
    node tests/onboarding/test-document-pages.cjs

All requests are mocked. No applicant records, uploads or emails are created.

## Coordinated rollout requirement

Do not deploy these pages before the reviewed backend migration is applied. They
require `drivers.license_document_path`, `insurance_document_path`, and
`registration_document_path`, plus:

    submit_driver_document(p_document_type text, p_object_path text, p_expected_path text)

The last argument is nullable for legacy/unbound records. The RPC must return
`{document_path, review_status}` where status is `pending`, `approved`, or
`attention`; it must validate object ownership and existence, atomically bind the
object to pending review, reject stale previous-path comparisons, and treat a
retry for the current object as idempotent without resetting an approval.

Deploy the matching version-aware admin/mobile readers and protected review RPC
with the backend. Existing unbound approvals must remain explicitly legacy;
never infer that the newest storage filename is the approved document.

The browser preserves a staged object path for retries within the open page.
Refresh/navigation discards that in-memory staging; orphan storage uploads may
require a separately reviewed cleanup policy. No automatic deletion is included.
A missing schema causes the page to disable submission rather than write legacy
review-status fields. Include `driver-document-upload.js` in the site assets.

Before launch, test a new verified applicant, a legacy approved document, a
replacement, stale admin review, and a save-response timeout end-to-end with an
authorized test account. These offline fixtures do not prove the deployed site,
storage policies, session flow, or welcome email works.
