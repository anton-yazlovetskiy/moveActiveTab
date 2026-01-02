const GROUP_TITLE = "▶ Active";
const GROUP_COLOR = "green";
let isProcessing = false;

const autoLikeScript = () => {
    const likeBtnSelector = 'button[aria-label*="нравится"], button[aria-label*="like this video"]';
    const likeButton = document.querySelector(likeBtnSelector);
    if (likeButton && likeButton.getAttribute('aria-pressed') === 'false') {
        likeButton.click();
        console.log("Smart Mover: Auto-liked!");
    }
};

async function manageTabs(tabId) {
    if (isProcessing) return;
    isProcessing = true;

    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab || !tab.url || !tab.url.includes("youtube.com/watch")) {
            isProcessing = false;
            return;
        }

        const groups = await chrome.tabGroups.query({ title: GROUP_TITLE, windowId: tab.windowId });
        let targetGroupId = groups.length > 0 ? groups[0].id : null;

        // Перемещаем в конец
        await chrome.tabs.move(tabId, { index: -1 });
        targetGroupId = await chrome.tabs.group({ tabIds: tabId, groupId: targetGroupId || undefined });

        // Оформляем группу
        await new Promise(r => setTimeout(r, 100)); // Увеличенная пауза для стабильности
        await chrome.tabGroups.update(targetGroupId, { 
            title: GROUP_TITLE, 
            color: GROUP_COLOR, 
            collapsed: false 
        });
        await chrome.tabGroups.move(targetGroupId, { index: -1 });

        // Управление воспроизведением и фокусом
        if (tab.active) {
            // Если вкладка активна - включаем звук и переключаем фокус
            await chrome.tabs.update(tabId, { active: true }); 
            
            const tabsInGroup = await chrome.tabs.query({ groupId: targetGroupId });
            for (const t of tabsInGroup) {
                const isCurrent = (t.id === tabId);
                chrome.scripting.executeScript({
                    target: { tabId: t.id },
                    func: (shouldPlay, likeCodeStr) => {
                        const video = document.querySelector('video');
                        if (video) {
                            if (shouldPlay) {
                                video.play().catch(() => {});
                                try { new Function(`(${likeCodeStr})()`)(); } catch(e){}
                            } else {
                                video.pause();
                            }
                        }
                    },
                    args: [isCurrent, autoLikeScript.toString()]
                }).catch(() => {});
            }
        } else {
            // Если вкладка фоновая - принудительная пауза
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                    const v = document.querySelector('video');
                    if (v) v.pause();
                }
            }).catch(() => {});
        }
    } catch (e) {
        console.error(e);
    } finally {
        setTimeout(() => { isProcessing = false; }, 300);
    }
}

// Слушатель клика по самой группе
chrome.tabGroups.onUpdated.addListener(async (group) => {
    if (group.title === GROUP_TITLE && group.collapsed) {
        await chrome.tabGroups.update(group.id, { collapsed: false });
        const tabs = await chrome.tabs.query({ groupId: group.id });
        if (tabs.length > 0) {
            await chrome.tabs.update(tabs[tabs.length - 1].id, { active: true });
        }
    }
});

chrome.tabs.onActivated.addListener((info) => manageTabs(info.tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url || changeInfo.audible) {
        manageTabs(tabId);
    }
});