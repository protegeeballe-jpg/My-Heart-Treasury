/**
 * Media capture controller for notes, photos, and short video clips.
 */
const MediaController = {
    pendingAttachment: null,
    mediaRecorder: null,
    recordedChunks: [],

    async startThreeSecondRecording(videoElement, progressBarElement, onComplete) {
       this.recordedChunks = [];
        let stream = null;

        try {
    if (typeof MediaRecorder === 'undefined') {
        throw new Error('MediaRecorder is not supported in this browser.');
    }
            // Try to capture video and microphone audio.

            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true
                });
            } catch (audioError) {
                console.warn(
                    'Audio capture unavailable; trying video-only.',
                    audioError
                );

                // Keep video recording available if audio fails.
                stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });

                alert(
                    'Microphone access is unavailable. ' +
                    'This clip will be silent. Please check microphone permissions.'
                );
            }

            if (videoElement) {
                videoElement.srcObject = stream;
            }

            // Prefer a browser-supported format that can carry audio.
            const mimeTypes = [
                'video/mp4',
                'video/webm;codecs=vp8,opus',
                'video/webm;codecs=vp9,opus',
                'video/webm'
            ];

            let options = {};

            if (
                typeof MediaRecorder !== 'undefined' &&
                typeof MediaRecorder.isTypeSupported === 'function'
            ) {
                const supportedMimeType = mimeTypes.find(type => {
                    try {
                        return MediaRecorder.isTypeSupported(type);
                    } catch {
                        return false;
                    }
                });

                if (supportedMimeType) {
                    options = { mimeType: supportedMimeType };
                }
            }

            this.mediaRecorder = new MediaRecorder(stream, options);
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.recordedChunks.push(e.data);
            };

            this.mediaRecorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
                const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder.mimeType || 'video/webm' });
                const reader = new FileReader();

                reader.onloadend = () => {
                    const attachment = { type: 'video', dataUrl: reader.result };
                    this.pendingAttachment = attachment;
                    if (onComplete) onComplete(attachment);
                };

                reader.onerror = () => {
                    console.error("Video reading failed.");
                    if (onComplete) onComplete(null);
                };

                reader.readAsDataURL(blob);
            };

            this.mediaRecorder.start();

           
            // Use actual elapsed time for more consistent recording duration.
            const recordingDurationMs = 3200;
            const startedAt = performance.now();

            const interval = setInterval(() => {
                const elapsed = performance.now() - startedAt;
                const progress = Math.min(
                    (elapsed / recordingDurationMs) * 100,
                    100
                );

                if (progressBarElement) {
                    progressBarElement.style.width = `${progress}%`;
                }

                if (elapsed >= recordingDurationMs) {
                    clearInterval(interval);

                    const recorder = this.mediaRecorder;
                    if (recorder && recorder.state !== 'inactive') {
                        recorder.stop();
                    }
                }
            }, 50);

        } catch(err) {
            console.error('Camera access error:', err);
            alert('Camera access denied, unsupported, or unavailable on this browser.');
            if (onComplete) onComplete(null);
        }
    },

    readImageFile(file, onComplete) {
        // SAFETY GUARD 1: Prevent crash if file is missing or undefined
        if (!file) {
            if (onComplete) onComplete(null);
            return;
        }

        const reader = new FileReader();

        reader.onerror = () => {
            console.error("FileReader failed to read the image file.");
            if (onComplete) onComplete(null);
        };

        reader.onload = (e) => {
            const img = new Image();

            img.onerror = () => {
                console.error("Image decoding failed (corrupted or unsupported format).");
                alert('Invalid image format or corrupted file.');
                if (onComplete) onComplete(null);
            };

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Compress image to JPEG at 80% quality to eliminate storage bloat
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                const attachment = { type: 'photo', dataUrl: dataUrl };
                this.pendingAttachment = attachment;
                if (onComplete) onComplete(attachment);
            };

            img.src = e.target.result;
        };

        reader.readAsDataURL(file);
    },

    setNoteAttachment(text) {
        if (text && text.trim() !== '') {
            this.pendingAttachment = { type: 'note', text: text.trim() };
        } else {
            this.pendingAttachment = null;
        }
    },

    clear() {
        this.pendingAttachment = null;
    }
};
