# addon-watchlist

Monitor specific players on your FiveM server. Add players to a watchlist via their profile modal. Watched players are automatically marked on the Playerlist on Connecting. The dashboard widget shows recent activiy logs.

## Setup

Before using the addon, add a Player Tag in **Settings → Player Tags**:

| Field    | Value          |
| -------- | -------------- |
| ID       | `watched`  |
| Label    | `On Watchlist` |
| Color    | use a Brighter Color |
| Priority | `1`            |

Admins using the addon need fxPanel admin permissions:
- `players.reports` to view watchlist data and activity
- `players.warn` to add/remove players from watchlist
- `all_permissions` to clear the activity log
- `all_permissions` also works as an override
