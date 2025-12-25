const GROUP_TITLE = "▶ Active";

async function manageTabs(activeTabId) {
    try {
        const allTabs = await chrome.tabs.query({});
        
        for (const tab of allTabs) {
            if (tab.id === activeTabId) {
                if (tab.url && tab.url.includes("youtube.com/watch")) {
                    await chrome.tabs.move(tab.id, { index: -1 });
                    const groupId = await chrome.tabs.group({ tabIds: tab.id });
                    await chrome.tabGroups.update(groupId, { 
                        title: GROUP_TITLE, 
                        color: "red" 
                    });
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
}

// НОВЫЙ ОБРАБОТЧИК: Клик по группе
chrome.tabGroups.onUpdated.addListener(async (group) => {
    // Проверяем только нашу группу по заголовку
    if (group.title === GROUP_TITLE) {
        const tabsInGroup = await chrome.tabs.query({ groupId: group.id });
        
        // Если в группе всего одна вкладка
        if (tabsInGroup.length === 1) {
            const targetTab = tabsInGroup[0];
            
            // Если группа была свернута кликом — разворачиваем её обратно
            if (group.collapsed) {
                await chrome.tabGroups.update(group.id, { collapsed: false });
            }
            
            // Переключаемся на вкладку
            await chrome.tabs.update(targetTab.id, { active: true });
        }
    }
});

// Слушатель активации
chrome.tabs.onActivated.addListener((activeInfo) => {
    manageTabs(activeInfo.tabId);
});

// Слушатель обновлений
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.audible === true || changeInfo.status === 'complete') {
        if (tab.active) {
            manageTabs(tabId);
        }
    }
});