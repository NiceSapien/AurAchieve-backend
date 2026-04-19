# Orphan Memory Files Cleanup (Deno)
This is optional if you're self hosting. You can set this up to automatically remove files that aren't connected to any memory. Most self-hosted instances **don't** need this.


This function deletes storage files that are:
- created within the last 6 hours,
- but older than 30 minutes,
- and not referenced by any memory created in the last 6 hours.

## Runtime
Use Deno runtime in Appwrite Functions.

## Entry Point
Set entrypoint to `index.ts`.

## Required Environment Variables
- `MEMORYLANES_DATABASE_ID`
- `MEMORYLANES_STORAGE_BUCKET_ID`
- `MEMORYLANES_ENCRYPTION_KEY` (optional, used for backward compatibility with older encrypted file IDs. you almost certainly don't need this.)

## Appwrite Runtime Auth (Preferred)
This function prefers Appwrite's runtime temporary credentials automatically:
- `APPWRITE_FUNCTION_API_ENDPOINT`
- `APPWRITE_FUNCTION_PROJECT_ID`
- `APPWRITE_FUNCTION_API_KEY`

No manual `APPWRITE_API_KEY` is needed when those are available.

Fallback (for local testing only):
- `APPWRITE_ENDPOINT`
- `APPWRITE_PROJECT_ID`
- `APPWRITE_API_KEY`

## Schedule
Set the schedule to run every 3 hours(recommended):

`0 */3 * * *`

## Notes
- The function scans all collections inside `MEMORYLANES_DATABASE_ID` (your per-user memory collections).
- It checks only memories from the last 6 hours for references.
- File IDs from older encrypted records are handled via best-effort decrypt fallback.
