// Outfit State Tracker — SillyTavern Extension v1.4
// Использует window.SillyTavern.getContext() для доступа к eventSource и API

(function () {
    if (window.__outfitTrackerLoaded) return;
    window.__outfitTrackerLoaded = true;

    const EXT_NAME = 'outfit-tracker';
    const PROMPT_KEY = 'outfit_state_inject';
    const OUTFIT_REGEX = /\[OUTFIT_CHANGE:\s*([^\]]+)\]/i;

    const defaultSettings = {
        enabled: true,
        current_outfit: '',
        inject_position: 1,
        debug: false,
    };

    function ctx() {
        return window.SillyTavern.getContext();
    }

    function getSettings() {
        const c = ctx();
        if (!c.extension_settings[EXT_NAME]) {
            c.extension_settings[EXT_NAME] = Object.assign({}, defaultSettings);
        }
        return c.extension_settings[EXT_NAME];
    }

    function saveSettings() {
        ctx().saveSettingsDebounced();
    }

    function injectOutfitPrompt() {
        const settings = getSettings();
        const c = ctx();
        if (typeof c.setExtensionPrompt !== 'function') return;

        if (!settings.enabled || !settings.current_outfit) {
            c.setExtensionPrompt(PROMPT_KEY, '', settings.inject_position, 0);
            return;
        }

        const prompt = "[Character's current outfit: " + settings.current_outfit + "]";
        c.setExtensionPrompt(PROMPT_KEY, prompt, settings.inject_position, 0);

        if (settings.debug) {
            console.log('[OutfitTracker] Injected: ' + prompt);
        }
    }

    function saveOutfitState(outfit) {
        const settings = getSettings();
        settings.current_outfit = outfit;
        saveSettings();
        updateStatusBadge();
        injectOutfitPrompt();
        console.log('[OutfitTracker] Outfit saved: ' + outfit);
        if (settings.debug && window.toastr) {
            window.toastr.success('Outfit updated: ' + outfit, 'Outfit Tracker', { timeOut: 3000 });
        }
    }

    function updateStatusBadge() {
        const settings = getSettings();
        const badge = document.getElementById('outfit_tracker_badge');
        if (!badge) return;
        if (settings.current_outfit) {
            const text = settings.current_outfit.length > 45
                ? settings.current_outfit.substring(0, 45) + '...'
                : settings.current_outfit;
            badge.textContent = '[OK] ' + text;
            badge.style.color = '#4ade80';
        } else {
            badge.textContent = 'not set';
            badge.style.color = '#94a3b8';
        }
    }

    function updateUI() {
        const settings = getSettings();
        const en = document.getElementById('outfit_tracker_enabled');
        const cur = document.getElementById('outfit_tracker_current');
        const dbg = document.getElementById('outfit_tracker_debug');
        if (en) en.checked = !!settings.enabled;
        if (cur) cur.value = settings.current_outfit || '';
        if (dbg) dbg.checked = !!settings.debug;
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

        const c = ctx();
        if (!c.chat) return;

        const message = c.chat[messageId];
        if (!message || message.is_user) return;

        const outfit = parseOutfitTag(message.mes);
        if (outfit) {
            message.mes = stripOutfitTag(message.mes);
            saveOutfitState(outfit);
        }
    }

    function renderPanel() {
        if (document.getElementById('outfit_tracker_panel')) return;
        const container = document.getElementById('extensions_settings');
        if (!container) return;

        const panel = document.createElement('div');
        panel.id = 'outfit_tracker_panel';
        panel.innerHTML =
            '<div class="inline-drawer">' +
            '<div class="inline-drawer-toggle inline-drawer-header">' +
            '<b>Outfit State Tracker</b>' +
            '<div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>' +
            '</div>' +
            '<div class="inline-drawer-content" style="padding:10px 0;">' +
            '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
            '<input type="checkbox" id="outfit_tracker_enabled"/>' +
            '<label for="outfit_tracker_enabled">Enabled</label>' +
            '</div>' +
            '<div style="margin-bottom:8px;">' +
            '<div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Current outfit:</div>' +
            '<span id="outfit_tracker_badge" style="font-size:11px;"></span>' +
            '</div>' +
            '<div style="margin-bottom:8px;">' +
            '<div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Set manually:</div>' +
            '<input type="text" id="outfit_tracker_current" placeholder="red dress, heels, no jacket"' +
            ' style="width:100%;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:4px;padding:5px 8px;font-size:12px;"/>' +
            '</div>' +
            '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
            '<button id="outfit_tracker_save_btn" class="menu_button">Save</button>' +
            '<button id="outfit_tracker_clear_btn" class="menu_button">Clear</button>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
            '<input type="checkbox" id="outfit_tracker_debug"/>' +
            '<label for="outfit_tracker_debug" style="font-size:11px;color:#94a3b8;">Debug toasts</label>' +
            '</div>' +
            '</div></div>';

        container.appendChild(panel);

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
            const s = getSettings();
            s.current_outfit = '';
            document.getElementById('outfit_tracker_current').value = '';
            saveSettings();
            ctx().setExtensionPrompt(PROMPT_KEY, '', s.inject_position, 0);
            updateStatusBadge();
        });

        document.getElementById('outfit_tracker_debug').addEventListener('change', function () {
            getSettings().debug = this.checked;
            saveSettings();
        });

        updateUI();
        console.log('[OutfitTracker] Panel rendered');
    }

    function init() {
        console.log('[OutfitTracker] Initializing...');
        renderPanel();
        injectOutfitPrompt();

        const c = ctx();
        const eventSource = c.eventSource;
        const event_types = c.event_types;

        if (!eventSource || !event_types) {
            console.error('[OutfitTracker] eventSource not found in context');
            return;
        }

        eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
        eventSource.on(event_types.CHAT_LOADED, injectOutfitPrompt);
        eventSource.on(event_types.CHAT_CHANGED, injectOutfitPrompt);

        console.log('[OutfitTracker] Ready');
    }

    // ST гарантированно готов когда jQuery fires document.ready
    $(document).ready(function () {
        init();
    });

})();