const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, addDoc, serverTimestamp } = require("firebase/firestore");

const sourceFirebaseConfig = {
  apiKey: "AIzaSyDF2TD4MTcKiBChKRssauvL-nNyT4Am9N0",
  authDomain: "molitwy.firebaseapp.com",
  projectId: "molitwy",
  storageBucket: "molitwy.firebasestorage.app",
  messagingSenderId: "654293224787",
  appId: "1:654293224787:web:5f4fce64abf5ba1b1ea5a6"
};

const targetFirebaseConfig = {
  apiKey: "AIzaSyDmdP5MpLLIX0RWuYXbYsDDgPqbLHCi_sM",
  authDomain: "ibreviaryby.firebaseapp.com",
  projectId: "ibreviaryby",
  storageBucket: "ibreviaryby.appspot.com",
  messagingSenderId: "344097781816",
  appId: "1:344097781816:web:d94141222905f629fd8ecd",
  measurementId: "G-GP0WJ4705G",
  databaseUrl: "https://ibreviaryby.firebaseio.com",
};

const sourceApp = initializeApp(sourceFirebaseConfig, 'source');
const targetApp = initializeApp(targetFirebaseConfig, 'target');

const sourceDb = getFirestore(sourceApp);
const targetDb = getFirestore(targetApp);

async function importPrayers() {
  try {
    console.log("📥 Начало импорта молитв из проекта molitwy...");
    
    const sourceCollection = collection(sourceDb, 'items');
    const sourceSnapshot = await getDocs(sourceCollection);
    
    console.log(`📊 Найдено молитв в источнике: ${sourceSnapshot.size}`);
    
    if (sourceSnapshot.empty) {
      console.log("⚠️  Коллекция 'items' в проекте molitwy пуста.");
      return;
    }
    
    const targetCollection = collection(targetDb, 'prayers');
    const targetSnapshot = await getDocs(targetCollection);
    console.log(`📊 Уже есть молитв в целевом проекте: ${targetSnapshot.size}`);
    
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const doc of sourceSnapshot.docs) {
      try {
        const data = doc.data();
        
        const prayerData = {
          titleVersions: data.titleVersions || {
            be: data.title || '',
            ru: data.titleRu || data.title || '',
            la: data.titleLa || data.title || ''
          },
          textVersions: data.textVersions || {
            be: data.text || '',
            ru: data.textRu || data.text || '',
            la: data.textLa || data.text || ''
          },
          tags: data.tags || [],
          createdAt: serverTimestamp()
        };
        
        const existingPrayers = targetSnapshot.docs;
        const titleToCheck = prayerData.titleVersions.be || prayerData.titleVersions.ru || '';
        
        const alreadyExists = existingPrayers.some(existingDoc => {
          const existingData = existingDoc.data();
          const existingTitle = existingData.titleVersions?.be || existingData.titleVersions?.ru || existingData.title || '';
          return existingTitle === titleToCheck && titleToCheck !== '';
        });
        
        if (alreadyExists) {
          console.log(`⏭️  Пропущено (уже существует): "${titleToCheck}"`);
          skipped++;
          continue;
        }
        
        await addDoc(targetCollection, prayerData);
        console.log(`✅ Импортировано: "${titleToCheck}"`);
        imported++;
        
      } catch (error) {
        console.error(`❌ Ошибка при импорте документа ${doc.id}:`, error.message);
        errors++;
      }
    }
    
    console.log("\n📊 Итоги импорта:");
    console.log(`✅ Импортировано: ${imported}`);
    console.log(`⏭️  Пропущено (уже существуют): ${skipped}`);
    console.log(`❌ Ошибок: ${errors}`);
    console.log(`\n🎉 Импорт завершен!`);
    
  } catch (error) {
    console.error("❌ КРИТИЧЕСКАЯ ошибка при импорте:", error);
    process.exit(1);
  }
}

importPrayers()
  .then(() => {
    console.log("\n✅ Скрипт завершен успешно");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Скрипт завершен с ошибкой:", error);
    process.exit(1);
  });

