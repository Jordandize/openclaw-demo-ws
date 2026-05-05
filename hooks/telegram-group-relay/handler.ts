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
  console.log(`[telegram-group-relay] event received type=${event.type} action=${event.action}`);

  if (event.type !== "message" || event.action !== "sent") {
    console.log(`[telegram-group-relay] skip: not a message:sent event`);
    return;
  }

  const ctx = event.context ?? {};
  console.log(`[telegram-group-relay] ctx.channelId=${ctx.channelId} ctx.channel=${ctx.channel} ctx.to=${ctx.to}`);

  if (ctx.channelId !== "telegram") {
    console.log(`[telegram-group-relay] skip: channelId "${ctx.channelId}" !== "telegram"`);
    return;
  }

  // Only watch the configured demo group.
  const to = String(ctx.to ?? "");
  if (to !== cfg.groupId) {
    console.log(`[telegram-group-relay] skip: to "${to}" !== groupId "${cfg.groupId}"`);
    return;
  }

  // Identify the sending agent (the bot account behind this post).
  const fromAccount: AgentId | undefined = ctx.metadata?.accountId;
  console.log(`[telegram-group-relay] fromAccount=${fromAccount} metadata=${JSON.stringify(ctx.metadata)}`);
  if (!fromAccount || !(fromAccount in cfg.botUsernames)) {
    console.log(`[telegram-group-relay] skip: fromAccount "${fromAccount}" not in botUsernames ${JSON.stringify(Object.keys(cfg.botUsernames))}`);
    return;
  }

  const content: string = ctx.content ?? "";
  console.log(`[telegram-group-relay] content="${content.slice(0, 120)}"`);

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
  if (!recipient) {
    console.log(`[telegram-group-relay] skip: no managed-bot @-mention found in content`);
    return;
  }

  console.log(`[telegram-group-relay] relaying from ${fromAccount} to ${recipient}`);

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
  console.log(`[telegram-group-relay] hop ${hops}/${cfg.maxHops} for turn=${turnId}`);

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
  console.log(`[telegram-group-relay] spawned openclaw agent --agent ${recipient} (pid=${child.pid})`);
};

export default handler;
