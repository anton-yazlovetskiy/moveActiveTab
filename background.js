const GROUP_TITLE = "▶ Active";
const GROUP_COLOR = "green";
let isProcessing = false;

// 1. Слушатель сообщений от вкладок
chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.action === "close_completed_tab" && sender.tab) {
        console.log(`Smart Mover: Видео завершено, закрываю вкладку ${sender.tab.id}`);
        chrome.tabs.remove(sender.tab.id);
    }
});

// МАКСИМАЛЬНО НАДЕЖНЫЙ СКРИПТ ЛАЙКА
function startSimpleTimer() {
    if (window.ytTimerRunning) return;
    window.ytTimerRunning = true;

    let secondsInFocus = 0;
    console.log("Smart Mover: Таймер фокуса запущен...");

    const interval = setInterval(() => {
        if (document.hasFocus()) {
            secondsInFocus++;
        }

        const video = document.querySelector('video');
        if (!video || !video.duration) return;

        const threshold = video.duration < 300 ? 60 : 300;

        if (secondsInFocus >= threshold) {
            const btn = document.querySelector('button[aria-label*="нравится"], button[aria-label*="like this video"]');
            
            if (btn) {
                if (btn.getAttribute('aria-pressed') === 'false') {
                    btn.click();
                    console.log("Smart Mover: Условие выполнено, лайк поставлен!");
                }
                clearInterval(interval);
                window.ytTimerRunning = false;
            }
        }
    }, 1000);
}

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

        await chrome.tabs.move(tabId, { index: -1 });
        targetGroupId = await chrome.tabs.group({ tabIds: tabId, groupId: targetGroupId || undefined });

        await new Promise(r => setTimeout(r, 150)); 
        await chrome.tabGroups.update(targetGroupId, { title: GROUP_TITLE, color: GROUP_COLOR, collapsed: false });
        await chrome.tabGroups.move(targetGroupId, { index: -1 });

        if (tab.active) {
            const tabsInGroup = await chrome.tabs.query({ groupId: targetGroupId });
            for (const t of tabsInGroup) {
                const isCurrent = (t.id === tabId);
                chrome.scripting.executeScript({
                    target: { tabId: t.id },
                    func: (shouldPlay, timerFuncSource) => {
                        const video = document.querySelector('video');
                        if (video) {
                            // --- НОВАЯ ЛОГИКА ЗАКРЫТИЯ ---
                            if (!window.ytEndListenerAdded) {
                                video.addEventListener('ended', () => {
                                    chrome.runtime.sendMessage({ action: "close_completed_tab" });
                                });
                                window.ytEndListenerAdded = true;
                                console.log("Smart Mover: Слушатель окончания видео добавлен");
                            }
                            // -----------------------------

                            if (shouldPlay) {
                                video.play().catch(() => {});
                                if (!window.ytTimerRunning) {
                                    eval(timerFuncSource);
                                    startSimpleTimer();
                                }
                            } else {
                                video.pause();
                            }
                        }
                    },
                    args: [isCurrent, startSimpleTimer.toString()]
                }).catch(() => {});
            }
        } else {
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