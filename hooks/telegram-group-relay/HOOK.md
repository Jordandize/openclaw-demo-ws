---
name: telegram-group-relay
description: "Relay agent-to-agent messages inside one Telegram group, since Telegram refuses bot-to-bot delivery."
metadata:
  {
    "openclaw": {
      "emoji": "📡",
      "events": ["message:sent"],
      "requires": { "bins": ["node"] }
    }
  }
---

# telegram-group-relay

Watches outbound Telegram posts to the configured demo group. When an
OpenClaw-managed bot's post addresses another OpenClaw-managed bot via
@-mention, the hook injects the same content into the addressee's
session as if Telegram had delivered it. This is the only way three
bots can hold a chained conversation in one Telegram group, because
Telegram refuses to deliver messages between bots.

## Configuration (env)

| Variable | Required | What |
| --- | --- | --- |
| `OPENCLAW_DEMO_GROUP_ID` | yes | Negative chat id of the group, e.g. "-5267353148". |
| `OPENCLAW_DEMO_BOT_USERNAMES` | yes | JSON object: `{"boss":"kostiasbossbot","gala":"kostiasgalabot","buck":"kostiasbuckbot"}`. |
| `OPENCLAW_DEMO_MAX_HOPS` | no | Hop cap per user trigger. Default 6. |

Set these in `openclaw.json` under
`hooks.internal.entries.telegram-group-relay.env`.

## Loop guards

- Hop cap: max 6 relays per user trigger by default.
- One-recipient relay: only the **first** managed-bot @-mention in a
  post is relayed, never multiple.
- Self-suppression: never relay a post back to the agent that sent it.
- End-of-chain: a post with no managed-bot @-mention ends the chain.
