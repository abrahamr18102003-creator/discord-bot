// deploy-commands.js
require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('invitaciones')
    .setDescription('Muestra cuántas invitaciones tienes en este servidor'),
  new SlashCommandBuilder()
    .setName('topinvitaciones')
    .setDescription('Muestra el top de usuarios con más invitaciones en el servidor')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registrando comandos en el guild...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Comandos registrados ✅');
  } catch (err) {
    console.error('Error registrando comandos:', err);
  }
})();