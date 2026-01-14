const GROUP_TITLE = "▶ Active";
const GROUP_COLOR = "green";
let isProcessing = false;

// 1. Слушатель завершения видео (Mac-friendly)
chrome.runtime.onMessage.addListener(async (message, sender) => {
    if (message.action === "close_completed_tab" && sender.tab) {
        const tabId = sender.tab.id;
        const groupId = sender.tab.groupId;

        if (groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
            const tabsInGroup = await chrome.tabs.query({ groupId: groupId });
            const currentIndex = tabsInGroup.findIndex(t => t.id === tabId);
            const nextTab = tabsInGroup[currentIndex + 1] || tabsInGroup[currentIndex - 1];

            if (nextTab) {
                // Переключаем фокус ПЕРЕД удалением, чтобы Mac разрешил автоплей
                await chrome.tabs.update(nextTab.id, { active: true });
                await new Promise(r => setTimeout(r, 400)); 
            }
        }
        chrome.tabs.remove(tabId);
    }
});

function startSimpleTimer() {
    if (window.ytTimerRunning) return;
    window.ytTimerRunning = true;
    let secondsInFocus = 0;
    const interval = setInterval(() => {
        if (document.hasFocus()) secondsInFocus++;
        const video = document.querySelector('video');
        if (!video || !video.duration) return;
        const threshold = video.duration < 300 ? 60 : 300;
        if (secondsInFocus >= threshold) {
            const btn = document.querySelector('button[aria-label*="нравится"], button[aria-label*="like this video"]');
            if (btn && btn.getAttribute('aria-pressed') === 'false') {
                btn.click();
            }
            clearInterval(interval);
            window.ytTimerRunning = false;
        }
    }, 1000);
}

// ОСНОВНАЯ ФУНКЦИЯ УПРАВЛЕНИЯ ПЛЕЕРОМ
async function syncPlayback(activeTabId) {
    const tab = await chrome.tabs.get(activeTabId);
    if (!tab.url?.includes("youtube.com/watch")) return;

    const groupId = tab.groupId;
    if (groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return;

    const tabsInGroup = await chrome.tabs.query({ groupId: groupId });

    for (const t of tabsInGroup) {
        if (t.id === activeTabId) {
            // Запускаем активное видео
            chrome.scripting.executeScript({
                target: { tabId: t.id },
                func: (timerFuncSource) => {
                    const v = document.querySelector('video');
                    if (v) {
                        // Обработчик конца видео
                        if (!window.ytEndListenerAdded) {
                            v.addEventListener('ended', () => chrome.runtime.sendMessage({ action: "close_completed_tab" }));
                            window.ytEndListenerAdded = true;
                        }
                        // Принудительный старт с задержкой (фиксит блокировку браузером)
                        const playVideo = () => v.play().catch(() => {});
                        playVideo();
                        setTimeout(playVideo, 500); 

                        if (!window.ytTimerRunning) {
                            eval(timerFuncSource);
                            startSimpleTimer();
                        }
                    }
                },
                args: [startSimpleTimer.toString()]
            }).catch(() => {});
        } else {
            // Останавливаем все остальные
            chrome.scripting.executeScript({
                target: { tabId: t.id },
                func: () => {
                    const v = document.querySelector('video');
                    if (v && !v.paused) v.pause();
                }
            }).catch(() => {});
        }
    }
}

// ФУНКЦИЯ ГРУППИРОВКИ (не трогает плеер)
async function ensureInGroup(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab.url?.includes("youtube.com/watch")) return;

        const groups = await chrome.tabGroups.query({ title: GROUP_TITLE, windowId: tab.windowId });
        let targetGroupId = groups.length > 0 ? groups[0].id : null;

        await chrome.tabs.group({ tabIds: tabId, groupId: targetGroupId || undefined });
        
        if (!targetGroupId) {
            const newGroups = await chrome.tabGroups.query({ windowId: tab.windowId });
            const lastGroup = newGroups[newGroups.length - 1];
            await chrome.tabGroups.update(lastGroup.id, { title: GROUP_TITLE, color: GROUP_COLOR });
        }
    } catch (e) {}
}

// СЛУШАТЕЛИ
chrome.tabs.onActivated.addListener(info => syncPlayback(info.tabId));

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url?.includes("youtube.com/watch")) {
        await ensureInGroup(tabId);
        if (tab.active) {
            syncPlayback(tabId);
        } else {
            // Если открыто фоном - просто ставим на паузу эту конкретную вкладку
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => { document.querySelector('video')?.pause(); }
            }).catch(() => {});
        }
    }
});