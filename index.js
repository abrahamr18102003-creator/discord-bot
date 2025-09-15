// index.js
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require("discord.js");
const Database = require("@replit/database");
const express = require('express');

const db = new Database();

// coloca esto arriba del todo, junto con tus imports y db
function parseInviteRecord(record) {
  if (record == null) return 0;

  // número puro
  if (typeof record === 'number') return record;

  // string: puede ser "5" o JSON
  if (typeof record === 'string') {
    // intento parse JSON
    try {
      const parsed = JSON.parse(record);
      return parseInviteRecord(parsed);
    } catch (e) {
      const n = parseInt(record);
      return isNaN(n) ? 0 : n;
    }
  }

  // objeto: intento leer propiedades comunes
  if (typeof record === 'object') {
    const keys = ['count', 'invites', 'value', 'cantidad', 'total'];
    for (const k of keys) {
      if (record[k] != null) {
        const v = record[k];
        if (typeof v === 'number') return v;
        if (typeof v === 'string' && !isNaN(parseInt(v))) return parseInt(v);
      }
    }
    // fallback: buscar cualquier valor numérico dentro del objeto
    for (const v of Object.values(record)) {
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && !isNaN(parseInt(v))) return parseInt(v);
    }
  }

  return 0;
}

// keepalive + manejo global de errores
const app = express();

app.get('/', (req, res) => res.send('Bot funcionando ✅'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Keepalive escuchando en puerto ${port}`));

// Manejo global de errores para que quede algo en logs
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
});

// ---- CONFIG ----
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID; // pon tu client ID en secrets
const GUILD_ID = process.env.GUILD_ID;   // si quieres registrar slash commands solo en 1 server

// ---- PALABRAS PROHIBIDAS ----
const BAD_WORDS_RAW = ["estafador", "rata", "ladrón", "ladron"];
const normalize = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const BAD_WORDS = BAD_WORDS_RAW.map(w => normalize(w));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    // GatewayIntentBits.GuildMessages,     // Descomenta para moderación
    // GatewayIntentBits.MessageContent,    // Descomenta para moderación  
    // GatewayIntentBits.GuildMembers,      // Descomenta para moderación
  ],
});

// ---- SLASH COMMANDS ----
const commands = [
  new SlashCommandBuilder()
    .setName("invitaciones")
    .setDescription("Muestra cuántas invitaciones tienes"),
  new SlashCommandBuilder()
    .setName("topinvitaciones")
    .setDescription("Muestra el top de invitaciones del servidor"),
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

// ---- Registrar comandos ----
(async () => {
  try {
    console.log("Registrando comandos...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log("✅ Comandos registrados.");
  } catch (error) {
    console.error(error);
  }
})();

// ---- EVENTOS ----
client.on("ready", () => {
  console.log(`✅ Bot listo: ${client.user.tag}`);
});

// --- Manejo de comandos ---
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "invitaciones") {
    let record = await db.get(`invites:${interaction.guild.id}:${interaction.user.id}`);
    let invites = parseInviteRecord(record);

    await interaction.reply(`${interaction.user}, tienes **${invites}** invitaciones.`);
  }

  if (interaction.commandName === "topinvitaciones") {
    await interaction.deferReply();

    try {
      // Traemos todas las llaves de las invitaciones en este servidor
      let keys = await db.list(`invites:${interaction.guild.id}:`);
      console.log("Keys returned from db.list:", keys, "Type:", typeof keys);
      
      // Manejo robusto de diferentes tipos de respuesta
      if (!keys || !Array.isArray(keys)) {
        keys = [];
      }
      
      let data = [];

      for (let key of keys) {
        let record = await db.get(key);
        let count = parseInviteRecord(record); // usar la función robusta
        let userId = key.split(":")[2]; // el ID del usuario está en la key
        data.push({ userId, count });
      }

      // Ordenamos de mayor a menor
      data.sort((a, b) => b.count - a.count);

      // Tomamos los 5 primeros
      let top = data.slice(0, 5)
                    .map((x, i) => `#${i + 1} <@${x.userId}> → ${x.count}`)
                    .join("\n");

      await interaction.editReply(`🏆 **Top Invitaciones:**\n${top || "Nadie aún"}`);
    } catch (err) {
      console.error("Error en topinvitaciones:", err);
      await interaction.editReply("⚠️ Error al obtener el ranking de invitaciones.");
    }
  }
});

// --- Detección de palabras prohibidas ---
// DESACTIVADO: Requiere intents especiales en Discord Developer Portal
/*
client.on("messageCreate", async message => {
  try {
    if (message.author.bot) return;
    if (!message.guild) return;

    const text = normalize(message.content);
    const found = BAD_WORDS.some(w => new RegExp(`\\b${w}\\b`, "i").test(text));
    if (!found) return;

    const guildId = message.guild.id;
    const userId = message.author.id;
    const key = `warns:${guildId}:${userId}`;
    let warns = (await db.get(key)) || 0;
    warns++;
    await db.set(key, warns);

    // borrar mensaje si puede
    message.delete().catch(() => {});

    if (warns === 1) {
      await message.channel.send(`${message.author}, ⚠️ Advertencia (1/3). Reincidir = muteo.`);
    } else if (warns === 2) {
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (member && member.moderatable) {
        await member.timeout(60 * 60 * 1000, "Reincidencia: palabras prohibidas");
        await message.channel.send(`${message.author}, ⏳ Silenciado 1 hora por reincidir.`);
      }
    } else if (warns >= 3) {
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (member && member.bannable) {
        await member.ban({ reason: "Uso repetido de insultos" });
        await message.channel.send(`🚫 ${message.author.tag} baneado permanentemente.`);
        await db.delete(key);
      }
    }
  } catch (err) {
    console.error("Error en moderación:", err);
  }
});
*/

client.login(TOKEN);