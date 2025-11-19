const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const userSessions = require('./userSessions');
const sheetService = require('./sheetService');

// Check if all environment variables are set
if (!config.TELEGRAM_BOT_TOKEN || !config.ALLOWED_CHAT_ID) {
    console.error('Missing required environment variables!');
    console.log('Please set:');
    console.log('- TELEGRAM_BOT_TOKEN');
    console.log('- ALLOWED_CHAT_ID');
    console.log('- SHEET_API_URL (optional for testing)');
    process.exit(1);
}

// Initialize bot
const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });

console.log('🤖 Travel Business Telegram Bot Started on Glitch!');

// Utility functions
function getCurrentDateTime() {
    const now = new Date();
    const date = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    
    return {
        date: `${date}/${month}/${year}`,
        time: `${hours} - ${minutes}`
    };
}

function isAllowedChat(chatId) {
    return chatId.toString() === config.ALLOWED_CHAT_ID.toString();
}

function sendNotAllowedMessage(chatId) {
    bot.sendMessage(chatId, '❌ You are not authorized to use this bot.');
}

// Start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!isAllowedChat(chatId)) {
        return sendNotAllowedMessage(chatId);
    }

    const welcomeMessage = 'မဂ်လာပါ MGY မှကြိုဆိုပါတယ်။ သင့်ရဲ့ Data တွေကို တင်နိုင်ပါပြီ။';
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'တင်မယ်', callback_data: 'new_post' }]
            ]
        }
    };

    bot.sendMessage(chatId, welcomeMessage, options);
});

// New post command
bot.onText(/\/newpost/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!isAllowedChat(chatId)) {
        return sendNotAllowedMessage(chatId);
    }

    // Delete existing session if any
    userSessions.deleteSession(chatId);
    
    // Create new session
    userSessions.createSession(chatId);
    
    bot.sendMessage(chatId, 'Driver နာမည် ထည့်သွင်းပါ။');
});

// Delete command
bot.onText(/\/delete/, (msg) => {
    const chatId = msg.chat.id;
    
    if (!isAllowedChat(chatId)) {
        return sendNotAllowedMessage(chatId);
    }

    userSessions.deleteSession(chatId);
    bot.sendMessage(chatId, 'ပယ်ဖျက်ခြင်း အောင်မြင်ပါသည်');
});

// Handle callback queries (button clicks)
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (!isAllowedChat(chatId)) {
        return sendNotAllowedMessage(chatId);
    }

    try {
        switch (data) {
            case 'new_post':
                userSessions.deleteSession(chatId);
                userSessions.createSession(chatId);
                await bot.sendMessage(chatId, 'Driver နာမည် ထည့်သွင်းပါ။');
                break;

            case 'confirm_yes':
                await handlePostConfirmation(chatId, true);
                break;

            case 'confirm_no':
                userSessions.deleteSession(chatId);
                await bot.sendMessage(chatId, 'ပယ်ဖျက်ခြင်းအောင်မြင်ပါသည်။');
                break;

            case 'retry':
                await handlePostConfirmation(chatId, true);
                break;

            case 'delete_data':
                userSessions.deleteSession(chatId);
                await bot.sendMessage(chatId, 'ပယ်ဖျက်ခြင်း အောင်မြင်ပါသည်');
                break;
        }

        // Answer callback query to remove loading state
        await bot.answerCallbackQuery(callbackQuery.id);
    } catch (error) {
        console.error('Error handling callback:', error);
        await bot.sendMessage(chatId, 'Error occurred: ' + error.message);
    }
});

