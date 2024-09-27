const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const { Configuration, OpenAIApi } = require('openai');
const axios = require('axios');
const config = require('./config.json');

// Initialize OpenAI API
const openai = new OpenAIApi(new Configuration({ apiKey: config.openaiApiKey }));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

// Helper function to send logs to a webhook
async function sendLog(webhookUrl, content) {
    try {
        await axios.post(webhookUrl, { content });
    } catch (error) {
        console.error(`Failed to send log to webhook: ${error.message}`);
    }
}

// Setup slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all commands'),
    new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Chat with ChatGPT')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('Your question')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('grammarcheck')
        .setDescription('Check the grammar of a text')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Text to check')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('translate')
        .setDescription('Translate text to English')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('Text to translate')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('info')
        .setDescription('Show bot information, owner, and GitHub page'),
    new SlashCommandBuilder()
        .setName('uptime')
        .setDescription('Show bot uptime')
];

// Register the commands with Discord
client.on('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(config.token);
    await rest.put(
        Routes.applicationGuildCommands(client.user.id, config.guildId),
        { body: commands.map(command => command.toJSON()) }
    );
    console.log('Commands registered.');
});

// Command handlers
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName, user, options } = interaction;

    // Log the user interaction
    const interactionLog = `User: ${user.tag} (ID: ${user.id})\nCommand: /${commandName}\nOptions: ${JSON.stringify(options.data)}`;
    await sendLog(config.interactionWebhookUrl, `**User Interaction Log**\n${interactionLog}`);

    try {
        if (commandName === 'help') {
            const helpEmbed = new EmbedBuilder()
                .setColor(0x3498db)
                .setTitle('Help - List of Commands')
                .setDescription('Here are the available commands:')
                .addFields(
                    { name: '/ask [question]', value: 'Chat with ChatGPT.' },
                    { name: '/grammarcheck [text]', value: 'Check the grammar of a text.' },
                    { name: '/translate [text]', value: 'Translate text to English.' },
                    { name: '/info', value: 'Show bot information, owner, and GitHub page.' },
                    { name: '/uptime', value: 'Show bot uptime.' }
                )
                .setFooter({ text: 'Bot by [Your Name]', iconURL: client.user.displayAvatarURL() });

            await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
        } else if (commandName === 'ask') {
            const question = interaction.options.getString('question');
            const response = await openai.createCompletion({
                model: 'text-davinci-003',
                prompt: question,
                max_tokens: 150
            });
            await interaction.reply(response.data.choices[0].text.trim());
        } else if (commandName === 'grammarcheck') {
            const text = interaction.options.getString('text');
            const response = await axios.post('https://api.textgears.com/grammar', null, {
                params: {
                    text: text,
                    key: config.textGearsApiKey
                }
            });
            const errors = response.data.errors;
            if (errors.length > 0) {
                const errorMessage = errors.map(err => `Error: ${err.bad} (${err.better.join(', ')})`).join('\n');
                await interaction.reply(`Grammar errors:\n${errorMessage}`);
            } else {
                await interaction.reply('No grammar errors found!');
            }
        } else if (commandName === 'translate') {
            const text = interaction.options.getString('text');
            const response = await axios.get('https://api.mymemory.translated.net/get', {
                params: {
                    q: text,
                    langpair: 'auto|en'
                }
            });
            const translatedText = response.data.responseData.translatedText;
            await interaction.reply(`Translated text: ${translatedText}`);
        } else if (commandName === 'info') {
            await interaction.reply({
                content: `Bot Name: ${client.user.username}\nOwner: ${config.owner}\nGitHub: ${config.githubUrl}`
            });
        } else if (commandName === 'uptime') {
            const uptimeSeconds = process.uptime();
            const hours = Math.floor(uptimeSeconds / 3600);
            const minutes = Math.floor((uptimeSeconds % 3600) / 60);
            const seconds = Math.floor(uptimeSeconds % 60);

            await interaction.reply(`Uptime: ${hours}h ${minutes}m ${seconds}s`);
        }
    } catch (error) {
        console.error(error);
        // Log the error to the error webhook
        await sendLog(config.errorWebhookUrl, `**Error Log**\nCommand: /${commandName}\nError: ${error.message}`);
        await interaction.reply('An error occurred while processing your command.');
    }
});

// Log in to Discord
client.login(config.token);
