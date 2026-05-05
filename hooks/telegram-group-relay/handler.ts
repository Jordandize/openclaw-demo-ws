import { spawn } from "node:child_process";

type AgentId = string;

interface Cfg {
  groupId: string;
  botUsernames: Record<AgentId, string>;
  maxHops: number;
}

const cfg: Cfg = {
  groupId: process.env.OPENCLAW_DEMO_GROUP_ID ?? "",
  botUsernames: JSON.parse(
    process.env.OPENCLAW_DEMO_BOT_USERNAMES ?? "{}"
  ) as Record<AgentId, string>,
  maxHops: Number(process.env.OPENCLAW_DEMO_MAX_HOPS ?? "6"),
};

// Hop counter scoped to the originating user message id.
const hopCounter = new Map<string, number>();

const turnIdFor = (event: any): string =>
  String(
    event.context?.metadata?.rootMessageId ??
      event.sessionKey ??
      "unknown"
  );

const handler = async (event: any): Promise<void> => {
  if (event.type !== "message" || event.action !== "sent") return;

  const ctx = event.context ?? {};
  if (ctx.channelId !== "telegram") return;

  // Only watch the configured demo group.
  const to = String(ctx.to ?? "");
  if (to !== cfg.groupId) return;

  // Identify the sending agent (the bot account behind this post).
  const fromAccount: AgentId | undefined = ctx.metadata?.accountId;
  if (!fromAccount || !(fromAccount in cfg.botUsernames)) return;

  const content: string = ctx.content ?? "";

  // Find the first managed-bot @-mention that isn't the sender.
  let recipient: AgentId | null = null;
  for (const [agentId, username] of Object.entries(cfg.botUsernames)) {
    if (agentId === fromAccount) continue;
    const tag = `@${username}`.toLowerCase();
    if (content.toLowerCase().includes(tag)) {
      recipient = agentId;
      break;
    }
  }

  // No mention → chain ends naturally (BOSS's final wrap-up).
  if (!recipient) return;

  // Hop cap.
  const turnId = turnIdFor(event);
  const hops = (hopCounter.get(turnId) ?? 0) + 1;
  if (hops > cfg.maxHops) {
    console.warn(
      `[telegram-group-relay] hop cap (${cfg.maxHops}) hit for turn=${turnId}; dropping relay to ${recipient}`
    );
    return;
  }
  hopCounter.set(turnId, hops);

  // Wake the recipient agent and deliver its reply back to the group.
  // --agent          which agent to run
  // --message        GALA/BOSS's post (full text, so recipient has context)
  // --deliver        post the response back to a channel
  // --reply-account  use the recipient's own bot account to post
  // --reply-channel  target channel
  // --reply-to       target chat (the group id)
  const senderHandle = cfg.botUsernames[fromAccount];
  const injected = `(via @${senderHandle} in the group)\n\n${content.trim()}`;

  const child = spawn(
    "openclaw",
    [
      "agent",
      "--agent", recipient,
      "--message", injected,
      "--deliver",
      "--reply-account", recipient,
      "--reply-channel", "telegram",
      "--reply-to", cfg.groupId,
    ],
    { detached: true, stdio: "ignore" }
  );
  child.unref();
};

export default handler;
