(() => {
    const globe = document.getElementById("asciiGlobe");

    if (!globe || !("EventSource" in window)) {
        return;
    }

    const stream = new EventSource("/api/globe-stream");

    stream.addEventListener("frame", (event) => {
        globe.textContent = event.data;
        globe.dataset.stream = "live";
    });

    stream.addEventListener("error", () => {
        globe.dataset.stream = "offline";
    });

    window.addEventListener("pagehide", () => stream.close(), { once: true });
})();
