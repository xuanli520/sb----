package cn.edu.training.novel.config;

import cn.edu.training.novel.service.AuthService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Starts the optional first-administrator bootstrap only after Flyway has initialized storage. */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(BootstrapAdminProperties.class)
public class BootstrapAdminConfiguration {
    private static final Logger LOGGER = LoggerFactory.getLogger(BootstrapAdminConfiguration.class);

    @Bean
    ApplicationRunner bootstrapAdminRunner(BootstrapAdminProperties properties, AuthService authService) {
        return arguments -> properties.configuredAdmin().ifPresent(configuredAdmin -> {
            AuthService.BootstrapAdminResult result = authService.bootstrapAdministrator(configuredAdmin);
            LOGGER.info("Configured bootstrap administrator is {}.", result.name().toLowerCase(java.util.Locale.ROOT));
        });
    }
}
