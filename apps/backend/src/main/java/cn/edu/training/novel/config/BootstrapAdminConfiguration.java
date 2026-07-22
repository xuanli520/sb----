package cn.edu.training.novel.config;

import cn.edu.training.novel.service.AuthService;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Starts the optional first-administrator bootstrap only after Flyway has initialized storage. */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(BootstrapAdminProperties.class)
public class BootstrapAdminConfiguration {
    @Bean
    ApplicationRunner bootstrapAdminRunner(
            BootstrapAdminProperties properties,
            AuthService authService,
            ConfigurableApplicationContext applicationContext) {
        return arguments -> {
            if (properties.isResetPassword()) {
                BootstrapAdminProperties.ConfiguredAdmin configuredAdmin = properties.configuredAdmin()
                        .orElseThrow(() -> new IllegalStateException("bootstrap administrator username and display-name are required for password reset"));
                String password = authService.resetBootstrapAdministrator(configuredAdmin);
                System.out.println("BOOTSTRAP_ADMIN_RESET_PASSWORD=" + password);
                System.out.flush();
                int exitCode = SpringApplication.exit(applicationContext, () -> 0);
                System.exit(exitCode);
                return;
            }
            properties.configuredAdmin().ifPresent(configuredAdmin -> {
                boolean generatedPassword = configuredAdmin.password().isBlank();
                BootstrapAdminProperties.ConfiguredAdmin effectiveAdmin = generatedPassword
                        ? configuredAdmin.withPassword(AuthService.generatedPassword())
                        : configuredAdmin;
                AuthService.BootstrapAdminResult result = authService.bootstrapAdministrator(effectiveAdmin);
                if (result == AuthService.BootstrapAdminResult.CREATED && generatedPassword) {
                    System.err.println("BOOTSTRAP_ADMIN_INITIAL_PASSWORD=" + effectiveAdmin.password());
                    System.err.flush();
                }
            });
        };
    }
}
