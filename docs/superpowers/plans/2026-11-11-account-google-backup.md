# SciRun account schedule and Google backup

## Scope

- Keep the approved Aurora Teal interface and all existing workout history.
- Match the number of selected weekdays to the chosen 2, 3, or 4 workouts per week. Preserve legacy profiles by keeping the subset the current scheduler already used.
- Open Account > Program by default, remove repeated weekday badges, and show the next five workout dates without rest-day rows.
- Remove palette selection from Settings while retaining compatibility with existing version 2 JSON backups.
- Add native Google account access to private Drive `appDataFolder` snapshots. Keep local storage and the manual JSON export/import path.

## Implementation order

1. Update the Account and Settings UI and add focused mobile checks.
2. Add native Android Google identity and Drive access behind a Capacitor plugin. Keep client IDs and signing material outside source control; the repository may contain only example configuration.
3. Add the common web controller: validate each snapshot with the existing backup parser, list immutable copies, save only complete local state, and restore through the existing transactional import path after explicit confirmation.
4. Prepare the equivalent iOS plugin source for a future Capacitor iOS project. It cannot be integrated or compiled in this Windows checkout, which has no `ios/` platform.
5. Verify affected Node tests, mobile browser flows, web packaging, and Android Java compilation when dependencies and OAuth configuration permit; publish only the verified changes to the existing draft PR.

## Data protection

- Never replace a cloud snapshot in place. Each upload creates a new file.
- Never upload a blank, corrupt, or unreadable state, or a state with an active timer or pending feedback.
- Never restore cloud data during a live workout or pending feedback. Parse and validate before any write, show both local and remote history counts, and preserve the current local state through the pre-import rollback copy.
- Keep cloud backup opt-in until the first explicit save or restore. Once opted in, queue changes while offline and upload after connectivity returns. Resetting local data does not delete Drive copies.
