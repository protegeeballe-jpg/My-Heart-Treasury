/**
 * Media capture controller for notes, photos, and short video clips.
 */
const MediaController = {
    pendingAttachment: null,
    mediaRecorder: null,
    recordedChunks: [],

    async startThreeSecondRecording(videoElement, progressBarElement, onComplete) {
        this.recordedChunks = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            if (videoElement) videoElement.srcObject = stream;

            // Cross-browser MIME type negotiation (Fixes iOS Safari crash)
            let options = { mimeType: 'video/webm;codecs=vp8' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                if (MediaRecorder.isTypeSupported('video/mp4')) {
                    options = { mimeType: 'video/mp4' };
                } else if (MediaRecorder.isTypeSupported('video/webm')) {
                    options = { mimeType: 'video/webm' };
                } else {
                    options = {}; // Fallback to browser default
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

            let elapsed = 0;
            const interval = setInterval(() => {
                elapsed += 100;
                const progress = (elapsed / 3000) * 100;
                if (progressBarElement) progressBarElement.style.width = `${progress}%`;

                if (elapsed >= 3000) {
                    clearInterval(interval);
                    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                        this.mediaRecorder.stop();
                    }
                }
            }, 100);
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
