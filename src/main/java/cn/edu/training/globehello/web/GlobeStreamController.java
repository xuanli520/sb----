package cn.edu.training.globehello.web;

import java.io.IOException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import jakarta.annotation.PreDestroy;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
public class GlobeStreamController {

    private final ScheduledExecutorService frameExecutor = Executors.newScheduledThreadPool(2, daemonThreadFactory());

    @GetMapping(value = "/api/globe-stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter globeStream() {
        SseEmitter emitter = new SseEmitter(0L);
        AtomicBoolean closed = new AtomicBoolean(false);
        AtomicInteger frame = new AtomicInteger();
        AtomicReference<ScheduledFuture<?>> futureReference = new AtomicReference<>();

        Runnable closeStream = () -> {
            closed.set(true);
            ScheduledFuture<?> future = futureReference.get();
            if (future != null) {
                future.cancel(true);
            }
        };

        emitter.onCompletion(closeStream);
        emitter.onTimeout(closeStream);
        emitter.onError(error -> closeStream.run());

        ScheduledFuture<?> future = frameExecutor.scheduleAtFixedRate(() -> {
            if (closed.get()) {
                return;
            }

            try {
                emitter.send(SseEmitter.event().name("frame").data(AsciiGlobeRenderer.render(frame.getAndIncrement())));
            } catch (IOException | IllegalStateException exception) {
                closeStream.run();
                emitter.complete();
            }
        }, 10, 90, TimeUnit.MILLISECONDS);

        futureReference.set(future);
        if (closed.get()) {
            future.cancel(true);
        }
        return emitter;
    }

    @PreDestroy
    void stopFrameExecutor() {
        frameExecutor.shutdownNow();
    }

    private static ThreadFactory daemonThreadFactory() {
        return runnable -> {
            Thread thread = new Thread(runnable, "ascii-globe-frame");
            thread.setDaemon(true);
            return thread;
        };
    }
}
