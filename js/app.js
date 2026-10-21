/**
 * Main Application Orchestrator for My Heart Treasury.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize IndexedDB singleton first to guarantee storage state
    await TreasuryStorage.init();

    // 2. Initialize icons
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

    // App State
    let currentHeartCount = 0;
    let selectedDurationHours = 24;
    let activeTimerInterval = null;
    let currentSelectedDateKey = null;
    let cachedSession = null;

    // DOM References
    const savingsDateInput = document.getElementById('savingsDate');
    const sessionCountdown = document.getElementById('sessionCountdown');
    const heartCountBadge = document.getElementById('heartCountBadge');
    const tapHeartBtn = document.getElementById('tapHeartBtn');
    const saveTreasuryBtn = document.getElementById('saveTreasuryBtn');
    const particleCanvas = document.getElementById('particleCanvas');

    // Function to get today's date in YYYY-MM-DD using local device timezone
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

    // Custom Designed Modal Utility (Replaces native browser alerts/prompts)
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

            // Configure input field for prompts
            if (isPrompt) {
                inputEl.classList.remove('hidden');
                inputEl.type = inputType;
                inputEl.placeholder = inputPlaceholder;
                inputEl.value = '';
                setTimeout(() => inputEl.focus(), 50);
            } else {
                inputEl.classList.add('hidden');
            }

            // Configure cancel button for confirms/prompts
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
                if (e.key === 'Enter') {
                    okBtn.click();
                }
            };
        });
    }

    // ==========================================
    // ☁️ GOOGLE DRIVE CLOUD SYNC & PERSISTENCE
    // ==========================================
    const GOOGLE_CLIENT_ID = '493219318956-1r4ma1h1pp8qqjqf8djjfqrdhp2s6us4.apps.googleusercontent.com';
    const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

    let tokenClient = null;
    let accessToken = null;

    async function initStoragePersistence() {
        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persist();
            console.log(`Storage persistence granted: ${isPersisted}`);
        }
    }
    initStoragePersistence();

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
        if (!tokenClient) {
            initGoogleAuth();
        }
        
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

            const dbDump = await TreasuryStorage.getDatabase();
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
    // 🔒 PIN LOCK & STARTUP CHECK
    // ==========================================
    async function checkPinLock() {
        const savedPinToken = await TreasuryStorage.getPin();
        const pinModal = document.getElementById('pinLockModal');
        const pinInput = document.getElementById('pinInput');
        const submitPinBtn = document.getElementById('submitPinBtn');

        // IF A PIN EXISTS IN STORAGE: MANDATORY UNLOCK PROMPT
        if (savedPinToken && pinModal) {
            pinModal.classList.remove('hidden');
            const titleEl = document.getElementById('pinModalTitle');
            const descEl = document.getElementById('pinModalDesc');
            if (titleEl) titleEl.textContent = "Unlock Your Treasury";
            if (descEl) descEl.textContent = "Enter your PIN code to access your vault.";
            if (submitPinBtn) submitPinBtn.textContent = "Unlock";

            const handleUnlock = async () => {
                const enteredPin = pinInput ? pinInput.value : '';
                const isValid = await TreasuryStorage.verifyPin(enteredPin);

                if (isValid) {
                    cachedSession = await TreasuryStorage.getActiveSession() || { targetTime: Date.now() + 24 * 3600 * 1000 };
                    cachedSession.pin = enteredPin;
                    await TreasuryStorage.setActiveSession(cachedSession);

                    pinModal.classList.add('hidden');
                    if (pinInput) pinInput.value = '';
                } else {
                    await showAppModal({
                        title: "Incorrect PIN",
                        message: "⚠️ Incorrect PIN. Please try again.",
                        icon: "⚠️"
                    });
                    if (pinInput) pinInput.value = '';
                }
            };

            if (submitPinBtn) submitPinBtn.onclick = handleUnlock;
            if (pinInput) {
                pinInput.onkeydown = (e) => {
                    if (e.key === 'Enter') handleUnlock();
                };
            }
        }
    }
    await checkPinLock();

    // ==========================================
    // 🛡️ PIN SETTINGS & CHANGE MANAGEMENT
    // ==========================================
    document.getElementById('openPinSettingsBtn')?.addEventListener('click', async () => {
        const currentPinToken = await TreasuryStorage.getPin();
        let verifiedOldPin = null;

        // RULE: IF A PIN IS ALREADY SET, DEMAND OLD PIN FIRST
        if (currentPinToken) {
            const enteredCurrent = await showAppModal({
                title: "Verify Current PIN",
                message: "Enter your CURRENT PIN to proceed with changes:",
                icon: "🔒",
                isPrompt: true,
                inputPlaceholder: "••••"
            });
            if (enteredCurrent === null) return; // User cancelled

            const isCurrentValid = await TreasuryStorage.verifyPin(enteredCurrent);
            if (!isCurrentValid) {
                await showAppModal({
                    title: "Incorrect PIN",
                    message: "⚠️ Incorrect current PIN. Action cancelled.",
                    icon: "⚠️"
                });
                return;
            }
            verifiedOldPin = enteredCurrent;

            // Ask whether to change or remove existing PIN
            const actionChoice = await showAppModal({
                title: "PIN Management",
                message: "Click OK to Change your PIN.\nClick Cancel to Remove PIN protection completely.",
                icon: "🛡️",
                isConfirm: true
            });

            if (actionChoice) {
                // Change PIN Flow
                const newPin = await showAppModal({
                    title: "Set New PIN",
                    message: "Enter a new 4 to 6-digit numerical PIN code:",
                    icon: "🔑",
                    isPrompt: true,
                    inputPlaceholder: "4-6 digits"
                });
                if (newPin === null) return;

                if (/^\d{4,6}$/.test(newPin)) {
                    await TreasuryStorage.setPin(newPin, verifiedOldPin);
                    cachedSession = await TreasuryStorage.getActiveSession() || { targetTime: Date.now() + 24 * 3600 * 1000 };
                    cachedSession.pin = newPin;
                    await TreasuryStorage.setActiveSession(cachedSession);

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
                // Remove PIN Flow
                const confirmRemoval = await showAppModal({
                    title: "Remove PIN Protection",
                    message: "⚠️ Are you sure you want to completely remove PIN protection?",
                    icon: "🔓",
                    isConfirm: true
                });
                if (confirmRemoval) {
                    await TreasuryStorage.removePin(verifiedOldPin);
                    cachedSession = await TreasuryStorage.getActiveSession();
                    if (cachedSession) {
                        delete cachedSession.pin;
                        await TreasuryStorage.setActiveSession(cachedSession);
                    }

                    await showAppModal({
                        title: "Protection Removed",
                        message: "🔒 PIN protection removed successfully.",
                        icon: "🔒"
                    });
                }
            }
        } else {
            // RULE: IF NO PIN IS SET, SET ONE UP DIRECTLY
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
                cachedSession = await TreasuryStorage.getActiveSession() || { targetTime: Date.now() + 24 * 3600 * 1000 };
                cachedSession.pin = newPin;
                await TreasuryStorage.setActiveSession(cachedSession);

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

    // Countdown Session Logic
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
            const currentPin = cachedSession ? cachedSession.pin : null;
            cachedSession = { targetTime, duration: selectedDurationHours, pin: currentPin };
            await TreasuryStorage.setActiveSession(cachedSession);
            updateCountdownDisplay();
        });
    });

    // Heart Counter & Particle Spawn
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

    // Save Treasury Entry
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
        const sessionPayload = {
            hearts: currentHeartCount,
            attachment: MediaController.pendingAttachment
        };

        await TreasuryStorage.saveDayEntry(dateKey, sessionPayload);

        await showAppModal({
            title: "Treasury Saved",
            message: `Successfully deposited ${currentHeartCount} ${currentHeartCount === 1 ? 'heart' : 'hearts'} to ${dateKey}! ✨`,
            icon: "🌟"
        });
        
        currentHeartCount = 0;
        if (heartCountBadge) heartCountBadge.textContent = "0 Hearts";
        MediaController.pendingAttachment = null;
        const indicator = document.getElementById('attachmentIndicator');
        if (indicator) indicator.textContent = "Attach";
    });

    // Attachment Modal Handlers
    const attachmentModal = document.getElementById('attachmentModal');
    
    document.getElementById('openAttachmentModalBtn')?.addEventListener('click', () => {
        attachmentModal?.classList.remove('hidden');
    });

    document.getElementById('closeAttachmentModalBtn')?.addEventListener('click', () => {
        attachmentModal?.classList.add('hidden');
    });

    document.getElementById('photoInput')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            MediaController.readImageFile(file, (media) => {
                setMediaPreview(media);
            });
        }
    });

    document.getElementById('startRecorderBtn')?.addEventListener('click', () => {
        const cameraBox = document.getElementById('cameraViewportContainer');
        const videoElem = document.getElementById('cameraPreview');
        const progressElem = document.getElementById('recordProgress');
        
        cameraBox?.classList.remove('hidden');
        
        MediaController.startThreeSecondRecording(videoElem, progressElem, (media) => {
            cameraBox?.classList.add('hidden');
            setMediaPreview(media);
        });
    });

    function setMediaPreview(media) {
        const previewBox = document.getElementById('mediaPreviewBox');
        const previewContent = document.getElementById('previewContent');
        if (!previewBox || !previewContent) return;

        previewBox.classList.remove('hidden');
        previewContent.innerHTML = '';

        if (media.type === 'photo') {
            const img = document.createElement('img');
            img.src = media.dataUrl;
            img.className = 'w-full h-32 object-cover rounded-md';
            previewContent.appendChild(img);
        } else {
            const video = document.createElement('video');
            video.src = media.dataUrl;
            video.controls = true;
            video.className = 'w-full h-32 object-cover rounded-md';
            previewContent.appendChild(video);
        }

        MediaController.activeMedia = media;
    }

    document.getElementById('clearMediaBtn')?.addEventListener('click', () => {
        MediaController.activeMedia = null;
        document.getElementById('mediaPreviewBox')?.classList.add('hidden');
    });

    document.getElementById('confirmAttachmentBtn')?.addEventListener('click', () => {
        const noteInput = document.getElementById('heartNoteInput');
        const noteText = noteInput ? noteInput.value.trim() : '';
        
        MediaController.pendingAttachment = {
            note: noteText,
            media: MediaController.activeMedia
        };

        const indicator = document.getElementById('attachmentIndicator');
        if (indicator) {
            indicator.textContent = (noteText || MediaController.activeMedia) ? "Attached ✓" : "Attach";
        }
        attachmentModal?.classList.add('hidden');
    });

    // Calendar & Timeline Handlers
    const calendarModal = document.getElementById('calendarModal');
    const timelineModal = document.getElementById('timelineModal');

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
        const allEntries = await TreasuryStorage.getAllEntries();

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
                const count = allEntries[dateKey].hearts || 0;
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
                const hearts = entry ? (entry.hearts || 0) : 0;
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
        const allEntries = await TreasuryStorage.getAllEntries();
        const entry = allEntries[currentSelectedDateKey];
        if (!entry) return;

        const timelineList = document.getElementById('timelineList');
        const timelineTitle = document.getElementById('timelineModalTitle');
        if (timelineTitle) timelineTitle.textContent = `Memories for ${currentSelectedDateKey}`;
        if (timelineList) {
            timelineList.innerHTML = '';
            
            const card = document.createElement('div');
            card.className = 'bg-slate-800/80 p-4 rounded-xl border border-slate-700 space-y-2';
            
            card.innerHTML = `
                <div class="flex justify-between items-center text-xs text-rose-400 font-semibold">
                    <span>❤️ ${entry.hearts || 0} Hearts Collected</span>
                </div>
            `;

            if (entry.attachment) {
                if (entry.attachment.note) {
                    const p = document.createElement('p');
                    p.className = 'text-xs text-slate-200 mt-1 italic';
                    p.textContent = `"${entry.attachment.note}"`;
                    card.appendChild(p);
                }
                if (entry.attachment.media) {
                    const m = entry.attachment.media;
                    if (m.type === 'photo' && m.dataUrl) {
                        const img = document.createElement('img');
                        img.src = m.dataUrl;
                        img.className = 'w-full h-36 object-cover rounded-lg mt-2';
                        card.appendChild(img);
                    } else if (m.type === 'video' && m.dataUrl) {
                        const vid = document.createElement('video');
                        vid.src = m.dataUrl;
                        vid.controls = true;
                        vid.className = 'w-full h-36 object-cover rounded-lg mt-2';
                        card.appendChild(vid);
                    }
                }
            }
            timelineList.appendChild(card);
        }

        timelineModal?.classList.remove('hidden');
        lucide.createIcons();
    });

    // Export & Import Handlers
    document.getElementById('exportBtn')?.addEventListener('click', async () => {
        const dbDump = await TreasuryStorage.getDatabase();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dbDump, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `my-heart-treasury-backup-${getTodayLocalDate()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    });

    document.getElementById('importFileInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                await TreasuryStorage.restoreDatabase(importedData);
                await showAppModal({
                    title: "Import Successful",
                    message: "✨ Your treasury backup has been successfully restored!",
                    icon: "📂"
                });
                location.reload();
            } catch (err) {
                console.error('Import error:', err);
                await showAppModal({
                    title: "Import Failed",
                    message: "⚠️ The backup file is invalid or corrupted.",
                    icon: "⚠️"
                });
            }
        };
        reader.readAsText(file);
    });

    // Sound Toggle Handler (Safely Re-creates Lucide Icon Element)
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
