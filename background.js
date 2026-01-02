const GROUP_TITLE = "▶ Active";
const GROUP_COLOR = "green";
let isProcessing = false;

async function manageTabs(activeTabId, forceFocus = false) {
    if (isProcessing) return;
    isProcessing = true;

    try {
        const tab = await chrome.tabs.get(activeTabId);
        
        // Проверяем, что это YouTube (watch страница)
        if (!tab || !tab.url || !tab.url.includes("youtube.com/watch")) {
            isProcessing = false;
            return;
        }

        // 1. Ищем существующую группу
        const groups = await chrome.tabGroups.query({ title: GROUP_TITLE, windowId: tab.windowId });
        let targetGroupId = groups.length > 0 ? groups[0].id : null;

        // 2. Двигаем вкладку в самый конец (индекс -1)
        await chrome.tabs.move(activeTabId, { index: -1 });

        // 3. Группируем
        targetGroupId = await chrome.tabs.group({ 
            tabIds: activeTabId, 
            groupId: targetGroupId || undefined 
        });

        // 4. Оформляем группу
        await new Promise(r => setTimeout(r, 60)); // Небольшая пауза для стабильности UI
        await chrome.tabGroups.update(targetGroupId, { 
            title: GROUP_TITLE, 
            color: GROUP_COLOR, 
            collapsed: false 
        });
        
        // Двигаем группу в конец
        await chrome.tabGroups.move(targetGroupId, { index: -1 });

        // 5. Управление плеером: включаем текущее, выключаем остальные
        const tabsInGroup = await chrome.tabs.query({ groupId: targetGroupId });
        for (const t of tabsInGroup) {
            const shouldPlay = (t.id === activeTabId);
            chrome.scripting.executeScript({
                target: { tabId: t.id },
                func: (playMode) => {
                    const video = document.querySelector('video');
                    if (video) {
                        if (playMode) video.play().catch(() => {});
                        else video.pause();
                    }
                },
                args: [shouldPlay]
            }).catch(() => {});
        }

        // 6. ПЕРЕКЛЮЧЕНИЕ ФОКУСА: делаем вкладку активной
        await chrome.tabs.update(activeTabId, { active: true });

    } catch (e) {
        console.error("Critical Error:", e);
    } finally {
        setTimeout(() => { isProcessing = false; }, 300);
    }
}

// Клик по группе: разворачивание и переключение на видео
chrome.tabGroups.onUpdated.addListener(async (group) => {
    if (group.title === GROUP_TITLE && group.collapsed) {
        try {
            await chrome.tabGroups.update(group.id, { collapsed: false });
            const tabs = await chrome.tabs.query({ groupId: group.id });
            if (tabs.length > 0) {
                // Всегда переключаемся на самую последнюю (актуальную) вкладку в группе
                const lastTabId = tabs[tabs.length - 1].id;
                await chrome.tabs.update(lastTabId, { active: true });
            }
        } catch (e) { console.error(e); }
    }
});

// Событие 1: Клик по вкладке вручную
chrome.tabs.onActivated.addListener((info) => {
    manageTabs(info.tabId);
});

// Событие 2: Изменение состояния вкладки (звук, URL, загрузка)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Триггер 1: Видео начало издавать звук (даже в фоне)
    // Триггер 2: Вкладка догрузилась (статус complete)
    // Триггер 3: Изменился URL (переход на следующее видео в том же окне)
    if (changeInfo.audible === true || changeInfo.status === 'complete' || changeInfo.url) {
        manageTabs(tabId);
    }
});