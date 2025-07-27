const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

require("dotenv").config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const BASE_URL = "https://www.magticom.ge/ru/sakvirveli";

// Настройка Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

if (!BOT_TOKEN) {
  console.error("❌ ОШИБКА: BOT_TOKEN не найден в переменных окружения!");
  process.exit(1);
}

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ ОШИБКА: Не настроены переменные Supabase!");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

let botData = {
  subscribers: [],
  groupChats: [],
  lastCheckedNumber: 262,
  lastFoundNumber: 262,
  isMonitoring: false,
};

// Создание таблицы в Supabase (выполнится автоматически)
async function initSupabase() {
  try {
    // Проверяем существование записи
    const { data, error } = await supabase
      .from("bot_settings")
      .select("*")
      .single();

    if (error && error.code === "PGRST116") {
      // Записи нет, создаем
      const { error: insertError } = await supabase
        .from("bot_settings")
        .insert({
          id: 1,
          subscribers: botData.subscribers,
          group_chats: botData.groupChats,
          last_checked_number: botData.lastCheckedNumber,
          last_found_number: botData.lastFoundNumber,
          is_monitoring: botData.isMonitoring,
        });

      if (insertError) {
        console.error("❌ Ошибка создания записи:", insertError);
      } else {
        console.log("✅ Создана начальная запись в Supabase");
      }
    }
  } catch (error) {
    console.error("❌ Ошибка инициализации Supabase:", error);
  }
}

// Загрузка данных из Supabase
async function loadData() {
  try {
    const { data, error } = await supabase
      .from("bot_settings")
      .select("*")
      .single();

    if (error) {
      console.error("⚠️ Ошибка загрузки из Supabase:", error);
      return;
    }

    if (data) {
      botData = {
        subscribers: data.subscribers || [],
        groupChats: data.group_chats || [],
        lastCheckedNumber: data.last_checked_number || 262,
        lastFoundNumber: data.last_found_number || 262,
        isMonitoring: data.is_monitoring || false,
      };

      console.log("📂 Данные загружены из Supabase");
      console.log(`👥 Подписчиков: ${botData.subscribers.length}`);
      console.log(`💬 Групп: ${botData.groupChats.length}`);
    }
  } catch (error) {
    console.error("⚠️ Ошибка загрузки данных из Supabase:", error.message);
  }
}

