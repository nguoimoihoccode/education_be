# Official assessment import implementation

**Goal** — Import one official Word exam and key as a teacher-reviewed version, then match student work to that version before grading.

**Architecture** — Use signed storage and durable Assessment jobs for upload and import. The Node worker invokes a deterministic DOCX parser through the authenticated Python service, validates the result and persists a draft. The React assessment workspace keeps the existing review and publication flow.

1. Implement and verify the Python parser against bounded DOCX inputs, merged marking tables and OMML equations. Test the supplied file locally without adding it to Git.
2. Wire upload, seal, enqueue, job status and version persistence. Keep import job and write fences scoped to school, assessment and asset. Reuse a completed import with the same source and exam code.
3. Compare printed questions, ordered choices and statements before grading. Preserve evidence on mismatch and require teacher confirmation for ambiguous or incomplete evidence.
4. Connect the teacher form and the existing key editor. Use the existing review panel for exceptions and keep the preview branch free of live calls.
5. Run parser, backend, PostgreSQL and frontend checks. Leave runtime activation for staging with private storage and approved credentials.

The parser uses the private Python HTTP service for this release so that import runs through the existing Node job lease. Moving ownership of the import job itself to the standalone Python worker is a separate rollout.
