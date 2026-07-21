package cn.edu.training.novel.config;

import cn.edu.training.novel.service.CoverObjectStorage;
import cn.edu.training.novel.service.MinioCoverObjectStorage;
import cn.edu.training.novel.service.UnavailableCoverObjectStorage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(CoverStorageProperties.class)
public class CoverStorageConfiguration {
    private static final Logger LOGGER = LoggerFactory.getLogger(CoverStorageConfiguration.class);

    @Bean
    CoverObjectStorage coverObjectStorage(CoverStorageProperties properties) {
        if (!properties.enabled()) {
            return new UnavailableCoverObjectStorage("cover upload storage is disabled");
        }
        if (!properties.isComplete()) {
            LOGGER.warn("Cover upload storage is enabled but its server-side configuration is incomplete.");
            return new UnavailableCoverObjectStorage("cover upload storage is not fully configured");
        }
        try {
            return new MinioCoverObjectStorage(properties);
        } catch (RuntimeException exception) {
            LOGGER.warn("Cover upload storage client could not be created ({}).", exception.getClass().getSimpleName());
            return new UnavailableCoverObjectStorage("cover upload storage is not available");
        }
    }
}