// Сохранение данных в Supabase
async function saveData() {
  try {
    const { error } = await supabase
      .from("bot_settings")
      .update({
        subscribers: botData.subscribers,
        group_chats: botData.groupChats,
        last_checked_number: botData.lastCheckedNumber,
        last_found_number: botData.lastFoundNumber,
        is_monitoring: botData.isMonitoring,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) {
      console.error("⚠️ Ошибка сохранения в Supabase:", error);
    } else {
      console.log("💾 Данные сохранены в Supabase");
    }
  } catch (error) {
    console.error("⚠️ Ошибка сохранения данных в Supabase:", error.message);
  }
}

// Периодическое сохранение данных (каждые 5 минут)
setInterval(() => {
  saveData();
}, 5 * 60 * 1000);

// Сохраняем данные при выходе из процесса
process.on("SIGINT", async () => {
  console.log("🛑 Получен сигнал остановки, сохраняем данные...");
  await saveData();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("🛑 Получен сигнал завершения, сохраняем данные...");
  await saveData();
  process.exit(0);
});

// Здесь продолжается весь остальной код бота...
// (все функции checkPageExists, extractTitle, extractContent, etc. остаются без изменений)

async function checkPageExists(pageNumber) {
  try {
    const url = `${BASE_URL}${pageNumber}`;
    console.log(`🔍 Проверяем страницу: ${url}`);

    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const isValidPromoPage =
      response.data.includes("Чудо") ||
      response.data.includes("акци") ||
      response.data.includes("предложени");

    return {
      exists: response.status === 200 && isValidPromoPage,
      url: url,
      title: extractTitle(response.data),
      content: extractContent(response.data),
    };
  } catch (error) {
    console.log(`❌ Страница ${pageNumber} недоступна: ${error.message}`);
    return { exists: false, url: `${BASE_URL}${pageNumber}` };
  }
}

function extractTitle(html) {
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (h1Match) {
    return h1Match[1].replace(/<[^>]*>/g, "").trim();
  }

  return "Новая акция от Magticom";
}

function extractContent(html) {
  try {
    let extractedContent = [];

    console.log('📄 Ищем блок id="article" и извлекаем тарифы...');

    const articleMatch = html.match(/<div[^>]*id="article"[^>]*>(.*?)<\/div>/s);

    if (articleMatch) {
      const articleHTML = articleMatch[1];
      console.log("✅ Блок article найден, ищем li элементы внутри...");

      const listItems = articleHTML.match(/<li[^>]*>(.*?)<\/li>/gi);

      if (listItems && listItems.length > 0) {
        console.log(
          `📋 Найдено ${listItems.length} li элементов в блоке article`
        );

        for (const item of listItems) {
          const cleanText = item
            .replace(/<[^>]*>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          if (
            cleanText.length > 10 &&
            (cleanText.includes("Интернет") ||
              cleanText.includes("МБ") ||
              cleanText.includes("MB") ||
              cleanText.includes("Мин") ||
              cleanText.includes("безлимитные")) &&
            /-\s*\d+/.test(cleanText)
          ) {
            extractedContent.push(cleanText);
          }
        }
      }
    }

    if (extractedContent.length === 0) {
      const anyListItems = html.match(/<li[^>]*>(.*?)<\/li>/gi);
      if (anyListItems && anyListItems.length > 0) {
        for (const item of anyListItems) {
          if (item.includes("icon-gel")) {
            const cleanText = item
              .replace(/<[^>]*>/g, "")
              .replace(/&nbsp;/g, " ")
              .replace(/\s+/g, " ")
              .trim();

            if (cleanText.length > 5 && cleanText.length < 200) {
              extractedContent.push(cleanText);
            }
          }
        }
      }
    }

    if (extractedContent.length > 0) {
      const uniqueContent = [...new Set(extractedContent)];
      return uniqueContent.join("\n• ");
    }

    return "Новая акция доступна на сайте!";
  } catch (error) {
    console.error("❌ Ошибка извлечения контента:", error.message);
    return "Новая акция доступна на сайте!";
  }
}

async function checkForNewPromotions() {
  console.log("🕐 Начинаем проверку новых акций...");

  const maxChecks = 5;
  let foundNew = false;

  for (let i = 1; i <= maxChecks; i++) {
    const pageNumber = botData.lastFoundNumber + i;
    const result = await checkPageExists(pageNumber);

    if (result.exists) {
      console.log(`🎉 НАЙДЕНА НОВАЯ АКЦИЯ: страница ${pageNumber}`);

      botData.lastFoundNumber = pageNumber;
      await saveData();

      await notifySubscribers(pageNumber, result);
      foundNew = true;
    } else {
      console.log(
        `❌ Страница ${pageNumber} не найдена, останавливаем проверку`
      );
      botData.lastCheckedNumber = pageNumber;
      break;
    }
  }

  if (!foundNew) {
    console.log("ℹ️ Новых акций пока нет");
  }

  await saveData();
}

async function notifySubscribers(pageNumber, pageData) {
  const promoText =
    pageData.content !== "Новая акция доступна на сайте!"
      ? `\n📋 *Детали акции:*\n• ${pageData.content}`
      : "";

  const message = `🎉 *НОВАЯ АКЦИЯ ОТ MAGTICOM!*

📝 *${pageData.title}*${promoText}

🔗 [Перейти к акции](${pageData.url})

⏰ Найдено: ${new Date().toLocaleString("ru-RU", {
    timeZone: "Asia/Tbilisi",
  })}`;

  const totalRecipients =
    botData.subscribers.length + botData.groupChats.length;
  console.log(`📨 Отправляем уведомления ${totalRecipients} получателям`);

  for (const chatId of botData.subscribers) {
    try {
      await bot.sendMessage(chatId, message, {
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      });
      console.log(`✅ Личное уведомление отправлено: ${chatId}`);
    } catch (error) {
      console.error(`❌ Ошибка отправки ${chatId}:`, error.message);

      if (error.response && error.response.error_code === 403) {
        botData.subscribers = botData.subscribers.filter((id) => id !== chatId);
        console.log(`🗑️ Удален неактивный подписчик: ${chatId}`);
      }
    }
  }

  for (const chatId of botData.groupChats) {
    try {
      await bot.sendMessage(chatId, message, {
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      });
      console.log(`✅ Групповое уведомление отправлено: ${chatId}`);
    } catch (error) {
      console.error(`❌ Ошибка отправки группового ${chatId}:`, error.message);

      if (
        error.response &&
        (error.response.error_code === 403 || error.response.error_code === 400)
      ) {
        botData.groupChats = botData.groupChats.filter((id) => id !== chatId);
        console.log(`🗑️ Удален недоступный групповой чат: ${chatId}`);
      }
    }
  }

  await saveData();
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const chatType = msg.chat.type;
  const username = msg.from.first_name || msg.from.username || "друг";

  if (chatType === "private") {
    if (!botData.subscribers.includes(chatId)) {
      botData.subscribers.push(chatId);
      await saveData();
      console.log(`➕ Новый подписчик: ${chatId} (${username})`);
    }

    const welcomeMessage = `👋 Привет, ${username}!

🎯 Я буду уведомлять вас о новых акциях Magticom!

📊 *Статус:*
• Мониторинг: ${botData.isMonitoring ? "🟢 Активен" : "🔴 Неактивен"}
• Подписчиков: ${botData.subscribers.length}
• Групповых чатов: ${botData.groupChats.length}

⌚ Проверяю каждые 30 минут с 10:00 до 22:00 (Тбилиси)

*Команды:*
/check - Проверить новые акции сейчас
/status - Показать статус мониторинга
/help - Справка по командам`;

    await bot.sendMessage(chatId, welcomeMessage, { parse_mode: "Markdown" });
  } else if (chatType === "group" || chatType === "supergroup") {
    if (!botData.groupChats.includes(chatId)) {
      botData.groupChats.push(chatId);
      await saveData();
      console.log(`➕ Новый групповой чат: ${chatId} (${msg.chat.title})`);
    }

    const groupWelcomeMessage = `👋 Привет всем!

🎯 Теперь я буду отправлять уведомления о новых акциях Magticom в этот чат!

📊 *Статус мониторинга:*
• Мониторинг: ${botData.isMonitoring ? "🟢 Активен" : "🔴 Неактивен"}
• Проверяю каждые 30 минут с 10:00 до 22:00 (Тбилиси)

*Полезные команды:*
/check - Проверить новые акции прямо сейчас
/status - Показать статус мониторинга`;

    await bot.sendMessage(chatId, groupWelcomeMessage, {
      parse_mode: "Markdown",
    });
  }
});

bot.onText(/\/check/, async (msg) => {
  const chatId = msg.chat.id;

  await bot.sendMessage(chatId, "🔍 Проверяю новые акции...");

  try {
    const oldFoundNumber = botData.lastFoundNumber;
    await checkForNewPromotions();

    if (botData.lastFoundNumber > oldFoundNumber) {
      await bot.sendMessage(
        chatId,
        `🎉 Найдена новая акция! Проверьте ваши сообщения!`
      );
    } else {
      await bot.sendMessage(
        chatId,
        `📭 Нет новых акций! Последняя акция от Magticom по-прежнему актуальна.`
      );
    }
  } catch (error) {
    await bot.sendMessage(chatId, `❌ Ошибка при проверке: ${error.message}`);
  }
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;

  const tbilisiTime = new Date().toLocaleString("ru-RU", {
    timeZone: "Asia/Tbilisi",
    hour12: false,
  });

  const lastPromoUrl = `${BASE_URL}${botData.lastFoundNumber}`;

  const statusMessage = `📊 *СТАТУС МОНИТОРИНГА*

⏰ Время в Тбилиси: ${tbilisiTime}
🔄 Мониторинг: ${botData.isMonitoring ? "🟢 Активен" : "🔴 Неактивен"}
👥 Личных подписчиков: ${botData.subscribers.length}
💬 Групповых чатов: ${botData.groupChats.length}

📱 [Последняя найденная акция](${lastPromoUrl})

⏰ График проверок: каждые 30 минут с 10:00 до 22:00

💾 Данные сохранены в Supabase`;

  await bot.sendMessage(chatId, statusMessage, { parse_mode: "Markdown" });
});

bot.onText(/\/chatid/, async (msg) => {
  const chatId = msg.chat.id;
  const chatType = msg.chat.type;
  const chatTitle = msg.chat.title || "Личный чат";

  const idMessage = `🔍 *ИНФОРМАЦИЯ О ЧАТЕ*

💬 Название: ${chatTitle}
🆔 Chat ID: \`${chatId}\`
📱 Тип: ${chatType}`;

  await bot.sendMessage(chatId, idMessage, { parse_mode: "Markdown" });
});

bot.onText(/\/addgroup/, async (msg) => {
  const chatId = msg.chat.id;
  const chatType = msg.chat.type;

  if (chatType === "private") {
    await bot.sendMessage(
      chatId,
      "❌ Эта команда работает только в групповых чатах!"
    );
    return;
  }

  if (!botData.groupChats.includes(chatId)) {
    botData.groupChats.push(chatId);
    await saveData();
    console.log(`➕ Вручную добавлен групповой чат: ${chatId}`);

    await bot.sendMessage(
      chatId,
      `✅ Групповой чат успешно добавлен!
        
📊 Теперь активно:
• Личных подписчиков: ${botData.subscribers.length}
• Групповых чатов: ${botData.groupChats.length}`
    );
  } else {
    await bot.sendMessage(
      chatId,
      "✅ Этот чат уже добавлен в список уведомлений!"
    );
  }
});

bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const chatType = msg.chat.type;

  const helpMessage = `📚 *СПРАВКА ПО КОМАНДАМ*

*Основные команды:*
/start - Подписаться на уведомления
/check - Проверить новые акции прямо сейчас  
/status - Показать статус мониторинга
/help - Эта справка

*Дополнительные команды:*
/chatid - Показать информацию о чате
/addgroup - Добавить групповой чат (только для групп)

🤖 *КАК РАБОТАЕТ БОТ:*
• Каждые 30 минут проверяю новые страницы акций
• При нахождении новой акции отправляю уведомление
• Работаю только в дневное время (10:00-22:00)
• Данные надежно сохраняются в Supabase

🔗 *ПРОВЕРЯЕМЫЕ СТРАНИЦЫ:*
Сайт: magticom.ge/ru/sakvirveli[номер]`;

  await bot.sendMessage(chatId, helpMessage, { parse_mode: "Markdown" });
});

