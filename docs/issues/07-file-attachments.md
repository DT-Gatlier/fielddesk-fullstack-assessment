## What to build

Implement the atomic `storage_used_bytes` counter. Build upload and download API endpoints securing files by UUID. Build the Ant Design upload UI.

## Acceptance criteria

- [ ] Files are stored on disk with safe UUID identifiers; original filenames are not trusted.
- [ ] Uploads fail if the organisation's quota is exceeded (implemented safely against race conditions).
- [ ] Users can securely download their organisation's files.
- [ ] Local filesystem paths are never exposed through the API.
- [ ] Users cannot access files belonging to other organisations.

## Blocked by

- docs/issues/02-core-crud.md
