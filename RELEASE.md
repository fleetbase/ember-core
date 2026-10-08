> v0.3.26 ~ "The console's realtime socket authenticates with short-lived socket tokens"

---
## Highlights

- **Authenticated realtime socket.** The `socket` service now authenticates its SocketCluster connection with a short-lived socket token from `POST int/v1/socket/token`. ([#97](https://github.com/fleetbase/ember-core/pull/97))
  - The token is delivered in the handshake by an in-memory auth engine. It is never written to `localStorage` or the connection URL.
  - It is refreshed a minute before it expires.
  - After a `deauthenticate`, or a kick-out or failed subscription with an auth reason, the service fetches a new token, re-authenticates and resubscribes the affected channels.
  - It re-authenticates on sign-in and organization switch, and disconnects on sign-out.
  - Channel names are unchanged, and callers of `listen()` and `instance().subscribe()` need no changes.
  - The connection carries a `client` query tag (`console/<version>`) so operators can see which clients still connect without a token.
- **Works with servers that have socket authentication off.** When the token route answers `404`, or no one is signed in, the socket connects anonymously as before.

---
## Upgrading
No changes are needed in extensions. Subscriptions are authorized server-side once an instance turns on socket authentication (`SOCKETCLUSTER_AUTH_ENABLED`, fleetbase/core-api v1.6.69). Handle `subscribeFail` on channels the signed-in user may not be allowed to read.

---
## Need help?
- [GitHub Discussions](https://github.com/fleetbase/fleetbase/discussions)
- [Discord](https://discord.gg/HnTqQ6zAVn)
---
