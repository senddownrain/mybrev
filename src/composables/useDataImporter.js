import { collection, addDoc } from 'firebase/firestore';
import { useFirestore } from 'vuefire';
import tables from '@/json'; // Импортируем вашу старую базу

export function useDataImporter() {
    const db = useFirestore();
    const daysCollectionRef = collection(db, 'days');

    // --- Словари для "обратного" преобразования ---
    const periodMapReverse = {
        ordinary: 'звычайны тыдзень',
        easter: 'велікодны тыдзень',
        lent: 'тыдзень Вялікага посту',
        advent: 'тыдзень Адвэнту',
    };
    const dayOfWeekMapReverse = {
        1: 'Нядзеля', 2: 'Панядзелак', 3: 'Аўторак', 4: 'Серада', 5: 'Чацвер', 6: 'Пятніца', 7: 'Субота'
    };
    const romanNumerals = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI", "XXII", "XXIII", "XXIV", "XXV", "XXVI", "XXVII", "XXVIII", "XXIX", "XXX", "XXXI", "XXXII", "XXXIII", "XXXIV"];

    // Функция преобразования арабского числа в римское
    function toRoman(num) {
        return romanNumerals[num] || num;
    }

    

function getTableField(table, id, field) {
    let tableName = table + "_table";

    if (tables[tableName]) {

        let item = tables[tableName].find(x => x[table + "_ID"] == id)
        //console.log(item)
        if (item && item[field]) {
            return item[field]
        }
    }
    return ""
}

    // ЭТО КОПИЯ ЛОГИКИ ИЗ ВАШЕЙ ФУНКЦИИ mapDay
    function createNewDayObject(oldItem) {
        const b = oldItem;
        const newDay = {
        _dayOfWeek: "", // 1 - sunday, ...
        _periodType: "", // pasha, ordinary, advent
        _periodWeekNumber: "",
        _date: "", // date of feast
        _feast: "", // easter, christmas, ascension, pentocost, christthehighpriest
        _psalmWeek: b["Svyata"], // week of psalms


        _dayName: b["Day"],
        _weekDay: b["Bridge_DayName"],
        _weekNum: b["Bridge_Week"],
        _feastName: b["Svyata"] && b["Svyata"].toLowerCase().includes("псалтыра") ? "" : b["Svyata"],
        _feastType: b["Uspamin"],
        allowedAlleluia: b["Alleluia"] == "1",

        invitatoriumAnt: getTableField("Zakl_Ant", b["Zakl_Ant"], "Zakl_Ant_Text"),
        invitatoriumPs1: getTableField("Zakl_PS", b["Zakl_PS"], "Zakl_PS_Text1"),
        invitatoriumPs2: getTableField("Zakl_PS", b["Zakl_PS"], "Zakl_PS_Text2"),
        invitatoriumPs3: getTableField("Zakl_PS", b["Zakl_PS"], "Zakl_PS_Text3"),
        invitatoriumPs4: getTableField("Zakl_PS", b["Zakl_PS"], "Zakl_PS_Text4"),
        invitatoriumPs5: getTableField("Zakl_PS", b["Zakl_PS"], "Zakl_PS_Text5"),
        invitatoriumPs6: getTableField("Zakl_PS", b["Zakl_PS"], "Zakl_PS_Text6"),

        feastComment: getTableField("Svyat", b["Svyat"], "Svyat_Text"),

        officeOfReadingsHymn: getTableField("GCH_Gimn", b["GCH_Gimn"], "GCH_Gimn_Text"),

        officeOfReadingsAnt1: getTableField("GCH_Ant", b["GCH_Ant"], "GCH_Ant_Text1"),
        officeOfReadingsAnt2: getTableField("GCH_Ant", b["GCH_Ant"], "GCH_Ant_Text2"),
        officeOfReadingsAnt3: getTableField("GCH_Ant", b["GCH_Ant"], "GCH_Ant_Text3"),

        officeOfReadingsPs1: getTableField("GCH_PS", b["GCH_PS"], "GCH_PS_Text1"),
        officeOfReadingsPs2: getTableField("GCH_PS", b["GCH_PS"], "GCH_PS_Text2"),
        officeOfReadingsPs3: getTableField("GCH_PS", b["GCH_PS"], "GCH_PS_Text3"),
        officeOfReadingsVers: getTableField("GCH_Versh", b["GCH_Versh"], "GCH_Versh_Text"),

        officeOfReadingsR1: getTableField("GCH_CH_1", b["GCH_CH_1"], "GCH_CH_1_Text"),
        officeOfReadingsR2: getTableField("GCH_CH_2", b["GCH_CH_2"], "GCH_CH_2_Text"),

        officeOfReadingsTeDeum: b["GCH_Tabe"] == "1",
        officeOfReadingsPr: getTableField("GCH_Mal", b["GCH_Mal"], "GCH_Mal_Text"),

        laudesHymn: getTableField("UTR_Gimn", b["UTR_Gimn"], "UTR_Gimn_Text"),
        laudesAnt1: getTableField("UTR_Ant", b["UTR_Ant"], "UTR_Ant_Text1"),
        laudesAnt2: getTableField("UTR_Ant", b["UTR_Ant"], "UTR_Ant_Text2"),
        laudesAnt3: getTableField("UTR_Ant", b["UTR_Ant"], "UTR_Ant_Text3"),
        laudesPs1: getTableField("UTR_PS", b["UTR_PS"], "UTR_PS_Text1"),
        laudesPs2: getTableField("UTR_PS", b["UTR_PS"], "UTR_PS_Text2"),
        laudesPs3: getTableField("UTR_PS", b["UTR_PS"], "UTR_PS_Text3"),
        laudesR: getTableField("UTR_Chyt", b["UTR_Chyt"], "UTR_Chyt_Text"),
        laudesAntBen: getTableField("UTR_Ant_Zakh", b["UTR_Ant_Zakh"], "UTR_Ant_Zakh_Text"),
        laudesInter: getTableField("UTR_Prosby", b["UTR_Prosby"], "UTR_Prosby_Text"),
        laudesPr: getTableField("UTR_Mal", b["UTR_Mal"], "UTR_Mal_Text"),

        sext1Hymn: getTableField("MPD_Gimn_1", b["MPD_Gimn_1"], "MPD_Gimn_1_Text"),
        sext1Ant1: getTableField("MPD_Ant_1", b["MPD_Ant_1"], "MPD_Ant_1_Text1"),
        sext1Ant2: getTableField("MPD_Ant_1", b["MPD_Ant_1"], "MPD_Ant_1_Text2"),
        sext1Ant3: getTableField("MPD_Ant_1", b["MPD_Ant_1"], "MPD_Ant_1_Text3"),
        sext1Ps1: getTableField("MPD_PS_1", b["MPD_PS_1"], "MPD_PS_1_Text1"),
        sext1Ps2: getTableField("MPD_PS_1", b["MPD_PS_1"], "MPD_PS_1_Text2"),
        sext1Ps3: getTableField("MPD_PS_1", b["MPD_PS_1"], "MPD_PS_1_Text3"),
        sext1R: getTableField("MPD_Chyt_1", b["MPD_Chyt_1"], "MPD_Chyt_1_Text"),
        sext1Pr: getTableField("MPD_Mal_1", b["MPD_Mal_1"], "MPD_Mal_1_Text"),

        sext2Hymn: getTableField("MPD_Gimn_2", b["MPD_Gimn_2"], "MPD_Gimn_2_Text"),
        sext2Ant1: getTableField("MPD_Ant_2", b["MPD_Ant_2"], "MPD_Ant_2_Text"),
        sext2Ant2: getTableField("MPD_Ant_2", b["MPD_Ant_2"], "MPD_Ant_2_Text2"),
        sext2Ant3: getTableField("MPD_Ant_2", b["MPD_Ant_2"], "MPD_Ant_2_Text3"),
        sext2Ps1: getTableField("MPD_PS_2", b["MPD_PS_2"], "MPD_PS_2_Text1"),
        sext2Ps2: getTableField("MPD_PS_2", b["MPD_PS_2"], "MPD_PS_2_Text2"),
        sext2Ps3: getTableField("MPD_PS_2", b["MPD_PS_2"], "MPD_PS_2_Text3"),
        sext2R: getTableField("MPD_Chyt_2", b["MPD_Chyt_2"], "MPD_Chyt_2_Text"),
        sext2Pr: getTableField("MPD_Mal_2", b["MPD_Mal_2"], "MPD_Mal_2_Text"),

        sext3Hymn: getTableField("MPD_Gimn_3", b["MPD_Gimn_3"], "MPD_Gimn_3_Text"),
        sext3Ant1: getTableField("MPD_Ant_3", b["MPD_Ant_3"], "MPD_Ant_3_Text"),
        sext3Ant2: getTableField("MPD_Ant_3", b["MPD_Ant_3"], "MPD_Ant_3_Text2"),
        sext3Ant3: getTableField("MPD_Ant_3", b["MPD_Ant_3"], "MPD_Ant_3_Text3"),
        sext3Ps1: getTableField("MPD_PS_3", b["MPD_PS_3"], "MPD_PS_3_Text1"),
        sext3Ps2: getTableField("MPD_PS_3", b["MPD_PS_3"], "MPD_PS_3_Text2"),
        sext3Ps3: getTableField("MPD_PS_3", b["MPD_PS_3"], "MPD_PS_3_Text3"),
        sext3R: getTableField("MPD_Chyt_3", b["MPD_Chyt_3"], "MPD_Chyt_3_Text"),
        sext3Pr: getTableField("MPD_Mal_3", b["MPD_Mal_3"], "MPD_Mal_3_Text"),

        vesperHymn: getTableField("NESH_Gimn", b["NESH_Gimn"], "NESH_Gimn_Text"),
        vesperAnt1: getTableField("NESH_Ant", b["NESH_Ant"], "NESH_Ant_Text1"),
        vesperAnt2: getTableField("NESH_Ant", b["NESH_Ant"], "NESH_Ant_Text2"),
        vesperAnt3: getTableField("NESH_Ant", b["NESH_Ant"], "NESH_Ant_Text3"),
        vesperPs1: getTableField("NESH_PS", b["NESH_PS"], "NESH_PS_Text1"),
        vesperPs2: getTableField("NESH_PS", b["NESH_PS"], "NESH_PS_Text2"),
        vesperPs3: getTableField("NESH_PS", b["NESH_PS"], "NESH_PS_Text3"),
        vesperR: getTableField("NESH_Chyt", b["NESH_Chyt"], "NESH_Chyt_Text"),
        vesperAntMag: getTableField("NESH_Ant_M", b["NESH_Ant_M"], "NESH_Ant_M_Text"),
        vesperInter: getTableField("NESH_Prosby", b["NESH_Prosby"], "NESH_Prosby_Text"),
        vesperPr: getTableField("NESH_Mal", b["NESH_Mal"], "NESH_Mal_Text"),

        compHymn: getTableField("KAMP_Gimn", b["KAMP_Gimn"], "KAMP_Gimn_Text"),
        compAnt1: getTableField("KAMP_Ant", b["KAMP_Ant"], "KAMP_Ant_Text1"),
        compAnt2: getTableField("KAMP_Ant", b["KAMP_Ant"], "KAMP_Ant_Text2"),

        compPs1: getTableField("KAMP_PS", b["KAMP_PS"], "KAMP_PS_Text1"),
        compPs2: getTableField("KAMP_PS", b["KAMP_PS"], "KAMP_PS_Text2"),

        compR: getTableField("KAMP_Chyt", b["KAMP_Chyt"], "KAMP_Chyt_Text"),
        compResp: getTableField("KAMP_Resp", b["KAMP_Resp"], "KAMP_Resp_Text"),
        compAntS: getTableField("KAMP_Ant_S", b["KAMP_Ant_S"], "KAMP_Ant_S_Text"),
        compPr: getTableField("KAMP_Mal", b["KAMP_Mal"], "KAMP_Mal_Text"),
        compAntM: getTableField("KAMP_Ant_M", b["KAMP_Ant_M"], "KAMP_Ant_M_Text"),



    };
        // // Этот цикл копирует все остальные текстовые поля
        // Object.keys(b).forEach(key => {
        //     if (key.includes('_Ant') || key.includes('_Gimn') /*... и другие префиксы ...*/) {
        //         const newKey = key.replace(/_/g, '').charAt(0).toLowerCase() + key.slice(1).replace(/_/g, '');
        //         if (newDay[newKey] !== undefined) {
        //             // newDay[newKey] = getTableField(...) // Раскомментируйте и адаптируйте getTableField, если нужно
        //         }
        //     }
        // });
        return newDay;
    }

    let x = JSON.parse('[{"date":"13.01.2025 (панядзелак)","type":{"stringValue":"ordinary"},"week":{"stringValue":"1"},"day":{"stringValue":"1"}},{"date":"13.03.2025 (чацвер)","type":{"stringValue":"lent"},"week":{"stringValue":"1"},"day":{"stringValue":"5"}},{"date":"25.03.2025 (аўторак)","type":{"stringValue":"lent"},"week":{"stringValue":"3"},"day":{"stringValue":"3"}},{"date":"07.04.2025 (панядзелак)","type":{"stringValue":"lent"},"week":{"stringValue":"5"},"day":{"stringValue":"2"}},{"date":"13.04.2025 (нядзеля)"},{"date":"20.04.2025 (нядзеля)","type":{"stringValue":"easter"},"week":{"stringValue":"1"},"day":{"stringValue":"1"}},{"date":"28.04.2025 (панядзелак)","type":{"stringValue":"easter"},"week":{"stringValue":"2"},"day":{"stringValue":"2"}},{"date":"30.04.2025 (серада)","type":{"stringValue":"easter"},"week":{"stringValue":"2"},"day":{"stringValue":"4"}},{"date":"06.05.2025 (аўторак)","type":{"stringValue":"easter"},"week":{"stringValue":"3"},"day":{"stringValue":"3"}},{"date":"07.05.2025 (серада)","type":{"stringValue":"easter"},"week":{"stringValue":"3"},"day":{"stringValue":"4"}},{"date":"08.05.2025 (чацвер)","type":{"stringValue":"easter"},"week":{"stringValue":"3"},"day":{"stringValue":"5"}},{"date":"14.05.2025 (серада)","type":{"stringValue":"easter"},"week":{"stringValue":"4"},"day":{"stringValue":"4"}},{"date":"21.05.2025 (серада)","type":{"stringValue":"easter"},"week":{"stringValue":"5"},"day":{"stringValue":"4"}},{"date":"22.05.2025 (чацвер)","type":{"stringValue":"easter"},"week":{"stringValue":"5"},"day":{"stringValue":"5"}},{"date":"29.05.2025 (чацвер)","type":{"stringValue":"easter"},"week":{"stringValue":"6"},"day":{"stringValue":"5"}},{"date":"04.06.2025 (серада)","type":{"stringValue":"easter"},"week":{"stringValue":"7"},"day":{"stringValue":"4"}},{"date":"08.06.2025 (нядзеля)","type":{"stringValue":"easter"},"week":{"stringValue":"8"},"day":{"stringValue":"1"}},{"date":"23.08.2025 (субота)","type":{"stringValue":"ordinary"},"week":{"stringValue":"20"},"day":{"stringValue":"7"}},{"date":"15.09.2025 (панядзелак)","type":{"stringValue":"ordinary"},"week":{"stringValue":"24"},"day":{"stringValue":"2"}},{"date":"17.09.2025 (серада)","type":{"stringValue":"ordinary"},"week":{"stringValue":"24"},"day":{"stringValue":"4"}},{"date":"23.11.2025 (нядзеля)","type":{"stringValue":"ordinary"},"week":{"stringValue":"34"},"day":{"stringValue":"1"}},{"date":"20.12.2025 (субота)","type":{"stringValue":"advent"},"week":{"stringValue":"3"},"day":{"stringValue":"7"}},{"date":"21.12.2025 (нядзеля)","type":{"stringValue":"advent"},"week":{"stringValue":"4"},"day":{"stringValue":"1"}},{"date":"22.12.2025 (панядзелак)","type":{"stringValue":"advent"},"week":{"stringValue":"4"},"day":{"stringValue":"2"}},{"date":"23.12.2025 (аўторак)","type":{"stringValue":"advent"},"week":{"stringValue":"4"},"day":{"stringValue":"3"}},{"date":"24.12.2025 (серада)","type":{"stringValue":"advent"},"week":{"stringValue":"4"},"day":{"stringValue":"4"}}]')

    // --- ОСНОВНАЯ ФУНКЦИЯ ИМПОРТА ---
  async function importMissingDays(missingDaysList) {
    const report = {
        added: [],
        notFound: [],
    };
    missingDaysList = x;
    console.log(missingDaysList)
    
    for (const missing of missingDaysList) {
        // ✅ ГЛАВНОЕ ИЗМЕНЕНИЕ: Проверка на полноту данных
        // Если у элемента нет полей 'type', 'week' или 'day', пропускаем его.
        if (!missing.type || !missing.week || !missing.day) {
            console.warn('[Importer] Пропущен неполный элемент:', missing);
            continue; // Переходим к следующему элементу в цикле
        }
        // 1. "Обратное" преобразование (теперь работает с форматом {"stringValue": "..."})
        try {
            const periodWeekNum = parseInt(missing.week.stringValue);
            const periodWeekRoman = toRoman(periodWeekNum);
            
            const periodTypeName = periodMapReverse[missing.type.stringValue];
            
            // Если тип периода не найден в словаре (на всякий случай)
            if (!periodTypeName) {
                console.warn('[Importer] Неизвестный тип периода:', missing.type.stringValue);
                continue;
            }
            const searchDayName = `${periodWeekRoman} ${periodTypeName}`;
            
            const searchWeekDay = dayOfWeekMapReverse[missing.day.stringValue];
            
            // 2. Поиск в старой базе
            const oldItem = tables.Bridge_table.find(item => 
                item.Day === searchDayName && item.Bridge_DayName === searchWeekDay
            );
            if (oldItem) {
                // 3. Создание нового объекта
                let newDay = createNewDayObject(oldItem); // Предполагаем, что эта функция у вас заполнена
                
                newDay._periodType = missing.type.stringValue;
                newDay._periodWeekNumber = periodWeekNum;
                newDay._dayOfWeek = parseInt(missing.day.stringValue);
                // 4. Добавление в Firestore
                await addDoc(daysCollectionRef, newDay);
                report.added.push({ date: missing.date, found: `Нашёлся как '${searchDayName} - ${searchWeekDay}'` });
            } else {
                // 5. Если не найдено
                report.notFound.push({ date: missing.date, searchCriteria: `Искали: '${searchDayName} - ${searchWeekDay}'` });
            }
        } catch (e) {
            console.error(`[Importer] Критическая ошибка при обработке элемента:`, missing, e);
            report.notFound.push({ date: missing.date, searchCriteria: `Ошибка обработки: ${e.message}` });
        }
    }
    return report;
}

    return { importMissingDays };
}