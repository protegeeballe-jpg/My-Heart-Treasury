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
            videoElement.srcObject = stream;

            this.mediaRecorder = new MediaRecorder(stream);
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.recordedChunks.push(e.data);
            };

            this.mediaRecorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
                const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
                const reader = new FileReader();
                reader.onloadend = () => {
                    // FIX: Save directly to pendingAttachment so the app can read it!
                    const attachment = { type: 'video', dataUrl: reader.result };
                    this.pendingAttachment = attachment;
                    if (onComplete) onComplete(attachment);
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
                    this.mediaRecorder.stop();
                }
            }, 100);
        } catch(err) {
            alert('Camera access denied or unavailable.');
        }
    },

    readImageFile(file, onComplete) {
        const reader = new FileReader();
        reader.onload = (e) => {
            // FIX: Save directly to pendingAttachment!
            const attachment = { type: 'photo', dataUrl: e.target.result };
            this.pendingAttachment = attachment;
            if (onComplete) onComplete(attachment);
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
