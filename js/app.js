/**
 * Main Application Orchestrator for My Heart Treasury.
 */

/**
 * Offline-Ready Geolocation Controller
 */
const LocationController = {
    // Captures device latitude & longitude via hardware GPS (Works 100% offline)
    async getCurrentLocation() {
        if (!('geolocation' in navigator)) {
            console.warn('Geolocation is not supported by this browser.');
            return null;
        }

        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude, accuracy } = position.coords;
                    resolve({
                        latitude,
                        longitude,
                        accuracy,
                        mapsUrl: `https://www.google.com/maps?q=${latitude},${longitude}`,
                        timestamp: Date.now()
                    });
                },
                (error) => {
                    console.warn(`Geolocation error (${error.code}): ${error.message}`);
                    resolve(null); // Graceful fallback if GPS is denied or unavailable
                },
                {
                    enableHighAccuracy: true, // Forces hardware GPS where available
                    timeout: 5000,           // 5-second max wait to prevent hangs
                    maximumAge: 0            // Forces fresh coordinates
                }
            );
        });
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    await TreasuryStorage.init();
    lucide.createIcons();

    // Register Service Worker for Offline PWA Support
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('Service Worker registered successfully with scope: ', registration.scope);
                })
                .catch(error => {
                    console.log('Service Worker registration failed: ', error);
                });
        });
    }

    // ==========================================
    // BIBLE STUDY MODULE
    // Isolated initialization: Bible errors must not interrupt Treasury startup.
    // Uses the flat-array JSON contract implemented by BibleController.
    // ==========================================
    function initializeBibleStudyModule() {
        const bibleStudyModal = document.getElementById('bibleStudyModal');
        const bibleVersionSelect = document.getElementById('bibleVersionSelect');
        const bibleReaderContent = document.getElementById('bibleReaderContent');
        const vodText = document.getElementById('vodText');
        const attachVodBtn = document.getElementById('attachVodBtn');
        const attachSelectedVersesBtn = document.getElementById('attachSelectedVersesBtn');
        const downloadVerseImgBtn = document.getElementById('downloadVerseImgBtn');
        const attachmentIndicator = document.getElementById('attachmentIndicator');
        const referenceElement = document.getElementById('bibleReadingReference');

        if (!bibleStudyModal || !bibleVersionSelect || !bibleReaderContent) {
            console.warn('[BibleViewer] Bible reader markup is incomplete. Core Treasury startup will continue.');
            return;
        }

        if (typeof BibleController === 'undefined' ||
            !Array.isArray(BibleController.versions) ||
            typeof BibleController.getVersionData !== 'function' ||
            typeof BibleController.getBooks !== 'function' ||
            typeof BibleController.getChapters !== 'function' ||
            typeof BibleController.getChapter !== 'function') {
            showReaderMessage('The Bible reader controller is unavailable. Please check that js/bible.js loads before js/app.js.');
            console.error('[BibleViewer] BibleController is missing or does not expose the required flat-array methods.');
            return;
        }

        let bibleBookSelect = document.getElementById('bibleBookSelect');
        let bibleChapterSelect = document.getElementById('bibleChapterSelect');
        let currentBibleBook = null;
        let currentBibleChapter = null;
        let selectedVerses = new Map();
        let selectionStatusElement = null;
        let readerRequestToken = 0;
        let verseOfDayRequestToken = 0;
        let currentVerseOfDay = null;
        let verseOfDayRefreshTimer = null;
        let highlightColorSelect = null;
        let applyHighlightButton = null;
        let removeHighlightButton = null;
        let highlightStatusElement = null;
        const BIBLE_VERSION_PREFERENCE_KEY = 'myHeartTreasury.selectedBibleVersion';
        const HIGHLIGHT_STYLE_MAP = {
            yellow: { backgroundColor: 'rgba(250, 204, 21, 0.22)', borderLeft: '3px solid #eab308' },
            green: { backgroundColor: 'rgba(34, 197, 94, 0.20)', borderLeft: '3px solid #22c55e' },
            blue: { backgroundColor: 'rgba(59, 130, 246, 0.20)', borderLeft: '3px solid #3b82f6' },
            pink: { backgroundColor: 'rgba(236, 72, 153, 0.20)', borderLeft: '3px solid #ec4899' }
        };

        const selectClasses = 'w-full bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-rose-500';

        function showReaderMessage(message, detail) {
            if (!bibleReaderContent) return;
            bibleReaderContent.replaceChildren();

            const messageElement = document.createElement('p');
            messageElement.className = 'text-xs text-rose-300 italic py-4';
            messageElement.textContent = message;
            bibleReaderContent.appendChild(messageElement);

            if (detail) {
                const detailElement = document.createElement('p');
                detailElement.className = 'text-[11px] text-slate-400 pb-3';
                detailElement.textContent = detail;
                bibleReaderContent.appendChild(detailElement);
            }
        }

        function createSelectField(selectId, labelText) {
            const field = document.createElement('label');
            field.className = 'flex flex-col gap-1 min-w-0';

            const label = document.createElement('span');
            label.className = 'text-[10px] text-slate-400 font-semibold uppercase tracking-wide';
            label.textContent = labelText;

            const select = document.createElement('select');
            select.id = selectId;
            select.className = selectClasses;
            select.setAttribute('aria-label', labelText);

            field.append(label, select);
            return { field, select };
        }

        function setupBibleNavigationControls() {
            const toolbar = bibleVersionSelect.parentElement;
            if (!toolbar) {
                throw new Error('Bible version selector has no toolbar parent.');
            }

            // Add labels and the two navigation selectors without requiring an HTML-file change.
            toolbar.className = 'grid grid-cols-1 sm:grid-cols-3 gap-2 py-3 border-b border-slate-800/60';

            const versionField = document.createElement('label');
            versionField.className = 'flex flex-col gap-1 min-w-0';
            const versionLabel = document.createElement('span');
            versionLabel.className = 'text-[10px] text-slate-400 font-semibold uppercase tracking-wide';
            versionLabel.textContent = 'Translation';
            versionField.appendChild(versionLabel);
            versionField.appendChild(bibleVersionSelect);
            bibleVersionSelect.className = selectClasses;
            bibleVersionSelect.setAttribute('aria-label', 'Bible translation');
            toolbar.insertBefore(versionField, toolbar.firstChild);

            if (!bibleBookSelect) {
                const bookField = createSelectField('bibleBookSelect', 'Book');
                bibleBookSelect = bookField.select;
                toolbar.appendChild(bookField.field);
            }

            if (!bibleChapterSelect) {
                const chapterField = createSelectField('bibleChapterSelect', 'Chapter');
                bibleChapterSelect = chapterField.select;
                toolbar.appendChild(chapterField.field);
            }

            bibleBookSelect.className = selectClasses;
            bibleChapterSelect.className = selectClasses;
            bibleBookSelect.setAttribute('aria-label', 'Bible book');
            bibleChapterSelect.setAttribute('aria-label', 'Bible chapter');
        }

        function appendOptions(select, values, selectedValue) {
            select.replaceChildren();
            values.forEach((value) => {
                const option = document.createElement('option');
                option.value = String(value);
                option.textContent = String(value);
                select.appendChild(option);
            });

            if (values.some(value => String(value) === String(selectedValue))) {
                select.value = String(selectedValue);
            } else if (values.length > 0) {
                select.selectedIndex = 0;
            }
        }

        function getVersion(versionId) {
            return BibleController.versions.find(version => version.id === versionId) || null;
        }

        function loadPreferredBibleVersion() {
            try {
                const savedVersionId = localStorage.getItem(BIBLE_VERSION_PREFERENCE_KEY);
                if (savedVersionId && getVersion(savedVersionId)) {
                    BibleController.currentVersion = savedVersionId;
                }
            } catch (error) {
                console.warn('[BibleViewer] Could not read the saved Bible preference:', error);
            }
        }

        function savePreferredBibleVersion(versionId) {
            try {
                localStorage.setItem(BIBLE_VERSION_PREFERENCE_KEY, versionId);
            } catch (error) {
                console.warn('[BibleViewer] Could not save the Bible preference:', error);
            }
        }

        function getSelectedVersionLabel() {
            const version = getVersion(BibleController.currentVersion);
            return version ? version.name : BibleController.currentVersion;
        }

        function getSelectedVerseRows() {
            return Array.from(selectedVerses.entries())
                .map(([verse, text]) => ({ verse: Number(verse), text }))
                .sort((a, b) => a.verse - b.verse);
        }

        function updateVerseActionButtons() {
            const selected = getSelectedVerseRows();
            const canAttach = selected.length > 0;
            const canDownloadImage = selected.length === 1;

            if (attachSelectedVersesBtn) {
                attachSelectedVersesBtn.disabled = !canAttach;
                attachSelectedVersesBtn.style.opacity = canAttach ? '1' : '0.5';
                attachSelectedVersesBtn.style.cursor = canAttach ? 'pointer' : 'not-allowed';
                attachSelectedVersesBtn.title = canAttach
                    ? `${selected.length} verse(s) selected for attachment`
                    : 'Select at least one verse to attach';
            }

            if (downloadVerseImgBtn) {
                downloadVerseImgBtn.disabled = !canDownloadImage;
                downloadVerseImgBtn.style.opacity = canDownloadImage ? '1' : '0.5';
                downloadVerseImgBtn.style.cursor = canDownloadImage ? 'pointer' : 'not-allowed';
                downloadVerseImgBtn.title = canDownloadImage
                    ? 'Download an image of the selected verse'
                    : 'Select exactly one verse to create an image';
            }

            if (selectionStatusElement) {
                selectionStatusElement.textContent =
                    `${selected.length} verse(s) selected. Select one verse for an image, or one or more verses to attach or highlight.`;
            }

            if (applyHighlightButton) {
                applyHighlightButton.disabled = selected.length === 0;
                applyHighlightButton.style.opacity = selected.length > 0 ? '1' : '0.5';
            }
            if (removeHighlightButton) {
                removeHighlightButton.disabled = selected.length === 0;
                removeHighlightButton.style.opacity = selected.length > 0 ? '1' : '0.5';
            }
        }

        async function applyHighlightToSelected(remove = false) {
            const selected = getSelectedVerseRows();
            if (selected.length === 0) return;

            const methodName = remove ? 'removeHighlight' : 'saveHighlight';
            if (typeof BibleController[methodName] !== 'function') {
                if (highlightStatusElement) highlightStatusElement.textContent = 'Highlight storage is unavailable.';
                return;
            }

            const versionId = BibleController.currentVersion;
            const book = currentBibleBook;
            const chapter = currentBibleChapter;
            const color = highlightColorSelect ? highlightColorSelect.value : 'yellow';
            if (!remove && !BibleController.highlightColors.includes(color)) {
                if (highlightStatusElement) highlightStatusElement.textContent = 'Choose a valid highlight color.';
                return;
            }

            if (applyHighlightButton) applyHighlightButton.disabled = true;
            if (removeHighlightButton) removeHighlightButton.disabled = true;
            if (highlightStatusElement) highlightStatusElement.textContent = remove ? 'Removing highlights...' : 'Saving highlights...';

            try {
                for (const item of selected) {
                    if (remove) {
                        await BibleController.removeHighlight(versionId, book, chapter, item.verse);
                    } else {
                        await BibleController.saveHighlight(versionId, book, chapter, item.verse, color);
                    }
                }
                selectedVerses.clear();
                await renderChapter(++readerRequestToken);
                if (highlightStatusElement) {
                    highlightStatusElement.textContent = remove
                        ? `${selected.length} highlight(s) removed.`
                        : `${selected.length} verse(s) highlighted ${color}.`;
                }
            } catch (error) {
                console.error('[BibleViewer] Highlight operation failed:', error);
                if (highlightStatusElement) {
                    highlightStatusElement.textContent = 'Highlights could not be saved. Your Bible text remains unchanged.';
                }
                updateVerseActionButtons();
            }
        }

        function populateBibleVersions() {
            const validVersions = BibleController.versions.filter(version =>
                version && typeof version.id === 'string' && typeof version.file === 'string'
            );

            if (validVersions.length === 0) {
                throw new Error('No valid Bible translations are listed in BibleController.versions.');
            }

            // Populate the translation selector directly from the version catalog.
            bibleVersionSelect.replaceChildren();
            validVersions.forEach(version => {
                const option = document.createElement('option');
                option.value = version.id;
                option.textContent = `${version.name} (${version.lang || 'Language not specified'})`;
                bibleVersionSelect.appendChild(option);
            });

            loadPreferredBibleVersion();
            if (!getVersion(BibleController.currentVersion)) {
                BibleController.currentVersion = validVersions[0].id;
            }
            bibleVersionSelect.value = BibleController.currentVersion;
            savePreferredBibleVersion(BibleController.currentVersion);
        }

        function scheduleNextDailyVerseRefresh() {
            if (verseOfDayRefreshTimer !== null) clearTimeout(verseOfDayRefreshTimer);
            const now = new Date();
            const nextLocalMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
            const delay = Math.max(1000, nextLocalMidnight.getTime() - now.getTime());
            verseOfDayRefreshTimer = setTimeout(() => {
                renderVerseOfDay();
            }, delay);
        }

        async function renderVerseOfDay() {
            if (typeof BibleController.getVerseOfTheDay !== 'function') {
                currentVerseOfDay = null;
                if (vodText) vodText.textContent = 'Verse of the Day is unavailable.';
                return null;
            }

            const requestToken = ++verseOfDayRequestToken;
            const versionId = BibleController.currentVersion;
            if (vodText) vodText.textContent = `Loading today's verse from ${getSelectedVersionLabel()}...`;

            try {
                const verseOfDay = await BibleController.getVerseOfTheDay(versionId);
                if (requestToken !== verseOfDayRequestToken || versionId !== BibleController.currentVersion) return null;
                if (!verseOfDay || typeof verseOfDay.text !== 'string' || !verseOfDay.text.trim() ||
                    typeof verseOfDay.reference !== 'string' || !verseOfDay.reference.trim()) {
                    currentVerseOfDay = null;
                    if (vodText) vodText.textContent = `No valid Verse of the Day is available in ${getSelectedVersionLabel()}.`;
                    return null;
                }

                currentVerseOfDay = verseOfDay;
                if (vodText) {
                    vodText.textContent = `"${verseOfDay.text}" — ${verseOfDay.reference} (${getSelectedVersionLabel()})`;
                }
                scheduleNextDailyVerseRefresh();
                return verseOfDay;
            } catch (error) {
                console.error('[BibleViewer] Verse-of-the-day retrieval failed:', error);
                currentVerseOfDay = null;
                if (vodText) vodText.textContent = 'Unable to load the Verse of the Day from the selected translation.';
                return null;
            }
        }

        async function renderChapter(requestToken) {
            const versionId = BibleController.currentVersion;
            const version = getVersion(versionId);
            const versionName = version ? version.name : versionId;
            const book = currentBibleBook;
            const chapter = currentBibleChapter;

            selectedVerses.clear();
            selectionStatusElement = null;
            updateVerseActionButtons();

            if (!book || !Number.isSafeInteger(Number(chapter)) || Number(chapter) < 1) {
                showReaderMessage('Choose a valid book and chapter to read.');
                return;
            }

            if (referenceElement) referenceElement.textContent = `${book} ${chapter} (${versionName})`;
            bibleReaderContent.replaceChildren();
            const loadingMessage = document.createElement('p');
            loadingMessage.className = 'text-xs text-slate-400 text-center py-6';
            loadingMessage.textContent = `Loading ${book} ${chapter} (${versionName})...`;
            bibleReaderContent.appendChild(loadingMessage);

            try {
                const verses = await BibleController.getChapter(versionId, book, Number(chapter));
                if (requestToken !== readerRequestToken) return;

                if (!Array.isArray(verses)) {
                    showReaderMessage('The Bible controller returned an unsupported chapter result.');
                    return;
                }

                const chapterRecords = verses.filter(record =>
                    record &&
                    typeof record === 'object' &&
                    typeof record.book === 'string' &&
                    record.book.trim().toUpperCase() === book.trim().toUpperCase() &&
                    Number(record.chapter) === Number(chapter)
                );

                if (chapterRecords.length === 0) {
                    showReaderMessage(
                        `No verse records were found for ${book} ${chapter} in ${versionName}.`,
                        'The reader does not substitute text from another translation or invent missing verses.'
                    );
                    if (referenceElement) referenceElement.textContent = `${book} ${chapter} (${versionName})`;
                    return;
                }

                const rows = [];
                let invalidRecordCount = 0;
                chapterRecords.forEach(record => {
                    const verseNumber = Number(record.verse);
                    if (!Number.isSafeInteger(verseNumber) || verseNumber < 1) {
                        invalidRecordCount += 1;
                        return;
                    }
                    rows.push({
                        verse: verseNumber,
                        text: typeof record.text === 'string' ? record.text : null
                    });
                });

                rows.sort((a, b) => a.verse - b.verse);
                if (rows.length === 0) {
                    showReaderMessage(
                        `Records were found for ${book} ${chapter}, but none had a valid verse number.`,
                        'Check the JSON records for numeric verse fields.'
                    );
                    return;
                }

                let chapterHighlights = Object.create(null);
                if (typeof BibleController.getChapterHighlights === 'function') {
                    try {
                        chapterHighlights = await BibleController.getChapterHighlights(versionId, book, Number(chapter));
                    } catch (highlightError) {
                        console.warn('[BibleViewer] Saved highlights could not be loaded:', highlightError);
                        chapterHighlights = Object.create(null);
                    }
                    if (requestToken !== readerRequestToken) return;
                }

                const heading = document.createElement('h4');
                heading.className = 'font-bold text-rose-400 text-base mb-2';
                heading.textContent = `${book} Chapter ${chapter} (${versionName})`;

                const hint = document.createElement('p');
                hint.className = 'text-[10px] text-slate-500 mb-3';
                hint.textContent = 'Select verses to attach, create an image, or highlight. Highlights are saved separately for each translation.';

                const highlightToolbar = document.createElement('div');
                highlightToolbar.className = 'flex flex-wrap items-center gap-2 mb-3 p-2 rounded-xl bg-slate-800/60 border border-slate-700/70';

                highlightColorSelect = document.createElement('select');
                highlightColorSelect.className = 'bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-lg px-2 py-2';
                highlightColorSelect.setAttribute('aria-label', 'Highlight color');
                const colorLabels = [
                    ['yellow', 'Yellow'], ['green', 'Green'], ['blue', 'Blue'], ['pink', 'Pink']
                ];
                colorLabels.forEach(([value, label]) => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = label;
                    highlightColorSelect.appendChild(option);
                });

                applyHighlightButton = document.createElement('button');
                applyHighlightButton.type = 'button';
                applyHighlightButton.className = 'px-3 py-2 rounded-lg text-xs font-semibold bg-amber-500/20 text-amber-200 border border-amber-500/40';
                applyHighlightButton.textContent = 'Apply Highlight';
                applyHighlightButton.disabled = true;
                applyHighlightButton.addEventListener('click', () => applyHighlightToSelected(false));

                removeHighlightButton = document.createElement('button');
                removeHighlightButton.type = 'button';
                removeHighlightButton.className = 'px-3 py-2 rounded-lg text-xs font-semibold bg-slate-700 text-slate-200 border border-slate-600';
                removeHighlightButton.textContent = 'Remove Highlight';
                removeHighlightButton.disabled = true;
                removeHighlightButton.addEventListener('click', () => applyHighlightToSelected(true));

                highlightStatusElement = document.createElement('span');
                highlightStatusElement.className = 'text-[10px] text-slate-400';
                highlightStatusElement.setAttribute('aria-live', 'polite');
                if (typeof BibleController.getChapterHighlights !== 'function' ||
                    typeof BibleController.saveHighlight !== 'function' ||
                    typeof BibleController.removeHighlight !== 'function') {
                    highlightStatusElement.textContent = 'Highlight storage is not available in this controller.';
                    applyHighlightButton.disabled = true;
                    removeHighlightButton.disabled = true;
                }

                highlightToolbar.append(highlightColorSelect, applyHighlightButton, removeHighlightButton, highlightStatusElement);

                selectionStatusElement = document.createElement('p');
                selectionStatusElement.className = 'text-[10px] text-rose-300 mb-3';
                selectionStatusElement.setAttribute('aria-live', 'polite');

                bibleReaderContent.replaceChildren(heading, hint, highlightToolbar, selectionStatusElement);

                const verseFrequency = new Map();
                rows.forEach(row => verseFrequency.set(row.verse, (verseFrequency.get(row.verse) || 0) + 1));

                rows.forEach(row => {
                    const rowElement = document.createElement('label');
                    rowElement.className = 'flex items-start gap-2 text-xs text-slate-300 leading-relaxed mb-2 rounded-lg px-2 py-2 -mx-2 transition-colors';
                    rowElement.style.cursor = row.text && row.text.trim() && verseFrequency.get(row.verse) === 1 ? 'pointer' : 'default';
                    const savedColor = chapterHighlights[row.verse];
                    if (savedColor && HIGHLIGHT_STYLE_MAP[savedColor]) {
                        Object.assign(rowElement.style, HIGHLIGHT_STYLE_MAP[savedColor]);
                        rowElement.title = `Highlighted ${savedColor}`;
                    }

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'mt-1 shrink-0 accent-rose-500';
                    checkbox.value = String(row.verse);
                    checkbox.setAttribute('aria-label', `${book} ${chapter}:${row.verse}`);

                    const verseText = document.createElement('span');
                    verseText.className = 'min-w-0 whitespace-pre-wrap';

                    const verseNumber = document.createElement('strong');
                    verseNumber.className = 'text-rose-400 font-bold mr-1.5';
                    verseNumber.textContent = `${row.verse}`;
                    verseText.appendChild(verseNumber);

                    const bodyText = document.createElement('span');
                    if (typeof row.text === 'string' && row.text.trim().length > 0) {
                        bodyText.textContent = ` ${row.text}`;
                    } else {
                        bodyText.className = 'text-amber-300 italic';
                        bodyText.textContent = ' [Text unavailable in this translation file.]';
                        checkbox.disabled = true;
                        checkbox.title = 'This verse record has no text and cannot be selected.';
                    }

                    if (verseFrequency.get(row.verse) > 1) {
                        checkbox.disabled = true;
                        checkbox.title = 'Duplicate verse number in this chapter; selection is disabled to avoid an ambiguous reference.';
                        const duplicateNotice = document.createElement('span');
                        duplicateNotice.className = 'text-amber-300 italic';
                        duplicateNotice.textContent = ' [Duplicate verse number; selection disabled.]';
                        verseText.appendChild(duplicateNotice);
                    }

                    verseText.appendChild(bodyText);
                    rowElement.append(checkbox, verseText);
                    bibleReaderContent.appendChild(rowElement);

                    checkbox.addEventListener('change', () => {
                        if (checkbox.checked) {
                            selectedVerses.set(row.verse, row.text);
                        } else {
                            selectedVerses.delete(row.verse);
                        }
                        updateVerseActionButtons();
                    });
                });

                if (invalidRecordCount > 0) {
                    const warning = document.createElement('p');
                    warning.className = 'text-[10px] text-amber-300 mt-3';
                    warning.textContent = `${invalidRecordCount} record(s) were not displayed because the verse number was missing or invalid.`;
                    bibleReaderContent.appendChild(warning);
                }

                if (rows.some(row => typeof row.text !== 'string' || row.text.trim().length === 0)) {
                    const warning = document.createElement('p');
                    warning.className = 'text-[10px] text-amber-300 mt-2';
                    warning.textContent = 'One or more verse records have no text in this file. No replacement wording has been inserted.';
                    bibleReaderContent.appendChild(warning);
                }

                if (referenceElement) referenceElement.textContent = `${book} ${chapter} (${versionName})`;
                updateVerseActionButtons();
            } catch (error) {
                if (requestToken !== readerRequestToken) return;
                console.error('[BibleViewer] Chapter loading failed:', error);
                showReaderMessage(
                    `Unable to load ${book} ${chapter} from ${versionName}.`,
                    'Check the browser console and the translation JSON file for the specific error.'
                );
            }
        }

        async function loadChaptersForBook(preferredChapter) {
            const requestToken = ++readerRequestToken;
            const versionId = BibleController.currentVersion;
            const book = currentBibleBook;

            selectedVerses.clear();
            selectionStatusElement = null;
            currentBibleChapter = null;
            appendOptions(bibleChapterSelect, [], null);
            updateVerseActionButtons();

            try {
                const chapters = await BibleController.getChapters(versionId, book);
                if (requestToken !== readerRequestToken) return;

                if (!Array.isArray(chapters)) {
                    showReaderMessage('The Bible controller returned an invalid chapter list.');
                    return;
                }

                const validChapters = Array.from(new Set(chapters
                    .map(value => Number(value))
                    .filter(value => Number.isSafeInteger(value) && value > 0)))
                    .sort((a, b) => a - b);

                if (validChapters.length === 0) {
                    appendOptions(bibleChapterSelect, [], null);
                    showReaderMessage(`No chapters were found for ${book} in ${getSelectedVersionLabel()}.`);
                    return;
                }

                const chapterToRead = validChapters.includes(Number(preferredChapter))
                    ? Number(preferredChapter)
                    : validChapters[0];
                appendOptions(bibleChapterSelect, validChapters, chapterToRead);
                currentBibleChapter = chapterToRead;
                await renderChapter(requestToken);
            } catch (error) {
                if (requestToken !== readerRequestToken) return;
                console.error('[BibleViewer] Chapter navigation failed:', error);
                showReaderMessage(`Unable to load the chapter list for ${book}.`);
            }
        }

        async function loadVersionAndNavigation(preferredBook, preferredChapter) {
            const requestToken = ++readerRequestToken;
            const versionId = BibleController.currentVersion;
            const version = getVersion(versionId);

            selectedVerses.clear();
            selectionStatusElement = null;
            currentBibleBook = null;
            currentBibleChapter = null;
            appendOptions(bibleBookSelect, [], null);
            appendOptions(bibleChapterSelect, [], null);
            updateVerseActionButtons();
            showReaderMessage(`Loading ${version ? version.name : versionId}...`);

            try {
                const data = await BibleController.getVersionData(versionId);
                if (requestToken !== readerRequestToken) return;

                if (!Array.isArray(data)) {
                    showReaderMessage(
                        `The file for ${version ? version.name : versionId} is missing or is not a flat-array JSON file.`,
                        'Expected each verse record to contain book, chapter, verse, and text fields. No alternate translation will be substituted.'
                    );
                    return;
                }

                const hasValidFlatRecord = data.some(record =>
                    record &&
                    typeof record === 'object' &&
                    typeof record.book === 'string' &&
                    record.book.trim().length > 0 &&
                    Number.isSafeInteger(Number(record.chapter)) &&
                    Number(record.chapter) > 0 &&
                    Number.isSafeInteger(Number(record.verse)) &&
                    Number(record.verse) > 0 &&
                    typeof record.text === 'string'
                );

                if (!hasValidFlatRecord) {
                    showReaderMessage(
                        `The file for ${version ? version.name : versionId} does not contain recognizable flat-array verse records.`,
                        'Expected records shaped like { book, chapter, verse, text }. The reader will not guess another format.'
                    );
                    return;
                }

                const listedBooks = await BibleController.getBooks(versionId);
                if (requestToken !== readerRequestToken) return;
                if (!Array.isArray(listedBooks)) {
                    showReaderMessage(`The book list could not be read for ${version ? version.name : versionId}.`);
                    return;
                }

                const books = [];
                const seenBooks = new Set();
                listedBooks.forEach(value => {
                    if (typeof value !== 'string' || !value.trim()) return;
                    const cleanName = value.trim();
                    const key = cleanName.toLocaleUpperCase();
                    if (!seenBooks.has(key)) {
                        seenBooks.add(key);
                        books.push(cleanName);
                    }
                });

                if (books.length === 0) {
                    showReaderMessage(`No book names were found in ${version ? version.name : versionId}.`);
                    return;
                }

                const sameBook = books.find(name => name.toLocaleUpperCase() === String(preferredBook || '').trim().toLocaleUpperCase());
                const genesisBook = books.find(name => name.toLocaleUpperCase() === 'GENESIS');
                currentBibleBook = sameBook || genesisBook || books[0];
                appendOptions(bibleBookSelect, books, currentBibleBook);
                await loadChaptersForBook(preferredChapter);
            } catch (error) {
                if (requestToken !== readerRequestToken) return;
                console.error('[BibleViewer] Translation loading failed:', error);
                showReaderMessage(
                    `Unable to load ${version ? version.name : versionId}.`,
                    'Confirm that the JSON file exists under the app\'s bible/ folder and is valid JSON.'
                );
            }
        }

        function setAttachmentIndicator() {
            if (!attachmentIndicator) return;
            attachmentIndicator.textContent = 'Attached ✓';
            attachmentIndicator.classList.add('text-rose-400', 'font-bold');
        }

        setupBibleNavigationControls();
        populateBibleVersions();
        document.addEventListener('visibilitychange', () => {
            // Refresh only after the Bible feature has already been opened once;
            // this keeps the reader's translation JSON lazy-loaded at app startup.
            if (!document.hidden && currentVerseOfDay) renderVerseOfDay();
        });

        document.getElementById('openBibleModalBtn')?.addEventListener('click', async () => {
            bibleStudyModal.classList.remove('hidden');
            await renderVerseOfDay();
            await loadVersionAndNavigation(currentBibleBook, currentBibleChapter || 1);
            if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
                lucide.createIcons();
            }
        });

        document.getElementById('closeBibleModalBtn')?.addEventListener('click', () => {
            bibleStudyModal.classList.add('hidden');
        });

        bibleVersionSelect.addEventListener('change', async (event) => {
            const nextVersionId = event.target.value;
            if (!getVersion(nextVersionId)) {
                showReaderMessage('The selected Bible translation is not listed in BibleController.versions.');
                return;
            }
            BibleController.currentVersion = nextVersionId;
            savePreferredBibleVersion(nextVersionId);
            await renderVerseOfDay();
            await loadVersionAndNavigation(currentBibleBook, currentBibleChapter || 1);
        });

        bibleBookSelect.addEventListener('change', async (event) => {
            currentBibleBook = event.target.value;
            await loadChaptersForBook(currentBibleChapter || 1);
        });

        bibleChapterSelect.addEventListener('change', async (event) => {
            const chapter = Number(event.target.value);
            if (!Number.isSafeInteger(chapter) || chapter < 1) {
                showReaderMessage('Choose a valid chapter number.');
                return;
            }
            currentBibleChapter = chapter;
            await renderChapter(++readerRequestToken);
        });

        attachVodBtn?.addEventListener('click', async () => {
            try {
                if (typeof BibleController.getVerseOfTheDay !== 'function' ||
                    typeof MediaController === 'undefined' ||
                    typeof MediaController.setNoteAttachment !== 'function') {
                    throw new Error('Verse-of-the-day or attachment service is unavailable.');
                }

                const verseOfDay = await BibleController.getVerseOfTheDay(BibleController.currentVersion);
                if (!verseOfDay || typeof verseOfDay.text !== 'string' || !verseOfDay.text.trim() ||
                    typeof verseOfDay.reference !== 'string' || !verseOfDay.reference.trim()) {
                    throw new Error('No verified Verse-of-the-Day text is available in the selected translation.');
                }

                MediaController.setNoteAttachment(`Bible Verse (${verseOfDay.reference}; ${verseOfDay.versionName}): "${verseOfDay.text}"`);
                setAttachmentIndicator();
                await showAppModal({
                    title: 'Verse Attached',
                    message: `${verseOfDay.reference} attached to your heart deposit. Click 'Save Vault' to store it.`,
                    icon: '📖'
                });
            } catch (error) {
                console.error('[BibleViewer] Verse-of-the-day attachment failed:', error);
                await showAppModal({
                    title: 'Attachment Failed',
                    message: 'The Verse of the Day could not be attached. Please check the console for details.',
                    icon: '⚠️'
                });
            }
        });

        attachSelectedVersesBtn?.addEventListener('click', async () => {
            const selected = getSelectedVerseRows();
            if (selected.length === 0) {
                await showAppModal({
                    title: 'No Verses Selected',
                    message: 'Select one or more verses in the reader before attaching them.',
                    icon: '📖'
                });
                return;
            }

            if (typeof MediaController === 'undefined' || typeof MediaController.setNoteAttachment !== 'function') {
                await showAppModal({
                    title: 'Attachment Unavailable',
                    message: 'The app attachment service is unavailable. Your selected verses have not been attached.',
                    icon: '⚠️'
                });
                return;
            }

            const versionName = getSelectedVersionLabel();
            const verseNumbers = selected.map(item => item.verse).join(', ');
            const reference = `${currentBibleBook} ${currentBibleChapter}:${verseNumbers}`;
            const attachmentText = `Bible verses (${reference}; ${versionName}):\n${selected.map(item => `${item.verse}. ${item.text}`).join('\n')}`;

            try {
                MediaController.setNoteAttachment(attachmentText);
                setAttachmentIndicator();
                selectedVerses.clear();
                if (selectionStatusElement) selectionStatusElement.textContent = 'Verses attached.';
                updateVerseActionButtons();
                bibleStudyModal.classList.add('hidden');
                await showAppModal({
                    title: 'Verses Attached',
                    message: `${reference} (${versionName}) attached to your heart deposit. Click 'Save Vault' to store it.`,
                    icon: '📖'
                });
            } catch (error) {
                console.error('[BibleViewer] Selected-verse attachment failed:', error);
                await showAppModal({
                    title: 'Attachment Failed',
                    message: 'The selected verses could not be attached. Your Treasury data has not been changed by this reader action.',
                    icon: '⚠️'
                });
            }
        });

        downloadVerseImgBtn?.addEventListener('click', async () => {
            const selected = getSelectedVerseRows();
            if (selected.length !== 1) {
                await showAppModal({
                    title: 'Select One Verse',
                    message: 'Choose exactly one verse before downloading a verse image.',
                    icon: '🖼️'
                });
                return;
            }

            if (typeof BibleController.generateVerseImage !== 'function') {
                await showAppModal({
                    title: 'Image Export Unavailable',
                    message: 'The Bible image generator is unavailable. No image was created.',
                    icon: '⚠️'
                });
                return;
            }

            const verse = selected[0];
            const reference = `${currentBibleBook} ${currentBibleChapter}:${verse.verse}`;
            try {
                BibleController.generateVerseImage(verse.text, reference, getSelectedVersionLabel());
            } catch (error) {
                console.error('[BibleViewer] Verse image generation failed:', error);
                await showAppModal({
                    title: 'Image Export Failed',
                    message: 'The selected verse image could not be generated.',
                    icon: '⚠️'
                });
            }
        });

        // Keep actions unavailable until actual verse records have been loaded and selected.
        updateVerseActionButtons();
    }

    try {
        initializeBibleStudyModule();
    } catch (bibleInitError) {
        console.error('[BibleViewer] Initialization failed; the rest of My Heart Treasury will continue:', bibleInitError);
    }

    // App State & In-Memory Session PIN (Never saved to persistent storage)
    let currentHeartCount = 0;
    let selectedDurationHours = 24;
    let activeTimerInterval = null;
    let currentSelectedDateKey = null;
    let cachedSession = null;
    let sessionPin = null;

    // DOM References
    const savingsDateInput = document.getElementById('savingsDate');
    const sessionCountdown = document.getElementById('sessionCountdown');
    const heartCountBadge = document.getElementById('heartCountBadge');
    const tapHeartBtn = document.getElementById('tapHeartBtn');
    const saveTreasuryBtn = document.getElementById('saveTreasuryBtn');
    const particleCanvas = document.getElementById('particleCanvas');

    function getTodayLocalDate() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    if (savingsDateInput) {
        savingsDateInput.value = getTodayLocalDate();
    }

    function showAppModal({ title, message, icon = '✨', isPrompt = false, isConfirm = false, inputPlaceholder = '••••', inputType = 'password' }) {
        return new Promise((resolve) => {
            const modal = document.getElementById('appModal');
            const titleEl = document.getElementById('appModalTitle');
            const descEl = document.getElementById('appModalDesc');
            const iconEl = document.getElementById('appModalIcon');
            const inputEl = document.getElementById('appModalInput');
            const okBtn = document.getElementById('appModalOkBtn');
            const cancelBtn = document.getElementById('appModalCancelBtn');

            if (!modal) {
                resolve(isPrompt ? null : true);
                return;
            }

            titleEl.textContent = title;
            descEl.textContent = message;
            iconEl.textContent = icon;

            if (isPrompt) {
                inputEl.classList.remove('hidden');
                inputEl.type = inputType;
                inputEl.placeholder = inputPlaceholder;
                inputEl.value = '';
                setTimeout(() => inputEl.focus(), 50);
            } else {
                inputEl.classList.add('hidden');
            }

            if (isConfirm || isPrompt) {
                cancelBtn.classList.remove('hidden');
            } else {
                cancelBtn.classList.add('hidden');
            }

            modal.classList.remove('hidden');

            const cleanup = () => {
                modal.classList.add('hidden');
                okBtn.onclick = null;
                cancelBtn.onclick = null;
                inputEl.onkeydown = null;
            };

            okBtn.onclick = () => {
                const val = inputEl.value;
                cleanup();
                resolve(isPrompt ? val : true);
            };

            cancelBtn.onclick = () => {
                cleanup();
                resolve(isPrompt ? null : false);
            };

            inputEl.onkeydown = (e) => {
                if (e.key === 'Enter') okBtn.click();
            };
        });
    }

    // Google Drive Sync Setup
    const GOOGLE_CLIENT_ID = '493219318956-1r4ma1h1pp8qqjqf8djjfqrdhp2s6us4.apps.googleusercontent.com';
    const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
    let tokenClient = null;
    let accessToken = null;

    function initGoogleAuth() {
        if (typeof google !== 'undefined' && google.accounts) {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: DRIVE_SCOPE,
                callback: async (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        accessToken = tokenResponse.access_token;
                        await performDriveBackup();
                    }
                },
            });
        }
    }
    window.addEventListener('load', initGoogleAuth);

    document.getElementById('gdriveSyncBtn')?.addEventListener('click', () => {
        if (!tokenClient) initGoogleAuth();
        if (!accessToken) {
            tokenClient?.requestAccessToken({ prompt: 'consent' });
        } else {
            performDriveBackup();
        }
    });

    async function performDriveBackup() {
        try {
            const syncStatusText = document.getElementById('attachmentIndicator');
            if (syncStatusText) syncStatusText.textContent = "Syncing to Cloud...";

            const dbDump = await TreasuryStorage.getDatabase(sessionPin);
            const fileContent = JSON.stringify(dbDump, null, 2);

            const searchRes = await fetch(
                "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='treasury-backup.json'",
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const searchData = await searchRes.json();
            const existingFile = searchData.files && searchData.files[0];

            const metadata = {
                name: 'treasury-backup.json',
                mimeType: 'application/json',
                parents: existingFile ? [] : ['appDataFolder']
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', new Blob([fileContent], { type: 'application/json' }));

            let uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
            let method = 'POST';

            if (existingFile) {
                uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`;
                method = 'PATCH';
            }

            const uploadRes = await fetch(uploadUrl, {
                method: method,
                headers: { Authorization: `Bearer ${accessToken}` },
                body: form
            });

            if (uploadRes.ok) {
                if (syncStatusText) syncStatusText.textContent = "Attach";
                await showAppModal({
                    title: "Sync Successful",
                    message: "✨ Your treasury backup has been securely saved to your Google Drive App Folder!",
                    icon: "☁️"
                });
            } else {
                throw new Error(`Upload failed with status ${uploadRes.status}`);
            }
        } catch (err) {
            console.error('Google Drive Sync Error:', err);
            const syncStatusText = document.getElementById('attachmentIndicator');
            if (syncStatusText) syncStatusText.textContent = "Attach";
            await showAppModal({
                title: "Sync Failed",
                message: "⚠️ Could not complete Google Drive sync. Please check your internet connection.",
                icon: "⚠️"
            });
        }
    }

    // ==========================================
    // 🔒 STRICT STARTUP PIN UNLOCK CHECK
    // ==========================================
    async function checkPinLock() {
        const savedPinToken = await TreasuryStorage.getPin();
        const pinModal = document.getElementById('pinLockModal');
        const pinInput = document.getElementById('pinInput');
        const submitPinBtn = document.getElementById('submitPinBtn');

        if (savedPinToken && pinModal) {
            pinModal.classList.remove('hidden');
            document.getElementById('pinModalTitle').textContent = "Unlock Your Treasury";
            document.getElementById('pinModalDesc').textContent = "Enter your PIN code to access your vault.";
            submitPinBtn.textContent = "Unlock";

            return new Promise((resolve) => {
                const handleUnlock = async () => {
                    const enteredPin = pinInput ? pinInput.value : '';
                    const isValid = await TreasuryStorage.verifyPin(enteredPin);

                    if (isValid) {
                        sessionPin = enteredPin; // Store ONLY in memory
                        pinModal.classList.add('hidden');
                        if (pinInput) pinInput.value = '';
                        resolve();
                    } else {
                        await showAppModal({
                            title: "Incorrect PIN",
                            message: "⚠️ Incorrect PIN. Please try again.",
                            icon: "⚠️"
                        });
                        if (pinInput) pinInput.value = '';
                    }
                };

                submitPinBtn.onclick = handleUnlock;
                if (pinInput) {
                    pinInput.onkeydown = (e) => {
                        if (e.key === 'Enter') handleUnlock();
                    };
                }
            });
        }
    }
    await checkPinLock();

    // ==========================================
    // 🛡️ STRICT PIN SETTINGS & CHANGE MANAGEMENT
    // ==========================================
    document.getElementById('openPinSettingsBtn')?.addEventListener('click', async () => {
        const currentPinToken = await TreasuryStorage.getPin();
        
        if (currentPinToken) {
            const enteredCurrent = await showAppModal({
                title: "Verify Current PIN",
                message: "Enter your CURRENT PIN to proceed with changes:",
                icon: "🔒",
                isPrompt: true,
                inputPlaceholder: "••••"
            });
            if (enteredCurrent === null) return;

            const isCurrentValid = await TreasuryStorage.verifyPin(enteredCurrent);
            if (!isCurrentValid) {
                await showAppModal({
                    title: "Incorrect PIN",
                    message: "⚠️ Incorrect current PIN. Action cancelled.",
                    icon: "⚠️"
                });
                return;
            }

            const actionChoice = await showAppModal({
                title: "PIN Management",
                message: "Click OK to Change your PIN.\nClick Cancel to Remove PIN protection completely.",
                icon: "🛡️",
                isConfirm: true
            });

            if (actionChoice) {
                const newPin = await showAppModal({
                    title: "Set New PIN",
                    message: "Enter a new 4 to 6-digit numerical PIN code:",
                    icon: "🔑",
                    isPrompt: true,
                    inputPlaceholder: "4-6 digits"
                });
                if (newPin === null) return;

                if (/^\d{4,6}$/.test(newPin)) {
                    await TreasuryStorage.setPin(newPin, enteredCurrent);
                    sessionPin = newPin;
                    await showAppModal({
                        title: "Success",
                        message: "✨ PIN updated successfully and vault encrypted!",
                        icon: "✨"
                    });
                } else {
                    await showAppModal({
                        title: "Invalid PIN",
                        message: "⚠️ Please enter a valid 4 to 6-digit numerical code.",
                        icon: "⚠️"
                    });
                }
            } else {
                const confirmRemoval = await showAppModal({
                    title: "Remove PIN Protection",
                    message: "⚠️ Are you sure you want to completely remove PIN protection?",
                    icon: "🔓",
                    isConfirm: true
                });
                if (confirmRemoval) {
                    await TreasuryStorage.removePin(enteredCurrent);
                    sessionPin = null;
                    await showAppModal({
                        title: "Protection Removed",
                        message: "🔒 PIN protection removed successfully.",
                        icon: "🔒"
                    });
                }
            }
        } else {
            const newPin = await showAppModal({
                title: "Set New PIN",
                message: "Enter a 4 to 6-digit numerical PIN code to protect your vault:",
                icon: "🔑",
                isPrompt: true,
                inputPlaceholder: "4-6 digits"
            });
            if (newPin === null) return;

            if (/^\d{4,6}$/.test(newPin)) {
                await TreasuryStorage.setPin(newPin);
                sessionPin = newPin;
                await showAppModal({
                    title: "Success",
                    message: "✨ PIN created successfully and vault encrypted!",
                    icon: "✨"
                });
            } else {
                await showAppModal({
                    title: "Invalid PIN",
                    message: "⚠️ Please enter a valid 4 to 6-digit numerical code.",
                    icon: "⚠️"
                });
            }
        }
    });

    // Session & Countdown
    async function initSession() {
        cachedSession = await TreasuryStorage.getActiveSession();
        if (!cachedSession) {
            const targetTime = Date.now() + selectedDurationHours * 3600 * 1000;
            cachedSession = { targetTime, duration: selectedDurationHours };
            await TreasuryStorage.setActiveSession(cachedSession);
        }
        updateCountdownDisplay();
    }

    function updateCountdownDisplay() {
        if (!cachedSession || !sessionCountdown) return;

        const diff = Math.max(0, Math.floor((cachedSession.targetTime - Date.now()) / 1000));
        const hours = Math.floor(diff / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;

        sessionCountdown.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    await initSession();
    clearInterval(activeTimerInterval);
    activeTimerInterval = setInterval(updateCountdownDisplay, 1000);

    // Duration Selector Buttons
    document.querySelectorAll('.btn-duration').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            document.querySelectorAll('.btn-duration').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            selectedDurationHours = parseInt(e.target.dataset.duration);
            
            const targetTime = Date.now() + selectedDurationHours * 3600 * 1000;
            cachedSession = { targetTime, duration: selectedDurationHours };
            await TreasuryStorage.setActiveSession(cachedSession);
            updateCountdownDisplay();
        });
    });

    // Heart Counter & Particles
    tapHeartBtn?.addEventListener('click', (e) => {
        currentHeartCount++;
        if (heartCountBadge) heartCountBadge.textContent = `${currentHeartCount} ${currentHeartCount === 1 ? 'Heart' : 'Hearts'}`;
        AudioController.playHeartPop();
        spawnFloatingHeart(e);
    });

    function spawnFloatingHeart(event) {
        if (!particleCanvas) return;
        const particle = document.createElement('div');
        particle.textContent = '❤️';
        particle.style.position = 'absolute';
        
        const rect = particleCanvas.getBoundingClientRect();
        particle.style.left = `${event.clientX - rect.left}px`;
        particle.style.top = `${event.clientY - rect.top}px`;
        particle.style.fontSize = `${Math.random() * 16 + 16}px`;
        particle.style.pointerEvents = 'none';
        particle.style.transition = 'all 1s ease-out';
        particle.style.opacity = '1';

        particleCanvas.appendChild(particle);

        requestAnimationFrame(() => {
            particle.style.transform = `translateY(-80px) scale(1.4)`;
            particle.style.opacity = '0';
        });

        setTimeout(() => particle.remove(), 1000);
    }

    // Save Treasury Entry (Includes Automatic Offline Location Tagging)
    saveTreasuryBtn?.addEventListener('click', async () => {
        if (currentHeartCount === 0) {
            await showAppModal({
                title: "Empty Treasury",
                message: "Tap the heart to collect acts of kindness, love & forgiveness first!",
                icon: "❤️"
            });
            return;
        }

        const dateKey = savingsDateInput ? savingsDateInput.value : getTodayLocalDate();
        
        // Automatically capture hardware GPS coordinates (works offline)
        const locationData = await LocationController.getCurrentLocation();

        const sessionPayload = {
            hearts: currentHeartCount,
            attachment: {
                ...(MediaController.pendingAttachment || {}),
                location: locationData // Automatically embedded in attachment payload
            }
        };

        await TreasuryStorage.saveDayEntry(dateKey, sessionPayload, sessionPin);

        const locationNotice = locationData ? "\n📍 Location tagged!" : "";
        await showAppModal({
            title: "Treasury Saved",
            message: `Successfully deposited ${currentHeartCount} ${currentHeartCount === 1 ? 'heart' : 'hearts'} to ${dateKey}! ✨${locationNotice}`,
            icon: "🌟"
        });
        
        currentHeartCount = 0;
        if (heartCountBadge) heartCountBadge.textContent = "0 Hearts";
        MediaController.pendingAttachment = null;
        const indicator = document.getElementById('attachmentIndicator');
        if (indicator) indicator.textContent = "Attach";
    });

    // ==========================================
    // 📎 ATTACHMENT MODAL WIRING & PREVIEW HANDLERS
    // ==========================================
    const attachmentModal = document.getElementById('attachmentModal');
    const calendarModal = document.getElementById('calendarModal');
    const timelineModal = document.getElementById('timelineModal');

    document.getElementById('openAttachmentModalBtn')?.addEventListener('click', () => {
        attachmentModal?.classList.remove('hidden');
    });

    document.getElementById('closeAttachmentModalBtn')?.addEventListener('click', () => {
        attachmentModal?.classList.add('hidden');
    });

    const photoInput = document.getElementById('photoInput');
    const heartNoteInput = document.getElementById('heartNoteInput');
    const mediaPreviewBox = document.getElementById('mediaPreviewBox');
    const previewContent = document.getElementById('previewContent');
    const clearMediaBtn = document.getElementById('clearMediaBtn');
    const confirmAttachmentBtn = document.getElementById('confirmAttachmentBtn');
    const attachmentIndicator = document.getElementById('attachmentIndicator');
    const startRecorderBtn = document.getElementById('startRecorderBtn');
    const cameraViewportContainer = document.getElementById('cameraViewportContainer');
    const cameraPreview = document.getElementById('cameraPreview');
    const recordProgress = document.getElementById('recordProgress');

    // Handle Photo Selection & Compression Preview
    photoInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        MediaController.readImageFile(file, (attachment) => {
            if (attachment && attachment.dataUrl) {
                previewContent.innerHTML = `<img src="${attachment.dataUrl}" class="w-full h-32 object-cover rounded-lg">`;
                mediaPreviewBox.classList.remove('hidden');
            }
        });
    });

  // Preserve an existing photo or video when adding a note.
heartNoteInput?.addEventListener('input', (e) => {
    const text = e.target.value.trim();
    const attachment = MediaController.pendingAttachment;

    if (
        attachment &&
        (attachment.type === 'photo' ||
         attachment.type === 'video')
    ) {
        if (text) {
            attachment.note = text;
        } else {
            delete attachment.note;
        }
    } else {
        MediaController.setNoteAttachment(text);
    }
});

    // Handle 3s Video Recording Trigger
    startRecorderBtn?.addEventListener('click', async () => {
        cameraViewportContainer?.classList.remove('hidden');
        await MediaController.startThreeSecondRecording(cameraPreview, recordProgress, (attachment) => {
            cameraViewportContainer?.classList.add('hidden');
            if (attachment && attachment.dataUrl) {
               const videoPreview = document.createElement('video');
                videoPreview.src = attachment.dataUrl;
                videoPreview.controls = true;
                videoPreview.playsInline = true;
                videoPreview.className = 'w-full h-32 object-cover rounded-lg';

                previewContent.replaceChildren(videoPreview);
                mediaPreviewBox.classList.remove('hidden');
            }
        });
    });

    // Clear Media Preview
    clearMediaBtn?.addEventListener('click', () => {
        MediaController.clear();
        mediaPreviewBox?.classList.add('hidden');
        if (previewContent) previewContent.innerHTML = '';
        if (photoInput) photoInput.value = '';
    });

    // Confirm Attachment Button (Saves to pending state & closes modal)
    confirmAttachmentBtn?.addEventListener('click', () => {
        const noteText = heartNoteInput?.value?.trim() || '';

        if (noteText && MediaController.pendingAttachment) {
            MediaController.pendingAttachment.note = noteText;
        } else if (noteText && !MediaController.pendingAttachment) {
            MediaController.setNoteAttachment(noteText);
        }

        if (MediaController.pendingAttachment) {
            if (attachmentIndicator) {
                attachmentIndicator.textContent = "Attached ✓";
                attachmentIndicator.classList.add('text-rose-400', 'font-bold');
            }
        } else {
            if (attachmentIndicator) {
                attachmentIndicator.textContent = "Attach";
                attachmentIndicator.classList.remove('text-rose-400', 'font-bold');
            }
        }

        attachmentModal?.classList.add('hidden');
    });

    document.getElementById('openCalendarBtn')?.addEventListener('click', async () => {
        calendarModal?.classList.remove('hidden');
        await renderCalendar();
    });

    document.getElementById('closeCalendarModalBtn')?.addEventListener('click', () => {
        calendarModal?.classList.add('hidden');
    });

    document.getElementById('closeTimelineModalBtn')?.addEventListener('click', () => {
        timelineModal?.classList.add('hidden');
    });

    async function renderCalendar() {
        const grid = document.getElementById('calendarGrid');
        const monthLabel = document.getElementById('calendarMonthLabel');
        if (!grid) return;

        grid.innerHTML = '';
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        if (monthLabel) {
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            monthLabel.textContent = `${monthNames[month]} ${year} Treasury`;
        }

        const firstDayIndex = new Date(year, month, 1).getDay();
        const totalDays = new Date(year, month + 1, 0).getDate();
        const allEntries = await TreasuryStorage.getAllEntries(sessionPin);

        ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(d => {
            const headerCell = document.createElement('div');
            headerCell.className = 'text-center text-[10px] text-slate-500 font-bold py-1';
            headerCell.textContent = d;
            grid.appendChild(headerCell);
        });

        for (let i = 0; i < firstDayIndex; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'calendar-day-cell opacity-20 pointer-events-none';
            grid.appendChild(emptyCell);
        }

        for (let day = 1; day <= totalDays; day++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day-cell';
            const dayStr = String(day).padStart(2, '0');
            const monthStr = String(month + 1).padStart(2, '0');
            const dateKey = `${year}-${monthStr}-${dayStr}`;

            cell.innerHTML = `<span class="font-bold">${day}</span>`;

            if (allEntries[dateKey]) {
                cell.classList.add('has-data');
                const count = allEntries[dateKey].totalHearts || allEntries[dateKey].hearts || 0;
                const badge = document.createElement('span');
                badge.className = 'text-[9px] text-rose-300 font-semibold mt-0.5';
                badge.textContent = `${count}♥`;
                cell.appendChild(badge);
            }

            cell.addEventListener('click', () => {
                currentSelectedDateKey = dateKey;
                const titleEl = document.getElementById('selectedDateTitle');
                const countEl = document.getElementById('selectedDateHeartsCount');
                const viewBtn = document.getElementById('viewMemoriesBtn');

                if (titleEl) titleEl.textContent = dateKey;
                const entry = allEntries[dateKey];
                const hearts = entry ? (entry.totalHearts || entry.hearts || 0) : 0;
                if (countEl) countEl.textContent = `Total hearts: ${hearts}`;

                if (entry && (entry.attachment || hearts > 0)) {
                    viewBtn?.classList.remove('hidden');
                } else {
                    viewBtn?.classList.add('hidden');
                }
            });

            grid.appendChild(cell);
        }
        lucide.createIcons();
    }

    document.getElementById('viewMemoriesBtn')?.addEventListener('click', async () => {
        if (!currentSelectedDateKey) return;
        const allEntries = await TreasuryStorage.getAllEntries(sessionPin);
        const entry = allEntries[currentSelectedDateKey];
        if (!entry) return;

        const timelineList = document.getElementById('timelineList');
        const timelineTitle = document.getElementById('timelineModalTitle');
        if (timelineTitle) timelineTitle.textContent = `Memories for ${currentSelectedDateKey}`;
        if (timelineList) {
            timelineList.innerHTML = '';
            
            const card = document.createElement('div');
            card.className = 'bg-slate-800/80 p-4 rounded-xl border border-slate-700 space-y-2';
            
            const heartsCount = entry.totalHearts || entry.hearts || 0;
            card.innerHTML = `
                <div class="flex justify-between items-center text-xs text-rose-400 font-semibold">
                    <span>❤️ ${heartsCount} Hearts Collected</span>
                </div>
            `;

            // RENDER GOOGLE MAPS LINK IF LOCATION EXISTS AT ROOT ATTACHMENT
            const rootLocation = entry.attachment?.location;
            if (rootLocation && rootLocation.mapsUrl) {
                const locBtn = document.createElement('a');
                locBtn.href = rootLocation.mapsUrl;
                locBtn.target = '_blank';
                locBtn.rel = 'noopener noreferrer';
                locBtn.className = 'inline-flex items-center gap-1 mt-2 px-2.5 py-1 text-[11px] font-medium text-rose-300 bg-rose-950/40 border border-rose-800/50 rounded-full hover:bg-rose-900/50 transition-colors';
                locBtn.innerHTML = `📍 View on Google Maps (${rootLocation.latitude.toFixed(4)}, ${rootLocation.longitude.toFixed(4)})`;
                card.appendChild(locBtn);
            }

            if (entry.entries && Array.isArray(entry.entries)) {
                entry.entries.forEach(sub => {
                    if (sub.note) {
                        const p = document.createElement('p');
                        p.className = 'text-xs text-slate-200 mt-1 italic';
                        p.textContent = `"${sub.note}"`;
                        card.appendChild(p);
                    }
                    if (sub.media && sub.media.dataUrl) {
                        if (sub.media.type === 'photo') {
                            const img = document.createElement('img');
                            img.src = sub.media.dataUrl;
                            img.className = 'w-full h-36 object-cover rounded-lg mt-2';
                            card.appendChild(img);
                        } else if (sub.media.type === 'video') {
                            const vid = document.createElement('video');
                            vid.src = sub.media.dataUrl;
                            vid.controls = true;
                            vid.className = 'w-full h-36 object-cover rounded-lg mt-2';
                            card.appendChild(vid);
                        }
                    }

                    // RENDER GOOGLE MAPS LINK IF LOCATION EXISTS IN SUB-ENTRY
                    const subLocation = sub.location;
                    if (subLocation && subLocation.mapsUrl) {
                        const locBtn = document.createElement('a');
                        locBtn.href = subLocation.mapsUrl;
                        locBtn.target = '_blank';
                        locBtn.rel = 'noopener noreferrer';
                        locBtn.className = 'inline-flex items-center gap-1 mt-2 px-2.5 py-1 text-[11px] font-medium text-rose-300 bg-rose-950/40 border border-rose-800/50 rounded-full hover:bg-rose-900/50 transition-colors';
                        locBtn.innerHTML = `📍 View on Google Maps (${subLocation.latitude.toFixed(4)}, ${subLocation.longitude.toFixed(4)})`;
                        card.appendChild(locBtn);
                    }
                });
            }
            timelineList.appendChild(card);
        }

        timelineModal?.classList.remove('hidden');
        lucide.createIcons();
    });

    // Export & Import Handlers
    document.getElementById('exportBtn')?.addEventListener('click', async () => {
        await TreasuryStorage.exportData(sessionPin);
    });

    document.getElementById('importFileInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        TreasuryStorage.importData(file, sessionPin, async (success) => {
            if (success) {
                await showAppModal({
                    title: "Import Successful",
                    message: "✨ Your treasury backup has been successfully restored!",
                    icon: "📂"
                });
                location.reload();
            } else {
                await showAppModal({
                    title: "Import Failed",
                    message: "⚠️ The backup file is invalid or corrupted.",
                    icon: "⚠️"
                });
            }
        });
    });

    // Sound Toggle Handler
    let soundEnabled = true;
    document.getElementById('soundToggleBtn')?.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        AudioController.setEnabled(soundEnabled);
        const soundBtn = document.getElementById('soundToggleBtn');
        if (soundBtn) {
            soundBtn.innerHTML = `<i data-lucide="${soundEnabled ? 'volume-2' : 'volume-x'}" id="soundIcon"></i>`;
            lucide.createIcons();
        }
    });
});
