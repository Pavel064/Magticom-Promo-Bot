const axios = require("axios");

// Тестирование функций бота без запуска Telegram API
async function testPageCheck() {
  console.log("🧪 Тестирование проверки страниц...\n");

  const BASE_URL = "https://www.magticom.ge/ru/sakvirveli";

  // Тестируем известную рабочую страницу
  console.log("1️⃣ Тестируем существующую страницу (262):");
  try {
    const response = await axios.get(`${BASE_URL}262`, {
      timeout: 10000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    console.log(`   ✅ Статус: ${response.status}`);
    console.log(`   📄 Размер ответа: ${response.data.length} символов`);

    // Проверяем содержимое
    const hasPromoContent =
      response.data.includes("Чудо") ||
      response.data.includes("акци") ||
      response.data.includes("предложени");

    console.log(`   🎯 Содержит акцию: ${hasPromoContent ? "Да" : "Нет"}`);

    // Извлекаем заголовок
    const titleMatch = response.data.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) {
      console.log(`   📰 Заголовок: ${titleMatch[1].trim()}`);
    }
  } catch (error) {
    console.log(`   ❌ Ошибка: ${error.message}`);
  }

  console.log("\n2️⃣ Тестируем несуществующую страницу (999):");
  try {
    const response = await axios.get(`${BASE_URL}999`, {
      timeout: 5000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    console.log(`   ⚠️ Неожиданно получили ответ: ${response.status}`);
  } catch (error) {
    console.log(
      `   ✅ Ожидаемая ошибка: ${
        error.response ? error.response.status : error.message
      }`
    );
  }

  console.log("\n3️⃣ Тестируем проверку рабочего времени:");
  const now = new Date();
  const tbilisiTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Tbilisi" })
  );
  const hour = tbilisiTime.getHours();
  const isWorking = hour >= 10 && hour <= 22;

  console.log(
    `   🕐 Текущее время в Тбилиси: ${tbilisiTime.toLocaleString("ru-RU")}`
  );
  console.log(`   ⏰ Час: ${hour}`);
  console.log(`   🟢 Рабочее время: ${isWorking ? "Да" : "Нет"}`);
}

// Тест извлечения данных
function testDataExtraction() {
  console.log("\n🧪 Тестирование извлечения данных...\n");

  const testHTML = `
    <html>
        <head><title>Чудо-Дни - Magticom</title></head>
        <body>
            <h1>Новая акция!</h1>
            <p>В Магти продолжаются #Чудо-Дни!</p>
            <p>20-го и 21- го июля: безлимитные Интернет -25</p>
        </body>
    </html>`;

  // Извлечение заголовка
  const titleMatch = testHTML.match(/<title>(.*?)<\/title>/i);
  console.log(
    `📰 Заголовок: ${titleMatch ? titleMatch[1].trim() : "Не найден"}`
  );

  // Извлечение контента
  const contentMatch = testHTML.match(/<p[^>]*>(.*?)<\/p>/gi);
  if (contentMatch) {
    const content = contentMatch
      .map((p) => p.replace(/<[^>]*>/g, ""))
      .join(" ");
    console.log(`📄 Контент: ${content.substring(0, 100)}...`);
  }

  console.log("✅ Тест извлечения данных завершен");
}

// Запускаем тесты
async function runTests() {
  console.log("🚀 Запуск тестов Magticom Bot\n");

  try {
    await testPageCheck();
    testDataExtraction();

    console.log("\n🎉 Все тесты завершены!");
    console.log("\n💡 Если тесты прошли успешно, можно запускать бота:");
    console.log("   npm start");
  } catch (error) {
    console.error("\n❌ Ошибка в тестах:", error.message);
  }
}

// Проверяем, запущен ли файл напрямую
if (require.main === module) {
  runTests();
}

module.exports = { testPageCheck, testDataExtraction };