// Handle text messages
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Ignore command messages and messages from unauthorized users
    if (msg.text.startsWith('/') || !isAllowedChat(chatId)) {
        return;
    }

    const session = userSessions.getSession(chatId);
    if (!session) {
        return bot.sendMessage(chatId, 'Please start with /start command');
    }

    try {
        switch (session.step) {
            case 'driver_name':
                userSessions.updateSessionData(chatId, { driverName: text });
                userSessions.updateSession(chatId, { step: 'from_location' });
                await bot.sendMessage(chatId, 'စတင်ထွက်ခွာသည့်နေရာကို ထည့်သွင်းပါ။');
                break;

            case 'from_location':
                userSessions.updateSessionData(chatId, { fromLocation: text });
                userSessions.updateSession(chatId, { step: 'to_location' });
                await bot.sendMessage(chatId, 'သွားမည့်နေရာကို ထည့်သွင်းပါ။');
                break;

            case 'to_location':
                userSessions.updateSessionData(chatId, { toLocation: text });
                userSessions.updateSession(chatId, { step: 'amount' });
                await bot.sendMessage(chatId, 'ခရီးအတွက် ကျသင့်ငွေကို ထည့်သွင်းပါ။');
                break;

            case 'amount':
                userSessions.updateSessionData(chatId, { amount: text });
                await showConfirmation(chatId);
                break;

            default:
                await bot.sendMessage(chatId, 'Please use /start to begin');
        }
    } catch (error) {
        console.error('Error processing message:', error);
        await bot.sendMessage(chatId, 'Error occurred: ' + error.message);
    }
});

// Show confirmation with collected data
async function showConfirmation(chatId) {
    const sessionData = userSessions.getSessionData(chatId);
    const datetime = getCurrentDateTime();

    const confirmationMessage = 
        `ဤအချက်အလက်များကို တင်မည်။\n\n` +
        `Driver အမည် - ${sessionData.driverName}\n` +
        `နေ့ရက် - ${datetime.date}\n` +
        `အချိန် - ${datetime.time}\n` +
        `စတင်ထွက်ခွာသည့်နေရာ - ${sessionData.fromLocation}\n` +
        `သွားမည့်နေရာ - ${sessionData.toLocation}\n` +
        `ကျသင့်ငွေ - ${sessionData.amount}`;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'No🚫', callback_data: 'confirm_no' }, { text: 'Yes✅', callback_data: 'confirm_yes' }]
            ]
        }
    };

    await bot.sendMessage(chatId, confirmationMessage, options);
}

// Handle post confirmation
async function handlePostConfirmation(chatId, shouldPost) {
    if (!shouldPost) {
        userSessions.deleteSession(chatId);
        return;
    }

    const sessionData = userSessions.getSessionData(chatId);
    const formattedData = sheetService.formatData(sessionData);

    console.log('Posting data to sheet:', formattedData);

    try {
        const result = await sheetService.postData(formattedData);

        if (result.success) {
            userSessions.deleteSession(chatId);
            
            const successOptions = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'New Post', callback_data: 'new_post' }]
                    ]
                }
            };
            
            await bot.sendMessage(chatId, 'Post တင်ခြင်းအောင်မြင်ပါသည်', successOptions);
        } else {
            const errorOptions = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '♻ Retry', callback_data: 'retry' }, { text: '🗑 Delete', callback_data: 'delete_data' }]
                    ]
                }
            };
            
            await bot.sendMessage(chatId, `Post တင်ခြင်း မအောင်မြင်ပါ။\nError : ${result.error}`, errorOptions);
        }
    } catch (error) {
        console.error('Error posting to sheet:', error);
        
        const errorOptions = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '♻ Retry', callback_data: 'retry' }, { text: '🗑 Delete', callback_data: 'delete_data' }]
                ]
            }
        };
        
        await bot.sendMessage(chatId, `Post တင်ခြင်း မအောင်မြင်ပါ။\nError : ${error.message}`, errorOptions);
    }
}

// Error handling
bot.on('error', (error) => {
    console.error('Telegram Bot Error:', error);
});

bot.on('polling_error', (error) => {
    console.error('Polling Error:', error);
});

// Keep alive for Glitch


const keepAlive = require('./refresh');

setInterval(() => {
    console.log('🤖 Bot is running...');
}, 60000);
