// Outfit State Tracker — SillyTavern Extension v1.1
// Совместимость: без ES module imports, использует глобальные объекты ST

(function () {
    'use strict';

    const EXT_NAME = 'outfit-tracker';
    const PROMPT_KEY = 'outfit_state_inject';
    const OUTFIT_REGEX = /\[OUTFIT_CHANGE:\s*([^\]]+)\]/i;

    // Дефолтные настройки
    const defaultSettings = {
        enabled: true,
        current_outfit: '',
        inject_position: 1,
        debug: false,
    };

    function getSettings() {
        if (!window.extension_settings) window.extension_settings = {};
        if (!window.extension_settings[EXT_NAME]) {
            window.extension_settings[EXT_NAME] = { ...defaultSettings };
        }
        return window.extension_settings[EXT_NAME];
    }

    function saveSettings() {
        if (window.saveSettingsDebounced) window.saveSettingsDebounced();
    }

    function injectOutfitPrompt() {
        const settings = getSettings();
        if (!window.setExtensionPrompt) return;

        if (!settings.enabled || !settings.current_outfit) {
            window.setExtensionPrompt(PROMPT_KEY, '', settings.inject_position, 0);
            return;
        }

        const prompt = `[Character's current outfit: ${settings.current_outfit}]`;
        window.setExtensionPrompt(PROMPT_KEY, prompt, settings.inject_position, 0);

        if (settings.debug) {
            console.log(`[OutfitTracker] Injected: ${prompt}`);
        }
    }

    function saveOutfitState(outfit) {
        const settings = getSettings();
        settings.current_outfit = outfit;
        saveSettings();
        updateStatusBadge();
        injectOutfitPrompt();

        if (settings.debug) {
            console.log(`[OutfitTracker] Saved: ${outfit}`);
            if (window.toastr) window.toastr.success(`Outfit updated: ${outfit}`, 'Outfit Tracker', { timeOut: 3000 });
        }
    }

    function updateStatusBadge() {
        const settings = getSettings();
        const badge = document.getElementById('outfit_tracker_badge');
        if (!badge) return;
        if (settings.current_outfit) {
            const short = settings.current_outfit.length > 45
                ? settings.current_outfit.substring(0, 45) + '…'
                : settings.current_outfit;
            badge.textContent = '✓ ' + short;
            badge.style.color = '#4ade80';
        } else {
            badge.textContent = '— not set';
            badge.style.color = '#94a3b8';
        }
    }

    function updateUI() {
        const settings = getSettings();
        const enabledEl = document.getElementById('outfit_tracker_enabled');
        const currentEl = document.getElementById('outfit_tracker_current');
        const debugEl = document.getElementById('outfit_tracker_debug');
        if (enabledEl) enabledEl.checked = settings.enabled;
        if (currentEl) currentEl.value = settings.current_outfit || '';
        if (debugEl) debugEl.checked = settings.debug || false;
        updateStatusBadge();
    }

    function parseOutfitTag(text) {
        const match = text.match(OUTFIT_REGEX);
        return match ? match[1].trim() : null;
    }

    function stripOutfitTag(text) {
        return text.replace(/\s*\[OUTFIT_CHANGE:[^\]]*\]/gi, '').trim();
    }

    function onMessageReceived(messageId) {
        const settings = getSettings();
        if (!settings.enabled) return;

        const context = window.SillyTavern ? window.SillyTavern.getContext() : null;
        if (!context || !context.chat) return;

        const message = context.chat[messageId];
        if (!message || message.is_user) return;

        const rawText = message.mes;
        const outfit = parseOutfitTag(rawText);

        if (outfit) {
            message.mes = stripOutfitTag(rawText);
            saveOutfitState(outfit);
        }
    }

    function renderPanel() {
        const container = document.getElementById('extensions_settings');
        if (!container) return;

        const panel = document.createElement('div');
        panel.id = 'outfit_tracker_panel';
        panel.innerHTML = `
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Outfit State Tracker</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content" style="padding:10px 0;">

                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                        <input type="checkbox" id="outfit_tracker_enabled"/>
                        <label for="outfit_tracker_enabled" style="color:#e2e8f0;">Enabled</label>
                    </div>

                    <div style="margin-bottom:8px;">
                        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Current outfit:</div>
                        <span id="outfit_tracker_badge" style="font-size:11px;"></span>
                    </div>

                    <div style="margin-bottom:8px;">
                        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Override / set manually:</div>
                        <input type="text" id="outfit_tracker_current"
                            placeholder="e.g. red dress, heels, no jacket"
                            style="width:100%;background:#1e293b;color:#e2e8f0;border:1px solid #334155;
                                   border-radius:4px;padding:5px 8px;font-size:12px;"/>
                    </div>

                    <div style="display:flex;gap:8px;margin-bottom:10px;">
                        <button id="outfit_tracker_save_btn" class="menu_button">Save</button>
                        <button id="outfit_tracker_clear_btn" class="menu_button">Clear</button>
                    </div>

                    <div style="display:flex;align-items:center;gap:8px;">
                        <input type="checkbox" id="outfit_tracker_debug"/>
                        <label for="outfit_tracker_debug" style="font-size:11px;color:#94a3b8;">Debug toasts</label>
                    </div>

                </div>
            </div>`;

        container.appendChild(panel);

        // События
        document.getElementById('outfit_tracker_enabled').addEventListener('change', function () {
            getSettings().enabled = this.checked;
            saveSettings();
            injectOutfitPrompt();
        });

        document.getElementById('outfit_tracker_save_btn').addEventListener('click', function () {
            const val = document.getElementById('outfit_tracker_current').value.trim();
            if (val) saveOutfitState(val);
        });

        document.getElementById('outfit_tracker_clear_btn').addEventListener('click', function () {
            const settings = getSettings();
            settings.current_outfit = '';
            document.getElementById('outfit_tracker_current').value = '';
            saveSettings();
            if (window.setExtensionPrompt) window.setExtensionPrompt(PROMPT_KEY, '', settings.inject_position, 0);
            updateStatusBadge();
        });

        document.getElementById('outfit_tracker_debug').addEventListener('change', function () {
            getSettings().debug = this.checked;
            saveSettings();
        });

        updateUI();
    }

    function init() {
        console.log('[OutfitTracker] Initializing...');

        renderPanel();
        injectOutfitPrompt();

        // Подписка на события через eventSource
        if (window.eventSource && window.event_types) {
            window.eventSource.on(window.event_types.MESSAGE_RECEIVED, onMessageReceived);
            window.eventSource.on(window.event_types.CHAT_LOADED, injectOutfitPrompt);
            window.eventSource.on(window.event_types.CHAT_CHANGED, injectOutfitPrompt);
            console.log('[OutfitTracker] Event listeners attached');
        } else {
            console.warn('[OutfitTracker] eventSource not available, retrying in 2s...');
            setTimeout(init, 2000);
            return;
        }

        console.log('[OutfitTracker] Ready');
    }

    // Запуск после загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 500);
    }

})();
