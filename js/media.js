/**
 * Media capture controller for notes, photos, and short video clips.
 */
const MediaController = {
    pendingAttachment: null,
    activeMedia: null,
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
                    onComplete({ type: 'video', dataUrl: reader.result });
                };
                reader.readAsDataURL(blob);
            };

            this.mediaRecorder.start();

            let elapsed = 0;
            const interval = setInterval(() => {
                elapsed += 100;
                const progress = (elapsed / 3000) * 100;
                progressBarElement.style.width = `${progress}%`;

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
            onComplete({ type: 'photo', dataUrl: e.target.result });
        };
        reader.readAsDataURL(file);
    }
};