function isWorkingHours() {
  const now = new Date();
  const tbilisiTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Tbilisi" })
  );
  const hour = tbilisiTime.getHours();

  return hour >= 10 && hour <= 22;
}

function startMonitoring() {
  console.log("🚀 Запускаем мониторинг акций Magticom...");
  botData.isMonitoring = true;

  setInterval(async () => {
    if (isWorkingHours()) {
      try {
        await checkForNewPromotions();
      } catch (error) {
        console.error("❌ Ошибка в мониторинге:", error.message);
      }
    } else {
      console.log("😴 Нерабочее время, пропускаем проверку");
    }
  }, 30 * 60 * 1000);

  setTimeout(async () => {
    if (isWorkingHours()) {
      console.log("🎬 Выполняем первую проверку...");
      await checkForNewPromotions();
    }
  }, 30000);
}

bot.on("error", (error) => {
  console.error("❌ Ошибка бота:", error.message);
});

bot.on("polling_error", (error) => {
  console.error("❌ Ошибка polling:", error.message);
});

async function init() {
  console.log("🤖 Инициализация бота Magticom Monitor...");

  await initSupabase();
  await loadData();

  try {
    const botInfo = await bot.getMe();
    console.log(`✅ Бот запущен: @${botInfo.username}`);
    console.log(`👥 Личных подписчиков: ${botData.subscribers.length}`);
    console.log(`💬 Групповых чатов: ${botData.groupChats.length}`);
    console.log(`🔄 Мониторинг активен, проверки каждые 30 минут`);

    startMonitoring();
  } catch (error) {
    console.error("❌ Ошибка инициализации:", error.message);
    process.exit(1);
  }
}

init();
