// Outfit State Tracker — SillyTavern Extension v1.5

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

    // extension_settings доступен глобально через window, не через ctx()
    function getSettings() {
        if (!window.extension_settings) window.extension_settings = {};
        if (!window.extension_settings[EXT_NAME]) {
            window.extension_settings[EXT_NAME] = Object.assign({}, defaultSettings);
        }
        return window.extension_settings[EXT_NAME];
    }

    function saveSettings() {
        if (typeof window.saveSettingsDebounced === 'function') {
            window.saveSettingsDebounced();
        } else {
            const c = window.SillyTavern.getContext();
            if (c && typeof c.saveSettingsDebounced === 'function') c.saveSettingsDebounced();
        }
    }

    function injectOutfitPrompt() {
        const settings = getSettings();

        // setExtensionPrompt — ищем везде
        let setPrompt = window.setExtensionPrompt;
        if (!setPrompt) {
            const c = window.SillyTavern.getContext();
            setPrompt = c && c.setExtensionPrompt;
        }
        if (typeof setPrompt !== 'function') return;

        if (!settings.enabled || !settings.current_outfit) {
            setPrompt(PROMPT_KEY, '', settings.inject_position, 0);
            return;
        }

        const prompt = "[Character's current outfit: " + settings.current_outfit + "]";
        setPrompt(PROMPT_KEY, prompt, settings.inject_position, 0);

        if (settings.debug) console.log('[OutfitTracker] Injected: ' + prompt);
    }

    // Нормализация стейта одежды через LLM
    async function normalizeOutfit(rawOutfit) {
        try {
            const response = await fetch('http://localhost:1234/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'local-model',
                    max_tokens: 100,
                    temperature: 0.1,
                    messages: [{
                        role: 'user',
                        content: 'Convert the following clothing description into a comma-separated list of standard danbooru clothing tags. Output ONLY the tags, nothing else. No explanations. No sentences.\n\nRules:\n- Use standard danbooru tag names\n- If character is topless/shirtless/no top → include: topless\n- If no underwear/panties/bottomless → include: bottomless\n- If fully nude/naked → include: nude\n- List only what is currently worn or explicitly absent\n\nClothing description: ' + rawOutfit
                    }]
                })
            });

            const data = await response.json();
            const normalized = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            if (!normalized) return rawOutfit;

            const clean = normalized.trim().replace(/^["']|["']$/g, '');
            console.log('[OutfitTracker] Normalized: ' + rawOutfit + ' → ' + clean);
            return clean;
        } catch (e) {
            console.warn('[OutfitTracker] Normalization failed, using raw:', e);
            return rawOutfit;
        }
    }

    async function saveOutfitState(outfit) {
        const settings = getSettings();

        // Сначала показываем raw стейт
        settings.current_outfit = outfit;
        updateStatusBadge();

        // Нормализуем через LLM
        const normalized = await normalizeOutfit(outfit);
        settings.current_outfit = normalized;
        saveSettings();
        updateStatusBadge();
        injectOutfitPrompt();

        console.log('[OutfitTracker] Outfit saved: ' + normalized);
        if (settings.debug && window.toastr) {
            window.toastr.success('Outfit: ' + normalized, 'Outfit Tracker', { timeOut: 4000 });
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

    // Тихий анализ одежды через LLM
    async function analyzeOutfit(messageText, currentOutfit) {
        const prevOutfit = currentOutfit || 'unknown';
        try {
            const response = await fetch('http://localhost:1234/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'local-model',
                    max_tokens: 60,
                    temperature: 0.1,
                    messages: [{
                        role: 'user',
                        content: 'Analyze this roleplay message and determine if the character\'s clothing changed.\n\nCurrent outfit: ' + prevOutfit + '\n\nMessage: ' + messageText + '\n\nRespond ONLY with valid JSON, no explanation:\n{"changed": false} if clothing did not change\n{"changed": true, "outfit": "tag1, tag2, tag3"} if clothing changed\n\nFor outfit tags use danbooru style. List ONLY what is currently worn RIGHT NOW.\nIf topless → include "topless". If nude → include "nude". Do not list removed items.'
                    }]
                })
            });

            const data = await response.json();
            const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
            if (!content) return null;

            const clean = content.trim().replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(clean);

            if (parsed.changed && parsed.outfit) {
                console.log('[OutfitTracker] Analysis: outfit changed → ' + parsed.outfit);
                return parsed.outfit;
            }
            console.log('[OutfitTracker] Analysis: no change');
            return null;
        } catch (e) {
            console.warn('[OutfitTracker] Analysis failed:', e);
            return null;
        }
    }

    async function onMessageReceived(messageId) {
        const settings = getSettings();
        if (!settings.enabled) return;

        const c = window.SillyTavern.getContext();
        if (!c || !c.chat) return;

        const message = c.chat[messageId];
        if (!message || message.is_user) return;

        // Старый путь — тег в сообщении (fallback)
        const tagOutfit = parseOutfitTag(message.mes);
        if (tagOutfit) {
            message.mes = stripOutfitTag(message.mes);
            await saveOutfitState(tagOutfit);
            return;
        }

        // Новый путь — тихий анализ
        const analyzed = await analyzeOutfit(message.mes, settings.current_outfit);
        if (analyzed) {
            await saveOutfitState(analyzed);
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
            injectOutfitPrompt();
            updateStatusBadge();
        });

        document.getElementById('outfit_tracker_debug').addEventListener('change', function () {
            getSettings().debug = this.checked;
            saveSettings();
        });

        updateUI();
        console.log('[OutfitTracker] Panel rendered');
    }

    // Маппинг стейта одежды в nudity теги
    function getNudityTags(outfit) {
        const tags = [];
        const o = outfit.toLowerCase();

        const isTopless = /no shirt|no top|topless|bare chest|shirtless|no bra/.test(o);
        const isBottomless = /no panties|no underwear|bottomless|no shorts|no skirt|no pants/.test(o);
        const isNude = /^nude$|^naked$|no clothes|nothing/.test(o);

        if (isNude) {
            tags.push('nude');
        } else {
            if (isTopless) tags.push('topless');
            if (isBottomless) tags.push('bottomless');
        }
        return tags;
    }

    // Перехват SD промпта и добавление nudity тегов
    function onSdPromptProcessing(workflow) {
        const settings = getSettings();
        if (!settings.enabled || !settings.current_outfit) return;

        const nudityTags = getNudityTags(settings.current_outfit);
        if (nudityTags.length === 0) return;

        // Промпт находится в workflow.prompt — объект с нодами ComfyUI
        const prompt = workflow && workflow.prompt;
        if (!prompt || typeof prompt !== 'object') return;

        // Ищем позитивный CLIPTextEncode (node "6" — первый из двух)
        for (const key of Object.keys(prompt)) {
            const node = prompt[key];
            if (node.class_type === 'CLIPTextEncode' && node.inputs && typeof node.inputs.text === 'string') {
                const existing = node.inputs.text.toLowerCase();
                const toAdd = nudityTags.filter(tag => !existing.includes(tag));
                if (toAdd.length === 0) continue;

                // Добавляем только в позитивный промпт (не в негативный)
                // Негативный обычно содержит "worst quality" или похожее
                if (existing.includes('worst quality') || existing.includes('bad anatomy')) continue;

                node.inputs.text = node.inputs.text + ', ' + toAdd.join(', ');

                if (settings.debug) {
                    console.log('[OutfitTracker] Added to node ' + key + ': ' + toAdd.join(', '));
                }
            }
        }
    }


    function init() {
        console.log('[OutfitTracker] Initializing...');
        renderPanel();
        injectOutfitPrompt();

        const c = window.SillyTavern.getContext();
        if (!c || !c.eventSource || !c.event_types) {
            console.error('[OutfitTracker] eventSource not found in context');
            return;
        }

        c.eventSource.on(c.event_types.MESSAGE_RECEIVED, onMessageReceived);
        c.eventSource.on(c.event_types.MESSAGE_EDITED, onMessageReceived);
        c.eventSource.on(c.event_types.MESSAGE_UPDATED, onMessageReceived);
        c.eventSource.on(c.event_types.CHAT_LOADED, injectOutfitPrompt);
        c.eventSource.on(c.event_types.CHAT_CHANGED, injectOutfitPrompt);
        c.eventSource.on(c.event_types.SD_PROMPT_PROCESSING, onSdPromptProcessing);

        // Восстанавливаем UI после загрузки настроек расширений
        c.eventSource.on(c.event_types.EXTENSION_SETTINGS_LOADED, function () {
            updateUI();
            injectOutfitPrompt();
        });

        console.log('[OutfitTracker] Ready');
    }

    $(document).ready(function () {
        init();
    });

})();